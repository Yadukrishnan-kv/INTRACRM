-- =============================================================================
-- INTRA LEADS — monthly partitions for audit_logs and notifications
-- Apply after intra_leads_schema.sql
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.month_start(p_ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT date_trunc('month', p_ts AT TIME ZONE 'UTC')::date;
$$;

CREATE OR REPLACE FUNCTION app.ensure_monthly_partition(
    p_parent regclass,
    p_from date
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    part_name text;
    parent_name text;
    p_to date := (p_from + INTERVAL '1 month')::date;
BEGIN
    SELECT c.relname
    INTO parent_name
    FROM pg_class c
    WHERE c.oid = p_parent;

    part_name := parent_name || '_' || to_char(p_from, 'YYYY_MM');

    IF to_regclass(part_name) IS NOT NULL THEN
        RETURN;
    END IF;

    EXECUTE format(
        'CREATE TABLE %I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
        part_name,
        p_parent::text,
        p_from,
        p_to
    );

    IF parent_name = 'notifications' THEN
        EXECUTE format(
            'ALTER TABLE %I SET (fillfactor = 90, autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01)',
            part_name
        );
    ELSIF parent_name = 'audit_logs' THEN
        EXECUTE format(
            'ALTER TABLE %I SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01)',
            part_name
        );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.ensure_monthly_partitions(
    p_months_ahead integer DEFAULT 3
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    i integer;
    month_cursor date;
BEGIN
    IF p_months_ahead < 1 OR p_months_ahead > 24 THEN
        RAISE EXCEPTION 'p_months_ahead must be between 1 and 24';
    END IF;

    -- Include previous month for late writes / clock skew
    FOR i IN -1..p_months_ahead
    LOOP
        month_cursor := app.month_start((now() AT TIME ZONE 'UTC') + (i || ' months')::interval);
        PERFORM app.ensure_monthly_partition('audit_logs', month_cursor);
        PERFORM app.ensure_monthly_partition('notifications', month_cursor);
    END LOOP;
END;
$$;

COMMENT ON FUNCTION app.ensure_monthly_partitions(integer) IS
    'Creates previous, current, and upcoming monthly partitions. Run from the scheduler.';

SELECT app.ensure_monthly_partitions(3);

COMMIT;
