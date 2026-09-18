# Monitoring Strategy

Signals follow SAD §15.5: structured logs, RED metrics, queue depth, RDS/Redis, correlation via `X-Request-Id`. v1 implementation is **CloudWatch** (logs + Container Insights on prod + ALB/RDS metrics). Traces (OpenTelemetry) are the next hardening step; do not wait on them to page.

## Health

| Endpoint | Auth | Use |
| --- | --- | --- |
| `GET /api/v1/health/live` | Public, rate-limit skipped | Process up. ALB + ECS container health |
| `GET /api/v1/health/ready` | Public, rate-limit skipped | Postgres ping + Redis `PING` |
| `GET /api/v1/health` | Same as ready | Alias |

ALB target group: path `/api/v1/health/live`, matcher 200, interval 30s, healthy 2, unhealthy 3.  
ECS api: `wget -qO- http://127.0.0.1:3000/api/v1/health/live`.

Ready **must** fail if PostgreSQL or Redis is down. Live staying green while ready is red means “process up, dependencies down.”

## Logs

| Group | Retention | Contents |
| --- | --- | --- |
| `/ecs` api log group (`awslogs-stream-prefix=api`) | 30 d prod / 14 d else | JSON request logs (Pino). Redact phone, email, tokens |
| worker log group | Same | BullMQ processors, FCM, billing, follow-up engines |

Correlate with `X-Request-Id` / `requestId` and job `correlationId`.

Useful filters:

- `error.level` / `"statusCode":5`
- `TENANT_REQUIRED`, `FORBIDDEN`, `DEVICE_MISMATCH` (authz / abuse)
- `Billing gateway unreachable`, `FCM send failed`
- migrate task stopped with non-zero exit

## Metrics (golden)

Build CloudWatch dashboards **API**, **workers**, **auth**, **data plane**:

**API (RED)**

- Rate: ALB `RequestCount`
- Errors: ALB `HTTPCode_Target_5XX_Count`, `HTTPCode_ELB_5XX_Count`
- Duration: ALB `TargetResponseTime` p95 (map to SAD budgets: list/assign 300 ms, sync 500 ms)

**Capacity**

- ECS CPU/memory (Container Insights enabled in prod)
- Desired vs running task count (api 2, worker 2 in prod)
- ALB `UnHealthyHostCount`, `HealthyHostCount`

**Data plane**

- RDS `CPUUtilization`, `FreeStorageSpace`, `DatabaseConnections`, replica/AZ failover events
- RDS Performance Insights top SQL
- ElastiCache `CPUUtilization`, `CurrConnections`, `Evictions`, `ReplicationLag` if a replica is added later

**Workers**

- Queue depth / delayed / failed (export from BullMQ to CloudWatch when available; until then, log-based metric filters on `notified` / `failed`)
- FCM failure count
- Follow-up engine tick errors

**Tenancy / security**

- Count of cross-tenant 404 vs 500 (500 is a bug)
- Auth failures and lockouts
- WAF blocked requests (once WAF is on the ALB)

## Alerts (page)

Page the on-call (SNS → PagerDuty/Slack). Sev-2 can be ticket-only.

| Alert | Condition (starting point) | Sev |
| --- | --- | --- |
| API down | ALB `HealthyHostCount` < 1 for 2 minutes | 1 |
| Ready failing | Synthetics `health/ready` ≠ 200 for 3 minutes | 1 |
| 5xx burst | 5xx / requests > 2% for 5 minutes | 1 |
| Latency | p95 `TargetResponseTime` > 1 s for 10 minutes (launch); tighten to SAD budgets after baseline | 2 |
| RDS storage | `FreeStorageSpace` < 10 GB | 1 |
| RDS CPU | > 80% for 15 minutes | 2 |
| Redis evictions | > 0 sustained 10 minutes | 2 |
| Worker crash loop | ECS running count < desired for 5 minutes | 1 |
| Deploy migrate failed | CD job failed on migrate (GitHub → on-call) | 1 |
| Cert expiry | ACM < 21 days | 2 |

Synthetics: canary every 1 minute on `https://<api>/api/v1/health/live` and `/ready` from `ap-south-1`. Optional authenticated canary: login + `GET /leads?limit=1` with a smoke tenant.

## Dashboards and sampling

- Prod: 100% error logs; info sampled if volume requires it
- Do not log authorization headers, JWT, OTP, or raw file bytes
- `NODE_ENV=production` on prod tasks; pretty logs off (`LOG_PRETTY=false`)

## On-call loop

1. Alert → health live vs ready
2. If live down: ECS tasks, ALB TG, recent deploy
3. If ready down: RDS status, Redis, SGs, Secrets Manager `DATABASE_URL` / Redis auth
4. If 5xx with healthy ready: app bug → logs by `requestId` → [ROLLBACK.md](./ROLLBACK.md)
5. If queue lag only: scale worker desired count; inspect DLQ/failed jobs
6. Close with customer impact and whether backup/DR was involved

## Load and SLOs

CI `npm run test:load` hits in-process stubs (health, lead list, assign, sync) with 99% success and p95 < 2 s. Staging/prod capacity tests should use `apps/api/test/load/k6-api.js` against the real ALB with `API_BASE_URL`, `ACCESS_TOKEN`, `TENANT_ID`.

Track error budget against: availability of `health/ready` and lead-list 5xx, not against live-only (live can be up while the product is unusable).
