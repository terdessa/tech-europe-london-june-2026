// DELETE /api/meetings/:meetingId — remove a meeting from history entirely.
// Wipes the in-memory + on-disk canvas and best-effort wipes P2's stored context
// so the meeting disappears from the dashboard list.
import { resetCanvas } from "@/lib/canvasStore";

export const dynamic = "force-dynamic";

function p2Base(): string | undefined {
  const u = process.env.CONTEXT_SERVICE_URL?.trim();
  return u && u.length > 0 ? u.replace(/\/$/, "") : undefined;
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await ctx.params;
    if (!meetingId || !meetingId.trim()) {
      return Response.json({ ok: false, error: "meetingId is required" }, { status: 400 });
    }

    // Local graph: drop in-memory store + persisted snapshot.
    resetCanvas(meetingId);

    // P2 store: best-effort wipe so it leaves the history list.
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

    return Response.json({ ok: true, meetingId, p2Cleared, p2Error }, { status: 200 });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
