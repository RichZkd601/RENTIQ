# RentIQ — Architecture fonctionnelle du copilote (V1 → V5)

> **Thèse produit.** RentIQ n'est pas un simulateur de rentabilité, ni un
> calculateur de cashflow, ni un outil d'analyse d'annonce. C'est le **copilote
> IA de l'investisseur immobilier** : un produit à usage récurrent qui
> accompagne l'investisseur particulier pendant **plusieurs années** dans le
> développement de son patrimoine.

Ce document décrit l'architecture fonctionnelle idéale qui fait évoluer RentIQ
d'un outil d'analyse ponctuel (V1) vers un conseiller patrimonial indispensable
(V5), et le chemin de monétisation vers **50 K€+ de MRR**.

---

## 1. Le problème stratégique : la rétention

Un investisseur peut analyser un bien, acheter son appartement, puis **ne plus
jamais revenir**. C'est la faiblesse mortelle d'un outil d'analyse : sa valeur
est consommée en une session. Conséquence : churn élevé, LTV faible, croissance
plafonnée.

La mission est de transformer chaque usage ponctuel (« vaut-il le coup ? ») en
**usage continu** (« comment va mon patrimoine, qu'est-ce que je rate, quoi
faire ensuite ? »). Cinq axes y répondent, déployés en cinq versions :

| Version | Brique                       | Question à laquelle elle répond                       | Fréquence d'usage |
| ------- | ---------------------------- | ----------------------------------------------------- | ----------------- |
| **V1**  | Analyse d'annonce            | « Ce bien vaut-il le coup ? »                          | Ponctuelle        |
| **V2**  | Cockpit patrimonial          | « Comment va mon patrimoine ? »                       | Hebdomadaire      |
| **V3**  | Radar d'opportunités         | « Y a-t-il un bien pour moi aujourd'hui ? »           | **Quotidienne**   |
| **V4**  | Recommandations automatiques | « Qu'est-ce que je peux optimiser sans rien faire ? » | Mensuelle         |
| **V5**  | Conseiller patrimonial IA    | « Que dois-je faire ensuite ? »                       | À la demande      |

Chaque version crée une **raison d'ouvrir l'application** indépendante de
l'acte d'achat — c'est ce qui transforme un abonnement de 1 mois en abonnement
de plusieurs années.

---

## 2. Principe d'architecture invariant

Une règle traverse toutes les versions et constitue le socle de crédibilité
« fintech » de RentIQ :

> **L'IA ne calcule jamais. Le moteur déterministe est la seule source de
> vérité numérique. L'IA classe, reformule et conseille — sur des chiffres
> qu'elle n'a pas le droit d'inventer.**

Concrètement :

- Tous les calculs (cashflow, rendement, fiscalité, amortissement, score,
  recommandations, capacité d'emprunt) vivent dans des **modules purs et
  testés** (`src/lib/*.ts`, couverts par Vitest).
- L'IA (Lovable AI Gateway) reçoit une **fiche de données pré-calculée** et une
  **réponse déterministe**, qu'elle ne fait que reformuler. Sans clé API, la
  réponse déterministe est servie telle quelle — le produit fonctionne toujours.
- Chaque sortie porte un **disclaimer légal** (fiscalité 2026, pas un conseil en
  investissement).

---

## 3. Détail des versions

### V1 — Analyse d'annonce _(socle, livré)_

**Fonctionnalités.** Coller une URL / saisir un bien → 6 stratégies comparées
(nue, LMNP, bail mobilité, colocation, coliving, Airbnb) + encart Flip, score
/100, verdict tranché 🟢 Acheter / 🟡 Négocier à X € / 🔴 Fuir, prix max
conseillé en reverse engineering, PDF « dossier banque ».

**Base de données.** `profiles`, `analyses`, `city_data`, `market_snapshots`,
`city_requests`, `subscriptions`, `analytics_events`.

**Logique métier.** `calculator.ts` (moteur fiscal 2026), `strategyMatcher.ts`
(éligibilité + bandeau réglementaire), `verdict.ts` (score pondéré + bisection
prix max). IA arbitre via `analysis.functions.ts`.

**Rétention générée.** Faible — valeur consommée en une session.

**Complexité technique.** Élevée (déjà absorbée).

**Impact MRR.** Acquisition & première conversion (free → pro au cap quota).

**Priorité.** ✅ Fondation — tout le reste s'y branche.

---

### V2 — Cockpit patrimonial _(livré)_

**Fonctionnalités.** L'utilisateur déclare ses biens détenus. Dashboard
`/dashboard` : valeur du patrimoine, dette restante, valeur nette, cashflow
mensuel/annuel, rendement moyen pondéré, **courbe de valeur nette sur 12 mois**,
identification automatique du **meilleur** / **pire** bien et des biens **à
optimiser**, projection du cashflow à 5 ans. Détail par bien `/patrimoine/$id`
avec **historique de valorisation**. Conversion **analyse → bien** en un clic.

**Base de données.** `properties` (acquisition, financement, exploitation,
stratégie, régime), `property_valuations` (historique de valeur).

**Logique métier.**

- `loanSchedule.ts` — amortissement en formule fermée : capital restant dû à une
  date, capital remboursé, intérêts versés. _(13 tests)_
- `portfolio.ts` — `propertyMetrics`, `portfolioSummary` (agrégats pondérés),
  `rankProperties` (best/worst/sous-performant/arbitrage), `netWorthTimeline`,
  `projectCashflow`. _(20 tests)_
- `portfolio.functions.ts` — CRUD biens (cashflow **recalculé par le moteur** à
  chaque enregistrement), valorisations, overview agrégé.

**Rétention générée.** Moyenne-haute — consultation hebdomadaire « comment va
mon patrimoine ». Crée la **donnée propriétaire** dont V4 et V5 dépendent.

**Complexité technique.** Moyenne.

**Impact MRR.** Fort sur la **rétention** : transforme l'abonnement ponctuel en
abonnement durable. C'est le pivot du modèle.

**Priorité.** 🔴 Critique — sans patrimoine déclaré, V4 et V5 n'ont pas de
matière. À déployer immédiatement après V1.

---

### V3 — Radar d'opportunités _(livré ; source d'annonces réelle = roadmap)_

**Fonctionnalités.** L'utilisateur crée un **profil investisseur** (ville,
type, budget max, stratégie, cashflow minimum). RentIQ surveille les annonces,
**score automatiquement** chaque candidate (score /100, cashflow, rendement,
match oui/non) et **notifie** : « 3 nouvelles opportunités détectées ce matin ».

**Base de données.** `investor_profiles`, `opportunities`, `notifications`.

**Logique métier.**

- `opportunityScore.ts` — `scoreOpportunity` (annonce passée au moteur sous la
  stratégie cible, confrontée aux seuils du profil), `rankOpportunities`.
  _(8 tests)_
- `radar.functions.ts` — CRUD profils, `addOpportunity` (scorer une annonce
  réelle collée à la main, **utilisable dès aujourd'hui**), `scanProfile`
  (synthétise des candidates depuis les données de marché de la ville,
  explicitement marquées `source = "demo"` tant que le scraper réel n'est pas
  branché — le **scoring est réel**).

> **Honnêteté produit.** Le scraping LeBonCoin / SeLoger / Bien'ici / PAP (via
> Firecrawl) est en **Phase 2 de la roadmap** (hors MVP). En attendant, le radar
> score de vraies annonces saisies à la main et démontre la valeur sur des
> candidates synthétiques clairement étiquetées « démo ». Brancher la source
> réelle ne change **rien** au moteur de scoring.

**Rétention générée.** **Maximale** — c'est l'axe qui crée une raison
**quotidienne** d'ouvrir l'app (la notification du matin).

**Complexité technique.** Moyenne (haute une fois le scraping temps réel
branché : anti-bot, dédoublonnage, fraîcheur).

**Impact MRR.** Très fort — feature « daily active », principal moteur
d'engagement et d'upsell vers les plans supérieurs (nb de profils / fréquence
de scan = axes de packaging).

**Priorité.** 🟠 Haute — après V2 pour bénéficier du contexte patrimonial.

---

### V4 — Recommandations automatiques _(livré)_

**Fonctionnalités.** Chaque mois, RentIQ analyse le portefeuille et détecte,
**sans intervention de l'utilisateur** : hausse de loyer possible, changement de
stratégie rentable (ex : nue → meublé), refinancement opportun, arbitrage
achat/vente, optimisation fiscale. Ex : _« Votre T2 à Rennes pourrait générer
85 €/mois supplémentaires en passant en meublé »_, _« Vous pourriez récupérer
23 000 € de capacité d'emprunt via un refinancement »_.

**Base de données.** `recommendations` (type, gain estimé €/mois ou one-shot,
confiance, priorité, statut).

**Logique métier.**

- `recommendations.ts` — `generateRecommendations` confronte chaque bien aux
  loyers de marché de sa ville et au taux de marché, rejoue le moteur sur les
  stratégies alternatives, et chiffre chaque levier. _(7 tests)_
- `recommendations.functions.ts` — régénère les recommandations « open » du
  portefeuille, crée une notification, conserve les recommandations actées.

**Rétention générée.** Haute — valeur **continue et passive** : l'utilisateur
reçoit de la valeur même quand il ne fait rien. Justifie l'abonnement « pendant
qu'il dort ».

**Complexité technique.** Moyenne (réutilise V1 + V2).

**Impact MRR.** Fort — c'est l'argument anti-churn (« je garde RentIQ parce
qu'il me fait gagner de l'argent tout seul ») et le principal **ROI
narratif** : +X €/mois identifiés > prix de l'abonnement.

**Priorité.** 🟠 Haute — dépend de V2 (biens déclarés).

---

### V5 — Conseiller patrimonial IA _(livré)_

**Fonctionnalités.** Chat `/assistant`. L'utilisateur pose des questions en
langage naturel : _« Puis-je acheter un troisième appartement ? »_, _« Quel sera
mon cashflow dans 5 ans ? »_, _« Quel est mon bien le moins performant ? »_,
_« Dois-je vendre ce bien ? »_, _« Quel régime fiscal est le plus adapté ? »_.
L'IA répond **à partir des données réelles** du portefeuille.

**Base de données.** `assistant_conversations`, `assistant_messages` (avec
snapshot du contexte utilisé pour la traçabilité).

**Logique métier.**

- `assistant.ts` (pur, _8 tests_) — `buildPortfolioContext` (fiche de données
  réelle : valeur nette, equity mobilisable, pouvoir d'achat indicatif,
  meilleur/pire bien, candidats arbitrage), `detectIntent`, `answerDeterministic`
  (réponse **chiffrée** par intention, jamais inventée).
- `assistant.functions.ts` — orchestration RAG : charge le portefeuille réel,
  calcule la réponse déterministe, puis demande au LLM de **reformuler** en
  s'appuyant strictement sur ces faits (et **sans** clé API, sert la réponse
  déterministe telle quelle).

**Rétention générée.** Haute — crée une relation de **confiance** et une
dépendance positive (« mon conseiller connaît mon patrimoine »).

**Complexité technique.** Haute (grounding strict anti-hallucination).

**Impact MRR.** Très fort — feature de différenciation premium et levier de
**pricing supérieur** (le conseiller IA justifie un plan « Patrimoine » haut de
gamme).

**Priorité.** 🟡 Moyenne-haute — couronne l'édifice ; dépend de V2/V4 pour avoir
de la matière à conseiller.

---

## 4. Modèle de monétisation — chemin vers 50 K€+ de MRR

Le packaging suit la valeur de rétention, pas le nombre d'analyses.

| Plan          | Prix/mois indicatif | Cœur de valeur                                                                          | Cible                          |
| ------------- | ------------------- | --------------------------------------------------------------------------------------- | ------------------------------ |
| **Free**      | 0 €                 | 3 analyses / mois (V1)                                                                   | Acquisition, découverte        |
| **Pro**       | 19–29 €             | Analyses étendues + cockpit (V2) + 1 radar (V3)                                          | Investisseur actif             |
| **Patrimoine**| 39–59 €             | Radars illimités, recommandations (V4), **conseiller IA (V5)**, veille réglementaire    | Multi-biens, cœur de la valeur |
| **Conseiller**| 99–149 €            | Multi-clients, PDF marque blanche, exports                                              | CGP / chasseurs immobiliers    |

**Trois leviers composables vers 50 K€ MRR :**

1. **Rétention (V2)** — passer d'un churn « post-achat » à un churn annuel fait
   exploser la LTV : le même volume d'acquisition génère 5–10× plus de MRR
   cumulé.
2. **Engagement quotidien (V3)** — le radar et ses notifications portent les DAU
   et la conversion free → payant au moment où l'utilisateur voit une
   opportunité qu'il ne veut pas rater.
3. **ROI démontré (V4/V5)** — « +X €/mois identifiés ce mois-ci » rend
   l'abonnement auto-justifié et débloque l'upsell vers **Patrimoine** et
   **Conseiller**.

Ordres de grandeur illustratifs pour franchir 50 K€ MRR (à calibrer avec la
donnée réelle) : ~1 300 abonnés **Patrimoine** à 39 €, ou un mix
~800 **Pro** (24 €) + ~600 **Patrimoine** (49 €) + ~50 **Conseiller** (129 €).
Le déblocage vient de la **rétention multi-années** que V2→V5 rendent possible,
pas du volume d'analyses V1.

---

## 5. Cartographie technique

```
src/lib/
  calculator.ts            V1  moteur fiscal 6 stratégies + flip        (+ tests)
  strategyMatcher.ts       V1  éligibilité + bandeau réglementaire      (+ tests)
  verdict.ts               V1  score /100 + prix max conseillé
  loanSchedule.ts          V2  amortissement, refinancement             (+ tests)
  portfolio.ts             V2  KPIs cockpit, ranking, timeline          (+ tests)
  opportunityScore.ts      V3  scoring annonce vs profil investisseur   (+ tests)
  recommendations.ts       V4  leviers d'optimisation déterministes     (+ tests)
  assistant.ts             V5  contexte + réponses chiffrées grounded   (+ tests)

  *.functions.ts           Server functions (TanStack Start + Supabase + RLS) :
    analysis / portfolio / radar / recommendations / watch /
    notifications / assistant

src/routes/_authenticated/
  dashboard       V2  cockpit            patrimoine(.index/.nouveau/.$id)  V2
  radar           V3  radar              recommandations                   V4
  veille          V2/V4 veille régl.     assistant                         V5

supabase/migrations/
  …_copilot_portfolio_radar.sql   tables V2-V5 (RLS, GRANTs, index)
  …_seed_regulatory_alerts.sql    veille réglementaire (Loi Le Meur…)
```

**Tests.** 74 tests Vitest verts couvrant tout le cœur déterministe
(`calculator`, `strategyMatcher`, `loanSchedule`, `portfolio`,
`recommendations`, `opportunityScore`, `assistant`). `tsc --noEmit` clean.

---

## 6. Garde-fous

- **IA ne calcule jamais** — grounding strict, repli déterministe sans clé API.
- **RLS** sur toutes les tables user-facing, policies scopées à `auth.uid()`,
  GRANTs explicites `authenticated` + `service_role`.
- **Service role** uniquement côté serveur, jamais en bundle client.
- **Disclaimers** légaux systématiques (fiscalité 2026, pas un conseil en
  investissement) ; avertissement permanent « marchand de biens » sur le Flip.
- **Honnêteté des sources** — les opportunités synthétiques sont étiquetées
  `source = "demo"` tant que le scraping temps réel n'est pas branché.

---

## 7. Roadmap d'exécution

1. **Veille réglementaire dynamique** — alimenter `regulatory_alerts` via un
   cron éditorial + sources data.gouv, au-delà du seed initial.
2. **Scraping temps réel (Phase 2)** — Firecrawl sur LeBonCoin / SeLoger /
   Bien'ici / PAP alimentant `opportunities` (le scoring est déjà prêt).
3. **Cron mensuel des recommandations** — déclencher
   `generatePortfolioRecommendations` pour tous les utilisateurs + e-mail digest.
4. **Estimation de valeur automatique** — alimenter `property_valuations` depuis
   les DVF / indices de marché plutôt que la saisie manuelle.
5. **PDF premium « dossier banque »** et exports CGP (plan Conseiller).
6. **Notifications push / e-mail** — matérialiser « 3 opportunités ce matin »
   hors de l'app pour maximiser le retour quotidien.
```
