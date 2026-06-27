import type { AgentResponse, Utterance } from "../../shared/contracts";
import { CONFIG } from "./config";
import { ingest } from "./contextClient";
import { triggerAgent } from "./brainClient";
import { postCanvasEvent } from "./faceClient";

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

// Strip punctuation/case so "Hey, Flash." matches the wake phrase "hey flash".
const normalize = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Builds the per-utterance handler: capture context, detect wake, respond. */
export function createPipeline({ responder, describeScreen }: PipelineOptions) {
  return async function handleUtterance(u: Utterance): Promise<void> {
    console.log(`[${u.speaker}] ${u.text}`);
    await ingest(u);
    // PASSIVE: drop a memory node on the canvas (never triggers a Flash answer).
    void postCanvasEvent(u.meetingId, {
      kind: "utterance",
      speaker: u.speaker,
      text: u.text,
      ts: u.ts,
      source: u.source ?? "live",
    });

    const normText = normalize(u.text);
    const idx = normText.indexOf(CONFIG.wakePhrase);
    if (idx === -1) return; // passive: just captured it

    const requestText = normText.slice(idx + CONFIG.wakePhrase.length).trim();
    console.log(`[wake] "${CONFIG.wakePhrase}" -> request: "${requestText}"`);

    await responder.speak("One sec…");

    let reply: string;
    let agentResp: AgentResponse | null = null;
    if (describeScreen && SCREEN_HINT.test(requestText)) {
      const desc = await describeScreen(requestText);
      reply = desc
        ? `Here's what's on the screen: ${desc}`
        : "I couldn't read the screen right now.";
      // Surface the read-back screen as a canvas node (no brain call here).
      if (desc) {
        void postCanvasEvent(u.meetingId, { kind: "image", title: "Screen", caption: desc });
      }
    } else {
      agentResp = await triggerAgent({ meetingId: u.meetingId, requestText });
      reply = agentResp.text ?? "Done — check your dashboard.";
    }

    await responder.speak(reply);
    await responder.postToMeeting?.(reply);

    // Live flash answer + optional diagram node appear on the canvas.
    if (agentResp) {
      void postCanvasEvent(u.meetingId, {
        kind: "agent_response",
        type: agentResp.type,
        text: agentResp.text,
        diagramCode: agentResp.diagramCode,
        sources: agentResp.sources,
      });
    }
  };
}
