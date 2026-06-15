/**
 * RentIQ — Extraction & normalisation d'annonces (V3, source réelle).
 *
 * Module PUR : transforme la sortie brute d'un scraper (Firecrawl) en
 * `CandidateListing` scorable par le moteur déterministe. Aucune I/O ici —
 * le fetch réseau vit dans `firecrawl.server.ts`. Couvert par
 * listingExtraction.test.ts.
 *
 * Une annonce d'achat ne contient JAMAIS le loyer : on l'estime à partir des
 * données de marché de la commune (loyer €/m²), avec repli sur le prix au m².
 */
import type { CandidateListing } from "./opportunityScore";

export type ListingPropertyType = "studio" | "t2" | "t3" | "t4_plus" | "maison";

export interface RawListing {
  title?: unknown;
  description?: unknown;
  price?: unknown;
  surface?: unknown;
  rooms?: unknown;
  propertyType?: unknown;
  postalCode?: unknown;
  city?: unknown;
  imageUrl?: unknown;
}

export interface NormalizedListing {
  title: string | null;
  description: string | null;
  price: number | null;
  surfaceM2: number | null;
  rooms: number | null;
  propertyType: ListingPropertyType | null;
  postalCode: string | null;
  cityName: string | null;
  imageUrl: string | null;
  isHouse: boolean;
}

export interface MarketEstimate {
  rentSqmUnfurnished?: number | null;
  rentSqmFurnished?: number | null;
  priceSqmAvg?: number | null;
}

/** Rendement brut national de repli pour estimer un loyer depuis un prix/m². */
const FALLBACK_GROSS_YIELD = 0.05;

/**
 * Parse un nombre « à la française » : « 180 000 € », « 1 250,50 », « 45 m² ».
 * Espaces/points = milliers, virgule = décimale.
 */
export function parseFrenchNumber(input: unknown): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const cleaned = String(input)
    .replace(/ /g, " ")
    .replace(/[^\d.,\s]/g, "")
    .trim();
  if (!cleaned) return null;
  let n = cleaned.replace(/\s+/g, "");
  if (n.includes(",")) {
    // virgule = décimale → les points sont des séparateurs de milliers
    n = n.replace(/\./g, "").replace(",", ".");
  } else if ((n.match(/\./g) ?? []).length > 1) {
    // plusieurs points sans virgule → milliers (1.250.000)
    n = n.replace(/\./g, "");
  } else {
    // un seul point suivi d'exactement 3 chiffres → séparateur de milliers (180.000)
    const m = n.match(/^(\d+)\.(\d{3})$/);
    if (m) n = m[1] + m[2];
  }
  const val = parseFloat(n);
  return Number.isFinite(val) ? val : null;
}

/** Parse un nombre de pièces depuis « T2 », « F3 », « 2 pièces », « studio ». */
export function parseRooms(input: unknown): number | null {
  if (typeof input === "number")
    return Number.isFinite(input) && input > 0 ? Math.round(input) : null;
  if (input == null) return null;
  const s = String(input).toLowerCase();
  if (/studio|t1\b|f1\b/.test(s)) return 1;
  const tf = s.match(/\b[tf]\s*(\d{1,2})\b/);
  if (tf) return parseInt(tf[1], 10);
  const p = s.match(/(\d{1,2})\s*pi[eè]ce/);
  if (p) return parseInt(p[1], 10);
  const num = s.match(/^\s*(\d{1,2})\s*$/);
  if (num) return parseInt(num[1], 10);
  return null;
}

/** Extrait un code postal français (5 chiffres) d'un texte libre / URL. */
export function extractPostalCode(...texts: Array<unknown>): string | null {
  for (const t of texts) {
    if (t == null) continue;
    const matches = String(t)
      .replace(/ /g, " ")
      .match(/(?<!\d)(\d{5})(?!\d)/g);
    if (!matches) continue;
    for (const m of matches) {
      const n = parseInt(m, 10);
      if (n >= 1000 && n <= 98999) return m; // plage des CP métropole + DOM
    }
  }
  return null;
}

/** Détecte si l'annonce porte sur une maison (vs appartement). */
export function looksLikeHouse(...texts: Array<unknown>): boolean {
  const blob = texts
    .map((t) => (t == null ? "" : String(t)))
    .join(" ")
    .toLowerCase();
  return /\bmaison\b|\bvilla\b|\bpavillon\b|\blongère\b|\bfermette\b/.test(blob);
}

/** Déduit le type de bien depuis pièces / surface / indice maison. */
export function inferPropertyType(
  rooms: number | null,
  surfaceM2: number | null,
  isHouse: boolean,
): ListingPropertyType {
  if (isHouse) return "maison";
  if (rooms != null) {
    if (rooms <= 1) return "studio";
    if (rooms === 2) return "t2";
    if (rooms === 3) return "t3";
    return "t4_plus";
  }
  if (surfaceM2 != null) {
    if (surfaceM2 < 25) return "studio";
    if (surfaceM2 < 45) return "t2";
    if (surfaceM2 < 70) return "t3";
    return "t4_plus";
  }
  return "t2";
}

const TYPE_VALUES: ReadonlySet<string> = new Set(["studio", "t2", "t3", "t4_plus", "maison"]);

/** Normalise une annonce brute (sortie scraper) en données exploitables. */
export function normalizeExtractedListing(raw: RawListing): NormalizedListing {
  const title = raw.title == null ? null : String(raw.title).trim() || null;
  const description = raw.description == null ? null : String(raw.description).trim() || null;
  const price = parseFrenchNumber(raw.price);
  const surfaceM2 = parseFrenchNumber(raw.surface);
  const rooms = parseRooms(raw.rooms) ?? parseRooms(title);
  const isHouse = looksLikeHouse(raw.propertyType, title, description);
  const postalCode = extractPostalCode(raw.postalCode, title, description);
  const cityName = raw.city == null ? null : String(raw.city).trim() || null;
  const imageUrl = raw.imageUrl == null ? null : String(raw.imageUrl).trim() || null;

  const declared = raw.propertyType == null ? null : String(raw.propertyType).toLowerCase().trim();
  const propertyType: ListingPropertyType | null =
    declared && TYPE_VALUES.has(declared)
      ? (declared as ListingPropertyType)
      : price != null || surfaceM2 != null || rooms != null
        ? inferPropertyType(rooms, surfaceM2, isHouse)
        : null;

  return {
    title,
    description,
    price,
    surfaceM2,
    rooms,
    propertyType,
    postalCode,
    cityName,
    imageUrl,
    isHouse,
  };
}

export interface BuildCandidateResult {
  candidate: CandidateListing | null;
  /** Avertissements de qualité de données (loyer estimé, pièces déduites…). */
  warnings: string[];
}

/**
 * Construit une `CandidateListing` scorable à partir d'une annonce normalisée
 * et des données de marché de la commune. Le loyer est estimé (annonce d'achat
 * = pas de loyer) ; repli sur le prix au m² × rendement national.
 */
export function buildCandidateFromListing(
  listing: NormalizedListing,
  cityName: string,
  market: MarketEstimate = {},
): BuildCandidateResult {
  const warnings: string[] = [];
  if (listing.price == null || listing.price < 10_000) {
    return { candidate: null, warnings: ["Prix introuvable ou invalide dans l'annonce."] };
  }
  if (listing.surfaceM2 == null || listing.surfaceM2 < 8) {
    return { candidate: null, warnings: ["Surface introuvable ou invalide dans l'annonce."] };
  }

  const surface = listing.surfaceM2;
  const rooms = listing.rooms ?? roomsFromSurface(surface);
  if (listing.rooms == null) warnings.push(`Nombre de pièces déduit de la surface (~${rooms}).`);

  // Loyer €/m² : marché commune > marché national dérivé du prix/m².
  const priceSqmListing = listing.price / surface;
  let rentSqmUnfurnished = market.rentSqmUnfurnished ?? null;
  if (rentSqmUnfurnished == null && market.priceSqmAvg) {
    rentSqmUnfurnished = (market.priceSqmAvg * FALLBACK_GROSS_YIELD) / 12;
    warnings.push("Loyer estimé depuis le prix/m² moyen de la commune.");
  }
  if (rentSqmUnfurnished == null) {
    rentSqmUnfurnished = (priceSqmListing * FALLBACK_GROSS_YIELD) / 12;
    warnings.push("Loyer estimé depuis le prix de l'annonce (pas de référence marché).");
  }
  const rentSqmFurnished = market.rentSqmFurnished ?? rentSqmUnfurnished * 1.12;

  const candidate: CandidateListing = {
    cityName,
    postalCode: listing.postalCode,
    propertyType: listing.propertyType,
    surfaceM2: surface,
    rooms,
    price: listing.price,
    monthlyRentNu: Math.round(rentSqmUnfurnished * surface),
    monthlyRentMeuble: Math.round(rentSqmFurnished * surface),
    colocRoomRent:
      rooms >= 3 ? Math.round(((rentSqmFurnished * surface) / rooms) * 1.15) : undefined,
    colocRoomCount: rooms >= 3 ? rooms - 1 : undefined,
  };
  return { candidate, warnings };
}

function roomsFromSurface(surface: number): number {
  if (surface < 25) return 1;
  if (surface < 45) return 2;
  if (surface < 70) return 3;
  return 4;
}

const SOURCES: Array<[RegExp, string]> = [
  [/leboncoin\.fr/i, "leboncoin"],
  [/seloger\.com/i, "seloger"],
  [/bienici\.com/i, "bienici"],
  [/pap\.fr/i, "pap"],
  [/logic-immo\.com/i, "logic-immo"],
  [/figaro\s?immo|explorimmo/i, "figaro-immo"],
];

/** Identifie le portail d'origine depuis l'URL. */
export function sourceFromUrl(url: string): string {
  for (const [re, name] of SOURCES) if (re.test(url)) return name;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "url";
  }
}
