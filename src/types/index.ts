import type { Plan, SubscriptionStatus } from "../lib/plans";

// Uporabnik — plan in Stripe polja piše samo webhook (stranka jih ne more spreminjati)
export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  plan: Plan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

// Vrtnina (rastlina)
export interface Plant {
  id: string;
  name: string;
  latin_name: string | null;
  img: string | null; // emoji (prikaže se kot Twemoji slika)
  icon: string | null; // ključ lastne ikone v PlantIcon (ima prednost pred img)
  cells_spacing: number; // odtis na platnu (sub-celice) — poenostavitev, ne realni razmik
  around_cells_spacing: number; // dodaten varnostni pas na platnu (sub-celice)
  family: string | null; // botanična družina (kolobarjenje)
  description: string | null;
  water_need: number | null; // 1 malo, 2 zmerno, 3 veliko
  sun_need: number | null; // 1 polsenca, 2 delno sonce, 3 polno sonce
  watering_interval_days: number | null;
  days_to_harvest_min: number | null;
  days_to_harvest_max: number | null;
  // Setveni koledar: meseci 1–12
  sow_indoors: number[];
  sow_outdoors: number[];
  transplant: number[];
  harvest: number[];
  // Realni podatki (viri v supabase/migrations/20261016130000_plant_real_data.sql)
  row_spacing_cm: number | null; // razdalja med vrstami
  plant_spacing_cm: number | null; // razdalja v vrsti
  sow_depth_cm: number | null; // 0 = svetlobna kalivka
  germination_days_min: number | null;
  germination_days_max: number | null;
  germination_temp_min_c: number | null; // najnižja temperatura tal za kalitev
  created_at: string;
}

// Uporabnikov inventory — koliko ima na zalogi
export interface UserInventoryPlant {
  id: string;
  user_id: string;
  plant_id: string;
  quantity: number; // koliko jih ima na zalogi
  plant?: Plant; // join
}

// Razporeditev rastlin po gredicah
export interface GardenPlant {
  id: string;
  user_id: string;
  garden_id: string; // če imaš več vrtov
  bed_id: string;
  plant_id: string;
  cell_x: number; // pozicija znotraj gredice
  cell_y: number;
  quantity: number; // koliko jih je na tej poziciji
  plant?: Plant; // join
}

// Razmerje med vrtninama
export interface PlantNeighbor {
  id: string;
  plant_id: string;
  neighbor_id: string;
  relationship: "good" | "bad";
  sources?: string[]; // npr. ["BUND", "Pušenjak"] — viri v supabase/migrations/20261016140000_plant_neighbors_sourced.sql
}

// Vrt
export interface Garden {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

// Sekcija v layoutu vrta
export interface GardenSection {
  id: string;
  garden_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string | null;
}

// Vrtnina postavljena v sekcijo
export interface SectionPlant {
  id: string;
  garden_section_id: string;
  plant_id: string;
  position_x: number;
  position_y: number;
}
