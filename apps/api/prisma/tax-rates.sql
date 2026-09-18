CREATE TABLE IF NOT EXISTS tax_rates (
  id uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  rate_bps integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS tax_rates_tenant_id_code_idx ON tax_rates (tenant_id, code);
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS tax_rate_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
