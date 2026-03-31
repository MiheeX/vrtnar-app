import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Plant } from "../types/index";

export function usePlants() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from("plants")
        .select("*")
        .order("name");

      if (error) setError(error.message);
      else setPlants(data ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  return { plants, loading, error };
}
