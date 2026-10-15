# Vrtnar — garden planner

Mobile-first web app for planning a vegetable garden: the user draws beds (gredice) on a grid canvas, keeps an inventory of plants, and plants them into beds while the app checks spacing and good/bad companion ("neighbor") rules.

UI text and most code comments are in **Slovenian**. Comments may be Slovenian or English, matching the surrounding code. UI strings are currently hardcoded in Slovenian. The product will be **Slovenian + English**, so once i18n is added, new strings go through it instead of being hardcoded.

## Product direction (early stage — details still open)

- **A planning tool for a real garden, not a game.** One grid cell = **~10 cm** (`CM_PER_CELL` in `src/lib/units.ts`). Spacing and neighbor rules simulate how plants really sit next to each other.
- **Public product**, web app first, online only (no offline mode for now). Languages: Slovenian and English.
- **Several gardens per user.** `useGardens` lists them, the burger `SideMenu` switches/creates/renames/deletes; the last opened garden is remembered per device in `localStorage`. The garden count is limited per plan (`plan_limits.max_gardens`), enforced by the `gardens_enforce_limit` trigger.
- **Inventory = plants the user plans to plant**, added from the shared plant catalog. Planting a plant uses one from the inventory, and removing it from a bed returns it.
- **Good/bad neighbors** show while dragging on the canvas, when planting next to a plant, and in the catalog.
- **Time is coming**: planting dates, care (watering), seasons/years, crop rotation.
- **Subscription model: Free / Pro (Stripe).** Every new feature is designed with the plans in mind — ask "is this Free, Pro, or limited on Free?" and say so when proposing it. See **Subscriptions** below.

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
  pages/LoginPage.tsx           email/password login + sign-up + "Pozabljeno geslo?" (reset email)
  pages/ResetPasswordPage.tsx   /reset-password: set a new password from the email link
  components/garden/GardenCanvas.tsx   modeless canvas (Pointer Events): pan/pinch/wheel zoom, select/move/resize beds, plant drag, tap-to-plant with heat map
  components/garden/placement.ts       placement rules (blocked/bad/near/good/ok), heat map, capacity — shared by drag and planting
  components/garden/*.tsx              GardenFab (+), NewBedSheet (size presets), BedActionBar, PlantPlaceSheet, PlacementBar
  components/StatusArea.tsx + store/useUndo.ts  status area under the toolbar: "Razveljavi" toasts, notices, drag warnings; undo history
  lib/units.ts                  CM_PER_CELL and size/area formatting
  components/PlantSheet.tsx     plant bottom sheet, two snap points (peek ↔ full), follows the finger 1:1
  components/SideMenu.tsx       burger drawer with levels: main → Moji vrtovi / Nastavitve; Dodaj rastline; Odjava
  components/Toolbar.tsx        burger + current garden name, inventory, pan/draw mode
  components/*Modal.tsx         Inventory, PlantSelector (catalog → inventory), Upgrade
  hooks/use*.ts                 one hook per Supabase table/concern (data fetch + mutations)
  store/useGardenStore.ts       beds, bedsVersion (drops stale refetches), selectedBedId; nothing persisted
  types/index.ts, types/garden.ts
```

## Supabase access for Claude

`.mcp.json` connects the official Supabase MCP server, limited to this project (`project_ref`); you sign in with OAuth in the browser on first use. Use it to inspect the schema, run read queries, apply migrations and generate types. Follow the `supabase-data` skill, and ask before destructive SQL: this is the live database.

## Data model (Supabase — the base schema was built by hand; changes since then are in `supabase/migrations/`. Verify against the live schema via MCP)

| table | key columns |
|---|---|
| `gardens` | id, user_id, name, created_at — first one auto-created ("Moj vrt") in `useGardens`; insert limited by plan (trigger); deleting cascades to beds and bed_plants |
| `plan_limits` | plan (`free`/`pro`) PK, max_gardens, max_per_plant (NULL = unlimited), features jsonb — limits as data, read-only for clients |
| `beds` | id, user_id, garden_id, name, x, y, width, height, color — **units: grid cells** |
| `bed_plants` | id, user_id, garden_id, bed_id, plant_id, cell_x, cell_y, quantity, variety, planted_at, last_watered_at, notes — **cell_x/y in sub-cells** |
| `plants` | catalog: id, name, latin_name, img (emoji), icon (key of a custom SVG in `PlantIcon.tsx`, wins over img), cells_spacing, around_cells_spacing (canvas footprint in sub-cells — a simplification, not real spacing), row_spacing_cm / plant_spacing_cm / sow_depth_cm / germination_days_min/max / germination_temp_min_c (**real data from sources**, listed in the migration; shown in the UI), family, description, water_need / sun_need (1–3), watering_interval_days, days_to_harvest_min/max, sow_indoors / sow_outdoors / transplant / harvest (`smallint[]` of months 1–12, Slovenian climate; helpers in `src/lib/season.ts`). days_to_harvest counts from planting into the bed (or direct sowing). Catalog data must be real and sourced; note sources in the migration. Always render plants with `<PlantIcon icon emoji />` (custom SVG or Twemoji image), never the raw emoji |
| `plant_neighbors` | plant_id, neighbor_id, relationship `"good" \| "bad"` (symmetric — check both directions; one row per pair), sources (text[], e.g. BUND, Pušenjak) — built from sources, rule and conflicts documented in `20261016140000_plant_neighbors_sourced.sql` |
| `user_plants` | inventory: user_id, plant_id, quantity |
| `user_settings` | user_id (unique), show_sub_grid, allow_bad_neighbor_drop, plant_from_inventory (planting only from inventory, each plant uses one) |
| `profiles` | plan (`free`/`pro`), stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, cancel_at_period_end — written only by the `stripe-webhook` Edge Function. Clients may only update username, full_name, avatar_url (column grants) |

`GardenPlant`, `GardenSection`, `SectionPlant` in `types/index.ts` are older shapes; current code uses `BedPlant` from `hooks/useBedPlants.ts`.

## Subscriptions (Free / Pro)

- **Plans:** `free` (default) and `pro` (paid, Stripe). Free today: 1 garden, 10 of each plant type (inventory + planted across all gardens). Pro: unlimited. Numbers live only in the `plan_limits` table — change a row, not code.
- **Limits are data and enforced in the database.** Triggers raise `garden_limit_reached` / `plant_limit_reached` (`gardens_enforce_limit`, `user_plants_enforce_limit`, `bed_plants_enforce_limit`, helper `limits_for_user`). The UI only shows usage and disables actions; it must handle these errors with `limitErrorOf()` from `src/lib/plans.ts`.
- **New limited thing** → add a nullable column to `plan_limits` (NULL = unlimited) + a trigger/RLS check + UI via `usePlan().limits`. **New Pro-only feature** → a key in `plan_limits.features` (jsonb) checked with `hasFeature(limits, "key")` in UI *and* in the DB/Edge Function that does the work. Never trust the client for plan checks.
- **Client:** `usePlan(userId)` = plan, subscription, limits (source of truth in UI). `src/lib/billing.ts` → `startProCheckout()`, `openBillingPortal()`. Upsell copy: "Nadgradi na Pro" with the `Sparkles` icon, amber styling. **Every action that would exceed Free calls `promptUpgrade(reason, detail?)`** (`src/store/useUpgradePrompt.ts`) — before the request when the UI already knows the limit is reached, and again when the DB answers `*_limit_reached`. That opens the centered `UpgradeModal`. A new limited resource adds its `UpgradeReason` and text in `UpgradeModal`.
- **Stripe** runs only in Supabase Edge Functions (`supabase/functions/`): `create-checkout-session`, `create-portal-session` (JWT), `stripe-webhook` (no JWT, verifies Stripe signature). The webhook is the only writer of `profiles.plan` and subscription fields; `active`, `trialing`, `past_due` = Pro. Secrets (Supabase dashboard → Edge Functions → Secrets): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, optional `SITE_URL`, `ALLOWED_ORIGINS`. Never put a Stripe secret key in client code or `VITE_*`/`NEXT_PUBLIC_*`.
- `profiles` is in Realtime, so a plan change after payment shows up without reload.

## Conventions

- Data access: call `supabase.from(...)` inside a hook in `src/hooks/` (or in the component that owns the action), update local state after the response; optimistic updates are used for settings and bed plant fields.
- Joins use PostgREST embedding: `select("*, plant:plants(...)")`. A join may come back as object or array — see `getSpacing` in `PlantPickerModal.tsx`.
- Canvas coordinates: `CELL = 48px`, `SUBCELL = 24px`. Beds live in cells, plants in sub-cells relative to their bed. See the `garden-canvas` skill before touching `GardenCanvas.tsx`.
- Mobile first: no modes — tap selects, drag pans (or moves the selected bed), long press 250 ms drags a plant, + button adds beds/plants. User actions are reversible via `pushUndo` instead of confirm dialogs. Test touch + pinch in mobile emulation, and Firefox mobile's bottom URL bar (`viewport-fit=cover`, `pb-safe`).
- Overlays/modals stop `onPointerDown` propagation so the canvas doesn't react underneath.

## Secrets

- `.env.local` holds the Supabase URL + publishable key; `data.txt` holds private project notes. Both are gitignored — never commit them, never print their contents.
- Never put a Supabase service-role key in client code or `VITE_*` variables.

## Git

- Work on `develop`; `main` is the release branch. Commit messages are short, often Slovenian.
