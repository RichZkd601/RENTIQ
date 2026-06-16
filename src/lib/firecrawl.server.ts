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

/** Codes HTTP transitoires : on retente (quota, surcharge, passerelle). */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isNetworkError(e: any): boolean {
  return (
    e?.name === "AbortError" ||
    e?.name === "TypeError" ||
    /fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(String(e?.message ?? ""))
  );
}

/**
 * Effectue une extraction JSON Firecrawl avec garde-fous de fiabilité :
 *  - retries + back-off exponentiel sur 429 / 5xx / erreurs réseau ;
 *  - options adaptées aux portails immobiliers FR (rendu JS, géoloc FR,
 *    proxy anti-bot, blocage pubs) pour maximiser le taux d'extraction ;
 *  - parsing de réponse tolérant aux variantes de schéma.
 */
async function scrapeJson(url: string, schema: unknown, prompt: string): Promise<any> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new FirecrawlNotConfiguredError();

  const payload = JSON.stringify({
    url,
    onlyMainContent: true,
    // Les portails (LeBonCoin/SeLoger/Bien'ici) sont des SPA protégées :
    waitFor: 2500, // laisse le JS charger le prix/surface
    blockAds: true,
    removeBase64Images: true,
    location: { country: "FR", languages: ["fr-FR"] },
    proxy: "auto", // Firecrawl escalade en stealth sur les sites anti-bot
    formats: ["json"],
    jsonOptions: { schema, prompt },
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(FIRECRAWL_SCRAPE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: payload,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
          lastError = new Error(`Firecrawl HTTP ${res.status}`);
          await sleep(400 * 2 ** (attempt - 1));
          continue;
        }
        if (res.status === 429) throw new Error("Firecrawl: limite de débit atteinte (429). Réessayez dans un instant.");
        throw new Error(`Firecrawl HTTP ${res.status} — ${body.slice(0, 200)}`);
      }

      const json = await res.json();
      if (json?.success === false) throw new Error(`Firecrawl: ${json?.error ?? "échec d'extraction"}`);
      // Tolérant aux variantes de nommage du champ d'extraction.
      return json?.data?.json ?? json?.data?.extract ?? json?.data?.llm_extraction ?? json?.data ?? {};
    } catch (e: any) {
      if (e instanceof FirecrawlNotConfiguredError) throw e;
      if (isNetworkError(e) && attempt < MAX_ATTEMPTS) {
        lastError = e;
        await sleep(400 * 2 ** (attempt - 1));
        continue;
      }
      if (e?.name === "AbortError") throw new Error("Firecrawl: délai dépassé (page trop lente).");
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Firecrawl: échec après plusieurs tentatives.");
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
