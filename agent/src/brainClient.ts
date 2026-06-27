import type { AgentRequest, AgentResponse } from "../../shared/contracts";
import { CONFIG } from "./config";

/**
 * Asks the brain (P3/n8n) to handle a wake request.
 * Returns a stub until P3 exists, so Flash already speaks a sensible reply.
 */
export async function triggerAgent(req: AgentRequest): Promise<AgentResponse> {
  if (CONFIG.n8nWebhookBase) {
    try {
      const r = await fetch(`${CONFIG.n8nWebhookBase}/agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      if (r.ok) return (await r.json()) as AgentResponse;
      console.warn(`[brain] /agent returned ${r.status}, using stub`);
    } catch (err) {
      console.warn("[brain] /agent failed, using stub:", (err as Error).message);
    }
  }

  return {
    type: "diagram",
    text: "Generated based on your conversation — check your dashboard.",
    sources: [],
  };
}
