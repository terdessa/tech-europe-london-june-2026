# Rahid — Architecture

> Read with [`CLAUDE.md`](./CLAUDE.md). This file is the **single source of truth for how the pieces fit and talk to each other.** Freeze the contracts below first; then everyone builds against mocks.

## 1. The big picture

```
PRE-MEETING
  Host uploads docs/links ──▶ [P2] Superlinked index (grounding sources)

LIVE MEETING  (Google Meet — Rahid bot joins via the pasted link; LiveKit-room fallback)
  Everyone's audio ──Meet bot──▶ [P1] Agent runtime
     │
     │ ── PASSIVE (always on, never interrupts) ──
     │      SLNG STT ──▶ utterance {speaker, ts, text}
     │                      └──POST /ingest──▶ [P2] Context store + Superlinked
     │
     │ ── ACTIVE ("Hey Rahid …") ──
            wake-word detected ──▶ capture requestText
              ──POST /agent──▶ [P3] n8n workflow
                                   ├─ GET /retrieve ──▶ [P2]
                                   ├─ Gemini reason / make diagram code
                                   └─ returns { type, text?, diagramCode?, sources }
              ◀── response ── [P1] speaks it (SLNG TTS) into the call
                           └── [P3] also pushes it to [P4] events feed (card + diagram)

POST-MEETING  (meeting ends)
  [P3] n8n pipeline: full transcript ──▶ summary + decisions + action items + diagrams
                                     ──▶ deliver + trigger Aikido scan
  [P4] Pop-up app Q&A: question ──POST /ask──▶ [P3] ──▶ /retrieve [P2] + Gemini ──▶ answer + sources
```

## 1b. Interaction surfaces (where each thing happens)

| Interaction | Surface |
|---|---|
| Rahid listening + **speaking** (voice, incl. "Hey Rahid, repeat") | **In the meeting** (SLNG STT/TTS) |
| Text chat | **In the meeting chat** |
| **Diagrams / graphs (all visuals)** | **On the web page** (workspace `/m/:meetingId`) |
| Live conversation/transcript, meeting history, actions + data, post-meeting Q&A | **On the web page** (one live screen, then the after-meeting workspace) |

## 2. Components & ownership

| ID | Component | Owner | Responsibility |
|---|---|---|---|
| P1 | **Agent runtime** | Ears & Mouth | Join the **Google Meet by link** (managed bot API / Meet Media API / headless; LiveKit-room fallback), capture speaker-attributed transcript, wake-word, **SLNG TTS** of responses back into the call + post diagram link in Meet chat |
| P2 | **Retrieval & Context service** | Retrieval | A **persistent store (SQLite)** of raw utterances/sources = the full conversation record, **+ Superlinked as the semantic layer** (embeddings, semantic search, reranking, doc parsing/OCR). HTTP API: ingest, retrieve, dump transcript. *Superlinked is the inference engine, not the database.* |
| P3 | **Brain (n8n + Gemini)** | Brain | n8n webhooks for the live agent flow + post-meeting pipeline; Gemini reasoning + diagram-code generation; events feed for the UI |
| P4 | **Web app** | Face | Pre-meeting upload, live pop-up card + diagram render (Mermaid), post-meeting Q&A app, Aikido |
| — | **Demo & story** | Demo & Story | Pitch, script, Loom, slides, README, submission |

Everything is correlated by a **`meetingId`** (a string created when a session starts). All services talk **HTTP/JSON**, so each track can use whatever language fits (Node/TS preferred; Python fine for P1's LiveKit agent).

## 3. Shared contracts (FREEZE THESE FIRST)

> These are **synthetic interface schemas**, not real data. Put the TypeScript types in `shared/contracts.ts`. Base URLs come from env vars: `CONTEXT_SERVICE_URL` (P2), `N8N_WEBHOOK_BASE` (P3).

### 3.1 Utterance — P1 ▶ P2
```http
POST {CONTEXT_SERVICE_URL}/ingest
```
```jsonc
{ "meetingId": "m_123", "speaker": "Alice", "ts": 1719500000, "text": "we have 5000 budget" }
```

### 3.2 Pre-meeting sources — P4 ▶ P2
```http
POST {CONTEXT_SERVICE_URL}/sources
```
```jsonc
{ "meetingId": "m_123",
  "items": [ { "type": "doc", "title": "Q3 plan", "content": "..." },
             { "type": "link", "title": "Spec", "url": "https://..." } ] }
```

### 3.3 Retrieve — P3 ▶ P2
```http
GET {CONTEXT_SERVICE_URL}/retrieve?meetingId=m_123&query=budget%20breakdown&k=8
```
```jsonc
{ "chunks": [ { "speaker": "Alice", "ts": 1719500000, "text": "we have 5000 budget",
                "source": "live", "score": 0.91 } ] }
```

### 3.4 Full transcript — P3/P4 ▶ P2
```http
GET {CONTEXT_SERVICE_URL}/transcript?meetingId=m_123
```
```jsonc
{ "utterances": [ { "speaker": "Alice", "ts": 1719500000, "text": "..." } ] }
```

### 3.5 Live agent request — P1 ▶ P3
```http
POST {N8N_WEBHOOK_BASE}/agent
```
```jsonc
// request
{ "meetingId": "m_123", "requestText": "make a diagram of our budget" }
// response
{ "type": "diagram",            // "answer" | "diagram"
  "text": "Here's the budget breakdown.",
  "diagramCode": "flowchart TD; Budget[5000] --> X[500]; Budget --> Y[1000]; Budget --> Left[3500]",
  "sources": ["live: Alice 12:01", "doc: Q3 plan"] }
```

### 3.6 UI events feed — P3 ▶ P4
```http
GET {N8N_WEBHOOK_BASE}/events?meetingId=m_123   // poll, or WS if time allows
```
```jsonc
{ "events": [ { "kind": "agent_response", "type": "diagram",
                "text": "...", "diagramCode": "...", "ts": 1719500050 } ] }
```

### 3.8 Dispatch the bot — P4 (launcher) ▶ P1
```http
POST {AGENT_URL}/join   { "meetingId": "m_123", "meetUrl": "https://meet.google.com/abc-defg-hij" }
// -> { "status": "joining" }
```

### 3.7 Post-meeting — P4 ▶ P3
```http
POST {N8N_WEBHOOK_BASE}/finalize   { "meetingId": "m_123" }
// -> { "summary": "...", "decisions": ["..."], "actionItems": ["..."], "diagrams": ["mermaid..."] }

POST {N8N_WEBHOOK_BASE}/ask        { "meetingId": "m_123", "question": "what should we cut?" }
// -> { "answer": "...", "sources": ["..."] }
```

## 4. Wake-word & modes (P1)

- **Passive:** every utterance is transcribed + POSTed to `/ingest`. Rahid is silent.
- **Active:** transcript line starts with the wake phrase (`hey rahid`, case-insensitive, fuzzy). Everything after it (until ~1.5s silence) = `requestText` → POST `/agent` → speak the `text` via TTS; diagram (if any) shows in the app.

## 4b. Speaker attribution & persistence

**Who said what — no diarization/voiceprint ML.** Depends on the join approach (see `plans/p1`):
- **Meet Media API / LiveKit room:** per-participant audio tracks → **SLNG STT per stream** → speaker = participant identity (cleanest).
- **Managed bot API / headless:** take the **speaker-labeled transcript from Meet live captions / the bot service**; **SLNG still does Rahid's TTS** (stays a real partner).

Crosstalk is handled either way. ⚠️ Everyone joins from **their own device** — a single shared mic is the only case that would need diarization, so avoid it.

**Keeping the whole conversation.** P2 appends every utterance to a **persistent SQLite table** (`meetingId, speaker, ts, text`). *That table is the source of truth* for the full transcript and survives restarts. Superlinked indexes the same utterances for semantic search but is **not** the store — never rely on the vector index to hold the raw text.

## 5. Diagrams (P3 generates code, P4 renders)

- Gemini outputs **Mermaid** code (text). Never image bytes.
- P4 renders with `mermaid` in the browser and shows the **raw code in an editable box** → user can tweak live ("edit on the go").
- This is how we get "draw a diagram" without building a live canvas.

## 6. Env vars (`.env.example`)

```
GEMINI_API_KEY=
SUPERLINKED_ENDPOINT=
SUPERLINKED_API_KEY=
SLNG_API_KEY=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
N8N_WEBHOOK_BASE=
CONTEXT_SERVICE_URL=
AGENT_URL=
# If using a managed Meet bot (Recall.ai / MeetingBaaS):
MEET_BOT_API_KEY=
```

## 7. Mock strategy (so nobody blocks)

- **P1** → fake utterances + a fake wake event typed in a console; point `/agent` at a local stub returning a canned response.
- **P2** → load `sample-transcript.json`; serve `/retrieve` from it.
- **P3** → run a CLI: canned `requestText` + mock `/retrieve` → Gemini → response; build n8n against mock payloads.
- **P4** → render against `sample-events.json` + a sample Mermaid string.

## 8. Integration order

1. Freeze §3 contracts → commit `shared/contracts.ts` + `sample-*.json`.
2. Build to mocks.
3. P1→P2 (live ingest) → P3 uses P2 `/retrieve` → P1↔P3 (request→response→TTS) → P4 events/diagram.
4. End-to-end **live** test.
5. Wire **post-meeting** (`/finalize`, `/ask`) + app.
6. Aikido scan + README + Loom.

## 9. Risk register

| Risk | Mitigation |
|---|---|
| LiveKit join / Meet auth fights us | Build core (diagram + post-meeting) first; fallback = Rahid in our own LiveKit web UI instead of Google Meet |
| Live voice latency (n8n in the path) | Acceptable ~1–2s; if too slow, move live path to P1 code, keep n8n for post-meeting |
| SLNG STT accuracy on crosstalk | Push-to-talk-ish wake word; pre-test mics; keep demo lines clear |
| Superlinked access/key | Get key from `@filipmakraduli` at opening; fallback = stuff context into Gemini behind same `/retrieve` |
| Secrets leaking (Aikido) | Env vars only; `.gitignore` `.env`; scan before submit |
