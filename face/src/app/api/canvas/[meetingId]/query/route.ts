// POST /api/canvas/:meetingId/query — retrieve grounded context (and optionally
// materialise question/answer nodes) via P2.
import { runQuery } from "@/lib/flashActions";
import { badRequest, isNonEmptyString, readJson, serverError } from "../_helpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await ctx.params;
    const parsed = await readJson(req);
    if (!parsed.ok) return badRequest(parsed.error);
    const { body } = parsed;

    if (!isNonEmptyString(body.query)) return badRequest("query is required");
    const k = typeof body.k === "number" ? body.k : undefined;
    const createNodes = typeof body.createNodes === "boolean" ? body.createNodes : undefined;

    const { chunks, canvas, questionNodeId } = await runQuery(meetingId, body.query, k, createNodes);
    return Response.json({ ok: true, chunks, canvas, questionNodeId }, { status: 200 });
  } catch (err) {
    return serverError(err);
  }
}
