---
name: supabase-data
description: Conventions for reading and writing Supabase data in Vrtnar — hooks, joins, types, schema changes, RLS. Use when adding a table or column, writing a query or mutation, or using the Supabase MCP tools.
---

# Supabase data in Vrtnar

## Where data lives

Supabase is the source of truth for everything the user creates or configures: gardens, beds, plants, inventory, notes and account-level settings (`user_settings`). `localStorage` (e.g. Zustand `persist` with `partialize`) is only for per-device UI state: the current mode, the last viewport (pan/zoom), or a setting that only makes sense on this device. When adding a new setting, decide which kind it is: per-account goes in `user_settings`, per-device goes in `localStorage`.

## Client side

- Import the single client: `import { supabase } from "../lib/supabaseClient";`
- One hook per concern in `src/hooks/` (`useGarden`, `useBedPlants`, `useUserInventory`, `useUserSettings`, `usePlants`). New data → new hook following the same shape:
  ```ts
  export function useThing(userId: string | null) {
    const [items, setItems] = useState<Thing[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
      if (!userId) return;
      supabase.from("things").select("*").eq("user_id", userId)
        .then(({ data, error }) => {
          if (error) console.error("useThing error:", error);
          setItems(data ?? []);
          setLoading(false);
        });
    }, [userId]);
    return { items, loading /*, mutations */ };
  }
  ```
- Mutations: `insert/update/upsert(...).select(<same select as fetch>).single()` and replace the row in local state, so joined fields stay populated.
- Joins: `select("*, plant:plants(id, name, img, cells_spacing, around_cells_spacing)")`.
- Always check `error`; existing code sometimes only logs it — at minimum `console.error`, don't swallow silently.
- Every user-owned row carries `user_id` (and `garden_id` where relevant) on insert.

## Types

Types are hand-written in `src/types/index.ts` and `src/hooks/useBedPlants.ts`. When the schema changes, update them. Once the Supabase MCP is connected, prefer generating `src/types/database.ts` (`generate_typescript_types`) and typing the client with `createClient<Database>(...)`.

## Schema changes

There is no `supabase/migrations` folder yet. For any schema change:
1. Write the SQL as a migration (via the Supabase MCP `apply_migration`, or a file in `supabase/migrations/<timestamp>_<name>.sql` if the CLI is set up).
2. Enable RLS on every new table and add policies scoped to `auth.uid() = user_id` for user-owned data; catalog tables (`plants`, `plant_neighbors`) are read-only for clients.
3. Update the TS types and the data-model table in `CLAUDE.md`.
4. Ask the user before destructive SQL (DROP, DELETE without WHERE, column type changes) — this is the live project database.

## Secrets

Never read out or commit `.env.local` or `data.txt`. Only the publishable/anon key belongs in the client; never a service-role key.
