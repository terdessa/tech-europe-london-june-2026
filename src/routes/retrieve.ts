// GET /retrieve — P3 ▶ P2. The money endpoint. Top-k chunks for a query.
//
// Modes (per the build plan):
//   mode=superlinked  — semantic search top-20 candidates + Superlinked rerank,
//                       return top-k. Requires SUPERLINKED_ENDPOINT.
//   mode=auto         — prefer Superlinked, fall back to keyword on missing
//                       config OR runtime error.
//   mode=keyword      — local baseline only. Useful for the "Superlinked
//                       semantic > keyword" demo comparison.

import type { Request, Response } from "express";
import type {
  RetrievalMode,
  RetrieveResponse,
  RetrievedChunk,
} from "../../shared/contracts.js";
import {
  getChunksByIds,
  listChunksForMeeting,
  listIndexedVectorsForMeeting,
  type ChunkRow,
} from "../db.js";
import { createLogger } from "../logger.js";
import { keywordSearch } from "../retrieval/keywordSearch.js";
import {
  isConfigured,
  rerank,
  semanticSearchAgainstVectors,
  type ScoredChunk,
} from "../retrieval/superlinkedClient.js";
import { requireNonEmptyString, sendError } from "../utils/validation.js";

const log = createLogger("retrieve");

const CANDIDATE_POOL = 20;
const SLOW_RETRIEVAL_MS = 500;

const toRetrievedChunk = (row: ChunkRow, score: number): RetrievedChunk => ({
  speaker: row.speaker ?? undefined,
  ts: row.ts ?? undefined,
  text: row.text,
  source: row.source,
  score,
});

const parseMode = (raw: unknown): "auto" | "keyword" | "superlinked" => {
  if (raw === "keyword") return "keyword";
  if (raw === "superlinked") return "superlinked";
  return "auto";
};

const runKeyword = (
  meetingId: string,
  query: string,
  k: number,
): { chunks: RetrievedChunk[]; mode: RetrievalMode } => {
  const all = listChunksForMeeting(meetingId);
  const scored = keywordSearch(query, all, k);
  const rowsById = new Map(all.map((r) => [r.id, r]));
  const chunks: RetrievedChunk[] = scored
    .map((s) => {
      const row = rowsById.get(s.chunkId);
      return row ? toRetrievedChunk(row, s.score) : null;
    })
    .filter((c): c is RetrievedChunk => c !== null);
  return { chunks, mode: "keyword" };
};

const runSuperlinked = async (
  meetingId: string,
  query: string,
  k: number,
): Promise<{ chunks: RetrievedChunk[]; mode: RetrievalMode }> => {
  const stored = listIndexedVectorsForMeeting(meetingId);
  if (stored.length === 0) {
    log.warn("no indexed vectors for meeting; cannot do semantic search", { meetingId });
    throw new Error("no indexed vectors for this meeting yet");
  }

  // Stage 1: semantic search to get the candidate pool.
  const candidates: ScoredChunk[] = await semanticSearchAgainstVectors(
    query,
    stored,
    Math.min(CANDIDATE_POOL, stored.length),
  );
  if (candidates.length === 0) return { chunks: [], mode: "superlinked" };

  const rows = getChunksByIds(candidates.map((c) => c.chunkId));
  const rowsById = new Map(rows.map((r) => [r.id, r]));

  // Stage 2: rerank with SIE cross-encoder for higher precision.
  const rerankInput = candidates
    .map((c) => rowsById.get(c.chunkId))
    .filter((r): r is ChunkRow => r !== undefined)
    .map((r) => ({
      id: r.id,
      meetingId: r.meetingId,
      speaker: r.speaker ?? undefined,
      ts: r.ts ?? undefined,
      text: r.text,
      source: r.source,
    }));

  const reranked = await rerank(query, rerankInput);
  const topK = reranked.slice(0, k);
  const chunks: RetrievedChunk[] = topK
    .map((s) => {
      const row = rowsById.get(s.chunkId);
      return row ? toRetrievedChunk(row, s.score) : null;
    })
    .filter((c): c is RetrievedChunk => c !== null);
  return { chunks, mode: "superlinked-rerank" };
};

export const handleRetrieve = async (req: Request, res: Response): Promise<void> => {
  const start = Date.now();
  const meetingId = req.query["meetingId"];
  const query = req.query["query"];
  const kRaw = req.query["k"];
  const mode = parseMode(req.query["mode"]);

  if (!requireNonEmptyString(meetingId)) {
    sendError(res, 400, "meetingId is required");
    return;
  }
  if (!requireNonEmptyString(query)) {
    sendError(res, 400, "query is required");
    return;
  }
  const k = (() => {
    if (typeof kRaw !== "string") return 5;
    const n = Number.parseInt(kRaw, 10);
    if (!Number.isFinite(n) || n <= 0) return 5;
    return Math.min(n, 50);
  })();

  try {
    let result: { chunks: RetrievedChunk[]; mode: RetrievalMode };

    if (mode === "keyword") {
      result = runKeyword(meetingId, query, k);
    } else if (mode === "superlinked") {
      if (!isConfigured()) {
        sendError(
          res,
          503,
          "Superlinked is not configured. Set SUPERLINKED_ENDPOINT in .env or use mode=auto / mode=keyword.",
        );
        return;
      }
      result = await runSuperlinked(meetingId, query, k);
    } else {
      // auto: prefer Superlinked, fall back to keyword on anything going wrong.
      if (isConfigured()) {
        try {
          result = await runSuperlinked(meetingId, query, k);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn("auto mode: superlinked failed, falling back to keyword", { msg });
          result = runKeyword(meetingId, query, k);
        }
      } else {
        log.info("auto mode: superlinked not configured, using keyword baseline");
        result = runKeyword(meetingId, query, k);
      }
    }

    const latencyMs = Date.now() - start;
    if (latencyMs > SLOW_RETRIEVAL_MS) {
      log.warn("slow retrieval", { latencyMs, mode: result.mode, meetingId });
    }
    const out: RetrieveResponse = {
      chunks: result.chunks,
      retrievalMode: result.mode,
      latencyMs,
    };
    res.json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("retrieve failed", { msg });
    sendError(res, 500, msg);
  }
};
