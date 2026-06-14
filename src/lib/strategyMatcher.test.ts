import { describe, it, expect } from "vitest";
import { matchStrategies, cityRegulationFromRow } from "./strategyMatcher";
import type { CalcInput } from "./calculator";

const t4Lyon: CalcInput = {
  property: { price: 280_000, notaryFees: 280_000 * 0.08, worksBudget: 20_000, furnitureBudget: 10_000, surfaceM2: 85, rooms: 4, propertyTax: 1_600, copro: 2_000 },
  rent: { monthlyNu: 1_300, monthlyMeuble: 1_500, colocRoomRent: 550, colocRoomCount: 3, airbnbNightly: 110, airbnbOccupancy: 0.65 },
  financing: { loanAmount: 300_000, rateAPR: 0.04, durationYears: 25 },
  fiscal: { tmi: 0.30 },
};

const lyonCity = cityRegulationFromRow({
  city_name: "Lyon",
  regulation_level: "compensation",
  change_usage_required: true,
  compensation_required: true,
});

describe("Matcher", () => {
  it("Lyon + change d'usage : Airbnb encore éligible mais avec warnings", () => {
    const r = matchStrategies({ calc: t4Lyon, objective: "cashflow", effort: "actif", city: lyonCity });
    const airbnb = r.strategies.find((s) => s.strategy === "airbnb")!;
    expect(airbnb.eligible).toBe(true);
    expect(airbnb.regulatoryWarnings.length).toBeGreaterThan(0);
    expect(r.regulatoryBanner?.level).toBe("warning");
  });

  it("Ville interdite : Airbnb bloqué et banner danger", () => {
    const city = cityRegulationFromRow({ city_name: "Saint-Malo", regulation_level: "interdit" });
    const r = matchStrategies({ calc: t4Lyon, objective: "cashflow", effort: "actif", city });
    const airbnb = r.strategies.find((s) => s.strategy === "airbnb")!;
    expect(airbnb.eligible).toBe(false);
    expect(r.regulatoryBanner?.level).toBe("danger");
  });

  it("Profil patrimoine privilégie LMNP/nu vs Airbnb dans le classement", () => {
    const cityLibre = cityRegulationFromRow({ city_name: "Test", regulation_level: "libre" });
    const r = matchStrategies({ calc: t4Lyon, objective: "patrimoine", effort: "passif", city: cityLibre });
    // Le top ne doit pas être Airbnb pour un profil passif/patrimoine
    expect(r.ranked[0].strategy).not.toBe("airbnb");
  });

  it("Profil cashflow + effort actif : Airbnb ou colocation en tête (ville libre)", () => {
    const cityLibre = cityRegulationFromRow({ city_name: "Test", regulation_level: "libre" });
    const r = matchStrategies({ calc: t4Lyon, objective: "cashflow", effort: "actif", city: cityLibre });
    expect(["airbnb", "colocation", "coliving"]).toContain(r.ranked[0].strategy);
  });

  it("Toutes les stratégies sont retournées (éligibles + bloquées) — jamais cachées", () => {
    const r = matchStrategies({ calc: t4Lyon, objective: "equilibre", effort: "modere", city: lyonCity });
    expect(r.strategies).toHaveLength(6);
    const blocked = r.strategies.filter((s) => !s.eligible);
    blocked.forEach((s) => expect(s.blockedReason).toBeTruthy());
  });
});
