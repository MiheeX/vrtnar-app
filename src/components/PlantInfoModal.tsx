import { useState, useEffect } from "react";
import { X, Droplets, Pencil, Check } from "lucide-react";
import type { BedPlant } from "../hooks/useBedPlants";
import type { PlantNeighbor } from "../types";
import { supabase } from "../lib/supabaseClient";

interface Props {
  open: boolean;
  onClose: () => void;
  bedPlant: BedPlant | null;
  plantNeighbors: PlantNeighbor[];
  allBedPlants: BedPlant[];
  onUpdated: () => void;
  onOptimisticUpdate: (
    field: "variety" | "notes",
    value: string | null,
  ) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function PlantInfoModal({
  open,
  onClose,
  bedPlant,
  plantNeighbors,
  allBedPlants,
  onUpdated,
  onOptimisticUpdate,
}: Props) {
  const [variety, setVariety] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (bedPlant) {
      setVariety(bedPlant.variety ?? "");
      setNotes(bedPlant.notes ?? "");
    }
  }, [bedPlant?.id]); // samo ob menjavi rastline, ne ob vsakem renderu

  if (!open || !bedPlant) return null;

  const plant = bedPlant.plant;
  const daysSinceWatered = daysSince(bedPlant.last_watered_at);
  const daysSincePlanted = daysSince(bedPlant.planted_at);

  // Sosedje iz plant_neighbors
  const neighborIds = plantNeighbors
    .filter(
      (pn) =>
        pn.plant_id === bedPlant.plant_id ||
        pn.neighbor_id === bedPlant.plant_id,
    )
    .reduce<{ good: string[]; bad: string[] }>(
      (acc, pn) => {
        const otherId =
          pn.plant_id === bedPlant.plant_id ? pn.neighbor_id : pn.plant_id;
        if (pn.relationship === "good") acc.good.push(otherId);
        else if (pn.relationship === "bad") acc.bad.push(otherId);
        return acc;
      },
      { good: [], bad: [] },
    );

  // Poišči imena sosedov iz allBedPlants (kar je že v vrtu)
  const getNeighborPlants = (ids: string[]) => [
    ...new Map(
      allBedPlants
        .filter((bp) => ids.includes(bp.plant_id) && bp.plant)
        .map((bp) => [bp.plant_id, bp.plant!]),
    ).values(),
  ];

  const goodNeighbors = getNeighborPlants(neighborIds.good);
  const badNeighbors = getNeighborPlants(neighborIds.bad);

  const saveField = async (field: "variety" | "notes", value: string) => {
    onOptimisticUpdate(field, value || null); // takoj
    await supabase
      .from("bed_plants")
      .update({ [field]: value || null })
      .eq("id", bedPlant.id);
    // NI refreshBedPlants — ni potreben
  };

  const waterPlant = async () => {
    await supabase
      .from("bed_plants")
      .update({ last_watered_at: new Date().toISOString() })
      .eq("id", bedPlant.id);
    onUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl z-10 h-[75vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{plant?.img}</span>
            <div>
              <h2 className="font-semibold text-stone-800 text-lg leading-tight">
                {plant?.name}
              </h2>
              {plant && (
                <p className="text-xs text-stone-400 italic">
                  {/* latin_name ni v BedPlant.plant — prikazano če bo dodan */}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600"
          >
            <X size={22} />
          </button>
        </div>

        {/* Scrollable vsebina */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-5">
          {/* Zalivanje */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 border border-blue-100">
            <div className="flex items-center gap-2">
              <Droplets size={18} className="text-blue-500" />
              <div>
                <p className="text-sm font-medium text-blue-800">Zalivanje</p>
                <p className="text-xs text-blue-500">
                  {bedPlant.last_watered_at
                    ? daysSinceWatered === 0
                      ? "Danes"
                      : `Pred ${daysSinceWatered} dnevi`
                    : "Še ni bilo zalivano"}
                </p>
              </div>
            </div>
            <button
              onClick={waterPlant}
              className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
            >
              💧 Zalij
            </button>
          </div>

          {/* Sajenje info */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">
              Podatki sajenja
            </p>

            {/* Sorta */}
            <div className="p-3 rounded-xl border border-stone-200 bg-stone-50">
              <p className="text-xs text-stone-400">Sorta</p>
              <input
                value={variety}
                onChange={(e) => setVariety(e.target.value)}
                onBlur={() => saveField("variety", variety)}
                className="text-sm font-medium text-stone-700 bg-transparent focus:outline-none w-full mt-0.5"
                placeholder="npr. Cherry, Roma..."
              />
            </div>

            {/* Datum sajenja */}
            <div className="p-3 rounded-xl border border-stone-200 bg-stone-50">
              <p className="text-xs text-stone-400">Posajeno</p>
              <p className="text-sm font-medium text-stone-700 mt-0.5">
                {formatDate(bedPlant.planted_at)}
                {daysSincePlanted !== null && (
                  <span className="text-xs text-stone-400 ml-2">
                    ({daysSincePlanted} dni)
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Opombe */}
          <div className="p-3 rounded-xl border border-stone-200 bg-stone-50">
            <p className="text-xs text-stone-400">Opombe</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => saveField("notes", notes)}
              rows={3}
              className="text-sm text-stone-600 bg-transparent focus:outline-none w-full resize-none"
              placeholder="Ni opomb. Tapni za pisanje..."
            />
          </div>

          {/* Sosedje v vrtu */}
          {(goodNeighbors.length > 0 || badNeighbors.length > 0) && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">
                Sosedje v tem vrtu
              </p>
              {goodNeighbors.length > 0 && (
                <div className="p-3 rounded-xl border border-green-200 bg-green-50">
                  <p className="text-xs text-green-600 font-medium mb-1.5">
                    ✅ Dobri sosedje
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {goodNeighbors.map((p) => (
                      <span
                        key={p.id}
                        className="flex items-center gap-1 px-2 py-1 bg-white rounded-lg text-xs text-stone-700 border border-green-200"
                      >
                        {p.img} {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {badNeighbors.length > 0 && (
                <div className="p-3 rounded-xl border border-red-200 bg-red-50">
                  <p className="text-xs text-red-600 font-medium mb-1.5">
                    ❌ Slabi sosedje
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {badNeighbors.map((p) => (
                      <span
                        key={p.id}
                        className="flex items-center gap-1 px-2 py-1 bg-white rounded-lg text-xs text-stone-700 border border-red-200"
                      >
                        {p.img} {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dimenzije */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">
              Prostorske zahteve
            </p>
            <div className="flex gap-2">
              <div className="flex-1 p-3 rounded-xl border border-stone-200 bg-stone-50 text-center">
                <p className="text-lg font-bold text-stone-700">
                  {plant?.cells_spacing}
                </p>
                <p className="text-xs text-stone-400 mt-0.5">Velikost (cel.)</p>
              </div>
              <div className="flex-1 p-3 rounded-xl border border-stone-200 bg-stone-50 text-center">
                <p className="text-lg font-bold text-stone-700">
                  {plant?.around_cells_spacing}
                </p>
                <p className="text-xs text-stone-400 mt-0.5">Odmik (cel.)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
