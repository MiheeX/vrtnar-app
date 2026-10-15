import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

type SyncTable =
  | "gardens"
  | "beds"
  | "bed_plants"
  | "user_plants"
  | "user_settings"
  | "profiles";

export type SyncHandlers = Record<SyncTable, () => void>;

const TABLES: SyncTable[] = [
  "gardens",
  "beds",
  "bed_plants",
  "user_plants",
  "user_settings",
  "profiles",
];

// profiles ima uporabnika v stolpcu id, ostale tabele v user_id
const ownerColumn = (table: SyncTable) => (table === "profiles" ? "id" : "user_id");

// Več dogodkov v kratkem času (npr. sajenje več rastlin) = en refetch
const DEBOUNCE_MS = 300;

// Posluša Supabase Realtime za vrstice tega uporabnika in ob spremembi
// (z druge naprave ali zavihka) ponovno naloži podatke te tabele.
// Ob vrnitvi v aplikacijo (telefon iz ozadja) in ob ponovni povezavi naloži vse,
// ker se lahko dogodki med prekinitvijo izgubijo.
export function useRealtimeSync(userId: string | null, handlers: SyncHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!userId) return;

    const timers = new Map<SyncTable, ReturnType<typeof setTimeout>>();
    const schedule = (table: SyncTable) => {
      const t = timers.get(table);
      if (t) clearTimeout(t);
      timers.set(
        table,
        setTimeout(() => {
          timers.delete(table);
          handlersRef.current[table]();
        }, DEBOUNCE_MS),
      );
    };
    const refreshAll = () => TABLES.forEach(schedule);

    const channel = supabase.channel(`user-sync:${userId}`);
    for (const table of TABLES) {
      // INSERT/UPDATE filtriramo po uporabniku; DELETE filtrov ne podpira
      // (stara vrstica ima samo id), zato ga poslušamo posebej.
      const filter = `${ownerColumn(table)}=eq.${userId}`;
      channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table, filter },
          () => schedule(table),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table, filter },
          () => schedule(table),
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table }, () =>
          schedule(table),
        );
    }

    let subscribedOnce = false;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Po ponovni povezavi smo morda zamudili dogodke
        if (subscribedOnce) refreshAll();
        subscribedOnce = true;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("Realtime povezava:", status);
      }
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      timers.forEach(clearTimeout);
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
