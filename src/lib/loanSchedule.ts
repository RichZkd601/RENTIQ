/**
 * RentIQ — Amortissement de prêt (déterministe).
 *
 * Brique du cockpit patrimonial (V2) et des recommandations (V4) :
 *  - capital restant dû à une date donnée → "dette restante" du dashboard ;
 *  - capital déjà remboursé → part dans la valeur nette ;
 *  - capacité de refinancement → recommandation automatique.
 *
 * Pur, sans I/O, sans dépendance au LLM. Couvert par loanSchedule.test.ts.
 * Réutilise `monthlyPayment` du moteur de calcul pour rester cohérent.
 */
import { monthlyPayment } from "./calculator";

export interface LoanTerms {
  /** Capital emprunté à l'origine. */
  principal: number;
  /** Taux nominal annuel (0.035 = 3,5 %). */
  rateAPR: number;
  /** Durée initiale en années. */
  durationYears: number;
  /** Date de déblocage des fonds (ISO ou Date). */
  startDate: string | Date;
}

export interface AmortizationState {
  /** Mois écoulés depuis le début du prêt (borné à la durée totale). */
  monthsElapsed: number;
  /** Mensualité hors assurance. */
  monthlyPayment: number;
  /** Capital restant dû à la date d'observation. */
  remainingBalance: number;
  /** Capital déjà amorti. */
  principalPaid: number;
  /** Intérêts déjà versés (cumulés). */
  interestPaid: number;
  /** Mois restants avant solde du prêt. */
  monthsRemaining: number;
}

const MS_PER_DAY = 86_400_000;

/** Nombre de mensualités pleines écoulées entre deux dates. */
export function monthsBetween(start: string | Date, asOf: string | Date): number {
  const s = new Date(start);
  const a = new Date(asOf);
  if (Number.isNaN(s.getTime()) || Number.isNaN(a.getTime())) return 0;
  if (a <= s) return 0;
  let months = (a.getFullYear() - s.getFullYear()) * 12 + (a.getMonth() - s.getMonth());
  // Si le jour du mois n'est pas encore atteint, la mensualité du mois courant n'est pas due.
  if (a.getDate() < s.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Capital restant dû après `k` mensualités d'un prêt amortissable classique.
 * Formule fermée : B_k = P·(1+r)^k − M·((1+r)^k − 1)/r.
 */
export function remainingBalanceAfter(
  principal: number,
  rateAPR: number,
  durationYears: number,
  monthsElapsed: number,
): number {
  if (principal <= 0 || durationYears <= 0) return 0;
  const n = durationYears * 12;
  const k = Math.max(0, Math.min(monthsElapsed, n));
  const m = monthlyPayment(principal, rateAPR, durationYears);
  const r = rateAPR / 12;
  if (r === 0) return Math.max(0, principal - m * k);
  const growth = Math.pow(1 + r, k);
  const balance = principal * growth - m * ((growth - 1) / r);
  return Math.max(0, Math.round(balance));
}

/** État d'amortissement complet à une date d'observation. */
export function amortizationStateAt(terms: LoanTerms, asOf: string | Date = new Date()): AmortizationState {
  const n = terms.durationYears * 12;
  const m = monthlyPayment(terms.principal, terms.rateAPR, terms.durationYears);
  const elapsed = Math.min(monthsBetween(terms.startDate, asOf), n);
  const remaining = remainingBalanceAfter(terms.principal, terms.rateAPR, terms.durationYears, elapsed);
  const principalPaid = Math.max(0, Math.round(terms.principal - remaining));
  const interestPaid = Math.max(0, Math.round(m * elapsed - principalPaid));
  return {
    monthsElapsed: elapsed,
    monthlyPayment: Math.round(m),
    remainingBalance: remaining,
    principalPaid,
    interestPaid,
    monthsRemaining: Math.max(0, n - elapsed),
  };
}

export interface RefinancingAssessment {
  /** Une opportunité de refinancement est-elle pertinente ? */
  worthwhile: boolean;
  /** Capital restant dû actuel. */
  currentBalance: number;
  /** Mensualité actuelle (hors assurance). */
  currentMonthlyPayment: number;
  /** Nouvelle mensualité au taux de marché sur la durée résiduelle. */
  newMonthlyPayment: number;
  /** Économie mensuelle (positive = gain). */
  monthlySaving: number;
  /**
   * Capacité d'emprunt débloquée par l'equity (valeur − dette), estimée
   * à 80 % de LTV sur la nouvelle valeur, nette de la dette actuelle.
   */
  unlockedBorrowingCapacity: number;
}

/**
 * Évalue un refinancement : gain de mensualité si le taux de marché est plus
 * bas, et capacité d'emprunt débloquée par la plus-value latente.
 */
export function assessRefinancing(args: {
  terms: LoanTerms;
  marketRateAPR: number;
  currentValue: number;
  asOf?: string | Date;
  /** LTV cible d'un nouveau financement (défaut 0,8). */
  targetLtv?: number;
  /** Seuil de gain mensuel pour juger le refi pertinent (défaut 30 €). */
  savingThreshold?: number;
}): RefinancingAssessment {
  const asOf = args.asOf ?? new Date();
  const ltv = args.targetLtv ?? 0.8;
  const threshold = args.savingThreshold ?? 30;
  const state = amortizationStateAt(args.terms, asOf);
  const yearsRemaining = state.monthsRemaining / 12;

  const newMonthly = yearsRemaining > 0
    ? monthlyPayment(state.remainingBalance, args.marketRateAPR, yearsRemaining)
    : 0;
  const monthlySaving = Math.round(state.monthlyPayment - newMonthly);

  const unlocked = Math.max(0, Math.round(args.currentValue * ltv - state.remainingBalance));

  return {
    worthwhile: monthlySaving >= threshold || unlocked >= 10_000,
    currentBalance: state.remainingBalance,
    currentMonthlyPayment: state.monthlyPayment,
    newMonthlyPayment: Math.round(newMonthly),
    monthlySaving,
    unlockedBorrowingCapacity: unlocked,
  };
}

/** Âge du prêt en mois — utilitaire pour les règles métier. */
export function loanAgeMonths(startDate: string | Date, asOf: string | Date = new Date()): number {
  return Math.round((new Date(asOf).getTime() - new Date(startDate).getTime()) / (MS_PER_DAY * 30.4375));
}
