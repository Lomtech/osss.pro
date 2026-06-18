-- 0018 — Paywise-Inkasso-Anbindung
-- Siehe docs/INKASSO_PAYWISE_MAPPING.md.
--
-- (1) gyms: Paywise-Company/User-Verknüpfung + Onboarding-Status + Consent (API-only).
-- (2) dunning_handoffs.provider: 'paywise' als erlaubten Wert ergänzen.
-- Rein additiv. Vor dem Aktivieren der Anbindung anzuwenden.

-- (1) ---------------------------------------------------------------------------
ALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS paywise_company_id text;
ALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS paywise_user_id text;
ALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS paywise_status text;     -- 'pending' | 'data_complete' | 'active'
ALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS paywise_consent_at timestamptz; -- Opt-in des Gyms (API-only-Onboarding)

COMMENT ON COLUMN public.gyms.paywise_company_id IS 'Paywise Company-UUID (Gym = Gläubiger), via Partner-API angelegt';
COMMENT ON COLUMN public.gyms.paywise_user_id   IS 'Paywise User-UUID des Gyms → Header X-User-Id beim Claim';
COMMENT ON COLUMN public.gyms.paywise_status    IS 'Onboarding-Status: pending|data_complete|active (active == data_submission_completed)';
COMMENT ON COLUMN public.gyms.paywise_consent_at IS 'Zeitpunkt der Inkasso-Beauftragung durch das Gym (Opt-in)';

-- (2) ---------------------------------------------------------------------------
-- 'paywise' zum provider-CHECK ergänzen. Constraint-Name ist unsicher (Tabelle
-- teils live-only angelegt) → bestehenden CHECK auf 'provider' finden, droppen,
-- benannten neu anlegen. No-op, wenn die Tabelle (noch) nicht existiert.
DO $$
DECLARE existing_con text;
BEGIN
  IF to_regclass('public.dunning_handoffs') IS NULL THEN
    RAISE NOTICE 'dunning_handoffs existiert nicht — provider-CHECK übersprungen';
    RETURN;
  END IF;

  SELECT conname INTO existing_con
  FROM pg_constraint
  WHERE conrelid = 'public.dunning_handoffs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%provider%';

  IF existing_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.dunning_handoffs DROP CONSTRAINT %I', existing_con);
  END IF;

  ALTER TABLE public.dunning_handoffs
    ADD CONSTRAINT dunning_handoffs_provider_check
    CHECK (provider IN (
      'sport_alliance', 'fair_pay', 'eos', 'creditreform',
      'riverty', 'manual', 'other', 'paywise'
    ));
END $$;
