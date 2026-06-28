import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPaddleClient, type PaddleEnv } from "@/lib/paddle.server";

/**
 * Crée une session du portail client Paddle pour gérer l'abonnement
 * (changer le moyen de paiement, annuler, voir les factures).
 * Renvoie une URL temporaire à ouvrir dans un nouvel onglet.
 */
export const createCustomerPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { environment: PaddleEnv }) => data)
  .handler(async ({ data, context }) => {
    const { data: sub, error } = await context.supabase
      .from("subscriptions")
      .select("paddle_customer_id, paddle_subscription_id, environment")
      .eq("user_id", context.userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!sub?.paddle_customer_id) {
      throw new Error("Aucun abonnement actif trouvé.");
    }

    const paddle = getPaddleClient(data.environment);
    const portal = await paddle.customerPortalSessions.create(
      sub.paddle_customer_id,
      sub.paddle_subscription_id ? [sub.paddle_subscription_id] : [],
    );
    return { url: portal.urls.general.overview };
  });

/**
 * Annule l'abonnement Paddle de l'utilisateur courant à la fin de la
 * période de facturation en cours. L'accès reste actif jusqu'à
 * `current_period_end`. Le webhook `subscription.canceled` /
 * `subscription.updated` mettra ensuite à jour la table `subscriptions`.
 */
export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { environment: PaddleEnv }) => data)
  .handler(async ({ data, context }) => {
    const { data: sub, error } = await context.supabase
      .from("subscriptions")
      .select("paddle_subscription_id, status, environment")
      .eq("user_id", context.userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!sub?.paddle_subscription_id) {
      throw new Error("Aucun abonnement actif trouvé.");
    }
    if (sub.status === "canceled") {
      throw new Error("Cet abonnement est déjà annulé.");
    }

    const paddle = getPaddleClient(data.environment);
    const updated = await paddle.subscriptions.cancel(sub.paddle_subscription_id, {
      effectiveFrom: "next_billing_period",
    });

    return {
      ok: true,
      status: updated.status,
      scheduledChange: updated.scheduledChange ?? null,
    };
  });
