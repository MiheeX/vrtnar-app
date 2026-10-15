import {
  MONTH_LETTER,
  SEASON_COLOR,
  SEASON_LABEL,
  currentMonth,
  formatMonths,
  type PlantSeason,
  type SeasonKind,
} from "../lib/season";

const KINDS: SeasonKind[] = ["sow_indoors", "sow_outdoors", "transplant", "harvest"];

// Setveni koledar: 12 mesecev × (setev v zaprtem, na prosto, sajenje, pobiranje)
export function PlantCalendar({ plant }: { plant: PlantSeason }) {
  const now = currentMonth();
  const rows = KINDS.filter((k) => (plant[k]?.length ?? 0) > 0);
  if (!rows.length) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Meseci */}
      <div className="grid grid-cols-12 gap-0.5 pl-[92px]">
        {MONTH_LETTER.map((m, i) => (
          <span
            key={i}
            className={`text-center text-[10px] ${
              i + 1 === now ? "font-bold text-green-700" : "text-stone-400"
            }`}
          >
            {m}
          </span>
        ))}
      </div>
      {rows.map((kind) => {
        const months = new Set(plant[kind] ?? []);
        return (
          <div key={kind} className="flex items-center gap-1">
            <span className="w-[88px] shrink-0 text-[11px] text-stone-500 leading-tight">
              {SEASON_LABEL[kind]}
            </span>
            <div
              className="grid grid-cols-12 gap-0.5 flex-1"
              title={`${SEASON_LABEL[kind]}: ${formatMonths(plant[kind])}`}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <span
                  key={i}
                  className={`h-3.5 rounded-sm ${i + 1 === now ? "ring-1 ring-green-700/60" : ""}`}
                  style={{
                    backgroundColor: months.has(i + 1) ? SEASON_COLOR[kind] : "#f0eeea",
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
