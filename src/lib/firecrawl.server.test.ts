import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const KEY = "fc-test-key";

describe("firecrawl.server (contrat HTTP, fetch mocké)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.FIRECRAWL_API_KEY = KEY;
  });
  afterEach(() => {
    delete process.env.FIRECRAWL_API_KEY;
    vi.restoreAllMocks();
  });

  it("lève FirecrawlNotConfiguredError sans clé", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const mod = await import("./firecrawl.server");
    expect(mod.isFirecrawlConfigured()).toBe(false);
    await expect(mod.scrapeListing("https://x.fr/a")).rejects.toThrow(
      mod.FirecrawlNotConfiguredError,
    );
  });

  it("envoie le bon payload (url, format json, schema, Authorization) et parse data.json", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { json: { title: "T2", price: "180 000 €", surface: "45 m²", rooms: "T2" } },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("./firecrawl.server");
    expect(mod.isFirecrawlConfigured()).toBe(true);
    const raw = await mod.scrapeListing("https://www.leboncoin.fr/x/123.htm");

    expect(raw.price).toBe("180 000 €");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.firecrawl.dev/v1/scrape");
    expect((init.headers as any).Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body as string);
    expect(body.url).toBe("https://www.leboncoin.fr/x/123.htm");
    expect(body.formats).toContain("json");
    expect(body.jsonOptions.schema.properties.price).toBeTruthy();
  });

  it("remonte une erreur explicite sur success:false", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ success: false, error: "blocked" }) }),
    );
    const mod = await import("./firecrawl.server");
    await expect(mod.scrapeListing("https://x.fr/a")).rejects.toThrow(/blocked/);
  });

  it("remonte une erreur sur HTTP non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 402, text: async () => "payment required" }),
    );
    const mod = await import("./firecrawl.server");
    await expect(mod.scrapeListing("https://x.fr/a")).rejects.toThrow(/402/);
  });

  it("scrapeListings extrait et borne la liste d'annonces", async () => {
    const listings = Array.from({ length: 30 }, (_, i) => ({
      price: `${100000 + i}`,
      surface: "40",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { json: { listings } } }),
      }),
    );
    const mod = await import("./firecrawl.server");
    const out = await mod.scrapeListings("https://www.seloger.com/list?city=rennes", 15);
    expect(out).toHaveLength(15);
    expect(out[0].price).toBe("100000");
  });

  it("envoie des options de fiabilité adaptées aux portails FR", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { json: { price: "1" } } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("./firecrawl.server");
    await mod.scrapeListing("https://www.leboncoin.fr/x/1.htm");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.proxy).toBe("auto");
    expect(body.location.country).toBe("FR");
    expect(body.waitFor).toBeGreaterThan(0);
  });

  it("retente sur une erreur transitoire (429) puis réussit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { json: { price: "100000" } } }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("./firecrawl.server");
    const raw = await mod.scrapeListing("https://x.fr/a");
    expect(raw.price).toBe("100000");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("abandonne après 3 tentatives sur 5xx persistant", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "down" });
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("./firecrawl.server");
    await expect(mod.scrapeListing("https://x.fr/a")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("parse les variantes de schéma de réponse (data.extract)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { extract: { price: "120000", surface: "40" } } }),
      }),
    );
    const mod = await import("./firecrawl.server");
    const raw = await mod.scrapeListing("https://x.fr/a");
    expect(raw.price).toBe("120000");
  });
});
