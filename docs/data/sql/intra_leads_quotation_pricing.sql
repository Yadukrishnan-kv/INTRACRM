-- =============================================================================
-- INTRA LEADS — quotation pricing revamp
-- Apply after intra_leads_quotations.sql
-- Idempotent.
--
-- * Purchase (vendor) price + margin kept separate from the selling price.
-- * Line item code, size (width x height) and unit of measure.
-- * gst_inclusive: whether entered prices already include GST (existing
--   quotations stay GST-exclusive, new ones default to inclusive in the API).
-- * charges: additional billing charges ([{description, amountMinor, taxBps}]).
-- * specs: product specification rows ([{label, value}]).
-- * revision / revisions: history of a quotation edited after it was sent.
-- * Per-line discount is retired; the discount lives on the quotation total.
-- =============================================================================

BEGIN;

ALTER TABLE quotation_items
    ADD COLUMN IF NOT EXISTS item_code text,
    ADD COLUMN IF NOT EXISTS width double precision,
    ADD COLUMN IF NOT EXISTS height double precision,
    ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'Nos',
    ADD COLUMN IF NOT EXISTS vendor_price_minor bigint,
    ADD COLUMN IF NOT EXISTS margin_type text,
    ADD COLUMN IF NOT EXISTS margin_value bigint NOT NULL DEFAULT 0;

ALTER TABLE quotation_items
    DROP CONSTRAINT IF EXISTS chk_quotation_items_margin_type;
ALTER TABLE quotation_items
    ADD CONSTRAINT chk_quotation_items_margin_type
        CHECK (margin_type IS NULL OR margin_type IN ('percent', 'fixed'));

ALTER TABLE quotations
    ADD COLUMN IF NOT EXISTS gst_inclusive boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS charges jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS specs jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS revisions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
