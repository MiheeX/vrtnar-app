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
  plant: BedPlantPlant | null;
}

// Podatki iz kataloga, ki jih potrebujeta platno in list rastline
export interface BedPlantPlant {
  id: string;
  name: string;
  img: string | null;
  icon?: string | null;
  cells_spacing: number;
  around_cells_spacing: number;
  family?: string | null;
  description?: string | null;
  water_need?: number | null;
  sun_need?: number | null;
  watering_interval_days?: number | null;
  days_to_harvest_min?: number | null;
  days_to_harvest_max?: number | null;
  sow_indoors?: number[];
  sow_outdoors?: number[];
  transplant?: number[];
  harvest?: number[];
  row_spacing_cm?: number | null;
  plant_spacing_cm?: number | null;
  sow_depth_cm?: number | null;
  germination_days_min?: number | null;
  germination_days_max?: number | null;
  germination_temp_min_c?: number | null;
  continuous_harvest?: boolean;
}

const PLANT_FIELDS =
  "id, name, img, icon, cells_spacing, around_cells_spacing, family, description, water_need, sun_need, watering_interval_days, days_to_harvest_min, days_to_harvest_max, sow_indoors, sow_outdoors, transplant, harvest, row_spacing_cm, plant_spacing_cm, sow_depth_cm, germination_days_min, germination_days_max, germination_temp_min_c, continuous_harvest";

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
      .select(`*, plant:plants(${PLANT_FIELDS})`)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nalaganje iz Supabase; setState šele po await
    fetch();
  }, [gardenId, fetch]);

  const refresh = () => fetch();

  // Takojšnja lokalna sprememba pred odgovorom baze (hitro sajenje/odstranjevanje)
  const addLocal = (row: BedPlant) => setBedPlants((prev) => [...prev, row]);
  const removeLocal = (id: string) =>
    setBedPlants((prev) => prev.filter((bp) => bp.id !== id));

  return {
    bedPlants: mergedBedPlants,
    loading,
    refresh,
    applyOptimisticUpdate,
    addLocal,
    removeLocal,
  };
}
