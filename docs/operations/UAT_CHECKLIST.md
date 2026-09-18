# UAT Checklist

Sign off on **staging** (prod-like, synthetic or anonymized data) before a `v*` production tag. UAT is not a substitute for CI; it proves the product journeys on the deployed stack.

Environment: staging ALB / Flutter staging flavor  
Build: API SHA `________`  Mobile build `________`  
UAT tenants: A `________`  B `________`  
Testers: founder, manager, executive, (optional) billing operator

## Entry criteria

- [ ] Staging deploy checklist complete and smoke green
- [ ] Seed/RBAC roles present (`tenant.founder` and product roles from `intra_leads_seed_rbac.sql` / `intra_leads_rbac_product_roles.sql`)
- [ ] Catalog defaults exist (pipeline stages, sources, qualities, warranty periods)
- [ ] Test devices are not rooted/jailbroken (staging client refuses compromised devices)
- [ ] Known defects listed with severity; no open Sev-1

## Identity, session, tenancy

- [ ] Login with password; access token is short-lived; refresh rotates
- [ ] Logout revokes the session; reuse of the old refresh fails
- [ ] Forgot/reset password (staging echo OTP only if `AUTH_ECHO_OTP` is on — never in prod)
- [ ] Device binding: change `X-Device-Id` mid-session → `DEVICE_MISMATCH`
- [ ] Switch tenant (if the user has two memberships); lists never mix tenant A and B rows
- [ ] User with `lead:read` cannot delete a lead (`FORBIDDEN`)
- [ ] Missing `X-Tenant-Id` on `/api/v1/leads` → `TENANT_REQUIRED`

## Lead workspace

- [ ] Create lead with customer name, phone E.164, source, quality
- [ ] Duplicate submit with the same idempotency key does not create a second lead
- [ ] List, search (name / phone / quotation number), open detail
- [ ] Update lead; If-Match / version conflict returns a conflict, not a silent overwrite
- [ ] Assign to a membership; assignee sees it; previous owner no longer in “my leads” if scoped that way
- [ ] Change pipeline stage; board and analytics reflect the move
- [ ] Soft-delete hides the lead from lists; other-tenant id still 404

## Follow-ups, visits, quotations

- [ ] Create, reschedule, complete, and cancel a follow-up
- [ ] Overdue / due-today engine produces an inbox or push event on staging
- [ ] Schedule a site visit; check-in / check-out; add a photo; complete; cancel / no-show
- [ ] Create quotation with line items; send; change status through the allowed path; schedule quotation follow-up
- [ ] Won quotation does not leak to tenant B

## Warranties, catalog, targets

- [ ] Issue a warranty card; public verify token page/PDF/QR works without CRM auth
- [ ] Catalog: create/update product, category, warranty period, lead status; in-use delete is rejected (`CONFLICT`)
- [ ] Create a team target and a membership target; progress moves after a won quote or completed visit (as designed for that metric)

## Communications, billing, files

- [ ] Device-mode call/SMS/WhatsApp returns a launch URI (or bridged send if Twilio/Meta are configured on staging)
- [ ] Billing snapshot / customer+invoice sync in **manual** mode succeeds; HTTP gateway failures stay local and are logged
- [ ] Site-visit photo upload stays under `tenants/{tenantId}/...` and is not publicly listable

## Mobile / sync

- [ ] Cold start login and restore session with biometric (if enabled)
- [ ] Airplane mode: create/update lead in outbox; reconnect syncs without duplicates
- [ ] Conflict UX when the same record changed on another device
- [ ] Push notification for lead assigned (FCM configured on staging)
- [ ] Certificate pinning: staging/prod builds reject a broken TLS intercept

## Reporting and RBAC admin

- [ ] Dashboard widgets load for founder; executive sees only permitted scope
- [ ] Export (if enabled) is async, rate-limited, and audited
- [ ] Custom role: grant `lead:read` only; confirm write APIs fail
- [ ] Deactivate a membership; that user cannot keep calling tenant APIs

## Non-functional

- [ ] Lead list (20 rows) feels within the 300 ms API budget on staging
- [ ] Load script `npm run test:load` still passes in CI for health / list / assign / sync
- [ ] No PII (phone, email, tokens) in CloudWatch log samples
- [ ] Rate limit: burst login returns `429` with `Retry-After`

## Exit criteria

- [ ] All Sev-1/Sev-2 UAT bugs closed or waived in writing
- [ ] Isolation cases (tenant B) signed by a second tester
- [ ] Product owner accepts the staging build for a production tag
- [ ] Go-live owner has the rollback and DR docs printed/open

| Journey | Tester | Pass / Fail | Notes |
| --- | --- | --- | --- |
| Auth + tenant | | | |
| Lead lifecycle | | | |
| Quote + warranty | | | |
| Mobile offline | | | |
| Isolation | | | |

Signed: ________________  Date (UTC): ________________
