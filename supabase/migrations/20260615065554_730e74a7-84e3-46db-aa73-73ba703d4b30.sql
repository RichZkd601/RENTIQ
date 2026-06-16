-- ============================================================================
-- RentIQ — Copilote patrimonial (V2 → V5)
-- ============================================================================

CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL,
  city_name text NOT NULL,
  postal_code text,
  property_type text CHECK (property_type IN ('studio','t2','t3','t4_plus','maison')),
  surface_sqm numeric(6,2),
  rooms int,
  strategy text CHECK (strategy IN ('location_nue','lmnp_longue_duree','bail_mobilite','colocation','coliving','airbnb')),
  status text NOT NULL DEFAULT 'owned' CHECK (status IN ('owned','prospect','sold')),
  purchase_price numeric(12,2) NOT NULL,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  notary_fees numeric(12,2) DEFAULT 0,
  works_budget numeric(12,2) DEFAULT 0,
  furniture_budget numeric(12,2) DEFAULT 0,
  capital_invested numeric(12,2),
  loan_amount numeric(12,2) DEFAULT 0,
  loan_rate numeric(5,4) DEFAULT 0.035,
  loan_years int DEFAULT 20,
  loan_start_date date,
  current_value numeric(12,2) NOT NULL,
  monthly_rent_gross numeric(10,2) NOT NULL DEFAULT 0,
  monthly_cashflow_net numeric(10,2) NOT NULL DEFAULT 0,
  net_yield_pct numeric(5,2),
  property_tax numeric(10,2) DEFAULT 0,
  copro numeric(10,2) DEFAULT 0,
  tmi numeric(4,3) DEFAULT 0.30,
  source_analysis_id uuid REFERENCES public.analyses(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX properties_user_idx ON public.properties(user_id, created_at DESC);
CREATE INDEX properties_status_idx ON public.properties(user_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_properties_all" ON public.properties FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER properties_touch BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.property_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  valued_at date NOT NULL DEFAULT CURRENT_DATE,
  value numeric(12,2) NOT NULL,
  source text DEFAULT 'manual' CHECK (source IN ('manual','market_estimate','purchase')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_valuations_idx ON public.property_valuations(property_id, valued_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_valuations TO authenticated;
GRANT ALL ON public.property_valuations TO service_role;
ALTER TABLE public.property_valuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_valuations_all" ON public.property_valuations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.investor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL,
  city_name text NOT NULL,
  postal_code text,
  property_type text CHECK (property_type IN ('studio','t2','t3','t4_plus','maison')),
  max_budget numeric(12,2) NOT NULL,
  strategy text NOT NULL CHECK (strategy IN ('location_nue','lmnp_longue_duree','bail_mobilite','colocation','coliving','airbnb')),
  min_monthly_cashflow numeric(10,2) NOT NULL DEFAULT 0,
  min_net_yield_pct numeric(5,2),
  tmi numeric(4,3) DEFAULT 0.30,
  down_payment_pct numeric(4,3) DEFAULT 0.10,
  active boolean NOT NULL DEFAULT true,
  last_scanned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX investor_profiles_user_idx ON public.investor_profiles(user_id, active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investor_profiles TO authenticated;
GRANT ALL ON public.investor_profiles TO service_role;
ALTER TABLE public.investor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_investor_profiles_all" ON public.investor_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER investor_profiles_touch BEFORE UPDATE ON public.investor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  investor_profile_id uuid REFERENCES public.investor_profiles(id) ON DELETE CASCADE,
  source text DEFAULT 'manual',
  source_url text,
  city_name text NOT NULL,
  postal_code text,
  property_type text,
  surface_sqm numeric(6,2),
  rooms int,
  price numeric(12,2) NOT NULL,
  listing jsonb,
  match_score int NOT NULL DEFAULT 0,
  matches boolean NOT NULL DEFAULT false,
  monthly_cashflow numeric(10,2),
  net_yield_pct numeric(5,2),
  result jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','saved','dismissed','analyzed')),
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opportunities_user_idx ON public.opportunities(user_id, detected_at DESC);
CREATE INDEX opportunities_profile_idx ON public.opportunities(investor_profile_id, match_score DESC);
CREATE INDEX opportunities_status_idx ON public.opportunities(user_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO authenticated;
GRANT ALL ON public.opportunities TO service_role;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_opportunities_all" ON public.opportunities FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('rent_increase','strategy_switch','refinancing','arbitrage_sell','tax_optimization')),
  title text NOT NULL,
  description text NOT NULL,
  estimated_monthly_gain numeric(10,2) NOT NULL DEFAULT 0,
  estimated_oneoff_gain numeric(12,2) NOT NULL DEFAULT 0,
  confidence text NOT NULL DEFAULT 'moyenne' CHECK (confidence IN ('haute','moyenne','faible')),
  priority int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dismissed')),
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recommendations_user_idx ON public.recommendations(user_id, status, priority DESC);
CREATE INDEX recommendations_property_idx ON public.recommendations(property_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendations TO authenticated;
GRANT ALL ON public.recommendations TO service_role;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_recommendations_all" ON public.recommendations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.regulatory_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name text,
  postal_prefix text,
  strategy text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','danger')),
  title text NOT NULL,
  body text NOT NULL,
  source_url text,
  effective_date date,
  published_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX regulatory_alerts_city_idx ON public.regulatory_alerts(city_name);
CREATE INDEX regulatory_alerts_published_idx ON public.regulatory_alerts(published_at DESC);
GRANT SELECT ON public.regulatory_alerts TO anon, authenticated;
GRANT ALL ON public.regulatory_alerts TO service_role;
ALTER TABLE public.regulatory_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regulatory_alerts_read_all" ON public.regulatory_alerts FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.regulatory_alert_reads (
  alert_id uuid NOT NULL REFERENCES public.regulatory_alerts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'read' CHECK (status IN ('read','dismissed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regulatory_alert_reads TO authenticated;
GRANT ALL ON public.regulatory_alert_reads TO service_role;
ALTER TABLE public.regulatory_alert_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_alert_reads_all" ON public.regulatory_alert_reads FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Nouvelle conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_conversations_user_idx ON public.assistant_conversations(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_conversations TO authenticated;
GRANT ALL ON public.assistant_conversations TO service_role;
ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_conversations_all" ON public.assistant_conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER assistant_conversations_touch BEFORE UPDATE ON public.assistant_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_messages_conv_idx ON public.assistant_messages(conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_messages TO authenticated;
GRANT ALL ON public.assistant_messages TO service_role;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_messages_all" ON public.assistant_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('opportunity','regulatory','recommendation','portfolio','system')),
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, read, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_notifications_all" ON public.notifications FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_done boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true;

-- Seed regulatory alerts
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
