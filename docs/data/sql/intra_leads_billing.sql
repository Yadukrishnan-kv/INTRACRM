-- =============================================================================
-- INTRA LEADS — billing integration: customer sync, invoice sync, payment status
-- Apply after intra_leads_comms.sql
-- Idempotent.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS billing_customers (
    id               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id        uuid NOT NULL,
    lead_id          uuid NOT NULL,
    provider         text NOT NULL,
    external_id      text NOT NULL,
    display_name     text NOT NULL,
    phone_e164       text,
    email            citext,
    city             text,
    sync_status      text NOT NULL DEFAULT 'pending',
    last_synced_at   timestamptz,
    last_error       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    deleted_at       timestamptz,
    deleted_by       uuid,
    version          integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_billing_customers_sync CHECK (sync_status IN ('pending', 'synced', 'failed', 'stale')),
    CONSTRAINT chk_billing_customers_version CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS billing_invoices (
    id                   uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id            uuid NOT NULL,
    lead_id              uuid NOT NULL,
    quotation_id         uuid,
    billing_customer_id  uuid NOT NULL,
    provider             text NOT NULL,
    external_id          text NOT NULL,
    invoice_number       text NOT NULL,
    status               text NOT NULL DEFAULT 'issued',
    payment_status       text NOT NULL DEFAULT 'unpaid',
    currency             char(3) NOT NULL DEFAULT 'INR',
    total_minor          bigint NOT NULL DEFAULT 0,
    balance_minor        bigint NOT NULL DEFAULT 0,
    issued_on            date,
    due_on               date,
    paid_at              timestamptz,
    sync_status          text NOT NULL DEFAULT 'pending',
    last_synced_at       timestamptz,
    last_error           text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    deleted_at           timestamptz,
    deleted_by           uuid,
    version              integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_billing_invoices_status CHECK (status IN ('draft', 'issued', 'cancelled', 'void')),
    CONSTRAINT chk_billing_invoices_payment CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'overdue', 'void', 'refunded')),
    CONSTRAINT chk_billing_invoices_sync CHECK (sync_status IN ('pending', 'synced', 'failed', 'stale')),
    CONSTRAINT chk_billing_invoices_version CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS billing_payments (
    id               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id        uuid NOT NULL,
    invoice_id       uuid NOT NULL,
    provider         text NOT NULL,
    external_id      text NOT NULL,
    amount_minor     bigint NOT NULL,
    currency         char(3) NOT NULL DEFAULT 'INR',
    method           text,
    status           text,
    paid_on          date NOT NULL,
    received_at      timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    deleted_at       timestamptz,
    deleted_by       uuid,
    version          integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_billing_payments_amount CHECK (amount_minor >= 0),
    CONSTRAINT chk_billing_payments_version CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS billing_sync_jobs (
    id               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id        uuid NOT NULL,
    resource         text NOT NULL,
    direction        text NOT NULL,
    provider         text NOT NULL,
    local_id         uuid,
    external_id      text,
    status           text NOT NULL,
    error            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_billing_sync_jobs_resource CHECK (resource IN ('customer', 'invoice', 'payment')),
    CONSTRAINT chk_billing_sync_jobs_direction CHECK (direction IN ('outbound', 'inbound')),
    CONSTRAINT chk_billing_sync_jobs_status CHECK (status IN ('pending', 'synced', 'failed', 'stale'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_customers_tenant_lead
    ON billing_customers (tenant_id, lead_id)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_customers_tenant_provider_ext
    ON billing_customers (tenant_id, provider, external_id)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_invoices_tenant_provider_ext
    ON billing_invoices (tenant_id, provider, external_id)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_invoices_tenant_number
    ON billing_invoices (tenant_id, invoice_number)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_payments_tenant_provider_ext
    ON billing_payments (tenant_id, provider, external_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_billing_invoices_tenant_lead
    ON billing_invoices (tenant_id, lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_billing_payments_invoice
    ON billing_payments (invoice_id, paid_on DESC);

CREATE INDEX IF NOT EXISTS ix_billing_sync_jobs_tenant_created
    ON billing_sync_jobs (tenant_id, created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_billing_customers_tenant'
    ) THEN
        ALTER TABLE billing_customers
            ADD CONSTRAINT fk_billing_customers_tenant
                FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_customers_lead
                FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_customers_created_by
                FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_customers_updated_by
                FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_customers_deleted_by
                FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_billing_invoices_tenant'
    ) THEN
        ALTER TABLE billing_invoices
            ADD CONSTRAINT fk_billing_invoices_tenant
                FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_invoices_lead
                FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_invoices_quotation
                FOREIGN KEY (quotation_id) REFERENCES quotations (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_invoices_customer
                FOREIGN KEY (billing_customer_id) REFERENCES billing_customers (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_invoices_created_by
                FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_invoices_updated_by
                FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_invoices_deleted_by
                FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_billing_payments_tenant'
    ) THEN
        ALTER TABLE billing_payments
            ADD CONSTRAINT fk_billing_payments_tenant
                FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_payments_invoice
                FOREIGN KEY (invoice_id) REFERENCES billing_invoices (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_payments_created_by
                FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_payments_updated_by
                FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_billing_payments_deleted_by
                FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_billing_sync_jobs_tenant'
    ) THEN
        ALTER TABLE billing_sync_jobs
            ADD CONSTRAINT fk_billing_sync_jobs_tenant
                FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;
    END IF;
END;
$$;

COMMENT ON TABLE billing_customers IS 'CRM customer projection synced to accounting. CRM is source of identity.';
COMMENT ON TABLE billing_invoices IS 'Accounting invoices mirrored into CRM. Accounting is source of invoice number and balance.';
COMMENT ON TABLE billing_payments IS 'Payment events from accounting. CRM never posts collections.';
COMMENT ON TABLE billing_sync_jobs IS 'Outbound and inbound billing sync attempts.';

INSERT INTO permissions (code, resource, action, description)
VALUES
    ('billing:read', 'billing', 'read', 'Read synced customers, invoices, and payment status'),
    ('billing:sync', 'billing', 'sync', 'Push or refresh billing integration records')
ON CONFLICT DO NOTHING;

WITH role_map (role_code, perm_code) AS (
    VALUES
        ('tenant.founder', 'billing:read'),
        ('tenant.founder', 'billing:sync'),
        ('tenant.admin', 'billing:read'),
        ('tenant.admin', 'billing:sync'),
        ('business.manager', 'billing:read'),
        ('business.manager', 'billing:sync'),
        ('sales.manager', 'billing:read'),
        ('sales.manager', 'billing:sync'),
        ('sales.staff', 'billing:read'),
        ('sales.executive', 'billing:read'),
        ('sales.viewer', 'billing:read'),
        ('api.integration', 'billing:read'),
        ('api.integration', 'billing:sync')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM role_map rm
JOIN roles r ON r.code = rm.role_code AND r.tenant_id IS NULL AND r.deleted_at IS NULL
JOIN permissions p ON p.code = rm.perm_code
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['billing_customers', 'billing_invoices', 'billing_payments']
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
