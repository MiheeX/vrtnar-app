// Setveni koledar rastlin (meseci 1–12 iz plants.sow_indoors / sow_outdoors / transplant / harvest)

export interface PlantSeason {
  sow_indoors?: number[] | null;
  sow_outdoors?: number[] | null;
  transplant?: number[] | null;
  harvest?: number[] | null;
}

export const MONTH_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"];
export const MONTH_LETTER = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export type SeasonKind = "sow_indoors" | "sow_outdoors" | "transplant" | "harvest";

export const SEASON_LABEL: Record<SeasonKind, string> = {
  sow_indoors: "Setev v zaprtem",
  sow_outdoors: "Setev na prosto",
  transplant: "Sajenje sadik",
  harvest: "Pobiranje",
};

export const SEASON_COLOR: Record<SeasonKind, string> = {
  sow_indoors: "#a78bfa",
  sow_outdoors: "#22c55e",
  transplant: "#0ea5e9",
  harvest: "#f59e0b",
};

export const currentMonth = () => new Date().getMonth() + 1;

// Meseci → "mar–maj, avg–sep" (zaporedni meseci združeni, tudi čez novo leto)
export function formatMonths(months: number[] | null | undefined): string {
  if (!months?.length) return "—";
  const set = new Set(months);
  const next = (m: number) => (m % 12) + 1;
  const prev = (m: number) => ((m + 10) % 12) + 1;
  const runs: [number, number][] = [];
  for (let m = 1; m <= 12; m++) {
    if (!set.has(m) || set.has(prev(m))) continue; // m ni začetek niza
    let end = m;
    while (set.has(next(end)) && next(end) !== m) end = next(end);
    runs.push([m, end]);
  }
  if (!runs.length) return "vse leto";
  return runs
    .map(([a, b]) => (a === b ? MONTH_SHORT[a - 1] : `${MONTH_SHORT[a - 1]}–${MONTH_SHORT[b - 1]}`))
    .join(", ");
}

// Kaj lahko s to rastlino narediš ta mesec (za značko "zdaj …")
export function nowAction(plant: PlantSeason, month = currentMonth()): string | null {
  if (plant.transplant?.includes(month)) return "zdaj sadi";
  if (plant.sow_outdoors?.includes(month)) return "zdaj sej";
  if (plant.sow_indoors?.includes(month)) return "zdaj sej v zaprtem";
  return null;
}
