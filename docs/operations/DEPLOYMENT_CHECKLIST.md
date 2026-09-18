# Deployment Checklist

Use this for every promotion into **dev**, **staging**, or **prod**. Topology and CD wiring live in [DEPLOYMENT.md](./DEPLOYMENT.md). Schema is expand-only SQL in `docs/data/sql`, applied by the ECS `migrate` task (`scripts/apply-sql.sh`).

Promotion path:

| Trigger | Environment |
| --- | --- |
| Push to `develop` | `dev` |
| Push to `main` | `staging` |
| Tag `v*` | `prod` (GitHub Environment reviewers required) |
| `workflow_dispatch` | Chosen environment |

## 1. Pre-flight (every release)

- [ ] Change has a PR with intent, risk, test evidence, and **migration notes** (empty if no SQL change)
- [ ] CI green on the merge commit: API `npm run ci` + e2e/integration/security/load, Flutter analyze/test, Terraform fmt/validate
- [ ] Security workflow green: `npm audit --audit-level=critical`, Trivy filesystem scan
- [ ] SQL scripts are **expand-only** (add columns/tables/indexes; no drop/rename of live columns). Destructive SQL is a separate, scheduled change with a rollback plan
- [ ] New endpoints have tenant isolation coverage
- [ ] Secrets are not in the image or repo. Rotations go to Secrets Manager `{project}-{env}/app` (Terraform does **not** update `secret_string` after first apply)
- [ ] Flutter store build is **not** required for API-only releases. If the client changed, a flavor build and store submission is a separate checklist item
- [ ] On-call and a rollback owner are named for prod

## 2. Environment readiness

- [ ] GitHub Environment variables match Terraform outputs (`AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`, `ECR_REPOSITORY`, `ECS_*`, `ECS_SUBNETS`, `ECS_SECURITY_GROUP`)
- [ ] Prod Environment has required reviewers
- [ ] ACM certificate is attached in prod (`certificate_arn`); HTTP-only ALB is not acceptable for GA
- [ ] RDS, Redis, and ECS tasks are in **private** subnets; SG path is ALB → API → RDS/Redis only
- [ ] `GET /api/v1/health/live` and `GET /api/v1/health/ready` succeed on the current release before you start

## 3. Deploy (CD)

CD (`.github/workflows/cd.yml`) builds `apps/api/Dockerfile` from the repo root, pushes `{sha}` and `{env}` tags to ECR, then runs `scripts/ecs-release.sh`:

1. Register new task definitions for migrate, api, and worker with the new image digest
2. Run the one-shot migrate task in private subnets
3. Wait until the migrate task stops with exit code 0
4. Force new deployments of `api` and `worker`

- [ ] Confirm the workflow targeted the intended environment
- [ ] Migrate task exit code is 0 (failure **stops** the ECS rollout — do not skip this)
- [ ] ECS api and worker services reach `PRIMARY` / stable with the new task definition revision
- [ ] Container health check: `wget -qO- http://127.0.0.1:3000/api/v1/health/live`
- [ ] ALB target group `/api/v1/health/live` shows healthy targets in both AZs (prod desired count is 2)

Manual equivalent if CD is unavailable:

```bash
# From repo root, after docker build/push to ECR with IMAGE=<ecr>:<sha>
export IMAGE ECS_CLUSTER ECS_API_FAMILY ECS_WORKER_FAMILY ECS_MIGRATE_FAMILY
export ECS_API_SERVICE ECS_WORKER_SERVICE ECS_SUBNETS ECS_SECURITY_GROUP
bash scripts/ecs-release.sh
```

## 4. Smoke (immediately after deploy)

Run against the environment ALB (HTTPS in prod). Use a synthetic tenant, never a live customer tenant in prod smoke if a dedicated smoke tenant exists.

- [ ] `GET /api/v1/health/live` → 200 `{ "status": "ok" }`
- [ ] `GET /api/v1/health/ready` → 200 (Postgres + Redis)
- [ ] Login issues access + refresh tokens
- [ ] `X-Tenant-Id` required on tenant APIs; missing header → `TENANT_REQUIRED`
- [ ] Create lead (idempotent retry) and list leads (`limit=20`)
- [ ] Assign lead
- [ ] Sync pull returns a delta (empty is acceptable)
- [ ] Worker: enqueue a follow-up tick or notification and confirm CloudWatch `/ecs/{project}-{env}` worker logs show progress, not crash loops
- [ ] Cross-tenant GET of the smoke lead by tenant B → 404, not 403 with a body leak
- [ ] Swagger is **disabled** in prod (`SWAGGER_ENABLED=false`)

Latency budgets (exclude client-to-edge), from the SAD:

| Call | p95 |
| --- | --- |
| Auth token | < 200 ms |
| Lead create / list / assign | < 300 ms |
| Sync delta | < 500 ms |

## 5. Observe for 30 minutes

- [ ] ALB 5xx rate unchanged vs pre-deploy baseline
- [ ] ECS CPU/memory not saturating (Container Insights on prod)
- [ ] No migrate or boot errors in CloudWatch log groups (`retention` 30 days prod, 14 days non-prod)
- [ ] BullMQ jobs are not piling (worker desired count is 2 in prod)
- [ ] No spike in `DEVICE_MISMATCH`, `UNAUTHORIZED`, or `FORBIDDEN` beyond expected

## 6. Sign-off

| Role | Name | Time (UTC) | Result |
| --- | --- | --- | --- |
| Deployer | | | |
| Reviewer (prod) | | | |
| On-call | | | |

Release: `v____` / SHA `________`  
Previous task definition: api `____` worker `____`  
If smoke fails, follow [ROLLBACK.md](./ROLLBACK.md). Do not apply compensating SQL during an image rollback.
