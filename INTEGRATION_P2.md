# INTEGRATION_P2.md — Retrieval & Context (Flash)

> **Audience:** the AI coding agent (and human reviewer) that will later merge teammates' tracks (`p1-ears-and-mouth`, `p3-brain`, `p4-face`) into `main` alongside this branch.
> **Owner of this track:** Stas (P2 — Retrieval & Context).
> **Branch:** `p2-retrieval`.
> **Last verified working:** 2026-06-27 against Filip's hosted SIE cluster, indexed=20/20, semantic+rerank queries return correct chunks with sub-second latency.

Read this **before touching any P2 file** during a merge. It is the source of truth for what P2 promises, what P2 depends on, and where the seams are. For deep-dive operational docs (curl examples, demo story, perf notes) see [`docs/retrieval-service.md`](docs/retrieval-service.md). For the original build plan see [`plans/p2-retrieval.md`](plans/p2-retrieval.md). For the cross-track contracts see [`ARCHITECTURE.md`](ARCHITECTURE.md) §3 — that file is the higher authority; if this doc disagrees with ARCHITECTURE.md, ARCHITECTURE.md wins.

---

## 1. TL;DR

P2 is an HTTP service that gives Flash **recall**:

- **Stores** every utterance and prep source for a meeting (SQLite is the source of truth).
- **Embeds** every chunk via **Superlinked SIE** (`@superlinked/sie-sdk`, hosted by Filip).
- **Serves** semantic-search + cross-encoder rerank top-k chunks to P3.
- **Serves** the full ordered transcript to P3 and P4.

Stack: Node 22+ / TypeScript / Express, `node:sqlite` (built-in, no native compile), `@superlinked/sie-sdk@^0.6.14`.

Listens on `PORT` (default `3000`). Other services should read `CONTEXT_SERVICE_URL` from their own `.env` and treat that as the base URL for `/ingest`, `/sources`, `/retrieve`, `/transcript`.

---

## 2. Files owned by P2

Anything in this list is "mine" — if a merge needs to touch one of these, do the merge inside that file and ping me before changing public behaviour.

```
shared/contracts.ts                  # ALL types crossing service boundaries
src/server.ts                        # Express app + route wiring
src/config.ts                        # env loading
src/logger.ts                        # tiny stamped logger
src/db.ts                            # SQLite schema + repositories
src/seed.ts                          # `npm run seed:retrieval`
src/utils/ids.ts                     # newUtteranceId / newSourceId / newChunkId
src/utils/validation.ts              # validators + JSON error helper
src/retrieval/chunker.ts             # ~200-token chunker for prep docs
src/retrieval/keywordSearch.ts       # fallback + baseline (not the primary path)
src/retrieval/superlinkedClient.ts   # SIE SDK wrapper — sole owner of Superlinked calls
src/routes/ingest.ts                 # POST /ingest
src/routes/sources.ts                # POST /sources
src/routes/retrieve.ts               # GET  /retrieve
src/routes/transcript.ts             # GET  /transcript
sample-transcript.json               # ~20 utterances under meetingId="m_demo" for seeding
docs/retrieval-service.md            # operational doc (curl, demo story, perf)
INTEGRATION_P2.md                    # THIS file
package.json                         # `flash-retrieval` workspace member
tsconfig.json
.gitignore                           # union with main's; .env stays ignored
.env.example                         # ships with the public hackathon SIE endpoint
```

`shared/contracts.ts` and `.env.example` are the two **shared-ownership** files where a peer track's merge might legitimately add fields. See §10 below.

---

## 3. HTTP contracts P2 SERVES (must not break)

These are frozen by ARCHITECTURE.md §3. Any merge that changes the shape of these responses requires updating ARCHITECTURE.md first and notifying the consumer track.

### 3.1 `POST /ingest` — called by **P1**

```http
POST {CONTEXT_SERVICE_URL}/ingest
Content-Type: application/json
```

Request body:

```jsonc
{
  "meetingId": "m_123",       // REQUIRED string
  "text":      "we have 5000 budget",  // REQUIRED non-empty string
  "speaker":   "Alice",       // OPTIONAL
  "ts":        1719500000,    // OPTIONAL unix seconds (ms also accepted — auto-normalised)
  "source":    "live"         // OPTIONAL — "live" (default, spoken) | "screen" | other
}
```

`source: "screen"` is used by P1 when it ingests a description of a screen-share frame (the description comes from P3 `/vision`, see §4.2). The route accepts arbitrary `source` strings forward-compat.

Response:

```jsonc
{ "ok": true, "utteranceId": "utt_xxx", "chunkId": "chunk_xxx" }
```

Errors: `400` with `{ ok:false, error:"..." }` on missing `meetingId`/`text`. Superlinked indexing failures are **non-fatal** — the request still returns `200 ok:true` and the chunk is stored; indexing is retried on next seed/restart by querying rows with `status='error'` (currently a manual operation — see §11 TODO list).

### 3.2 `POST /sources` — called by **P4**

```http
POST {CONTEXT_SERVICE_URL}/sources
Content-Type: application/json
```

Request body:

```jsonc
{
  "meetingId": "m_123",
  "items": [
    { "type": "doc",   "title": "Q3 plan",   "content": "..." },
    { "type": "link",  "title": "Spec",      "url": "https://..." },
    { "type": "pdf",   "title": "deck.pdf",  "url": "https://..." },     // stretch
    { "type": "image", "title": "graph.png", "url": "https://..." }      // stretch
  ]
}
```

`items` must be a non-empty array. Each item is one of the four discriminated-union variants in `shared/contracts.ts::SourceItem`.

Per-type behaviour:

| `type`    | Today                                                                                       |
|-----------|----------------------------------------------------------------------------------------------|
| `"doc"`   | `content` chunked at ~200 tokens, embedded via SIE                                            |
| `"link"`  | URL fetched (6s timeout, 250 KB cap), HTML stripped → text → chunked → embedded               |
| `"pdf"`   | **TODO** — accepted in schema; `parseDocument` throws a clear warning, no chunks created     |
| `"image"` | **TODO** — accepted in schema; per ARCHITECTURE §3.9 the eventual path is P2 → P3 `/vision` → ingest description |

Response:

```jsonc
{
  "ok": true,
  "sources": [
    { "sourceId": "src_xxx", "chunksCreated": 8, "warnings": [] }
  ]
}
```

`warnings[]` is per-source: a link that fails to fetch returns the source with `chunksCreated: 0` and a warning string, never a hard error.

### 3.3 `GET /retrieve` — called by **P3**

```http
GET {CONTEXT_SERVICE_URL}/retrieve?meetingId=m_123&query=budget%20breakdown&k=8&mode=auto
```

Query params:

| Param        | Required | Default     | Notes                                                  |
|--------------|----------|-------------|--------------------------------------------------------|
| `meetingId`  | yes      | —           | scopes retrieval                                       |
| `query`      | yes      | —           | natural-language query                                  |
| `k`          | no       | `5`         | max 50                                                  |
| `mode`       | no       | `auto`      | `auto` \| `superlinked` \| `keyword`                    |

Modes:

- `superlinked` — semantic search (embed query, cosine over stored vectors, top 20) **+** SIE cross-encoder rerank, return top `k`. Returns `503` JSON error if SIE not configured.
- `auto` — prefer `superlinked`; silently fall back to `keyword` on missing config or any runtime error. P3 should use this in production.
- `keyword` — local baseline only. Demo/comparison use only.

Response (ARCHITECTURE §3.3-compatible):

```jsonc
{
  "chunks": [
    { "speaker": "Maya", "ts": 1719500030, "text": "Our total budget is 5000 pounds...",
      "source": "live", "score": 0.96 }
  ],
  "retrievalMode": "superlinked-rerank",   // "keyword" | "superlinked" | "superlinked-rerank"
  "latencyMs": 891
}
```

`retrievalMode` and `latencyMs` are **additive** — older consumers that only read `chunks` keep working.

### 3.4 `GET /transcript` — called by **P3 and P4**

```http
GET {CONTEXT_SERVICE_URL}/transcript?meetingId=m_123
```

Response:

```jsonc
{ "utterances": [ { "speaker": "Alice", "ts": 1719500000, "text": "..." } ] }
```

Ordered by `ts ASC, createdAt ASC`. Includes screen-source utterances (anything in the `utterances` table, regardless of `source` value). Used by P3's `/finalize` and P4's post-meeting Q&A.

### 3.5 `GET /health` — operational

Returns `{ ok:true, service:"flash-retrieval", superlinked:"configured"|"mock" }`. Add a `200`-check on this before pointing other services at P2.

---

## 4. HTTP contracts P2 CONSUMES (depends on peers)

P2 today makes outbound HTTP to **two** kinds of targets. Both have graceful degradation.

### 4.1 Superlinked SIE (Filip's hosted cluster)

- Base URL via `SUPERLINKED_ENDPOINT`, bearer-token via `SUPERLINKED_API_KEY`.
- All calls go through `@superlinked/sie-sdk` — never raw HTTP. The wrapper module is `src/retrieval/superlinkedClient.ts`. If a merge wants to talk to Superlinked from anywhere else, **redirect it through this module**. Do not import `SIEClient` elsewhere.
- Calls used: `client.encode(embedModel, item, { isQuery, outputTypes:["dense"] })`, `client.score(rerankModel, query, items)`.
- Cold model first-call may take ~1 min; SDK option `waitForCapacity: true` + `provisionTimeout: 900_000` handles that.

### 4.2 P3 `/vision` (Brain track) — **NOT YET WIRED**

Per ARCHITECTURE §3.9 (added in the recent main merge), the flow for visual context is:

```
P1 screen frame ─┐
                 ├─→  POST {N8N_WEBHOOK_BASE}/vision   (P3)
P4 image upload ─┘   { meetingId, imageBase64, ts, sharedBy }
                                  ↓
                  { description: "...", data?: {} }
                                  ↓
                     POST {CONTEXT_SERVICE_URL}/ingest  (P2)
                     { ..., source:"screen" }    ← already supported
```

**P2's outbound side of this is a TODO.** When P3's `/vision` is up, two integration points become live:

1. **P1 → P3 → P2.** P1 owns this loop today (they call P3, then call our `/ingest`). P2 needs no code changes here.
2. **P4 image upload → P2 → P3 → P2 ingest.** This is the "uploaded picture" feature. P2 should add a small `visionClient.ts` that takes `(meetingId, buffer, speaker?)` → POST `/vision` → returns `description` → P2 ingests it as a chunk. See §10 below for the merge instructions.

`N8N_WEBHOOK_BASE` is not currently read by P2. Add it to `src/config.ts` only when P4's image upload feature is implemented.

---

## 5. Data model (SQLite)

Schema lives in `src/db.ts` and is created `CREATE TABLE IF NOT EXISTS` on startup. The DB file is at `data/retrieval.db` (gitignored).

```text
utterances(id, meetingId, speaker, ts, text, source, createdAt)
  • One row per /ingest call.
  • source: "live" | "screen" | other (forward-compat).
  • Indexed on (meetingId, ts ASC, createdAt ASC) for /transcript.

sources(id, meetingId, type, title, url, rawText, createdAt)
  • One row per /sources item (doc/link/pdf/image).
  • rawText only populated for doc + link (and future pdf/image).

chunks(id, meetingId, sourceId?, utteranceId?, speaker?, ts?, text, source, chunkIndex, createdAt)
  • The unit Superlinked indexes. EVERY utterance mirrors as exactly ONE chunk;
    every source splits into N chunks at ~200 tokens.
  • Exactly one of sourceId/utteranceId is set per row (or neither for synthetic chunks).

superlinked_index(chunkId PK, meetingId, externalId, vector, indexedAt, status, error)
  • Bookkeeping for embedding state. vector is a JSON-stringified number[].
  • status ∈ {"indexed","error","unconfigured"}. Only "indexed" rows participate
    in semantic search.
  • SIE is stateless inference — the vector lives here, not "in Superlinked".
```

**Invariant:** every chunk has at most one matching `superlinked_index` row. If a future merge adds a re-embed path, it must `UPSERT` on `chunkId` (we already do this via `ON CONFLICT(chunkId) DO UPDATE`).

---

## 6. Module dependency graph

```
       server.ts
          │
          ├── routes/ingest.ts ─┬─→ db.ts ─→ (SQLite)
          ├── routes/sources.ts ─┤
          ├── routes/retrieve.ts ┤
          └── routes/transcript.ts
                                 │
                                 ├─→ retrieval/superlinkedClient.ts ─→ @superlinked/sie-sdk
                                 ├─→ retrieval/keywordSearch.ts
                                 └─→ retrieval/chunker.ts

shared/contracts.ts is imported by ALL routes for typing.
utils/{ids,validation}.ts are imported by routes; no module imports back into routes.
```

Hard rules a merge must keep:

1. **No route handler imports `@superlinked/sie-sdk` directly.** Route handlers only see `superlinkedClient.ts` exports.
2. **No module outside `src/retrieval/` is allowed to know what an embedding shape is.** Routes pass strings; the wrapper deals in `number[]`/`Float32Array`.
3. **`db.ts` never reaches outward.** It only persists/loads; no HTTP, no SIE. A merge that wants a derived view should add a new repository function in `db.ts` and call it from a route.

---

## 7. Superlinked integration (the prize-eligible piece)

This is the centerpiece — read carefully when merging anything that touches retrieval.

- **Interface chosen:** SIE (Superlinked Inference Engine) HTTP API, via the official `@superlinked/sie-sdk` TypeScript SDK (v ^0.6.14). Decided after reading the SIE Hackathon Quickstart Filip shared.
- **All code in one module:** `src/retrieval/superlinkedClient.ts`. ~230 lines. Public API: `isConfigured()`, `embedText()`, `indexChunk()`, `semanticSearchAgainstVectors()`, `rerank()`, `parseDocument()`, `describe()`, `close()`.
- **What SIE does for us:**
  1. `client.encode(SUPERLINKED_EMBED_MODEL, item, { isQuery, outputTypes:["dense"] })` — used by both `/ingest`/`/sources` (indexing) and `/retrieve` (query).
  2. `client.score(SUPERLINKED_RERANK_MODEL, query, items)` — used only in `/retrieve?mode=superlinked` after the cosine top-20 candidates are picked.
  3. `parseDocument` (PDF/image) → uses `client.extract(...)` — **TODO**, see §11.
- **Models (defaults, override via env):**
  - Embed: `sentence-transformers/all-MiniLM-L6-v2` (384-dim, fast).
  - Rerank: `cross-encoder/ms-marco-MiniLM-L-6-v2`.
  - Doc parse: `docling` (TODO).
- **Why these defaults:** they're the quickstart's hackathon picks — small, fast, work on `l4` GPU lane.
- **Cold-load handling:** `waitForCapacity: true` + `provisionTimeout: 900_000` (15 min) at SDK construction. First call to a model may visibly stall while it loads; subsequent calls are ~50-200 ms.
- **Failure isolation:** Superlinked errors are isolated to the request that hit them. `/ingest` swallows indexing failures (marks `status='error'` in `superlinked_index`). `/retrieve?mode=auto` falls back to keyword. `/retrieve?mode=superlinked` returns a JSON `503`.

If a merge wants to swap the SDK for the older Python `superlinked` framework, the only file that changes is `superlinkedClient.ts`. Every other module is interface-only.

---

## 8. Environment configuration

Canonical list lives in `.env.example`. The file ships with the **public** hackathon SIE endpoint pre-filled. The only secret a teammate needs is `SUPERLINKED_API_KEY`, available from `@filipmakraduli` on Discord.

| Variable                          | Default                                         | Notes                                              |
|-----------------------------------|--------------------------------------------------|----------------------------------------------------|
| `PORT`                            | `3000`                                          | port to listen on                                   |
| `CONTEXT_SERVICE_URL`             | `http://localhost:3000`                          | the URL other services use to reach P2              |
| `SQLITE_PATH`                     | `./data/retrieval.db`                           | gitignored                                          |
| `SUPERLINKED_ENDPOINT`            | hackathon ELB URL                                | empty value → mock mode                             |
| `SUPERLINKED_API_KEY`             | (none)                                          | `SL-<hex>` from Filip                               |
| `SUPERLINKED_MODE`                | `sie`                                           | `sie` is the only currently-supported value         |
| `SUPERLINKED_GPU`                 | `l4`                                            | `rtx6000` for generative models (not used by P2)    |
| `SUPERLINKED_PROVISION_TIMEOUT_MS`| `900000`                                        | 15 min — cold model loads                            |
| `SUPERLINKED_EMBED_MODEL`         | `sentence-transformers/all-MiniLM-L6-v2`        | switchable                                          |
| `SUPERLINKED_RERANK_MODEL`        | `cross-encoder/ms-marco-MiniLM-L-6-v2`          | switchable                                          |
| `SUPERLINKED_DOC_MODEL`           | `docling`                                       | TODO                                                |

P3 may add `N8N_WEBHOOK_BASE` to `.env.example` for its own use — that's P3's variable, P2 only needs it later (see §10) for image upload routing.

---

## 9. How to run / verify after a merge

```powershell
# Install (run from repo root)
npm install

# Typecheck + build — gate every merge on these
npm run typecheck
npm run build

# Seed sample-transcript.json (20 utterances under meetingId="m_demo")
npm run seed:retrieval

# Run service in watch mode
npm run dev
# or: npm start (after build)
```

Smoke tests after a merge — paste in a terminal:

```powershell
$base = "http://localhost:3000"
Invoke-RestMethod "$base/health" | ConvertTo-Json
Invoke-RestMethod "$base/transcript?meetingId=m_demo" | %{ $_.utterances.Count }   # expect 20
Invoke-RestMethod -Method Post -Uri "$base/ingest" -ContentType "application/json" `
  -Body '{"meetingId":"m_test","text":"hello"}' | ConvertTo-Json
Invoke-RestMethod "$base/retrieve?meetingId=m_demo&query=how%20much%20money%20is%20left%3F&mode=superlinked&k=3" `
  | ConvertTo-Json -Depth 5
```

Pass criteria:

- `/health` → `superlinked: "configured"`.
- `/retrieve?mode=superlinked` → `retrievalMode: "superlinked-rerank"` and a non-empty `chunks` array. If `chunks` is empty after a seed, semantic indexing didn't run — check `superlinked_index` table.

---

## 10. Cross-track merge guide

This section is **the most important part of this doc for an AI agent doing a merge.** It enumerates each peer track and tells you exactly what P2 will or won't accept from that merge.

### 10.1 Merging P1 (Ears, Eyes & Mouth)

What P1 produces that touches P2:

- HTTP calls to `POST /ingest` for every utterance (speech).
- HTTP calls to `POST /ingest` for every screen-share frame description (`source: "screen"`, `speaker: "<name> (screen)"`).
- (Future) Possibly a `GET /transcript` poll for self-checks. No code path expected.

What P2 should **NOT** absorb from P1:

- LiveKit / Meet SDK code. Stays in P1.
- SLNG client code. Stays in P1.
- Wake-word detection. Stays in P1.

Conflict-prone files:

- `shared/contracts.ts` — both tracks may extend `IngestRequest`. If P1 adds new optional fields, accept them and add narrow types in this file.
- `.env.example` — both tracks add env vars. Take the union, never drop variables.

### 10.2 Merging P3 (Brain — n8n + Gemini)

What P3 produces that touches P2:

- HTTP `GET /retrieve` calls — P2 already serves these.
- HTTP `GET /transcript` calls — P2 already serves these.
- A new endpoint `POST {N8N_WEBHOOK_BASE}/vision` that P2 will (later) call from `/sources` image-upload flow. **No P2 code today depends on this**; do not block a P3 merge on P2.

What P2 should **NOT** absorb from P3:

- Gemini SDK / model calls. Stays in P3.
- n8n workflow JSON. Stays in P3.
- Mermaid diagram code generation. Stays in P3.

**Trigger for new P2 code:** once P3's `/vision` URL is documented in their `INTEGRATION_P3.md` (or whatever they name their handoff doc), implement `src/retrieval/visionClient.ts` and wire `prepareItem` for `type:"image"` to: download bytes → base64 → POST `/vision` → take `description` → chunk + embed normally. Estimated ~25 lines.

### 10.3 Merging P4 (Face — web app)

What P4 produces that touches P2:

- HTTP calls to `POST /sources` from the launcher upload form.
- (Future) Calls to `POST /sources` with `pdf` / `image` items if the launcher supports file uploads.

When P4 lands file uploads, P2 needs the small extension described in the previous chat turn: extend `SourceItem` for `pdf` / `image` to accept an optional `data: string` (base64). Already documented in `shared/contracts.ts` as a discriminated union, so the addition is two lines.

What P2 should **NOT** absorb from P4:

- React / Vite / Mermaid render code. Stays in P4.
- Aikido configuration. Stays in P4.

### 10.4 General merge rules

- **Never delete a column or table** in `src/db.ts` without a migration plan. Sample-transcript seeded DBs in teammates' dev environments will break otherwise.
- **Never change the JSON shape of an existing field** in `shared/contracts.ts` without bumping ARCHITECTURE.md first. Additive changes (new optional fields) are always safe.
- **Never call SIE outside `src/retrieval/superlinkedClient.ts`.** If you find an import of `@superlinked/sie-sdk` in a route or DB module after a merge, that is a merge bug — move the call back into the wrapper.
- **Always run `npm run typecheck && npm run build`** before pushing a merge commit.
- **Always commit via the existing message style** (`feat(p2): ...`, `fix(p2): ...`, `chore(p2): ...`). Plain `Merge ...` is fine for merge commits.

---

## 11. Known TODOs (in priority order)

These are intentional gaps. They are safe to leave open and easy to close when their preconditions arrive.

| # | TODO                                              | Trigger / when to do it                                                   | Effort |
|---|---------------------------------------------------|----------------------------------------------------------------------------|--------|
| 1 | PDF text extraction in `parseDocument({type:"pdf"})` | Whenever P4 starts uploading PDFs                                          | ~40 lines + `pdfjs-dist` dep |
| 2 | Image → P3 `/vision` round-trip in `parseDocument({type:"image"})` | When P3 publishes `/vision`                                                | ~25 lines + new `visionClient.ts` |
| 3 | `data: base64` field on `SourceItem` pdf/image    | When P4 wires the upload form                                              | 6 lines in `contracts.ts`, ~20 in `sources.ts` |
| 4 | Manual re-embed CLI (`npm run reindex:retrieval`) for rows with `status='error'` | If Superlinked has hiccups during the meeting and any chunks fail | ~50 lines, reuse `seed.ts` patterns |
| 5 | Optional Qdrant / Weaviate vector store behind same wrapper | Only if we somehow hit >10k chunks per meeting (we won't)                | ~100 lines |

None of these block the demo. Items 1-3 together are about an hour of work and would only be needed if the demo plan includes someone uploading a PDF or an image during the show.

---

## 12. Recent commit history (P2 branch)

```text
6d2033f  feat(p2): use official @superlinked/sie-sdk; hackathon endpoint + faster models
7f2aad4  feat(p2): rename Rahid -> Flash; accept source: "live" | "screen" on /ingest
b3bf076  Merge origin/main into p2-retrieval
216d83c  feat(p2): retrieval & context service (SQLite + Superlinked SIE)
```

Anything older is upstream / shared docs.

---

## 13. If you (the agent) get stuck

- The deployment URL is in `.env.example`. Liveness probe: `curl -i $SUPERLINKED_ENDPOINT/healthz` → `200 OK` means SIE is reachable.
- The API key format is `SL-<32 hex chars>`. If absent, P2 boots in **mock mode** and `/retrieve?mode=auto` silently uses the keyword baseline — the service still works end-to-end, just without semantic recall.
- Logs are stamped `[ts] LEVEL scope - message {meta}`. Search `INFO superlinked - ` for embed/rerank events, `WARN superlinked - ` for fallbacks.
- If `npm run build` complains about `node:sqlite` after a Node version change, the user is on < Node 22.5. Tell them to upgrade Node, not to install `better-sqlite3` — we deliberately avoided native deps.

If a merge breaks something that this doc didn't anticipate: revert the merge, capture the failing case, then ask the human owner. Don't paper over a contract change.
