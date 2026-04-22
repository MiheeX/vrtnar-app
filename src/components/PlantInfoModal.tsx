import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { X, Droplets } from "lucide-react";
import type { BedPlant } from "../hooks/useBedPlants";
import type { PlantNeighbor } from "../types";
import { supabase } from "../lib/supabaseClient";

export interface PlantInfoModalHandle {
  prepareOpen: (top: number) => void;
  startDrag: (delta: number) => void;
  commitOpen: () => void;
  cancelOpen: (onDone: () => void) => void;
}

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
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24),
  );
}

export const PlantInfoModal = forwardRef<PlantInfoModalHandle, Props>(
  function PlantInfoModal(
    {
      open,
      onClose,
      bedPlant,
      plantNeighbors,
      allBedPlants,
      onUpdated,
      onOptimisticUpdate,
    },
    ref,
  ) {
    const [variety, setVariety] = useState("");
    const [notes, setNotes] = useState("");
    const [dragY, setDragY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const touchStartY = useRef<number>(0);
    const quickInfoTopRef = useRef<number>(window.innerHeight * 0.75);

    useImperativeHandle(ref, () => ({
      prepareOpen: (top: number) => {
        quickInfoTopRef.current = top;
      },
      startDrag: (delta: number) => {
        setIsDragging(true);
        setDragY(Math.max(0, quickInfoTopRef.current + delta));
      },
      commitOpen: () => {
        setIsDragging(false);
        setDragY(0);
      },
      cancelOpen: (onDone: () => void) => {
        setIsDragging(false);
        setDragY(quickInfoTopRef.current);
        setTimeout(onDone, 300);
      },
    }));

    useEffect(() => {
      if (bedPlant) {
        setVariety(bedPlant.variety ?? "");
        setNotes(bedPlant.notes ?? "");
      }
    }, [bedPlant?.id]);

    useEffect(() => {
      // Ko se modal odpre, začne na poziciji QuickInfo panela
      if (open) setDragY(quickInfoTopRef.current);
    }, [open]);

    if (!open || !bedPlant) return null;

    const plant = bedPlant.plant;
    const daysSinceWatered = daysSince(bedPlant.last_watered_at);
    const daysSincePlanted = daysSince(bedPlant.planted_at);
    const backdropOpacity = Math.max(0, 1 - dragY / quickInfoTopRef.current);

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
      onOptimisticUpdate(field, value || null);
      await supabase
        .from("bed_plants")
        .update({ [field]: value || null })
        .eq("id", bedPlant.id);
    };

    const waterPlant = async () => {
      await supabase
        .from("bed_plants")
        .update({ last_watered_at: new Date().toISOString() })
        .eq("id", bedPlant.id);
      onUpdated();
    };

    const handleTouchStart = (e: React.TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      setIsDragging(true);
    };
    const handleTouchMove = (e: React.TouchEvent) => {
      const delta = e.touches[0].clientY - touchStartY.current;
      setDragY(Math.max(0, delta));
    };
    const handleTouchEnd = (e: React.TouchEvent) => {
      setIsDragging(false);
      const delta = e.changedTouches[0].clientY - touchStartY.current;
      if (delta > 100) onClose();
      else setDragY(0);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center">
        <div
          className="absolute inset-0 bg-black/40"
          style={{ opacity: backdropOpacity }}
          onClick={onClose}
        />
        <div
          className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl z-10 h-[75vh] flex flex-col overflow-hidden"
          style={{
            transform: `translateY(${dragY}px)`,
            transition: isDragging
              ? "none"
              : "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          {/* Drag handle */}
          <div
            className="flex-shrink-0 flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="w-10 h-1 rounded-full transition-colors"
              style={{ backgroundColor: isDragging ? "#a8a29e" : "#d6d3d1" }}
            />
          </div>

          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-stone-200">
            <div className="flex items-center gap-3">
              <span className="text-4xl">{plant?.img}</span>
              <div>
                <h2 className="font-semibold text-stone-800 text-lg leading-tight">
                  {plant?.name}
                </h2>
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

            {/* Sosedje */}
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
                  <p className="text-xs text-stone-400 mt-0.5">
                    Velikost (cel.)
                  </p>
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
  },
);
