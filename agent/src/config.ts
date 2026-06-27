import * as path from "path";
import * as dotenv from "dotenv";

// Load repo-root .env (one level above agent/).
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const CONFIG = {
  port: Number(process.env.AGENT_PORT ?? 8001),
  agentName: process.env.AGENT_NAME ?? "Flash",
  displayName: process.env.FLASH_DISPLAY_NAME ?? "Flash",
  /** Lower-cased wake phrase that flips Flash from passive to active. */
  wakePhrase: (process.env.WAKE_PHRASE ?? "hey flash").toLowerCase(),

  /** Meeting source: "mock" (replay transcript) | "real" (join a Google Meet). */
  meetMode: (process.env.MEET_MODE ?? "mock").toLowerCase(),
  /** Chrome profile dir so you sign in to Google once and reuse it. */
  userDataDir: process.env.MEET_USER_DATA_DIR ?? path.resolve(__dirname, "../.meet-profile"),

  /** Voice backend: "console" (log) | "local" (Windows TTS, zero-key) | "slng". */
  voice: (process.env.VOICE ?? "console").toLowerCase(),
  slngApiKey: process.env.SLNG_API_KEY ?? "",
  slngTtsUrl: process.env.SLNG_TTS_URL ?? "",

  /** Screen capture (eyes). When on, Flash passively watches shared screens + answers screen questions. */
  screenCapture: (process.env.SCREEN_CAPTURE ?? "off").toLowerCase() === "on",
  /** How often (ms) the passive screen watcher samples the shared screen. */
  screenIntervalMs: Number(process.env.SCREEN_INTERVAL_MS ?? 12000),
  /** Capture every interval regardless of presentation detection (use if auto-detect misses). */
  screenWatchAlways: (process.env.SCREEN_WATCH_ALWAYS ?? "off").toLowerCase() === "on",
  /** Optional direct Gemini for screen description when there is no P3 backend. */
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",

  /** Backends (empty -> local-file / stub fallbacks). */
  contextServiceUrl: process.env.CONTEXT_SERVICE_URL ?? "",
  n8nWebhookBase: process.env.N8N_WEBHOOK_BASE ?? "",
} as const;
