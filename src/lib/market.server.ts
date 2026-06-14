/**
 * Récupère des données de marché par code postal/INSEE depuis les APIs publiques data.gouv :
 *  - geo.api.gouv.fr : résolution CP -> commune(s) -> code INSEE
 *  - opendata.paris.fr : encadrement des loyers Paris (zones + loyers de référence majorés)
 *
 * Les autres agglomérations encadrées (Lille, Lyon, Bordeaux, Montpellier, Plaine
 * Commune, Est Ensemble, Pays Basque) utilisent des datasets séparés ; on les ajoutera
 * progressivement avec le même contrat (rent_cap_unfurnished / rent_cap_furnished).
 *
 * NE PAS importer ce module depuis du code client (TanStack le bloque automatiquement
 * grâce au suffixe `.server`).
 */

const GEO_API = "https://geo.api.gouv.fr";
const PARIS_ENCADREMENT_DATASET =
  "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/logement-encadrement-des-loyers/records";

export type GeoCommune = {
  inseeCode: string;
  postalCode: string;
  communeName: string;
  departmentCode?: string;
  regionCode?: string;
};

export type RentControl = {
  rentControlled: boolean;
  rentCapUnfurnished?: number; // €/m²
  rentCapFurnished?: number; // €/m²
  regulationZone?: string; // ex: "Zone 1"
  regulationSource?: string; // ex: "Paris OpenData — Encadrement des loyers"
  raw?: unknown;
};

export type MarketData = GeoCommune & RentControl;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  return (await res.json()) as T;
}

/**
 * Résout un code postal en commune (avec INSEE). Pour les CP qui couvrent
 * plusieurs communes, retourne la première par défaut, mais expose la liste.
 */
export async function resolveCommunes(postalCode: string): Promise<GeoCommune[]> {
  const cp = postalCode.trim();
  if (!/^\d{5}$/.test(cp)) throw new Error("INVALID_POSTAL_CODE");
  const data = await getJson<Array<any>>(
    `${GEO_API}/communes?codePostal=${cp}&fields=nom,code,codeDepartement,codeRegion,codesPostaux`,
  );
  if (!Array.isArray(data) || data.length === 0) throw new Error("POSTAL_CODE_NOT_FOUND");
  return data.map((c) => ({
    inseeCode: String(c.code),
    postalCode: cp,
    communeName: String(c.nom),
    departmentCode: c.codeDepartement ? String(c.codeDepartement) : undefined,
    regionCode: c.codeRegion ? String(c.codeRegion) : undefined,
  }));
}

/** Codes INSEE des arrondissements de Paris (75101..75120) */
function isParisArrondissement(insee: string): boolean {
  return /^751(0\d|1\d|20)$/.test(insee);
}

/**
 * Encadrement des loyers Paris : on agrège les loyers de référence MAJORÉS
 * pour l'arrondissement, toutes pièces / époques confondues, puis on prend la
 * médiane comme cap conservateur. La donnée est mise à jour chaque année.
 *
 * Schéma du dataset (champs utiles) :
 *  - id_zone, nom_quartier, code_grand_quartier, secteur_geographique
 *  - epoque, type_de_location ("meuble" | "non meuble"), piece, nombre_de_pieces
 *  - loyers_de_reference_majores (€/m²)
 */
async function fetchParisRentControl(insee: string): Promise<RentControl | null> {
  if (!isParisArrondissement(insee)) return null;
  // Le dataset Paris stocke l'arrondissement sur "code_grand_quartier" (les 3 premiers
  // chiffres) ou via "nom_quartier". Plus fiable : filtrer sur "id_zone" et croiser
  // avec le secteur. On simplifie : on récupère le dernier millésime puis on filtre
  // côté code par le code arrondissement (les 2 derniers chiffres de l'INSEE = numéro).
  const arr = parseInt(insee.slice(-2), 10); // 1..20
  // L'API exodata supporte "where" SQL-like, limit 100. On boucle par paquets si besoin.
  const where = encodeURIComponent(`code_grand_quartier like "75${String(arr).padStart(2, "0")}%"`);
  const url = `${PARIS_ENCADREMENT_DATASET}?where=${where}&limit=100&order_by=annee DESC`;
  let json: any;
  try {
    json = await getJson<any>(url);
  } catch {
    return { rentControlled: true, regulationSource: "Paris OpenData (indisponible)", raw: { error: "fetch_failed" } };
  }
  const rows: any[] = json?.results ?? [];
  if (rows.length === 0) {
    return { rentControlled: true, regulationSource: "Paris OpenData (sans données pour cet arrondissement)" };
  }
  const latestYear = Math.max(...rows.map((r) => Number(r.annee ?? 0)));
  const current = rows.filter((r) => Number(r.annee) === latestYear);
  const meuble = current.filter((r) => String(r.type_de_location ?? "").toLowerCase().includes("meuble"));
  const nu = current.filter((r) => !String(r.type_de_location ?? "").toLowerCase().includes("meuble"));
  const median = (arr: number[]) => {
    if (arr.length === 0) return undefined;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };
  const capNu = median(nu.map((r) => Number(r.loyers_de_reference_majores)).filter((n) => Number.isFinite(n) && n > 0));
  const capMeuble = median(
    meuble.map((r) => Number(r.loyers_de_reference_majores)).filter((n) => Number.isFinite(n) && n > 0),
  );
  return {
    rentControlled: true,
    rentCapUnfurnished: capNu ? Number(capNu.toFixed(2)) : undefined,
    rentCapFurnished: capMeuble ? Number(capMeuble.toFixed(2)) : undefined,
    regulationZone: `Paris ${arr}e`,
    regulationSource: `Paris OpenData — Encadrement des loyers (${latestYear})`,
    raw: { year: latestYear, samples: current.length },
  };
}

/**
 * Récupère les données de marché complètes pour un code postal en interrogeant
 * les sources publiques. Si plusieurs communes partagent le CP, on choisit la
 * première (ou celle correspondant au `preferredInsee` fourni).
 */
export async function fetchMarketData(postalCode: string, preferredInsee?: string): Promise<MarketData> {
  const communes = await resolveCommunes(postalCode);
  const commune = (preferredInsee && communes.find((c) => c.inseeCode === preferredInsee)) || communes[0];
  const control = (await fetchParisRentControl(commune.inseeCode)) ?? { rentControlled: false };
  return { ...commune, ...control };
}
