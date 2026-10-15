import { supabase } from "./supabaseClient";

// Stripe plačila tečejo prek Supabase Edge Functions (skrivni ključ je samo na strežniku).
// Funkcija vrne URL Stripe strani, na katero preusmerimo.

async function redirectTo(fn: "create-checkout-session" | "create-portal-session") {
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(fn, {
    body: { origin: window.location.origin },
  });
  if (error || !data?.url) {
    console.error(`${fn} error:`, error ?? data?.error);
    throw new Error(data?.error ?? "billing_unavailable");
  }
  window.location.assign(data.url);
}

// Nadgradnja na Pro — Stripe Checkout
export const startProCheckout = () => redirectTo("create-checkout-session");

// Upravljanje naročnine (preklic, kartica, računi) — Stripe Customer Portal
export const openBillingPortal = () => redirectTo("create-portal-session");
