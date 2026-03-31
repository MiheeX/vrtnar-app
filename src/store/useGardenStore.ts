import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GardenBed, AppMode } from "../types/garden";

const BED_COLORS = [
  "#86efac",
  "#6ee7b7",
  "#a5f3fc",
  "#c4b5fd",
  "#fde68a",
  "#fca5a5",
];

interface GardenStore {
  beds: GardenBed[];
  mode: AppMode;
  selectedBedId: string | null;

  setMode: (mode: AppMode) => void;
  addBed: (bed: GardenBed) => void;
  updateBed: (id: string, updates: Partial<GardenBed>) => void;
  removeBed: (id: string) => void;
  selectBed: (id: string | null) => void;
}

export const useGardenStore = create<GardenStore>()(
  persist(
    (set) => ({
      beds: [],
      mode: "pan",
      selectedBedId: null,

      setMode: (mode) => set({ mode }),
      addBed: (bed) => set((s) => ({ beds: [...s.beds, bed] })),
      updateBed: (id, updates) =>
        set((s) => ({
          beds: s.beds.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        })),
      removeBed: (id) =>
        set((s) => ({ beds: s.beds.filter((b) => b.id !== id) })),
      selectBed: (id) => set({ selectedBedId: id }),
    }),
    {
      name: "garden-store",
      partialize: (state) => ({
        mode: state.mode,
        // beds namerno izpuščen
      }),
    },
  ),
);

export { BED_COLORS };
