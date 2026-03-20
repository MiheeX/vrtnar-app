import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { UserInventoryPlant } from "../types/index";

export function useUserInventory(userId: string) {
  const [inventory, setInventory] = useState<UserInventoryPlant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("user_plants")
        .select("*, plant:plants(*)")
        .eq("user_id", userId)
        .order("created_at");
      setInventory(data ?? []);
      setLoading(false);
    };
    fetch();
  }, [userId]);

  const addPlant = async (plantId: string, quantity: number = 1) => {
    // Preveri ali že obstaja v inventarju
    const existing = inventory.find((i) => i.plant_id === plantId);

    if (existing) {
      // Prištej količino
      const newQuantity = existing.quantity + quantity;
      const { data, error } = await supabase
        .from("user_plants")
        .update({ quantity: newQuantity })
        .eq("id", existing.id)
        .select("*, plant:plants(*)")
        .single();

      console.log("updatePlant error:", error);
      if (data)
        setInventory((prev) =>
          prev.map((i) => (i.id === existing.id ? data : i)),
        );
    } else {
      // Dodaj novo
      const { data, error } = await supabase
        .from("user_plants")
        .insert({ user_id: userId, plant_id: plantId, quantity })
        .select("*, plant:plants(*)")
        .single();

      console.log("insertPlant error:", error);
      if (data) setInventory((prev) => [...prev, data]);
    }
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

  return { inventory, loading, addPlant, removePlant, decrementPlant };
}
