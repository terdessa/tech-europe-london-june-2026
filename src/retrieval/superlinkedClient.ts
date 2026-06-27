// Superlinked client — the ONLY place that knows how to speak Superlinked.
// Interface chosen: SIE HTTP API (Superlinked Inference Engine).
//
// Confirmed from current Superlinked docs (https://superlinked.com/docs,
// https://github.com/superlinked/sie):
//   POST /v1/encode/:model   → dense embeddings  (default model: BAAI/bge-m3)
//   POST /v1/score/:model    → reranker scores   (default: BAAI/bge-reranker-v2-m3)
//   POST /v1/extract/:model  → entities / doc parsing (default: docling)
// Auth: `Authorization: Bearer <SUPERLINKED_API_KEY>` (any string accepted by
// self-hosted SIE; managed clusters validate the key).
//
// SIE is stateless inference — it does NOT store vectors. So our wrapper:
//   * encodes a chunk via /v1/encode/:model and returns the dense vector,
//     which P2 stores in SQLite (superlinked_index.vector).
//   * for semanticSearch, encodes the query and ranks chunks by cosine
//     similarity against the stored vectors (filtered by meetingId).
//   * for rerank, calls /v1/score/:model with the chunk texts.
//   * for parseDocument, calls /v1/extract/:model with the document model
//     (docling) for PDF/image → markdown chunks.
//
// If credentials are missing we are in "mock mode": semanticSearch + rerank
// fall through to keyword scoring upstream; indexing is a no-op recorded as
// status='unconfigured'. The HTTP API stays alive end-to-end.

import { config } from "../config.js";
import { createLogger } from "../logger.js";
import { chunkText } from "./chunker.js";

const log = createLogger("superlinked");

// ---------- public types ----------------------------------------------------

export type IndexableChunk = {
  id: string;
  meetingId: string;
  speaker?: string;
  ts?: number;
  text: string;
  source: string;
  sourceId?: string;
};

export type RerankCandidate = {
  id: string;
  meetingId: string;
  speaker?: string;
  ts?: number;
  text: string;
  source: string;
};

export type ScoredChunk = { chunkId: string; score: number };

export type ParseInput = {
  type: "pdf" | "image" | "link" | "doc";
  buffer?: Buffer;
  url?: string;
  text?: string;
};

export type ParseResult = {
  text: string;
  chunks?: string[];
};

// ---------- low-level SIE helpers ------------------------------------------

const sieUrl = (path: string): string => {
  const base = config.superlinked.endpoint.replace(/\/+$/, "");
  return `${base}${path}`;
};

const headers = (): Record<string, string> => {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config.superlinked.apiKey) {
    h["Authorization"] = `Bearer ${config.superlinked.apiKey}`;
  }
  return h;
};

const sieFetch = async (path: string, body: unknown, timeoutMs = 8000): Promise<unknown> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(sieUrl(path), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`SIE ${path} ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
};

// SIE /v1/encode/:model response shape (per docs): { embeddings: [{ dense: number[] }, ...] }
const extractDenseEmbedding = (raw: unknown): number[] | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const embs = r["embeddings"];
  if (!Array.isArray(embs) || embs.length === 0) return null;
  const first = embs[0] as Record<string, unknown> | undefined;
  if (!first) return null;
  const dense = first["dense"] ?? first["embedding"] ?? first["vector"];
  if (Array.isArray(dense) && dense.every((x) => typeof x === "number")) {
    return dense as number[];
  }
  return null;
};

// SIE /v1/score/:model response: { scores: [{ id?: string, index: number, score: number }, ...] }
const extractScores = (raw: unknown): Array<{ index: number; score: number }> => {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const scores = r["scores"];
  if (!Array.isArray(scores)) return [];
  const out: Array<{ index: number; score: number }> = [];
  for (let i = 0; i < scores.length; i += 1) {
    const s = scores[i] as Record<string, unknown> | undefined;
    if (!s) continue;
    const idx = typeof s["index"] === "number" ? (s["index"] as number) : i;
    const score = typeof s["score"] === "number" ? (s["score"] as number) : 0;
    out.push({ index: idx, score });
  }
  return out;
};

// SIE /v1/extract/:model (docling) returns the document as markdown text plus
// optional chunks. Field names can vary; we accept several common shapes.
const extractDocParse = (raw: unknown): ParseResult => {
  const empty: ParseResult = { text: "" };
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const text =
    (typeof r["markdown"] === "string" && (r["markdown"] as string)) ||
    (typeof r["text"] === "string" && (r["text"] as string)) ||
    (typeof r["content"] === "string" && (r["content"] as string)) ||
    "";
  const rawChunks = r["chunks"];
  const chunks =
    Array.isArray(rawChunks) && rawChunks.every((c) => typeof c === "string")
      ? (rawChunks as string[])
      : undefined;
  return { text, chunks };
};

// ---------- math utilities --------------------------------------------------

export const cosineSimilarity = (a: number[], b: number[]): number => {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

// ---------- public client ---------------------------------------------------

export const isConfigured = (): boolean =>
  config.superlinked.mode === "sie" && config.superlinked.endpoint.length > 0;

// Embed a chunk through SIE and return the dense vector so the caller can
// persist it in SQLite (superlinked_index.vector). Throws on failure.
export const embedText = async (text: string, isQuery: boolean): Promise<number[]> => {
  if (!isConfigured()) throw new Error("Superlinked SIE not configured");
  log.debug("encode", { model: config.superlinked.embedModel, isQuery, len: text.length });
  const raw = await sieFetch(`/v1/encode/${encodeURIComponent(config.superlinked.embedModel)}`, {
    items: [{ text }],
    is_query: isQuery,
    output_types: ["dense"],
  });
  const dense = extractDenseEmbedding(raw);
  if (!dense) throw new Error("SIE returned no dense embedding");
  return dense;
};

// indexChunk: embed via SIE, hand back the vector for the caller to persist.
// We return the vector here rather than touching the DB so this module stays
// transport-only (no SQLite coupling) — easier to swap or mock.
export const indexChunk = async (
  chunk: IndexableChunk,
): Promise<{ externalId: string; vector: number[] }> => {
  if (!isConfigured()) throw new Error("Superlinked SIE not configured");
  log.info("indexing chunk", { chunkId: chunk.id, meetingId: chunk.meetingId });
  const vector = await embedText(chunk.text, false);
  // SIE is stateless, so there is no remote ID — we reuse our chunk.id as the
  // externalId. If a future Superlinked vector-store integration assigns IDs,
  // overwrite this here.
  return { externalId: chunk.id, vector };
};

// Cosine search over caller-supplied stored vectors. The route handler is
// responsible for loading the stored vectors for the meetingId and passing
// them in — that keeps the Superlinked wrapper pure HTTP-call code.
export const semanticSearchAgainstVectors = async (
  query: string,
  stored: Array<{ chunkId: string; vector: number[] }>,
  limit: number,
): Promise<ScoredChunk[]> => {
  if (!isConfigured()) throw new Error("Superlinked SIE not configured");
  if (stored.length === 0) return [];
  log.info("semantic search", { candidates: stored.length, limit });
  const queryVec = await embedText(query, true);
  const scored = stored.map((s) => ({
    chunkId: s.chunkId,
    score: cosineSimilarity(queryVec, s.vector),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
};

// SIE cross-encoder rerank over a small candidate pool (~20). Returns the
// same chunk IDs with rerank scores normalised to [0, 1] via sigmoid.
export const rerank = async (
  query: string,
  candidates: RerankCandidate[],
): Promise<ScoredChunk[]> => {
  if (!isConfigured()) throw new Error("Superlinked SIE not configured");
  if (candidates.length === 0) return [];
  log.info("rerank", { candidates: candidates.length });
  const raw = await sieFetch(`/v1/score/${encodeURIComponent(config.superlinked.rerankModel)}`, {
    query: { text: query },
    items: candidates.map((c) => ({ id: c.id, text: c.text })),
  });
  const scores = extractScores(raw);
  if (scores.length === 0) {
    // Defensive: SIE returned an unexpected shape. Fall back to candidate order.
    return candidates.map((c, i) => ({ chunkId: c.id, score: 1 - i / candidates.length }));
  }
  const out: ScoredChunk[] = scores.map((s) => {
    const cand = candidates[s.index];
    const sigmoid = 1 / (1 + Math.exp(-s.score));
    return { chunkId: cand ? cand.id : `unknown_${s.index}`, score: sigmoid };
  });
  out.sort((a, b) => b.score - a.score);
  return out;
};

// Parse a document into clean text + optional chunks using a SIE doc model
// (docling by default). For plain "doc" inputs we just return the text and
// chunk it locally — no SIE round-trip needed.
export const parseDocument = async (input: ParseInput): Promise<ParseResult> => {
  if (input.type === "doc") {
    const text = input.text ?? "";
    return { text, chunks: chunkText(text) };
  }

  if (input.type === "link") {
    // Lightweight URL fetch — we don't run heavy HTML→markdown through SIE
    // because docling targets PDFs/images. The route handler decides whether
    // a link is worth fetching; here we just return what we have.
    const text = input.text ?? "";
    return { text, chunks: text ? chunkText(text) : [] };
  }

  // pdf / image → SIE doc parsing model.
  if (!isConfigured()) {
    // TODO: when SUPERLINKED_ENDPOINT is set and docling is provisioned,
    // this branch becomes the primary code path.
    throw new Error("Superlinked SIE not configured (doc parsing unavailable)");
  }

  log.info("parseDocument via SIE", { type: input.type, model: config.superlinked.docModel });
  const payload: Record<string, unknown> = {};
  if (input.buffer) payload["content_base64"] = input.buffer.toString("base64");
  if (input.url) payload["url"] = input.url;
  const raw = await sieFetch(
    `/v1/extract/${encodeURIComponent(config.superlinked.docModel)}`,
    payload,
    20000,
  );
  const parsed = extractDocParse(raw);
  if (!parsed.chunks && parsed.text) parsed.chunks = chunkText(parsed.text);
  return parsed;
};

// Convenience flag for logs at startup.
export const describe = (): string => {
  if (!isConfigured()) return "Superlinked SIE: NOT CONFIGURED (mock mode)";
  return `Superlinked SIE: endpoint=${config.superlinked.endpoint} embed=${config.superlinked.embedModel} rerank=${config.superlinked.rerankModel} doc=${config.superlinked.docModel}`;
};
