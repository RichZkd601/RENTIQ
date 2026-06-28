import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  ChevronRight,
  FileCheck,
  Lock,
  Scale,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import logoUrl from "@/assets/rentiq-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RentIQ — Le copilote patrimonial de l'investisseur immobilier" },
      {
        name: "description",
        content:
          "RentIQ accompagne les investisseurs avant, pendant et après l'achat : évaluez vos opportunités, pilotez votre portefeuille et anticipez vos arbitrages.",
      },
      { property: "og:title", content: "RentIQ — Le copilote patrimonial de l'investisseur" },
      {
        property: "og:description",
        content:
          "Évaluez une opportunité, construisez votre patrimoine, décidez avec conviction. La rigueur d'un investisseur professionnel, augmentée par l'IA.",
      },
    ],
  }),
  component: Landing,
});

/** Suit le curseur pour alimenter l'effet `.spotlight`. */
function trackSpotlight(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

function Landing() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <Header />
      <main className="flex-1">
        {/* HERO */}
        <section className="bg-aurora noise relative overflow-hidden">
          <div className="bg-grid pointer-events-none absolute inset-0 -z-[1]" aria-hidden />
          <div className="relative z-[2] mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16 lg:py-24">
            {/* Colonne gauche */}
            <div className="flex min-w-0 flex-col justify-center">
              <div className="glow-ring animate-fade-up mb-5 inline-flex w-fit items-center gap-2 rounded-full bg-card/80 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary shadow-card backdrop-blur sm:text-[11px]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Le copilote patrimonial de l'investisseur
              </div>

              <h1 className="animate-fade-up delay-1 text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[52px] lg:text-[56px]">
                Investissez avec méthode.<br />
                <span className="text-gradient-animated">Décidez avec conviction.</span>
              </h1>

              <p className="animate-fade-up delay-2 mt-5 max-w-xl text-[15px] leading-[1.55] text-muted-foreground sm:mt-6 sm:text-[17px] sm:leading-[1.6]">
                RentIQ vous accompagne avant, pendant et après l'achat : évaluez vos opportunités,
                pilotez votre portefeuille et anticipez vos arbitrages — avec la rigueur d'un investisseur professionnel.
              </p>

              <ul className="animate-fade-up delay-3 mt-7 space-y-2.5 sm:mt-8 sm:space-y-3">
                {[
                  { icon: Scale, label: "Réglementation à jour — Loi Le Meur, fiscalité 2026" },
                  { icon: TrendingUp, label: "Moteur de calcul déterministe, audité et défendable" },
                  { icon: Sparkles, label: "Un copilote IA qui arbitre — il n'invente pas" },
                ].map((f) => (
                  <li key={f.label} className="flex items-start gap-3 text-[14px] leading-snug text-foreground sm:text-[15px]">
                    <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-brand-soft text-primary ring-1 ring-primary/15">
                      <f.icon className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                    <span className="min-w-0">{f.label}</span>
                  </li>
                ))}
              </ul>

              <div className="animate-fade-up delay-4 mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center">
                <Button size="lg" variant="gradient" className="h-12 w-full rounded-xl px-6 text-[15px] font-semibold sm:w-auto" asChild>
                  <Link to="/auth">
                    Évaluer une opportunité
                    <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
                <span className="text-center text-xs text-muted-foreground sm:text-left">
                  3 évaluations offertes · Sans carte bancaire
                </span>
              </div>

              <div className="animate-fade-up delay-5 mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground sm:mt-6 sm:text-[12px]">
                <Trust icon={ShieldCheck} label="Données vérifiées" />
                <Trust icon={Lock} label="Sécurisé" />
                <Trust icon={FileCheck} label="Conforme RGPD" />
              </div>

              {/* Témoignage */}
              <figure className="animate-fade-up delay-6 hover-lift mt-8 rounded-2xl border bg-card/80 p-4 shadow-card backdrop-blur sm:mt-10 sm:p-5">
                <div className="flex items-center gap-1 text-gold">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
                <blockquote className="mt-3 text-[14px] leading-relaxed text-foreground sm:text-[15px]">
                  « J'ai évité un Airbnb bloqué par la mairie de Bordeaux. RentIQ
                  m'a sauvé 18 mois de procédure. »
                </blockquote>
                <figcaption className="mt-3 flex items-center gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-gradient text-[11px] font-semibold text-white">
                    AM
                  </div>
                  <div className="min-w-0 text-[12px] leading-tight">
                    <div className="font-semibold text-foreground">Alexandre M.</div>
                    <div className="text-muted-foreground">Investisseur, 4 biens</div>
                  </div>
                </figcaption>
              </figure>
            </div>

            {/* Colonne droite — preview dashboard */}
            <div className="relative min-w-0">
              <div className="pointer-events-none absolute inset-x-0 -inset-y-6 -z-10 rounded-[36px] bg-brand-gradient opacity-20 blur-3xl sm:-inset-x-6" />
              <div className="animate-float">
                <DashboardPreview />
              </div>
            </div>
          </div>
        </section>

        {/* Bandeau preuves */}
        <section className="border-y bg-card">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:gap-8 sm:px-6 sm:py-10 lg:grid-cols-4">
            {[
              { k: "60 s", v: "pour analyser un bien" },
              { k: "6", v: "stratégies comparées" },
              { k: "Loi Le Meur", v: "intégrée par défaut" },
              { k: "Fiscalité 2026", v: "à jour, sourcée" },
            ].map((it) => (
              <div key={it.k} className="group">
                <div className="text-2xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary sm:text-3xl">
                  {it.k}
                </div>
                <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{it.v}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Différenciateur */}
        <section className="relative">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                Pourquoi RentIQ
              </div>
              <h2 className="text-[26px] font-bold tracking-[-0.02em] text-foreground sm:text-[34px]">
                Le copilote qui ose vous dire :{" "}
                <span className="text-muted-foreground">
                  « cette opportunité ne fait pas progresser votre patrimoine ».
                </span>
              </h2>
            </div>
            <div className="mt-10 grid gap-4 sm:mt-12 sm:gap-5 md:grid-cols-3">
              <FeatureCard
                icon={Scale}
                title="Évaluation d'opportunité 360°"
                body="6 stratégies chiffrées, classées et comparées : location nue, LMNP, bail mobilité, Airbnb, colocation, achat-revente."
              />
              <FeatureCard
                icon={ShieldCheck}
                title="Pilotage de portefeuille"
                body="Valeur patrimoniale, encours de crédit, cashflow net, rendement pondéré — la vue consolidée d'un gérant d'actifs."
              />
              <FeatureCard
                icon={TrendingUp}
                title="Moteur déterministe, défendable"
                body="Aucun chiffre inventé par l'IA. Un moteur testable, conforme à la fiscalité 2026 — des projections que vous pouvez présenter à votre banquier."
              />
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="relative overflow-hidden border-t">
          <div className="bg-aurora noise absolute inset-0 -z-[1]" aria-hidden />
          <div className="relative z-[2] mx-auto max-w-6xl px-4 py-14 text-center sm:px-6 sm:py-24">
            <div className="mx-auto mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient shadow-glow animate-pulse-glow">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-[26px] font-bold tracking-[-0.02em] text-foreground sm:text-[36px]">
              Construisez votre patrimoine{" "}
              <span className="text-gradient">avec méthode.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[14px] text-muted-foreground sm:text-[15px]">
              3 évaluations offertes par mois. Aucune carte requise. L'outil de référence pour
              valider une opportunité et structurer un dossier crédible.
            </p>
            <Button size="lg" variant="gradient" className="mt-7 h-12 w-full rounded-xl px-6 text-[15px] font-semibold sm:mt-8 sm:w-auto" asChild>
              <Link to="/auth">
                Ouvrir mon espace investisseur
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function Trust({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-success" strokeWidth={2.25} />
      {label}
    </span>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div
      onMouseMove={trackSpotlight}
      className="spotlight hover-lift group rounded-2xl border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="relative z-[1] grid h-11 w-11 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow transition-transform duration-300 [transition-timing-function:var(--ease-spring)] group-hover:scale-110 group-hover:-rotate-3">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <h3 className="relative z-[1] mt-4 text-[16px] font-semibold tracking-tight text-foreground sm:mt-5 sm:text-[17px]">
        {title}
      </h3>
      <p className="relative z-[1] mt-2 text-[13.5px] leading-relaxed text-muted-foreground sm:text-[14px]">{body}</p>
    </div>
  );
}

/* ----------------- Dashboard preview ----------------- */

function DashboardPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-card shadow-elev ring-1 ring-black/5">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-r from-brand-soft/60 to-transparent px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-gradient">
            <img src={logoUrl} alt="" width={14} height={14} className="h-3.5 w-3.5 shrink-0" />
          </span>
          <span className="truncate text-[13px] font-semibold tracking-tight">RentIQ</span>
        </div>
        <nav className="hidden items-center gap-5 text-[12px] text-muted-foreground md:flex">
          <span className="font-medium text-foreground">Tableau de bord</span>
          <span>Analyses</span>
          <span>Biens</span>
          <span>Alertes</span>
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <span className="relative grid h-7 w-7 place-items-center rounded-full bg-secondary text-muted-foreground">
            <Bell className="h-3.5 w-3.5" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger ring-2 ring-card" />
          </span>
          <div className="grid h-7 w-7 place-items-center rounded-full bg-brand-gradient text-[11px] font-semibold text-white">
            A
          </div>
        </div>
      </div>

      {/* Header dashboard */}
      <div className="flex items-end justify-between gap-3 px-3 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h3 className="text-[16px] font-bold tracking-tight text-foreground sm:text-[18px]">
            Tableau de bord
          </h3>
          <p className="text-[11px] text-muted-foreground sm:text-[12px]">
            Vue d'ensemble de vos analyses.
          </p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button className="rounded-lg border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground">
            Importer
          </button>
          <button className="inline-flex items-center gap-1 rounded-lg bg-brand-gradient px-3 py-1.5 text-[11px] font-medium text-white shadow-glow">
            + Nouvelle analyse
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-2.5 px-3 pt-3 sm:gap-3 sm:px-5 sm:pt-4 lg:grid-cols-4">
        <Metric label="Analyses ce mois" value="7" sub="/ 20" hint="13 restantes" />
        <Metric label="Score moyen" value="72" sub="/100" hint="+8 pts" trend="up" />
        <Metric label="Biens suivis" value="5" hint="2 alertes" hintTone="warning" />
        <Metric label="Économies" value="24 780 €" hint="potentielles" />
      </div>

      {/* Dernière analyse + risque */}
      <div className="grid gap-2.5 px-3 pt-2.5 sm:gap-3 sm:px-5 sm:pt-3 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
              Dernière analyse
            </span>
            <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
              Aujourd'hui
            </span>
          </div>
          <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground sm:h-14 sm:w-14">
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-foreground sm:text-[14px]">
                T3 — 65 m²
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                Bordeaux · 235 000 €
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground sm:text-[10px]">
                Score
              </div>
              <div className="text-xl font-bold leading-none text-success sm:text-2xl">
                84<span className="text-xs text-muted-foreground sm:text-sm">/100</span>
              </div>
              <span className="mt-1 inline-block rounded-full bg-success-soft px-1.5 py-0.5 text-[9px] font-semibold text-success sm:text-[10px]">
                Attractive
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
            Risque réglementaire
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-foreground">Risque faible</div>
              <div className="truncate text-[11px] text-muted-foreground">Autorisé · Loi Le Meur OK</div>
            </div>
          </div>
          <button className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
            Voir le détail <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* KPIs + IA */}
      <div className="grid gap-2.5 px-3 pb-4 pt-2.5 sm:gap-3 sm:px-5 sm:pb-5 sm:pt-3 lg:grid-cols-[1fr_220px]">
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
              Indicateurs clés
            </span>
            <span className="text-[10px] text-muted-foreground">12 mois</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
            <Kpi label="Cashflow" value="+612 €" tone="success" />
            <Kpi label="Rdt net" value="6,8 %" />
            <Kpi label="Occup." value="91 %" />
            <Kpi label="TRI 10 ans" value="8,7 %" />
            <Kpi label="Effort" value="18 %" />
          </div>
          <div className="mt-4">
            <div className="text-[10px] text-muted-foreground">Cashflow mensuel prévisionnel</div>
            <Sparkline />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-brand-soft/60 p-3 sm:p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Stratégie recommandée
          </div>
          <div className="mt-2 text-[15px] font-bold text-foreground sm:mt-3 sm:text-[16px]">Location nue</div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Meilleure rentabilité nette, risque faible.
          </p>
          <button className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-brand-gradient px-3 py-1.5 text-[11px] font-semibold text-white shadow-glow">
            Voir l'analyse <ArrowUpRight className="h-3 w-3" />
          </button>
          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Confiance IA</span>
            <span className="font-semibold text-foreground">92 %</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-brand-gradient" style={{ width: "92%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  hint,
  hintTone,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  hintTone?: "warning";
  trend?: "up";
}) {
  return (
    <div className="hover-lift rounded-xl border bg-card p-2.5 sm:p-3">
      <div className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="tabular text-[18px] font-bold leading-none tracking-tight text-foreground sm:text-[22px]">
          {value}
        </span>
        {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
        {trend === "up" && <TrendingUp className="ml-auto h-3.5 w-3.5 text-success" />}
      </div>
      {hint && (
        <div
          className={`mt-1 truncate text-[10px] ${
            hintTone === "warning" ? "text-warning" : "text-muted-foreground"
          }`}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  const color =
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] text-muted-foreground">{label}</div>
      <div className={`tabular mt-1 text-[14px] font-bold tracking-tight sm:text-[15px] ${color}`}>{value}</div>
    </div>
  );
}

function Sparkline() {
  const bars = [120, -180, 240, 310, 410, 380, 520, 480, 560, 610, 590, 640];
  const max = Math.max(...bars.map((b) => Math.abs(b)));
  return (
    <div className="mt-2 flex h-16 items-end gap-1 sm:h-20">
      {bars.map((b, i) => {
        const h = (Math.abs(b) / max) * 100;
        const neg = b < 0;
        return (
          <div key={i} className="flex flex-1 flex-col items-stretch justify-end gap-0.5">
            <div
              className={`rounded-sm ${neg ? "bg-danger/70" : "bg-gradient-to-t from-primary/70 to-brand-3"}`}
              style={{ height: `${Math.max(8, h)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
