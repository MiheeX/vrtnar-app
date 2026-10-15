// Pravila postavitve rastline v gredico — ena koda za vlečenje rastline in za
// toplotni zemljevid pri sajenju. Vse koordinate so v sub-celicah, relativno na gredico.
import type { GardenBed } from "../../types/garden";
import type { PlantNeighbor } from "../../types";
import type { BedPlant } from "../../hooks/useBedPlants";

// blocked = ni prostora / izven gredice, bad = slab sosed, near = preblizu (around_cells_spacing),
// good = dober sosed v bližini, ok = prosto brez posebnosti
export type CellStatus = "blocked" | "bad" | "near" | "good" | "ok";

export type Relations = Map<string, "good" | "bad">;

// Barve toplotnega zemljevida — kontrastne tudi na zeleni/modri gredici
export const HEAT_COLOR: Record<CellStatus, string> = {
  blocked: "rgba(68,64,60,0.32)",
  bad: "rgba(220,38,38,0.62)",
  near: "rgba(245,158,11,0.6)",
  good: "rgba(21,128,61,0.65)",
  ok: "rgba(255,255,255,0.55)",
};

// Odnosi med rastlinami v obe smeri; "bad" ima prednost pred "good"
export function buildRelations(neighbors: PlantNeighbor[]): Relations {
  const map: Relations = new Map();
  for (const n of neighbors) {
    for (const key of [`${n.plant_id}|${n.neighbor_id}`, `${n.neighbor_id}|${n.plant_id}`]) {
      if (n.relationship === "bad" || !map.has(key)) map.set(key, n.relationship);
    }
  }
  return map;
}

const overlap = (
  ax: number, ay: number, aw: number,
  bx: number, by: number, bw: number,
) => ax < bx + bw && ax + aw > bx && ay < by + bw && ay + aw > by;

// Samo ime (emoji v besedilu se na starejših napravah lahko ne izriše)
const label = (bp: BedPlant) => bp.plant?.name ?? "";

export interface PlacementResult {
  status: CellStatus;
  badNames: string[]; // slabi sosedje v dosegu
  allBadNames: string[]; // vsi slabi sosedje v tej gredici
  nearNames: string[];
  goodNames: string[];
}

export function evaluatePlacement(args: {
  bed: GardenBed;
  plantId: string;
  spacing: number;
  ax: number;
  ay: number;
  bedPlants: BedPlant[];
  relations: Relations;
  excludeId?: string; // rastlina, ki jo premikamo
}): PlacementResult {
  const { bed, plantId, spacing: s, ax, ay, bedPlants, relations, excludeId } = args;
  const result: PlacementResult = {
    status: "ok",
    badNames: [],
    allBadNames: [],
    nearNames: [],
    goodNames: [],
  };

  if (ax < 0 || ay < 0 || ax + s > bed.width * 2 || ay + s > bed.height * 2) {
    result.status = "blocked";
    return result;
  }

  for (const bp of bedPlants) {
    if (bp.bed_id !== bed.id || bp.id === excludeId) continue;
    const ns = bp.plant?.cells_spacing ?? 1;
    const around = bp.plant?.around_cells_spacing ?? 0;

    if (overlap(ax, ay, s, bp.cell_x, bp.cell_y, ns)) {
      result.status = "blocked";
      return result;
    }

    const rel = relations.get(`${plantId}|${bp.plant_id}`);
    const inRange = overlap(ax, ay, s, bp.cell_x - 1, bp.cell_y - 1, ns + 2);
    if (rel === "bad") {
      const name = label(bp);
      if (!result.allBadNames.includes(name)) result.allBadNames.push(name);
      if (inRange && !result.badNames.includes(name)) result.badNames.push(name);
    } else if (rel === "good" && inRange) {
      const name = label(bp);
      if (!result.goodNames.includes(name)) result.goodNames.push(name);
    }

    if (around > 0 && overlap(ax, ay, s, bp.cell_x - around, bp.cell_y - around, ns + 2 * around)) {
      const name = label(bp);
      if (!result.nearNames.includes(name)) result.nearNames.push(name);
    }
  }

  result.status = result.badNames.length
    ? "bad"
    : result.nearNames.length
      ? "near"
      : result.goodNames.length
        ? "good"
        : "ok";
  return result;
}

// Sub-celica pod prstom → levi zgornji kot rastline, da je rastlina centrirana pod prstom
export function anchorFor(bed: GardenBed, cx: number, cy: number, spacing: number) {
  const off = Math.floor((spacing - 1) / 2);
  const clampAxis = (v: number, size: number) =>
    Math.max(0, Math.min(v - off, size * 2 - spacing));
  return { ax: clampAxis(cx, bed.width), ay: clampAxis(cy, bed.height) };
}

// Ali je postavitev dovoljena (blocked nikoli, bad samo z nastavitvijo)
export const isPlaceable = (status: CellStatus, allowBad: boolean) =>
  status !== "blocked" && (status !== "bad" || allowBad);

// Toplotni zemljevid za gredico: status za vsako sub-celico (centrirano pod prstom)
export function heatMapForBed(args: {
  bed: GardenBed;
  plantId: string;
  spacing: number;
  bedPlants: BedPlant[];
  relations: Relations;
}): CellStatus[][] {
  const { bed, spacing } = args;
  const rows: CellStatus[][] = [];
  for (let cy = 0; cy < bed.height * 2; cy++) {
    const row: CellStatus[] = [];
    for (let cx = 0; cx < bed.width * 2; cx++) {
      const { ax, ay } = anchorFor(bed, cx, cy, spacing);
      row.push(evaluatePlacement({ ...args, ax, ay }).status);
    }
    rows.push(row);
  }
  return rows;
}

// Koliko rastlin te vrste še gre v gredico (požrešno pakiranje, približno)
export function remainingCapacity(args: {
  bed: GardenBed;
  plantId: string;
  spacing: number;
  bedPlants: BedPlant[];
  relations: Relations;
  allowBad: boolean;
}): number {
  const { bed, spacing, allowBad } = args;
  const virtual: BedPlant[] = [...args.bedPlants];
  let count = 0;
  for (let ay = 0; ay + spacing <= bed.height * 2; ay++) {
    for (let ax = 0; ax + spacing <= bed.width * 2; ax++) {
      const { status } = evaluatePlacement({ ...args, bedPlants: virtual, ax, ay });
      // "near" (preblizu) šteje kot neprimerno za oceno kapacitete
      if (status === "blocked" || status === "near" || (status === "bad" && !allowBad)) continue;
      virtual.push({
        id: `virtual-${count}`,
        bed_id: bed.id,
        plant_id: args.plantId,
        cell_x: ax,
        cell_y: ay,
        quantity: 1,
        variety: null,
        planted_at: null,
        last_watered_at: null,
        notes: null,
        plant: { id: args.plantId, name: "", img: null, icon: null, cells_spacing: spacing, around_cells_spacing: 0 },
      });
      count++;
    }
  }
  return count;
}
