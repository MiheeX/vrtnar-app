import { useState, useEffect } from "react";
import { X, Plus, Minus, Check, Trash2 } from "lucide-react";
import { usePlants } from "../hooks/usePlants";
import type { UserInventoryPlant } from "../types/index";

interface Props {
  open: boolean;
  onClose: () => void;
  inventory: UserInventoryPlant[];
  onAdd: (plantId: string, quantity: number) => void;
  onRemove: (userPlantId: string) => void;
  embedded?: boolean;
}

export function PlantSelectorModal({
  open,
  onClose,
  inventory,
  onAdd,
  onRemove,
  embedded = false,
}: Props) {
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

  // Standalone mode — ne prikaži če ni odprt
  if (!embedded && !open) return null;

  const list = (
    <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-3">
      {loading && (
        <p className="text-stone-400 text-sm text-center py-8">Nalagam...</p>
      )}
      {plants.map((plant) => {
        const entry = getInventoryEntry(plant.id);
        const inInventory = !!entry;
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
            </div>

            <div className="flex items-center gap-2">
              {inInventory && (
                <span className="text-green-600 text-xs font-medium whitespace-nowrap">
                  ✓ {entry!.quantity} v zalogah
                </span>
              )}

              {!inInventory && (
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
              )}

              {inInventory ? (
                <button
                  onClick={() => onRemove(entry!.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-100 text-red-600 text-sm font-medium hover:bg-red-200 transition-colors"
                >
                  <Trash2 size={14} /> Odstrani
                </button>
              ) : (
                <button
                  onClick={() => onAdd(plant.id, getQty(plant.id))}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors"
                >
                  <Check size={14} /> Dodaj
                </button>
              )}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl z-10 max-h-[80vh] flex flex-col">
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
        {list}
      </div>
    </div>
  );
}
