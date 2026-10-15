import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export interface GardenSummary {
  id: string;
  name: string;
  created_at: string;
  bedCount: number;
}

type Plan = "free" | "premium";

// Zadnji odprt vrt je stvar naprave (UI stanje), zato localStorage
const lastGardenKey = (userId: string) => `vrtnar:lastGardenId:${userId}`;

function readLastGarden(userId: string): string | null {
  try {
    return localStorage.getItem(lastGardenKey(userId));
  } catch {
    return null;
  }
}

function writeLastGarden(userId: string, gardenId: string) {
  try {
    localStorage.setItem(lastGardenKey(userId), gardenId);
  } catch {
    // brez localStorage (zasebno okno) — ni pomembno
  }
}

// Napaka iz triggerja gardens_enforce_limit
export function isGardenLimitError(error: { message?: string } | null) {
  return !!error?.message?.includes("garden_limit_reached");
}

export function useGardens(userId: string | null) {
  const [gardens, setGardens] = useState<GardenSummary[]>([]);
  const [currentGardenId, setCurrentGardenId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>("free");
  const [maxGardens, setMaxGardens] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const creatingDefault = useRef(false);

  const fetchGardens = useCallback(async () => {
    if (!userId) return [];
    const { data, error } = await supabase
      .from("gardens")
      .select("id, name, created_at, beds(count)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("useGardens error:", error);
      return null;
    }
    const list: GardenSummary[] = (data ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      created_at: g.created_at,
      bedCount:
        (g.beds as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    }));
    setGardens(list);
    return list;
  }, [userId]);

  // Paket in omejitev (plan_limits) — za prikaz v meniju; baza jo tudi uveljavi
  const fetchLimits = useCallback(async () => {
    if (!userId) return;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) console.error("profiles error:", profileError);
    const userPlan: Plan = profile?.plan === "premium" ? "premium" : "free";
    setPlan(userPlan);

    const { data: limits, error: limitsError } = await supabase
      .from("plan_limits")
      .select("max_gardens")
      .eq("plan", userPlan)
      .maybeSingle();
    if (limitsError) console.error("plan_limits error:", limitsError);
    setMaxGardens(limits?.max_gardens ?? null);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [list] = await Promise.all([fetchGardens(), fetchLimits()]);
      if (cancelled || !list) return;

      if (list.length === 0) {
        // Prvi vrt ustvarimo samo enkrat (StrictMode zažene effect dvakrat)
        if (creatingDefault.current) return;
        creatingDefault.current = true;
        const { data, error } = await supabase
          .from("gardens")
          .insert({ user_id: userId, name: "Moj vrt" })
          .select("id, name, created_at")
          .single();
        if (error || !data) {
          console.error("Napaka pri ustvarjanju vrta:", error);
        } else if (!cancelled) {
          setGardens([{ ...data, bedCount: 0 }]);
          setCurrentGardenId(data.id);
        }
      } else {
        const last = readLastGarden(userId);
        const pick = list.find((g) => g.id === last) ?? list[0];
        setCurrentGardenId(pick.id);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, fetchGardens, fetchLimits]);

  const selectGarden = (id: string) => {
    setCurrentGardenId(id);
    if (userId) writeLastGarden(userId, id);
  };

  const createGarden = async (
    name: string,
  ): Promise<{ ok: true } | { ok: false; reason: "limit" | "error" }> => {
    if (!userId) return { ok: false, reason: "error" };
    const { data, error } = await supabase
      .from("gardens")
      .insert({ user_id: userId, name: name.trim() || "Nov vrt" })
      .select("id, name, created_at")
      .single();
    if (error || !data) {
      if (isGardenLimitError(error)) return { ok: false, reason: "limit" };
      console.error("Napaka pri ustvarjanju vrta:", error);
      return { ok: false, reason: "error" };
    }
    setGardens((prev) => [...prev, { ...data, bedCount: 0 }]);
    selectGarden(data.id);
    return { ok: true };
  };

  const renameGarden = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const prev = gardens;
    setGardens((list) =>
      list.map((g) => (g.id === id ? { ...g, name: trimmed } : g)),
    );
    const { error } = await supabase
      .from("gardens")
      .update({ name: trimmed })
      .eq("id", id);
    if (error) {
      console.error("Napaka pri preimenovanju vrta:", error);
      setGardens(prev);
    }
  };

  // Briše vrt skupaj z gredicami in rastlinami (ON DELETE CASCADE v bazi).
  // Zadnjega vrta ne moreš izbrisati.
  const deleteGarden = async (id: string): Promise<boolean> => {
    if (gardens.length <= 1) return false;
    const { error } = await supabase.from("gardens").delete().eq("id", id);
    if (error) {
      console.error("Napaka pri brisanju vrta:", error);
      return false;
    }
    const remaining = gardens.filter((g) => g.id !== id);
    setGardens(remaining);
    if (currentGardenId === id && remaining[0]) selectGarden(remaining[0].id);
    return true;
  };

  const currentGarden = gardens.find((g) => g.id === currentGardenId) ?? null;
  const atLimit = maxGardens !== null && gardens.length >= maxGardens;

  return {
    gardens,
    currentGarden,
    currentGardenId,
    plan,
    maxGardens,
    atLimit,
    loading,
    selectGarden,
    createGarden,
    renameGarden,
    deleteGarden,
    refresh: fetchGardens,
  };
}
