/**
 * RentIQ — Cockpit patrimonial (V2).
 *
 * Agrégation déterministe d'un portefeuille de biens détenus :
 *  - valeur du patrimoine, dette restante, valeur nette ;
 *  - cashflow mensuel / annuel, rendement moyen pondéré ;
 *  - identification automatique du meilleur / pire / sous-performant.
 *
 * Pur, sans I/O. Couvert par portfolio.test.ts. S'appuie sur loanSchedule
 * pour la dette restante (formule fermée d'amortissement).
 */
import { amortizationStateAt, type LoanTerms } from "./loanSchedule";
import type { StrategyKey } from "./calculator";

export type PropertyStatus = "owned" | "prospect" | "sold";

export interface PortfolioProperty {
  id: string;
  label: string;
  cityName: string;
  propertyType?: string | null;
  strategy?: StrategyKey | null;
  /** Prix payé (FAI). */
  purchasePrice: number;
  /** Capital effectivement investi (apport + frais + travaux). Sert au cash-on-cash. */
  capitalInvested?: number | null;
  /** Date d'acquisition (ISO). */
  purchaseDate: string;
  /** Dernière valorisation connue. */
  currentValue: number;
  /** Loyer brut mensuel actuellement perçu. */
  monthlyRentGross: number;
  /** Cashflow net mensuel (après impôt + emprunt) — snapshot du moteur de calcul. */
  monthlyCashflowNet: number;
  /** Financement en cours (null = achat comptant ou prêt soldé). */
  loan?: LoanTerms | null;
  status?: PropertyStatus;
}

export interface PropertyMetrics {
  id: string;
  remainingDebt: number;
  equity: number;
  monthlyCashflow: number;
  annualCashflow: number;
  /** Loyer brut annuel / prix d'achat. */
  grossYieldPct: number;
  /** Cashflow net annuel / capital investi (cash-on-cash). */
  cashOnCashPct: number;
  /** Plus-value latente vs prix d'achat, en %. */
  appreciationPct: number;
  /** Loan-to-value courant : dette / valeur. */
  ltvPct: number;
  /** Score de performance composite 0-100 (tri interne). */
  performanceScore: number;
  /** Drapeaux explicites détectés (sous_performant, cashflow_negatif, …). */
  flags: PropertyFlag[];
}

export type PropertyFlag =
  | "cashflow_negatif"
  | "rendement_faible"
  | "ltv_eleve"
  | "forte_plus_value"
  | "candidat_arbitrage";

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Calcule les métriques d'un bien à une date d'observation. */
export function propertyMetrics(p: PortfolioProperty, asOf: string | Date = new Date()): PropertyMetrics {
  const remainingDebt = p.loan ? amortizationStateAt(p.loan, asOf).remainingBalance : 0;
  const equity = Math.round(p.currentValue - remainingDebt);
  const annualCashflow = Math.round(p.monthlyCashflowNet * 12);
  const annualRentGross = p.monthlyRentGross * 12;
  const capital = p.capitalInvested && p.capitalInvested > 0 ? p.capitalInvested : Math.max(1, equity);

  const grossYieldPct = p.purchasePrice > 0 ? round2((annualRentGross / p.purchasePrice) * 100) : 0;
  const cashOnCashPct = round2((annualCashflow / capital) * 100);
  const appreciationPct = p.purchasePrice > 0 ? round2(((p.currentValue - p.purchasePrice) / p.purchasePrice) * 100) : 0;
  const ltvPct = p.currentValue > 0 ? round2((remainingDebt / p.currentValue) * 100) : 0;

  // Score composite : rendement brut (40), cashflow (35), plus-value (25).
  const yieldScore = clamp((grossYieldPct / 9) * 100);
  const cashflowScore = clamp(50 + (p.monthlyCashflowNet / 400) * 50);
  const apprecScore = clamp(50 + (appreciationPct / 40) * 50);
  const performanceScore = Math.round(0.4 * yieldScore + 0.35 * cashflowScore + 0.25 * apprecScore);

  const flags: PropertyFlag[] = [];
  if (p.monthlyCashflowNet < 0) flags.push("cashflow_negatif");
  if (grossYieldPct < 4.5) flags.push("rendement_faible");
  if (ltvPct > 85) flags.push("ltv_eleve");
  if (appreciationPct >= 20) flags.push("forte_plus_value");
  // Candidat à l'arbitrage : belle plus-value mais rendement médiocre → vendre/réinvestir.
  if (appreciationPct >= 20 && grossYieldPct < 4.5) flags.push("candidat_arbitrage");

  return {
    id: p.id,
    remainingDebt,
    equity,
    monthlyCashflow: Math.round(p.monthlyCashflowNet),
    annualCashflow,
    grossYieldPct,
    cashOnCashPct,
    appreciationPct,
    ltvPct,
    performanceScore,
    flags,
  };
}

export interface PortfolioSummary {
  propertyCount: number;
  totalValue: number;
  totalDebt: number;
  /** Valeur nette = patrimoine − dette. */
  netWorth: number;
  monthlyCashflow: number;
  annualCashflow: number;
  totalMonthlyRentGross: number;
  /** Rendement brut moyen pondéré par la valeur des biens. */
  avgGrossYieldPct: number;
  /** LTV global du portefeuille. */
  avgLtvPct: number;
  /** Taux d'endettement patrimonial (dette / valeur). */
  globalLeveragePct: number;
}

/** Agrège un portefeuille de biens « owned » (les prospects/vendus sont ignorés). */
export function portfolioSummary(properties: PortfolioProperty[], asOf: string | Date = new Date()): PortfolioSummary {
  const owned = properties.filter((p) => (p.status ?? "owned") === "owned");
  const metrics = owned.map((p) => propertyMetrics(p, asOf));

  const totalValue = owned.reduce((s, p) => s + p.currentValue, 0);
  const totalDebt = metrics.reduce((s, m) => s + m.remainingDebt, 0);
  const monthlyCashflow = owned.reduce((s, p) => s + p.monthlyCashflowNet, 0);
  const totalRent = owned.reduce((s, p) => s + p.monthlyRentGross, 0);

  // Rendement brut pondéré par valeur.
  const weightedYield = totalValue > 0
    ? metrics.reduce((s, m, i) => s + m.grossYieldPct * (owned[i].currentValue / totalValue), 0)
    : 0;

  return {
    propertyCount: owned.length,
    totalValue: Math.round(totalValue),
    totalDebt: Math.round(totalDebt),
    netWorth: Math.round(totalValue - totalDebt),
    monthlyCashflow: Math.round(monthlyCashflow),
    annualCashflow: Math.round(monthlyCashflow * 12),
    totalMonthlyRentGross: Math.round(totalRent),
    avgGrossYieldPct: round2(weightedYield),
    avgLtvPct: totalValue > 0 ? round2((totalDebt / totalValue) * 100) : 0,
    globalLeveragePct: totalValue > 0 ? round2((totalDebt / totalValue) * 100) : 0,
  };
}

export interface PortfolioRanking {
  best: PropertyMetrics | null;
  worst: PropertyMetrics | null;
  /** Biens dont le rendement est nettement sous la moyenne du portefeuille. */
  underperforming: PropertyMetrics[];
  /** Biens à fort potentiel d'optimisation (cashflow négatif ou arbitrage). */
  toOptimize: PropertyMetrics[];
}

/**
 * Classe les biens : meilleur / pire par score composite, et détecte
 * sous-performants (rendement < moyenne − 1,5 pt) et candidats à optimiser.
 */
export function rankProperties(properties: PortfolioProperty[], asOf: string | Date = new Date()): PortfolioRanking {
  const owned = properties.filter((p) => (p.status ?? "owned") === "owned");
  if (owned.length === 0) {
    return { best: null, worst: null, underperforming: [], toOptimize: [] };
  }
  const metrics = owned.map((p) => propertyMetrics(p, asOf));
  const sorted = [...metrics].sort((a, b) => b.performanceScore - a.performanceScore);
  const avgYield = metrics.reduce((s, m) => s + m.grossYieldPct, 0) / metrics.length;

  const underperforming = metrics.filter((m) => m.grossYieldPct < avgYield - 1.5 || m.monthlyCashflow < 0);
  const toOptimize = metrics.filter(
    (m) => m.flags.includes("cashflow_negatif") || m.flags.includes("candidat_arbitrage"),
  );

  return {
    best: sorted[0] ?? null,
    worst: sorted.length > 1 ? sorted[sorted.length - 1] : null,
    underperforming,
    toOptimize,
  };
}

/**
 * Projette le cashflow net annuel à N années en supposant l'extinction
 * progressive de la dette (la mensualité disparaît une fois le prêt soldé).
 * Hypothèse prudente : loyers et charges constants en euros courants.
 */
export function projectCashflow(properties: PortfolioProperty[], years: number, from: string | Date = new Date()): number {
  const target = new Date(from);
  target.setFullYear(target.getFullYear() + years);
  const owned = properties.filter((p) => (p.status ?? "owned") === "owned");

  return Math.round(
    owned.reduce((sum, p) => {
      if (!p.loan) return sum + p.monthlyCashflowNet * 12;
      const now = amortizationStateAt(p.loan, from);
      const future = amortizationStateAt(p.loan, target);
      // Si le prêt est soldé d'ici la cible, la mensualité revient au cashflow.
      const paymentFreed = future.monthsRemaining === 0 && now.monthsRemaining > 0 ? now.monthlyPayment : 0;
      return sum + (p.monthlyCashflowNet + paymentFreed) * 12;
    }, 0),
  );
}
