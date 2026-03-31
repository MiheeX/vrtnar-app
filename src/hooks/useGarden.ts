import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useGarden(userId: string | null) {
  const [gardenId, setGardenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const fetch = async () => {
      // Vzemi prvi vrt tega userja
      const { data } = await supabase
        .from("gardens")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .single();

      if (data) {
        setGardenId(data.id);
      } else {
        // Ustvari vrt če še ne obstaja
        const { data: newGarden } = await supabase
          .from("gardens")
          .insert({ user_id: userId, name: "Moj vrt" })
          .select("id")
          .single();
        if (newGarden) setGardenId(newGarden.id);
      }
      setLoading(false);
    };
    fetch();
  }, [userId]);

  return { gardenId, loading };
}
