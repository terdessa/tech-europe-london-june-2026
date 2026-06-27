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

/** Plays a WAV file through the default Windows audio output (blocks until done). */
function playWavWindows(file: string): Promise<void> {
  return new Promise((resolve) => {
    const ps = spawn("powershell", [
      "-NoProfile",
      "-Command",
      `(New-Object System.Media.SoundPlayer '${file.replace(/'/g, "''")}').PlaySync()`,
    ]);
    ps.on("close", () => resolve());
    ps.on("error", () => resolve());
  });
}

/** Synthesize speech via SLNG TTS. Returns the WAV bytes, or null on failure. */
export async function synthesizeSlng(text: string): Promise<Buffer | null> {
  if (!CONFIG.slngApiKey || !CONFIG.slngTtsUrl) {
    console.warn("[slng] missing SLNG_API_KEY / SLNG_TTS_URL — logged only");
    return null;
  }
  try {
    const r = await fetch(CONFIG.slngTtsUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${CONFIG.slngApiKey}` },
      body: JSON.stringify({ model: CONFIG.slngModel, text }),
    });
    if (!r.ok) {
      let detail = "";
      try {
        detail = (await r.text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      console.warn(`[slng] TTS ${r.status} ${r.statusText} ${detail}`);
      return null;
    }
    return Buffer.from(await r.arrayBuffer());
  } catch (err) {
    console.warn("[slng] TTS failed:", (err as Error).message);
    return null;
  }
}

/** Real voice via SLNG TTS (VOICE=slng): synthesize the WAV, save it, and play it on the host PC. */
export class SlngSpeaker implements Speaker {
  async speak(text: string): Promise<void> {
    console.log(`\n[🔊 ${CONFIG.agentName} (SLNG)]: ${text}\n`);
    const audio = await synthesizeSlng(text);
    if (!audio) return;
    const dir = path.resolve(__dirname, "../../data/tts");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `tts-${Date.now()}.wav`);
    fs.writeFileSync(file, audio);
    await playWavWindows(file);
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
