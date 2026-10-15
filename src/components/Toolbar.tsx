import { Menu, Move, Pencil, ShoppingBasket } from "lucide-react";

type Mode = "pan" | "draw";

interface ToolbarProps {
  mode: Mode;
  gardenName: string;
  onModeChange: (mode: Mode) => void;
  onMenuOpen: () => void;
  onInventoryOpen: () => void;
}

export function Toolbar({
  mode,
  gardenName,
  onModeChange,
  onMenuOpen,
  onInventoryOpen,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-2 bg-white border-b border-gray-200 shadow-sm">
      {/* Leva stran - meni in ime vrta (tap odpre meni z vrtovi) */}
      <button
        onClick={onMenuOpen}
        className="flex items-center gap-1 flex-1 min-w-0 rounded-lg active:bg-gray-100 pr-2"
        aria-label="Odpri meni"
      >
        <span className="p-2 text-gray-700">
          <Menu size={22} />
        </span>
        <span className="font-semibold text-gray-800 truncate">
          {gardenName}
        </span>
      </button>

      {/* Desna stran - orodja */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onInventoryOpen}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          title="Moj inventar"
        >
          <ShoppingBasket size={20} />
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
