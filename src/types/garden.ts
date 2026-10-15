export interface GardenBed {
  id: string;
  user_id: string;
  garden_id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
