# P2 — Retrieval & Context (Superlinked)

> Read [`CLAUDE.md`](../CLAUDE.md) + [`ARCHITECTURE.md`](../ARCHITECTURE.md) first.
> **Your partner:** **Superlinked** (qualifying #2 + $500 side challenge). Make it *central*, not a vector dump.

## What Superlinked actually is (read this — it changes your design)

Superlinked is an **open-source inference engine for AI agents** — *not* a database or a "memory store." It provides: **embeddings, semantic search, reranking, document parsing/OCR**, structured output. So in our system:

- **You own a plain store** (in-memory / SQLite / JSON file) that holds the raw utterances + prep docs.
- **Superlinked is the semantic layer on top** — it embeds, searches, reranks, and parses. That's where the partner value (and the prize) lives.

> At the opening, confirm with `@filipmakraduli` which interface you're using: the **SIE inference endpoints** (embed / search / rerank / parse) vs. the older `superlinked` framework (schema→Space→Index→Query). Either way, you hide it behind your `/retrieve` API so nobody else cares.

## Your mission

Give Rahid **recall.** Ingest prep docs before the meeting and every utterance during it; make them semantically searchable; answer **"what's relevant to this query?"** for the live Brain and the post-meeting Q&A. Good retrieval = grounded answers = we win the Superlinked prize.

## What you own
- A small **Retrieval & Context service** (HTTP API) = plain store **+ Superlinked** for the semantic work.
- Ingestion: prep docs/links (use Superlinked **doc parsing** for PDFs) + live utterances.
- Retrieval: embed query → **semantic search** → **rerank** → top-k, scoped by `meetingId`.
- Full transcript dump.

## Contracts you serve (from ARCHITECTURE §3)
- `POST /ingest` (§3.1) — one utterance → store + embed.
- `POST /sources` (§3.2) — prep docs/links → parse (Superlinked) + embed.
- `GET /retrieve` (§3.3) — ranked chunks for a query. **This is the money endpoint.**
- `GET /transcript` (§3.4) — everything, ordered.

## Phase 0 — Setup (joint, 30 min)
1. Get the Superlinked **API key + cluster endpoint** from `@filipmakraduli` at the opening, and confirm SIE-vs-framework. (Blocking — do it first.)
2. Help freeze §3. Confirm chunk shape `{ speaker, ts, text, source, score }`.
3. Decide granularity: one utterance = one record; docs split into ~200-token chunks (or let Superlinked's parser chunk them).

## Phase 1 — Standalone service against a sample (no others needed)
1. Build the HTTP service + a **persistent store — use SQLite**: one table `utterances(meetingId, speaker, ts, text)` (+ a `sources` table). This table **is the full conversation record** (survives restarts); Superlinked only indexes it for search. `GET /transcript` = `SELECT * WHERE meetingId ORDER BY ts`. (Node/TS or Python.)
2. Load `sample-transcript.json` (commit one with ~20 lines incl. the budget example).
3. Implement `GET /retrieve` with a **dumb keyword baseline** first so the API works end-to-end.

**Done when:** `GET /retrieve?query=budget` returns the budget lines in the §3.3 shape.

## Phase 2 — Superlinked semantic layer ⭐
1. Wire embeddings + **semantic search** via Superlinked over your stored records, filtered by `meetingId`.
2. Add **reranking** on the top candidates (this is a strong, visible "best use of Superlinked" feature).
3. For `/sources`, run PDFs/images through Superlinked **doc parsing/OCR** before embedding.
4. **Prove it's semantic:** a query like *"how much money is left?"* must surface *"we have 5000… spent 500… 1000…"* even without the word "left."
5. **Reuse first:** SIE quickstart + TS/Python client examples.

**Done when:** semantic + reranked retrieval clearly beats your keyword baseline on a paraphrased query.

## Phase 3 — Live ingest at speed
1. Handle a stream of `/ingest` during a meeting (P1 fires one per utterance).
2. Keep `/retrieve` fast for the live loop (<~500ms ideal).
3. `GET /transcript` returns the full ordered list (for P3's post-meeting summary).

**Done when:** while P1 streams utterances, `/retrieve` reflects them within ~1s.

## Phase 4 — Integration
1. P1 → `/ingest` (live); P4 → `/sources` (prep).
2. P3 → `/retrieve` (live grounding) + `/transcript` (post-meeting).

## Fallback
If Superlinked access/latency is a problem: keep the **same API**, back `/retrieve` temporarily with an in-memory embedding lib or keyword search. We lose the $500 but the product still works — and nobody else changes code (they only see your API). Swap Superlinked back in when it's up.

## Checklist
- [ ] Superlinked key + interface confirmed at opening
- [ ] HTTP service: /ingest, /sources, /retrieve, /transcript (over a plain store)
- [ ] Superlinked semantic search **+ reranking** (beats keyword baseline)
- [ ] Doc parsing/OCR for prep PDFs via Superlinked
- [ ] Fast enough for the live loop
- [ ] `sample-transcript.json` committed for everyone's mocks

## Risks you own
| Risk | Mitigation |
|---|---|
| Superlinked key/interface delay | Keyword baseline keeps API alive; swap in later |
| Latency in live loop | Cap k, cache, small records, rerank only top candidates |
| Retrieval not obviously "semantic" | Demo a paraphrased query keyword would miss + show reranking |
