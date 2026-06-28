import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calcAllStrategies, calcFlip, type CalcInput, type TMI } from "./calculator";
import {
  matchStrategies,
  cityRegulationFromRow,
  type UserObjective,
  type EffortLevel,
} from "./strategyMatcher";

// ---------------- Input schema ----------------
const AnalysisInput = z.object({
  cityName: z.string().min(1).max(100),
  postalCode: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  propertyType: z.string().max(20).optional(),
  surfaceM2: z.number().min(8).max(2000),
  rooms: z.number().int().min(1).max(20),
  price: z.number().min(10_000).max(20_000_000),
  worksBudget: z.number().min(0).max(2_000_000).default(0),
  furnitureBudget: z.number().min(0).max(200_000).default(0),
  propertyTax: z.number().min(0).max(50_000).default(0),
  copro: z.number().min(0).max(50_000).default(0),
  monthlyNu: z.number().min(0).max(50_000).optional(),
  monthlyMeuble: z.number().min(0).max(50_000).optional(),
  colocRoomRent: z.number().min(0).max(5_000).optional(),
  colocRoomCount: z.number().int().min(0).max(15).optional(),
  airbnbNightly: z.number().min(0).max(5_000).optional(),
  airbnbOccupancy: z.number().min(0).max(1).optional(),
  isClasseTourisme: z.boolean().default(false),
  loanAmount: z.number().min(0).max(20_000_000).default(0),
  loanRate: z.number().min(0).max(0.2).default(0.04),
  loanYears: z.number().int().min(1).max(30).default(25),
  downPayment: z.number().min(0).max(20_000_000).optional(),
  tmi: z
    .number()
    .refine((v) => [0, 0.11, 0.3, 0.41, 0.45].includes(v))
    .default(0.3),
  objective: z.enum(["cashflow", "patrimoine", "equilibre", "defisc"]).default("equilibre"),
  effort: z.enum(["passif", "modere", "actif"]).default("modere"),
  // Optionnel flip
  flipEnabled: z.boolean().default(false),
  estimatedResalePrice: z.number().min(0).max(20_000_000).optional(),
  holdingMonths: z.number().int().min(1).max(60).optional(),
  exterior: z.enum(["aucun", "balcon", "terrasse", "rez_jardin"]).optional(),
});

export type AnalysisInputT = z.infer<typeof AnalysisInput>;

const PLAN_QUOTAS: Record<string, number> = { free: 3, pro: 999999, business: 999999, premium: 999999, lifetime: 999999 };

// ---------------- generateAnalysis ----------------
export const generateAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AnalysisInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Quota check + incrément atomique (réinitialisation mensuelle gérée en base)
    // On lit d'abord le plan, puis on appelle la RPC qui verrouille la ligne et incrémente.
    const { data: planRow } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .single();
    const plan = planRow?.plan ?? "free";
    const limit = PLAN_QUOTAS[plan] ?? 3;
    const { data: quotaRow, error: quotaError } = await supabase
      .rpc("consume_analysis_quota", { p_limit: limit })
      .single();
    if (quotaError) {
      if (quotaError.message?.includes("QUOTA_EXCEEDED")) {
        throw new Error(
          `Quota mensuel atteint pour le plan ${plan}. Passez à un plan supérieur ou attendez la réinitialisation.`,
        );
      }
      throw new Error(quotaError.message);
    }
    const used = (quotaRow as any)?.used ?? 0;

    // 2. Charger ville
    const { data: cityRow } = await supabase
      .from("city_data")
      .select("*")
      .ilike("city_name", data.cityName)
      .maybeSingle();

    const city = cityRow
      ? cityRegulationFromRow(cityRow as any)
      : cityRegulationFromRow({ city_name: data.cityName, regulation_level: "libre" });

    // 3. Construire l'input du moteur
    const calcInput: CalcInput = {
      property: {
        price: data.price,
        worksBudget: data.worksBudget,
        furnitureBudget: data.furnitureBudget,
        surfaceM2: data.surfaceM2,
        rooms: data.rooms,
        propertyTax: data.propertyTax,
        copro: data.copro,
      },
      rent: {
        monthlyNu: data.monthlyNu,
        monthlyMeuble: data.monthlyMeuble,
        monthlyMobilite: data.monthlyMeuble ? Math.round(data.monthlyMeuble * 1.1) : undefined,
        colocRoomRent: data.colocRoomRent,
        colocRoomCount: data.colocRoomCount,
        colivingRoomRent: data.colocRoomRent ? Math.round(data.colocRoomRent * 1.25) : undefined,
        colivingRoomCount: data.colocRoomCount,
        airbnbNightly: data.airbnbNightly,
        airbnbOccupancy: data.airbnbOccupancy,
      },
      financing:
        data.loanAmount > 0
          ? { loanAmount: data.loanAmount, rateAPR: data.loanRate, durationYears: data.loanYears }
          : undefined,
      fiscal: { tmi: data.tmi as TMI, isClasseTourisme: data.isClasseTourisme },
    };

    const matched = matchStrategies({
      calc: calcInput,
      objective: data.objective as UserObjective,
      effort: data.effort as EffortLevel,
      city,
    });

    // 4. Flip optionnel
    let flip: ReturnType<typeof calcFlip> | null = null;
    if (data.flipEnabled && data.estimatedResalePrice && data.holdingMonths) {
      const acquisitionCost = data.price + data.price * 0.08;
      flip = calcFlip({
        acquisitionCost,
        worksBudget: data.worksBudget,
        holdingMonths: data.holdingMonths,
        monthlyHoldingCost: Math.round(
          (data.propertyTax + data.copro) / 12 + (data.loanAmount * data.loanRate) / 12,
        ),
        estimatedResalePrice: data.estimatedResalePrice,
        tmi: data.tmi as TMI,
      });
    }

    // 5. Appel IA (arbitre — ne calcule jamais)
    const aiAnalysis = await callAiArbiter({ matched, city, data, flip });

    // 5bis. Verdict déterministe (score /100 + décision + prix max conseillé)
    const { computeVerdict, findMaxRecommendedPrice, scoreOnly } = await import("./verdict");
    const winnerKey = (aiAnalysis.winnerStrategy as any) ?? matched.ranked[0]?.strategy ?? null;
    const winner =
      winnerKey && winnerKey !== "aucune"
        ? (matched.strategies.find((s) => s.strategy === winnerKey) ?? matched.ranked[0] ?? null)
        : (matched.ranked[0] ?? null);

    // Pricing marché : on tente une lecture du snapshot CP si dispo
    let priceSqmAvg: number | null = null;
    if (data.postalCode) {
      const { data: snap } = await supabase
        .from("market_snapshots")
        .select("price_sqm_avg")
        .eq("postal_code", data.postalCode)
        .maybeSingle();
      priceSqmAvg = snap?.price_sqm_avg ? Number(snap.price_sqm_avg) : null;
    }

    const regulationLevel = (city.loi_le_meur as any) ?? null;
    const ctx = {
      winner,
      regulationLevel,
      priceSqmAvg,
      currentPricePerSqm: data.surfaceM2 > 0 ? data.price / data.surfaceM2 : null,
    };
    void scoreOnly; // (réservé pour usages futurs)
    const maxRecommendedPrice = winner
      ? findMaxRecommendedPrice({ baseInput: calcInput, winnerStrategy: winner.strategy, ctx })
      : null;
    const verdict = computeVerdict({ winner, ctx, maxRecommendedPrice, currentPrice: data.price });

    // 6. Sauvegarde
    const { data: inserted, error: insertError } = await supabase
      .from("analyses")
      .insert({
        user_id: userId,
        city_name: data.cityName,
        postal_code: data.postalCode ?? null,
        property_type: data.propertyType ?? null,
        surface_sqm: data.surfaceM2,
        purchase_price: data.price,
        renovation_cost: data.worksBudget,
        furnishing_cost: data.furnitureBudget,
        rooms_possible: data.rooms,
        loan_rate: data.loanRate,
        loan_years: data.loanYears,
        down_payment: data.downPayment ?? null,
        tmi: data.tmi,
        user_profile: data.objective,
        holding_months: data.holdingMonths ?? null,
        estimated_resale_price: data.estimatedResalePrice ?? null,
        exterior: data.exterior ?? null,
        calc: { matched, flip, city, input: data, verdict } as any,
        ai_analysis: aiAnalysis as any,
      })
      .select("id")
      .single();

    if (insertError || !inserted) throw new Error(insertError?.message ?? "Insertion échouée");

    // Le quota est déjà incrémenté atomiquement par consume_analysis_quota.
    void used;

    return { id: inserted.id as string };
  });

// ---------------- getAnalysis ----------------
export const getAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("analyses")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("Analyse introuvable");
    return row;
  });

// ---------------- listAnalyses ----------------
export const listAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("analyses")
      .select(
        "id, city_name, property_type, surface_sqm, purchase_price, user_profile, calc, ai_analysis, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => {
      const ranked = r.calc?.matched?.ranked ?? [];
      const winnerKey = r.ai_analysis?.winnerStrategy as string | undefined;
      const winner = ranked.find((s: any) => s.strategy === winnerKey) ?? ranked[0] ?? null;
      return {
        id: r.id as string,
        cityName: r.city_name as string,
        propertyType: r.property_type as string | null,
        surfaceM2: Number(r.surface_sqm),
        price: Number(r.purchase_price),
        objective: r.user_profile as string,
        createdAt: r.created_at as string,
        winnerStrategy: winnerKey ?? winner?.strategy ?? null,
        monthlyCashflow: winner?.monthlyNetCashflow ?? null,
        netYieldPct: winner?.netYieldPct ?? null,
      };
    });
  });

// ---------------- deleteAnalysis ----------------
export const deleteAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("analyses")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- getCities ----------------
export const getCities = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);
  const { data: rows, error } = await supabase
    .from("city_data")
    .select("city_name")
    .order("city_name");
  if (error) throw new Error(error.message);
  return (rows ?? []).map((r: any) => r.city_name as string);
});

// ---------------- getCityData ----------------
// Renvoie les indicateurs de marché pour pré-remplir le formulaire.
export const getCityData = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ cityName: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);
    const { data: row } = await supabase
      .from("city_data")
      .select(
        "city_name, rent_sqm_furnished, rent_sqm_unfurnished, price_sqm_avg, adr_studio, adr_t2, adr_t3, occupancy_rate, rent_room_coliving, regulation_level, regulation_notes",
      )
      .ilike("city_name", data.cityName)
      .maybeSingle();
    if (!row) return null;
    return {
      cityName: row.city_name as string,
      rentSqmFurnished: row.rent_sqm_furnished == null ? null : Number(row.rent_sqm_furnished),
      rentSqmUnfurnished:
        row.rent_sqm_unfurnished == null ? null : Number(row.rent_sqm_unfurnished),
      priceSqmAvg: row.price_sqm_avg == null ? null : Number(row.price_sqm_avg),
      adrStudio: row.adr_studio == null ? null : Number(row.adr_studio),
      adrT2: row.adr_t2 == null ? null : Number(row.adr_t2),
      adrT3: row.adr_t3 == null ? null : Number(row.adr_t3),
      occupancyRate: row.occupancy_rate == null ? null : Number(row.occupancy_rate),
      rentRoomColiving: row.rent_room_coliving == null ? null : Number(row.rent_room_coliving),
      regulationLevel: row.regulation_level as string | null,
      regulationNotes: row.regulation_notes as string | null,
    };
  });

// ---------------- requestCity ----------------
// L'utilisateur signale une ville absente de la base.
export const requestCity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cityName: z.string().min(2).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("city_requests").insert({
      user_id: userId,
      city_name: data.cityName.trim(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- getQuota ----------------
export const getQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, analyses_used_this_month, quota_reset_at")
      .eq("id", userId)
      .single();
    const plan = (profile?.plan ?? "free") as string;
    const used = profile?.analyses_used_this_month ?? 0;
    const limit = PLAN_QUOTAS[plan] ?? 3;
    // Si la date de reset est dépassée, l'UI doit montrer le quota déjà rafraîchi
    // (la base se mettra à jour au prochain appel à consume_analysis_quota).
    const resetAt = profile?.quota_reset_at ?? null;
    const expired = resetAt ? new Date(resetAt) <= new Date() : false;
    const usedEff = expired ? 0 : used;
    return { plan, used: usedEff, limit, remaining: Math.max(0, limit - usedEff), resetAt };
  });

// ---------------- IA arbitre ----------------
async function callAiArbiter(args: {
  matched: ReturnType<typeof matchStrategies>;
  city: ReturnType<typeof cityRegulationFromRow>;
  data: AnalysisInputT;
  flip: ReturnType<typeof calcFlip> | null;
}) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    return fallbackArbiter(args);
  }

  try {
    const { generateText, Output } = await import("ai");
    const { z: zod } = await import("zod");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const summary = args.matched.strategies.map((s) => ({
      strategy: s.strategy,
      eligible: s.eligible,
      blockedReason: s.blockedReason,
      monthlyCashflow: s.monthlyNetCashflow,
      netYield: s.netYieldPct,
      taxRegime: s.taxRegime,
      score: s.score,
      regWarnings: s.regulatoryWarnings,
    }));

    const prompt = `Tu es un arbitre d'investissement immobilier. Tu NE CALCULES JAMAIS — les chiffres sont fixés par le moteur déterministe ci-dessous.
Ta mission : choisir la stratégie gagnante, expliquer pourquoi, lister forces et risques, donner des recommandations concrètes.

Contexte utilisateur :
- Ville : ${args.city.city_name} (Loi Le Meur : ${args.city.loi_le_meur})
- Bien : ${args.data.surfaceM2}m², ${args.data.rooms} pièces, ${args.data.price.toLocaleString("fr-FR")} €
- Profil : objectif=${args.data.objective}, effort=${args.data.effort}, TMI=${Math.round(args.data.tmi * 100)}%

Stratégies (déjà calculées, déjà scorées) :
${JSON.stringify(summary, null, 2)}

${args.matched.regulatoryBanner ? `Bandeau réglementaire : [${args.matched.regulatoryBanner.level}] ${args.matched.regulatoryBanner.message}` : ""}

${args.flip ? `Encart flip (achat-revente) : marge nette ${args.flip.netMargin}€, alertes : ${args.flip.warnings.join(" | ")}` : ""}

Règles :
1. Tu peux choisir une stratégie qui n'a PAS le score le plus haut si l'objectif/effort/contexte le justifie — explique alors pourquoi.
2. Si TOUTES les stratégies sont médiocres (cashflow tous négatifs, rendement < 4%), tu peux RECOMMANDER DE NE PAS ACHETER : winnerStrategy="aucune", rationale explicite.
3. Sois concis, factuel, jamais marketing. Cite les chiffres du moteur.
4. Forces/risques/recommandations : 2-4 items chacun, max 200 caractères.

IMPORTANT — la réponse JSON DOIT contenir EXACTEMENT ces clés (pas de variantes) :
"winnerStrategy" (string), "rationale" (string), "forces" (array de string — PAS "strengths"), "risks" (array de string), "recommendations" (array de string).`;

    const { experimental_output: out } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      experimental_output: Output.object({
        schema: zod
          .object({
            winnerStrategy: zod.string(),
            rationale: zod.string(),
            forces: zod.array(zod.string()).max(5).optional().default([]),
            strengths: zod.array(zod.string()).max(5).optional(),
            risks: zod.array(zod.string()).max(5).optional().default([]),
            recommendations: zod.array(zod.string()).max(5).optional().default([]),
          })
          .passthrough(),
      }),
      prompt,
    });

    return {
      winnerStrategy: out.winnerStrategy,
      rationale: out.rationale,
      forces: (out.forces && out.forces.length ? out.forces : out.strengths) ?? [],
      risks: out.risks ?? [],
      recommendations: out.recommendations ?? [],
    };
  } catch (e) {
    console.error("AI arbiter failed, using fallback", e);
    return fallbackArbiter(args);
  }
}

function fallbackArbiter(args: {
  matched: ReturnType<typeof matchStrategies>;
  flip: ReturnType<typeof calcFlip> | null;
}) {
  const top = args.matched.ranked[0];
  if (!top) {
    return {
      winnerStrategy: "aucune",
      rationale: "Aucune stratégie n'est éligible avec les données fournies.",
      forces: [],
      risks: ["Toutes les stratégies écartées — revoir les hypothèses de loyer/charges."],
      recommendations: [
        "Compléter les loyers de marché (nu, meublé, ou Airbnb) pour activer au moins une stratégie.",
      ],
    };
  }
  return {
    winnerStrategy: top.strategy,
    rationale: `Stratégie ${top.strategy} en tête avec un cashflow de ${top.monthlyNetCashflow}€/mois et un rendement net de ${top.netYieldPct}%.`,
    forces: top.scoreReasons.slice(0, 3),
    risks: top.notes.filter((n) => n.startsWith("⚠️")),
    recommendations: [
      "Faire valider les hypothèses de loyer auprès de 2-3 agences locales avant signature.",
    ],
  };
}
