# VibeRP — GTA RP Server Vibe Builder

> **Working name:** VibeRP
> **Event:** {Tech: Europe} London AI Hackathon — Open Innovation track
> **One-liner:** Chat with an AI agent and watch it build a full GTA RP world — gang turfs, jobs, mafias, safe zones — live on the real Los Santos map, then export a ready-to-load FiveM server resource.

---

## 1. Concept

GTA roleplay (RP) server admins spend hours hand-placing zones, jobs, and territories in config files and map editors. VibeRP turns that into a **conversation**: you describe the vibe ("put a mafia turf in the docks, a safe zone at every hospital, a used-car market in a big parking lot near the amphitheater"), and an AI agent — grounded in real GTA5 map knowledge — places everything correctly, shows it on the map in real time, and generates the FiveM resource files for you.

We are **not** testing in-game. The deliverable is: the live builder app **+** a generated FiveM server resource folder that *would* load (`fxmanifest.lua` + `config.lua` with real coordinates and zone polygons).

**Why it wins:** strong creativity + clear technical complexity (grounded agent, semantic spatial search, live map, code generation), a clean live demo (describe a world → it appears), and dense, non-bolted-on partner usage.

---

## 2. The core insight — grounded spatial knowledge

The agent must **know the real map**, not hallucinate it. "Best place for a used-car market" or "all the hospitals" are **semantic ranking** problems over location attributes, not name lookups. So:

- We ship a curated **GTA5 POI dataset** (~200–400 points: hospitals ×~5, car parks, gas stations, beaches, docks, clubs, landmarks…), each with `{ name, category, neighborhood, coords, tags, description }`.
- We index it in **Superlinked** for semantic search.
- The agent calls `findPlaces(query, category?)` → Superlinked returns ranked candidates with **real coordinates** → Gemini reasons over them, picks the best, explains why, and places it.

The model **never invents coordinates** — it only chooses among real, dataset-backed candidates. This is the difference between a toy and something that would actually load in FiveM.

---

## 3. Partner stack & prize strategy

> ⚠️ **Qualification rule:** must use **min. 3 partner technologies listed under Resources** (Gemini/DeepMind, Attio, SLNG, Tavily, Superlinked, n8n, Mubit). **Aikido is a Side Challenge, NOT in the Resources list — treat it as a bonus, not one of the 3.**

| Partner | Role in VibeRP | Counts as |
|---|---|---|
| **Gemini** (DeepMind) | Agent brain — tool-calling (`addZone`, `addJob`, `addGang`, `addSafeZone`, `findPlaces`, `move`, `remove`, `list`); reasons over candidates | Qualifying infra #1 |
| **Superlinked** | Semantic POI search — the agent's "map knowledge" | Qualifying infra #2 **+ $500 side prize** |
| **n8n** | "Publish" pipeline: ServerSpec → generate FiveM files → zip → GitHub push → trigger Aikido scan | Qualifying infra #3 **+ $500 + 1yr Cloud Pro** |
| **Aikido** | Scan the generated repo, screenshot the security report | **+ €1000** (bonus side challenge) |

**Result: 3 qualifying infra partners (Gemini, Superlinked, n8n) + 2 side challenges (Superlinked, n8n) + Aikido bonus** from one coherent product. Meets the 3-partner minimum cleanly with margin.

*(SLNG voice was considered and dropped to reduce scope/risk — input is text-only.)*

---

## 4. Architecture

```
┌──────────────────────────────────────────────┐
│  Frontend (React + Vite + TS)                 │
│  • react-leaflet, L.CRS.Simple, GTA5 tileset  │
│  • zone polygons (leaflet-draw) + POI markers │
│  • renders entirely from ServerSpec           │
│  • Chat panel (text)                          │
└───────────────┬──────────────────────────────┘
                │ REST / WebSocket
┌───────────────▼──────────────────────────────┐
│  Backend (Node + Express + TS)                │
│  • ServerSpec JSON  ← single source of truth  │
│  • Gemini agent loop (function calling)       │
│  • Tools:                                     │
│     - findPlaces() → Superlinked POI search   │
│     - addZone/addJob/addGang/addSafeZone      │
│     - move / remove / list                    │
└───────────────┬──────────────────────────────┘
                │ on "Publish"
┌───────────────▼──────────────────────────────┐
│  n8n workflow                                 │
│  ServerSpec → generate fxmanifest.lua +       │
│  config.lua (PolyZone style) → zip →          │
│  GitHub push → trigger Aikido scan            │
└───────────────────────────────────────────────┘
```

**Key principle:** the agent only ever edits **`ServerSpec`**. The map renders from it; the FiveM generator emits files from it. One abstraction, fully testable. Updates are **immutable** (new spec object per change — matches our coding style).

---

## 5. Data models (synthetic examples)

### POI (indexed in Superlinked)
```jsonc
{
  "id": "poi_hospital_pillbox",
  "name": "Pillbox Hill Medical Center",
  "category": "hospital",
  "neighborhood": "Pillbox Hill",
  "coords": { "x": 295.8, "y": -1446.9, "z": 29.9 },
  "tags": ["hospital", "emergency", "downtown", "ems"],
  "description": "Central Los Santos hospital, busy downtown, common EMS hub."
}
```

### ServerSpec (source of truth, rendered + generated from)
```jsonc
{
  "version": 1,
  "name": "My RP Server",
  "entities": [
    {
      "id": "zone_docks_mafia",
      "type": "gang_turf",
      "label": "Docks Mafia",
      "shape": "polygon",
      "points": [ { "x": 1100, "y": -3000 }, { "x": 1300, "y": -3000 }, { "x": 1300, "y": -2700 } ],
      "meta": { "faction": "mafia", "color": "#8B0000" }
    },
    {
      "id": "safe_pillbox",
      "type": "safe_zone",
      "label": "Hospital Safe Zone",
      "shape": "circle",
      "center": { "x": 295.8, "y": -1446.9 },
      "radius": 60
    },
    {
      "id": "job_carmarket",
      "type": "job",
      "label": "Used Car Market",
      "shape": "marker",
      "center": { "x": -56.0, "y": -1096.0 },
      "meta": { "jobType": "dealership", "blip": 326 }
    }
  ]
}
```

Entity types: `gang_turf`, `safe_zone`, `job`, `business`, `spawn`, `poi`. Shapes: `polygon`, `circle`, `marker`.

---

## 6. Coordinate handling

- GTA5 world coords roughly: X ∈ [-4000, 4500], Y ∈ [-4000, 8000], Z = height.
- Leaflet uses `L.CRS.Simple`; **X/Y are inverted** → marker at `L.marker([Y, X])`.
- Conversion = linear `scale` + `offset` calibration against the tileset (from `gta-v-map-leaflet`).
- Tiles: extract GTA5 tileset (Atlas/Satellite/Grid) from the `gta-v-map-leaflet` MEGA archive; serve locally. **Do this first — it's a hard dependency.**

---

## 7. Demo script (for judges)

1. **All hospitals:** "Add a safe zone at every hospital." → agent calls `findPlaces('hospital')` → Superlinked returns all ~5 → safe-zone circles drop on the map.
2. **Turf:** "Drop a mafia turf in the docks." → turf polygon appears in the dockyards.
3. **Reasoning:** "Where's the best place for a used-car market?" → Superlinked ranks large parking lots near population → agent picks one, *explains why*, places a job marker.
4. **Publish:** click **Publish** → n8n generates the FiveM resource, pushes to GitHub, triggers Aikido → show the **green security report** + the generated `config.lua`.

The "describe a world, watch it build and reason about real locations" flow is the highlight.

---

## 8. Build split (2–3 people, ~10:00 → 19:00)

1. **Map + Chat UI** — react-leaflet + GTA5 tiles, render zones/markers from ServerSpec, text chat panel.
2. **Agent core** — Gemini tool-loop, ServerSpec state machine, `findPlaces` over Superlinked, POI dataset compilation.
3. **Export + Ops** — FiveM Lua generator, n8n publish pipeline, Aikido scan. *(If only 2 people: person 2 absorbs agent+Superlinked; person 1 absorbs map+UI; share the generator/n8n/Aikido at the end.)*

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| GTA5 tileset download/setup (MEGA) | Do it **first thing**; have a static-image fallback if tiles fail |
| POI coordinate accuracy | Compile from FiveM coord lists + spot-verify on gtamap.xyz; keep dataset small but correct |
| Superlinked access (needs key from @filipmakraduli) | Grab the key/endpoint **at the opening**; fallback = stuff dataset into Gemini context (loses $500, keeps feature) |
| Gemini exact SDK/model | Confirm via DeepMind on-site temp accounts at the start; abstract the LLM call behind one module |
| Time | ServerSpec-first; get text→map→generate working end-to-end before n8n/Aikido polish |

---

## 10. Submission checklist (due 19:00)

- [ ] Public GitHub repo + comprehensive README (setup, APIs, tools)
- [ ] 2-minute Loom demo (solution + live walkthrough)
- [ ] Confirm in submission: used **Superlinked** and **n8n** → side challenges
- [ ] Aikido account → connect repo → screenshot report
- [ ] Project built fresh at the hackathon (boilerplate/forks OK)
- [ ] ≥3 Resources partners used (Gemini, Superlinked, n8n)
