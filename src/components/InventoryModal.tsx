import { X, Minus, Trash2 } from "lucide-react";
import type { UserInventoryPlant } from "../types/index";

interface Props {
  open: boolean;
  onClose: () => void;
  inventory: UserInventoryPlant[];
  onRemove: (userPlantId: string) => void;
  onDecrement: (userPlantId: string, currentQuantity: number) => void;
}

export function InventoryModal({
  open,
  onClose,
  inventory,
  onRemove,
  onDecrement,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet — fiksna višina */}
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl z-10 h-[75vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <h2 className="font-semibold text-stone-800 text-lg">
            🧺 Moj inventar
          </h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600"
          >
            <X size={22} />
          </button>
        </div>

        {/* Scrollable lista */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {inventory.length === 0 && (
            <p className="text-stone-400 text-sm text-center py-8">
              Nimaš še nobene rastline v inventarju.
            </p>
          )}
          {inventory.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 bg-stone-50"
            >
              <span className="text-3xl">{item.plant?.img}</span>
              <div className="flex-1">
                <p className="font-medium text-stone-800">{item.plant?.name}</p>
                {item.plant?.latin_name && (
                  <p className="text-xs text-stone-400 italic">
                    {item.plant.latin_name}
                  </p>
                )}
                <p className="text-xs text-stone-500 mt-0.5">
                  Količina:{" "}
                  <span className="font-semibold">{item.quantity}</span>
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onDecrement(item.id, item.quantity)}
                  className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-200 transition-colors"
                >
                  <Minus size={14} />
                </button>
                <button
                  onClick={() => onRemove(item.id)}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
