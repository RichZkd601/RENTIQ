import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron mensuel : rafraîchit tous les snapshots de marché pour les codes postaux
 * déjà utilisés (via analyses.postal_code) afin que l'encadrement, prix m² et
 * loyers restent à jour sans intervention manuelle.
 *
 * Appelé via pg_cron avec un header `apikey` = SUPABASE_PUBLISHABLE_KEY.
 */
export const Route = createFileRoute("/api/public/hooks/refresh-market-data")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { fetchMarketData } = await import("@/lib/market.server");

        // Liste les codes postaux utilisés + les snapshots existants qui ont plus de 25j.
        const cutoff = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString();
        const [analysesRes, snapshotsRes] = await Promise.all([
          supabaseAdmin
            .from("analyses")
            .select("postal_code")
            .not("postal_code", "is", null)
            .limit(1000),
          supabaseAdmin.from("market_snapshots").select("insee_code, postal_code, fetched_at").lt("fetched_at", cutoff),
        ]);

        const postalCodes = new Set<string>();
        for (const a of analysesRes.data ?? []) if (a.postal_code) postalCodes.add(a.postal_code);
        for (const s of snapshotsRes.data ?? []) if (s.postal_code) postalCodes.add(s.postal_code);

        const results: Array<{ postalCode: string; status: "ok" | "error"; error?: string; insee?: string }> = [];
        for (const cp of postalCodes) {
          try {
            const market = await fetchMarketData(cp);
            await supabaseAdmin.from("market_snapshots").upsert(
              {
                insee_code: market.inseeCode,
                postal_code: market.postalCode,
                commune_name: market.communeName,
                department_code: market.departmentCode ?? null,
                region_code: market.regionCode ?? null,
                rent_controlled: market.rentControlled,
                rent_cap_unfurnished: market.rentCapUnfurnished ?? null,
                rent_cap_furnished: market.rentCapFurnished ?? null,
                regulation_zone: market.regulationZone ?? null,
                regulation_source: market.regulationSource ?? null,
                raw: (market.raw ?? null) as any,
                fetched_at: new Date().toISOString(),
              },
              { onConflict: "insee_code" },
            );
            results.push({ postalCode: cp, status: "ok", insee: market.inseeCode });
          } catch (e: any) {
            results.push({ postalCode: cp, status: "error", error: e?.message ?? "unknown" });
          }
        }

        return Response.json({ processed: results.length, results });
      },
    },
  },
});
