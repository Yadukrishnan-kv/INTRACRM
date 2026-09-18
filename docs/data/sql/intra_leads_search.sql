-- Additive search indexes for existing INTRA LEADS databases.
-- Safe to run after intra_leads_schema.sql. Requires pg_trgm.

CREATE INDEX IF NOT EXISTS idx_leads_customer_trgm
    ON leads USING gin (customer_name gin_trgm_ops)
    WHERE deleted_at IS NULL AND customer_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_phone_trgm
    ON leads USING gin (primary_phone gin_trgm_ops)
    WHERE deleted_at IS NULL AND primary_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_number_trgm
    ON leads USING gin (lead_number gin_trgm_ops)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_number_trgm
    ON quotations USING gin (quotation_number gin_trgm_ops)
    WHERE deleted_at IS NULL;
