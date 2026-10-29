# Sales Targets, Incentives & Follow-up Calendar

How the features added in `22d47d6` work, how to run them locally, and which
demo account to log in with to see each one.

> **Demo credentials only.** Every account below is created by the local seed
> (`apps/api/prisma/seed/seed.ts`). Never use these on staging or production.

---

## 1. Run it locally

```bash
# 1. Postgres + Redis (Compose applies every SQL file in docs/data/sql,
#    including intra_leads_incentives.sql)
docker compose up postgres redis

# 2. API
cd apps/api
cp .env.example .env
#    set SEED_ENABLED=true in .env — the seed is a no-op without it
npm install
npx prisma generate
npm run db:seed
npm run start:dev            # http://localhost:3000/api/v1, Swagger at /api/docs

# 3. Mobile
cd ../mobile
flutter pub get
flutter run --dart-define=APP_ENV=dev --dart-define=API_BASE_URL=http://localhost:3000/api/v1
#   Android emulator: http://10.0.2.2:3000/api/v1
#   Physical phone:   see apps/mobile/README.md (dart_defines/local.json)
```

Tenant: **INTRA Steel Doors & Windows** (slug `intra-demo`).

---

## 2. Demo accounts

All accounts share the same password: **`IntraLeads1!`**

| Email | Name | Role | Sales board | Incentive report | Plans + compute | Calendar of others |
|---|---|---|---|---|---|---|
| `ananya.das@intraleads.local` | Ananya Das | `tenant.admin` | ✅ | ✅ | ✅ | ✅ |
| `ada.rao@intraleads.local` | Ada Rao | `sales.manager` (West) | ✅ | ✅ | ✅ | — |
| `leela.nair@intraleads.local` | Leela Nair | `sales.manager` (South) | ✅ | ✅ | ✅ | — |
| `dev.menon@intraleads.local` | Dev Menon | `sales.executive` | ✅ | ✅ read-only | — | — |
| `priya.shah@intraleads.local` | Priya Shah | `sales.executive` | ✅ | ✅ read-only | — | — |
| `meera.iyer@intraleads.local` | Meera Iyer | `sales.executive` | ✅ | ✅ read-only | — | — |
| `rohan.joshi@intraleads.local` | Rohan Joshi | `sales.executive` | ✅ | ✅ read-only | — | — |
| `kabir.khan@intraleads.local` | Kabir Khan | `business.manager` | ✅ | — | — | — |
| `arjun.patel@intraleads.local` | Arjun Patel | `sales.staff` | ✅ | — | — | — |
| `sana.qureshi@intraleads.local` | Sana Qureshi | `sales.staff` | ✅ | — | — | — |
| `vikram.singh@intraleads.local` | Vikram Singh | `sales.staff` | ✅ | — | — | — |
| `admin@intraleads.local` | Demo admin | `tenant.founder` | ✅ | ❌ see note | ❌ see note | ✅ |

The columns follow these permissions:

- **Sales board** → `target:read`
- **Incentive report** → `incentive:read`
- **Plans + compute** → `incentive:manage`
- **Calendar of others** → `tenant:manage_users`

Grants come from `docs/data/sql/intra_leads_seed_rbac.sql`,
`intra_leads_rbac_product_roles.sql` and `intra_leads_incentives.sql`.
The "Calendar of others" column is best-effort; check `tenant:manage_users` in
those files if it matters.

> **Note — founder has no incentive access.** `intra_leads_incentives.sql`
> grants `incentive:*` to `tenant.admin`, `sales.manager`, `sales.executive`
> and `sales.viewer` only. The seeded `admin@intraleads.local` is a
> `tenant.founder`, so the Incentive Report never appears for them. **Use
> `ananya.das@intraleads.local` to try incentives end to end.**

---

## 3. Where to find each screen in the app

| Screen | Route | How to get there |
|---|---|---|
| Founder KPI grid | `/` (dashboard) | Top of the dashboard; every tile is tappable |
| Monthly Sales Target | `/targets/sales-board` | Drawer → *Monthly Sales Target*, Reports hub, or the *Target Achieved* KPI tile |
| Incentive Report | `/reports/incentives` | Drawer → *Incentive Report*, or Reports hub |
| Incentive Plans | `/incentives/plans` | Plans button on the Incentive Report (managers only) |
| Follow-up Calendar | `/tasks/calendar` | Drawer → *Follow-up Calendar*, Reports hub, or the *Today's Follow-ups* KPI tile |

Menu items are hidden when the logged-in user lacks the permission.

---

## 4. How each feature works

### 4.1 Monthly Sales Target (`GET /targets/sales-board`)

```
period (this_month | last_month | this_quarter | this_year)
scope  (me | team | tenant)
        │
        ▼
 targets.service ── achieved per member ──► sales-board.ts (pure)
                                             ├─ rankStandings  1,2,2,4 on achieved value
                                             ├─ podium         drawn 2nd · 1st · 3rd
                                             ├─ buildInsights  day, value, running total, avg/day
                                             ├─ paceNote       ON TRACK / TRAILING
                                             └─ suggestionsFor up to 3 concrete nudges
```

How the mobile screen behaves:

- Changing the period or scope refetches the board.
- The **My Target** toggle doesn't refetch, because both cards come back in one response.
- **Share** copies a text summary to the clipboard.
- Tapping someone on the podium or in the ranking opens their performance page.

> Seeded targets cover **August 2026** (monthly) and **Q3 2026** (quarterly).
> If *This Month* looks empty, pick *This Quarter* or *Last Month*.

### 4.2 Incentives

**Data model**

- **`IncentivePlan`**: the rules.
  - The KPI it measures (`metricCode`) and the period type.
  - `minAttainmentBps`: the minimum % of target needed to earn anything.
  - `holdBps`: the share of each payout held back.
  - `payoutCap`: the maximum payout.
  - Status: `draft` → `active` → `archived`.
- **`IncentiveSlab`**: one attainment band `[fromBps, toBps)`. It pays one of:
  - `percent`: a % of the achieved value
  - `flat`: a fixed amount
  - `per_unit`: an amount × the achieved value

  Each band can also add a bonus.
- **`IncentivePayout`**: one row per member, per plan, per period.
  Status: `draft` → `approved` → `paid` (or `void`).

All percentages are basis points: `10000` = 100 %.

**Calculation** (`apps/api/src/modules/incentives/domain/incentive-engine.ts`):

```
attainment → minimum gate → matching slab → gross + bonus → cap → hold / payable
```

Worked example:

- **Plan:** minimum 80 %, hold 10 %, cap ₹50,000.
- **Slabs:** 80–100 % pays 2 %; 100 % and up pays 3 % + ₹5,000 bonus.
- **Rep:** target ₹10,00,000, achieved ₹12,00,000.

| Step | Result |
|---|---|
| Attainment | 12000 bps (120 %) |
| Minimum gate | passes |
| Slab | "100 %+" |
| Gross | 3 % × 12,00,000 = ₹36,000 |
| + Bonus | ₹41,000 |
| Cap | ₹41,000 (under ₹50,000) |
| Hold 10 % | ₹4,100 |
| **Payable** | **₹36,900** |

Each payout records a reason:

- `earned`: paid normally
- `capped`: paid, but limited by `payoutCap`
- `below_minimum`: attainment under `minAttainmentBps`
- `no_matching_slab`: attainment fell between bands
- `no_attainment`: the target was 0

**Lifecycle**

1. A manager creates a plan and its slabs. The database rejects overlapping slabs.
2. **Compute** (`POST /incentives/compute`) creates or refreshes **draft**
   payouts for every active member. **Approved and paid payouts are never
   recalculated.**
3. **Approve** (`POST /incentives/payouts/:id/approve`) only works on a draft.
4. **Pay** (`POST /incentives/payouts/:id/pay`) only works on an approved payout.
5. A plan with approved or paid payouts can't be deleted. Archive it instead.

**What the mobile app covers today**

- The report screen shows the earned, achievement, won orders and completion
  cards, the payable / on-hold / paid amounts, a status filter and the member
  table.
- The plans screen lists plans and has a *Compute period* button.
- These have **no UI yet**, so use the API (§5):
  - creating or editing plans and slabs
  - approving and paying payouts
  - the per-rep *My incentive* view (`GET /incentives/me`)

> The seed creates **no incentive plans**. Create one with the API (§5) before
> the report shows anything.

### 4.3 Follow-up Calendar (`GET /follow-ups/calendar?month=YYYY-MM`)

- It always returns a 6-week grid (42 days, Sunday first), so the calendar is
  the same height every month.
- Each day carries **counts** (overdue / due / completed / cancelled) and a
  `band`, which is the most urgent status present and sets the badge colour.
- Tapping a day loads that day's agenda separately.
- Each agenda item has a **call** button. It logs the call through the comms
  API, then opens the dialer.
- Admins can switch to another member's calendar.

### 4.4 Founder KPI grid (`GET /dashboard/kpis`)

The grid shows six tiles:

- Today's Follow-ups
- MTD Billing
- Target Achieved
- Active Leads
- Pending Quotations
- Won This Month

Each tile carries its own format (`count` / `money` / `percent`), a one-line
detail and, where possible, the change against the previous period.

---

## 5. Try incentives end to end with curl

These examples log in as **Ananya Das** (`tenant.admin`) and use `jq`.

```bash
API=http://localhost:3000/api/v1
DEVICE=readme-demo-device

# Log in
LOGIN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"ananya.das@intraleads.local\",\"password\":\"IntraLeads1!\",\"deviceId\":\"$DEVICE\"}")
TOKEN=$(echo "$LOGIN" | jq -r '.data.accessToken')
TENANT=$(echo "$LOGIN" | jq -r '.data.tenantId')
H=(-H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: $TENANT" -H "X-Device-Id: $DEVICE" -H 'Content-Type: application/json')

# All money is PAISE (₹ × 100): payoutCap, amount, perUnitAmount, bonusAmount.

# 1. Create an active monthly revenue plan: minimum 80 %, hold 10 %, cap ₹50,000
PLAN=$(curl -s -X POST $API/incentives/plans "${H[@]}" -d '{
  "name": "Revenue Q3 demo", "metricCode": "revenue", "periodType": "monthly",
  "basis": "revenue", "status": "active", "holdBps": 1000,
  "minAttainmentBps": 8000, "payoutCap": 5000000, "effectiveFrom": "2026-07-01"
}' | jq -r '.data.id')

# 2. Add two slabs: 2 % from 80 %, then 3 % + ₹5,000 bonus from 100 %
curl -s -X POST $API/incentives/plans/$PLAN/slabs "${H[@]}" \
  -d '{"label":"80–100%","fromBps":8000,"toBps":10000,"payoutKind":"percent","rateBps":200}'
curl -s -X POST $API/incentives/plans/$PLAN/slabs "${H[@]}" \
  -d '{"label":"100%+","fromBps":10000,"payoutKind":"percent","rateBps":300,"bonusAmount":500000}'

# 3. Compute August 2026 (the month the seeded targets cover)
curl -s -X POST $API/incentives/compute "${H[@]}" \
  -d "{\"planId\":\"$PLAN\",\"periodStart\":\"2026-08-01\",\"periodEnd\":\"2026-08-31\"}" | jq

# 4. See the result. The same data appears on the Incentive Report in the app.
curl -s "$API/reports/incentives?planId=$PLAN" "${H[@]}" | jq '.data.totals'
```

To approve and pay a payout, take an `id` from the report rows:

```bash
curl -s -X POST $API/incentives/payouts/<payoutId>/approve "${H[@]}" -d '{}'
curl -s -X POST $API/incentives/payouts/<payoutId>/pay     "${H[@]}" -d '{}'
```

All request fields are documented in Swagger: <http://localhost:3000/api/docs>.

---

## 6. Code map

| Layer | Backend (`apps/api/src/modules`) | Mobile (`apps/mobile/lib/features`) |
|---|---|---|
| Incentives | `incentives/` (engine, service, controller), `reporting/…/incentive-report.controller.ts` | `incentives/` (report page, plan list page) |
| Sales board | `targets/domain/sales-board.ts`, `targets.service.ts` | `targets/presentation/sales_target_page.dart`, `widgets/sales_gauge.dart`, `widgets/sales_podium.dart` |
| Calendar | `tasks/domain/follow-up-calendar.ts` | `follow_ups/presentation/follow_up_calendar_page.dart` |
| KPIs | `dashboard/domain/dashboard-metrics.ts` | `dashboard/presentation/widgets/founder_kpi_grid.dart` |
| SQL + grants | `docs/data/sql/intra_leads_incentives.sql` | — |
| Tests | `*.spec.ts` beside each domain file, `new-features-coverage.spec.ts` | `test/features/{targets,incentives,follow_ups}/` |
