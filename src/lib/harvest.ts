// Zrelost rastlin za pobiranje: datum sajenja + dnevi do pobiranja (katalog), z meseci pobiranja kot preverbo.
// Enkratno pobiranje (solata, zelje …): okno = sajenje + min … sajenje + max (+14 dni), nato "prezrelo".
// Dolgotrajno pobiranje (continuous_harvest: paradižnik, bučke …): od prvega pobiranja do konca sezone
// pobiranja (zadnji zaporedni mesec v plants.harvest), šele nato "prezrelo".
import type { BedPlant } from "../hooks/useBedPlants";

export type HarvestStatus = "ready" | "soon" | "overdue";

export interface HarvestInfo {
  status: HarvestStatus;
  // ready: dni od začetka zrelosti; soon: dni do zrelosti; overdue: dni čez konec okna
  days: number;
  // dolgotrajno pobiranje: pobiraj do tega dne (konec sezone)
  until?: Date;
}

export const SOON_DAYS = 7; // "kmalu" = do 7 dni pred zrelostjo
export const OVERDUE_GRACE_DAYS = 14; // enkratno pobiranje: po najdaljšem roku še 14 dni "zrelo"

const DAY_MS = 86_400_000;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const diffDays = (a: Date, b: Date) => Math.round((dayStart(b).getTime() - dayStart(a).getTime()) / DAY_MS);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Zadnji dan sezone pobiranja, ki se začne pri datumu `from` (zaporedni meseci iz `months`, čez novo leto)
function seasonEnd(from: Date, months: number[]): Date | null {
  if (months.length === 0) return null;
  let y = from.getFullYear();
  let m = from.getMonth() + 1;
  let guard = 0;
  while (!months.includes(m) && guard++ < 12) {
    m = (m % 12) + 1;
    if (m === 1) y++;
  }
  if (!months.includes(m)) return null;
  guard = 0;
  while (months.includes((m % 12) + 1) && guard++ < 11) {
    m = (m % 12) + 1;
    if (m === 1) y++;
  }
  return new Date(y, m, 0); // zadnji dan meseca m
}

// Podrobnosti zrelosti (tudi ko rastlina še raste); null = ni podatkov
export interface HarvestDetail {
  info: HarvestInfo | null;
  age: number; // dni od sajenja
  min: number;
  max: number;
  start: Date; // začetek pobiranja: sajenje + min
  end: Date; // konec okna: sajenje + max ali konec sezone (dolgotrajno)
  continuous: boolean;
  outOfSeason: boolean; // čas rasti je potekel, a mesec ni v sezoni pobiranja
}

export function harvestDetail(bp: BedPlant, today: Date = new Date()): HarvestDetail | null {
  const plant = bp.plant;
  const min = plant?.days_to_harvest_min;
  if (!bp.planted_at || !min) return null;
  const max = Math.max(min, plant?.days_to_harvest_max ?? min);
  const [y, m, d] = bp.planted_at.slice(0, 10).split("-").map(Number);
  const planted = new Date(y, m - 1, d);
  const age = diffDays(planted, today);
  const months = plant?.harvest ?? [];
  const continuous = !!plant?.continuous_harvest;
  const start = addDays(planted, min);
  const end = (continuous && seasonEnd(start, months)) || addDays(planted, max);
  const inSeason = (date: Date) => months.length === 0 || months.includes(date.getMonth() + 1);
  const lastDay = continuous ? end : addDays(end, OVERDUE_GRACE_DAYS);

  let info: HarvestInfo | null = null;
  let outOfSeason = false;
  if (diffDays(today, lastDay) < 0) {
    info = { status: "overdue", days: diffDays(end, today) };
  } else if (age >= min) {
    if (continuous) info = { status: "ready", days: age - min, until: end };
    else if (inSeason(today)) info = { status: "ready", days: age - min };
    else outOfSeason = true;
  } else if (min - age <= SOON_DAYS) {
    if (inSeason(start)) info = { status: "soon", days: min - age };
    else outOfSeason = true;
  }
  return { info, age, min, max, start, end, continuous, outOfSeason };
}

// null = še raste (ali ni podatkov)
export function harvestInfo(bp: BedPlant, today: Date = new Date()): HarvestInfo | null {
  return harvestDetail(bp, today)?.info ?? null;
}

export function harvestMap(bedPlants: BedPlant[], today: Date = new Date()) {
  const map: Record<string, HarvestInfo> = {};
  for (const bp of bedPlants) {
    const info = harvestInfo(bp, today);
    if (info) map[bp.id] = info;
  }
  return map;
}

// "zrelo že 5 dni", "čez 3 dni", "prezrelo 20 dni"
export function harvestLabel(info: HarvestInfo): string {
  const d = (n: number) => (n === 1 ? "1 dan" : n === 2 ? "2 dni" : `${n} dni`);
  if (info.status === "ready" && info.until)
    return `pobiraj do ${info.until.toLocaleDateString("sl-SI", { day: "numeric", month: "short" })}`;
  if (info.status === "ready") return info.days === 0 ? "zrelo od danes" : `zrelo že ${d(info.days)}`;
  if (info.status === "soon") return info.days === 0 ? "zrelo danes" : `čez ${d(info.days)}`;
  return `prezrelo ${d(info.days)}`;
}

export const HARVEST_ORDER: Record<HarvestStatus, number> = { overdue: 0, ready: 1, soon: 2 };
