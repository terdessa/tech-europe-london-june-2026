// P3 (Brain — n8n + Gemini) HTTP client.
// Contracts: ARCHITECTURE.md §3.5 (/agent), §3.7 (/finalize, /ask).
// Base URL from N8N_WEBHOOK_BASE. When unset, callers fall back to local mocks
// so the demo never hard-depends on n8n being up.

export type AgentResponse = {
  type: "answer" | "diagram";
  text?: string;
  diagramCode?: string;
  sources?: string[];
};

export type FinalizeResponse = {
  summary?: string;
  decisions?: string[];
  actionItems?: string[];
  diagrams?: string[];
};

function baseUrl(): string | undefined {
  const u = process.env.N8N_WEBHOOK_BASE?.trim();
  return u && u.length > 0 ? u.replace(/\/$/, "") : undefined;
}

export function isP3Configured(): boolean {
  return baseUrl() !== undefined;
}

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms = 15000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await p(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

export async function callAgent(
  meetingId: string,
  requestText: string,
): Promise<{ response?: AgentResponse; error?: string }> {
  const base = baseUrl();
  if (!base) return { error: "N8N_WEBHOOK_BASE not configured" };
  try {
    const res = await withTimeout((signal) =>
      fetch(`${base}/agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId, requestText }),
        signal,
      }),
    );
    if (!res.ok) return { error: `P3 /agent ${res.status}` };
    const json = (await res.json()) as AgentResponse;
    return { response: json };
  } catch (err) {
    return { error: `P3 /agent failed: ${String(err)}` };
  }
}

export async function callFinalize(
  meetingId: string,
): Promise<{ result?: FinalizeResponse; error?: string }> {
  const base = baseUrl();
  if (!base) return { error: "N8N_WEBHOOK_BASE not configured" };
  try {
    const res = await withTimeout((signal) =>
      fetch(`${base}/finalize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId }),
        signal,
      }),
    );
    if (!res.ok) return { error: `P3 /finalize ${res.status}` };
    const json = (await res.json()) as FinalizeResponse;
    return { result: json };
  } catch (err) {
    return { error: `P3 /finalize failed: ${String(err)}` };
  }
}

// Local fallback when P3 is unavailable: classify intent and synthesize a
// grounded-looking answer/diagram from retrieved chunks so the demo path works.
export function mockAgent(requestText: string, chunkTexts: string[]): AgentResponse {
  const wantsDiagram = /\b(diagram|chart|flow|graph|draw|visuali[sz]e|map)\b/i.test(requestText);
  const sources = chunkTexts.slice(0, 4).map((t, i) => `chunk ${i + 1}: ${t.slice(0, 40)}`);
  if (wantsDiagram) {
    return {
      type: "diagram",
      text: `Here is a diagram for: ${requestText}`,
      diagramCode: buildMockMermaid(chunkTexts),
      sources,
    };
  }
  const ctx = chunkTexts.slice(0, 3).join(" ");
  return {
    type: "answer",
    text: ctx
      ? `Based on the meeting context: ${ctx.slice(0, 240)}`
      : `(mock) I don't have grounded context yet for: ${requestText}`,
    sources,
  };
}

function buildMockMermaid(chunkTexts: string[]): string {
  const items = chunkTexts.slice(0, 4).map((t, i) => `  Topic --> N${i}["${t.slice(0, 24).replace(/"/g, "'")}"]`);
  return ["flowchart TD", '  Topic["Meeting"]', ...(items.length ? items : ['  Topic --> N0["No context"]'])].join("\n");
}

export function mockFinalize(utterances: Array<{ speaker?: string; text: string }>): FinalizeResponse {
  const lines = utterances.slice(-12).map((u) => `${u.speaker ?? "?"}: ${u.text}`);
  return {
    summary:
      lines.length > 0
        ? `(mock summary) The meeting covered ${utterances.length} utterances. Latest: ${lines[lines.length - 1]}`
        : "(mock summary) No transcript available yet.",
    decisions: lines.length ? ["(mock) Proceed with the discussed plan"] : [],
    actionItems: lines.length ? ["(mock) Follow up on open items"] : [],
    diagrams: [],
  };
}
