import { useState } from "react";
import { X } from "lucide-react";
import { PlantSelectorModal } from "./PlantSelectorModal";
import type { UserInventoryPlant } from "../types/index";

type Tab = "settings" | "plants";

interface Props {
  open: boolean;
  onClose: () => void;
  inventory: UserInventoryPlant[];
  onAdd: (plantId: string, quantity: number) => void;
  onRemove: (userPlantId: string) => void;
}

export function SettingsModal({
  open,
  onClose,
  inventory,
  onAdd,
  onRemove,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("settings");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl z-10 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <h2 className="font-semibold text-stone-800 text-lg">
            ⚙️ Nastavitve
          </h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600"
          >
            <X size={22} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stone-200">
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "settings"
                ? "text-green-600 border-b-2 border-green-500"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            ⚙️ Nastavitve aplikacije
          </button>
          <button
            onClick={() => setActiveTab("plants")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "plants"
                ? "text-green-600 border-b-2 border-green-500"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            🌱 Dodaj rastline
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "settings" && (
            <div className="px-4 py-6 flex flex-col gap-4">
              <p className="text-stone-400 text-sm text-center">
                Nastavitve bodo kmalu na voljo...
              </p>
              {/* Sem dodajaš parametre aplikacije */}
            </div>
          )}

          {activeTab === "plants" && (
            <PlantSelectorModal
              open={true}
              onClose={onClose}
              inventory={inventory}
              onAdd={onAdd}
              onRemove={onRemove}
              embedded={true}
            />
          )}
        </div>
      </div>
    </div>
  );
}
