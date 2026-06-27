// POST /api/canvas/:meetingId/events — ingest a CanvasEvent (discriminated by `kind`).
// Passive kinds only build memory/context; only `manual_prompt` triggers a Flash answer.
import { getCanvas } from "@/lib/canvasStore";
import {
  applyAgentResponse,
  applyFinalize,
  createSummaryNode,
  ingestChat,
  ingestSource,
  ingestUtterance,
} from "@/lib/eventIngest";
import { runManualPrompt } from "@/lib/flashActions";
import { badRequest, isNonEmptyString, readJson, serverError } from "../_helpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await ctx.params;
    const parsed = await readJson(req);
    if (!parsed.ok) return badRequest(parsed.error);
    const e = parsed.body;
    const kind = e.kind;

    let created: unknown;
    switch (kind) {
      case "utterance":
        if (!isNonEmptyString(e.text)) return badRequest("text is required");
        created = ingestUtterance(meetingId, e as never);
        break;
      case "chat":
        if (!isNonEmptyString(e.text)) return badRequest("text is required");
        created = ingestChat(meetingId, e as never);
        break;
      case "document":
        created = ingestSource(meetingId, "document", e as never);
        break;
      case "link":
        if (!isNonEmptyString(e.url)) return badRequest("url is required");
        created = ingestSource(meetingId, "link", e as never);
        break;
      case "image":
        created = ingestSource(meetingId, "image", e as never);
        break;
      case "manual_prompt":
        if (!isNonEmptyString(e.text)) return badRequest("text is required");
        created = await runManualPrompt(meetingId, e.text, e.speaker as string | undefined);
        break;
      case "agent_response":
        if (e.type !== "answer" && e.type !== "diagram") {
          return badRequest("type must be 'answer' or 'diagram'");
        }
        created = applyAgentResponse(meetingId, e as never);
        break;
      case "finalize":
        created = applyFinalize(meetingId, e as never);
        break;
      case "summary":
        if (!isNonEmptyString(e.text)) return badRequest("text is required");
        created = createSummaryNode(
          meetingId,
          e.text,
          e.ts as number | undefined,
          e.sourceNodeIds as string[] | undefined,
        );
        break;
      default:
        return badRequest(`unknown event kind: ${String(kind)}`);
    }

    return Response.json({ ok: true, canvas: getCanvas(meetingId), created }, { status: 200 });
  } catch (err) {
    return serverError(err);
  }
}
