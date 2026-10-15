import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useGardenStore } from "../../store/useGardenStore";
import type { GardenBed, ResizeHandle } from "../../types/garden";
import type { PlantNeighbor } from "../../types";
import { supabase } from "../../lib/supabaseClient";
import type { BedPlant } from "../../hooks/useBedPlants";
import { formatBedSize } from "../../lib/units";
import { notify, pushUndo } from "../../store/useUndo";
import type { DragWarning } from "../StatusArea";
import {
  anchorFor,
  buildRelations,
  evaluatePlacement,
  heatMapForBed,
  HEAT_COLOR,
  type CellStatus,
  type PlacementResult,
} from "./placement";

// ── Merila in geste ─────────────────────────────────────────────────────
export const CELL = 48;
export const SUBCELL = CELL / 2;
export const COLS = 20;
export const ROWS = 20;
const MIN_CELLS = 1;
const LONG_PRESS_MS = 250; // hitro zaporedno premikanje rastlin; obroček + vibracija potrdita
const TAP_SLOP = 10; // px — večji premik ni več tap
const HANDLE_HIT = 22; // px na zaslonu (skupaj 44 px dotik)
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;

export interface PlacingPlant {
  plantId: string;
  spacing: number;
  name: string;
  img: string | null;
}

interface Props {
  bedPlants: BedPlant[];
  plantNeighbors: PlantNeighbor[];
  allowBadNeighborDrop?: boolean;
  showSubGrid?: boolean;
  activeQuickInfoId?: string | null;
  // Način sajenja: izbrana rastlina, tap na gredico jo posadi
  placing: PlacingPlant | null;
  onPlaceAt: (bed: GardenBed, ax: number, ay: number, result: PlacementResult) => void;
  // Tap na rastlino (id) ali drugam (null → zapri info rastline)
  onPlantTap: (bedPlantId: string | null) => void;
  onPlantInfo: (bedPlantId: string) => void;
  onRemovePlant: (bedPlantId: string) => void;
  onPlantsChanged: () => void;
  // Opozorilo med vlečenjem rastline (slab sosed / preblizu) za statusno območje
  onDragWarning?: (warning: DragWarning | null) => void;
}

export interface GardenCanvasHandle {
  reset: () => void;
  // Celica na sredini trenutnega pogleda (za novo gredico)
  viewportCenterCell: () => { col: number; row: number };
}

type Target =
  | { type: "empty" }
  | { type: "bed"; bed: GardenBed }
  | { type: "plant"; bp: BedPlant; bed: GardenBed }
  | { type: "handle"; bed: GardenBed; handle: ResizeHandle };

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  target: Target;
  kind: "pending" | "pan" | "moveBed" | "resize" | "plantDrag" | "pinch";
  originPan: { x: number; y: number };
  original?: GardenBed; // gredica ob začetku premika/resize
  grabX?: number; // premik gredice: kje v gredici smo prijeli (celice)
  grabY?: number;
  startLx?: number; // resize: začetna točka (canvas px)
  startLy?: number;
  grabOffsetX?: number; // vlečenje rastline (canvas px)
  grabOffsetY?: number;
}

interface BedEdit {
  bedId: string;
  kind: "move" | "resize";
  collision: boolean;
  // Resize z leve/zgoraj: rastline ostanejo na mestu → relativni zamik (sub-celice)
  shiftX: number;
  shiftY: number;
}

interface PlantDrag {
  bedPlantId: string;
  bedId: string;
  cellX: number;
  cellY: number;
  result: PlacementResult;
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const rectsOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const vibrate = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // brez podpore — ni pomembno
  }
};

const GardenCanvas = forwardRef<GardenCanvasHandle, Props>(
  (
    {
      bedPlants,
      plantNeighbors,
      allowBadNeighborDrop = false,
      showSubGrid = false,
      activeQuickInfoId,
      placing,
      onPlaceAt,
      onPlantTap,
      onPlantInfo,
      onRemovePlant,
      onPlantsChanged,
      onDragWarning,
    },
    ref,
  ) => {
    const { beds, selectedBedId, updateBed, selectBed } = useGardenStore();
    const containerRef = useRef<HTMLDivElement>(null);

    // Pan/zoom: stanje za render, ref za geste (geste ref nastavijo takoj)
    const [pan, setPan] = useState({ x: 16, y: 16 });
    const [zoom, setZoom] = useState(1);
    const panRef = useRef(pan);
    const zoomRef = useRef(zoom);
    useLayoutEffect(() => {
      panRef.current = pan;
      zoomRef.current = zoom;
    }, [pan, zoom]);

    // Sveže vrednosti za event handlerje
    const bedPlantsRef = useRef(bedPlants);
    const placingRef = useRef(placing);
    const allowBadRef = useRef(allowBadNeighborDrop);
    useLayoutEffect(() => {
      bedPlantsRef.current = bedPlants;
      placingRef.current = placing;
      allowBadRef.current = allowBadNeighborDrop;
    }, [bedPlants, placing, allowBadNeighborDrop]);

    const relations = useMemo(() => buildRelations(plantNeighbors), [plantNeighbors]);
    const relationsRef = useRef(relations);
    useLayoutEffect(() => {
      relationsRef.current = relations;
    }, [relations]);

    const gesture = useRef<Gesture | null>(null);
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const pinch = useRef<{ dist: number; midX: number; midY: number } | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [isPanning, setIsPanning] = useState(false);
    const [ring, setRing] = useState<{ x: number; y: number; key: number } | null>(null);
    const [bedEdit, setBedEdit] = useState<BedEdit | null>(null);
    const [plantDrag, setPlantDrag] = useState<PlantDrag | null>(null);
    const [plantOverrides, setPlantOverrides] = useState<
      Record<string, { cellX: number; cellY: number }>
    >({});
    const [contextMenu, setContextMenu] = useState<{
      x: number;
      y: number;
      bedPlantId: string;
    } | null>(null);

    const clearLongPress = () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      setRing(null);
    };

    const applyPan = (p: { x: number; y: number }) => {
      panRef.current = p;
      setPan(p);
    };

    // Zoom okoli točke na zaslonu (ostane pod prstom/kurzorjem)
    const zoomAt = useCallback((screenX: number, screenY: number, nextZoom: number) => {
      const z = zoomRef.current;
      const p = panRef.current;
      const nz = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      const cx = (screenX - p.x) / z;
      const cy = (screenY - p.y) / z;
      const np = { x: screenX - cx * nz, y: screenY - cy * nz };
      zoomRef.current = nz;
      panRef.current = np;
      setZoom(nz);
      setPan(np);
    }, []);

    useImperativeHandle(ref, () => ({
      reset: () => {
        clearLongPress();
        gesture.current = null;
        pinch.current = null;
        pointers.current.clear();
        setContextMenu(null);
        setPlantDrag(null);
        setBedEdit(null);
        setIsPanning(false);
      },
      viewportCenterCell: () => {
        const rect = containerRef.current?.getBoundingClientRect();
        const z = zoomRef.current;
        const p = panRef.current;
        const sx = rect ? rect.width / 2 : 0;
        const sy = rect ? rect.height / 2 : 0;
        return {
          col: clamp(Math.floor((sx - p.x) / z / CELL), 0, COLS - 1),
          row: clamp(Math.floor((sy - p.y) / z / CELL), 0, ROWS - 1),
        };
      },
    }));

    // ── Koordinate in zadetki ─────────────────────────────────────────────

    const toCanvas = (clientX: number, clientY: number) => {
      const rect = containerRef.current!.getBoundingClientRect();
      return {
        lx: (clientX - rect.left - panRef.current.x) / zoomRef.current,
        ly: (clientY - rect.top - panRef.current.y) / zoomRef.current,
        sx: clientX - rect.left,
        sy: clientY - rect.top,
      };
    };

    const handleAt = (bed: GardenBed, lx: number, ly: number): ResizeHandle | null => {
      const r = HANDLE_HIT / zoomRef.current;
      const x0 = bed.x * CELL;
      const y0 = bed.y * CELL;
      const x1 = (bed.x + bed.width) * CELL;
      const y1 = (bed.y + bed.height) * CELL;
      const xm = (x0 + x1) / 2;
      const ym = (y0 + y1) / 2;
      const pts: [ResizeHandle, number, number][] = [
        ["nw", x0, y0], ["ne", x1, y0], ["sw", x0, y1], ["se", x1, y1],
        ["n", xm, y0], ["s", xm, y1], ["w", x0, ym], ["e", x1, ym],
      ];
      for (const [h, hx, hy] of pts)
        if (Math.abs(lx - hx) <= r && Math.abs(ly - hy) <= r) return h;
      return null;
    };

    const hitTest = (clientX: number, clientY: number): Target => {
      const { lx, ly } = toCanvas(clientX, clientY);
      const { beds: allBeds, selectedBedId: selId } = useGardenStore.getState();
      const selected = allBeds.find((b) => b.id === selId);
      if (selected && !placingRef.current) {
        const h = handleAt(selected, lx, ly);
        if (h) return { type: "handle", bed: selected, handle: h };
      }
      const plants = bedPlantsRef.current;
      for (let i = plants.length - 1; i >= 0; i--) {
        const bp = plants[i];
        const bed = allBeds.find((b) => b.id === bp.bed_id);
        if (!bed) continue;
        const s = (bp.plant?.cells_spacing ?? 1) * SUBCELL;
        const px = bed.x * CELL + bp.cell_x * SUBCELL;
        const py = bed.y * CELL + bp.cell_y * SUBCELL;
        if (lx >= px && lx < px + s && ly >= py && ly < py + s)
          return { type: "plant", bp, bed };
      }
      for (let i = allBeds.length - 1; i >= 0; i--) {
        const b = allBeds[i];
        if (
          lx >= b.x * CELL &&
          lx < (b.x + b.width) * CELL &&
          ly >= b.y * CELL &&
          ly < (b.y + b.height) * CELL
        )
          return { type: "bed", bed: b };
      }
      return { type: "empty" };
    };

    const collidesWithBeds = (
      shape: { x: number; y: number; width: number; height: number },
      excludeId: string,
    ) =>
      useGardenStore
        .getState()
        .beds.some((b) => b.id !== excludeId && rectsOverlap(shape, b));

    // Ali bi kakšna rastlina po resize padla iz gredice (ob zamiku pri resize z leve/zgoraj)
    const plantsOutside = (
      bedId: string,
      shape: { width: number; height: number },
      shiftX: number,
      shiftY: number,
    ) =>
      bedPlantsRef.current.some((bp) => {
        if (bp.bed_id !== bedId) return false;
        const s = bp.plant?.cells_spacing ?? 1;
        const x = bp.cell_x - shiftX;
        const y = bp.cell_y - shiftY;
        return x < 0 || y < 0 || x + s > shape.width * 2 || y + s > shape.height * 2;
      });

    // ── Vlečenje rastline ─────────────────────────────────────────────────

    const evaluateDrag = (bp: BedPlant, bed: GardenBed, ax: number, ay: number) =>
      evaluatePlacement({
        bed,
        plantId: bp.plant_id,
        spacing: bp.plant?.cells_spacing ?? 1,
        ax,
        ay,
        bedPlants: bedPlantsRef.current,
        relations: relationsRef.current,
        excludeId: bp.id,
      });

    const startPlantDrag = (g: Gesture, bp: BedPlant, bed: GardenBed, clientX: number, clientY: number) => {
      const { lx, ly } = toCanvas(clientX, clientY);
      g.kind = "plantDrag";
      g.grabOffsetX = lx - (bed.x * CELL + bp.cell_x * SUBCELL);
      g.grabOffsetY = ly - (bed.y * CELL + bp.cell_y * SUBCELL);
      setRing(null);
      setContextMenu(null);
      vibrate(15);
      setPlantDrag({
        bedPlantId: bp.id,
        bedId: bed.id,
        cellX: bp.cell_x,
        cellY: bp.cell_y,
        result: evaluateDrag(bp, bed, bp.cell_x, bp.cell_y),
      });
    };

    const moveDraggedPlant = (g: Gesture, clientX: number, clientY: number) => {
      if (g.target.type !== "plant") return;
      const { bp } = g.target;
      const bed = useGardenStore.getState().beds.find((b) => b.id === bp.bed_id);
      if (!bed) return;
      const { lx, ly } = toCanvas(clientX, clientY);
      const s = bp.plant?.cells_spacing ?? 1;
      const ax = clamp(
        Math.round((lx - (g.grabOffsetX ?? 0) - bed.x * CELL) / SUBCELL),
        0,
        Math.max(0, bed.width * 2 - s),
      );
      const ay = clamp(
        Math.round((ly - (g.grabOffsetY ?? 0) - bed.y * CELL) / SUBCELL),
        0,
        Math.max(0, bed.height * 2 - s),
      );
      setPlantDrag((prev) =>
        prev && prev.cellX === ax && prev.cellY === ay
          ? prev
          : { bedPlantId: bp.id, bedId: bed.id, cellX: ax, cellY: ay, result: evaluateDrag(bp, bed, ax, ay) },
      );
    };

    const commitPlantDrag = async (drag: PlantDrag) => {
      setPlantDrag(null);
      const bp = bedPlantsRef.current.find((p) => p.id === drag.bedPlantId);
      if (!bp || (bp.cell_x === drag.cellX && bp.cell_y === drag.cellY)) return;
      const { status, badNames } = drag.result;
      if (status === "blocked") return;
      if (status === "bad" && !allowBadRef.current) {
        notify(`Slab sosed: ${badNames.join(", ")}`);
        return;
      }
      const from = { cellX: bp.cell_x, cellY: bp.cell_y };
      const to = { cellX: drag.cellX, cellY: drag.cellY };
      const save = async (pos: { cellX: number; cellY: number }) => {
        setPlantOverrides((prev) => ({ ...prev, [bp.id]: pos }));
        const { error } = await supabase
          .from("bed_plants")
          .update({ cell_x: pos.cellX, cell_y: pos.cellY })
          .eq("id", bp.id);
        if (error) console.error("Napaka pri premiku rastline:", error);
        onPlantsChanged();
        setTimeout(
          () =>
            setPlantOverrides((prev) => {
              const next = { ...prev };
              delete next[bp.id];
              return next;
            }),
          1000,
        );
      };
      await save(to);
      pushUndo(`${bp.plant?.name ?? "Rastlina"} premaknjena`, () => save(from));
    };

    // ── Premik in resize gredice ──────────────────────────────────────────

    const moveBed = (g: Gesture, clientX: number, clientY: number) => {
      const o = g.original!;
      const { lx, ly } = toCanvas(clientX, clientY);
      const shape = {
        x: clamp(Math.round(lx / CELL - g.grabX!), 0, COLS - o.width),
        y: clamp(Math.round(ly / CELL - g.grabY!), 0, ROWS - o.height),
        width: o.width,
        height: o.height,
      };
      const collision = collidesWithBeds(shape, o.id);
      if (!collision) updateBed(o.id, { x: shape.x, y: shape.y });
      setBedEdit({ bedId: o.id, kind: "move", collision, shiftX: 0, shiftY: 0 });
    };

    const resizeBed = (g: Gesture, clientX: number, clientY: number) => {
      if (g.target.type !== "handle") return;
      const o = g.original!;
      const h = g.target.handle;
      const { lx, ly } = toCanvas(clientX, clientY);
      const dx = Math.round((lx - g.startLx!) / CELL);
      const dy = Math.round((ly - g.startLy!) / CELL);
      let nx = o.x;
      let ny = o.y;
      let nw = o.width;
      let nh = o.height;
      if (h.includes("e")) nw = clamp(o.width + dx, MIN_CELLS, COLS - o.x);
      if (h.includes("s")) nh = clamp(o.height + dy, MIN_CELLS, ROWS - o.y);
      if (h.includes("w")) {
        nx = clamp(o.x + dx, 0, o.x + o.width - MIN_CELLS);
        nw = o.width - (nx - o.x);
      }
      if (h.includes("n")) {
        ny = clamp(o.y + dy, 0, o.y + o.height - MIN_CELLS);
        nh = o.height - (ny - o.y);
      }
      const shiftX = (nx - o.x) * 2;
      const shiftY = (ny - o.y) * 2;
      const shape = { x: nx, y: ny, width: nw, height: nh };
      const collision =
        collidesWithBeds(shape, o.id) || plantsOutside(o.id, shape, shiftX, shiftY);
      if (!collision) {
        updateBed(o.id, shape);
        setBedEdit({ bedId: o.id, kind: "resize", collision: false, shiftX, shiftY });
      } else {
        setBedEdit((prev) => ({
          bedId: o.id,
          kind: "resize",
          collision: true,
          shiftX: prev?.shiftX ?? 0,
          shiftY: prev?.shiftY ?? 0,
        }));
      }
    };

    const syncBed = async (id: string, shape: Pick<GardenBed, "x" | "y" | "width" | "height">) => {
      const { error } = await supabase.from("beds").update(shape).eq("id", id);
      if (error) console.error("Napaka pri shranjevanju gredice:", error);
    };

    // Zamik rastlin v gredici (relativne koordinate), da ostanejo na istem mestu v vrtu
    const shiftPlants = async (bedId: string, shiftX: number, shiftY: number) => {
      if (!shiftX && !shiftY) return;
      const plants = bedPlantsRef.current.filter((bp) => bp.bed_id === bedId);
      setPlantOverrides((prev) => {
        const next = { ...prev };
        for (const bp of plants)
          next[bp.id] = { cellX: bp.cell_x - shiftX, cellY: bp.cell_y - shiftY };
        return next;
      });
      await Promise.all(
        plants.map((bp) =>
          supabase
            .from("bed_plants")
            .update({ cell_x: bp.cell_x - shiftX, cell_y: bp.cell_y - shiftY })
            .eq("id", bp.id),
        ),
      );
      onPlantsChanged();
      setTimeout(() => {
        setPlantOverrides((prev) => {
          const next = { ...prev };
          for (const bp of plants) delete next[bp.id];
          return next;
        });
      }, 1000);
    };

    const commitBedEdit = async (g: Gesture) => {
      setBedEdit(null);
      const o = g.original!;
      const now = useGardenStore.getState().beds.find((b) => b.id === o.id);
      if (!now) return;
      if (now.x === o.x && now.y === o.y && now.width === o.width && now.height === o.height)
        return;
      const before = { x: o.x, y: o.y, width: o.width, height: o.height };
      const after = { x: now.x, y: now.y, width: now.width, height: now.height };
      const shiftX = g.kind === "resize" ? (after.x - before.x) * 2 : 0;
      const shiftY = g.kind === "resize" ? (after.y - before.y) * 2 : 0;
      await syncBed(o.id, after);
      await shiftPlants(o.id, shiftX, shiftY);
      pushUndo(g.kind === "resize" ? "Velikost gredice spremenjena" : "Gredica premaknjena", async () => {
        updateBed(o.id, before);
        await syncBed(o.id, before);
        await shiftPlants(o.id, -shiftX, -shiftY);
      });
    };

    // ── Tap ───────────────────────────────────────────────────────────────

    const handleTap = (target: Target, clientX: number, clientY: number) => {
      setContextMenu(null);
      const pl = placingRef.current;
      if (pl) {
        if (target.type === "empty" || target.type === "handle") {
          notify("Tapni na gredico, kamor želiš posaditi");
          return;
        }
        const bed = target.bed;
        const { lx, ly } = toCanvas(clientX, clientY);
        const cx = clamp(Math.floor((lx - bed.x * CELL) / SUBCELL), 0, bed.width * 2 - 1);
        const cy = clamp(Math.floor((ly - bed.y * CELL) / SUBCELL), 0, bed.height * 2 - 1);
        const { ax, ay } = anchorFor(bed, cx, cy, pl.spacing);
        const result = evaluatePlacement({
          bed,
          plantId: pl.plantId,
          spacing: pl.spacing,
          ax,
          ay,
          bedPlants: bedPlantsRef.current,
          relations: relationsRef.current,
        });
        onPlaceAt(bed, ax, ay, result);
        return;
      }
      // Pokaže se info zadnjega tapnjenega elementa: rastlina zapre gredico in obratno
      if (target.type === "plant") {
        selectBed(null);
        onPlantTap(target.bp.id);
      } else if (target.type === "bed" || target.type === "handle") {
        onPlantTap(null);
        selectBed(target.bed.id);
      } else {
        onPlantTap(null);
        selectBed(null);
      }
    };

    // ── Pointer dogodki ───────────────────────────────────────────────────

    const onPointerDown = (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try {
        // Premiki ostanejo naši tudi, ko prst/miška zapusti platno
        containerRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // kazalec že ne obstaja več — ni pomembno
      }
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setContextMenu(null);

      // Drugi prst → pinch (samo, če še ne premikamo gredice/rastline)
      if (pointers.current.size === 2) {
        const g = gesture.current;
        if (g && (g.kind === "pending" || g.kind === "pan")) {
          clearLongPress();
          g.kind = "pinch";
          setIsPanning(false);
          const [a, b] = [...pointers.current.values()];
          pinch.current = {
            dist: Math.hypot(a.x - b.x, a.y - b.y),
            midX: (a.x + b.x) / 2,
            midY: (a.y + b.y) / 2,
          };
        }
        return;
      }
      if (pointers.current.size > 2) return;

      const target = hitTest(e.clientX, e.clientY);
      const g: Gesture = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        target,
        kind: "pending",
        originPan: { ...panRef.current },
      };
      gesture.current = g;

      // Dolg pritisk na rastlino → vlečenje (z obročkom, ki se polni)
      if (target.type === "plant" && !placingRef.current) {
        const { sx, sy } = toCanvas(e.clientX, e.clientY);
        setRing({ x: sx, y: sy, key: Date.now() });
        const { clientX, clientY } = e;
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = null;
          if (gesture.current === g && g.kind === "pending")
            startPlantDrag(g, target.bp, target.bed, clientX, clientY);
        }, LONG_PRESS_MS);
      }
    };

    const onPointerMove = (e: React.PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      if (!g) return;

      if (g.kind === "pinch") {
        if (pointers.current.size < 2 || !pinch.current) return;
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const rect = containerRef.current!.getBoundingClientRect();
        const z = zoomRef.current;
        const p = panRef.current;
        // točka pod prejšnjo sredino ostane pod novo sredino (zoom + pan hkrati)
        const cx = (pinch.current.midX - rect.left - p.x) / z;
        const cy = (pinch.current.midY - rect.top - p.y) / z;
        const nz = clamp(z * (dist / pinch.current.dist), MIN_ZOOM, MAX_ZOOM);
        const np = { x: midX - rect.left - cx * nz, y: midY - rect.top - cy * nz };
        zoomRef.current = nz;
        panRef.current = np;
        setZoom(nz);
        setPan(np);
        pinch.current = { dist, midX, midY };
        return;
      }
      if (e.pointerId !== g.pointerId) return;

      if (g.kind === "pending") {
        if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < TAP_SLOP) return;
        clearLongPress();
        const t = g.target;
        const selId = useGardenStore.getState().selectedBedId;
        const { lx, ly } = toCanvas(g.startX, g.startY);
        if (t.type === "handle") {
          g.kind = "resize";
          g.original = { ...t.bed };
          g.startLx = lx;
          g.startLy = ly;
        } else if (
          !placingRef.current &&
          (t.type === "bed" || t.type === "plant") &&
          t.bed.id === selId
        ) {
          // Izbrano gredico premikamo z vlečenjem (tudi čez rastline v njej)
          g.kind = "moveBed";
          g.original = { ...t.bed };
          g.grabX = lx / CELL - t.bed.x;
          g.grabY = ly / CELL - t.bed.y;
        } else {
          g.kind = "pan";
          setIsPanning(true);
        }
      }

      if (g.kind === "pan") {
        applyPan({
          x: g.originPan.x + e.clientX - g.startX,
          y: g.originPan.y + e.clientY - g.startY,
        });
      } else if (g.kind === "moveBed") {
        moveBed(g, e.clientX, e.clientY);
      } else if (g.kind === "resize") {
        resizeBed(g, e.clientX, e.clientY);
      } else if (g.kind === "plantDrag") {
        moveDraggedPlant(g, e.clientX, e.clientY);
      }
    };

    const endPointer = (e: React.PointerEvent, cancelled: boolean) => {
      pointers.current.delete(e.pointerId);
      const g = gesture.current;
      if (!g) return;

      if (g.kind === "pinch") {
        if (pointers.current.size === 1) {
          // Po pinchu nadaljuj panning s preostalim prstom (brez skoka)
          const [[id, pos]] = [...pointers.current.entries()];
          pinch.current = null;
          gesture.current = {
            pointerId: id,
            startX: pos.x,
            startY: pos.y,
            target: { type: "empty" },
            kind: "pan",
            originPan: { ...panRef.current },
          };
          setIsPanning(true);
        } else if (pointers.current.size === 0) {
          pinch.current = null;
          gesture.current = null;
          setIsPanning(false);
        }
        return;
      }
      if (e.pointerId !== g.pointerId) return;

      clearLongPress();
      gesture.current = null;
      setIsPanning(false);

      if (g.kind === "pending" && !cancelled) handleTap(g.target, e.clientX, e.clientY);
      else if (g.kind === "moveBed" || g.kind === "resize") commitBedEdit(g);
      else if (g.kind === "plantDrag") {
        if (plantDrag && !cancelled) commitPlantDrag(plantDrag);
        else setPlantDrag(null);
      }
    };

    // Desni klik na rastlino (namizje): info / odstrani
    const onContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      const t = hitTest(e.clientX, e.clientY);
      if (t.type !== "plant") return;
      const { sx, sy } = toCanvas(e.clientX, e.clientY);
      setContextMenu({ x: sx, y: sy, bedPlantId: t.bp.id });
    };

    // Kolešček: zoom okoli kurzorja (non-passive, da preprečimo scroll strani)
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        zoomAt(
          e.clientX - rect.left,
          e.clientY - rect.top,
          zoomRef.current * Math.exp(-e.deltaY * 0.0015),
        );
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, [zoomAt]);

    const zoomButton = (factor: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      zoomAt((rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2, zoomRef.current * factor);
    };

    // ── Toplotni zemljevid za sajenje ─────────────────────────────────────

    const heat = useMemo(() => {
      if (!placing) return null;
      const map = new Map<string, CellStatus[][]>();
      for (const bed of beds)
        map.set(
          bed.id,
          heatMapForBed({
            bed,
            plantId: placing.plantId,
            spacing: placing.spacing,
            bedPlants,
            relations,
          }),
        );
      return map;
    }, [placing, beds, bedPlants, relations]);

    // ── Render ────────────────────────────────────────────────────────────

    const inv = 1 / zoom; // za elemente konstantne velikosti na zaslonu
    const dragBp = plantDrag
      ? bedPlants.find((bp) => bp.id === plantDrag.bedPlantId)
      : null;
    const dragWarning =
      plantDrag && dragBp && (plantDrag.result.status === "bad" || plantDrag.result.status === "near")
        ? { bad: plantDrag.result.badNames, near: plantDrag.result.nearNames }
        : null;
    // Opozorilo med vlečenjem se prikaže v statusnem območju (GardenPage)
    const warningKey = dragWarning ? `${dragWarning.bad.join(",")}|${dragWarning.near.join(",")}` : "";
    const onDragWarningRef = useRef(onDragWarning);
    useLayoutEffect(() => {
      onDragWarningRef.current = onDragWarning;
    });
    useEffect(() => {
      if (!warningKey) {
        onDragWarningRef.current?.(null);
        return;
      }
      const [bad, near] = warningKey.split("|");
      onDragWarningRef.current?.({
        bad: bad ? bad.split(",") : [],
        near: near ? near.split(",") : [],
      });
    }, [warningKey]);

    return (
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#f5f5f0",
          cursor: isPanning ? "grabbing" : placing ? "copy" : "grab",
          touchAction: "none",
          userSelect: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e, false)}
        onPointerCancel={(e) => endPointer(e, true)}
        onContextMenu={onContextMenu}
      >
        {/* Zoom gumbi */}
        <div
          className="absolute top-3 right-3 z-30 flex flex-col gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => zoomButton(1.25)}
            aria-label="Povečaj"
            className="w-10 h-10 bg-white rounded-lg shadow text-lg flex items-center justify-center active:bg-stone-50"
          >
            +
          </button>
          <button
            onClick={() => zoomButton(0.8)}
            aria-label="Pomanjšaj"
            className="w-10 h-10 bg-white rounded-lg shadow text-lg flex items-center justify-center active:bg-stone-50"
          >
            −
          </button>
          <button
            onClick={() => {
              zoomRef.current = 1;
              setZoom(1);
              applyPan({ x: 16, y: 16 });
            }}
            aria-label="Ponastavi pogled"
            className="w-10 h-10 bg-white rounded-lg shadow text-sm flex items-center justify-center active:bg-stone-50"
          >
            ⌖
          </button>
        </div>

        {/* Vrt (transformiran) */}
        <div
          style={{
            position: "absolute",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: COLS * CELL,
            height: ROWS * CELL,
            backgroundColor: "#fafaf7",
            boxShadow: "0 0 0 1px #e7e5e4",
          }}
        >
          <svg
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            width={COLS * CELL}
            height={ROWS * CELL}
          >
            {Array.from({ length: COLS + 1 }).map((_, i) => (
              <line key={`v${i}`} x1={i * CELL} y1={0} x2={i * CELL} y2={ROWS * CELL} stroke="#e2dfd9" strokeWidth={0.5} />
            ))}
            {Array.from({ length: ROWS + 1 }).map((_, i) => (
              <line key={`h${i}`} x1={0} y1={i * CELL} x2={COLS * CELL} y2={i * CELL} stroke="#e2dfd9" strokeWidth={0.5} />
            ))}
          </svg>

          {beds.map((bed) => {
            const selected = selectedBedId === bed.id && !placing;
            const edit = bedEdit?.bedId === bed.id ? bedEdit : null;
            const bedHeat = heat?.get(bed.id);
            const shiftX = edit?.kind === "resize" ? edit.shiftX : 0;
            const shiftY = edit?.kind === "resize" ? edit.shiftY : 0;
            return (
              <div
                key={bed.id}
                style={{
                  position: "absolute",
                  left: bed.x * CELL,
                  top: bed.y * CELL,
                  width: bed.width * CELL,
                  height: bed.height * CELL,
                  backgroundColor: bed.color,
                  border: `${(selected ? 3 : 2) * Math.max(1, inv * 0.8)}px solid ${
                    edit?.collision ? "#dc2626" : selected ? "#15803d" : "#86efac"
                  }`,
                  borderRadius: 6,
                  boxSizing: "border-box",
                  boxShadow: selected ? "0 4px 18px rgba(21,128,61,0.25)" : "none",
                  zIndex: selected || edit ? 3 : 1,
                }}
              >
                {/* Pod-mreža (nastavitev ali sajenje) */}
                {(showSubGrid || placing || selected) && (
                  <svg
                    style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                    width={bed.width * CELL}
                    height={bed.height * CELL}
                  >
                    {Array.from({ length: bed.width * 2 - 1 }).map((_, i) => (
                      <line key={`sv${i}`} x1={(i + 1) * SUBCELL} y1={0} x2={(i + 1) * SUBCELL} y2={bed.height * CELL} stroke="#a8a29e" strokeWidth={0.5} strokeDasharray="2,2" />
                    ))}
                    {Array.from({ length: bed.height * 2 - 1 }).map((_, i) => (
                      <line key={`sh${i}`} x1={0} y1={(i + 1) * SUBCELL} x2={bed.width * CELL} y2={(i + 1) * SUBCELL} stroke="#a8a29e" strokeWidth={0.5} strokeDasharray="2,2" />
                    ))}
                  </svg>
                )}

                {/* Toplotni zemljevid: kam lahko posadim izbrano rastlino */}
                {bedHeat && (
                  <svg
                    style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                    width={bed.width * CELL}
                    height={bed.height * CELL}
                  >
                    {bedHeat.map((row, cy) =>
                      row.map((status, cx) => (
                        <rect
                          key={`${cx}-${cy}`}
                          x={cx * SUBCELL + 1}
                          y={cy * SUBCELL + 1}
                          width={SUBCELL - 2}
                          height={SUBCELL - 2}
                          rx={3}
                          fill={HEAT_COLOR[status]}
                        />
                      )),
                    )}
                  </svg>
                )}

                <span
                  style={{
                    position: "absolute",
                    bottom: 2,
                    left: 4,
                    fontSize: 10,
                    color: "#78716c",
                    pointerEvents: "none",
                  }}
                >
                  {bed.name}
                </span>

                {/* Rastline */}
                {bedPlants
                  .filter((bp) => bp.bed_id === bed.id)
                  .map((bp) => {
                    const s = (bp.plant?.cells_spacing ?? 1) * SUBCELL;
                    const dragged = plantDrag?.bedPlantId === bp.id;
                    const override = plantOverrides[bp.id];
                    const x = dragged ? plantDrag!.cellX : override ? override.cellX : bp.cell_x - shiftX;
                    const y = dragged ? plantDrag!.cellY : override ? override.cellY : bp.cell_y - shiftY;
                    const status = dragged ? plantDrag!.result.status : null;
                    const active = activeQuickInfoId === bp.id;
                    return (
                      <div
                        key={bp.id}
                        style={{
                          position: "absolute",
                          left: x * SUBCELL,
                          top: y * SUBCELL,
                          width: s,
                          height: s,
                          pointerEvents: "none",
                          zIndex: dragged ? 12 : 4,
                          transition: dragged ? "none" : "left 0.1s, top 0.1s",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: 3,
                            backgroundColor: dragged
                              ? status === "blocked" || (status === "bad" && !allowBadNeighborDrop)
                                ? "rgba(220,38,38,0.18)"
                                : status === "near"
                                  ? "rgba(251,191,36,0.2)"
                                  : "rgba(34,197,94,0.2)"
                              : active
                                ? "rgba(34,197,94,0.2)"
                                : "rgba(34,197,94,0.08)",
                            border: active
                              ? "2px solid rgba(34,197,94,0.85)"
                              : "1px solid rgba(34,197,94,0.25)",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            width: SUBCELL,
                            height: SUBCELL,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            transform: dragged ? "scale(1.25)" : "none",
                            filter: dragged ? "drop-shadow(0 3px 6px rgba(0,0,0,0.3))" : "none",
                          }}
                        >
                          {bp.plant?.img}
                        </div>
                      </div>
                    );
                  })}

                {/* Ročaji za velikost — 44 px dotik, vidno manjši */}
                {selected &&
                  (["nw", "ne", "sw", "se", "n", "s", "w", "e"] as ResizeHandle[]).map((h) => {
                    const corner = h.length === 2;
                    const size = (corner ? 16 : 12) * inv;
                    const left = h.includes("w") ? 0 : h.includes("e") ? bed.width * CELL : (bed.width * CELL) / 2;
                    const top = h.includes("n") ? 0 : h.includes("s") ? bed.height * CELL : (bed.height * CELL) / 2;
                    return (
                      <div
                        key={h}
                        style={{
                          position: "absolute",
                          left: left - size / 2,
                          top: top - size / 2,
                          width: size,
                          height: size,
                          borderRadius: corner ? "50%" : 4 * inv,
                          backgroundColor: "white",
                          border: `${2 * inv}px solid #15803d`,
                          boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                          pointerEvents: "none",
                          zIndex: 20,
                        }}
                      />
                    );
                  })}

                {/* Mere med premikom/resize in na izbrani gredici */}
                {(selected || edit) && (
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: -26 * inv,
                      transform: `translateX(-50%) scale(${inv})`,
                      transformOrigin: "50% 100%",
                      pointerEvents: "none",
                      zIndex: 21,
                      whiteSpace: "nowrap",
                    }}
                    className={`px-2 py-0.5 rounded-md text-xs font-semibold shadow ${
                      edit?.collision ? "bg-red-600 text-white" : "bg-stone-800 text-white"
                    }`}
                  >
                    {formatBedSize(bed.width, bed.height)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Obroček za dolg pritisk */}
        {ring && (
          <svg
            key={ring.key}
            className="longpress-ring"
            style={{
              position: "absolute",
              left: ring.x - 28,
              top: ring.y - 28,
              width: 56,
              height: 56,
              pointerEvents: "none",
              zIndex: 40,
            }}
            viewBox="0 0 56 56"
          >
            <circle cx="28" cy="28" r="24" fill="rgba(255,255,255,0.35)" stroke="rgba(21,128,61,0.25)" strokeWidth="4" />
            <circle
              cx="28"
              cy="28"
              r="24"
              fill="none"
              stroke="#15803d"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="151"
              strokeDashoffset="151"
              transform="rotate(-90 28 28)"
              style={{ animation: `longpress-fill ${LONG_PRESS_MS}ms linear forwards` }}
            />
          </svg>
        )}


        {/* Desni klik na rastlino */}
        {contextMenu && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: "absolute", left: contextMenu.x, top: contextMenu.y, zIndex: 50 }}
            className="bg-white rounded-xl shadow-lg border border-stone-200 min-w-[180px] overflow-hidden"
          >
            <button
              onClick={() => {
                onPlantInfo(contextMenu.bedPlantId);
                setContextMenu(null);
              }}
              className="w-full px-4 py-3 text-left text-sm text-stone-700 hover:bg-stone-50"
            >
              ℹ️ Info o rastlini
            </button>
            <button
              onClick={() => {
                onRemovePlant(contextMenu.bedPlantId);
                setContextMenu(null);
              }}
              className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 border-t border-stone-100"
            >
              🗑️ Odstrani rastlino
            </button>
          </div>
        )}
      </div>
    );
  },
);

GardenCanvas.displayName = "GardenCanvas";

export default GardenCanvas;
