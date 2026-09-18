-- =============================================================================
-- INTRA LEADS — Row Level Security (optional at launch, required for
-- contractual isolation). Apply after intra_leads_schema.sql
--
-- Session contract:
--   SET LOCAL app.tenant_id = '<uuid>';
--   SET LOCAL app.is_platform_admin = 'false';
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT nullif(current_setting('app.tenant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT lower(coalesce(current_setting('app.is_platform_admin', true), 'false'))
        IN ('true', '1', 'on', 'yes');
$$;

CREATE OR REPLACE FUNCTION app.tenant_isolation_predicate(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app.is_platform_admin()
        OR (app.current_tenant_id() IS NOT NULL AND p_tenant_id = app.current_tenant_id());
$$;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'files', 'tenant_sequences', 'branches', 'teams', 'territories',
        'memberships', 'lead_sources', 'pipelines', 'pipeline_stages', 'loss_reasons',
        'accounts', 'contacts', 'product_categories', 'products', 'warranty_periods',
        'lead_qualities', 'leads', 'message_templates', 'outbound_messages',
        'billing_customers', 'billing_invoices', 'billing_payments', 'billing_sync_jobs',
        'lead_assignments', 'lead_stage_changes', 'lead_activities', 'follow_ups',
        'site_visits', 'site_visit_photos', 'quotations', 'quotation_items',
        'quotation_follow_up_events', 'targets', 'achievements',
        'staff_performance_snapshots', 'notifications', 'notification_preferences',
        'warranty_cards', 'warranty_card_items', 'audit_logs', 'domain_outbox',
        'idempotency_keys'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I
             FOR ALL
             USING (app.tenant_isolation_predicate(tenant_id))
             WITH CHECK (app.tenant_isolation_predicate(tenant_id))',
            'rls_' || t || '_tenant',
            t
        );
    END LOOP;
END;
$$;

-- System roles (tenant_id NULL) must remain readable to every tenant session.
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_roles_tenant
    ON roles
    FOR ALL
    USING (
        tenant_id IS NULL
        OR app.tenant_isolation_predicate(tenant_id)
    )
    WITH CHECK (
        (tenant_id IS NULL AND app.is_platform_admin())
        OR (tenant_id IS NOT NULL AND app.tenant_isolation_predicate(tenant_id))
    );

-- Device tokens may be tenant-null during first login
ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_push_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_device_push_tokens_tenant
    ON device_push_tokens
    FOR ALL
    USING (
        app.is_platform_admin()
        OR tenant_id IS NULL
        OR app.tenant_isolation_predicate(tenant_id)
    )
    WITH CHECK (
        app.is_platform_admin()
        OR tenant_id IS NULL
        OR app.tenant_isolation_predicate(tenant_id)
    );

-- Auth sessions: user-scoped, not tenant-forced
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_challenges ENABLE ROW LEVEL SECURITY;

-- These remain usable by the API role without tenant GUC during login.
-- Tighten with session user_id GUC when the identity module lands.

COMMIT;
