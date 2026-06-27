// POST /api/agent/join — server proxy that dispatches the Meet bot via P1's
// /join endpoint. Keeps AGENT_URL server-side; never exposed to the browser.
import { joinMeeting } from "@/lib/agentClient";

export const dynamic = "force-dynamic";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const b = body as Record<string, unknown> | null;
  const meetingId = b?.meetingId;
  const meetUrl = b?.meetUrl;
  if (!isNonEmptyString(meetingId)) {
    return Response.json({ ok: false, error: "meetingId is required" }, { status: 400 });
  }
  if (!isNonEmptyString(meetUrl)) {
    return Response.json({ ok: false, error: "meetUrl is required" }, { status: 400 });
  }

  try {
    const result = await joinMeeting(meetingId.trim(), meetUrl.trim());
    return Response.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
