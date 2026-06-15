# RentIQ — Le copilote IA de l'investisseur immobilier

RentIQ n'est pas un simulateur de rentabilité, ni un calculateur de cashflow, ni
un outil d'analyse d'annonce. C'est le **copilote IA** qui accompagne
l'investisseur particulier **pendant plusieurs années** dans le développement de
son patrimoine — de l'analyse d'un premier bien jusqu'au pilotage d'un
portefeuille entier.

> Architecture produit complète (V1 → V5, modèle de monétisation, chemin vers
> 50 K€+ de MRR) : **[`docs/PRODUCT_ARCHITECTURE.md`](docs/PRODUCT_ARCHITECTURE.md)**.

## Les cinq briques

| Version | Brique                       | Route(s)                                | Statut    |
| ------- | ---------------------------- | --------------------------------------- | --------- |
| V1      | Analyse d'annonce            | `/analyser`, `/analyse/$id`             | ✅ Livré  |
| V2      | Cockpit patrimonial          | `/dashboard`, `/patrimoine`             | ✅ Livré  |
| V3      | Radar d'opportunités         | `/radar`                                | ✅ Livré¹ |
| V4      | Recommandations automatiques | `/recommandations`                      | ✅ Livré  |
| V5      | Conseiller patrimonial IA    | `/assistant`                            | ✅ Livré  |

¹ Le scoring d'opportunités est réel ; la **source d'annonces temps réel**
(scraping via Firecrawl) est en Phase 2 de la roadmap. En attendant, le radar
score de vraies annonces saisies à la main et démontre la valeur sur des
candidates synthétiques explicitement étiquetées « démo ».

## Principe invariant

> **L'IA ne calcule jamais.** Tout le numérique (cashflow, fiscalité,
> amortissement, score, recommandations, capacité d'emprunt) vit dans des
> modules **purs et testés**. L'IA reçoit une fiche de données pré-calculée et
> ne fait que reformuler. Sans clé API, le produit sert la réponse déterministe.

## Stack

TanStack Start (React 19, Vite, SSR) · Supabase Postgres + RLS · Lovable AI
Gateway (Gemini) · Tailwind v4 + shadcn/ui · Paddle · Cloudflare Workers.

## Cœur déterministe (`src/lib`)

| Module               | Rôle                                                   | Tests |
| -------------------- | ------------------------------------------------------ | ----- |
| `calculator.ts`      | Moteur fiscal 2026, 6 stratégies + flip                | ✔     |
| `strategyMatcher.ts` | Éligibilité + bandeau réglementaire                    | ✔     |
| `verdict.ts`         | Score /100 + prix max conseillé                        |       |
| `loanSchedule.ts`    | Amortissement, capital restant, refinancement          | ✔     |
| `portfolio.ts`       | KPIs cockpit, ranking, timeline valeur nette           | ✔     |
| `opportunityScore.ts`| Scoring annonce vs profil investisseur                 | ✔     |
| `recommendations.ts` | Leviers d'optimisation (loyer, stratégie, refi…)       | ✔     |
| `assistant.ts`       | Contexte + réponses chiffrées grounded                 | ✔     |

Les `*.functions.ts` exposent ces modules en **server functions** (TanStack
Start) sécurisées par `requireSupabaseAuth` et la RLS Supabase.

## Développement

```bash
bun install          # ou npm install
bun run dev          # serveur de dev
npx vitest run       # 74 tests (cœur déterministe)
npx tsc --noEmit     # typecheck
```

Variables d'environnement : voir `.env` (`SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, …). La clé IA (`LOVABLE_API_KEY`) est optionnelle —
sans elle, l'arbitre et le conseiller servent leurs réponses déterministes.

## Migrations

```
supabase/migrations/
  202606130008…  profiles, analyses, city_data, quota
  202606131057…  subscriptions (Paddle)
  202606142115…  market_snapshots
  20260614230000_copilot_portfolio_radar.sql   tables V2-V5 (RLS, GRANTs)
  20260614230500_seed_regulatory_alerts.sql    veille réglementaire
```

## Conformité

Disclaimers légaux systématiques (fiscalité 2026, ne constitue pas un conseil en
investissement). RLS sur toutes les tables user-facing. Service role
exclusivement côté serveur.
