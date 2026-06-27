# P1 — Ears, Eyes & Mouth (Google Meet bot + SLNG)

> Read [`CLAUDE.md`](../CLAUDE.md) + [`ARCHITECTURE.md`](../ARCHITECTURE.md) first.
> **Your partner:** **SLNG** (qualifying #4 + LEGO side challenge — Flash's voice). The meeting platform is **Google Meet** (infra).

## ✅ Status — what's actually built (P1 merged to `main`)

Voice-only Flash is **working end-to-end** and merged. Chosen join path: **Approach C — Playwright headless-ish Chromium**, but with **real audio** (not captions).

| Capability | How it's implemented | File |
|---|---|---|
| **Join** as a separate guest named "Flash" | Ephemeral Chromium context, auto-fills name + clicks **Ask to join** (host admits). Auto-joins on startup when `MEET_URL` set; or `POST /join`. | `agent/src/meetBot.ts` |
| **Ears (real voice STT)** | Monkeypatch `RTCPeerConnection` → mix inbound audio → `MediaRecorder` 4s WebM windows → **SLNG STT (`nova:3-en`)**. Captions dropped entirely. | `meetBot.ts`, `sttClient.ts` |
| **Passive capture** | Every transcript line appended to `data/context/<meetingId>.jsonl` (+ POST to P2 if `CONTEXT_SERVICE_URL` set). | `contextClient.ts` |
| **Wake-word** | Punctuation-normalized match of `hey flash` (handles `"Hey, Flash."`). | `pipeline.ts` |
| **Mouth (TTS into the call)** | **SLNG TTS** (`aura-2-arcas-en`, male) → patched `getUserMedia` injects it as Flash's mic so everyone hears it (also plays on host speaker + posts to chat). | `speaker.ts` (`synthesizeSlng`), `meetBot.ts` (`speakInMeeting`/`ensureUnmuted`), `index.ts` |
| **Echo guard** | Flash goes "deaf" while speaking + 1.2s cooldown so it doesn't transcribe/re-trigger on itself. | `index.ts` |
| **Brain / vision** | Graceful **stubs** until P3 (`triggerAgent`, `describeScreen`). | `brainClient.ts`, `visionClient.ts` |

**Deferred for now (by request):** eyes/screen-share (`SCREEN_CAPTURE=off`), speaker diarization (all lines tagged `Participant`), the LiveKit-room fallback. The Gemini vision path exists and re-enables with `SCREEN_CAPTURE=on`.

**Run it:** set `MEET_URL` in `.env` → `cd agent && npm run dev` → admit "Flash" → talk; say "Hey Flash, …" for a spoken reply. STT=`nova:3-en`, TTS=`aura-2-arcas-en` (SLNG offers Aura-2/Rime/Cartesia/Murf/Sarvam for TTS, Nova-3/Soniox for STT).

> The sections below are the **original design/plan** (kept for context and the still-open items: screen, diarization, fallback room, P2/P3 wiring).

## Your mission

You are Flash's **ears, eyes, and mouth.** A user pastes a **Google Meet link**; your bot **joins that Meet**, hears everyone (speaker-attributed transcript), **watches shared screens** (captures frames → Gemini vision → context), detects **"Hey Flash,"** and **speaks Flash's answers back into the call**. You never interrupt unless called.

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
Build a **plain LiveKit room** path too (launcher "Start room" → humans + Flash join). It demos the **identical product** without Meet. **If the Meet bot isn't solid by ~14:00, the demo runs in our room.** Never bet the 20:00 demo on Meet auth.

## Speaker attribution (who said what)
- **Approach B (Media API)** → per-participant audio → run **SLNG STT per stream** → speaker = participant identity (cleanest).
- **Approaches A / C** → take the **speaker-labeled transcript from Meet captions / the bot service**; **SLNG still does Flash's TTS** (so SLNG stays a real partner). No diarization/voiceprint ML either way.
- ⚠️ Everyone joins from **their own device** — a single shared mic is the only case that needs diarization; avoid it.

## What you own
- The **bot/agent runtime** that joins a Meet by link (and the LiveKit-room fallback).
- Transcript with speaker labels (per chosen approach) → POST to P2.
- **Screen-share capture** → P3 `/vision` → ingest the description as context.
- **Wake-word** detection (`hey flash`, fuzzy).
- **SLNG TTS** of Flash's answers back into the call + posting the diagram link in Meet chat.

## Contracts you touch (from ARCHITECTURE §3)
- Serve `POST /join { meetingId, meetUrl }` (§3.8) — launcher tells you to dispatch the bot.
- **Emit** utterances → `POST {CONTEXT_SERVICE_URL}/ingest` (§3.1).
- **Send** requests → `POST {N8N_WEBHOOK_BASE}/agent` (§3.5) → speak `response.text`; post `response.diagramCode`'s viewer link to chat.
- **Send** screen frames → `POST {N8N_WEBHOOK_BASE}/vision` (§3.9) → ingest the returned `description`.

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
1. On each transcript line, fuzzy-match the wake phrase (`hey flash`).
2. Collect words after it until ~1.5s silence → `requestText`.

**Done when:** "Hey Flash, make a diagram of the budget" yields the right `requestText`.

## Phase 3 — Mouth (SLNG TTS into the call)
1. String → **SLNG TTS** → play into the Meet (Media API send-track / virtual mic / bot-service audio).
2. Test with a hard-coded "Hey, can I help?".

**Done when:** the other participants **hear** Flash speak.

## Phase 4 — Wire to the others
1. **Passive:** POST every utterance to `/ingest` (P2).
2. **Active:** on a wake request, POST to `/agent` (P3) → **TTS the `text` into the meeting** (Flash talks back — incl. "Hey Flash, repeat"). Diagrams **render on the web workspace** (P3 pushes them to `/events`); optionally also drop the workspace link in Meet chat.
3. Add a "one sec…" filler so the 1–2s feels natural.

**Done when:** you speak → P2 stores it; you call Flash → it answers out loud + drops the diagram link.

## Phase 4b — Eyes: screen-share capture
1. Subscribe to the **screen-share video track** (or the bot service's video feed). Grab a JPEG frame **every ~5s and on change**, plus **on demand** when a wake request mentions the screen.
2. POST the frame → P3 `POST /vision` (§3.9) → get a `description` (+ optional structured `data`).
3. **Ingest** the description into P2 as context: an `Utterance` with `speaker: "<name> (screen)"`, `source: "screen"`, `text` = the description. Now screen content is searchable like speech.
4. Keep cost sane: don't send every frame — sample + dedupe near-identical frames.

**Done when:** someone shares a data screen → a description of it lands in the context/transcript, and "Hey Flash, summarize the screen" works.

## Phase 5 — Hardening for demo
- Wake-word sensitivity (no false triggers).
- Mic/echo test in the actual room.
- Graceful errors ("Sorry, I didn't catch that").
- Confirm the fallback room works end-to-end too.

## Checklist
- [ ] Join approach chosen in hour 1 (A/B/C) + LiveKit-room fallback building in parallel
- [ ] Bot joins a real Meet by link
- [ ] Speaker-attributed transcript
- [ ] Screen-share capture → /vision → ingested as context
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
| Screen-share access / vision cost | Sample ~5s + on-demand; dedupe frames; on-demand only if the video track is unavailable |
