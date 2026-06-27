# CLAUDE.md — agent/ (P1: Ears & Mouth)

Scoped context for work in this folder. Also read the root [`../CLAUDE.md`](../CLAUDE.md), [`../ARCHITECTURE.md`](../ARCHITECTURE.md), and your plan [`../plans/p1-ears-and-mouth.md`](../plans/p1-ears-and-mouth.md).

## You are building P1 — Flash's ears and mouth
The **Google Meet bot**: joins a Meet by link, hears everyone (speaker-attributed transcript), detects **"Hey Flash"**, and **speaks answers back into the call** via SLNG. Voice + chat happen *in the meeting*; all visuals live on the web workspace (P4).

## ✅ How it works now (built & merged — Approach C, real voice)
- **Join:** ephemeral Chromium joins as a **separate guest "Flash"** (auto-fills name + clicks *Ask to join*; host admits). Auto-joins on startup when `MEET_URL` is set, else `POST /join`. *Not* the user's own account/profile.
- **Ears:** taps inbound WebRTC audio → 4s WebM windows → **SLNG STT `nova:3-en`** → transcript. **No captions.**
- **Mouth:** **SLNG TTS `aura-2-arcas-en` (male)** → injected as Flash's mic via patched `getUserMedia` (everyone hears it) + posted to chat.
- **Wake:** `hey flash`, punctuation-normalized. **Echo guard:** deaf while speaking + 1.2s cooldown.
- **Voice-only for now:** `SCREEN_CAPTURE=off`; no diarization (lines tagged `Participant`); no LiveKit fallback yet.

### Files
`meetBot.ts` (join + audio capture + mic inject), `sttClient.ts` (SLNG STT), `speaker.ts` (`synthesizeSlng` + speakers), `pipeline.ts` (wake/route), `index.ts` (server + auto-join + responder), `contextClient.ts`/`brainClient.ts`/`visionClient.ts` (P2/P3/vision with local-file + stub fallbacks).

### Run
Set `MEET_URL` in root `.env` → `npm run dev` → admit "Flash" → talk; say "Hey Flash, …". `npm run typecheck` before commits.

### Still open (later)
Screen/eyes (`SCREEN_CAPTURE=on` re-enables Gemini vision), diarization, LiveKit-room fallback, wiring `CONTEXT_SERVICE_URL` (P2) and `N8N_WEBHOOK_BASE` (P3) once those services exist.

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

## First milestone — ✅ done
Two people talk in a real Meet → transcript lines print to console (via SLNG STT); "Hey Flash" → spoken reply into the call (SLNG TTS) + chat. `/ingest` writes locally; `/agent` + vision are stubbed pending P3.
