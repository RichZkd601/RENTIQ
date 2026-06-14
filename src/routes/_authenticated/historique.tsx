import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Trash2, ArrowRight, AlertCircle } from "lucide-react";
import { listAnalyses, deleteAnalysis, getQuota } from "@/lib/analysis.functions";
import { toast } from "sonner";
import { useState } from "react";

const STRATEGY_LABELS: Record<string, string> = {
  location_nue: "Location nue",
  lmnp_longue_duree: "Location Meublée Non Professionnelle (LMNP) longue durée",
  bail_mobilite: "Bail mobilité",
  colocation: "Colocation",
  coliving: "Coliving",
  airbnb: "Airbnb",
  aucune: "Ne pas acheter",
};

export const Route = createFileRoute("/_authenticated/historique")({
  head: () => ({
    meta: [
      { title: "Historique — RentIQ" },
      { name: "description", content: "Vos analyses d'investissement immobilier sauvegardées." },
    ],
  }),
  component: HistoriquePage,
});

function HistoriquePage() {
  const fetchList = useServerFn(listAnalyses);
  const fetchQuota = useServerFn(getQuota);
  const remove = useServerFn(deleteAnalysis);
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["analyses"], queryFn: () => fetchList({}) });
  const quota = useQuery({ queryKey: ["quota"], queryFn: () => fetchQuota({}) });

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Analyse supprimée");
      list.refetch();
      quota.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression échouée"),
    onSettled: () => setPendingId(null),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vos analyses</h1>
          <p className="text-sm text-muted-foreground">Retrouvez et comparez tous vos projets analysés.</p>
        </div>
        <div className="flex items-center gap-3">
          {quota.data && (
            <Badge variant="outline" className="text-xs">
              {quota.data.used}/{quota.data.limit} ce mois · plan {quota.data.plan}
            </Badge>
          )}
          <Button asChild>
            <Link to="/analyser"><Plus className="mr-1 h-4 w-4" />Nouvelle analyse</Link>
          </Button>
        </div>
      </div>

      {quota.data && quota.data.remaining === 0 && (
        <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3 text-sm">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Quota mensuel atteint. Passez à un plan supérieur pour continuer.
            </div>
            <Button size="sm" asChild><Link to="/upgrade">Mettre à niveau</Link></Button>
          </CardContent>
        </Card>
      )}

      {list.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !list.data || list.data.length === 0 ? (
        <Card>
          <CardHeader><CardTitle>Aucune analyse pour l'instant</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Lancez votre première analyse en quelques secondes.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.data.map((a) => (
            <Card key={a.id} className="transition hover:border-primary/40">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.cityName}</span>
                    {a.propertyType && <Badge variant="secondary" className="text-[10px] uppercase">{a.propertyType}</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {a.surfaceM2}m² · {a.price.toLocaleString("fr-FR")} €
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                    {a.winnerStrategy && ` · ${STRATEGY_LABELS[a.winnerStrategy] ?? a.winnerStrategy}`}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {a.monthlyCashflow != null && (
                    <div className="text-right">
                      <p className={`font-mono text-sm font-semibold ${a.monthlyCashflow >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {a.monthlyCashflow >= 0 ? "+" : ""}{a.monthlyCashflow} €/mois
                      </p>
                      {a.netYieldPct != null && <p className="text-[10px] text-muted-foreground">{a.netYieldPct}% net</p>}
                    </div>
                  )}
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/analyse/$id" params={{ id: a.id }}>Ouvrir<ArrowRight className="ml-1 h-3 w-3" /></Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pendingId === a.id}
                    onClick={() => {
                      if (!confirm("Supprimer cette analyse ?")) return;
                      setPendingId(a.id);
                      del.mutate(a.id);
                    }}
                  >
                    {pendingId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
