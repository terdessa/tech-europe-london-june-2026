# agent/ — P1: Ears & Mouth (Google Meet bot + SLNG)

The Rahid meeting bot. Joins a Google Meet, transcribes (speaker-attributed), wakes on "Hey Rahid", and speaks answers back via SLNG.

> Full plan: [`../plans/p1-ears-and-mouth.md`](../plans/p1-ears-and-mouth.md) · Architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) · Contracts: [`../shared/contracts.ts`](../shared/contracts.ts)

## Run the skeleton (works with no creds — uses the mock transcript)
```powershell
npm install
npm start
# in another terminal (PowerShell — `curl` there is NOT real curl, use one of these):
Invoke-RestMethod -Uri http://localhost:8001/join -Method Post -ContentType "application/json" -Body '{"meetingId":"m_sample","meetUrl":"https://meet.google.com/test"}'
# or real curl:
curl.exe -X POST http://localhost:8001/join -H "content-type: application/json" -d '{"meetingId":"m_sample","meetUrl":"https://meet.google.com/test"}'
```
Port busy? `npx kill-port 8001` or `$env:AGENT_PORT=8002; npm start`.

## Quickstart
1. `cp ../.env.example ../.env` and fill in `SLNG_API_KEY` + your chosen Meet-join creds.
2. **Pick the join approach** (A managed bot / B Meet Media API / C headless) — see the plan. Build the **LiveKit-room fallback** in parallel.
3. Implement, in order:
   - join a Meet by link + print transcript → console
   - `POST /ingest` each `Utterance` to the context service
   - wake-word (`hey rahid`) + capture `requestText`
   - SLNG TTS: speak a string into the call
   - `POST /agent` on wake → speak `response.text`
4. Test with mocks first (canned `/ingest` + `/agent`), then integrate.

## Endpoints this service exposes
- `POST /join` → `{ meetingId, meetUrl }` — dispatch the bot (called by the web launcher).

## Notes
- Each participant joins from **their own device** (speaker attribution depends on it).
- Diagrams are **not** rendered here — P3 pushes them to the web workspace.
