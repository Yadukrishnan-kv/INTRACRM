-- =============================================================================
-- INTRA LEADS — lead management increment: quality, requirement, customer name
-- Apply after intra_leads_schema.sql
-- Idempotent.
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_quality') THEN
        CREATE TYPE lead_quality AS ENUM ('hot', 'warm', 'cold');
    END IF;
END;
$$;

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS quality lead_quality;

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS requirement text;

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS customer_name text;

CREATE INDEX IF NOT EXISTS idx_leads_tenant_quality
    ON leads (tenant_id, quality, created_at DESC)
    WHERE deleted_at IS NULL AND quality IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_tenant_source
    ON leads (tenant_id, source_id, created_at DESC)
    WHERE deleted_at IS NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_tenant_owner
    ON leads (tenant_id, owner_membership_id, created_at DESC)
    WHERE deleted_at IS NULL AND owner_membership_id IS NOT NULL;

COMMENT ON COLUMN leads.quality IS 'Sales heat: hot, warm, or cold.';
COMMENT ON COLUMN leads.requirement IS 'Customer requirement / need statement.';
COMMENT ON COLUMN leads.customer_name IS 'Primary customer display name when no contact is linked.';

COMMIT;
