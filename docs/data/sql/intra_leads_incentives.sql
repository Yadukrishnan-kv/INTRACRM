-- =============================================================================
-- INTRA LEADS — Incentive module: plans, slabs, and computed payouts
-- Apply after intra_leads_targets.sql
-- Idempotent. Do not create a second incentive_plans/slabs/payouts table.
--
-- Mirrors apps/api/prisma/schema.prisma IncentivePlan / IncentiveSlab /
-- IncentivePayout models. incentive_payouts carries no soft-delete column,
-- so uq_incentive_payouts_period is a plain (not partial) functional index.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
CREATE TYPE incentive_basis AS ENUM ('revenue', 'units', 'count');
CREATE TYPE incentive_payout_kind AS ENUM ('percent', 'flat', 'per_unit');
CREATE TYPE incentive_plan_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE incentive_payout_status AS ENUM ('draft', 'approved', 'paid', 'void');

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------
CREATE TABLE incentive_plans (
    id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id           uuid NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
    name                text NOT NULL,
    description         text,
    metric_code         text NOT NULL REFERENCES kpi_definitions (code) ON DELETE RESTRICT,
    period_type         period_type NOT NULL DEFAULT 'monthly',
    scope_type          target_scope_type NOT NULL DEFAULT 'membership',
    basis               incentive_basis NOT NULL DEFAULT 'revenue',
    status              incentive_plan_status NOT NULL DEFAULT 'draft',
    hold_bps            integer NOT NULL DEFAULT 0,
    min_attainment_bps  integer NOT NULL DEFAULT 0,
    payout_cap          numeric(18,4),
    effective_from      date NOT NULL,
    effective_to        date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    deleted_at          timestamptz,
    deleted_by          uuid,
    version             integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_incentive_plans_bps CHECK (
        hold_bps BETWEEN 0 AND 10000
        AND min_attainment_bps >= 0
    ),
    CONSTRAINT chk_incentive_plans_effective CHECK (
        effective_to IS NULL OR effective_to >= effective_from
    ),
    CONSTRAINT chk_incentive_plans_version CHECK (version >= 1)
);

CREATE TABLE incentive_slabs (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
    plan_id         uuid NOT NULL REFERENCES incentive_plans (id) ON DELETE CASCADE,
    label           text,
    from_bps        integer NOT NULL,
    to_bps          integer,
    payout_kind     incentive_payout_kind NOT NULL,
    rate_bps        integer,
    amount          numeric(18,4),
    per_unit_amount numeric(18,4),
    bonus_amount    numeric(18,4) NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_incentive_slabs_range CHECK (
        from_bps >= 0
        AND (to_bps IS NULL OR to_bps > from_bps)
    ),
    CONSTRAINT chk_incentive_slabs_version CHECK (version >= 1)
);

CREATE TABLE incentive_payouts (
    id              uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id       uuid NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
    plan_id         uuid NOT NULL REFERENCES incentive_plans (id) ON DELETE RESTRICT,
    membership_id   uuid REFERENCES memberships (id) ON DELETE RESTRICT,
    target_id       uuid REFERENCES targets (id) ON DELETE SET NULL,
    period_start    date NOT NULL,
    period_end      date NOT NULL,
    target_value    numeric(18,4) NOT NULL DEFAULT 0,
    achieved_value  numeric(18,4) NOT NULL DEFAULT 0,
    attainment_bps  integer,
    slab_id         uuid REFERENCES incentive_slabs (id) ON DELETE SET NULL,
    earned_amount   numeric(18,4) NOT NULL DEFAULT 0,
    hold_amount     numeric(18,4) NOT NULL DEFAULT 0,
    payable_amount  numeric(18,4) NOT NULL DEFAULT 0,
    paid_amount     numeric(18,4) NOT NULL DEFAULT 0,
    status          incentive_payout_status NOT NULL DEFAULT 'draft',
    computed_at     timestamptz NOT NULL DEFAULT now(),
    approved_at     timestamptz,
    approved_by     uuid,
    paid_at         timestamptz,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    version         integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_incentive_payouts_period CHECK (period_end >= period_start),
    CONSTRAINT chk_incentive_payouts_amounts CHECK (
        target_value >= 0
        AND achieved_value >= 0
        AND earned_amount >= 0
        AND hold_amount >= 0
        AND payable_amount >= 0
        AND paid_amount >= 0
    ),
    CONSTRAINT chk_incentive_payouts_version CHECK (version >= 1)
);

-- -----------------------------------------------------------------------------
-- 3. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX idx_incentive_plans_status
    ON incentive_plans (tenant_id, status, effective_from DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_incentive_plans_metric
    ON incentive_plans (tenant_id, metric_code, period_type)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_incentive_slabs_plan
    ON incentive_slabs (plan_id, from_bps);

CREATE INDEX idx_incentive_slabs_tenant_plan
    ON incentive_slabs (tenant_id, plan_id);

CREATE INDEX idx_incentive_payouts_membership
    ON incentive_payouts (tenant_id, membership_id, period_start DESC);

CREATE INDEX idx_incentive_payouts_status
    ON incentive_payouts (tenant_id, status, period_start DESC);

-- The real concurrency guard: one payout per plan/membership/period.
-- membership_id is nullable (tenant-scope plans), so a plain composite
-- unique would not catch two tenant-scope payouts for the same period.
CREATE UNIQUE INDEX uq_incentive_payouts_period
    ON incentive_payouts (
        tenant_id,
        plan_id,
        COALESCE(membership_id, '00000000-0000-0000-0000-000000000000'::uuid),
        period_start,
        period_end
    );

-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'incentive_plans', 'incentive_slabs', 'incentive_payouts'
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
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Permissions
-- -----------------------------------------------------------------------------
INSERT INTO permissions (code, resource, action, description)
VALUES
    ('incentive:read', 'incentive', 'read', 'Read incentive plans and payouts'),
    ('incentive:manage', 'incentive', 'manage', 'Create, edit, approve, and pay incentives')
ON CONFLICT (code) DO UPDATE
SET
    resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'incentive:manage'
WHERE r.code = 'tenant.admin'
  AND r.tenant_id IS NULL
  AND r.deleted_at IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'incentive:manage'
WHERE r.code = 'sales.manager'
  AND r.tenant_id IS NULL
  AND r.deleted_at IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'incentive:read'
WHERE r.code IN ('tenant.admin', 'sales.manager', 'sales.executive', 'sales.viewer')
  AND r.tenant_id IS NULL
  AND r.deleted_at IS NULL
ON CONFLICT DO NOTHING;

COMMIT;
