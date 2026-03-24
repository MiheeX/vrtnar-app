import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import type { UserInventoryPlant } from "../types/index";

interface BedPlant {
  id: string;
  plant_id: string;
  cell_x: number;
  cell_y: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  inventory: UserInventoryPlant[];
  bedId: string;
  cellX: number;
  cellY: number;
  onPlanted: () => void;
  userId: string;
  gardenId: string;
  onConsumeFromInventory: (plantId: string) => void;
}

export function PlantPickerModal({
  open,
  onClose,
  inventory,
  bedId,
  cellX,
  cellY,
  onPlanted,
  onConsumeFromInventory,
  userId,
  gardenId,
}: Props) {
  const [bedPlants, setBedPlants] = useState<BedPlant[]>([]);
  const [badNeighborIds, setBadNeighborIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !bedId) return;
    const load = async () => {
      setLoading(true);

      // 1. Naloži vse rastline v tej gredici
      const { data: bp } = await supabase
        .from("bed_plants")
        .select("id, plant_id, cell_x, cell_y")
        .eq("bed_id", bedId);
      setBedPlants(bp ?? []);

      // 2. Naloži slabe sosede za vse rastline ki so v gredici
      const plantIdsInBed = [...new Set((bp ?? []).map((p) => p.plant_id))];
      if (plantIdsInBed.length > 0) {
        const { data: neighbors } = await supabase
          .from("plant_neighbors")
          .select("plant_id, neighbor_id, relationship")
          .in("plant_id", plantIdsInBed)
          .eq("relationship", "bad");

        const badIds = new Set<string>();
        (neighbors ?? []).forEach((n) => badIds.add(n.neighbor_id));
        setBadNeighborIds(badIds);
      } else {
        setBadNeighborIds(new Set());
      }

      setLoading(false);
    };
    load();
  }, [open, bedId]);

  if (!open) return null;

  // Preveri kolizijo na izbranih koordinatah za dano rastlino
  const hasSpaceCollision = (cellsSpacing: number): boolean => {
    return bedPlants.some((bp) => {
      const dist = Math.max(
        Math.abs(bp.cell_x - cellX),
        Math.abs(bp.cell_y - cellY),
      );
      return dist < cellsSpacing;
    });
  };

  // Preveri around_cells_spacing sosedov
  const hasNeighborCollision = (
    plantId: string,
    aroundSpacing: number,
  ): boolean => {
    return bedPlants.some((bp) => {
      if (bp.plant_id === plantId) return false;
      const dist = Math.max(
        Math.abs(bp.cell_x - cellX),
        Math.abs(bp.cell_y - cellY),
      );
      return dist < aroundSpacing;
    });
  };

  const plantInCell = async (plantId: string) => {
    const { error } = await supabase.from("bed_plants").insert({
      user_id: userId,
      garden_id: gardenId,
      bed_id: bedId,
      plant_id: plantId,
      cell_x: cellX,
      cell_y: cellY,
      quantity: 1,
    });

    console.log("insert error:", error);

    if (error) {
      console.error("Napaka pri sajenju:", error);
      return;
    }

    console.log("calling consumePlant...");

    onConsumeFromInventory(plantId);
    onPlanted();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl z-10 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <div>
            <h2 className="font-semibold text-stone-800 text-lg">
              🌱 Posadi rastlino
            </h2>
            <p className="text-xs text-stone-400">
              Celica ({cellX}, {cellY})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600"
          >
            <X size={22} />
          </button>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-3">
          {loading && (
            <p className="text-stone-400 text-sm text-center py-8">
              Nalagam...
            </p>
          )}
          {!loading && inventory.length === 0 && (
            <p className="text-stone-400 text-sm text-center py-8">
              Nimaš rastlin v inventarju.
            </p>
          )}
          {!loading &&
            inventory.map((item) => {
              const plant = item.plant;
              if (!plant || item.quantity <= 0) return null;
              if (!plant) return null;

              const spaceCollision = hasSpaceCollision(plant.cells_spacing);
              const neighborCollision = hasNeighborCollision(
                plant.id,
                plant.around_cells_spacing,
              );
              const isBadNeighbor = badNeighborIds.has(plant.id);
              const hasIssue =
                spaceCollision || neighborCollision || isBadNeighbor;

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    hasIssue
                      ? "border-red-200 bg-red-50"
                      : "border-stone-200 bg-stone-50"
                  }`}
                >
                  <span className="text-3xl">{plant.img}</span>

                  <div className="flex-1">
                    <p
                      className={`font-medium ${hasIssue ? "text-red-700" : "text-stone-800"}`}
                    >
                      {plant.name}
                    </p>
                    {plant.latin_name && (
                      <p className="text-xs text-stone-400 italic">
                        {plant.latin_name}
                      </p>
                    )}
                    <p className="text-xs text-stone-500 mt-0.5">
                      Količina:{" "}
                      <span className="font-semibold">{item.quantity}</span>
                    </p>
                    {/* Razlog zakaj ni primerna */}
                    {spaceCollision && (
                      <p className="text-xs text-red-500 mt-0.5">
                        ⚠️ Premalo prostora
                      </p>
                    )}
                    {neighborCollision && !spaceCollision && (
                      <p className="text-xs text-red-500 mt-0.5">
                        ⚠️ Preblizu drugi rastlini
                      </p>
                    )}
                    {isBadNeighbor && (
                      <p className="text-xs text-red-500 mt-0.5">
                        ⚠️ Slab sosed z obstoječo rastlino
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => !spaceCollision && plantInCell(plant.id)}
                    disabled={spaceCollision}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      spaceCollision
                        ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                        : "bg-green-500 text-white"
                    }`}
                  >
                    <Check size={14} /> Posadi
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
