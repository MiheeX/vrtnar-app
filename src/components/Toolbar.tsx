import { Settings, Move, Pencil, ShoppingBasket } from "lucide-react";

type Mode = "pan" | "draw";

interface ToolbarProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onSettingsOpen: () => void;
  onInventoryOpen: () => void;
}

export function Toolbar({
  mode,
  onModeChange,
  onSettingsOpen,
  onInventoryOpen,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 shadow-sm">
      {/* Leva stran - naslov */}
      <div className="flex items-center gap-2 flex-1">
        <span className="text-xl">🌱</span>
        <span className="font-semibold text-gray-800">Moj vrt</span>
      </div>

      {/* Desna stran - orodja */}
      <div className="flex items-center gap-2">
        <button
          onClick={onInventoryOpen}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          title="Moj inventar"
        >
          <ShoppingBasket size={20} />
        </button>

        <button
          onClick={onSettingsOpen}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          title="Nastavitve rastlin"
        >
          <Settings size={20} />
        </button>

        <button
          onClick={() => onModeChange("pan")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            mode === "pan"
              ? "bg-green-500 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Move size={15} />
          Premikaj
        </button>

        <button
          onClick={() => onModeChange("draw")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            mode === "draw"
              ? "bg-amber-400 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Pencil size={15} />
          Riši
        </button>
      </div>
    </div>
  );
}
