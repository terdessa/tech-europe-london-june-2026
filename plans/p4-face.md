# P4 — Face (Web app + Diagrams + Post-meeting + Aikido)

> Read [`CLAUDE.md`](../CLAUDE.md) + [`ARCHITECTURE.md`](../ARCHITECTURE.md) first.
> **Your partner touchpoint:** **Aikido** (bonus €1000 + security story). You own everything the user *sees*.

## Your mission

You are Rahid's **face.** The meeting itself is where the live action happens (Rahid talks + posts a diagram link in the Meet chat), so your web app is intentionally small — **one React app, three states**:
1. **Launcher (`/`)** — paste the **Google Meet link** + upload prep docs → "Send Rahid."
2. **Workspace (`/m/:meetingId`)** — *during:* optional companion that polls `/events` and shows diagrams/answers (also the page the in-chat diagram link opens). *After:* same page flips to summary + Q&A.
3. (Diagrams render inside the workspace; no separate dashboard.)

You also render diagrams (editable) and run the Aikido scan.

## What you own
- React + Vite + TS app.
- **Pre-meeting:** upload docs/links → P2 `/sources`.
- **Live view:** poll P3 `/events` → show answer cards + rendered diagrams.
- **Diagram render:** Mermaid → image, with an **editable code box** ("edit on the go").
- **Post-meeting app:** call P3 `/finalize` (summary) + `/ask` (Q&A).
- **Aikido:** connect repo, run scan, capture screenshot (with P5).

## Contracts you call (from ARCHITECTURE §3)
- `POST {CONTEXT_SERVICE_URL}/sources` (§3.2)
- `GET {N8N_WEBHOOK_BASE}/events` (§3.6)
- `POST {N8N_WEBHOOK_BASE}/finalize` + `/ask` (§3.7)

## Phase 0 — Setup (joint, 30 min)
1. Scaffold Vite + React + TS. Add `mermaid`.
2. Help freeze §3. Confirm the `/events` + `/finalize` + `/ask` shapes give you what to render.
3. Commit `sample-events.json` + a sample Mermaid string for mocking.

## Phase 1 — Diagram rendering (no others needed)
1. Component: takes a Mermaid string → renders the diagram.
2. Add an **editable textarea** showing the code; re-render on edit. (This is "draw + edit live.")
3. Test with the budget Mermaid sample.

**Done when:** the budget diagram renders and updates as you edit the code.

## Phase 2 — Workspace page (against mock events)
1. Route `/m/:meetingId`. Poll `/events?meetingId=` (use `sample-events.json` first).
2. Render a feed of **cards**: answers (text + sources) and diagrams (rendered). This is also what the in-Meet-chat link opens.
3. Keep it clean — it's a light companion during the call, and becomes the workspace after.

**Done when:** mock events show as nice cards/diagrams on `/m/:meetingId`.

## Phase 3 — Launcher (pre-meeting)
1. Generate a `meetingId`. Form: **paste the Google Meet link** + paste text / add links / (optional) upload a file → `POST /sources` (§3.2).
2. **"Send Rahid"** → `POST {AGENT_URL}/join { meetingId, meetUrl }` (§3.8) to dispatch the bot.
3. Show "context loaded: N sources" + "Rahid is joining…" then link to `/m/:meetingId`.

**Done when:** pasting a Meet link + prep dispatches the bot and grounds Rahid's later answers (verify with P1/P2/P3).

## Phase 4 — Post-meeting app (the second "use" of the context)
1. "Meeting ended" → call `/finalize` → show **summary + decisions + action items + diagrams**.
2. A chat box → `/ask` → grounded answer + sources. (Optional: speak answers via SLNG with P1.)

**Done when:** after a meeting you can read the summary and ask follow-ups that cite the discussion.

## Phase 5 — Integration + Aikido
1. Swap mocks for real P2/P3 endpoints.
2. **Aikido:** create free account → connect the GitHub repo → run scan → screenshot the report (hand to P5). Ensure no secrets committed (env vars only) — this is our **security story**.

## Checklist
- [ ] Mermaid render + editable code box
- [ ] Live event feed (cards + diagrams)
- [ ] Pre-meeting upload → /sources
- [ ] Post-meeting summary (/finalize) + Q&A (/ask)
- [ ] Wired to real services
- [ ] Aikido scan + screenshot; repo clean of secrets

## Risks you own
| Risk | Mitigation |
|---|---|
| Mermaid parse errors from model | Show a friendly error + the raw code; P3 validates upstream |
| Polling feels laggy | Short poll interval; upgrade to WS only if time |
| Aikido findings (secrets) | Audit before scan; env vars only; `.gitignore` `.env` |
