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
    const { data, error } = await supabase
      .from("user_plants")
      .upsert({ user_id: userId, plant_id: plantId, quantity })
      .select("*, plant:plants(*)")
      .single();

    console.log("addPlant data:", data);
    console.log("addPlant error:", error);

    if (data) setInventory((prev) => [...prev, data]);
  };

  const removePlant = async (userPlantId: string) => {
    await supabase.from("user_plants").delete().eq("id", userPlantId);
    setInventory((prev) => prev.filter((p) => p.id !== userPlantId));
  };

  return { inventory, loading, addPlant, removePlant };
}
