# agent/ — P1: Ears, Eyes & Mouth (Flash)

The Flash meeting bot. It joins a **Google Meet**, listens via **live captions** (speaker-attributed), wakes on **"Hey Flash"**, replies with **voice** (Windows TTS by default, or SLNG) and **posts the reply in the Meet chat**, and can **describe a shared screen** on request. Works **with no backend** (P2/P3 optional).

> Plan: [`../plans/p1-ears-and-mouth.md`](../plans/p1-ears-and-mouth.md) · Architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) · Contracts: [`../shared/contracts.ts`](../shared/contracts.ts)

## Modes
- `MEET_MODE=mock` — replays `../data/sample-transcript.json` (no browser, no creds). Great for logic tests.
- `MEET_MODE=real` — joins a real Google Meet via Playwright (visible Chromium).

## Voice (`VOICE`)
- `local` — Windows built-in TTS, **zero keys** (recommended for testing).
- `slng` — SLNG TTS (needs `SLNG_API_KEY` + `SLNG_TTS_URL`).
- `console` — just logs.

---

## Setup (once)
```powershell
cd agent
npm install
npx playwright install chromium      # downloads the browser (~150 MB)
cp ..\.env.example ..\.env           # then edit .env (see below)
```
Minimal `.env` to run a real Meet with zero backend:
```
MEET_MODE=real
VOICE=local
FLASH_DISPLAY_NAME=Flash
# optional eyes (describe shared screen) — needs a Gemini key:
SCREEN_CAPTURE=on
GEMINI_API_KEY=your_key      # leave blank to skip screen description
```

## Run a real Google Meet
```powershell
npm start
```
Then create a meet at https://meet.google.com/new, copy the link, and dispatch Flash:
```powershell
Invoke-RestMethod -Uri http://localhost:8001/join -Method Post -ContentType "application/json" -Body '{"meetingId":"m1","meetUrl":"https://meet.google.com/abc-defg-hij"}'
```
- A Chromium window opens. **First time:** sign into Google in that window (profile is saved to `agent/.meet-profile`, reused after).
- In your *own* Meet tab, **Admit "Flash"** when it asks to join.
- **Turn on Captions (CC)** in the meeting (Flash tries to, but enable it manually if needed — captions are how it hears).

## Try it
- Speak normally → lines appear in the agent console and in `../data/context/m1.jsonl`.
- Say **"Hey Flash, summarize the budget"** → Flash speaks a reply (local TTS) and posts it in the Meet chat.
- With `SCREEN_CAPTURE=on` + a Gemini key: share a screen, say **"Hey Flash, what's on the screen?"** → it describes it.

## Endpoints
- `GET /health` — mode/voice sanity check.
- `POST /join` `{ meetingId, meetUrl }` — dispatch the bot.

## Troubleshooting
- **Port busy:** `npx kill-port 8001` or `$env:AGENT_PORT=8002; npm start`.
- **Can't hear anyone:** captions aren't on — click **CC** in the meeting.
- **Flash didn't auto-join:** the Chromium is visible — click Join / Ask to join yourself.
- **No voice into the meeting:** `local` TTS plays on your speakers (others hear it if your mic is on); for a clean in-meeting voice, route TTS through a virtual audio cable as Flash's mic (optional).
- **Meet DOM changed:** caption/chat selectors in `src/meetBot.ts` may need a small tweak (Google obfuscates them).

## Notes
- Each human joins from **their own device** (speaker attribution depends on it).
- No backend required: context → local files; brain reply → stub; screen → direct Gemini (optional).
