-- =============================================================================
-- INTRA LEADS — Incentive module: plans, attainment slabs, computed payouts
-- Apply after intra_leads_rbac_product_roles.sql: the grants at the foot of
-- this file target the system roles that intra_leads_seed_rbac.sql creates.
-- Idempotent.
--
-- A plan states WHAT is measured (metric_code) over WHICH window (period_type)
-- for WHICH scope (scope_type), and on what BASIS the payout is sized:
--   revenue  → payout scales with achieved value (minor currency)
--   units    → payout scales with units sold
--   count    → payout scales with a plain count (won orders, visits, …)
--
-- A slab states HOW MUCH is paid inside one attainment band. Bands are
-- half-open on attainment basis points: [from_bps, to_bps), to_bps NULL = open
-- ended. Exactly one slab matches any attainment, enforced by the non-overlap
-- exclusion constraint below.
--
-- A payout is a computed snapshot: it is derived data, kept so an approved or
-- paid figure cannot silently move when a plan is edited afterwards.
-- =============================================================================

-- Needed by the slab non-overlap constraint: it mixes a uuid equality with a
-- range overlap in one GiST index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incentive_basis') THEN
        CREATE TYPE incentive_basis AS ENUM ('revenue', 'units', 'count');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incentive_payout_kind') THEN
        CREATE TYPE incentive_payout_kind AS ENUM ('percent', 'flat', 'per_unit');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incentive_plan_status') THEN
        CREATE TYPE incentive_plan_status AS ENUM ('draft', 'active', 'archived');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incentive_payout_status') THEN
        CREATE TYPE incentive_payout_status AS ENUM ('draft', 'approved', 'paid', 'void');
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- incentive_plans
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incentive_plans (
    id               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id        uuid NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
    name             text NOT NULL,
    description      text,
    metric_code      text NOT NULL REFERENCES kpi_definitions (code) ON DELETE RESTRICT,
    period_type      period_type NOT NULL DEFAULT 'monthly',
    scope_type       target_scope_type NOT NULL DEFAULT 'membership',
    basis            incentive_basis NOT NULL DEFAULT 'revenue',
    status           incentive_plan_status NOT NULL DEFAULT 'draft',
    -- Fraction of the earned payout withheld until the period is signed off,
    -- in basis points. 0 pays everything out immediately.
    hold_bps         integer NOT NULL DEFAULT 0,
    -- Nothing is earned below this attainment, whatever the slabs say.
    min_attainment_bps integer NOT NULL DEFAULT 0,
    -- Upper bound on a single period's payout; NULL = uncapped.
    payout_cap       numeric(18, 4),
    effective_from   date NOT NULL,
    effective_to     date,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    deleted_at       timestamptz,
    deleted_by       uuid,
    version          integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_incentive_plans_hold CHECK (hold_bps BETWEEN 0 AND 10000),
    CONSTRAINT chk_incentive_plans_min CHECK (min_attainment_bps >= 0),
    CONSTRAINT chk_incentive_plans_cap CHECK (payout_cap IS NULL OR payout_cap >= 0),
    CONSTRAINT chk_incentive_plans_window CHECK (
        effective_to IS NULL OR effective_to >= effective_from
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_incentive_plans_name
    ON incentive_plans (tenant_id, lower(name))
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_incentive_plans_active
    ON incentive_plans (tenant_id, status, effective_from DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_incentive_plans_metric
    ON incentive_plans (tenant_id, metric_code, period_type)
    WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- incentive_slabs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incentive_slabs (
    id               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id        uuid NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
    plan_id          uuid NOT NULL REFERENCES incentive_plans (id) ON DELETE CASCADE,
    label            text,
    from_bps         integer NOT NULL,
    to_bps           integer,
    payout_kind      incentive_payout_kind NOT NULL,
    -- percent  → rate_bps applied to the basis value
    rate_bps         integer,
    -- flat     → amount paid outright when the band is reached
    amount           numeric(18, 4),
    -- per_unit → per_unit_amount multiplied by the basis value
    per_unit_amount  numeric(18, 4),
    -- Paid on top of whichever kind above, when the band is reached.
    bonus_amount     numeric(18, 4) NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    version          integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_incentive_slabs_band CHECK (
        from_bps >= 0 AND (to_bps IS NULL OR to_bps > from_bps)
    ),
    CONSTRAINT chk_incentive_slabs_bonus CHECK (bonus_amount >= 0),
    CONSTRAINT chk_incentive_slabs_payout CHECK (
        CASE payout_kind
            WHEN 'percent'  THEN rate_bps IS NOT NULL AND rate_bps >= 0
            WHEN 'flat'     THEN amount IS NOT NULL AND amount >= 0
            WHEN 'per_unit' THEN per_unit_amount IS NOT NULL AND per_unit_amount >= 0
        END
    )
);

CREATE INDEX IF NOT EXISTS idx_incentive_slabs_plan
    ON incentive_slabs (plan_id, from_bps);

CREATE INDEX IF NOT EXISTS idx_incentive_slabs_tenant
    ON incentive_slabs (tenant_id, plan_id);

-- Two slabs on one plan may not cover the same attainment. int4range is
-- half-open, so [0,10000) and [10000,NULL) sit flush without overlapping.
ALTER TABLE incentive_slabs
    DROP CONSTRAINT IF EXISTS excl_incentive_slabs_band;

ALTER TABLE incentive_slabs
    ADD CONSTRAINT excl_incentive_slabs_band
        EXCLUDE USING gist (
            plan_id WITH =,
            int4range(from_bps, to_bps, '[)') WITH &&
        );

-- -----------------------------------------------------------------------------
-- incentive_payouts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incentive_payouts (
    id               uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id        uuid NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
    plan_id          uuid NOT NULL REFERENCES incentive_plans (id) ON DELETE RESTRICT,
    membership_id    uuid REFERENCES memberships (id) ON DELETE RESTRICT,
    target_id        uuid REFERENCES targets (id) ON DELETE SET NULL,
    period_start     date NOT NULL,
    period_end       date NOT NULL,
    target_value     numeric(18, 4) NOT NULL DEFAULT 0,
    achieved_value   numeric(18, 4) NOT NULL DEFAULT 0,
    attainment_bps   integer,
    slab_id          uuid REFERENCES incentive_slabs (id) ON DELETE SET NULL,
    earned_amount    numeric(18, 4) NOT NULL DEFAULT 0,
    hold_amount      numeric(18, 4) NOT NULL DEFAULT 0,
    payable_amount   numeric(18, 4) NOT NULL DEFAULT 0,
    paid_amount      numeric(18, 4) NOT NULL DEFAULT 0,
    status           incentive_payout_status NOT NULL DEFAULT 'draft',
    computed_at      timestamptz NOT NULL DEFAULT now(),
    approved_at      timestamptz,
    approved_by      uuid,
    paid_at          timestamptz,
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    version          integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_incentive_payouts_period CHECK (period_end >= period_start),
    CONSTRAINT chk_incentive_payouts_amounts CHECK (
        earned_amount >= 0
        AND hold_amount >= 0
        AND payable_amount >= 0
        AND paid_amount >= 0
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_incentive_payouts_period
    ON incentive_payouts (
        tenant_id,
        plan_id,
        COALESCE(membership_id, '00000000-0000-0000-0000-000000000000'::uuid),
        period_start,
        period_end
    );

CREATE INDEX IF NOT EXISTS idx_incentive_payouts_member
    ON incentive_payouts (tenant_id, membership_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_incentive_payouts_status
    ON incentive_payouts (tenant_id, status, period_start DESC);

-- -----------------------------------------------------------------------------
-- Same-tenant guards — a plan's slabs and payouts belong to the plan's tenant.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.incentive_child_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    plan_tenant uuid;
BEGIN
    SELECT tenant_id INTO plan_tenant FROM incentive_plans WHERE id = NEW.plan_id;
    IF plan_tenant IS NULL THEN
        RAISE EXCEPTION 'incentive plan % not found', NEW.plan_id;
    END IF;
    IF plan_tenant <> NEW.tenant_id THEN
        RAISE EXCEPTION 'tenant mismatch: plan % belongs to tenant %', NEW.plan_id, plan_tenant;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incentive_slabs_same_tenant ON incentive_slabs;
CREATE TRIGGER trg_incentive_slabs_same_tenant
    BEFORE INSERT OR UPDATE ON incentive_slabs
    FOR EACH ROW EXECUTE FUNCTION app.incentive_child_same_tenant();

DROP TRIGGER IF EXISTS trg_incentive_payouts_same_tenant ON incentive_payouts;
CREATE TRIGGER trg_incentive_payouts_same_tenant
    BEFORE INSERT OR UPDATE ON incentive_payouts
    FOR EACH ROW EXECUTE FUNCTION app.incentive_child_same_tenant();

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['incentive_plans', 'incentive_slabs', 'incentive_payouts']
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

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
INSERT INTO permissions (code, resource, action, description)
VALUES
    ('incentive:read', 'incentive', 'read', 'Read incentive plans and own payouts'),
    ('incentive:manage', 'incentive', 'manage', 'Create plans, slabs, and approve payouts')
ON CONFLICT (code) DO NOTHING;

WITH role_map (role_code, perm_code) AS (
    VALUES
        ('tenant.admin', 'incentive:read'),
        ('tenant.admin', 'incentive:manage'),
        ('sales.manager', 'incentive:read'),
        ('sales.manager', 'incentive:manage'),
        ('sales.executive', 'incentive:read'),
        ('sales.viewer', 'incentive:read')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM role_map rm
JOIN roles r ON r.code = rm.role_code AND r.tenant_id IS NULL AND r.deleted_at IS NULL
JOIN permissions p ON p.code = rm.perm_code
ON CONFLICT DO NOTHING;

COMMIT;
