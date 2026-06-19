-- 0020 — Paywise-Webhook pro Gym
--
-- Paywise-Webhooks sind pro Kundenorganisation (Gym/Company) gescoped: bei jedem
-- Gym-Onboarding wird einmalig ein Webhook angelegt; das Signing-Secret kommt NUR
-- einmalig zurück. Beides muss pro Gym gespeichert werden (das globale
-- INKASSO_PAYWISE_WEBHOOK_SECRET reicht im Partner-Modell nicht). Rein additiv.

ALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS paywise_webhook_id text;
ALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS paywise_webhook_secret text;

COMMENT ON COLUMN public.gyms.paywise_webhook_id     IS 'Paywise Webhook-Endpoint-ID dieses Gyms (für Update/Delete)';
COMMENT ON COLUMN public.gyms.paywise_webhook_secret IS 'HMAC-Signing-Secret des Gym-Webhooks (einmalig bei Anlage geliefert) — für Verify eingehender Events';
