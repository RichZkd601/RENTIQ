/**
 * RentIQ — Server functions du cockpit patrimonial (V2).
 *
 * CRUD des biens détenus + agrégats du portefeuille. Les chiffres (cashflow,
 * rendement) sont recalculés par le moteur déterministe à la création/maj —
 * jamais saisis à la main, jamais inventés par l'IA.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calcAllStrategies, type CalcInput, type StrategyKey, type TMI } from "./calculator";
import {
  portfolioSummary,
  rankProperties,
  netWorthTimeline,
  propertyMetrics,
  projectCashflow,
  type PortfolioProperty,
} from "./portfolio";

/** Hypothèse de taux de crédit de marché 2026 (refi & projections). */
export const CURRENT_MARKET_RATE = 0.034;

const STRATEGY = z.enum(["location_nue", "lmnp_longue_duree", "bail_mobilite", "colocation", "coliving", "airbnb"]);
const TMI_VALUES = [0, 0.11, 0.3, 0.41, 0.45] as const;

// --------------------------------------------------------------------------
// Mapping ligne DB -> domaine pur
// --------------------------------------------------------------------------
function rowToPortfolioProperty(row: any): PortfolioProperty {
  const hasLoan = Number(row.loan_amount) > 0 && row.loan_start_date;
  return {
    id: row.id,
    label: row.label,
    cityName: row.city_name,
    propertyType: row.property_type,
    strategy: row.strategy ?? null,
    purchasePrice: Number(row.purchase_price),
    capitalInvested: row.capital_invested == null ? null : Number(row.capital_invested),
    purchaseDate: row.purchase_date,
    currentValue: Number(row.current_value),
    monthlyRentGross: Number(row.monthly_rent_gross),
    monthlyCashflowNet: Number(row.monthly_cashflow_net),
    loan: hasLoan
      ? {
          principal: Number(row.loan_amount),
          rateAPR: Number(row.loan_rate ?? 0.035),
          durationYears: Number(row.loan_years ?? 20),
          startDate: row.loan_start_date,
        }
      : null,
    status: row.status,
  };
}

/** Recalcule l'économie d'un bien via le moteur pour la stratégie choisie. */
function computeEconomics(input: {
  strategy: StrategyKey;
  price: number;
  surfaceM2: number;
  rooms: number;
  worksBudget: number;
  furnitureBudget: number;
  propertyTax: number;
  copro: number;
  tmi: TMI;
  loanAmount: number;
  loanRate: number;
  loanYears: number;
  monthlyNu?: number;
  monthlyMeuble?: number;
  colocRoomRent?: number;
  colocRoomCount?: number;
  airbnbNightly?: number;
  airbnbOccupancy?: number;
}): { monthlyCashflowNet: number; netYieldPct: number; monthlyRentGross: number } | null {
  const calcInput: CalcInput = {
    property: {
      price: input.price,
      worksBudget: input.worksBudget,
      furnitureBudget: input.furnitureBudget,
      surfaceM2: input.surfaceM2,
      rooms: input.rooms,
      propertyTax: input.propertyTax,
      copro: input.copro,
    },
    rent: {
      monthlyNu: input.monthlyNu,
      monthlyMeuble: input.monthlyMeuble,
      monthlyMobilite: input.monthlyMeuble ? Math.round(input.monthlyMeuble * 1.1) : undefined,
      colocRoomRent: input.colocRoomRent,
      colocRoomCount: input.colocRoomCount,
      colivingRoomRent: input.colocRoomRent ? Math.round(input.colocRoomRent * 1.25) : undefined,
      colivingRoomCount: input.colocRoomCount,
      airbnbNightly: input.airbnbNightly,
      airbnbOccupancy: input.airbnbOccupancy,
    },
    financing: input.loanAmount > 0
      ? { loanAmount: input.loanAmount, rateAPR: input.loanRate, durationYears: input.loanYears }
      : undefined,
    fiscal: { tmi: input.tmi },
  };
  const res = calcAllStrategies(calcInput).find((s) => s.strategy === input.strategy && s.eligible);
  if (!res) return null;
  return {
    monthlyCashflowNet: res.monthlyNetCashflow,
    netYieldPct: res.netYieldPct,
    monthlyRentGross: Math.round(res.annualGrossRevenue / 12),
  };
}

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------
const PropertyInput = z.object({
  label: z.string().min(1).max(120),
  cityName: z.string().min(1).max(100),
  postalCode: z.string().regex(/^\d{5}$/).optional(),
  propertyType: z.enum(["studio", "t2", "t3", "t4_plus", "maison"]).optional(),
  surfaceM2: z.number().min(8).max(2000),
  rooms: z.number().int().min(1).max(20),
  strategy: STRATEGY,
  status: z.enum(["owned", "prospect", "sold"]).default("owned"),
  purchasePrice: z.number().min(10_000).max(20_000_000),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  worksBudget: z.number().min(0).max(2_000_000).default(0),
  furnitureBudget: z.number().min(0).max(200_000).default(0),
  capitalInvested: z.number().min(0).max(20_000_000).optional(),
  loanAmount: z.number().min(0).max(20_000_000).default(0),
  loanRate: z.number().min(0).max(0.2).default(0.035),
  loanYears: z.number().int().min(1).max(30).default(20),
  loanStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currentValue: z.number().min(10_000).max(20_000_000),
  propertyTax: z.number().min(0).max(50_000).default(0),
  copro: z.number().min(0).max(50_000).default(0),
  tmi: z.number().refine((v) => (TMI_VALUES as readonly number[]).includes(v)).default(0.3),
  // Loyers pour le calcul déterministe
  monthlyNu: z.number().min(0).max(50_000).optional(),
  monthlyMeuble: z.number().min(0).max(50_000).optional(),
  colocRoomRent: z.number().min(0).max(5_000).optional(),
  colocRoomCount: z.number().int().min(0).max(15).optional(),
  airbnbNightly: z.number().min(0).max(5_000).optional(),
  airbnbOccupancy: z.number().min(0).max(1).optional(),
  notes: z.string().max(2000).optional(),
});

type PropertyInputT = z.infer<typeof PropertyInput>;

function buildEconomics(d: PropertyInputT) {
  return computeEconomics({
    strategy: d.strategy,
    price: d.purchasePrice,
    surfaceM2: d.surfaceM2,
    rooms: d.rooms,
    worksBudget: d.worksBudget,
    furnitureBudget: d.furnitureBudget,
    propertyTax: d.propertyTax,
    copro: d.copro,
    tmi: d.tmi as TMI,
    loanAmount: d.loanAmount,
    loanRate: d.loanRate,
    loanYears: d.loanYears,
    monthlyNu: d.monthlyNu,
    monthlyMeuble: d.monthlyMeuble,
    colocRoomRent: d.colocRoomRent,
    colocRoomCount: d.colocRoomCount,
    airbnbNightly: d.airbnbNightly,
    airbnbOccupancy: d.airbnbOccupancy,
  });
}

// --------------------------------------------------------------------------
// createProperty
// --------------------------------------------------------------------------
export const createProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PropertyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const eco = buildEconomics(data);

    const { data: inserted, error } = await supabase
      .from("properties")
      .insert({
        user_id: userId,
        label: data.label,
        city_name: data.cityName,
        postal_code: data.postalCode ?? null,
        property_type: data.propertyType ?? null,
        surface_sqm: data.surfaceM2,
        rooms: data.rooms,
        strategy: data.strategy,
        status: data.status,
        purchase_price: data.purchasePrice,
        purchase_date: data.purchaseDate,
        works_budget: data.worksBudget,
        furniture_budget: data.furnitureBudget,
        capital_invested: data.capitalInvested ?? null,
        loan_amount: data.loanAmount,
        loan_rate: data.loanRate,
        loan_years: data.loanYears,
        loan_start_date: data.loanStartDate ?? (data.loanAmount > 0 ? data.purchaseDate : null),
        current_value: data.currentValue,
        monthly_rent_gross: eco?.monthlyRentGross ?? 0,
        monthly_cashflow_net: eco?.monthlyCashflowNet ?? 0,
        net_yield_pct: eco?.netYieldPct ?? null,
        property_tax: data.propertyTax,
        copro: data.copro,
        tmi: data.tmi,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Création échouée");

    // Valorisations initiales : achat + valeur actuelle.
    await supabase.from("property_valuations").insert([
      { property_id: inserted.id, user_id: userId, valued_at: data.purchaseDate, value: data.purchasePrice, source: "purchase" },
      { property_id: inserted.id, user_id: userId, value: data.currentValue, source: "manual" },
    ]);

    await supabase.from("notifications").insert({
      user_id: userId,
      kind: "portfolio",
      title: `« ${data.label} » ajouté à votre patrimoine`,
      body: eco ? `Cashflow estimé ${eco.monthlyCashflowNet >= 0 ? "+" : ""}${eco.monthlyCashflowNet} €/mois · ${eco.netYieldPct}% net` : undefined,
      link: "/patrimoine",
    });

    return { id: inserted.id as string };
  });

// --------------------------------------------------------------------------
// updateProperty
// --------------------------------------------------------------------------
export const updateProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PropertyInput.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const eco = buildEconomics(data);
    const { error } = await supabase
      .from("properties")
      .update({
        label: data.label,
        city_name: data.cityName,
        postal_code: data.postalCode ?? null,
        property_type: data.propertyType ?? null,
        surface_sqm: data.surfaceM2,
        rooms: data.rooms,
        strategy: data.strategy,
        status: data.status,
        purchase_price: data.purchasePrice,
        purchase_date: data.purchaseDate,
        works_budget: data.worksBudget,
        furniture_budget: data.furnitureBudget,
        capital_invested: data.capitalInvested ?? null,
        loan_amount: data.loanAmount,
        loan_rate: data.loanRate,
        loan_years: data.loanYears,
        loan_start_date: data.loanStartDate ?? (data.loanAmount > 0 ? data.purchaseDate : null),
        current_value: data.currentValue,
        monthly_rent_gross: eco?.monthlyRentGross ?? 0,
        monthly_cashflow_net: eco?.monthlyCashflowNet ?? 0,
        net_yield_pct: eco?.netYieldPct ?? null,
        property_tax: data.propertyTax,
        copro: data.copro,
        tmi: data.tmi,
        notes: data.notes ?? null,
      })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --------------------------------------------------------------------------
// deleteProperty
// --------------------------------------------------------------------------
export const deleteProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("properties").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --------------------------------------------------------------------------
// addValuation
// --------------------------------------------------------------------------
export const addValuation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      propertyId: z.string().uuid(),
      value: z.number().min(1000).max(20_000_000),
      valuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("property_valuations").insert({
      property_id: data.propertyId,
      user_id: userId,
      value: data.value,
      valued_at: data.valuedAt ?? new Date().toISOString().slice(0, 10),
      source: "manual",
    });
    if (error) throw new Error(error.message);
    // Met à jour la valeur courante du bien.
    await supabase.from("properties").update({ current_value: data.value }).eq("id", data.propertyId).eq("user_id", userId);
    return { ok: true };
  });

// --------------------------------------------------------------------------
// getProperty (avec historique de valorisation)
// --------------------------------------------------------------------------
export const getProperty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("Bien introuvable");
    const { data: vals } = await supabase
      .from("property_valuations")
      .select("valued_at, value, source")
      .eq("property_id", data.id)
      .order("valued_at", { ascending: true });
    const metrics = propertyMetrics(rowToPortfolioProperty(row));
    return { property: row, metrics, valuations: vals ?? [] };
  });

// --------------------------------------------------------------------------
// listProperties
// --------------------------------------------------------------------------
export const listProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("properties")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => {
      const m = propertyMetrics(rowToPortfolioProperty(r));
      return {
        id: r.id as string,
        label: r.label as string,
        cityName: r.city_name as string,
        propertyType: r.property_type as string | null,
        strategy: r.strategy as string | null,
        status: r.status as string,
        currentValue: Number(r.current_value),
        monthlyCashflow: m.monthlyCashflow,
        grossYieldPct: m.grossYieldPct,
        equity: m.equity,
        remainingDebt: m.remainingDebt,
        appreciationPct: m.appreciationPct,
        flags: m.flags,
      };
    });
  });

// --------------------------------------------------------------------------
// getPortfolioOverview — KPIs + ranking + timeline (cockpit)
// --------------------------------------------------------------------------
export const getPortfolioOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase.from("properties").select("*").eq("user_id", userId);
    const properties = (rows ?? []).map(rowToPortfolioProperty);

    // Valorisations pour la timeline.
    const { data: vals } = await supabase
      .from("property_valuations")
      .select("property_id, valued_at, value")
      .eq("user_id", userId);
    const byProp = new Map<string, Array<{ date: string; value: number }>>();
    for (const v of vals ?? []) {
      const arr = byProp.get(v.property_id) ?? [];
      arr.push({ date: v.valued_at, value: Number(v.value) });
      byProp.set(v.property_id, arr);
    }
    const withVals = properties.map((p) => ({ ...p, valuations: byProp.get(p.id) ?? [] }));

    const summary = portfolioSummary(properties);
    const ranking = rankProperties(properties);
    const timeline = netWorthTimeline(withVals, { months: 12 });
    const labelById = new Map(properties.map((p) => [p.id, p.label]));

    return {
      summary,
      timeline,
      best: ranking.best ? { ...ranking.best, label: labelById.get(ranking.best.id) ?? "" } : null,
      worst: ranking.worst ? { ...ranking.worst, label: labelById.get(ranking.worst.id) ?? "" } : null,
      toOptimizeCount: ranking.toOptimize.length,
      projection5y: projectCashflow(properties, 5),
      propertyCount: properties.length,
    };
  });

// --------------------------------------------------------------------------
// prefillFromAnalysis — convertit une analyse en brouillon de bien
// --------------------------------------------------------------------------
export const prefillFromAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ analysisId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("analyses")
      .select("*")
      .eq("id", data.analysisId)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("Analyse introuvable");
    const calc = (row.calc ?? {}) as any;
    const input = calc.input ?? {};
    const winnerKey = (row.ai_analysis as any)?.winnerStrategy as string | undefined;
    const strategy = winnerKey && winnerKey !== "aucune" ? winnerKey : "location_nue";
    return {
      label: `${row.property_type ?? "Bien"} ${row.city_name}`,
      cityName: row.city_name,
      postalCode: row.postal_code ?? undefined,
      propertyType: row.property_type ?? undefined,
      surfaceM2: Number(row.surface_sqm),
      rooms: Number(row.rooms_possible ?? 2),
      strategy,
      purchasePrice: Number(row.purchase_price),
      currentValue: Number(row.purchase_price),
      worksBudget: Number(row.renovation_cost ?? 0),
      furnitureBudget: Number(row.furnishing_cost ?? 0),
      loanAmount: Number(input.loanAmount ?? 0),
      loanRate: Number(row.loan_rate ?? 0.035),
      loanYears: Number(row.loan_years ?? 20),
      tmi: Number(row.tmi ?? 0.3),
      monthlyNu: input.monthlyNu,
      monthlyMeuble: input.monthlyMeuble,
      colocRoomRent: input.colocRoomRent,
      colocRoomCount: input.colocRoomCount,
      airbnbNightly: input.airbnbNightly,
      airbnbOccupancy: input.airbnbOccupancy,
      sourceAnalysisId: row.id,
    };
  });
