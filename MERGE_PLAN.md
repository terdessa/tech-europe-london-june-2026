# Flash — Integration & Merge Plan (multi-agent executable)

This document is written so **several coding agents can execute it in parallel**. It is divided into:

- **Phase 0 — Blocking prerequisites** (one agent, must finish before the parallel phase): assemble
  `main` from the branches, union the contracts, fix env/ports.
- **Phase 1 — Parallel workstreams** (4 independent agents, no shared files): P1 wiring, P2 backend,
  Face dashboard/history, Brain/integration verification.
- **Phase 2 — Integration & demo verification** (one agent, after Phase 1 joins).

Each workstream lists its **owned files** (disjoint — no two agents touch the same file) and the
**frozen contracts** it must honour, so the agents don't block each other.

---

## Goal (the demo this must deliver)

> Two people in a Google Meet → click **"Add Flash"** on the dashboard with the Meet link → Flash joins,
> listens, and **adds canvas nodes live** as they talk → someone says **"Hey Flash, make a diagram of
> that"** → a grounded diagram node appears on the canvas while Flash speaks the answer → Flash answers
> spoken questions using the live conversation as context → **meeting ends** → a summary is generated and
> the meeting appears in **dashboard history** with its transcript, diagram and full context, re-queryable
> via Superlinked.

**Hard rules (from CLAUDE.md):** ≥3 partners used correctly (Superlinked + n8n + SLNG, with Gemini);
grounded, never hallucinated (retrieve before generate); no secrets in repo (`.env` gitignored, ship
`.env.example`); immutable state; validate at boundaries.

---

## Branch topology (verified)

| Branch | Dir | Role | Merge action |
|---|---|---|---|
| `origin/p3` | `src/` + root | **P2 Retrieval + P3 Brain** — Express + SQLite + Superlinked SIE, **plus** `Flash-Agent.json` (n8n) | **MERGE** (superset of `p2-retrieval`) |
| `origin/p1-ears-and-mouth` | `agent/` | **P1 Ears/Mouth** — Playwright Meet bot, SLNG STT+TTS, wake-word, screen vision | MERGE |
| `origin/canvas` | `face/` | **P4 Face** — Next.js 16 + React Flow canvas + dashboard | MERGE |
| `origin/p2-retrieval` | `src/` | subset of `p3` | **SKIP** |

Facts that make this low-risk: code lives in **disjoint dirs** (`agent/`, `src/`, `face/`); the only
collisions are shared root files; `face` is self-contained (does **not** import `shared/contracts.ts`);
the n8n workflow already exposes **5 webhooks** (`/agent`, `/events`, `/ask`, `/finalize`, `/vision`).
`archangel-ai*/` are untracked older React-Flow prototypes — leave untracked.

---

## Frozen cross-service contracts (every agent honours these)

| Call | From → To | Shape |
|---|---|---|
| `POST /ingest` | P1 → P2 | `{meetingId, speaker?, ts?, text, source?}` |
| `GET /retrieve?meetingId&query&k&mode=auto` | n8n/face → P2 | `{chunks:[{speaker,ts,text,source,score}], retrievalMode, latencyMs}` |
| `GET /transcript?meetingId` | n8n/face → P2 | `{utterances:[{speaker,ts,text}]}` |
| `POST /sources` | face → P2 | `{meetingId, items:[{type:"doc"\|"link"\|"image"\|"canvas", ...}]}` |
| `GET /meetings` | face → P2 | **NEW** `{meetings:[{meetingId,lastTs,utteranceCount}]}` |
| `POST /agent` | P1/face → n8n | req `{meetingId, requestText}` → res `{type:"answer"\|"diagram", text?, diagramCode?, sources?}` |
| `POST /finalize` | face → n8n | `{meetingId}` → `{summary, decisions[], actionItems[], diagrams[]}` |
| `POST /ask` | face → n8n | `{meetingId, question}` → `{answer, sources[]}` |
| `POST /join` | face → P1 | `{meetingId, meetUrl}` → `{status:"joining"\|"error"}` |
| `POST /api/canvas/:id/events` | P1/UI → face | `{kind:"utterance"\|"agent_response"\|"image"\|..., ...}` |

Ports: **P2 `:3000`**, **n8n `:5678`**, **P1 `:8001`**, **face `:3001`** (avoid the 3000 clash with P2).

---

## Phase 0 — Blocking prerequisites (single agent, do first)

**Owner:** Agent-0. Nothing in Phase 1 may start until this is committed.

### 0.1 Assemble `main`
```
git merge origin/p3                 # backend + n8n workflow + docs
git merge origin/p1-ears-and-mouth  # agent/ (+ contracts.ts conflict → 0.2)
git merge origin/canvas             # face/ (+ .gitignore union)
```
Resolve conflicts on shared root files only: `ARCHITECTURE.md`/`CLAUDE.md` → keep p3's (newest as-built);
`.gitignore` → **union** (include `face/.next`, `face/node_modules`, `data/`, `.env`); `.env.example` → **union** (0.3).

### 0.2 Union `shared/contracts.ts`
Base = p3's file (`IngestRequest/Response`, discriminated `SourceItem`, `RetrievedChunk`, `RetrievalMode`,
`ApiError`, `MeetingId`). **Append** the P1-only types `agent/src/*` imports, de-duping `MeetingId`:
`Utterance`, `AgentRequest`, `AgentResponse`, `JoinRequest`, `JoinResponse`, plus `VisionRequest/Response`,
`UIEvent`, `EventsResponse`, `AskRequest/Response`, `FinalizeResponse`, `export const WAKE_PHRASE`.
Gate: `cd agent && npm run typecheck` passes (P1 imports only `Utterance`, `AgentRequest`, `AgentResponse`,
`JoinRequest`, `JoinResponse`).

### 0.3 Env + ports (`.env.example`, gitignored `.env`)
Union all keys (P1 + P2/P3). Reconcile: `AGENT_PORT=8001` + `AGENT_URL=http://localhost:8001` (kill the
`:4000` mismatch in `face/.env.example`); add **`FACE_URL=http://localhost:3001`** (new, for P1 → face);
align `GEMINI_MODEL` to one **valid** id (e.g. `gemini-2.5-flash`) across `.env`, the n8n workflow default,
and P1's `config.ts`. Confirm `.env` stays ignored (Aikido).

**Commit:** `chore: assemble main — merge p3+p1+canvas, union contracts, reconcile env/ports`.

---

## Phase 1 — Parallel workstreams (4 agents, disjoint files)

### Workstream A — P1 wiring (Agent-A)
**Owns:** `agent/src/faceClient.ts` (new), `agent/src/pipeline.ts`, `agent/src/index.ts`, `agent/src/config.ts`.
1. `config.ts`: add `faceUrl: process.env.FACE_URL ?? ""`.
2. New `faceClient.ts`: `postCanvasEvent(meetingId, event)` → `POST ${FACE_URL}/api/canvas/:id/events`,
   non-fatal on error (mirror `contextClient.ts` try/catch).
3. `pipeline.ts::handleUtterance`: after `await ingest(u)`, also post `{kind:"utterance", speaker, text, ts, source}`
   (passive — no answer). When wake fires, capture the **full** `AgentResponse` from `triggerAgent` and post
   `{kind:"agent_response", type, text, diagramCode, sources}` after speaking.
4. `index.ts::startRealMeet`: on screen-description ingest, also post `{kind:"image", title:"Screen", caption:desc, ts}`.
**Done when:** `cd agent && npm run typecheck` passes; in `MEET_MODE=mock`, replayed utterances POST to both P2 and face.

### Workstream B — P2 backend: meetings + persistence (Agent-B)
**Owns:** `src/routes/meetings.ts` (new), `src/db.ts`, `src/server.ts`.
1. `db.ts`: add `listMeetings()` → distinct `meetingId` with `lastTs`, `utteranceCount` from `utterances`.
2. New `meetings.ts`: `GET /meetings` → `{meetings:[...]}`. Validate at boundary; JSON error envelope.
3. `server.ts`: wire the route. **Additive** — breaks no frozen contract.
**Done when:** `npm run typecheck` passes; `curl localhost:3000/meetings` lists seeded `m_demo`.

### Workstream C — Face: dashboard, history, end-meeting (Agent-C)
**Owns:** `face/src/lib/agentClient.ts` (new), `face/src/app/api/agent/join/route.ts` (new),
`face/src/app/api/meetings/route.ts` (new), `face/src/app/page.tsx`,
`face/src/components/CanvasToolbar.tsx`, `face/src/lib/canvasStore.ts`.
1. `agentClient.ts`: `joinMeeting(meetingId, meetUrl)` → `POST ${AGENT_URL}/join`, graceful degrade.
2. `api/agent/join/route.ts`: server proxy (keeps `AGENT_URL` server-side).
3. `page.tsx`: **"Add Flash to meeting"** button → POST join → "joining…" → route to `/m/:id`. Add a
   **"Recent meetings"** list fed by `api/meetings`.
4. `api/meetings/route.ts`: merge persisted canvas files + P2 `GET /meetings`, de-dupe by `meetingId`.
5. `canvasStore.ts`: debounced disk persistence to `face/data/canvases/:id.json` on `bump()`; hydrate on
   `getCanvas`/`ensureCanvas` miss. Keep the immutable-copy model.
6. `CanvasToolbar.tsx`: **"End meeting"** button → `POST /api/canvas/:id/summarize` then `/sync-memory`
   (both already exist in `flashActions.ts`).
**Reuse unchanged:** `eventIngest.ts`, `flashActions.ts`, `p2Client.ts`, `p3Client.ts`, `DiagramPreview.tsx`.
**Done when:** `cd face && npm run typecheck` passes; dashboard joins + lists meetings; End meeting builds summary nodes.

### Workstream D — Brain & integration correctness (Agent-D)
**Owns:** verification + `README.md` (new), `Flash-Agent.json` env touch-ups only (no code-file overlap).
1. Import workflow (`npm run n8n:import`), confirm all 5 webhooks live; `npm run validate:workflow`.
2. Confirm n8n reads `CONTEXT_SERVICE_URL` + `GEMINI_API_KEY`/`GEMINI_MODEL` via `.env.local`
   (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`). Smoke `/agent` returns Mermaid grounded in `/retrieve`.
3. Superlinked: every `/retrieve` uses `mode=auto` (semantic + rerank, keyword fallback). Verify
   `sync-memory` indexes `type:"canvas"` so post-meeting `/ask` retrieves `source:"canvas"` chunks.
4. SLNG: `VOICE=slng` + `SLNG_API_KEY` so Flash hears (STT) and speaks into the Meet (TTS → injected mic);
   keep the echo-guard in `index.ts`.
5. Write `README.md` with the run order (below).
**Done when:** all three partner integrations demonstrably fire on the demo path.

---

## Phase 2 — Integration & demo verification (single agent)

Run order (4 terminals, repo root unless noted):
1. **P2:** `npm install && npm run seed:retrieval && npm run dev` (`:3000`).
2. **n8n:** `npm run n8n:import && npm run n8n` (`:5678`).
3. **face:** `cd face && npm install && cp .env.example .env.local && npm run dev -- -p 3001` (`:3001`).
4. **P1:** `cd agent && npm install && npx playwright install chromium && npm run dev` (`:8001`).

**Demo dry-run:** dashboard → enter Meet ID + link → **Add Flash** → talk (utterance nodes appear live) →
"Hey Flash, make a diagram of that" (Flash speaks + diagram node appears) → ask a question (grounded
answer) → **End meeting** (summary/decision/action nodes; appears in history) → reopen meeting (graph +
transcript restored, `/ask` grounded).

**Gates:** `npm run typecheck` (root) · `cd agent && npm run typecheck` · `cd face && npm run typecheck` ·
Aikido scan clean (only `.env.example`, no secrets).

---

## Risk register

| Risk | Mitigation |
|---|---|
| Contracts union breaks agent typecheck | P1 imports only 5 types; verify in Phase 0.2 immediately |
| Port clash (Next + P2 on 3000) | Force face `:3001`; align `AGENT_URL`/`AGENT_PORT` to 8001 |
| n8n can't read env in nodes | Use `npm run n8n*` scripts (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, `dotenv -e .env.local`) |
| Superlinked cluster cold / no key | `mode=auto` keyword fallback; set `SUPERLINKED_API_KEY` before demo |
| Live Meet join flaky (Playwright/Google auth) | `MEET_MODE=mock` fallback; reuse `MEET_USER_DATA_DIR` signed-in profile |
| In-memory canvas lost on restart → no history | Workstream C disk persistence + P2 `/meetings` |
