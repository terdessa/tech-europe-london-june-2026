import * as fs from "fs";
import * as path from "path";
import type { Utterance } from "../../shared/contracts";

/** A source of speaker-attributed utterances (the "ears"). Swap implementations freely. */
export interface AudioSource {
  start(meetingId: string, onUtterance: (u: Utterance) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Replays the sample transcript so the whole pipeline runs with zero creds.
 * Lets us build/test wake-word + trigger + voice before the real Meet bot exists.
 */
export class MockAudioSource implements AudioSource {
  private timer?: NodeJS.Timeout;
  private stopped = false;

  async start(meetingId: string, onUtterance: (u: Utterance) => Promise<void>): Promise<void> {
    const file = path.resolve(__dirname, "../../data/sample-transcript.json");
    const { utterances } = JSON.parse(fs.readFileSync(file, "utf8")) as { utterances: Utterance[] };
    let i = 0;

    const tick = async (): Promise<void> => {
      if (this.stopped || i >= utterances.length) return;
      const base = utterances[i++];
      await onUtterance({ ...base, meetingId, ts: Math.floor(Date.now() / 1000) });
      this.timer = setTimeout(() => void tick(), 1500);
    };

    await tick();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}

// TODO (M2): MeetAudioSource — real Google Meet bot.
//   - managed bot API (Recall.ai/MeetingBaaS): receive transcript webhooks -> onUtterance
//   - Meet Media API: per-participant audio -> SLNG STT per stream -> onUtterance
//   - headless (Playwright): scrape Meet captions -> onUtterance
