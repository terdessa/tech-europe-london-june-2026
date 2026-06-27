# P1 — Ears & Mouth (Google Meet bot + SLNG)

> Read [`CLAUDE.md`](../CLAUDE.md) + [`ARCHITECTURE.md`](../ARCHITECTURE.md) first.
> **Your partner:** **SLNG** (qualifying #4 + LEGO side challenge — Rahid's voice). The meeting platform is **Google Meet** (infra).

## Your mission

You are Rahid's **ears and mouth.** A user pastes a **Google Meet link**; your bot **joins that Meet**, hears everyone, turns speech into a speaker-attributed transcript, detects **"Hey Rahid,"** and **speaks Rahid's answers back into the call** (+ posts the diagram link in the Meet chat). You never interrupt unless called.

This is the **highest-risk track** — putting a bot into a real Meet and having it talk back is hard. So you build in layers and **always keep a fallback that doesn't depend on Meet.**

## ⚠️ Decide the join path in the first hour (do this before coding)
Three ways to get a bot into Google Meet — pick the fastest one that works for you on the day:

| Approach | What | Notes |
|---|---|---|
| **A. Managed bot API** (Recall.ai / MeetingBaaS) | A service joins the Meet, gives you transcript + audio and lets the bot **speak** via API | ⚡ Fastest/most reliable. External (free trial). **Try first.** |
| **B. Meet Media API** (official Google) | Server-side **per-participant** audio + send media | Needs Google **Workspace + preview access** → **ask the Google/DeepMind people on the floor at the opening** (you have temp accounts — they can unblock you) |
| **C. Headless browser bot** (Playwright) | Bot joins as guest via link; scrape **Meet live captions** (speaker-labeled) for transcript; speak via a **virtual mic**; post chat link via DOM | DIY backup; fiddly; mixed audio |

**At the opening:** kick off A (sign up) and B (ask Google) in parallel. Commit to one within ~1 hour. C is your DIY backup.

## 🛟 The fallback you must keep alive
Build a **plain LiveKit room** path too (launcher "Start room" → humans + Rahid join). It demos the **identical product** without Meet. **If the Meet bot isn't solid by ~14:00, the demo runs in our room.** Never bet the 20:00 demo on Meet auth.

## Speaker attribution (who said what)
- **Approach B (Media API)** → per-participant audio → run **SLNG STT per stream** → speaker = participant identity (cleanest).
- **Approaches A / C** → take the **speaker-labeled transcript from Meet captions / the bot service**; **SLNG still does Rahid's TTS** (so SLNG stays a real partner). No diarization/voiceprint ML either way.
- ⚠️ Everyone joins from **their own device** — a single shared mic is the only case that needs diarization; avoid it.

## What you own
- The **bot/agent runtime** that joins a Meet by link (and the LiveKit-room fallback).
- Transcript with speaker labels (per chosen approach) → POST to P2.
- **Wake-word** detection (`hey rahid`, fuzzy).
- **SLNG TTS** of Rahid's answers back into the call + posting the diagram link in Meet chat.

## Contracts you touch (from ARCHITECTURE §3)
- Serve `POST /join { meetingId, meetUrl }` (§3.8) — launcher tells you to dispatch the bot.
- **Emit** utterances → `POST {CONTEXT_SERVICE_URL}/ingest` (§3.1).
- **Send** requests → `POST {N8N_WEBHOOK_BASE}/agent` (§3.5) → speak `response.text`; post `response.diagramCode`'s viewer link to chat.

## Phase 0 — Setup (joint, 30 min)
1. Help freeze §3 (incl. `/join`). Confirm `/ingest` + `/agent` shapes.
2. Decide the join approach (above). Get the relevant creds/keys + SLNG key into `.env`.

## Phase 1 — Join + transcript out (prove it alone)
1. Get the bot to **join a Meet by link** (Approach A/B/C) — host admits it. See it appear as a participant.
2. Produce a **speaker-attributed transcript** (per-stream STT for B; captions for A/C).
3. Print utterances `{ speaker, ts, text }` to console. **Don't POST yet.**
4. **Reuse first:** start from the chosen provider's sample/quickstart; port, don't hand-roll.

**Done when:** two people talk in a real Meet and you see correctly-attributed lines in your console. *(Mirror this in the LiveKit-room fallback.)*

## Phase 2 — Wake-word + request capture
1. On each transcript line, fuzzy-match the wake phrase (`hey rahid`).
2. Collect words after it until ~1.5s silence → `requestText`.

**Done when:** "Hey Rahid, make a diagram of the budget" yields the right `requestText`.

## Phase 3 — Mouth (SLNG TTS into the call)
1. String → **SLNG TTS** → play into the Meet (Media API send-track / virtual mic / bot-service audio).
2. Test with a hard-coded "Hey, can I help?".

**Done when:** the other participants **hear** Rahid speak.

## Phase 4 — Wire to the others
1. **Passive:** POST every utterance to `/ingest` (P2).
2. **Active:** on a wake request, POST to `/agent` (P3) → **TTS the `text` into the meeting** (Rahid talks back — incl. "Hey Rahid, repeat"). Diagrams **render on the web workspace** (P3 pushes them to `/events`); optionally also drop the workspace link in Meet chat.
3. Add a "one sec…" filler so the 1–2s feels natural.

**Done when:** you speak → P2 stores it; you call Rahid → it answers out loud + drops the diagram link.

## Phase 5 — Hardening for demo
- Wake-word sensitivity (no false triggers).
- Mic/echo test in the actual room.
- Graceful errors ("Sorry, I didn't catch that").
- Confirm the fallback room works end-to-end too.

## Checklist
- [ ] Join approach chosen in hour 1 (A/B/C) + LiveKit-room fallback building in parallel
- [ ] Bot joins a real Meet by link
- [ ] Speaker-attributed transcript
- [ ] Wake-word + requestText
- [ ] SLNG TTS into the call + chat link posting
- [ ] POST /ingest + POST /agent wired
- [ ] Demo-room mic test; fallback verified

## Risks you own
| Risk | Mitigation |
|---|---|
| Meet bot auth / API access | Try managed API + ask Google on-site; LiveKit-room fallback by 14:00 |
| Can't get per-participant audio | Use Meet captions for speaker labels; SLNG for TTS |
| Speaking into Meet is hard | Managed bot API handles audio-out; else virtual mic |
| Latency feels awkward | "One sec…" filler + short responses |
