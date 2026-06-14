import { createFileRoute } from "@tanstack/react-router";

const PLAN_BY_PRODUCT: Record<string, string> = {
  pro_plan: "pro",
  business_plan: "business",
};

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const envParam = url.searchParams.get("env");
        const env = envParam === "live" ? "live" : "sandbox";

        const { verifyWebhookEvent } = await import("@/lib/payments-webhook.server");
        let event;
        try {
          event = await verifyWebhookEvent(request, env);
        } catch (e) {
          console.error("[paddle webhook] signature verification failed", e);
          return new Response("Invalid signature", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          const type = event.eventType as string;
          if (
            type === "subscription.created" ||
            type === "subscription.updated" ||
            type === "subscription.activated" ||
            type === "subscription.canceled" ||
            type === "subscription.paused" ||
            type === "subscription.resumed"
          ) {
            const sub: any = event.data;

            // Récupérer external_id du produit et du prix via importMeta
            const item = sub.items?.[0];
            const productExternalId =
              item?.product?.importMeta?.externalId ??
              item?.product?.import_meta?.external_id ??
              null;
            const priceExternalId =
              item?.price?.importMeta?.externalId ??
              item?.price?.import_meta?.external_id ??
              null;

            if (!productExternalId || !priceExternalId) {
              console.warn("[paddle webhook] missing importMeta.externalId, skipping", {
                subscription_id: sub.id,
              });
              return new Response("ok");
            }

            // user_id depuis customData passé au checkout
            const customData = sub.customData ?? sub.custom_data ?? {};
            const userId = customData.userId ?? customData.user_id;
            if (!userId) {
              console.warn("[paddle webhook] no userId in customData", { sub_id: sub.id });
              return new Response("ok");
            }

            const status = sub.status as string;
            const periodEnd =
              sub.currentBillingPeriod?.endsAt ??
              sub.current_billing_period?.ends_at ??
              null;
            const periodStart =
              sub.currentBillingPeriod?.startsAt ??
              sub.current_billing_period?.starts_at ??
              null;
            const cancelAtPeriodEnd =
              sub.scheduledChange?.action === "cancel" ||
              sub.scheduled_change?.action === "cancel";

            const { error: upsertErr } = await supabaseAdmin
              .from("subscriptions")
              .upsert(
                {
                  user_id: userId,
                  paddle_subscription_id: sub.id,
                  paddle_customer_id: sub.customerId ?? sub.customer_id,
                  product_id: productExternalId,
                  price_id: priceExternalId,
                  status,
                  current_period_start: periodStart,
                  current_period_end: periodEnd,
                  cancel_at_period_end: cancelAtPeriodEnd,
                  environment: env,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "paddle_subscription_id" },
              );
            if (upsertErr) {
              console.error("[paddle webhook] upsert error", upsertErr);
              return new Response("DB error", { status: 500 });
            }

            // Mettre à jour le plan du profil (utilisé pour les quotas)
            const isActive =
              ["active", "trialing", "past_due"].includes(status) ||
              (status === "canceled" && periodEnd && new Date(periodEnd) > new Date());
            const planValue = isActive ? PLAN_BY_PRODUCT[productExternalId] ?? "free" : "free";
            await supabaseAdmin
              .from("profiles")
              .update({ plan: planValue })
              .eq("id", userId);
          }

          return new Response("ok");
        } catch (e) {
          console.error("[paddle webhook] handler error", e);
          return new Response("Handler error", { status: 500 });
        }
      },
    },
  },
});
