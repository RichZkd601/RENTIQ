/**
 * RentIQ — Conseiller patrimonial IA (V5), couche déterministe.
 *
 * L'IA ne doit JAMAIS inventer de chiffres. Ce module :
 *  1. construit un contexte structuré à partir des données RÉELLES du
 *     portefeuille (mêmes fonctions pures que le cockpit) ;
 *  2. détecte l'intention de la question ;
 *  3. produit une réponse chiffrée déterministe, qui sert à la fois de
 *     repli (sans clé API) et de socle de faits imposé au LLM.
 *
 * Pur, testable (assistant.test.ts). Le LLM ne fait que reformuler ces faits.
 */
import {
  portfolioSummary,
  rankProperties,
  projectCashflow,
  propertyMetrics,
  type PortfolioProperty,
} from "./portfolio";
import { amortizationStateAt } from "./loanSchedule";

export type AssistantIntent =
  | "borrowing"
  | "projection"
  | "worst"
  | "best"
  | "sell"
  | "tax"
  | "general";

export interface AssistantContext {
  summary: ReturnType<typeof portfolioSummary>;
  /** Capacité d'emprunt indicative débloquée par l'equity (80% LTV − dette). */
  unlockableEquity: number;
  /** Pouvoir d'achat indicatif (equity mobilisable / 20% d'apport). */
  indicativePurchasingPower: number;
  best: { label: string; grossYieldPct: number; monthlyCashflow: number } | null;
  worst: { label: string; grossYieldPct: number; monthlyCashflow: number } | null;
  arbitrageCandidates: string[];
  /** Texte de synthèse injecté au LLM. */
  factSheet: string;
}

const euro = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

/** Détecte l'intention d'une question en français (heuristique robuste). */
export function detectIntent(question: string): AssistantIntent {
  const q = question.toLowerCase();
  if (/(capacit|emprunt|acheter|prochain achat|troisi|3e|3ème|deuxi|2e|nouveau bien|investir encore)/.test(q)) return "borrowing";
  if (/(dans \d+\s*an|à \d+\s*an|projection|d'ici|futur|cashflow.*(\d+)\s*an)/.test(q)) return "projection";
  if (/(moins performant|pire|sous-perform|mauvais bien|faible rendement)/.test(q)) return "worst";
  if (/(vendre|céder|arbitrage|me séparer|revendre)/.test(q)) return "sell";
  if (/(régime|fiscal|impôt|impot|lmnp|réel|reel|micro|défisc|defisc)/.test(q)) return "tax";
  if (/(meilleur|best|plus rentable|top bien)/.test(q)) return "best";
  return "general";
}

/** Construit le contexte du conseiller à partir des biens détenus. */
export function buildPortfolioContext(properties: PortfolioProperty[], asOf: string | Date = new Date()): AssistantContext {
  const owned = properties.filter((p) => (p.status ?? "owned") === "owned");
  const summary = portfolioSummary(owned, asOf);
  const ranking = rankProperties(owned, asOf);
  const labelById = new Map(owned.map((p) => [p.id, p.label]));

  const unlockableEquity = owned.reduce((s, p) => {
    const debt = p.loan ? amortizationStateAt(p.loan, asOf).remainingBalance : 0;
    return s + Math.max(0, p.currentValue * 0.8 - debt);
  }, 0);
  const indicativePurchasingPower = Math.round(unlockableEquity / 0.2);

  const mkRef = (m: ReturnType<typeof propertyMetrics> | null) =>
    m ? { label: labelById.get(m.id) ?? "", grossYieldPct: m.grossYieldPct, monthlyCashflow: m.monthlyCashflow } : null;

  const arbitrage = ranking.toOptimize
    .filter((m) => m.flags.includes("candidat_arbitrage"))
    .map((m) => labelById.get(m.id) ?? "")
    .filter(Boolean);

  const lines = [
    `Patrimoine : ${summary.propertyCount} bien(s), valeur ${euro(summary.totalValue)}, dette ${euro(summary.totalDebt)}, valeur nette ${euro(summary.netWorth)}.`,
    `Cashflow net : ${summary.monthlyCashflow >= 0 ? "+" : ""}${summary.monthlyCashflow} €/mois (${euro(summary.annualCashflow)}/an). Rendement brut moyen ${summary.avgGrossYieldPct}%. LTV ${summary.avgLtvPct}%.`,
    `Equity mobilisable (refi 80% LTV) ≈ ${euro(unlockableEquity)} ; pouvoir d'achat indicatif ≈ ${euro(indicativePurchasingPower)} (apport 20%).`,
    ranking.best ? `Meilleur bien : ${labelById.get(ranking.best.id)} (rendement ${ranking.best.grossYieldPct}%, cashflow ${ranking.best.monthlyCashflow} €/mois).` : "",
    ranking.worst ? `Pire bien : ${labelById.get(ranking.worst.id)} (rendement ${ranking.worst.grossYieldPct}%, cashflow ${ranking.worst.monthlyCashflow} €/mois).` : "",
    `Cashflow projeté à 5 ans (extinction progressive des prêts) ≈ ${euro(projectCashflow(owned, 5, asOf))}/an.`,
    arbitrage.length ? `Candidats à l'arbitrage : ${arbitrage.join(", ")}.` : "",
  ].filter(Boolean);

  return {
    summary,
    unlockableEquity: Math.round(unlockableEquity),
    indicativePurchasingPower,
    best: mkRef(ranking.best),
    worst: mkRef(ranking.worst),
    arbitrageCandidates: arbitrage,
    factSheet: lines.join("\n"),
  };
}

const DISCLAIMER =
  "Estimations indicatives basées sur vos données et la fiscalité 2026 connue. Ne constitue pas un conseil en investissement — validez avec votre banque et un expert-comptable.";

/** Réponse chiffrée déterministe selon l'intention (repli + socle de faits). */
export function answerDeterministic(
  intent: AssistantIntent,
  ctx: AssistantContext,
  projection?: { years: number; annual: number },
): string {
  const s = ctx.summary;
  if (s.propertyCount === 0) {
    return "Votre portefeuille est vide pour l'instant. Ajoutez vos biens dans « Patrimoine » pour que je puisse vous conseiller sur des données réelles.";
  }
  switch (intent) {
    case "borrowing":
      return [
        `Sur la base de votre patrimoine, vous mobilisez environ ${euro(ctx.unlockableEquity)} d'equity (refinancement à 80% de LTV).`,
        `Cela représente un pouvoir d'achat indicatif d'environ ${euro(ctx.indicativePurchasingPower)} (hypothèse 20% d'apport).`,
        `Votre cashflow net actuel est de ${s.monthlyCashflow >= 0 ? "+" : ""}${s.monthlyCashflow} €/mois : ${s.monthlyCashflow >= 0 ? "il soutient une nouvelle mensualité" : "il faudra le redresser avant d'emprunter davantage"}.`,
        DISCLAIMER,
      ].join(" ");
    case "projection": {
      const annual = projection?.annual ?? s.annualCashflow;
      const years = projection?.years ?? 5;
      return `À ${years} ans, en supposant loyers et charges constants et l'extinction progressive de vos crédits, votre cashflow net annuel passerait d'environ ${euro(s.annualCashflow)} à ${euro(annual)}. ${DISCLAIMER}`;
    }
    case "worst":
      return ctx.worst
        ? `Votre bien le moins performant est « ${ctx.worst.label} » : rendement brut ${ctx.worst.grossYieldPct}% et cashflow ${ctx.worst.monthlyCashflow} €/mois. ${ctx.arbitrageCandidates.includes(ctx.worst.label) ? "Sa plus-value latente en fait un candidat à l'arbitrage." : "Une hausse de loyer ou un changement de stratégie peut l'améliorer."} ${DISCLAIMER}`
        : `Avec un seul bien, il n'y a pas de comparaison possible. ${DISCLAIMER}`;
    case "best":
      return ctx.best
        ? `Votre meilleur bien est « ${ctx.best.label} » : rendement brut ${ctx.best.grossYieldPct}% et cashflow ${ctx.best.monthlyCashflow} €/mois. ${DISCLAIMER}`
        : DISCLAIMER;
    case "sell":
      return ctx.arbitrageCandidates.length
        ? `Candidats à un arbitrage (forte plus-value mais rendement faible) : ${ctx.arbitrageCandidates.join(", ")}. Revendre pour réinvestir dans un bien plus rentable mérite une simulation. ${DISCLAIMER}`
        : `Aucun de vos biens ne ressort comme candidat évident à la vente : la plus-value latente ne compense pas un rendement faible nulle part. ${DISCLAIMER}`;
    case "tax":
      return `Votre rendement brut moyen est de ${s.avgGrossYieldPct}% pour un cashflow net de ${s.monthlyCashflow} €/mois. Le moteur RentIQ sélectionne déjà, bien par bien, le régime le plus avantageux (micro vs réel). Sur les biens meublés avec travaux/mobilier, le régime réel BIC et ses amortissements neutralisent souvent l'impôt — à chiffrer avec un expert-comptable. ${DISCLAIMER}`;
    default:
      return `Voici l'état de votre patrimoine : ${s.propertyCount} bien(s), valeur nette ${euro(s.netWorth)}, cashflow ${s.monthlyCashflow >= 0 ? "+" : ""}${s.monthlyCashflow} €/mois, rendement brut moyen ${s.avgGrossYieldPct}%. Posez-moi une question précise (capacité d'achat, bien à optimiser, projection à 5 ans, fiscalité…). ${DISCLAIMER}`;
  }
}
