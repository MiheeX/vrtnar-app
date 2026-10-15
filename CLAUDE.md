# Vrtnar — garden planner

Mobile-first web app for planning a vegetable garden: the user draws beds (gredice) on a grid canvas, keeps an inventory of plants, and plants them into beds while the app checks spacing and good/bad companion ("neighbor") rules.

UI text and most code comments are in **Slovenian**. Comments may be Slovenian or English, matching the surrounding code. UI strings are currently hardcoded in Slovenian. The product will be **Slovenian + English**, so once i18n is added, new strings go through it instead of being hardcoded.

## Product direction (early stage — details still open)

- **A planning tool for a real garden, not a game.** One grid cell = **~10 cm**. Spacing and neighbor rules simulate how plants really sit next to each other.
- **Public product**, web app first, online only (no offline mode for now). Languages: Slovenian and English.
- **Several gardens per user.** The code currently assumes one (`useGarden` takes the first).
- **Inventory = plants the user plans to plant**, added from the shared plant catalog. Planting a plant uses one from the inventory, and removing it from a bed returns it.
- **Good/bad neighbors** show while dragging on the canvas, when planting next to a plant, and in the catalog.
- **Time is coming**: planting dates, care (watering), seasons/years, crop rotation.
- **Free vs premium** (to be decided): premium gets more plants, gardens, bigger gardens, more settings and features. Write limits as data (per plan), not as scattered constants, and enforce them in the database too (RLS/constraints), not only in the UI.

## Stack

- React 19 + TypeScript (strict) + Vite 8, React Compiler enabled (babel plugin)
- Tailwind CSS v4 via `@tailwindcss/vite` (no tailwind.config; `@import "tailwindcss"` in `src/index.css`)
- Supabase (`@supabase/supabase-js` v2) — auth + Postgres, accessed directly from the client
- Zustand (`src/store/useGardenStore.ts`) for canvas/bed UI state
- react-router-dom v7 (`/login`, `/garden`), lucide-react icons
- `@dnd-kit/*` is installed but the canvas uses its own mouse/touch drag logic

There is **no Vue** in this project, and no test framework yet.

## Product principles

- **The canvas must feel like Google Maps.** Panning is 1:1: the content stays under the finger/cursor. Pinch and wheel zoom anchor on the focal point. Long press and double tap are first-class gestures (moving plants, context menu). Smoothness beats feature count: no jank, no jumps, no lost touches. A canvas change that makes interaction less smooth is a regression.
- **Supabase is the source of truth.** All user data and user settings are saved to Supabase. Only per-device things go in `localStorage`: UI state like the current `mode`, the last viewport, or a setting that is about this device only. Never store user data only locally.

## Commands

```bash
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build — the main correctness check
npm run lint      # ESLint (flat config)
```

## Layout

```
src/
  App.tsx                       routes; /garden wrapped in ProtectedRoute
  lib/supabaseClient.ts         single Supabase client (env: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY)
  pages/GardenPage.tsx          orchestrator: wires hooks, modals, and GardenCanvas
  pages/LoginPage.tsx           email/password login + sign-up
  components/garden/GardenCanvas.tsx   ~2100 lines: pan/zoom, draw/move/resize beds, plant drag&drop, context menu, collisions
  components/*Modal.tsx         Inventory, PlantPicker (planting), PlantInfo (detail, swipe), PlantQuickInfo (bottom sheet), Settings
  hooks/use*.ts                 one hook per Supabase table/concern (data fetch + mutations)
  store/useGardenStore.ts       beds, mode ("pan" | "draw"), selectedBedId; only `mode` is persisted
  types/index.ts, types/garden.ts
```

## Supabase access for Claude

`.mcp.json` connects the official Supabase MCP server, limited to this project (`project_ref`); you sign in with OAuth in the browser on first use. Use it to inspect the schema, run read queries, apply migrations and generate types. Follow the `supabase-data` skill, and ask before destructive SQL: this is the live database.

## Data model (Supabase, inferred from client code — no migrations in repo; verify against the live schema via MCP)

| table | key columns |
|---|---|
| `gardens` | id, user_id, name — one auto-created per user ("Moj vrt") in `useGarden` |
| `beds` | id, user_id, garden_id, name, x, y, width, height, color — **units: grid cells** |
| `bed_plants` | id, user_id, garden_id, bed_id, plant_id, cell_x, cell_y, quantity, variety, planted_at, last_watered_at, notes — **cell_x/y in sub-cells** |
| `plants` | catalog: id, name, latin_name, img (emoji), cells_spacing, around_cells_spacing |
| `plant_neighbors` | plant_id, neighbor_id, relationship `"good" \| "bad"` (symmetric — check both directions) |
| `user_plants` | inventory: user_id, plant_id, quantity |
| `user_settings` | user_id (unique), show_sub_grid, allow_bad_neighbor_drop |
| `profiles` | typed in `types/index.ts` (plan, stripe fields) — not yet used |

`GardenPlant`, `GardenSection`, `SectionPlant` in `types/index.ts` are older shapes; current code uses `BedPlant` from `hooks/useBedPlants.ts`.

## Conventions

- Data access: call `supabase.from(...)` inside a hook in `src/hooks/` (or in the component that owns the action), update local state after the response; optimistic updates are used for settings and bed plant fields.
- Joins use PostgREST embedding: `select("*, plant:plants(...)")`. A join may come back as object or array — see `getSpacing` in `PlantPickerModal.tsx`.
- Canvas coordinates: `CELL = 48px`, `SUBCELL = 24px`. Beds live in cells, plants in sub-cells relative to their bed. See the `garden-canvas` skill before touching `GardenCanvas.tsx`.
- Every overlay/modal stops `onMouseDown`/`onTouchStart` propagation so the canvas doesn't react underneath.
- Mobile first: test touch (long-press 200 ms = context menu, pinch zoom), and Firefox mobile's bottom URL bar (`viewport-fit=cover`, `pb-safe`).

## Secrets

- `.env.local` holds the Supabase URL + publishable key; `data.txt` holds private project notes. Both are gitignored — never commit them, never print their contents.
- Never put a Supabase service-role key in client code or `VITE_*` variables.

## Git

- Work on `develop`; `main` is the release branch. Commit messages are short, often Slovenian.
