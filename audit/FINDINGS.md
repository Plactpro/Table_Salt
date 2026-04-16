# Audit Findings Register

| ID | Severity | Category | File | Line(s) | Description | Status |
|----|----------|----------|------|---------|-------------|--------|
| F-001 | Critical | Secrets | `.replit` | 54 | `ENCRYPTION_KEY` (64-char hex) hardcoded in `[userenv.shared]` and committed to repo | Open |
| F-002 | High | Secrets | `.replit` | 55-56 | VAPID public + private keys hardcoded in `[userenv.shared]` and committed to repo | Open |
| F-003 | High | Secrets | `.auth/owner.json` | 1-25 | Signed session cookie (`connect.sid`) + CSRF token for owner role committed to repo | Open |
| F-004 | High | Secrets | `.auth/manager.json` | 1-22 | Signed session cookie (`connect.sid`) + CSRF token for manager role committed to repo | Open |
| F-005 | High | Secrets | `.auth/kitchen.json` | 1-22 | Signed session cookie (`connect.sid`) + CSRF token for kitchen role committed to repo | Open |
| F-006 | Medium | Config | `.gitignore` | 8 | `.auth/` directory not gitignored — pattern `*.cookies.txt.auth/` is malformed and does not match `.auth/` | Open |
| F-007 | Info | Process | (root) | — | No CI/CD pipeline (no GitHub Actions, GitLab CI, or equivalent) | Open |
| F-008 | Info | Process | (root) | — | No linting (ESLint) or formatting (Prettier) enforcement; no pre-commit hooks | Open |
| F-009 | Low | Config | (root) | — | Dual lockfiles: `package-lock.json` (npm) and `bun.lock` (Bun); Dockerfile uses npm | Open |
| F-010 | Info | Process | (root) | — | Four hotpatch scripts at repo root suggest live-patching outside normal deploy flow | Open |
| F-011 | High | Auth | `server/index.ts` | 212-223 | `POST /api/admin/circuit-breakers/reset` has NO auth middleware — any unauthenticated request can reset all circuit breakers | Open |
| F-012 | High | Secrets | `shared/schema.ts` | 122-123 | `tenants.razorpayKeyId` and `tenants.razorpayKeySecret` stored as plaintext text columns — payment gateway credentials unencrypted in DB | Open |
| F-013 | Medium | Auth | `server/services/prep-notifications.ts` / `routers/prep-notifications.ts` | — | Prep notification read endpoints (`GET /api/prep-notifications`, `GET /api/prep-notifications/unread-count`, `PATCH .../read`) require NO authentication | Open |
| F-014 | Medium | Auth | `server/routers/cash-machine.ts` | — | `POST /api/cash-sessions/calculate-change` requires no authentication | Open |
| F-015 | Medium | Auth | `server/routers/tip-management.ts` | — | `GET /api/tips/config/:outletId` requires no authentication — exposes tenant tip configuration | Open |
| F-016 | Medium | WebSocket | `server/realtime.ts` | 196-199 | WebSocket accepts `?tenantId=<id>` query param with no session auth — only verifies tenant exists, grants full event stream access | Open |
| F-017 | Low | Auth | `server/auth.ts` | 15-41 | Account lockout state stored in-memory Map — resets on server restart; not shared across instances | Open |
| F-018 | Info | Crypto | `server/auth.ts` | 49-53 | Password hashing uses scrypt (not bcrypt) despite bcrypt being a dependency — bcrypt may be unused dead code | Open |
| F-019 | Info | WebSocket | `server/realtime.ts` | 114-132 | `emitToTenantManagers()` is defined but never called from any router — dead code | Open |
| F-020 | Medium | CSP | `server/security.ts` | 42 | CSP allows `'unsafe-inline'` and `'unsafe-eval'` in script-src — significantly weakens XSS protection | Open |
| F-021 | Info | Config | `.env.example` | 73-74 | `OPENAI_API_KEY`, Cloudinary, Google OAuth/Maps env vars documented but no corresponding code exists | Open |
| | | | | | **--- Phase 2: Data Flow Tracing ---** | |
| F-022 | Critical | Atomicity | `server/routers/auth.ts` | 58-119 | Registration creates tenant+outlet+user across 4 tables with NO transaction — partial failure leaves orphan tenants | Open |
| F-023 | Critical | AuthZ | `server/routers/tenant.ts` | 35,47 | Owner can self-set `plan` field via `PATCH /api/tenant`, bypassing Stripe billing entirely | Open |
| F-024 | High | Auth | `server/routers/auth.ts` | 76 | No password policy enforced at registration — `validatePasswordPolicy` imported but never called | Open |
| F-025 | High | AuthZ | `server/routers/billing.ts` | 16-65 | Onboarding PATCH endpoints use `requireAuth` only — any staff member can modify tenant settings | Open |
| F-026 | High | Auth | `server/routers/users.ts` | 49,66 | Default staff password "demo123"; plaintext password sent via email | Open |
| F-027 | High | Data Integrity | `shared/schema.ts` | 168 | No UNIQUE constraint on `email_hash` column — concurrent duplicate emails bypass app-layer check | Open |
| F-028 | Medium | Validation | `server/routers/billing.ts` | 38-47 | No validation on currency (not ISO 4217), taxRate, serviceCharge during onboarding | Open |
| F-029 | Medium | AuthZ | `server/routers/onboarding.ts` vs `billing.ts` | 6 vs 61 | Duplicate onboarding-complete endpoints with different auth levels | Open |
| F-030 | Medium | UX/Error | `server/routers/auth.ts` | 58-60 | Slug uniqueness enforced by DB only — no retry logic, unhelpful 500 on collision | Open |
| F-031 | Critical | Multi-Tenancy | `server/routers/orders.ts` | 1265 | Transfer-table endpoint has NO tenant_id check — cross-tenant order access | Open |
| F-032 | Critical | Multi-Tenancy | `server/routers/orders.ts` | 1295-1305 | Merge-tables endpoint has NO tenant_id check — cross-tenant order mutation | Open |
| F-033 | Critical | Multi-Tenancy | `server/routers/orders.ts` | 1331 | Split-bill endpoint has NO tenant_id check — cross-tenant data read | Open |
| F-034 | Critical | Data Integrity | `server/routers/service-coordination.ts` | 68-137 | Coordination status update has no optimistic locking AND no status transition validation | Open |
| F-035 | High | Atomicity | `server/routers/orders.ts` | 590-689 | Order creation (order + items + table) NOT wrapped in transaction | Open |
| F-036 | High | Race Condition | `server/routers/orders.ts` | 687-689 | No guard against concurrent orders for same table | Open |
| F-037 | High | Race Condition | `server/routers/kitchen.ts` | 274-281 | KDS stock deduction uses Drizzle tx without `SELECT FOR UPDATE` — stale read race | Open |
| F-038 | High | Data Integrity | `server/routers/kitchen.ts` | 734-737 | Selective item start deducts inventory fire-and-forget — failure silently ignored | Open |
| F-039 | Medium | Race Condition | (order_items schema) | — | No optimistic locking on order_items — concurrent KDS updates are last-write-wins | Open |
| F-040 | Medium | Atomicity | `server/routers/orders.ts` | 1054-1057 | Table freeing on payment is outside the transaction | Open |
| F-041 | Medium | Validation | `server/routers/orders.ts` | 797 | No status transition state machine enforced on main order PATCH | Open |
| F-042 | High | Validation | `server/routers/restaurant-billing.ts` | 212-213 | Bill totals trusted from client at creation — no server recalculation | Open |
| F-043 | High | Atomicity | `server/routers/restaurant-billing.ts` | 518-570 | Payment recording not transactional — crash between insert and status update | Open |
| F-044 | High | Race Condition | `server/index.ts` + `restaurant-billing.ts` | 85 + 1186 | Razorpay webhook + polling double-finalization race — duplicate payments possible | Open |
| F-045 | High | Crypto | `server/razorpay.ts` | 113 | Razorpay HMAC uses `===` (non-constant-time) — susceptible to timing attack | Open |
| F-046 | High | Compliance | `server/routers/restaurant-billing.ts` | 281-303 | No IGST support — only CGST/SGST; non-compliant for inter-state Indian GST | Open |
| F-047 | Medium | Validation | `server/routers/restaurant-billing.ts` | 437 | Payment sum tolerance ±1.01 — generous for high-value currencies | Open |
| F-048 | Medium | Race Condition | `server/routers/restaurant-billing.ts` | 518-570 | Split payment race — no bill-level lock | Open |
| F-049 | Medium | Race Condition | `server/routers/restaurant-billing.ts` | 574 | Tip accumulation race on concurrent split payments | Open |
| F-050 | Medium | Multi-Tenancy | `server/razorpay.ts` | 111 | Razorpay webhook secret is global, not per-tenant | Open |
| F-051 | Medium | Compliance | `server/routers/restaurant-billing.ts` | 281 | Invoice numbers only for Indian GST, not UAE VAT — non-compliant with UAE FTA | Open |
| F-052 | Medium | Money | `server/services/tip-service.ts` | 107 | Tip pool rounding shortfall — 100/3 = 33.33*3 = 99.99 | Open |
| F-053 | Medium | Atomicity | `server/routers/restaurant-billing.ts` | 803-955 | Refund not transactional — gateway refund succeeds but local record can fail | Open |
| F-054 | Medium | Secrets | `server/stripe.ts` | 10 | Platform Stripe secret stored in DB `platform_settings` table | Open |
| F-055 | High | Auth | `server/realtime.ts` | 196-199 | WebSocket `?tenantId=` grants full event stream with no session auth | Open |
| F-056 | Medium | AuthZ | `server/realtime.ts` | 38-57 | No role-based WS event filtering — all events broadcast to all tenant sockets | Open |
| F-057 | Medium | Dead Code | `server/realtime.ts` | 114-132 | `emitToTenantManagers()` defined but never called | Open |
| F-058 | Low | Auth | `server/realtime.ts` | 187-188 | Wall screen token is static bearer — permanent access until manually rotated | Open |
| F-059 | High | Compliance | `server/routers/restaurant-billing.ts` | 281 | UAE tenants get no sequential invoice number — FTA non-compliant | Open |
| F-060 | High | Compliance | (not propagated) | — | TRN from outlets not included on bills/receipts — required for UAE VAT | Open |
| F-061 | Medium | Compliance | `server/routers/restaurant-billing.ts` | 282-295 | No IGST for inter-state Indian GST | Open |
| F-062 | Medium | Compliance | `shared/schema.ts` + `restaurant-billing.ts` | 297 | HSN codes on menu_items not propagated to invoice line items | Open |
| F-063 | Medium | Compliance | (absent) | — | No e-invoicing integration (India GST e-way bill, UAE FTA) | Open |
| F-064 | Medium | Money | `shared/currency.ts` | 41-66 | Static hardcoded exchange rates — will produce wrong conversions | Open |
| F-065 | Low | Data Integrity | (bills schema) | — | Bills lack currency column — derived from tenant at display time | Open |
| | | | | | **--- Phase 3: IDOR Audit ---** | |
| F-066 | Critical | IDOR | `server/routers/orders.ts` | 1265,1271 | Transfer-table: `WHERE id = $1` with no tenant_id — cross-tenant order modification | Open |
| F-067 | Critical | IDOR | `server/routers/orders.ts` | 1295-1305 | Merge-tables: all queries use `WHERE id = $1` with no tenant_id — cross-tenant order item migration and order cancellation | Open |
| F-068 | Critical | IDOR | `server/routers/orders.ts` | 1331-1335 | Split-bill: `WHERE orderId = $1` with no tenant_id — cross-tenant order item data exposure | Open |
| F-069 | Critical | IDOR | `server/routers/customers.ts` | 150-227 | Loyalty tier config: uses `req.headers["x-tenant-id"]` instead of `user.tenantId` — full cross-tenant loyalty data read/write/delete | Open |
| F-070 | High | IDOR | `server/routers/menu.ts` | 28-29 | Menu category PATCH: `getCategory(id)` and `updateCategory(id)` have no tenant_id — cross-tenant category modification | Fixed (2026-04-15, Batch 1) |
| F-071 | High | IDOR | `server/routers/menu.ts` | 35-36 | Menu category DELETE: `deleteCategory(id)` has no tenant_id — cross-tenant category deletion | Fixed (2026-04-15, Batch 1) |
| F-072 | High | IDOR | `server/routers/kitchen.ts` | 530 | KOT events by orderId: `getKotEventsByOrder(orderId)` has no tenant_id check — cross-tenant KOT data exposure | Open |
| F-073 | High | IDOR | `server/storage.ts` | 1164-1170 | `updateOrder()` WHERE clause has no tenant_id — defense-in-depth gap for all callers | Fixed (2026-04-15, Batch 3) |
| F-074 | High | IDOR | `server/storage.ts` | 2695-2698 | `getBill()` WHERE clause has no tenant_id; public receipt endpoint at `restaurant-billing.ts:130` exposes bill data without auth | Fixed (2026-04-15, Batch 4) — getBill now requires tenantId; public receipt uses getBillUnchecked |
| F-075 | High | IDOR | `server/storage.ts` | 1172-1174 | `getOrderItemsByOrder()` has no tenant_id — defense-in-depth gap | Fixed (2026-04-15, Batch 3) |
| F-076 | High | IDOR | `server/storage.ts` | 1895-1897 | `getStockMovementsByOrder()` has no tenant_id — defense-in-depth gap | Open |
| F-077 | Medium | IDOR | `server/storage.ts` | 977-990 | `getCategory()`, `updateCategory()`, `deleteCategory()` have no tenant_id | Fixed (2026-04-15, Batch 1) |
| F-078 | Medium | IDOR | `server/storage.ts` | 932-935 | `getUser()` has no tenant_id — timing side-channel in auth.ts and permissions.ts (all callers do post-fetch check) | Open |
| F-079 | Medium | IDOR | `server/storage.ts` | 958-961 | `getOutlet()` has no tenant_id — timing side-channel (callers do post-fetch check) | Open |
| F-080 | Medium | IDOR | `server/storage.ts` | 3724-3727 | `getCashSession()` has no tenant_id — timing side-channel (callers do post-fetch check) | Fixed (2026-04-15, Batch 5) |
| F-081 | Medium | IDOR | `server/storage.ts` | 4692-4695 | `getValetTicket()` has no tenant_id — timing side-channel (callers do post-fetch check) | Open |
| F-082 | Medium | IDOR | `server/storage.ts` | 2742-2744 | `getPosSession()` has no tenant_id — timing side-channel (callers do post-fetch check) | Fixed (2026-04-15, Batch 4) |
| F-083 | Medium | IDOR | `server/storage.ts` | 3884-3888 | `getOutletCurrencySettings()` and `updateOutletCurrencySettings()` have no tenant_id — cross-tenant read/write of outlet currency config | Fixed (2026-04-15, Batch 2) |
| F-084 | Medium | IDOR | `server/storage.ts` | 2495-2497,2507,2519,2523 | Guest session/cart functions have no tenant_id — UUIDs provide obscurity | Open |
| F-085 | Medium | IDOR | `server/storage.ts` | 2651-2653 | `getKotEventsByOrder()` has no tenant_id — exposed via kitchen.ts KOT events endpoint | Open |
| F-086 | Medium | IDOR | `server/storage.ts` | 3251-3265 | `updateOrderItemCooking()` has no tenant_id — defense-in-depth gap | Open |
| | | | | | **--- Phase 3: Tenant Isolation (additional) ---** | |
| F-087 | High | Multi-Tenancy | `server/services/printer-service.ts` | 237-543 | 11 queries across receipt/bill printing functions fetch orders, bills, order_items, bill_payments by ID with no tenant_id — any printable document from any tenant is accessible | Open |
| F-088 | High | Multi-Tenancy | `server/services/time-logger.ts` | 220-285 | 5 UPDATE queries on order_items use `WHERE id = $1` or `WHERE order_id = $1` with no tenant_id — cross-tenant order item mutation via timing events | Open |
| F-089 | High | Multi-Tenancy | `server/services/resource-service.ts` | 6-46 | 5 queries in `recalculateAvailability()` use resource_id/PK only — cross-tenant resource data read and availability update | Open |
| F-090 | High | Multi-Tenancy | `server/services/bulk-start-order.ts` | 82-89 | Inventory SELECT + UPDATE by PK only, no tenant_id — stock deduction can read/modify any tenant's inventory within a Drizzle tx | Open |
| F-091 | Medium | Multi-Tenancy | `server/services/advance-order-scheduler.ts` | 24-26 | UPDATE orders by PK only, no tenant_id — mitigated by scheduler context (ID from own scan) | Open |
| F-092 | Medium | Multi-Tenancy | `server/services/tip-service.ts` | 68-70,144-166 | 3 UPDATE queries on bills, tip_distributions, bill_tips by PK/FK only, no tenant_id | Open |
| F-093 | Medium | Injection | `server/services/chef-assignment.ts` | 585 | SQL string interpolation: `INTERVAL '${settings.unassignedTimeoutMin} minutes'` — value from JSONB in outlets table; exploitable if outlet settings can be set to malicious values | Open |
| F-094 | Medium | Multi-Tenancy | `server/services/file-storage.ts` | 29,51 | S3/local file paths have no tenant prefix (`uploads/{UUID}/{name}`) — no server-side validation that a file belongs to the requesting tenant; `deleteFile()` accepts arbitrary URLs | Open |
| F-095 | Medium | AuthZ | `server/admin-routes.ts` | 139,367 | Impersonation `accessMode` not validated against enum — any value other than `"READ_ONLY"` bypasses read-only enforcement (e.g., `"WRITE"` skips the check) | Open |
| F-096 | Medium | Multi-Tenancy | `server/routers/ads.ts` | 602-604 | `POST /api/ad-impressions` (unauthenticated) accepts `tenantId` from `req.body` — allows fake impression inflation for any tenant's campaigns | Open |
| F-097 | Low | Privacy | `server/routers/contact.ts` + `server/storage.ts` | 7-27, 1577-1587 | `salesInquiries` and legacy `supportTickets` tables accumulate PII (name, email, phone) with no read endpoint, no retention cleanup, and no admin UI to review | Open |
| F-098 | Low | AuthZ | `server/admin-routes.ts` | 606,1236,1609,1408,1477,2293,2332 | 7 admin GET/POST endpoints skip `requireFreshSession` — cross-tenant data readable without concurrent-session verification | Open |
| F-099 | Low | AuthZ | `server/admin-routes.ts` | (entire file) | No rate limiting on admin API endpoints — compromised super admin session can exfiltrate all tenant data without throttling | Open |
| F-100 | Low | Functional | `server/lib/menu-cache.ts` | 39-47 | `invalidateByTenant(tenantId)` iterates keys looking for `tenantId:` prefix, but actual keys are plain `outletId` — cache invalidation is broken (stale data served) | Open |
| | | | | | **--- Phase 4: Payment Gateway & Monetary Aggregation ---** | |
| F-101 | Medium | Money | `server/razorpay.ts` | 60 | `Math.round(amount * 100)` floating-point risk for minor-unit conversion — boundary rounding errors possible | Open |
| F-102 | Medium | Money | `server/razorpay.ts` + `restaurant-billing.ts` | 63, 1092 | Dual-default currency chain: Razorpay defaults to INR, caller defaults to AED — confusing and fragile | Open |
| F-103 | High | Money | `server/index.ts` + `restaurant-billing.ts` | 95, 1195 | Razorpay webhook/polling does NOT compare gateway amount to local bill total — amount mismatch silently accepted | Open |
| F-104 | Low | Dead Code | `server/stripeClient.ts` | 29-42 | `stripe-replit-sync` import — Replit-specific dead code on Railway deployment | Open |
| F-105 | Medium | Money | `server/routers/billing.ts` | 258-294 | Stripe checkout.session.completed for order payments — no amount verification against order total | Open |
| F-106 | Medium | Money | `server/razorpay.ts` + `restaurant-billing.ts` | 60, 1090-1092 | `amount * 100` assumes centesimal currency — fails for JPY, KRW, BHD (0 or 3 decimal currencies) | Open |
| F-107 | High | Money | `server/routers/reports.ts` | 58-67, 101-109, 128-139 | All report queries SUM monetary columns across all outlets without currency grouping — cross-currency aggregation | Open |
| F-108 | Medium | Money | `server/routers/reports.ts` | 439-443 | `outletId` parameter accepted but NOT passed to compute functions — outlet filtering silently ignored | Open |
| F-109 | Medium | Money | `server/routers/reports.ts` | 622-691 | QuickBooks/Xero accounting exports omit currency — invalid for multi-currency tenants | Open |
| F-110 | Medium | Money | `server/services/daily-report-scheduler.ts` | 33, 52 | Daily email sums revenue across all outlets, displays no currency | Open |
| F-111 | Medium | Money | `server/analytics-helpers.ts` | 1-248 | All analytics helper functions lack currency awareness — aggregate across currencies | Open |
| F-112 | High | Money | `server/routers/staff.ts` + `storage.ts` | 78, 1459-1462 | Main dashboard `totalRevenue` sums across all outlets without currency | Open |
| F-113 | High | Money | `server/routers/staff.ts` + `storage.ts` | 97, 1526-1530 | Analytics summary `totalRevenue`/`netRevenue` sums across all outlets without currency | Open |
| F-114 | High | Money | `server/routers/workforce.ts` | 54, 168 | Labour cost % uses cross-currency totalSales as denominator | Open |
| F-115 | Medium | Money | `server/routers/workforce.ts` | 13 | Default hourly rates hardcoded without currency context | Open |
| F-116 | High | Money | (multiple files) | (see 04-payment-gateway-monetary.md) | 15+ SQL SUM queries on monetary columns scoped to tenant_id only, not outlet/currency | Open |
| | | | | | **--- Phase 4: Schema/Tax/Rounding (additional) ---** | |
| F-117 | High | Money | `shared/schema.ts` | (14 columns) | 14 monetary `numeric()` columns have NO precision/scale — inconsistent rounding and aggregation (orderItems.itemDiscount, valet fields, adCampaigns fields) | Open |
| F-118 | High | Money | `shared/schema.ts` | 2544,2551,2552 | `promotionRules` stores discountValue, maxDiscount, minOrderAmount as `text` — no DB-level numeric validation | Open |
| F-119 | Medium | Money | `shared/schema.ts` | 5922,5923,5946 | Loyalty tier thresholds (minSpend, maxSpend, totalSpend) stored as `integer` — truncates fractional currency amounts | Open |
| F-120 | High | Money | `server/routers/restaurant-billing.ts` + `orders.ts` | 282 vs 557 | GST rate defaults inconsistent: orders use `cgstRate \|\| 0`, billing uses `cgstRate ?? 9` — produces different CGST/SGST splits for same tenant | Open |
| F-121 | High | Money | `server/routers/restaurant-billing.ts` | 213-340 | Bill creation trusts ALL client-submitted monetary values (subtotal, tax, discount, serviceCharge, total) — no reconciliation against referenced order | Open |
| F-122 | Medium | Money | `server/routers/restaurant-billing.ts` | 445-466 | Payment-time tax validation uses client-tampered bill.subtotal as basis — cannot catch a tampered bill | Open |
| F-123 | Medium | Money | `server/routers/orders.ts` | 492,504 | Per-item prices not rounded after modifier application before subtotal accumulation — float drift across many items | Open |
| F-124 | Medium | Money | `server/routers/orders.ts` | 546 | `manualDiscountAmount` accepted from client without server-side cap at subtotal — supervisor check only examines percentage field | Open |
| F-125 | Medium | Money | `shared/currency.ts` | 160-167 | Only 6 of 24 supported currencies have denomination/rounding configs — JPY (0 decimals) has no `ROUND_1` config | Open |
| F-126 | Medium | Money | `shared/currency.ts` | 171-172 | `applyRounding` for ROUND_0.05/ROUND_0.25 produces float artifacts (e.g., 1.0500000000000003) — no re-rounding | Open |
| F-127 | Medium | Money | `shared/currency.ts` | 138 | `convertCurrency()` result not rounded to target currency's decimal places — callers must round | Open |
| F-128 | Medium | Money | `server/services/parking-charge-service.ts` | 141-142 | Parking charge added to bill total via `UPDATE SET total_amount = total_amount + $1` without updating `taxAmount` — bill tax field becomes stale | Open |
| F-129 | Low | Money | `shared/schema.ts` | (multiple) | Inconsistent precision across tables: orders/bills use decimal(10,2), cashSessions/purchaseOrders use decimal(12,2) — aggregation could overflow smaller precision | Open |
| F-130 | Info | Money | (all monetary computation) | — | All monetary arithmetic uses JavaScript IEEE 754 doubles — standard `Math.round(x*100)/100` pattern applied but at inconsistent granularities across modules | Open |
| | | | | | **--- Phase 5: Authorization Enforcement ---** | |
| F-131 | Critical | Auth | `server/index.ts` | 212-223 | Circuit breaker reset registered WITHOUT auth — overrides the authenticated version in admin-routes.ts:2332 (Express matches first route) | Open |
| F-132 | High | Auth | `server/routers/prep-notifications.ts` | 16-133 | 8 prep-notification/assignment endpoints lack requireAuth middleware — bypass idle timeout enforcement | Open |
| F-133 | Medium | Auth | `server/routers/restaurant-billing.ts` | 1367-1392 | PATCH /api/tip-settings: no requireAuth middleware, no role check — any session user can modify tip settings | Open |
| F-134 | Medium | Auth | `server/routers/restaurant-billing.ts` | 1352-1363 | GET /api/tip-settings: no requireAuth middleware — bypasses idle timeout | Open |
| F-135 | Medium | Auth | `server/routers/tip-management.ts` | 124-137 | GET /api/tips/config/:outletId: completely unauthenticated — exposes outlet tip configuration | Open |
| F-136 | High | Auth | `server/routers/kitchen.ts` | 576-615 | GET /api/kds/wall-tickets accepts ?tenantId= query param — full active order stream without any auth for any known tenant | Open |
| F-137 | Low | Auth | `server/routers/packing-charges.ts` | 126-155 | POST /api/packing/calculate: no auth — pure calculation, low risk | Open |
| F-141 | Medium | Secrets | `server/routers/service-coordination.ts` | 734,750,766 | Webhook tokens default to hardcoded values ("zomato-webhook-token" etc.) when env vars unset | Open |
| F-143 | Medium | CSRF | `server/security.ts` | 198-211 | POST /api/auth/pin-login not in CSRF exemption list — may break PIN login for users without pre-existing CSRF cookie | Open |
| F-145 | High | Rate Limit | `server/security.ts` | 132-133 | PIN login (4-digit, 10k combinations) not covered by auth limiter — falls under 120 req/min general limiter | Open |
| F-146 | Medium | Rate Limit | `server/security.ts` | 132-133 | Forgot-password under general API limiter (120/min) instead of auth limiter — enables email bombing | Open |
| F-148 | Low | Rate Limit | `server/admin-routes.ts` | (entire file) | No elevated rate limiting on admin endpoints — compromised super_admin can exfiltrate at 120 req/min | Open |
| F-149 | Medium | Rate Limit | `server/security.ts` | 96-116 | In-memory rate limiter fallback when Redis unavailable — bypassed in multi-instance deployment | Open |
| F-150 | Medium | AuthZ | `server/permissions.ts` | 36-38 | Amount threshold check in `can()` is a no-op — re-checks condition already satisfied on line 31 | Open |
| F-151 | Medium | AuthZ | `shared/permissions-config.ts` | 68-77 | franchise_owner has identical permissions (35/35) to owner — no permission-based distinction | Open |
| F-152 | Low | AuthZ | (multiple router files) | — | requirePermission system is largely unused — most routes use requireRole, making granular permissions decorative | Open |
| | | | | | **--- Phase 5: Auth / Session / Crypto (additional) ---** | |
| F-153 | Medium | Auth | `server/auth.ts` | 169 | User enumeration: "Account is deactivated" vs "Invalid credentials" — different messages for existing-deactivated vs non-existing users | Open |
| F-154 | Medium | Auth | `server/routers/auth.ts` | 140 | TOTP prompt leaks `userId` in response body, confirming valid credentials before 2FA completion | Open |
| F-155 | Medium | Auth | `server/routers/auth.ts` | 653-735 | PIN login completely bypasses TOTP/2FA — no TOTP check in PIN login handler (mitigated by role restriction to staff-only roles) | Open |
| F-156 | High | Crypto | `shared/schema.ts` + `server/routers/auth.ts` | 148, 435 | TOTP secrets stored as plaintext in `users.totp_secret` — DB compromise exposes all TOTP secrets | Open |
| F-157 | High | Crypto | `shared/schema.ts` + `server/routers/auth.ts` | 150, 452 | Recovery codes stored as plaintext text array in `users.recovery_codes` — should be individually hashed | Open |
| F-158 | High | Auth | `server/routers/auth.ts` | 479-506 | Password change does NOT invalidate other sessions — stolen session persists after victim changes password | Open |
| F-159 | Medium | Auth | `server/routers/auth.ts` | 479 | Password change endpoint does not use `requireFreshSession` — callable from a shared/stale session | Open |
| F-160 | Medium | Auth | `server/routers/auth.ts` | 313-322 | Logout does not call `req.session.destroy()` or clear cookie — session row persists for 30 days in DB | Open |
| F-161 | Medium | Auth | `server/routers/auth.ts` | 20-123 | No email verification at registration — unverified email used for password reset, no proof of ownership | Open |
| F-162 | Medium | Auth | (absent) | — | TOTP/2FA is entirely optional for all roles — no enforcement mechanism for owner/admin requiring 2FA | Open |
| F-163 | Medium | Auth | (absent) | — | No CAPTCHA on any auth endpoint (register, login, forgot-password) — automated attacks trivial | Open |
| F-164 | Low | Crypto | `server/encryption.ts` | 6 | Static hardcoded salt `"table-salt-encryption-v1"` for scrypt key derivation — reduces key diversity across deployments | Open |
| F-165 | Low | Crypto | `server/encryption.ts` | 51-53 | Decrypt failure returns ciphertext as-is (no crash) — silently exposes encrypted data to caller if key mismatch | Open |
| | | | | | **--- Phase 6: Real-time Layer ---** | |
| F-166 | High | DoS | `server/realtime.ts` | 172+ | No connection limits (per-tenant, per-user, per-IP, global) on WebSocket — unlimited connections enable DoS via connection exhaustion | Open |
| F-167 | High | KOT | `server/routers/orders.ts` | 699-743 | No `routeAndPrint()` on direct order creation with `sent_to_kitchen` — physical KOT print delayed up to 30s until retry worker picks it up | Open |
| F-168 | High | KOT | `server/routers/orders.ts` | 592-743 | No crash recovery for KOTs — server crash between order creation and print job creation means kitchen never gets notified; no startup reconciliation | Open |
| F-169 | High | KOT | `server/services/printer-service.ts` | 172,708 | Print jobs abandoned after 3 failed attempts — no alerting, no dead-letter queue, no user notification; lost KOT = lost order for kitchen | Open |
| F-170 | Medium | Real-time | `client/src/hooks/use-realtime.ts` | 105-117 | No event deduplication on client — duplicate events cause UI glitches (double orders, incorrect balances) | Open |
| F-171 | Medium | Real-time | `server/realtime.ts` | (architecture) | No offline event delivery or catch-up — events during WS disconnect permanently lost; no sequence numbers or replay | Open |
| F-172 | Medium | DoS | `client/src/hooks/use-realtime.ts` + `server/realtime.ts` | 135, 172 | Reconnection storm: all clients retry simultaneously after restart with 1s delay; no server throttling or client jitter | Open |
| F-173 | Medium | Functional | `server/services/pubsub.ts` | 83 | Redis local fallback `psubscribe` broken — EventEmitter doesn't support wildcard patterns; works only because `emitToTenant` bypasses pubsub locally | Open |
| F-174 | Medium | KOT | `server/routers/orders.ts` + `printer-service.ts` | 706, 308 | Duplicate print job records — route-level `createPrintJob()` AND `routeAndPrint()` both INSERT for same order | Open |
| F-175 | Medium | Race Condition | `server/routers/print-jobs.ts` | 14-18 | `getNextKotSequence()` read-then-write without locking — duplicate KOT sequence numbers under concurrency | Open |
| F-176 | Medium | Atomicity | `server/routers/kitchen.ts` | 272 vs 317-323 | KDS start: stock deduction is transactional but item/order status updates are outside the transaction | Open |
| F-177 | Low | KOT | `server/services/printer-service.ts` | 716 | Retry worker only handles NETWORK_IP printers — USB/BLUETOOTH/CLOUD jobs stuck in "queued" forever on failure | Open |
| F-178 | Low | KOT | `server/services/printer-service.ts` | 76-80 | Cloud printer handler is a stub (`console.log` only) — jobs silently succeed without printing | Open |
| F-179 | Low | KOT | `server/routers/orders.ts` | 28,84-85 | `fireAutoAssign` and `fireKdsArrival` swallow all errors silently — chef assignment failures invisible | Open |
| | | | | | **--- Phase 7: External Integrations ---** | |
| F-180 | Medium | Idempotency | `server/routers/billing.ts` | 276-293 | Stripe checkout guest payment path re-executes table/session release on webhook retry — no event dedup | Open |
| F-181 | Low | Performance | `server/services/email-service.ts` | 32 | New SMTP transport created per email send — no connection pooling | Open |
| F-182 | Medium | Reliability | `server/services/email-service.ts` | 45-48 | All email sends silently swallow SMTP errors — staff invite password may never arrive with no indication | Open |
| F-183 | Medium | Security | `server/services/email-service.ts` | 121,131 | Staff invite sends temp password in email body over potentially unencrypted SMTP | Open |
| F-184 | Medium | Bug | `server/services/sms-gateway.ts` | 44 | Regex `/[^+d]/g` strips digits instead of non-digits (`\d`) — SMS phone number cleaning is broken | Open |
| F-185 | Medium | Privacy | `server/services/sms-gateway.ts` | 50-51 | Full phone numbers and SMS content stored in `sms_log` unencrypted, no retention policy | Open |
| F-186 | Low | Bug | `server/services/sms-gateway.ts` | 50 | SQL INSERT uses `(,,,,,,)` without `$1-$7` param markers — query always fails, silently swallowed | Open |
| F-187 | High | Cost/Abuse | `server/routers/tables.ts` | 295 | No rate limit on SMS sends per tenant/phone/time-window — unlimited Twilio/MSG91 charges possible | Open |
| F-188 | Low | Performance | `server/services/push-sender.ts` | 116-133 | `sendPushToTenant()` fires all push notifications in parallel with no concurrency limit | Open |
| F-189 | Critical | Auth | `server/routers/channels.ts` | 179-254 | Aggregator webhook reads HMAC signature headers but NEVER validates them — unauthenticated order injection | Open |
| F-190 | High | Multi-Tenancy | `server/routers/channels.ts` | 210-213 | Aggregator webhook `LIMIT 1` on platform slug — misroutes orders when multiple tenants use same aggregator | Open |
| | | | | | **--- Phase 7: Background Jobs & Infrastructure ---** | |
| F-191 | Critical | Reliability | (all schedulers) | — | No distributed job coordination — every background job runs independently on every server instance; duplicate emails, DB inserts, and WS events in multi-instance deployment | Open |
| F-192 | High | Reliability | `server/services/coordination-rules.ts` | 26 | Coordination rules capped at `LIMIT 100` tenants with no ORDER BY — tenants beyond 100 get zero rule enforcement; excluded set is nondeterministic | Open |
| F-193 | High | Reliability | `server/services/daily-report-scheduler.ts` | 70-75 | Daily report emails have no dedup — multi-instance sends duplicate emails to every owner daily | Open |
| F-194 | High | Reliability | `server/services/shift-digest-mailer.ts` | 237-292 | Shift digest emails have only in-memory dedup — multi-instance sends duplicate emails to every outlet's staff | Open |
| F-195 | Medium | Reliability | (all setInterval jobs) | — | No overlap prevention on any scheduler — if a run takes longer than its interval, concurrent execution occurs | Open |
| F-196 | Medium | Reliability | `server/services/chef-assignment.ts` | 574-601 | Chef escalation has no dedup — re-emits escalation WS events every 60s for the same unassigned tickets | Open |
| F-197 | Medium | Memory | `server/services/shift-digest-mailer.ts` + `alert-engine.ts` + `prep-deadline-checker.ts` | 235, 141, 8 | In-memory dedup Sets/Maps grow without bound — `firedKeys` and `warnedKeys` never cleaned for old entries | Open |
| F-198 | Medium | Reliability | `server/services/alert-engine.ts` | 187 | `startUnclockdInChecker` has empty catch block `catch (_) {}` — all errors silently swallowed with zero logging | Open |
| F-199 | Medium | Security | `server/routers/ads.ts` | 47 | Ad creative upload allows `text/html` MIME type — enables stored XSS if served without Content-Disposition | Open |
| F-200 | Medium | Security | `server/services/file-storage.ts` | 45 | S3 files returned as permanent public URLs — no signed URLs, no expiry; anyone with the URL has permanent access | Open |
| F-201 | Medium | Reliability | `server/services/pubsub.ts` | 9-10 | `isRedisEnabled()` checks env var existence only, not connection health — if Redis dies after startup, messages silently dropped with no fallback activation | Open |
| F-202 | Medium | Config | `server/services/pubsub.ts` | (all connections) | No Redis key prefix on any connection — environment collision risk if sharing a Redis instance across environments | Open |
| F-203 | Low | Reliability | `server/lib/circuit-breaker.ts` | — | Circuit breaker trips on single failure (no minimum sample size) — a single transient error opens the circuit for 30s | Open |
| F-204 | Low | Config | `server/services/stock-report-scheduler.ts` + `wastage-summary-scheduler.ts` + `daily-report-scheduler.ts` | — | Cron jobs fire at server local time, not tenant timezone — "23:00 daily" is meaningless for a global SaaS | Open |
| | | | | | **--- Phase 8: Frontend Security ---** | |
| F-205 | Medium | XSS | `client/src/components/pos/BillPreviewModal.tsx` | 2105 | `document.write(data.html)` writes server-returned HTML to print popup with zero client-side sanitization | Open |
| F-206 | Medium | XSS | `client/src/components/pos/PosSessionModal.tsx` | 150 | Payment method names interpolated into HTML template string without escaping — stored XSS via malicious method name | Open |
| F-207 | Medium | XSS | `client/src/pages/modules/parking.tsx` | 292-312 | 8+ user-input fields (vehicleNumber, vehicleColor, customerName, keyTagNumber, conditionReport.notes) interpolated into print popup HTML without escaping | Open |
| F-208 | Medium | Info Leak | (40+ client files) | — | Raw server error messages (`e.message`) displayed verbatim in toast notifications across entire app — zero client-side message sanitization | Open |
| F-209 | Info | XSS | `client/src/components/ui/chart.tsx` | 79 | `dangerouslySetInnerHTML` in style tag — not exploitable (developer-supplied config only) | Open |
| F-210 | Info | Client Security | `client/public/sw.js` | 22-24 | Service worker correctly excludes `/api/` and `/ws` from cache — no sensitive data cached | Open |
| | | | | | **--- Phase 8: POS / State / AuthZ (additional) ---** | |
| F-211 | High | AuthZ | `client/src/App.tsx` + (no server check) | 146-187 | Subscription feature gating (basic/standard/premium/enterprise) is enforced ONLY in the frontend — no server middleware checks tenant plan; any plan can call any API | Open |
| F-212 | High | Privacy | `client/src/pages/modules/pos.tsx` + `lib/auth.tsx` | 163,215,202-207 | PII (customerName, customerPhone) persists in localStorage (`pos_tabs_v2`) after logout — no cleanup on session termination | Open |
| F-213 | High | Money | `client/src/components/pos/BillPreviewModal.tsx` | 1438-1469,535 | Loyalty tier discounts (5%/10%/15%) hardcoded client-side, applied as client-submitted `discountAmount` — server never validates tier eligibility or discount percentage | Open |
| F-214 | Medium | Multi-Tenancy | `client/src/pages/modules/pos.tsx` | 163-164 | localStorage keys (`pos_tabs_v2`, `pos_held_tabs_v2`) are NOT scoped per user or tenant — cross-user/cross-tenant cart data leakage on shared devices | Open |
| F-215 | Medium | Data Integrity | `client/src/pages/modules/pos.tsx` | 1084,1127 | Fire-and-forget PATCH on order recall (`.catch(() => {})`) — server/client state diverges if request fails silently | Open |
| F-216 | Low | Accessibility | `client/src/pages/modules/pos.tsx` + KDS pages | — | No `aria-live` regions for real-time order/KDS updates — screen readers won't announce incoming orders or status changes | Open |
| | | | | | **--- Phase 9: Infrastructure & Deployment ---** | |
| F-217 | Critical | Secrets | `.replit` + git history | commits e523dfa, 280047f | ENCRYPTION_KEY and VAPID_PRIVATE_KEY in git history since initial commits — recoverable even if removed from HEAD; key must be considered fully compromised | Open |
| F-218 | High | Secrets | `.auth/*.json` + git history | commit 12fc00b | Session cookies for owner/manager/kitchen committed in git history; expires ~2026-04-20; valid if SESSION_SECRET unchanged | Open |
| F-219 | High | Deploy | `Dockerfile` + `.dockerignore` | — | `.dockerignore` does not exclude `.env`, `.auth/`, or `.replit` — secrets could be copied into Docker build context/image layers | Open |
| F-220 | High | Process | (absent) | — | No CI/CD pipeline, no automated tests on deploy, no SAST/DAST scanning, no dependency vulnerability audit (`npm audit`) — all code goes to production without automated quality gates | Open |
| F-221 | High | Logging | `server/lib/query-logger.ts` | 51-53 | Slow query logger dumps query params (first 200 chars) to console — can contain PII (names, emails, phone numbers in WHERE clauses) | Open |
| F-222 | High | Logging | `server/seed.ts` | 1639-1648 | Seed output logs "all passwords: demo123" and kiosk demo tokens to stdout — visible in any log aggregator | Open |
| F-223 | Medium | Config | `docker-compose.yml` | 14 | PostgreSQL credentials hardcoded as `postgres:postgres` in compose DATABASE_URL | Open |
| F-224 | Medium | Config | `.env.example` | 17-18 | `JWT_SECRET` and `JWT_EXPIRES_IN` documented but JWT is never used in the codebase — dead configuration | Open |
| F-225 | Medium | Config | `.env.example` vs code | — | 5 env vars used in code but missing from .env.example: `ENCRYPTION_KEY`, `MSG91_API_KEY`, `MSG91_SENDER_ID`, `MSG91_FLOW_ID`, `SHIFT_END_HOUR` | Open |
| F-226 | Medium | Config | `.env.example` | 73,79-80,82-84 | 9 env vars documented but unused in code: `OPENAI_API_KEY`, 3x `CLOUDINARY_*`, 3x `GOOGLE_*`, `BCRYPT_ROUNDS`, `CORS_ORIGIN` — misleading documentation | Open |
| F-227 | Medium | Observability | (absent) | — | No APM, no metrics endpoint, no external error tracking (Sentry/Datadog), no uptime monitoring, no ops alerting (PagerDuty) — production incidents invisible | Open |
| F-228 | Medium | DR | (absent) | — | No database backup automation, no documented restore procedure, no RPO/RTO targets — disaster recovery untested | Open |
| F-229 | Low | Config | `docker-compose.yml` | — | No resource limits (CPU/memory) on containers — a single tenant's traffic spike can exhaust host resources | Open |
| F-230 | Low | Config | `script/build.ts` | 7-33 | Build allowlist includes 13 packages not in package.json (`@google/generative-ai`, `axios`, `jsonwebtoken`, `openai`, `xlsx`, etc.) — dead bundling config | Open |
| F-231 | Info | Process | (repo root) | — | Patch scripts (4 files) are source-code modification tools for the modifier feature, not runtime patches; indicate a manual development workflow without branching/PRs | Open |
