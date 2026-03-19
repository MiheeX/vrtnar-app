import React, { useRef, useState } from "react";
import GardenCanvas from "../components/garden/GardenCanvas";
import type { GardenCanvasHandle } from "../components/garden/GardenCanvas";
import { useGardenStore } from "../store/useGardenStore";
import type { GardenBed } from "../types/garden";

const GardenPage: React.FC = () => {
  const {
    mode,
    setMode,
    selectedBedId,
    beds,
    selectBed,
    removeBed,
    updateBed,
  } = useGardenStore();
  const selectedBed = beds.find((b) => b.id === selectedBedId) ?? null;
  const [editName, setEditName] = useState("");
  const canvasRef = useRef<GardenCanvasHandle>(null); // ← ref na canvas

  const handleBedSelect = (bed: GardenBed) => {
    selectBed(bed.id);
    setEditName(bed.name);
  };

  return (
    <div className="flex flex-col h-screen bg-stone-50 select-none">
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-3 bg-white border-b border-stone-200 shadow-sm"
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="font-semibold text-green-800 text-lg mr-2">
          🌱 Moj vrt
        </span>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => {
              canvasRef.current?.reset(); // ← reset pred modom
              setMode("pan");
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === "pan"
                ? "bg-green-600 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            ✋ Premikaj
          </button>
          <button
            onClick={() => {
              canvasRef.current?.reset(); // ← reset tudi pri draw
              setMode("draw");
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === "draw"
                ? "bg-amber-500 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            ✏️ Riši
          </button>
        </div>
      </div>

      {/* Mode hint */}
      <div
        className={`text-center text-xs py-1.5 font-medium ${
          mode === "draw"
            ? "bg-amber-50 text-amber-700"
            : "bg-green-50 text-green-700"
        }`}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {mode === "draw"
          ? "✏️ Nariši gredico z vlečenjem • Premakni z dotikom sredine • Resize z robom"
          : "✋ Premikaj pogled z vlečenjem • Tapni gredico za info"}
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden relative">
        <GardenCanvas ref={canvasRef} onBedSelect={handleBedSelect} />
      </div>

      {/* Info panel — pan mode, bed selected */}
      {mode === "pan" && selectedBed && (
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-stone-200 rounded-t-2xl shadow-lg p-4 z-20">
          <div className="flex items-center justify-between mb-3">
            <input
              className="text-lg font-semibold text-stone-800 bg-transparent border-b border-stone-300 focus:outline-none focus:border-green-500 w-48"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => updateBed(selectedBed.id, { name: editName })}
            />
            <button
              onClick={() => selectBed(null)}
              className="text-stone-400 hover:text-stone-600 text-xl"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2 text-sm text-stone-500 mb-4">
            <span>
              📐 {selectedBed.width} × {selectedBed.height} celic
            </span>
            <span>•</span>
            <span>
              📍 ({selectedBed.x}, {selectedBed.y})
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                removeBed(selectedBed.id);
                selectBed(null);
              }}
              className="flex-1 py-2 rounded-xl bg-red-50 text-red-600 font-medium text-sm"
            >
              🗑️ Izbriši gredico
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GardenPage;
