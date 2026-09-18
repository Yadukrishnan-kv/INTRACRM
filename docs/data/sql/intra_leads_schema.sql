-- =============================================================================
-- INTRA LEADS
-- PostgreSQL 17 production schema
-- Version : 1.0.0
-- Date    : 2026-08-15
--
-- Apply as a superuser / migrator role on an empty database.
-- Companion scripts:
--   intra_leads_partitions.sql
--   intra_leads_seed_rbac.sql
--   intra_leads_grants.sql
--   intra_leads_rls.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Session
-- -----------------------------------------------------------------------------
SET client_min_messages = WARNING;
SET lock_timeout = '10s';
SET statement_timeout = '0';
SET idle_in_transaction_session_timeout = '0';

-- -----------------------------------------------------------------------------
-- 1. Extensions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- 2. Utility schema
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app;
COMMENT ON SCHEMA app IS 'INTRA LEADS functions, not business tables.';

-- -----------------------------------------------------------------------------
-- 3. Functions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.uuid_v7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    unix_ts_ms bytea;
    uuid_bytes bytea;
BEGIN
    unix_ts_ms := substring(
        int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint)
        FROM 3
    );
    uuid_bytes := unix_ts_ms || gen_random_bytes(10);
    -- version 7
    uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
    -- RFC 4122 variant
    uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
    RETURN encode(uuid_bytes, 'hex')::uuid;
END;
$$;

COMMENT ON FUNCTION app.uuid_v7() IS 'Time-sortable UUID v7 for primary keys.';

CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.touch_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := clock_timestamp();
    IF TG_OP = 'UPDATE' AND NEW.version IS NOT DISTINCT FROM OLD.version THEN
        NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.touch_row() IS
    'Maintains updated_at. Increments version only when the caller did not.';
COMMENT ON FUNCTION app.touch_updated_at() IS
    'Maintains updated_at on tables that do not carry a version column.';

CREATE OR REPLACE FUNCTION app.enforce_same_tenant_from_lead()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    parent_tenant uuid;
BEGIN
    SELECT l.tenant_id
    INTO parent_tenant
    FROM leads l
    WHERE l.id = NEW.lead_id;

    IF parent_tenant IS NULL THEN
        RAISE EXCEPTION 'lead % not found', NEW.lead_id
            USING ERRCODE = '23503';
    END IF;

    IF parent_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'tenant_id % does not match lead % tenant %',
            NEW.tenant_id, NEW.lead_id, parent_tenant
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.enforce_lead_invariants()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    stage_pipeline uuid;
    stage_tenant uuid;
    pipe_tenant uuid;
    owner_tenant uuid;
    source_tenant uuid;
    contact_tenant uuid;
    account_tenant uuid;
    reason_tenant uuid;
BEGIN
    SELECT ps.pipeline_id, ps.tenant_id
    INTO stage_pipeline, stage_tenant
    FROM pipeline_stages ps
    WHERE ps.id = NEW.stage_id;

    SELECT p.tenant_id
    INTO pipe_tenant
    FROM pipelines p
    WHERE p.id = NEW.pipeline_id;

    IF stage_pipeline IS NULL OR pipe_tenant IS NULL THEN
        RAISE EXCEPTION 'pipeline or stage not found'
            USING ERRCODE = '23503';
    END IF;

    IF stage_pipeline IS DISTINCT FROM NEW.pipeline_id
       OR stage_tenant IS DISTINCT FROM NEW.tenant_id
       OR pipe_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'stage/pipeline/tenant mismatch on lead'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.owner_membership_id IS NOT NULL THEN
        SELECT m.tenant_id
        INTO owner_tenant
        FROM memberships m
        WHERE m.id = NEW.owner_membership_id;

        IF owner_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'owner membership is not in the lead tenant'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.source_id IS NOT NULL THEN
        SELECT s.tenant_id INTO source_tenant FROM lead_sources s WHERE s.id = NEW.source_id;
        IF source_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'lead source tenant mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.contact_id IS NOT NULL THEN
        SELECT c.tenant_id INTO contact_tenant FROM contacts c WHERE c.id = NEW.contact_id;
        IF contact_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'contact tenant mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.account_id IS NOT NULL THEN
        SELECT a.tenant_id INTO account_tenant FROM accounts a WHERE a.id = NEW.account_id;
        IF account_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'account tenant mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.lost_reason_id IS NOT NULL THEN
        SELECT r.tenant_id INTO reason_tenant FROM loss_reasons r WHERE r.id = NEW.lost_reason_id;
        IF reason_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'loss reason tenant mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.enforce_membership_org_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    org_tenant uuid;
BEGIN
    IF NEW.branch_id IS NOT NULL THEN
        SELECT b.tenant_id INTO org_tenant FROM branches b WHERE b.id = NEW.branch_id;
        IF org_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'branch tenant mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.team_id IS NOT NULL THEN
        SELECT t.tenant_id INTO org_tenant FROM teams t WHERE t.id = NEW.team_id;
        IF org_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'team tenant mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.territory_id IS NOT NULL THEN
        SELECT tr.tenant_id INTO org_tenant FROM territories tr WHERE tr.id = NEW.territory_id;
        IF org_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'territory tenant mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.enforce_membership_role_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    member_tenant uuid;
    role_tenant uuid;
    role_is_system boolean;
BEGIN
    SELECT m.tenant_id INTO member_tenant FROM memberships m WHERE m.id = NEW.membership_id;
    SELECT r.tenant_id, r.is_system INTO role_tenant, role_is_system FROM roles r WHERE r.id = NEW.role_id;

    IF member_tenant IS NULL OR role_is_system IS NULL THEN
        RAISE EXCEPTION 'membership or role not found' USING ERRCODE = '23503';
    END IF;

    IF role_is_system THEN
        RETURN NEW;
    END IF;

    IF role_tenant IS DISTINCT FROM member_tenant THEN
        RAISE EXCEPTION 'custom role is not in the membership tenant' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.enforce_target_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    scope_tenant uuid;
BEGIN
    IF NEW.scope_type = 'tenant' THEN
        IF NEW.scope_id IS NOT NULL THEN
            RAISE EXCEPTION 'tenant-scoped target must have null scope_id' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

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

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.next_document_number(
    p_tenant_id uuid,
    p_name text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    issued bigint;
    doc_prefix text;
    yr text := to_char((timezone('utc', clock_timestamp())), 'YYYY');
BEGIN
    INSERT INTO public.tenant_sequences (tenant_id, name, prefix, next_value)
    VALUES (
        p_tenant_id,
        p_name,
        CASE p_name
            WHEN 'lead' THEN 'LD'
            WHEN 'quotation' THEN 'QT'
            WHEN 'warranty' THEN 'WR'
            ELSE upper(substr(p_name, 1, 2))
        END,
        1
    )
    ON CONFLICT (tenant_id, name) DO UPDATE
        SET next_value = public.tenant_sequences.next_value + 1,
            updated_at = clock_timestamp()
    RETURNING prefix, next_value INTO doc_prefix, issued;

    RETURN doc_prefix || '-' || yr || '-' || lpad(issued::text, 6, '0');
END;
$$;

COMMENT ON FUNCTION app.next_document_number(uuid, text) IS
    'Allocates the next tenant document number inside the caller transaction.';

-- -----------------------------------------------------------------------------
-- 4. Enumerations
-- -----------------------------------------------------------------------------
CREATE TYPE tenant_status AS ENUM (
    'provisioning', 'active', 'suspended', 'offboarding', 'closed'
);
CREATE TYPE user_status AS ENUM ('active', 'invited', 'locked', 'disabled');
CREATE TYPE membership_status AS ENUM ('invited', 'active', 'suspended', 'ended');
CREATE TYPE auth_session_status AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE otp_purpose AS ENUM (
    'login', 'password_reset', 'step_up', 'verify_email', 'verify_phone'
);
CREATE TYPE file_status AS ENUM (
    'pending', 'uploaded', 'available', 'rejected', 'deleted'
);
CREATE TYPE lead_lifecycle_status AS ENUM (
    'open', 'won', 'lost', 'unqualified', 'recycled'
);
CREATE TYPE activity_type AS ENUM (
    'note', 'call', 'email', 'meeting', 'sms', 'whatsapp', 'system'
);
CREATE TYPE follow_up_status AS ENUM ('pending', 'completed', 'cancelled', 'skipped');
CREATE TYPE site_visit_status AS ENUM (
    'scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'
);
CREATE TYPE quotation_status AS ENUM (
    'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled'
);
CREATE TYPE target_scope_type AS ENUM ('tenant', 'branch', 'team', 'membership');
CREATE TYPE period_type AS ENUM ('monthly', 'quarterly', 'yearly', 'custom');
CREATE TYPE achievement_source AS ENUM ('computed', 'manual');
CREATE TYPE notification_channel AS ENUM ('in_app', 'push');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE warranty_status AS ENUM ('active', 'expired', 'claimed', 'void');
CREATE TYPE audit_actor_type AS ENUM ('user', 'system', 'integration');
CREATE TYPE outbox_status AS ENUM ('pending', 'published', 'failed');

-- -----------------------------------------------------------------------------
-- 5. Platform tables
-- -----------------------------------------------------------------------------
CREATE TABLE tenants (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    slug            text NOT NULL,
    name            text NOT NULL,
    status          tenant_status NOT NULL DEFAULT 'provisioning',
    timezone        text NOT NULL DEFAULT 'Asia/Kolkata',
    locale          text NOT NULL DEFAULT 'en-IN',
    currency        char(3) NOT NULL DEFAULT 'INR',
    logo_file_id    uuid,
    settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_tenants_slug CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
    CONSTRAINT chk_tenants_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT chk_tenants_version CHECK (version >= 1)
);

CREATE TABLE users (
    id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    email               citext,
    phone_e164          text,
    full_name           text NOT NULL,
    avatar_file_id      uuid,
    status              user_status NOT NULL DEFAULT 'invited',
    is_platform_admin   boolean NOT NULL DEFAULT false,
    email_verified_at   timestamptz,
    phone_verified_at   timestamptz,
    last_login_at       timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    deleted_at          timestamptz,
    deleted_by          uuid,
    version             integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_users_email_or_phone CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL),
    CONSTRAINT chk_users_phone CHECK (
        phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
    ),
    CONSTRAINT chk_users_version CHECK (version >= 1)
);

CREATE TABLE user_credentials (
    user_id                 uuid PRIMARY KEY,
    password_hash           text NOT NULL,
    password_algo           text NOT NULL DEFAULT 'argon2id',
    password_updated_at     timestamptz NOT NULL DEFAULT now(),
    failed_attempts         integer NOT NULL DEFAULT 0,
    locked_until            timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_user_credentials_attempts CHECK (failed_attempts >= 0),
    CONSTRAINT chk_user_credentials_algo CHECK (password_algo IN ('argon2id'))
);

CREATE TABLE files (
    id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id           uuid NOT NULL,
    storage_key         text NOT NULL,
    bucket              text NOT NULL,
    original_filename   text,
    content_type        text NOT NULL,
    byte_size           bigint NOT NULL,
    checksum_sha256     text,
    status              file_status NOT NULL DEFAULT 'pending',
    resource_type       text,
    resource_id         uuid,
    uploaded_by         uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    deleted_at          timestamptz,
    deleted_by          uuid,
    version             integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_files_size CHECK (byte_size >= 0),
    CONSTRAINT chk_files_version CHECK (version >= 1),
    CONSTRAINT chk_files_key_prefix CHECK (
        storage_key LIKE ('tenants/' || tenant_id::text || '/%')
    )
);

CREATE TABLE tenant_sequences (
    tenant_id   uuid NOT NULL,
    name        text NOT NULL,
    prefix      text NOT NULL,
    next_value  bigint NOT NULL DEFAULT 1,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, name),
    CONSTRAINT chk_tenant_sequences_next CHECK (next_value >= 1),
    CONSTRAINT chk_tenant_sequences_prefix CHECK (prefix ~ '^[A-Z0-9]{1,8}$')
);

-- -----------------------------------------------------------------------------
-- 6. Authentication
-- -----------------------------------------------------------------------------
CREATE TABLE auth_sessions (
    id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    user_id             uuid NOT NULL,
    tenant_id           uuid,
    device_id           text NOT NULL,
    device_name         text,
    user_agent          text,
    ip_address          inet,
    refresh_family_id   uuid NOT NULL DEFAULT app.uuid_v7(),
    status              auth_session_status NOT NULL DEFAULT 'active',
    expires_at          timestamptz NOT NULL,
    revoked_at          timestamptz,
    last_seen_at        timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    session_id      uuid NOT NULL,
    user_id         uuid NOT NULL,
    token_hash      text NOT NULL,
    family_id       uuid NOT NULL,
    expires_at      timestamptz NOT NULL,
    revoked_at      timestamptz,
    replaced_by     uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
);

CREATE TABLE otp_challenges (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    user_id         uuid,
    tenant_id       uuid,
    destination     text NOT NULL,
    purpose         otp_purpose NOT NULL,
    code_hash       text NOT NULL,
    attempts        integer NOT NULL DEFAULT 0,
    max_attempts    integer NOT NULL DEFAULT 5,
    expires_at      timestamptz NOT NULL,
    consumed_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_otp_attempts CHECK (attempts >= 0 AND max_attempts > 0)
);

-- -----------------------------------------------------------------------------
-- 7. Roles and permissions
-- -----------------------------------------------------------------------------
CREATE TABLE permissions (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    code            text NOT NULL,
    resource        text NOT NULL,
    action          text NOT NULL,
    description     text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_permissions_code UNIQUE (code),
    CONSTRAINT chk_permissions_code CHECK (code ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$')
);

CREATE TABLE roles (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid,
    code            text NOT NULL,
    name            text NOT NULL,
    description     text,
    is_system       boolean NOT NULL DEFAULT false,
    is_default      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_roles_system CHECK (
        (is_system AND tenant_id IS NULL)
        OR (NOT is_system AND tenant_id IS NOT NULL)
    ),
    CONSTRAINT chk_roles_code CHECK (code ~ '^[a-z][a-z0-9_.]*$'),
    CONSTRAINT chk_roles_version CHECK (version >= 1)
);

CREATE TABLE role_permissions (
    role_id         uuid NOT NULL,
    permission_id   uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    PRIMARY KEY (role_id, permission_id)
);

-- -----------------------------------------------------------------------------
-- 8. Directory
-- -----------------------------------------------------------------------------
CREATE TABLE branches (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    code            text NOT NULL,
    name            text NOT NULL,
    city            text,
    state           text,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_branches_version CHECK (version >= 1)
);

CREATE TABLE teams (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    branch_id       uuid,
    code            text NOT NULL,
    name            text NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_teams_version CHECK (version >= 1)
);

CREATE TABLE territories (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    code            text NOT NULL,
    name            text NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_territories_version CHECK (version >= 1)
);

CREATE TABLE memberships (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    user_id         uuid NOT NULL,
    status          membership_status NOT NULL DEFAULT 'invited',
    employee_code   text,
    designation     text,
    branch_id       uuid,
    team_id         uuid,
    territory_id    uuid,
    joined_at       timestamptz,
    suspended_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_memberships_version CHECK (version >= 1)
);

CREATE TABLE membership_roles (
    membership_id   uuid NOT NULL,
    role_id         uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    PRIMARY KEY (membership_id, role_id)
);

CREATE TABLE team_members (
    team_id         uuid NOT NULL,
    membership_id   uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    PRIMARY KEY (team_id, membership_id)
);

-- -----------------------------------------------------------------------------
-- 9. CRM configuration and parties
-- -----------------------------------------------------------------------------
CREATE TABLE lead_sources (
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
    CONSTRAINT chk_lead_sources_version CHECK (version >= 1)
);

CREATE TABLE pipelines (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    code            text NOT NULL,
    name            text NOT NULL,
    is_default      boolean NOT NULL DEFAULT false,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_pipelines_version CHECK (version >= 1)
);

CREATE TABLE pipeline_stages (
    id                      uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id               uuid NOT NULL,
    pipeline_id             uuid NOT NULL,
    code                    text NOT NULL,
    name                    text NOT NULL,
    sort_order              integer NOT NULL DEFAULT 0,
    win_probability_bps     integer NOT NULL DEFAULT 0,
    is_open                 boolean NOT NULL DEFAULT true,
    is_won                  boolean NOT NULL DEFAULT false,
    is_lost                 boolean NOT NULL DEFAULT false,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    deleted_at              timestamptz,
    deleted_by              uuid,
    version                 integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_pipeline_stages_bps CHECK (
        win_probability_bps >= 0 AND win_probability_bps <= 10000
    ),
    CONSTRAINT chk_pipeline_stages_flags CHECK (
        NOT (is_won AND is_lost)
    ),
    CONSTRAINT chk_pipeline_stages_version CHECK (version >= 1)
);

CREATE TABLE loss_reasons (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    code            text NOT NULL,
    name            text NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_loss_reasons_version CHECK (version >= 1)
);

CREATE TABLE accounts (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    parent_id       uuid,
    name            text NOT NULL,
    legal_name      text,
    gstin           text,
    website         text,
    phone           text,
    email           citext,
    city            text,
    state           text,
    postal_code     text,
    country_code    char(2),
    custom_fields   jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_accounts_version CHECK (version >= 1)
);

CREATE TABLE contacts (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    account_id      uuid,
    first_name      text NOT NULL,
    last_name       text,
    phone_e164      text,
    email           citext,
    designation     text,
    is_primary      boolean NOT NULL DEFAULT false,
    custom_fields   jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_contacts_phone CHECK (
        phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
    ),
    CONSTRAINT chk_contacts_version CHECK (version >= 1)
);

CREATE TABLE product_categories (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    parent_id       uuid,
    name            text NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_product_categories_version CHECK (version >= 1)
);

CREATE TABLE products (
    id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id           uuid NOT NULL,
    category_id         uuid,
    sku                 text NOT NULL,
    name                text NOT NULL,
    description         text,
    unit_price_minor    bigint,
    currency            char(3) NOT NULL DEFAULT 'INR',
    warranty_months     integer,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    deleted_at          timestamptz,
    deleted_by          uuid,
    version             integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_products_price CHECK (unit_price_minor IS NULL OR unit_price_minor >= 0),
    CONSTRAINT chk_products_warranty CHECK (warranty_months IS NULL OR warranty_months >= 0),
    CONSTRAINT chk_products_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT chk_products_version CHECK (version >= 1)
);

-- -----------------------------------------------------------------------------
-- 10. Leads
-- -----------------------------------------------------------------------------
CREATE TABLE leads (
    id                      uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id               uuid NOT NULL,
    lead_number             text NOT NULL,
    title                   text NOT NULL,
    contact_id              uuid,
    account_id              uuid,
    primary_phone           text,
    primary_email           citext,
    source_id               uuid,
    pipeline_id             uuid NOT NULL,
    stage_id                uuid NOT NULL,
    owner_membership_id     uuid,
    lifecycle_status        lead_lifecycle_status NOT NULL DEFAULT 'open',
    score                   integer,
    estimated_value_minor   bigint,
    currency                char(3) NOT NULL DEFAULT 'INR',
    expected_close_on       date,
    lost_reason_id          uuid,
    unqualified_reason      text,
    address_line1           text,
    address_line2           text,
    city                    text,
    state                   text,
    postal_code             text,
    country_code            char(2),
    geo                     point,
    first_assigned_at       timestamptz,
    last_activity_at        timestamptz,
    custom_fields           jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    deleted_at              timestamptz,
    deleted_by              uuid,
    version                 integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_leads_score CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    CONSTRAINT chk_leads_value CHECK (
        estimated_value_minor IS NULL OR estimated_value_minor >= 0
    ),
    CONSTRAINT chk_leads_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT chk_leads_lost CHECK (
        lifecycle_status <> 'lost' OR lost_reason_id IS NOT NULL
    ),
    CONSTRAINT chk_leads_version CHECK (version >= 1)
);

CREATE TABLE lead_assignments (
    id                              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id                       uuid NOT NULL,
    lead_id                         uuid NOT NULL,
    assigned_from_membership_id     uuid,
    assigned_to_membership_id       uuid,
    assigned_by_membership_id       uuid,
    reason                          text,
    is_current                      boolean NOT NULL DEFAULT true,
    assigned_at                     timestamptz NOT NULL DEFAULT now(),
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid,
    updated_by                      uuid,
    deleted_at                      timestamptz,
    deleted_by                      uuid,
    version                         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_lead_assignments_version CHECK (version >= 1)
);

CREATE TABLE lead_stage_changes (
    id                      uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id               uuid NOT NULL,
    lead_id                 uuid NOT NULL,
    from_stage_id           uuid,
    to_stage_id             uuid NOT NULL,
    from_lifecycle_status   lead_lifecycle_status,
    to_lifecycle_status     lead_lifecycle_status NOT NULL,
    changed_by_membership_id uuid,
    reason                  text,
    changed_at              timestamptz NOT NULL DEFAULT now(),
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid
);

CREATE TABLE lead_activities (
    id                          uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id                   uuid NOT NULL,
    lead_id                     uuid NOT NULL,
    type                        activity_type NOT NULL,
    subject                     text,
    body                        text,
    occurred_at                 timestamptz NOT NULL DEFAULT now(),
    duration_minutes            integer,
    outcome                     text,
    performed_by_membership_id  uuid,
    metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    deleted_at                  timestamptz,
    deleted_by                  uuid,
    version                     integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_lead_activities_duration CHECK (
        duration_minutes IS NULL OR duration_minutes >= 0
    ),
    CONSTRAINT chk_lead_activities_version CHECK (version >= 1)
);

CREATE TABLE follow_ups (
    id                          uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id                   uuid NOT NULL,
    lead_id                     uuid NOT NULL,
    assigned_to_membership_id   uuid NOT NULL,
    title                       text NOT NULL,
    notes                       text,
    due_at                      timestamptz NOT NULL,
    remind_at                   timestamptz,
    priority                    smallint NOT NULL DEFAULT 2,
    status                      follow_up_status NOT NULL DEFAULT 'pending',
    completed_at                timestamptz,
    completed_activity_id       uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    deleted_at                  timestamptz,
    deleted_by                  uuid,
    version                     integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_follow_ups_priority CHECK (priority BETWEEN 1 AND 3),
    CONSTRAINT chk_follow_ups_complete CHECK (
        status <> 'completed' OR completed_at IS NOT NULL
    ),
    CONSTRAINT chk_follow_ups_version CHECK (version >= 1)
);

CREATE TABLE site_visits (
    id                          uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id                   uuid NOT NULL,
    lead_id                     uuid NOT NULL,
    assigned_to_membership_id   uuid NOT NULL,
    purpose                     text,
    notes                       text,
    outcome                     text,
    status                      site_visit_status NOT NULL DEFAULT 'scheduled',
    scheduled_at                timestamptz NOT NULL,
    checked_in_at               timestamptz,
    checked_out_at              timestamptz,
    address_line1               text,
    city                        text,
    state                       text,
    postal_code                 text,
    check_in_geo                point,
    check_out_geo               point,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    deleted_at                  timestamptz,
    deleted_by                  uuid,
    version                     integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_site_visits_times CHECK (
        checked_out_at IS NULL
        OR checked_in_at IS NULL
        OR checked_out_at >= checked_in_at
    ),
    CONSTRAINT chk_site_visits_version CHECK (version >= 1)
);

-- -----------------------------------------------------------------------------
-- 11. Quotations
-- -----------------------------------------------------------------------------
CREATE TABLE quotations (
    id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id           uuid NOT NULL,
    lead_id             uuid NOT NULL,
    contact_id          uuid,
    account_id          uuid,
    quotation_number    text NOT NULL,
    status              quotation_status NOT NULL DEFAULT 'draft',
    currency            char(3) NOT NULL DEFAULT 'INR',
    subtotal_minor      bigint NOT NULL DEFAULT 0,
    discount_minor      bigint NOT NULL DEFAULT 0,
    tax_minor           bigint NOT NULL DEFAULT 0,
    total_minor         bigint NOT NULL DEFAULT 0,
    valid_until_on      date,
    notes               text,
    terms               text,
    sent_at             timestamptz,
    viewed_at           timestamptz,
    accepted_at         timestamptz,
    rejected_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    deleted_at          timestamptz,
    deleted_by          uuid,
    version             integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_quotations_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT chk_quotations_amounts CHECK (
        subtotal_minor >= 0
        AND discount_minor >= 0
        AND tax_minor >= 0
        AND total_minor >= 0
    ),
    CONSTRAINT chk_quotations_version CHECK (version >= 1)
);

CREATE TABLE quotation_items (
    id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id           uuid NOT NULL,
    quotation_id        uuid NOT NULL,
    product_id          uuid,
    description         text NOT NULL,
    quantity            numeric(18,4) NOT NULL DEFAULT 1,
    unit_price_minor    bigint NOT NULL DEFAULT 0,
    discount_minor      bigint NOT NULL DEFAULT 0,
    tax_bps             integer NOT NULL DEFAULT 0,
    line_total_minor    bigint NOT NULL DEFAULT 0,
    sort_order          integer NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    deleted_at          timestamptz,
    deleted_by          uuid,
    version             integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_quotation_items_qty CHECK (quantity > 0),
    CONSTRAINT chk_quotation_items_amounts CHECK (
        unit_price_minor >= 0
        AND discount_minor >= 0
        AND line_total_minor >= 0
    ),
    CONSTRAINT chk_quotation_items_tax CHECK (tax_bps >= 0 AND tax_bps <= 10000),
    CONSTRAINT chk_quotation_items_version CHECK (version >= 1)
);

-- -----------------------------------------------------------------------------
-- 12. Targets, achievements, staff performance
-- -----------------------------------------------------------------------------
CREATE TABLE kpi_definitions (
    code            text PRIMARY KEY,
    name            text NOT NULL,
    description     text,
    unit            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_kpi_unit CHECK (unit IN ('minor_currency', 'count', 'percent'))
);

CREATE TABLE targets (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    scope_type      target_scope_type NOT NULL,
    scope_id        uuid,
    metric_code     text NOT NULL,
    period_type     period_type NOT NULL,
    period_start    date NOT NULL,
    period_end      date NOT NULL,
    target_value    numeric(18,4) NOT NULL,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_targets_period CHECK (period_end >= period_start),
    CONSTRAINT chk_targets_value CHECK (target_value >= 0),
    CONSTRAINT chk_targets_version CHECK (version >= 1)
);

CREATE TABLE achievements (
    id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id           uuid NOT NULL,
    target_id           uuid NOT NULL,
    membership_id       uuid,
    achieved_value      numeric(18,4) NOT NULL,
    source              achievement_source NOT NULL DEFAULT 'computed',
    recorded_on         date NOT NULL DEFAULT (timezone('utc', now()))::date,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    deleted_at          timestamptz,
    deleted_by          uuid,
    version             integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_achievements_value CHECK (achieved_value >= 0),
    CONSTRAINT chk_achievements_version CHECK (version >= 1)
);

CREATE TABLE staff_performance_snapshots (
    id                      uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id               uuid NOT NULL,
    membership_id           uuid NOT NULL,
    period_type             period_type NOT NULL,
    period_start            date NOT NULL,
    period_end              date NOT NULL,
    leads_created           integer NOT NULL DEFAULT 0,
    leads_assigned          integer NOT NULL DEFAULT 0,
    leads_won               integer NOT NULL DEFAULT 0,
    leads_lost              integer NOT NULL DEFAULT 0,
    follow_ups_completed    integer NOT NULL DEFAULT 0,
    visits_completed        integer NOT NULL DEFAULT 0,
    quotations_sent         integer NOT NULL DEFAULT 0,
    quotations_accepted     integer NOT NULL DEFAULT 0,
    revenue_minor           bigint NOT NULL DEFAULT 0,
    target_value            numeric(18,4),
    achieved_value          numeric(18,4),
    achievement_pct         numeric(8,2),
    metrics                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    computed_at             timestamptz NOT NULL DEFAULT now(),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    deleted_at              timestamptz,
    deleted_by              uuid,
    version                 integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_staff_perf_period CHECK (period_end >= period_start),
    CONSTRAINT chk_staff_perf_counts CHECK (
        leads_created >= 0
        AND leads_assigned >= 0
        AND leads_won >= 0
        AND leads_lost >= 0
        AND follow_ups_completed >= 0
        AND visits_completed >= 0
        AND quotations_sent >= 0
        AND quotations_accepted >= 0
        AND revenue_minor >= 0
    ),
    CONSTRAINT chk_staff_perf_version CHECK (version >= 1)
);

-- -----------------------------------------------------------------------------
-- 13. Notifications
-- -----------------------------------------------------------------------------
CREATE TABLE notifications (
    id              uuid NOT NULL DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    user_id         uuid NOT NULL,
    event_type      text NOT NULL,
    title           text NOT NULL,
    body            text,
    resource_type   text,
    resource_id     uuid,
    channel         notification_channel NOT NULL DEFAULT 'in_app',
    status          notification_status NOT NULL DEFAULT 'pending',
    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
    read_at         timestamptz,
    sent_at         timestamptz,
    failed_at       timestamptz,
    failure_reason  text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_notifications_version CHECK (version >= 1),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE notifications_default PARTITION OF notifications DEFAULT;

CREATE TABLE notification_preferences (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL,
    user_id         uuid NOT NULL,
    event_type      text NOT NULL,
    in_app_enabled  boolean NOT NULL DEFAULT true,
    push_enabled    boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    deleted_at      timestamptz,
    deleted_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_notification_preferences_version CHECK (version >= 1)
);

CREATE TABLE device_push_tokens (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    user_id         uuid NOT NULL,
    tenant_id       uuid,
    device_id       text NOT NULL,
    platform        text NOT NULL,
    token           text NOT NULL,
    last_seen_at    timestamptz NOT NULL DEFAULT now(),
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_device_push_platform CHECK (platform IN ('android', 'ios', 'web'))
);

-- -----------------------------------------------------------------------------
-- 14. Warranty cards
-- -----------------------------------------------------------------------------
CREATE TABLE warranty_cards (
    id                          uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id                   uuid NOT NULL,
    card_number                 text NOT NULL,
    lead_id                     uuid,
    quotation_id                uuid,
    contact_id                  uuid,
    account_id                  uuid,
    serial_number               text,
    purchased_on                date,
    warranty_start_on           date NOT NULL,
    warranty_end_on             date NOT NULL,
    status                      warranty_status NOT NULL DEFAULT 'active',
    coverage_notes              text,
    issued_by_membership_id     uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    deleted_at                  timestamptz,
    deleted_by                  uuid,
    version                     integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_warranty_dates CHECK (warranty_end_on >= warranty_start_on),
    CONSTRAINT chk_warranty_version CHECK (version >= 1)
);

CREATE TABLE warranty_card_items (
    id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id           uuid NOT NULL,
    warranty_card_id    uuid NOT NULL,
    product_id          uuid,
    description         text NOT NULL,
    serial_number       text,
    quantity            numeric(18,4) NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    deleted_at          timestamptz,
    deleted_by          uuid,
    version             integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_warranty_card_items_qty CHECK (quantity > 0),
    CONSTRAINT chk_warranty_card_items_version CHECK (version >= 1)
);

-- -----------------------------------------------------------------------------
-- 15. Audit and reliability
-- -----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id              uuid NOT NULL DEFAULT app.uuid_v7(),
    tenant_id       uuid,
    actor_id        uuid,
    actor_type      audit_actor_type NOT NULL,
    action          text NOT NULL,
    resource_type   text NOT NULL,
    resource_id     uuid,
    before_data     jsonb,
    after_data      jsonb,
    request_id      text,
    device_id       text,
    ip_address      inet,
    user_agent      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

CREATE TABLE domain_outbox (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid,
    aggregate_type  text NOT NULL,
    aggregate_id    uuid NOT NULL,
    event_name      text NOT NULL,
    payload         jsonb NOT NULL,
    status          outbox_status NOT NULL DEFAULT 'pending',
    attempts        integer NOT NULL DEFAULT 0,
    available_at    timestamptz NOT NULL DEFAULT now(),
    published_at    timestamptz,
    last_error      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_outbox_attempts CHECK (attempts >= 0),
    CONSTRAINT chk_outbox_event CHECK (event_name ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')
);

CREATE TABLE idempotency_keys (
    tenant_id           uuid NOT NULL,
    user_id             uuid NOT NULL,
    route               text NOT NULL,
    key                 uuid NOT NULL,
    request_hash        text NOT NULL,
    response_status     integer,
    response_body       jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, user_id, route, key),
    CONSTRAINT chk_idempotency_status CHECK (
        response_status IS NULL
        OR (response_status >= 100 AND response_status <= 599)
    )
);

-- -----------------------------------------------------------------------------
-- 16. Foreign keys
-- -----------------------------------------------------------------------------
ALTER TABLE tenants
    ADD CONSTRAINT fk_tenants_logo_file
        FOREIGN KEY (logo_file_id) REFERENCES files (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_tenants_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_tenants_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_tenants_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE users
    ADD CONSTRAINT fk_users_avatar_file
        FOREIGN KEY (avatar_file_id) REFERENCES files (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_users_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_users_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_users_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE user_credentials
    ADD CONSTRAINT fk_user_credentials_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE files
    ADD CONSTRAINT fk_files_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_files_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_files_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_files_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_files_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE tenant_sequences
    ADD CONSTRAINT fk_tenant_sequences_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

ALTER TABLE auth_sessions
    ADD CONSTRAINT fk_auth_sessions_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_auth_sessions_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

ALTER TABLE refresh_tokens
    ADD CONSTRAINT fk_refresh_tokens_session
        FOREIGN KEY (session_id) REFERENCES auth_sessions (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_refresh_tokens_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_refresh_tokens_replaced_by
        FOREIGN KEY (replaced_by) REFERENCES refresh_tokens (id) ON DELETE SET NULL;

ALTER TABLE otp_challenges
    ADD CONSTRAINT fk_otp_challenges_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_otp_challenges_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

ALTER TABLE roles
    ADD CONSTRAINT fk_roles_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_roles_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_roles_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_roles_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE role_permissions
    ADD CONSTRAINT fk_role_permissions_role
        FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_role_permissions_permission
        FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_role_permissions_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE branches
    ADD CONSTRAINT fk_branches_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_branches_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_branches_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_branches_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE teams
    ADD CONSTRAINT fk_teams_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_teams_branch
        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_teams_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_teams_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_teams_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE territories
    ADD CONSTRAINT fk_territories_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_territories_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_territories_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_territories_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE memberships
    ADD CONSTRAINT fk_memberships_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_memberships_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_memberships_branch
        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_memberships_team
        FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_memberships_territory
        FOREIGN KEY (territory_id) REFERENCES territories (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_memberships_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_memberships_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_memberships_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE membership_roles
    ADD CONSTRAINT fk_membership_roles_membership
        FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_membership_roles_role
        FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_membership_roles_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE team_members
    ADD CONSTRAINT fk_team_members_team
        FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_team_members_membership
        FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_team_members_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE lead_sources
    ADD CONSTRAINT fk_lead_sources_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_sources_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_sources_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_sources_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE pipelines
    ADD CONSTRAINT fk_pipelines_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_pipelines_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_pipelines_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_pipelines_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE pipeline_stages
    ADD CONSTRAINT fk_pipeline_stages_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_pipeline_stages_pipeline
        FOREIGN KEY (pipeline_id) REFERENCES pipelines (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_pipeline_stages_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_pipeline_stages_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_pipeline_stages_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE loss_reasons
    ADD CONSTRAINT fk_loss_reasons_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_loss_reasons_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_loss_reasons_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_loss_reasons_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE accounts
    ADD CONSTRAINT fk_accounts_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_accounts_parent
        FOREIGN KEY (parent_id) REFERENCES accounts (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_accounts_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_accounts_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_accounts_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE contacts
    ADD CONSTRAINT fk_contacts_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_contacts_account
        FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_contacts_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_contacts_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_contacts_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE product_categories
    ADD CONSTRAINT fk_product_categories_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_product_categories_parent
        FOREIGN KEY (parent_id) REFERENCES product_categories (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_product_categories_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_product_categories_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_product_categories_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE products
    ADD CONSTRAINT fk_products_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_products_category
        FOREIGN KEY (category_id) REFERENCES product_categories (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_products_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_products_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_products_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE leads
    ADD CONSTRAINT fk_leads_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_leads_contact
        FOREIGN KEY (contact_id) REFERENCES contacts (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_leads_account
        FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_leads_source
        FOREIGN KEY (source_id) REFERENCES lead_sources (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_leads_pipeline
        FOREIGN KEY (pipeline_id) REFERENCES pipelines (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_leads_stage
        FOREIGN KEY (stage_id) REFERENCES pipeline_stages (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_leads_owner
        FOREIGN KEY (owner_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_leads_lost_reason
        FOREIGN KEY (lost_reason_id) REFERENCES loss_reasons (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_leads_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_leads_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_leads_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE lead_assignments
    ADD CONSTRAINT fk_lead_assignments_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_assignments_lead
        FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_assignments_from
        FOREIGN KEY (assigned_from_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_assignments_to
        FOREIGN KEY (assigned_to_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_assignments_by
        FOREIGN KEY (assigned_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_assignments_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_assignments_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_assignments_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE lead_stage_changes
    ADD CONSTRAINT fk_lead_stage_changes_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_stage_changes_lead
        FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_stage_changes_from
        FOREIGN KEY (from_stage_id) REFERENCES pipeline_stages (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_stage_changes_to
        FOREIGN KEY (to_stage_id) REFERENCES pipeline_stages (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_stage_changes_by
        FOREIGN KEY (changed_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_stage_changes_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE lead_activities
    ADD CONSTRAINT fk_lead_activities_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_activities_lead
        FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_activities_performer
        FOREIGN KEY (performed_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_activities_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_activities_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_lead_activities_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE follow_ups
    ADD CONSTRAINT fk_follow_ups_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_follow_ups_lead
        FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_follow_ups_assignee
        FOREIGN KEY (assigned_to_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_follow_ups_activity
        FOREIGN KEY (completed_activity_id) REFERENCES lead_activities (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_follow_ups_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_follow_ups_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_follow_ups_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE site_visits
    ADD CONSTRAINT fk_site_visits_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_site_visits_lead
        FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_site_visits_assignee
        FOREIGN KEY (assigned_to_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_site_visits_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_site_visits_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_site_visits_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE quotations
    ADD CONSTRAINT fk_quotations_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_quotations_lead
        FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_quotations_contact
        FOREIGN KEY (contact_id) REFERENCES contacts (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_quotations_account
        FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_quotations_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_quotations_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_quotations_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE quotation_items
    ADD CONSTRAINT fk_quotation_items_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_quotation_items_quotation
        FOREIGN KEY (quotation_id) REFERENCES quotations (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_quotation_items_product
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_quotation_items_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_quotation_items_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_quotation_items_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE targets
    ADD CONSTRAINT fk_targets_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_targets_metric
        FOREIGN KEY (metric_code) REFERENCES kpi_definitions (code) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_targets_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_targets_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_targets_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE achievements
    ADD CONSTRAINT fk_achievements_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_achievements_target
        FOREIGN KEY (target_id) REFERENCES targets (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_achievements_membership
        FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_achievements_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_achievements_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_achievements_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE staff_performance_snapshots
    ADD CONSTRAINT fk_staff_perf_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_staff_perf_membership
        FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_staff_perf_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_staff_perf_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_staff_perf_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE notifications
    ADD CONSTRAINT fk_notifications_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_notifications_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_notifications_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_notifications_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE notification_preferences
    ADD CONSTRAINT fk_notification_preferences_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_notification_preferences_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_notification_preferences_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_notification_preferences_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_notification_preferences_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE device_push_tokens
    ADD CONSTRAINT fk_device_push_tokens_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_device_push_tokens_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

ALTER TABLE warranty_cards
    ADD CONSTRAINT fk_warranty_cards_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_warranty_cards_lead
        FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_warranty_cards_quotation
        FOREIGN KEY (quotation_id) REFERENCES quotations (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_warranty_cards_contact
        FOREIGN KEY (contact_id) REFERENCES contacts (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_warranty_cards_account
        FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_warranty_cards_issuer
        FOREIGN KEY (issued_by_membership_id) REFERENCES memberships (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_warranty_cards_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_warranty_cards_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_warranty_cards_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE warranty_card_items
    ADD CONSTRAINT fk_warranty_card_items_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_warranty_card_items_card
        FOREIGN KEY (warranty_card_id) REFERENCES warranty_cards (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_warranty_card_items_product
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_warranty_card_items_created_by
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_warranty_card_items_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_warranty_card_items_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE audit_logs
    ADD CONSTRAINT fk_audit_logs_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_audit_logs_actor
        FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE domain_outbox
    ADD CONSTRAINT fk_domain_outbox_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

ALTER TABLE idempotency_keys
    ADD CONSTRAINT fk_idempotency_keys_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_idempotency_keys_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- 17. Unique and secondary indexes
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX uq_tenants_slug
    ON tenants (lower(slug))
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_users_email
    ON users (lower(email::text))
    WHERE deleted_at IS NULL AND email IS NOT NULL;

CREATE UNIQUE INDEX uq_users_phone
    ON users (phone_e164)
    WHERE deleted_at IS NULL AND phone_e164 IS NOT NULL;

CREATE UNIQUE INDEX uq_roles_system_code
    ON roles (code)
    WHERE tenant_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX uq_roles_tenant_code
    ON roles (tenant_id, code)
    WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX uq_memberships_tenant_user
    ON memberships (tenant_id, user_id)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_memberships_tenant_employee
    ON memberships (tenant_id, employee_code)
    WHERE deleted_at IS NULL AND employee_code IS NOT NULL;

CREATE UNIQUE INDEX uq_branches_tenant_code
    ON branches (tenant_id, code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_teams_tenant_code
    ON teams (tenant_id, code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_territories_tenant_code
    ON territories (tenant_id, code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_lead_sources_tenant_code
    ON lead_sources (tenant_id, code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_pipelines_tenant_code
    ON pipelines (tenant_id, code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_pipeline_stages_pipeline_code
    ON pipeline_stages (pipeline_id, code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_loss_reasons_tenant_code
    ON loss_reasons (tenant_id, code)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_products_tenant_sku
    ON products (tenant_id, sku)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_leads_tenant_number
    ON leads (tenant_id, lead_number)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_lead_assignments_current
    ON lead_assignments (lead_id)
    WHERE is_current AND deleted_at IS NULL;

CREATE UNIQUE INDEX uq_quotations_tenant_number
    ON quotations (tenant_id, quotation_number)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_targets_scope_metric_period
    ON targets (tenant_id, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), metric_code, period_start, period_end)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_staff_perf_member_period
    ON staff_performance_snapshots (tenant_id, membership_id, period_type, period_start)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_notif_pref_user_event
    ON notification_preferences (tenant_id, user_id, event_type)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_device_push_user_device
    ON device_push_tokens (user_id, device_id)
    WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX uq_warranty_cards_tenant_number
    ON warranty_cards (tenant_id, card_number)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_warranty_cards_tenant_serial
    ON warranty_cards (tenant_id, serial_number)
    WHERE deleted_at IS NULL AND serial_number IS NOT NULL;

CREATE UNIQUE INDEX uq_pipelines_tenant_default
    ON pipelines (tenant_id)
    WHERE is_default AND deleted_at IS NULL;

-- Identity / auth
CREATE INDEX idx_auth_sessions_user_status
    ON auth_sessions (user_id, status);

CREATE INDEX idx_auth_sessions_family
    ON auth_sessions (refresh_family_id);

CREATE INDEX idx_auth_sessions_device
    ON auth_sessions (user_id, device_id);

CREATE INDEX idx_refresh_tokens_session
    ON refresh_tokens (session_id);

CREATE INDEX idx_refresh_tokens_family
    ON refresh_tokens (family_id);

CREATE INDEX idx_otp_challenges_destination_purpose
    ON otp_challenges (destination, purpose, created_at DESC);

CREATE INDEX idx_otp_challenges_expires
    ON otp_challenges (expires_at)
    WHERE consumed_at IS NULL;

-- Directory
CREATE INDEX idx_memberships_tenant_status
    ON memberships (tenant_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_memberships_user
    ON memberships (user_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_memberships_team
    ON memberships (tenant_id, team_id)
    WHERE deleted_at IS NULL AND team_id IS NOT NULL;

CREATE INDEX idx_membership_roles_role
    ON membership_roles (role_id);

-- Leads hot paths
CREATE INDEX idx_leads_tenant_status_updated
    ON leads (tenant_id, lifecycle_status, updated_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_leads_tenant_owner_updated
    ON leads (tenant_id, owner_membership_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_leads_tenant_updated_sync
    ON leads (tenant_id, updated_at, id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_leads_tenant_stage
    ON leads (tenant_id, stage_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_leads_tenant_source
    ON leads (tenant_id, source_id)
    WHERE deleted_at IS NULL AND source_id IS NOT NULL;

CREATE INDEX idx_leads_tenant_phone
    ON leads (tenant_id, primary_phone)
    WHERE deleted_at IS NULL AND primary_phone IS NOT NULL;

CREATE INDEX idx_leads_title_trgm
    ON leads USING gin (title gin_trgm_ops)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_leads_phone_trgm
    ON leads USING gin (primary_phone gin_trgm_ops)
    WHERE deleted_at IS NULL AND primary_phone IS NOT NULL;

CREATE INDEX idx_leads_number_trgm
    ON leads USING gin (lead_number gin_trgm_ops)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_quotations_number_trgm
    ON quotations USING gin (quotation_number gin_trgm_ops)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lead_assignments_inbox
    ON lead_assignments (tenant_id, assigned_to_membership_id, assigned_at DESC)
    WHERE is_current AND deleted_at IS NULL;

CREATE INDEX idx_lead_assignments_lead
    ON lead_assignments (tenant_id, lead_id, assigned_at DESC);

CREATE INDEX idx_lead_stage_changes_lead
    ON lead_stage_changes (tenant_id, lead_id, changed_at DESC);

CREATE INDEX idx_lead_activities_timeline
    ON lead_activities (tenant_id, lead_id, occurred_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lead_activities_performer
    ON lead_activities (tenant_id, performed_by_membership_id, occurred_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_follow_ups_pending_assignee
    ON follow_ups (tenant_id, assigned_to_membership_id, due_at)
    WHERE status = 'pending' AND deleted_at IS NULL;

CREATE INDEX idx_follow_ups_overdue
    ON follow_ups (tenant_id, due_at)
    WHERE status = 'pending' AND deleted_at IS NULL;

CREATE INDEX idx_follow_ups_lead
    ON follow_ups (tenant_id, lead_id, due_at)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_site_visits_calendar
    ON site_visits (tenant_id, assigned_to_membership_id, scheduled_at)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_site_visits_lead
    ON site_visits (tenant_id, lead_id, scheduled_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_site_visits_status
    ON site_visits (tenant_id, status, scheduled_at)
    WHERE deleted_at IS NULL;

-- Commercial
CREATE INDEX idx_quotations_lead
    ON quotations (tenant_id, lead_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_quotations_status
    ON quotations (tenant_id, status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_quotation_items_quotation
    ON quotation_items (quotation_id, sort_order)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_warranty_cards_end
    ON warranty_cards (tenant_id, warranty_end_on)
    WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX idx_warranty_cards_lead
    ON warranty_cards (tenant_id, lead_id)
    WHERE deleted_at IS NULL AND lead_id IS NOT NULL;

CREATE INDEX idx_warranty_card_items_card
    ON warranty_card_items (warranty_card_id)
    WHERE deleted_at IS NULL;

-- Performance
CREATE INDEX idx_targets_tenant_period
    ON targets (tenant_id, period_start, period_end)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_targets_scope
    ON targets (tenant_id, scope_type, scope_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_achievements_target
    ON achievements (tenant_id, target_id, recorded_on DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_staff_perf_period
    ON staff_performance_snapshots (tenant_id, period_type, period_start)
    WHERE deleted_at IS NULL;

-- Notifications / files / reliability
CREATE INDEX idx_notifications_inbox
    ON notifications (tenant_id, user_id, created_at DESC);

CREATE INDEX idx_notifications_unread
    ON notifications (tenant_id, user_id, created_at DESC)
    WHERE read_at IS NULL AND deleted_at IS NULL;

CREATE INDEX idx_notifications_id
    ON notifications (tenant_id, id);

CREATE INDEX idx_device_push_token
    ON device_push_tokens (token)
    WHERE revoked_at IS NULL;

CREATE INDEX idx_files_resource
    ON files (tenant_id, resource_type, resource_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_files_status
    ON files (tenant_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_audit_logs_resource
    ON audit_logs (tenant_id, resource_type, resource_id, created_at DESC);

CREATE INDEX idx_audit_logs_actor
    ON audit_logs (tenant_id, actor_id, created_at DESC);

CREATE INDEX idx_audit_logs_action
    ON audit_logs (tenant_id, action, created_at DESC);

CREATE INDEX idx_outbox_pending
    ON domain_outbox (available_at, created_at)
    WHERE status = 'pending';

CREATE INDEX idx_outbox_aggregate
    ON domain_outbox (aggregate_type, aggregate_id, created_at);

CREATE INDEX idx_idempotency_expires
    ON idempotency_keys (expires_at);

CREATE INDEX idx_contacts_tenant_phone
    ON contacts (tenant_id, phone_e164)
    WHERE deleted_at IS NULL AND phone_e164 IS NOT NULL;

CREATE INDEX idx_contacts_tenant_email
    ON contacts (tenant_id, lower(email::text))
    WHERE deleted_at IS NULL AND email IS NOT NULL;

CREATE INDEX idx_accounts_tenant_name_trgm
    ON accounts USING gin (name gin_trgm_ops)
    WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 18. Triggers
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'tenants', 'users', 'files', 'roles', 'branches', 'teams', 'territories',
        'memberships', 'lead_sources', 'pipelines', 'pipeline_stages', 'loss_reasons',
        'accounts', 'contacts', 'product_categories', 'products', 'leads',
        'lead_assignments', 'lead_activities', 'follow_ups', 'site_visits',
        'quotations', 'quotation_items', 'targets', 'achievements',
        'staff_performance_snapshots', 'notification_preferences',
        'warranty_cards', 'warranty_card_items'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_touch
             BEFORE UPDATE ON %I
             FOR EACH ROW
             EXECUTE FUNCTION app.touch_row()',
            t, t
        );
    END LOOP;

    FOREACH t IN ARRAY ARRAY[
        'user_credentials', 'auth_sessions', 'device_push_tokens', 'tenant_sequences'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_touch
             BEFORE UPDATE ON %I
             FOR EACH ROW
             EXECUTE FUNCTION app.touch_updated_at()',
            t, t
        );
    END LOOP;
END;
$$;

-- notifications is partitioned; attach the trigger to the parent
CREATE TRIGGER trg_notifications_touch
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER trg_memberships_org_tenant
    BEFORE INSERT OR UPDATE OF tenant_id, branch_id, team_id, territory_id
    ON memberships
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_membership_org_tenant();

CREATE TRIGGER trg_membership_roles_scope
    BEFORE INSERT OR UPDATE OF membership_id, role_id
    ON membership_roles
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_membership_role_scope();

CREATE TRIGGER trg_leads_invariants
    BEFORE INSERT OR UPDATE OF tenant_id, pipeline_id, stage_id, owner_membership_id,
        source_id, contact_id, account_id, lost_reason_id, lifecycle_status
    ON leads
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_lead_invariants();

CREATE TRIGGER trg_lead_assignments_tenant
    BEFORE INSERT OR UPDATE OF tenant_id, lead_id
    ON lead_assignments
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_same_tenant_from_lead();

CREATE TRIGGER trg_lead_stage_changes_tenant
    BEFORE INSERT OR UPDATE OF tenant_id, lead_id
    ON lead_stage_changes
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_same_tenant_from_lead();

CREATE TRIGGER trg_lead_activities_tenant
    BEFORE INSERT OR UPDATE OF tenant_id, lead_id
    ON lead_activities
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_same_tenant_from_lead();

CREATE TRIGGER trg_follow_ups_tenant
    BEFORE INSERT OR UPDATE OF tenant_id, lead_id
    ON follow_ups
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_same_tenant_from_lead();

CREATE TRIGGER trg_site_visits_tenant
    BEFORE INSERT OR UPDATE OF tenant_id, lead_id
    ON site_visits
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_same_tenant_from_lead();

CREATE TRIGGER trg_quotations_tenant
    BEFORE INSERT OR UPDATE OF tenant_id, lead_id
    ON quotations
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_same_tenant_from_lead();

CREATE TRIGGER trg_targets_scope
    BEFORE INSERT OR UPDATE OF tenant_id, scope_type, scope_id
    ON targets
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_target_scope();

-- -----------------------------------------------------------------------------
-- 19. Storage parameters
-- -----------------------------------------------------------------------------
ALTER TABLE leads SET (
    fillfactor = 90,
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE follow_ups SET (fillfactor = 90);
ALTER TABLE memberships SET (fillfactor = 90);
ALTER TABLE lead_activities SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);
ALTER TABLE notifications_default SET (
    fillfactor = 90,
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_analyze_scale_factor = 0.01
);
ALTER TABLE audit_logs_default SET (
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_analyze_scale_factor = 0.01
);

-- -----------------------------------------------------------------------------
-- 20. Comments
-- -----------------------------------------------------------------------------
COMMENT ON TABLE tenants IS 'Platform tenants. Soft-closed, never cascade-wiped.';
COMMENT ON TABLE users IS 'Global identities. Tenant access is via memberships.';
COMMENT ON TABLE user_credentials IS 'Argon2id password hashes. Never log this table.';
COMMENT ON TABLE auth_sessions IS 'Device-bound sessions. Revoke instead of soft-delete.';
COMMENT ON TABLE refresh_tokens IS 'Hashed rotating refresh tokens with family reuse detection.';
COMMENT ON TABLE otp_challenges IS 'Hashed OTPs. Hard-deleted by TTL job.';
COMMENT ON TABLE permissions IS 'Global permission catalog, code format resource:action.';
COMMENT ON TABLE roles IS 'System roles have tenant_id NULL. Custom roles are tenant-owned.';
COMMENT ON TABLE memberships IS 'The only way a user acts inside a tenant.';
COMMENT ON TABLE leads IS 'Lead aggregate root. Stage is data-driven; lifecycle_status is the coarse state.';
COMMENT ON TABLE lead_assignments IS 'Assignment history. One live current row per lead.';
COMMENT ON TABLE lead_activities IS 'Timeline. occurred_at is business time; created_at is write time.';
COMMENT ON TABLE follow_ups IS 'SLA follow-ups. Overdue is computed, not stored.';
COMMENT ON TABLE site_visits IS 'Field visits with optional check-in/out geopoints.';
COMMENT ON TABLE quotations IS 'Commercial offers. Money in integer minor units.';
COMMENT ON TABLE targets IS 'Period KPI targets at tenant, branch, team, or membership scope.';
COMMENT ON TABLE achievements IS 'Recorded progress against a target.';
COMMENT ON TABLE staff_performance_snapshots IS 'Job-computed period scoreboard. Not maintained by OLTP triggers.';
COMMENT ON TABLE notifications IS 'In-app inbox source of truth. Monthly partitioned.';
COMMENT ON TABLE warranty_cards IS 'Post-sale warranty documents.';
COMMENT ON TABLE audit_logs IS 'Append-only compliance trail. Monthly partitioned. No UPDATE/DELETE.';
COMMENT ON TABLE domain_outbox IS 'Transactional domain events for workers.';
COMMENT ON TABLE idempotency_keys IS 'Mobile command replay cache.';
COMMENT ON TABLE files IS 'S3 object metadata. Bytes never stored in PostgreSQL.';
COMMENT ON TABLE tenant_sequences IS 'Per-tenant document number counters.';

COMMENT ON COLUMN leads.version IS 'Optimistic concurrency token. Map to If-Match / ETag.';
COMMENT ON COLUMN leads.custom_fields IS 'Tenant schema-registry JSON. Do not GIN-index wholesale.';
COMMENT ON COLUMN files.storage_key IS 'Must begin with tenants/{tenant_id}/.';
COMMENT ON COLUMN user_credentials.password_hash IS 'Argon2id. Redact in every dump and log.';

COMMIT;
