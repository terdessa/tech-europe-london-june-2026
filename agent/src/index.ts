import express from "express";
import type { JoinRequest, JoinResponse } from "../../shared/contracts";
import { CONFIG } from "./config";
import { MockAudioSource, type AudioSource } from "./audioSource";
import { ConsoleSpeaker } from "./speaker";
import { createPipeline } from "./pipeline";

const app = express();
app.use(express.json());

const speaker = new ConsoleSpeaker(); // M1: -> SlngSpeaker
const handleUtterance = createPipeline(speaker);
let source: AudioSource | null = null;

app.get("/health", (_req, res) => res.json({ ok: true, agent: CONFIG.agentName }));

// P4 launcher dispatches the bot here (ARCHITECTURE §3.8).
app.post("/join", async (req, res) => {
  const { meetingId, meetUrl } = (req.body ?? {}) as JoinRequest;
  if (!meetingId || !meetUrl) {
    const body: JoinResponse = { status: "error", error: "meetingId and meetUrl required" };
    return res.status(400).json(body);
  }

  console.log(`[join] ${CONFIG.agentName} joining ${meetUrl} (meeting ${meetingId})`);

  await source?.stop();
  source = new MockAudioSource(); // M2: -> MeetAudioSource(meetUrl)
  source.start(meetingId, handleUtterance).catch((e) => console.error("[audio] error:", e));

  const body: JoinResponse = { status: "joining" };
  res.json(body);
});

app.listen(CONFIG.port, () => {
  console.log(`${CONFIG.agentName} agent runtime listening on :${CONFIG.port}`);
  console.log(
    `Try:  curl -XPOST localhost:${CONFIG.port}/join -H "content-type: application/json" ` +
      `-d '{"meetingId":"m_sample","meetUrl":"https://meet.google.com/test"}'`,
  );
});
