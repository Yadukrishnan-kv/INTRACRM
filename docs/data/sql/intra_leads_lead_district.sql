-- =============================================================================
-- INTRA LEADS — lead district (free-text address refinement, e.g. Kozhikode)
-- Apply after intra_leads_lead_management.sql
-- Idempotent.
-- =============================================================================

BEGIN;

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS district text;

COMMENT ON COLUMN leads.district IS 'Free-text district/sub-region, shown beside city on the lead and quotation forms.';

COMMIT;
