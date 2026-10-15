import { create } from "zustand";

// Zgodovina razveljavitev + obvestilo (toast) na dnu zaslona.
// Namesto potrditvenih dialogov: akcija se izvede takoj, toast ponudi "Razveljavi".

export interface UndoEntry {
  id: number;
  label: string; // npr. "Gredica izbrisana"
  undo: () => Promise<void> | void;
}

interface Toast {
  id: number;
  message: string;
  undoId: number | null; // null = samo obvestilo brez razveljavitve
}

interface UndoState {
  history: UndoEntry[];
  toast: Toast | null;
  busy: boolean;
  push: (label: string, undo: UndoEntry["undo"]) => void;
  undoLast: () => Promise<void>;
  undoById: (id: number) => Promise<void>;
  notify: (message: string) => void;
  dismissToast: () => void;
  clear: () => void;
}

const MAX_HISTORY = 20;
let nextId = 1;

export const useUndo = create<UndoState>()((set, get) => {
  const run = async (entry: UndoEntry) => {
    set((s) => ({
      busy: true,
      history: s.history.filter((h) => h.id !== entry.id),
      toast: null,
    }));
    try {
      await entry.undo();
      get().notify("Razveljavljeno");
    } catch (err) {
      console.error("Razveljavitev ni uspela:", err);
      get().notify("Razveljavitev ni uspela");
    } finally {
      set({ busy: false });
    }
  };

  return {
    history: [],
    toast: null,
    busy: false,

    push: (label, undo) => {
      const entry = { id: nextId++, label, undo };
      set((s) => ({
        history: [...s.history, entry].slice(-MAX_HISTORY),
        toast: { id: nextId++, message: label, undoId: entry.id },
      }));
    },

    undoLast: async () => {
      const { history, busy } = get();
      const last = history[history.length - 1];
      if (!last || busy) return;
      await run(last);
    },

    undoById: async (id) => {
      const entry = get().history.find((h) => h.id === id);
      if (!entry || get().busy) return;
      await run(entry);
    },

    notify: (message) => set({ toast: { id: nextId++, message, undoId: null } }),
    dismissToast: () => set({ toast: null }),
    clear: () => set({ history: [], toast: null }),
  };
});

// Za klic izven komponent
export const pushUndo = (label: string, undo: UndoEntry["undo"]) =>
  useUndo.getState().push(label, undo);
export const notify = (message: string) => useUndo.getState().notify(message);
