/**
 * RentIQ — Verdict d'achat (score /100 + décision + prix max conseillé).
 *
 * Pur, déterministe. Aucune dépendance au LLM. Pondération :
 *  - Cashflow mensuel (35%)
 *  - Rendement net (25%)
 *  - Régulation locale (15%)
 *  - Tension locative / vacance (10%)
 *  - Plus-value potentielle (15%) — neutre si donnée absente
 */
import { calcAllStrategies, type CalcInput, type StrategyKey, type StrategyResult } from "./calculator";

export type Decision = "acheter" | "negocier" | "fuir";

export interface VerdictBreakdown {
  cashflow: number;     // 0-100
  yield: number;
  regulation: number;
  tension: number;
  appreciation: number;
}

export interface Verdict {
  score: number;            // 0-100
  decision: Decision;
  emoji: "🟢" | "🟡" | "🔴";
  label: string;            // "Acheter" | "Négocier à X €" | "Fuir"
  reasons: string[];        // 3 bullets max
  maxRecommendedPrice: number | null;
  breakdown: VerdictBreakdown;
}

export interface VerdictContext {
  winner: StrategyResult | null;
  regulationLevel: "libre" | "declaration" | "quota" | "compensation" | "interdit" | null;
  priceSqmAvg?: number | null;     // marché €/m² (optionnel)
  currentPricePerSqm?: number | null;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function scoreCashflow(monthly: number): number {
  // -300€=0 ; 0€=50 ; +500€=100 (linéaire borné)
  return clamp(50 + (monthly / 500) * 50);
}
function scoreYield(netPct: number): number {
  // 2%=0 ; 5%=50 ; 8%+=100
  return clamp(((netPct - 2) / 6) * 100);
}
function scoreRegulation(level: VerdictContext["regulationLevel"], isAirbnb: boolean): number {
  if (!isAirbnb) return 80; // non bloquant pour la stratégie gagnante
  switch (level) {
    case "libre": return 100;
    case "declaration": return 75;
    case "quota": return 50;
    case "compensation": return 30;
    case "interdit": return 0;
    default: return 70;
  }
}
function scoreTension(vacancyRate: number): number {
  // 0% vacance = 100 ; 15%+ = 0
  return clamp(100 - vacancyRate * 700);
}
function scoreAppreciation(currentPpm: number | null | undefined, marketPpm: number | null | undefined): number {
  if (!currentPpm || !marketPpm) return 60; // neutre quand pas de référence
  const ratio = currentPpm / marketPpm;
  // 0.85 et moins = 100 (sous-coté) ; 1.0 = 50 ; 1.20+ = 0 (surcoté)
  if (ratio <= 0.85) return 100;
  if (ratio >= 1.20) return 0;
  return clamp(100 - ((ratio - 0.85) / 0.35) * 100);
}

const WEIGHTS = { cashflow: 0.35, yield: 0.25, regulation: 0.15, tension: 0.10, appreciation: 0.15 };

function buildReasons(b: VerdictBreakdown, winner: StrategyResult | null, ctx: VerdictContext): string[] {
  const out: string[] = [];
  if (!winner) {
    out.push("Aucune stratégie locative éligible avec les hypothèses fournies.");
    return out;
  }
  // Cashflow
  if (winner.monthlyNetCashflow >= 200) out.push(`Cashflow solide : +${winner.monthlyNetCashflow} €/mois après impôts et emprunt.`);
  else if (winner.monthlyNetCashflow >= 0) out.push(`Cashflow à l'équilibre (+${winner.monthlyNetCashflow} €/mois) — peu de marge de sécurité.`);
  else out.push(`Cashflow négatif (${winner.monthlyNetCashflow} €/mois) — effort d'épargne mensuel requis.`);
  // Rendement
  if (winner.netYieldPct >= 5.5) out.push(`Rendement net attractif (${winner.netYieldPct}%).`);
  else if (winner.netYieldPct >= 4) out.push(`Rendement net correct (${winner.netYieldPct}%) mais sans coussin.`);
  else out.push(`Rendement net faible (${winner.netYieldPct}%) au regard du risque locatif.`);
  // Régulation / Marché
  if (b.regulation < 50) out.push("Cadre réglementaire restrictif sur la stratégie choisie (vérifier mairie).");
  else if (b.appreciation >= 80 && ctx.priceSqmAvg) out.push(`Prix au m² (${Math.round((ctx.currentPricePerSqm ?? 0))} €) sous la moyenne marché (${Math.round(ctx.priceSqmAvg)} €) : potentiel de plus-value.`);
  else if (b.appreciation <= 20 && ctx.priceSqmAvg) out.push(`Prix au m² au-dessus du marché — peu de potentiel de plus-value à court terme.`);
  return out.slice(0, 3);
}

export function scoreOnly(winner: StrategyResult | null, ctx: VerdictContext): { score: number; breakdown: VerdictBreakdown } {
  if (!winner) {
    return { score: 0, breakdown: { cashflow: 0, yield: 0, regulation: 0, tension: 0, appreciation: 0 } };
  }
  const isAirbnb = winner.strategy === "airbnb";
  const breakdown: VerdictBreakdown = {
    cashflow: scoreCashflow(winner.monthlyNetCashflow),
    yield: scoreYield(winner.netYieldPct),
    regulation: scoreRegulation(ctx.regulationLevel, isAirbnb),
    tension: scoreTension(winner.effectiveVacancyRate),
    appreciation: scoreAppreciation(ctx.currentPricePerSqm, ctx.priceSqmAvg),
  };
  const score = Math.round(
    WEIGHTS.cashflow * breakdown.cashflow +
    WEIGHTS.yield * breakdown.yield +
    WEIGHTS.regulation * breakdown.regulation +
    WEIGHTS.tension * breakdown.tension +
    WEIGHTS.appreciation * breakdown.appreciation,
  );
  return { score, breakdown };
}

/**
 * Cherche le prix d'achat max où le score reste ≥ 70 ET cashflow ≥ 0 pour la stratégie gagnante.
 * Bisection sur un facteur ∈ [0.4, 1.0] du prix actuel.
 */
export function findMaxRecommendedPrice(args: {
  baseInput: CalcInput;
  winnerStrategy: StrategyKey;
  ctx: VerdictContext;
  rebuildFinancing?: (newPrice: number, baseLoan: number, basePrice: number) => CalcInput["financing"];
}): number | null {
  const basePrice = args.baseInput.property.price;
  const baseLoan = args.baseInput.financing?.loanAmount ?? 0;
  const evalAt = (price: number): { ok: boolean; score: number } => {
    const factor = price / basePrice;
    const input: CalcInput = {
      ...args.baseInput,
      property: {
        ...args.baseInput.property,
        price,
        // notaire ~8% du nouveau prix
        notaryFees: undefined,
      },
      financing: args.rebuildFinancing
        ? args.rebuildFinancing(price, baseLoan, basePrice)
        : args.baseInput.financing
          ? { ...args.baseInput.financing, loanAmount: Math.round(baseLoan * factor) }
          : undefined,
    };
    const all = calcAllStrategies(input);
    const w = all.find((s) => s.strategy === args.winnerStrategy);
    if (!w || !w.eligible) return { ok: false, score: 0 };
    const { score } = scoreOnly(w, {
      ...args.ctx,
      currentPricePerSqm: input.property.surfaceM2 > 0 ? price / input.property.surfaceM2 : null,
    });
    return { ok: w.monthlyNetCashflow >= 0 && score >= 70, score };
  };

  // Si déjà OK au prix actuel : pas de "prix max" à recommander en dessous
  const baseEval = evalAt(basePrice);
  if (baseEval.ok) return basePrice;

  // Bisection : prix max OK ∈ [basePrice*0.4, basePrice]
  let lo = basePrice * 0.4;
  let hi = basePrice;
  // Vérifier qu'il existe un prix OK
  if (!evalAt(lo).ok) return null;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (evalAt(mid).ok) lo = mid;
    else hi = mid;
  }
  return Math.round(lo / 1000) * 1000;
}

export function computeVerdict(args: {
  winner: StrategyResult | null;
  ctx: VerdictContext;
  maxRecommendedPrice: number | null;
  currentPrice: number;
}): Verdict {
  const { score, breakdown } = scoreOnly(args.winner, args.ctx);
  let decision: Decision;
  let emoji: Verdict["emoji"];
  let label: string;
  if (score >= 70) { decision = "acheter"; emoji = "🟢"; label = "Acheter"; }
  else if (score >= 45) {
    decision = "negocier"; emoji = "🟡";
    label = args.maxRecommendedPrice && args.maxRecommendedPrice < args.currentPrice
      ? `Négocier à ${args.maxRecommendedPrice.toLocaleString("fr-FR")} €`
      : "Négocier";
  } else { decision = "fuir"; emoji = "🔴"; label = "Fuir"; }
  return {
    score,
    decision,
    emoji,
    label,
    reasons: buildReasons(breakdown, args.winner, args.ctx),
    maxRecommendedPrice: args.maxRecommendedPrice,
    breakdown,
  };
}
