// PATCH/DELETE /api/canvas/:meetingId/nodes/:nodeId — mutate or remove a node.
import { deleteNode, updateNode } from "@/lib/canvasStore";
import type { UpdateNodeInput } from "@/lib/canvasTypes";
import { badRequest, isNodeType, notFound, readJson, serverError } from "../../_helpers";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ meetingId: string; nodeId: string }> },
) {
  try {
    const { meetingId, nodeId } = await ctx.params;
    const parsed = await readJson(req);
    if (!parsed.ok) return badRequest(parsed.error);
    const { body } = parsed;
    if (body.nodeType !== undefined && !isNodeType(body.nodeType)) {
      return badRequest("nodeType must be a valid CanvasNodeType");
    }
    const canvas = updateNode(meetingId, nodeId, body as unknown as UpdateNodeInput);
    if (!canvas) return notFound(`node ${nodeId} not found`);
    return Response.json({ ok: true, canvas }, { status: 200 });
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ meetingId: string; nodeId: string }> },
) {
  try {
    const { meetingId, nodeId } = await ctx.params;
    const canvas = deleteNode(meetingId, nodeId);
    if (!canvas) return notFound(`node ${nodeId} not found`);
    return Response.json({ ok: true, canvas }, { status: 200 });
  } catch (err) {
    return serverError(err);
  }
}
