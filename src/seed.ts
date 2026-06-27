// Seed sample-transcript.json into SQLite (utterances + chunks + best-effort
// Superlinked indexing). Idempotent-ish: skips if utterances already exist
// for the sample meetingId.
//
// Usage:
//   npm run seed:retrieval

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDb,
  insertChunk,
  insertUtterance,
  listUtterances,
  upsertSuperlinkedIndex,
} from "./db.js";
import { createLogger } from "./logger.js";
import { indexChunk, isConfigured } from "./retrieval/superlinkedClient.js";
import { newChunkId, newUtteranceId } from "./utils/ids.js";

const log = createLogger("seed");

type SampleUtterance = { speaker?: string; ts: number; text: string };
type Sample = { meetingId: string; utterances: SampleUtterance[] };

const main = async (): Promise<void> => {
  getDb();

  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(here, "..", "sample-transcript.json"),
    path.resolve(here, "..", "..", "sample-transcript.json"),
  ];
  const samplePath = candidatePaths.find((p) => fs.existsSync(p));
  if (!samplePath) {
    log.error("sample-transcript.json not found", { tried: candidatePaths });
    process.exitCode = 1;
    return;
  }

  const sample = JSON.parse(fs.readFileSync(samplePath, "utf8")) as Sample;
  if (!sample.meetingId || !Array.isArray(sample.utterances)) {
    log.error("sample-transcript.json malformed");
    process.exitCode = 1;
    return;
  }

  const existing = listUtterances(sample.meetingId);
  if (existing.length > 0) {
    log.info(`meeting ${sample.meetingId} already has ${existing.length} utterances — skipping insert. Delete data/retrieval.db to reseed.`);
    return;
  }

  log.info(`seeding ${sample.utterances.length} utterances into ${sample.meetingId}`);
  const now = Math.floor(Date.now() / 1000);
  const pending: Array<{ chunkId: string; meetingId: string; text: string; speaker?: string; ts: number }> = [];

  for (const u of sample.utterances) {
    const utteranceId = newUtteranceId();
    const chunkId = newChunkId();
    insertUtterance({
      id: utteranceId,
      meetingId: sample.meetingId,
      speaker: u.speaker ?? null,
      ts: u.ts,
      text: u.text,
      source: "live",
      createdAt: now,
    });
    insertChunk({
      id: chunkId,
      meetingId: sample.meetingId,
      sourceId: null,
      utteranceId,
      speaker: u.speaker ?? null,
      ts: u.ts,
      text: u.text,
      source: "live",
      chunkIndex: 0,
      createdAt: now,
    });
    pending.push({
      chunkId,
      meetingId: sample.meetingId,
      text: u.text,
      speaker: u.speaker,
      ts: u.ts,
    });
  }

  if (!isConfigured()) {
    log.warn("Superlinked not configured — chunks stored but NOT embedded. Set SUPERLINKED_ENDPOINT then rerun seed.");
    for (const p of pending) {
      upsertSuperlinkedIndex({
        chunkId: p.chunkId,
        meetingId: p.meetingId,
        externalId: null,
        vector: null,
        indexedAt: now,
        status: "unconfigured",
        error: null,
      });
    }
    log.info("seed complete (mock mode)");
    return;
  }

  log.info("embedding seeded chunks via Superlinked SIE…");
  let ok = 0;
  let fail = 0;
  for (const p of pending) {
    try {
      const { externalId, vector } = await indexChunk({
        id: p.chunkId,
        meetingId: p.meetingId,
        text: p.text,
        source: "live",
        speaker: p.speaker,
        ts: p.ts,
      });
      upsertSuperlinkedIndex({
        chunkId: p.chunkId,
        meetingId: p.meetingId,
        externalId,
        vector: JSON.stringify(vector),
        indexedAt: Math.floor(Date.now() / 1000),
        status: "indexed",
        error: null,
      });
      ok += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      upsertSuperlinkedIndex({
        chunkId: p.chunkId,
        meetingId: p.meetingId,
        externalId: null,
        vector: null,
        indexedAt: Math.floor(Date.now() / 1000),
        status: "error",
        error: msg,
      });
      fail += 1;
      log.warn("indexing failed", { chunkId: p.chunkId, error: msg });
    }
  }
  log.info(`seed complete — indexed=${ok} failed=${fail}`);
};

void main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  log.error("seed crashed", { msg });
  process.exitCode = 1;
});
