import { useState, useEffect } from "react";
import { X, Plus, Minus, Check } from "lucide-react";
import { usePlants } from "../hooks/usePlants";
import type { UserInventoryPlant } from "../types/index";

interface Props {
  open: boolean;
  onClose: () => void;
  inventory: UserInventoryPlant[];
  onAdd: (plantId: string, quantity: number) => void;
  onRemove: (userPlantId: string) => void;
}

export function PlantSelectorModal({ open, onClose, inventory, onAdd }: Props) {
  const { plants, loading } = usePlants();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const getInventoryEntry = (plantId: string) =>
    inventory.find((i) => i.plant_id === plantId);

  const getQty = (plantId: string) => quantities[plantId] ?? 1;

  const adjustQty = (plantId: string, delta: number) => {
    setQuantities((prev) => ({
      ...prev,
      [plantId]: Math.max(1, (prev[plantId] ?? 1) + delta),
    }));
  };

  useEffect(() => {
    if (open) setQuantities({});
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl z-10 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <h2 className="font-semibold text-stone-800 text-lg">
            🌱 Izberi rastline
          </h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600"
          >
            <X size={22} />
          </button>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-3">
          {loading && (
            <p className="text-stone-400 text-sm text-center py-8">
              Nalagam...
            </p>
          )}
          {plants.map((plant) => {
            const entry = getInventoryEntry(plant.id);
            const inInventory = !!entry;
            return (
              <div
                key={plant.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-stone-50"
              >
                {/* Emoji */}
                <span className="text-3xl">{plant.img}</span>

                {/* Info */}
                <div className="flex-1">
                  <p className="font-medium text-stone-800">{plant.name}</p>
                  {plant.latin_name && (
                    <p className="text-xs text-stone-400 italic">
                      {plant.latin_name}
                    </p>
                  )}
                  <p className="text-xs text-stone-500 mt-0.5">
                    📐 {plant.cells_spacing} cel · 🔲{" "}
                    {plant.around_cells_spacing} odmik
                  </p>
                </div>

                {/* Quantity + Add/Remove */}
                <div className="flex items-center gap-2">
                  {inInventory && (
                    <span className="text-green-500 text-xs font-medium">
                      ✓ {entry!.quantity} v inventarju
                    </span>
                  )}
                  <div className="flex items-center gap-1 border border-stone-300 rounded-lg overflow-hidden">
                    <button
                      onClick={() => adjustQty(plant.id, -1)}
                      className="px-2 py-1 text-stone-500 hover:bg-stone-100"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="px-2 text-sm font-medium">
                      {getQty(plant.id)}
                    </span>
                    <button
                      onClick={() => adjustQty(plant.id, 1)}
                      className="px-2 py-1 text-stone-500 hover:bg-stone-100"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <button
                    onClick={() => onAdd(plant.id, getQty(plant.id))}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500 text-white text-sm font-medium"
                  >
                    <Check size={14} /> Dodaj
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
