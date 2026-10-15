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
  // Poveča se ob vsaki lokalni spremembi gredic. Refetch, ki se je začel pred
  // spremembo, se zavrže — sicer bi star odgovor vrnil izbrisano/premaknjeno gredico.
  bedsVersion: number;
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
      bedsVersion: 0,
      mode: "pan",
      selectedBedId: null,

      setMode: (mode) => set({ mode }),
      addBed: (bed) =>
        set((s) => ({ beds: [...s.beds, bed], bedsVersion: s.bedsVersion + 1 })),
      updateBed: (id, updates) =>
        set((s) => ({
          beds: s.beds.map((b) => (b.id === id ? { ...b, ...updates } : b)),
          bedsVersion: s.bedsVersion + 1,
        })),
      removeBed: (id) =>
        set((s) => ({
          beds: s.beds.filter((b) => b.id !== id),
          bedsVersion: s.bedsVersion + 1,
        })),
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
