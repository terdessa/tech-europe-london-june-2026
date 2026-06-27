// POST /ingest — P1 ▶ P2. One live utterance from the meeting.
// Behaviour:
//   1. Validate { meetingId, text }; default ts to now.
//   2. Persist the utterance + its mirrored chunk in SQLite (source of truth).
//   3. Best-effort: embed the chunk via Superlinked SIE and store the vector.
//      Indexing failures NEVER fail the request — live ingest must stay alive.

import type { Request, Response } from "express";
import type { IngestRequest, IngestResponse } from "../../shared/contracts.js";
import {
  insertChunk,
  insertUtterance,
  upsertSuperlinkedIndex,
} from "../db.js";
import { createLogger } from "../logger.js";
import { indexChunk, isConfigured } from "../retrieval/superlinkedClient.js";
import { newChunkId, newUtteranceId } from "../utils/ids.js";
import {
  normaliseTs,
  requireNonEmptyString,
  sendError,
} from "../utils/validation.js";

const log = createLogger("ingest");

export const handleIngest = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Partial<IngestRequest> | undefined;
  if (!body) {
    sendError(res, 400, "request body required");
    return;
  }
  if (!requireNonEmptyString(body.meetingId)) {
    sendError(res, 400, "meetingId is required");
    return;
  }
  if (!requireNonEmptyString(body.text)) {
    sendError(res, 400, "text is required");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const ts = normaliseTs(body.ts);
  const speaker = requireNonEmptyString(body.speaker) ? body.speaker : null;
  const text = body.text.trim();
  const meetingId = body.meetingId;

  const utteranceId = newUtteranceId();
  const chunkId = newChunkId();

  insertUtterance({
    id: utteranceId,
    meetingId,
    speaker,
    ts,
    text,
    source: "live",
    createdAt: now,
  });
  insertChunk({
    id: chunkId,
    meetingId,
    sourceId: null,
    utteranceId,
    speaker,
    ts,
    text,
    source: "live",
    chunkIndex: 0,
    createdAt: now,
  });

  if (isConfigured()) {
    // Fire-and-forget: never block live ingest on Superlinked latency.
    // We DO log success/failure so the demo can show indexing happening.
    void indexChunk({
      id: chunkId,
      meetingId,
      speaker: speaker ?? undefined,
      ts,
      text,
      source: "live",
    })
      .then(({ externalId, vector }) => {
        upsertSuperlinkedIndex({
          chunkId,
          meetingId,
          externalId,
          vector: JSON.stringify(vector),
          indexedAt: Math.floor(Date.now() / 1000),
          status: "indexed",
          error: null,
        });
        log.info("indexed live utterance", { chunkId, meetingId });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        upsertSuperlinkedIndex({
          chunkId,
          meetingId,
          externalId: null,
          vector: null,
          indexedAt: Math.floor(Date.now() / 1000),
          status: "error",
          error: msg,
        });
        log.warn("superlinked indexing failed (non-fatal)", { chunkId, error: msg });
      });
  } else {
    upsertSuperlinkedIndex({
      chunkId,
      meetingId,
      externalId: null,
      vector: null,
      indexedAt: Math.floor(Date.now() / 1000),
      status: "unconfigured",
      error: null,
    });
  }

  const out: IngestResponse = { ok: true, utteranceId, chunkId };
  res.json(out);
};
