/**
 * RentIQ — Client Firecrawl (V3, source d'annonces réelle).
 *
 * Récupère et structure une page d'annonce immobilière via l'API Firecrawl
 * (`/v1/scrape` avec extraction JSON). Renvoie des `RawListing` bruts que
 * `listingExtraction.ts` normalise ensuite.
 *
 * NE PAS importer côté client (suffixe `.server`). Nécessite FIRECRAWL_API_KEY.
 */
import type { RawListing } from "./listingExtraction";

const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v1/scrape";

const LISTING_PROPERTIES = {
  title: { type: "string", description: "Titre de l'annonce" },
  description: { type: "string", description: "Description du bien" },
  price: { type: "string", description: "Prix de vente affiché, en euros" },
  surface: { type: "string", description: "Surface habitable en m²" },
  rooms: { type: "string", description: "Nombre de pièces (ex: T2, 3 pièces)" },
  propertyType: { type: "string", description: "Type: appartement, maison, studio…" },
  postalCode: { type: "string", description: "Code postal à 5 chiffres" },
  city: { type: "string", description: "Ville / commune" },
  imageUrl: { type: "string", description: "URL de la photo principale" },
} as const;

const SINGLE_SCHEMA = { type: "object", properties: LISTING_PROPERTIES };
const MULTI_SCHEMA = {
  type: "object",
  properties: {
    listings: { type: "array", items: { type: "object", properties: LISTING_PROPERTIES } },
  },
};

export class FirecrawlNotConfiguredError extends Error {
  constructor() {
    super("FIRECRAWL_NOT_CONFIGURED");
    this.name = "FirecrawlNotConfiguredError";
  }
}

export function isFirecrawlConfigured(): boolean {
  return !!process.env.FIRECRAWL_API_KEY;
}

async function scrapeJson(url: string, schema: unknown, prompt: string): Promise<any> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new FirecrawlNotConfiguredError();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        url,
        onlyMainContent: true,
        formats: ["json"],
        jsonOptions: { schema, prompt },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Firecrawl HTTP ${res.status} — ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    if (json?.success === false)
      throw new Error(`Firecrawl: ${json?.error ?? "échec d'extraction"}`);
    return json?.data?.json ?? json?.data ?? {};
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("Firecrawl: délai dépassé (page trop lente).");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/** Extrait une annonce unique depuis l'URL d'une page de détail. */
export async function scrapeListing(url: string): Promise<RawListing> {
  const data = await scrapeJson(
    url,
    SINGLE_SCHEMA,
    "Extrais les caractéristiques de cette annonce immobilière de vente : prix, surface habitable, nombre de pièces, type de bien, code postal, ville, et l'URL de la photo principale.",
  );
  return data as RawListing;
}

/** Extrait plusieurs annonces depuis une page de résultats de recherche. */
export async function scrapeListings(url: string, max = 15): Promise<RawListing[]> {
  const data = await scrapeJson(
    url,
    MULTI_SCHEMA,
    "Extrais la liste des annonces immobilières de vente présentes sur cette page de résultats. Pour chaque annonce : prix, surface, nombre de pièces, type, code postal, ville, photo principale.",
  );
  const listings = Array.isArray(data?.listings) ? data.listings : [];
  return listings.slice(0, max) as RawListing[];
}
