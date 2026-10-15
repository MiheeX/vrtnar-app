import type { PlacingPlant } from "./GardenCanvas";
import { HEAT_COLOR } from "./placement";

interface Props {
  placing: PlacingPlant;
  placedCount: number;
  remaining: number | null; // ocena prostora v ciljni gredici
  stockLeft: number | null; // "Sadi iz zaloge": še v zalogi (null = ni omejeno z zalogo)
  onDone: () => void;
  onChange: () => void;
}

// Vrstica med sajenjem: katera rastlina, koliko jih je posajenih, legenda barv, "Končano"
export function PlacementBar({
  placing,
  placedCount,
  remaining,
  stockLeft,
  onDone,
  onChange,
}: Props) {
  return (
    <div
      className="absolute left-0 right-0 bottom-0 z-30 px-3 pb-safe"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mx-auto mb-3 max-w-lg rounded-2xl bg-white shadow-xl border border-stone-200 p-3 animate-pop-in">
        <div className="flex items-center gap-3">
          <button
            onClick={onChange}
            className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-xl active:bg-stone-50"
            aria-label="Zamenjaj rastlino"
          >
            <span className="text-3xl">{placing.img}</span>
            <span className="min-w-0">
              <span className="block font-semibold text-stone-800 truncate">{placing.name}</span>
              <span className="block text-xs text-stone-500">
                {placedCount > 0 ? `Posajenih: ${placedCount}` : "Tapni na gredico"}
                {stockLeft != null && ` · v zalogi še ${stockLeft}`}
                {remaining != null && ` · prostora še za ~${remaining}`}
              </span>
            </span>
          </button>
          <button
            onClick={onDone}
            className="shrink-0 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold active:bg-green-700"
          >
            Končano
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-2 text-[11px] text-stone-500">
          <Legend color={HEAT_COLOR.good} label="dober sosed" />
          <Legend color={HEAT_COLOR.ok} label="prosto" border />
          <Legend color={HEAT_COLOR.near} label="preblizu" />
          <Legend color={HEAT_COLOR.bad} label="slab sosed" />
          <Legend color={HEAT_COLOR.blocked} label="zasedeno" />
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={`w-3 h-3 rounded-sm ${border ? "border border-stone-300" : ""}`}
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
