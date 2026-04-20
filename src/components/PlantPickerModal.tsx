import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import type { UserInventoryPlant, PlantNeighbor } from "../types/index";

interface BedPlant {
  id: string;
  plant_id: string;
  cell_x: number;
  cell_y: number;
  plant?:
    | {
        cells_spacing: number;
        around_cells_spacing: number;
        name: string;
        img: string;
      }
    | {
        cells_spacing: number;
        around_cells_spacing: number;
        name: string;
        img: string;
      }[];
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
  plantNeighbors: PlantNeighbor[];
}

const getSpacing = (bp: BedPlant): number => {
  if (!bp.plant) return 1;
  if (Array.isArray(bp.plant)) return bp.plant[0]?.cells_spacing ?? 1;
  return bp.plant.cells_spacing;
};

const getPlantInfo = (bp: BedPlant): { name: string; img: string } => {
  if (!bp.plant) return { name: "", img: "" };
  if (Array.isArray(bp.plant))
    return { name: bp.plant[0]?.name ?? "", img: bp.plant[0]?.img ?? "" };
  return { name: bp.plant.name, img: bp.plant.img };
};

const rectsOverlap = (
  ax: number,
  ay: number,
  aSize: number,
  bx: number,
  by: number,
  bSize: number,
) => ax < bx + bSize && ax + aSize > bx && ay < by + bSize && ay + aSize > by;

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
  plantNeighbors,
}: Props) {
  const [bedPlants, setBedPlants] = useState<BedPlant[]>([]);
  const [badNeighborPlantIds, setBadNeighborPlantIds] = useState<Set<string>>(
    new Set(),
  );
  const [goodNeighborPlantIds, setGoodNeighborPlantIds] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Filtrirani inventory
  const filteredInventory = inventory.filter((item) =>
    `${item.plant?.name ?? ""} ${item.plant?.latin_name ?? ""}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase()),
  );

  useEffect(() => {
    if (!open) setSearchQuery("");
  }, [open]);

  useEffect(() => {
    if (!open || !bedId) return;
    const load = async () => {
      setLoading(true);
      const { data: bp } = await supabase
        .from("bed_plants")
        .select(
          "id, plant_id, cell_x, cell_y, plant:plants(cells_spacing, around_cells_spacing, name, img)",
        )
        .eq("bed_id", bedId);
      setBedPlants(bp ?? []);
      setLoading(false);
    };
    load();
  }, [open, bedId]);

  /*
  //Commented since code now uses data frem cache for faster reading
  useEffect(() => {
    if (bedPlants.length === 0) {
      setBadNeighborPlantIds(new Set());
      setGoodNeighborPlantIds(new Set());
      return;
    }

    const neighborPlantIds = [
      ...new Set(
        bedPlants
          .filter((bp) =>
            rectsOverlap(
              cellX - 1,
              cellY - 1,
              3,
              bp.cell_x,
              bp.cell_y,
              getSpacing(bp),
            ),
          )
          .map((bp) => bp.plant_id),
      ),
    ];

    if (neighborPlantIds.length === 0) {
      setBadNeighborPlantIds(new Set());
      return;
    }

    const load = async () => {
      //bad neighbors
      const { data: neighborsA } = await supabase
        .from("plant_neighbors")
        .select("plant_id, neighbor_id")
        .in("plant_id", neighborPlantIds)
        .eq("relationship", "bad");

      const { data: neighborsB } = await supabase
        .from("plant_neighbors")
        .select("plant_id, neighbor_id")
        .in("neighbor_id", neighborPlantIds)
        .eq("relationship", "bad");

      const badIds = new Set<string>();
      (neighborsA ?? []).forEach((n) => badIds.add(n.neighbor_id));
      (neighborsB ?? []).forEach((n) => badIds.add(n.plant_id));
      setBadNeighborPlantIds(badIds);

      //good neighbors
      const { data: goodA } = await supabase
        .from("plant_neighbors")
        .select("plant_id, neighbor_id")
        .in("plant_id", neighborPlantIds)
        .eq("relationship", "good");

      const { data: goodB } = await supabase
        .from("plant_neighbors")
        .select("plant_id, neighbor_id")
        .in("neighbor_id", neighborPlantIds)
        .eq("relationship", "good");

      const goodIds = new Set<string>();
      (goodA ?? []).forEach((n) => goodIds.add(n.neighbor_id));
      (goodB ?? []).forEach((n) => goodIds.add(n.plant_id));
      setGoodNeighborPlantIds(goodIds);
    };
    load();
  }, [bedPlants, cellX, cellY]);
  */

  //Use form cache:
  useEffect(() => {
    if (bedPlants.length === 0) {
      setBadNeighborPlantIds(new Set());
      setGoodNeighborPlantIds(new Set());
      return;
    }

    const neighborPlantIds = [
      ...new Set(
        bedPlants
          .filter((bp) =>
            rectsOverlap(
              cellX - 1,
              cellY - 1,
              3,
              bp.cell_x,
              bp.cell_y,
              getSpacing(bp),
            ),
          )
          .map((bp) => bp.plant_id),
      ),
    ];

    if (neighborPlantIds.length === 0) {
      setBadNeighborPlantIds(new Set());
      setGoodNeighborPlantIds(new Set());
      return;
    }

    // Izračun iz že naloženih plantNeighbors — brez Supabase fetcha
    const badIds = new Set<string>();
    const goodIds = new Set<string>();

    plantNeighbors.forEach((pn) => {
      const aIsNeighbor = neighborPlantIds.includes(pn.plant_id);
      const bIsNeighbor = neighborPlantIds.includes(pn.neighbor_id);
      if (!aIsNeighbor && !bIsNeighbor) return;

      if (pn.relationship === "bad") {
        if (aIsNeighbor) badIds.add(pn.neighbor_id);
        if (bIsNeighbor) badIds.add(pn.plant_id);
      }
      if (pn.relationship === "good") {
        if (aIsNeighbor) goodIds.add(pn.neighbor_id);
        if (bIsNeighbor) goodIds.add(pn.plant_id);
      }
    });

    setBadNeighborPlantIds(badIds);
    setGoodNeighborPlantIds(goodIds);
  }, [bedPlants, cellX, cellY, plantNeighbors]);

  if (!open) return null;

  const hasSpaceCollision = (cellsSpacing: number): boolean =>
    bedPlants.some((bp) =>
      rectsOverlap(
        cellX,
        cellY,
        cellsSpacing,
        bp.cell_x,
        bp.cell_y,
        getSpacing(bp),
      ),
    );

  const hasNeighborSpacingCollision = (
    plantId: string,
    aroundSpacing: number,
    cellsSpacing: number,
  ): boolean =>
    bedPlants.some((bp) => {
      if (bp.plant_id === plantId) return false;
      return rectsOverlap(
        cellX - aroundSpacing,
        cellY - aroundSpacing,
        cellsSpacing + aroundSpacing * 2,
        bp.cell_x,
        bp.cell_y,
        getSpacing(bp),
      );
    });

  const getBadNeighborsForPlant = (
    plantId: string,
    cellsSpacing: number,
  ): { name: string; img: string }[] => {
    if (!badNeighborPlantIds.has(plantId)) return [];
    const seen = new Set<string>();
    return bedPlants
      .filter(
        (bp) =>
          bp.plant_id !== plantId &&
          rectsOverlap(
            cellX - 1,
            cellY - 1,
            cellsSpacing + 2,
            bp.cell_x,
            bp.cell_y,
            getSpacing(bp),
          ),
      )
      .filter((bp) => {
        if (seen.has(bp.plant_id)) return false;
        seen.add(bp.plant_id);
        return true;
      })
      .map((bp) => getPlantInfo(bp))
      .filter((p) => p.name !== "");
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
    if (error) {
      console.error("Napaka pri sajenju:", error);
      return;
    }
    onConsumeFromInventory(plantId);
    onPlanted();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center h-full">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-xl z-10 max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-stone-200">
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

        {/* Search — sticky, izven scroll območja */}
        <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-stone-100">
          <div className="relative">
            <input
              type="text"
              placeholder="Išči rastline..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-stone-200 rounded-lg bg-stone-50 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
            />
            <svg
              className="absolute left-2.5 top-2.5 w-4 h-4 text-stone-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        {/* Scrollable lista */}
        <div className="overflow-y-auto flex-1 min-h-0 px-4 py-3 flex flex-col gap-3">
          {loading && (
            <p className="text-stone-400 text-sm text-center py-8">
              Nalagam...
            </p>
          )}
          {!loading && filteredInventory.length === 0 && searchQuery && (
            <p className="text-sm text-stone-400 text-center py-4">
              Ni zadetkov za "{searchQuery}"
            </p>
          )}
          {!loading && inventory.length === 0 && !searchQuery && (
            <p className="text-stone-400 text-sm text-center py-8">
              Nimaš rastlin v inventarju.
            </p>
          )}
          {!loading &&
            (() => {
              const sorted = [...filteredInventory]
                .filter((item) => item.plant && item.quantity > 0)
                .sort((a, b) => {
                  const score = (item: typeof a) => {
                    if (goodNeighborPlantIds.has(item.plant!.id)) return 0;
                    if (badNeighborPlantIds.has(item.plant!.id)) return 2;
                    return 1;
                  };
                  return score(a) - score(b);
                });

              const good = sorted.filter((i) =>
                goodNeighborPlantIds.has(i.plant!.id),
              );
              const neutral = sorted.filter(
                (i) =>
                  !goodNeighborPlantIds.has(i.plant!.id) &&
                  !badNeighborPlantIds.has(i.plant!.id),
              );
              const bad = sorted.filter((i) =>
                badNeighborPlantIds.has(i.plant!.id),
              );

              const renderItem = (item: (typeof filteredInventory)[0]) => {
                const plant = item.plant!;
                const spaceCollision = hasSpaceCollision(plant.cells_spacing);
                const neighborCollision = hasNeighborSpacingCollision(
                  plant.id,
                  plant.around_cells_spacing,
                  plant.cells_spacing,
                );
                const badNeighbors = getBadNeighborsForPlant(
                  plant.id,
                  plant.cells_spacing,
                );
                const isBadNeighbor = badNeighbors.length > 0;
                const blocked = spaceCollision;
                const hasWarning =
                  !blocked && (neighborCollision || isBadNeighbor);

                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      blocked
                        ? "border-red-200 bg-red-50"
                        : hasWarning
                          ? "border-yellow-200 bg-yellow-50"
                          : goodNeighborPlantIds.has(plant.id)
                            ? "border-green-200 bg-green-50"
                            : "border-stone-200 bg-stone-50"
                    }`}
                  >
                    <span className="text-3xl">{plant.img}</span>
                    <div className="flex-1">
                      <p
                        className={`font-medium ${
                          blocked
                            ? "text-red-700"
                            : hasWarning
                              ? "text-yellow-700"
                              : goodNeighborPlantIds.has(plant.id)
                                ? "text-green-700"
                                : "text-stone-800"
                        }`}
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
                      {spaceCollision && (
                        <p className="text-xs text-red-500 mt-0.5">
                          🚫 Ni prostora — celica je zasedena
                        </p>
                      )}
                      {!spaceCollision && neighborCollision && (
                        <p className="text-xs text-yellow-600 mt-0.5">
                          ⚠️ Preblizu drugi rastlini
                        </p>
                      )}
                      {isBadNeighbor && (
                        <p className="text-xs text-yellow-600 mt-0.5">
                          ⚠️ Slab sosed z:{" "}
                          {badNeighbors
                            .map((n) => `${n.img} ${n.name}`)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => !blocked && plantInCell(plant.id)}
                      disabled={blocked}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        blocked
                          ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                          : "bg-green-500 text-white hover:bg-green-600"
                      }`}
                    >
                      <Check size={14} /> Posadi
                    </button>
                  </div>
                );
              };

              return (
                <>
                  {good.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-wide px-1">
                        ✅ Dobri sosedje
                      </p>
                      {good.map(renderItem)}
                    </>
                  )}
                  {neutral.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide px-1 mt-1">
                        ⬜ Nevtralni
                      </p>
                      {neutral.map(renderItem)}
                    </>
                  )}
                  {bad.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wide px-1 mt-1">
                        ⚠️ Slabi sosedje
                      </p>
                      {bad.map(renderItem)}
                    </>
                  )}
                </>
              );
            })()}
        </div>
      </div>
    </div>
  );
}
