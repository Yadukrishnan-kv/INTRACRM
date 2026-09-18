CREATE TABLE IF NOT EXISTS attendance_sessions (
  id uuid PRIMARY KEY DEFAULT app.uuid_v7(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL REFERENCES memberships(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  punched_in_at timestamptz NOT NULL,
  punched_out_at timestamptz,
  in_lat numeric(9, 6),
  in_lng numeric(9, 6),
  in_accuracy_m numeric(8, 2),
  out_lat numeric(9, 6),
  out_lng numeric(9, 6),
  out_accuracy_m numeric(8, 2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT chk_attendance_sessions_times CHECK (
    punched_out_at IS NULL OR punched_out_at >= punched_in_at
  ),
  CONSTRAINT chk_attendance_sessions_version CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS attendance_sessions_tenant_member_date_idx
  ON attendance_sessions (tenant_id, membership_id, work_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_sessions_one_open_idx
  ON attendance_sessions (tenant_id, membership_id)
  WHERE punched_out_at IS NULL AND deleted_at IS NULL;

INSERT INTO permissions (code, resource, action, description)
VALUES
  ('attendance:punch', 'attendance', 'punch', 'Punch in and out'),
  ('attendance:read', 'attendance', 'read', 'Read own attendance'),
  ('attendance:read_team', 'attendance', 'read_team', 'Read team attendance and reports')
ON CONFLICT (code) DO UPDATE
SET
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.tenant_id IS NULL
  AND r.deleted_at IS NULL
  AND p.code IN ('attendance:punch', 'attendance:read')
  AND r.code IN (
    'tenant.founder',
    'tenant.admin',
    'business.manager',
    'sales.staff',
    'sales.manager',
    'sales.executive'
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.tenant_id IS NULL
  AND r.deleted_at IS NULL
  AND p.code = 'attendance:read_team'
  AND r.code IN (
    'tenant.founder',
    'tenant.admin',
    'business.manager',
    'sales.manager'
  )
ON CONFLICT DO NOTHING;
