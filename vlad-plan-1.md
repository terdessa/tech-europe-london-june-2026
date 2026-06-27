# Vlad — Plan 1: The Face & Pipeline (map, UI, server, n8n)

> **Read first:** [`CLAUDE.md`](./CLAUDE.md), [`PROJECT_DESIGN.md`](./PROJECT_DESIGN.md), [`RESEARCH.md`](./RESEARCH.md).
> **Your partner integration:** **n8n** (qualifying, required) + **Aikido** (bonus).
> **Parallel track:** [`mykyta-plan-2.md`](./mykyta-plan-2.md) owns the whole backend brain. You build the face and the pipeline around it.

## Your mission — render the world and ship it

You own everything the user sees and the publish pipeline: the GTA5 Leaflet map, the chat UI, the Express server that holds `ServerSpec` and wires routes, and the **n8n** pipeline that turns a spec into a pushed FiveM repo.

You consume Mykyta's modules behind agreed interfaces. **He hands you mocks on day one** (`types.ts`, `sample-spec.json`, stub `runAgent`, stub `generateFiveM`, stub `coords.ts`), so you build the entire frontend + server + n8n **without ever waiting on him**. At integration you just swap the stubs for his real modules.

**Hard rules (CLAUDE.md — do not break):**
- `ServerSpec` is the single source of truth. The map renders **entirely** from it; nothing bypasses it.
- **Immutable** updates — never mutate the spec object in React state; replace it.
- No secrets in repo. Env vars only (`.env` gitignored; ship `.env.example`).
- Aikido does **not** count toward the 3 partners — end-of-day bonus.

---

## Phase 0 — Repo + receive Mykyta's mocks (≈30 min, joint)

1. Monorepo layout: `frontend/`, `backend/`, `shared/`, `data/`, `n8n/`, `fivem-resource/` (gitignored). Workspaces; Vite frontend, `tsx` backend.
2. Review + sign off Mykyta's `shared/types.ts` and interfaces (`runAgent`, `generateFiveM`, `coords`). Push back now if anything's missing.
3. **Receive from Mykyta:** `shared/types.ts`, `data/sample-spec.json`, stub `coords.ts`, stub `runAgent`, stub `generateFiveM`. These unblock your entire track.
4. `.env.example`: `GEMINI_API_KEY`, `SUPERLINKED_ENDPOINT`, `SUPERLINKED_API_KEY`, `N8N_WEBHOOK_URL`, `GITHUB_TOKEN`. `.env` → `.gitignore`.
5. Branch `vlad/track-1` off `main`.

**Context for agents:** Hackathon — KISS/YAGNI. Get the map rendering `sample-spec.json` before anything dynamic.

---

## Phase 1 — GTA5 map (HARD DEPENDENCY — do first)

> Reuse: [`RiceaRaul/gta-v-map-leaflet`](https://github.com/RiceaRaul/gta-v-map-leaflet). Tiles are **not** in the repo — extracted from a MEGA archive. **Grab the tileset first thing.** `RESEARCH.md §1`.

1. Scaffold `frontend/` (Vite + React + TS). Add `leaflet`, `react-leaflet`, `leaflet-draw`.
2. Download tileset → `frontend/public/tiles/`. Pattern `{z}-{x}_{y}.png`, `tileSize:256`, `minZoom:3`, `maxZoom:7`.
3. `MapView`: `MapContainer` with `crs={L.CRS.Simple}` + `TileLayer` on local tiles. Verify pan/zoom.
4. **Fallback:** if MEGA stalls, static-image `ImageOverlay` so you're not blocked.

**Done when:** GTA5 map renders and pans.

---

## Phase 2 — Render ServerSpec (read-only, from the sample fixture)

1. Render entities from `data/sample-spec.json` using `coords.ts → gameToLeaflet` (stub fine; visuals firm up after Mykyta calibrates):
   - `polygon` → `<Polygon>` (color from `meta.color`)
   - `circle` (safe_zone) → `<Circle radius>`
   - `marker` (job/business/poi) → `<Marker>` + label popup
2. `useSpec` hook: holds the spec; re-renders whenever it changes.

**Context for agents:** Build the *whole* map against the sample fixture — no agent, no server needed yet. This is the bulk of your visual work and has zero dependency on Mykyta's live code.

**Done when:** every entity shape in the sample spec renders correctly.

---

## Phase 3 — Chat UI + manual draw + Publish

1. Chat panel: text input → `POST /api/chat` → show `reply`; map updates from returned `spec`.
2. `leaflet-draw`: user draws a polygon → emit `SpecAction { kind:'add' }` to backend (manual placement; complements the agent).
3. **Publish** button → `POST /api/publish` → show status + repo URL (+ Aikido screenshot link later).

**Done when:** UI round-trips through the backend (stub agent) and the map updates.

---

## Phase 4 — Express server (the wiring/shell)

1. Scaffold `backend/` Express + TS; CORS for the Vite origin. In-memory `ServerSpec` (single session — no DB, YAGNI).
2. Routes (thin — they delegate to Mykyta's modules):
   | Method | Path | Behavior |
   |---|---|---|
   | `GET` | `/api/spec` | return current spec |
   | `POST` | `/api/chat` | `runAgent(message, spec)` → store + return `{ spec, reply }` |
   | `POST` | `/api/publish` | `generateFiveM(spec)` → POST files to `N8N_WEBHOOK_URL` → return repo URL |
3. Until Mykyta's land, import his **stub** `runAgent`/`generateFiveM`. The full loop (UI → server → spec → map) works on day one.
4. Optional SSE/WebSocket to push spec updates (REST is fine — YAGNI).

**Done when:** real Express serves the frontend round-trip using stubs.

---

## Phase 5 — n8n publish pipeline ⭐ (your qualifying partner — required)

> `RESEARCH.md §4`. **Webhook → GitHub push → (HTTP) trigger Aikido.** Prize: 1-yr Cloud Pro + $500.

1. Stand up n8n (Cloud Pro for the prize, or Docker self-host). GitHub token (repo scope) → n8n credential.
2. Workflow:
   - **Webhook** receives the `/api/publish` payload. **Keep n8n thin:** backend sends the already-generated files `{ files: {...}, repoName }`; n8n just pushes (Lua generation stays tested in Mykyta's TS).
   - **GitHub node(s):** commit the files to a target repo.
   - **HTTP node:** trigger Aikido scan (wired in Phase 7).
3. Backend `/api/publish` posts files to `N8N_WEBHOOK_URL`, returns repo URL + status.
4. **Fallback:** direct GitHub-API push from backend as a backup — but **n8n is the path we demo** (qualifying partner). Keep it primary.

**Context for agents:** n8n usage must be real and demoable — webhook → GitHub push is the minimum that qualifies. Don't over-build the workflow.

**Done when:** clicking **Publish** pushes a real FiveM resource repo to GitHub via n8n.

---

## Phase 6 — Integration with Mykyta

1. Swap stub `runAgent`/`generateFiveM`/`coords.ts` for his real modules (interfaces already frozen — drop-in).
2. Run the demo script (`PROJECT_DESIGN.md §7`) end-to-end on the real map.
3. Co-fix coord/render mismatches (X/Y inversion, scale/offset).

---

## Phase 7 — Aikido + submission polish (end of day, bonus)

1. Aikido free account → connect Git provider → connect the generated repo → screenshot the security report (`RESEARCH.md §6`). Wire the HTTP-trigger node if time allows; manual is fine.
2. Generated repo clean: no secrets, env vars only.
3. README (setup, partner APIs, tool list); confirm Superlinked + n8n in submission. Help record the 2-min Loom.

---

## Your checklist
- [ ] Phase 0: monorepo + received Mykyta's mocks
- [ ] GTA5 tileset + map renders (hard dep)
- [ ] All entity shapes render from `sample-spec.json`
- [ ] Chat UI + leaflet-draw + Publish button
- [ ] Express server: 3 routes wired (stubs first)
- [ ] **n8n** webhook → GitHub push (qualifying)
- [ ] Integrated with Mykyta's real modules; demo passes
- [ ] Aikido screenshot + README + Loom

## Risks you own
| Risk | Mitigation |
|---|---|
| GTA5 tileset (MEGA) download fails | Do first; static-image `ImageOverlay` fallback |
| n8n flaky | Direct GitHub-API backup push; keep n8n as the shown path |
| Blocked waiting on Mykyta | Use his day-one mocks (`sample-spec.json` + stubs); swap at integration |
