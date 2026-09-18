-- =============================================================================
-- INTRA LEADS — tenant catalog: categories, qualities, warranty periods
-- Apply after intra_leads_lead_management.sql
-- Idempotent.
-- =============================================================================

BEGIN;

ALTER TABLE product_categories
    ADD COLUMN IF NOT EXISTS code text;

ALTER TABLE product_categories
    ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

UPDATE product_categories
SET code = lower(regexp_replace(coalesce(name, 'category'), '[^a-zA-Z0-9]+', '_', 'g'))
WHERE code IS NULL OR btrim(code) = '';

ALTER TABLE product_categories
    ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_categories_tenant_code
    ON product_categories (tenant_id, code)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS lead_qualities (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    code            text NOT NULL,
    name            text NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_lead_qualities_version CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS warranty_periods (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    code            text NOT NULL,
    name            text NOT NULL,
    months          integer NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_warranty_periods_months CHECK (months >= 1),
    CONSTRAINT chk_warranty_periods_version CHECK (version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_qualities_tenant_code
    ON lead_qualities (tenant_id, code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_warranty_periods_tenant_code
    ON warranty_periods (tenant_id, code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_warranty_periods_tenant_months
    ON warranty_periods (tenant_id, months)
    WHERE deleted_at IS NULL;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS warranty_period_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_lead_qualities_tenant'
    ) THEN
        ALTER TABLE lead_qualities
            ADD CONSTRAINT fk_lead_qualities_tenant
                FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_lead_qualities_created_by
                FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_lead_qualities_updated_by
                FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_lead_qualities_deleted_by
                FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_warranty_periods_tenant'
    ) THEN
        ALTER TABLE warranty_periods
            ADD CONSTRAINT fk_warranty_periods_tenant
                FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_warranty_periods_created_by
                FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_warranty_periods_updated_by
                FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_warranty_periods_deleted_by
                FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_products_warranty_period'
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT fk_products_warranty_period
                FOREIGN KEY (warranty_period_id) REFERENCES warranty_periods (id) ON DELETE RESTRICT;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'leads'
          AND column_name = 'quality'
          AND udt_name = 'lead_quality'
    ) THEN
        ALTER TABLE leads ALTER COLUMN quality TYPE text USING quality::text;
    END IF;
END;
$$;

COMMENT ON TABLE lead_qualities IS 'Tenant-managed lead heat values. leads.quality stores the code.';
COMMENT ON TABLE warranty_periods IS 'Tenant-managed warranty durations used by the product catalog.';
COMMENT ON TABLE product_categories IS 'Tenant product categories for quotations, targets, and warranty cards.';

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['lead_qualities', 'warranty_periods']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = format('trg_%s_touch', t)
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER trg_%s_touch
                 BEFORE UPDATE ON %I
                 FOR EACH ROW
                 EXECUTE FUNCTION app.touch_row()',
                t, t
            );
        END IF;
    END LOOP;
END;
$$;

COMMIT;
