// POST /api/canvas/:meetingId/commands — execute a typed Command via processCommand.
import type { Command, CommandType } from "@/lib/canvasTypes";
import { processCommand } from "@/lib/commands";
import { badRequest, readJson, serverError } from "../_helpers";

export const dynamic = "force-dynamic";

const COMMAND_TYPES: readonly CommandType[] = [
  "add_node",
  "update_node",
  "delete_node",
  "move_node",
  "add_edge",
  "delete_edge",
  "query",
  "summarize",
];

export async function POST(req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await ctx.params;
    const parsed = await readJson(req);
    if (!parsed.ok) return badRequest(parsed.error);
    const { body } = parsed;

    if (typeof body.type !== "string" || !(COMMAND_TYPES as readonly string[]).includes(body.type)) {
      return badRequest(`unknown command type: ${String(body.type)}`);
    }

    const result = await processCommand(meetingId, body as unknown as Command);
    if (result.ok) return Response.json(result, { status: 200 });

    const status = /not found/i.test(result.error ?? "") ? 404 : 400;
    return Response.json(result, { status });
  } catch (err) {
    return serverError(err);
  }
}
