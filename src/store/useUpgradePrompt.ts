import { create } from "zustand";

// Kaj je uporabnik poskusil narediti, ko je presegel paket Free.
// Nov omejen vir → dodaj razlog tukaj in besedilo v UpgradeModal.
export type UpgradeReason = "gardens" | "plants";

interface UpgradePromptState {
  reason: UpgradeReason | null;
  // npr. ime rastline, ki je ni bilo mogoče dodati
  detail: string | null;
  show: (reason: UpgradeReason, detail?: string | null) => void;
  hide: () => void;
}

// Globalni poziv k nadgradnji: vsaka akcija, ki preseže Free, pokliče show().
// UpgradeModal (v GardenPage) se prikaže na sredini zaslona.
export const useUpgradePrompt = create<UpgradePromptState>()((set) => ({
  reason: null,
  detail: null,
  show: (reason, detail = null) => set({ reason, detail }),
  hide: () => set({ reason: null, detail: null }),
}));

// Za klic izven Reacta (npr. iz hookov po napaki baze)
export const promptUpgrade = (reason: UpgradeReason, detail?: string | null) =>
  useUpgradePrompt.getState().show(reason, detail);
