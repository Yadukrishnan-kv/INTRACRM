-- =============================================================================
-- INTRA LEADS — database roles and grants
-- Apply after intra_leads_schema.sql as a superuser.
-- Passwords must be set out of band via Secrets Manager. This script
-- creates login roles without passwords for RDS IAM / secret rotation.
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'intra_migrator') THEN
        CREATE ROLE intra_migrator NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'intra_api') THEN
        CREATE ROLE intra_api NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'intra_worker') THEN
        CREATE ROLE intra_worker NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'intra_readonly') THEN
        CREATE ROLE intra_readonly NOINHERIT;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO intra_migrator, intra_api, intra_worker, intra_readonly;
GRANT USAGE ON SCHEMA app TO intra_migrator, intra_api, intra_worker, intra_readonly;

GRANT ALL ON SCHEMA public TO intra_migrator;
GRANT ALL ON SCHEMA app TO intra_migrator;
GRANT ALL ON ALL TABLES IN SCHEMA public TO intra_migrator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO intra_migrator;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA app TO intra_migrator;

ALTER DEFAULT PRIVILEGES FOR ROLE intra_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO intra_api, intra_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE intra_migrator IN SCHEMA public
    GRANT SELECT ON TABLES TO intra_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE intra_migrator IN SCHEMA app
    GRANT EXECUTE ON FUNCTIONS TO intra_api, intra_worker, intra_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO intra_api, intra_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO intra_readonly;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO intra_api, intra_worker, intra_readonly;

-- Audit trail is append-only for application roles
REVOKE UPDATE, DELETE ON audit_logs FROM intra_api, intra_worker;
GRANT SELECT, INSERT ON audit_logs TO intra_api, intra_worker;
GRANT SELECT ON audit_logs TO intra_readonly;

-- Credentials: API only, never readonly
REVOKE ALL ON user_credentials FROM intra_readonly, intra_worker;
GRANT SELECT, INSERT, UPDATE ON user_credentials TO intra_api;

REVOKE ALL ON refresh_tokens FROM intra_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO intra_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON otp_challenges TO intra_api;
REVOKE ALL ON otp_challenges FROM intra_readonly;

-- Worker owns outbox relay and snapshot writes
GRANT SELECT, INSERT, UPDATE, DELETE ON domain_outbox TO intra_worker;
GRANT SELECT, INSERT, UPDATE ON staff_performance_snapshots TO intra_worker;
GRANT SELECT, INSERT, UPDATE ON achievements TO intra_worker;
GRANT SELECT, INSERT, UPDATE ON notifications TO intra_worker;

ALTER ROLE intra_api SET statement_timeout = '15s';
ALTER ROLE intra_api SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE intra_api SET lock_timeout = '5s';

ALTER ROLE intra_worker SET statement_timeout = '120s';
ALTER ROLE intra_worker SET idle_in_transaction_session_timeout = '30s';

ALTER ROLE intra_readonly SET default_transaction_read_only = on;
ALTER ROLE intra_readonly SET statement_timeout = '30s';

COMMIT;
