/**
 * RentIQ — Moteur de recommandations automatiques (V4).
 *
 * Analyse déterministe d'un bien détenu (enrichi de données de marché) et
 * détecte les leviers d'optimisation, exactement comme le ferait un conseiller :
 *  - hausse de loyer possible (loyer perçu < loyer de marché) ;
 *  - changement de stratégie rentable (ex : nu → meublé) ;
 *  - refinancement possible (taux ou plus-value) ;
 *  - arbitrage achat/vente (forte PV + faible rendement) ;
 *  - optimisation fiscale (micro vs réel).
 *
 * Pur, sans I/O, sans LLM. Couvert par recommendations.test.ts. Les chiffres
 * proviennent du moteur de calcul ; l'IA ne fait que reformuler ces résultats.
 */
import { calcAllStrategies, type CalcInput, type StrategyKey, type TMI } from "./calculator";
import { assessRefinancing, type LoanTerms } from "./loanSchedule";

export type RecommendationType =
  | "rent_increase"
  | "strategy_switch"
  | "refinancing"
  | "arbitrage_sell"
  | "tax_optimization";

export type Confidence = "haute" | "moyenne" | "faible";

export interface Recommendation {
  type: RecommendationType;
  propertyId: string;
  title: string;
  description: string;
  /** Gain récurrent estimé (€/mois). 0 si non applicable. */
  estimatedMonthlyGain: number;
  /** Gain ou capacité ponctuelle (€), ex : capacité d'emprunt débloquée. */
  estimatedOneOffGain: number;
  confidence: Confidence;
  /** Clé de tri décroissant (plus haut = plus prioritaire). */
  priority: number;
}

const STRATEGY_LABELS: Record<StrategyKey, string> = {
  location_nue: "location nue",
  lmnp_longue_duree: "meublé (LMNP)",
  bail_mobilite: "bail mobilité",
  colocation: "colocation",
  coliving: "coliving",
  airbnb: "courte durée (Airbnb)",
};

export interface RecoMarketContext {
  /** Loyer nu de marché €/mois pour ce bien. */
  marketRentNu?: number | null;
  /** Loyer meublé de marché €/mois. */
  marketRentMeuble?: number | null;
  /** Loyer colocation par chambre €/mois (si applicable). */
  marketColocRoomRent?: number | null;
  /** Nombre de chambres louables en colocation. */
  colocRoomCount?: number | null;
  /** Taux de crédit de marché actuel (refi). */
  marketRateAPR?: number | null;
}

export interface RecoProperty {
  id: string;
  label: string;
  cityName: string;
  strategy: StrategyKey;
  surfaceM2: number;
  rooms: number;
  purchasePrice: number;
  worksBudget?: number;
  furnitureBudget?: number;
  propertyTax: number;
  copro: number;
  tmi: TMI;
  loan?: LoanTerms | null;
  currentValue: number;
  /** Loyer brut mensuel réellement perçu aujourd'hui. */
  currentMonthlyRent: number;
  /** Cashflow net mensuel actuel (snapshot moteur). */
  currentMonthlyCashflowNet: number;
  market: RecoMarketContext;
}

/** Construit un CalcInput à partir du bien + marché pour comparer les stratégies. */
function toCalcInput(p: RecoProperty): CalcInput {
  return {
    property: {
      price: p.purchasePrice,
      worksBudget: p.worksBudget ?? 0,
      furnitureBudget: p.furnitureBudget ?? 0,
      surfaceM2: p.surfaceM2,
      rooms: p.rooms,
      propertyTax: p.propertyTax,
      copro: p.copro,
    },
    rent: {
      monthlyNu: p.market.marketRentNu ?? undefined,
      monthlyMeuble: p.market.marketRentMeuble ?? undefined,
      colocRoomRent: p.market.marketColocRoomRent ?? undefined,
      colocRoomCount: p.market.colocRoomCount ?? undefined,
    },
    financing: p.loan
      ? {
          loanAmount: p.loan.principal,
          rateAPR: p.loan.rateAPR,
          durationYears: p.loan.durationYears,
        }
      : undefined,
    fiscal: { tmi: p.tmi },
  };
}

/** Loyer de marché pertinent pour la stratégie actuelle du bien. */
function marketRentForCurrentStrategy(p: RecoProperty): number | null {
  switch (p.strategy) {
    case "location_nue":
      return p.market.marketRentNu ?? null;
    case "colocation":
    case "coliving":
      return p.market.marketColocRoomRent && p.market.colocRoomCount
        ? p.market.marketColocRoomRent * p.market.colocRoomCount
        : null;
    default:
      return p.market.marketRentMeuble ?? null;
  }
}

/** Génère les recommandations d'un bien, triées par priorité décroissante. */
export function generateRecommendations(
  p: RecoProperty,
  asOf: string | Date = new Date(),
): Recommendation[] {
  const out: Recommendation[] = [];

  // 1. Hausse de loyer ------------------------------------------------------
  const marketRent = marketRentForCurrentStrategy(p);
  if (marketRent && p.currentMonthlyRent > 0 && marketRent > p.currentMonthlyRent * 1.05) {
    const gain = Math.round(marketRent - p.currentMonthlyRent);
    const pctGap = (marketRent - p.currentMonthlyRent) / p.currentMonthlyRent;
    out.push({
      type: "rent_increase",
      propertyId: p.id,
      title: `Loyer sous le marché à ${p.cityName}`,
      description: `Votre loyer (${Math.round(p.currentMonthlyRent)} €) est ${Math.round(pctGap * 100)} % sous le marché (~${Math.round(marketRent)} €). Une révision à la relocation ou indexation IRL peut récupérer ~${gain} €/mois.`,
      estimatedMonthlyGain: gain,
      estimatedOneOffGain: 0,
      confidence: pctGap > 0.12 ? "haute" : "moyenne",
      priority: 60 + gain,
    });
  }

  // 2. Changement de stratégie ---------------------------------------------
  const all = calcAllStrategies(toCalcInput(p));
  const current = all.find((s) => s.strategy === p.strategy && s.eligible);
  const baseline = current?.monthlyNetCashflow ?? p.currentMonthlyCashflowNet;
  const better = all
    .filter((s) => s.eligible && s.strategy !== p.strategy)
    .sort((a, b) => b.monthlyNetCashflow - a.monthlyNetCashflow)[0];
  if (better && better.monthlyNetCashflow - baseline >= 40) {
    const gain = Math.round(better.monthlyNetCashflow - baseline);
    out.push({
      type: "strategy_switch",
      propertyId: p.id,
      title: `Passer en ${STRATEGY_LABELS[better.strategy]} rapporterait davantage`,
      description: `En ${STRATEGY_LABELS[p.strategy]}, ce bien dégage ${Math.round(baseline)} €/mois. En ${STRATEGY_LABELS[better.strategy]}, le moteur estime ${better.monthlyNetCashflow} €/mois (${better.taxRegime}) — soit +${gain} €/mois. À mettre en regard de l'effort de gestion et du cadre local.`,
      estimatedMonthlyGain: gain,
      estimatedOneOffGain: 0,
      confidence: gain >= 120 ? "haute" : "moyenne",
      priority: 70 + gain,
    });
  }

  // 3. Refinancement --------------------------------------------------------
  if (p.loan && p.market.marketRateAPR != null) {
    const refi = assessRefinancing({
      terms: p.loan,
      marketRateAPR: p.market.marketRateAPR,
      currentValue: p.currentValue,
      asOf,
    });
    if (refi.worthwhile) {
      const parts: string[] = [];
      if (refi.monthlySaving >= 30)
        parts.push(`renégocier au taux du marché ferait gagner ~${refi.monthlySaving} €/mois`);
      if (refi.unlockedBorrowingCapacity >= 10_000)
        parts.push(
          `la plus-value latente débloque ~${refi.unlockedBorrowingCapacity.toLocaleString("fr-FR")} € de capacité d'emprunt pour un nouvel achat`,
        );
      out.push({
        type: "refinancing",
        propertyId: p.id,
        title: "Refinancement opportun",
        description: `Sur ce bien, ${parts.join(" ; ")}.`,
        estimatedMonthlyGain: Math.max(0, refi.monthlySaving),
        estimatedOneOffGain: refi.unlockedBorrowingCapacity,
        confidence:
          refi.monthlySaving >= 80 || refi.unlockedBorrowingCapacity >= 30_000
            ? "haute"
            : "moyenne",
        priority: 50 + Math.max(refi.monthlySaving, refi.unlockedBorrowingCapacity / 1000),
      });
    }
  }

  // 4. Arbitrage achat/vente -----------------------------------------------
  const appreciation =
    p.purchasePrice > 0 ? (p.currentValue - p.purchasePrice) / p.purchasePrice : 0;
  const grossYield = p.purchasePrice > 0 ? (p.currentMonthlyRent * 12) / p.purchasePrice : 0;
  if (appreciation >= 0.2 && grossYield < 0.045) {
    const equityGain = Math.round(p.currentValue - p.purchasePrice);
    out.push({
      type: "arbitrage_sell",
      propertyId: p.id,
      title: "Candidat à l'arbitrage",
      description: `Ce bien a pris ~${Math.round(appreciation * 100)} % de valeur (+${equityGain.toLocaleString("fr-FR")} €) mais son rendement brut (${(grossYield * 100).toFixed(1)} %) est faible. Revendre pour réinvestir dans un bien plus rentable mérite une simulation.`,
      estimatedMonthlyGain: 0,
      estimatedOneOffGain: equityGain,
      confidence: "moyenne",
      priority: 40 + appreciation * 100,
    });
  }

  // 5. Optimisation fiscale (régime de la stratégie actuelle) ---------------
  if (
    current &&
    /micro/i.test(current.taxRegime) &&
    (p.market.marketRentMeuble || p.strategy !== "location_nue")
  ) {
    // Le moteur a déjà choisi micro ; on signale seulement si le réel pourrait
    // battre le micro de façon non triviale via amortissements (meublé).
    const reelEligible =
      p.strategy !== "location_nue" && (p.worksBudget ?? 0) + (p.furnitureBudget ?? 0) > 0;
    if (reelEligible) {
      out.push({
        type: "tax_optimization",
        propertyId: p.id,
        title: "Vérifier le régime réel (amortissements)",
        description: `Ce bien est au ${current.taxRegime}. Avec travaux/mobilier amortissables, le régime réel BIC peut neutraliser une partie de l'impôt. À chiffrer avec un expert-comptable.`,
        estimatedMonthlyGain: 0,
        estimatedOneOffGain: 0,
        confidence: "faible",
        priority: 20,
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/** Agrège les recommandations de tout le portefeuille, triées par gain. */
export function generatePortfolioRecommendations(
  properties: RecoProperty[],
  asOf: string | Date = new Date(),
): Recommendation[] {
  return properties
    .flatMap((p) => generateRecommendations(p, asOf))
    .sort((a, b) => b.priority - a.priority);
}
