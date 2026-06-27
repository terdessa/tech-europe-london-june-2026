// POST /api/canvas/:meetingId/sync-memory — push the serialized canvas snapshot
// to P2 so the visual graph becomes retrievable memory.
import { runSyncMemory } from "@/lib/flashActions";
import { serverError } from "../_helpers";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await ctx.params;
    const result = await runSyncMemory(meetingId);
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 502 });
    }
    return Response.json(
      { ok: true, version: result.version, chunksSent: result.chunksSent },
      { status: 200 },
    );
  } catch (err) {
    return serverError(err);
  }
}
