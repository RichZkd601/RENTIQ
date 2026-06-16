import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Loader2, ExternalLink, X, Building2 } from "lucide-react";
import { listRegulatoryAlerts, setAlertStatus } from "@/lib/watch.functions";

const SEV: Record<string, { cls: string; label: string }> = {
  danger: { cls: "border-rose-300/60 bg-rose-50/40 dark:bg-rose-950/10", label: "Critique" },
  warning: { cls: "border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10", label: "Attention" },
  info: { cls: "", label: "Info" },
};

export const Route = createFileRoute("/_authenticated/veille")({
  head: () => ({ meta: [{ title: "Veille réglementaire — RentIQ" }] }),
  component: VeillePage,
});

function VeillePage() {
  const list = useServerFn(listRegulatoryAlerts);
  const setStatus = useServerFn(setAlertStatus);
  const q = useQuery({ queryKey: ["regulatory-alerts"], queryFn: () => list({}) });

  const dismiss = useMutation({
    mutationFn: (alertId: string) => setStatus({ data: { alertId, status: "dismissed" } }),
    onSuccess: () => q.refetch(),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldAlert className="h-6 w-6" />
          Veille réglementaire et fiscale
        </h1>
        <p className="text-sm text-muted-foreground">
          Restez en avance sur les évolutions qui impactent votre patrimoine et vos stratégies.
        </p>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (q.data?.length ?? 0) === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Aucune évolution à signaler</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Aucune évolution réglementaire détectée sur vos villes. Ajoutez des actifs ou des thèses
            d'investissement pour cibler la veille.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {q.data!.map((a: any) => {
            const sev = SEV[a.severity] ?? SEV.info;
            return (
              <Card key={a.id} className={sev.cls}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          a.severity === "danger"
                            ? "destructive"
                            : a.severity === "warning"
                              ? "default"
                              : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {sev.label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {a.cityName ?? "National"}
                      </Badge>
                      <span className="font-medium">{a.title}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => dismiss.mutate(a.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">{a.body}</p>
                  {a.impactedProperties?.length > 0 && (
                    <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      <Building2 className="h-3 w-3" />
                      Concerne : {a.impactedProperties.map((p: any) => p.label).join(", ")}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    {a.effectiveDate && (
                      <span>
                        En vigueur : {new Date(a.effectiveDate).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                    {a.sourceUrl && (
                      <a
                        href={a.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        Source <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
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
