-- =============================================================================
-- INTRA LEADS — dedicated delete permissions for leads and quotations
-- Idempotent. Apply after intra_leads_rbac_product_roles.sql.
--
-- DELETE /leads/:leadId       now requires lead:delete      (was lead:update)
-- DELETE /quotations/:id      now requires quotation:delete (was quotation:create)
--
-- System roles are global (tenant_id IS NULL), so granting here covers every
-- existing tenant. Sales staff intentionally do not receive these grants.
-- =============================================================================

BEGIN;

INSERT INTO permissions (code, resource, action, description)
VALUES
    ('lead:delete', 'lead', 'delete', 'Soft-delete leads'),
    ('quotation:delete', 'quotation', 'delete', 'Soft-delete draft quotations')
ON CONFLICT DO NOTHING;

WITH role_map (role_code, perm_code) AS (
    VALUES
        ('tenant.founder', 'lead:delete'),
        ('tenant.founder', 'quotation:delete'),
        ('tenant.admin', 'lead:delete'),
        ('tenant.admin', 'quotation:delete'),
        ('business.manager', 'lead:delete'),
        ('business.manager', 'quotation:delete')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM role_map rm
JOIN roles r ON r.code = rm.role_code AND r.tenant_id IS NULL AND r.deleted_at IS NULL
JOIN permissions p ON p.code = rm.perm_code
ON CONFLICT DO NOTHING;

COMMIT;
