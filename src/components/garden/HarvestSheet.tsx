import { X } from "lucide-react";
import type { BedPlant } from "../../hooks/useBedPlants";
import { harvestLabel, type HarvestInfo, type HarvestStatus } from "../../lib/harvest";
import { PlantIcon } from "../PlantIcon";

export interface HarvestItem {
  bp: BedPlant;
  info: HarvestInfo;
  bedName: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: HarvestItem[]; // že razvrščeni (najnujnejše najprej)
  onPick: (bedPlantId: string) => void;
  onTurnOff: () => void;
}

const SECTIONS: { status: HarvestStatus; title: string; tone: string }[] = [
  { status: "overdue", title: "Prezrelo — poberi čim prej", tone: "text-amber-700" },
  { status: "ready", title: "Zrelo za pobiranje", tone: "text-green-700" },
  { status: "soon", title: "Kmalu zrelo", tone: "text-stone-500" },
];

// Seznam rastlin za pobiranje (po datumu sajenja + dnevih do pobiranja); tap pokaže rastlino na platnu
export function HarvestSheet({ open, onClose, items, onPick, onTurnOff }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl max-h-[75vh] flex flex-col overflow-hidden animate-slide-up">
        <div className="flex-shrink-0 flex items-center justify-between px-4 pt-4 pb-3 border-b border-stone-100">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">Pobiranje</h2>
            <p className="text-xs text-stone-500">Po datumu sajenja in času do pobiranja</p>
          </div>
          <button onClick={onClose} aria-label="Zapri" className="p-2 -mr-2 text-stone-400">
            <X size={22} />
          </button>
        </div>

        <div className="min-h-0 shrink overflow-y-auto overscroll-contain px-3 py-2">
          {items.length === 0 && (
            <div className="text-center py-8 px-4">
              <div className="text-4xl">🌱</div>
              <p className="mt-2 font-semibold text-stone-800">Ta teden ni nič zrelo</p>
              <p className="mt-1 text-sm text-stone-500">
                Rastline se pokažejo tu, ko se približa njihov čas pobiranja.
              </p>
            </div>
          )}
          {SECTIONS.map(({ status, title, tone }) => {
            const rows = items.filter((i) => i.info.status === status);
            if (rows.length === 0) return null;
            return (
              <div key={status} className="mb-2">
                <p className={`px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide ${tone}`}>
                  {title} · {rows.length}
                </p>
                {rows.map(({ bp, info, bedName }) => (
                  <button
                    key={bp.id}
                    onClick={() => onPick(bp.id)}
                    className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left active:bg-green-50"
                  >
                    <span className="w-10 flex justify-center">
                      <PlantIcon icon={bp.plant?.icon} emoji={bp.plant?.img} size={30} title={bp.plant?.name} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-stone-800 truncate">
                        {bp.plant?.name ?? "Rastlina"}
                        {bp.variety && <span className="font-normal text-stone-400"> · {bp.variety}</span>}
                      </span>
                      <span className="block text-xs text-stone-400 truncate">{bedName}</span>
                    </span>
                    <span className={`shrink-0 text-xs font-semibold ${tone}`}>{harvestLabel(info)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        <div className="flex-shrink-0 px-4 py-3 border-t border-stone-100 pb-safe">
          <button
            onClick={onTurnOff}
            className="w-full py-2.5 rounded-xl border border-stone-200 text-sm font-medium text-stone-600 active:bg-stone-50"
          >
            Izklopi označevanje
          </button>
        </div>
      </div>
    </div>
  );
}
