import { describe, it, expect } from "vitest";
import { detectIntent, buildPortfolioContext, answerDeterministic } from "./assistant";
import type { PortfolioProperty } from "./portfolio";

function mk(over: Partial<PortfolioProperty> & { id: string }): PortfolioProperty {
  return {
    label: "Bien",
    cityName: "Rennes",
    purchasePrice: 200_000,
    purchaseDate: "2020-01-01",
    currentValue: 250_000,
    monthlyRentGross: 900,
    monthlyCashflowNet: 100,
    loan: { principal: 150_000, rateAPR: 0.035, durationYears: 20, startDate: "2020-01-01" },
    status: "owned",
    ...over,
  };
}

describe("detectIntent", () => {
  it("reconnaît les intentions clés", () => {
    expect(detectIntent("Puis-je acheter un troisième appartement ?")).toBe("borrowing");
    expect(detectIntent("Quel sera mon cashflow dans 5 ans ?")).toBe("projection");
    expect(detectIntent("Quel est mon bien le moins performant ?")).toBe("worst");
    expect(detectIntent("Dois-je vendre ce bien ?")).toBe("sell");
    expect(detectIntent("Quel régime fiscal est le plus adapté ?")).toBe("tax");
    expect(detectIntent("Quel est mon meilleur bien ?")).toBe("best");
    expect(detectIntent("Bonjour")).toBe("general");
  });
});

describe("buildPortfolioContext", () => {
  const props = [
    mk({ id: "a", label: "T2 Rennes", currentValue: 250_000, monthlyCashflowNet: 200, monthlyRentGross: 1000, purchasePrice: 200_000 }),
    mk({ id: "b", label: "Studio Paris", currentValue: 300_000, monthlyCashflowNet: -100, monthlyRentGross: 700, purchasePrice: 240_000 }),
  ];

  it("agrège valeur, dette et equity mobilisable", () => {
    const ctx = buildPortfolioContext(props, "2025-01-01");
    expect(ctx.summary.propertyCount).toBe(2);
    expect(ctx.unlockableEquity).toBeGreaterThan(0);
    expect(ctx.indicativePurchasingPower).toBeGreaterThan(ctx.unlockableEquity);
    expect(ctx.factSheet).toContain("Patrimoine");
  });

  it("identifie meilleur et pire bien", () => {
    const ctx = buildPortfolioContext(props, "2025-01-01");
    expect(ctx.best?.label).toBe("T2 Rennes");
    expect(ctx.worst?.label).toBe("Studio Paris");
  });

  it("détecte les candidats à l'arbitrage (forte PV + rendement faible)", () => {
    const ctx = buildPortfolioContext(
      [mk({ id: "c", label: "Maison", purchasePrice: 200_000, currentValue: 260_000, monthlyRentGross: 650 })],
      "2025-01-01",
    );
    expect(ctx.arbitrageCandidates).toContain("Maison");
  });
});

describe("answerDeterministic", () => {
  const ctx = buildPortfolioContext(
    [mk({ id: "a", label: "T2 Rennes", monthlyCashflowNet: 150 })],
    "2025-01-01",
  );

  it("borrowing : cite l'equity et le pouvoir d'achat", () => {
    const a = answerDeterministic("borrowing", ctx);
    expect(a).toMatch(/equity|pouvoir d'achat/i);
    expect(a).toMatch(/€/);
  });

  it("projection : utilise la projection fournie", () => {
    const a = answerDeterministic("projection", ctx, { years: 5, annual: 4200 });
    expect(a).toContain("5 ans");
    expect(a).toMatch(/4\s?200|4200/);
  });

  it("portefeuille vide → invite à ajouter des biens", () => {
    const empty = buildPortfolioContext([], "2025-01-01");
    expect(answerDeterministic("borrowing", empty)).toMatch(/vide/i);
  });

  it("toute réponse non vide porte le disclaimer", () => {
    for (const intent of ["borrowing", "worst", "best", "sell", "tax", "general"] as const) {
      expect(answerDeterministic(intent, ctx)).toMatch(/conseil en investissement/i);
    }
  });
});
