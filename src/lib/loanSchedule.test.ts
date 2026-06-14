import { describe, it, expect } from "vitest";
import {
  monthsBetween,
  remainingBalanceAfter,
  amortizationStateAt,
  assessRefinancing,
  type LoanTerms,
} from "./loanSchedule";
import { monthlyPayment } from "./calculator";

describe("monthsBetween", () => {
  it("compte les mensualités pleines", () => {
    expect(monthsBetween("2020-01-15", "2021-01-15")).toBe(12);
    expect(monthsBetween("2020-01-15", "2020-07-15")).toBe(6);
  });
  it("n'inclut pas le mois courant si le jour n'est pas atteint", () => {
    expect(monthsBetween("2020-01-15", "2020-02-10")).toBe(0);
    expect(monthsBetween("2020-01-15", "2020-02-15")).toBe(1);
  });
  it("renvoie 0 pour des dates inversées ou invalides", () => {
    expect(monthsBetween("2021-01-01", "2020-01-01")).toBe(0);
    expect(monthsBetween("not-a-date", "2020-01-01")).toBe(0);
  });
});

describe("remainingBalanceAfter", () => {
  it("vaut le capital initial à t=0", () => {
    expect(remainingBalanceAfter(200_000, 0.035, 20, 0)).toBe(200_000);
  });
  it("est nul une fois la durée écoulée", () => {
    expect(remainingBalanceAfter(200_000, 0.035, 20, 240)).toBe(0);
    // au-delà de la durée, reste nul (borné)
    expect(remainingBalanceAfter(200_000, 0.035, 20, 999)).toBe(0);
  });
  it("décroît de façon monotone", () => {
    const b12 = remainingBalanceAfter(200_000, 0.035, 20, 12);
    const b24 = remainingBalanceAfter(200_000, 0.035, 20, 24);
    expect(b12).toBeLessThan(200_000);
    expect(b24).toBeLessThan(b12);
  });
  it("gère le taux zéro (amortissement linéaire)", () => {
    // 120k sur 10 ans = 1000/mois, après 60 mois il reste 60k
    expect(remainingBalanceAfter(120_000, 0, 10, 60)).toBe(60_000);
  });
  it("au début, le capital amorti est inférieur aux intérêts versés", () => {
    // Mensualité = intérêts + capital ; au mois 1 les intérêts dominent.
    const m = monthlyPayment(200_000, 0.035, 20);
    const b1 = remainingBalanceAfter(200_000, 0.035, 20, 1);
    const principalPaid = 200_000 - b1;
    const interest1 = 200_000 * (0.035 / 12);
    expect(principalPaid).toBeLessThan(interest1);
    expect(principalPaid + interest1).toBeCloseTo(m, 0);
  });
});

describe("amortizationStateAt", () => {
  const terms: LoanTerms = { principal: 200_000, rateAPR: 0.035, durationYears: 20, startDate: "2020-01-01" };

  it("reconstitue capital remboursé + restant = principal", () => {
    const s = amortizationStateAt(terms, "2025-01-01");
    expect(s.remainingBalance + s.principalPaid).toBeCloseTo(200_000, -1);
    expect(s.monthsElapsed).toBe(60);
    expect(s.monthsRemaining).toBe(180);
  });

  it("intérêts payés cohérents avec mensualités × mois − capital", () => {
    const s = amortizationStateAt(terms, "2025-01-01");
    expect(s.interestPaid).toBeGreaterThan(0);
    expect(s.interestPaid).toBeLessThan(s.monthlyPayment * 60);
  });
});

describe("assessRefinancing", () => {
  const terms: LoanTerms = { principal: 200_000, rateAPR: 0.045, durationYears: 25, startDate: "2019-01-01" };

  it("détecte un gain de mensualité quand le taux de marché baisse", () => {
    const r = assessRefinancing({ terms, marketRateAPR: 0.03, currentValue: 260_000, asOf: "2024-01-01" });
    expect(r.monthlySaving).toBeGreaterThan(0);
    expect(r.worthwhile).toBe(true);
    expect(r.newMonthlyPayment).toBeLessThan(r.currentMonthlyPayment);
  });

  it("ne recommande pas le refi si le taux remonte et l'equity est faible", () => {
    const r = assessRefinancing({ terms, marketRateAPR: 0.06, currentValue: 205_000, asOf: "2024-01-01" });
    expect(r.monthlySaving).toBeLessThan(30);
    expect(r.unlockedBorrowingCapacity).toBeLessThan(10_000);
    expect(r.worthwhile).toBe(false);
  });

  it("calcule la capacité d'emprunt débloquée par la plus-value", () => {
    // valeur 300k, 80% LTV = 240k ; dette ~restante < 200k → capacité > 0
    const r = assessRefinancing({ terms, marketRateAPR: 0.045, currentValue: 300_000, asOf: "2024-01-01" });
    expect(r.unlockedBorrowingCapacity).toBeGreaterThan(40_000);
    expect(r.worthwhile).toBe(true);
  });
});
