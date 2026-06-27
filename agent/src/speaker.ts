import * as fs from "fs";
import * as path from "path";
import { CONFIG } from "./config";

/** Flash's "mouth". Selected by the VOICE env var via createSpeaker(). */
export interface Speaker {
  speak(text: string): Promise<void>;
}

/** Stub: prints what Flash would say. Used when VOICE=console. */
export class ConsoleSpeaker implements Speaker {
  async speak(text: string): Promise<void> {
    console.log(`\n[🔊 ${CONFIG.agentName} speaks]: ${text}\n`);
  }
}

/**
 * Real voice via SLNG TTS (VOICE=slng). Writes the audio to data/tts/ for now;
 * M2 streams it into the meeting. NOTE: adjust the request/response to SLNG's
 * actual API once you have their docs (body schema, auth header, audio format).
 */
export class SlngSpeaker implements Speaker {
  async speak(text: string): Promise<void> {
    console.log(`\n[🔊 ${CONFIG.agentName} (SLNG)]: ${text}\n`);
    if (!CONFIG.slngApiKey || !CONFIG.slngTtsUrl) {
      console.warn("[slng] missing SLNG_API_KEY / SLNG_TTS_URL — logged only");
      return;
    }
    try {
      const r = await fetch(CONFIG.slngTtsUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${CONFIG.slngApiKey}`,
        },
        body: JSON.stringify({ text }), // TODO: match SLNG schema (voice id, format)
      });
      if (!r.ok) {
        console.warn(`[slng] TTS ${r.status} ${r.statusText}`);
        return;
      }
      const audio = Buffer.from(await r.arrayBuffer());
      const dir = path.resolve(__dirname, "../../data/tts");
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `tts-${Date.now()}.mp3`);
      fs.writeFileSync(file, audio);
      console.log(`[slng] wrote ${file} (${audio.length} bytes) — M2 streams this into the meeting`);
    } catch (err) {
      console.warn("[slng] TTS failed:", (err as Error).message);
    }
  }
}

/** Picks the voice backend from CONFIG.voice. */
export function createSpeaker(): Speaker {
  return CONFIG.voice === "slng" ? new SlngSpeaker() : new ConsoleSpeaker();
}
