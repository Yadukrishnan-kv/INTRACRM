-- =============================================================================
-- INTRA LEADS — pipeline increment: stage-change analytics indexes
-- Apply after intra_leads_lead_management.sql
-- Idempotent. Product stages are provisioned per tenant by the API catalog.
-- =============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_tenant_to_stage
    ON lead_stage_changes (tenant_id, to_stage_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_tenant_changed
    ON lead_stage_changes (tenant_id, changed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_pipeline_stage
    ON leads (tenant_id, pipeline_id, stage_id)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE lead_stage_changes IS
    'Append-only stage/lifecycle history for kanban status tracking and conversion analytics.';

COMMIT;
