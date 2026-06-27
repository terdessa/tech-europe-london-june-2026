// POST /api/canvas/:meetingId/reset — clear the canvas so the meeting can be
// reused from scratch. Wipes the in-memory + on-disk graph, and best-effort
// wipes P2's stored context (utterances/sources/chunks/index) for the meeting.
import { ensureCanvas, resetCanvas } from "@/lib/canvasStore";
import { serverError } from "../_helpers";

export const dynamic = "force-dynamic";

function p2Base(): string | undefined {
  const u = process.env.CONTEXT_SERVICE_URL?.trim();
  return u && u.length > 0 ? u.replace(/\/$/, "") : undefined;
}

export async function POST(_req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await ctx.params;

    // 1) Local graph: drop in-memory store + persisted snapshot.
    resetCanvas(meetingId);

    // 2) P2 store: best-effort wipe so retrieval/summary start fresh too.
    let p2Cleared = false;
    let p2Error: string | undefined;
    const base = p2Base();
    if (base) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`${base}/meetings/${encodeURIComponent(meetingId)}`, {
          method: "DELETE",
          signal: ctrl.signal,
        }).finally(() => clearTimeout(timer));
        p2Cleared = res.ok;
        if (!res.ok) p2Error = `P2 delete ${res.status}`;
      } catch (err) {
        p2Error = `P2 delete failed: ${String(err)}`;
      }
    }

    // Return a fresh empty canvas so the client can render immediately.
    const canvas = ensureCanvas(meetingId);
    return Response.json({ ok: true, canvas, p2Cleared, p2Error }, { status: 200 });
  } catch (err) {
    return serverError(err);
  }
}
