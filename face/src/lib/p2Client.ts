// P2 (Retrieval & Context) HTTP client.
// Contracts: ARCHITECTURE.md §3.2/§3.3/§3.4 and p2-retrieval INTEGRATION_P2.md.
// Base URL from CONTEXT_SERVICE_URL. All calls degrade gracefully when P2 is
// not configured/reachable so the canvas keeps working in demo mode.

export type RetrievedChunk = {
  speaker?: string;
  ts?: number;
  text: string;
  source: string; // "live" | "doc" | "canvas" | ...
  score: number;
};

export type SourceItem =
  | { type: "doc"; title?: string; content: string }
  | { type: "link"; title?: string; url: string }
  | { type: "image"; title?: string; url?: string }
  // p4-plan.md "Canvas Memory Contract": full serialized graph + text chunks.
  | {
      type: "canvas";
      title?: string;
      content: string;
      metadata: { canvasVersion: number; nodes: unknown[]; edges: unknown[] };
    };

function baseUrl(): string | undefined {
  const u = process.env.CONTEXT_SERVICE_URL?.trim();
  return u && u.length > 0 ? u.replace(/\/$/, "") : undefined;
}

export function isP2Configured(): boolean {
  return baseUrl() !== undefined;
}

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms = 8000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await p(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

export async function postSources(
  meetingId: string,
  items: SourceItem[],
): Promise<{ ok: boolean; sources?: unknown; error?: string }> {
  const base = baseUrl();
  if (!base) return { ok: false, error: "CONTEXT_SERVICE_URL not configured" };
  try {
    const res = await withTimeout((signal) =>
      fetch(`${base}/sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId, items }),
        signal,
      }),
    );
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: `P2 /sources ${res.status}` };
    return { ok: true, sources: json.sources };
  } catch (err) {
    return { ok: false, error: `P2 /sources failed: ${String(err)}` };
  }
}

export async function retrieve(
  meetingId: string,
  query: string,
  k = 8,
): Promise<{ chunks: RetrievedChunk[]; error?: string }> {
  const base = baseUrl();
  if (!base) return { chunks: [], error: "CONTEXT_SERVICE_URL not configured" };
  try {
    const url = `${base}/retrieve?meetingId=${encodeURIComponent(meetingId)}&query=${encodeURIComponent(query)}&k=${k}&mode=auto`;
    const res = await withTimeout((signal) => fetch(url, { signal }));
    if (!res.ok) return { chunks: [], error: `P2 /retrieve ${res.status}` };
    const json = (await res.json()) as { chunks?: RetrievedChunk[] };
    return { chunks: json.chunks ?? [] };
  } catch (err) {
    return { chunks: [], error: `P2 /retrieve failed: ${String(err)}` };
  }
}

export async function getTranscript(
  meetingId: string,
): Promise<{ utterances: Array<{ speaker?: string; ts: number; text: string }>; error?: string }> {
  const base = baseUrl();
  if (!base) return { utterances: [], error: "CONTEXT_SERVICE_URL not configured" };
  try {
    const url = `${base}/transcript?meetingId=${encodeURIComponent(meetingId)}`;
    const res = await withTimeout((signal) => fetch(url, { signal }));
    if (!res.ok) return { utterances: [], error: `P2 /transcript ${res.status}` };
    const json = (await res.json()) as { utterances?: Array<{ speaker?: string; ts: number; text: string }> };
    return { utterances: json.utterances ?? [] };
  } catch (err) {
    return { utterances: [], error: `P2 /transcript failed: ${String(err)}` };
  }
}
