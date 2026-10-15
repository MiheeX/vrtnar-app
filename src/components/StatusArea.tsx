import { useEffect } from "react";
import { useUndo } from "../store/useUndo";

export interface DragWarning {
  bad: string[]; // slabi sosedje v dosegu
  near: string[]; // preblizu (around_cells_spacing)
}

const TOAST_MS = 5000; // z "Razveljavi"
const NOTICE_MS = 2500; // samo obvestilo

// Statusno območje pod zgornjo vrstico: obvestila (z "Razveljavi") in opozorila med vlečenjem.
// Spodnji del zaslona ostane prost za palec (akcijska vrstica, sajenje, + gumb).
export function StatusArea({ warning }: { warning: DragWarning | null }) {
  const toast = useUndo((s) => s.toast);
  const undoById = useUndo((s) => s.undoById);
  const dismiss = useUndo((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, toast.undoId ? TOAST_MS : NOTICE_MS);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  if (!toast && !warning) return null;

  return (
    <div
      className="absolute top-2 left-0 right-0 z-40 flex flex-col items-center gap-1.5 px-14 pointer-events-none"
      aria-live="polite"
    >
      {warning && (warning.bad.length > 0 || warning.near.length > 0) && (
        <div className="max-w-sm w-full rounded-xl bg-white/95 shadow-lg border border-stone-200 px-3 py-2 text-xs animate-pop-in">
          {warning.bad.length > 0 && (
            <p className="font-semibold text-red-600">🚫 Slab sosed: {warning.bad.join(", ")}</p>
          )}
          {warning.near.length > 0 && (
            <p className="text-amber-700">⚠️ Preblizu: {warning.near.join(", ")}</p>
          )}
        </div>
      )}

      {toast && (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto max-w-sm w-full flex items-center gap-2 rounded-xl bg-stone-800/95 text-white text-sm shadow-lg pl-4 pr-1.5 py-1.5 animate-pop-in"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="flex-1 min-w-0 truncate">{toast.message}</span>
          {toast.undoId && (
            <button
              onClick={() => undoById(toast.undoId!)}
              className="shrink-0 px-3 py-1.5 rounded-lg font-semibold text-amber-300 active:bg-white/10"
            >
              Razveljavi
            </button>
          )}
        </div>
      )}
    </div>
  );
}
