// POST /api/canvas/:meetingId/edges — connect two existing nodes.
import { addEdge } from "@/lib/canvasStore";
import type { AddEdgeInput } from "@/lib/canvasTypes";
import { badRequest, isNonEmptyString, readJson, serverError } from "../_helpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await ctx.params;
    const parsed = await readJson(req);
    if (!parsed.ok) return badRequest(parsed.error);
    const { body } = parsed;

    if (!isNonEmptyString(body.source)) return badRequest("source is required");
    if (!isNonEmptyString(body.target)) return badRequest("target is required");
    if (!isNonEmptyString(body.edgeType)) return badRequest("edgeType is required");

    const result = addEdge(meetingId, body as unknown as AddEdgeInput);
    if (!result) return badRequest("source/target not found");
    return Response.json({ ok: true, edge: result.edge, canvas: result.canvas }, { status: 200 });
  } catch (err) {
    return serverError(err);
  }
}
