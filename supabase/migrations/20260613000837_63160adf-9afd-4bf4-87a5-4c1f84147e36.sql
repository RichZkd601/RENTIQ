
-- ============================
-- PROFILES
-- ============================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text NOT NULL,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','premium')),
  analyses_used_this_month int NOT NULL DEFAULT 0,
  quota_reset_at date NOT NULL DEFAULT (date_trunc('month', now() + interval '1 month'))::date,
  default_tmi numeric(4,3) DEFAULT 0.30,
  default_profile text DEFAULT 'equilibre',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_profile_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own_profile_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own_profile_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================
-- CITY_DATA
-- ============================
CREATE TABLE public.city_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name text NOT NULL UNIQUE,
  postal_prefix text,
  adr_studio numeric(6,2),
  adr_t2 numeric(6,2),
  adr_t3 numeric(6,2),
  occupancy_rate numeric(4,3),
  seasonality text CHECK (seasonality IN ('faible','moyenne','forte')),
  rent_sqm_furnished numeric(5,2),
  rent_sqm_unfurnished numeric(5,2),
  price_sqm_avg numeric(7,2),
  rent_room_coliving numeric(6,2),
  coliving_demand text DEFAULT 'moyenne' CHECK (coliving_demand IN ('faible','moyenne','forte')),
  mid_term_demand text DEFAULT 'moyenne' CHECK (mid_term_demand IN ('faible','moyenne','forte')),
  market_liquidity text DEFAULT 'moyenne' CHECK (market_liquidity IN ('faible','moyenne','forte')),
  price_trend numeric(4,3) DEFAULT 0,
  regulation_level text CHECK (regulation_level IN ('libre','encadree','restrictive','tres_restrictive')),
  change_usage_required boolean DEFAULT false,
  compensation_required boolean DEFAULT false,
  primary_residence_cap int DEFAULT 120,
  quota_zones boolean DEFAULT false,
  regulation_notes text,
  regulation_updated_at date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.city_data TO anon, authenticated;
GRANT ALL ON public.city_data TO service_role;
ALTER TABLE public.city_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "city_data_read_all" ON public.city_data FOR SELECT TO anon, authenticated USING (true);

-- ============================
-- ANALYSES
-- ============================
CREATE TABLE public.analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  city_name text NOT NULL,
  property_type text CHECK (property_type IN ('studio','t2','t3','t4_plus','maison')),
  surface_sqm numeric(6,2) NOT NULL,
  purchase_price numeric(10,2) NOT NULL,
  renovation_cost numeric(10,2) DEFAULT 0,
  furnishing_cost numeric(10,2) DEFAULT 0,
  down_payment numeric(10,2),
  loan_rate numeric(4,3) DEFAULT 0.035,
  loan_years int DEFAULT 20,
  tmi numeric(4,3) DEFAULT 0.30,
  rooms_possible int,
  estimated_resale_price numeric(10,2),
  holding_months int DEFAULT 12,
  user_profile text DEFAULT 'equilibre' CHECK (user_profile IN ('cashflow','patrimoine','plus_value','passif','equilibre')),
  calc jsonb,
  ai_analysis jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX analyses_user_idx ON public.analyses(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.analyses TO authenticated;
GRANT ALL ON public.analyses TO service_role;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_analyses_all" ON public.analyses FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================
-- CITY_REQUESTS
-- ============================
CREATE TABLE public.city_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name text NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.city_requests TO authenticated;
GRANT ALL ON public.city_requests TO service_role;
ALTER TABLE public.city_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "city_requests_insert" ON public.city_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "city_requests_select_own" ON public.city_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================
-- SEED — 2 villes pilotes
-- ============================
INSERT INTO public.city_data (
  city_name, postal_prefix, adr_studio, adr_t2, adr_t3,
  occupancy_rate, seasonality, rent_sqm_furnished, rent_sqm_unfurnished, price_sqm_avg,
  rent_room_coliving, coliving_demand, mid_term_demand, market_liquidity, price_trend,
  regulation_level, change_usage_required, compensation_required, primary_residence_cap,
  quota_zones, regulation_notes, regulation_updated_at
) VALUES
('Bordeaux','33', 75, 105, 145, 0.65, 'moyenne', 17.5, 14.8, 4600,
 480, 'forte', 'forte', 'forte', 0.01,
 'tres_restrictive', true, true, 90, true,
 'Changement d''usage avec compensation obligatoire pour les résidences secondaires. Plafond résidence principale abaissé à 90 jours. Quotas par quartier en centre-ville. Vérification en mairie indispensable avant tout achat.',
 '2026-05-01'),
('Rennes','35', 60, 85, 115, 0.60, 'faible', 15.5, 13.0, 3800,
 420, 'forte', 'forte', 'forte', 0.02,
 'encadree', true, false, 120, false,
 'Changement d''usage requis pour les résidences secondaires en zone tendue. Pas de compensation à ce jour. Forte demande étudiante et jeunes actifs : colocation et moyenne durée très porteuses.',
 '2026-05-01');
