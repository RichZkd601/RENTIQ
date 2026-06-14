/**
 * RentIQ — Radar d'opportunités (V3).
 *
 * Score déterministe d'une annonce candidate face à un profil investisseur.
 * Le radar surveille les annonces, chaque candidate est passée au moteur de
 * calcul sous la stratégie cible du profil, puis confrontée aux seuils de
 * l'investisseur (budget, cashflow minimum, rendement minimum).
 *
 * Pur, sans I/O, sans LLM. Couvert par opportunityScore.test.ts.
 */
import { calcAllStrategies, type CalcInput, type StrategyKey, type TMI } from "./calculator";

export interface InvestorProfile {
  cityName: string;
  propertyType?: string | null;
  /** Budget maximum d'acquisition (FAI). */
  maxBudget: number;
  /** Stratégie visée par l'investisseur. */
  strategy: StrategyKey;
  /** Cashflow net mensuel minimum exigé (€/mois). */
  minMonthlyCashflow: number;
  /** Rendement net minimum (%) — optionnel. */
  minNetYieldPct?: number | null;
  tmi: TMI;
  /** Hypothèse d'apport (fraction du prix). Défaut 0,1. */
  downPaymentPct?: number;
  /** Taux de crédit supposé. Défaut 0,035. */
  assumedRateAPR?: number;
  /** Durée de crédit supposée (ans). Défaut 20. */
  assumedYears?: number;
}

export interface CandidateListing {
  cityName: string;
  postalCode?: string | null;
  propertyType?: string | null;
  surfaceM2: number;
  rooms: number;
  price: number;
  worksBudget?: number;
  furnitureBudget?: number;
  propertyTax?: number;
  copro?: number;
  monthlyRentNu?: number | null;
  monthlyRentMeuble?: number | null;
  colocRoomRent?: number | null;
  colocRoomCount?: number | null;
  airbnbNightly?: number | null;
  airbnbOccupancy?: number | null;
}

export interface OpportunityResult {
  /** Score de pertinence 0-100. */
  matchScore: number;
  /** Passe tous les seuils durs du profil ? */
  matches: boolean;
  strategy: StrategyKey;
  eligible: boolean;
  monthlyCashflow: number;
  netYieldPct: number;
  reasons: string[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function toCalcInput(profile: InvestorProfile, c: CandidateListing): CalcInput {
  const down = c.price * (profile.downPaymentPct ?? 0.1);
  const loanAmount = Math.max(0, Math.round(c.price - down));
  return {
    property: {
      price: c.price,
      worksBudget: c.worksBudget ?? 0,
      furnitureBudget: c.furnitureBudget ?? 0,
      surfaceM2: c.surfaceM2,
      rooms: c.rooms,
      propertyTax: c.propertyTax ?? Math.round(c.price * 0.004),
      copro: c.copro ?? Math.round(c.surfaceM2 * 25),
    },
    rent: {
      monthlyNu: c.monthlyRentNu ?? undefined,
      monthlyMeuble: c.monthlyRentMeuble ?? (c.monthlyRentNu ? Math.round(c.monthlyRentNu * 1.12) : undefined),
      colocRoomRent: c.colocRoomRent ?? undefined,
      colocRoomCount: c.colocRoomCount ?? undefined,
      airbnbNightly: c.airbnbNightly ?? undefined,
      airbnbOccupancy: c.airbnbOccupancy ?? undefined,
    },
    financing: { loanAmount, rateAPR: profile.assumedRateAPR ?? 0.035, durationYears: profile.assumedYears ?? 20 },
    fiscal: { tmi: profile.tmi },
  };
}

/** Évalue une annonce candidate face à un profil investisseur. */
export function scoreOpportunity(profile: InvestorProfile, c: CandidateListing): OpportunityResult {
  const reasons: string[] = [];
  const all = calcAllStrategies(toCalcInput(profile, c));
  const target = all.find((s) => s.strategy === profile.strategy);

  const overBudget = c.price > profile.maxBudget;
  if (overBudget) reasons.push(`Prix ${c.price.toLocaleString("fr-FR")} € au-dessus du budget (${profile.maxBudget.toLocaleString("fr-FR")} €).`);

  if (!target || !target.eligible) {
    return {
      matchScore: 0,
      matches: false,
      strategy: profile.strategy,
      eligible: false,
      monthlyCashflow: 0,
      netYieldPct: 0,
      reasons: [target?.blockedReason ?? "Stratégie cible non éligible avec les données fournies.", ...reasons],
    };
  }

  const cf = target.monthlyNetCashflow;
  const ny = target.netYieldPct;
  const cashflowOk = cf >= profile.minMonthlyCashflow;
  const yieldOk = profile.minNetYieldPct == null || ny >= profile.minNetYieldPct;
  const matches = !overBudget && cashflowOk && yieldOk;

  // Scoring : cashflow vs seuil (40), rendement (30), marge budget (15), éligibilité (15).
  const cashflowScore = clamp(50 + ((cf - profile.minMonthlyCashflow) / 300) * 50);
  const yieldScore = clamp(((ny - 2) / 6) * 100);
  const budgetScore = overBudget ? 0 : clamp(((profile.maxBudget - c.price) / profile.maxBudget) * 100 + 40);
  const matchScore = Math.round(0.4 * cashflowScore + 0.3 * yieldScore + 0.15 * budgetScore + 0.15 * 100);

  if (cf >= profile.minMonthlyCashflow) reasons.push(`Cashflow ${cf >= 0 ? "+" : ""}${cf} €/mois ≥ objectif (${profile.minMonthlyCashflow} €).`);
  else reasons.push(`Cashflow ${cf} €/mois sous l'objectif (${profile.minMonthlyCashflow} €).`);
  reasons.push(`Rendement net ${ny} % (${target.taxRegime}).`);

  return {
    matchScore: overBudget ? Math.min(matchScore, 35) : matchScore,
    matches,
    strategy: profile.strategy,
    eligible: true,
    monthlyCashflow: cf,
    netYieldPct: ny,
    reasons,
  };
}

/** Filtre + classe une liste d'annonces pour un profil (radar quotidien). */
export function rankOpportunities(
  profile: InvestorProfile,
  candidates: CandidateListing[],
  opts: { onlyMatches?: boolean } = {},
): Array<{ candidate: CandidateListing; result: OpportunityResult }> {
  const scored = candidates.map((candidate) => ({ candidate, result: scoreOpportunity(profile, candidate) }));
  const filtered = opts.onlyMatches ? scored.filter((s) => s.result.matches) : scored;
  return filtered.sort((a, b) => b.result.matchScore - a.result.matchScore);
}
