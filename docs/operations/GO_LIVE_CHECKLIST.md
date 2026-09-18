# Go Live Checklist

First production cutover (GA), not a routine `v*` patch. Routine deploys use [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md). UAT must already be signed ([UAT_CHECKLIST.md](./UAT_CHECKLIST.md)).

Region: `ap-south-1`  
Accounts: prod isolated from non-prod (preferred)

## T-14 days

- [ ] Prod Terraform applied (`infra/environments/prod`): VPC 2 AZs, ALB, ECS api+worker, RDS PostgreSQL 17 Multi-AZ, ElastiCache Redis 7.1 TLS+auth, S3 versioned files bucket, ECR, Secrets Manager
- [ ] Remote Terraform state backend enabled (S3 + lock); local state is not acceptable for prod
- [ ] GitHub Environment `prod` has required reviewers; OIDC deploy role only (no long-lived AWS keys)
- [ ] ACM certificate on the ALB; HTTP listener redirects to 443 (`ELBSecurityPolicy-TLS13-1-2-2021-06`)
- [ ] Public DNS (API hostname) points at the ALB; Flutter prod flavor uses HTTPS only
- [ ] WAF associated with the ALB (SAD §12.5). If not yet in Terraform, this is a **blocker** for GA, not a follow-up
- [ ] RDS: encryption at rest, deletion protection, 14-day backup retention, Performance Insights, not publicly accessible
- [ ] Final snapshot on delete is enabled (`skip_final_snapshot = false` in prod)
- [ ] Redis AUTH + transit and at-rest encryption; `REDIS_TLS=true`, `PGSSLMODE=require` on tasks
- [ ] JWT access/refresh secrets ≥ 16 characters, unique to prod, stored only in Secrets Manager
- [ ] FCM, Twilio/Meta, billing webhook secret present or explicitly waived (device-mode comms / manual billing)
- [ ] `SWAGGER_ENABLED=false`, `SEED_ENABLED=false`, `AUTH_ECHO_OTP=false`
- [ ] CloudWatch log groups exist; Container Insights enabled on the prod ECS cluster
- [ ] Alerts from [MONITORING.md](./MONITORING.md) are paging the on-call channel
- [ ] Backup restore drill completed once in staging or a prod-like snapshot ([BACKUP.md](./BACKUP.md))
- [ ] DR runbook reviewed ([DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md)); RPO ≤ 15 min, RTO ≤ 4 h

## T-7 days

- [ ] Pilot tenant(s) identified; founder users invited; RBAC matrix agreed
- [ ] Catalog, pipeline, teams, and targets seeded **in prod** by operators (do not copy prod data to laptops)
- [ ] Mobile store listings, privacy policy, and support contact ready
- [ ] Support and on-call rota published (primary + backup, 24×7 for launch week)
- [ ] Maintenance window communicated if DNS/TLS cutover needs one
- [ ] Feature flags / billing provider mode confirmed (`manual` vs `http`)

## T-1 day

- [ ] Change freeze on `main` except launch fixes
- [ ] Latest staging SHA is the intended prod tag; UAT signed
- [ ] ECS desired counts: api ≥ 2, worker ≥ 2
- [ ] RDS storage headroom (prod starts at 100 GB); Redis `cache.t4g.small` sized for launch load
- [ ] Rollback owner has AWS console + `aws ecs` access and the previous known-good image tag
- [ ] Status page or stakeholder comms channel ready

## T-0 cutover

- [ ] Tag `vX.Y.Z` and wait for CD (reviewer approval → ECR push → migrate → api/worker)
- [ ] Migrate task exit 0
- [ ] Health live + ready on the public hostname
- [ ] Founder login on a **non-compromised** production app build
- [ ] Create one real (or designated launch) lead, assign, sync
- [ ] Warranty public PDF/QR if that feature is in the launch set
- [ ] Compare ALB 5xx, p95, and error logs to staging baseline for 60 minutes
- [ ] Confirm no Swagger at `/api/docs`
- [ ] Store release: production Flutter build submitted / phased rollout started if the client is in the launch set

## T+24 hours / T+7 days

- [ ] No Sev-1 open; Sev-2 have owners
- [ ] Backup job / RDS snapshot inventory shows a fresh automated backup
- [ ] Queue depth and DLQ empty or explained
- [ ] Pilot feedback logged; go / no-go for wider rollout
- [ ] Post-launch review: what to automate next (WAF rules, tracing, autoscaling policies)

| Gate | Owner | Signed | UTC |
| --- | --- | --- | --- |
| Infrastructure | | | |
| Security | | | |
| Product UAT | | | |
| Deploy | | | |
| On-call | | | |
