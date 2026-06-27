// POST /api/agent/leave — server proxy that makes Flash leave the current
// meeting (close the bot) via P1's /leave endpoint, without stopping the agent.
// Keeps AGENT_URL server-side.
import { leaveMeeting } from "@/lib/agentClient";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await leaveMeeting();
    return Response.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
