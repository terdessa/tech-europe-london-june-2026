// POST /api/canvas/:meetingId/demo — seed a canned demo graph for the stage demo.
import { buildDemoGraph } from "@/lib/demoGraph";
import { serverError } from "../_helpers";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await ctx.params;
    const canvas = buildDemoGraph(meetingId);
    return Response.json({ ok: true, canvas }, { status: 200 });
  } catch (err) {
    return serverError(err);
  }
}
