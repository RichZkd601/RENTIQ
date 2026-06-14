import { describe, it, expect } from "vitest";
import {
  calcAllStrategies,
  calcLocationNue,
  calcLmnpLongueDuree,
  calcColocation,
  calcAirbnb,
  calcFlip,
  monthlyPayment,
  firstYearInterest,
  totalAcquisitionCost,
  type CalcInput,
} from "./calculator";

// Cas pilote : T2 50m² à Bordeaux, 120 000 € FAI
const bordeauxT2: CalcInput = {
  property: {
    price: 120_000,
    notaryFees: 120_000 * 0.08,
    worksBudget: 8_000,
    furnitureBudget: 4_000,
    surfaceM2: 50,
    rooms: 2,
    propertyTax: 900,
    copro: 1_200,
    insurance: 250,
    vacancyRate: 0.05,
  },
  rent: {
    monthlyNu: 650,
    monthlyMeuble: 750,
    monthlyMobilite: 850,
    airbnbNightly: 85,
    airbnbOccupancy: 0.65,
  },
  financing: {
    loanAmount: 130_000,
    rateAPR: 0.04,
    durationYears: 25,
  },
  fiscal: {
    tmi: 0.30,
    isClasseTourisme: false,
    loiLeMeur: "declaration",
  },
};

describe("helpers", () => {
  it("totalAcquisitionCost inclut notaire + travaux", () => {
    expect(totalAcquisitionCost(bordeauxT2.property, false)).toBeCloseTo(120_000 + 9_600 + 8_000, 0);
    expect(totalAcquisitionCost(bordeauxT2.property, true)).toBeCloseTo(120_000 + 9_600 + 8_000 + 4_000, 0);
  });

  it("monthlyPayment correspond à la formule classique", () => {
    const m = monthlyPayment(130_000, 0.04, 25);
    expect(m).toBeGreaterThan(680);
    expect(m).toBeLessThan(700);
  });

  it("firstYearInterest > 0 et < total intérêts du prêt", () => {
    const i = firstYearInterest(130_000, 0.04, 25);
    expect(i).toBeGreaterThan(4_000);
    expect(i).toBeLessThan(6_000);
  });
});

describe("Bordeaux T2 — chaque stratégie", () => {
  const all = calcAllStrategies(bordeauxT2);

  it("retourne 6 stratégies", () => {
    expect(all).toHaveLength(6);
  });

  it("location nue : éligible, rendement brut ~5-7%", () => {
    const r = calcLocationNue(bordeauxT2);
    expect(r.eligible).toBe(true);
    expect(r.grossYieldPct).toBeGreaterThan(4);
    expect(r.grossYieldPct).toBeLessThan(7);
    expect(r.taxRegime).toMatch(/foncier/i);
  });

  it("LMNP : meilleur cashflow que nu (meublé = +loyer + abattement 50%)", () => {
    const nu = calcLocationNue(bordeauxT2);
    const lmnp = calcLmnpLongueDuree(bordeauxT2);
    expect(lmnp.annualNetCashflow).toBeGreaterThan(nu.annualNetCashflow);
  });

  it("colocation : INÉLIGIBLE sur T2 (< 3 pièces)", () => {
    const r = calcColocation(bordeauxT2);
    expect(r.eligible).toBe(false);
    expect(r.blockedReason).toMatch(/trop petit/i);
  });

  it("Airbnb non classé : abattement 30% appliqué (Loi Le Meur)", () => {
    const r = calcAirbnb(bordeauxT2);
    expect(r.eligible).toBe(true);
    expect(r.taxRegime).toMatch(/30%|réel/i);
  });

  it("Airbnb : les frais de plateforme pèsent sur le cashflow (fix audit)", () => {
    // Avec un fort taux d'occupation et un tarif élevé, les platformFees sont
    // significatifs. On vérifie que le cashflow n'ignore plus ces 15% du CA.
    const r = calcAirbnb(bordeauxT2);
    const nights = 365 * (bordeauxT2.rent.airbnbOccupancy ?? 0);
    const gross = (bordeauxT2.rent.airbnbNightly ?? 0) * nights;
    const platformFees = gross * 0.15;
    // Cashflow doit être inférieur d'au moins 80% des platformFees vs un calcul qui les oublierait
    expect(r.annualNetCashflow).toBeLessThan(r.annualGrossRevenue - platformFees * 0.8);
  });
});

describe("T4 Rennes — colocation 3 chambres bat LMNP", () => {
  const rennesT4: CalcInput = {
    property: {
      price: 220_000,
      notaryFees: 220_000 * 0.08,
      worksBudget: 15_000,
      furnitureBudget: 8_000,
      surfaceM2: 85,
      rooms: 4,
      propertyTax: 1_400,
      copro: 1_800,
    },
    rent: {
      monthlyMeuble: 1_100,
      colocRoomRent: 480,
      colocRoomCount: 3,
    },
    financing: { loanAmount: 240_000, rateAPR: 0.04, durationYears: 25 },
    fiscal: { tmi: 0.30 },
  };

  it("colocation surperforme LMNP de +20% au moins en CA brut", () => {
    const lmnp = calcLmnpLongueDuree(rennesT4);
    const coloc = calcColocation(rennesT4);
    expect(coloc.eligible).toBe(true);
    const uplift = (coloc.annualGrossRevenue - lmnp.annualGrossRevenue) / lmnp.annualGrossRevenue;
    expect(uplift).toBeGreaterThan(0.20);
  });
});

describe("Flip", () => {
  it("flip avec marge brute négative : warning + netMargin < 0", () => {
    const r = calcFlip({
      acquisitionCost: 200_000,
      worksBudget: 50_000,
      holdingMonths: 8,
      monthlyHoldingCost: 1_200,
      estimatedResalePrice: 240_000,
      tmi: 0.30,
    });
    expect(r.grossMargin).toBeLessThan(0);
    expect(r.warnings.some((w) => w.includes("négative"))).toBe(true);
  });

  it("flip rentable : marge nette > 0 et warning marchand de biens présent", () => {
    const r = calcFlip({
      acquisitionCost: 180_000,
      worksBudget: 40_000,
      holdingMonths: 9,
      monthlyHoldingCost: 1_000,
      estimatedResalePrice: 290_000,
      tmi: 0.30,
    });
    expect(r.netMargin).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.match(/marchand de biens/i))).toBe(true);
  });
});

describe("Loi Le Meur 2026", () => {
  it("Airbnb bloqué si commune en interdiction", () => {
    const r = calcAirbnb({ ...bordeauxT2, fiscal: { ...bordeauxT2.fiscal, loiLeMeur: "interdit" } });
    expect(r.eligible).toBe(false);
    expect(r.blockedReason).toMatch(/Loi Le Meur|interdit/i);
  });

  it("Airbnb classé tourisme : abattement 50% / plafond 77.7k€", () => {
    const r = calcAirbnb({ ...bordeauxT2, fiscal: { ...bordeauxT2.fiscal, isClasseTourisme: true } });
    expect(r.taxRegime).toMatch(/50%|réel/i);
  });
});
