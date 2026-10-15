import { Carrot, Menu, ShoppingBasket, Undo2 } from "lucide-react";

interface ToolbarProps {
  gardenName: string;
  onMenuOpen: () => void;
  onInventoryOpen: () => void;
  canUndo: boolean;
  undoLabel?: string;
  onUndo: () => void;
  // Pogled "Pobiranje": vklop/izklop in število zrelih (+ prezrelih) rastlin
  harvestOn: boolean;
  harvestCount: number;
  onHarvestToggle: () => void;
}

export function Toolbar({
  gardenName,
  onMenuOpen,
  onInventoryOpen,
  canUndo,
  undoLabel,
  onUndo,
  harvestOn,
  harvestCount,
  onHarvestToggle,
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

      {/* Desna stran - razveljavi in inventar */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onHarvestToggle}
          aria-pressed={harvestOn}
          className={`relative p-2.5 rounded-lg transition-colors ${
            harvestOn ? "bg-green-100 text-green-700" : "text-gray-600 active:bg-gray-100"
          }`}
          title={harvestOn ? "Izklopi pogled Pobiranje" : "Pobiranje: pokaži zrele rastline"}
          aria-label="Pobiranje"
        >
          <Carrot size={21} />
          {harvestCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-green-600 text-white text-[10px] font-bold leading-4 text-center">
              {harvestCount}
            </span>
          )}
        </button>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-2.5 rounded-lg text-gray-600 active:bg-gray-100 disabled:opacity-30 transition-opacity"
          title={canUndo && undoLabel ? `Razveljavi: ${undoLabel}` : "Razveljavi"}
          aria-label="Razveljavi"
        >
          <Undo2 size={21} />
        </button>
        <button
          onClick={onInventoryOpen}
          className="p-2.5 rounded-lg text-gray-600 active:bg-gray-100"
          title="Moj inventar"
          aria-label="Moj inventar"
        >
          <ShoppingBasket size={21} />
        </button>
      </div>
    </div>
  );
}
