// Superlinked client — the ONLY place that knows how to speak Superlinked.
// Interface: SIE (Superlinked Inference Engine), via the official TypeScript
// SDK `@superlinked/sie-sdk`.
//
// Why the SDK over raw HTTP:
//   * Bakes in the provisioning retry loop — first calls to a cold model
//     can take ~1 minute (and may return 503 PROVISIONING / MODEL_LOADING
//     mid-load); the SDK retries automatically while `waitForCapacity`
//     and `provisionTimeout` are set. Per the hackathon quickstart, the
//     recommended provisionTimeout is 15 minutes.
//   * Handles GPU lane routing (`gpu: "l4"`, `gpu: "rtx6000"`).
//   * Strongly-typed responses (`EncodeResult.dense: Float32Array`,
//     `ScoreResult.scores[].itemId`).
//
// SIE is stateless inference. Our SQLite stays the source of truth and the
// vector store: we persist the dense vector returned by `client.encode`
// into `superlinked_index.vector` and do client-side cosine similarity
// against those vectors for semantic search. SIE handles the heavy ML
// (embedding + cross-encoder rerank + future doc parsing); SQLite stores
// the artefacts.

import {
  SIEClient,
  type EncodeResult,
  type Item,
  type ScoreResult,
} from "@superlinked/sie-sdk";
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

// ---------- SDK lifecycle ---------------------------------------------------

let cachedClient: SIEClient | null = null;

const getClient = (): SIEClient => {
  if (cachedClient) return cachedClient;
  if (!config.superlinked.endpoint) {
    throw new Error("Superlinked SIE not configured: SUPERLINKED_ENDPOINT is empty");
  }
  cachedClient = new SIEClient(config.superlinked.endpoint, {
    apiKey: config.superlinked.apiKey || undefined,
    gpu: config.superlinked.gpu,
    waitForCapacity: true,
    provisionTimeout: config.superlinked.provisionTimeoutMs,
    // The default request timeout is for established connections; cold-load
    // retries are governed by provisionTimeout above. Keep this generous
    // because embedding a long prep-doc chunk on first call can still be
    // slow even after the model is warm.
    timeout: 120_000,
  });
  return cachedClient;
};

export const isConfigured = (): boolean =>
  config.superlinked.mode === "sie" && config.superlinked.endpoint.length > 0;

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

// Embed text through SIE and return the dense vector as a plain number[].
// The SDK returns Float32Array — we convert because JSON.stringify on a
// Float32Array silently produces `{}`, and we persist the vector as JSON.
export const embedText = async (text: string, isQuery: boolean): Promise<number[]> => {
  if (!isConfigured()) throw new Error("Superlinked SIE not configured");
  log.debug("encode", { model: config.superlinked.embedModel, isQuery, len: text.length });
  const item: Item = { text };
  const result = (await getClient().encode(config.superlinked.embedModel, item, {
    outputTypes: ["dense"],
    isQuery,
  })) as EncodeResult;
  if (!result.dense) throw new Error("SIE returned no dense embedding");
  return Array.from(result.dense);
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

// SIE cross-encoder rerank over a small candidate pool (~20). The SDK
// returns scores already sorted by relevance. We normalise the raw score
// (which can be a logit on some rerankers) to [0, 1] via sigmoid so the
// number is comparable across queries and matches our keyword-baseline
// score range.
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export const rerank = async (
  query: string,
  candidates: RerankCandidate[],
): Promise<ScoredChunk[]> => {
  if (!isConfigured()) throw new Error("Superlinked SIE not configured");
  if (candidates.length === 0) return [];
  log.info("rerank", { candidates: candidates.length });
  const items: Item[] = candidates.map((c) => ({ id: c.id, text: c.text }));
  const queryItem: Item = { text: query };
  const result = (await getClient().score(
    config.superlinked.rerankModel,
    queryItem,
    items,
  )) as ScoreResult;

  const out: ScoredChunk[] = result.scores.map((s) => ({
    chunkId: s.itemId,
    // Many cross-encoders return logits (can be negative). Sigmoid keeps
    // the order and produces a clean 0..1 number for the response.
    score: sigmoid(s.score),
  }));
  // SDK returns sorted-by-relevance already, but be defensive in case the
  // sigmoid mapping ever inverts (it doesn't — sigmoid is monotonic).
  out.sort((a, b) => b.score - a.score);
  return out;
};

// Parse a document into clean text + optional chunks.
//
// For plain text (`doc`) and links we never touch SIE — we just chunk locally.
//
// For pdf/image: the SIE SDK supports document inputs via `Item.document`
// and the `extract` primitive, but the specific model + label combo for
// "give me the whole document as markdown" is not pinned down in the
// hackathon quickstart we have. Leaving as a TODO that fails closed (warning
// only, no thrown error) so /sources continues to work for the demo wedge,
// which is voice + screen + pasted docs — PDFs/images are stretch.
export const parseDocument = async (input: ParseInput): Promise<ParseResult> => {
  if (input.type === "doc") {
    const text = input.text ?? "";
    return { text, chunks: chunkText(text) };
  }

  if (input.type === "link") {
    const text = input.text ?? "";
    return { text, chunks: text ? chunkText(text) : [] };
  }

  // TODO(pdf/image via SIE): once the doc-parsing SDK contract is confirmed
  // with @filipmakraduli (which extract model returns markdown, and which
  // labels to pass), implement here using:
  //   const buf = input.buffer ?? (await downloadAsBuffer(input.url));
  //   const item: Item = { document: { data: new Uint8Array(buf), format: input.type } };
  //   const res = await getClient().extract(config.superlinked.docModel, item, { labels: [...] });
  //   return { text: <assembled>, chunks: chunkText(<assembled>) };
  throw new Error(
    `Superlinked doc parsing for type='${input.type}' not yet implemented (TODO: confirm extract-for-markdown contract with sponsor)`,
  );
};

// Convenience flag for logs at startup.
export const describe = (): string => {
  if (!isConfigured()) return "Superlinked SIE: NOT CONFIGURED (mock mode)";
  return (
    `Superlinked SIE: endpoint=${config.superlinked.endpoint} ` +
    `gpu=${config.superlinked.gpu} ` +
    `embed=${config.superlinked.embedModel} ` +
    `rerank=${config.superlinked.rerankModel} ` +
    `doc=${config.superlinked.docModel}`
  );
};

// Close SDK resources (drains pool lease timers). Optional but tidy.
export const close = async (): Promise<void> => {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
  }
};
