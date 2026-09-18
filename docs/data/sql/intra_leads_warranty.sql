-- =============================================================================
-- INTRA LEADS — warranty cards: public verification token
-- Apply after intra_leads_staff_performance.sql
-- Idempotent. Does not create a second warranty table.
--
-- warranty_cards / warranty_card_items remain the source of truth.
-- verify_token is the unguessable public lookup key for QR / PDF / URL.
-- =============================================================================

BEGIN;

ALTER TABLE warranty_cards
    ADD COLUMN IF NOT EXISTS verify_token text;

UPDATE warranty_cards
SET verify_token = encode(gen_random_bytes(24), 'hex')
WHERE verify_token IS NULL;

ALTER TABLE warranty_cards
    ALTER COLUMN verify_token SET DEFAULT encode(gen_random_bytes(24), 'hex');

ALTER TABLE warranty_cards
    ALTER COLUMN verify_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_warranty_cards_verify_token
    ON warranty_cards (verify_token)
    WHERE deleted_at IS NULL;

COMMENT ON COLUMN warranty_cards.verify_token IS
    'Public verification token encoded in the warranty QR and PDF URL.';

COMMIT;
