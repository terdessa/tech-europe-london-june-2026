// POST /api/canvas/:meetingId/summarize — finalize the meeting into summary,
// decisions and action-item nodes (via P3, with mock fallback).
import { runSummarize } from "@/lib/flashActions";
import { serverError } from "../_helpers";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await ctx.params;
    const { canvas, summaryNodeId, summary, decisions, actionItems, usedMock } =
      await runSummarize(meetingId);
    return Response.json(
      { ok: true, canvas, summaryNodeId, summary, decisions, actionItems, usedMock },
      { status: 200 },
    );
  } catch (err) {
    return serverError(err);
  }
}
