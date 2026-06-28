/**
 * Test end-to-end de l'annulation d'abonnement :
 * 1. L'utilisateur clique sur "Annuler" → server fn appelle Paddle.
 * 2. Paddle renvoie un webhook `subscription.updated` avec
 *    `scheduledChange.action === "cancel"` et un `current_period_end` futur.
 * 3. Le handler met à jour la table `subscriptions` : statut "active",
 *    `cancel_at_period_end = true`, et le profil reste sur plan "pro"
 *    jusqu'à la fin de la période.
 * 4. Quand Paddle envoie `subscription.canceled` après la période,
 *    le profil retombe sur "free".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type UpsertCall = { table: string; row: any; opts: any };
type UpdateCall = { table: string; patch: any; eqs: Array<[string, any]> };

function makeSupabaseStub() {
  const upserts: UpsertCall[] = [];
  const updates: UpdateCall[] = [];

  const from = (table: string) => ({
    upsert: (row: any, opts: any) => {
      upserts.push({ table, row, opts });
      return Promise.resolve({ error: null });
    },
    update: (patch: any) => {
      const eqs: Array<[string, any]> = [];
      const chain = {
        eq: (col: string, val: any) => {
          eqs.push([col, val]);
          updates.push({ table, patch, eqs });
          return Promise.resolve({ error: null });
        },
      };
      return chain;
    },
  });

  return { client: { from }, upserts, updates };
}

const periodEnd = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const periodStart = new Date(Date.now() - 23 * 24 * 3600 * 1000).toISOString();

const baseSub = {
  id: "sub_01abc",
  customerId: "ctm_01xyz",
  status: "active",
  customData: { userId: "user-123" },
  currentBillingPeriod: { startsAt: periodStart, endsAt: periodEnd },
  items: [
    {
      product: { importMeta: { externalId: "pro_plan" } },
      price: { importMeta: { externalId: "pro_monthly" } },
    },
  ],
};

async function postEvent(eventType: string, data: any, supaStub: any) {
  vi.doMock("@/lib/payments-webhook.server", () => ({
    verifyWebhookEvent: vi.fn(async () => ({ eventType, data })),
  }));
  vi.doMock("@/integrations/supabase/client.server", () => ({
    supabaseAdmin: supaStub.client,
  }));
  const mod = await import("@/routes/api/public/payments/webhook");
  const handler = (mod.Route.options as any).server.handlers.POST;
  const req = new Request("https://x.test/api/public/payments/webhook?env=sandbox", {
    method: "POST",
    body: "{}",
  });
  return handler({ request: req });
}

describe("annulation d'abonnement end-to-end (webhook Paddle)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/payments-webhook.server");
    vi.doUnmock("@/integrations/supabase/client.server");
  });

  it("subscription.updated avec scheduledChange=cancel → cancel_at_period_end=true, plan reste 'pro'", async () => {
    const supa = makeSupabaseStub();
    const res = await postEvent(
      "subscription.updated",
      { ...baseSub, scheduledChange: { action: "cancel", effectiveAt: periodEnd } },
      supa,
    );
    expect(res.status).toBe(200);

    const subUpsert = supa.upserts.find((u) => u.table === "subscriptions");
    expect(subUpsert).toBeTruthy();
    expect(subUpsert!.row.cancel_at_period_end).toBe(true);
    expect(subUpsert!.row.status).toBe("active");
    expect(subUpsert!.row.environment).toBe("sandbox");
    expect(subUpsert!.row.user_id).toBe("user-123");
    expect(subUpsert!.opts.onConflict).toBe("paddle_subscription_id");

    // Pendant la période d'annulation programmée, le plan reste actif.
    const profileUpdate = supa.updates.find((u) => u.table === "profiles");
    expect(profileUpdate?.patch.plan).toBe("pro");
  });

  it("subscription.canceled après la fin de période → plan retombe sur 'free'", async () => {
    const supa = makeSupabaseStub();
    const pastEnd = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const res = await postEvent(
      "subscription.canceled",
      {
        ...baseSub,
        status: "canceled",
        currentBillingPeriod: { startsAt: periodStart, endsAt: pastEnd },
      },
      supa,
    );
    expect(res.status).toBe(200);

    const subUpsert = supa.upserts.find((u) => u.table === "subscriptions");
    expect(subUpsert!.row.status).toBe("canceled");

    const profileUpdate = supa.updates.find((u) => u.table === "profiles");
    expect(profileUpdate?.patch.plan).toBe("free");
    expect(profileUpdate?.eqs).toContainEqual(["id", "user-123"]);
  });

  it("subscription.canceled mais période encore en cours → plan reste 'pro' (accès jusqu'à la fin)", async () => {
    const supa = makeSupabaseStub();
    const res = await postEvent(
      "subscription.canceled",
      { ...baseSub, status: "canceled" }, // periodEnd toujours futur
      supa,
    );
    expect(res.status).toBe(200);

    const profileUpdate = supa.updates.find((u) => u.table === "profiles");
    expect(profileUpdate?.patch.plan).toBe("pro");
  });
});
