import type { BedPlant } from "../hooks/useBedPlants";
import { harvestDetail, harvestLabel, type HarvestDetail } from "../lib/harvest";
import { formatMonths } from "../lib/season";

// Vsebina lista rastline v pogledu "Pobiranje": stanje zrelosti, okno pobiranja, nasvet.

const fmt = (d: Date) => d.toLocaleDateString("sl-SI", { day: "numeric", month: "short" });
const dni = (n: number) => (n === 1 ? "1 dan" : n === 2 ? "2 dni" : `${n} dni`);

type Tone = "ready" | "overdue" | "soon" | "growing" | "off";

const TONE: Record<Tone, { box: string; title: string; text: string; bar: string }> = {
  ready: { box: "bg-green-50 border-green-200", title: "text-green-800", text: "text-green-700", bar: "bg-green-500" },
  overdue: { box: "bg-amber-50 border-amber-200", title: "text-amber-800", text: "text-amber-700", bar: "bg-amber-500" },
  soon: { box: "bg-lime-50 border-lime-200", title: "text-lime-800", text: "text-lime-700", bar: "bg-lime-500" },
  growing: { box: "bg-stone-50 border-stone-200", title: "text-stone-700", text: "text-stone-500", bar: "bg-stone-400" },
  off: { box: "bg-stone-50 border-stone-200", title: "text-stone-700", text: "text-stone-500", bar: "bg-stone-300" },
};

function summarize(d: HarvestDetail, harvestMonths: number[]) {
  const tone: Tone = d.info?.status ?? (d.outOfSeason ? "off" : "growing");
  const title =
    tone === "overdue"
      ? `Prezrelo ${dni(d.info!.days)}`
      : tone === "ready"
        ? d.continuous
          ? `V sezoni pobiranja · do ${fmt(d.end)}`
          : d.info!.days === 0
            ? "Zrelo od danes"
            : `Zrelo že ${dni(d.info!.days)}`
        : tone === "soon"
          ? `Zrelo ${harvestLabel(d.info!)}`
          : tone === "off"
            ? "Zunaj sezone pobiranja"
            : `Še raste · zrelo čez ${dni(d.min - d.age)}`;
  const advice =
    tone === "overdue"
      ? d.continuous
        ? "Sezona pobiranja je mimo. Poberi zadnje plodove in odstrani rastlino, da sprostiš prostor."
        : "Rok pobiranja je mimo. Poberi, kar je še dobro, in sprosti prostor za novo setev."
      : tone === "ready"
        ? d.continuous
          ? `Rodi od ${fmt(d.start)} Pobiraj sproti — redno pobiranje spodbudi nove plodove.`
          : `Čas za pobiranje — najboljše do ${fmt(d.end)}`
        : tone === "soon"
          ? "Kmalu bo zrelo — preveri rastlino v naslednjih dneh."
          : tone === "off"
            ? `Čas rasti je potekel, a ta mesec ni v sezoni pobiranja (${formatMonths(harvestMonths)}).`
            : `Pričakovano pobiranje okoli ${fmt(d.start)}`;
  // Napredek: 0 = sajenje, 1 = konec okna pobiranja
  const total = Math.max(1, d.min + Math.round((d.end.getTime() - d.start.getTime()) / 86_400_000));
  const progress = Math.min(1, Math.max(0, d.age / total));
  const startPct = (d.min / total) * 100;
  return { tone, title, advice, progress, startPct };
}

// Kratko stanje za "peek" del lista
export function HarvestPeek({ bedPlant }: { bedPlant: BedPlant }) {
  const d = harvestDetail(bedPlant);
  if (!d) {
    return (
      <p className="mb-4 text-sm text-stone-500">
        🧺 Za to rastlino ni podatka o času pobiranja{bedPlant.planted_at ? "" : " (manjka datum sajenja)"}.
      </p>
    );
  }
  const s = summarize(d, bedPlant.plant?.harvest ?? []);
  const t = TONE[s.tone];
  return (
    <div className={`mb-4 px-3 py-2.5 rounded-xl border ${t.box}`}>
      <p className={`text-sm font-semibold ${t.title}`}>🧺 {s.title}</p>
      <p className={`text-xs mt-0.5 ${t.text}`}>
        {d.continuous ? "Pobiranje" : "Okno pobiranja"}: {fmt(d.start)} – {fmt(d.end)} · posajeno pred {dni(d.age)}
      </p>
    </div>
  );
}

// Celoten razdelek za "full" del lista
export function HarvestSection({ bedPlant }: { bedPlant: BedPlant }) {
  const d = harvestDetail(bedPlant);
  const plant = bedPlant.plant;
  const months = plant?.harvest ?? [];
  if (!d) return null;
  const s = summarize(d, months);
  const t = TONE[s.tone];
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Pobiranje</p>
      <div className={`p-3 rounded-xl border ${t.box}`}>
        <p className={`text-base font-semibold ${t.title}`}>{s.title}</p>
        <p className={`text-sm mt-0.5 ${t.text}`}>{s.advice}</p>
        {/* Časovnica: sajenje → začetek pobiranja → konec okna */}
        <div className="relative mt-3 h-2 rounded-full bg-white/80 border border-black/5 overflow-hidden">
          <div
            className="absolute inset-y-0 bg-green-200"
            style={{ left: `${s.startPct}%`, right: 0 }}
          />
          <div className={`absolute inset-y-0 left-0 ${t.bar} opacity-70`} style={{ width: `${s.progress * 100}%` }} />
        </div>
        <div className="flex justify-between mt-1 text-[11px] text-stone-500">
          <span>Posajeno</span>
          <span>{fmt(d.start)} – {fmt(d.end)}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-xl border border-stone-200 bg-stone-50">
          <p className="text-[11px] text-stone-400">🌱 Posajeno pred</p>
          <p className="text-sm font-medium text-stone-700 mt-0.5">{dni(d.age)}</p>
        </div>
        <div className="p-2.5 rounded-xl border border-stone-200 bg-stone-50">
          <p className="text-[11px] text-stone-400">⏱️ {d.continuous ? "Do prvega pobiranja" : "Do pobiranja"}</p>
          <p className="text-sm font-medium text-stone-700 mt-0.5">
            {d.min === d.max ? dni(d.min) : `${d.min}–${d.max} dni`}
          </p>
        </div>
        <div className="col-span-2 p-2.5 rounded-xl border border-stone-200 bg-stone-50">
          <p className="text-[11px] text-stone-400">🗓️ Sezona pobiranja</p>
          <p className="text-sm font-medium text-stone-700 mt-0.5">{formatMonths(months)}</p>
        </div>
      </div>
    </div>
  );
}
