# P1 — Ears & Mouth (LiveKit + SLNG)

> Read [`CLAUDE.md`](../CLAUDE.md) + [`ARCHITECTURE.md`](../ARCHITECTURE.md) first.
> **Your partner:** **SLNG** (qualifying #4 + LEGO side challenge). LiveKit is infra.

## Your mission

You are Rahid's **ears and mouth.** You join the meeting, hear everything, turn it into text for the Memory service, detect when someone says **"Hey Rahid,"** and **speak the Brain's answers back into the call.** You never interrupt unless called.

You own the riskiest piece (live audio), so you build it in layers and always keep a fallback that doesn't need a real Google Meet.

## What you own
- The **agent runtime** that joins a LiveKit room as a participant.
- **SLNG STT:** audio → utterance text (with a speaker label + timestamp).
- **Wake-word detection:** `hey rahid` (case-insensitive, fuzzy).
- **SLNG TTS:** speak the Brain's `text` response back into the call.
- POSTing utterances to P2; POSTing requests to P3; playing responses.

## Contracts you touch (from ARCHITECTURE §3)
- **Emit** utterances → `POST {CONTEXT_SERVICE_URL}/ingest` (§3.1).
- **Send** requests → `POST {N8N_WEBHOOK_BASE}/agent` (§3.5) → speak `response.text` via TTS.

## Phase 0 — Setup (joint, 30 min)
1. Help freeze the §3 contracts. Confirm the `/ingest` and `/agent` shapes work for you.
2. Get LiveKit creds (`LIVEKIT_URL/KEY/SECRET`) and an SLNG key into `.env`.
3. Pick language: LiveKit **Agents (Python)** is the most documented path; Node SDK also fine. Either works — you only talk HTTP/JSON to the others.

## Phase 1 — Audio in, transcript out (no others needed)
1. Stand up a LiveKit room; join it from a second browser tab (you = test speaker).
2. Connect your agent as a participant; **subscribe to each remote participant's audio track _separately_.**
3. Run **SLNG STT per track**. Produce `{ speaker, ts, text }` where **`speaker` = that track's participant identity/name** (see "Speaker attribution" below).
4. Print utterances to console. **Don't POST yet** — just prove transcription.
5. **Reuse first:** start from the LiveKit Agents starter + SLNG STT example; port, don't hand-roll.

**Done when:** two people talk from two tabs and you see correctly-attributed lines ("Alice: …", "Bob: …") in your console.

## Speaker attribution (no diarization needed — read this)
We do **not** do voiceprint/biometric recognition or diarization. Each participant in LiveKit publishes **their own audio track tagged with their identity**, so:
- one STT stream **per track** → label every utterance with that participant's name.
- **crosstalk is handled for free** (separate streams), and we get accurate who-said-what.
- Google Meet's Media API exposes per-participant streams the same way; our own LiveKit room (the fallback) is native.
- ⚠️ The only setup that would need diarization is **everyone on one shared mic** — so for the demo, **each person joins from their own device/tab.**

## Phase 2 — Wake-word + request capture
1. On each transcript line, check for the wake phrase (`hey rahid`). Use a fuzzy match (STT will mishear).
2. After the wake phrase, collect words until ~1.5s of silence → that's `requestText`.
3. Log `{ mode: 'active', requestText }`.

**Done when:** saying "Hey Rahid, make a diagram of the budget" reliably yields the right `requestText`.

## Phase 3 — Mouth (SLNG TTS)
1. Take a string → **SLNG TTS** → publish the audio into the LiveKit room as Rahid's track.
2. Test with a hard-coded sentence ("Hey, can I help?").

**Done when:** Rahid speaks into the call and the other participant hears it.

## Phase 4 — Wire to the others
1. **Passive:** POST every utterance to `{CONTEXT_SERVICE_URL}/ingest` (P2). (Use P2's mock or real service.)
2. **Active:** on a wake request, POST to `{N8N_WEBHOOK_BASE}/agent` (P3) → take `response.text` → TTS it. (P3 handles the diagram → UI.)
3. Add a friendly "thinking" cue ("One sec…") so the 1–2s feels natural.

**Done when:** end-to-end — you speak, P2 stores it; you call Rahid, it answers out loud.

## Phase 5 — Hardening for demo
- Tune wake-word sensitivity (no false triggers during normal talk).
- Mic/echo test in the actual demo room.
- Graceful errors: if `/agent` fails, Rahid says "Sorry, I didn't catch that."

## Fallback (keep this alive!)
If joining **Google Meet** fights you, run the whole thing in a **LiveKit web room** we control (two humans + Rahid). The demo still works; we just don't say "Google Meet." Build against this first, add Meet last.

## Checklist
- [ ] Agent joins a LiveKit room + hears audio
- [ ] SLNG STT → accurate utterances
- [ ] Wake-word + requestText capture
- [ ] SLNG TTS speaks into the call
- [ ] POST /ingest (passive) + POST /agent (active) wired
- [ ] Demo-room mic test + fallback room ready

## Risks you own
| Risk | Mitigation |
|---|---|
| Meet/LiveKit auth | Own LiveKit room fallback; Meet last |
| STT mishears wake word | Fuzzy match + alternate phrase |
| Latency feels awkward | "One sec…" filler + keep responses short |
