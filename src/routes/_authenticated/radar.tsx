import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Radar, Loader2, Plus, RefreshCw, Trash2, Target, Link2, Download } from "lucide-react";
import { toast } from "sonner";
import {
  listInvestorProfiles,
  createInvestorProfile,
  deleteInvestorProfile,
  scanProfile,
  listOpportunities,
  updateOpportunityStatus,
  addOpportunityFromUrl,
} from "@/lib/radar.functions";

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const STRATEGY_LABELS: Record<string, string> = {
  location_nue: "Nue",
  lmnp_longue_duree: "LMNP",
  bail_mobilite: "Bail mobilité",
  colocation: "Colocation",
  coliving: "Coliving",
  airbnb: "Airbnb",
};

export const Route = createFileRoute("/_authenticated/radar")({
  head: () => ({ meta: [{ title: "Radar de marché — RentIQ" }] }),
  component: RadarPage,
});

function RadarPage() {
  const list = useServerFn(listInvestorProfiles);
  const create = useServerFn(createInvestorProfile);
  const del = useServerFn(deleteInvestorProfile);
  const scan = useServerFn(scanProfile);
  const listOpp = useServerFn(listOpportunities);
  const setStatus = useServerFn(updateOpportunityStatus);
  const importUrl = useServerFn(addOpportunityFromUrl);

  const profiles = useQuery({ queryKey: ["investor-profiles"], queryFn: () => list({}) });
  const opps = useQuery({ queryKey: ["opportunities"], queryFn: () => listOpp({ data: {} }) });
  const [showForm, setShowForm] = useState(false);

  const scanM = useMutation({
    mutationFn: (profileId: string) => scan({ data: { profileId } }),
    onSuccess: (r: any) => {
      toast.success(`${r.detected} opportunité(s) détectée(s), ${r.matched} conforme(s) à votre thèse`);
      opps.refetch();
      profiles.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Scan échoué"),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Thèse d'investissement supprimée");
      profiles.refetch();
      opps.refetch();
    },
  });
  const dismissM = useMutation({
    mutationFn: (id: string) => setStatus({ data: { id, status: "dismissed" } }),
    onSuccess: () => opps.refetch(),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-[28px]">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
              <Radar className="h-5 w-5" />
            </span>
            Radar de <span className="text-gradient">marché</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Détectez en avance les opportunités qui correspondent à votre thèse d'investissement.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" />
          Nouvelle thèse d'investissement
        </Button>
      </div>

      {showForm && (
        <ProfileForm
          onCancel={() => setShowForm(false)}
          onSubmit={async (data) => {
            try {
              await create({ data });
              toast.success("Profil créé");
              setShowForm(false);
              profiles.refetch();
            } catch (e: any) {
              toast.error(e?.message ?? "Échec");
            }
          }}
        />
      )}

      {/* Profils */}
      {profiles.isLoading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      ) : (profiles.data?.length ?? 0) === 0 ? (
        <Card className="bg-aurora noise relative overflow-hidden border-dashed">
          <div className="bg-grid pointer-events-none absolute inset-0 -z-[1]" aria-hidden />
          <CardContent className="relative z-[2] flex flex-col items-start gap-3 py-8">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow animate-pulse-glow">
              <Radar className="h-6 w-6" />
            </div>
            <p className="max-w-lg text-sm text-muted-foreground">
              Aucune thèse pour l'instant. Créez votre premier radar (ville, budget, stratégie,
              cashflow minimum) et laissez RentIQ détecter les opportunités qui vous correspondent.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {profiles.data!.map((p: any) => (
            <ProfileCard
              key={p.id}
              p={p}
              onDelete={() => delM.mutate(p.id)}
              onScan={() => scanM.mutate(p.id)}
              scanning={scanM.isPending && scanM.variables === p.id}
              onImport={(url) => importUrl({ data: { profileId: p.id, url } })}
              onImported={() => {
                opps.refetch();
                profiles.refetch();
              }}
            />
          ))}
        </div>
      )}

      {/* Opportunités */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Target className="h-5 w-5" />
          Opportunités détectées
        </h2>
        {opps.isLoading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        ) : (opps.data?.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Lancez un scan sur un profil pour voir apparaître des opportunités scorées.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {opps.data!.map((o: any) => (
              <Card key={o.id} className={o.matches ? "border-emerald-300/50" : ""}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {o.city_name} · {o.surface_sqm} m² · {o.rooms} p.
                      </span>
                      <Badge variant={o.matches ? "default" : "secondary"} className="text-[10px]">
                        {o.match_score}/100
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {o.source === "demo" ? "démo" : o.source}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {eur(o.price)} · cashflow {o.monthly_cashflow >= 0 ? "+" : ""}
                      {Math.round(o.monthly_cashflow)} €/mois · {o.net_yield_pct}% net
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {o.source_url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={o.source_url} target="_blank" rel="noreferrer">
                          <Link2 className="mr-1 h-3.5 w-3.5" />
                          Annonce
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => dismissM.mutate(o.id)}>
                      Ignorer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileCard({
  p,
  onDelete,
  onScan,
  scanning,
  onImport,
  onImported,
}: {
  p: any;
  onDelete: () => void;
  onScan: () => void;
  scanning: boolean;
  onImport: (url: string) => Promise<any>;
  onImported: () => void;
}) {
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);

  const runImport = async () => {
    if (!url.trim()) return;
    setImporting(true);
    try {
      const r = await onImport(url.trim());
      toast.success(
        r?.matched
          ? "Annonce importée — elle correspond à vos critères !"
          : "Annonce importée et scorée",
      );
      setUrl("");
      onImported();
    } catch (e: any) {
      toast.error(e?.message ?? "Import échoué");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{p.label}</p>
            <p className="text-xs text-muted-foreground">
              {p.city_name} · ≤ {eur(p.max_budget)} · {STRATEGY_LABELS[p.strategy]} · CF ≥{" "}
              {p.min_monthly_cashflow} €
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Import d'une annonce réelle via son URL (Firecrawl) */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Coller une URL LeBonCoin / SeLoger…"
              className="h-8 pl-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") runImport();
              }}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={runImport}
            disabled={importing || !url.trim()}
          >
            {importing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {p.last_scanned_at
              ? `Scanné le ${new Date(p.last_scanned_at).toLocaleDateString("fr-FR")}`
              : "Jamais scanné"}
          </span>
          <Button size="sm" variant="outline" onClick={onScan} disabled={scanning}>
            {scanning ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            )}
            Scanner
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileForm({ onSubmit, onCancel }: { onSubmit: (d: any) => void; onCancel: () => void }) {
  const [f, setF] = useState({
    label: "",
    cityName: "",
    maxBudget: "",
    strategy: "lmnp_longue_duree",
    minMonthlyCashflow: "100",
    tmi: "0.3",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Nouveau profil investisseur</CardTitle>
        <CardDescription>Ex : Rennes, T2, ≤ 220 000 €, LMNP, cashflow ≥ 100 €.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nom du radar</Label>
            <Input
              value={f.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="Rennes cashflow"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ville</Label>
            <Input
              value={f.cityName}
              onChange={(e) => set("cityName", e.target.value)}
              placeholder="Rennes"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Budget max (€)</Label>
            <Input
              type="number"
              value={f.maxBudget}
              onChange={(e) => set("maxBudget", e.target.value)}
              placeholder="220000"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Stratégie</Label>
            <Select value={f.strategy} onValueChange={(v) => set("strategy", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STRATEGY_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cashflow min (€/mois)</Label>
            <Input
              type="number"
              value={f.minMonthlyCashflow}
              onChange={(e) => set("minMonthlyCashflow", e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              if (!f.label || !f.cityName || !f.maxBudget) {
                toast.error("Nom, ville et budget requis");
                return;
              }
              onSubmit({
                label: f.label,
                cityName: f.cityName,
                maxBudget: Number(f.maxBudget),
                strategy: f.strategy,
                minMonthlyCashflow: Number(f.minMonthlyCashflow),
                tmi: Number(f.tmi),
              });
            }}
          >
            Créer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
