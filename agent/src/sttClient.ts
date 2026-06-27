import { CONFIG } from "./config";

/**
 * Transcribe an audio chunk (WebM) via SLNG STT. Returns the transcript text, or null.
 * SLNG: POST multipart (field "audio") -> results.channels[0].alternatives[0].transcript
 */
export async function transcribe(audio: Buffer): Promise<string | null> {
  if (!CONFIG.slngApiKey) return null;
  try {
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array(audio)], { type: "audio/webm" }), "audio.webm");
    form.append("punctuate", "true");

    const r = await fetch(CONFIG.slngSttUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${CONFIG.slngApiKey}` }, // no content-type: fetch sets the multipart boundary
      body: form,
    });
    if (!r.ok) {
      let detail = "";
      try {
        detail = (await r.text()).slice(0, 160);
      } catch {
        /* ignore */
      }
      console.warn(`[stt] ${r.status} ${r.statusText} ${detail}`);
      return null;
    }
    const j = (await r.json()) as {
      results?: { channels?: { alternatives?: { transcript?: string }[] }[] }[] | { channels?: { alternatives?: { transcript?: string }[] }[] };
    };
    // SLNG returns results.channels[...]; tolerate both shapes.
    const channels =
      (Array.isArray(j.results) ? j.results[0]?.channels : j.results?.channels) ?? [];
    const text = channels[0]?.alternatives?.[0]?.transcript;
    return text && text.trim() ? text.trim() : null;
  } catch (err) {
    console.warn("[stt] failed:", (err as Error).message);
    return null;
  }
}
