-- =============================================================================
-- INTRA LEADS — staff performance KPIs (live scoreboard)
-- Apply after intra_leads_targets.sql
-- Idempotent. Do not create a second performance table.
--
-- Live scoreboard (API) is the source of truth:
--   Lead conversion, Follow-up completion, Sales achievement, Quotation conversion
--   → weighted performance score, dense rank, leaderboards
-- staff_performance_snapshots remains an optional job cache of raw counts.
-- =============================================================================

BEGIN;

INSERT INTO kpi_definitions (code, name, description, unit)
VALUES
    (
        'lead_conversion',
        'Lead conversion',
        'Won / (won + lost) in period; falls back to won / created',
        'percent'
    ),
    (
        'follow_up_completion',
        'Follow-up completion',
        'Completed follow-ups / follow-ups due in period',
        'percent'
    ),
    (
        'sales_achievement',
        'Sales achievement',
        'Won quotation revenue vs membership revenue target',
        'percent'
    ),
    (
        'quotation_conversion',
        'Quotation conversion',
        'Won / (won + lost) quotations in period; falls back to won / sent',
        'percent'
    )
ON CONFLICT (code) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    unit = EXCLUDED.unit;

COMMENT ON TABLE staff_performance_snapshots IS
    'Optional job cache of raw period counts. Live staff performance (score, rank, leaderboards) is computed by the API.';

COMMIT;
