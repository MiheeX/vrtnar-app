import React, {
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useGardenStore, BED_COLORS } from "../../store/useGardenStore";
import type { GardenBed, DraftBed, ResizeHandle } from "../../types/garden";
import { supabase } from "../../lib/supabaseClient";

const CELL = 48;
const SUBCELL = CELL / 2; // 24px
const COLS = 20;
const ROWS = 20;
const MIN_CELLS = 1;
const LONG_PRESS_MS = 500;

interface Props {
  onBedSelect: (bed: GardenBed) => void;
  onPlantCell: (bedId: string, cellX: number, cellY: number) => void; // ← novo
  userId: string;
  gardenId: string;
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
    };

interface ContextMenu {
  x: number; // screen x
  y: number; // screen y
  bedId: string;
  cellX: number; // sub-celica znotraj gredice
  cellY: number;
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
  ({ onBedSelect, onPlantCell, userId, gardenId }, ref) => {
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
    const [interaction, setInteraction] = useState<InteractionState>({
      type: "idle",
    });
    const [draft, setDraft] = useState<DraftBed | null>(null);
    const [colorIndex, setColorIndex] = useState(0);
    const [resizeCollision, setResizeCollision] = useState(false);
    const pendingDrawStart = useRef<{ col: number; row: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useImperativeHandle(ref, () => ({
      reset: () => {
        setDraft(null);
        setInteraction({ type: "idle" });
        setResizeCollision(false);
        setContextMenu(null);
      },
    }));

    // Izračun sub-celice iz screen koordinat
    const toSubCell = useCallback(
      (clientX: number, clientY: number, bed: GardenBed) => {
        const rect = containerRef.current!.getBoundingClientRect();
        const lx = (clientX - rect.left - pan.x) / zoom;
        const ly = (clientY - rect.top - pan.y) / zoom;
        const relX = lx - bed.x * CELL;
        const relY = ly - bed.y * CELL;
        return {
          cellX: clamp(Math.floor(relX / SUBCELL), 0, bed.width * 2 - 1),
          cellY: clamp(Math.floor(relY / SUBCELL), 0, bed.height * 2 - 1),
        };
      },
      [pan, zoom],
    );

    const openContextMenu = useCallback(
      (clientX: number, clientY: number) => {
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

        const { cellX, cellY } = toSubCell(clientX, clientY, bed);
        setContextMenu({
          x: clientX - rect.left,
          y: clientY - rect.top,
          bedId: bed.id,
          cellX,
          cellY,
        });
      },
      [mode, beds, pan, zoom, toSubCell],
    );

    // Desni klik miška
    const onContextMenu = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY);
      },
      [openContextMenu],
    );

    // Dolgi tap
    const onTouchStartWithLongPress = useCallback(
      (e: React.TouchEvent) => {
        if (e.touches.length === 1 && mode === "pan") {
          const touch = e.touches[0];
          longPressTimer.current = setTimeout(() => {
            openContextMenu(touch.clientX, touch.clientY);
          }, LONG_PRESS_MS);
        }
        // pokliči originalni onTouchStart
        onTouchStart(e);
      },
      [mode, openContextMenu],
    );

    const clearLongPress = useCallback(() => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }, []);

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

    const hasCollision = (
      norm: { x: number; y: number; width: number; height: number },
      excludeId?: string,
    ) => {
      return beds.some((bed) => {
        if (excludeId && bed.id === excludeId) return false;
        return (
          norm.x < bed.x + bed.width &&
          norm.x + norm.width > bed.x &&
          norm.y < bed.y + bed.height &&
          norm.y + norm.height > bed.y
        );
      });
    };

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
          const bx = touchedBed.x * CELL;
          const by = touchedBed.y * CELL;
          const bw = touchedBed.width * CELL;
          const bh = touchedBed.height * CELL;
          const EDGE = 32;
          const onLeft = lx - bx < EDGE;
          const onRight = bx + bw - lx < EDGE;
          const onTop = ly - by < EDGE;
          const onBottom = by + bh - ly < EDGE;

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

    const onTouchMove = useCallback(
      (e: React.TouchEvent) => {
        clearLongPress(); // premik prekliče dolgi tap
        if (e.touches.length === 2) {
          if (lastPinchDist.current === null || lastPinchMid.current === null)
            return;
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const newMidX = (t1.clientX + t2.clientX) / 2;
          const newMidY = (t1.clientY + t2.clientY) / 2;
          const newDist = Math.hypot(
            t1.clientX - t2.clientX,
            t1.clientY - t2.clientY,
          );
          const scaleRatio = newDist / lastPinchDist.current;
          const currentZoom = zoomRef.current;
          const currentPan = panRef.current;
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
          if (!hasCollision(newShape, interaction.bedId)) {
            updateBed(interaction.bedId, { x: newShape.x, y: newShape.y });
          }
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
          } else {
            setResizeCollision(true);
          }
        }
      },
      [interaction, toCell, updateBed, beds, clearLongPress],
    );

    const onTouchEnd = useCallback(() => {
      clearLongPress();
      pendingDrawStart.current = null;
      if (lastPinchDist.current !== null) {
        lastPinchDist.current = null;
        lastPinchMid.current = null;
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
          if (
            n.width >= MIN_CELLS &&
            n.height >= MIN_CELLS &&
            !hasCollision(n)
          ) {
            setInteraction({ type: "idle" });
          } else {
            setDraft(null);
            setResizeCollision(false);
            setInteraction({ type: "idle" });
          }
        }
      } else {
        setResizeCollision(false);
        setInteraction({ type: "idle" });
      }
    }, [interaction, draft, beds, syncBedToSupabase, clearLongPress]);

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

        const touchedBed = beds.find((b) => {
          const rect2 = containerRef.current!.getBoundingClientRect();
          const lx = (e.clientX - rect2.left - pan.x) / zoom;
          const ly = (e.clientY - rect2.top - pan.y) / zoom;
          return (
            lx >= b.x * CELL &&
            lx <= (b.x + b.width) * CELL &&
            ly >= b.y * CELL &&
            ly <= (b.y + b.height) * CELL
          );
        });

        if (touchedBed) {
          const rect2 = containerRef.current!.getBoundingClientRect();
          const lx = (e.clientX - rect2.left - pan.x) / zoom;
          const ly = (e.clientY - rect2.top - pan.y) / zoom;
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
        if (interaction.type === "panning") {
          setPan({
            x: interaction.originX + e.clientX - interaction.startX,
            y: interaction.originY + e.clientY - interaction.startY,
          });
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
          if (!hasCollision(newShape, interaction.bedId)) {
            updateBed(interaction.bedId, { x: newShape.x, y: newShape.y });
          }
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
          } else {
            setResizeCollision(true);
          }
        }
      },
      [interaction, toCell, updateBed, pan, zoom, beds],
    );

    const onMouseUp = useCallback(() => {
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
          if (
            n.width >= MIN_CELLS &&
            n.height >= MIN_CELLS &&
            !hasCollision(n)
          ) {
            setInteraction({ type: "idle" });
          } else {
            setDraft(null);
            setResizeCollision(false);
            setInteraction({ type: "idle" });
          }
        }
      } else {
        setResizeCollision(false);
        setInteraction({ type: "idle" });
      }
    }, [interaction, draft, beds, syncBedToSupabase]);

    const onWheel = useCallback((e: React.WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(z - e.deltaY * 0.001, 0.3, 2.5));
    }, []);

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

    return (
      <div
        className="relative w-full h-full overflow-hidden bg-stone-100"
        ref={containerRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onContextMenu={onContextMenu}
        onTouchStart={onTouchStartWithLongPress}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
        style={{ cursor: mode === "pan" ? "grab" : "crosshair" }}
      >
        {/* Zoom buttons */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
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
            }}
            className="w-9 h-9 bg-white rounded-lg shadow text-xs flex items-center justify-center hover:bg-stone-50"
          >
            ⌖
          </button>
        </div>

        {/* Transformed canvas */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: COLS * CELL,
            height: ROWS * CELL,
            position: "absolute",
            touchAction: "none",
          }}
        >
          {/* Grid lines */}
          <svg
            width={COLS * CELL}
            height={ROWS * CELL}
            className="absolute inset-0 pointer-events-none"
          >
            {Array.from({ length: COLS + 1 }).map((_, i) => (
              <line
                key={`v${i}`}
                x1={i * CELL}
                y1={0}
                x2={i * CELL}
                y2={ROWS * CELL}
                stroke="#d6d3d1"
                strokeWidth="1"
              />
            ))}
            {Array.from({ length: ROWS + 1 }).map((_, i) => (
              <line
                key={`h${i}`}
                x1={0}
                y1={i * CELL}
                x2={COLS * CELL}
                y2={i * CELL}
                stroke="#d6d3d1"
                strokeWidth="1"
              />
            ))}
          </svg>

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
                border: `2px solid ${resizeCollision && interaction.type === "resizing" && (interaction as any).bedId === bed.id ? "#dc2626" : selectedBedId === bed.id ? "#15803d" : "#86efac"}`,
                backgroundColor:
                  resizeCollision &&
                  interaction.type === "resizing" &&
                  (interaction as any).bedId === bed.id
                    ? bed.color.replace(")", ", 0.5)").replace("rgb", "rgba")
                    : bed.color,
                borderRadius: 6,
                boxSizing: "border-box",
              }}
            >
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
              {mode === "draw" && (
                <>
                  {(["nw", "ne", "sw", "se"] as ResizeHandle[]).map((h) => (
                    <div
                      key={h}
                      style={{
                        position: "absolute",
                        width: 14,
                        height: 14,
                        backgroundColor: "#15803d",
                        borderRadius: 3,
                        top: h.includes("n") ? -6 : undefined,
                        bottom: h.includes("s") ? -6 : undefined,
                        left: h.includes("w") ? -6 : undefined,
                        right: h.includes("e") ? -6 : undefined,
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
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                >
                  {Array.from({ length: bed.width * 2 - 1 }).map((_, i) => (
                    <line
                      key={`sv${i}`}
                      x1={(i + 1) * SUBCELL}
                      y1={0}
                      x2={(i + 1) * SUBCELL}
                      y2={bed.height * CELL}
                      stroke="rgba(0,0,0,0.10)"
                      strokeWidth="0.5"
                    />
                  ))}
                  {Array.from({ length: bed.height * 2 - 1 }).map((_, i) => (
                    <line
                      key={`sh${i}`}
                      x1={0}
                      y1={(i + 1) * SUBCELL}
                      x2={bed.width * CELL}
                      y2={(i + 1) * SUBCELL}
                      stroke="rgba(0,0,0,0.10)"
                      strokeWidth="0.5"
                    />
                  ))}
                </svg>
              )}
              <span
                style={{
                  position: "absolute",
                  bottom: 4,
                  left: 0,
                  right: 0,
                  textAlign: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#166534",
                  pointerEvents: "none",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                {bed.name}
              </span>
            </div>
          ))}

          {draftNorm && (
            <div
              style={{
                position: "absolute",
                left: draftNorm.x * CELL,
                top: draftNorm.y * CELL,
                width: draftNorm.width * CELL,
                height: draftNorm.height * CELL,
                backgroundColor: hasCollision(draftNorm)
                  ? "rgba(239,68,68,0.25)"
                  : "rgba(134,239,172,0.35)",
                border: hasCollision(draftNorm)
                  ? "2px dashed #dc2626"
                  : "2px dashed #16a34a",
                borderRadius: 6,
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        {/* Context menu */}
        {contextMenu && (
          <div
            style={{
              position: "absolute",
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 50,
              transform: "translate(-50%, -100%)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-xl shadow-xl border border-stone-200 overflow-hidden min-w-[160px]">
              <button
                onClick={() => {
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
            </div>
          </div>
        )}

        {draft && interaction.type !== "drawing" && (
          <div
            className="absolute bottom-0 left-0 right-0 flex gap-3 p-4 bg-white border-t border-stone-200 shadow-lg z-20"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <button
              onClick={cancelDraft}
              className="flex-1 py-3 rounded-xl bg-stone-100 text-stone-600 font-semibold text-base"
            >
              ✗ Prekliči
            </button>
            <button
              onClick={confirmDraft}
              disabled={!draftNorm || hasCollision(draftNorm)}
              className={`flex-1 py-3 rounded-xl font-semibold text-base transition-colors ${draftNorm && hasCollision(draftNorm) ? "bg-stone-200 text-stone-400 cursor-not-allowed" : "bg-green-600 text-white"}`}
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
