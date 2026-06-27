// DELETE /api/canvas/:meetingId/edges/:edgeId — remove an edge.
import { deleteEdge } from "@/lib/canvasStore";
import { notFound, serverError } from "../../_helpers";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ meetingId: string; edgeId: string }> },
) {
  try {
    const { meetingId, edgeId } = await ctx.params;
    const canvas = deleteEdge(meetingId, edgeId);
    if (!canvas) return notFound(`edge ${edgeId} not found`);
    return Response.json({ ok: true, canvas }, { status: 200 });
  } catch (err) {
    return serverError(err);
  }
}
