// Uporabnik
export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  plan: "free" | "premium";
  stripe_customer_id: string | null;
  subscription_status: "active" | "canceled" | "past_due" | "trialing" | null;
  created_at: string;
  updated_at: string;
}

// Vrtnina (rastlina)
export interface Plant {
  id: string;
  name: string;
  latin_name: string | null;
  img: string | null;
  cells_spacing: number; // koliko celic zasede rastlina
  around_cells_spacing: number; // varnostni pas okoli (collision)
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
