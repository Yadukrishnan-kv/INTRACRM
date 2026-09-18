-- =============================================================================
-- INTRA LEADS — quotation follow-up: reminders, expected close, pending quotes
-- Apply after intra_leads_quotations.sql
-- Idempotent. Closing prediction is computed, not stored.
-- Pending = sent, follow_up, customer_deciding, negotiation, approved.
-- =============================================================================

BEGIN;

ALTER TABLE quotations
    ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz,
    ADD COLUMN IF NOT EXISTS remind_at timestamptz,
    ADD COLUMN IF NOT EXISTS expected_close_on date,
    ADD COLUMN IF NOT EXISTS last_followed_up_at timestamptz,
    ADD COLUMN IF NOT EXISTS follow_up_note text;

UPDATE quotations
SET expected_close_on = COALESCE(
        expected_close_on,
        valid_until_on,
        (COALESCE(sent_at, created_at) + interval '14 days')::date
    )
WHERE deleted_at IS NULL
  AND status::text NOT IN ('draft', 'won', 'lost')
  AND expected_close_on IS NULL;

UPDATE quotations
SET next_follow_up_at = COALESCE(
        next_follow_up_at,
        COALESCE(sent_at, created_at) + interval '2 days'
    ),
    remind_at = COALESCE(
        remind_at,
        COALESCE(sent_at, created_at) + interval '44 hours'
    )
WHERE deleted_at IS NULL
  AND status::text IN (
      'sent',
      'follow_up',
      'customer_deciding',
      'negotiation',
      'approved'
  )
  AND next_follow_up_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_pending_reminder
    ON quotations (tenant_id, next_follow_up_at)
    WHERE deleted_at IS NULL
      AND status IN (
          'sent'::quotation_status,
          'follow_up'::quotation_status,
          'customer_deciding'::quotation_status,
          'negotiation'::quotation_status,
          'approved'::quotation_status
      );

CREATE INDEX IF NOT EXISTS idx_quotations_expected_close
    ON quotations (tenant_id, expected_close_on)
    WHERE deleted_at IS NULL
      AND status IN (
          'sent'::quotation_status,
          'follow_up'::quotation_status,
          'customer_deciding'::quotation_status,
          'negotiation'::quotation_status,
          'approved'::quotation_status
      );

CREATE TABLE IF NOT EXISTS quotation_follow_up_events (
    id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id           uuid NOT NULL,
    quotation_id        uuid NOT NULL,
    event_type          text NOT NULL,
    bucket              text NOT NULL,
    escalation_level    smallint NOT NULL DEFAULT 0,
    window_date         date NOT NULL,
    recipient_user_id   uuid NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_quotation_follow_up_bucket CHECK (
        bucket IN (
            'pending',
            'overdue',
            'today',
            'upcoming',
            'closing_soon',
            'closing_overdue',
            'no_follow_up'
        )
    ),
    CONSTRAINT chk_quotation_follow_up_event CHECK (
        event_type IN (
            'quotation.follow_up_due',
            'quotation.follow_up_overdue',
            'quotation.follow_up_upcoming',
            'quotation.closing_soon',
            'quotation.closing_overdue',
            'quotation.no_follow_up',
            'quotation.escalated'
        )
    ),
    CONSTRAINT chk_quotation_follow_up_level CHECK (escalation_level BETWEEN 0 AND 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quotation_follow_up_window
    ON quotation_follow_up_events (
        tenant_id,
        quotation_id,
        event_type,
        escalation_level,
        window_date,
        recipient_user_id
    );

CREATE INDEX IF NOT EXISTS idx_quotation_follow_up_tenant_window
    ON quotation_follow_up_events (tenant_id, window_date DESC, event_type);

CREATE INDEX IF NOT EXISTS idx_quotation_follow_up_recipient
    ON quotation_follow_up_events (tenant_id, recipient_user_id, created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotation_follow_up_events_tenant'
    ) THEN
        ALTER TABLE quotation_follow_up_events
            ADD CONSTRAINT fk_quotation_follow_up_events_tenant
            FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotation_follow_up_events_quotation'
    ) THEN
        ALTER TABLE quotation_follow_up_events
            ADD CONSTRAINT fk_quotation_follow_up_events_quotation
            FOREIGN KEY (quotation_id) REFERENCES quotations (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotation_follow_up_events_user'
    ) THEN
        ALTER TABLE quotation_follow_up_events
            ADD CONSTRAINT fk_quotation_follow_up_events_user
            FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.enforce_same_tenant_from_quotation_follow_up()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    parent_tenant uuid;
BEGIN
    SELECT q.tenant_id
    INTO parent_tenant
    FROM quotations q
    WHERE q.id = NEW.quotation_id;

    IF parent_tenant IS NULL THEN
        RAISE EXCEPTION 'quotation % not found', NEW.quotation_id
            USING ERRCODE = '23503';
    END IF;

    IF parent_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'tenant_id % does not match quotation % tenant %',
            NEW.tenant_id, NEW.quotation_id, parent_tenant
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotation_follow_up_events_tenant ON quotation_follow_up_events;
CREATE TRIGGER trg_quotation_follow_up_events_tenant
    BEFORE INSERT OR UPDATE OF tenant_id, quotation_id
    ON quotation_follow_up_events
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_same_tenant_from_quotation_follow_up();

COMMENT ON COLUMN quotations.next_follow_up_at IS
    'Next reminder due for a pending quotation. Overdue is computed, not stored.';
COMMENT ON COLUMN quotations.remind_at IS
    'Optional early ping before next_follow_up_at.';
COMMENT ON COLUMN quotations.expected_close_on IS
    'Sales-expected closing date. Used for closing-soon / closing-overdue buckets.';
COMMENT ON COLUMN quotations.last_followed_up_at IS
    'When a salesperson last logged a quotation follow-up.';
COMMENT ON TABLE quotation_follow_up_events IS
    'Idempotent quotation reminder and closing notifications. Closing prediction stays computed.';

COMMIT;
