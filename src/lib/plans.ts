// Naročniški model Free / Pro.
// Omejitve so PODATKI v tabeli plan_limits (NULL = brez omejitve) in jih uveljavlja
// baza (triggerji). Tukaj so samo tipi, oznake in pomočniki za prikaz v UI —
// nikoli ne podvajaj številk omejitev v kodi.

export type Plan = "free" | "pro";

export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export interface PlanLimits {
  plan: Plan;
  max_gardens: number | null; // null = brez omejitve
  max_per_plant: number | null; // inventar + posajeno na vrsto rastline
  features: Record<string, unknown>; // prihodnje funkcije po paketih
}

export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
};

// Napake, ki jih vržejo triggerji ob preseženi omejitvi
export type LimitError = "garden_limit_reached" | "plant_limit_reached";

export function limitErrorOf(
  error: { message?: string } | null | undefined,
): LimitError | null {
  const msg = error?.message ?? "";
  if (msg.includes("garden_limit_reached")) return "garden_limit_reached";
  if (msg.includes("plant_limit_reached")) return "plant_limit_reached";
  return null;
}

// true, ko je omejitev dosežena (null = brez omejitve)
export function isAtLimit(used: number, max: number | null | undefined) {
  return max != null && used >= max;
}

// Funkcija (feature flag) iz plan_limits.features, npr. hasFeature(limits, "export")
export function hasFeature(limits: PlanLimits | null, key: string): boolean {
  return limits?.features?.[key] === true;
}
