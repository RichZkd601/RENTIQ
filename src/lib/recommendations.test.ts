import { describe, it, expect } from "vitest";
import { generateRecommendations, generatePortfolioRecommendations, type RecoProperty } from "./recommendations";

function base(over: Partial<RecoProperty> & { id: string }): RecoProperty {
  return {
    label: "T2 Rennes",
    cityName: "Rennes",
    strategy: "location_nue",
    surfaceM2: 45,
    rooms: 2,
    purchasePrice: 180_000,
    worksBudget: 0,
    furnitureBudget: 0,
    propertyTax: 900,
    copro: 600,
    tmi: 0.3,
    loan: { principal: 150_000, rateAPR: 0.045, durationYears: 20, startDate: "2019-01-01" },
    currentValue: 210_000,
    currentMonthlyRent: 650,
    currentMonthlyCashflowNet: 40,
    market: {},
    ...over,
  };
}

describe("rent_increase", () => {
  it("détecte un loyer nu sous le marché", () => {
    const recs = generateRecommendations(
      base({ id: "a", strategy: "location_nue", currentMonthlyRent: 650, market: { marketRentNu: 780 } }),
      "2025-01-01",
    );
    const r = recs.find((x) => x.type === "rent_increase");
    expect(r).toBeTruthy();
    expect(r!.estimatedMonthlyGain).toBe(130);
    expect(r!.confidence).toBe("haute");
  });

  it("ne déclenche pas si le loyer est au marché", () => {
    const recs = generateRecommendations(
      base({ id: "a", currentMonthlyRent: 760, market: { marketRentNu: 780 } }),
      "2025-01-01",
    );
    expect(recs.find((x) => x.type === "rent_increase")).toBeUndefined();
  });
});

describe("strategy_switch", () => {
  it("recommande le meublé quand il dégage nettement plus que le nu", () => {
    const recs = generateRecommendations(
      base({
        id: "a",
        strategy: "location_nue",
        currentMonthlyCashflowNet: 20,
        furnitureBudget: 8_000,
        market: { marketRentNu: 650, marketRentMeuble: 820 },
      }),
      "2025-01-01",
    );
    const r = recs.find((x) => x.type === "strategy_switch");
    expect(r).toBeTruthy();
    expect(r!.estimatedMonthlyGain).toBeGreaterThan(0);
    // Le moteur choisit la meilleure alternative au nu (meublé / bail mobilité / coloc…).
    expect(r!.title.toLowerCase()).toMatch(/meublé|bail mobilité|colocation|coliving/);
  });
});

describe("refinancing", () => {
  it("propose un refi quand le taux de marché a baissé", () => {
    const recs = generateRecommendations(
      base({
        id: "a",
        loan: { principal: 150_000, rateAPR: 0.045, durationYears: 25, startDate: "2018-01-01" },
        currentValue: 260_000,
        market: { marketRentNu: 650, marketRateAPR: 0.03 },
      }),
      "2025-01-01",
    );
    const r = recs.find((x) => x.type === "refinancing");
    expect(r).toBeTruthy();
    expect(r!.estimatedMonthlyGain).toBeGreaterThan(0);
  });

  it("aucun refi sans données de taux marché", () => {
    const recs = generateRecommendations(base({ id: "a", market: { marketRentNu: 650 } }), "2025-01-01");
    expect(recs.find((x) => x.type === "refinancing")).toBeUndefined();
  });
});

describe("arbitrage_sell", () => {
  it("flag arbitrage : forte plus-value + rendement faible", () => {
    const recs = generateRecommendations(
      base({
        id: "a",
        purchasePrice: 200_000,
        currentValue: 260_000, // +30%
        currentMonthlyRent: 700, // 8400/200000 = 4.2% brut
        market: {},
      }),
      "2025-01-01",
    );
    const r = recs.find((x) => x.type === "arbitrage_sell");
    expect(r).toBeTruthy();
    expect(r!.estimatedOneOffGain).toBe(60_000);
  });
});

describe("generatePortfolioRecommendations", () => {
  it("agrège et trie par priorité (gain) décroissante", () => {
    const recs = generatePortfolioRecommendations(
      [
        base({ id: "a", currentMonthlyRent: 600, market: { marketRentNu: 700 } }),
        base({ id: "b", currentMonthlyRent: 600, market: { marketRentNu: 900 } }),
      ],
      "2025-01-01",
    );
    expect(recs.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].priority).toBeGreaterThanOrEqual(recs[i].priority);
    }
  });
});
