/**
 * RentIQ — Server functions des recommandations automatiques (V4).
 *
 * Analyse mensuelle du portefeuille : chaque bien est confronté aux données de
 * marché de sa ville et passé au moteur de recommandations déterministe. Les
 * recommandations « open » sont régénérées à chaque run ; les actions de
 * l'utilisateur (done/dismissed) sont conservées.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateRecommendations, type RecoProperty } from "./recommendations";
import type { StrategyKey, TMI } from "./calculator";
import { CURRENT_MARKET_RATE } from "./portfolio.functions";

async function buildRecoProperty(supabase: any, row: any): Promise<RecoProperty> {
  const surface = Number(row.surface_sqm ?? 0);
  // Données de marché de la ville (loyers €/m²).
  const { data: city } = await supabase
    .from("city_data")
    .select("rent_sqm_furnished, rent_sqm_unfurnished, rent_room_coliving")
    .ilike("city_name", row.city_name)
    .maybeSingle();
  const rentSqmFurnished = city?.rent_sqm_furnished ? Number(city.rent_sqm_furnished) : null;
  const rentSqmUnfurnished = city?.rent_sqm_unfurnished ? Number(city.rent_sqm_unfurnished) : null;
  const rooms = Number(row.rooms ?? 2);

  const hasLoan = Number(row.loan_amount) > 0 && row.loan_start_date;
  return {
    id: row.id,
    label: row.label,
    cityName: row.city_name,
    strategy: (row.strategy ?? "location_nue") as StrategyKey,
    surfaceM2: surface,
    rooms,
    purchasePrice: Number(row.purchase_price),
    worksBudget: Number(row.works_budget ?? 0),
    furnitureBudget: Number(row.furniture_budget ?? 0),
    propertyTax: Number(row.property_tax ?? 0),
    copro: Number(row.copro ?? 0),
    tmi: Number(row.tmi ?? 0.3) as TMI,
    loan: hasLoan
      ? {
          principal: Number(row.loan_amount),
          rateAPR: Number(row.loan_rate ?? 0.035),
          durationYears: Number(row.loan_years ?? 20),
          startDate: row.loan_start_date,
        }
      : null,
    currentValue: Number(row.current_value),
    currentMonthlyRent: Number(row.monthly_rent_gross),
    currentMonthlyCashflowNet: Number(row.monthly_cashflow_net),
    market: {
      marketRentNu: rentSqmUnfurnished ? Math.round(rentSqmUnfurnished * surface) : null,
      marketRentMeuble: rentSqmFurnished ? Math.round(rentSqmFurnished * surface) : null,
      marketColocRoomRent: city?.rent_room_coliving ? Number(city.rent_room_coliving) : null,
      colocRoomCount: rooms >= 3 ? rooms - 1 : null,
      marketRateAPR: CURRENT_MARKET_RATE,
    },
  };
}

/** Régénère les recommandations « open » du portefeuille. */
export const generatePortfolioRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("properties")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "owned");
    if (error) throw new Error(error.message);
    const properties = rows ?? [];

    // On efface les anciennes recommandations « open » (les actées sont conservées).
    await supabase.from("recommendations").delete().eq("user_id", userId).eq("status", "open");

    const all = [];
    for (const row of properties) {
      const reco = await buildRecoProperty(supabase, row);
      const recs = generateRecommendations(reco);
      for (const r of recs) {
        all.push({
          user_id: userId,
          property_id: r.propertyId,
          type: r.type,
          title: r.title,
          description: r.description,
          estimated_monthly_gain: r.estimatedMonthlyGain,
          estimated_oneoff_gain: r.estimatedOneOffGain,
          confidence: r.confidence,
          priority: Math.round(r.priority),
          status: "open",
        });
      }
    }

    if (all.length > 0) {
      await supabase.from("recommendations").insert(all);
      const totalMonthly = all.reduce((s, r) => s + Number(r.estimated_monthly_gain), 0);
      await supabase.from("notifications").insert({
        user_id: userId,
        kind: "recommendation",
        title: `${all.length} recommandation${all.length > 1 ? "s" : ""} sur votre patrimoine`,
        body:
          totalMonthly > 0
            ? `Potentiel de +${Math.round(totalMonthly)} €/mois identifié.`
            : "Nouvelles pistes d'optimisation.",
        link: "/recommandations",
      });
    }

    return { generated: all.length };
  });

export const listRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(["open", "done", "dismissed"]).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("recommendations")
      .select("*, properties(label, city_name)")
      .eq("user_id", userId)
      .order("priority", { ascending: false })
      .limit(200);
    q = q.eq("status", data.status ?? "open");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateRecommendationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["open", "done", "dismissed"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("recommendations")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
