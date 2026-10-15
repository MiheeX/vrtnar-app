import { X } from "lucide-react";
import { formatArea, formatBedSize } from "../../lib/units";

// Pogoste velikosti gredic (v celicah mreže, 1 celica ≈ 10 cm)
const BED_PRESETS = [
  { id: "small", label: "Majhna", width: 4, height: 4 },
  { id: "square", label: "Kvadratna", width: 6, height: 6 },
  { id: "medium", label: "Srednja", width: 8, height: 12 },
  { id: "long", label: "Dolga vrsta", width: 4, height: 16 },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (width: number, height: number) => void;
}

// Izbira velikosti nove gredice (spodnji list)
export function NewBedSheet({ open, onClose, onCreate }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl pb-safe animate-slide-up">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-lg font-semibold text-stone-800">Nova gredica</h2>
          <button onClick={onClose} aria-label="Zapri" className="p-2 -mr-2 text-stone-400">
            <X size={22} />
          </button>
        </div>
        <p className="px-4 pb-3 text-sm text-stone-500">
          Izberi velikost — kasneje jo prilagodiš z ročaji.
        </p>
        <div className="grid grid-cols-2 gap-2 px-4 pb-5">
          {BED_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onCreate(p.width, p.height)}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border border-stone-200 active:bg-green-50 active:border-green-300"
            >
              {/* Pomanjšan predogled oblike */}
              <div className="h-16 flex items-center justify-center">
                <div
                  className="rounded bg-green-200 border-2 border-green-400"
                  style={{
                    width: Math.max(10, (p.width / Math.max(p.width, p.height)) * 56),
                    height: Math.max(10, (p.height / Math.max(p.width, p.height)) * 56),
                  }}
                />
              </div>
              <span className="text-sm font-semibold text-stone-800">{p.label}</span>
              <span className="text-xs text-stone-500">
                {formatBedSize(p.width, p.height)} · {formatArea(p.width, p.height)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
