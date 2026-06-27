// GET /api/canvas/:meetingId — fetch (or lazily create) the canvas snapshot.
import { ensureCanvas } from "@/lib/canvasStore";
import { serverError } from "./_helpers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await ctx.params;
    return Response.json({ ok: true, canvas: ensureCanvas(meetingId) }, { status: 200 });
  } catch (err) {
    return serverError(err);
  }
}
