# P3 — Brain (n8n + Gemini)

> Read [`CLAUDE.md`](../CLAUDE.md) + [`ARCHITECTURE.md`](../ARCHITECTURE.md) first.
> **Your partners:** **n8n** (qualifying #3 + Cloud Pro + $500) **and Gemini** (qualifying #1). Two prizes ride on you — make n8n *technically meaty*, not a single webhook.

## Your mission

You are Rahid's **brain.** You take a request (live or post-meeting), pull the relevant context from Memory, reason with Gemini, and return either a spoken **answer** or a **diagram** (as Mermaid code). After the meeting, you run the pipeline that turns the whole transcript into a summary, decisions, action items, and artifacts.

## What you own
- **n8n workflows:** the live `/agent` flow + the post-meeting `/finalize` + `/ask`.
- **Gemini integration:** reasoning, answer generation, **diagram-as-code** generation.
- The **events feed** the UI polls (`/events`).
- Triggering the **Aikido** scan from the post-meeting pipeline (with P4).

## Contracts you serve/call (from ARCHITECTURE §3)
- Serve: `POST /agent` (§3.5), `GET /events` (§3.6), `POST /finalize` + `POST /ask` (§3.7).
- Call: P2 `GET /retrieve` (§3.3) + `GET /transcript` (§3.4).

## Phase 0 — Setup (joint, 30 min)
1. Stand up n8n (Docker self-host is fastest; Cloud Pro also fine for the prize).
2. Get `GEMINI_API_KEY`; **confirm SDK + model on-site** via DeepMind temp accounts. Wrap Gemini behind one helper so the model is swappable.
3. Help freeze §3. Confirm the agent response shape `{ type, text?, diagramCode?, sources }`.

## Phase 1 — Gemini helpers (CLI, no others needed)
1. `answer(question, contextChunks) -> { text, sources }` — grounded answer; instruct Gemini to only use provided context and cite it.
2. `makeDiagram(request, contextChunks) -> { text, mermaidCode }` — output **valid Mermaid** (give it 2–3 few-shot examples; validate it parses).
3. Test from a CLI with mock chunks (incl. the budget example) → confirm a clean Mermaid `flowchart`.

**Done when:** CLI turns "make a diagram of our budget" + mock context into valid Mermaid.

## Phase 2 — The live agent workflow (n8n) ⭐
Build the `/agent` webhook workflow with **real branching** (this is what wins the n8n prize):
1. **Webhook** receives `{ meetingId, requestText }`.
2. **HTTP node** → P2 `/retrieve` for context.
3. **Classify** (Gemini or a rule): is this a *diagram* request or a *question*? → **branch.**
4. Branch A → `makeDiagram`; Branch B → `answer`.
5. (Optional) if context is thin / external topic → **Tavily** node for a live web lookup (bonus partner).
6. **Respond** to the webhook with the §3.5 shape **and** push an event to `/events` (so P4's UI updates).

**Done when:** POSTing to `/agent` returns the right branch's result and an event appears in `/events`.

## Phase 3 — Post-meeting pipeline (n8n)
1. `POST /finalize` → pull `GET /transcript` → Gemini produces **summary + decisions + action items** → also regenerate key diagrams → return them + store.
2. `POST /ask` → `/retrieve` over full context → grounded `answer`. (This powers P4's pop-up Q&A.)
3. **Deliver** step: write the summary/artifacts somewhere (file, or a channel) — branching by content type.
4. **Trigger Aikido** scan node at the end (coordinate with P4).

**Done when:** `/finalize` returns a full summary package; `/ask` answers grounded follow-ups.

## Phase 4 — Integration & latency
1. Point `/retrieve`/`/transcript` at P2's real service.
2. P1 calls your `/agent`; P4 polls `/events` + calls `/ask` + `/finalize`.
3. If the live `/agent` round-trip is too slow, move just the *live* path into a thin code service and keep n8n for post-meeting (architecture §9). Try n8n-central first.

## Checklist
- [ ] n8n running; Gemini helper (swappable model)
- [ ] `answer()` grounded + cites sources
- [ ] `makeDiagram()` emits valid Mermaid
- [ ] `/agent` workflow with diagram/question **branch** (+ optional Tavily)
- [ ] `/events` feed for the UI
- [ ] `/finalize` (summary/decisions/actions) + `/ask` (grounded Q&A)
- [ ] Aikido trigger wired

## Risks you own
| Risk | Mitigation |
|---|---|
| Gemini SDK/model uncertainty | One swappable helper; confirm at opening |
| Invalid Mermaid from the model | Few-shot + parse-validate + one retry |
| n8n live latency | Keep workflow lean; fallback code path for live |
| n8n looks trivial to judge | Real branching + Tavily branch + multi-step post-meeting |
