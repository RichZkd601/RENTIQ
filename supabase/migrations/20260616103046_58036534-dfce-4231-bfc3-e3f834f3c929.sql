
-- Ajoute le champ "extérieur" (balcon/terrasse/rez-de-jardin/aucun) sur les biens et analyses
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS exterior text;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS exterior text;

-- La RP est gérée via status='primary_residence' (colonne text déjà existante, pas de CHECK à modifier).
-- On documente les valeurs autorisées via un commentaire.
COMMENT ON COLUMN public.properties.status IS 'owned | prospect | sold | primary_residence';
COMMENT ON COLUMN public.properties.exterior IS 'aucun | balcon | terrasse | rez_jardin';
COMMENT ON COLUMN public.analyses.exterior IS 'aucun | balcon | terrasse | rez_jardin';
