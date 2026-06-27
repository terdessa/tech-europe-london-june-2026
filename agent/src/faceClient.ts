import { CONFIG } from "./config";

/**
 * Pushes a live canvas event to the Face web workspace (P4).
 * Non-fatal: if FACE_URL is unset we no-op, and any failure is logged and swallowed
 * so the audio pipeline never breaks (mirrors contextClient.ingest).
 * Event shape is discriminated by `kind` — see face/src/lib/canvasTypes.ts.
 */
export async function postCanvasEvent(
  meetingId: string,
  event: Record<string, unknown>,
): Promise<void> {
  if (!CONFIG.faceUrl) return;
  try {
    await fetch(`${CONFIG.faceUrl}/api/canvas/${encodeURIComponent(meetingId)}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch (err) {
    console.warn("[face] event post failed:", (err as Error).message);
  }
}
