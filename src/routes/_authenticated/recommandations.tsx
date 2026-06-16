import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Lightbulb,
  Loader2,
  RefreshCw,
  Check,
  X,
  TrendingUp,
  ArrowLeftRight,
  Banknote,
  Repeat,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import {
  listRecommendations,
  generatePortfolioRecommendations,
  updateRecommendationStatus,
} from "@/lib/recommendations.functions";

const TYPE_META: Record<string, { icon: React.ReactNode; label: string }> = {
  rent_increase: { icon: <TrendingUp className="h-4 w-4" />, label: "Hausse de loyer" },
  strategy_switch: {
    icon: <ArrowLeftRight className="h-4 w-4" />,
    label: "Changement de stratégie",
  },
  refinancing: { icon: <Repeat className="h-4 w-4" />, label: "Refinancement" },
  arbitrage_sell: { icon: <Banknote className="h-4 w-4" />, label: "Arbitrage" },
  tax_optimization: { icon: <Receipt className="h-4 w-4" />, label: "Optimisation fiscale" },
};
const CONF: Record<string, string> = {
  haute: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  moyenne: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  faible: "bg-muted text-muted-foreground",
};

export const Route = createFileRoute("/_authenticated/recommandations")({
  head: () => ({ meta: [{ title: "Arbitrages recommandés — RentIQ" }] }),
  component: RecommandationsPage,
});

function RecommandationsPage() {
  const list = useServerFn(listRecommendations);
  const gen = useServerFn(generatePortfolioRecommendations);
  const setStatus = useServerFn(updateRecommendationStatus);

  const q = useQuery({ queryKey: ["recos", "open"], queryFn: () => list({ data: {} }) });

  const genM = useMutation({
    mutationFn: () => gen({}),
    onSuccess: (r: any) => {
      toast.success(`${r.generated} arbitrage(s) identifié(s)`);
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Génération échouée"),
  });
  const actM = useMutation({
    mutationFn: (v: { id: string; status: "done" | "dismissed" }) => setStatus({ data: v }),
    onSuccess: () => q.refetch(),
  });

  const totalGain = (q.data ?? []).reduce(
    (s: number, r: any) => s + Number(r.estimated_monthly_gain),
    0,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Lightbulb className="h-6 w-6" />
            Arbitrages recommandés
          </h1>
          <p className="text-sm text-muted-foreground">
            Les décisions qui peuvent faire progresser votre patrimoine cette année.
          </p>
        </div>
        <Button onClick={() => genM.mutate()} disabled={genM.isPending}>
          {genM.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-4 w-4" />
          )}
          Réévaluer mon portefeuille
        </Button>
      </div>

      {totalGain > 0 && (
        <Card className="border-emerald-300/50 bg-emerald-50/40 dark:bg-emerald-950/10">
          <CardContent className="py-4 text-sm">
            Potentiel patrimonial identifié :{" "}
            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
              +{Math.round(totalGain)} €/mois
            </span>
          </CardContent>
        </Card>
      )}

      {q.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (q.data?.length ?? 0) === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Aucun arbitrage en attente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Ajoutez des actifs à votre portefeuille puis lancez une évaluation pour faire émerger
              les arbitrages les plus pertinents.
            </p>
            <Button onClick={() => genM.mutate()} disabled={genM.isPending}>
              <RefreshCw className="mr-1 h-4 w-4" />
              Évaluer mon portefeuille
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {q.data!.map((r: any) => {
            const meta = TYPE_META[r.type] ?? {
              icon: <Lightbulb className="h-4 w-4" />,
              label: r.type,
            };
            return (
              <Card key={r.id}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {meta.icon}
                      <span className="font-medium">{r.title}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {meta.label}
                      </Badge>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${CONF[r.confidence]}`}>
                        {r.confidence}
                      </span>
                    </div>
                    {Number(r.estimated_monthly_gain) > 0 && (
                      <span className="font-mono text-sm font-semibold text-emerald-600">
                        +{Math.round(Number(r.estimated_monthly_gain))} €/mois
                      </span>
                    )}
                    {Number(r.estimated_monthly_gain) === 0 &&
                      Number(r.estimated_oneoff_gain) > 0 && (
                        <span className="font-mono text-sm font-semibold text-emerald-600">
                          +{Math.round(Number(r.estimated_oneoff_gain)).toLocaleString("fr-FR")} €
                        </span>
                      )}
                  </div>
                  <p className="text-sm text-muted-foreground">{r.description}</p>
                  {r.properties && (
                    <p className="text-[11px] text-muted-foreground">Bien : {r.properties.label}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => actM.mutate({ id: r.id, status: "done" })}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Traité
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => actM.mutate({ id: r.id, status: "dismissed" })}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Ignorer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
