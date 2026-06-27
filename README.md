# ⚡ Flash — your meeting's memory, as a living canvas

Flash joins your Google Meet as a third participant. It **listens passively** (and watches shared
screens), turning the conversation into a live graph on a web canvas. Say **"Hey Flash"** and it
wakes up, answers with voice, and draws diagrams **grounded** in the live discussion + prep docs.
When the meeting ends it writes the summary and files it into your dashboard history — one context,
reused live and after.

Built with **Superlinked** (semantic retrieval), **n8n + Gemini** (the brain), and **SLNG** (voice).

## Architecture

```
Dashboard (Face) ──"Add Flash"──▶ P1 /join ──Playwright──▶ Google Meet
  P1 ears (SLNG STT) ─▶ POST /ingest ─▶ P2 (SQLite + Superlinked)   [memory]
                      └▶ POST /events ─▶ Face canvas                 [live nodes]
  "Hey Flash …" ─▶ P1 ─▶ n8n /agent ─GET /retrieve─▶ P2 ─Gemini─▶ {text, mermaid, sources}
                          ├─ SLNG TTS speaks it into the call
                          └─ Face renders the diagram node live
  End meeting ─▶ Face /summarize ─▶ n8n /finalize ─▶ summary/decisions/actions
              └▶ Face /sync-memory ─▶ P2 /sources (type:canvas) ─▶ Superlinked  [query the graph]
  Post-meeting Q&A ─▶ n8n /ask ─▶ P2 /retrieve (incl. source:canvas) ─Gemini─▶ grounded answer
```

Components: **P1** `agent/` (Meet bot), **P2** `src/` (retrieval service), **P3** `Flash-Agent.json`
(n8n workflow), **P4** `face/` (Next.js canvas). Contracts: `shared/contracts.ts` + `ARCHITECTURE.md`.

## Setup

```bash
cp .env.example .env          # fill GEMINI_API_KEY, SUPERLINKED_API_KEY, SLNG_API_KEY
npm install                   # P2 + n8n deps (repo root)
( cd agent && npm install && npx playwright install chromium )
( cd face  && npm install && cp .env.example .env.local )
```

## Run (4 terminals)

| # | Service | Command | Port |
|---|---------|---------|------|
| 1 | **P2** Retrieval | `npm run seed:retrieval && npm run dev` | 3000 |
| 2 | **P3** Brain (n8n) | `npm run n8n:import && npm run n8n:start` | 5678 |
| 3 | **P4** Face | `cd face && npm run dev -- -p 3001` | 3001 |
| 4 | **P1** Agent | `cd agent && npm start` | 8001 |

> After the first `n8n:import`, activate the workflow once so its production webhooks register:
> `N8N_USER_FOLDER=.n8n-local ./node_modules/.bin/n8n update:workflow --id=flash-agent-p3 --active=true`
> then restart n8n (terminal 2). All five webhooks then live at `http://localhost:5678/webhook/{agent,ask,finalize,events,vision}`.

## Smoke tests

```bash
curl "localhost:3000/retrieve?meetingId=m_demo&query=budget&k=3&mode=auto"   # superlinked-rerank
curl localhost:3000/meetings                                                  # history list
curl -XPOST localhost:5678/webhook/agent -H 'content-type: application/json' \
  -d '{"meetingId":"m_demo","requestText":"make a diagram of the budget"}'    # grounded mermaid
curl localhost:3001/api/meetings                                              # dashboard data
```

## Demo (the money shot)

1. Open **http://localhost:3001**, enter a Meeting ID + the Google Meet link, click **Add Flash**.
2. Two people talk; **utterance nodes appear live** on `/m/<id>` as they speak.
3. Say **"Hey Flash, make a diagram of the budget"** → Flash speaks the answer and a **diagram node**
   appears on the canvas, grounded in the conversation (cites speakers).
4. Ask **"Hey Flash, what did we decide?"** → grounded spoken answer.
5. Click **End meeting** → summary / decisions / action-item nodes; the meeting lands in the
   dashboard's **Recent meetings**. Reopen it later — the graph is restored and re-queryable.

## Notes
- Single root `.env` feeds P1, P2 and n8n; `face/.env.local` feeds the Next app. Secrets never commit.
- Grounded, not hallucinated: every live answer/diagram retrieves from Superlinked first and cites sources.
