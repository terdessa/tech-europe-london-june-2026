import * as path from "path";
import * as dotenv from "dotenv";

// Load repo-root .env (one level above agent/).
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const CONFIG = {
  port: Number(process.env.AGENT_PORT ?? 8001),
  agentName: process.env.AGENT_NAME ?? "Flash",
  /** Lower-cased wake phrase that flips Flash from passive to active. */
  wakePhrase: (process.env.WAKE_PHRASE ?? "hey flash").toLowerCase(),
  /** P2 — Retrieval & Context service. Empty = local-file-only mode. */
  contextServiceUrl: process.env.CONTEXT_SERVICE_URL ?? "",
  /** P3 — n8n brain. Empty = stubbed response. */
  n8nWebhookBase: process.env.N8N_WEBHOOK_BASE ?? "",
  slngApiKey: process.env.SLNG_API_KEY ?? "",
  /** TTS endpoint from SLNG docs (set once you have it). */
  slngTtsUrl: process.env.SLNG_TTS_URL ?? "",
  /** Which voice backend: "console" (log) or "slng" (real TTS). */
  voice: (process.env.VOICE ?? "console").toLowerCase(),
} as const;
