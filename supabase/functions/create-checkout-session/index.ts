// Ustvari Stripe Checkout za naročnino Pro in vrne URL plačilne strani.
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_PRO (price_...), opcijsko SITE_URL, ALLOWED_ORIGINS.
import {
  adminClient,
  corsHeaders,
  ensureStripeCustomer,
  json,
  safeOrigin,
  stripeClient,
  userFromRequest,
} from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const user = await userFromRequest(req);
    if (!user) return json(req, { error: "unauthorized" }, 401);

    const priceId = Deno.env.get("STRIPE_PRICE_PRO");
    if (!priceId) return json(req, { error: "billing_not_configured" }, 503);

    const admin = adminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();
    if (profile?.plan === "pro") return json(req, { error: "already_pro" }, 409);

    const stripe = stripeClient();
    const customerId = await ensureStripeCustomer(stripe, admin, user);
    const { origin } = await req.json().catch(() => ({ origin: null }));
    const base = safeOrigin(origin ?? req.headers.get("origin"));

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { supabase_user_id: user.id } },
      allow_promotion_codes: true,
      success_url: `${base}/garden?checkout=success`,
      cancel_url: `${base}/garden?checkout=cancel`,
    });

    return json(req, { url: session.url });
  } catch (err) {
    console.error("create-checkout-session:", err);
    return json(req, { error: "checkout_failed" }, 500);
  }
});
