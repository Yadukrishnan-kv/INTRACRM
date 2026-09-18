# Operations

Runbooks for INTRA LEADS (API on ECS Fargate, RDS PostgreSQL 17, ElastiCache Redis, Flutter client).

| Document | Use |
| --- | --- |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | How environments, Terraform, and GitHub Actions CD work |
| [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) | Pre-flight and per-release deploy steps |
| [UAT_CHECKLIST.md](./UAT_CHECKLIST.md) | Staging sign-off before a tagged production release |
| [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) | First production cutover and GA |
| [ROLLBACK.md](./ROLLBACK.md) | How to revert API/worker without losing tenant data |
| [BACKUP.md](./BACKUP.md) | What is backed up, retention, and restore drills |
| [MONITORING.md](./MONITORING.md) | Health, logs, metrics, alerts, and on-call |
| [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) | Regional failure, RPO/RTO, and recovery order |

Architecture targets: **RPO ≤ 15 minutes**, **RTO ≤ 4 hours** for a regional outage in v1 (`docs/architecture/SOFTWARE_ARCHITECTURE_DOCUMENT.md` §13.8).
