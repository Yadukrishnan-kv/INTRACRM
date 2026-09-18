-- =============================================================================
-- INTRA LEADS — product RBAC roles, grants, and matrix views
-- Apply after intra_leads_seed_rbac.sql
-- Idempotent.
--
-- Product roles:
--   tenant.founder     Founder
--   tenant.admin       Admin
--   business.manager   Business Manager
--   sales.staff        Sales Staff
-- =============================================================================

BEGIN;

INSERT INTO roles (code, name, description, is_system, is_default)
VALUES
    ('tenant.founder', 'Founder', 'Business owner with full tenant control', true, false),
    ('business.manager', 'Business Manager', 'Operations, team CRM, and staff assignment', true, false),
    ('sales.staff', 'Sales Staff', 'Owned-record sales work', true, true)
ON CONFLICT DO NOTHING;

UPDATE roles
SET
    name = 'Admin',
    description = 'Full tenant administration'
WHERE code = 'tenant.admin'
  AND tenant_id IS NULL
  AND deleted_at IS NULL;

UPDATE roles
SET is_default = false
WHERE code = 'sales.executive'
  AND tenant_id IS NULL
  AND deleted_at IS NULL;

UPDATE roles
SET is_default = true
WHERE code = 'sales.staff'
  AND tenant_id IS NULL
  AND deleted_at IS NULL;

WITH role_map (role_code, perm_code) AS (
    VALUES
        -- Founder: full tenant catalog
        ('tenant.founder', 'lead:create'),
        ('tenant.founder', 'lead:read'),
        ('tenant.founder', 'lead:update'),
        ('tenant.founder', 'lead:assign'),
        ('tenant.founder', 'lead:change_stage'),
        ('tenant.founder', 'lead:delete'),
        ('tenant.founder', 'lead:export'),
        ('tenant.founder', 'contact:create'),
        ('tenant.founder', 'contact:read'),
        ('tenant.founder', 'contact:update'),
        ('tenant.founder', 'contact:delete'),
        ('tenant.founder', 'account:create'),
        ('tenant.founder', 'account:read'),
        ('tenant.founder', 'account:update'),
        ('tenant.founder', 'account:delete'),
        ('tenant.founder', 'activity:create'),
        ('tenant.founder', 'activity:read'),
        ('tenant.founder', 'follow_up:create'),
        ('tenant.founder', 'follow_up:read'),
        ('tenant.founder', 'follow_up:update'),
        ('tenant.founder', 'follow_up:complete'),
        ('tenant.founder', 'site_visit:create'),
        ('tenant.founder', 'site_visit:read'),
        ('tenant.founder', 'site_visit:complete'),
        ('tenant.founder', 'quotation:create'),
        ('tenant.founder', 'quotation:read'),
        ('tenant.founder', 'quotation:send'),
        ('tenant.founder', 'quotation:accept'),
        ('tenant.founder', 'target:manage'),
        ('tenant.founder', 'target:read'),
        ('tenant.founder', 'achievement:manage'),
        ('tenant.founder', 'achievement:read'),
        ('tenant.founder', 'performance:read'),
        ('tenant.founder', 'dashboard:read'),
        ('tenant.founder', 'dashboard:self'),
        ('tenant.founder', 'notification:read'),
        ('tenant.founder', 'notification:manage'),
        ('tenant.founder', 'warranty:create'),
        ('tenant.founder', 'warranty:read'),
        ('tenant.founder', 'warranty:update'),
        ('tenant.founder', 'file:create'),
        ('tenant.founder', 'file:read'),
        ('tenant.founder', 'tenant:manage_users'),
        ('tenant.founder', 'tenant:manage_roles'),
        ('tenant.founder', 'tenant:manage_settings'),
        ('tenant.founder', 'audit:read'),

        -- Business Manager
        ('business.manager', 'lead:create'),
        ('business.manager', 'lead:read'),
        ('business.manager', 'lead:update'),
        ('business.manager', 'lead:assign'),
        ('business.manager', 'lead:change_stage'),
        ('business.manager', 'lead:export'),
        ('business.manager', 'contact:create'),
        ('business.manager', 'contact:read'),
        ('business.manager', 'contact:update'),
        ('business.manager', 'account:create'),
        ('business.manager', 'account:read'),
        ('business.manager', 'account:update'),
        ('business.manager', 'activity:create'),
        ('business.manager', 'activity:read'),
        ('business.manager', 'follow_up:create'),
        ('business.manager', 'follow_up:read'),
        ('business.manager', 'follow_up:update'),
        ('business.manager', 'follow_up:complete'),
        ('business.manager', 'site_visit:create'),
        ('business.manager', 'site_visit:read'),
        ('business.manager', 'site_visit:complete'),
        ('business.manager', 'quotation:create'),
        ('business.manager', 'quotation:read'),
        ('business.manager', 'quotation:send'),
        ('business.manager', 'quotation:accept'),
        ('business.manager', 'target:manage'),
        ('business.manager', 'target:read'),
        ('business.manager', 'achievement:manage'),
        ('business.manager', 'achievement:read'),
        ('business.manager', 'performance:read'),
        ('business.manager', 'dashboard:read'),
        ('business.manager', 'dashboard:self'),
        ('business.manager', 'notification:read'),
        ('business.manager', 'notification:manage'),
        ('business.manager', 'warranty:create'),
        ('business.manager', 'warranty:read'),
        ('business.manager', 'warranty:update'),
        ('business.manager', 'file:create'),
        ('business.manager', 'file:read'),
        ('business.manager', 'tenant:manage_users'),

        -- Sales Staff
        ('sales.staff', 'lead:create'),
        ('sales.staff', 'lead:read'),
        ('sales.staff', 'lead:update'),
        ('sales.staff', 'lead:change_stage'),
        ('sales.staff', 'contact:create'),
        ('sales.staff', 'contact:read'),
        ('sales.staff', 'contact:update'),
        ('sales.staff', 'account:read'),
        ('sales.staff', 'activity:create'),
        ('sales.staff', 'activity:read'),
        ('sales.staff', 'follow_up:create'),
        ('sales.staff', 'follow_up:read'),
        ('sales.staff', 'follow_up:update'),
        ('sales.staff', 'follow_up:complete'),
        ('sales.staff', 'site_visit:create'),
        ('sales.staff', 'site_visit:read'),
        ('sales.staff', 'site_visit:complete'),
        ('sales.staff', 'quotation:create'),
        ('sales.staff', 'quotation:read'),
        ('sales.staff', 'quotation:send'),
        ('sales.staff', 'quotation:accept'),
        ('sales.staff', 'target:read'),
        ('sales.staff', 'achievement:read'),
        ('sales.staff', 'performance:read'),
        ('sales.staff', 'dashboard:self'),
        ('sales.staff', 'notification:read'),
        ('sales.staff', 'notification:manage'),
        ('sales.staff', 'warranty:read'),
        ('sales.staff', 'file:create'),
        ('sales.staff', 'file:read')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM role_map rm
JOIN roles r ON r.code = rm.role_code AND r.tenant_id IS NULL AND r.deleted_at IS NULL
JOIN permissions p ON p.code = rm.perm_code
ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW app.v_permission_matrix AS
SELECT
    r.id            AS role_id,
    r.tenant_id,
    r.code          AS role_code,
    r.name          AS role_name,
    r.is_system,
    r.is_default,
    p.id            AS permission_id,
    p.code          AS permission_code,
    p.resource,
    p.action,
    p.description   AS permission_description,
    (rp.role_id IS NOT NULL) AS granted
FROM roles r
CROSS JOIN permissions p
LEFT JOIN role_permissions rp
    ON rp.role_id = r.id
   AND rp.permission_id = p.id
WHERE r.deleted_at IS NULL;

CREATE OR REPLACE VIEW app.v_membership_permissions AS
SELECT DISTINCT
    m.id            AS membership_id,
    m.tenant_id,
    m.user_id,
    r.id            AS role_id,
    r.code          AS role_code,
    p.id            AS permission_id,
    p.code          AS permission_code
FROM memberships m
JOIN membership_roles mr ON mr.membership_id = m.id
JOIN roles r ON r.id = mr.role_id AND r.deleted_at IS NULL
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON p.id = rp.permission_id
WHERE m.deleted_at IS NULL
  AND m.status = 'active';

COMMENT ON VIEW app.v_permission_matrix IS 'Role × permission grant grid for system and tenant roles.';
COMMENT ON VIEW app.v_membership_permissions IS 'Effective permissions for active memberships.';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'intra_api') THEN
        GRANT SELECT ON app.v_permission_matrix TO intra_api, intra_worker, intra_readonly;
        GRANT SELECT ON app.v_membership_permissions TO intra_api, intra_worker, intra_readonly;
    END IF;
END;
$$;

COMMIT;
