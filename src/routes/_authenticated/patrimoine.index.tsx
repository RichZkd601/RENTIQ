import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Loader2, ArrowRight } from "lucide-react";
import { listProperties } from "@/lib/portfolio.functions";

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

const STRATEGY_LABELS: Record<string, string> = {
  location_nue: "Nue",
  lmnp_longue_duree: "LMNP",
  bail_mobilite: "Bail mobilité",
  colocation: "Colocation",
  coliving: "Coliving",
  airbnb: "Airbnb",
};
const FLAG_LABELS: Record<string, string> = {
  cashflow_negatif: "Cashflow négatif",
  rendement_faible: "Rendement faible",
  ltv_eleve: "LTV élevé",
  forte_plus_value: "Forte plus-value",
  candidat_arbitrage: "Arbitrage",
};

export const Route = createFileRoute("/_authenticated/patrimoine/")({
  head: () => ({ meta: [{ title: "Mon portefeuille — RentIQ" }] }),
  component: PatrimoinePage,
});

function PatrimoinePage() {
  const fetchList = useServerFn(listProperties);
  const list = useQuery({ queryKey: ["properties"], queryFn: () => fetchList({}) });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Patrimoine</div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Mon portefeuille <span className="text-gradient">immobilier</span></h1>
          <p className="text-sm text-muted-foreground">
            Vue consolidée de vos actifs, de votre dette et de votre cashflow.
          </p>
        </div>
        <Button variant="gradient" asChild>
          <Link to="/patrimoine/nouveau">
            <Plus className="mr-1 h-4 w-4" />
            Ajouter un actif
          </Link>
        </Button>
      </div>

      {list.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !list.data || list.data.length === 0 ? (
        <Card className="bg-aurora noise relative overflow-hidden border-dashed">
          <div className="bg-grid pointer-events-none absolute inset-0 -z-[1]" aria-hidden />
          <CardHeader className="relative z-[2]">
            <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow animate-pulse-glow">
              <Building2 className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">Votre portefeuille est encore vierge</CardTitle>
          </CardHeader>
          <CardContent className="relative z-[2] space-y-4 text-sm text-muted-foreground">
            <p className="max-w-lg">
              Ajoutez un actif détenu ou évaluez une nouvelle opportunité pour activer le cockpit
              patrimonial, les arbitrages recommandés et le copilote IA.
            </p>
            <Button variant="gradient" asChild>
              <Link to="/patrimoine/nouveau">
                <Plus className="mr-1 h-4 w-4" />
                Ajouter mon premier actif
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.data.map((p) => (
            <Card key={p.id} className="transition hover:border-primary/40">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.label}</span>
                    {p.strategy && (
                      <Badge variant="secondary" className="text-[10px]">
                        {STRATEGY_LABELS[p.strategy] ?? p.strategy}
                      </Badge>
                    )}
                    {p.status === "primary_residence" ? (
                      <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100 text-[10px]">
                        Résidence principale
                      </Badge>
                    ) : p.status !== "owned" ? (
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {p.status}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.cityName} · valeur {eur(p.currentValue)} · equity {eur(p.equity)}
                  </p>
                  {p.flags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.flags.map((f) => (
                        <span
                          key={f}
                          className={`rounded px-1.5 py-0.5 text-[10px] ${f === "cashflow_negatif" || f === "candidat_arbitrage" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}
                        >
                          {FLAG_LABELS[f] ?? f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    {p.status === "primary_residence" ? (
                      <>
                        <p className="font-mono text-sm font-semibold">{eur(p.equity)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          equity · {p.appreciationPct >= 0 ? "+" : ""}
                          {p.appreciationPct}% valeur
                        </p>
                      </>
                    ) : (
                      <>
                        <p
                          className={`font-mono text-sm font-semibold ${p.monthlyCashflow >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                        >
                          {p.monthlyCashflow >= 0 ? "+" : ""}
                          {p.monthlyCashflow} €/mois
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {p.grossYieldPct}% brut · {p.appreciationPct >= 0 ? "+" : ""}
                          {p.appreciationPct}% valeur
                        </p>
                      </>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/patrimoine/$id" params={{ id: p.id }}>
                      Ouvrir
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
