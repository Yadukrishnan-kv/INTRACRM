# Deployment

Local Docker Compose, AWS (ECS Fargate, RDS, ElastiCache, ALB), and GitHub Actions for INTRA LEADS.

Checklists and runbooks: [operations index](./README.md) — deploy, UAT, go-live, [rollback](./ROLLBACK.md), [backup](./BACKUP.md), [monitoring](./MONITORING.md), [disaster recovery](./DISASTER_RECOVERY.md).

Health checks used by Compose, ECS, and the ALB:

| Path | Use |
| --- | --- |
| `GET /api/v1/health/live` | Process is up (ALB + container health) |
| `GET /api/v1/health/ready` | PostgreSQL and Redis are reachable |

Schema is applied from ordered SQL in `docs/data/sql`, not Prisma migrate files. Grants and RLS scripts are **not** applied on local Compose (the app user is `intra`).

## Local Docker

From the repository root.

```bash
docker compose up postgres redis
```

That is enough for `npm run start:dev` in `apps/api` against `localhost:5432` and `localhost:6379`.

```bash
docker compose up --build api
docker compose --profile workers up --build
```

The API image is `intra-leads-api:local`, built from `apps/api/Dockerfile` with context `.` so `docs/data/sql` and `scripts/apply-sql.sh` are copied into the image.

JWT secrets in Compose are local placeholders and must be at least 16 characters. Do not reuse them in AWS.

Re-apply SQL against a running database:

```bash
# Git Bash / WSL / Linux
export DATABASE_URL=postgresql://intra:intra@localhost:5432/intra_leads
./scripts/apply-sql.sh
```

## AWS topology

Terraform lives in `infra/modules/platform` and is wrapped per environment:

- `infra/environments/dev`
- `infra/environments/staging`
- `infra/environments/prod`

Each environment creates:

- VPC (2 AZs), public subnets (ALB + NAT), private subnets (ECS, RDS, Redis)
- Application Load Balancer (HTTP; HTTPS when `certificate_arn` is set)
- ECS Fargate cluster: `api`, `worker`, one-shot `migrate` task (`apply-sql`)
- RDS PostgreSQL 17
- ElastiCache Redis 7.1 with auth token and TLS (`REDIS_TLS=true` on tasks)
- S3 private files bucket (versioned)
- ECR repository `intra-leads-{env}-api`
- Secrets Manager secret `{project}-{env}/app`
- Optional GitHub OIDC deploy role

Prod enables Multi-AZ RDS, deletion protection, longer backup retention, and ECS Container Insights.

### Bootstrap order

ECS services start on the first apply and will fail to pull until an image exists. Push once before or immediately after apply:

1. Copy `terraform.tfvars.example` to `terraform.tfvars` in the environment directory. Set `github_org_repo` (for example `acme/INTRACRM`) on **one** environment per AWS account so the OIDC provider is created once. Other environments in the same account should set `github_oidc_provider_arn` to that provider ARN.
2. Uncomment and configure the S3 backend when you are ready for shared state.
3. Apply:

```bash
cd infra/environments/dev
terraform init
terraform apply
```

4. Build and push the API image (tag `latest` matches the Terraform default `image_tag`):

```bash
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-south-1.amazonaws.com
docker build -f apps/api/Dockerfile -t <ecr_repository_url>:latest .
docker push <ecr_repository_url>:latest
```

5. Run the migrate task (or wait for GitHub CD). Force a new ECS deployment after the image exists.
6. Copy Terraform outputs into the matching GitHub Environment (`dev`, `staging`, `prod`).

`aws_secretsmanager_secret_version` ignores later changes to `secret_string`. Rotating the RDS or Redis password in Terraform does not update Secrets Manager; update the secret JSON manually or replace the version.

### GitHub Environment variables

Create GitHub Environments `dev`, `staging`, and `prod`. Protect `prod` with required reviewers. Set these **variables** (not secrets) from Terraform outputs:

| Variable | Terraform output |
| --- | --- |
| `AWS_REGION` | `ap-south-1` (or your region) |
| `AWS_DEPLOY_ROLE_ARN` | `github_deploy_role_arn` |
| `ECR_REPOSITORY` | `ecr_repository_name` |
| `ECS_CLUSTER` | `ecs_cluster_name` |
| `ECS_API_SERVICE` | `ecs_api_service_name` |
| `ECS_WORKER_SERVICE` | `ecs_worker_service_name` |
| `ECS_API_FAMILY` | `{project}-{env}-api` |
| `ECS_WORKER_FAMILY` | `{project}-{env}-worker` |
| `ECS_MIGRATE_FAMILY` | `migrate_task_definition` |
| `ECS_SUBNETS` | `private_subnet_ids` as a comma-separated list |
| `ECS_SECURITY_GROUP` | `ecs_security_group_id` |

OIDC is used; do not store long-lived AWS access keys in GitHub.

### Promotion

| Trigger | GitHub Environment |
| --- | --- |
| Push to `develop` | `dev` |
| Push to `main` | `staging` |
| Tag `v*` | `prod` |
| `workflow_dispatch` | chosen environment |

CD builds `apps/api/Dockerfile` from the repo root, pushes the image, runs `scripts/ecs-release.sh` (SQL apply, then api + worker), and registers a new task definition revision so the new digest is used. Terraform `lifecycle.ignore_changes` on ECS `task_definition` is intentional so CD owns image rollouts.

### HTTPS

Set `certificate_arn` to an ACM certificate in the same region. HTTP then redirects to 443. Until a certificate is set, the ALB listens on port 80 only.

## GitHub Actions

| Workflow | Path | Purpose |
| --- | --- | --- |
| CI | `.github/workflows/ci.yml` | API `npm run ci`, Flutter analyze/test, Terraform fmt/validate |
| CD | `.github/workflows/cd.yml` | OIDC → ECR → migrate task → ECS |
| Security | `.github/workflows/security.yml` | npm audit (critical), Trivy filesystem scan |

## Flutter

Store submission is a controlled release, not part of ECS CD. CI runs `flutter analyze` and `flutter test` in `apps/mobile`.
