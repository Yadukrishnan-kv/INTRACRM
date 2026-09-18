-- =============================================================================
-- INTRA LEADS — authentication increment: login history + indexes
-- Apply after intra_leads_schema.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'login_event_result') THEN
        CREATE TYPE login_event_result AS ENUM ('success', 'failure', 'locked');
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS login_history (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    user_id         uuid,
    tenant_id       uuid,
    session_id      uuid,
    email           citext,
    device_id       text,
    device_name     text,
    ip_address      inet,
    user_agent      text,
    result          login_event_result NOT NULL,
    failure_reason  text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE login_history
    DROP CONSTRAINT IF EXISTS fk_login_history_user,
    DROP CONSTRAINT IF EXISTS fk_login_history_tenant,
    DROP CONSTRAINT IF EXISTS fk_login_history_session;

ALTER TABLE login_history
    ADD CONSTRAINT fk_login_history_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_login_history_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_login_history_session
        FOREIGN KEY (session_id) REFERENCES auth_sessions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_login_history_user_created
    ON login_history (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_history_email_created
    ON login_history (email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_history_device_created
    ON login_history (device_id, created_at DESC)
    WHERE device_id IS NOT NULL;

COMMENT ON TABLE login_history IS 'Append-only authentication attempts for device tracking and lockout forensics.';

COMMIT;
