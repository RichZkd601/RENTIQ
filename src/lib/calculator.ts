/**
 * RentIQ — Moteur de calcul déterministe (fiscalité 2026)
 *
 * Règle absolue : ce module est la SEULE source de vérité numérique.
 * L'IA ne calcule jamais — elle classe et commente les résultats produits ici.
 *
 * Toutes les valeurs sont en euros, taux annuels en décimal (0.04 = 4%).
 */

// ---------------------------------------------------------------------------
// Constantes fiscales 2026
// ---------------------------------------------------------------------------

/** Prélèvements sociaux (CSG/CRDS) applicables aux revenus fonciers et BIC non pro. */
export const PRELEVEMENTS_SOCIAUX = 0.172;

/** Loi Le Meur (entrée en vigueur 2025, plein effet 2026). */
export const MICRO_BIC_MEUBLE_TOURISME_NON_CLASSE = {
  abattement: 0.30,
  plafond: 15_000,
} as const;

export const MICRO_BIC_MEUBLE_TOURISME_CLASSE = {
  abattement: 0.50,
  plafond: 77_700,
} as const;

/** Micro-BIC longue durée meublé (LMNP classique). */
export const MICRO_BIC_LONGUE_DUREE = {
  abattement: 0.50,
  plafond: 77_700,
} as const;

/** Micro-foncier (location nue). */
export const MICRO_FONCIER = {
  abattement: 0.30,
  plafond: 15_000,
} as const;

/** Tranches IR 2026 (projection — barème 2025 indexé). */
export const TMI_BRACKETS = [0, 0.11, 0.30, 0.41, 0.45] as const;
export type TMI = (typeof TMI_BRACKETS)[number];

/** Frais de notaire : ancien ~8%, neuf ~3%. */
export const FRAIS_NOTAIRE_ANCIEN = 0.08;
export const FRAIS_NOTAIRE_NEUF = 0.03;

/** Durée d'amortissement LMNP réel (moyenne pondérée bâti+mobilier). */
export const LMNP_AMORTISSEMENT_TAUX_BATI = 1 / 30; // 30 ans
export const LMNP_AMORTISSEMENT_TAUX_MOBILIER = 1 / 7; // 7 ans
export const LMNP_PART_TERRAIN = 0.15; // 15% du prix non amortissable

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StrategyKey =
  | "location_nue"
  | "lmnp_longue_duree"
  | "bail_mobilite"
  | "colocation"
  | "coliving"
  | "airbnb";

export type LoiLeMeurStatus = "interdit" | "compensation" | "quota" | "declaration" | "libre";

export interface PropertyInput {
  price: number;                 // prix FAI hors notaire
  notaryFees?: number;           // défaut: 8%
  worksBudget?: number;          // travaux
  furnitureBudget?: number;      // mobilier (si meublé)
  surfaceM2: number;
  rooms: number;                 // pièces principales (T1=1, T2=2…)
  propertyTax: number;           // taxe foncière annuelle
  copro: number;                 // charges copropriété annuelles non récupérables
  insurance?: number;            // PNO annuelle (défaut: 2.5€/m²)
  vacancyRate?: number;          // défaut: DEFAULT_VACANCY_RATE
  managementFeePct?: number;     // % loyers (défaut 0 — gestion propriétaire)
  landShare?: number;            // part terrain non amortissable (défaut: DEFAULT_LAND_SHARE)
}

export interface RentInput {
  monthlyNu?: number;            // loyer nu marché €/mois
  monthlyMeuble?: number;        // loyer meublé classique €/mois
  monthlyMobilite?: number;      // loyer bail mobilité €/mois (souvent ~ meublé+10-15%)
  colocRoomRent?: number;        // loyer par chambre €/mois
  colocRoomCount?: number;       // nb chambres louables
  colivingRoomRent?: number;     // €/mois par chambre (avec services)
  colivingRoomCount?: number;
  airbnbNightly?: number;        // €/nuit
  airbnbOccupancy?: number;      // taux d'occupation (0-1)
  airbnbCleaningPerStay?: number;// frais ménage refacturés (neutre P&L)
  airbnbAvgStayNights?: number;  // durée moyenne séjour
}

export interface FinancingInput {
  loanAmount: number;
  rateAPR: number;               // taux nominal annuel (0.04 = 4%)
  durationYears: number;
  insuranceRate?: number;        // assurance emprunteur % annuel du capital initial (défaut 0.0036)
}

/** Assurance emprunteur par défaut : 0.36%/an du capital initial. */
export const DEFAULT_LOAN_INSURANCE_RATE = 0.0036;
/** Vacance par défaut longue durée — moyenne nationale honnête. */
export const DEFAULT_VACANCY_RATE = 0.07;
/** Part terrain LMNP par défaut (province). Paris/PACA littoral : 0.25. */
export const DEFAULT_LAND_SHARE = 0.15;

export interface FiscalInput {
  tmi: TMI;
  isClasseTourisme?: boolean;    // pour Airbnb : meublé de tourisme classé ?
  loiLeMeur?: LoiLeMeurStatus;   // contrainte locale (lot 3 affinera)
}

export interface CalcInput {
  property: PropertyInput;
  rent: RentInput;
  financing?: FinancingInput;
  fiscal: FiscalInput;
}

export interface StrategyResult {
  strategy: StrategyKey;
  eligible: boolean;
  blockedReason?: string;

  // Revenus
  annualGrossRevenue: number;
  effectiveVacancyRate: number;

  // Charges d'exploitation (hors fiscalité, hors emprunt)
  annualOperatingCharges: number;

  // Emprunt
  annualMortgagePayment: number;
  annualInterest: number;

  // Fiscalité
  taxRegime: string;
  taxableIncome: number;
  annualTax: number;             // IR + prélèvements sociaux

  // Synthèse
  annualNetCashflow: number;     // après impôt et remboursement
  monthlyNetCashflow: number;
  grossYieldPct: number;         // revenu brut / coût total
  netYieldPct: number;           // (revenu - charges - impôt) / coût total

  notes: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function totalAcquisitionCost(p: PropertyInput, includeFurniture = false): number {
  const notary = p.notaryFees ?? p.price * FRAIS_NOTAIRE_ANCIEN;
  const works = p.worksBudget ?? 0;
  const furniture = includeFurniture ? (p.furnitureBudget ?? 0) : 0;
  return p.price + notary + works + furniture;
}

/** Mensualité d'un prêt amortissable classique. */
export function monthlyPayment(loan: number, rateAPR: number, years: number): number {
  if (loan <= 0 || years <= 0) return 0;
  const n = years * 12;
  const r = rateAPR / 12;
  if (r === 0) return loan / n;
  return (loan * r) / (1 - Math.pow(1 + r, -n));
}

/** Intérêts annuels approximés (1ʳᵉ année — pertinent pour le cashflow d'entrée). */
export function firstYearInterest(loan: number, rateAPR: number, years: number): number {
  if (loan <= 0) return 0;
  const monthly = monthlyPayment(loan, rateAPR, years);
  let balance = loan;
  let interest = 0;
  for (let i = 0; i < 12; i++) {
    const r = rateAPR / 12;
    const intPart = balance * r;
    interest += intPart;
    balance -= monthly - intPart;
  }
  return interest;
}

function pct(n: number): number {
  return Math.round(n * 10000) / 100;
}

// ---------------------------------------------------------------------------
// Fiscalité
// ---------------------------------------------------------------------------

/** IR + PS sur un revenu donné selon le régime. */
function taxFromRegime(args: {
  grossRevenue: number;
  deductibleCharges: number;
  regime: "micro_foncier" | "reel_foncier" | "micro_bic" | "reel_bic" | "micro_bic_tourisme_non_classe" | "micro_bic_tourisme_classe";
  tmi: TMI;
}): { taxable: number; tax: number; regimeLabel: string } {
  const { grossRevenue, deductibleCharges, regime, tmi } = args;
  let taxable = 0;
  let label = "";

  switch (regime) {
    case "micro_foncier": {
      label = "Micro-foncier (abattement 30%)";
      taxable = grossRevenue * (1 - MICRO_FONCIER.abattement);
      break;
    }
    case "reel_foncier": {
      label = "Foncier au réel";
      taxable = Math.max(0, grossRevenue - deductibleCharges);
      break;
    }
    case "micro_bic": {
      label = "Micro-Bénéfices Industriels et Commerciaux (BIC) Location Meublée Non Professionnelle (LMNP) (abattement 50%)";
      taxable = grossRevenue * (1 - MICRO_BIC_LONGUE_DUREE.abattement);
      break;
    }
    case "reel_bic": {
      label = "Location Meublée Non Professionnelle (LMNP) au réel (amortissements)";
      taxable = Math.max(0, grossRevenue - deductibleCharges);
      break;
    }
    case "micro_bic_tourisme_non_classe": {
      label = "Micro-Bénéfices Industriels et Commerciaux (BIC) tourisme non classé (Loi Le Meur : 30% / plafond 15k€)";
      taxable = grossRevenue * (1 - MICRO_BIC_MEUBLE_TOURISME_NON_CLASSE.abattement);
      break;
    }
    case "micro_bic_tourisme_classe": {
      label = "Micro-Bénéfices Industriels et Commerciaux (BIC) tourisme classé (Loi Le Meur : 50% / plafond 77.7k€)";
      taxable = grossRevenue * (1 - MICRO_BIC_MEUBLE_TOURISME_CLASSE.abattement);
      break;
    }
  }

  const ir = taxable * tmi;
  const ps = taxable * PRELEVEMENTS_SOCIAUX;
  return { taxable: Math.round(taxable), tax: Math.round(ir + ps), regimeLabel: label };
}

// ---------------------------------------------------------------------------
// Stratégies
// ---------------------------------------------------------------------------

interface StratCtx {
  costTotal: number;             // coût total avec ou sans mobilier selon le cas
  charges: number;               // charges récurrentes hors emprunt
  mortgage: number;              // mensualités * 12
  interest: number;              // intérêts 1ʳᵉ année
  insurance: number;
  vacancyRate: number;
  mgmtPct: number;
}

function baseCtx(input: CalcInput, includeFurniture: boolean): StratCtx {
  const p = input.property;
  const insurance = p.insurance ?? Math.max(150, Math.round(p.surfaceM2 * 2.5));
  const vacancyRate = p.vacancyRate ?? DEFAULT_VACANCY_RATE;
  const mgmtPct = p.managementFeePct ?? 0;
  const loanInsuranceRate = input.financing?.insuranceRate ?? DEFAULT_LOAN_INSURANCE_RATE;
  const principalPayment = input.financing
    ? monthlyPayment(input.financing.loanAmount, input.financing.rateAPR, input.financing.durationYears) * 12
    : 0;
  const loanInsurance = input.financing ? input.financing.loanAmount * loanInsuranceRate : 0;
  const mortgage = principalPayment + loanInsurance;
  const interest = input.financing
    ? firstYearInterest(input.financing.loanAmount, input.financing.rateAPR, input.financing.durationYears) + loanInsurance
    : 0;
  return {
    costTotal: totalAcquisitionCost(p, includeFurniture),
    charges: p.propertyTax + p.copro + insurance,
    mortgage,
    interest,
    insurance,
    vacancyRate,
    mgmtPct,
  };
}

function lmnpReelAmortissement(p: PropertyInput): number {
  const landShare = p.landShare ?? DEFAULT_LAND_SHARE;
  const bati = p.price * (1 - landShare) * LMNP_AMORTISSEMENT_TAUX_BATI;
  const mob = (p.furnitureBudget ?? 0) * LMNP_AMORTISSEMENT_TAUX_MOBILIER;
  const travaux = (p.worksBudget ?? 0) * LMNP_AMORTISSEMENT_TAUX_BATI;
  return bati + mob + travaux;
}

function buildResult(
  strategy: StrategyKey,
  ctx: StratCtx,
  gross: number,
  effectiveGross: number,
  deductibleCharges: number,
  tax: ReturnType<typeof taxFromRegime>,
  notes: string[],
): StrategyResult {
  const operating = ctx.charges + effectiveGross * ctx.mgmtPct;
  const net = effectiveGross - operating - ctx.mortgage - tax.tax;
  return {
    strategy,
    eligible: true,
    annualGrossRevenue: Math.round(gross),
    effectiveVacancyRate: ctx.vacancyRate,
    annualOperatingCharges: Math.round(operating),
    annualMortgagePayment: Math.round(ctx.mortgage),
    annualInterest: Math.round(ctx.interest),
    taxRegime: tax.regimeLabel,
    taxableIncome: tax.taxable,
    annualTax: tax.tax,
    annualNetCashflow: Math.round(net),
    monthlyNetCashflow: Math.round(net / 12),
    grossYieldPct: pct(gross / ctx.costTotal),
    netYieldPct: pct((effectiveGross - operating - tax.tax) / ctx.costTotal),
    notes,
    _deductibleCharges: deductibleCharges,
  } as StrategyResult & { _deductibleCharges: number };
}

function blocked(strategy: StrategyKey, reason: string): StrategyResult {
  return {
    strategy,
    eligible: false,
    blockedReason: reason,
    annualGrossRevenue: 0,
    effectiveVacancyRate: 0,
    annualOperatingCharges: 0,
    annualMortgagePayment: 0,
    annualInterest: 0,
    taxRegime: "—",
    taxableIncome: 0,
    annualTax: 0,
    annualNetCashflow: 0,
    monthlyNetCashflow: 0,
    grossYieldPct: 0,
    netYieldPct: 0,
    notes: [],
  };
}

// --- Location nue ---
export function calcLocationNue(input: CalcInput): StrategyResult {
  const r = input.rent.monthlyNu;
  if (!r) return blocked("location_nue", "Loyer nu marché non renseigné");
  const ctx = baseCtx(input, false);
  const gross = r * 12;
  const effective = gross * (1 - ctx.vacancyRate);
  const operating = ctx.charges + effective * ctx.mgmtPct;
  // Régime : micro si <= plafond ET pas d'avantage du réel, sinon réel
  const microTax = taxFromRegime({ grossRevenue: effective, deductibleCharges: 0, regime: "micro_foncier", tmi: input.fiscal.tmi });
  const deductible = operating + ctx.interest;
  const reelTax = taxFromRegime({ grossRevenue: effective, deductibleCharges: deductible, regime: "reel_foncier", tmi: input.fiscal.tmi });
  const useReel = effective > MICRO_FONCIER.plafond || reelTax.tax < microTax.tax;
  const tax = useReel ? reelTax : microTax;
  const notes = [
    useReel
      ? "Régime réel choisi automatiquement (charges déductibles supérieures à l'abattement 30%)."
      : "Micro-foncier (abattement 30%) optimal ici.",
  ];
  return buildResult("location_nue", ctx, gross, effective, deductible, tax, notes);
}

// --- LMNP longue durée (meublé classique) ---
export function calcLmnpLongueDuree(input: CalcInput): StrategyResult {
  const r = input.rent.monthlyMeuble;
  if (!r) return blocked("lmnp_longue_duree", "Loyer meublé marché non renseigné");
  const ctx = baseCtx(input, true);
  const gross = r * 12;
  const effective = gross * (1 - ctx.vacancyRate);
  const operating = ctx.charges + effective * ctx.mgmtPct;
  const amort = lmnpReelAmortissement(input.property);
  const microTax = taxFromRegime({ grossRevenue: effective, deductibleCharges: 0, regime: "micro_bic", tmi: input.fiscal.tmi });
  const deductible = operating + ctx.interest + amort;
  const reelTax = taxFromRegime({ grossRevenue: effective, deductibleCharges: deductible, regime: "reel_bic", tmi: input.fiscal.tmi });
  const useReel = effective > MICRO_BIC_LONGUE_DUREE.plafond || reelTax.tax < microTax.tax;
  const tax = useReel ? reelTax : microTax;
  const notes = [
    useReel
      ? `Réel Bénéfices Industriels et Commerciaux (BIC) optimal — amortissements ~${Math.round(amort).toLocaleString("fr-FR")} €/an.`
      : "Micro-Bénéfices Industriels et Commerciaux (BIC) (abattement 50%) suffit ici.",
  ];
  return buildResult("lmnp_longue_duree", ctx, gross, effective, deductible, tax, notes);
}

// --- Bail mobilité (1-10 mois, locataire en mobilité justifiée) ---
export function calcBailMobilite(input: CalcInput): StrategyResult {
  const r = input.rent.monthlyMobilite ?? (input.rent.monthlyMeuble ? input.rent.monthlyMeuble * 1.1 : undefined);
  if (!r) return blocked("bail_mobilite", "Loyer bail mobilité non renseigné");
  const ctx = baseCtx(input, true);
  // Vacance plus élevée par nature (rotation)
  const vac = Math.max(ctx.vacancyRate, 0.1);
  const gross = r * 12;
  const effective = gross * (1 - vac);
  const operating = ctx.charges + effective * ctx.mgmtPct;
  const amort = lmnpReelAmortissement(input.property);
  const microTax = taxFromRegime({ grossRevenue: effective, deductibleCharges: 0, regime: "micro_bic", tmi: input.fiscal.tmi });
  const deductible = operating + ctx.interest + amort;
  const reelTax = taxFromRegime({ grossRevenue: effective, deductibleCharges: deductible, regime: "reel_bic", tmi: input.fiscal.tmi });
  const useReel = effective > MICRO_BIC_LONGUE_DUREE.plafond || reelTax.tax < microTax.tax;
  const tax = useReel ? reelTax : microTax;
  const ctxAdj = { ...ctx, vacancyRate: vac };
  return buildResult("bail_mobilite", ctxAdj, gross, effective, deductible, tax, [
    "Bail mobilité : durée 1-10 mois, locataire en formation/mission/stage. Vacance prudente à 10%.",
    "Pas de dépôt de garantie ; loyer généralement +10-15% vs meublé classique.",
  ]);
}

// --- Colocation meublée ---
export function calcColocation(input: CalcInput): StrategyResult {
  if (input.property.rooms < 3) return blocked("colocation", "Bien trop petit pour une colocation (minimum 3 pièces / 2 chambres).");
  const rc = input.rent.colocRoomCount;
  const rr = input.rent.colocRoomRent;
  if (!rc || !rr) return blocked("colocation", "Chambres / loyer par chambre non renseignés");
  const ctx = baseCtx(input, true);
  const gross = rc * rr * 12;
  const vac = Math.max(ctx.vacancyRate, 0.08);
  const effective = gross * (1 - vac);
  const operating = ctx.charges + effective * ctx.mgmtPct;
  const amort = lmnpReelAmortissement(input.property);
  const microTax = taxFromRegime({ grossRevenue: effective, deductibleCharges: 0, regime: "micro_bic", tmi: input.fiscal.tmi });
  const deductible = operating + ctx.interest + amort;
  const reelTax = taxFromRegime({ grossRevenue: effective, deductibleCharges: deductible, regime: "reel_bic", tmi: input.fiscal.tmi });
  const useReel = effective > MICRO_BIC_LONGUE_DUREE.plafond || reelTax.tax < microTax.tax;
  const tax = useReel ? reelTax : microTax;
  return buildResult("colocation", { ...ctx, vacancyRate: vac }, gross, effective, deductible, tax, [
    `Colocation ${rc} chambres × ${rr} €/mois.`,
    "Rotation locataires plus fréquente — vacance prudente à 8%.",
  ]);
}

// --- Coliving (colocation avec services + mobilier premium) ---
export function calcColiving(input: CalcInput): StrategyResult {
  const rc = input.rent.colivingRoomCount ?? input.rent.colocRoomCount;
  const rr = input.rent.colivingRoomRent;
  if (!rc || !rr) return blocked("coliving", "Chambres coliving / loyer par chambre non renseignés");
  if (input.property.rooms < 3) return blocked("coliving", "Bien trop petit (minimum 3 pièces).");
  const ctx = baseCtx(input, true);
  const gross = rc * rr * 12;
  const vac = Math.max(ctx.vacancyRate, 0.08);
  const effective = gross * (1 - vac);
  // Services (ménage, internet, abonnements) : +15% du loyer en charges
  const services = effective * 0.15;
  const operating = ctx.charges + services + effective * ctx.mgmtPct;
  const amort = lmnpReelAmortissement(input.property);
  const deductible = operating + ctx.interest + amort;
  const tax = taxFromRegime({ grossRevenue: effective, deductibleCharges: deductible, regime: "reel_bic", tmi: input.fiscal.tmi });
  return buildResult("coliving", { ...ctx, vacancyRate: vac, charges: ctx.charges + services }, gross, effective, deductible, tax, [
    "Coliving = colocation + services (ménage, internet, mobilier premium). Charges +15% du CA.",
    "Réel Bénéfices Industriels et Commerciaux (BIC) quasi systématique : amortissements + services absorbent les loyers.",
  ]);
}

// --- Airbnb / location courte durée ---
export function calcAirbnb(input: CalcInput): StrategyResult {
  const nightly = input.rent.airbnbNightly;
  const occ = input.rent.airbnbOccupancy;
  if (!nightly || !occ) return blocked("airbnb", "Tarif/nuit ou taux d'occupation non renseigné");

  const llm = input.fiscal.loiLeMeur;
  if (llm === "interdit") {
    return blocked("airbnb", "Location courte durée interdite par la commune (Loi Le Meur — compensation impossible ou quota saturé).");
  }

  const ctx = baseCtx(input, true);
  const nights = 365 * occ;
  const gross = nightly * nights;
  // Conciergerie/plateformes : ~20% du CA si non géré en direct
  const platformFees = gross * 0.15;
  // Ménage : neutre P&L si refacturé, sinon coût
  const operating = ctx.charges + platformFees + gross * ctx.mgmtPct;
  // Régime fiscal Loi Le Meur 2026
  const classe = input.fiscal.isClasseTourisme ?? false;
  const regime = classe ? "micro_bic_tourisme_classe" : "micro_bic_tourisme_non_classe";
  const plafond = classe ? MICRO_BIC_MEUBLE_TOURISME_CLASSE.plafond : MICRO_BIC_MEUBLE_TOURISME_NON_CLASSE.plafond;
  const amort = lmnpReelAmortissement(input.property);
  const microTax = taxFromRegime({ grossRevenue: gross, deductibleCharges: 0, regime, tmi: input.fiscal.tmi });
  const deductible = operating + ctx.interest + amort;
  const reelTax = taxFromRegime({ grossRevenue: gross, deductibleCharges: deductible, regime: "reel_bic", tmi: input.fiscal.tmi });
  const useReel = gross > plafond || reelTax.tax < microTax.tax;
  const tax = useReel ? reelTax : microTax;

  const notes: string[] = [
    `${Math.round(nights)} nuits/an × ${nightly} € = ${Math.round(gross).toLocaleString("fr-FR")} € de CA brut.`,
    "Frais plateformes/conciergerie estimés à 15% du CA.",
  ];
  if (!classe) notes.push("⚠️ Non classé tourisme : abattement micro-Bénéfices Industriels et Commerciaux (BIC) plafonné à 30% / 15k€ (Loi Le Meur 2026).");
  if (classe) notes.push("Classement tourisme : abattement 50% / 77.7k€ — démarche fortement recommandée.");
  if (llm === "compensation") notes.push("⚠️ Commune en zone tendue : compensation requise (acquisition de m² commerciaux à transformer).");
  if (llm === "quota") notes.push("⚠️ Quota communal — vérifier disponibilité d'un n° d'enregistrement.");
  if (llm === "declaration") notes.push("Déclaration en mairie obligatoire avant mise en location.");

  // Fix audit: les frais de plateforme doivent aussi peser sur le cashflow,
  // pas seulement sur la fiscalité (alignement avec calcColiving).
  return buildResult(
    "airbnb",
    { ...ctx, charges: ctx.charges + platformFees },
    gross,
    gross,
    deductible,
    tax,
    notes,
  );
}

// ---------------------------------------------------------------------------
// Flip (achat-revente) — encart séparé, garde-fou marchand de biens
// ---------------------------------------------------------------------------

export interface FlipInput {
  acquisitionCost: number;       // prix + notaire
  worksBudget: number;
  holdingMonths: number;         // durée de portage
  monthlyHoldingCost: number;    // taxe foncière prorata + assurance + intérêts si à crédit
  estimatedResalePrice: number;
  resaleFees?: number;           // agence/diagnostics (~5%)
  tmi: TMI;
  isMarchandDeBiens?: boolean;   // statut pro
}

export interface FlipResult {
  grossMargin: number;
  totalCost: number;
  netCost: number;
  taxableGain: number;
  tax: number;
  netMargin: number;
  marginPct: number;
  warnings: string[];
}

export function calcFlip(input: FlipInput): FlipResult {
  const resaleFees = input.resaleFees ?? input.estimatedResalePrice * 0.05;
  const totalCost = input.acquisitionCost + input.worksBudget + input.monthlyHoldingCost * input.holdingMonths;
  const grossMargin = input.estimatedResalePrice - totalCost - resaleFees;
  // Plus-value des particuliers : abattement progressif, mais < 5 ans = quasi-zéro abattement
  // Simplification 2026 : IR 19% + PS 17.2% = 36.2% si particulier ; sinon IS/IR pro
  const taxRate = input.isMarchandDeBiens ? input.tmi + 0.172 : 0.362;
  const taxable = Math.max(0, grossMargin);
  const tax = taxable * taxRate;
  const netMargin = grossMargin - tax;
  const warnings: string[] = [
    "⚠️ Risque permanent de requalification en marchand de biens (achat dans l'intention de revendre = activité commerciale, Impôt sur les Sociétés (IS) + Taxe sur la Valeur Ajoutée (TVA)).",
    "Le flip n'est PAS une stratégie locative — résultat indicatif à comparer avec prudence.",
  ];
  if (input.holdingMonths < 12) warnings.push("Portage < 12 mois : abattement plus-value nul, fiscalité maximale.");
  if (grossMargin < 0) warnings.push("Marge brute négative — opération à éviter.");
  return {
    grossMargin: Math.round(grossMargin),
    totalCost: Math.round(totalCost),
    netCost: Math.round(totalCost + resaleFees),
    taxableGain: Math.round(taxable),
    tax: Math.round(tax),
    netMargin: Math.round(netMargin),
    marginPct: pct(netMargin / totalCost),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export function calcAllStrategies(input: CalcInput): StrategyResult[] {
  return [
    calcLocationNue(input),
    calcLmnpLongueDuree(input),
    calcBailMobilite(input),
    calcColocation(input),
    calcColiving(input),
    calcAirbnb(input),
  ];
}
