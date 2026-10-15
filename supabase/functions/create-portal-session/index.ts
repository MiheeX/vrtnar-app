// Odpre Stripe Customer Portal (preklic, plačilna kartica, računi) in vrne njegov URL.
// Secrets: STRIPE_SECRET_KEY. V Stripe nadzorni plošči mora biti Customer Portal vklopljen.
import {
  adminClient,
  corsHeaders,
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

    const { data: profile } = await adminClient()
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();
    if (!profile?.stripe_customer_id) return json(req, { error: "no_subscription" }, 404);

    const { origin } = await req.json().catch(() => ({ origin: null }));
    const base = safeOrigin(origin ?? req.headers.get("origin"));

    const session = await stripeClient().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${base}/garden`,
    });
    return json(req, { url: session.url });
  } catch (err) {
    console.error("create-portal-session:", err);
    return json(req, { error: "portal_failed" }, 500);
  }
});
