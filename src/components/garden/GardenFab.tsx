import { useState } from "react";
import { LayoutGrid, Plus, Sprout, X } from "lucide-react";

interface Props {
  onNewBed: () => void;
  onPlant: () => void;
  hasBeds: boolean;
  bottomOffset: number; // nad akcijsko vrstico, kadar je odprta
}

// Glavni gumb "+" spodaj desno: nova gredica ali sajenje
export function GardenFab({ onNewBed, onPlant, hasBeds, bottomOffset }: Props) {
  const [open, setOpen] = useState(false);

  const item = (label: string, icon: React.ReactNode, onClick: () => void, disabled = false) => (
    <button
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      disabled={disabled}
      className="flex items-center gap-3 pl-4 pr-5 py-3 rounded-full bg-white shadow-lg text-[15px] font-medium text-stone-800 active:bg-stone-50 disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      className="absolute right-4 z-30 flex flex-col items-end gap-2 transition-[bottom] duration-200"
      style={{ bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {open && (
        <>
          {item("Posadi rastlino", <Sprout size={20} className="text-green-600" />, onPlant, !hasBeds)}
          {item("Nova gredica", <LayoutGrid size={20} className="text-green-600" />, onNewBed)}
        </>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Zapri" : "Dodaj"}
        aria-expanded={open}
        className="w-14 h-14 rounded-full bg-green-600 text-white shadow-xl flex items-center justify-center active:bg-green-700 transition-transform"
      >
        {open ? <X size={26} /> : <Plus size={28} />}
      </button>
    </div>
  );
}
