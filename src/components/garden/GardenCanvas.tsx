import React, { useRef, useState, useCallback, useEffect } from "react";
import { useGardenStore, BED_COLORS } from "../../store/useGardenStore";
import type { GardenBed, DraftBed, ResizeHandle } from "../../types/garden";
import { v4 as uuidv4 } from "uuid";

const CELL = 48; // px per cell
const COLS = 20;
const ROWS = 20;
const MIN_CELLS = 1;

interface Props {
  onBedSelect: (bed: GardenBed) => void;
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

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const normalizeDraft = (d: DraftBed) => ({
  x: Math.min(d.startX, d.endX),
  y: Math.min(d.startY, d.endY),
  width: Math.abs(d.endX - d.startX) + 1,
  height: Math.abs(d.endY - d.startY) + 1,
});

const GardenCanvas: React.FC<Props> = ({ onBedSelect }) => {
  const { beds, mode, addBed, updateBed, selectBed, selectedBedId, removeBed } =
    useGardenStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [interaction, setInteraction] = useState<InteractionState>({
    type: "idle",
  });
  const [draft, setDraft] = useState<DraftBed | null>(null);
  const [colorIndex, setColorIndex] = useState(0);
  const [resizeCollision, setResizeCollision] = useState(false);

  // Convert pointer event to grid cell
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

  // Pinch-to-zoom
  const lastPinchDist = useRef<number | null>(null);
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (draft) return;
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist.current = Math.hypot(dx, dy);
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

      // draw mode: check if touching a bed
      const touchedBed = beds.find((b) => {
        const bx = b.x * CELL,
          by = b.y * CELL;
        const bw = b.width * CELL,
          bh = b.height * CELL;
        const lx =
          (touch.clientX -
            containerRef.current!.getBoundingClientRect().left -
            pan.x) /
          zoom;
        const ly =
          (touch.clientY -
            containerRef.current!.getBoundingClientRect().top -
            pan.y) /
          zoom;
        return lx >= bx && lx <= bx + bw && ly >= by && ly <= by + bh;
      });

      if (touchedBed) {
        // Check if on edge (within 16px) → resize
        const rect2 = containerRef.current!.getBoundingClientRect();
        const lx = (touch.clientX - rect2.left - pan.x) / zoom;
        const ly = (touch.clientY - rect2.top - pan.y) / zoom;
        const bx = touchedBed.x * CELL,
          by = touchedBed.y * CELL;
        const bw = touchedBed.width * CELL,
          bh = touchedBed.height * CELL;
        const EDGE = 20;
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

        // Middle → move
        setInteraction({
          type: "moving",
          bedId: touchedBed.id,
          offsetX: col - touchedBed.x,
          offsetY: row - touchedBed.y,
        });
        return;
      }

      // Empty space → start drawing
      setDraft({ startX: col, startY: row, endX: col, endY: row });
      setInteraction({
        type: "drawing",
        draft: { startX: col, startY: row, endX: col, endY: row },
      });
    },
    [mode, beds, pan, zoom, toCell],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      // Pinch zoom
      if (e.touches.length === 2 && lastPinchDist.current !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const delta = dist / lastPinchDist.current;
        setZoom((z) => clamp(z * delta, 0.3, 2.5));
        lastPinchDist.current = dist;
        return;
      }
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];

      if (interaction.type === "panning") {
        setPan({
          x: interaction.originX + touch.clientX - interaction.startX,
          y: interaction.originY + touch.clientY - interaction.startY,
        });
      } else if (interaction.type === "drawing") {
        const { col, row } = toCell(touch.clientX, touch.clientY);
        const newDraft = { ...interaction.draft, endX: col, endY: row };
        setDraft(newDraft);
        setInteraction({ type: "drawing", draft: newDraft });
      } else if (interaction.type === "moving") {
        const { col, row } = toCell(touch.clientX, touch.clientY);
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
        const lx = (touch.clientX - rect.left - pan.x) / zoom;
        const ly = (touch.clientY - rect.top - pan.y) / zoom;
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
          setResizeCollision(true); // ← označi kolizijo
        }
      }
    },
    [interaction, toCell, updateBed, pan, zoom],
  );

  const onTouchEnd = useCallback(() => {
    lastPinchDist.current = null;
    if (interaction.type === "drawing") {
      if (draft) {
        const n = normalizeDraft(draft);
        if (n.width >= MIN_CELLS && n.height >= MIN_CELLS && !hasCollision(n)) {
          setInteraction({ type: "idle" }); // ok → pokaži confirm
        } else {
          //setDraft(null); // collision ali premajhen → počisti
          setResizeCollision(false);
          setInteraction({ type: "idle" });
        }
      }
    } else {
      setInteraction({ type: "idle" });
    }
  }, [interaction, draft, beds]);

  // Mouse events (desktop)
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (draft) return;
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
    [mode, beds, pan, zoom, toCell],
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
          setResizeCollision(true); // ← označi kolizijo
        }
      }
    },
    [interaction, toCell, updateBed, pan, zoom],
  );

  const onMouseUp = useCallback(() => {
    if (interaction.type === "drawing") {
      if (draft) {
        const n = normalizeDraft(draft);
        if (n.width >= MIN_CELLS && n.height >= MIN_CELLS && !hasCollision(n)) {
          setInteraction({ type: "idle" }); // ok → pokaži confirm
        } else {
          //setDraft(null); // collision ali premajhen → počisti
          setResizeCollision(false);
          setInteraction({ type: "idle" });
        }
      }
    } else {
      setInteraction({ type: "idle" });
    }
  }, [interaction, draft, beds]);

  // Scroll to zoom (desktop)
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => clamp(z - e.deltaY * 0.001, 0.3, 2.5));
  }, []);

  const confirmDraft = () => {
    if (!draft) return;
    const n = normalizeDraft(draft);
    const newBed: GardenBed = {
      id: uuidv4(),
      name: `Gredica ${beds.length + 1}`,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      color: BED_COLORS[colorIndex % BED_COLORS.length],
    };
    addBed(newBed);
    setColorIndex((c) => c + 1);
    setDraft(null);
    setInteraction({ type: "idle" });
  };

  const cancelDraft = () => {
    setDraft(null);
    setInteraction({ type: "idle" });
  };

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

  const draftNorm = draft ? normalizeDraft(draft) : null;

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-stone-100"
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      style={{
        cursor: mode === "pan" ? "grab" : "crosshair",
      }}
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
              border: `2px solid ${
                resizeCollision &&
                interaction.type === "resizing" &&
                (interaction as any).bedId === bed.id
                  ? "#dc2626" // ← rdeča ob koliziji
                  : selectedBedId === bed.id
                    ? "#15803d"
                    : "#86efac"
              }`,
              backgroundColor:
                resizeCollision &&
                interaction.type === "resizing" &&
                (interaction as any).bedId === bed.id
                  ? bed.color.replace(")", ", 0.5)").replace("rgb", "rgba") // ← malo bleda
                  : bed.color,
              borderRadius: 6,
              boxSizing: "border-box",
            }}
          >
            {/* Briši gumb — samo v draw mode */}
            {mode === "draw" && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={() => removeBed(bed.id)}
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

            {/* Resize handles (draw mode only) */}
            {mode === "draw" && (
              <>
                {/* Corners */}
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

        {/* Draft bed preview */}
        {draftNorm && (
          <div
            style={{
              position: "absolute",
              left: draftNorm.x * CELL,
              top: draftNorm.y * CELL,
              width: draftNorm.width * CELL,
              height: draftNorm.height * CELL,
              backgroundColor: hasCollision(draftNorm)
                ? "rgba(239,68,68,0.25)" // ← rdeča če konflikt
                : "rgba(134,239,172,0.35)", // ← zelena če ok
              border: hasCollision(draftNorm)
                ? "2px dashed #dc2626"
                : "2px dashed #16a34a",
              borderRadius: 6,
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {/* Confirm bar */}
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
            className={`flex-1 py-3 rounded-xl font-semibold text-base transition-colors ${
              draftNorm && hasCollision(draftNorm)
                ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                : "bg-green-600 text-white"
            }`}
          >
            ✓ Potrdi gredico
          </button>
        </div>
      )}
    </div>
  );
};

export default GardenCanvas;
