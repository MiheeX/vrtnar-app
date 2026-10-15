import { useState, useEffect } from "react";
import { X, Plus, Minus, Trash2, Sparkles } from "lucide-react";
import { usePlants } from "../hooks/usePlants";
import type { UserInventoryPlant } from "../types/index";
import type { AddPlantResult } from "../hooks/useUserInventory";

interface Props {
  open: boolean;
  onClose: () => void;
  inventory: UserInventoryPlant[];
  onAdd: (plantId: string, quantity: number) => Promise<AddPlantResult>;
  onRemove: (userPlantId: string) => void;
  embedded?: boolean;
  // Omejitev paketa: inventar + posajeno na vrsto rastline (null = brez omejitve)
  maxPerPlant?: number | null;
  totalFor?: (plantId: string) => number;
  onUpgrade?: () => void;
}

export function PlantSelectorModal({
  open,
  onClose,
  inventory,
  onAdd,
  onRemove,
  embedded = false,
  maxPerPlant = null,
  totalFor = () => 0,
  onUpgrade,
}: Props) {
  const { plants, loading } = usePlants();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [limitPlantId, setLimitPlantId] = useState<string | null>(null);

  const getInventoryEntry = (plantId: string) =>
    inventory.find((i) => i.plant_id === plantId);

  // Koliko jih še lahko doda (null = neomejeno)
  const remainingFor = (plantId: string) =>
    maxPerPlant == null ? null : Math.max(0, maxPerPlant - totalFor(plantId));

  const getQty = (plantId: string) => {
    const remaining = remainingFor(plantId);
    const qty = quantities[plantId] ?? 1;
    return remaining == null ? qty : Math.max(1, Math.min(qty, remaining));
  };

  const adjustQty = (plantId: string, delta: number) => {
    setQuantities((prev) => ({
      ...prev,
      [plantId]: Math.max(1, getQty(plantId) + delta),
    }));
  };

  const handleAdd = async (plantId: string) => {
    const result = await onAdd(plantId, getQty(plantId));
    setLimitPlantId(!result.ok && result.reason === "limit" ? plantId : null);
  };

  const filteredPlants = plants.filter((plant) =>
    `${plant.name} ${plant.latin_name ?? ""}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase()),
  );

  useEffect(() => {
    if (open) {
      setQuantities({});
      setSearchQuery("");
    }
  }, [open]);

  // Standalone mode — ne prikaži če ni odprt
  if (!embedded && !open) return null;

  const list = (
    <div className="flex flex-col gap-2 p-3">
      {/* Search bar */}
      <div className="relative mb-1">
        <input
          type="text"
          placeholder="Išči rastline..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-2 text-sm border border-stone-200 rounded-lg bg-stone-50 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
        />
        <svg
          className="absolute left-2.5 top-2.5 w-4 h-4 text-stone-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {loading && (
        <p className="text-sm text-stone-400 text-center py-4">Nalagam...</p>
      )}

      {!loading && filteredPlants.length === 0 && (
        <p className="text-sm text-stone-400 text-center py-4">
          Ni zadetkov za "{searchQuery}"
        </p>
      )}

      {filteredPlants.map((plant) => {
        const entry = getInventoryEntry(plant.id);
        const inInventory = !!entry;
        const remaining = remainingFor(plant.id);
        const atLimit = remaining === 0;
        return (
          <div
            key={plant.id}
            className={`flex items-center gap-3 p-3 rounded-xl border bg-stone-50 transition-colors ${
              inInventory ? "border-green-300 bg-green-50" : "border-stone-200"
            }`}
          >
            <span className="text-3xl">{plant.img}</span>

            <div className="flex-1">
              <p className="font-medium text-stone-800">{plant.name}</p>
              {plant.latin_name && (
                <p className="text-xs text-stone-400 italic">
                  {plant.latin_name}
                </p>
              )}
              <p className="text-xs text-stone-500 mt-0.5">
                📐 {plant.cells_spacing} cel · 🔲 {plant.around_cells_spacing}{" "}
                odmik
              </p>
              {inInventory && (
                <p className="text-xs text-green-600 font-medium mt-0.5">
                  ✓ {entry!.quantity} v zalogah
                </p>
              )}
              {maxPerPlant != null && (
                <p
                  className={`text-xs mt-0.5 ${atLimit ? "text-amber-600 font-medium" : "text-stone-400"}`}
                >
                  {totalFor(plant.id)} / {maxPerPlant} (zaloga + posajeno)
                </p>
              )}
              {(atLimit || limitPlantId === plant.id) && onUpgrade && (
                <button
                  onClick={onUpgrade}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700"
                >
                  <Sparkles size={12} /> Več s paketom Pro
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Quantity stepper — vedno prikazan */}
              {/* Quantity stepper */}
              <div className="flex items-center gap-1 border border-stone-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => adjustQty(plant.id, -1)}
                  className="px-2 py-1 text-stone-500 hover:bg-stone-100"
                >
                  <Minus size={13} />
                </button>
                <span className="px-2 text-sm font-medium min-w-[1.5rem] text-center">
                  {getQty(plant.id)}
                </span>
                <button
                  onClick={() => adjustQty(plant.id, 1)}
                  disabled={remaining != null && getQty(plant.id) >= remaining}
                  className="px-2 py-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                >
                  <Plus size={13} />
                </button>
              </div>

              {/* Dodaj — onemogočen, ko je omejitev paketa dosežena */}
              <button
                onClick={() => handleAdd(plant.id)}
                disabled={atLimit}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors disabled:bg-stone-300"
              >
                <Plus size={14} /> Dodaj
              </button>

              {/* Odstrani — samo če je v inventarju */}
              <div className="w-8 h-8 flex items-center justify-center">
                {inInventory && (
                  <button
                    onClick={() => onRemove(entry!.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Embedded — samo lista, brez overlay in headera
  if (embedded) return list;

  // Standalone
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl z-10 h-[80vh] flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <h2 className="font-semibold text-stone-800 text-lg">
            🌱 Dodaj rastline
          </h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600"
          >
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-safe">
          {list}
        </div>
      </div>
    </div>
  );
}
