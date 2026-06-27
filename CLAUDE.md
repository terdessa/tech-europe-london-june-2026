# CLAUDE.md — VibeRP

Project guidance for Claude Code. Read this first each session.

## What we're building

**VibeRP** — a GTA RP server "vibe builder". Chat with an AI agent; it places gang turfs, jobs, mafias, and safe zones on the real Los Santos map (Leaflet), then exports a loadable **FiveM** resource. Open Innovation track, {Tech: Europe} London AI Hackathon.

- Full design: [`PROJECT_DESIGN.md`](./PROJECT_DESIGN.md)
- Research & partner API notes: [`RESEARCH.md`](./RESEARCH.md)
- Event rules/prizes: [`HACKATHON_MANUAL.md`](./HACKATHON_MANUAL.md)

## Hard rules (don't break these)

- **Qualification:** must use **≥3 Resources partners** = **Gemini, Superlinked, n8n**. **Aikido does NOT count toward the 3** — it's a bonus side challenge (run at the end).
- **Agent never invents coordinates.** All placements come from the POI dataset via `findPlaces` (Superlinked). The LLM only *chooses among* real candidates.
- **`ServerSpec` is the single source of truth.** Agent edits ServerSpec → map renders from it → FiveM generator emits files from it. Nothing bypasses it.
- **Input is text-only.** (SLNG voice was dropped to cut scope/risk.)
- **No secrets in the repo.** API keys via env vars only (`.env`, gitignored; ship `.env.example`). Aikido scans this repo.

## Stack

- **Frontend:** React + Vite + TypeScript, `react-leaflet` with `L.CRS.Simple` + GTA5 tileset, `leaflet-draw` for zone polygons.
- **Backend:** Node + Express + TypeScript. Gemini agent loop, ServerSpec state, Superlinked client.
- **Automation:** n8n (publish → generate FiveM files → GitHub push → Aikido scan).
- **Output:** FiveM resource (`fxmanifest.lua` + `config.lua`, PolyZone-style).

## Coordinate gotcha

GTA5 world coords → Leaflet `L.CRS.Simple` with **X/Y inverted** (`[Y, X]`) + linear scale/offset calibration. Tiles: `{z}-{x}_{y}.png`, 256px, zoom 3–7. See `RESEARCH.md §1`.

## Partner integration cheatsheet

| Partner | How |
|---|---|
| Gemini | Function calling; abstract behind one LLM module (confirm SDK/model on-site via DeepMind temp accounts) |
| Superlinked | Get key/endpoint from `@filipmakraduli`; index POI `description`+`tags`; `findPlaces(query, category?)` |
| n8n | Webhook node receives ServerSpec → generate → GitHub → trigger Aikido |
| Aikido | Free account → connect repo → screenshot report (do near end) |

## Coding conventions (from global rules)

- **Immutability:** never mutate ServerSpec/POI objects — return new copies.
- **Small files:** 200–400 lines typical, 800 max; organize by feature (`map/`, `agent/`, `generator/`, `data/`).
- Validate at boundaries (agent tool args, API responses). Handle errors explicitly; no silent swallow.
- Naming: `camelCase` vars/fns, `PascalCase` types/components, `UPPER_SNAKE_CASE` consts.
- Tests for the pure logic that matters most: ServerSpec reducers, coordinate conversion, FiveM generator.

## Build order (get end-to-end working before polish)

1. GTA5 tiles + map renders (download tileset first — hard dependency).
2. ServerSpec model + map renders entities from it.
3. Gemini tool-loop: text chat → add/remove entities → map updates.
4. POI dataset + Superlinked `findPlaces` (fallback: dataset in Gemini context).
5. FiveM generator (`config.lua` / `fxmanifest.lua`).
6. n8n publish pipeline.
7. Aikido scan + screenshot (end).

## Submission (due 19:00)

Public GitHub repo + README, 2-min Loom demo, confirm Superlinked/n8n usage, Aikido screenshot. Built fresh at the event.

## Environment notes

- Windows 11, PowerShell primary (Bash tool available for POSIX).
- A **Fact-Forcing Gate** hook requires stating facts before the first Bash command and before creating/editing any file. Comply: name callers, confirm no duplicate (Glob), show synthetic schema if data, quote the instruction.
