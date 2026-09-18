-- =============================================================================
-- INTRA LEADS — activity timeline increment
-- Apply after intra_leads_lead_pipeline.sql
-- Idempotent. Reuses lead_activities; adds structured event_code.
-- =============================================================================

BEGIN;

ALTER TABLE lead_activities
    ADD COLUMN IF NOT EXISTS event_code text;

UPDATE lead_activities
SET event_code = CASE subject
    WHEN 'Lead created' THEN 'lead_created'
    WHEN 'Lead updated' THEN 'lead_updated'
    WHEN 'Stage changed' THEN 'status_changed'
    WHEN 'Follow-up scheduled' THEN 'follow_up_added'
    ELSE COALESCE(event_code, type::text)
END
WHERE event_code IS NULL;

UPDATE lead_activities
SET event_code = type::text
WHERE event_code IS NULL;

ALTER TABLE lead_activities
    ALTER COLUMN event_code SET DEFAULT 'system';

ALTER TABLE lead_activities
    ALTER COLUMN event_code SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_lead_activities_event_code'
    ) THEN
        ALTER TABLE lead_activities
            ADD CONSTRAINT chk_lead_activities_event_code CHECK (
                event_code IN (
                    'lead_created',
                    'lead_updated',
                    'status_changed',
                    'follow_up_added',
                    'quotation_sent',
                    'site_visit_added',
                    'note',
                    'call',
                    'email',
                    'meeting',
                    'sms',
                    'whatsapp',
                    'system'
                )
            );
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_lead_activities_tenant_occurred
    ON lead_activities (tenant_id, occurred_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_activities_tenant_event
    ON lead_activities (tenant_id, event_code, occurred_at DESC)
    WHERE deleted_at IS NULL;

COMMENT ON COLUMN lead_activities.event_code IS
    'Structured timeline event. Catalog: lead_created, lead_updated, status_changed, follow_up_added, quotation_sent, site_visit_added.';

COMMIT;
