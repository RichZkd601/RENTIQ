import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2, ArrowLeft, TrendingUp, Plus } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { getProperty, deleteProperty, addValuation } from "@/lib/portfolio.functions";

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const STRATEGY_LABELS: Record<string, string> = {
  location_nue: "Location nue",
  lmnp_longue_duree: "LMNP meublé",
  bail_mobilite: "Bail mobilité",
  colocation: "Colocation",
  coliving: "Coliving",
  airbnb: "Airbnb",
};

export const Route = createFileRoute("/_authenticated/patrimoine/$id")({
  head: () => ({ meta: [{ title: "Bien — RentIQ" }] }),
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchProperty = useServerFn(getProperty);
  const remove = useServerFn(deleteProperty);
  const addVal = useServerFn(addValuation);
  const [newValue, setNewValue] = useState("");

  const q = useQuery({
    queryKey: ["property", id],
    queryFn: () => fetchProperty({ data: { id } }),
  });

  const del = useMutation({
    mutationFn: () => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Bien supprimé");
      navigate({ to: "/patrimoine" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression échouée"),
  });
  const addValuationM = useMutation({
    mutationFn: (value: number) => addVal({ data: { propertyId: id, value } }),
    onSuccess: () => {
      toast.success("Valorisation ajoutée");
      setNewValue("");
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Échec"),
  });

  if (q.isLoading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (q.isError || !q.data)
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-sm text-muted-foreground">
        Bien introuvable.
      </div>
    );

  const p = q.data.property as any;
  const m = q.data.metrics;
  const chart = (q.data.valuations ?? []).map((v: any) => ({
    date: String(v.valued_at).slice(0, 7),
    value: Number(v.value),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/patrimoine">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Patrimoine
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-rose-600"
          onClick={() => {
            if (confirm("Supprimer ce bien ?")) del.mutate();
          }}
          disabled={del.isPending}
        >
          {del.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{p.label}</h1>
          {p.strategy && (
            <Badge variant="secondary">{STRATEGY_LABELS[p.strategy] ?? p.strategy}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {p.city_name} · {p.surface_sqm} m² · acquis le{" "}
          {new Date(p.purchase_date).toLocaleDateString("fr-FR")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Valeur actuelle" value={eur(p.current_value)} />
        <Kpi label="Dette restante" value={eur(m.remainingDebt)} />
        <Kpi label="Equity" value={eur(m.equity)} tone="pos" />
        <Kpi
          label="Cashflow / mois"
          value={`${m.monthlyCashflow >= 0 ? "+" : ""}${m.monthlyCashflow} €`}
          tone={m.monthlyCashflow >= 0 ? "pos" : "neg"}
        />
        <Kpi label="Rendement brut" value={`${m.grossYieldPct}%`} />
        <Kpi label="Cash-on-cash" value={`${m.cashOnCashPct}%`} />
        <Kpi
          label="Plus-value"
          value={`${m.appreciationPct >= 0 ? "+" : ""}${m.appreciationPct}%`}
          tone={m.appreciationPct >= 0 ? "pos" : "neg"}
        />
        <Kpi label="LTV" value={`${m.ltvPct}%`} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Historique de valorisation
          </CardTitle>
          <CardDescription>
            Ajoutez une estimation pour suivre la plus-value latente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {chart.length > 1 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                    width={38}
                  />
                  <Tooltip formatter={(v: number) => eur(v)} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(160 84% 39%)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pas encore assez de points pour tracer une courbe.
            </p>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-muted-foreground">Nouvelle estimation (€)</label>
              <Input
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={String(p.current_value)}
              />
            </div>
            <Button
              onClick={() => {
                const v = Number(newValue);
                if (v > 0) addValuationM.mutate(v);
              }}
              disabled={addValuationM.isPending || !newValue}
            >
              {addValuationM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Détail</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Detail label="Prix d'achat" value={eur(p.purchase_price)} />
          <Detail label="Loyer brut" value={`${Math.round(p.monthly_rent_gross)} €/mois`} />
          <Detail label="Taxe foncière" value={`${Math.round(p.property_tax)} €/an`} />
          <Detail label="Charges copro" value={`${Math.round(p.copro)} €/an`} />
          <Detail label="Capital emprunté" value={eur(p.loan_amount)} />
          <Detail label="Taux" value={`${(Number(p.loan_rate) * 100).toFixed(2)}%`} />
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p
          className={`font-mono text-base font-semibold ${tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-rose-600" : ""}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p className="font-medium">{value}</p>
    </div>
  );
}
