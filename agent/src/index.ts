import express from "express";
import type { JoinRequest, JoinResponse, Utterance } from "../../shared/contracts";
import { CONFIG } from "./config";
import { MockAudioSource, type AudioSource } from "./audioSource";
import { createSpeaker } from "./speaker";
import { createPipeline, type Responder } from "./pipeline";
import { MeetBot } from "./meetBot";
import { ingest } from "./contextClient";
import { describeScreen as visionDescribe } from "./visionClient";

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

// P4 launcher dispatches the bot here (ARCHITECTURE §3.8).
app.post("/join", async (req, res) => {
  const { meetingId, meetUrl } = (req.body ?? {}) as JoinRequest;
  if (!meetingId || !meetUrl) {
    const body: JoinResponse = { status: "error", error: "meetingId and meetUrl required" };
    return res.status(400).json(body);
  }
  console.log(`[join] ${CONFIG.agentName} joining ${meetUrl} (meeting ${meetingId}, mode=${CONFIG.meetMode})`);

  try {
    if (CONFIG.meetMode === "real") {
      await startRealMeet(meetingId, meetUrl);
    } else {
      await startMock(meetingId);
    }
    res.json({ status: "joining" } satisfies JoinResponse);
  } catch (err) {
    console.error("[join] failed:", (err as Error).message);
    res.status(500).json({ status: "error", error: (err as Error).message } satisfies JoinResponse);
  }
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
  await bot.enableCaptions();

  const activeBot = bot;
  const responder: Responder = {
    speak: (t) => speaker.speak(t),
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
      console.log("[screen]", desc.slice(0, 100));
    }
    return desc;
  };

  const handle = createPipeline({
    responder,
    describeScreen: CONFIG.screenCapture ? () => captureScreen() : undefined,
  });
  activeBot.startCaptions((line) => {
    handle({ meetingId, speaker: line.speaker, ts: nowSec(), text: line.text } as Utterance).catch((e) =>
      console.error("[pipeline] error:", (e as Error).message),
    );
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
  console.log(
    `Join (PowerShell):  Invoke-RestMethod -Uri http://localhost:${CONFIG.port}/join -Method Post ` +
      `-ContentType "application/json" -Body '{"meetingId":"m1","meetUrl":"<your meet link>"}'`,
  );
});
