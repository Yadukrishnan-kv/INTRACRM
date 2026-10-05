# INTRA LEADS PostgreSQL scripts

Production-grade PostgreSQL 17 schema for INTRA LEADS.

## Apply order

```text
1. intra_leads_schema.sql
2. intra_leads_partitions.sql
3. intra_leads_auth_login_history.sql
4. intra_leads_lead_management.sql
5. intra_leads_lead_pipeline.sql
6. intra_leads_activity_timeline.sql
7. intra_leads_follow_ups.sql
8. intra_leads_follow_up_engine.sql
9. intra_leads_site_visits.sql
10. intra_leads_quotations.sql
11. intra_leads_catalog.sql
12. intra_leads_comms.sql
13. intra_leads_billing.sql
14. intra_leads_quotation_follow_up.sql
15. intra_leads_targets.sql
16. intra_leads_incentives.sql
17. intra_leads_staff_performance.sql
18. intra_leads_warranty.sql
19. intra_leads_seed_rbac.sql
20. intra_leads_rbac_product_roles.sql
21. intra_leads_grants.sql
22. intra_leads_rls.sql          # optional at launch
```

Example (local):

```bash
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_schema.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_partitions.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_auth_login_history.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_lead_management.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_lead_pipeline.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_activity_timeline.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_follow_ups.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_follow_up_engine.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_site_visits.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_quotations.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_catalog.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_comms.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_billing.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_quotation_follow_up.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_targets.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_staff_performance.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_warranty.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_seed_rbac.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_rbac_product_roles.sql
psql -v ON_ERROR_STOP=1 -f docs/data/sql/intra_leads_grants.sql
```

## Design notes

- Shared-schema multi-tenancy with `tenant_id`
- UUID v7 primary keys via `app.uuid_v7()`
- Soft delete on CRM/directory tables; append-only `audit_logs`
- Same-tenant triggers on lead children
- Cursor-friendly, tenant-leading indexes
- `audit_logs` and `notifications` are range-partitioned by `created_at`

See `docs/data/LOGICAL_DATA_MODEL.md` for ER diagrams and policies.
