import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { CONFIG } from "./config";

/** Flash's "mouth". Selected by the VOICE env var via createSpeaker(). */
export interface Speaker {
  speak(text: string): Promise<void>;
}

/** Stub: prints what Flash would say. VOICE=console. */
export class ConsoleSpeaker implements Speaker {
  async speak(text: string): Promise<void> {
    console.log(`\n[🔊 ${CONFIG.agentName} speaks]: ${text}\n`);
  }
}

/** Zero-key voice using Windows built-in TTS (System.Speech). VOICE=local. */
export class LocalSpeaker implements Speaker {
  async speak(text: string): Promise<void> {
    console.log(`\n[🔊 ${CONFIG.agentName}]: ${text}\n`);
    const safe = text.replace(/'/g, "''");
    await new Promise<void>((resolve) => {
      const ps = spawn("powershell", [
        "-NoProfile",
        "-Command",
        `Add-Type -AssemblyName System.Speech; ` +
          `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak('${safe}')`,
      ]);
      ps.on("close", () => resolve());
      ps.on("error", (e) => {
        console.warn("[local-tts] failed:", e.message);
        resolve();
      });
    });
  }
}

/** Real voice via SLNG TTS (VOICE=slng). Writes audio to data/tts/ for now. */
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
        headers: { "content-type": "application/json", authorization: `Bearer ${CONFIG.slngApiKey}` },
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
      console.log(`[slng] wrote ${file} (${audio.length} bytes)`);
    } catch (err) {
      console.warn("[slng] TTS failed:", (err as Error).message);
    }
  }
}

/** Picks the voice backend from CONFIG.voice. */
export function createSpeaker(): Speaker {
  switch (CONFIG.voice) {
    case "slng":
      return new SlngSpeaker();
    case "local":
      return new LocalSpeaker();
    default:
      return new ConsoleSpeaker();
  }
}
