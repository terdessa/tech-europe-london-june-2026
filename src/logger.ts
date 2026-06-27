// Tiny structured logger. We avoid pulling in pino/winston for hackathon speed.
type Level = "debug" | "info" | "warn" | "error";

const stamp = (): string => new Date().toISOString();

const fmt = (level: Level, scope: string, msg: string, meta?: unknown): string => {
  const base = `[${stamp()}] ${level.toUpperCase()} ${scope} - ${msg}`;
  if (meta === undefined) return base;
  try {
    return `${base} ${JSON.stringify(meta)}`;
  } catch {
    return `${base} [unserializable meta]`;
  }
};

export const createLogger = (scope: string) => ({
  debug: (msg: string, meta?: unknown): void => {
    if (process.env.LOG_LEVEL === "debug") console.log(fmt("debug", scope, msg, meta));
  },
  info: (msg: string, meta?: unknown): void => console.log(fmt("info", scope, msg, meta)),
  warn: (msg: string, meta?: unknown): void => console.warn(fmt("warn", scope, msg, meta)),
  error: (msg: string, meta?: unknown): void => console.error(fmt("error", scope, msg, meta)),
});

export type Logger = ReturnType<typeof createLogger>;
