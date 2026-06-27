import type { VisionRequest } from "../../shared/contracts";
import { CONFIG } from "./config";

/**
 * Describe a screen-share frame.
 * Order: P3 /vision (if backend up) -> direct Gemini (if key) -> null placeholder.
 * The direct-Gemini path keeps the "eyes" feature working with no P3 backend.
 */
export async function describeScreen(req: VisionRequest): Promise<string | null> {
  // 1) P3 backend, if running
  if (CONFIG.n8nWebhookBase) {
    try {
      const r = await fetch(`${CONFIG.n8nWebhookBase}/vision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      if (r.ok) {
        const j = (await r.json()) as { description?: string };
        if (j.description) return j.description;
      }
    } catch (err) {
      console.warn("[vision] /vision failed, trying direct Gemini:", (err as Error).message);
    }
  }

  // 2) direct Gemini (self-contained, no backend)
  if (CONFIG.geminiApiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`;
      const body = {
        contents: [
          {
            parts: [
              {
                text:
                  "You are reading a screen shared in a meeting. In 1-3 sentences, describe the key content " +
                  "(numbers, tables, charts, headings). Be concrete and concise.",
              },
              { inline_data: { mime_type: "image/jpeg", data: req.imageBase64 } },
            ],
          },
        ],
      };
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const j = (await r.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      } else {
        console.warn(`[vision] gemini ${r.status}`);
      }
    } catch (err) {
      console.warn("[vision] gemini failed:", (err as Error).message);
    }
  }

  // 3) no describer available
  return null;
}
