-- =============================================================================
-- INTRA LEADS — outbound comms: click-to-call, WhatsApp, SMS
-- Apply after intra_leads_catalog.sql
-- Idempotent.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS message_templates (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    channel         text NOT NULL,
    code            text NOT NULL,
    name            text NOT NULL,
    body            text NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_message_templates_channel CHECK (channel IN ('sms', 'whatsapp')),
    CONSTRAINT chk_message_templates_version CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS outbound_messages (
    id                   uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id            uuid NOT NULL,
    lead_id              uuid NOT NULL,
    activity_id          uuid,
    channel              text NOT NULL,
    to_e164              text NOT NULL,
    body                 text,
    status               text NOT NULL,
    mode                 text NOT NULL,
    provider             text NOT NULL,
    provider_message_id  text,
    launch_uri           text,
    error                text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    deleted_at           timestamptz,
    deleted_by           uuid,
    version              integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_outbound_messages_channel CHECK (channel IN ('call', 'sms', 'whatsapp')),
    CONSTRAINT chk_outbound_messages_status CHECK (status IN ('launched', 'sent', 'failed')),
    CONSTRAINT chk_outbound_messages_mode CHECK (mode IN ('device', 'sent')),
    CONSTRAINT chk_outbound_messages_version CHECK (version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_templates_tenant_channel_code
    ON message_templates (tenant_id, channel, code)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_outbound_messages_tenant_lead_created
    ON outbound_messages (tenant_id, lead_id, created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_message_templates_tenant'
    ) THEN
        ALTER TABLE message_templates
            ADD CONSTRAINT fk_message_templates_tenant
                FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_message_templates_created_by
                FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_message_templates_updated_by
                FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_message_templates_deleted_by
                FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_outbound_messages_tenant'
    ) THEN
        ALTER TABLE outbound_messages
            ADD CONSTRAINT fk_outbound_messages_tenant
                FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_outbound_messages_lead
                FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_outbound_messages_activity
                FOREIGN KEY (activity_id) REFERENCES lead_activities (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_outbound_messages_created_by
                FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_outbound_messages_updated_by
                FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
            ADD CONSTRAINT fk_outbound_messages_deleted_by
                FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
END;
$$;

COMMENT ON TABLE message_templates IS 'Tenant SMS and WhatsApp message templates for field follow-up.';
COMMENT ON TABLE outbound_messages IS 'Click-to-call, WhatsApp, and SMS attempts logged against a lead.';

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['message_templates', 'outbound_messages']
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
