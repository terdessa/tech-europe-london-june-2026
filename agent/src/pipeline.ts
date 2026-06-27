import type { Utterance } from "../../shared/contracts";
import { CONFIG } from "./config";
import { ingest } from "./contextClient";
import { triggerAgent } from "./brainClient";
import type { Speaker } from "./speaker";

/** Builds the per-utterance handler: capture context, detect wake, trigger, speak. */
export function createPipeline(speaker: Speaker) {
  return async function handleUtterance(u: Utterance): Promise<void> {
    console.log(`[${u.speaker}] ${u.text}`);
    await ingest(u);

    const idx = u.text.toLowerCase().indexOf(CONFIG.wakePhrase);
    if (idx === -1) return; // passive: just captured it

    // active: everything after the wake phrase is the request
    const requestText = u.text
      .slice(idx + CONFIG.wakePhrase.length)
      .replace(/^[,:.!?\s]+/, "")
      .trim();
    console.log(`[wake] "${CONFIG.wakePhrase}" -> request: "${requestText}"`);

    await speaker.speak("One sec…");
    const resp = await triggerAgent({ meetingId: u.meetingId, requestText });
    await speaker.speak(resp.text ?? "Done — check your dashboard.");
  };
}
