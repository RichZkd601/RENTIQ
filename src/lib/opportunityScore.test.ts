import { describe, it, expect } from "vitest";
import {
  scoreOpportunity,
  rankOpportunities,
  type InvestorProfile,
  type CandidateListing,
} from "./opportunityScore";

const profile: InvestorProfile = {
  cityName: "Rennes",
  propertyType: "t2",
  maxBudget: 220_000,
  strategy: "lmnp_longue_duree",
  minMonthlyCashflow: 100,
  tmi: 0.3,
};

function listing(over: Partial<CandidateListing> = {}): CandidateListing {
  return {
    cityName: "Rennes",
    propertyType: "t2",
    surfaceM2: 45,
    rooms: 2,
    price: 180_000,
    monthlyRentMeuble: 900,
    propertyTax: 800,
    copro: 700,
    ...over,
  };
}

describe("scoreOpportunity", () => {
  it("annonce dans le budget et cashflow OK → match", () => {
    const r = scoreOpportunity(profile, listing({ price: 150_000, monthlyRentMeuble: 950 }));
    expect(r.eligible).toBe(true);
    expect(r.matchScore).toBeGreaterThan(40);
    expect(typeof r.matches).toBe("boolean");
  });

  it("rejette une annonce au-dessus du budget", () => {
    const r = scoreOpportunity(profile, listing({ price: 320_000 }));
    expect(r.matches).toBe(false);
    expect(r.matchScore).toBeLessThanOrEqual(35);
    expect(r.reasons.join(" ")).toMatch(/budget/i);
  });

  it("rejette quand le cashflow est sous l'objectif", () => {
    // loyer faible → cashflow négatif
    const r = scoreOpportunity(profile, listing({ price: 215_000, monthlyRentMeuble: 600 }));
    expect(r.matches).toBe(false);
    expect(r.monthlyCashflow).toBeLessThan(profile.minMonthlyCashflow);
  });

  it("stratégie non éligible (pas de loyer) → score 0", () => {
    const r = scoreOpportunity(profile, listing({ monthlyRentMeuble: undefined, monthlyRentNu: undefined }));
    expect(r.eligible).toBe(false);
    expect(r.matchScore).toBe(0);
  });

  it("respecte un seuil de rendement minimum", () => {
    const strict: InvestorProfile = { ...profile, minNetYieldPct: 99 };
    const r = scoreOpportunity(strict, listing({ price: 150_000, monthlyRentMeuble: 950 }));
    expect(r.matches).toBe(false); // rendement réaliste < 99%
  });
});

describe("rankOpportunities", () => {
  it("classe par matchScore décroissant", () => {
    const cands = [
      listing({ price: 210_000, monthlyRentMeuble: 820 }),
      listing({ price: 150_000, monthlyRentMeuble: 1000 }),
      listing({ price: 185_000, monthlyRentMeuble: 900 }),
    ];
    const ranked = rankOpportunities(profile, cands);
    expect(ranked.length).toBe(3);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].result.matchScore).toBeGreaterThanOrEqual(ranked[i].result.matchScore);
    }
  });

  it("onlyMatches ne garde que les annonces conformes", () => {
    const cands = [listing({ price: 320_000 }), listing({ price: 150_000, monthlyRentMeuble: 1000 })];
    const ranked = rankOpportunities(profile, cands, { onlyMatches: true });
    expect(ranked.every((r) => r.result.matches)).toBe(true);
  });
});
