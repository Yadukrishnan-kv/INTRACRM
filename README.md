# INTRA LEADS

Tenant-scoped CRM: NestJS 11 API (`apps/api`) and Flutter client (`apps/mobile`). Architecture is in `docs/architecture/SOFTWARE_ARCHITECTURE_DOCUMENT.md`. Operations (deploy, UAT, go-live, rollback, backup, monitoring, DR) are in `docs/operations/`.

## Stack

- PostgreSQL 17, Redis / BullMQ, UUID v7
- API: NestJS 11, Prisma (SQL source of truth in `docs/data/sql`)
- Mobile: Flutter 3.35+, Riverpod
- AWS: ECS Fargate, RDS, ElastiCache, ALB, ECR, Secrets Manager
- IaC: Terraform in `infra/`
- CI/CD: GitHub Actions

## Local development

```bash
docker compose up postgres redis
```

```bash
cd apps/api
cp .env.example .env
npm ci
npx prisma generate
npm run start:dev
```

Tests (90%+ coverage gate on the API):

```bash
cd apps/api
npm run test:cov
npm run test:e2e
npm run test:integration
npm run test:security
npm run test:load
```

API: `http://localhost:3000/api/v1/health/live`  
Swagger: `http://localhost:3000/api/docs`

```bash
docker compose up --build api
docker compose --profile workers up --build
```

Flutter (SDK required):

```bash
cd apps/mobile
flutter pub get
flutter test
```

## Layout

```text
apps/api          NestJS API and worker
apps/mobile       Flutter CRM
docs/data/sql     Ordered PostgreSQL schema
docs/operations   Deploy, UAT, go-live, rollback, backup, monitoring, DR
infra             Terraform (dev / staging / prod)
.github/workflows CI, CD, security scans
```
