-- =============================================================================
-- INTRA LEADS — system permissions, roles, and KPI catalog
-- Apply after intra_leads_schema.sql
-- Idempotent.
-- =============================================================================

BEGIN;

INSERT INTO permissions (code, resource, action, description)
VALUES
    ('lead:create', 'lead', 'create', 'Create leads'),
    ('lead:read', 'lead', 'read', 'Read leads in scope'),
    ('lead:update', 'lead', 'update', 'Update lead fields'),
    ('lead:assign', 'lead', 'assign', 'Assign or reassign leads'),
    ('lead:change_stage', 'lead', 'change_stage', 'Change pipeline stage'),
    ('lead:delete', 'lead', 'delete', 'Soft-delete leads'),
    ('lead:export', 'lead', 'export', 'Export leads'),
    ('contact:create', 'contact', 'create', 'Create contacts'),
    ('contact:read', 'contact', 'read', 'Read contacts'),
    ('contact:update', 'contact', 'update', 'Update contacts'),
    ('contact:delete', 'contact', 'delete', 'Soft-delete contacts'),
    ('account:create', 'account', 'create', 'Create accounts'),
    ('account:read', 'account', 'read', 'Read accounts'),
    ('account:update', 'account', 'update', 'Update accounts'),
    ('account:delete', 'account', 'delete', 'Soft-delete accounts'),
    ('activity:create', 'activity', 'create', 'Log lead activities'),
    ('activity:read', 'activity', 'read', 'Read lead activities'),
    ('follow_up:create', 'follow_up', 'create', 'Create follow-ups'),
    ('follow_up:read', 'follow_up', 'read', 'Read follow-ups'),
    ('follow_up:update', 'follow_up', 'update', 'Edit or reschedule follow-ups'),
    ('follow_up:complete', 'follow_up', 'complete', 'Complete or skip follow-ups'),
    ('site_visit:create', 'site_visit', 'create', 'Schedule site visits'),
    ('site_visit:read', 'site_visit', 'read', 'Read site visits'),
    ('site_visit:complete', 'site_visit', 'complete', 'Check in/out and complete visits'),
    ('quotation:create', 'quotation', 'create', 'Create quotations'),
    ('quotation:read', 'quotation', 'read', 'Read quotations'),
    ('quotation:send', 'quotation', 'send', 'Send quotations'),
    ('quotation:accept', 'quotation', 'accept', 'Accept or reject quotations'),
    ('target:manage', 'target', 'manage', 'Create and edit targets'),
    ('target:read', 'target', 'read', 'Read targets'),
    ('achievement:manage', 'achievement', 'manage', 'Record manual achievements'),
    ('achievement:read', 'achievement', 'read', 'Read achievements'),
    ('performance:read', 'performance', 'read', 'Read staff performance scoreboard'),
    ('dashboard:read', 'dashboard', 'read', 'Read founder dashboard widgets'),
    ('dashboard:self', 'dashboard', 'self', 'Read personal sales staff dashboard'),
    ('notification:read', 'notification', 'read', 'Read inbox'),
    ('notification:manage', 'notification', 'manage', 'Manage notification preferences'),
    ('warranty:create', 'warranty', 'create', 'Issue warranty cards'),
    ('warranty:read', 'warranty', 'read', 'Read warranty cards'),
    ('warranty:update', 'warranty', 'update', 'Update warranty status'),
    ('file:create', 'file', 'create', 'Request uploads'),
    ('file:read', 'file', 'read', 'Read file metadata and signed URLs'),
    ('tenant:manage_users', 'tenant', 'manage_users', 'Invite and suspend members'),
    ('tenant:manage_roles', 'tenant', 'manage_roles', 'Manage tenant roles'),
    ('tenant:manage_settings', 'tenant', 'manage_settings', 'Manage tenant settings'),
    ('audit:read', 'audit', 'read', 'Read audit logs')
ON CONFLICT (code) DO UPDATE
SET
    resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    description = EXCLUDED.description;

INSERT INTO roles (code, name, description, is_system, is_default)
VALUES
    ('platform.super_admin', 'Platform Super Admin', 'Control plane only', true, false),
    ('tenant.admin', 'Tenant Admin', 'Full tenant administration', true, false),
    ('sales.manager', 'Sales Manager', 'Team and territory CRM', true, false),
    ('sales.executive', 'Sales Executive', 'Owned-record CRM', true, true),
    ('sales.viewer', 'Sales Viewer', 'Read-only scoped CRM', true, false),
    ('api.integration', 'API Integration', 'Constrained machine access', true, false)
ON CONFLICT DO NOTHING;

-- ON CONFLICT DO NOTHING cannot target the partial unique index.
-- Re-resolve system roles by code.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM roles WHERE code = 'tenant.admin' AND tenant_id IS NULL) THEN
        RAISE EXCEPTION 'system roles were not inserted';
    END IF;
END;
$$;

-- Replace role_permissions for system roles from the catalog below
WITH role_map (role_code, perm_code) AS (
    VALUES
        -- tenant.admin: all tenant permissions
        ('tenant.admin', 'lead:create'),
        ('tenant.admin', 'lead:read'),
        ('tenant.admin', 'lead:update'),
        ('tenant.admin', 'lead:assign'),
        ('tenant.admin', 'lead:change_stage'),
        ('tenant.admin', 'lead:delete'),
        ('tenant.admin', 'lead:export'),
        ('tenant.admin', 'contact:create'),
        ('tenant.admin', 'contact:read'),
        ('tenant.admin', 'contact:update'),
        ('tenant.admin', 'contact:delete'),
        ('tenant.admin', 'account:create'),
        ('tenant.admin', 'account:read'),
        ('tenant.admin', 'account:update'),
        ('tenant.admin', 'account:delete'),
        ('tenant.admin', 'activity:create'),
        ('tenant.admin', 'activity:read'),
        ('tenant.admin', 'follow_up:create'),
        ('tenant.admin', 'follow_up:read'),
        ('tenant.admin', 'follow_up:update'),
        ('tenant.admin', 'follow_up:complete'),
        ('tenant.admin', 'site_visit:create'),
        ('tenant.admin', 'site_visit:read'),
        ('tenant.admin', 'site_visit:complete'),
        ('tenant.admin', 'quotation:create'),
        ('tenant.admin', 'quotation:read'),
        ('tenant.admin', 'quotation:send'),
        ('tenant.admin', 'quotation:accept'),
        ('tenant.admin', 'target:manage'),
        ('tenant.admin', 'target:read'),
        ('tenant.admin', 'achievement:manage'),
        ('tenant.admin', 'achievement:read'),
        ('tenant.admin', 'performance:read'),
        ('tenant.admin', 'dashboard:read'),
        ('tenant.admin', 'dashboard:self'),
        ('tenant.admin', 'notification:read'),
        ('tenant.admin', 'notification:manage'),
        ('tenant.admin', 'warranty:create'),
        ('tenant.admin', 'warranty:read'),
        ('tenant.admin', 'warranty:update'),
        ('tenant.admin', 'file:create'),
        ('tenant.admin', 'file:read'),
        ('tenant.admin', 'tenant:manage_users'),
        ('tenant.admin', 'tenant:manage_roles'),
        ('tenant.admin', 'tenant:manage_settings'),
        ('tenant.admin', 'audit:read'),

        -- sales.manager
        ('sales.manager', 'lead:create'),
        ('sales.manager', 'lead:read'),
        ('sales.manager', 'lead:update'),
        ('sales.manager', 'lead:assign'),
        ('sales.manager', 'lead:change_stage'),
        ('sales.manager', 'lead:export'),
        ('sales.manager', 'contact:create'),
        ('sales.manager', 'contact:read'),
        ('sales.manager', 'contact:update'),
        ('sales.manager', 'account:create'),
        ('sales.manager', 'account:read'),
        ('sales.manager', 'account:update'),
        ('sales.manager', 'activity:create'),
        ('sales.manager', 'activity:read'),
        ('sales.manager', 'follow_up:create'),
        ('sales.manager', 'follow_up:read'),
        ('sales.manager', 'follow_up:update'),
        ('sales.manager', 'follow_up:complete'),
        ('sales.manager', 'site_visit:create'),
        ('sales.manager', 'site_visit:read'),
        ('sales.manager', 'site_visit:complete'),
        ('sales.manager', 'quotation:create'),
        ('sales.manager', 'quotation:read'),
        ('sales.manager', 'quotation:send'),
        ('sales.manager', 'quotation:accept'),
        ('sales.manager', 'target:manage'),
        ('sales.manager', 'target:read'),
        ('sales.manager', 'achievement:read'),
        ('sales.manager', 'performance:read'),
        ('sales.manager', 'dashboard:read'),
        ('sales.manager', 'dashboard:self'),
        ('sales.manager', 'notification:read'),
        ('sales.manager', 'notification:manage'),
        ('sales.manager', 'warranty:create'),
        ('sales.manager', 'warranty:read'),
        ('sales.manager', 'warranty:update'),
        ('sales.manager', 'file:create'),
        ('sales.manager', 'file:read'),

        -- sales.executive
        ('sales.executive', 'lead:create'),
        ('sales.executive', 'lead:read'),
        ('sales.executive', 'lead:update'),
        ('sales.executive', 'lead:change_stage'),
        ('sales.executive', 'contact:create'),
        ('sales.executive', 'contact:read'),
        ('sales.executive', 'contact:update'),
        ('sales.executive', 'account:read'),
        ('sales.executive', 'activity:create'),
        ('sales.executive', 'activity:read'),
        ('sales.executive', 'follow_up:create'),
        ('sales.executive', 'follow_up:read'),
        ('sales.executive', 'follow_up:update'),
        ('sales.executive', 'follow_up:complete'),
        ('sales.executive', 'site_visit:create'),
        ('sales.executive', 'site_visit:read'),
        ('sales.executive', 'site_visit:complete'),
        ('sales.executive', 'quotation:create'),
        ('sales.executive', 'quotation:read'),
        ('sales.executive', 'quotation:send'),
        ('sales.executive', 'quotation:accept'),
        ('sales.executive', 'target:read'),
        ('sales.executive', 'achievement:read'),
        ('sales.executive', 'performance:read'),
        ('sales.executive', 'dashboard:self'),
        ('sales.executive', 'notification:read'),
        ('sales.executive', 'notification:manage'),
        ('sales.executive', 'warranty:read'),
        ('sales.executive', 'file:create'),
        ('sales.executive', 'file:read'),

        -- sales.viewer
        ('sales.viewer', 'lead:read'),
        ('sales.viewer', 'contact:read'),
        ('sales.viewer', 'account:read'),
        ('sales.viewer', 'activity:read'),
        ('sales.viewer', 'follow_up:read'),
        ('sales.viewer', 'site_visit:read'),
        ('sales.viewer', 'quotation:read'),
        ('sales.viewer', 'target:read'),
        ('sales.viewer', 'achievement:read'),
        ('sales.viewer', 'performance:read'),
        ('sales.viewer', 'notification:read'),
        ('sales.viewer', 'warranty:read'),
        ('sales.viewer', 'file:read'),

        -- api.integration
        ('api.integration', 'lead:create'),
        ('api.integration', 'lead:read'),
        ('api.integration', 'lead:update'),
        ('api.integration', 'contact:create'),
        ('api.integration', 'contact:read'),
        ('api.integration', 'activity:create'),
        ('api.integration', 'file:create'),
        ('api.integration', 'file:read')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM role_map rm
JOIN roles r ON r.code = rm.role_code AND r.tenant_id IS NULL AND r.deleted_at IS NULL
JOIN permissions p ON p.code = rm.perm_code
ON CONFLICT DO NOTHING;

INSERT INTO kpi_definitions (code, name, description, unit)
VALUES
    ('revenue', 'Revenue', 'Accepted quotation / won lead value in minor units', 'minor_currency'),
    ('leads_created', 'Leads created', 'New leads in period', 'count'),
    ('leads_won', 'Leads won', 'Leads marked won in period', 'count'),
    ('visits_completed', 'Site visits completed', 'Completed site visits', 'count'),
    ('follow_ups_completed', 'Follow-ups completed', 'Completed follow-ups', 'count'),
    ('quotations_accepted', 'Quotations accepted', 'Accepted quotations', 'count'),
    ('units_sold', 'Units sold', 'Quantity on won quotation lines in period', 'count'),
    ('lead_conversion', 'Lead conversion', 'Won / (won + lost) in period', 'percent'),
    ('follow_up_completion', 'Follow-up completion', 'Completed / due follow-ups in period', 'percent'),
    ('sales_achievement', 'Sales achievement', 'Won revenue vs membership target', 'percent'),
    ('quotation_conversion', 'Quotation conversion', 'Won / (won + lost) quotations in period', 'percent')
ON CONFLICT (code) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    unit = EXCLUDED.unit;

COMMIT;
