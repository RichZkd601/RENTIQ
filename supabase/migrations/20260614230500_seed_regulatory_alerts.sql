-- ============================================================================
-- RentIQ — Seed de la veille réglementaire (V2/V4)
-- Événements réglementaires connus pour les villes pilotes + national.
-- Le ciblage par bien se fait à la lecture (city_name / strategy).
-- ============================================================================

INSERT INTO public.regulatory_alerts (city_name, postal_prefix, strategy, severity, title, body, source_url, effective_date)
VALUES
(NULL, NULL, 'airbnb', 'warning',
 'Loi Le Meur : abattement micro-BIC réduit pour la courte durée',
 'Depuis 2025 (plein effet 2026), les meublés de tourisme non classés sont plafonnés à 30 % d''abattement / 15 000 € de recettes. Le classement tourisme (50 % / 77 700 €) devient stratégique pour préserver la rentabilité Airbnb.',
 'https://www.legifrance.gouv.fr/', '2026-01-01'),

('Bordeaux', '33', 'airbnb', 'danger',
 'Bordeaux durcit la location courte durée',
 'Changement d''usage avec compensation obligatoire pour les résidences secondaires, plafond résidence principale abaissé à 90 jours/an, quotas par quartier en centre-ville. Tout projet Airbnb doit être validé en mairie avant achat.',
 'https://www.bordeaux.fr/', '2026-05-01'),

('Rennes', '35', 'airbnb', 'warning',
 'Rennes : changement d''usage requis en zone tendue',
 'La location courte durée d''une résidence secondaire nécessite un changement d''usage. Pas de compensation à ce jour, mais une évolution est à surveiller compte tenu de la tension locative.',
 'https://metropole.rennes.fr/', '2026-05-01'),

('Rennes', '35', NULL, 'info',
 'Rennes : forte demande colocation et moyenne durée',
 'Marché étudiant et jeunes actifs très porteur. La colocation meublée et le bail mobilité offrent un rendement supérieur au nu classique, sous réserve d''une gestion plus active.',
 NULL, '2026-05-01'),

(NULL, NULL, NULL, 'info',
 'Encadrement des loyers : extension progressive des zones',
 'De nouvelles intercommunalités rejoignent le dispositif d''encadrement des loyers (zones tendues). Vérifiez le plafond €/m² applicable avant toute relocation ou révision de loyer.',
 'https://www.service-public.fr/', '2026-01-01');
