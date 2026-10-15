// Stripe webhook: edini, ki nastavlja profiles.plan in polja naročnine.
// Deploy z verify_jwt = false (Stripe ne pošlje Supabase JWT); preverja se Stripe podpis.
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (whsec_...).
// Dogodki v Stripe: checkout.session.completed, customer.subscription.created/updated/deleted
import Stripe from "npm:stripe@17.7.0";
import { adminClient, stripeClient } from "../_shared/common.ts";

// Statusi, pri katerih ima uporabnik Pro. past_due = Stripe še poskuša bremeniti kartico.
const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

const cryptoProvider = Stripe.createSubtleCryptoProvider();

async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const isPro = PRO_STATUSES.has(subscription.status);

  // current_period_end je v novejših Stripe API verzijah na postavki naročnine
  const periodEnd =
    (subscription as unknown as { current_period_end?: number }).current_period_end ??
    (subscription.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)
      ?.current_period_end ??
    null;

  const update = {
    plan: isPro ? "pro" : "free",
    subscription_status: subscription.status,
    stripe_subscription_id: subscription.status === "canceled" ? null : subscription.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    stripe_customer_id: customerId,
  };

  const admin = adminClient();
  const { data, error } = await admin
    .from("profiles")
    .update(update)
    .eq("stripe_customer_id", customerId)
    .select("id");
  if (error) throw error;

  // Rezerva: stranka še ni zapisana v profilu → poišči po metadata
  if (!data?.length) {
    const userId = subscription.metadata?.supabase_user_id;
    if (!userId) {
      console.error("stripe-webhook: no profile for customer", customerId);
      return;
    }
    const { error: byIdError } = await admin.from("profiles").update(update).eq("id", userId);
    if (byIdError) throw byIdError;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const signature = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !secret) return new Response("missing_signature", { status: 400 });

  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, secret, undefined, cryptoProvider);
  } catch (err) {
    console.error("stripe-webhook: bad signature", err);
    return new Response("bad_signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        // drugi dogodki nas ne zanimajo
        break;
    }
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("stripe-webhook: handler failed", event.type, err);
    // 500 → Stripe dogodek pošlje ponovno
    return new Response("handler_failed", { status: 500 });
  }
});
