# CLAUDE.md — Rahid

Project guidance for Claude Code. Read this first each session.

## What we're building

**Rahid** — an AI agent that **joins your meeting as a third participant**. It listens passively (never interrupts), writes down the full context, and the moment you say **"Hey Rahid"** it wakes up, talks back with voice, and helps you *in the moment* — answering questions or generating diagrams grounded in your prep docs and the live discussion. When the meeting ends, the entire context becomes a reusable brain: a pop-up app where you can ask anything ("based on our meeting, what's the best approach to X?").

> **The wedge (say this in the pitch):** Google Meet / Granola give you a *passive summary after the fact*. Rahid is **active in the moment + one context reused live and after**. That's the difference.

- Full architecture + shared contracts: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Per-person build plans: [`plans/`](./plans/)
- Event rules/prizes: [`HACKATHON_MANUAL.md`](./HACKATHON_MANUAL.md)

## Hard rules (don't break these)

- **Qualification:** must use **≥3 Resources partners**. Ours: **Gemini + Superlinked + n8n** (qualifying #1–3) **+ SLNG** (qualifying #4, voice). 
- **Aikido does NOT count toward the 3** — it's the €1000 bonus side challenge + our security story. **LiveKit is infra, not a partner** (doesn't count).
- **Grounded, not hallucinated.** Live answers + diagrams must be grounded in retrieved context (Superlinked over prep docs + live transcript). Rahid cites sources.
- **No secrets in the repo.** API keys via env vars only (`.env`, gitignored; ship `.env.example`). Aikido scans this repo — keep it clean.
- Built fresh at the event.

## The five tracks (4 engineers + 1 demo/story)

| Track | Plan | Owns | Partner |
|---|---|---|---|
| Ears & Mouth | [`plans/p1-ears-and-mouth.md`](./plans/p1-ears-and-mouth.md) | LiveKit agent, audio, wake-word, SLNG STT/TTS | SLNG |
| Retrieval & Context | [`plans/p2-retrieval.md`](./plans/p2-retrieval.md) | Superlinked-powered semantic retrieval + reranking + doc parsing over the transcript & prep docs (Rahid's recall) | Superlinked |
| Brain | [`plans/p3-brain.md`](./plans/p3-brain.md) | n8n agent workflow + Gemini + diagram generation | n8n, Gemini |
| Face | [`plans/p4-face.md`](./plans/p4-face.md) | Web app, diagram render, post-meeting Q&A, Aikido | (Aikido) |
| Demo & Story | [`plans/p5-demo-and-story.md`](./plans/p5-demo-and-story.md) | Pitch, demo script, Loom, slides, README, submission | — |

## Stack

- **Agent runtime:** LiveKit (agent joins the room). Node or Python per P1's choice.
- **Voice:** SLNG — speech-to-text + text-to-speech.
- **Retrieval:** Superlinked — an inference engine (embeddings, semantic search, reranking, doc parsing) over a plain store of the transcript + prep docs. *It's the semantic layer, not the database.*
- **Brain:** n8n workflows orchestrating Gemini calls (live agent flow + post-meeting pipeline).
- **Frontend:** React + Vite + TypeScript; Mermaid for diagram rendering.
- **Security:** Aikido repo scan.
- **Glue:** components talk over HTTP/JSON keyed by `meetingId` (see `ARCHITECTURE.md`).

## Coding conventions (from global rules)

- **Immutability:** never mutate shared state objects — return new copies.
- **Small files:** 200–400 lines typical, 800 max; organize by feature.
- Validate at boundaries (API payloads, tool args). Handle errors explicitly; no silent swallow.
- Naming: `camelCase` vars/fns, `PascalCase` types/components, `UPPER_SNAKE_CASE` consts.
- Tests for the pure logic that matters (retrieval shaping, diagram code gen, context assembly).

## Build order (end-to-end before polish)

1. **Freeze the shared contracts** (`ARCHITECTURE.md`) — 30 min, all together.
2. Each track builds against **mocks** (no waiting on anyone).
3. Build the **controllable wow first**: grounded diagram + post-meeting Q&A (lower risk than live join).
4. Integrate: P1→P2 (utterances) → P3 uses P2 retrieve → P1↔P3 (request→response→TTS) → P4 renders.
5. Wire the **live LiveKit join** (riskiest — has a fallback: run Rahid in our own call UI).
6. Aikido scan + README + Loom (end).

## Demo (the money shot)

Two people talk in a Google Meet; Rahid is the third. One says *"we have 5,000 budget — spent 500 on X, 1,000 on Y…"* → **"Hey Rahid, make a diagram of that"** → diagram appears in chat. Meeting ends → pop-up app → *"based on the meeting, what should we cut?"* → grounded answer. **One context, two uses, on stage.**

## Submission (due 19:00)

Public GitHub repo + README, 2-min Loom, confirm Superlinked + n8n + SLNG usage, Aikido screenshot.

## Environment notes

- Windows 11, PowerShell primary (Bash tool available for POSIX).
- A **Fact-Forcing Gate** hook requires stating facts before the first Bash command and before creating/editing any file. Comply: name callers, confirm no duplicate (Glob), show synthetic schema if data, quote the instruction.
