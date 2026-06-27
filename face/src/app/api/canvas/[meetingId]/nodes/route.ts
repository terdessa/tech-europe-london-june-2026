// POST /api/canvas/:meetingId/nodes — add a node to the canvas.
import { addNode } from "@/lib/canvasStore";
import type { AddNodeInput } from "@/lib/canvasTypes";
import { badRequest, isNodeType, isNonEmptyString, readJson, serverError } from "../_helpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await ctx.params;
    const parsed = await readJson(req);
    if (!parsed.ok) return badRequest(parsed.error);
    const { body } = parsed;

    if (!isNodeType(body.nodeType)) return badRequest("nodeType must be a valid CanvasNodeType");
    if (!isNonEmptyString(body.label)) return badRequest("label is required");

    const { canvas, node } = addNode(meetingId, body as unknown as AddNodeInput);
    return Response.json({ ok: true, node, canvas }, { status: 200 });
  } catch (err) {
    return serverError(err);
  }
}
