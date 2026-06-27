# CLAUDE.md — agent/ (P1: Ears & Mouth)

Scoped context for work in this folder. Also read the root [`../CLAUDE.md`](../CLAUDE.md), [`../ARCHITECTURE.md`](../ARCHITECTURE.md), and your plan [`../plans/p1-ears-and-mouth.md`](../plans/p1-ears-and-mouth.md).

## You are building P1 — Flash's ears and mouth
The **Google Meet bot**: joins a Meet by link, hears everyone (speaker-attributed transcript), detects **"Hey Flash"**, and **speaks answers back into the call** via SLNG. Voice + chat happen *in the meeting*; all visuals live on the web workspace (P4).

## Decide first (hour 1) — how the bot joins Meet
Pick the fastest that works (details in the plan):
- **A. Managed bot API** (Recall.ai / MeetingBaaS) — try first, most reliable.
- **B. Meet Media API** — ask the Google/DeepMind people on-site to unblock access.
- **C. Headless browser bot** (Playwright) — DIY backup; use Meet captions for speaker labels.
- 🛟 **Keep a LiveKit-room fallback** so the demo never depends on Meet auth.

## Contracts you must honor ([`../shared/contracts.ts`](../shared/contracts.ts))
- **Serve** `POST /join` → `JoinRequest` → `JoinResponse`.
- **Emit** each line → `POST {CONTEXT_SERVICE_URL}/ingest` → `Utterance`.
- **Call** `POST {N8N_WEBHOOK_BASE}/agent` → `AgentRequest` → `AgentResponse`; speak `response.text` via SLNG TTS. (Diagrams render on the web workspace — you don't render them.)
- Wake phrase: `WAKE_PHRASE` from contracts.

## Build against mocks (don't wait on other tracks)
- Fake utterances + a fake wake event from a console.
- Point `/ingest` and `/agent` at local stubs (return canned `AgentResponse`).
- Use [`../data/sample-transcript.json`](../data/sample-transcript.json) for shapes.

## Conventions
- Env vars only (see [`../.env.example`](../.env.example)); never commit `.env`.
- Small files, explicit error handling, validate payloads at the boundary.
- Language is your choice (Node/TS or Python) — you only talk HTTP/JSON to the others.

## First milestone
Two people talk in a real Meet (or the fallback room) → you print correctly-attributed transcript lines to the console. Then wire `/ingest`, then wake-word + TTS, then `/agent`.
