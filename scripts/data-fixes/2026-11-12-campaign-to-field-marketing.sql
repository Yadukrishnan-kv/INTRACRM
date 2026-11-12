-- =============================================================================
-- One-off data fix: move leads whose Lead Source is "Campaign" to
-- "Field Marketing".
--
-- Field-marketing leads were entered with Source = Campaign before the
-- Field Marketing source existed. Only Campaign leads CREATED BY the field
-- marketing person (matched by their login email) are moved; Campaign leads
-- entered by anyone else stay on Campaign.
--
-- What it changes (and nothing else):
--   * leads.source_id           Campaign -> Field Marketing, only for active
--                               leads created by the given user
--   * leads.updated_at/version  bumped by the existing trg_leads_touch trigger,
--                               so stale mobile caches get a sync conflict
--                               instead of silently writing Campaign back
--   * audit_logs                one 'update' row per lead (before/after source),
--                               shown in each lead's audit trail and usable
--                               for rollback (see bottom of file)
--   * lead_sources              inserts Field Marketing for a tenant only if it
--                               is missing (same row as intra_leads_catalog.sql)
-- Not touched: soft-deleted leads, the Campaign source itself, stage, owner,
-- values, activities, follow-ups, quotations, etc.
--
-- Usage (preview is the default — it ROLLS BACK):
--   # Who created the Campaign leads? (no email given -> lists creators, changes nothing)
--   psql "$DATABASE_URL" -f scripts/data-fixes/2026-11-12-campaign-to-field-marketing.sql
--   # Preview the exact leads for the field marketing person
--   psql "$DATABASE_URL" -v fm_email=person@example.com -f scripts/data-fixes/2026-11-12-campaign-to-field-marketing.sql
--   # Apply
--   psql "$DATABASE_URL" -v fm_email=person@example.com -v apply=1 -f scripts/data-fixes/2026-11-12-campaign-to-field-marketing.sql
-- Safe to re-run: a second apply finds 0 matching Campaign leads.
-- =============================================================================

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif
\if :{?fm_email}
\else
  \set fm_email ''
\endif

BEGIN;

-- Platform-admin scope so this also works where intra_leads_rls.sql is applied.
SET LOCAL app.is_platform_admin = 'true';

-- 1. Make sure every tenant has the Field Marketing source.
INSERT INTO lead_sources (tenant_id, code, name, sort_order)
SELECT t.id, 'field_marketing', 'Field Marketing', 25
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1
    FROM lead_sources s
    WHERE s.tenant_id = t.id
      AND s.deleted_at IS NULL
      AND (s.code = 'field_marketing' OR lower(s.name) = 'field marketing')
);

-- 2. Pair each tenant's Campaign source with its Field Marketing source.
CREATE TEMP TABLE fix_source_map ON COMMIT DROP AS
SELECT c.tenant_id,
       c.id AS campaign_id,
       c.name AS campaign_name,
       (SELECT f.id
          FROM lead_sources f
         WHERE f.tenant_id = c.tenant_id
           AND f.deleted_at IS NULL
           AND (f.code = 'field_marketing' OR lower(f.name) = 'field marketing')
         ORDER BY (f.code = 'field_marketing') DESC, f.created_at
         LIMIT 1) AS field_marketing_id
FROM lead_sources c
WHERE c.code = 'campaign';

-- 3. Who created the Campaign leads (helps confirm the right person).
\echo
\echo '== All active Campaign leads by who created them =='
SELECT t.name AS tenant,
       coalesce(u.full_name, '(unknown / system)') AS created_by,
       u.email,
       count(*) AS campaign_leads,
       CASE WHEN u.email IS NOT NULL AND u.email = :'fm_email' THEN 'will move' ELSE 'stays Campaign' END AS action
FROM leads l
JOIN fix_source_map m ON m.tenant_id = l.tenant_id AND l.source_id = m.campaign_id
JOIN tenants t ON t.id = l.tenant_id
LEFT JOIN users u ON u.id = l.created_by
WHERE l.deleted_at IS NULL
GROUP BY t.name, u.full_name, u.email
ORDER BY t.name, campaign_leads DESC;

-- The field marketing person (email must match exactly one user).
CREATE TEMP TABLE fix_fm_user ON COMMIT DROP AS
SELECT id, full_name, email FROM users WHERE email = :'fm_email' AND :'fm_email' <> '';

DO $$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n FROM fix_fm_user;
    IF n = 0 THEN
        RAISE EXCEPTION 'No user matches fm_email. Pick the field marketing person''s email from the list above and re-run with -v fm_email=<email>. Nothing changed.';
    ELSIF n > 1 THEN
        RAISE EXCEPTION 'fm_email matches % users; nothing changed.', n;
    END IF;
END;
$$;

-- 4. The exact leads that will change.
CREATE TEMP TABLE fix_leads ON COMMIT DROP AS
SELECT l.id, l.tenant_id, l.lead_number, l.title, l.customer_name,
       m.campaign_id, m.campaign_name, m.field_marketing_id
FROM leads l
JOIN fix_source_map m ON m.tenant_id = l.tenant_id AND l.source_id = m.campaign_id
JOIN fix_fm_user fm ON fm.id = l.created_by
WHERE l.deleted_at IS NULL;

\echo
\echo '== Leads to move from Campaign to Field Marketing, per tenant =='
SELECT t.name AS tenant, count(*) AS leads
FROM fix_leads f JOIN tenants t ON t.id = f.tenant_id
GROUP BY t.name ORDER BY t.name;

\echo '== Lead list =='
SELECT t.name AS tenant, f.lead_number, coalesce(f.customer_name, f.title) AS lead
FROM fix_leads f JOIN tenants t ON t.id = f.tenant_id
ORDER BY t.name, f.lead_number;

-- Guard: never point a lead at a missing source.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM fix_leads WHERE field_marketing_id IS NULL) THEN
        RAISE EXCEPTION 'Field Marketing source missing for a tenant; nothing changed.';
    END IF;
END;
$$;

-- 5. Change only source_id.
UPDATE leads l
SET source_id = f.field_marketing_id
FROM fix_leads f
WHERE l.id = f.id
  AND l.source_id = f.campaign_id;

-- 6. Audit trail (one row per lead) — also the rollback record.
INSERT INTO audit_logs (tenant_id, actor_type, action, resource_type, resource_id, before_data, after_data)
SELECT f.tenant_id, 'system', 'update', 'lead', f.id,
       jsonb_build_object('summary', 'Lead source: ' || f.campaign_name,
                          'sourceId', f.campaign_id),
       jsonb_build_object('summary', 'Lead source: ' || f.campaign_name || ' → Field Marketing (bulk fix)',
                          'sourceId', f.field_marketing_id,
                          'number', f.lead_number,
                          'dataFix', '2026-11-12-campaign-to-field-marketing')
FROM fix_leads f;

\echo '== After the change: Campaign leads left (field marketing person should be 0) =='
SELECT count(*) FILTER (WHERE l.created_by IN (SELECT id FROM fix_fm_user)) AS fm_person_remaining,
       count(*) FILTER (WHERE l.created_by IS DISTINCT FROM (SELECT id FROM fix_fm_user)) AS others_kept_on_campaign
FROM leads l JOIN fix_source_map m ON l.source_id = m.campaign_id
WHERE l.deleted_at IS NULL;

\if :apply
  COMMIT;
  \echo 'APPLIED: changes committed.'
\else
  ROLLBACK;
  \echo 'PREVIEW ONLY: rolled back. Re-run with -v apply=1 to commit.'
\endif

-- -----------------------------------------------------------------------------
-- Rollback (only if ever needed) — restores each lead's previous source,
-- unless the lead's source has been changed again since:
--
-- BEGIN;
-- SET LOCAL app.is_platform_admin = 'true';
-- UPDATE leads l
-- SET source_id = (a.before_data->>'sourceId')::uuid
-- FROM audit_logs a
-- WHERE a.after_data->>'dataFix' = '2026-11-12-campaign-to-field-marketing'
--   AND a.resource_id = l.id
--   AND l.source_id = (a.after_data->>'sourceId')::uuid;
-- COMMIT;
-- -----------------------------------------------------------------------------
