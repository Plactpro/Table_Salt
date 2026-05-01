# Table Salt — Launch Checklist

**Date:** 2026-04-30 PM
**Branch:** main, HEAD `1a9e30c`

## Goal of this doc

Single-page snapshot of where Table Salt stands against the eight categories that gate a real first-paying-tenant launch — what's done, what's in flight, what hasn't started, the critical gaps not yet addressed, and the next three items I'd pick up.

---

## Categories

### 1. Legal & compliance

- **DONE**
  - ToS consent captured at registration with IP, user-agent, and document version into `consent_log` (audit/05-auth.md §1).
  - GDPR data-export and account-delete flows wired (per replit.md project overview; F-001/F-002 secrets audit confirms PII paths exist).
  - Audit-event ledger with 24-month retention via `retention-cleanup.ts` (audit/09-infra-deploy.md §7).
- **IN PROGRESS**
  - PII encryption migration (`DELIVERY_PII_FIELDS` covers `customerPhone`/`customerAddress` at `server/storage.ts:32`; ENCRYPTION_KEY is itself burned, see Critical Gaps).
- **NOT STARTED**
  - UAE VAT 5% / India GST CGST/SGST/IGST end-to-end correctness review for the regions Table Salt advertises (CLAUDE.md "Domain rules"). Tax-rate code paths exist but no audit phase has signed them off as compliant.
  - Privacy-policy / data-processing-agreement publishing for tenants (no doc found in repo).
  - Data-residency story for UAE / India / global tenants — Railway region selection is implicit, not codified.

### 2. Payment readiness

- **DONE**
  - Stripe subscription-billing webhook with library-verified signatures and server-defined plan prices (audit/04-payment-gateway-monetary.md §1.4).
  - Razorpay payment-link creation with **server-derived amount** (`bill.totalAmount + tipVal` at `restaurant-billing.ts:1079`).
  - Refund per-payment cap and net-paid cap (`restaurant-billing.ts:820-847`).
- **IN PROGRESS**
  - Currency-render leak cleanup (C9 in `docs/audits/2026-04-22-fix-plan.md`): F15 fixed the data layer 2026-04-09 but `₹` and `$` literals still leak in Ready-to-Pay bill preview and Shift Reconciliation.
- **NOT STARTED**
  - **M2 — UPI not implemented.** Placeholder text "Show UPI QR" only; no QR generation, no payment tracking (`docs/audits/bug-inventory.md` OPEN-MEDIUM).
  - **F-101 / F-106** — Razorpay minor-unit conversion uses `Math.round(amount * 100)` and assumes ×100 for every currency. Wrong for JPY/KRW (no centesimal subunit). Architecturally incorrect for a multi-currency system (audit/04-payment-gateway-monetary.md §1.1, §1.5).
  - **F-103 / F-105** — No webhook amount-vs-bill reconciliation on Razorpay or Stripe checkout. A mismatched amount is recorded as-is and the bill is marked paid.
  - **F-189-FU2** — Razorpay HMAC uses `===` not `crypto.timingSafeEqual` (timing attack on signature verification). Tracked in `audit/00-backlog.md` FOLLOW-UP.
  - **C3 — Takeaway double-pay** (`docs/audits/2026-04-22-fix-plan.md`). Tester reported the payment modal re-opens after a successful payment. Highest single-customer-damage risk.
  - Per-tenant currency boundary enforcement in reports — F-107..F-114 sum `orders.total` across outlets without `outlet_id` filter or currency grouping (audit/04-payment-gateway-monetary.md §2).

### 3. Authentication & security

- **DONE**
  - scrypt password hashing with per-password salt + `timingSafeEqual` (audit/05-auth.md §5).
  - Passport 0.7 session regeneration on login (fixation protected) + session-token rotation per login.
  - PIN flow with bcrypt(10), 90-day expiry, weak-PIN rejection, dual-auth for change.
  - TOTP setup + recovery codes (single-use) + audit logging.
  - In-memory lockout (5 attempts / 15 min / username) on password and PIN paths.
  - CSRF middleware on most write endpoints.
- **IN PROGRESS**
  - **C5 — three CSRF-failing write endpoints** (Valet Log Key Action, Add Staff to Shift, Request Leave) per `docs/audits/2026-04-22-fix-plan.md`. Recon would size in <1 hr.
- **NOT STARTED**
  - **Password policy NOT enforced at registration.** `validatePasswordPolicy` is imported but never called in `POST /api/auth/register` (audit/05-auth.md §1, §5). Users can register with `"a"`.
  - **No email verification.** Welcome email only — no proof of email ownership (§1).
  - **No CAPTCHA** on any auth endpoint.
  - **PIN login bypasses TOTP** (F-155 at audit/05-auth.md §3) — TOTP-enrolled cashier/waiter is not 2FA-protected on the PIN route.
  - **TOTP secret + recovery codes stored plaintext** in `users.totp_secret` and `users.recovery_codes` (F-156, F-157, audit/05-auth.md §4).
  - **In-memory lockout does not survive restart** and is **not shared across instances** (F-017). Second app instance = lockout reset.
  - **User enumeration via login-flow message divergence** (F-153) and **userId leak in 2FA prompt** (F-154).
  - 2FA enforcement option for owner/manager/admin roles — currently entirely opt-in.

### 4. Multi-tenant isolation

- **DONE**
  - Tenant guard pattern is in place — the M6 incident message (`[TENANT_GUARD] getOrderItemsByOrder called without a valid tenantId`) is itself proof a guard fired correctly (`docs/audits/2026-04-22-fix-plan.md` C2).
  - F4 fix (`a024e11`): public receipt now uses `bill.tenantId` instead of `user.tenantId`.
  - F5 fix (`356c0e2`): `tenantId` added to both `createOrderItem` call sites.
  - X-02 fix (PR #5): bill creation passes `tenantId` to `getOrderItemsByOrder`.
  - WebSocket auth-on-connect plumbing exists (per replit.md "real-time" section).
- **IN PROGRESS**
  - **C2 / M6** — at least one bill-preview path still calls `getOrderItemsByOrder` without `tenantId` and 500s in production. Specific endpoint not yet identified.
  - **M1b — server-side table-claim race.** Client-side guard shipped 2026-04-22; no advisory lock / partial unique index on `(tenant_id, table_id) WHERE status IN ('new','in_progress','ready')`. Two concurrent POSTs still double-book (`docs/audits/bug-inventory.md`).
- **NOT STARTED**
  - **24 storage functions still tenant-unsafe** per `audit/FINAL-REPORT.md` Top-5 finding. Each one is a potential cross-tenant read.
  - **F-023-FU — tenant-fields allowlist test.** No unit test fails when `tenants` table gains a column not explicitly in `OWNER_EDITABLE_FIELDS` (audit/00-backlog.md).
  - **B1d — cross-outlet KDS scoping.** Tickets are tenant-scoped only, not outlet-scoped (`docs/audits/bug-inventory.md` OPEN-LOW). Becomes High-severity the moment a tenant onboards a second outlet.
  - **C8 / A-14 — QR public surface audit pending.** "View Bill shows wrong items" tester report could be tenant-isolation. Recon required before launch (`docs/audits/2026-04-22-fix-plan.md` C8).
  - WebSocket subscribe-time channel-scope verification (separate from connect-time auth) per CLAUDE.md domain rule.

### 5. Production hygiene

- **DONE**
  - Dockerfile non-root user, multi-stage, no build-time secrets (audit/09-infra-deploy.md §1).
  - Health endpoint `/api/health` covers DB, pool, memory, WS count, circuit breakers (§8).
  - DATABASE_URL `?sslmode=require` incident documented and gated against (`docs/audits/incident-2026-04-18-database-url-sslmode.md` + comment block at `server/db.ts`).
  - Railway builder pinned to Dockerfile via `railway.toml` (F-224).
  - tsconfig server/client split (A-04, `72718ee`).
- **IN PROGRESS**
  - **L6 — 329 pre-existing TS errors** (server/** + shared/**), no runtime impact (esbuild build skips strict check). Needs dedicated `triage/ts-errors` branch (`docs/audits/bug-inventory.md` OPEN-LOW).
  - **A-06 — docker-compose `mem_limit`/`cpus`.** Stash entry `cc635df`, not on a branch yet.
  - **F-225 — tenant-tz-helper branch.** 6 commits of real implementation; ship/finish/abandon decision pending. C1 timezone-off-by-one cluster (4 distinct tester bugs) likely resolves here (`docs/audits/2026-04-22-fix-plan.md` C1).
- **NOT STARTED**
  - **No CI/CD.** Zero of: GH Actions, GitLab CI, Husky, ESLint config, Prettier config, automated tests on push, deploy automation, dependency scanning, secrets scanning (audit/09-infra-deploy.md §5). Top-5 finding in FINAL-REPORT.
  - **Backup/DR partially in place.** Manual snapshot capability now available via Railway Pro plan upgrade (2026-04-30); first snapshot taken 2026-04-30 07:00 UTC, 149 MB incremental. Still NOT configured: automated/scheduled snapshots, documented RPO/RTO, documented restore procedure (§9). See `audit/incident-2026-04-30-railway-pro-upgrade.md`.
  - **No distributed job coordination.** Single-instance assumption holds across rate limiter, lockout map, schedulers, WS pub/sub. Top-5 finding in FINAL-REPORT — Redis is commented out in `docker-compose.yml`.
  - `.dockerignore` does not exclude `.env`, `.auth/`, `.replit` — secrets can leak into builder layer (§1).
  - Patch-script-as-deploy-mechanism risk (4 patch scripts at repo root, `audit/09-infra-deploy.md §11`). Suggests an ad-hoc edit workflow that diverges from PR-based discipline.
  - **`L7` — `.gitignore` does not exclude recon/handoff scratch files.** Has caused near-misses every shipping cycle (B1, M3, M1).

### 6. End-user functional readiness

- **DONE**
  - 21 of 36 tracked bugs fixed and deployed; 0 BLOCKING currently (`docs/audits/bug-inventory.md` Summary).
  - F1–F17 (KOT, transfer-table, public receipt, sentCartKeys, split-order kitchen-resend, covers-in-DB, table-status-on-table-change, tenantId on createOrderItem, void modal, order_number generation, takeaway bill auto-create, void-request roles, schema migration, F15 currency data fix, /cash and /kitchen-board crash fixes).
  - PR #9 (BL-3 round 2 — order_type cast in NOT EXISTS) and PR #13 (BL-1 Round 3 — `event.action` undefined guard) shipped 2026-04-29; tester-verified 2026-04-30.
  - PR #16 (M5 — POS UI delivery address field, `66a1906`), PR #17 (QQ-7 — `waitlist_entries` rotation gap, `36ccfe0`), and PR #18 (PR B — auto-create `delivery_orders` row, `49f8687`) shipped 2026-04-30. PR #16 tester-verified; PR #18 smoke-tested in production (test order INV-2026-0085, both happy-path and validation-path PASS); PR #17 awaits verification at rotation time on 2026-05-01.
- **IN PROGRESS**
  - **Orphan `delivery_orders` cleanup.** TablePlus recon confirmed 53 orphans across 2 test tenants (recon SQL at `audit/orphan-delivery-orders-recon.sql`). Recommendation locked: delete-not-backfill. Cleanup script drafting 2026-05-01.
- **NOT STARTED**
  - **M4 — addon KOT creates new order, not appended.** Billing must aggregate `parentOrderId` chain; verification pending.
  - **C1 — timezone off-by-one** (4 tester bugs: reservations save next day, events same-day renders next day, shift created updates next day, POS bill print time). Likely resolved by shipping the F-225 branch.
  - **C4 — kitchen unit conversion** (tsp/tbsp render as kg; wastage entered in g treated as kg → AED 22,000 displayed for AED 2.20 of waste). Critical, single root-cause, ~30–80 line fix.
  - **C6 — order-source parity** (largest cluster). Phone/Online/Swiggy/Zomato/UberEats/Kiosk/QR orders missing items, missing from feeds, kitchen Order ID differs from live-orders Order ID, Cancel button non-functional.
  - **C7 — table operations.** Merge capacity wrong, Clear sometimes fails, Reserved tables not selectable when guest arrives.
  - **C12 — KDS count inconsistency.** Header counts diverge from displayed items.
  - **C10 / C11 / C14** — validation gaps, dropdown/scroll patterns, missing destructive confirmations (~25 tester-reported bugs collectively).
  - i18n machine-translation gap: `[EN]` prefixed strings in es/fr/ar locales for newly added M1/M3 keys (per session-handoff workflow).

### 7. Onboarding & support

- **DONE**
  - 9 i18n namespaces (common, auth, nav, pos, kitchen, menu, staff, reports, settings); 4 locales en/es/ar/fr with RTL support per replit.md.
  - Welcome email on registration.
  - Subscription grace period (24h) for non-owner roles after expiry (audit/05-auth.md §2).
  - 33 Playwright tests across 8 spec files (replit.md).
- **IN PROGRESS**
  - Manual-QA test cycles with two external testers (cycles dated 2026-04-18 and 2026-04-22 captured in `docs/audits/`).
- **NOT STARTED**
  - First-tenant onboarding playbook / runbook (no doc found in repo).
  - Tenant currency / outlet seed-time defaults that don't drift to `INR` (F15 root cause was an outlet-seed defaulting wrong; data fix shipped 2026-04-09, no audit confirmed the seed itself was fixed).
  - Customer support / incident-response on-call protocol (no doc found).
  - Self-serve docs / help center for restaurant staff users.
  - Admin tools for tenant impersonation / read-only support access — not present in audit/05-auth.md scope.

### 8. Observability

- **DONE**
  - `/api/health` comprehensive — DB, pool, memory, WS count, circuit breakers (audit/09-infra-deploy.md §8).
  - `system_health_log` table written every 5 min.
  - `POST /api/errors/client` for frontend errors.
  - `api-counter.ts` request counter; `security-alerts.ts` rate-anomaly detection; `alert_engine.ts` in-app alerts.
  - `auditEvents` table with before/after JSONB.
- **IN PROGRESS**
  - (Nothing actively in flight in this category.)
- **NOT STARTED**
  - **No APM / distributed traces.** No Sentry, Datadog, New Relic. Server-side errors do not flow anywhere external.
  - **No metrics endpoint** (no Prometheus/Grafana). The counter exists but is not scrapable.
  - **No external alerting.** No PagerDuty, OpsGenie, or webhook to ops phones. Alert engine fires in-app only.
  - **No uptime monitoring** configured.
  - **No structured-log aggregation.** All logging is `console.*` to stdout/stderr. Replit retention is ephemeral; Railway logs depend on container runtime; no log rotation policy.
  - **PII risk in logs:** dev-mode response-body logging (`index.ts:241-280`) includes PII; slow-query logger (`query-logger.ts`) includes SQL params (audit/09-infra-deploy.md §7).
  - Seed file logs `"all passwords: demo123"` + kiosk token URLs to stdout (`seed.ts:1639-1648`).

---

## Critical gaps (not yet addressed)

Prioritized by severity. Anything below would block a real first-paying-tenant launch in my read.

### Severity 1 — must-fix-before-launch

1. **Compromised-secret rotation — DEFERRED to post-launch (2026-05-01).** ENCRYPTION_KEY (`.replit:54` since `e523dfa`), VAPID private key (`.replit:55-56` since `280047f`), and `.auth/*.json` session cookies (since `12fc00b`) remain in git history. Pre-launch risk assessed as theoretical (test data only) and rotation procedure not yet practiced by founder. Procedure preserved in `audit/encryption-key-rotation-recon.md`; tracked as PL-1 in `audit/00-backlog.md` "Post-launch hardening". Revisit when real customer PII enters production or within 30 days of first paying customer, whichever first.
2. **Password policy not enforced at registration / staff creation** (audit/05-auth.md §5). Users can register with `"a"`; staff are seeded with `"demo123"`. Defeats every other auth control.
3. **Webhook amount reconciliation missing** (F-103, F-105). Without amount-vs-bill verification, a bug or hostile mutation in the payment flow records the wrong total as paid.
4. **Tenant-isolation audit not closed.** 24 storage functions flagged tenant-unsafe (FINAL-REPORT Top-5); C2/M6 still 500-ing in prod; QR public surface (A-14 / C8) unaudited; WebSocket subscribe-time channel-scope verification not done.
5. **Backup / disaster recovery partially addressed (2026-04-30).** Manual snapshot capability now exists via Railway Pro plan; first manual snapshot 2026-04-30 07:00 UTC (149 MB). Still missing: automated/scheduled snapshots, documented restore procedure, formal RPO/RTO. First DB-loss event still has high blast radius until restore is rehearsed end-to-end. See `audit/incident-2026-04-30-railway-pro-upgrade.md`.

### Severity 2 — should-fix-before-launch

6. **No CI/CD.** Manual builds and deploys are how F-223 → F-224 → DATABASE_URL incident chain happened (`docs/audits/incident-2026-04-18-database-url-sslmode.md`). Even minimal CI (typecheck + Playwright on push) would catch the L6 class of regression.
7. **Single-instance distributed-state assumption** (rate limiter, lockout map, schedulers, WS pub/sub). Will silently misbehave the moment Railway scales horizontally.
8. **C1 timezone off-by-one** — reservations / events / shifts saving for the wrong day is directly customer-facing brand damage. F-225 branch likely already implements the fix.
9. **C4 unit-conversion in kitchen** — wastage cost rendering 1000× actual could trigger owners reporting staff for theft. Single root-cause.
10. **M5 → PR B → backfill chain — RESOLVED 2026-04-30.** PR #16 (M5, `66a1906`) and PR #18 (PR B, `49f8687`) shipped and smoke-tested. Orphan cleanup pivoted to delete-not-backfill (53 rows across 2 test tenants); cleanup script drafting 2026-05-01. POS-Delivery 404 gap closed for new orders.
11. **Currency render layer leaks** (F-107..F-114 + C9). UAE tenant seeing `$` or `₹` is brand damage; cross-currency report aggregation gives owners meaningless numbers.

### Severity 3 — should-have-soon-after-launch

12. **TOTP enforcement option** for owner/manager/admin roles, plus encryption of `totp_secret` and hashing of `recovery_codes` (F-156, F-157).
13. **External alerting + APM.** A 500 in production should page someone, not sit in stdout.
14. **C6 order-source parity cluster.** Largest functional cluster; not a launch-blocker but a credibility-blocker for any tenant that uses aggregators or kiosks.
15. **B1d cross-outlet KDS scoping.** Becomes severity-1 the moment a multi-outlet tenant onboards.

## Post-launch hardening

Items deferred from pre-launch but tracked for post-launch action.

- **ENCRYPTION_KEY / SESSION_SECRET / VAPID_PRIVATE_KEY rotation.**
  Deferred from pre-launch per founder decision 2026-05-01. Procedure
  documented in `audit/encryption-key-rotation-recon.md` remains valid.
  Revisit when real customer PII enters production database, or
  within 30 days of first paying customer onboarding — whichever is
  sooner. Owner: founder, with optional senior-developer assist.

---

## Recommended next 2 items

ENCRYPTION_KEY rotation deferred to post-launch — see PL-1 in `audit/00-backlog.md` and the "Post-launch hardening" section above. Original priority preserved in PL-1; revisit when real PII enters production or within 30 days of first paying customer.

The remaining items move the launch needle the most for the least work, in order:

1. **Orphan `delivery_orders` cleanup + regression sweep on today's shipped PRs.** The M5 → PR B → backfill chain shipped 2026-04-30: PR #16 (`66a1906`) + PR #18 (`49f8687`) close the recurring POS-Delivery 404 gap. Remaining: a small delete-not-backfill SQL against the 53 orphans across 2 test tenants (`audit/orphan-delivery-orders-recon.sql` is the source-of-truth recon), then a passive regression sweep that PRs #9, #13, #16, #17, #18 still hold under tester traffic. Keep cleanup ahead of regression so test data doesn't pollute the verification.

2. **Stand up minimal CI** — GitHub Actions running `npm run check` (typecheck) + `npm run build` + the existing 33 Playwright tests on every PR. This single workflow file would have caught L6's 329 type errors as they accumulated and would have caught the F-223 → DATABASE_URL incident before Railway redeploy. Lowest-effort lever for production hygiene category. After this lands, every other Critical Gap is much cheaper to fix because regressions surface before they ship.

These are deliberately not "tester re-verification of PR #9 / #13" — that one is already #1 in `audit/00-backlog.md` and is best handled in passive-wait mode by the testers themselves. The two above are the work I would actively pick up first if no other signal arrives tomorrow.
