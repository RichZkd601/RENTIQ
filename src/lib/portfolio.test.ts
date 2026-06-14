import { describe, it, expect } from "vitest";
import {
  propertyMetrics,
  portfolioSummary,
  rankProperties,
  projectCashflow,
  netWorthTimeline,
  type PortfolioProperty,
} from "./portfolio";

const asOf = "2025-01-01";

function mk(
  over: Partial<PortfolioProperty> & { id: string; valuations?: Array<{ date: string; value: number }> },
): PortfolioProperty & { valuations?: Array<{ date: string; value: number }> } {
  return {
    label: "Bien",
    cityName: "Rennes",
    purchasePrice: 200_000,
    purchaseDate: "2020-01-01",
    currentValue: 230_000,
    monthlyRentGross: 900,
    monthlyCashflowNet: 120,
    capitalInvested: 50_000,
    loan: { principal: 160_000, rateAPR: 0.035, durationYears: 20, startDate: "2020-01-01" },
    status: "owned",
    ...over,
  };
}

describe("propertyMetrics", () => {
  it("calcule equity = valeur − dette restante", () => {
    const m = propertyMetrics(mk({ id: "a" }), asOf);
    expect(m.remainingDebt).toBeGreaterThan(0);
    expect(m.remainingDebt).toBeLessThan(160_000);
    expect(m.equity).toBe(230_000 - m.remainingDebt);
  });

  it("rendement brut = loyer annuel / prix", () => {
    const m = propertyMetrics(mk({ id: "a", monthlyRentGross: 1000, purchasePrice: 200_000 }), asOf);
    expect(m.grossYieldPct).toBeCloseTo(6, 1); // 12000/200000 = 6%
  });

  it("plus-value latente en %", () => {
    const m = propertyMetrics(mk({ id: "a", purchasePrice: 200_000, currentValue: 250_000 }), asOf);
    expect(m.appreciationPct).toBeCloseTo(25, 1);
  });

  it("flag cashflow négatif et rendement faible", () => {
    const m = propertyMetrics(mk({ id: "a", monthlyCashflowNet: -80, monthlyRentGross: 600, purchasePrice: 250_000 }), asOf);
    expect(m.flags).toContain("cashflow_negatif");
    expect(m.flags).toContain("rendement_faible");
  });

  it("flag candidat_arbitrage : forte PV + rendement faible", () => {
    const m = propertyMetrics(mk({ id: "a", purchasePrice: 200_000, currentValue: 260_000, monthlyRentGross: 650 }), asOf);
    expect(m.flags).toContain("forte_plus_value");
    expect(m.flags).toContain("candidat_arbitrage");
  });

  it("comptant (sans prêt) → dette nulle, equity = valeur", () => {
    const m = propertyMetrics(mk({ id: "a", loan: null }), asOf);
    expect(m.remainingDebt).toBe(0);
    expect(m.equity).toBe(230_000);
  });
});

describe("portfolioSummary", () => {
  const props = [
    mk({ id: "a", currentValue: 230_000, monthlyCashflowNet: 120, monthlyRentGross: 900 }),
    mk({ id: "b", currentValue: 300_000, monthlyCashflowNet: -50, monthlyRentGross: 1100, purchasePrice: 280_000 }),
    mk({ id: "c", currentValue: 150_000, monthlyCashflowNet: 200, monthlyRentGross: 750, status: "prospect" }),
  ];

  it("ignore les biens non détenus (prospect/sold)", () => {
    const s = portfolioSummary(props, asOf);
    expect(s.propertyCount).toBe(2); // c est un prospect
    expect(s.totalValue).toBe(530_000);
  });

  it("valeur nette = valeur − dette", () => {
    const s = portfolioSummary(props, asOf);
    expect(s.netWorth).toBe(s.totalValue - s.totalDebt);
    expect(s.totalDebt).toBeGreaterThan(0);
  });

  it("cashflow agrégé", () => {
    const s = portfolioSummary(props, asOf);
    expect(s.monthlyCashflow).toBe(70); // 120 - 50
    expect(s.annualCashflow).toBe(840);
  });

  it("rendement moyen pondéré entre 0 et 100", () => {
    const s = portfolioSummary(props, asOf);
    expect(s.avgGrossYieldPct).toBeGreaterThan(0);
    expect(s.avgLtvPct).toBeGreaterThan(0);
  });

  it("portefeuille vide → zéros", () => {
    const s = portfolioSummary([], asOf);
    expect(s).toMatchObject({ propertyCount: 0, totalValue: 0, netWorth: 0, avgGrossYieldPct: 0 });
  });
});

describe("rankProperties", () => {
  it("identifie meilleur et pire bien", () => {
    const props = [
      mk({ id: "good", monthlyCashflowNet: 350, monthlyRentGross: 1200, purchasePrice: 180_000, currentValue: 240_000 }),
      mk({ id: "bad", monthlyCashflowNet: -120, monthlyRentGross: 600, purchasePrice: 300_000, currentValue: 290_000 }),
    ];
    const r = rankProperties(props, asOf);
    expect(r.best?.id).toBe("good");
    expect(r.worst?.id).toBe("bad");
    expect(r.toOptimize.some((m) => m.id === "bad")).toBe(true);
  });

  it("un seul bien → pas de pire", () => {
    const r = rankProperties([mk({ id: "solo" })], asOf);
    expect(r.best?.id).toBe("solo");
    expect(r.worst).toBeNull();
  });

  it("portefeuille vide", () => {
    const r = rankProperties([], asOf);
    expect(r.best).toBeNull();
    expect(r.underperforming).toEqual([]);
  });
});

describe("projectCashflow", () => {
  it("le cashflow augmente quand un prêt se solde dans l'horizon", () => {
    // Prêt court qui se solde avant la cible 5 ans.
    const props = [
      mk({
        id: "a",
        monthlyCashflowNet: 50,
        loan: { principal: 100_000, rateAPR: 0.03, durationYears: 3, startDate: "2023-01-01" },
      }),
    ];
    const now = projectCashflow(props, 0, "2025-01-01");
    const in5 = projectCashflow(props, 5, "2025-01-01");
    expect(in5).toBeGreaterThan(now); // mensualité libérée
  });

  it("sans prêt, le cashflow projeté est stable", () => {
    const props = [mk({ id: "a", loan: null, monthlyCashflowNet: 100 })];
    expect(projectCashflow(props, 5, "2025-01-01")).toBe(1200);
  });
});

describe("netWorthTimeline", () => {
  it("renvoie un point par mois et termine sur le mois courant", () => {
    const series = netWorthTimeline([mk({ id: "a" })], { months: 12, asOf: "2025-06-15" });
    expect(series).toHaveLength(12);
    expect(series[series.length - 1].month).toBe("2025-06");
    expect(series[0].month).toBe("2024-07");
  });

  it("valeur nette = valeur − dette à chaque point, dette décroissante", () => {
    const series = netWorthTimeline([mk({ id: "a" })], { months: 6, asOf: "2025-06-15" });
    for (const pt of series) expect(pt.netWorth).toBe(pt.value - pt.debt);
    // La dette diminue avec le temps (amortissement).
    expect(series[series.length - 1].debt).toBeLessThan(series[0].debt);
  });

  it("utilise la dernière valorisation connue avant la date", () => {
    const p = mk({
      id: "a",
      purchasePrice: 200_000,
      purchaseDate: "2020-01-01",
      loan: null,
      valuations: [
        { date: "2025-03-01", value: 250_000 },
        { date: "2025-05-01", value: 270_000 },
      ],
    });
    const series = netWorthTimeline([p], { months: 6, asOf: "2025-06-15" });
    expect(series.find((s) => s.month === "2025-02")?.value).toBe(200_000); // avant 1re valo
    expect(series.find((s) => s.month === "2025-04")?.value).toBe(250_000);
    expect(series.find((s) => s.month === "2025-06")?.value).toBe(270_000);
  });

  it("exclut un bien pas encore acquis à la date du point", () => {
    const p = mk({ id: "a", purchaseDate: "2025-05-01", loan: null });
    const series = netWorthTimeline([p], { months: 6, asOf: "2025-06-15" });
    expect(series.find((s) => s.month === "2025-02")?.value).toBe(0);
    expect(series.find((s) => s.month === "2025-06")?.value).toBeGreaterThan(0);
  });
});
