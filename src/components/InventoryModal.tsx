import { X, Minus } from "lucide-react";
import type { UserInventoryPlant } from "../types/index";

interface Props {
  open: boolean;
  onClose: () => void;
  inventory: UserInventoryPlant[];
  onRemove: (userPlantId: string) => void;
}

export function InventoryModal({ open, onClose, inventory, onRemove }: Props) {
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
            🧺 Moj inventar
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
              {/* Emoji */}
              <span className="text-3xl">{item.plant?.img}</span>

              {/* Info */}
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

              {/* Remove */}
              <button
                onClick={() => onRemove(item.id)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-500 text-sm font-medium"
              >
                <Minus size={14} /> Odstrani
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
