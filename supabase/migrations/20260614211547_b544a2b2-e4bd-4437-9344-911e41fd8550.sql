-- 1. Table de cache des données de marché par code INSEE
CREATE TABLE public.market_snapshots (
  insee_code text PRIMARY KEY,
  postal_code text NOT NULL,
  commune_name text NOT NULL,
  department_code text,
  region_code text,
  -- Marché
  price_sqm_avg numeric(7,2),
  rent_sqm_unfurnished numeric(5,2),
  rent_sqm_furnished numeric(5,2),
  -- Encadrement des loyers
  rent_controlled boolean NOT NULL DEFAULT false,
  rent_cap_unfurnished numeric(5,2),
  rent_cap_furnished numeric(5,2),
  regulation_zone text,
  regulation_source text,
  -- Données brutes (utile pour debug et nouveaux calculs sans re-fetch)
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.market_snapshots TO anon, authenticated;
GRANT ALL ON public.market_snapshots TO service_role;

ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_snapshots_read_all"
  ON public.market_snapshots
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX market_snapshots_postal_idx ON public.market_snapshots (postal_code);
CREATE INDEX market_snapshots_fetched_idx ON public.market_snapshots (fetched_at);

-- 2. Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER market_snapshots_touch
  BEFORE UPDATE ON public.market_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Conserve le code postal sur chaque analyse
ALTER TABLE public.analyses ADD COLUMN postal_code text;
CREATE INDEX analyses_postal_idx ON public.analyses (postal_code);