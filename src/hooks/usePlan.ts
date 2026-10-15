import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Plan, PlanLimits, SubscriptionStatus } from "../lib/plans";

export interface Subscription {
  plan: Plan;
  status: SubscriptionStatus | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
}

const FREE: Subscription = {
  plan: "free",
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasStripeCustomer: false,
};

// Paket uporabnika (profiles, piše ga Stripe webhook) in njegove omejitve (plan_limits).
// Edini vir za "kaj uporabnik sme" v UI.
export function usePlan(userId: string | null) {
  const [subscription, setSubscription] = useState<Subscription>(FREE);
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPlan = useCallback(async () => {
    if (!userId) return;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "plan, subscription_status, current_period_end, cancel_at_period_end, stripe_customer_id",
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) console.error("usePlan profiles error:", error);

    const plan: Plan = profile?.plan === "pro" ? "pro" : "free";
    setSubscription({
      plan,
      status: (profile?.subscription_status as SubscriptionStatus) ?? null,
      currentPeriodEnd: profile?.current_period_end ?? null,
      cancelAtPeriodEnd: !!profile?.cancel_at_period_end,
      hasStripeCustomer: !!profile?.stripe_customer_id,
    });

    const { data: row, error: limitsError } = await supabase
      .from("plan_limits")
      .select("*")
      .eq("plan", plan)
      .maybeSingle();
    if (limitsError) console.error("usePlan plan_limits error:", limitsError);
    setLimits(
      row
        ? {
            plan,
            max_gardens: row.max_gardens ?? null,
            max_per_plant: row.max_per_plant ?? null,
            features: row.features ?? {},
          }
        : null,
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  return {
    plan: subscription.plan,
    subscription,
    limits,
    isPro: subscription.plan === "pro",
    loading,
    refresh: fetchPlan,
  };
}
