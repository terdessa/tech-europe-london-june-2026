# Flash — Face (P4)

The **API-managed meeting canvas** for Flash. A Next.js 16 App Router app that
renders the meeting as a live React Flow graph: speakers, utterances, prep docs,
questions, Flash answers, diagrams, decisions, and action items — all as
colour-coded workflow nodes wired by typed edges.

> Built against `ARCHITECTURE.md` §3 contracts and the `p4-plan.md` spec.
> Cross-referenced with `origin/p2-retrieval` (`shared/contracts.ts`,
> `INTEGRATION_P2.md`) and `origin/main` (Flash naming, screen-share source).

## Run

```bash
npm install
cp .env.example .env.local   # fill in CONTEXT_SERVICE_URL / N8N_WEBHOOK_BASE / AGENT_URL
npm run dev                  # http://localhost:3000  (use PORT=3100 if P2 owns :3000)
```

Open **`/m/demo`** — the canvas auto-seeds a realistic budget-planning meeting
graph. Or open `/` (launcher) to start any `meetingId`.

`npm run build` / `npm run typecheck` gate every change.

## How it behaves (the Flash rule)

- **Passive** events (`utterance`, `chat`, `document`, `link`, `image`) only ever
  create **memory / context** nodes. They never trigger a Flash answer.
- **Active** answers happen **only** from `manual_prompt` (UI "Ask Flash" / P1
  wake forward), `agent_response` (pushed by P3), or `/commands`.
- Diagrams render with Mermaid (P3 emits the code; we show it + an editable box,
  per `ARCHITECTURE.md` §5).

## Data flow

- **Poll:** the canvas polls `GET /api/canvas/[meetingId]` every 1000 ms.
- **P2 (Retrieval):** `query` → `GET /retrieve`; `summarize` → `GET /transcript`
  + `/retrieve`; `sync-memory` → `POST /sources` with `type: "canvas"` (the full
  serialized graph + a plain-text rendering for Superlinked).
- **P3 (Brain):** `manual_prompt` → `POST /agent`; `summarize` → `POST /finalize`.
- Every external call **degrades gracefully** — when P2/P3 are unconfigured the
  app falls back to local mocks so the canvas always works for a demo.

## API surface (`/api/canvas/[meetingId]`)

| Route | Method | Purpose |
|---|---|---|
| `/` | GET | full canvas (`{ ok, canvas }`) |
| `/nodes` | POST | add node (`nodeType` required) |
| `/nodes/[nodeId]` | PATCH / DELETE | update / delete node |
| `/edges` | POST | add edge |
| `/edges/[edgeId]` | DELETE | delete edge |
| `/events` | POST | ingest a `CanvasEvent` (passive + active) |
| `/commands` | POST | `add_node\|update_node\|delete_node\|move_node\|add_edge\|delete_edge\|query\|summarize` |
| `/query` | POST | P2 retrieve (+ optional `memory_chunk` nodes) |
| `/summarize` | POST | finalize → summary / decisions / action items |
| `/sync-memory` | POST | push the whole canvas to P2 as `type:"canvas"` |
| `/demo` | POST | seed a realistic demo graph |

## Layout

```
src/lib/        canvasTypes, canvasStore (immutable in-mem graph), eventIngest,
                commands, flashActions (P2/P3 orchestration), serialize,
                p2Client, p3Client, demoGraph, nodeStyles, layout, ids
src/app/api/    the route handlers above
src/app/m/      /m/[meetingId] canvas page
src/components/ FlashCanvas, CanvasNode, CanvasToolbar, SelectedNodePanel,
                DiagramPreview
```

No secrets in the repo — keys come from `.env.local` (gitignored).
