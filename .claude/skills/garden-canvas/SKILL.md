---
name: garden-canvas
description: How GardenCanvas.tsx works — coordinates, the modeless pointer-event gesture machine, selection/move/resize of beds, plant drag, pick-then-place planting with the heat map, placement rules, undo. Use before changing anything about beds, plants, zoom/pan or placement on the canvas.
---

# GardenCanvas

`src/components/garden/GardenCanvas.tsx` draws the garden and owns all gestures. Placement rules live in `placement.ts` (pure functions, shared by plant drag, the heat map and GardenPage). Page-level actions (create/delete/rename bed, plant/remove plant, undo) live in `src/pages/GardenPage.tsx`.

## The bar: Google Maps

- **Pan is 1:1**, **zoom anchors on the focal point** (pinch midpoint, wheel cursor, zoom buttons → screen centre via `zoomAt`).
- **No modes.** Drag on empty space or an unselected bed always pans. A second finger turns pending/pan into pinch; lifting one finger continues the pan without a jump.
- **Long press = 250 ms** with a filling ring (`.longpress-ring`, appears after 60 ms so taps don't flash) and `navigator.vibrate`. Movement > `TAP_SLOP` (10 px) before that cancels it.
- Touch targets ≥ 44 px (`HANDLE_HIT` = 22 px radius on screen, visuals stay small via `1/zoom` scaling).
- Smooth over clever: pan/zoom refs update immediately, React state follows; heavy work happens at gesture end.

## Coordinates

- `CELL = 48` px, `SUBCELL = 24` px, board `COLS × ROWS = 20 × 20` cells. Real scale: `CM_PER_CELL` in `src/lib/units.ts` (`formatBedSize`, `formatArea`).
- `GardenBed.x/y/width/height` = cells. `bed_plants.cell_x/cell_y` = sub-cells **relative to the bed**.
- Screen → canvas: `toCanvas()` uses `panRef`/`zoomRef`. Fresh data in handlers: `useGardenStore.getState()`, `bedPlantsRef`, `placingRef`, `relationsRef` (synced in `useLayoutEffect`, never written during render).

## Gesture machine (Pointer Events, one path for mouse + touch)

`gesture.current: Gesture` with `kind`: `pending → pan | moveBed | resize | plantDrag | pinch`. Hit test order in `hitTest()`: handle of the selected bed → plant → bed → empty.
- **Tap** (`pending` released): plant → `onPlantTap` (sheet); bed → select; empty → deselect. While `placing`: tap on a bed → `anchorFor()` (plant centred under the finger) → `evaluatePlacement()` → `onPlaceAt`.
- **Drag**: handle → `resize` (8 handles, clamped to the board, blocked on bed collision or plants falling out); body of the **selected** bed (also over its plants) → `moveBed` (clamped to board); anything else → `pan`.
- **Long press on a plant** → `plantDrag` (anchored at the grab point, clamped inside the bed, tooltip for bad/near).
- Right click on a plant (desktop) → small context menu (info / remove).
- Overlays stop `onPointerDown` propagation. `setPointerCapture` keeps moves after leaving the canvas.

## Placement rules (`placement.ts`)

`evaluatePlacement()` → `blocked` (out of bed or overlaps a plant footprint) > `bad` (bad neighbour within 1 sub-cell, both directions via `buildRelations`) > `near` (inside another plant's `around_cells_spacing`) > `good` > `ok`. `isPlaceable(status, allowBad)`: never `blocked`; `bad` only with `user_settings.allow_bad_neighbor_drop`. `heatMapForBed()` colours each sub-cell (`HEAT_COLOR`), `remainingCapacity()` = greedy estimate for the placement bar. Change rules here once — drag and heat map follow.

## Resize from the left/top

Plants are relative to the bed's top-left, so resizing via `w`/`n` shifts them: live render subtracts `shiftX/shiftY`, commit updates every plant (`shiftPlants`) so they stay at the same spot in the garden; undo reverses both.

## Persistence and undo

- Beds: optimistic `updateBed/addBed/removeBed` (bumps `bedsVersion` so stale refetches are dropped), then Supabase. Plants: `plantOverrides` / `addLocal` / `removeLocal` until refetch.
- Every user action pushes `pushUndo(label, fn)` (`src/store/useUndo.ts`) → "Razveljavi" in the StatusArea under the toolbar + toolbar undo. Drag warnings go there too via `onDragWarning` — keep the bottom free for thumb controls. No confirmation dialogs — make actions reversible instead (deleting a bed snapshots its plants and re-inserts both with the same ids).
- Free-plan limits still apply: planting handles `plant_limit_reached` with `promptUpgrade`.

## Gotchas

- Firefox mobile bottom URL bar — keep `viewport-fit=cover` / `pb-safe`.
- Test with mobile emulation (synthetic `PointerEvent`s with `pointerType: "touch"` work for scripted checks) and on a real phone; run `npm run build` and `npm run lint`.
