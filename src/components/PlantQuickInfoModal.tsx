import { X } from "lucide-react";
import type { BedPlant } from "../hooks/useBedPlants";

interface Props {
  bedPlant: BedPlant | null;
  onClose: () => void;
  onOpenDetail: () => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Datum ni znan";
  return new Date(dateStr).toLocaleDateString("sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function PlantQuickInfo({ bedPlant, onClose, onOpenDetail }: Props) {
  if (!bedPlant) return null;
  const plant = bedPlant.plant;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
      <div
        className="pointer-events-auto mx-auto max-w-lg bg-white border-t border-stone-200 rounded-t-2xl shadow-xl px-4 py-3 flex items-center gap-3"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Emoji */}
        <span className="text-3xl flex-shrink-0">{plant?.img}</span>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-stone-800 text-sm leading-tight truncate">
            {plant?.name}
            {bedPlant.variety && (
              <span className="font-normal text-stone-400 ml-1">
                · {bedPlant.variety}
              </span>
            )}
          </p>
          <p className="text-xs text-stone-400 mt-0.5">
            🌱 {formatDate(bedPlant.planted_at)}
          </p>
          {bedPlant.last_watered_at && (
            <p className="text-xs text-blue-400 mt-0.5">
              💧 Zalivano: {formatDate(bedPlant.last_watered_at)}
            </p>
          )}
        </div>

        {/* Akcije */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onOpenDetail}
            className="px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600 transition-colors"
          >
            Več info →
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-600"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
