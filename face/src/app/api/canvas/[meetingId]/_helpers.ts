// Shared helpers for Flash P4 canvas route handlers.
// Underscore prefix keeps Next.js from treating this as a route segment.

import type { CanvasNodeType } from "@/lib/canvasTypes";

export const NODE_TYPES: readonly CanvasNodeType[] = [
  "speaker",
  "utterance",
  "chat_context",
  "document",
  "image",
  "link",
  "topic",
  "question",
  "flash_answer",
  "diagram",
  "decision",
  "action_item",
  "summary",
  "source",
  "memory_chunk",
];

export function isNodeType(v: unknown): v is CanvasNodeType {
  return typeof v === "string" && (NODE_TYPES as readonly string[]).includes(v);
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// Parse a JSON request body, returning a discriminated result so callers can
// reply with a clean 400 instead of throwing on malformed input.
export async function readJson(
  req: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const body = await req.json();
    if (!isObject(body)) return { ok: false, error: "body must be a JSON object" };
    return { ok: true, body };
  } catch {
    return { ok: false, error: "invalid JSON body" };
  }
}

export function badRequest(error: string): Response {
  return Response.json({ ok: false, error }, { status: 400 });
}

export function notFound(error: string): Response {
  return Response.json({ ok: false, error }, { status: 404 });
}

export function serverError(err: unknown): Response {
  return Response.json({ ok: false, error: String(err) }, { status: 500 });
}
