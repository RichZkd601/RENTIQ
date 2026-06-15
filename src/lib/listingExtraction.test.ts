import { describe, it, expect } from "vitest";
import {
  parseFrenchNumber,
  parseRooms,
  extractPostalCode,
  looksLikeHouse,
  inferPropertyType,
  normalizeExtractedListing,
  buildCandidateFromListing,
  sourceFromUrl,
} from "./listingExtraction";

describe("parseFrenchNumber", () => {
  it("gère les formats français courants", () => {
    expect(parseFrenchNumber("180 000 €")).toBe(180000);
    expect(parseFrenchNumber("180000")).toBe(180000);
    expect(parseFrenchNumber("180.000")).toBe(180000); // point milliers
    expect(parseFrenchNumber("1.250.000 €")).toBe(1250000);
    expect(parseFrenchNumber("45 m²")).toBe(45);
    expect(parseFrenchNumber("45,5 m²")).toBe(45.5);
    expect(parseFrenchNumber("1 250,50 €")).toBe(1250.5);
    expect(parseFrenchNumber(180000)).toBe(180000);
  });
  it("renvoie null pour l'absence de nombre", () => {
    expect(parseFrenchNumber("")).toBeNull();
    expect(parseFrenchNumber("Nous consulter")).toBeNull();
    expect(parseFrenchNumber(null)).toBeNull();
    expect(parseFrenchNumber(undefined)).toBeNull();
  });
});

describe("parseRooms", () => {
  it("reconnaît T/F, pièces, studio", () => {
    expect(parseRooms("T2")).toBe(2);
    expect(parseRooms("F3")).toBe(3);
    expect(parseRooms("3 pièces")).toBe(3);
    expect(parseRooms("Studio")).toBe(1);
    expect(parseRooms("Appartement T4 lumineux")).toBe(4);
    expect(parseRooms(2)).toBe(2);
    expect(parseRooms("villa")).toBeNull();
  });
});

describe("extractPostalCode", () => {
  it("extrait un CP valide d'un texte ou d'une URL", () => {
    expect(extractPostalCode("Bel appartement à Rennes 35000")).toBe("35000");
    expect(extractPostalCode("https://www.seloger.com/annonces/.../35200/")).toBe("35200");
    expect(extractPostalCode("T2 45m² 250000 €", "Paris 75011")).toBe("75011");
  });
  it("ne confond pas un prix avec un CP hors plage", () => {
    // 99999 est la borne haute ; 180000 (6 chiffres) ne matche pas \d{5} isolé
    expect(extractPostalCode("Prix 180000 €")).toBeNull();
  });
  it("renvoie null sans CP", () => {
    expect(extractPostalCode("Joli T2 lumineux")).toBeNull();
  });
});

describe("looksLikeHouse / inferPropertyType", () => {
  it("détecte une maison", () => {
    expect(looksLikeHouse("Belle villa avec jardin")).toBe(true);
    expect(looksLikeHouse("Appartement T2")).toBe(false);
  });
  it("déduit le type depuis pièces / surface", () => {
    expect(inferPropertyType(1, null, false)).toBe("studio");
    expect(inferPropertyType(2, null, false)).toBe("t2");
    expect(inferPropertyType(5, null, false)).toBe("t4_plus");
    expect(inferPropertyType(null, 20, false)).toBe("studio");
    expect(inferPropertyType(null, 60, false)).toBe("t3");
    expect(inferPropertyType(3, 70, true)).toBe("maison");
  });
});

describe("normalizeExtractedListing", () => {
  it("normalise une annonce brute hétérogène", () => {
    const n = normalizeExtractedListing({
      title: "Appartement T2 - Rennes",
      description: "Joli T2 de 45 m² à Rennes 35000, proche centre.",
      price: "180 000 €",
      surface: "45 m²",
      rooms: "T2",
      postalCode: "35000",
      city: "Rennes",
      imageUrl: "https://img/1.jpg",
    });
    expect(n.price).toBe(180000);
    expect(n.surfaceM2).toBe(45);
    expect(n.rooms).toBe(2);
    expect(n.propertyType).toBe("t2");
    expect(n.postalCode).toBe("35000");
    expect(n.cityName).toBe("Rennes");
    expect(n.isHouse).toBe(false);
  });

  it("déduit les pièces du titre et le CP de la description", () => {
    const n = normalizeExtractedListing({
      title: "Studio meublé",
      description: "Studio de 22 m² à Lyon 69003. Idéal étudiant.",
      price: "120000",
      surface: "22",
    });
    expect(n.rooms).toBe(1);
    expect(n.propertyType).toBe("studio");
    expect(n.postalCode).toBe("69003");
  });

  it("repère une maison", () => {
    const n = normalizeExtractedListing({
      title: "Maison 4 pièces",
      price: "320000",
      surface: "110",
    });
    expect(n.isHouse).toBe(true);
    expect(n.propertyType).toBe("maison");
  });
});

describe("buildCandidateFromListing", () => {
  const base = normalizeExtractedListing({
    title: "T2 Rennes",
    price: "180000",
    surface: "45",
    rooms: "T2",
    postalCode: "35000",
  });

  it("estime le loyer depuis le marché commune si fourni", () => {
    const { candidate, warnings } = buildCandidateFromListing(base, "Rennes", {
      rentSqmUnfurnished: 13,
      rentSqmFurnished: 15,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.monthlyRentNu).toBe(Math.round(13 * 45));
    expect(candidate!.monthlyRentMeuble).toBe(Math.round(15 * 45));
    expect(warnings).toHaveLength(0);
  });

  it("repli sur le prix/m² moyen de la commune avec avertissement", () => {
    const { candidate, warnings } = buildCandidateFromListing(base, "Rennes", {
      priceSqmAvg: 3800,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.monthlyRentNu).toBeGreaterThan(0);
    expect(warnings.join(" ")).toMatch(/estimé/i);
  });

  it("repli ultime sur le prix de l'annonce sans aucune donnée marché", () => {
    const { candidate, warnings } = buildCandidateFromListing(base, "Rennes", {});
    expect(candidate).not.toBeNull();
    expect(candidate!.monthlyRentNu).toBeGreaterThan(0);
    expect(warnings.join(" ")).toMatch(/pas de référence marché/i);
  });

  it("rejette une annonce sans prix ou sans surface", () => {
    const noPrice = normalizeExtractedListing({ title: "T2", surface: "45" });
    expect(buildCandidateFromListing(noPrice, "Rennes").candidate).toBeNull();
    const noSurface = normalizeExtractedListing({ title: "T2", price: "180000" });
    expect(buildCandidateFromListing(noSurface, "Rennes").candidate).toBeNull();
  });

  it("génère des paramètres de colocation pour un T3+", () => {
    const t4 = normalizeExtractedListing({
      title: "T4 Rennes",
      price: "260000",
      surface: "85",
      rooms: "T4",
    });
    const { candidate } = buildCandidateFromListing(t4, "Rennes", { rentSqmFurnished: 14 });
    expect(candidate!.colocRoomCount).toBe(3);
    expect(candidate!.colocRoomRent).toBeGreaterThan(0);
  });
});

describe("sourceFromUrl", () => {
  it("identifie les portails connus", () => {
    expect(sourceFromUrl("https://www.leboncoin.fr/ventes_immobilieres/123.htm")).toBe("leboncoin");
    expect(sourceFromUrl("https://www.seloger.com/annonces/achat/.../123")).toBe("seloger");
    expect(sourceFromUrl("https://www.bienici.com/annonce/123")).toBe("bienici");
    expect(sourceFromUrl("https://www.pap.fr/annonce/123")).toBe("pap");
    expect(sourceFromUrl("https://example.com/x")).toBe("example.com");
  });
});
