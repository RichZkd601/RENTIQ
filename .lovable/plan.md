
# Plan de build — RentIQ MVP

Build complet en 7 lots séquentiels, exactement dans l'ordre de ton cahier des charges. Je valide chaque lot avant de passer au suivant.

## Stack
- TanStack Start (déjà en place)
- Lovable Cloud (Supabase) — à activer au lot 1
- Lovable AI Gateway (Gemini) — à activer au lot 4
- jsPDF côté client pour l'export (lot 5)

## Lot 1 — Fondations
- Activer Lovable Cloud
- Migration SQL : tables `profiles`, `city_data`, `analyses`, `city_requests` + RLS + GRANTs
- Trigger auto-création profil sur signup
- Seed 2 villes (Bordeaux, Rennes) pour valider
- Auth email/password : pages `/auth`, gate `_authenticated`
- Layout shell (header avec nav + bouton compte)

## Lot 2 — Moteur de calcul déterministe
- `src/lib/calculator.ts` : 6 fonctions de stratégie + constantes 2026
- Tests unitaires (vitest) : Bordeaux T2 120k€ sur chaque stratégie, studio→coloc inéligible, flip marge négative, T4 Rennes coloc +20-40% vs LMNP
- **Stop validation** : je te montre les chiffres sur 1-2 cas réels avant de continuer

## Lot 3 — Matcher d'éligibilité
- `src/lib/strategyMatcher.ts` : filtre déterministe avant IA
- Stratégies écartées retournées avec `blockedReason` (jamais cachées)

## Lot 4 — Flux analyse + IA arbitre
- Formulaire `/analyser` en 3 étapes (bien / financement / objectif)
- Quota check (free=3, pro=30, premium=∞)
- Server function `generateAnalysis` (createServerFn + Lovable AI Gateway, Gemini, JSON strict, prompt système complet)
- Page `/analyse/:id` : score géant, podium, bandeau réglementaire, tableau comparatif, encart flip, forces/risques/recommandations
- Stratégies écartées affichées grisées avec raison

## Lot 5 — PDF, historique, quotas
- Export PDF jsPDF (2-3 pages, disclaimer pied de page, filigrane si free)
- Page `/historique` + bouton "Dupliquer et modifier"
- Reset quota mensuel à la connexion
- Écran upgrade quand quota dépassé

## Lot 6 — Landing + mini-admin
- `/` : hero, démo interactive sans inscription (calcul live client-side), bloc loi Le Meur, tableau 10 villes
- `/admin/cities` (réservé via role/email) : CRUD `city_data` + vue `city_requests`
- Compléter seed des 10 villes pilotes (Bordeaux, Lyon, Marseille, Nantes, Rennes, Biarritz, Annecy, La Rochelle, Nice, Saint-Malo)

## Lot 7 — Finitions
- États vides, responsive (tableau comparatif scrollable mobile)
- Page `/parametres` (TMI, profil par défaut)
- Disclaimer vérifié partout (résultats, PDF chaque page, footer landing)
- SEO meta par route + sitemap.xml / robots.txt

## Design system
Direction visuelle : sobre et "fintech crédible" (le rapport doit pouvoir être montré à un banquier).
- Palette neutre (slate/zinc) + accent vert pour cashflow positif, ambre pour alertes, rouge pour réglementation bloquante
- Typo : Inter ou équivalent système, hiérarchie nette
- Pas de gradients flashy, focus sur la densité d'information lisible
Je définirai les tokens oklch dans `src/styles.css` au lot 1.

## Garde-fous appliqués partout
1. IA ne calcule jamais — uniquement compare/classe/commente
2. Flip : avertissement requalification marchand de biens permanent (UI + PDF)
3. IA peut dire "n'achetez pas"
4. Profil oriente le classement, pas les chiffres
5. Stratégies écartées toujours visibles avec raison
6. Disclaimer renforcé sur résultats, PDF (chaque page), landing footer

## Ce qui est hors MVP (confirmé)
Scraping SeLoger/Leboncoin, API AirDNA, carte des opportunités, Stripe, Espagne, gestion locative, division immeuble.

---

**Question avant de démarrer :**
Tu valides le lot 1 (fondations + auth + seed 2 villes) en premier et on fait un point avant le lot 2 ? Ou je vais jusqu'au lot 2 inclus (calculateur + tests) avant ta première validation — c'est le moment critique de vérification des chiffres ?
