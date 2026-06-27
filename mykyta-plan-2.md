# Mykyta — Plan 2: The Brain (data → agent → FiveM)

> **Read first:** [`CLAUDE.md`](./CLAUDE.md), [`PROJECT_DESIGN.md`](./PROJECT_DESIGN.md), [`RESEARCH.md`](./RESEARCH.md).
> **Your partner integrations:** **Gemini** (agent) + **Superlinked** (semantic POI search) — both qualifying.
> **Parallel track:** [`vlad-plan-1.md`](./vlad-plan-1.md) builds the map/UI/server/n8n around you and consumes your modules.

## Your mission — own the whole backend vertical, end to end

You build the **entire brain** as one cohesive, self-contained unit you can test from a CLI with **no frontend and no help from Vlad**:

```
POI dataset → Superlinked findPlaces → Gemini agent → SpecActions → reducer → ServerSpec → FiveM generator → .lua files
```

Everything here is pure-ish backend logic (types, data, search, agent, codegen). You can run the full pipeline end-to-end via a CLI harness (Phase 7) before Vlad's UI even exists. **You depend on Vlad for nothing** until final integration; Vlad depends on *you*, so you hand him mocks on day one (Phase 0) and then he never waits on you either.

**Hard rules (CLAUDE.md — do not break):**
- **Agent never invents coordinates.** Coords come only from `findPlaces` (Superlinked). The LLM *chooses among* real candidates and explains why.
- `ServerSpec` is the single source of truth. The agent emits `SpecAction`s folded through your reducer — never mutates spec directly.
- **Immutable** updates (new object per change).
- No secrets in repo — Gemini/Superlinked keys via env vars only.

---

## Phase 0 — Define contracts + hand Vlad his mocks (≈30 min)

You own the contracts (it's all your domain). Author them, get Vlad's quick sign-off, **freeze**, then hand him stubs so he's unblocked forever.

**`shared/types.ts`** (mirrors `PROJECT_DESIGN.md §5` — don't invent coord values):
```ts
export type Coord = { x: number; y: number; z?: number };
export type EntityType = 'gang_turf' | 'safe_zone' | 'job' | 'business' | 'spawn' | 'poi';
export type Shape = 'polygon' | 'circle' | 'marker';
export interface Entity { id: string; type: EntityType; label: string; shape: Shape;
  points?: Coord[]; center?: Coord; radius?: number; meta?: Record<string, unknown>; }
export interface ServerSpec { version: number; name: string; entities: Entity[]; }
export type SpecAction =
  | { kind: 'add'; entity: Entity } | { kind: 'remove'; id: string }
  | { kind: 'move'; id: string; center: Coord } | { kind: 'rename'; id: string; label: string };
```

**Interfaces you own and implement:**
```ts
// backend/spec/reducer.ts
export function applySpecAction(spec: ServerSpec, action: SpecAction): ServerSpec; // pure, immutable, validated
// backend/search/findPlaces.ts
export interface Candidate { id:string; name:string; category:string; neighborhood:string; coords:Coord; tags:string[]; score:number; }
export async function findPlaces(query: string, category?: string): Promise<Candidate[]>;
// backend/agent/runAgent.ts
export async function runAgent(message: string, spec: ServerSpec): Promise<{ newSpec: ServerSpec; reply: string }>;
// backend/generator/generate.ts
export function generateFiveM(spec: ServerSpec): Record<string, string>; // { 'fxmanifest.lua':..., 'config.lua':... }
// shared/coords.ts
export function gameToLeaflet(x:number,y:number): [number,number]; // L.CRS.Simple, X/Y inverted
export function leafletToGame(lat:number,lng:number): Coord;
```

**Hand Vlad on day one (so he never blocks on you):**
1. `shared/types.ts` (frozen).
2. `data/sample-spec.json` — a realistic `ServerSpec` with a few turfs/safe-zones/jobs, so his map has something to render immediately.
3. Stub `shared/coords.ts` (rough scale/offset; real constants land Phase 3).
4. Stub `runAgent` (echoes one hard-coded `add` through the reducer) + stub `generateFiveM` (returns placeholder Lua). He swaps these for your real ones at integration.

**At the opening — grab access (blocking, `RESEARCH.md` open items):**
- **Superlinked** API key + cluster endpoint from `@filipmakraduli` (Discord).
- **Gemini** via DeepMind temp accounts; **confirm exact SDK + model id on-site** (research flagged a possible newer Interactions API / `gemini-3-flash-preview` — verify). Wrap behind one swappable LLM module.

Branch `mykyta/track-2` off `main`.

---

## Phase 1 — ServerSpec model + reducer (the spine)

1. Finalize `shared/types.ts`.
2. Implement `applySpecAction` — pure, immutable, validates the action, throws on unknown id.
3. **Unit-test it** (core pure logic per CLAUDE.md): add/remove/move/rename, immutability (input object unchanged), error on bad id.

**Done when:** reducer folds an action array into a new spec, fully tested, no UI involved.

---

## Phase 2 — POI dataset (your moat — your 2000h of RP)

> `PROJECT_DESIGN.md §2`, `RESEARCH.md §2`. ~200–400 POIs. No clean single source — **compile + spot-verify**.

1. `data/pois.json` per the POI schema (`id, name, category, neighborhood, coords{x,y,z}, tags[], description`).
2. Categories: `hospital` (~5), `parking`, `gas_station`, `beach`, `dock`, `club`, `landmark`, `police`, … Lean on what plays well in RP.
3. **Reuse first:** mine FiveM community coord lists; spot-verify every coord on [gtamap.xyz](https://gtamap.xyz/) / [gtalens.com/map](https://gtalens.com/map).
4. **`description` + `tags` are the highest-leverage text you'll write** — they drive Superlinked ranking. Phrase them so a vibe query ("big open lot near downtown for a car market") surfaces the right POI.

**Done when:** verified coords across categories with rich descriptions/tags.

---

## Phase 3 — Coordinate calibration

1. Calibrate `gameToLeaflet` against the GTA5 tileset (linear `scale` + `offset`; X/Y inverted; `L.CRS.Simple`). `RESEARCH.md §1`. You can compute/verify the transform from tile math alone — you don't need Vlad's map running.
2. Spot-check known POIs (e.g. Pillbox `x:295.8, y:-1446.9`). Replace the Phase 0 stub constants.
3. **Unit-test** the conversion.

**Done when:** known coords map to the right tile position.

---

## Phase 4 — Superlinked `findPlaces` ⭐ (qualifying + $500)

> `RESEARCH.md §3`. Legacy pip framework deprecated → use **SIE** cluster endpoint + client. schema → Space (TextSimilarity/Category/Number) → Index → Query.
>
> **Why Superlinked, not Tavily:** we rank *our own curated dataset* by meaning — that's vector retrieval over in-house structured data (Superlinked's job). Tavily is web search; it can't index our POIs and using live web data would break "agent never invents coordinates."

1. Define POI schema in Superlinked; embed `description`+`tags` (TextSimilaritySpace), weight `category`/`neighborhood`.
2. Ingest `data/pois.json`.
3. Implement `findPlaces(query, category?)` → ranked `Candidate[]` with real coords; `category` filter for exact lookups ("all hospitals").
4. Sanity-check the demo queries (`PROJECT_DESIGN.md §7`).
5. **Fallback (same signature):** if access/time short, load the dataset into Gemini context and rank there. Keeps the feature; loses the $500. Agent calls `findPlaces` either way.

**Done when:** `findPlaces('hospital')` returns hospitals; `findPlaces('big parking lot for a car market')` ranks plausible lots first.

---

## Phase 5 — Gemini agent `runAgent` ⭐ (qualifying)

> `RESEARCH.md §5`. Function-calling loop: declare tools → model returns `function_call` → execute → return result → loop.

1. `backend/agent/` — one LLM module wrapping Gemini (swappable).
2. **Tool declarations:** `findPlaces(query, category?)`; `addZone`/`addJob`/`addGang`/`addSafeZone` (emit `add` actions); `move`, `remove`, `list`. **No tool accepts raw coordinates** — that structurally enforces the grounding rule.
3. **System prompt:** must call `findPlaces` and pick from returned real candidates; must explain *why* it chose one (judges love this — demo step 3).
4. Loop folds emitted `SpecAction`s through `applySpecAction` → returns `{ newSpec, reply }`.
5. Validate tool args at the boundary; handle Gemini errors explicitly (no silent swallow).
6. **Reuse first:** Gemini cookbook function-calling quickstart — port the loop skeleton.

**Done when:** "safe zone at every hospital" → agent calls `findPlaces('hospital')`, emits N adds, explains itself; spec now has N circles.

---

## Phase 6 — FiveM generator

> `RESEARCH.md §7`. Not tested in-game — must look correct and plausibly load. This belongs to you: it turns *your* coords/zones into Lua.

1. `generateFiveM(spec)` — pure `ServerSpec → { 'fxmanifest.lua', 'config.lua' }`.
2. `fxmanifest.lua`: `fx_version`, `game 'gta5'`, name/author/version, `shared_script 'config.lua'`.
3. `config.lua`: `gang_turf` polygon → PolyZone points; `safe_zone` circle → center+radius; `job`/`business` marker → coords + `blip` from `meta`.
4. **Reuse first:** `gh search code` PolyZone + FiveM job/blip config templates; port the Lua conventions.
5. **Snapshot-test** against a sample spec. (Bonus: you're on Windows — optionally spot-load the output in a real FiveM client for a "it loads" demo beat.)

**Done when:** sample spec → clean `config.lua` + `fxmanifest.lua` with real coords.

---

## Phase 7 — CLI harness (proves the whole brain, no frontend)

1. `backend/cli.ts` — read a message from argv → `runAgent(message, spec)` → print resulting spec → `generateFiveM(spec)` → write to `fivem-resource/`.
2. Run the four demo prompts (`PROJECT_DESIGN.md §7`) through it; tune dataset text + system prompt until they land crisply.

**Done when:** you can build a full server world and emit FiveM files from the terminal — your entire track verified independently of Vlad.

---

## Phase 8 — Integration with Vlad

1. Vlad swaps his stubs for your real `runAgent`, `generateFiveM`, and `coords.ts`.
2. Run the demo script on the real map; co-fix coord/render mismatches (X/Y inversion, scale/offset are the usual suspects).
3. Confirm Superlinked usage is real & demoable (submission + $500). Help with README (tools, dataset, grounding) + Loom.

---

## Your checklist
- [ ] Phase 0: contracts frozen + mocks handed to Vlad; Superlinked/Gemini access secured
- [ ] Reducer + types, tested
- [ ] `data/pois.json` — verified coords, rich tags/descriptions (your moat)
- [ ] `coords.ts` calibrated + tested
- [ ] **Superlinked** `findPlaces` ranks well (+ fallback behind same signature)
- [ ] **Gemini** agent emits SpecActions, never invents coords, explains picks
- [ ] FiveM generator (snapshot-tested)
- [ ] CLI harness runs all 4 demo prompts end-to-end
- [ ] Integrated with Vlad; demo passes on real map

## Risks you own
| Risk | Mitigation |
|---|---|
| Superlinked access (needs @filipmakraduli) | Grab at opening; fallback = dataset in Gemini context behind same `findPlaces` |
| POI coordinate accuracy | Compile + spot-verify on gtamap.xyz; small but correct |
| Gemini SDK/model uncertainty | Confirm via DeepMind temp accounts; one swappable LLM module |
| Agent hallucinates coords | No raw-coord tool exists; system prompt enforces findPlaces-only |
