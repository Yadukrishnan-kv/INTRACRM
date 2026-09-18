-- =============================================================================
-- INTRA LEADS — follow-up engine: computed buckets, notifications, escalation
-- Apply after intra_leads_follow_ups.sql
-- Idempotent. Overdue / Today / Upcoming / No Follow-up are computed, not stored.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS follow_up_engine_events (
    id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id           uuid NOT NULL,
    resource_type       text NOT NULL,
    resource_id         uuid NOT NULL,
    event_type          text NOT NULL,
    bucket              text NOT NULL,
    escalation_level    smallint NOT NULL DEFAULT 0,
    window_date         date NOT NULL,
    recipient_user_id   uuid NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_follow_up_engine_resource CHECK (
        resource_type IN ('follow_up', 'lead')
    ),
    CONSTRAINT chk_follow_up_engine_bucket CHECK (
        bucket IN ('overdue', 'today', 'upcoming', 'no_follow_up')
    ),
    CONSTRAINT chk_follow_up_engine_event CHECK (
        event_type IN (
            'follow_up.overdue',
            'follow_up.due_today',
            'follow_up.upcoming',
            'follow_up.escalated',
            'lead.no_follow_up'
        )
    ),
    CONSTRAINT chk_follow_up_engine_level CHECK (escalation_level BETWEEN 0 AND 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_follow_up_engine_window
    ON follow_up_engine_events (
        tenant_id,
        resource_type,
        resource_id,
        event_type,
        escalation_level,
        window_date,
        recipient_user_id
    );

CREATE INDEX IF NOT EXISTS idx_follow_up_engine_tenant_window
    ON follow_up_engine_events (tenant_id, window_date DESC, event_type);

CREATE INDEX IF NOT EXISTS idx_follow_up_engine_recipient
    ON follow_up_engine_events (tenant_id, recipient_user_id, created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_follow_up_engine_events_tenant'
    ) THEN
        ALTER TABLE follow_up_engine_events
            ADD CONSTRAINT fk_follow_up_engine_events_tenant
            FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_follow_up_engine_events_user'
    ) THEN
        ALTER TABLE follow_up_engine_events
            ADD CONSTRAINT fk_follow_up_engine_events_user
            FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
END;
$$;

COMMENT ON TABLE follow_up_engine_events IS
    'Idempotent follow-up engine notifications and escalations. Bucket is recorded at send time; live status stays computed.';

COMMIT;
