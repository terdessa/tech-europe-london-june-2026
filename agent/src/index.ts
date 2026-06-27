import express from "express";
import type { JoinRequest, JoinResponse, Utterance } from "../../shared/contracts";
import { CONFIG } from "./config";
import { MockAudioSource, type AudioSource } from "./audioSource";
import { createSpeaker, synthesizeSlng } from "./speaker";
import { createPipeline, type Responder } from "./pipeline";
import { MeetBot } from "./meetBot";
import { ingest } from "./contextClient";
import { postCanvasEvent } from "./faceClient";
import { describeScreen as visionDescribe } from "./visionClient";
import { transcribe } from "./sttClient";

const app = express();
app.use(express.json());

const speaker = createSpeaker(); // VOICE=console | local | slng
let source: AudioSource | null = null;
let bot: MeetBot | null = null;
let screenTimer: NodeJS.Timeout | null = null;

const nowSec = () => Math.floor(Date.now() / 1000);

app.get("/health", (_req, res) =>
  res.json({ ok: true, agent: CONFIG.agentName, mode: CONFIG.meetMode, voice: CONFIG.voice }),
);

// Tear down everything so Flash returns to a clean, idle state: close the Meet
// browser, stop the mock source, clear the screen-watch timer. Safe to call any
// time (used by /leave and /restart). Never throws.
async function teardown(): Promise<void> {
  if (screenTimer) {
    clearInterval(screenTimer);
    screenTimer = null;
  }
  try {
    await source?.stop();
  } catch {
    /* ignore */
  }
  source = null;
  try {
    await bot?.close();
  } catch {
    /* ignore */
  }
  bot = null;
}

// Leave the current meeting (close the bot) but keep the agent running so a new
// /join works immediately. Used by the UI's "New meeting" action.
app.post("/leave", async (_req, res) => {
  console.log("[leave] closing current meeting");
  await teardown();
  res.json({ ok: true, status: "left" });
});

// Soft-restart: tear down any stuck bot/browser/timers and reset Flash to idle
// so it responds again. Used by the UI's "Restart Flash" button.
app.post("/restart", async (_req, res) => {
  console.log("[restart] resetting Flash to a clean state");
  await teardown();
  res.json({ ok: true, status: "restarted" });
});

// P4 launcher dispatches the bot here (ARCHITECTURE §3.8).
app.post("/join", async (req, res) => {
  const { meetingId, meetUrl } = (req.body ?? {}) as JoinRequest;
  if (!meetingId || !meetUrl) {
    const body: JoinResponse = { status: "error", error: "meetingId and meetUrl required" };
    return res.status(400).json(body);
  }
  console.log(`[join] ${CONFIG.agentName} joining ${meetUrl} (meeting ${meetingId}, mode=${CONFIG.meetMode})`);

  // Respond immediately — launching Chromium + reaching the Meet lobby takes
  // several seconds, longer than the launcher's HTTP timeout. Do the join in the
  // background so the dashboard gets a fast "joining" and the host just admits Flash.
  const start = CONFIG.meetMode === "real" ? startRealMeet(meetingId, meetUrl) : startMock(meetingId);
  start.catch((err) => console.error("[join] failed:", (err as Error).message));
  res.json({ status: "joining" } satisfies JoinResponse);
});

async function startMock(meetingId: string): Promise<void> {
  const responder: Responder = { speak: (t) => speaker.speak(t) };
  const handle = createPipeline({ responder });
  await source?.stop();
  source = new MockAudioSource();
  source.start(meetingId, handle).catch((e) => console.error("[audio] error:", e));
}

async function startRealMeet(meetingId: string, meetUrl: string): Promise<void> {
  if (screenTimer) {
    clearInterval(screenTimer);
    screenTimer = null;
  }
  await bot?.close();
  bot = new MeetBot();
  await bot.join(meetUrl);

  const activeBot = bot;
  // While Flash is speaking (and briefly after), drop captured audio so it doesn't
  // transcribe / re-trigger on its own voice echoing back through the room mic.
  let speaking = false;
  let deafUntil = 0;
  const SPEAK_COOLDOWN_MS = 1200;

  // Flash speaks INTO the meeting (SLNG TTS -> bot's injected mic). Falls back to
  // the host-PC voice if synthesis/injection fails.
  const responder: Responder = {
    speak: async (t) => {
      console.log(`\n[🔊 ${CONFIG.agentName} -> meeting]: ${t}\n`);
      speaking = true;
      try {
        const wav = CONFIG.voice === "slng" ? await synthesizeSlng(t) : null;
        if (wav) await activeBot.speakInMeeting(wav);
        else await speaker.speak(t);
      } finally {
        speaking = false;
        deafUntil = Date.now() + SPEAK_COOLDOWN_MS;
      }
    },
    postToMeeting: (t) => activeBot.postChat(t),
  };

  // Capture the shared screen, describe it, ingest if it changed. Returns the description.
  let lastScreenDesc = "";
  const captureScreen = async (): Promise<string | null> => {
    const img = await activeBot.screenshot();
    if (!img) return null;
    const desc = await visionDescribe({ meetingId, imageBase64: img, ts: nowSec(), sharedBy: "Screen" });
    if (desc && desc !== lastScreenDesc) {
      lastScreenDesc = desc;
      await ingest({ meetingId, speaker: "Screen", ts: nowSec(), text: desc, source: "screen" });
      // Screen-shared graphs/tables become a canvas node (non-fatal).
      void postCanvasEvent(meetingId, { kind: "image", title: "Screen", caption: desc, ts: nowSec() });
      console.log("[screen]", desc.slice(0, 100));
    }
    return desc;
  };

  const handle = createPipeline({
    responder,
    describeScreen: CONFIG.screenCapture ? () => captureScreen() : undefined,
  });

  // EARS: capture meeting audio -> SLNG STT -> pipeline (passive ingest + wake-word).
  if (!CONFIG.slngApiKey) {
    console.warn("[stt] no SLNG_API_KEY — Flash can't hear. Set SLNG_API_KEY in .env.");
  }
  let chunkCount = 0;
  let lastEarsLog = 0;
  await activeBot.startAudioCapture((b64) => {
    void (async () => {
      try {
        chunkCount += 1;
        const bytes = Math.floor((b64.length * 3) / 4);
        // Heartbeat so it's obvious audio is (or isn't) flowing — once on the
        // first chunk, then at most every 15s.
        if (chunkCount === 1 || Date.now() - lastEarsLog > 15000) {
          lastEarsLog = Date.now();
          console.log(`[ears] audio chunk #${chunkCount} (${bytes} bytes) — capturing`);
        }
        if (speaking || Date.now() < deafUntil) return; // ignore Flash's own voice
        const text = await transcribe(Buffer.from(b64, "base64"));
        if (!text) return;
        console.log("[heard]", text);
        await handle({ meetingId, speaker: "Participant", ts: nowSec(), text, source: "live" } as Utterance);
      } catch (e) {
        console.error("[pipeline] error:", (e as Error).message);
      }
    })();
  });

  // PASSIVE screen watching: auto-capture whenever someone is presenting (no wake-word needed).
  if (CONFIG.screenCapture) {
    if (!CONFIG.geminiApiKey && !CONFIG.n8nWebhookBase) {
      console.warn("[screen] SCREEN_CAPTURE=on but no GEMINI_API_KEY — the screen can't be described.");
    }
    screenTimer = setInterval(() => {
      void (async () => {
        try {
          if (CONFIG.screenWatchAlways || (await activeBot.isPresenting())) await captureScreen();
        } catch {
          /* page busy / navigating */
        }
      })();
    }, CONFIG.screenIntervalMs);
  }
}

app.listen(CONFIG.port, () => {
  console.log(`${CONFIG.agentName} agent runtime on :${CONFIG.port} (mode=${CONFIG.meetMode}, voice=${CONFIG.voice})`);

  // Auto-join on startup when MEET_URL is set — no /join call needed.
  if (CONFIG.meetMode === "real" && CONFIG.meetUrl) {
    console.log(`[auto-join] joining ${CONFIG.meetUrl} as "${CONFIG.displayName}"`);
    startRealMeet("auto", CONFIG.meetUrl).catch((e) =>
      console.error("[auto-join] failed:", (e as Error).message),
    );
  } else {
    console.log(
      `Join (PowerShell):  Invoke-RestMethod -Uri http://localhost:${CONFIG.port}/join -Method Post ` +
        `-ContentType "application/json" -Body '{"meetingId":"m1","meetUrl":"<your meet link>"}'`,
    );
  }
});
