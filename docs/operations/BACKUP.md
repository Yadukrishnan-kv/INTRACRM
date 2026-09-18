# Backup Strategy

INTRA LEADS treats **PostgreSQL as the system of record**. Redis is cache + BullMQ; S3 holds tenant files. Aligns with SAD §15.6 and Terraform in `infra/modules/platform`.

## Targets

| Objective | v1 target | Mechanism |
| --- | --- | --- |
| RPO | ≤ 15 minutes | RDS automated backups + WAL / PITR |
| RTO (this AZ / instance) | Minutes | Multi-AZ RDS failover (prod) |
| RTO (region) | ≤ 4 hours | See [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) |

## What is backed up

| Store | Prod setting | Non-prod | Notes |
| --- | --- | --- | --- |
| RDS PostgreSQL 17 | `backup_retention_period = 14`, Multi-AZ, encrypted, deletion protection, final snapshot on delete | Retention 3 days, single-AZ, `skip_final_snapshot` | Includes outbox, audit, RBAC, leads, quotes, warranties |
| ElastiCache Redis 7.1 | No RDS-style backup; AUTH + encryption | Same | Disposable. Queues rebuild from Postgres outbox / schedulers after restart |
| S3 private files | Versioning **Enabled**, SSE-S3, public access blocked | Same | Restore prior object versions; lifecycle rules may be added later |
| ECR images | Immutable by digest (`{sha}` tag from CD) | Same | Keep last N production SHAs; do not rely on `latest` |
| Secrets Manager | Recovery window (AWS default) | Same | Rotate JSON by hand; Terraform ignores later `secret_string` changes |
| Terraform state | Must be remote S3 with versioning + lock for prod | Optional in early bootstrap | Local state is not a backup |

`apply-sql.sh` does **not** dump data. Schema history is git (`docs/data/sql`).

## RDS configuration (implemented)

From `infra/modules/platform/data.tf`:

- Engine PostgreSQL 17, storage encrypted, not publicly accessible
- Prod: Multi-AZ, deletion protection, 14-day backup retention
- Performance Insights on
- `apply_immediately` is **false** in prod (changes wait for the maintenance window)

Confirm in AWS after apply:

- [ ] Automated backups enabled; window does not overlap peak field hours (India afternoon)
- [ ] Preferred backup window documented
- [ ] PITR (latest restorable time) is within 15 minutes of wall clock
- [ ] Snapshot copy / retention meets any customer contract beyond 14 days (extend in Terraform if required)

## Application data rules

- Production data is **not** copied to developer laptops
- Staging uses synthetic or anonymized data
- Soft-deleted rows stay in backups until retention expires
- PII (phone, email) in RDS is covered by RDS encryption at rest + TLS in transit (`PGSSLMODE=require`)

## Restore drills

Run **twice a year** (SAD) and after any backup-setting change. Prefer a **scratch** RDS instance in a private subnet, never overwrite prod.

1. Record `LatestRestorableTime` from `aws rds describe-db-instances --db-instance-identifier intra-leads-prod`
2. Restore to `intra-leads-drill-YYYYMMDD` at a PITR timestamp
3. Place the instance in the drill subnet/SG; do not attach the prod ECS tasks
4. Run `scripts/apply-sql.sh` only if the restored engine is missing expand-only files (usually already applied)
5. Point a one-off ECS task or bastion `psql` at the drill instance; run: founder exists, tenant row counts, one lead + quotation + warranty token
6. Destroy the drill instance
7. Log the drill: RPO observed, time to first query, issues

S3 drill: overwrite a test object, restore previous version, confirm bytes.

Redis drill: bounce the worker service; confirm schedulers re-enqueue follow-up ticks from Postgres.

## Manual snapshot (before risky SQL)

```bash
aws rds create-db-snapshot \
  --db-instance-identifier intra-leads-prod \
  --db-snapshot-identifier intra-leads-prod-prechange-$(date -u +%Y%m%d%H%M)
```

Wait for `available` before running a non-expand migration.

## Restore (prod incident)

Only with incident commander approval. PITR **loses writes** after the restore point.

1. Stop api + worker (`desired-count 0`) so they do not write to a dying instance
2. Restore snapshot or PITR to a **new** identifier (do not rename in place until verified)
3. Update Secrets Manager `DATABASE_URL` to the new endpoint (Terraform will not do this for you)
4. Force new ECS deployment so tasks pick up the secret
5. Smoke [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) §4
6. Keep the old instance until the incident is closed, then snapshot and decommission

## Ownership

| Task | Cadence | Owner |
| --- | --- | --- |
| Confirm PITR lag | Weekly | On-call |
| Restore drill | Semiannual | Platform |
| Snapshot before risky SQL | Per change | Deployer |
| ECR / S3 retention review | Quarterly | Platform |
