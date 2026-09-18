-- =============================================================================
-- INTRA LEADS — quotation module: commercial pipeline statuses and line items
-- Apply after intra_leads_site_visits.sql
-- Idempotent. Replaces quotation_status with the sales pipeline.
-- =============================================================================

BEGIN;

-- Pipeline: Draft → Sent → Follow-up → Customer Deciding → Negotiation → Approved → Won | Lost
DO $$
DECLARE
    has_follow_up boolean;
    has_viewed boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'quotation_status'
          AND e.enumlabel = 'follow_up'
    ) INTO has_follow_up;

    SELECT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'quotation_status'
          AND e.enumlabel = 'viewed'
    ) INTO has_viewed;

    IF has_follow_up AND NOT has_viewed THEN
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quotation_status_v2') THEN
        DROP TYPE quotation_status_v2;
    END IF;

    CREATE TYPE quotation_status_v2 AS ENUM (
        'draft',
        'sent',
        'follow_up',
        'customer_deciding',
        'negotiation',
        'approved',
        'won',
        'lost'
    );

    ALTER TABLE quotations ALTER COLUMN status DROP DEFAULT;

    ALTER TABLE quotations
        ALTER COLUMN status TYPE quotation_status_v2
        USING (
            CASE status::text
                WHEN 'viewed' THEN 'customer_deciding'
                WHEN 'accepted' THEN 'approved'
                WHEN 'rejected' THEN 'lost'
                WHEN 'expired' THEN 'lost'
                WHEN 'cancelled' THEN 'lost'
                WHEN 'follow_up' THEN 'follow_up'
                WHEN 'customer_deciding' THEN 'customer_deciding'
                WHEN 'negotiation' THEN 'negotiation'
                WHEN 'approved' THEN 'approved'
                WHEN 'won' THEN 'won'
                WHEN 'lost' THEN 'lost'
                WHEN 'sent' THEN 'sent'
                ELSE 'draft'
            END
        )::quotation_status_v2;

    DROP TYPE quotation_status;
    ALTER TYPE quotation_status_v2 RENAME TO quotation_status;

    ALTER TABLE quotations
        ALTER COLUMN status SET DEFAULT 'draft'::quotation_status;
END;
$$;

ALTER TABLE quotations
    ADD COLUMN IF NOT EXISTS title text,
    ADD COLUMN IF NOT EXISTS assigned_to_membership_id uuid,
    ADD COLUMN IF NOT EXISTS follow_up_at timestamptz,
    ADD COLUMN IF NOT EXISTS customer_deciding_at timestamptz,
    ADD COLUMN IF NOT EXISTS negotiation_at timestamptz,
    ADD COLUMN IF NOT EXISTS approved_at timestamptz,
    ADD COLUMN IF NOT EXISTS won_at timestamptz,
    ADD COLUMN IF NOT EXISTS lost_at timestamptz,
    ADD COLUMN IF NOT EXISTS lost_reason text;

UPDATE quotations
SET approved_at = COALESCE(approved_at, accepted_at)
WHERE accepted_at IS NOT NULL AND approved_at IS NULL;

UPDATE quotations
SET lost_at = COALESCE(lost_at, rejected_at)
WHERE rejected_at IS NOT NULL AND lost_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotations_assignee'
    ) THEN
        ALTER TABLE quotations
            ADD CONSTRAINT fk_quotations_assignee
            FOREIGN KEY (assigned_to_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_quotations_status
    ON quotations (tenant_id, status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_assignee
    ON quotations (tenant_id, assigned_to_membership_id, status)
    WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.enforce_same_tenant_from_quotation()
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

DROP TRIGGER IF EXISTS trg_quotation_items_tenant ON quotation_items;
CREATE TRIGGER trg_quotation_items_tenant
    BEFORE INSERT OR UPDATE OF tenant_id, quotation_id
    ON quotation_items
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_same_tenant_from_quotation();

COMMENT ON COLUMN quotations.status IS
    'Sales pipeline: draft, sent, follow_up, customer_deciding, negotiation, approved, won, lost.';

COMMIT;
