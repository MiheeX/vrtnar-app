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
    if (error) console.error("useBedPlants error:", error);
    setBedPlants(data ?? []);
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
