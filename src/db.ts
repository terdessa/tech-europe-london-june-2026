// SQLite is the source of truth for raw utterances + sources. We use Node's
// built-in `node:sqlite` (DatabaseSync) — no native compile step needed on
// Windows, ships with Node 22.5+ / 24.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { MeetingSummaryRow } from "../shared/contracts.js";
import { config } from "./config.js";
import { createLogger } from "./logger.js";

const log = createLogger("db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS utterances (
  id        TEXT PRIMARY KEY,
  meetingId TEXT NOT NULL,
  speaker   TEXT,
  ts        INTEGER NOT NULL,
  text      TEXT NOT NULL,
  source    TEXT NOT NULL DEFAULT 'live',
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_utterances_meeting_ts
  ON utterances(meetingId, ts ASC, createdAt ASC);

CREATE TABLE IF NOT EXISTS sources (
  id        TEXT PRIMARY KEY,
  meetingId TEXT NOT NULL,
  type      TEXT NOT NULL,
  title     TEXT,
  url       TEXT,
  rawText   TEXT,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_meeting ON sources(meetingId);

CREATE TABLE IF NOT EXISTS chunks (
  id          TEXT PRIMARY KEY,
  meetingId   TEXT NOT NULL,
  sourceId    TEXT,
  utteranceId TEXT,
  speaker     TEXT,
  ts          INTEGER,
  text        TEXT NOT NULL,
  source      TEXT NOT NULL,
  chunkIndex  INTEGER NOT NULL DEFAULT 0,
  createdAt   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_meeting   ON chunks(meetingId);
CREATE INDEX IF NOT EXISTS idx_chunks_source    ON chunks(sourceId);
CREATE INDEX IF NOT EXISTS idx_chunks_utterance ON chunks(utteranceId);

CREATE TABLE IF NOT EXISTS superlinked_index (
  chunkId    TEXT PRIMARY KEY,
  meetingId  TEXT NOT NULL,
  externalId TEXT,
  vector     TEXT,
  indexedAt  INTEGER,
  status     TEXT,
  error      TEXT
);
CREATE INDEX IF NOT EXISTS idx_sl_meeting ON superlinked_index(meetingId);
CREATE INDEX IF NOT EXISTS idx_sl_status  ON superlinked_index(status);
`;

export type UtteranceRow = {
  id: string;
  meetingId: string;
  speaker: string | null;
  ts: number;
  text: string;
  source: string;
  createdAt: number;
};

export type SourceRow = {
  id: string;
  meetingId: string;
  type: string;
  title: string | null;
  url: string | null;
  rawText: string | null;
  createdAt: number;
};

export type ChunkRow = {
  id: string;
  meetingId: string;
  sourceId: string | null;
  utteranceId: string | null;
  speaker: string | null;
  ts: number | null;
  text: string;
  source: string;
  chunkIndex: number;
  createdAt: number;
};

export type SuperlinkedIndexRow = {
  chunkId: string;
  meetingId: string;
  externalId: string | null;
  vector: string | null;
  indexedAt: number | null;
  status: string | null;
  error: string | null;
};

const ensureDir = (filePath: string): void => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

let db: DatabaseSync | null = null;

export const getDb = (): DatabaseSync => {
  if (db) return db;
  ensureDir(config.sqlitePath);
  db = new DatabaseSync(config.sqlitePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  log.info("sqlite initialised", { path: config.sqlitePath });
  return db;
};

// node:sqlite returns rows as plain objects (`{column: value}`) but values can
// be `string | number | bigint | null | Uint8Array`. We narrow back to our row
// types at the boundary. SQLite stores TEXT columns as strings and INTEGER
// columns as numbers up to 2^53, so the cast is safe for our schema.
const asUtterance = (r: Record<string, unknown>): UtteranceRow => ({
  id: r["id"] as string,
  meetingId: r["meetingId"] as string,
  speaker: (r["speaker"] as string | null) ?? null,
  ts: Number(r["ts"]),
  text: r["text"] as string,
  source: r["source"] as string,
  createdAt: Number(r["createdAt"]),
});

const asChunk = (r: Record<string, unknown>): ChunkRow => ({
  id: r["id"] as string,
  meetingId: r["meetingId"] as string,
  sourceId: (r["sourceId"] as string | null) ?? null,
  utteranceId: (r["utteranceId"] as string | null) ?? null,
  speaker: (r["speaker"] as string | null) ?? null,
  ts: r["ts"] === null || r["ts"] === undefined ? null : Number(r["ts"]),
  text: r["text"] as string,
  source: r["source"] as string,
  chunkIndex: Number(r["chunkIndex"] ?? 0),
  createdAt: Number(r["createdAt"]),
});

// ---------- Utterances ------------------------------------------------------

export const insertUtterance = (u: UtteranceRow): void => {
  getDb()
    .prepare(
      `INSERT INTO utterances (id, meetingId, speaker, ts, text, source, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(u.id, u.meetingId, u.speaker, u.ts, u.text, u.source, u.createdAt);
};

export const listUtterances = (meetingId: string): UtteranceRow[] => {
  const rows = getDb()
    .prepare(
      `SELECT * FROM utterances
       WHERE meetingId = ?
       ORDER BY ts ASC, createdAt ASC`,
    )
    .all(meetingId) as Record<string, unknown>[];
  return rows.map(asUtterance);
};

// One row per meeting, summarised for the P4 dashboard history list.
const asMeetingSummary = (r: Record<string, unknown>): MeetingSummaryRow => ({
  meetingId: r["meetingId"] as string,
  lastTs: Number(r["lastTs"]),
  utteranceCount: Number(r["utteranceCount"]),
});

export const listMeetings = (): MeetingSummaryRow[] => {
  const rows = getDb()
    .prepare(
      `SELECT meetingId, MAX(ts) AS lastTs, COUNT(*) AS utteranceCount
       FROM utterances
       GROUP BY meetingId
       ORDER BY lastTs DESC`,
    )
    .all() as Record<string, unknown>[];
  return rows.map(asMeetingSummary);
};

// ---------- Sources ---------------------------------------------------------

export const insertSource = (s: SourceRow): void => {
  getDb()
    .prepare(
      `INSERT INTO sources (id, meetingId, type, title, url, rawText, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(s.id, s.meetingId, s.type, s.title, s.url, s.rawText, s.createdAt);
};

// ---------- Chunks ----------------------------------------------------------

export const insertChunk = (c: ChunkRow): void => {
  getDb()
    .prepare(
      `INSERT INTO chunks (id, meetingId, sourceId, utteranceId, speaker, ts, text, source, chunkIndex, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      c.id,
      c.meetingId,
      c.sourceId,
      c.utteranceId,
      c.speaker,
      c.ts,
      c.text,
      c.source,
      c.chunkIndex,
      c.createdAt,
    );
};

export const listChunksForMeeting = (meetingId: string): ChunkRow[] => {
  const rows = getDb()
    .prepare(`SELECT * FROM chunks WHERE meetingId = ?`)
    .all(meetingId) as Record<string, unknown>[];
  return rows.map(asChunk);
};

export const getChunksByIds = (ids: string[]): ChunkRow[] => {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT * FROM chunks WHERE id IN (${placeholders})`)
    .all(...ids) as Record<string, unknown>[];
  return rows.map(asChunk);
};

// ---------- Superlinked index ----------------------------------------------

export const upsertSuperlinkedIndex = (row: SuperlinkedIndexRow): void => {
  getDb()
    .prepare(
      `INSERT INTO superlinked_index (chunkId, meetingId, externalId, vector, indexedAt, status, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chunkId) DO UPDATE SET
         externalId = excluded.externalId,
         vector     = excluded.vector,
         indexedAt  = excluded.indexedAt,
         status     = excluded.status,
         error      = excluded.error`,
    )
    .run(
      row.chunkId,
      row.meetingId,
      row.externalId,
      row.vector,
      row.indexedAt,
      row.status,
      row.error,
    );
};

export const listIndexedVectorsForMeeting = (
  meetingId: string,
): Array<{ chunkId: string; vector: number[] }> => {
  const rows = getDb()
    .prepare(
      `SELECT chunkId, vector FROM superlinked_index
       WHERE meetingId = ? AND status = ? AND vector IS NOT NULL`,
    )
    .all(meetingId, "indexed") as Array<{ chunkId: string; vector: string | null }>;
  const out: Array<{ chunkId: string; vector: number[] }> = [];
  for (const r of rows) {
    if (!r.vector) continue;
    try {
      const v = JSON.parse(r.vector) as unknown;
      if (Array.isArray(v) && v.every((x) => typeof x === "number")) {
        out.push({ chunkId: r.chunkId, vector: v as number[] });
      }
    } catch {
      // skip corrupt row
    }
  }
  return out;
};
