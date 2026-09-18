-- =============================================================================
-- INTRA LEADS — follow-up module increment: type, reschedule, update permission
-- Apply after intra_leads_activity_timeline.sql
-- Idempotent. Reuses follow_ups; does not create a second table.
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'follow_up_type') THEN
        CREATE TYPE follow_up_type AS ENUM ('call', 'whatsapp', 'visit', 'meeting');
    END IF;
END;
$$;

ALTER TABLE follow_ups
    ADD COLUMN IF NOT EXISTS type follow_up_type NOT NULL DEFAULT 'call';

ALTER TABLE follow_ups
    ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0;

ALTER TABLE follow_ups
    ADD COLUMN IF NOT EXISTS last_rescheduled_at timestamptz;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_follow_ups_reschedule_count'
    ) THEN
        ALTER TABLE follow_ups
            ADD CONSTRAINT chk_follow_ups_reschedule_count CHECK (reschedule_count >= 0);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_follow_ups_tenant_type_status
    ON follow_ups (tenant_id, type, status, due_at)
    WHERE deleted_at IS NULL;

INSERT INTO permissions (code, resource, action, description)
VALUES (
    'follow_up:update',
    'follow_up',
    'update',
    'Edit or reschedule follow-ups'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'follow_up:update'
JOIN role_permissions existing ON existing.role_id = r.id
JOIN permissions existing_p
    ON existing_p.id = existing.permission_id
   AND existing_p.code = 'follow_up:create'
WHERE r.deleted_at IS NULL
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN follow_ups.type IS
    'Follow-up channel: call, whatsapp, visit, or meeting.';
COMMENT ON COLUMN follow_ups.reschedule_count IS
    'How many times due_at was moved while the follow-up stayed pending.';
COMMENT ON COLUMN follow_ups.last_rescheduled_at IS
    'When due_at was last moved.';

COMMIT;
