// Skupno za Stripe Edge Functions: CORS, dovoljeni povratni naslovi, Stripe in Supabase klienti.
import Stripe from "npm:stripe@17.7.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

// Glavni naslov aplikacije (Supabase secret SITE_URL), privzeto produkcija na Vercelu
export const SITE_URL = Deno.env.get("SITE_URL") ?? "https://vrtnar-app.vercel.app";

// Stripe se po plačilu vrne samo na naše naslove (ne na poljuben origin iz zahteve)
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/vrtnar-app\.vercel\.app$/,
  /^https:\/\/vrtnar-app(-[a-z0-9-]+)?-mihee-x\.vercel\.app$/, // Vercel preview
  /^http:\/\/localhost:\d+$/,
];

export function safeOrigin(origin: string | null | undefined): string {
  const extra = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin && (extra.includes(origin) || ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin)))) {
    return origin;
  }
  return SITE_URL;
}

export function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": safeOrigin(req.headers.get("origin")),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export function stripeClient(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

// Admin klient (service role) — samo na strežniku, obide RLS
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// Prijavljeni uporabnik iz Authorization glave (JWT iz aplikacije)
export async function userFromRequest(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user;
}

// Stripe stranka za uporabnika: obstoječa iz profiles ali nova (shrani se v profiles)
export async function ensureStripeCustomer(
  stripe: Stripe,
  admin: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<string> {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { supabase_user_id: user.id },
  });
  const { error: updateError } = await admin
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", user.id);
  if (updateError) throw updateError;
  return customer.id;
}
