-- =============================================================================
-- INTRA LEADS — Lead categories (master data): Customer, Builder, Architect, ...
-- Apply after intra_leads_catalog.sql
-- Idempotent.
--
-- Tenant-managed list; the Lead Entry "Category" dropdown reads it, so adding or
-- removing a row needs no code change. leads.category_id points at a row.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS lead_categories (
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
    CONSTRAINT chk_lead_categories_version CHECK (version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_categories_tenant_code
    ON lead_categories (tenant_id, code)
    WHERE deleted_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_lead_categories_tenant'
    ) THEN
        ALTER TABLE lead_categories
            ADD CONSTRAINT fk_lead_categories_tenant
                FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_lead_categories_created_by
                FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_lead_categories_updated_by
                FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_lead_categories_deleted_by
                FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
END;
$$;

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS category_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_leads_lead_category'
    ) THEN
        ALTER TABLE leads
            ADD CONSTRAINT fk_leads_lead_category
                FOREIGN KEY (category_id) REFERENCES lead_categories (id) ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_leads_category
    ON leads (tenant_id, category_id)
    WHERE deleted_at IS NULL AND category_id IS NOT NULL;

COMMENT ON TABLE lead_categories IS 'Tenant-managed lead categories (Customer, Builder, ...). leads.category_id references it.';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lead_categories_touch') THEN
        CREATE TRIGGER trg_lead_categories_touch
            BEFORE UPDATE ON lead_categories
            FOR EACH ROW
            EXECUTE FUNCTION app.touch_row();
    END IF;
END;
$$;

-- Row level security, only where intra_leads_rls.sql has been applied.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'lead_sources' AND policyname = 'rls_lead_sources_tenant'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'lead_categories'
    ) THEN
        ALTER TABLE lead_categories ENABLE ROW LEVEL SECURITY;
        ALTER TABLE lead_categories FORCE ROW LEVEL SECURITY;
        CREATE POLICY rls_lead_categories_tenant
            ON lead_categories
            FOR ALL
            USING (app.tenant_isolation_predicate(tenant_id))
            WITH CHECK (app.tenant_isolation_predicate(tenant_id));
    END IF;
END;
$$;

-- Starter categories for every tenant that has none yet. Users edit freely after.
SET LOCAL app.is_platform_admin = 'true';
INSERT INTO lead_categories (tenant_id, code, name, sort_order)
SELECT t.id, d.code, d.name, d.sort_order
FROM tenants t
CROSS JOIN (VALUES
    ('customer',   'Customer',   10),
    ('builder',    'Builder',    20),
    ('engineer',   'Engineer',   30),
    ('architect',  'Architect',  40),
    ('contractor', 'Contractor', 50)
) AS d (code, name, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM lead_categories c WHERE c.tenant_id = t.id
);

COMMIT;
