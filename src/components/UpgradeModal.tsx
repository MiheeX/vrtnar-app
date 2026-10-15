import { useEffect, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { useUpgradePrompt, type UpgradeReason } from "../store/useUpgradePrompt";
import type { PlanLimits } from "../lib/plans";

interface Props {
  // Omejitve trenutnega paketa (za besedilo); null med nalaganjem
  limits: PlanLimits | null;
  onUpgrade: () => Promise<void>;
}

function reasonText(reason: UpgradeReason, limits: PlanLimits | null, detail: string | null) {
  if (reason === "gardens") {
    const n = limits?.max_gardens ?? 1;
    return `Paket Free omogoča ${n} ${n === 1 ? "vrt" : "vrtov"}. Za nov vrt potrebuješ Pro.`;
  }
  const n = limits?.max_per_plant ?? 10;
  const more = detail ? ` Za več rastline „${detail}“ potrebuješ Pro.` : "";
  return `Paket Free omogoča največ ${n} rastlin iste vrste (zaloga + posajeno).${more}`;
}

const PRO_BENEFITS = [
  "Neomejeno vrtov",
  "Neomejeno rastlin vsake vrste",
  "Nove funkcije za načrtovanje vrta",
];

// Modal na sredini zaslona, ki se pokaže vsakič, ko akcija preseže paket Free
export function UpgradeModal({ limits, onUpgrade }: Props) {
  const { reason, detail, hide } = useUpgradePrompt();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (reason) {
      setBusy(false);
      setError(null);
    }
  }, [reason]);

  // Pro uporabnik nima omejitev → modala ne kažemo
  if (!reason || limits?.plan === "pro") return null;

  const handleUpgrade = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onUpgrade(); // preusmeri na Stripe
    } catch {
      setError("Plačila trenutno niso na voljo. Poskusi kasneje.");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-title"
    >
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={hide} />

      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-pop-in">
        <button
          onClick={hide}
          aria-label="Zapri"
          className="absolute top-3 right-3 p-1.5 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100"
        >
          <X size={20} />
        </button>

        <div className="px-6 pt-7 pb-5 text-center bg-gradient-to-b from-amber-50 to-white">
          <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
            <Sparkles size={28} className="text-amber-600" />
          </div>
          <h2 id="upgrade-title" className="text-xl font-bold text-stone-800">
            Nadgradi na Pro
          </h2>
          <p className="mt-2 text-sm text-stone-600">{reasonText(reason, limits, detail)}</p>
        </div>

        <ul className="px-6 py-2 space-y-2">
          {PRO_BENEFITS.map((b) => (
            <li key={b} className="flex items-center gap-2 text-sm text-stone-700">
              <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <Check size={13} className="text-green-600" />
              </span>
              {b}
            </li>
          ))}
        </ul>

        <div className="px-6 pt-4 pb-6 flex flex-col gap-2">
          <button
            onClick={handleUpgrade}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-amber-500 text-white font-semibold shadow-sm active:bg-amber-600 disabled:opacity-60"
          >
            {busy ? "Odpiram plačilo..." : "Nadgradi na Pro"}
          </button>
          <button
            onClick={hide}
            className="w-full py-2.5 rounded-xl text-sm text-stone-500 active:bg-stone-100"
          >
            Ne zdaj
          </button>
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        </div>
      </div>
    </div>
  );
}
