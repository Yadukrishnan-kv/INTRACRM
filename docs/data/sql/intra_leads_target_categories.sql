-- =============================================================================
-- INTRA LEADS — Target module: product-category dimension
-- Apply after intra_leads_targets.sql
-- Idempotent.
--
-- Category = category_id set (orthogonal to scope, like product_id).
-- A target sets product_id OR category_id, never both: a product target is
-- already narrower than any category target, so combining them is a mistake.
-- =============================================================================

BEGIN;

ALTER TABLE targets
    ADD COLUMN IF NOT EXISTS category_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_targets_category'
    ) THEN
        ALTER TABLE targets
            ADD CONSTRAINT fk_targets_category
                FOREIGN KEY (category_id) REFERENCES product_categories (id) ON DELETE RESTRICT;
    END IF;
END;
$$;

ALTER TABLE targets
    DROP CONSTRAINT IF EXISTS chk_targets_product_xor_category;

ALTER TABLE targets
    ADD CONSTRAINT chk_targets_product_xor_category CHECK (
        product_id IS NULL OR category_id IS NULL
    );

-- The duplicate guard now spans the category dimension as well.
DROP INDEX IF EXISTS uq_targets_scope_metric_period;

CREATE UNIQUE INDEX IF NOT EXISTS uq_targets_scope_metric_period
    ON targets (
        tenant_id,
        scope_type,
        COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
        metric_code,
        period_start,
        period_end
    )
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_targets_category
    ON targets (tenant_id, category_id, period_start)
    WHERE deleted_at IS NULL AND category_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.enforce_target_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    scope_tenant uuid;
    product_tenant uuid;
    category_tenant uuid;
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

    IF NEW.category_id IS NOT NULL THEN
        SELECT c.tenant_id INTO category_tenant
        FROM product_categories c
        WHERE c.id = NEW.category_id
          AND c.deleted_at IS NULL;
        IF category_tenant IS NULL OR category_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'target category tenant mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_targets_scope ON targets;

CREATE TRIGGER trg_targets_scope
    BEFORE INSERT OR UPDATE OF tenant_id, scope_type, scope_id, product_id, category_id
    ON targets
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_target_scope();

COMMENT ON COLUMN targets.category_id IS
    'Optional product-category dimension. Orthogonal to scope_type; mutually exclusive with product_id.';

COMMIT;
