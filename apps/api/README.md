# INTRA LEADS API

NestJS 11 modular monolith. Aligns with the Software Architecture Document.

## Stack

- NestJS 11 / TypeScript strict
- Prisma + PostgreSQL 17
- Redis + BullMQ
- Swagger, class-validator, Pino, Zod env validation

## Setup

```bash
cp .env.example .env
npm install
npx prisma generate
npm run start:dev
```

From the repo root, infrastructure:

```bash
docker compose up postgres redis
docker compose up --build api
docker compose --profile workers up --build
```

AWS, GitHub Actions, and production SQL apply are documented in `docs/operations/DEPLOYMENT.md`.

Apply the production SQL in `docs/data/sql` if the database is empty and you are not using Compose init scripts.

## Endpoints

| Path | Purpose |
| --- | --- |
| `GET /api/v1/health/live` | Liveness |
| `GET /api/v1/health/ready` | Postgres + Redis |
| `GET /api/v1/catalog` | Tenant catalog hub (products, categories, sources, statuses, qualities, warranty periods) |
| `GET /api/v1/comms/capabilities` | Call / WhatsApp / SMS mode (`device` or gateway) |
| `GET /api/v1/comms/templates` | SMS and WhatsApp message templates |
| `GET /api/v1/leads/:id/billing` | Synced customer, invoices, and payment status |
| `POST /api/v1/leads/:id/billing/customers/sync` | Push customer to accounting |
| `POST /api/v1/quotations/:id/billing/invoices/sync` | Create/refresh invoice from a won quotation |
| `POST /api/v1/billing/invoices/:id/payments/refresh` | Pull payment status |
| `POST /api/v1/integrations/billing/webhooks/:provider` | HMAC inbound customer/invoice/payment events |
| `POST /api/v1/leads/:id/comms/call` | Click to call (device dialer or Twilio bridge) |
| `POST /api/v1/leads/:id/comms/whatsapp` | WhatsApp (wa.me or Meta Cloud API) |
| `POST /api/v1/leads/:id/comms/sms` | SMS (device composer or Twilio) |
| `GET /api/v1/sync` | Offline delta: leads, notes, follow-ups |
| `GET /api/docs` | Swagger UI |

Tenant APIs require `X-Tenant-Id`. Health and docs are public.

## Response envelope

Success and error bodies follow `docs/architecture/SOFTWARE_ARCHITECTURE_DOCUMENT.md` section 9.4.
