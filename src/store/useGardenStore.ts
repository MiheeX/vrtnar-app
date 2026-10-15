import { create } from "zustand";
import type { GardenBed } from "../types/garden";

const BED_COLORS = [
  "#86efac",
  "#6ee7b7",
  "#a5f3fc",
  "#c4b5fd",
  "#fde68a",
  "#fca5a5",
];

// UI stanje platna. Gredice so iz Supabase (vir resnice); ničesar ne shranjujemo lokalno.
interface GardenStore {
  beds: GardenBed[];
  // Poveča se ob vsaki lokalni spremembi gredic. Refetch, ki se je začel pred
  // spremembo, se zavrže — sicer bi star odgovor vrnil izbrisano/premaknjeno gredico.
  bedsVersion: number;
  selectedBedId: string | null;

  addBed: (bed: GardenBed) => void;
  updateBed: (id: string, updates: Partial<GardenBed>) => void;
  removeBed: (id: string) => void;
  selectBed: (id: string | null) => void;
}

export const useGardenStore = create<GardenStore>()((set) => ({
  beds: [],
  bedsVersion: 0,
  selectedBedId: null,

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
}));

export { BED_COLORS };
