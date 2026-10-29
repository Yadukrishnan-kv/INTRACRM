# INTRA LEADS

Tenant-scoped, mobile-first CRM for field sales: lead capture, qualification, assignment, pipeline
execution, site visits, quotations, warranties, targets and performance reporting.

The system is a **modular monolith** — a NestJS 11 API (`apps/api`) with bounded-context modules, a
Flutter client (`apps/mobile`) with an offline outbox, PostgreSQL 17 as the system of record, and
Redis/BullMQ for asynchronous work. Multi-tenancy is shared-schema with a `tenant_id` on every row
and an `X-Tenant-Id` header on every request.

- **Architecture:** [`docs/architecture/SOFTWARE_ARCHITECTURE_DOCUMENT.md`](docs/architecture/SOFTWARE_ARCHITECTURE_DOCUMENT.md)
- **Data model:** [`docs/data/LOGICAL_DATA_MODEL.md`](docs/data/LOGICAL_DATA_MODEL.md) · SQL in [`docs/data/sql/`](docs/data/sql/README.md)
- **Operations:** [`docs/operations/`](docs/operations/README.md) — deploy, UAT, go-live, rollback, backup, monitoring, DR
- **App guides:** [`apps/api/README.md`](apps/api/README.md) · [`apps/mobile/README.md`](apps/mobile/README.md) · [`apps/web/README.md`](apps/web/README.md)

---

## Contents

- [Stack](#stack)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [API conventions](#api-conventions)
- [Domain modules](#domain-modules)
- [Endpoint map](#endpoint-map)
- [Background jobs](#background-jobs)
- [Database](#database)
- [Mobile client](#mobile-client)
- [Testing](#testing)
- [CI/CD](#cicd)
- [Infrastructure](#infrastructure)
- [Project status and known gaps](#project-status-and-known-gaps)

---

## Stack

| Layer | Technology |
| --- | --- |
| API | NestJS 11, TypeScript (strict), Node 22 |
| Persistence | PostgreSQL 17, Prisma 6, UUID v7 keys (`app.uuid_v7()`) |
| Cache / queues | Redis 7, BullMQ |
| Client | Flutter 3.35+ / Dart 3.9+, Riverpod, Go Router, Dio, SQLite (sqflite) |
| Auth | JWT access + refresh, Argon2 password hashing, device-bound sessions |
| Push | Firebase Cloud Messaging (`firebase-admin`) |
| Docs | Swagger / OpenAPI at `/api/docs` |
| Observability | Pino structured logs, request-id correlation |
| Cloud | AWS ECS Fargate, RDS, ElastiCache, ALB, ECR, S3, Secrets Manager |
| IaC | Terraform 1.9 (`infra/`) |
| CI/CD | GitHub Actions (CI, CD, security scans) |

## Repository layout

```text
apps/
  api/                     NestJS API + worker (same image, different entrypoint)
    src/common/            auth, tenancy, config, logging, redis, queue, security,
                           idempotency, pagination, filters, interceptors, openapi
    src/modules/<context>/  domain / application / infrastructure / interface
    src/jobs/              BullMQ queue registration
    prisma/                schema.prisma, seed
    test/                  e2e, integration, security, load suites
  web/                     React + Vite web console (see apps/web/README.md)
  mobile/                  Flutter CRM client
    lib/core/              config, network, storage, sync, auth, security, push, di
    lib/design_system/     tokens, Material 3 theme, shared widgets
    lib/features/<name>/   domain / data / application / presentation
    lib/router/            Go Router + auth redirect
docs/
  architecture/            Software Architecture Document (SAD)
  data/                    logical data model + ordered PostgreSQL schema
  operations/              runbooks and checklists
infra/
  modules/platform/        VPC, ALB, ECS, RDS, ElastiCache, S3, ECR, IAM/OIDC
  environments/{dev,staging,prod}/
docker/postgres/init.sh    applies docs/data/sql on first Compose boot
scripts/
  apply-sql.sh             applies the SQL files in documented order
  ecs-release.sh           registers task defs, runs migrate task, rolls ECS services
.github/workflows/         ci.yml, cd.yml, security.yml
docker-compose.yml         postgres, redis, api, worker (profile: workers)
```

## Quick start

**Prerequisites:** Docker, Node 22, and — for the client — Flutter 3.35+ with JDK 17 (Android) or
Xcode 16+ (iOS/macOS).

### 1. Infrastructure

```bash
docker compose up postgres redis
```

Postgres applies the full schema from `docs/data/sql` on first boot via
`docker/postgres/init.sh`. To reapply against an existing database, use
`scripts/apply-sql.sh` (reads `DATABASE_URL`, or takes a connection string as `$1`).

### 2. API

```bash
cd apps/api
cp .env.example .env
npm ci
npx prisma generate
npm run start:dev
```

- Health: `http://localhost:3000/api/v1/health/live`
- Readiness (Postgres + Redis): `http://localhost:3000/api/v1/health/ready`
- Swagger: `http://localhost:3000/api/docs`

Containerised alternative:

```bash
docker compose up --build api              # API only
docker compose --profile workers up --build # API + background worker
```

### 3. Mobile

```bash
cd apps/mobile
flutter pub get
flutter run --dart-define=APP_ENV=dev --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

Android emulator reaches the host at `10.0.2.2`; a physical device needs your LAN IP via
`dart_defines/local.json`. `APP_ENV` must be `dev` for plain HTTP — every other flavor rejects
`http://` before the request leaves the app. Full device, signing, Firebase and iOS pod setup is in
[`apps/mobile/README.md`](apps/mobile/README.md).

## Configuration

The API validates its environment with Zod at boot (`src/common/config/env.schema.ts`); an invalid or
missing variable fails startup rather than degrading at runtime. `apps/api/.env.example` is the
template.

| Group | Variables |
| --- | --- |
| App | `NODE_ENV`, `APP_NAME`, `APP_PORT`, `APP_URL`, `API_PREFIX`, `LOG_LEVEL`, `LOG_PRETTY` |
| Data | `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`, `REDIS_TLS` |
| Auth | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (min 16 chars), `JWT_ACCESS_TTL_SECONDS` (900), `JWT_REFRESH_TTL_SECONDS` (30d), `SESSION_IDLE_TTL_SECONDS`, `AUTH_ECHO_OTP` |
| Surface | `CORS_ORIGINS`, `SWAGGER_ENABLED`, `SEED_ENABLED`, `STORAGE_ROOT` |
| Rate limits | `RATE_LIMIT_ENABLED`, `RATE_LIMIT_WINDOW_SECONDS`, and per-class budgets `RATE_LIMIT_READ` / `WRITE` / `EXPORT` / `AUTH` |
| Push | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` |
| Comms | `COMMS_CALL_PROVIDER` / `COMMS_SMS_PROVIDER` (`device` \| `twilio`), `COMMS_WHATSAPP_PROVIDER` (`device` \| `meta`), plus `TWILIO_*` and `META_WHATSAPP_*` credentials |
| Billing | `BILLING_PROVIDER` (`manual` \| `http`), `BILLING_API_BASE_URL`, `BILLING_API_TOKEN`, `BILLING_WEBHOOK_SECRET` |

The client has **no** `.env`: all configuration is compile-time via `--dart-define`
(`APP_ENV`, `API_BASE_URL`, `SSL_PINS`), resolved in `lib/core/config/app_env.dart`.

## API conventions

Every route is prefixed `/api/v1` (`API_PREFIX`); `/api/docs` is excluded.

**Request headers**

| Header | Meaning |
| --- | --- |
| `Authorization: Bearer <access token>` | Required except on routes marked public |
| `X-Tenant-Id` | Required UUID on all tenant routes; health and docs are exempt |
| `X-Device-Id` | Binds the session to a device; a mismatch forces re-login (`DEVICE_MISMATCH`) |
| `X-Request-Id` | Correlation id; generated when absent and echoed in every response |
| `Idempotency-Key` | Sent by the client on all unsafe methods (see [known gaps](#project-status-and-known-gaps)) |
| `If-Match` | Reserved for optimistic concurrency; declared in `HttpHeaders` but not yet enforced by any route |

**Response envelope** — every JSON response is wrapped:

```jsonc
{
  "data": { /* payload */ },
  "meta": {
    "requestId": "…",
    "timestamp": "2026-08-15T11:14:00Z",
    "page": { "nextCursor": null, "prevCursor": null, "limit": 50, "hasMore": false }
  }
}
```

Pagination is cursor-based. Errors follow RFC 7807 problem details with a stable `code`
(`src/common/exceptions/error-codes.ts`). Health endpoints, Swagger, report exports and the public
warranty portal bypass the envelope.

**Global pipeline** — guards run in order `JwtAuthGuard → RateLimitGuard → TenantGuard →
MembershipGuard → PermissionsGuard`, with `RequestContextMiddleware` and `AuthSecurityMiddleware`
ahead of them, Helmet (with a dedicated CSP for the public warranty portal), strict validation pipes,
and an `AllExceptionsFilter` normalising every failure.

## Domain modules

Each module follows hexagonal layering — `domain/` (entities, policies), `application/` (services,
queue processors), `infrastructure/` (adapters), `interface/http/` (controllers, DTOs).

| Module | Responsibility |
| --- | --- |
| `identity` | Login, refresh, password reset/change, sessions, login history, roles, permissions, memberships, RBAC matrix |
| `directory` | Staff and teams, role and team assignment, staff status |
| `crm-leads` | Leads CRUD, assignment, per-lead activities, follow-ups, tracks |
| `pipeline` | Stage board, stage changes, pipeline analytics |
| `activities` | Lead and tenant timelines; timeline-driven site-visit and quotation creation |
| `tasks` | Follow-ups, reschedule/complete, the follow-up engine (dashboard, gaps, run), and the month calendar |
| `site-visits` | Scheduling, check-in/out, notes, feedback, photos, completion, cancel, no-show |
| `quotations` | Quotation lifecycle, send, status, follow-up engine |
| `warranties` | Warranty records, QR and PDF generation, public warranty portal |
| `targets` | Target definition, progress, and the monthly sales board (gauge, ranking, forecast, insights) |
| `performance` | Leaderboard and per-member performance |
| `incentives` | Incentive plans, attainment slabs, payout computation, approval and payment |
| `analytics` / `dashboard` | Metric catalogs, funnels, widget data, founder KPI tiles |
| `reporting` | Lead, follow-up, quotation, sales, pipeline, funnel, staff, attendance, site-visit, target, warranty, performance and track reports, plus Excel/PDF exports |
| `attendance` | Punch in/out, today and day history |
| `catalog` | Tenant lookups: products, categories, sources, lead statuses/qualities, warranty periods, taxes |
| `comms` | Click-to-call, WhatsApp and SMS via device launch or Twilio/Meta gateways; message templates |
| `billing` | Accounting integration — customer sync, invoice sync, payment refresh, HMAC-verified webhooks |
| `notifications` | In-app notifications, preferences, device registration, FCM delivery |
| `search` | Cross-entity search with a searchable-type catalog |
| `sync` | Offline delta feed for the mobile client |
| `audit` | Append-only tracks/audit log |
| `crm-contacts`, `crm-accounts`, `files`, `realtime`, `platform-admin` | Registered placeholders — see [known gaps](#project-status-and-known-gaps) |

## Endpoint map

Full, authoritative contract: Swagger at `/api/docs`. Summary of the mounted surface:

| Prefix | Highlights |
| --- | --- |
| `/health` | `live`, `ready` (Postgres + Redis) — public |
| `/auth` | `login`, `refresh`, `logout`, `forgot-password`, `reset-password`, `change-password`, `sessions`, `sessions/revoke-others`, `login-history` |
| `/me` | Current user, tenant memberships, active membership, roles and permissions (tenant header optional) |
| *(root)* | `permissions`, `roles`, `roles/:id/permissions`, `rbac/matrix`, `memberships`, `memberships/:id/roles` |
| `/staff`, `/teams` | Directory CRUD, status, role and team membership |
| `/leads` | CRUD, `:id/assign`, `:id/assignments`, `:id/activities`, `:id/follow-ups`, `:id/tracks`, `:id/site-visits`, `:id/quotations`, `:id/warranties`, `:id/billing`, `:id/comms/{call,whatsapp,sms}`, `:id/stage-changes` |
| `/pipelines` | `board`, `analytics` |
| `/follow-ups` | CRUD, `:id/reschedule`, `:id/complete`, `engine/{dashboard,gaps,run}`, `calendar` (per-day counts); list accepts `dueOn` / `dueFrom` / `dueTo` |
| `/site-visits` | CRUD, `check-in`, `check-out`, `notes`, `feedback`, `complete`, `cancel`, `no-show`, `photos` |
| `/quotations` | CRUD, `send`, `status`, `follow-up`, `engine/{dashboard,run}` |
| `/warranties` | CRUD, `status`, `:id/qr`, `:id/pdf` |
| `/public/warranty` | Tokenised public portal: `:token`, `:token/view`, `:token/pdf`, portal assets |
| `/targets`, `/performance`, `/analytics`, `/dashboard` | Catalogs, `me` variants, leaderboards, metric and widget detail, `targets/sales-board`, `dashboard/kpis` |
| `/incentives` | `catalog`, `me`, `plans` CRUD, `plans/:id/slabs` CRUD, `compute`, `payouts/:id/{approve,pay}` |
| `/reports` | Domain reports plus `.../export` for leads, follow-ups, quotations, sales, performance, analytics, funnel and tracks; `reports/incentives` |
| `/attendance` | `today`, `days`, `punch-in`, `punch-out` |
| `/catalog` | Hub plus CRUD for every tenant lookup type |
| `/notifications` | List, catalog, preferences, `devices`, `:id/read` |
| `/search`, `/tracks`, `/sync` | Search + catalog, audit tracks, offline delta feed |
| `/billing`, `/integrations/billing` | Capabilities, customer/invoice sync, payment refresh, `webhooks/:provider` |

## Background jobs

The worker shares the API image and runs `node dist/worker.js`, booting the same modules as an
application context (no HTTP listener).

| Queue | Processor |
| --- | --- |
| `intra.notifications` | Push delivery via FCM |
| `intra.follow-ups.engine` | Follow-up SLA engine |
| `intra.quotations.engine` | Quotation follow-up engine |
| `intra.exports` | Report exports |
| `intra.files` | File processing |
| `intra.outbox-relay` | Transactional outbox relay |

## Database

PostgreSQL is the system of record and **SQL is the source of truth**, not Prisma migrations.
`apps/api/prisma/schema.prisma` mirrors the hand-written schema for typed access; `prisma/migrations`
is intentionally empty.

Apply order is documented in [`docs/data/sql/README.md`](docs/data/sql/README.md) and encoded in both
`docker/postgres/init.sh` and `scripts/apply-sql.sh`:

```bash
DATABASE_URL=postgresql://intra:intra@localhost:5432/intra_leads ./scripts/apply-sql.sh
```

Design notes:

- Shared-schema multi-tenancy keyed on `tenant_id`, with tenant-leading, cursor-friendly indexes
- UUID v7 primary keys via `app.uuid_v7()`
- Soft delete on CRM and directory tables; `audit_logs` is append-only
- Same-tenant triggers on lead child records
- `audit_logs` and `notifications` are range-partitioned by `created_at`
- `intra_leads_rls.sql` (row-level security) is optional at launch and applied separately
- `intra_leads_incentives.sql` needs the `btree_gist` extension: the slab non-overlap constraint
  mixes a uuid equality with an `int4range` overlap in one GiST index

## Mobile client

Clean Architecture + MVVM: pages under `presentation/`, Riverpod notifiers as ViewModels under
`application/`, entities and repository ports under `domain/`, DTOs and API clients under `data/`.
Riverpod is the only DI mechanism (`lib/core/di/providers.dart`).

**Networking** — Dio with three interceptors: `HeaderInterceptor` (auth, tenant, request, device and
idempotency headers), `AuthRefreshInterceptor` (single-flight 401 refresh with retry, force-logout on
`DEVICE_MISMATCH`), and `ErrorInterceptor` (problem details → typed `Failure`). Responses are
unwrapped through the shared `unwrapEnvelope<T>` helper.

**Offline** — a SQLite database (`intra_leads.db`) holds an AES-256-GCM encrypted cache, an outbox of
pending writes with idempotency keys, sync cursors, optimistic rows for leads/notes/follow-ups, a
local→server id map and merged conflicts. `SyncEngine.syncNow()` flushes the outbox then pulls
`GET /sync`; connectivity restore triggers the same path. Conflict policy is server-wins for
ownership, stage and completed follow-ups, merge-by-field for contact fields and notes. Tokens live
in Flutter Secure Storage, never in SQLite.

**Security posture** keyed off `APP_ENV`: cleartext HTTP only in `dev`, rooted/jailbroken device
blocking in `staging` and `prod`, and optional certificate pinning when `SSL_PINS` is non-empty. An
unrecognised `APP_ENV` resolves to `prod` so a typo cannot hand a build the relaxed posture.

## Testing

```bash
cd apps/api
npm run ci                 # lint + typecheck + unit tests with coverage
npm run test:e2e           # HTTP contract
npm run test:integration   # tenant isolation
npm run test:security      # security assertions
npm run test:load          # k6 scenario via test/load/run-load.ts
```

Unit coverage is gated at **90% statements / functions / lines, 60% branches** (`package.json`
`jest.coverageThreshold`); modules, `main.ts`, `worker.ts`, DTOs and generated OpenAPI are excluded.

```bash
cd apps/mobile
flutter analyze            # must report "No issues found!"
flutter test
flutter test --coverage
```

The Flutter suite covers core plumbing — `Result`, the API envelope, SSL pinning, the AES cipher,
device integrity, the sync conflict resolver, theming, report models, warranty tokens and
notification routing. There are no widget tests for the feature pages and `integration_test/` is an
empty placeholder.

## CI/CD

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | PRs, pushes to `main`/`develop` | API lint/typecheck/unit + e2e, integration, security and load suites; Flutter analyze/test/debug APK; `terraform fmt`/`validate` across dev, staging and prod |
| `security.yml` | PRs, pushes, weekly cron | `npm audit` (prod deps, critical) and a Trivy filesystem scan (critical, fail on finding) |
| `cd.yml` | Pushes to `develop`/`main`, `v*` tags, manual dispatch | Assumes an AWS role via OIDC, builds and pushes the API image to ECR, then runs `scripts/ecs-release.sh` |

Environment resolution in CD: `develop` → dev, `main` → staging, `v*` tag → prod (overridable via
`workflow_dispatch`). `ecs-release.sh` registers a new task-definition revision for the api, worker
and migrate families, runs the migrate task against RDS, then force-deploys both services.

## Infrastructure

Terraform lives in `infra/`, with one reusable `modules/platform` and a thin root per environment.
The module provisions a VPC (public/private subnets, NAT), an ALB with HTTP→HTTPS redirect, an ECS
cluster with api/worker/migrate task definitions and CPU-target autoscaling, RDS PostgreSQL,
ElastiCache Redis, an encrypted and versioned S3 bucket for files, an ECR repository with a lifecycle
policy, Secrets Manager entries with generated credentials, and a GitHub OIDC deploy role.

```bash
terraform -chdir=infra/environments/dev init
terraform -chdir=infra/environments/dev plan
```

The S3 state backend is commented out per environment — uncomment and point it at your state bucket
before shared use. Environment sizing (task CPU/memory, desired counts, DB instance class) is set in
each `environments/*/main.tf`. Deploy procedure, cutover and recovery are in
[`docs/operations/`](docs/operations/README.md); architecture targets **RPO ≤ 15 min, RTO ≤ 4 h**.

## Project status and known gaps

The lead-to-warranty path is built end to end. These are the real boundaries as of this revision:

| Gap | Impact |
| --- | --- |
| `IdempotencyInterceptor` reads the header but does not deduplicate | The client sends and retries `Idempotency-Key`, but a retry after a timeout can still duplicate leads, follow-up completions and site visits |
| `RealtimeModule` is an empty module | No websocket transport; `lib/core/realtime/` is a placeholder and the client is poll/refresh only |
| `FilesModule` is an empty module | Uploads outside site-visit photos have no home; `STORAGE_ROOT` backs local disk, and the S3 bucket is provisioned but unused |
| `crm-contacts`, `crm-accounts` and `platform-admin` are empty modules | The matching client features (`contacts`, `accounts`, `activities`, `profile`) are placeholders with no API to build against |
| `GET /sync` returns no tombstones and covers only leads, notes and follow-ups | Server-side deletions persist in the local cache; site visits, quotations, attendance, targets and warranties are online-only |
| No mobile client for `/tracks`, `/leads/:id/assignments`, `/site-visits/:id/no-show`, comms template CRUD or billing sync actions | Backend endpoints with no client surface |
| Incentive plans and slabs are read-only on mobile | The client lists plans and can recompute a period, but plan and slab authoring is API-only |
| `POST /incentives/compute` runs inline, one write per active member | Fine at a few hundred staff; a larger tenant wants this on the `intra.exports`-style queue |
| The founder `active_leads` delta is reconstructed, not stored | It rewinds the open pipeline to the first of the month from this month's opens and closes; a lead closed and reopened in the same month is counted once |
| Row-level security (`intra_leads_rls.sql`) is optional and not applied by default | Tenant isolation is enforced in the application layer (`TenantGuard` + tenant-scoped queries), not by the database |

Empty `.gitkeep` directories are deliberate markers for planned work — leave them until the matching
module lands.
