---
name: garden-canvas
description: How GardenCanvas.tsx works — coordinate system, interaction state machine, plant collision/neighbor rules, touch handling. Use before changing anything about drawing, moving or resizing beds, dragging plants, zoom/pan, the context menu, or placement validation.
---

# GardenCanvas

`src/components/garden/GardenCanvas.tsx` is a single ~2100-line component. Read the relevant section before editing; don't refactor it wholesale unless asked.

## The bar: Google Maps

Every interaction is judged against Google Maps:
- **Pan is 1:1** — the point you grabbed stays under your finger/cursor for the whole gesture, no lag or drift.
- **Zoom anchors on the focal point**: the pinch midpoint or the wheel cursor stays fixed on screen while the scale changes.
- **Gestures don't fight**: a pan never turns into a plant drag by accident. Long press (200 ms) starts plant moves or opens the context menu, a double tap is its own gesture, and a second finger turns the gesture into a pinch cleanly.
- **Smooth over clever**: avoid React re-renders on every move event where a transform/ref update would do; keep heavy work (collision checks, DB writes) out of the hot path or run it at the end of the gesture.

When changing gesture code, test on a real phone or with mobile emulation, and compare against how Google Maps feels.

## Coordinates

- `CELL = 48` px, `SUBCELL = CELL / 2 = 24` px. Board is `COLS × ROWS = 20 × 20` cells.
- `GardenBed.x/y/width/height` are **cells** (global grid).
- `bed_plants.cell_x/cell_y` are **sub-cells relative to the bed's top-left**. A bed of width W has `W * 2` sub-cells across.
- A plant occupies a square of `plant.cells_spacing` sub-cells; `around_cells_spacing` is a safety ring around it.
- Screen → canvas: `lx = (clientX - rect.left - pan.x) / zoom`. Inside callbacks use `panRef`/`zoomRef`/`bedPlantsRef`/`plantNeighborsRef` (kept in sync each render) to avoid stale closures.

## Interaction state machine

`interaction: InteractionState` — `idle | panning | drawing | moving | resizing | movingPlant`.
Mode from the store (`"pan" | "draw"`) decides what a press starts:
- **draw mode**: press on empty → `drawing` (draft bed); on bed body → `moving`; on bed edge (hit zone) → `resizing` with a `ResizeHandle`.
- **pan mode**: drag → `panning`; long press (`LONG_PRESS_MS = 200`) → context menu (plant cell / plant actions); tap plant → quick info; press-and-drag plant → `movingPlant`.
- Two-finger touch → pinch zoom (`lastPinchDist`).
`reset()` (exposed via `useImperativeHandle`) clears all transient state; GardenPage calls it on mode change.

## Placement validation (plant drag & drop / picking)

Three independent checks, all in sub-cells:
1. **Out of bounds** — `cellX + spacing > bed.width*2` (same for Y) → reject.
2. **Space collision** — dragged square overlaps another plant's `cells_spacing` square → always reject (`isSpaceCollision`).
3. **Around collision** — overlaps another plant's `around_cells_spacing` ring → warn/reject (`isAroundCollision`).
4. **Bad neighbor** — a plant with `relationship = "bad"` (either direction in `plant_neighbors`) within a 1-sub-cell ring → reject unless `user_settings.allow_bad_neighbor_drop` is on.

`PlantPickerModal.tsx` re-implements similar checks with `rectsOverlap` for the initial planting — keep both in sync when rules change.

Resizing a bed must not leave plants outside the new bounds (check around line ~280) and must not overlap another bed (`resizeCollision`).

## Persistence

- Bed changes: optimistic `updateBed` in the Zustand store, then `supabase.from("beds").update(...)`.
- Plant moves: `localPlantOverrides` show the new position immediately, then `bed_plants` update, then `onPlantsChanged()` (refetch).
- Deleting/returning a plant calls `onReturnToInventory(plantId)` → `user_plants` quantity +1.

## Gotchas (from git history)

- Context menu must close when a drag starts.
- Firefox mobile bottom URL bar shifts layout — keep `viewport-fit=cover` and `pb-safe` paddings.
- Overlays must stop `mousedown`/`touchstart` propagation or the canvas reacts underneath.
- After changes, test both mouse and touch (browser devtools mobile emulation) and run `npm run build`.
