# VibeRP — Research & Reuse Findings

Research done before implementation (GitHub + web + partner docs). Goal: fork/port proven pieces instead of hand-rolling.

**Active partner stack:** Gemini + Superlinked + n8n (3 qualifying Resources partners) + Aikido (bonus). *SLNG (voice) was considered and dropped — input is text-only.*

---

## 1. GTA5 map (Leaflet)

**Primary reuse target:** [`RiceaRaul/gta-v-map-leaflet`](https://github.com/RiceaRaul/gta-v-map-leaflet)
- TypeScript + Vite + Leaflet. npm: `gta-v-map`. Three tile styles: **Atlas, Satellite, Grid**.
- Tiles are **not** in the repo — extracted from an external MEGA archive into the source folder. **Hard dependency — grab first.**
- v2.0.1 is a **Lit web component**, not React → for our React app, use `react-leaflet` directly with `L.CRS.Simple` + the extracted tileset rather than the npm package.

**Coordinate conversion (critical):**
- Use `L.CRS.Simple`. **X/Y are inverted**: place markers as `L.marker([Y, X])`.
- Tile layer pattern `{z}-{x}_{y}.png`, `tileSize: 256`, `minZoom: 3`, `maxZoom: 7`.
- Game→map is a linear `scale` + `offset`; calibrate against the tileset (avoid window-resize-dependent hacks).

Sources: [cfx.re: Syncing GTA V coords in Leaflet](https://forum.cfx.re/t/syncing-gta-v-coordinates-in-leaflet-map/5320113) · [leaflet GTA V coords→LatLng](https://gisqas.blogspot.com/2015/06/leaflet-gta-v-coordinates-to-latlng.html) · [CodePen GTA V Map](https://codepen.io/kirstywright/pen/byBOXQ)

---

## 2. GTA5 POI / coordinate data

No single clean JSON dataset — **compile our own** from these and spot-verify:
- [gtamap.xyz](https://gtamap.xyz/) — interactive GTA5/FiveM coordinate map (verify points here)
- [gtalens.com/map](https://gtalens.com/map) — interactive GTA5/Online map
- [GTAForums: 100+ coordinates list](https://gtaforums.com/topic/792877-list-of-over-100-coordinates-more-comming/)
- [GTA V Map Helper (FiveM .json exporter)](https://www.gta5-mods.com/scripts/gta-v-map-helper-maxscript)
- [djoach GTA V Map Coordinates](http://djoach.free.fr/divers/GTAV/)

Plan: ~200–400 POIs across categories (hospital, parking, gas_station, beach, dock, club, landmark, police, …). Hospitals are well-known (~5). FiveM community scripts publish coordinate lists for hospitals/garages/fuel — mine those, then verify on gtamap.

---

## 3. Superlinked — semantic POI search (the agent's "map knowledge")

- Repo: [`superlinked/superlinked`](https://github.com/superlinked/superlinked) · PyPI: [`superlinked`](https://pypi.org/project/superlinked/) · [docs/examples](https://superlinked.com/docs/examples/semantic-hf-model-search)
- ⚠️ **Legacy `superlinked` pip framework is deprecated for new projects.** They now point to **SIE (Superlinked Inference Engine)**.
- Hackathon path (from the manual): **ask `@filipmakraduli` on Discord for an API key**; they provide a **cluster endpoint** usable with **Python and TypeScript clients**. There's a "SIE Hackathon Quickstart" page.
- Concepts: schema → vector **Space** (e.g. TextSimilaritySpace, NumberSpace, CategorySpace) → **Index** → **Query**. We embed POI `description`+`tags` (text) and weight `category`/`neighborhood`.
- **Our use:** index the POI dataset; expose `findPlaces(query, category?)` → ranked candidates w/ real coords for the agent to choose from. See "What Superlinked is" below.
- **Fallback** if access/time is short: load the whole POI dataset into Gemini's context and let it rank (loses the $500 challenge, keeps the feature).

### What Superlinked is (plain-English)

Superlinked is a **vector search / retrieval engine for AI apps**. Instead of keyword matching, it turns each record into an embedding (a numeric "meaning" vector) across multiple attributes — text, categories, numbers — and lets you query by *meaning* with weights per attribute. For us: a query like *"big open parking lot near downtown, good for a used-car market"* matches POIs by semantic similarity over their `description`/`tags`, not by exact words. It's purpose-built for search + recommendation, which is exactly the "which real GTA5 location fits this vibe?" problem.

---

## 4. n8n — publish pipeline

- Docs: [docs.n8n.io](https://docs.n8n.io/) · [Webhook node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook) · [Webhook+GitHub](https://n8n.io/integrations/webhook/and/github/)
- Pattern: **Webhook node** receives `POST` with `ServerSpec` (or pre-generated files) → Code/Function node builds the FiveM resource → GitHub node commits/pushes → HTTP node triggers Aikido scan.
- Can self-host (Docker) or use n8n Cloud (Pro prize). REST API also lets us trigger/manage workflows programmatically.
- Hackathon credit: **1-yr Cloud Pro + $500 Amazon** for best use.

---

## 5. Gemini — agent / function calling

- Docs: [Function calling](https://ai.google.dev/gemini-api/docs/function-calling) · [Quickstart](https://ai.google.dev/gemini-api/docs/quickstart) · [Tools](https://ai.google.dev/gemini-api/docs/tools) · [cookbook](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Function_calling.ipynb)
- Define tools as function declarations (name, description, JSON-schema params); model returns `function_call` with args; we execute, return results, loop until done.
- **Confirm exact SDK + model on-site** using the **DeepMind temporary accounts** (search results referenced a newer "Interactions API" / `gemini-3-flash-preview` — verify before committing). Abstract the LLM call behind one module so the model/SDK is swappable.

---

## 6. Aikido — security scan (bonus €1000)

- To claim: create free account → connect Git provider → connect the hackathon repo → screenshot the security report (showing # and categories of issues).
- Zero build impact. Keep the generated repo clean (no secrets, env vars only). Run near the end and screenshot.

---

## 7. FiveM resource generation target

Emit a minimal loadable resource from `ServerSpec`:
- `fxmanifest.lua` — resource manifest (name, author, scripts, version).
- `config.lua` — Lua tables for zones (PolyZone-style polygons/circles), jobs (coords + blips), safe zones.
- Reference patterns: PolyZone, common FiveM job/blip config conventions (mine `gta5-mods` / cfx forum templates during build).

---

## Open items to resolve at the event

- [ ] Get **Superlinked** API key + cluster endpoint from `@filipmakraduli`
- [ ] Get **Gemini** access via DeepMind temp accounts; confirm SDK + model id
- [ ] Download GTA5 **tileset** (MEGA) from `gta-v-map-leaflet`
- [ ] Set up **n8n** (Cloud Pro or self-host) + GitHub token
- [ ] Create **Aikido** account
