import React, {
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useEffect,
} from "react";
import { useGardenStore, BED_COLORS } from "../../store/useGardenStore";
import type { GardenBed, DraftBed, ResizeHandle } from "../../types/garden";
import type { PlantNeighbor } from "../../types";
import { supabase } from "../../lib/supabaseClient";
import type { BedPlant } from "../../hooks/useBedPlants";

const CELL = 48;
const SUBCELL = CELL / 2;
const COLS = 20;
const ROWS = 20;
const MIN_CELLS = 1;
const LONG_PRESS_MS = 500;

interface Props {
  onBedSelect: (bed: GardenBed) => void;
  onPlantCell: (bedId: string, cellX: number, cellY: number) => void;
  onPlantsChanged: () => void;
  bedPlants: BedPlant[];
  userId: string;
  gardenId: string;
  onReturnToInventory: (plantId: string) => void;
  plantNeighbors: PlantNeighbor[];
  allowBadNeighborDrop?: boolean;
}

export interface GardenCanvasHandle {
  reset: () => void;
}

type InteractionState =
  | { type: "idle" }
  | {
      type: "panning";
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    }
  | { type: "drawing"; draft: DraftBed }
  | { type: "moving"; bedId: string; offsetX: number; offsetY: number }
  | {
      type: "resizing";
      bedId: string;
      handle: ResizeHandle;
      startX: number;
      startY: number;
      original: GardenBed;
    }
  | {
      type: "movingPlant";
      bedPlantId: string;
      bedId: string;
      // trenutna pozicija v sub-celicah (znotraj gredice)
      cellX: number;
      cellY: number;
      // offset od levega zgornjega kota rastline do točke kjer smo prijeli
      grabOffsetX: number;
      grabOffsetY: number;
    };

interface ContextMenu {
  x: number;
  y: number;
  type: "cell" | "plant";
  bedId: string;
  cellX?: number;
  cellY?: number;
  bedPlantId?: string;
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const normalizeDraft = (d: DraftBed) => ({
  x: Math.min(d.startX, d.endX),
  y: Math.min(d.startY, d.endY),
  width: Math.abs(d.endX - d.startX) + 1,
  height: Math.abs(d.endY - d.startY) + 1,
});

const GardenCanvas = forwardRef<GardenCanvasHandle, Props>(
  (
    {
      onBedSelect,
      onPlantCell,
      onPlantsChanged,
      bedPlants,
      userId,
      gardenId,
      onReturnToInventory,
      plantNeighbors,
      allowBadNeighborDrop = false,
    },
    ref,
  ) => {
    const {
      beds,
      mode,
      addBed,
      updateBed,
      selectBed,
      selectedBedId,
      removeBed,
    } = useGardenStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const panRef = useRef({ x: 0, y: 0 });
    const zoomRef = useRef(1);
    panRef.current = pan; //premikanje in start rastline glede na zoom canvasa
    zoomRef.current = zoom; //premikanje in start rastline glede na zoom canvasa
    const [interaction, setInteraction] = useState<InteractionState>({
      type: "idle",
    });
    const [draft, setDraft] = useState<DraftBed | null>(null);
    const [colorIndex, setColorIndex] = useState(0);
    const [resizeCollision, setResizeCollision] = useState(false);
    const pendingDrawStart = useRef<{ col: number; row: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isSpaceCollision, setIsSpaceCollision] = useState(false);
    const [isAroundCollision, setIsAroundCollision] = useState(false);

    // Lokalna pozicija rastline med vlečenjem (za optimistični prikaz)
    const [draggingPlantPos, setDraggingPlantPos] = useState<{
      cellX: number;
      cellY: number;
    } | null>(null);
    const [localPlantOverrides, setLocalPlantOverrides] = useState<
      Record<string, { cellX: number; cellY: number }>
    >({});

    // Drag & drop validacija
    const [isBadDrop, setIsBadDrop] = useState(false);
    const [dragTooltip, setDragTooltip] = useState<{
      x: number;
      y: number;
      badNeighborNames: string[];
      currentBadNames: string[];
    } | null>(null);

    // Ref za svež bedPlants znotraj event callbackov
    const bedPlantsRef = useRef(bedPlants);
    bedPlantsRef.current = bedPlants;
    const plantNeighborsRef = useRef(plantNeighbors);
    plantNeighborsRef.current = plantNeighbors;

    useImperativeHandle(ref, () => ({
      reset: () => {
        setDraft(null);
        setInteraction({ type: "idle" });
        setResizeCollision(false);
        setContextMenu(null);
        setDraggingPlantPos(null);
        setIsBadDrop(false);
        setDragTooltip(null);
      },
    }));

    // ── Koordinatni pomočniki ──────────────────────────────────────────────

    // Pretvori client koordinate v sub-celico znotraj gredice (z ref vrednostmi)
    const toSubCellRef = useCallback(
      (clientX: number, clientY: number, bed: GardenBed) => {
        const rect = containerRef.current!.getBoundingClientRect();
        const lx = (clientX - rect.left - panRef.current.x) / zoomRef.current;
        const ly = (clientY - rect.top - panRef.current.y) / zoomRef.current;
        return {
          cellX: clamp(
            Math.floor((lx - bed.x * CELL) / SUBCELL),
            0,
            bed.width * 2 - 1,
          ),
          cellY: clamp(
            Math.floor((ly - bed.y * CELL) / SUBCELL),
            0,
            bed.height * 2 - 1,
          ),
        };
      },
      [],
    );

    // Pretvori client koordinate v celico na glavnem gridu (z state vrednostmi)
    const toCell = useCallback(
      (clientX: number, clientY: number) => {
        const rect = containerRef.current!.getBoundingClientRect();
        const x = (clientX - rect.left - pan.x) / zoom;
        const y = (clientY - rect.top - pan.y) / zoom;
        return {
          col: clamp(Math.floor(x / CELL), 0, COLS - 1),
          row: clamp(Math.floor(y / CELL), 0, ROWS - 1),
        };
      },
      [pan, zoom],
    );

    // toSubCell z state vrednostmi (za context menu in enkratne akcije)
    const toSubCell = useCallback(
      (clientX: number, clientY: number, bed: GardenBed) => {
        const rect = containerRef.current!.getBoundingClientRect();
        const lx = (clientX - rect.left - pan.x) / zoom;
        const ly = (clientY - rect.top - pan.y) / zoom;
        return {
          cellX: clamp(
            Math.floor((lx - bed.x * CELL) / SUBCELL),
            0,
            bed.width * 2 - 1,
          ),
          cellY: clamp(
            Math.floor((ly - bed.y * CELL) / SUBCELL),
            0,
            bed.height * 2 - 1,
          ),
        };
      },
      [pan, zoom],
    );

    // ── Gredice: kolizija in sync ─────────────────────────────────────────

    const hasCollision = (
      norm: { x: number; y: number; width: number; height: number },
      excludeId?: string,
    ) =>
      beds.some((bed) => {
        if (excludeId && bed.id === excludeId) return false;
        return (
          norm.x < bed.x + bed.width &&
          norm.x + norm.width > bed.x &&
          norm.y < bed.y + bed.height &&
          norm.y + norm.height > bed.y
        );
      });

    const syncBedToSupabase = useCallback(
      async (id: string, updates: Partial<GardenBed>) => {
        const { error } = await supabase
          .from("beds")
          .update(updates)
          .eq("id", id);
        if (error) console.error("Napaka pri sync gredice:", error);
      },
      [],
    );

    // ── Context menu ──────────────────────────────────────────────────────

    const openContextMenu = useCallback(
      (clientX: number, clientY: number, options?: { plantId?: string }) => {
        if (mode !== "pan") return;
        const rect = containerRef.current!.getBoundingClientRect();
        const lx = (clientX - rect.left - pan.x) / zoom;
        const ly = (clientY - rect.top - pan.y) / zoom;
        const bed = beds.find(
          (b) =>
            lx >= b.x * CELL &&
            lx <= (b.x + b.width) * CELL &&
            ly >= b.y * CELL &&
            ly <= (b.y + b.height) * CELL,
        );
        if (!bed) return;
        if (options?.plantId) {
          setContextMenu({
            x: clientX - rect.left,
            y: clientY - rect.top,
            type: "plant",
            bedId: bed.id,
            bedPlantId: options.plantId,
          });
        } else {
          const { cellX, cellY } = toSubCell(clientX, clientY, bed);
          setContextMenu({
            x: clientX - rect.left,
            y: clientY - rect.top,
            type: "cell",
            bedId: bed.id,
            cellX,
            cellY,
          });
        }
      },
      [mode, beds, pan, zoom, toSubCell],
    );

    const onContextMenu = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY);
      },
      [openContextMenu],
    );

    const clearLongPress = useCallback(() => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }, []);

    // ── Drag & drop rastline ──────────────────────────────────────────────

    const startPlantDrag = useCallback(
      (bp: BedPlant, clientX: number, clientY: number) => {
        const bed = beds.find((b) => b.id === bp.bed_id);
        if (!bed) return;
        setDragTooltip(null);
        setIsBadDrop(false);
        setIsSpaceCollision(false);
        setIsAroundCollision(false);
        setDraggingPlantPos({ cellX: bp.cell_x, cellY: bp.cell_y });
        setInteraction({
          type: "movingPlant",
          bedPlantId: bp.id,
          bedId: bp.bed_id,
          cellX: bp.cell_x,
          cellY: bp.cell_y,
          grabOffsetX: 0,
          grabOffsetY: 0,
        });
      },
      [beds],
    );

    // Vrne info o slabih sosedjh — uporablja REFS za svež bedPlants/plantNeighbors
    const getBadNeighborInfo = useCallback(
      (
        draggingBpId: string,
        bedId: string,
        cellX: number,
        cellY: number,
      ): {
        isBad: boolean;
        badNeighborNames: string[];
        currentBadNames: string[];
      } => {
        const currentBedPlants = bedPlantsRef.current;
        const currentNeighbors = plantNeighborsRef.current;

        const draggingBp = currentBedPlants.find(
          (bp) => bp.id === draggingBpId,
        );
        if (!draggingBp?.plant)
          return { isBad: false, badNeighborNames: [], currentBadNames: [] };

        // IDs vseh slabih sosedov za to vrsto rastline
        const allBadNeighborIds = currentNeighbors
          .filter(
            (pn) =>
              pn.relationship === "bad" &&
              (pn.plant_id === draggingBp.plant_id ||
                pn.neighbor_id === draggingBp.plant_id),
          )
          .map((pn) =>
            pn.plant_id === draggingBp.plant_id ? pn.neighbor_id : pn.plant_id,
          );

        // Slabe rastline ki so dejansko v tej gredici
        const allBadInBed = currentBedPlants.filter(
          (bp) =>
            bp.bed_id === bedId &&
            bp.id !== draggingBpId &&
            allBadNeighborIds.includes(bp.plant_id),
        );

        const badNeighborNames = [
          ...new Set(
            allBadInBed.map(
              (bp): string => `${bp.plant?.img ?? ""} ${bp.plant?.name ?? ""}`,
            ),
          ),
        ];

        // Slabe rastline ki so trenutno v dosegu (glede na razdaljo)
        const currentBadNames: string[] = [];
        for (const neighbor of allBadInBed) {
          if (!neighbor.plant) continue;
          const spacing = draggingBp.plant.cells_spacing ?? 1;
          const neighborSpacing = neighbor.plant.cells_spacing ?? 1;
          const totalSpacing = spacing + neighborSpacing;
          const dx = Math.abs(neighbor.cell_x - cellX);
          const dy = Math.abs(neighbor.cell_y - cellY);
          if (dx < totalSpacing && dy < totalSpacing) {
            const label = `${neighbor.plant.img ?? ""} ${neighbor.plant.name}`;
            if (!currentBadNames.includes(label)) currentBadNames.push(label);
          }
        }

        return {
          isBad: currentBadNames.length > 0,
          badNeighborNames,
          currentBadNames,
        };
      },
      [], // Namerno prazno — vedno bere iz refs
    );

    // Preveri če se rastlina prostorsko prekriva z obstoječo — uporablja REFS
    const checkSpaceCollision = useCallback(
      (
        draggingBpId: string,
        bedId: string,
        cellX: number,
        cellY: number,
      ): boolean => {
        const currentBedPlants = bedPlantsRef.current;
        const draggingBp = currentBedPlants.find(
          (bp) => bp.id === draggingBpId,
        );
        if (!draggingBp?.plant) return false;

        return currentBedPlants.some((bp) => {
          if (bp.bed_id !== bedId || bp.id === draggingBpId) return false;
          if (!bp.plant) return false;

          const neighborSize = bp.plant.cells_spacing ?? 1;

          // cells_spacing se širi desno in dol od ikone (zgornji levi kot)
          return (
            cellX >= bp.cell_x &&
            cellX < bp.cell_x + neighborSize &&
            cellY >= bp.cell_y &&
            cellY < bp.cell_y + neighborSize
          );
        });
      },
      [],
    );

    const checkAroundSpacingCollision = useCallback(
      (
        draggingBpId: string,
        bedId: string,
        cellX: number,
        cellY: number,
      ): boolean => {
        const currentBedPlants = bedPlantsRef.current;
        const draggingBp = currentBedPlants.find(
          (bp) => bp.id === draggingBpId,
        );
        if (!draggingBp?.plant) return false;

        return currentBedPlants.some((bp) => {
          if (bp.bed_id !== bedId || bp.id === draggingBpId) return false;
          if (!bp.plant) return false;

          const neighborSize = bp.plant.cells_spacing ?? 1;
          const neighborAround = bp.plant.around_cells_spacing ?? 0;

          // around cona: pravokotnik z around pasom okoli cells_spacing območja
          const inAroundZone =
            cellX >= bp.cell_x - neighborAround &&
            cellX < bp.cell_x + neighborSize + neighborAround &&
            cellY >= bp.cell_y - neighborAround &&
            cellY < bp.cell_y + neighborSize + neighborAround;

          // ni znotraj cells_spacing (to že pokriva checkSpaceCollision)
          const inSpaceZone =
            cellX >= bp.cell_x &&
            cellX < bp.cell_x + neighborSize &&
            cellY >= bp.cell_y &&
            cellY < bp.cell_y + neighborSize;

          return inAroundZone && !inSpaceZone;
        });
      },
      [],
    );

    const updatePlantDragPos = useCallback(
      (
        clientX: number,
        clientY: number,
        state: Extract<InteractionState, { type: "movingPlant" }>,
      ) => {
        const bed = beds.find((b) => b.id === state.bedId);
        if (!bed) return;

        const rect = containerRef.current!.getBoundingClientRect();
        const z = zoomRef.current;
        const p = panRef.current;
        const canvasX = (clientX - rect.left - p.x) / z;
        const canvasY = (clientY - rect.top - p.y) / z;
        const newCellX = clamp(
          Math.floor((canvasX - bed.x * CELL) / SUBCELL),
          0,
          bed.width * 2 - 1,
        );
        const newCellY = clamp(
          Math.floor((canvasY - bed.y * CELL) / SUBCELL),
          0,
          bed.height * 2 - 1,
        );

        setDraggingPlantPos({ cellX: newCellX, cellY: newCellY });
        setInteraction({ ...state, cellX: newCellX, cellY: newCellY });

        const { isBad, badNeighborNames, currentBadNames } = getBadNeighborInfo(
          state.bedPlantId,
          state.bedId,
          newCellX,
          newCellY,
        );
        const hasSpaceCollision = checkSpaceCollision(
          state.bedPlantId,
          state.bedId,
          newCellX,
          newCellY,
        );
        setIsSpaceCollision(hasSpaceCollision);
        setIsBadDrop(isBad || hasSpaceCollision);

        const hasAroundCollision =
          !hasSpaceCollision &&
          checkAroundSpacingCollision(
            state.bedPlantId,
            state.bedId,
            newCellX,
            newCellY,
          );

        setIsSpaceCollision(hasSpaceCollision);
        setIsAroundCollision(hasAroundCollision);
        setIsBadDrop(isBad || hasSpaceCollision);

        const tooltipX =
          rect.left + p.x + (bed.x * CELL + newCellX * SUBCELL) * z;
        const tooltipY =
          rect.top + p.y + (bed.y * CELL + newCellY * SUBCELL) * z - 12;

        if (hasSpaceCollision) {
          setDragTooltip({
            x: tooltipX,
            y: tooltipY,
            badNeighborNames: [],
            currentBadNames: ["🚫 Ni prostora — celica je zasedena"],
          });
        } else if (hasAroundCollision) {
          setDragTooltip({
            x: tooltipX,
            y: tooltipY,
            badNeighborNames: [],
            currentBadNames: ["⚠️ Preblizu drugi rastlini"],
          });
        } else if (isBad && badNeighborNames.length > 0) {
          setDragTooltip({
            x: tooltipX,
            y: tooltipY,
            badNeighborNames,
            currentBadNames,
          });
        } else {
          setDragTooltip(null);
        }
      },
      [
        beds,
        getBadNeighborInfo,
        checkSpaceCollision,
        checkAroundSpacingCollision,
      ],
    );

    const commitPlantDrop = useCallback(
      async (state: Extract<InteractionState, { type: "movingPlant" }>) => {
        setDragTooltip(null);
        setInteraction({ type: "idle" });
        setDraggingPlantPos(null);
        setIsSpaceCollision(false);
        setIsAroundCollision(false);

        // Preveri svež isBadDrop — če je slab sosed ali prostor zaseden
        const hasSpaceCollision = checkSpaceCollision(
          state.bedPlantId,
          state.bedId,
          state.cellX,
          state.cellY,
        );
        const { isBad } = getBadNeighborInfo(
          state.bedPlantId,
          state.bedId,
          state.cellX,
          state.cellY,
        );

        setIsBadDrop(false);

        if ((isBad || hasSpaceCollision) && !allowBadNeighborDrop) {
          // Vrni na prvotno mesto — ne shranimo
          return;
        }

        // Optimistično posodobi UI
        setLocalPlantOverrides((prev) => ({
          ...prev,
          [state.bedPlantId]: { cellX: state.cellX, cellY: state.cellY },
        }));

        const { error } = await supabase
          .from("bed_plants")
          .update({ cell_x: state.cellX, cell_y: state.cellY })
          .eq("id", state.bedPlantId);

        if (error) {
          console.error("Napaka pri premiku rastline:", error);
          setLocalPlantOverrides((prev) => {
            const next = { ...prev };
            delete next[state.bedPlantId];
            return next;
          });
        } else {
          onPlantsChanged();
          setTimeout(() => {
            setLocalPlantOverrides((prev) => {
              const next = { ...prev };
              delete next[state.bedPlantId];
              return next;
            });
          }, 1000);
        }
      },
      [
        onPlantsChanged,
        allowBadNeighborDrop,
        checkSpaceCollision,
        getBadNeighborInfo,
      ],
    );

    // ── Touch ─────────────────────────────────────────────────────────────

    const lastPinchDist = useRef<number | null>(null);
    const lastPinchMid = useRef<{ x: number; y: number } | null>(null);

    const onTouchStart = useCallback(
      (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
          clearLongPress();
          pendingDrawStart.current = null;
          if (interaction.type === "drawing") setInteraction({ type: "idle" });
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          lastPinchDist.current = Math.hypot(dx, dy);
          lastPinchMid.current = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
          };
          return;
        }
        if (draft) {
          if (e.touches.length === 1 && lastPinchDist.current === null) {
            const touch = e.touches[0];
            setInteraction({
              type: "panning",
              startX: touch.clientX,
              startY: touch.clientY,
              originX: panRef.current.x,
              originY: panRef.current.y,
            });
          }
          return;
        }
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const { col, row } = toCell(touch.clientX, touch.clientY);
        if (mode === "pan") {
          setInteraction({
            type: "panning",
            startX: touch.clientX,
            startY: touch.clientY,
            originX: pan.x,
            originY: pan.y,
          });
          return;
        }
        const rect = containerRef.current!.getBoundingClientRect();
        const lx = (touch.clientX - rect.left - pan.x) / zoom;
        const ly = (touch.clientY - rect.top - pan.y) / zoom;
        const HIT = 24;
        const touchedBed = beds.find(
          (b) =>
            lx >= b.x * CELL - HIT &&
            lx <= (b.x + b.width) * CELL + HIT &&
            ly >= b.y * CELL - HIT &&
            ly <= (b.y + b.height) * CELL + HIT,
        );
        if (touchedBed) {
          const bx = touchedBed.x * CELL,
            by = touchedBed.y * CELL;
          const bw = touchedBed.width * CELL,
            bh = touchedBed.height * CELL;
          const EDGE = 32;
          const onLeft = lx - bx < EDGE,
            onRight = bx + bw - lx < EDGE;
          const onTop = ly - by < EDGE,
            onBottom = by + bh - ly < EDGE;
          if (onLeft || onRight || onTop || onBottom) {
            let handle: ResizeHandle = "se";
            if (onTop && onLeft) handle = "nw";
            else if (onTop && onRight) handle = "ne";
            else if (onBottom && onLeft) handle = "sw";
            else if (onBottom && onRight) handle = "se";
            else if (onTop) handle = "n";
            else if (onBottom) handle = "s";
            else if (onLeft) handle = "w";
            else if (onRight) handle = "e";
            setInteraction({
              type: "resizing",
              bedId: touchedBed.id,
              handle,
              startX: lx,
              startY: ly,
              original: { ...touchedBed },
            });
            return;
          }
          setInteraction({
            type: "moving",
            bedId: touchedBed.id,
            offsetX: lx / CELL - touchedBed.x,
            offsetY: ly / CELL - touchedBed.y,
          });
          return;
        }
        pendingDrawStart.current = { col, row };
      },
      [mode, beds, pan, zoom, toCell, draft, interaction, clearLongPress],
    );

    const onTouchStartWithLongPress = useCallback(
      (e: React.TouchEvent) => {
        if (e.touches.length === 1 && mode === "pan") {
          const touch = e.touches[0];
          longPressTimer.current = setTimeout(() => {
            openContextMenu(touch.clientX, touch.clientY);
          }, LONG_PRESS_MS);
        }
        onTouchStart(e);
      },
      [mode, openContextMenu, onTouchStart],
    );

    const onTouchMove = useCallback(
      (e: React.TouchEvent) => {
        clearLongPress();
        if (e.touches.length === 2) {
          if (lastPinchDist.current === null || lastPinchMid.current === null)
            return;
          const t1 = e.touches[0],
            t2 = e.touches[1];
          const newMidX = (t1.clientX + t2.clientX) / 2;
          const newMidY = (t1.clientY + t2.clientY) / 2;
          const newDist = Math.hypot(
            t1.clientX - t2.clientX,
            t1.clientY - t2.clientY,
          );
          const scaleRatio = newDist / lastPinchDist.current;
          const currentZoom = zoomRef.current,
            currentPan = panRef.current;
          const rect = containerRef.current!.getBoundingClientRect();
          const canvasPointX =
            (lastPinchMid.current.x - rect.left - currentPan.x) / currentZoom;
          const canvasPointY =
            (lastPinchMid.current.y - rect.top - currentPan.y) / currentZoom;
          const newZoom = clamp(currentZoom * scaleRatio, 0.3, 2.5);
          const newPanX = newMidX - rect.left - canvasPointX * newZoom;
          const newPanY = newMidY - rect.top - canvasPointY * newZoom;
          zoomRef.current = newZoom;
          panRef.current = { x: newPanX, y: newPanY };
          setZoom(newZoom);
          setPan({ x: newPanX, y: newPanY });
          lastPinchDist.current = newDist;
          lastPinchMid.current = { x: newMidX, y: newMidY };
          return;
        }
        if (e.touches.length !== 1) return;
        if (lastPinchDist.current !== null) return;
        if (
          pendingDrawStart.current &&
          interaction.type === "idle" &&
          mode === "draw"
        ) {
          const { col, row } = pendingDrawStart.current;
          setDraft({ startX: col, startY: row, endX: col, endY: row });
          setInteraction({
            type: "drawing",
            draft: { startX: col, startY: row, endX: col, endY: row },
          });
          pendingDrawStart.current = null;
        }
        const touch = e.touches[0];
        if (interaction.type === "movingPlant") {
          updatePlantDragPos(touch.clientX, touch.clientY, interaction);
          return;
        }
        if (interaction.type === "panning") {
          const newPan = {
            x: interaction.originX + touch.clientX - interaction.startX,
            y: interaction.originY + touch.clientY - interaction.startY,
          };
          panRef.current = newPan;
          setPan(newPan);
        } else if (interaction.type === "drawing") {
          const { col, row } = toCell(touch.clientX, touch.clientY);
          const newDraft = { ...interaction.draft, endX: col, endY: row };
          setDraft(newDraft);
          setInteraction({ type: "drawing", draft: newDraft });
        } else if (interaction.type === "moving") {
          const rect = containerRef.current!.getBoundingClientRect();
          const lx =
            (touch.clientX - rect.left - panRef.current.x) / zoomRef.current;
          const ly =
            (touch.clientY - rect.top - panRef.current.y) / zoomRef.current;
          const movedBed = beds.find((b) => b.id === interaction.bedId)!;
          const newShape = {
            x: clamp(
              Math.round(lx / CELL - interaction.offsetX),
              0,
              COLS - movedBed.width,
            ),
            y: clamp(
              Math.round(ly / CELL - interaction.offsetY),
              0,
              ROWS - movedBed.height,
            ),
            width: movedBed.width,
            height: movedBed.height,
          };
          if (!hasCollision(newShape, interaction.bedId))
            updateBed(interaction.bedId, { x: newShape.x, y: newShape.y });
        } else if (interaction.type === "resizing") {
          const rect = containerRef.current!.getBoundingClientRect();
          const lx =
            (touch.clientX - rect.left - panRef.current.x) / zoomRef.current;
          const ly =
            (touch.clientY - rect.top - panRef.current.y) / zoomRef.current;
          const dx = Math.round((lx - interaction.startX) / CELL);
          const dy = Math.round((ly - interaction.startY) / CELL);
          const o = interaction.original,
            h = interaction.handle;
          let nx = o.x,
            ny = o.y,
            nw = o.width,
            nh = o.height;
          if (h.includes("e")) nw = Math.max(MIN_CELLS, o.width + dx);
          if (h.includes("s")) nh = Math.max(MIN_CELLS, o.height + dy);
          if (h.includes("w")) {
            nx = clamp(o.x + dx, 0, o.x + o.width - MIN_CELLS);
            nw = o.width - (nx - o.x);
          }
          if (h.includes("n")) {
            ny = clamp(o.y + dy, 0, o.y + o.height - MIN_CELLS);
            nh = o.height - (ny - o.y);
          }
          const newShape = { x: nx, y: ny, width: nw, height: nh };
          if (!hasCollision(newShape, interaction.bedId)) {
            setResizeCollision(false);
            updateBed(interaction.bedId, newShape);
          } else setResizeCollision(true);
        }
      },
      [
        interaction,
        toCell,
        updateBed,
        beds,
        clearLongPress,
        updatePlantDragPos,
        mode,
      ],
    );

    const onTouchEnd = useCallback(() => {
      clearLongPress();
      pendingDrawStart.current = null;
      if (lastPinchDist.current !== null) {
        lastPinchDist.current = null;
        lastPinchMid.current = null;
        return;
      }
      if (interaction.type === "movingPlant") {
        commitPlantDrop(interaction);
        return;
      }
      if (interaction.type === "moving" || interaction.type === "resizing") {
        const bed = beds.find((b) => b.id === interaction.bedId);
        if (bed)
          syncBedToSupabase(bed.id, {
            x: bed.x,
            y: bed.y,
            width: bed.width,
            height: bed.height,
          });
      }
      if (interaction.type === "drawing") {
        if (draft) {
          const n = normalizeDraft(draft);
          if (n.width >= MIN_CELLS && n.height >= MIN_CELLS && !hasCollision(n))
            setInteraction({ type: "idle" });
          else {
            setDraft(null);
            setResizeCollision(false);
            setInteraction({ type: "idle" });
          }
        }
      } else {
        setResizeCollision(false);
        setInteraction({ type: "idle" });
      }
    }, [
      interaction,
      draft,
      beds,
      syncBedToSupabase,
      clearLongPress,
      commitPlantDrop,
    ]);

    // ── Mouse ─────────────────────────────────────────────────────────────

    const onMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (draft) {
          setInteraction({
            type: "panning",
            startX: e.clientX,
            startY: e.clientY,
            originX: panRef.current.x,
            originY: panRef.current.y,
          });
          return;
        }
        const { col, row } = toCell(e.clientX, e.clientY);
        if (mode === "pan") {
          setInteraction({
            type: "panning",
            startX: e.clientX,
            startY: e.clientY,
            originX: pan.x,
            originY: pan.y,
          });
          return;
        }
        const rect = containerRef.current!.getBoundingClientRect();
        const lx = (e.clientX - rect.left - pan.x) / zoom;
        const ly = (e.clientY - rect.top - pan.y) / zoom;
        const touchedBed = beds.find(
          (b) =>
            lx >= b.x * CELL &&
            lx <= (b.x + b.width) * CELL &&
            ly >= b.y * CELL &&
            ly <= (b.y + b.height) * CELL,
        );
        if (touchedBed) {
          const bx = touchedBed.x * CELL,
            by = touchedBed.y * CELL;
          const bw = touchedBed.width * CELL,
            bh = touchedBed.height * CELL;
          const EDGE = 16;
          const onLeft = lx - bx < EDGE,
            onRight = bx + bw - lx < EDGE;
          const onTop = ly - by < EDGE,
            onBottom = by + bh - ly < EDGE;
          if (onLeft || onRight || onTop || onBottom) {
            let handle: ResizeHandle = "se";
            if (onTop && onLeft) handle = "nw";
            else if (onTop && onRight) handle = "ne";
            else if (onBottom && onLeft) handle = "sw";
            else if (onBottom && onRight) handle = "se";
            else if (onTop) handle = "n";
            else if (onBottom) handle = "s";
            else if (onLeft) handle = "w";
            else if (onRight) handle = "e";
            setInteraction({
              type: "resizing",
              bedId: touchedBed.id,
              handle,
              startX: lx,
              startY: ly,
              original: { ...touchedBed },
            });
            return;
          }
          setInteraction({
            type: "moving",
            bedId: touchedBed.id,
            offsetX: col - touchedBed.x,
            offsetY: row - touchedBed.y,
          });
          return;
        }
        setDraft({ startX: col, startY: row, endX: col, endY: row });
        setInteraction({
          type: "drawing",
          draft: { startX: col, startY: row, endX: col, endY: row },
        });
      },
      [mode, beds, pan, zoom, toCell, draft, contextMenu],
    );

    const onMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (interaction.type === "movingPlant") {
          updatePlantDragPos(e.clientX, e.clientY, interaction);
          return;
        }
        if (interaction.type === "panning") {
          const newPan = {
            x: interaction.originX + e.clientX - interaction.startX,
            y: interaction.originY + e.clientY - interaction.startY,
          };
          panRef.current = newPan;
          setPan(newPan);
        } else if (interaction.type === "drawing") {
          const { col, row } = toCell(e.clientX, e.clientY);
          const newDraft = { ...interaction.draft, endX: col, endY: row };
          setDraft(newDraft);
          setInteraction({ type: "drawing", draft: newDraft });
        } else if (interaction.type === "moving") {
          const { col, row } = toCell(e.clientX, e.clientY);
          const movedBed = beds.find((b) => b.id === interaction.bedId)!;
          const newShape = {
            x: clamp(col - interaction.offsetX, 0, COLS - 1),
            y: clamp(row - interaction.offsetY, 0, ROWS - 1),
            width: movedBed.width,
            height: movedBed.height,
          };
          if (!hasCollision(newShape, interaction.bedId))
            updateBed(interaction.bedId, { x: newShape.x, y: newShape.y });
        } else if (interaction.type === "resizing") {
          const rect = containerRef.current!.getBoundingClientRect();
          const lx = (e.clientX - rect.left - pan.x) / zoom;
          const ly = (e.clientY - rect.top - pan.y) / zoom;
          const dx = Math.round((lx - interaction.startX) / CELL);
          const dy = Math.round((ly - interaction.startY) / CELL);
          const o = interaction.original,
            h = interaction.handle;
          let nx = o.x,
            ny = o.y,
            nw = o.width,
            nh = o.height;
          if (h.includes("e")) nw = Math.max(MIN_CELLS, o.width + dx);
          if (h.includes("s")) nh = Math.max(MIN_CELLS, o.height + dy);
          if (h.includes("w")) {
            nx = clamp(o.x + dx, 0, o.x + o.width - MIN_CELLS);
            nw = o.width - (nx - o.x);
          }
          if (h.includes("n")) {
            ny = clamp(o.y + dy, 0, o.y + o.height - MIN_CELLS);
            nh = o.height - (ny - o.y);
          }
          const newShape = { x: nx, y: ny, width: nw, height: nh };
          if (!hasCollision(newShape, interaction.bedId)) {
            setResizeCollision(false);
            updateBed(interaction.bedId, newShape);
          } else setResizeCollision(true);
        }
      },
      [interaction, toCell, updateBed, pan, zoom, beds, updatePlantDragPos],
    );

    const onMouseUp = useCallback(() => {
      if (interaction.type === "movingPlant") {
        commitPlantDrop(interaction);
        return;
      }
      if (interaction.type === "moving" || interaction.type === "resizing") {
        const bed = beds.find((b) => b.id === interaction.bedId);
        if (bed)
          syncBedToSupabase(bed.id, {
            x: bed.x,
            y: bed.y,
            width: bed.width,
            height: bed.height,
          });
      }
      if (interaction.type === "drawing") {
        if (draft) {
          const n = normalizeDraft(draft);
          if (n.width >= MIN_CELLS && n.height >= MIN_CELLS && !hasCollision(n))
            setInteraction({ type: "idle" });
          else {
            setDraft(null);
            setResizeCollision(false);
            setInteraction({ type: "idle" });
          }
        }
      } else {
        setResizeCollision(false);
        setInteraction({ type: "idle" });
      }
    }, [interaction, draft, beds, syncBedToSupabase, commitPlantDrop]);

    // Window-level mouseup/touchend za drop ko je miška izven elementa
    useEffect(() => {
      const handleMouseUp = () => {
        if (interaction.type === "movingPlant") commitPlantDrop(interaction);
      };
      window.addEventListener("mouseup", handleMouseUp);
      return () => window.removeEventListener("mouseup", handleMouseUp);
    }, [interaction, commitPlantDrop]);

    useEffect(() => {
      const handleTouchEnd = () => {
        if (interaction.type === "movingPlant") commitPlantDrop(interaction);
      };
      window.addEventListener("touchend", handleTouchEnd);
      return () => window.removeEventListener("touchend", handleTouchEnd);
    }, [interaction, commitPlantDrop]);

    const onWheel = useCallback((e: React.WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(z - e.deltaY * 0.001, 0.3, 2.5));
    }, []);

    // ── Draft potrdi / prekliči ───────────────────────────────────────────

    const confirmDraft = async () => {
      if (!draft) return;
      const n = normalizeDraft(draft);
      const { data, error } = await supabase
        .from("beds")
        .insert({
          user_id: userId,
          garden_id: gardenId,
          name: `Gredica ${beds.length + 1}`,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          color: BED_COLORS[colorIndex % BED_COLORS.length],
        })
        .select()
        .single();
      if (error || !data) {
        console.error("Napaka pri shranjevanju gredice:", error);
        return;
      }
      addBed(data as GardenBed);
      setColorIndex((c) => c + 1);
      setDraft(null);
      setInteraction({ type: "idle" });
    };

    const cancelDraft = () => {
      setDraft(null);
      setInteraction({ type: "idle" });
    };

    const draftNorm = draft ? normalizeDraft(draft) : null;
    const isDraggingPlant = interaction.type === "movingPlant";

    // ── Render ────────────────────────────────────────────────────────────

    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Zoom buttons */}
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <button
            onClick={() => setZoom((z) => clamp(z + 0.15, 0.3, 2.5))}
            className="w-9 h-9 bg-white rounded-lg shadow text-lg flex items-center justify-center hover:bg-stone-50"
          >
            +
          </button>
          <button
            onClick={() => setZoom((z) => clamp(z - 0.15, 0.3, 2.5))}
            className="w-9 h-9 bg-white rounded-lg shadow text-lg flex items-center justify-center hover:bg-stone-50"
          >
            −
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
              panRef.current = { x: 0, y: 0 };
              zoomRef.current = 1;
            }}
            className="w-9 h-9 bg-white rounded-lg shadow text-xs flex items-center justify-center hover:bg-stone-50"
          >
            ⌖
          </button>
        </div>

        {/* Transformed canvas */}
        <div
          ref={containerRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onContextMenu={onContextMenu}
          onTouchStart={onTouchStartWithLongPress}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onWheel={onWheel}
          style={{
            width: "100%",
            height: "100%",
            cursor:
              mode === "draw"
                ? "crosshair"
                : isDraggingPlant
                  ? "grabbing"
                  : "grab",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              width: COLS * CELL,
              height: ROWS * CELL,
            }}
          >
            {/* Grid lines */}
            <svg
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
              width={COLS * CELL}
              height={ROWS * CELL}
            >
              {Array.from({ length: COLS + 1 }).map((_, i) => (
                <line
                  key={`v${i}`}
                  x1={i * CELL}
                  y1={0}
                  x2={i * CELL}
                  y2={ROWS * CELL}
                  stroke="#e7e5e4"
                  strokeWidth={1}
                />
              ))}
              {Array.from({ length: ROWS + 1 }).map((_, i) => (
                <line
                  key={`h${i}`}
                  x1={0}
                  y1={i * CELL}
                  x2={COLS * CELL}
                  y2={i * CELL}
                  stroke="#e7e5e4"
                  strokeWidth={1}
                />
              ))}
            </svg>

            {/* Gredice */}
            {beds.map((bed) => (
              <div
                key={bed.id}
                onClick={() => {
                  if (mode === "pan") {
                    selectBed(bed.id);
                    onBedSelect(bed);
                  }
                }}
                style={{
                  position: "absolute",
                  left: bed.x * CELL,
                  top: bed.y * CELL,
                  width: bed.width * CELL,
                  height: bed.height * CELL,
                  border: `2px solid ${
                    resizeCollision &&
                    interaction.type === "resizing" &&
                    interaction.bedId === bed.id
                      ? "#dc2626"
                      : selectedBedId === bed.id
                        ? "#15803d"
                        : "#86efac"
                  }`,
                  backgroundColor:
                    resizeCollision &&
                    interaction.type === "resizing" &&
                    interaction.bedId === bed.id
                      ? bed.color.replace(")", ", 0.5)").replace("rgb", "rgba")
                      : bed.color,
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
              >
                {/* Delete button */}
                {mode === "draw" && (
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={async () => {
                      const { error } = await supabase
                        .from("beds")
                        .delete()
                        .eq("id", bed.id);
                      if (error) {
                        console.error("Delete error:", error);
                        return;
                      }
                      removeBed(bed.id);
                      selectBed(null);
                    }}
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      width: 20,
                      height: 20,
                      backgroundColor: "#dc2626",
                      color: "white",
                      border: "none",
                      borderRadius: "50%",
                      fontSize: 12,
                      fontWeight: "bold",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 20,
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                )}

                {/* Resize handles */}
                {mode === "draw" && (
                  <>
                    {(["nw", "ne", "sw", "se"] as ResizeHandle[]).map((h) => (
                      <div
                        key={h}
                        style={{
                          position: "absolute",
                          width: 10,
                          height: 10,
                          backgroundColor: "white",
                          border: "2px solid #15803d",
                          borderRadius: 2,
                          ...(h.includes("n") ? { top: -5 } : { bottom: -5 }),
                          ...(h.includes("w") ? { left: -5 } : { right: -5 }),
                          cursor: `${h}-resize`,
                          zIndex: 10,
                        }}
                      />
                    ))}
                  </>
                )}

                {/* Pod-mreža */}
                {mode === "draw" && (
                  <svg
                    style={{
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                    }}
                    width={bed.width * CELL}
                    height={bed.height * CELL}
                  >
                    {Array.from({ length: bed.width * 2 - 1 }).map((_, i) => (
                      <line
                        key={`sv${i}`}
                        x1={(i + 1) * SUBCELL}
                        y1={0}
                        x2={(i + 1) * SUBCELL}
                        y2={bed.height * CELL}
                        stroke="rgba(0,0,0,0.1)"
                        strokeWidth={0.5}
                        strokeDasharray="3,3"
                      />
                    ))}
                    {Array.from({ length: bed.height * 2 - 1 }).map((_, i) => (
                      <line
                        key={`sh${i}`}
                        x1={0}
                        y1={(i + 1) * SUBCELL}
                        x2={bed.width * CELL}
                        y2={(i + 1) * SUBCELL}
                        stroke="rgba(0,0,0,0.1)"
                        strokeWidth={0.5}
                        strokeDasharray="3,3"
                      />
                    ))}
                  </svg>
                )}

                <span
                  style={{
                    position: "absolute",
                    bottom: 2,
                    left: 4,
                    fontSize: 10,
                    color: "rgba(0,0,0,0.4)",
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                >
                  {bed.name}
                </span>

                {/* Posajene rastline */}
                {bedPlants
                  .filter((bp) => bp.bed_id === bed.id)
                  .map((bp) => {
                    const spacing = bp.plant?.cells_spacing ?? 1;
                    const size = spacing * SUBCELL;
                    const isBeingDragged =
                      isDraggingPlant &&
                      interaction.type === "movingPlant" &&
                      interaction.bedPlantId === bp.id;
                    const override = localPlantOverrides[bp.id];
                    const displayX =
                      isBeingDragged && draggingPlantPos
                        ? draggingPlantPos.cellX
                        : override
                          ? override.cellX
                          : bp.cell_x;
                    const displayY =
                      isBeingDragged && draggingPlantPos
                        ? draggingPlantPos.cellY
                        : override
                          ? override.cellY
                          : bp.cell_y;

                    return (
                      <div
                        key={bp.id}
                        style={{ position: "absolute", pointerEvents: "none" }}
                      >
                        {/* Zasedeno območje */}
                        <div
                          style={{
                            position: "absolute",
                            left: displayX * SUBCELL,
                            top: displayY * SUBCELL,
                            width: size,
                            height: size,
                            backgroundColor: isBeingDragged
                              ? isBadDrop
                                ? "rgba(239,68,68,0.25)"
                                : "rgba(134,239,172,0.4)"
                              : "rgba(134,239,172,0.15)",
                            border: isBeingDragged
                              ? isSpaceCollision
                                ? "1.5px dashed #dc2626" // rdeča — prostor zaseden
                                : isAroundCollision
                                  ? "1.5px dashed #eab308" // rumena — preblizu
                                  : isBadDrop
                                    ? "1.5px dashed #eab308" // rumena — slab sosed
                                    : "1.5px dashed #16a34a" // zelena — ok
                              : "1px dashed rgba(22,163,74,0.3)",
                            borderRadius: 4,
                            transition: isBeingDragged
                              ? "none"
                              : "left 0.1s, top 0.1s",
                            pointerEvents: "none",
                          }}
                        />
                        {/* Ikona rastline */}
                        <div
                          onMouseDown={(e) => {
                            if (e.button !== 0 || mode !== "pan") return;
                            e.stopPropagation();
                            longPressTimer.current = setTimeout(() => {
                              startPlantDrag(bp, e.clientX, e.clientY);
                            }, LONG_PRESS_MS);
                          }}
                          onMouseUp={(e) => {
                            if (interaction.type !== "movingPlant") {
                              clearLongPress();
                              e.stopPropagation();
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openContextMenu(e.clientX, e.clientY, {
                              plantId: bp.id,
                            });
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            if (mode !== "pan") return;
                            const touch = e.touches[0];
                            longPressTimer.current = setTimeout(() => {
                              startPlantDrag(bp, touch.clientX, touch.clientY);
                            }, LONG_PRESS_MS);
                          }}
                          onTouchEnd={(e) => {
                            if (interaction.type !== "movingPlant") {
                              clearLongPress();
                              e.stopPropagation();
                            }
                          }}
                          style={{
                            position: "absolute",
                            left: displayX * SUBCELL,
                            top: displayY * SUBCELL,
                            width: SUBCELL,
                            height: SUBCELL,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            pointerEvents: "auto",
                            zIndex: isBeingDragged ? 11 : 5,
                            cursor: isBeingDragged ? "grabbing" : "grab",
                            filter: isBeingDragged
                              ? isBadDrop
                                ? "drop-shadow(0 2px 8px rgba(220,38,38,0.5))"
                                : "drop-shadow(0 2px 6px rgba(0,0,0,0.25))"
                              : "none",
                            transition: isBeingDragged
                              ? "none"
                              : "left 0.1s, top 0.1s",
                            opacity: isBeingDragged ? 0.9 : 1,
                          }}
                        >
                          {bp.plant?.img}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}

            {/* Draft gredica */}
            {draftNorm && (
              <div
                style={{
                  position: "absolute",
                  left: draftNorm.x * CELL,
                  top: draftNorm.y * CELL,
                  width: draftNorm.width * CELL,
                  height: draftNorm.height * CELL,
                  border: "2px dashed #15803d",
                  backgroundColor: "rgba(134,239,172,0.2)",
                  borderRadius: 6,
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
        </div>

        {/* Context menu */}
        {contextMenu && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 50,
              backgroundColor: "white",
              borderRadius: 10,
              boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
              border: "1px solid #e7e5e4",
              minWidth: 180,
              overflow: "hidden",
            }}
          >
            {contextMenu.type === "cell" && (
              <button
                onClick={() => {
                  if (contextMenu.cellX == null || contextMenu.cellY == null)
                    return;
                  onPlantCell(
                    contextMenu.bedId,
                    contextMenu.cellX,
                    contextMenu.cellY,
                  );
                  setContextMenu(null);
                }}
                className="w-full px-4 py-3 text-left text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2"
              >
                🌱 Posadi rastlino...
              </button>
            )}
            {contextMenu.type === "plant" && (
              <>
                <button
                  onClick={() => {
                    console.log("Plant info menu for:", contextMenu.bedPlantId);
                    setContextMenu(null);
                  }}
                  className="w-full px-4 py-3 text-left text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2"
                >
                  ℹ️ Info o rastlini
                </button>
                <button
                  onClick={async () => {
                    if (!contextMenu.bedPlantId) return;
                    const { error } = await supabase
                      .from("bed_plants")
                      .delete()
                      .eq("id", contextMenu.bedPlantId);
                    if (error) {
                      console.error(
                        "Napaka pri brisanju rastline iz beda:",
                        error,
                      );
                      return;
                    }
                    const bedPlant = bedPlants.find(
                      (bp) => bp.id === contextMenu.bedPlantId,
                    );
                    if (bedPlant) onReturnToInventory(bedPlant.plant_id);
                    onPlantsChanged();
                    setContextMenu(null);
                  }}
                  className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-stone-100"
                >
                  🗑️ Odstrani rastlino
                </button>
              </>
            )}
          </div>
        )}

        {/* Bad neighbor / space collision tooltip med dragom */}
        {dragTooltip && (
          <div
            style={{
              position: "fixed",
              left: dragTooltip.x,
              top: dragTooltip.y,
              transform: "translate(-50%, -100%)",
              zIndex: 100,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                backgroundColor: "white",
                border: `1.5px solid ${isSpaceCollision ? "#dc2626" : "#eab308"}`,
                borderRadius: 10,
                padding: "8px 12px",
                boxShadow: "0 4px 16px rgba(220,38,38,0.15)",
                minWidth: 160,
                maxWidth: 240,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#dc2626",
                  marginBottom: dragTooltip.badNeighborNames.length > 0 ? 6 : 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {dragTooltip.badNeighborNames.length > 0
                  ? "⚠️ Slabi sosedje v gredici"
                  : dragTooltip.currentBadNames[0]}
              </div>
              {dragTooltip.badNeighborNames.map((name) => {
                const isCurrent = dragTooltip.currentBadNames.includes(name);
                return (
                  <div
                    key={name}
                    style={{
                      fontSize: 13,
                      color: isCurrent ? "#dc2626" : "#78716c",
                      fontWeight: isCurrent ? 700 : 400,
                      padding: "2px 0",
                    }}
                  >
                    {isCurrent ? "🚫 " : "⚠️ "}
                    {name}
                  </div>
                );
              })}
              {dragTooltip.badNeighborNames.length > 0 && (
                <div
                  style={{
                    fontSize: 10,
                    color: "#a8a29e",
                    marginTop: 6,
                    borderTop: "1px solid #f5f5f4",
                    paddingTop: 5,
                  }}
                >
                  Boldano = trenutno preblizu
                </div>
              )}
            </div>
            {/* Puščica navzdol */}
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: "6px solid #dc2626",
                margin: "0 auto",
              }}
            />
          </div>
        )}

        {/* Draft confirm bar */}
        {draft && interaction.type !== "drawing" && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 30,
              backgroundColor: "white",
              borderRadius: 12,
              boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
              padding: "10px 16px",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              onClick={cancelDraft}
              className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg"
            >
              ✗ Prekliči
            </button>
            <button
              onClick={confirmDraft}
              className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700 rounded-lg"
            >
              ✓ Potrdi gredico
            </button>
          </div>
        )}
      </div>
    );
  },
);

GardenCanvas.displayName = "GardenCanvas";
export default GardenCanvas;
