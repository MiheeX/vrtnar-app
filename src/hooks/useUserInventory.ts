import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { limitErrorOf } from "../lib/plans";
import type { UserInventoryPlant } from "../types/index";

export type AddPlantResult = { ok: true } | { ok: false; reason: "limit" | "error" };

export function useUserInventory(userId: string) {
  const [inventory, setInventory] = useState<UserInventoryPlant[]>([]);
  // Koliko je posajenih na vrsto rastline v vseh vrtovih (za omejitev paketa)
  const [plantedCounts, setPlantedCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchInventory = useCallback(async () => {
    if (!userId) return;
    const [inv, planted] = await Promise.all([
      supabase
        .from("user_plants")
        .select("*, plant:plants(*)")
        .eq("user_id", userId)
        .order("created_at"),
      supabase.from("bed_plants").select("plant_id, quantity").eq("user_id", userId),
    ]);
    if (inv.error) {
      console.error("useUserInventory error:", inv.error);
      return;
    }
    if (planted.error) console.error("useUserInventory planted error:", planted.error);
    setInventory(inv.data ?? []);
    const counts: Record<string, number> = {};
    for (const row of planted.data ?? [])
      counts[row.plant_id] = (counts[row.plant_id] ?? 0) + (row.quantity ?? 1);
    setPlantedCounts(counts);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Inventar + posajeno — to šteje omejitev max_per_plant
  const totalFor = (plantId: string) =>
    (inventory.find((i) => i.plant_id === plantId)?.quantity ?? 0) +
    (plantedCounts[plantId] ?? 0);

  const addPlant = async (
    plantId: string,
    quantity: number = 1,
  ): Promise<AddPlantResult> => {
    // Preveri ali že obstaja v inventarju
    const existing = inventory.find((i) => i.plant_id === plantId);

    const { data, error } = existing
      ? await supabase
          .from("user_plants")
          .update({ quantity: existing.quantity + quantity })
          .eq("id", existing.id)
          .select("*, plant:plants(*)")
          .single()
      : await supabase
          .from("user_plants")
          .insert({ user_id: userId, plant_id: plantId, quantity })
          .select("*, plant:plants(*)")
          .single();

    if (error || !data) {
      if (limitErrorOf(error) === "plant_limit_reached") {
        // Lokalni seštevek je bil zastarel (npr. sajenje na drugi napravi) — uskladi
        fetchInventory();
        return { ok: false, reason: "limit" };
      }
      console.error("addPlant error:", error);
      return { ok: false, reason: "error" };
    }
    setInventory((prev) =>
      existing ? prev.map((i) => (i.id === existing.id ? data : i)) : [...prev, data],
    );
    return { ok: true };
  };

  const removePlant = async (userPlantId: string) => {
    await supabase.from("user_plants").delete().eq("id", userPlantId);
    setInventory((prev) => prev.filter((p) => p.id !== userPlantId));
  };

  const decrementPlant = async (
    userPlantId: string,
    currentQuantity: number,
  ) => {
    if (currentQuantity <= 1) {
      // Če je količina 1, pobriši zapis
      await supabase.from("user_plants").delete().eq("id", userPlantId);
      setInventory((prev) => prev.filter((p) => p.id !== userPlantId));
    } else {
      // Odštej 1
      const newQuantity = currentQuantity - 1;
      const { data } = await supabase
        .from("user_plants")
        .update({ quantity: newQuantity })
        .eq("id", userPlantId)
        .select("*, plant:plants(*)")
        .single();
      if (data)
        setInventory((prev) =>
          prev.map((i) => (i.id === userPlantId ? data : i)),
        );
    }
  };

  const consumePlant = async (plantId: string, amount: number = 1) => {
    const existing = inventory.find((i) => i.plant_id === plantId);
    if (!existing) return;

    const newQuantity = existing.quantity - amount;
    if (newQuantity <= 0) {
      // Pobriši iz inventarja
      await supabase.from("user_plants").delete().eq("id", existing.id);
      setInventory((prev) => prev.filter((p) => p.id !== existing.id));
    } else {
      const { data, error } = await supabase
        .from("user_plants")
        .update({ quantity: newQuantity })
        .eq("id", existing.id)
        .select("*, plant:plants(*)")
        .single();
      console.log("consumePlant error:", error);
      if (data) {
        setInventory((prev) =>
          prev.map((p) => (p.id === existing.id ? data : p)),
        );
      }
    }
  };

  return {
    inventory,
    loading,
    addPlant,
    removePlant,
    decrementPlant,
    consumePlant,
    totalFor,
    refresh: fetchInventory,
  };
}
