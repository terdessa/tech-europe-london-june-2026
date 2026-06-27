// P1 (Ears & Mouth — agent runtime) HTTP client.
// Base URL from AGENT_URL. When unset/unreachable, callers degrade gracefully so
// the dashboard still lets you open the canvas even if the Meet bot can't join.
// Contract: P1 POST /join responds { status: "joining" | "error", error? }.

function baseUrl(): string | undefined {
  const u = process.env.AGENT_URL?.trim();
  return u && u.length > 0 ? u.replace(/\/$/, "") : undefined;
}

export function isAgentConfigured(): boolean {
  return baseUrl() !== undefined;
}

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms = 15000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await p(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

export async function joinMeeting(
  meetingId: string,
  meetUrl: string,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const base = baseUrl();
  if (!base) return { ok: false, error: "AGENT_URL not configured" };
  try {
    const res = await withTimeout((signal) =>
      fetch(`${base}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId, meetUrl }),
        signal,
      }),
    );
    const json = (await res.json().catch(() => ({}))) as {
      status?: string;
      error?: string;
    };
    if (!res.ok) return { ok: false, status: json.status, error: json.error ?? `P1 /join ${res.status}` };
    if (json.status === "error") return { ok: false, status: json.status, error: json.error ?? "agent error" };
    return { ok: true, status: json.status ?? "joining" };
  } catch (err) {
    return { ok: false, error: `P1 /join failed: ${String(err)}` };
  }
}

// POST a simple control action (/leave or /restart) to the agent.
async function agentAction(path: "leave" | "restart"): Promise<{ ok: boolean; status?: string; error?: string }> {
  const base = baseUrl();
  if (!base) return { ok: false, error: "AGENT_URL not configured" };
  try {
    const res = await withTimeout((signal) =>
      fetch(`${base}/${path}`, { method: "POST", signal }),
    );
    const json = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
    if (!res.ok) return { ok: false, error: json.error ?? `P1 /${path} ${res.status}` };
    return { ok: true, status: json.status };
  } catch (err) {
    return { ok: false, error: `P1 /${path} failed: ${String(err)}` };
  }
}

// Leave the current meeting (close the bot) without stopping the agent.
export function leaveMeeting() {
  return agentAction("leave");
}

// Soft-restart the agent so Flash responds again after getting stuck.
export function restartAgent() {
  return agentAction("restart");
}
