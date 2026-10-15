import { useState } from "react";
import { Check, Pencil, Sprout, Trash2, X } from "lucide-react";
import type { GardenBed } from "../../types/garden";
import { formatArea, formatBedSize } from "../../lib/units";

interface Props {
  bed: GardenBed;
  plantCount: number;
  onPlant: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

// Plavajoča vrstica za izbrano gredico: mere + akcije (brez potrditvenih dialogov — razveljavi)
export function BedActionBar({ bed, plantCount, onPlant, onRename, onDelete, onClose }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(bed.name);

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== bed.name) onRename(trimmed);
    setEditing(false);
  };

  return (
    <div
      className="absolute left-0 right-0 bottom-0 z-30 px-3 pb-safe"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mx-auto mb-3 max-w-lg rounded-2xl bg-white shadow-xl border border-stone-200 p-3 animate-pop-in">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            {editing ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  commit();
                }}
              >
                <input
                  autoFocus
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={commit}
                  className="flex-1 min-w-0 text-base font-semibold text-stone-800 border-b border-green-500 bg-transparent focus:outline-none py-0.5"
                />
                <button type="submit" aria-label="Shrani ime" className="p-1.5 text-green-600">
                  <Check size={20} />
                </button>
              </form>
            ) : (
              <p className="font-semibold text-stone-800 truncate">{bed.name}</p>
            )}
            <p className="text-xs text-stone-500 mt-0.5">
              {formatBedSize(bed.width, bed.height)} · {formatArea(bed.width, bed.height)} ·{" "}
              {plantCount === 1 ? "1 rastlina" : `${plantCount} rastlin`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Zapri" className="p-2 -mr-1 text-stone-400 self-start">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <button
            onClick={onPlant}
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-green-600 text-white text-xs font-semibold active:bg-green-700"
          >
            <Sprout size={20} /> Posadi
          </button>
          <button
            onClick={() => {
              setName(bed.name);
              setEditing(true);
            }}
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-stone-100 text-stone-700 text-xs font-semibold active:bg-stone-200"
          >
            <Pencil size={20} /> Preimenuj
          </button>
          <button
            onClick={onDelete}
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-xs font-semibold active:bg-red-100"
          >
            <Trash2 size={20} /> Izbriši
          </button>
        </div>
        <p className="text-[11px] text-stone-400 text-center mt-2">
          Povleci gredico za premik · ročaje za velikost
        </p>
      </div>
    </div>
  );
}
