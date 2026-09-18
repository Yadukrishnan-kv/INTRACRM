# Disaster Recovery Plan

Covers loss of the **prod** stack in `ap-south-1` (AZ failure, RDS unusable, account-level event, or bad blast radius). Application bugs use [ROLLBACK.md](./ROLLBACK.md). Data restore without a disaster uses [BACKUP.md](./BACKUP.md).

## Objectives

| Metric | v1 commitment | Notes |
| --- | --- | --- |
| RPO | ≤ 15 minutes | RDS PITR / WAL. In-flight Redis jobs may be lost |
| RTO | ≤ 4 hours | Regional rebuild from Terraform + PITR + last good ECR image |
| Scope | API, worker, RDS, Redis, ALB, S3 files | Flutter clients keep working once DNS/TLS and API are back |

v1 is **single-region**. Cross-region RDS replica is not in Terraform yet; a regional outage is a rebuild, not a flip.

## Severity

| Class | Example | Action |
| --- | --- | --- |
| AZ | One subnet/AZ down | Multi-AZ RDS + ECS in 2 AZs should self-heal; verify healthy hosts |
| Data | Accidental delete, ransomware in DB | PITR to new instance; [BACKUP.md](./BACKUP.md) restore |
| Region / control plane | `ap-south-1` prolonged outage | Recreate platform in a secondary region (see below) |
| Account | Credentials leaked | Rotate Secrets Manager + IAM + JWT secrets; revoke sessions |

## Roles

| Role | Responsibility |
| --- | --- |
| Incident commander | Declare DR, clock RTO, comms |
| Platform | Terraform, RDS restore, ECS, DNS |
| App owner | Smoke, tenant isolation spot-check, worker queues |
| Comms | Pilot tenants / internal status |

## Inventory to recreate

Terraform module `infra/modules/platform` for `infra/environments/prod`:

- VPC (2 AZs), public ALB+NAT, private ECS/RDS/Redis
- ALB + target group health `/api/v1/health/live`
- ECS cluster `intra-leads-prod` (Container Insights on), services api + worker, migrate family
- RDS `intra-leads-prod` PostgreSQL 17
- ElastiCache Redis 7.1
- S3 `{name}-files-{account}` (versioned)
- ECR `intra-leads-prod-api`
- Secret `intra-leads-prod/app`

CD still needs GitHub Environment variables from **new** outputs.

## AZ failure (expected self-heal)

- [ ] ALB `HealthyHostCount` ≥ 1 in remaining AZ
- [ ] RDS event: failover completed; `DATABASE_URL` host usually unchanged
- [ ] ECS launches replacement tasks in the surviving private subnet
- [ ] Ready check green; smoke login + list leads
- [ ] If tasks stuck in old AZ ENIs, force new deployment

RTO target: minutes, not hours.

## RDS instance / data disaster (same region)

1. Commander declares DR; stop writers if the instance is corrupt but still accepting writes (`desired-count 0`)
2. PITR or snapshot restore to a **new** identifier ([BACKUP.md](./BACKUP.md))
3. Update Secrets Manager `DATABASE_URL` (and SSL)
4. New Redis is empty — acceptable; follow-up schedulers rebuild from Postgres
5. Deploy last known good image (`scripts/ecs-release.sh` or service update)
6. Smoke + isolation check (tenant B cannot read tenant A)
7. Unpause desired counts
8. Keep the damaged instance until forensics copy exists

RPO: last PITR timestamp. Tell stakeholders which writes are lost (leads, quotes, visits after that time).

## Regional rebuild (secondary AWS region)

Do this only if `ap-south-1` will miss the 4-hour RTO. There is no warm standby in-repo today.

1. Choose region (e.g. `ap-south-2` or `ap-southeast-1`); copy `infra/environments/prod` with a new `aws_region` and unique names
2. Restore RDS: snapshot copy to the DR region **or** take the latest copied snapshot if you later enable copy. If no cross-region copy exists, RPO degrades to the last copied snapshot — **call this out**
3. `terraform apply` DR env; push the last prod ECR digest (or pull-through / retag)
4. Re-apply GitHub env vars; run migrate (idempotent) then api/worker
5. S3: replicate or `aws s3 sync` versioned files bucket (site-visit photos, warranty PDFs). Without this, CRM works but files 404
6. ACM certificate in the **DR region**; DNS cutover (Route 53 / registrar) to the new ALB
7. Flutter pinning: if `SSL_PINS` is the old cert, ship an app update or temporarily pin the new leaf/intermediate — **plan this before GA**
8. Secrets: new JWT secrets invalidate all sessions (users re-login). Prefer restoring JWT secrets from backup only if you are sure they were not the cause
9. Smoke full [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) §4
10. When primary region returns, either fail back (another window) or declare DR region permanent

## Redis-only disaster

Flush or recreate the replication group. Restart workers. Delayed jobs and FCM retries replay from Postgres-backed engines where implemented. Do not restore RDS for a Redis failure.

## S3-only disaster

Restore object versions or replicate bucket. Application rows still point at `storageKey` values; missing objects show as failed photo/PDF fetches, not lost leads.

## Failback

- [ ] Primary region healthy
- [ ] Snapshot DR RDS; restore or replicate back (plan write-freeze)
- [ ] DNS back to primary ALB
- [ ] Desired counts on primary; drain DR
- [ ] Post-incident review within 5 business days

## DR test calendar

| Exercise | Frequency | Success |
| --- | --- | --- |
| RDS PITR to scratch | Semiannual | Query leads within 1 hour |
| ECS service force-deploy | With each prod release | Implicit |
| Account of snapshots / ECR SHAs | Monthly | Last 14 days of RDS; last 10 prod images |
| Tabletop regional failover | Annual | Team hits RTO on paper with current gaps called out |

## Known v1 gaps (track in hardening)

- No cross-region RDS read replica or automated snapshot copy in Terraform
- No WAF resource in Terraform yet (GA blocker per go-live)
- Redis `automatic_failover_enabled = false` and `num_cache_clusters = 1` — Redis is not HA
- OpenTelemetry traces not wired
- JWT pin / TLS pin must be part of any DNS+cert failover

Until those ship, regional DR is a **manual 4-hour rebuild**, and Redis loss is ** tolerated** as long as Postgres is intact.
