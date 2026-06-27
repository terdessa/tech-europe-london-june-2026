// POST /sources — P4 ▶ P2. Pre-meeting prep docs / links / PDFs / images.
// Per ARCHITECTURE §3.2 the body is an items array. Each item becomes:
//   * one row in `sources`
//   * one or more rows in `chunks` (after parsing/chunking)
//   * one row per chunk in `superlinked_index` (best-effort embedding)

import type { Request, Response } from "express";
import type {
  SourceItem,
  SourcesRequest,
  SourcesResponse,
} from "../../shared/contracts.js";
import {
  insertChunk,
  insertSource,
  upsertSuperlinkedIndex,
} from "../db.js";
import { createLogger } from "../logger.js";
import { chunkText } from "../retrieval/chunker.js";
import {
  indexChunk,
  isConfigured,
  parseDocument,
} from "../retrieval/superlinkedClient.js";
import { newChunkId, newSourceId } from "../utils/ids.js";
import { requireNonEmptyString, sendError } from "../utils/validation.js";

const log = createLogger("sources");

const LINK_FETCH_TIMEOUT_MS = 6000;
const LINK_MAX_BYTES = 250_000;

const fetchLinkText = async (
  url: string,
): Promise<{ text: string; warning?: string }> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LINK_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      return { text: "", warning: `link fetch failed: HTTP ${res.status}` };
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text") && !ct.includes("json") && !ct.includes("html")) {
      return { text: "", warning: `link content-type not text-like: ${ct}` };
    }
    const raw = await res.text();
    const truncated = raw.length > LINK_MAX_BYTES ? raw.slice(0, LINK_MAX_BYTES) : raw;
    // Strip script/style + tags + collapse whitespace. Cheap HTML→text.
    const text = truncated
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: "", warning: `link fetch error: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
};

type Prepared = {
  sourceId: string;
  meetingId: string;
  type: SourceItem["type"];
  title: string | null;
  url: string | null;
  rawText: string;
  chunks: string[];
  warnings: string[];
};

const prepareItem = async (
  meetingId: string,
  item: SourceItem,
): Promise<Prepared> => {
  const sourceId = newSourceId();
  const warnings: string[] = [];
  const title = "title" in item && item.title ? item.title : null;

  if (item.type === "doc") {
    const parsed = await parseDocument({ type: "doc", text: item.content });
    return {
      sourceId,
      meetingId,
      type: "doc",
      title,
      url: null,
      rawText: parsed.text,
      chunks: parsed.chunks ?? chunkText(parsed.text),
      warnings,
    };
  }

  if (item.type === "link") {
    const { text, warning } = await fetchLinkText(item.url);
    if (warning) warnings.push(warning);
    const rawText = text;
    return {
      sourceId,
      meetingId,
      type: "link",
      title,
      url: item.url,
      rawText,
      chunks: rawText ? chunkText(rawText) : [],
      warnings,
    };
  }

  // pdf / image — try SIE doc parsing if configured, else degrade gracefully.
  if (!isConfigured()) {
    warnings.push(
      `Superlinked not configured: ${item.type} stored as metadata only. Set SUPERLINKED_ENDPOINT to parse with docling.`,
    );
    return {
      sourceId,
      meetingId,
      type: item.type,
      title,
      url: item.url ?? null,
      rawText: "",
      chunks: [],
      warnings,
    };
  }

  try {
    const parsed = await parseDocument({
      type: item.type,
      url: item.url,
      // TODO: support local file path → Buffer if file upload is added.
    });
    return {
      sourceId,
      meetingId,
      type: item.type,
      title,
      url: item.url ?? null,
      rawText: parsed.text,
      chunks: parsed.chunks ?? (parsed.text ? chunkText(parsed.text) : []),
      warnings,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Superlinked parseDocument failed: ${msg}`);
    return {
      sourceId,
      meetingId,
      type: item.type,
      title,
      url: item.url ?? null,
      rawText: "",
      chunks: [],
      warnings,
    };
  }
};

const persistPrepared = (p: Prepared, now: number): number => {
  insertSource({
    id: p.sourceId,
    meetingId: p.meetingId,
    type: p.type,
    title: p.title,
    url: p.url,
    rawText: p.rawText || null,
    createdAt: now,
  });

  let i = 0;
  for (const text of p.chunks) {
    if (!text.trim()) continue;
    const chunkId = newChunkId();
    insertChunk({
      id: chunkId,
      meetingId: p.meetingId,
      sourceId: p.sourceId,
      utteranceId: null,
      speaker: null,
      ts: null,
      text,
      source: p.type,
      chunkIndex: i,
      createdAt: now,
    });
    i += 1;

    if (isConfigured()) {
      void indexChunk({
        id: chunkId,
        meetingId: p.meetingId,
        text,
        source: p.type,
        sourceId: p.sourceId,
      })
        .then(({ externalId, vector }) => {
          upsertSuperlinkedIndex({
            chunkId,
            meetingId: p.meetingId,
            externalId,
            vector: JSON.stringify(vector),
            indexedAt: Math.floor(Date.now() / 1000),
            status: "indexed",
            error: null,
          });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          upsertSuperlinkedIndex({
            chunkId,
            meetingId: p.meetingId,
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
        meetingId: p.meetingId,
        externalId: null,
        vector: null,
        indexedAt: Math.floor(Date.now() / 1000),
        status: "unconfigured",
        error: null,
      });
    }
  }
  return i;
};

const validateItem = (item: unknown): item is SourceItem => {
  if (!item || typeof item !== "object") return false;
  const it = item as Record<string, unknown>;
  if (typeof it["type"] !== "string") return false;
  switch (it["type"]) {
    case "doc":
      return requireNonEmptyString(it["content"]);
    case "link":
      return requireNonEmptyString(it["url"]);
    case "pdf":
    case "image":
      return requireNonEmptyString(it["url"]) || requireNonEmptyString(it["path"]);
    default:
      return false;
  }
};

export const handleSources = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Partial<SourcesRequest> | undefined;
  if (!body) {
    sendError(res, 400, "request body required");
    return;
  }
  if (!requireNonEmptyString(body.meetingId)) {
    sendError(res, 400, "meetingId is required");
    return;
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    sendError(res, 400, "items must be a non-empty array");
    return;
  }
  if (!body.items.every(validateItem)) {
    sendError(res, 400, "each item must be { type: 'doc'|'link'|'pdf'|'image' } with required fields");
    return;
  }

  const meetingId = body.meetingId;
  const now = Math.floor(Date.now() / 1000);
  const prepared = await Promise.all(body.items.map((it) => prepareItem(meetingId, it)));

  const summary = prepared.map((p) => {
    const chunksCreated = persistPrepared(p, now);
    log.info("source stored", {
      meetingId,
      sourceId: p.sourceId,
      type: p.type,
      chunksCreated,
    });
    return { sourceId: p.sourceId, chunksCreated, warnings: p.warnings };
  });

  const out: SourcesResponse = { ok: true, sources: summary };
  res.json(out);
};
