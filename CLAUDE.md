# CLAUDE.md

Project guidance for Claude Code. Read this first each session.

> **Status:** Concept in flux — pivoting to an **interactive meeting copilot** (real-time hints/answers during live meetings, not passive transcription). Design TBD; this file holds the stable, idea-agnostic guidance. Event rules/prizes: [`HACKATHON_MANUAL.md`](./HACKATHON_MANUAL.md).

## Hard rules (don't break these)

- **Qualification:** must use **≥3 Resources partners** (Gemini, Superlinked, n8n, Tavily, SLNG, Attio, Mubit). Aim: **Gemini + Superlinked + n8n** as the core three.
- **Aikido does NOT count toward the 3** — it's a bonus side challenge (€1000), run near the end: connect repo → screenshot report.
- **No secrets in the repo.** API keys via env vars only (`.env`, gitignored; ship `.env.example`). Aikido scans this repo.
- Built fresh at the event (boilerplates allowed).

## Track & strategy

- **Open Innovation track.** Judged on **creativity + technical complexity**, bonus for partner usage.
- Stack side challenges from one coherent build: **Superlinked $500**, **n8n** (1yr Cloud Pro + $500), **Aikido €1000**, plus Tavily/SLNG/Mubit where they map to a real feature (not decoration).

## Partner cheatsheet

| Partner | How |
|---|---|
| Gemini (DeepMind) | Frontier multimodal model (the "many inputs / many outputs" capability). Abstract behind one LLM module; confirm SDK/model on-site via DeepMind temp accounts. |
| Superlinked | Semantic vector search over **our own data**. Key/endpoint from `@filipmakraduli`. Python + TS clients. |
| n8n | The orchestration/automation layer — branching, scheduled, multi-system workflows. Should be technically meaty, not a dumb push step. |
| Tavily | Real-time web search/extraction (1000 free credits). |
| SLNG | Voice AI (in/out). Side challenge: LEGO. |
| Mubit / Minima | Model recommender — route each task to the cheapest model that clears the quality bar. $2000 credits. |
| Aikido | Free account → connect repo → screenshot security report (bonus €1000). |

## Coding conventions (from global rules)

- **Immutability:** never mutate state objects — return new copies.
- **Small files:** 200–400 lines typical, 800 max; organize by feature/domain, not by type.
- Validate at boundaries (tool args, API responses). Handle errors explicitly; no silent swallow.
- Naming: `camelCase` vars/fns, `PascalCase` types/components, `UPPER_SNAKE_CASE` consts.
- Tests for the pure logic that matters most.

## Build order (get end-to-end working before polish)

1. Nail the single source-of-truth state model first.
2. Core happy path end-to-end with stubs before any real partner integration.
3. Swap stubs for real partner calls one at a time.
4. Aikido scan + screenshot (end).

## Submission (due 19:00)

Public GitHub repo + README, 2-min Loom demo, confirm Superlinked/n8n usage, Aikido screenshot.

## Environment notes

- Windows 11, PowerShell primary (Bash tool available for POSIX).
- A **Fact-Forcing Gate** hook requires stating facts before the first Bash command and before creating/editing any file. Comply: name callers, confirm no duplicate (Glob), show synthetic schema if data, quote the instruction.
