import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface UserSettings {
  show_sub_grid: boolean;
  allow_bad_neighbor_drop: boolean;
}

const DEFAULTS: UserSettings = {
  show_sub_grid: false,
  allow_bad_neighbor_drop: false,
};

export function useUserSettings(userId: string | null) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("user_settings")
      .select("show_sub_grid, allow_bad_neighbor_drop")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) console.error("useUserSettings error:", error);
    if (data) setSettings(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nalaganje iz Supabase; setState šele po await
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = async <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    // Optimistic update
    setSettings((prev) => ({ ...prev, [key]: value }));

    await supabase
      .from("user_settings")
      .upsert({ user_id: userId, [key]: value }, { onConflict: "user_id" });
  };

  return { settings, loading, updateSetting, refresh: fetchSettings };
}
