// GET /api/meetings — meeting history for the dashboard. Merges two sources,
// de-duped by meetingId and sorted most-recent first:
//   (a) P2 GET /meetings  → live transcript activity (lastTs, utteranceCount).
//   (b) persisted canvas files on disk → saved graphs (nodeCount, hasCanvas).
// Never throws: each source degrades to empty so the dashboard always renders.
import { listPersistedMeetings } from "@/lib/canvasStore";

export const dynamic = "force-dynamic";

export type MeetingSummary = {
  meetingId: string;
  lastTs?: number;
  utteranceCount?: number;
  nodeCount?: number;
  hasCanvas: boolean;
};

type P2Meeting = { meetingId: string; lastTs?: number; utteranceCount?: number };

function p2BaseUrl(): string | undefined {
  const u = process.env.CONTEXT_SERVICE_URL?.trim();
  return u && u.length > 0 ? u.replace(/\/$/, "") : undefined;
}

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms = 6000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await p(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

async function fetchP2Meetings(): Promise<P2Meeting[]> {
  const base = p2BaseUrl();
  if (!base) return [];
  try {
    const res = await withTimeout((signal) => fetch(`${base}/meetings`, { signal }));
    if (!res.ok) return [];
    const json = (await res.json().catch(() => ({}))) as { meetings?: unknown };
    if (!Array.isArray(json.meetings)) return [];
    return json.meetings
      .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
      .map((m) => ({
        meetingId: String(m.meetingId ?? ""),
        lastTs: typeof m.lastTs === "number" ? m.lastTs : undefined,
        utteranceCount: typeof m.utteranceCount === "number" ? m.utteranceCount : undefined,
      }))
      .filter((m) => m.meetingId.length > 0);
  } catch {
    return [];
  }
}

export async function GET() {
  const [p2Meetings, persisted] = await Promise.all([
    fetchP2Meetings(),
    Promise.resolve().then(listPersistedMeetings),
  ]);

  const byId = new Map<string, MeetingSummary>();

  for (const m of p2Meetings) {
    byId.set(m.meetingId, {
      meetingId: m.meetingId,
      lastTs: m.lastTs,
      utteranceCount: m.utteranceCount,
      hasCanvas: false,
    });
  }

  for (const c of persisted) {
    const existing = byId.get(c.meetingId);
    byId.set(c.meetingId, {
      meetingId: c.meetingId,
      lastTs: existing?.lastTs,
      utteranceCount: existing?.utteranceCount,
      nodeCount: c.nodeCount,
      hasCanvas: true,
    });
  }

  // Sort most-recent first, using whichever timestamp signal we have.
  const persistedTs = new Map(persisted.map((c) => [c.meetingId, c.updatedAt]));
  const meetings = [...byId.values()].sort((a, b) => {
    const ta = a.lastTs ?? persistedTs.get(a.meetingId) ?? 0;
    const tb = b.lastTs ?? persistedTs.get(b.meetingId) ?? 0;
    return tb - ta;
  });

  return Response.json({ ok: true, meetings }, { status: 200 });
}
