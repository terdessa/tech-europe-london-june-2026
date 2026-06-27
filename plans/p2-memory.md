# P2 — Memory (Superlinked)

> Read [`CLAUDE.md`](../CLAUDE.md) + [`ARCHITECTURE.md`](../ARCHITECTURE.md) first.
> **Your partner:** **Superlinked** (qualifying #2 + $500 side challenge). Make it *central*, not a vector dump.

## Your mission

You are Rahid's **memory.** You ingest the prep docs before the meeting and every spoken utterance during it, index them semantically, and answer **"what's relevant to this query?"** — for both the live Brain and the post-meeting Q&A. Good retrieval = grounded answers = we win the Superlinked prize.

## What you own
- A small **Context service** (HTTP API) backed by **Superlinked**.
- Ingestion: prep docs/links + live utterances.
- Retrieval: semantic search scoped by `meetingId`.
- Full transcript dump.

## Contracts you serve (from ARCHITECTURE §3)
- `POST /ingest` (§3.1) — one utterance.
- `POST /sources` (§3.2) — prep docs/links.
- `GET /retrieve` (§3.3) — ranked chunks for a query. **This is the money endpoint.**
- `GET /transcript` (§3.4) — everything, ordered.

## Phase 0 — Setup (joint, 30 min)
1. Get the Superlinked **API key + cluster endpoint** from `@filipmakraduli` at the opening. (Blocking — do it first.)
2. Help freeze §3. Confirm chunk shape `{ speaker, ts, text, source, score }`.
3. Decide chunking: one utterance = one record (simple, good enough); docs split into ~200-token chunks.

## Phase 1 — Standalone service against a sample (no others needed)
1. Build the HTTP service (Node/TS or Python — your choice).
2. Load `sample-transcript.json` (commit one with ~20 lines incl. the budget example).
3. Implement `GET /retrieve` over it. **Start with a dumb baseline** (substring/keyword) so the API works, then swap in Superlinked.

**Done when:** `GET /retrieve?query=budget` returns the budget lines, API shape matches §3.3.

## Phase 2 — Superlinked index ⭐
1. Define the schema: `text` (TextSimilaritySpace), plus `speaker`, `ts`, `source`, `meetingId` (filter/weight).
2. Ingest path: `/ingest` and `/sources` write into the index.
3. `/retrieve`: semantic query, filtered by `meetingId`, top-k, return scored chunks.
4. **Make it semantic, not keyword:** prove a query like *"how much money is left?"* surfaces *"we have 5000… spent 500… 1000…"* even without the word "left."
5. **Reuse first:** Superlinked SIE quickstart + TS/Python client examples.

**Done when:** semantic retrieval beats your keyword baseline on a paraphrased query.

## Phase 3 — Live ingest at speed
1. Handle a stream of `/ingest` calls during a meeting (P1 fires one per utterance).
2. Keep retrieval fast enough for the live loop (<~500ms ideal).
3. `GET /transcript` returns the full ordered list (for P3's post-meeting summary).

**Done when:** while P1 streams utterances, `/retrieve` reflects them within a second.

## Phase 4 — Integration
1. P1 → your `/ingest` (live) + P4 → your `/sources` (prep).
2. P3 → your `/retrieve` (live grounding) + `/transcript` (post-meeting).

## Fallback
If Superlinked access/latency is a problem: keep the **same API**, back it temporarily with embeddings-in-memory or "stuff transcript into Gemini." We lose the $500 but the product still works. Swap back when Superlinked is up — nobody else changes code (they only see your API).

## Checklist
- [ ] Superlinked key obtained at opening
- [ ] HTTP service with /ingest, /sources, /retrieve, /transcript
- [ ] Superlinked semantic index live (beats keyword baseline)
- [ ] Fast enough for live loop
- [ ] `sample-transcript.json` committed for everyone's mocks

## Risks you own
| Risk | Mitigation |
|---|---|
| Superlinked key/endpoint delay | Keyword baseline keeps API alive; swap in later |
| Latency in live loop | Cap k, cache, keep records small |
| Retrieval not obviously "semantic" | Demo a paraphrased query that keyword would miss |
