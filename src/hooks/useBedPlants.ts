import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

export interface BedPlant {
  id: string;
  bed_id: string;
  plant_id: string;
  cell_x: number;
  cell_y: number;
  quantity: number;
  variety: string | null;
  planted_at: string | null;
  last_watered_at: string | null;
  notes: string | null;
  plant: {
    id: string;
    name: string;
    img: string | null;
    cells_spacing: number;
    around_cells_spacing: number;
  } | null;
}

export function useBedPlants(gardenId: string) {
  const [bedPlants, setBedPlants] = useState<BedPlant[]>([]);
  const [loading, setLoading] = useState(true);
  const [optimisticOverrides, setOptimisticOverrides] = useState<
    Record<string, Partial<BedPlant>>
  >({});

  const applyOptimisticUpdate = (id: string, fields: Partial<BedPlant>) => {
    setOptimisticOverrides((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...fields },
    }));
  };

  // Merge pri vrnitvi
  const mergedBedPlants = bedPlants.map((bp) => ({
    ...bp,
    ...optimisticOverrides[bp.id],
  }));

  const fetch = useCallback(async () => {
    if (!gardenId) return;
    const { data, error } = await supabase
      .from("bed_plants")
      .select(
        "*, plant:plants(id, name, img, cells_spacing, around_cells_spacing)",
      )
      .eq("garden_id", gardenId);
    if (error) {
      console.error("useBedPlants error:", error);
      return;
    }
    const rows: BedPlant[] = data ?? [];
    setBedPlants(rows);
    // Optimistične vrednosti, ki jih baza že ima, niso več potrebne —
    // sicer bi zakrile spremembe z druge naprave
    setOptimisticOverrides((prev) => {
      const next: Record<string, Partial<BedPlant>> = {};
      for (const [id, fields] of Object.entries(prev)) {
        const row = rows.find((r) => r.id === id);
        if (!row) continue;
        const pending = Object.fromEntries(
          Object.entries(fields).filter(
            ([key, value]) => row[key as keyof BedPlant] !== value,
          ),
        );
        if (Object.keys(pending).length > 0) next[id] = pending;
      }
      return next;
    });
    setLoading(false);
  }, [gardenId]);

  useEffect(() => {
    fetch();
  }, [gardenId, fetch]);

  const refresh = () => fetch();

  return {
    bedPlants: mergedBedPlants,
    loading,
    refresh,
    applyOptimisticUpdate,
  };
}
