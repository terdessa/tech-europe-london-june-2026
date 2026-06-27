# Rahid P2 — Retrieval & Context Service

This is **P2** in the Rahid architecture (`ARCHITECTURE.md` §2 / §3). It is Rahid's recall: it ingests live utterances and prep documents, stores them durably in SQLite, and uses **Superlinked** (specifically the Superlinked Inference Engine — **SIE**) as the semantic layer for embedding, search, and reranking on top of that store.

## 1. What P2 does

- **Listens to the meeting in real time.** P1 (Ears & Mouth) POSTs each utterance to `POST /ingest` as soon as it is transcribed.
- **Loads prep context.** P4 (Face/launcher) POSTs every prep doc, link, PDF, or image to `POST /sources` before the meeting starts.
- **Serves grounded recall.** P3 (Brain/n8n) calls `GET /retrieve` whenever Rahid needs to answer a question or generate a diagram. It returns the top-k most relevant chunks for the query, scoped to the meeting.
- **Serves the full transcript.** P3 (post-meeting `/finalize`) and P4 (post-meeting Q&A) call `GET /transcript` to read the whole conversation in order.

## 2. SQLite as source of truth

The raw conversation lives in **SQLite**. Tables:

- `utterances(id, meetingId, speaker, ts, text, source, createdAt)` — every line of dialogue, in append-only order. `GET /transcript` is `SELECT * FROM utterances WHERE meetingId = ? ORDER BY ts ASC, createdAt ASC`.
- `sources(id, meetingId, type, title, url, rawText, createdAt)` — prep docs/links/PDFs/images.
- `chunks(id, meetingId, sourceId?, utteranceId?, speaker?, ts?, text, source, chunkIndex, createdAt)` — what Superlinked actually indexes. Every utterance is mirrored as one chunk; every source is split into ~200-token chunks.
- `superlinked_index(chunkId PK, meetingId, externalId, vector, indexedAt, status, error)` — bookkeeping for which chunks have been embedded. We persist the embedding (`vector` is a JSON array of floats) here because **SIE is stateless inference** — it does not store vectors for you.

If Superlinked is unavailable, the raw store still works perfectly: `GET /transcript` is unaffected and `GET /retrieve?mode=keyword` still serves a local baseline. SQLite is what survives restarts; the vector index is rebuildable.

## 3. How Superlinked is used

P2's intelligence layer is **Superlinked**, called via the **SIE HTTP API**:

- **Embedding / indexing.** Every chunk (utterance or prep-doc chunk) is sent to `POST /v1/encode/:model` (default `BAAI/bge-m3`). The returned dense vector is persisted in `superlinked_index.vector`.
- **Semantic search.** On `GET /retrieve`, the query is embedded with the same model (`is_query: true`) and ranked against the meeting's stored vectors by cosine similarity to produce the top-20 candidate pool.
- **Reranking.** The candidates are sent to `POST /v1/score/:model` (default `BAAI/bge-reranker-v2-m3`), a cross-encoder, which scores `(query, chunk)` pairs for higher precision. The top-k of those becomes the response.
- **Document parsing / OCR.** When P4 sends a `pdf` or `image` source, P2 calls `POST /v1/extract/:model` (default `docling`) to convert the file into clean markdown plus chunks before embedding. For plain `doc` and `link` items we chunk locally and skip the doc model.
- **SQLite remains the source of truth.** Superlinked is the inference engine, not the database — never rely on the vector index to hold the raw text.

All Superlinked-specific code lives in one module: [`src/retrieval/superlinkedClient.ts`](../src/retrieval/superlinkedClient.ts). Routes never call SIE directly.

### Which Superlinked interface this repo uses

**SIE (Superlinked Inference Engine) HTTP API.** Confirmed against current Superlinked docs:

- [SIE docs](https://superlinked.com/docs)
- [`superlinked/sie` on GitHub](https://github.com/superlinked/sie)
- [SIE HTTP API reference](https://superlinked.com/docs/reference/api)

We picked SIE (over the older `superlinked` Python framework) because it is language-agnostic HTTP, can be self-hosted or pointed at a managed cluster, and exposes exactly the three primitives we need: `encode`, `score`, `extract`. The framework path would force us into Python and a heavier schema-DAG model that we don't benefit from here.

Switching to the framework later would require: (a) standing up a `superlinked` Python service that exposes equivalent endpoints, and (b) changing only `src/retrieval/superlinkedClient.ts`. No other file knows the difference.

## 4. Environment variables

Copy `.env.example` to `.env` and fill these in. Never commit `.env`.

```
PORT=3000
CONTEXT_SERVICE_URL=http://localhost:3000
SQLITE_PATH=./data/retrieval.db

SUPERLINKED_ENDPOINT=          # e.g. http://localhost:8080 or https://your-cluster
SUPERLINKED_API_KEY=           # any string for self-host, real key for managed
SUPERLINKED_CLUSTER_URL=       # reserved
SUPERLINKED_MODE=sie           # sie | framework  (we use sie)
SUPERLINKED_EMBED_MODEL=BAAI/bge-m3
SUPERLINKED_RERANK_MODEL=BAAI/bge-reranker-v2-m3
SUPERLINKED_DOC_MODEL=docling
```

If `SUPERLINKED_ENDPOINT` is empty, P2 runs in **mock mode**: the HTTP API stays fully alive, but retrieval falls back to the keyword baseline and indexing is recorded as `status='unconfigured'` so you can see which chunks still need embedding once credentials land.

## 5. How to run

```powershell
# Install
npm install

# Dev (watch + restart)
npm run dev

# Or production build
npm run build
npm start
```

The service listens on `http://localhost:3000` by default. Health check: `GET /health`.

## 6. Seeding the sample transcript

```powershell
npm run seed:retrieval
```

Loads [`sample-transcript.json`](../sample-transcript.json) (≈20 utterances under `meetingId="m_demo"`) into SQLite. If Superlinked is configured, every seeded chunk is embedded immediately so retrieval is ready before any live traffic. Re-running is a no-op unless you delete `data/retrieval.db`.

## 7. Curl commands (demo)

```bash
# Ingest a live utterance (P1 → P2)
curl -X POST http://localhost:3000/ingest \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"m_demo","speaker":"Maya","ts":1719500000,"text":"Our total budget is 5000 pounds. We already spent 500 on hosting and expect around 1000 for AI APIs."}'

# Load prep docs (P4 → P2)
curl -X POST http://localhost:3000/sources \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"m_demo","items":[{"type":"doc","title":"Demo brief","content":"Rahid is an active meeting helper that answers questions and generates diagrams grounded in the meeting context."}]}'

# Full ordered transcript (P3/P4 → P2)
curl "http://localhost:3000/transcript?meetingId=m_demo"

# Keyword baseline
curl "http://localhost:3000/retrieve?meetingId=m_demo&query=budget&mode=keyword"

# Superlinked semantic + rerank
curl "http://localhost:3000/retrieve?meetingId=m_demo&query=how%20much%20money%20is%20left%3F&mode=superlinked"

# Auto (prefers Superlinked, falls back to keyword if unconfigured/errors)
curl "http://localhost:3000/retrieve?meetingId=m_demo&query=how%20much%20money%20is%20left%3F&mode=auto"
```

## 8. The Superlinked demo story

Two queries, side by side, against the same seeded transcript:

| Query | `mode=keyword` | `mode=superlinked` |
|---|---|---|
| `budget` | Finds the budget line (literal match) | Also finds the budget line — both work |
| `how much money is left?` | Misses — the words "left" and "money" aren't in the transcript | Surfaces *"Our total budget is 5000 pounds…"* anyway, ranked top after rerank |

That second query is the wedge: it proves Rahid has **semantic recall**, not just keyword search. The rerank step pushes the budget line above near-misses about hosting costs or "three and a half thousand left to play with" so the answer Rahid gives is grounded in the most relevant chunk.

## 9. Fallback behaviour

| Situation | What P2 does |
|---|---|
| `SUPERLINKED_ENDPOINT` unset | Mock mode. `/ingest` and `/sources` still store data; `/retrieve?mode=superlinked` returns a clear 503 JSON error; `/retrieve?mode=auto` silently falls back to keyword. |
| Superlinked indexing call fails for one chunk | Logged as `superlinked indexing failed (non-fatal)`. `/ingest` still returns `ok: true` — live ingest must never block on remote calls. Row in `superlinked_index` has `status='error'` so you can replay. |
| SIE rerank returns an unexpected shape | We keep the semantic-search order rather than dropping the response. |
| Superlinked semantic search errors in `mode=auto` | Falls back to keyword inside the same request. The client sees `retrievalMode: "keyword"` and gets results anyway. |

## 10. Error responses

All errors are JSON:

```json
{ "ok": false, "error": "meetingId is required" }
```

- `400` — missing/invalid `meetingId`, `text`, `items`, or `query`.
- `503` — `mode=superlinked` requested but `SUPERLINKED_ENDPOINT` is not set.
- `500` — unexpected internal error (logged).

## 11. Performance notes

- Target: `/retrieve` under **500 ms**. Slow retrievals are logged with `slow retrieval`.
- Candidate pool before reranking: **20** chunks.
- Default `k`: **5** (max 50).
- `/ingest` writes to SQLite synchronously, then kicks Superlinked indexing into the background. P1 is never blocked by SIE latency.
