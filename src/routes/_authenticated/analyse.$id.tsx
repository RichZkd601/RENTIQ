import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getAnalysis } from "@/lib/analysis.functions";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Download, Info, Loader2, Pencil, XCircle } from "lucide-react";
import { generateAnalysisPdf } from "@/lib/pdf";
import { track } from "@/lib/analytics";
import type { StrategyKey } from "@/lib/calculator";

const STRATEGY_LABELS: Record<StrategyKey, string> = {
  location_nue: "Location nue",
  lmnp_longue_duree: "Location Meublée Non Professionnelle (LMNP) longue durée",
  bail_mobilite: "Bail mobilité",
  colocation: "Colocation",
  coliving: "Coliving",
  airbnb: "Airbnb / courte durée",
};

export const Route = createFileRoute("/_authenticated/analyse/$id")({
  head: () => ({
    meta: [{ title: "Résultat d'analyse — RentIQ" }],
  }),
  component: AnalysePage,
});

function AnalysePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchAnalysis = useServerFn(getAnalysis);
  const { data, isLoading, error } = useQuery({
    queryKey: ["analysis", id],
    queryFn: () => fetchAnalysis({ data: { id } }),
  });

  const trackedRef = useRef(false);
  useEffect(() => {
    if (data && !trackedRef.current) {
      trackedRef.current = true;
      const ai = (data as any)?.ai_analysis;
      track("verdict_viewed", {
        analysis_id: id,
        decision: ai?.decision ?? null,
        winner_strategy: ai?.winnerStrategy ?? null,
      });
    }
  }, [data, id]);

  const editForm = (extra?: Record<string, unknown>) => {
    const input = (data?.calc as any)?.input;
    if (input && typeof window !== "undefined") {
      sessionStorage.setItem("rentiq:prefill", JSON.stringify({ ...input, ...(extra ?? {}) }));
    }
    navigate({ to: "/analyser" });
  };

  const downloadPdf = () => {
    if (!data) return;
    track("pdf_downloaded", { analysis_id: id });
    generateAnalysisPdf(data);
  };

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-4xl items-center justify-center px-4 py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20">
        <Alert variant="destructive">
          <AlertTitle>Analyse introuvable</AlertTitle>
          <AlertDescription>{(error as Error)?.message ?? "Cette analyse n'existe pas ou ne vous appartient pas."}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const calc = data.calc as any;
  const ai = data.ai_analysis as any;
  const matched = calc?.matched;
  const flip = calc?.flip;
  const ranked = matched?.ranked ?? [];
  const all = matched?.strategies ?? [];
  const banner = matched?.regulatoryBanner;
  const winner = ranked.find((s: any) => s.strategy === ai?.winnerStrategy) ?? ranked[0];
  const verdict = calc?.verdict as
    | { score: number; decision: "acheter" | "negocier" | "fuir"; emoji: string; label: string; reasons: string[]; maxRecommendedPrice: number | null; breakdown: Record<string, number> }
    | undefined;

  const decisionStyles = verdict
    ? verdict.decision === "acheter"
      ? { ring: "ring-emerald-500/40", bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-300" }
      : verdict.decision === "negocier"
        ? { ring: "ring-amber-500/40", bg: "bg-amber-50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-300" }
        : { ring: "ring-rose-500/40", bg: "bg-rose-50 dark:bg-rose-950/20", text: "text-rose-700 dark:text-rose-300", border: "border-rose-300" }
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      {/* Actions rapides (haut) */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => editForm()}>
          <Pencil className="mr-1 h-4 w-4" />Modifier le formulaire
        </Button>
      </div>

      {/* Bandeau réglementaire */}
      {banner && (
        <Alert variant={banner.level === "danger" ? "destructive" : "default"}>
          {banner.level === "danger" ? <XCircle className="h-4 w-4" /> : banner.level === "warning" ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          <AlertTitle className="capitalize">{banner.level === "danger" ? "Interdiction" : banner.level === "warning" ? "Attention" : "Information"}</AlertTitle>
          <AlertDescription>{banner.message}</AlertDescription>
        </Alert>
      )}

      {/* Hero verdict (Score /100 + décision tranchée) */}
      {verdict && decisionStyles && (
        <Card className={`overflow-hidden border-2 ${decisionStyles.border}`}>
          <CardContent className={`p-6 sm:p-8 ${decisionStyles.bg}`}>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-6">
                <div className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-background ring-4 ${decisionStyles.ring} shadow-sm`}>
                  <div className="text-center">
                    <div className={`text-3xl font-bold ${decisionStyles.text}`}>{verdict.score}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">/100</div>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Verdict RentIQ</p>
                  <h2 className={`text-2xl sm:text-3xl font-bold ${decisionStyles.text}`}>
                    <span className="mr-2">{verdict.emoji}</span>{verdict.label}
                  </h2>
                  {verdict.maxRecommendedPrice != null && verdict.decision !== "acheter" && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Prix max conseillé : <span className="font-mono font-semibold">{verdict.maxRecommendedPrice.toLocaleString("fr-FR")} €</span>
                      {" "}(vs <span className="font-mono">{Number(data.purchase_price).toLocaleString("fr-FR")} €</span> demandé)
                    </p>
                  )}
                </div>
              </div>
            </div>
            {verdict.reasons?.length > 0 && (
              <ul className="mt-5 space-y-1.5 text-sm">
                {verdict.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2"><span className={decisionStyles.text}>•</span><span>{r}</span></li>
                ))}
              </ul>
            )}
            {/* Mini-breakdown */}
            <div className="mt-5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
              {Object.entries(verdict.breakdown).map(([k, v]) => (
                <div key={k} className="rounded-md border bg-background/60 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {k === "cashflow" ? "Cashflow" : k === "yield" ? "Rendement" : k === "regulation" ? "Régulation" : k === "tension" ? "Tension" : "Plus-value"}
                  </div>
                  <div className="mt-0.5 font-mono font-semibold">{Math.round(v)}<span className="text-muted-foreground">/100</span></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggestions : hypothèses non explorées */}
      {(() => {
        const input = (calc?.input ?? {}) as Record<string, any>;
        const hypotheses: Array<{
          key: string;
          label: string;
          icon: string;
          why: string;
          strategies: StrategyKey[];
          filled: boolean;
          prefill: Record<string, unknown>;
        }> = [
          {
            key: "nu",
            label: "Location nue",
            icon: "🏠",
            why: "Gestion ultra-simple, locataire long terme, fiscalité micro-foncier ou réel.",
            strategies: ["location_nue"],
            filled: !!input.monthlyNu,
            prefill: { monthlyNu: input.monthlyNu ?? 0 },
          },
          {
            key: "meuble",
            label: "LMNP longue durée",
            icon: "🛋️",
            why: "Amortissement comptable → souvent 0 € d'impôt pendant 10-15 ans.",
            strategies: ["lmnp_longue_duree", "bail_mobilite"],
            filled: !!input.monthlyMeuble,
            prefill: { monthlyMeuble: input.monthlyMeuble ?? 0 },
          },
          {
            key: "coloc",
            label: "Colocation",
            icon: "👥",
            why: "+20 à +40 % de loyer vs LMNP classique sur un T3/T4.",
            strategies: ["colocation", "coliving"],
            filled: !!(input.colocRoomRent || input.colocRoomCount),
            prefill: { colocRoomRent: input.colocRoomRent ?? 0, colocRoomCount: input.colocRoomCount ?? 0 },
          },
          {
            key: "airbnb",
            label: "Airbnb / courte durée",
            icon: "🏖️",
            why: "Potentiel cashflow le plus élevé si la zone le permet.",
            strategies: ["airbnb"],
            filled: !!input.airbnbNightly,
            prefill: { airbnbNightly: input.airbnbNightly ?? 0, airbnbOccupancy: input.airbnbOccupancy ?? 0 },
          },
        ];
        const winnerCf = winner?.monthlyNetCashflow ?? 0;
        const missing = hypotheses
          .filter((h) => !h.filled)
          .map((h) => {
            const best = h.strategies
              .map((sk) => all.find((s: any) => s.strategy === sk))
              .filter((s: any) => s && s.eligible)
              .sort((a: any, b: any) => (b?.monthlyNetCashflow ?? -Infinity) - (a?.monthlyNetCashflow ?? -Infinity))[0];
            const blocked = h.strategies
              .map((sk) => all.find((s: any) => s.strategy === sk))
              .find((s: any) => s && !s.eligible);
            return { ...h, best, blocked };
          });
        if (missing.length === 0) return null;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">💡 Explorer d'autres stratégies</CardTitle>
              <p className="text-sm text-muted-foreground">
                Tu n'as renseigné qu'une partie des hypothèses. Voici les pistes que tu n'as pas testées — souvent plus rentables selon le bien.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {missing.map((h) => {
                const cf = h.best?.monthlyNetCashflow ?? null;
                const delta = cf != null ? cf - winnerCf : null;
                const isBetter = delta != null && delta > 0;
                return (
                  <div key={h.key} className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{h.icon}</span>
                        <p className="font-medium">{h.label}</p>
                        {isBetter && (
                          <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                            +{delta} €/mois vs actuel
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{h.why}</p>
                      {h.blocked && (
                        <p className="mt-1 text-xs text-amber-700">⚠️ {h.blocked.blockedReason}</p>
                      )}
                      {cf != null && !isBetter && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Estimation à confirmer : {cf >= 0 ? "+" : ""}{cf} €/mois
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={isBetter ? "default" : "outline"}
                      onClick={() => editForm(h.prefill)}
                    >
                      Tester
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}



      {/* Hero verdict (stratégie) */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Stratégie recommandée</p>
              <CardTitle className="mt-1 text-3xl">
                {ai?.winnerStrategy === "aucune" ? "Ne pas acheter" : STRATEGY_LABELS[ai?.winnerStrategy as StrategyKey] ?? STRATEGY_LABELS[winner?.strategy as StrategyKey] ?? "—"}
              </CardTitle>
            </div>
            {winner && ai?.winnerStrategy !== "aucune" && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Cashflow / mois</p>
                <p className={`text-3xl font-bold ${winner.monthlyNetCashflow >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {winner.monthlyNetCashflow >= 0 ? "+" : ""}{winner.monthlyNetCashflow} €
                </p>
                <p className="text-xs text-muted-foreground">Rendement net {winner.netYieldPct}%</p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <p className="text-sm leading-relaxed">{ai?.rationale}</p>
        </CardContent>
      </Card>


      {/* Forces / Risques / Reco */}
      <div className="grid gap-4 md:grid-cols-3">
        <BulletCard title="Forces" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} items={ai?.forces ?? []} />
        <BulletCard title="Risques" icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} items={ai?.risks ?? []} />
        <BulletCard title="Recommandations" icon={<ArrowRight className="h-4 w-4 text-primary" />} items={ai?.recommendations ?? []} />
      </div>

      {/* Podium / Comparatif */}
      <Card>
        <CardHeader>
          <CardTitle>Comparatif des 6 stratégies</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Stratégie</th>
                <th className="px-4 py-3 text-right">Cashflow/mois</th>
                <th className="px-4 py-3 text-right">Rendement net</th>
                <th className="px-4 py-3 text-left">Régime fiscal</th>
                <th className="px-4 py-3 text-left">Statut</th>
              </tr>
            </thead>
            <tbody>
              {all.map((s: any) => (
                <tr key={s.strategy} className={`border-b last:border-0 ${!s.eligible ? "bg-muted/20 text-muted-foreground" : ""}`}>
                  <td className="px-4 py-3 font-medium">
                    {STRATEGY_LABELS[s.strategy as StrategyKey]}
                    {winner?.strategy === s.strategy && <Badge className="ml-2" variant="default">Top</Badge>}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${s.eligible ? (s.monthlyNetCashflow >= 0 ? "text-emerald-600" : "text-rose-600") : ""}`}>
                    {s.eligible ? `${s.monthlyNetCashflow >= 0 ? "+" : ""}${s.monthlyNetCashflow} €` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{s.eligible ? `${s.netYieldPct}%` : "—"}</td>
                  <td className="px-4 py-3 text-xs">{s.eligible ? s.taxRegime : "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {s.eligible ? (
                      <Badge variant="secondary">Éligible · score {s.score}</Badge>
                    ) : (
                      <span className="text-amber-700">{s.blockedReason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Détail stratégies éligibles */}
      <div className="grid gap-4 md:grid-cols-2">
        {ranked.slice(0, 4).map((s: any) => (
          <Card key={s.strategy}>
            <CardHeader>
              <CardTitle className="text-base">{STRATEGY_LABELS[s.strategy as StrategyKey]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row k="Revenus annuels bruts" v={`${s.annualGrossRevenue.toLocaleString("fr-FR")} €`} />
              <Row k="Charges d'exploitation" v={`${s.annualOperatingCharges.toLocaleString("fr-FR")} €`} />
              <Row k="Annuités emprunt" v={`${s.annualMortgagePayment.toLocaleString("fr-FR")} €`} />
              <Row k="Impôt + Prélèvements Sociaux (PS)" v={`${s.annualTax.toLocaleString("fr-FR")} €`} />
              <Row k="Cashflow net annuel" v={`${s.annualNetCashflow.toLocaleString("fr-FR")} €`} accent={s.annualNetCashflow >= 0 ? "pos" : "neg"} />
              {s.notes?.length > 0 && (
                <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                  {s.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
                </ul>
              )}
              {s.regulatoryWarnings?.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-amber-700">
                  {s.regulatoryWarnings.map((n: string, i: number) => <li key={i}>⚠️ {n}</li>)}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Flip */}
      {flip && (
        <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10">
          <CardHeader>
            <CardTitle>Encart Flip (achat-revente)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Coût total opération" v={`${flip.totalCost.toLocaleString("fr-FR")} €`} />
            <Row k="Marge brute" v={`${flip.grossMargin.toLocaleString("fr-FR")} €`} />
            <Row k="Impôt sur la plus-value" v={`${flip.tax.toLocaleString("fr-FR")} €`} />
            <Row k="Marge nette" v={`${flip.netMargin.toLocaleString("fr-FR")} € (${flip.marginPct}%)`} accent={flip.netMargin >= 0 ? "pos" : "neg"} />
            <ul className="mt-3 space-y-1 border-t border-amber-300/60 pt-3 text-xs text-amber-900">
              {flip.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <p className="text-center text-xs text-muted-foreground">
        Résultats indicatifs basés sur la fiscalité 2026 connue à ce jour. Ne constitue pas un conseil en investissement.
        Validez toujours auprès d'un expert-comptable et de la mairie concernée avant tout engagement.
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => editForm()}>
          <Pencil className="mr-1 h-4 w-4" />Modifier le formulaire
        </Button>
        <Button variant="outline" onClick={downloadPdf}>
          <Download className="mr-1 h-4 w-4" />Télécharger en PDF
        </Button>
        <Button variant="outline" asChild>
          <Link to="/patrimoine/nouveau" search={{ fromAnalysis: id }}>
            <Building2 className="mr-1 h-4 w-4" />Ajouter à mon patrimoine
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/historique">Voir l'historique</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/analyser">Évaluer une autre opportunité</Link>
        </Button>
      </div>
    </div>
  );
}

function BulletCard({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">—</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {items.map((it, i) => <li key={i} className="leading-snug">• {it}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: "pos" | "neg" }) {
  const color = accent === "pos" ? "text-emerald-600" : accent === "neg" ? "text-rose-600" : "";
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className={`font-mono font-medium ${color}`}>{v}</span>
    </div>
  );
}
