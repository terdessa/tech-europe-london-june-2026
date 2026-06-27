import type { Utterance } from "../../shared/contracts";
import { CONFIG } from "./config";
import { ingest } from "./contextClient";
import { triggerAgent } from "./brainClient";

/** Flash's reply channels for one turn. */
export interface Responder {
  speak(text: string): Promise<void>;
  postToMeeting?(text: string): Promise<void>;
}

export interface PipelineOptions {
  responder: Responder;
  /** Real mode only: capture + describe the shared screen, returns a description. */
  describeScreen?: (requestText: string) => Promise<string | null>;
}

// Only route to screen-describe for explicit screen references — not "diagram"/"show",
// which are brain requests.
const SCREEN_HINT = /\b(screen|slide|sharing|shared|what'?s on)\b/i;

/** Builds the per-utterance handler: capture context, detect wake, respond. */
export function createPipeline({ responder, describeScreen }: PipelineOptions) {
  return async function handleUtterance(u: Utterance): Promise<void> {
    console.log(`[${u.speaker}] ${u.text}`);
    await ingest(u);

    const idx = u.text.toLowerCase().indexOf(CONFIG.wakePhrase);
    if (idx === -1) return; // passive: just captured it

    const requestText = u.text
      .slice(idx + CONFIG.wakePhrase.length)
      .replace(/^[,:.!?\s]+/, "")
      .trim();
    console.log(`[wake] "${CONFIG.wakePhrase}" -> request: "${requestText}"`);

    await responder.speak("One sec…");

    let reply: string;
    if (describeScreen && SCREEN_HINT.test(requestText)) {
      const desc = await describeScreen(requestText);
      reply = desc
        ? `Here's what's on the screen: ${desc}`
        : "I couldn't read the screen right now.";
    } else {
      const resp = await triggerAgent({ meetingId: u.meetingId, requestText });
      reply = resp.text ?? "Done — check your dashboard.";
    }

    await responder.speak(reply);
    await responder.postToMeeting?.(reply);
  };
}
