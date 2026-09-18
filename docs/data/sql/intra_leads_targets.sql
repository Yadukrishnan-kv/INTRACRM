-- =============================================================================
-- INTRA LEADS — Target module: daily periods, product targets, live progress
-- Apply after intra_leads_quotation_follow_up.sql
-- Idempotent. Do not create a second targets table.
--
-- Monthly  = period_type monthly (first–last day of month)
-- Daily    = period_type daily   (period_start = period_end)
-- Team     = scope_type team     (scope_id = team_id)
-- Product  = product_id set      (orthogonal to scope: team + product is valid)
--
-- ALTER TYPE ADD VALUE cannot be used in the same transaction that consumes
-- the new enum. Keep the ADD VALUE statement outside BEGIN/COMMIT.
-- =============================================================================

ALTER TYPE period_type ADD VALUE IF NOT EXISTS 'daily';

BEGIN;

ALTER TABLE targets
    ADD COLUMN IF NOT EXISTS product_id uuid;

ALTER TABLE targets
    DROP CONSTRAINT IF EXISTS chk_targets_daily;

ALTER TABLE targets
    ADD CONSTRAINT chk_targets_daily CHECK (
        period_type <> 'daily'::period_type
        OR period_start = period_end
    );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_targets_product'
    ) THEN
        ALTER TABLE targets
            ADD CONSTRAINT fk_targets_product
                FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT;
    END IF;
END;
$$;

DROP INDEX IF EXISTS uq_targets_scope_metric_period;

CREATE UNIQUE INDEX IF NOT EXISTS uq_targets_scope_metric_period
    ON targets (
        tenant_id,
        scope_type,
        COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
        metric_code,
        period_start,
        period_end
    )
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_targets_product
    ON targets (tenant_id, product_id, period_start)
    WHERE deleted_at IS NULL AND product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_targets_period_type
    ON targets (tenant_id, period_type, period_start, period_end)
    WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.enforce_target_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    scope_tenant uuid;
    product_tenant uuid;
BEGIN
    IF NEW.scope_type = 'tenant' THEN
        IF NEW.scope_id IS NOT NULL THEN
            RAISE EXCEPTION 'tenant-scoped target must have null scope_id' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF NEW.scope_id IS NULL THEN
            RAISE EXCEPTION 'scope_id required for scope_type %', NEW.scope_type USING ERRCODE = '23514';
        END IF;

        IF NEW.scope_type = 'branch' THEN
            SELECT b.tenant_id INTO scope_tenant FROM branches b WHERE b.id = NEW.scope_id;
        ELSIF NEW.scope_type = 'team' THEN
            SELECT t.tenant_id INTO scope_tenant FROM teams t WHERE t.id = NEW.scope_id;
        ELSIF NEW.scope_type = 'membership' THEN
            SELECT m.tenant_id INTO scope_tenant FROM memberships m WHERE m.id = NEW.scope_id;
        END IF;

        IF scope_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'target scope tenant mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.product_id IS NOT NULL THEN
        SELECT p.tenant_id INTO product_tenant
        FROM products p
        WHERE p.id = NEW.product_id
          AND p.deleted_at IS NULL;
        IF product_tenant IS NULL OR product_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'target product tenant mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_targets_scope ON targets;

CREATE TRIGGER trg_targets_scope
    BEFORE INSERT OR UPDATE OF tenant_id, scope_type, scope_id, product_id
    ON targets
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_target_scope();

INSERT INTO kpi_definitions (code, name, description, unit)
VALUES
    (
        'units_sold',
        'Units sold',
        'Quantity on won quotation lines in period (optionally for one product)',
        'count'
    )
ON CONFLICT (code) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    unit = EXCLUDED.unit;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'target:manage'
WHERE r.code = 'sales.manager'
  AND r.tenant_id IS NULL
  AND r.deleted_at IS NULL
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN targets.product_id IS
    'Optional product dimension. Orthogonal to scope_type so a team can have a product monthly target.';

COMMIT;
