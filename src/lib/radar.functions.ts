/**
 * RentIQ — Server functions du radar d'opportunités (V3).
 *
 * Profils investisseur + détection/scoring d'annonces. Le scoring est réel
 * (moteur déterministe via opportunityScore). La source d'annonces réelle
 * (scraping LeBonCoin/SeLoger via Firecrawl) est prévue en V2 de la roadmap ;
 * en attendant, `scanProfile` synthétise des candidates à partir des données
 * de marché de la ville, explicitement marquées `source = "demo"`, et
 * `addOpportunity` permet de scorer une annonce réelle collée à la main.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scoreOpportunity, type CandidateListing, type InvestorProfile } from "./opportunityScore";
import type { StrategyKey, TMI } from "./calculator";

const STRATEGY = z.enum([
  "location_nue",
  "lmnp_longue_duree",
  "bail_mobilite",
  "colocation",
  "coliving",
  "airbnb",
]);
const TMI_VALUES = [0, 0.11, 0.3, 0.41, 0.45] as const;

function rowToInvestorProfile(row: any): InvestorProfile {
  return {
    cityName: row.city_name,
    propertyType: row.property_type,
    maxBudget: Number(row.max_budget),
    strategy: row.strategy as StrategyKey,
    minMonthlyCashflow: Number(row.min_monthly_cashflow),
    minNetYieldPct: row.min_net_yield_pct == null ? null : Number(row.min_net_yield_pct),
    tmi: Number(row.tmi ?? 0.3) as TMI,
    downPaymentPct: Number(row.down_payment_pct ?? 0.1),
  };
}

const ProfileInput = z.object({
  label: z.string().min(1).max(120),
  cityName: z.string().min(1).max(100),
  postalCode: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  propertyType: z.enum(["studio", "t2", "t3", "t4_plus", "maison"]).optional(),
  maxBudget: z.number().min(10_000).max(20_000_000),
  strategy: STRATEGY,
  minMonthlyCashflow: z.number().min(-2000).max(20_000).default(0),
  minNetYieldPct: z.number().min(0).max(30).optional(),
  tmi: z
    .number()
    .refine((v) => (TMI_VALUES as readonly number[]).includes(v))
    .default(0.3),
  downPaymentPct: z.number().min(0).max(1).default(0.1),
  active: z.boolean().default(true),
});

// -------------------- CRUD profils --------------------
export const listInvestorProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("investor_profiles")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createInvestorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProfileInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inserted, error } = await supabase
      .from("investor_profiles")
      .insert({
        user_id: userId,
        label: data.label,
        city_name: data.cityName,
        postal_code: data.postalCode ?? null,
        property_type: data.propertyType ?? null,
        max_budget: data.maxBudget,
        strategy: data.strategy,
        min_monthly_cashflow: data.minMonthlyCashflow,
        min_net_yield_pct: data.minNetYieldPct ?? null,
        tmi: data.tmi,
        down_payment_pct: data.downPaymentPct,
        active: data.active,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Création échouée");
    return { id: inserted.id as string };
  });

export const updateInvestorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProfileInput.partial().extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...rest } = data;
    const patch: Record<string, unknown> = {};
    if (rest.label !== undefined) patch.label = rest.label;
    if (rest.cityName !== undefined) patch.city_name = rest.cityName;
    if (rest.postalCode !== undefined) patch.postal_code = rest.postalCode;
    if (rest.propertyType !== undefined) patch.property_type = rest.propertyType;
    if (rest.maxBudget !== undefined) patch.max_budget = rest.maxBudget;
    if (rest.strategy !== undefined) patch.strategy = rest.strategy;
    if (rest.minMonthlyCashflow !== undefined) patch.min_monthly_cashflow = rest.minMonthlyCashflow;
    if (rest.minNetYieldPct !== undefined) patch.min_net_yield_pct = rest.minNetYieldPct;
    if (rest.tmi !== undefined) patch.tmi = rest.tmi;
    if (rest.downPaymentPct !== undefined) patch.down_payment_pct = rest.downPaymentPct;
    if (rest.active !== undefined) patch.active = rest.active;
    const { error } = await supabase
      .from("investor_profiles")
      .update(patch as never)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteInvestorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("investor_profiles")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Opportunités --------------------
export const listOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ profileId: z.string().uuid().optional(), onlyMatches: z.boolean().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("opportunities")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "dismissed")
      .order("match_score", { ascending: false })
      .limit(100);
    if (data.profileId) q = q.eq("investor_profile_id", data.profileId);
    if (data.onlyMatches) q = q.eq("matches", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const ManualListing = z.object({
  profileId: z.string().uuid(),
  sourceUrl: z.string().url().optional(),
  surfaceM2: z.number().min(8).max(2000),
  rooms: z.number().int().min(1).max(20),
  price: z.number().min(10_000).max(20_000_000),
  worksBudget: z.number().min(0).max(2_000_000).optional(),
  monthlyRentNu: z.number().min(0).max(50_000).optional(),
  monthlyRentMeuble: z.number().min(0).max(50_000).optional(),
  colocRoomRent: z.number().min(0).max(5_000).optional(),
  colocRoomCount: z.number().int().min(0).max(15).optional(),
  airbnbNightly: z.number().min(0).max(5_000).optional(),
  airbnbOccupancy: z.number().min(0).max(1).optional(),
});

export const addOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ManualListing.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profRow, error: profErr } = await supabase
      .from("investor_profiles")
      .select("*")
      .eq("id", data.profileId)
      .eq("user_id", userId)
      .single();
    if (profErr || !profRow) throw new Error("Profil investisseur introuvable");
    const profile = rowToInvestorProfile(profRow);
    const candidate: CandidateListing = {
      cityName: profRow.city_name,
      postalCode: profRow.postal_code,
      propertyType: profRow.property_type,
      surfaceM2: data.surfaceM2,
      rooms: data.rooms,
      price: data.price,
      worksBudget: data.worksBudget,
      monthlyRentNu: data.monthlyRentNu,
      monthlyRentMeuble: data.monthlyRentMeuble,
      colocRoomRent: data.colocRoomRent,
      colocRoomCount: data.colocRoomCount,
      airbnbNightly: data.airbnbNightly,
      airbnbOccupancy: data.airbnbOccupancy,
    };
    const result = scoreOpportunity(profile, candidate);
    const { data: inserted, error } = await supabase
      .from("opportunities")
      .insert({
        user_id: userId,
        investor_profile_id: data.profileId,
        source: "manual",
        source_url: data.sourceUrl ?? null,
        city_name: profRow.city_name,
        postal_code: profRow.postal_code,
        property_type: profRow.property_type,
        surface_sqm: data.surfaceM2,
        rooms: data.rooms,
        price: data.price,
        listing: candidate as any,
        match_score: result.matchScore,
        matches: result.matches,
        monthly_cashflow: result.monthlyCashflow,
        net_yield_pct: result.netYieldPct,
        result: result as any,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Insertion échouée");
    return { id: inserted.id as string, result };
  });

/**
 * Scan d'un profil : synthétise des candidates depuis les données de marché de
 * la ville et les score. DEMO tant que le scraper réel (V2 roadmap) n'est pas
 * branché — chaque opportunité est marquée `source = "demo"`.
 */
export const scanProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ profileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profRow, error: profErr } = await supabase
      .from("investor_profiles")
      .select("*")
      .eq("id", data.profileId)
      .eq("user_id", userId)
      .single();
    if (profErr || !profRow) throw new Error("Profil investisseur introuvable");
    const profile = rowToInvestorProfile(profRow);

    // Données de marché de la ville pour bâtir des candidates plausibles.
    const { data: city } = await supabase
      .from("city_data")
      .select("price_sqm_avg, rent_sqm_furnished, rent_sqm_unfurnished")
      .ilike("city_name", profRow.city_name)
      .maybeSingle();
    const priceSqm = city?.price_sqm_avg ? Number(city.price_sqm_avg) : profile.maxBudget / 55;
    const rentSqmFurnished = city?.rent_sqm_furnished
      ? Number(city.rent_sqm_furnished)
      : priceSqm * 0.0038;
    const rentSqmUnfurnished = city?.rent_sqm_unfurnished
      ? Number(city.rent_sqm_unfurnished)
      : rentSqmFurnished * 0.88;

    // 5 candidates : surface dimensionnée au budget, décote de prix variable.
    const baseSurface = Math.max(18, Math.round((profile.maxBudget * 0.92) / priceSqm));
    const discounts = [-0.14, -0.08, -0.03, 0.0, 0.05];
    const candidates: CandidateListing[] = discounts.map((disc, i) => {
      const surface = Math.max(15, baseSurface + (i - 2) * 4);
      const price = Math.round(surface * priceSqm * (1 + disc));
      const rooms = surface < 30 ? 1 : surface < 50 ? 2 : surface < 70 ? 3 : 4;
      return {
        cityName: profRow.city_name,
        postalCode: profRow.postal_code,
        propertyType: profRow.property_type,
        surfaceM2: surface,
        rooms,
        price,
        monthlyRentNu: Math.round(surface * rentSqmUnfurnished),
        monthlyRentMeuble: Math.round(surface * rentSqmFurnished),
        colocRoomRent:
          rooms >= 3 ? Math.round(((surface * rentSqmFurnished) / rooms) * 1.15) : undefined,
        colocRoomCount: rooms >= 3 ? rooms - 1 : undefined,
      };
    });

    let detected = 0;
    let matched = 0;
    for (const candidate of candidates) {
      const result = scoreOpportunity(profile, candidate);
      if (result.matchScore < 35) continue; // on ne stocke pas le bruit
      detected++;
      if (result.matches) matched++;
      await supabase.from("opportunities").insert({
        user_id: userId,
        investor_profile_id: data.profileId,
        source: "demo",
        city_name: profRow.city_name,
        postal_code: profRow.postal_code,
        property_type: profRow.property_type,
        surface_sqm: candidate.surfaceM2,
        rooms: candidate.rooms,
        price: candidate.price,
        listing: candidate as any,
        match_score: result.matchScore,
        matches: result.matches,
        monthly_cashflow: result.monthlyCashflow,
        net_yield_pct: result.netYieldPct,
        result: result as any,
      });
    }

    await supabase
      .from("investor_profiles")
      .update({ last_scanned_at: new Date().toISOString() })
      .eq("id", data.profileId);

    if (detected > 0) {
      await supabase.from("notifications").insert({
        user_id: userId,
        kind: "opportunity",
        title: `${detected} opportunité${detected > 1 ? "s" : ""} détectée${detected > 1 ? "s" : ""} sur « ${profRow.label} »`,
        body:
          matched > 0
            ? `${matched} correspond${matched > 1 ? "ent" : ""} à tous vos critères.`
            : "À examiner dans votre radar.",
        link: "/radar",
      });
    }

    return { detected, matched };
  });

export const updateOpportunityStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "seen", "saved", "dismissed", "analyzed"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("opportunities")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
