// POST /api/agent/restart — server proxy that soft-restarts the Meet bot via
// P1's /restart endpoint (tears down any stuck browser/state). Keeps AGENT_URL
// server-side.
import { restartAgent } from "@/lib/agentClient";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await restartAgent();
    return Response.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
