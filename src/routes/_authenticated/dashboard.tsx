import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  TrendingUp,
  Wallet,
  Radar,
  Bell,
  Lightbulb,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  Loader2,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getPortfolioOverview } from "@/lib/portfolio.functions";
import { listNotifications } from "@/lib/notifications.functions";
import { listRecommendations } from "@/lib/recommendations.functions";
import { listRegulatoryAlerts } from "@/lib/watch.functions";

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Cockpit patrimonial — RentIQ" },
      {
        name: "description",
        content: "Pilotez votre patrimoine immobilier : valeur, dette, cashflow, recommandations.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const overview = useServerFn(getPortfolioOverview);
  const notifs = useServerFn(listNotifications);
  const recos = useServerFn(listRecommendations);
  const alerts = useServerFn(listRegulatoryAlerts);

  const ov = useQuery({ queryKey: ["portfolio-overview"], queryFn: () => overview({}) });
  const nq = useQuery({ queryKey: ["notifications"], queryFn: () => notifs({}) });
  const rq = useQuery({ queryKey: ["recos", "open"], queryFn: () => recos({ data: {} }) });
  const aq = useQuery({ queryKey: ["alerts"], queryFn: () => alerts({}) });

  if (ov.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const s = ov.data?.summary;
  const empty = (ov.data?.propertyCount ?? 0) === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Cockpit
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">
            Pilotez votre <span className="text-gradient">patrimoine</span>.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Votre patrimoine en un coup d'œil. Vos prochaines décisions, priorisées.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/analyser">
              <Sparkles className="mr-1 h-4 w-4" />
              Évaluer une opportunité
            </Link>
          </Button>
          <Button variant="gradient" asChild>
            <Link to="/patrimoine/nouveau">
              <Plus className="mr-1 h-4 w-4" />
              Ajouter un actif
            </Link>
          </Button>
        </div>
      </div>

      {empty ? (
        <Card className="bg-aurora noise relative overflow-hidden border-dashed">
          <div className="bg-grid pointer-events-none absolute inset-0 -z-[1]" aria-hidden />
          <CardHeader className="relative z-[2]">
            <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow animate-pulse-glow">
              <Building2 className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">Construisez votre portefeuille</CardTitle>
            <CardDescription className="max-w-lg">
              Ajoutez vos premiers actifs pour activer le cockpit : valeur patrimoniale, cashflow net,
              arbitrages recommandés et copilote IA.
            </CardDescription>
          </CardHeader>
          <CardContent className="relative z-[2] flex flex-wrap gap-2">
            <Button variant="gradient" asChild>
              <Link to="/patrimoine/nouveau">
                <Plus className="mr-1 h-4 w-4" />
                Ajouter mon premier actif
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/radar">
                <Radar className="mr-1 h-4 w-4" />
                Configurer mon radar de marché
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={<Building2 className="h-4 w-4" />}
              label="Valeur patrimoniale"
              value={eur(s!.totalValue)}
              sub={`${ov.data!.propertyCount} actif(s)`}
            />
            <Kpi
              icon={<TrendingUp className="h-4 w-4" />}
              label="Valeur nette"
              value={eur(s!.netWorth)}
              sub={`encours de crédit ${eur(s!.totalDebt)}`}
            />
            <Kpi
              icon={<Wallet className="h-4 w-4" />}
              label="Cashflow net mensuel"
              value={`${s!.monthlyCashflow >= 0 ? "+" : ""}${s!.monthlyCashflow} €`}
              sub={`${eur(s!.annualCashflow)} / an`}
              tone={s!.monthlyCashflow >= 0 ? "pos" : "neg"}
            />
            <Kpi
              icon={<TrendingUp className="h-4 w-4" />}
              label="Rendement brut pondéré"
              value={`${s!.avgGrossYieldPct}%`}
              sub={`LTV ${s!.avgLtvPct}%`}
            />
          </div>

          {/* Chart + best/worst */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Valeur nette — depuis l'achat</CardTitle>
                <CardDescription>Patrimoine net (valeur − dette restante)</CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ov.data!.timeline}>
                    <defs>
                      <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-brand-3)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(m: string) =>
                        ov.data!.timeline.length > 24 ? m.slice(2, 7) : m.slice(5)
                      }
                      minTickGap={20}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                      width={38}
                    />
                    <Tooltip
                      formatter={(v: number) => eur(v)}
                      labelFormatter={(l) => `Mois ${l}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="netWorth"
                      stroke="var(--color-primary)"
                      fill="url(#nw)"
                      strokeWidth={2.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {ov.data!.best && (
                <MiniProperty
                  tone="pos"
                  title="Meilleur actif"
                  label={(ov.data!.best as any).label}
                  yieldPct={ov.data!.best.grossYieldPct}
                  cashflow={ov.data!.best.monthlyCashflow}
                />
              )}
              {ov.data!.worst && (
                <MiniProperty
                  tone="neg"
                  title="Actif à surveiller"
                  label={(ov.data!.worst as any).label}
                  yieldPct={ov.data!.worst.grossYieldPct}
                  cashflow={ov.data!.worst.monthlyCashflow}
                />
              )}
              <Card>
                <CardContent className="flex items-center justify-between gap-2 py-4 text-sm">
                  <span className="text-muted-foreground">Cashflow projeté à 5 ans</span>
                  <span className="font-mono font-semibold">{eur(ov.data!.projection5y)}/an</span>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Teasers : recos, opportunités, veille, notifs */}
      <div className="grid gap-4 md:grid-cols-2">
        <TeaserCard
          icon={<Lightbulb className="h-4 w-4" />}
          title="Arbitrages recommandés"
          to="/recommandations"
          count={rq.data?.length ?? 0}
          loading={rq.isLoading}
          emptyLabel="Aucun arbitrage en attente sur votre portefeuille"
          render={(rq.data ?? []).slice(0, 3).map((r: any) => (
            <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{r.title}</span>
              {Number(r.estimated_monthly_gain) > 0 && (
                <span className="shrink-0 font-mono font-semibold text-success">
                  +{Math.round(Number(r.estimated_monthly_gain))} €/m
                </span>
              )}
            </li>
          ))}
        />
        <TeaserCard
          icon={<ShieldAlert className="h-4 w-4" />}
          title="Veille réglementaire"
          to="/veille"
          count={aq.data?.length ?? 0}
          loading={aq.isLoading}
          emptyLabel="Aucune évolution réglementaire détectée sur vos villes"
          render={(aq.data ?? []).slice(0, 3).map((a: any) => (
            <li key={a.id} className="flex items-start gap-2 text-sm">
              <Badge
                variant={a.severity === "danger" ? "destructive" : "secondary"}
                className="mt-0.5 shrink-0 text-[10px]"
              >
                {a.cityName ?? "National"}
              </Badge>
              <span className="min-w-0 truncate">{a.title}</span>
            </li>
          ))}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" />
              Notifications
            </CardTitle>
            {(nq.data?.unread ?? 0) > 0 && <Badge>{nq.data!.unread} non lues</Badge>}
          </CardHeader>
          <CardContent>
            {nq.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (nq.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Vos alertes patrimoniales apparaîtront ici.</p>
            ) : (
              <ul className="space-y-2">
                {nq.data!.items.slice(0, 4).map((n: any) => (
                  <li key={n.id} className="text-sm">
                    <span className={n.read ? "text-muted-foreground" : "font-medium"}>
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="block text-xs text-muted-foreground">{n.body}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-primary/20 bg-brand-soft/50">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-gradient opacity-20 blur-3xl" aria-hidden />
          <CardHeader className="relative z-[1] pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-gradient text-white shadow-glow">
                <Sparkles className="h-4 w-4" />
              </span>
              Copilote patrimonial IA
            </CardTitle>
            <CardDescription>Un copilote entraîné sur votre patrimoine, vos opportunités et le marché.</CardDescription>
          </CardHeader>
          <CardContent className="relative z-[1] space-y-2">
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                "Puis-je financer un actif supplémentaire ?",
                "Quel cashflow dans 5 ans ?",
                "Quel arbitrage prioriser ?",
              ].map((q) => (
                <span
                  key={q}
                  className="rounded-full border bg-background/70 px-3 py-1 text-muted-foreground backdrop-blur transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {q}
                </span>
              ))}
            </div>
            <Button size="sm" variant="gradient" asChild className="mt-2">
              <Link to="/assistant">
                Consulter mon copilote
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg";
}) {
  return (
    <Card className="hover-lift spotlight" onMouseMove={(e) => {
      const r = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
      e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
    }}>
      <CardContent className="relative z-[1] space-y-1 py-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-soft text-primary">
            {icon}
          </span>
          {label}
        </div>
        <p
          className={`tabular font-mono text-xl font-semibold ${tone === "pos" ? "text-success" : tone === "neg" ? "text-danger" : ""}`}
        >
          {value}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function MiniProperty({
  tone,
  title,
  label,
  yieldPct,
  cashflow,
}: {
  tone: "pos" | "neg";
  title: string;
  label: string;
  yieldPct: number;
  cashflow: number;
}) {
  return (
    <Card className={tone === "pos" ? "border-success/40" : "border-warning/40"}>
      <CardContent className="py-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {tone === "pos" ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-success" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5 text-warning" />
          )}
          {title}
        </div>
        <p className="mt-1 truncate font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {yieldPct}% brut · {cashflow >= 0 ? "+" : ""}
          {cashflow} €/mois
        </p>
      </CardContent>
    </Card>
  );
}

function TeaserCard({
  icon,
  title,
  to,
  count,
  loading,
  emptyLabel,
  render,
}: {
  icon: React.ReactNode;
  title: string;
  to: string;
  count: number;
  loading: boolean;
  emptyLabel: string;
  render: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
          {count > 0 && <Badge variant="secondary">{count}</Badge>}
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to={to as any}>
            Voir
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : count === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="space-y-2">{render}</ul>
        )}
      </CardContent>
    </Card>
  );
}
