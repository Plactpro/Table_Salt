# Table Salt — Security and Architecture Audit: Final Report

**Audit Date:** 2026-04-15
**Auditor:** Claude (Automated Static Analysis)
**Branch:** `audit/overnight-review` (HEAD: d58ce4a)
**Methodology:** 10-phase static analysis, read-only, no network access, no application execution

---

## a) EXECUTIVE SUMMARY

### Scope

This audit covered the complete Table Salt codebase: 179 database tables, ~904 API endpoints, 73 WebSocket events, 20 background jobs, 8 external integrations, 33 service files, 48 router files, and the React frontend. Every file in `server/`, `client/src/`, and `shared/` was read. No code was modified.

### Overall Posture

Table Salt is a feature-rich, ambitious restaurant management SaaS that has achieved impressive functional coverage — POS, KDS, multi-outlet franchise management, delivery integration, inventory, workforce, and parking — in a relatively short development timeline. The core POS order-creation flow is well-engineered with server-side price validation, idempotency keys, and optimistic locking. However, the application has critical security gaps that must be resolved before it can safely operate as a multi-tenant production system. The most severe issues are compromised cryptographic keys in git history, cross-tenant data access vulnerabilities in the storage layer, and bill totals trusted from the client without server-side verification.

### Top 5 Things That Matter Most

1. **Compromised secrets in git history.** The ENCRYPTION_KEY (used to encrypt all user PII) and VAPID private key are committed to the repository. Session cookies for owner/manager/kitchen roles are also in git history and may still be valid. These must be rotated immediately.

2. **Tenant isolation has systemic gaps.** 24 storage functions query by primary key without tenant_id in the WHERE clause. Five endpoints use a spoofable `x-tenant-id` header or `?tenantId=` parameter. The WebSocket and KDS wall-ticket endpoints expose full operational data to any party with a tenant UUID.

3. **Bill creation trusts the client.** `POST /api/restaurant-bills` accepts subtotal, tax, discount, and total directly from the frontend with no server-side recalculation. This enables tax evasion and arbitrary bill manipulation. Order creation correctly recalculates server-side, but the bill path does not.

4. **No distributed job coordination.** All 20 background jobs run in-process on every server instance. In a multi-instance deployment, owners receive duplicate emails, duplicate alert rows are inserted, and duplicate WebSocket events fire. Only 1 of 13 schedulers has DB-level idempotency.

5. **No CI/CD or automated quality gates.** There is no CI pipeline, no linting, no pre-commit hooks, no SAST/DAST scanning, and no `npm audit`. Code goes directly from development to production with no automated verification.

### Launch Readiness

**Single-currency UAE or India (one outlet per tenant):** Launchable after resolving the Critical and High-severity findings in Weeks 1-2 of the remediation plan. The core POS flow is functional and the server-side price validation is sound. Tax compliance gaps (UAE invoice numbering, India IGST) must be addressed for regulatory compliance.

**Global multi-currency (multi-outlet franchise):** Not ready. The currency architecture has a fundamental gap — neither orders nor bills store a currency column. All dashboards and reports SUM monetary values across outlets without currency grouping. Multi-currency operation requires schema changes, a currency-per-row migration, and reporting refactors. Estimated 4-8 weeks of focused work.

---

## b) ARCHITECTURAL ROOT CAUSES

Six root causes drive the majority of the 225 findings:

### Root Cause 1: Storage Layer Lacks Tenant Scoping (drives ~50 findings)

**What:** 24 functions in `server/storage.ts` accept only a resource ID without `tenant_id` in the WHERE clause. Every IDOR, every cross-tenant data access, and every defense-in-depth gap traces to this.

**Fix pattern:** Add `tenantId` as a mandatory parameter to every storage function. Add it to every WHERE clause. Create a middleware that attaches `tenantId` to a request-scoped context so it's always available.

**Effort:** 3-5 days (mechanical refactor with grep-and-replace, plus regression testing).

### Root Cause 2: No Transaction Wrapping on Multi-Table Operations (drives ~15 findings)

**What:** Registration, order creation, payment recording, bill creation, void, and refund flows each perform 3-6 sequential DB writes without a wrapping transaction. A crash between writes produces orphan records, inconsistent state, or lost data.

**Fix pattern:** Wrap each multi-write flow in a Drizzle `db.transaction()` or raw `BEGIN/COMMIT`. The recipe-inventory deduction module (`deduct-recipe-inventory.ts`) already demonstrates the correct pattern with `SELECT FOR UPDATE`.

**Effort:** 2-3 days per major flow (order, bill, payment, registration).

### Root Cause 3: Bill Totals Trusted From Client (drives ~8 findings)

**What:** `POST /api/restaurant-bills` accepts all monetary values from `req.body` without recalculating from the referenced order. The order creation path correctly recalculates server-side — the bill path should do the same.

**Fix pattern:** In the bill creation handler, fetch the order, iterate its items, recalculate subtotal/discount/tax/service-charge/total server-side, and use those values. Reject requests where client values diverge by more than a rounding tolerance.

**Effort:** 1-2 days.

### Root Cause 4: In-Process Schedulers Without Distributed Coordination (drives ~20 findings)

**What:** All 20 background jobs use `setInterval` or `node-cron` in the main process. No leader election, no distributed locks, no job queue. Multi-instance = duplicate everything.

**Fix pattern:** Adopt `pg-boss` (PostgreSQL-backed job queue, already available since PG is the DB). Register each job once; pg-boss handles single-execution guarantees, retry, and dead-letter queues. Alternatively, add `pg_advisory_lock` to each scheduler's entry point (the wastage summary already does this correctly).

**Effort:** 3-5 days for pg-boss adoption; 1 day for advisory-lock stopgap.

### Root Cause 5: No Currency Column on Transactional Tables (drives ~15 findings)

**What:** `orders`, `bills`, `billPayments`, `purchaseOrders`, and `inventoryItems` have no currency column. Currency is derived from the tenant/outlet at display time. If a tenant changes currency or operates outlets in different currencies, all historical records become ambiguous and all SUM aggregations silently cross currencies.

**Fix pattern:** Add `currency_code` column to `orders`, `bills`, and `billPayments`. Populate from the outlet's currency at creation time. Add currency grouping to all report/dashboard queries.

**Effort:** 2-3 days for schema + migration; 3-5 days for report/dashboard refactors.

### Root Cause 6: Secrets and Credentials in Version Control (drives ~10 findings)

**What:** ENCRYPTION_KEY, VAPID keys, and session cookies committed to git. Razorpay credentials stored as plaintext in the tenants table. TOTP secrets and recovery codes unencrypted.

**Fix pattern:** Rotate all compromised keys. Add `.env`, `.auth/`, `.replit` to `.dockerignore`. Encrypt Razorpay credentials and TOTP secrets using the existing AES-256-GCM encryption module. Consider using `git filter-branch` or BFG to remove secrets from history.

**Effort:** 1 day for rotation; 2-3 days for encryption of stored credentials.

---

## c) ROTATE IMMEDIATELY

| Secret | File | Commit | Confirmed Live? | How to Rotate |
|--------|------|--------|-----------------|---------------|
| `ENCRYPTION_KEY` | `.replit:54` | e523dfa | Likely (used for all PII encryption) | Generate new key with `openssl rand -hex 32`. Set in production env vars. Run `scripts/encrypt-existing-pii.ts` to re-encrypt all user email/phone fields with the new key. |
| `VAPID_PRIVATE_KEY` | `.replit:56` | 280047f | Likely (used for push notifications) | Generate new VAPID keypair with `web-push generate-vapid-keys`. Update env vars. All existing push subscriptions will become invalid — subscribers must re-subscribe. |
| `SESSION_SECRET` | Not in repo, but `.auth/` cookies signed with it | 12fc00b | If unchanged since `.auth/` commit, cookies are valid until ~2026-04-20 | Generate new secret with `openssl rand -hex 32`. Update env var. All active sessions will be invalidated — all users must re-login. |
| Razorpay API keys | `tenants.razorpayKeyId/Secret` (plaintext in DB) | N/A | If any tenant has configured Razorpay | Encrypt with AES-256-GCM using the (rotated) ENCRYPTION_KEY before storage. Decrypt on read. |
| Stripe secret key | `platform_settings.stripe_key_secret` (in DB) | If Stripe is configured | Regenerate in Stripe Dashboard. Update env var and/or DB. |

---

## d) CRITICAL FINDINGS (15)

| ID | Title | Impact | Exploit |
|----|-------|--------|---------|
| F-001 | ENCRYPTION_KEY in git | All encrypted PII (emails, phones) decryptable by anyone with repo access | Clone repo, extract key from `.replit`, decrypt any `enc:...` value |
| F-217 | Same key in git history | Even if removed from HEAD, recoverable from any historical clone | `git log -p -S "ENCRYPTION_KEY"` |
| F-022 | Registration has no transaction | Orphan tenants with no owner on partial failure | Trigger timeout mid-registration |
| F-023 | Owner can self-set plan | Billing bypass — owner PATCHes `plan: "enterprise"` | `PATCH /api/tenant {plan:"enterprise"}` |
| F-031/F-066 | Transfer-table no tenant_id | Cross-tenant order access | `PATCH /api/orders/:id/transfer-table` with another tenant's order ID |
| F-032/F-067 | Merge-tables no tenant_id | Cross-tenant order mutation | `POST /api/orders/merge-tables` with cross-tenant order IDs |
| F-033/F-068 | Split-bill no tenant_id | Cross-tenant data read | `POST /api/orders/:id/split-bill` with cross-tenant order ID |
| F-034 | Coordination status no locking | Silent data corruption — any status set without version check or state machine | `PATCH /api/orders/:id/status {status:"paid"}` bypasses payment |
| F-069 | Loyalty endpoints use `x-tenant-id` header | Full cross-tenant loyalty CRUD | Set `x-tenant-id` header to any tenant UUID |
| F-131 | Circuit breaker reset unauthenticated | DoS — any party can disable all circuit breakers | `POST /api/admin/circuit-breakers/reset` with no cookies |
| F-189 | Aggregator webhook never validates signature | Unauthenticated order injection into any tenant | `POST /api/aggregator/webhook/zomato` with crafted payload |
| F-191 | No distributed job coordination | Duplicate emails, alerts, and DB rows on every tick in multi-instance | Scale to 2+ instances on Replit autoscale |

*Note: F-031/F-066, F-032/F-067, F-033/F-068 are duplicate IDs for the same findings identified in Phase 2 and Phase 3 respectively. Counted once each.*

---

## e) HIGH FINDINGS SUMMARY (66)

**Secrets/Crypto (10):** F-002 (VAPID in repo), F-003/004/005 (session cookies in repo), F-012 (Razorpay plaintext in DB), F-156 (TOTP secrets plaintext), F-157 (recovery codes plaintext), F-218 (cookies in git history), F-219 (.dockerignore gaps), F-222 (demo123 logged)

**Multi-Tenancy/IDOR (18):** F-055/F-136 (WS/HTTP tenantId bypass), F-070/071 (menu category IDOR), F-072-076 (storage layer IDOR), F-087-090 (service layer missing tenant_id), F-190 (aggregator LIMIT 1), F-192 (100-tenant cap)

**Auth/AuthZ (12):** F-011 (CB reset no auth), F-024 (no password policy at registration), F-025 (onboarding no role check), F-026 (demo123 default + email), F-132 (prep endpoints no auth), F-145 (PIN brute-force), F-158 (password change no session invalidation), F-211 (subscription gating frontend-only)

**Money/Billing (12):** F-042/F-121 (bill trusts client), F-103 (no Razorpay reconciliation), F-107/F-112-114/F-116 (cross-currency aggregation), F-117-118 (schema precision gaps), F-120 (GST defaults inconsistent), F-213 (loyalty discount client-only)

**Atomicity/Race Conditions (6):** F-035 (order creation), F-036 (concurrent table), F-037 (stock deduction), F-043 (payment), F-044 (Razorpay double-finalize), F-038 (fire-and-forget inventory)

**Compliance (4):** F-046 (no IGST), F-059 (no UAE invoice number), F-060 (no TRN on receipts), F-045 (Razorpay timing-unsafe HMAC)

**Reliability/KOT (6):** F-166 (WS no connection limits), F-167 (KOT print delayed), F-168 (KOT crash recovery), F-169 (print jobs abandoned), F-187 (SMS no rate limit), F-193-194 (duplicate emails)

**Process (3):** F-027 (no email_hash unique), F-220 (no CI/CD), F-221 (PII in query logs)

---

## f) MEDIUM / LOW / INFO

| Severity | Count | Top Categories |
|----------|-------|---------------|
| Medium | 108 | IDOR/tenant gaps (15), money/rounding (18), auth/session (16), reliability (12), config (10), compliance (6), XSS (4), race conditions (8), others (19) |
| Low | 26 | Config (8), auth (4), KOT (4), dead code (3), crypto (3), accessibility (1), others (3) |
| Info | 10 | Positive findings (2), dead code (3), config notes (5) |

Full details in `audit/FINDINGS.md` (231 line items).

---

## g) FRAMEWORK MAPPING

### Tenant Isolation
- 172/179 tables have `tenant_id`. 7 global tables are appropriately access-controlled.
- 24 storage functions lack `tenant_id` in WHERE — systemic defense-in-depth failure.
- 5 spoofable tenant_id sources: `x-tenant-id` header, `?tenantId=` WS, `?tenantId=` HTTP, `req.body.tenantId`, wall screen token.
- S3 paths not tenant-prefixed. Redis channels correctly prefixed.

### Multi-Currency and Money
- All monetary DB columns use `decimal` (no floats). Core arithmetic uses `Math.round(x*100)/100` consistently.
- Neither `orders` nor `bills` store currency. 15+ report queries SUM across currencies.
- 14 monetary columns lack precision/scale. 3 store money as `text`.
- Gateway conversion assumes centesimal currencies (`*100`). Static exchange rates hardcoded.

### Authentication and Authorization
- Password hashing: scrypt (strong). PIN hashing: bcrypt (adequate). Reset tokens: 256-bit + SHA-256 (excellent).
- Session: PG-backed, httpOnly, secure, sameSite lax, 30-day TTL, idle timeout.
- Gaps: no password policy at registration, no email verification, no CAPTCHA, PIN brute-forceable, TOTP optional, password change doesn't invalidate sessions.
- 16 roles, 35 permissions. `requirePermission()` rarely used — most routes use `requireRole()`.

### API Security
- CSRF: HMAC double-submit cookie with 11 justified exemptions.
- Rate limiting: auth (15/15min), API (120/min), upload (10/min). PIN login and forgot-password not covered by auth limiter.
- Helmet: CSP enforcing (but allows unsafe-inline/unsafe-eval), HSTS, referrer policy, permissions policy.
- ~40 unauthenticated endpoints. Most justified; 5-8 should require auth.

### Real-Time Layer
- WebSocket: session cookie auth (good), heartbeat (good), tenant-scoped rooms (good).
- Gaps: `?tenantId=` backdoor, no role-based event filtering, no connection limits, no offline delivery, no dedup.
- KOT: print delayed on creation path, 3-retry limit then abandoned, no crash recovery.

### Background Jobs and Integrations
- 20 jobs, all in-process. No job queue, no leader election, no distributed locks.
- Stripe: well-implemented (SDK signature verification, managed webhook).
- Razorpay: timing-unsafe HMAC, no amount reconciliation, global webhook secret.
- Email: silent failure, no retry. SMS: likely broken (regex bug + SQL bug).
- Aggregator webhooks: signature headers read but never validated.

### Infrastructure and Operations
- Docker: multi-stage, non-root, health check. `.dockerignore` incomplete.
- No CI/CD, no linting, no SAST/DAST, no dependency scanning.
- No APM, no metrics, no external error tracking, no alerting.
- No database backup automation. No documented DR procedure.

### Compliance
- **GDPR/DPDP:** PII encryption exists (AES-256-GCM) but TOTP secrets and Razorpay keys are plaintext. GDPR endpoints exist (export, delete, anonymize). Consent logging present. Retention cleanup runs. `salesInquiries` PII accumulates without cleanup.
- **UAE FTA:** No sequential invoice numbers. No TRN on receipts. No e-invoicing.
- **India GST:** CGST/SGST split implemented. No IGST. No HSN codes on invoices. No e-way bill integration. GST rate defaults inconsistent between order and bill paths.
- **PCI:** No card data stored locally (delegated to Stripe/Razorpay). Razorpay credentials stored plaintext in DB.

---

## h) FRAMEWORK GAPS

Things a global multi-tenant multi-currency SaaS needs that were not found:

1. **Row-level security (RLS) or tenant-scoping middleware** — no DB-level or middleware-level tenant enforcement
2. **Currency-per-transaction** — no currency column on orders/bills
3. **Server-side subscription enforcement** — plan gating is frontend-only
4. **Distributed job queue** — no pg-boss, BullMQ, or equivalent
5. **APM and error tracking** — no Sentry, Datadog, or equivalent
6. **Database migration versioning** — inline `ALTER TABLE` in `index.ts` rather than versioned migration files
7. **Rate limiting on sensitive non-auth endpoints** — PIN login, forgot-password, SMS sends
8. **Webhook idempotency** — Stripe managed by library, Razorpay has TOCTOU race
9. **Audit log immutability enforcement beyond startup assertion** — no DB triggers or policies
10. **Data residency / region-aware storage** — no configuration for keeping data in-region
11. **Automated penetration testing** — no DAST in pipeline
12. **Runbook / incident response documentation** — no ops documentation found

---

## i) PRIORITIZED REMEDIATION PLAN

### Week 1: Stop the Bleeding

| Priority | Action | Findings | Effort |
|----------|--------|----------|--------|
| 1 | **Rotate ENCRYPTION_KEY** — generate new key, re-encrypt all PII | F-001, F-217 | 2 hours |
| 2 | **Rotate SESSION_SECRET** — invalidates all sessions, forces re-login | F-003-005, F-218 | 30 min |
| 3 | **Rotate VAPID keys** — existing push subscriptions invalidated | F-002, F-217 | 30 min |
| 4 | **Add auth to circuit breaker reset** — either delete the `index.ts:212` route or add `requireSuperAdmin` | F-131 | 15 min |
| 5 | **Fix aggregator webhook** — implement actual HMAC validation | F-189 | 2 hours |
| 6 | **Fix loyalty `x-tenant-id` header** — replace with `req.user.tenantId` | F-069 | 30 min |
| 7 | **Remove `?tenantId=` WebSocket path** — require auth or valid token | F-055, F-016 | 1 hour |
| 8 | **Add auth to KDS wall-tickets** — require wall screen token, not bare tenantId | F-136 | 1 hour |
| 9 | **Fix PATCH /api/tenant** — exclude `plan` from allowed fields | F-023 | 15 min |
| 10 | **Update `.dockerignore`** — add `.env`, `.auth/`, `.replit` | F-219 | 5 min |

### Weeks 2-4: Foundational Refactors

| Priority | Action | Root Cause | Effort |
|----------|--------|-----------|--------|
| 1 | **Add tenant_id to all storage functions** — systematic refactor of `server/storage.ts` | RC-1 | 3-5 days |
| 2 | **Server-side bill recalculation** — fetch order, recompute totals in bill creation | RC-3 | 1-2 days |
| 3 | **Wrap critical flows in transactions** — registration, order creation, payment, void | RC-2 | 3-5 days |
| 4 | **Add pg_advisory_lock to all schedulers** — stopgap until pg-boss adoption | RC-4 | 1 day |
| 5 | **Encrypt TOTP secrets and recovery codes** — use existing AES-256-GCM module | F-156, F-157 | 1 day |
| 6 | **Encrypt Razorpay credentials in tenants table** | F-012 | 1 day |
| 7 | **Add auth limiter to PIN login and forgot-password** | F-145, F-146 | 1 hour |
| 8 | **Enforce password policy at registration** — call `validatePasswordPolicy` | F-024 | 15 min |
| 9 | **Remove default "demo123" password** — require explicit password on staff creation | F-026 | 30 min |
| 10 | **Add status transition state machine** to order PATCH and coordination endpoints | F-034, F-041 | 2 days |

### Month 2: Hardening

| Action | Findings | Effort |
|--------|----------|--------|
| Set up CI/CD pipeline with lint + test + `npm audit` | F-220 | 2-3 days |
| Add Sentry or equivalent error tracking | F-227 | 1 day |
| Implement database backup automation | F-228 | 1 day |
| Add KOT crash recovery (startup reconciliation job) | F-168, F-169 | 2 days |
| Call `routeAndPrint()` on direct order creation | F-167 | 1 hour |
| Invalidate sessions on password change | F-158 | 1 hour |
| Add WebSocket connection limits | F-166 | 1 day |
| Use `crypto.timingSafeEqual` for Razorpay HMAC | F-045 | 15 min |
| Reconcile gateway amounts against local bill totals | F-103, F-105 | 1 day |
| Add server-side subscription plan enforcement middleware | F-211 | 1 day |
| Fix SMS regex bug and logging SQL | F-184, F-186 | 30 min |
| Destroy session on logout (`req.session.destroy()`) | F-160 | 15 min |
| Clear localStorage on logout | F-212 | 30 min |

### Month 3: Global Readiness

| Action | Findings | Effort |
|--------|----------|--------|
| Add `currency_code` column to orders, bills, billPayments | RC-5 | 3-5 days |
| Refactor all report/dashboard queries to group by currency | F-107, F-112-116 | 3-5 days |
| Implement UAE FTA invoice numbering + TRN | F-059, F-060 | 2-3 days |
| Implement IGST for inter-state India GST | F-046 | 2-3 days |
| Add HSN codes to invoice line items | F-062 | 1 day |
| Add precision/scale to all 14 untyped numeric columns | F-117 | 1 day |
| Fix non-centesimal currency conversion (`* 10^decimals`) | F-106 | 1 day |
| Adopt pg-boss for distributed job execution | RC-4 | 3-5 days |
| Add denomination/rounding configs for all 24 currencies | F-125 | 1 day |
| Scope localStorage by user+tenant | F-214 | 1 day |

---

## j) OPEN QUESTIONS THAT STILL MATTER

These questions must be answered by the engineering team before or during remediation:

| ID | Question | Why It Matters |
|----|----------|---------------|
| Q-003/Q-079 | Has the ENCRYPTION_KEY been rotated since it was committed to git? | If not, all encrypted user PII is compromised. |
| Q-006/Q-078 | Has the SESSION_SECRET been rotated since .auth/ cookies were committed? | If not, owner/manager/kitchen session cookies in git history are valid until ~2026-04-20. |
| Q-064/Q-045 | How many server instances are running in production? | If >1, all duplicate-work findings are active bugs right now (duplicate emails, alerts, WS events). |
| Q-065 | What is the current active tenant count? | If >100, coordination rules are silently broken for excess tenants. |
| Q-077 | Is deployment on Replit (autoscale) or Railway? | All evidence points to Replit. This determines the infrastructure assumptions. |
| Q-068 | Is REDIS_URL set in production? | If not, rate limiting and lockout are per-instance only. |
| Q-074 | Does any server middleware enforce subscription plan? | If not, all premium/enterprise features are accessible to every tenant via API. |
| Q-080 | Are database backups managed by the hosting provider? | If not, there is zero backup and a DB corruption is unrecoverable. |
| Q-059 | Has SMS ever worked in production? | The regex bug and SQL bug both fail silently — SMS may have never been sent. |
| Q-022 | Are UAE restaurants required to produce FTA-compliant invoices? | If yes, F-059/F-060 are compliance blockers. |

---

## k) WHAT'S WORKING WELL

These practices are sound and should be preserved during remediation:

1. **Server-side price recalculation on order creation** (`orders.ts:418-552`) — client prices are never trusted. Prices are resolved from the menu DB, modifiers are recomputed, and promotions are re-evaluated. This is the gold standard for POS security.

2. **Password hashing** — scrypt with 64-byte output, 16-byte random salt, and `crypto.timingSafeEqual` comparison. Stronger than the industry-standard bcrypt.

3. **Session management** — PostgreSQL-backed sessions via `connect-pg-simple`, httpOnly cookies, secure flag in production, SameSite lax, session regeneration on login (Passport 0.7 default).

4. **CSRF protection** — HMAC-SHA256 double-submit cookie with well-chosen exemptions. Deterministic per session, validates on all mutating methods.

5. **Reset token design** — 256-bit random, SHA-256 hashed before storage, single-use, 1-hour expiry, no account enumeration in response, host-header poisoning prevented via `APP_URL` env var.

6. **PII encryption** — AES-256-GCM with random IVs, scrypt key derivation, authenticated encryption. The module is well-implemented; it just needs to be applied to more fields (TOTP secrets, Razorpay keys).

7. **Idempotency on order and payment creation** — atomic `INSERT ... ON CONFLICT DO NOTHING` claim pattern with retry-poll and cleanup on failure. The idempotency implementation is production-grade.

8. **Optimistic locking on orders** — `version` column with mandatory version check on the main order PATCH endpoint. Concurrent modification is properly detected (though not applied to all paths).

9. **Audit trail protection** — startup assertion verifies no DELETE/PUT/PATCH routes exist for audit endpoints. Audit events are append-only by design and enforced at boot.

10. **Impersonation controls** — read-only default, dual-step edit unlock with reason logging, tenant opt-out, full audit trail with IP, 30-minute session timeout, tenant access log visibility.

11. **Recipe inventory deduction** (`deduct-recipe-inventory.ts`) — proper `SELECT FOR UPDATE` row locking, manual transaction with `BEGIN/COMMIT/ROLLBACK`, idempotency guard. This is the pattern all stock operations should follow.

12. **Dockerfile** — multi-stage build, non-root user, no secrets at build time, health check configured. A solid container foundation.

13. **Webhook security (Stripe)** — uses the Stripe SDK's `constructEvent()` for timing-safe signature verification. The Stripe integration is the best-implemented external integration.

14. **Trial warning scheduler** — the only background job with DB-level idempotency via `trial_warning_sent_7d/3d/1d` flags. This is the pattern all schedulers should follow.

15. **Service worker** — correctly excludes `/api/` and `/ws` from caching. No sensitive data cached. Clean implementation.

---

*End of report. Full finding details in `audit/FINDINGS.md` (231 items). Full open questions in `audit/OPEN-QUESTIONS.md` (82 items). Per-phase deep-dives in `audit/00-repo-map.md` through `audit/09-infra-deploy.md`.*
