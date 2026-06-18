-- 0019 — Auto-Übergabe ans Inkasso (deterministische Vorstufe)
--
-- Owner-Opt-in: nach der letzten Mahnung (Stufe 3) + N Tagen ohne Zahlung wird
-- automatisch ein dunning_handoff angelegt (und, falls ein API-Provider wie
-- Paywise konfiguriert ist, übergeben). Standardmäßig AUS — Inkasso-Übergabe ist
-- konsequent, daher bewusst opt-in.

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS dunning_auto_inkasso_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS dunning_days_to_inkasso integer NOT NULL DEFAULT 14;

COMMENT ON COLUMN public.gyms.dunning_auto_inkasso_enabled IS
  'Opt-in: Stufe 3 + dunning_days_to_inkasso Tage → automatischer dunning_handoff';
COMMENT ON COLUMN public.gyms.dunning_days_to_inkasso IS
  'Tage nach der letzten Mahnung (Stufe 3), bevor automatisch ans Inkasso übergeben wird';
