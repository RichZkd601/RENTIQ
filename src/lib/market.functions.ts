import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TTL_DAYS = 30;

export type MarketSnapshot = {
  inseeCode: string;
  postalCode: string;
  communeName: string;
  departmentCode: string | null;
  regionCode: string | null;
  priceSqmAvg: number | null;
  rentSqmUnfurnished: number | null;
  rentSqmFurnished: number | null;
  rentControlled: boolean;
  rentCapUnfurnished: number | null;
  rentCapFurnished: number | null;
  regulationZone: string | null;
  regulationSource: string | null;
  fetchedAt: string;
  communes?: Array<{ inseeCode: string; communeName: string }>;
};

function mapRow(row: any): MarketSnapshot {
  return {
    inseeCode: row.insee_code,
    postalCode: row.postal_code,
    communeName: row.commune_name,
    departmentCode: row.department_code,
    regionCode: row.region_code,
    priceSqmAvg: row.price_sqm_avg ? Number(row.price_sqm_avg) : null,
    rentSqmUnfurnished: row.rent_sqm_unfurnished ? Number(row.rent_sqm_unfurnished) : null,
    rentSqmFurnished: row.rent_sqm_furnished ? Number(row.rent_sqm_furnished) : null,
    rentControlled: !!row.rent_controlled,
    rentCapUnfurnished: row.rent_cap_unfurnished ? Number(row.rent_cap_unfurnished) : null,
    rentCapFurnished: row.rent_cap_furnished ? Number(row.rent_cap_furnished) : null,
    regulationZone: row.regulation_zone,
    regulationSource: row.regulation_source,
    fetchedAt: row.fetched_at,
  };
}

/**
 * Résout un CP en snapshot de marché. Utilise le cache market_snapshots (TTL 30j)
 * et rafraîchit en arrière-plan via geo.api.gouv.fr + sources d'encadrement.
 */
export const getMarketSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        postalCode: z.string().regex(/^\d{5}$/, "Code postal invalide"),
        preferredInsee: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { resolveCommunes, fetchMarketData } = await import("./market.server");

    // 1. On résout d'abord les communes possibles pour ce CP (gratuit, rapide)
    const communes = await resolveCommunes(data.postalCode);
    const target =
      (data.preferredInsee && communes.find((c) => c.inseeCode === data.preferredInsee)) ||
      communes[0];

    // 2. Lookup cache
    const { data: cached } = await supabase
      .from("market_snapshots")
      .select("*")
      .eq("insee_code", target.inseeCode)
      .maybeSingle();

    const fresh =
      cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_DAYS * 24 * 60 * 60 * 1000;
    if (fresh) {
      return {
        ...mapRow(cached),
        communes: communes.map((c) => ({ inseeCode: c.inseeCode, communeName: c.communeName })),
      } satisfies MarketSnapshot;
    }

    // 3. Refresh : on ré-interroge les sources
    let market;
    try {
      market = await fetchMarketData(data.postalCode, target.inseeCode);
    } catch (e: any) {
      // Si la donnée externe est indispo mais qu'on a un cache, on retourne le cache.
      if (cached) {
        return {
          ...mapRow(cached),
          communes: communes.map((c) => ({ inseeCode: c.inseeCode, communeName: c.communeName })),
        } satisfies MarketSnapshot;
      }
      throw new Error(e?.message ?? "Impossible de récupérer les données de marché");
    }

    // 4. Upsert via service role (lecture publique, écriture serveur uniquement)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      insee_code: market.inseeCode,
      postal_code: market.postalCode,
      commune_name: market.communeName,
      department_code: market.departmentCode ?? null,
      region_code: market.regionCode ?? null,
      // On préserve les prix m²/loyers existants tant qu'on n'a pas de source dédiée
      price_sqm_avg: cached?.price_sqm_avg ?? null,
      rent_sqm_unfurnished: cached?.rent_sqm_unfurnished ?? null,
      rent_sqm_furnished: cached?.rent_sqm_furnished ?? null,
      rent_controlled: market.rentControlled,
      rent_cap_unfurnished: market.rentCapUnfurnished ?? null,
      rent_cap_furnished: market.rentCapFurnished ?? null,
      regulation_zone: market.regulationZone ?? null,
      regulation_source: market.regulationSource ?? null,
      raw: (market.raw ?? null) as any,
      fetched_at: new Date().toISOString(),
    };
    const { data: upserted, error } = await supabaseAdmin
      .from("market_snapshots")
      .upsert(payload, { onConflict: "insee_code" })
      .select("*")
      .single();
    if (error || !upserted) throw new Error(error?.message ?? "Upsert snapshot échoué");

    return {
      ...mapRow(upserted),
      communes: communes.map((c) => ({ inseeCode: c.inseeCode, communeName: c.communeName })),
    } satisfies MarketSnapshot;
  });
