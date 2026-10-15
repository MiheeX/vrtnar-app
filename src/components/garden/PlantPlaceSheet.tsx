import { useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import { usePlants } from "../../hooks/usePlants";
import type { Plant, UserInventoryPlant } from "../../types/index";
import { promptUpgrade } from "../../store/useUpgradePrompt";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (plant: Plant) => void;
  inventory: UserInventoryPlant[];
  totalFor: (plantId: string) => number;
  maxPerPlant: number | null;
  targetBedName?: string | null;
}

// Izbira rastline za sajenje: rastline iz zaloge najprej, nato celoten katalog.
// Po izbiri se odpre način sajenja (tap na gredico posadi).
export function PlantPlaceSheet(props: Props) {
  if (!props.open) return null;
  return <PlantPlaceSheetContent {...props} />;
}

function PlantPlaceSheetContent({
  onClose,
  onPick,
  inventory,
  totalFor,
  maxPerPlant,
  targetBedName,
}: Props) {
  const { plants, loading } = usePlants();
  const [query, setQuery] = useState("");

  const qty = (id: string) => inventory.find((i) => i.plant_id === id)?.quantity ?? 0;
  const filtered = plants
    .filter((p) =>
      `${p.name} ${p.latin_name ?? ""}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => Number(qty(b.id) > 0) - Number(qty(a.id) > 0));

  const pick = (plant: Plant) => {
    if (maxPerPlant != null && totalFor(plant.id) >= maxPerPlant && qty(plant.id) === 0) {
      promptUpgrade("plants", plant.name);
      return;
    }
    onPick(plant);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl h-[75vh] flex flex-col overflow-hidden animate-slide-up">
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-stone-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-stone-800">Kaj boš posadil?</h2>
              {targetBedName && (
                <p className="text-xs text-stone-500">v gredico {targetBedName}</p>
              )}
            </div>
            <button onClick={onClose} aria-label="Zapri" className="p-2 -mr-2 text-stone-400">
              <X size={22} />
            </button>
          </div>
          <div className="relative mt-3">
            <Search size={16} className="absolute left-3 top-3 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Išči rastlino…"
              className="w-full pl-9 pr-3 py-2.5 text-base border border-stone-200 rounded-xl bg-stone-50 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 pb-safe">
          {loading && <p className="text-sm text-stone-400 text-center py-6">Nalagam…</p>}
          {filtered.map((plant) => {
            const inStock = qty(plant.id);
            const total = totalFor(plant.id);
            const atLimit = maxPerPlant != null && total >= maxPerPlant && inStock === 0;
            return (
              <button
                key={plant.id}
                onClick={() => pick(plant)}
                className="w-full flex items-center gap-3 px-2 py-3 rounded-xl text-left active:bg-green-50"
              >
                <span className="text-3xl w-10 text-center">{plant.img}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-stone-800">{plant.name}</span>
                  <span className="block text-xs text-stone-400">
                    {plant.cells_spacing} × {plant.cells_spacing} polj
                    {maxPerPlant != null && ` · ${total} / ${maxPerPlant}`}
                  </span>
                </span>
                {inStock > 0 ? (
                  <span className="shrink-0 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                    {inStock} v zalogi
                  </span>
                ) : atLimit ? (
                  <Sparkles size={18} className="shrink-0 text-amber-500" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
