# agent/ — P1: Ears & Mouth (Flash)

The Flash meeting bot. It joins a **Google Meet** as a separate guest named **Flash**, listens to everyone via **real audio → SLNG speech-to-text**, captures everything said, wakes on **"Hey Flash"**, and **speaks its reply back into the call** via **SLNG text-to-speech** (also posts it in chat). **Voice-only** right now (screen/eyes off). Works **with no backend** (P2/P3 optional).

> Plan: [`../plans/p1-ears-and-mouth.md`](../plans/p1-ears-and-mouth.md) · Architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) · Contracts: [`../shared/contracts.ts`](../shared/contracts.ts)

## How it works
- **Join:** ephemeral Chromium joins as guest "Flash" (auto-fills name + clicks *Ask to join*; you admit it). Not your Google account.
- **Ears:** taps inbound WebRTC audio → 4s windows → **SLNG STT (`nova:3-en`)** → transcript (no captions).
- **Mouth:** **SLNG TTS (`aura-2-arcas-en`, male)** injected as Flash's mic via patched `getUserMedia`, so everyone hears it.
- **Wake:** `hey flash` (punctuation-normalized). Flash goes deaf while speaking to avoid echo-triggering itself.

## Modes
- `MEET_MODE=mock` — replays `../data/sample-transcript.json` (no browser, no creds). Logic tests.
- `MEET_MODE=real` — joins a real Google Meet via Playwright (visible Chromium).

## Voice (`VOICE`)
- `slng` — SLNG TTS, the real in-call voice (needs `SLNG_API_KEY`). **Recommended.**
- `local` — Windows built-in TTS, zero keys (host speaker only; fallback).
- `console` — just logs.

---

## Setup (once)
```powershell
cd agent
npm install
npx playwright install chromium      # downloads the browser (~150 MB)
cp ..\.env.example ..\.env           # then edit .env (see below)
```
Minimal `.env` to run a real Meet with zero backend (voice-only):
```
MEET_MODE=real
VOICE=slng
SLNG_API_KEY=your_slng_key
FLASH_DISPLAY_NAME=Flash
SCREEN_CAPTURE=off
# auto-join on startup (optional): paste your Meet link
MEET_URL=https://meet.google.com/abc-defg-hij
```

## Run
```powershell
npm run dev      # or: npm start
```
- With `MEET_URL` set, Flash **auto-joins** on startup. Otherwise dispatch it:
  ```powershell
  Invoke-RestMethod -Uri http://localhost:8001/join -Method Post -ContentType "application/json" -Body '{"meetingId":"m1","meetUrl":"https://meet.google.com/abc-defg-hij"}'
  ```
- A Chromium window opens, fills the name **Flash**, and clicks **Ask to join**.
- In your *own* Meet tab, **Admit "Flash"**.

## Try it
- Speak normally → `[heard] …` lines appear in the console and in `../data/context/<meetingId>.jsonl`.
- Say **"Hey Flash, summarize the budget"** → Flash speaks the reply into the call (and posts it in chat).
- Until P3 exists, wake replies come from a stub ("…check your dashboard").

## Endpoints
- `GET /health` — mode/voice sanity check.
- `POST /join` `{ meetingId, meetUrl }` — dispatch the bot.

## Troubleshooting
- **Port busy:** `npx kill-port 8001` or `$env:AGENT_PORT=8002; npm run dev`.
- **Joins as you, not as a guest:** make sure `MEET_USER_DATA_DIR` is **blank** in `.env` (blank = ephemeral guest).
- **Nothing transcribed:** check for a `[stt] <status>` warning (SLNG key/URL); speak so the *other* participants' audio reaches the bot (it captures inbound tracks).
- **Others can't hear Flash:** check Flash's tile — if mic is crossed out, the auto-unmute missed; tell us. Use headphones to avoid your speakers feeding Flash's voice back in.
- **Meet DOM changed:** name/join/chat selectors in `src/meetBot.ts` may need a tweak (Google obfuscates them).

## Notes
- Each human joins from **their own device**.
- No backend required: context → local files; brain reply → stub; screen → off (re-enable with `SCREEN_CAPTURE=on` + `GEMINI_API_KEY`).
- TTS=`aura-2-arcas-en`, STT=`nova:3-en`. SLNG also offers Rime/Cartesia/Murf/Sarvam (TTS) and Soniox / `nova:3-multi` (STT).
