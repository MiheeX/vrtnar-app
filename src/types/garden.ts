export interface GardenBed {
  id: string;
  name: string;
  // grid coordinates (in cells)
  x: number;
  y: number;
  width: number; // in cells
  height: number; // in cells
  color: string;
}

export type AppMode = "pan" | "draw";

export type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

export interface DraftBed {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}
