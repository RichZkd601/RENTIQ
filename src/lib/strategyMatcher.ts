/**
 * RentIQ — Matcher d'éligibilité (Lot 3)
 *
 * Filtre déterministe AVANT l'IA. Toute stratégie écartée doit l'être avec
 * une raison explicite — jamais cachée. L'IA ne voit que des cas viables
 * pour le classement, mais l'UI affiche TOUTES les stratégies (incluant
 * les écartées avec leur `blockedReason`).
 */

import {
  calcAllStrategies,
  type CalcInput,
  type StrategyResult,
  type StrategyKey,
  type LoiLeMeurStatus,
} from "./calculator";

export type UserObjective = "cashflow" | "patrimoine" | "equilibre" | "defisc";
export type EffortLevel = "passif" | "modere" | "actif";

export interface CityRegulation {
  city_name: string;
  loi_le_meur: LoiLeMeurStatus;        // dérivé de city_data.regulation_level / change_usage_required
  compensation_required: boolean;
  primary_residence_cap?: number;       // jours/an en résidence principale (défaut 120, peut être 90)
  change_usage_required: boolean;       // changement d'usage (Paris, Lyon, etc.)
  notes?: string;
}

export interface MatcherInput {
  calc: CalcInput;
  objective: UserObjective;
  effort: EffortLevel;
  city: CityRegulation;
}

export interface EnrichedStrategy extends StrategyResult {
  /** Score interne 0-100 utilisé pour le tri local (l'IA peut le surcharger). */
  score: number;
  /** Raisons qui ont augmenté le score (transparence). */
  scoreReasons: string[];
  /** Avertissements réglementaires ajoutés par le matcher. */
  regulatoryWarnings: string[];
}

export interface MatcherResult {
  /** Toutes les stratégies, éligibles et bloquées, dans l'ordre d'affichage. */
  strategies: EnrichedStrategy[];
  /** Sous-ensemble éligible trié par score décroissant. */
  ranked: EnrichedStrategy[];
  /** Bandeau réglementaire à afficher en tête de l'analyse. */
  regulatoryBanner: {
    level: "info" | "warning" | "danger";
    message: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Conversion city_data -> CityRegulation
// ---------------------------------------------------------------------------

export function cityRegulationFromRow(row: {
  city_name: string;
  regulation_level?: string | null;
  change_usage_required?: boolean | null;
  compensation_required?: boolean | null;
  primary_residence_cap?: number | null;
  quota_zones?: boolean | null;
  regulation_notes?: string | null;
}): CityRegulation {
  // Mapping niveaux → statut Loi Le Meur
  let llm: LoiLeMeurStatus = "declaration";
  const lvl = (row.regulation_level ?? "").toLowerCase();
  if (lvl.includes("interdit")) llm = "interdit";
  else if (row.change_usage_required || row.compensation_required) llm = "compensation";
  else if (row.quota_zones) llm = "quota";
  else if (lvl.includes("libre") || lvl === "" || lvl === "faible") llm = "libre";

  return {
    city_name: row.city_name,
    loi_le_meur: llm,
    compensation_required: !!row.compensation_required,
    change_usage_required: !!row.change_usage_required,
    primary_residence_cap: row.primary_residence_cap ?? 120,
    notes: row.regulation_notes ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Scoring : pondération selon objectif × effort
// ---------------------------------------------------------------------------

const EFFORT_BY_STRATEGY: Record<StrategyKey, EffortLevel> = {
  location_nue: "passif",
  lmnp_longue_duree: "passif",
  bail_mobilite: "modere",
  colocation: "modere",
  coliving: "actif",
  airbnb: "actif",
};

/** Pondérations 0-1 sur (cashflow, net yield, tax efficiency). */
const WEIGHTS: Record<UserObjective, { cashflow: number; yield: number; tax: number; risk: number }> = {
  cashflow:   { cashflow: 0.55, yield: 0.25, tax: 0.10, risk: 0.10 },
  patrimoine: { cashflow: 0.15, yield: 0.30, tax: 0.25, risk: 0.30 },
  equilibre:  { cashflow: 0.35, yield: 0.30, tax: 0.20, risk: 0.15 },
  defisc:     { cashflow: 0.15, yield: 0.15, tax: 0.55, risk: 0.15 },
};

const EFFORT_PENALTY: Record<EffortLevel, Record<EffortLevel, number>> = {
  passif: { passif: 0,  modere: -10, actif: -25 },
  modere: { passif: 0,  modere: 0,   actif: -10 },
  actif:  { passif: 0,  modere: 0,   actif: 0  },
};

function scoreStrategy(s: StrategyResult, objective: UserObjective, userEffort: EffortLevel): { score: number; reasons: string[] } {
  if (!s.eligible) return { score: 0, reasons: [] };
  const w = WEIGHTS[objective];
  const reasons: string[] = [];

  // Normalisations grossières (cashflow € → 0-100 ; yield % → 0-100 ; tax efficiency → 0-100)
  const cfScore = Math.max(0, Math.min(100, ((s.monthlyNetCashflow + 500) / 1500) * 100));
  const yScore = Math.max(0, Math.min(100, (s.netYieldPct / 10) * 100));
  const taxScore = s.annualGrossRevenue > 0
    ? Math.max(0, 100 - (s.annualTax / s.annualGrossRevenue) * 200)
    : 50;
  // Risque : inverse du nombre d'avertissements / vacance
  const riskScore = Math.max(0, 100 - (s.notes.filter((n) => n.startsWith("⚠️")).length * 25) - (s.effectiveVacancyRate * 200));

  let score = w.cashflow * cfScore + w.yield * yScore + w.tax * taxScore + w.risk * riskScore;

  if (cfScore > 70) reasons.push(`Cashflow positif solide (${s.monthlyNetCashflow}€/mois)`);
  if (yScore > 70) reasons.push(`Rendement net élevé (${s.netYieldPct}%)`);
  if (taxScore > 80) reasons.push("Fiscalité optimisée");

  // Pénalité d'effort
  const stratEffort = EFFORT_BY_STRATEGY[s.strategy];
  const penalty = EFFORT_PENALTY[userEffort][stratEffort];
  if (penalty < 0) {
    score += penalty;
    reasons.push(`Effort de gestion ${stratEffort} (pénalité ${penalty} pour profil ${userEffort})`);
  }

  return { score: Math.round(Math.max(0, Math.min(100, score))), reasons };
}

// ---------------------------------------------------------------------------
// Surcouche réglementaire : applique la ville sur l'input avant le calc
// ---------------------------------------------------------------------------

function applyCityToCalc(calc: CalcInput, city: CityRegulation): CalcInput {
  return {
    ...calc,
    fiscal: {
      ...calc.fiscal,
      loiLeMeur: city.loi_le_meur,
    },
  };
}

function regulatoryWarningsFor(s: StrategyResult, city: CityRegulation): string[] {
  const out: string[] = [];
  if (s.strategy === "airbnb" && s.eligible) {
    if (city.change_usage_required) out.push(`${city.city_name} impose un changement d'usage pour la location courte durée non-résidence principale.`);
    if (city.compensation_required) out.push("Compensation requise : acquisition de m² commerciaux à transformer en habitation.");
    if (city.primary_residence_cap && city.primary_residence_cap < 120) {
      out.push(`Plafond résidence principale réduit à ${city.primary_residence_cap} jours/an (vs 120 par défaut).`);
    }
  }
  return out;
}

function buildBanner(city: CityRegulation): MatcherResult["regulatoryBanner"] {
  switch (city.loi_le_meur) {
    case "interdit":
      return {
        level: "danger",
        message: `${city.city_name} : location courte durée interdite (hors résidence principale). Airbnb écarté.`,
      };
    case "compensation":
      return {
        level: "warning",
        message: `${city.city_name} : zone tendue avec compensation obligatoire. Location courte durée techniquement possible mais coût d'entrée majeur.`,
      };
    case "quota":
      return {
        level: "warning",
        message: `${city.city_name} : quota communal de numéros d'enregistrement. Vérifier la disponibilité avant tout engagement.`,
      };
    case "declaration":
      return {
        level: "info",
        message: `${city.city_name} : déclaration en mairie obligatoire pour la location meublée touristique.`,
      };
    case "libre":
      return null;
  }
}

// ---------------------------------------------------------------------------
// API principale
// ---------------------------------------------------------------------------

export function matchStrategies(input: MatcherInput): MatcherResult {
  const calcWithCity = applyCityToCalc(input.calc, input.city);
  const raw = calcAllStrategies(calcWithCity);

  const enriched: EnrichedStrategy[] = raw.map((s) => {
    const { score, reasons } = scoreStrategy(s, input.objective, input.effort);
    return {
      ...s,
      score,
      scoreReasons: reasons,
      regulatoryWarnings: regulatoryWarningsFor(s, input.city),
    };
  });

  const ranked = [...enriched]
    .filter((s) => s.eligible)
    .sort((a, b) => b.score - a.score);

  return {
    strategies: enriched,
    ranked,
    regulatoryBanner: buildBanner(input.city),
  };
}
