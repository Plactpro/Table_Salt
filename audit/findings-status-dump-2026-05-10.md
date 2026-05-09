# Findings Triage Status Dump — 2026-05-10

**Sources read:** `audit/FINDINGS.md` (247 lines, F-001..F-231 + 5 -FU rows) and `audit/OPEN-QUESTIONS.md` (87 lines, Q-001..Q-083). Read-only on both. `audit/00-backlog.md` was also read once for the cross-source contradiction check noted under "Triage notes."

**Status normalization:**
- `Open` → **OPEN**
- `Fixed (...)` → **CLOSED**
- `Mitigated (rotated 2026-04-15)` → **CLOSED** (the original threat is mitigated by key rotation; residual key-compromise risk remains in git history but the finding ledger does not track it as a separate row)
- No row in either file is explicitly marked deferred — **DEFERRED** is unused.

**Severity normalization:**
- FINDINGS.md uses `Critical / High / Medium / Low / Info` — no normalization needed.
- OPEN-QUESTIONS.md has no severity column. Severity for Q-rows is **inferred from impact** (the finding(s) the question implicates or the domain it touches) — see footnote at bottom of that table.

**Launch-relevant convention:** Y for money / currency / tax / payment webhooks / auth / RBAC / tenant isolation / IDOR / cross-tenant leaks / public surfaces / real-time auth / encryption / privacy. N for observability / DR / operational reliability / KOT print / dead code / config-doc / a11y / perf / i18n. When in doubt → Y.

---

## Findings (audit/FINDINGS.md)

| ID | Severity | Status | Launch-relevant | One-line description | Source |
|----|----------|--------|-----------------|----------------------|--------|
| F-022 | CRITICAL | OPEN | Y | Registration creates tenant+outlet+user across 4 tables w/o transaction | server/routers/auth.ts:58-119 |
| F-031 | CRITICAL | OPEN | Y | Transfer-table endpoint has NO tenant_id check | server/routers/orders.ts:1265 |
| F-032 | CRITICAL | OPEN | Y | Merge-tables endpoint has NO tenant_id check | server/routers/orders.ts:1295-1305 |
| F-033 | CRITICAL | OPEN | Y | Split-bill endpoint has NO tenant_id check | server/routers/orders.ts:1331 |
| F-034 | CRITICAL | OPEN | Y | Coordination status update: no optimistic lock + no transition validation | server/routers/service-coordination.ts:68-137 |
| F-066 | CRITICAL | OPEN | Y | IDOR transfer-table: WHERE id=$1, no tenant_id | server/routers/orders.ts:1265,1271 |
| F-067 | CRITICAL | OPEN | Y | IDOR merge-tables: WHERE id=$1, no tenant_id | server/routers/orders.ts:1295-1305 |
| F-068 | CRITICAL | OPEN | Y | IDOR split-bill: WHERE orderId=$1, no tenant_id | server/routers/orders.ts:1331-1335 |
| F-069 | CRITICAL | OPEN | Y | IDOR loyalty: uses x-tenant-id header instead of user.tenantId | server/routers/customers.ts:150-227 |
| F-191 | CRITICAL | OPEN | N | No distributed job coordination — duplicate emails/inserts/events per instance | (all schedulers) |
| F-001 | CRITICAL | CLOSED | Y | ENCRYPTION_KEY (64-char hex) hardcoded in .replit | .replit:54 |
| F-023 | CRITICAL | CLOSED | Y | Owner can self-set tenants.plan via PATCH /api/tenant, bypass Stripe | server/routers/tenant.ts:35,47 |
| F-131 | CRITICAL | CLOSED | Y | Circuit breaker reset registered without auth (overrode admin version) | server/index.ts:212-223 |
| F-189 | CRITICAL | CLOSED | Y | Aggregator webhook reads HMAC headers but never validates them | server/routers/channels.ts:179-254 |
| F-217 | CRITICAL | CLOSED | Y | ENCRYPTION_KEY + VAPID_PRIVATE_KEY in git history since initial commits | commits e523dfa, 280047f |
| F-003 | HIGH | OPEN | Y | Owner session cookie + CSRF token committed to repo | .auth/owner.json:1-25 |
| F-004 | HIGH | OPEN | Y | Manager session cookie + CSRF token committed to repo | .auth/manager.json:1-22 |
| F-005 | HIGH | OPEN | Y | Kitchen session cookie + CSRF token committed to repo | .auth/kitchen.json:1-22 |
| F-011 | HIGH | OPEN | Y | POST /api/admin/circuit-breakers/reset has NO auth (see also F-131) | server/index.ts:212-223 |
| F-012 | HIGH | OPEN | Y | Razorpay key/secret stored as plaintext text columns in tenants | shared/schema.ts:122-123 |
| F-016-FU | HIGH | OPEN | Y | KDS wall frontend still passes ?tenantId= in WS / HTTP requests | client/src/pages/dashboards/kds-wall.tsx:834-844, kitchen.tsx:1639 |
| F-024 | HIGH | OPEN | Y | No password policy at registration — validatePasswordPolicy never called | server/routers/auth.ts:76 |
| F-025 | HIGH | OPEN | Y | Onboarding PATCH uses requireAuth only — any staff can modify tenant | server/routers/billing.ts:16-65 |
| F-026 | HIGH | OPEN | Y | Default staff password "demo123"; plaintext password sent via email | server/routers/users.ts:49,66 |
| F-027 | HIGH | OPEN | Y | No UNIQUE constraint on email_hash — concurrent duplicate emails | shared/schema.ts:168 |
| F-035 | HIGH | OPEN | Y | Order creation (order+items+table) NOT wrapped in transaction | server/routers/orders.ts:590-689 |
| F-036 | HIGH | OPEN | Y | No guard against concurrent orders for same table | server/routers/orders.ts:687-689 |
| F-037 | HIGH | OPEN | Y | KDS stock deduction without SELECT FOR UPDATE — stale read race | server/routers/kitchen.ts:274-281 |
| F-038 | HIGH | OPEN | Y | Selective item start deducts inventory fire-and-forget | server/routers/kitchen.ts:734-737 |
| F-042 | HIGH | OPEN | Y | Bill totals trusted from client at creation — no server recalculation | server/routers/restaurant-billing.ts:212-213 |
| F-043 | HIGH | OPEN | Y | Payment recording not transactional — crash leaves inconsistent state | server/routers/restaurant-billing.ts:518-570 |
| F-044 | HIGH | OPEN | Y | Razorpay webhook + polling double-finalization race | server/index.ts:85 + restaurant-billing.ts:1186 |
| F-045 | HIGH | OPEN | Y | Razorpay HMAC uses === (non-constant-time) — timing attack | server/razorpay.ts:113 |
| F-046 | HIGH | OPEN | Y | No IGST support — only CGST/SGST; non-compliant for inter-state India | server/routers/restaurant-billing.ts:281-303 |
| F-055 | HIGH | OPEN | Y | WebSocket ?tenantId= grants full event stream with no session auth | server/realtime.ts:196-199 |
| F-059 | HIGH | OPEN | Y | UAE tenants get no sequential invoice number — FTA non-compliant | server/routers/restaurant-billing.ts:281 |
| F-060 | HIGH | OPEN | Y | TRN from outlets not included on bills/receipts (UAE VAT) | (not propagated) |
| F-072 | HIGH | OPEN | Y | KOT events by orderId: getKotEventsByOrder has no tenant_id | server/routers/kitchen.ts:530 |
| F-076 | HIGH | OPEN | Y | getStockMovementsByOrder has no tenant_id (defense-in-depth gap) | server/storage.ts:1895-1897 |
| F-087 | HIGH | OPEN | Y | printer-service: 11 queries fetch orders/bills/items by ID, no tenant | server/services/printer-service.ts:237-543 |
| F-088 | HIGH | OPEN | Y | time-logger: 5 UPDATE queries on order_items without tenant_id | server/services/time-logger.ts:220-285 |
| F-089 | HIGH | OPEN | Y | resource-service recalculate: 5 queries by resource_id only | server/services/resource-service.ts:6-46 |
| F-090 | HIGH | OPEN | Y | bulk-start-order inventory SELECT+UPDATE by PK only, no tenant_id | server/services/bulk-start-order.ts:82-89 |
| F-103 | HIGH | OPEN | Y | Razorpay webhook does NOT compare gateway amount to local total | server/index.ts:95 + restaurant-billing.ts:1195 |
| F-107 | HIGH | OPEN | Y | All report queries SUM monetary cols across outlets w/o currency grouping | server/routers/reports.ts:58-67,101-109,128-139 |
| F-112 | HIGH | OPEN | Y | Main dashboard totalRevenue sums across all outlets w/o currency | server/routers/staff.ts:78 + storage.ts:1459-1462 |
| F-113 | HIGH | OPEN | Y | Analytics summary totalRevenue/netRevenue cross-currency | server/routers/staff.ts:97 + storage.ts:1526-1530 |
| F-114 | HIGH | OPEN | Y | Labour cost % uses cross-currency totalSales as denominator | server/routers/workforce.ts:54,168 |
| F-116 | HIGH | OPEN | Y | 15+ SQL SUM queries on monetary cols scoped to tenant_id only | (multiple files) |
| F-117 | HIGH | OPEN | Y | 14 monetary numeric() columns have NO precision/scale | shared/schema.ts (14 columns) |
| F-118 | HIGH | OPEN | Y | promotionRules stores discountValue/maxDiscount/minOrderAmount as text | shared/schema.ts:2544,2551,2552 |
| F-132 | HIGH | OPEN | Y | 8 prep-notification/assignment endpoints lack requireAuth | server/routers/prep-notifications.ts:16-133 |
| F-145 | HIGH | OPEN | Y | PIN login (10k combos) under 120 req/min general limiter, not auth limiter | server/security.ts:132-133 |
| F-156 | HIGH | OPEN | Y | TOTP secrets stored as plaintext in users.totp_secret | shared/schema.ts:148 + auth.ts:435 |
| F-157 | HIGH | OPEN | Y | Recovery codes stored as plaintext text array | shared/schema.ts:150 + auth.ts:452 |
| F-158 | HIGH | OPEN | Y | Password change does NOT invalidate other sessions | server/routers/auth.ts:479-506 |
| F-166 | HIGH | OPEN | Y | No connection limits on WebSocket — DoS via connection exhaustion | server/realtime.ts:172+ |
| F-167 | HIGH | OPEN | N | No routeAndPrint() on direct order creation; KOT print delayed up to 30s | server/routers/orders.ts:699-743 |
| F-168 | HIGH | OPEN | N | No crash recovery for KOTs — server crash means kitchen never notified | server/routers/orders.ts:592-743 |
| F-169 | HIGH | OPEN | N | Print jobs abandoned after 3 failed attempts; no alerting | server/services/printer-service.ts:172,708 |
| F-187 | HIGH | OPEN | Y | No rate limit on SMS sends — unlimited Twilio/MSG91 charges possible | server/routers/tables.ts:295 |
| F-190 | HIGH | OPEN | Y | Aggregator webhook LIMIT 1 on platform slug — misroutes orders | server/routers/channels.ts:210-213 |
| F-192 | HIGH | OPEN | N | Coordination rules capped at LIMIT 100 tenants with no ORDER BY | server/services/coordination-rules.ts:26 |
| F-193 | HIGH | OPEN | N | Daily report emails have no dedup — multi-instance sends duplicates | server/services/daily-report-scheduler.ts:70-75 |
| F-194 | HIGH | OPEN | N | Shift digest emails only in-memory dedup; multi-instance dups | server/services/shift-digest-mailer.ts:237-292 |
| F-211 | HIGH | OPEN | Y | Subscription gating ONLY in frontend — no server middleware checks plan | client/src/App.tsx:146-187 |
| F-212 | HIGH | OPEN | Y | PII (customerName, customerPhone) persists in localStorage after logout | client/src/pages/modules/pos.tsx:163,215,202-207 |
| F-219 | HIGH | OPEN | Y | .dockerignore does not exclude .env, .auth/, .replit | Dockerfile + .dockerignore |
| F-220 | HIGH | OPEN | N | No CI/CD, no automated tests, no SAST/DAST, no npm audit | (absent) |
| F-221 | HIGH | OPEN | Y | Slow query logger dumps query params (200 chars) — can contain PII | server/lib/query-logger.ts:51-53 |
| F-222 | HIGH | OPEN | Y | Seed output logs "all passwords: demo123" and kiosk demo tokens | server/seed.ts:1639-1648 |
| F-002 | HIGH | CLOSED | Y | VAPID public + private keys hardcoded in .replit | .replit:55-56 |
| F-016 | HIGH | CLOSED | Y | WebSocket accepts ?tenantId= query with no session auth | server/realtime.ts:196-199 |
| F-070 | HIGH | CLOSED | Y | Menu category PATCH: no tenant_id (cross-tenant modification) | server/routers/menu.ts:28-29 |
| F-071 | HIGH | CLOSED | Y | Menu category DELETE: no tenant_id (cross-tenant deletion) | server/routers/menu.ts:35-36 |
| F-073 | HIGH | CLOSED | Y | updateOrder() WHERE clause has no tenant_id | server/storage.ts:1164-1170 |
| F-074 | HIGH | CLOSED | Y | getBill() no tenant_id; public receipt endpoint exposed bill data | server/storage.ts:2695-2698 |
| F-075 | HIGH | CLOSED | Y | getOrderItemsByOrder() has no tenant_id | server/storage.ts:1172-1174 |
| F-120 | HIGH | CLOSED | Y | GST rate defaults inconsistent: orders cgstRate\|\|0, billing ??9 | restaurant-billing.ts:282 vs orders.ts:557 |
| F-121 | HIGH | CLOSED | Y | Bill creation trusts ALL client-submitted monetary values | server/routers/restaurant-billing.ts:213-340 |
| F-136 | HIGH | CLOSED | Y | GET /api/kds/wall-tickets accepts ?tenantId= — full active order stream | server/routers/kitchen.ts:576-615 |
| F-218 | HIGH | CLOSED | Y | Session cookies for owner/manager/kitchen committed in git history | commit 12fc00b |
| F-006 | MEDIUM | OPEN | Y | .auth/ not gitignored — pattern *.cookies.txt.auth/ is malformed | .gitignore:8 |
| F-013 | MEDIUM | OPEN | Y | Prep notification read endpoints require NO auth | server/routers/prep-notifications.ts |
| F-014 | MEDIUM | OPEN | Y | POST /api/cash-sessions/calculate-change requires no auth | server/routers/cash-machine.ts |
| F-015 | MEDIUM | OPEN | Y | GET /api/tips/config/:outletId requires no auth — exposes tip config | server/routers/tip-management.ts |
| F-020 | MEDIUM | OPEN | Y | CSP allows 'unsafe-inline' and 'unsafe-eval' in script-src | server/security.ts:42 |
| F-023-FU | MEDIUM | OPEN | Y | OWNER_EDITABLE_FIELDS allowlist needs unit test on schema change | server/lib/tenant-fields.ts:14 |
| F-028 | MEDIUM | OPEN | Y | Onboarding: no validation on currency (not ISO 4217), taxRate, serviceCharge | server/routers/billing.ts:38-47 |
| F-029 | MEDIUM | OPEN | Y | Duplicate onboarding-complete endpoints with different auth levels | server/routers/onboarding.ts vs billing.ts |
| F-030 | MEDIUM | OPEN | N | Slug uniqueness DB-only — unhelpful 500 on collision | server/routers/auth.ts:58-60 |
| F-039 | MEDIUM | OPEN | Y | No optimistic locking on order_items — concurrent KDS last-write-wins | (order_items schema) |
| F-040 | MEDIUM | OPEN | Y | Table freeing on payment is outside the transaction | server/routers/orders.ts:1054-1057 |
| F-041 | MEDIUM | OPEN | Y | No status transition state machine on main order PATCH | server/routers/orders.ts:797 |
| F-047 | MEDIUM | OPEN | Y | Payment sum tolerance ±1.01 — generous for high-value currencies | server/routers/restaurant-billing.ts:437 |
| F-048 | MEDIUM | OPEN | Y | Split payment race — no bill-level lock | server/routers/restaurant-billing.ts:518-570 |
| F-049 | MEDIUM | OPEN | Y | Tip accumulation race on concurrent split payments | server/routers/restaurant-billing.ts:574 |
| F-050 | MEDIUM | OPEN | Y | Razorpay webhook secret is global, not per-tenant | server/razorpay.ts:111 |
| F-051 | MEDIUM | OPEN | Y | Invoice numbers only for Indian GST, not UAE VAT | server/routers/restaurant-billing.ts:281 |
| F-052 | MEDIUM | OPEN | Y | Tip pool rounding shortfall (100/3 = 33.33×3 = 99.99) | server/services/tip-service.ts:107 |
| F-053 | MEDIUM | OPEN | Y | Refund not transactional — gateway succeeds but local can fail | server/routers/restaurant-billing.ts:803-955 |
| F-054 | MEDIUM | OPEN | Y | Platform Stripe secret stored in DB platform_settings table | server/stripe.ts:10 |
| F-056 | MEDIUM | OPEN | Y | No role-based WS event filtering — all events to all sockets | server/realtime.ts:38-57 |
| F-061 | MEDIUM | OPEN | Y | No IGST for inter-state Indian GST (duplicate of F-046) | server/routers/restaurant-billing.ts:282-295 |
| F-062 | MEDIUM | OPEN | Y | HSN codes on menu_items not propagated to invoice line items | shared/schema.ts + restaurant-billing.ts:297 |
| F-063 | MEDIUM | OPEN | Y | No e-invoicing integration (India e-way bill, UAE FTA) | (absent) |
| F-064 | MEDIUM | OPEN | Y | Static hardcoded exchange rates — wrong conversions | shared/currency.ts:41-66 |
| F-084 | MEDIUM | OPEN | Y | Guest session/cart functions have no tenant_id (UUID obscurity) | server/storage.ts:2495-2497,2507,2519,2523 |
| F-085 | MEDIUM | OPEN | Y | getKotEventsByOrder has no tenant_id (kitchen.ts caller) | server/storage.ts:2651-2653 |
| F-086 | MEDIUM | OPEN | Y | updateOrderItemCooking has no tenant_id | server/storage.ts:3251-3265 |
| F-091 | MEDIUM | OPEN | Y | UPDATE orders by PK only (advance-order-scheduler) | server/services/advance-order-scheduler.ts:24-26 |
| F-092 | MEDIUM | OPEN | Y | 3 UPDATE queries (bills/tip_distributions/bill_tips) by PK only | server/services/tip-service.ts:68-70,144-166 |
| F-093 | MEDIUM | OPEN | Y | SQL string interpolation: INTERVAL '${settings.unassignedTimeoutMin}' | server/services/chef-assignment.ts:585 |
| F-094 | MEDIUM | OPEN | Y | S3/local file paths have no tenant prefix; deleteFile accepts arbitrary URL | server/services/file-storage.ts:29,51 |
| F-095 | MEDIUM | OPEN | Y | Impersonation accessMode not validated — non-READ_ONLY skips check | server/admin-routes.ts:139,367 |
| F-096 | MEDIUM | OPEN | Y | POST /api/ad-impressions accepts tenantId from req.body (unauth) | server/routers/ads.ts:602-604 |
| F-101 | MEDIUM | OPEN | Y | Math.round(amount * 100) floating-point risk on minor-unit conv | server/razorpay.ts:60 |
| F-102 | MEDIUM | OPEN | Y | Dual-default currency chain: Razorpay→INR, caller→AED | server/razorpay.ts:63 + restaurant-billing.ts:1092 |
| F-105 | MEDIUM | OPEN | Y | Stripe checkout.session.completed: no amount verify against order total | server/routers/billing.ts:258-294 |
| F-106 | MEDIUM | OPEN | Y | amount*100 fails for JPY, KRW, BHD (0/3 decimal currencies) | server/razorpay.ts:60 + restaurant-billing.ts:1090-1092 |
| F-108 | MEDIUM | OPEN | Y | outletId param accepted but NOT passed to compute fns — filter ignored | server/routers/reports.ts:439-443 |
| F-109 | MEDIUM | OPEN | Y | QuickBooks/Xero exports omit currency — invalid for multi-currency | server/routers/reports.ts:622-691 |
| F-110 | MEDIUM | OPEN | Y | Daily email sums revenue across outlets, displays no currency | server/services/daily-report-scheduler.ts:33,52 |
| F-111 | MEDIUM | OPEN | Y | All analytics helper functions lack currency awareness | server/analytics-helpers.ts:1-248 |
| F-115 | MEDIUM | OPEN | Y | Default hourly rates hardcoded without currency context | server/routers/workforce.ts:13 |
| F-119 | MEDIUM | OPEN | Y | Loyalty tier thresholds stored as integer — truncates fractional currency | shared/schema.ts:5922,5923,5946 |
| F-122 | MEDIUM | OPEN | Y | Payment-time tax validation uses client-tampered bill.subtotal | server/routers/restaurant-billing.ts:445-466 |
| F-123 | MEDIUM | OPEN | Y | Per-item prices not rounded after modifier — float drift | server/routers/orders.ts:492,504 |
| F-124 | MEDIUM | OPEN | Y | manualDiscountAmount accepted from client without server-side cap | server/routers/orders.ts:546 |
| F-125 | MEDIUM | OPEN | Y | Only 6/24 currencies have denomination/rounding configs (no JPY) | shared/currency.ts:160-167 |
| F-126 | MEDIUM | OPEN | Y | applyRounding for ROUND_0.05/0.25 produces float artifacts | shared/currency.ts:171-172 |
| F-127 | MEDIUM | OPEN | Y | convertCurrency() result not rounded to target decimals | shared/currency.ts:138 |
| F-128 | MEDIUM | OPEN | Y | Parking charge added to bill total without updating taxAmount | server/services/parking-charge-service.ts:141-142 |
| F-133 | MEDIUM | OPEN | Y | PATCH /api/tip-settings: no requireAuth, no role check | server/routers/restaurant-billing.ts:1367-1392 |
| F-134 | MEDIUM | OPEN | Y | GET /api/tip-settings: no requireAuth — bypasses idle timeout | server/routers/restaurant-billing.ts:1352-1363 |
| F-135 | MEDIUM | OPEN | Y | GET /api/tips/config/:outletId completely unauthenticated | server/routers/tip-management.ts:124-137 |
| F-141 | MEDIUM | OPEN | Y | Webhook tokens default to hardcoded "zomato-webhook-token" etc. | server/routers/service-coordination.ts:734,750,766 |
| F-143 | MEDIUM | OPEN | Y | POST /api/auth/pin-login not in CSRF exemption list | server/security.ts:198-211 |
| F-146 | MEDIUM | OPEN | Y | Forgot-password under 120/min general limiter — email bombing | server/security.ts:132-133 |
| F-149 | MEDIUM | OPEN | Y | In-memory rate limiter fallback bypassed in multi-instance deployment | server/security.ts:96-116 |
| F-150 | MEDIUM | OPEN | Y | Amount threshold check in can() is a no-op (re-checks same condition) | server/permissions.ts:36-38 |
| F-151 | MEDIUM | OPEN | Y | franchise_owner has identical permissions (35/35) to owner | shared/permissions-config.ts:68-77 |
| F-153 | MEDIUM | OPEN | Y | User enumeration: "deactivated" vs "Invalid credentials" message split | server/auth.ts:169 |
| F-154 | MEDIUM | OPEN | Y | TOTP prompt leaks userId in response body before 2FA completes | server/routers/auth.ts:140 |
| F-155 | MEDIUM | OPEN | Y | PIN login completely bypasses TOTP/2FA (mitigated by role limit) | server/routers/auth.ts:653-735 |
| F-159 | MEDIUM | OPEN | Y | Password change endpoint does not use requireFreshSession | server/routers/auth.ts:479 |
| F-160 | MEDIUM | OPEN | Y | Logout does not call req.session.destroy() — row persists 30 days | server/routers/auth.ts:313-322 |
| F-161 | MEDIUM | OPEN | Y | No email verification at registration — unverified email used for reset | server/routers/auth.ts:20-123 |
| F-162 | MEDIUM | OPEN | Y | TOTP/2FA entirely optional — no enforcement for owner/admin | (absent) |
| F-163 | MEDIUM | OPEN | Y | No CAPTCHA on any auth endpoint (register, login, forgot-password) | (absent) |
| F-170 | MEDIUM | OPEN | N | No event deduplication on client — duplicate events cause UI glitches | client/src/hooks/use-realtime.ts:105-117 |
| F-171 | MEDIUM | OPEN | N | No offline event delivery or catch-up — events during disconnect lost | server/realtime.ts (architecture) |
| F-172 | MEDIUM | OPEN | Y | Reconnection storm: all clients retry 1s after restart, no jitter | client/src/hooks/use-realtime.ts:135 + server/realtime.ts:172 |
| F-173 | MEDIUM | OPEN | N | Redis local fallback psubscribe broken — EventEmitter no wildcards | server/services/pubsub.ts:83 |
| F-174 | MEDIUM | OPEN | N | Duplicate print job records — both INSERT for same order | server/routers/orders.ts:706 + printer-service.ts:308 |
| F-175 | MEDIUM | OPEN | N | getNextKotSequence read-then-write without locking | server/routers/print-jobs.ts:14-18 |
| F-176 | MEDIUM | OPEN | N | KDS start: stock deduction in tx but item/order status outside | server/routers/kitchen.ts:272 vs 317-323 |
| F-180 | MEDIUM | OPEN | Y | Stripe checkout guest path re-executes table/session release on retry | server/routers/billing.ts:276-293 |
| F-182 | MEDIUM | OPEN | N | All email sends silently swallow SMTP errors | server/services/email-service.ts:45-48 |
| F-183 | MEDIUM | OPEN | Y | Staff invite sends temp password in email body over potentially unencrypted SMTP | server/services/email-service.ts:121,131 |
| F-184 | MEDIUM | OPEN | N | SMS regex /[^+d]/g strips digits instead of non-digits | server/services/sms-gateway.ts:44 |
| F-185 | MEDIUM | OPEN | Y | Full phone numbers and SMS content stored in sms_log unencrypted | server/services/sms-gateway.ts:50-51 |
| F-189-FU | MEDIUM | OPEN | Y | Aggregator webhook HMAC over re-stringified JSON, not raw bytes | server/routers/channels.ts:216 |
| F-189-FU2 | MEDIUM | OPEN | Y | Razorpay HMAC uses === instead of crypto.timingSafeEqual (= F-045) | server/razorpay.ts:113 |
| F-195 | MEDIUM | OPEN | N | No overlap prevention on any scheduler | (all setInterval jobs) |
| F-196 | MEDIUM | OPEN | N | Chef escalation has no dedup — re-emits every 60s | server/services/chef-assignment.ts:574-601 |
| F-197 | MEDIUM | OPEN | N | In-memory dedup Sets/Maps grow without bound | shift-digest-mailer.ts:235 + alert-engine.ts:141 + prep-deadline-checker.ts:8 |
| F-198 | MEDIUM | OPEN | N | startUnclockdInChecker has empty catch — errors silently swallowed | server/services/alert-engine.ts:187 |
| F-199 | MEDIUM | OPEN | Y | Ad creative upload allows text/html MIME — stored XSS if served inline | server/routers/ads.ts:47 |
| F-200 | MEDIUM | OPEN | Y | S3 files returned as permanent public URLs — no signed URLs, no expiry | server/services/file-storage.ts:45 |
| F-201 | MEDIUM | OPEN | N | isRedisEnabled() checks env var only, not connection health | server/services/pubsub.ts:9-10 |
| F-202 | MEDIUM | OPEN | N | No Redis key prefix — environment collision risk | server/services/pubsub.ts |
| F-205 | MEDIUM | OPEN | Y | document.write(data.html) writes server HTML to print popup, no sanitize | client/src/components/pos/BillPreviewModal.tsx:2105 |
| F-206 | MEDIUM | OPEN | Y | Payment method names interpolated into HTML template w/o escaping | client/src/components/pos/PosSessionModal.tsx:150 |
| F-207 | MEDIUM | OPEN | Y | 8+ user-input fields interpolated into print popup HTML w/o escaping | client/src/pages/modules/parking.tsx:292-312 |
| F-208 | MEDIUM | OPEN | Y | Raw server error messages displayed verbatim in toasts (40+ files) | (40+ client files) |
| F-214 | MEDIUM | OPEN | Y | localStorage keys NOT scoped per user/tenant — cross-user data leak | client/src/pages/modules/pos.tsx:163-164 |
| F-215 | MEDIUM | OPEN | N | Fire-and-forget PATCH on order recall — server/client diverge silently | client/src/pages/modules/pos.tsx:1084,1127 |
| F-223 | MEDIUM | OPEN | Y | PostgreSQL credentials hardcoded as postgres:postgres in compose | docker-compose.yml:14 |
| F-224 | MEDIUM | OPEN | N | JWT_SECRET / JWT_EXPIRES_IN documented but JWT never used (dead config) | .env.example:17-18 |
| F-225 | MEDIUM | OPEN | N | 5 env vars used in code but missing from .env.example | .env.example vs code |
| F-226 | MEDIUM | OPEN | N | 9 env vars documented but unused in code | .env.example:73,79-80,82-84 |
| F-227 | MEDIUM | OPEN | N | No APM, no metrics, no error tracking, no uptime monitoring, no alerting | (absent) |
| F-228 | MEDIUM | OPEN | N | No DB backup automation, no restore procedure, no RPO/RTO | (absent) |
| F-077 | MEDIUM | CLOSED | Y | getCategory/updateCategory/deleteCategory had no tenant_id | server/storage.ts:977-990 |
| F-078 | MEDIUM | CLOSED | Y | getUser had no tenant_id (timing side-channel) | server/storage.ts:932-935 |
| F-079 | MEDIUM | CLOSED | Y | getOutlet had no tenant_id (timing side-channel) | server/storage.ts:958-961 |
| F-080 | MEDIUM | CLOSED | Y | getCashSession had no tenant_id | server/storage.ts:3724-3727 |
| F-081 | MEDIUM | CLOSED | Y | getValetTicket had no tenant_id | server/storage.ts:4692-4695 |
| F-082 | MEDIUM | CLOSED | Y | getPosSession had no tenant_id | server/storage.ts:2742-2744 |
| F-083 | MEDIUM | CLOSED | Y | getOutletCurrencySettings cross-tenant read/write | server/storage.ts:3884-3888 |
| F-121-FU | MEDIUM | CLOSED | Y | PATCH /api/order-items passed req.body directly — no allowlist | server/routers/orders.ts:1164-1168 |
| F-009 | LOW | OPEN | N | Dual lockfiles: package-lock.json + bun.lock; Dockerfile uses npm | (root) |
| F-017 | LOW | OPEN | Y | Account lockout state in-memory Map — resets on restart | server/auth.ts:15-41 |
| F-058 | LOW | OPEN | Y | Wall screen token is static bearer — permanent until rotated | server/realtime.ts:187-188 |
| F-065 | LOW | OPEN | Y | Bills lack currency column — derived from tenant at display time | (bills schema) |
| F-097 | LOW | OPEN | Y | salesInquiries/supportTickets accumulate PII; no retention/admin UI | server/routers/contact.ts + storage.ts:7-27,1577-1587 |
| F-098 | LOW | OPEN | Y | 7 admin GET/POST endpoints skip requireFreshSession | server/admin-routes.ts:606,1236,1609,1408,1477,2293,2332 |
| F-099 | LOW | OPEN | Y | No rate limiting on admin API endpoints | server/admin-routes.ts |
| F-100 | LOW | OPEN | N | invalidateByTenant looks for tenantId: prefix but keys are outletId | server/lib/menu-cache.ts:39-47 |
| F-104 | LOW | OPEN | N | stripe-replit-sync import on Railway — Replit dead code | server/stripeClient.ts:29-42 |
| F-129 | LOW | OPEN | Y | Inconsistent precision across tables (decimal(10,2) vs (12,2)) | shared/schema.ts (multiple) |
| F-137 | LOW | OPEN | Y | POST /api/packing/calculate: no auth (pure calculation) | server/routers/packing-charges.ts:126-155 |
| F-148 | LOW | OPEN | Y | No elevated rate limiting on admin endpoints | server/admin-routes.ts |
| F-152 | LOW | OPEN | Y | requirePermission system largely unused — most routes use requireRole | (multiple router files) |
| F-164 | LOW | OPEN | Y | Static hardcoded salt "table-salt-encryption-v1" for scrypt KDF | server/encryption.ts:6 |
| F-165 | LOW | OPEN | Y | Decrypt failure returns ciphertext as-is (no crash) — silent leak | server/encryption.ts:51-53 |
| F-177 | LOW | OPEN | N | Retry worker only handles NETWORK_IP — USB/BLUETOOTH/CLOUD stuck | server/services/printer-service.ts:716 |
| F-178 | LOW | OPEN | N | Cloud printer handler is stub (console.log only) | server/services/printer-service.ts:76-80 |
| F-179 | LOW | OPEN | N | fireAutoAssign/fireKdsArrival swallow all errors silently | server/routers/orders.ts:28,84-85 |
| F-181 | LOW | OPEN | N | New SMTP transport per email send — no connection pooling | server/services/email-service.ts:32 |
| F-186 | LOW | OPEN | N | SMS SQL INSERT uses (,,,,,,) without param markers — query always fails | server/services/sms-gateway.ts:50 |
| F-188 | LOW | OPEN | N | sendPushToTenant fires all push in parallel, no concurrency limit | server/services/push-sender.ts:116-133 |
| F-203 | LOW | OPEN | N | Circuit breaker trips on single failure (no min sample size) | server/lib/circuit-breaker.ts |
| F-204 | LOW | OPEN | N | Cron jobs fire at server local time, not tenant timezone | (3 schedulers) |
| F-216 | LOW | OPEN | N | No aria-live regions for real-time order/KDS updates | client/src/pages/modules/pos.tsx + KDS pages |
| F-229 | LOW | OPEN | N | No resource limits (CPU/memory) on containers | docker-compose.yml |
| F-230 | LOW | OPEN | N | Build allowlist includes 13 packages not in package.json (dead config) | script/build.ts:7-33 |
| F-007 | INFO | OPEN | N | No CI/CD pipeline | (root) |
| F-008 | INFO | OPEN | N | No linting (ESLint), no formatting (Prettier), no pre-commit hooks | (root) |
| F-010 | INFO | OPEN | N | Four hotpatch scripts at repo root suggest live-patching outside deploy | (root) |
| F-018 | INFO | OPEN | N | Password hashing uses scrypt (not bcrypt); bcrypt may be unused | server/auth.ts:49-53 |
| F-019 | INFO | OPEN | N | emitToTenantManagers() defined but never called — dead code | server/realtime.ts:114-132 |
| F-021 | INFO | OPEN | N | OPENAI/Cloudinary/Google env vars documented but no code | .env.example:73-74 |
| F-057 | INFO | OPEN | N | emitToTenantManagers() defined but never called (duplicate of F-019) | server/realtime.ts:114-132 |
| F-130 | INFO | OPEN | Y | All monetary arithmetic uses JS IEEE 754 doubles | (all monetary computation) |
| F-209 | INFO | OPEN | N | dangerouslySetInnerHTML in chart — not exploitable per author | client/src/components/ui/chart.tsx:79 |
| F-210 | INFO | OPEN | N | Service worker correctly excludes /api/ and /ws — no sensitive cache | client/public/sw.js:22-24 |
| F-231 | INFO | OPEN | N | Patch scripts are source-code modification tools, not runtime patches | (repo root) |

---

## Open Questions (audit/OPEN-QUESTIONS.md)

| ID | Severity¹ | Status | Launch-relevant | One-line description | Source |
|----|-----------|--------|-----------------|----------------------|--------|
| Q-003 | HIGH | OPEN | Y | Is .replit ENCRYPTION_KEY the same as production? | (Phase 0) |
| Q-006 | HIGH | OPEN | Y | Are .auth/*.json session cookies still valid? (~2026-04-20 expiry) | (Phase 0) |
| Q-009 | HIGH | OPEN | Y | Is /admin/circuit-breakers/reset intentionally unauthenticated? | server/index.ts:212 |
| Q-011 | HIGH | OPEN | Y | Are Razorpay creds in tenants encrypted at rest? (partially answered Q-051: NO) | shared/schema.ts |
| Q-012 | HIGH | OPEN | Y | Why does WebSocket accept bare ?tenantId= with no session? | server/realtime.ts:196-199 |
| Q-016 | HIGH | OPEN | Y | Does seedDatabase() run in production? (8 demo123 users if yes) | (Phase 2) |
| Q-019 | HIGH | OPEN | Y | Are transfer/merge/split-bill endpoints (1257-1359) reachable from UI? | server/routers/orders.ts |
| Q-021 | HIGH | OPEN | Y | Is there bill-level locking to prevent split-payment overrun? | server/routers/restaurant-billing.ts:518-570 |
| Q-022 | HIGH | OPEN | Y | Are UAE restaurants required to produce FTA-compliant invoices? | (Phase 2) |
| Q-024 | HIGH | OPEN | Y | Is there a reverse proxy / API gateway enforcing tenant isolation? | (Phase 3) |
| Q-025 | HIGH | OPEN | Y | Are transfer/merge/split-bill (orders.ts:1257-1359) reachable? (dup of Q-019) | server/routers/orders.ts |
| Q-026 | HIGH | OPEN | Y | Why does loyalty config use x-tenant-id header instead of user.tenantId? | server/routers/customers.ts:150-227 |
| Q-027 | HIGH | OPEN | Y | Are tenant UUIDs secret? Determines F-055 exploitability | (Phase 3) |
| Q-028 | HIGH | OPEN | Y | Is outlets.assignment_settings JSONB user-writable via PATCH /outlets/:id? | server/routers/outlets.ts |
| Q-029 | HIGH | OPEN | Y | Reverse proxy / API gateway enforcing tenant isolation? (dup of Q-024) | (Phase 3) |
| Q-032 | HIGH | OPEN | Y | Does any tenant currently operate outlets in multiple currencies? | (Phase 4) |
| Q-035 | HIGH | OPEN | Y | Is server/index.ts:64-106 the only Razorpay webhook handler? | server/index.ts |
| Q-038 | HIGH | OPEN | Y | Is manualDiscountAmount validated client-side? (no server cap → exploitable?) | (Phase 4) |
| Q-040 | HIGH | OPEN | Y | Is convertCurrency() used for financial calc, or only display? | shared/currency.ts |
| Q-041 | HIGH | OPEN | Y | Do any tenants have outlets configured with different currencyCode values? | (Phase 4) |
| Q-048 | HIGH | OPEN | Y | Should password change invalidate other sessions like password reset does? | server/routers/auth.ts:479 |
| Q-058 | HIGH | OPEN | Y | How are tenants with own Razorpay creds supposed to receive webhooks? | (Phase 7) |
| Q-060 | HIGH | OPEN | Y | How should aggregator webhooks route when multiple tenants share platform? | server/routers/channels.ts:210-213 |
| Q-067 | HIGH | OPEN | Y | Is the S3 bucket configured as public-read? (F-200 impact) | (Phase 7) |
| Q-068 | HIGH | OPEN | Y | Is REDIS_URL set in production? (rate limit/pubsub/lockout cross-instance?) | (Phase 7) |
| Q-073 | HIGH | OPEN | Y | Are tenant UUIDs visible in guest QR URLs or other public channels? | (Phase 8) |
| Q-074 | HIGH | OPEN | Y | Does ANY server middleware enforce subscription plan restrictions? | (Phase 8) |
| Q-075 | HIGH | OPEN | Y | Are loyalty tier discount % validated server-side, or only client? | (Phase 8) |
| Q-078 | HIGH | OPEN | Y | Has SESSION_SECRET been rotated since commit 12fc00b? | (Phase 9) |
| Q-079 | HIGH | OPEN | Y | Has ENCRYPTION_KEY been rotated since commit e523dfa? | (Phase 9) |
| Q-010 | MEDIUM | OPEN | Y | Are 7 global tables (no tenant_id) properly access-controlled at app layer? | session/platformSettings/etc. |
| Q-014 | MEDIUM | OPEN | Y | Does any router path overlap between tips.ts and tip-management.ts? | (Phase 1) |
| Q-017 | MEDIUM | OPEN | Y | Is plan field on PATCH /api/tenant intentional for admin? (CLOSED via F-023) | (Phase 2) |
| Q-018 | MEDIUM | OPEN | Y | What happens to Stripe customer record on registration partial failure? | (Phase 2) |
| Q-020 | MEDIUM | OPEN | Y | Is promotions engine evaluating server-side or trusting client discounts? | (Phase 2) |
| Q-023 | MEDIUM | OPEN | Y | Are UUIDs used as primary keys throughout the schema? | (Phase 3) |
| Q-030 | MEDIUM | OPEN | Y | How are 24 storage fns without tenant_id actually called? Pre-validating? | (Phase 3) |
| Q-031 | MEDIUM | OPEN | Y | Does impersonation accessMode validation exist outside admin-routes.ts:367? | server/admin-routes.ts |
| Q-033 | MEDIUM | OPEN | Y | Is stripe-replit-sync in package.json deps? | (Phase 4) |
| Q-034 | MEDIUM | OPEN | Y | Are any non-centesimal currencies (JPY, KRW, BHD) configured for any tenant? | (Phase 4) |
| Q-036 | MEDIUM | OPEN | Y | Do QuickBooks/Xero exports get used in production? | (Phase 4) |
| Q-037 | MEDIUM | OPEN | Y | Where is applyRounding() actually called in order/billing flow? | shared/currency.ts |
| Q-039 | MEDIUM | OPEN | Y | Are there tenants with explicitly cgstRate:0, sgstRate:0? | (Phase 4) |
| Q-042 | MEDIUM | OPEN | Y | Is circuit breaker reset intentional for emergency? (CLOSED via F-131) | server/index.ts:212 |
| Q-043 | MEDIUM | OPEN | Y | What's the intended permission distinction between franchise_owner and owner? | shared/permissions-config.ts |
| Q-045 | MEDIUM | OPEN | N | How many Railway instances are deployed in production? | (Phase 5) |
| Q-046 | MEDIUM | OPEN | Y | Are Zomato/Swiggy/UberEats webhook tokens configured in prod env? (partial Q-063) | (Phase 5) |
| Q-047 | MEDIUM | OPEN | Y | Razorpay webhook excluded from CSRF by registration order (works by accident)? | (Phase 5) |
| Q-052 | MEDIUM | OPEN | N | Is there client-side KDS polling that compensates for missed WS events? | (Phase 6) |
| Q-053 | MEDIUM | OPEN | N | Is there startup reconciliation for orders stuck in sent_to_kitchen? | (Phase 6) |
| Q-056 | MEDIUM | OPEN | N | How many WebSocket connections does a typical tenant have at peak? | (Phase 6) |
| Q-059 | MEDIUM | OPEN | N | Has SMS ever successfully worked in production? (regex+SQL bugs) | (Phase 7) |
| Q-064 | MEDIUM | OPEN | N | How many Railway instances are running? (duplicate of Q-045) | (Phase 7) |
| Q-065 | MEDIUM | OPEN | N | What is the current active tenant count? (>100 → F-192 broken) | (Phase 7) |
| Q-066 | MEDIUM | OPEN | N | Is generateAndSaveReport() (stock reports) idempotent? | (Phase 7) |
| Q-069 | MEDIUM | OPEN | Y | Are ad creatives with text/html served with Content-Disposition: attachment? | (Phase 7) |
| Q-070 | MEDIUM | OPEN | Y | Does POST /api/print/receipt/:billId escape user data in HTML response? | (Phase 8) |
| Q-071 | MEDIUM | OPEN | Y | Can users/admins create custom payment method names? | (Phase 8) |
| Q-072 | MEDIUM | OPEN | Y | What error messages does server return in JSON responses? (info disclosure?) | (Phase 8) |
| Q-076 | MEDIUM | OPEN | Y | Is it common for multiple staff to share the same browser on a POS terminal? | (Phase 8) |
| Q-077 | MEDIUM | OPEN | N | Is the deployment actually on Replit (autoscale) or Railway? | (Phase 9) |
| Q-080 | MEDIUM | OPEN | N | Are DB backups managed by hosting provider? (partial answered Q-083) | (Phase 9) |
| Q-002 | LOW | OPEN | N | Which lockfile is canonical — package-lock.json or bun.lock? | (Phase 0) |
| Q-005 | LOW | OPEN | N | How is deployment to Railway triggered? (no railway.json, no CI) | (Phase 0) |
| Q-044 | LOW | OPEN | Y | Is tips.ts (registerTipsRoutes) actually registered? Not imported in routes.ts | (Phase 5) |
| Q-049 | LOW | OPEN | N | Is bcrypt used anywhere other than PIN hashing? (else dependency overweight) | (Phase 5) |
| Q-054 | LOW | OPEN | N | Why are print jobs created twice — route-level AND inside routeAndPrint()? | (Phase 6) |
| Q-055 | LOW | OPEN | N | Max offline duration for a kitchen printer before it becomes Critical? | (Phase 6) |
| Q-057 | LOW | OPEN | N | Is stripe-replit-sync functional on Railway, or fails silently on startup? | (Phase 7) |
| Q-061 | LOW | OPEN | N | How is the team alerted to SMTP outages? | (Phase 7) |
| Q-001 | MEDIUM | CLOSED | Y | Is memorystore used in prod? (answered Q-013: NO, connect-pg-simple is used) | (Phase 0) |
| Q-008 | MEDIUM | CLOSED | N | What is stripe-replit-sync? (answered Q-062: Replit-specific Stripe sync) | (Phase 0) |
| Q-013 | MEDIUM | CLOSED | Y | [Answer record] memorystore NOT used; but remains as unused dep | (Phase 1) |
| Q-015 | HIGH | CLOSED | Y | How does encryption.ts encrypt PII? (answered Q-050: AES-256-GCM + scrypt) | server/encryption.ts |
| Q-050 | HIGH | CLOSED | Y | [Answer record] AES-256-GCM, scrypt KDF, random IVs, GCM auth tags; static salt | server/encryption.ts |
| Q-051 | HIGH | CLOSED | Y | [Answer record] Razorpay creds in tenants are NOT encrypted (only email/phone) | shared/schema.ts |
| Q-062 | LOW | CLOSED | N | [Answer record] stripe-replit-sync manages local stripe.* schema, redundant on Railway | (Phase 7) |
| Q-063 | MEDIUM | CLOSED | Y | [Answer record] hardcoded-token endpoints in service-coordination.ts unused; F-189 is real | (Phase 7) |
| Q-004 | INFO | CLOSED | N | What do 4 patch_*.mjs/.py scripts do? (answered Q-081: source-mod tools, not runtime) | (Phase 0) |
| Q-007 | INFO | CLOSED | N | Is JWT_SECRET used? (answered Q-082: NO, dead config) | (Phase 0) |
| Q-081 | INFO | CLOSED | N | [Answer record] 4 patch scripts are source-modification tools | (Phase 9) |
| Q-082 | INFO | CLOSED | N | [Answer record] JWT_SECRET / JWT_EXPIRES_IN documented but JWT never used | (Phase 9) |
| Q-083 | MEDIUM | CLOSED | N | [Answer record] Railway Pro snapshots enabled 2026-04-30; auto/RPO/RTO still missing | (Phase 9) |

¹ Severity column for Open Questions is **inferred** — the source file has no severity column. Inference is based on (a) the severity of the finding the question implicates, or (b) the domain of the question if no specific finding is named. Treat severity here as a triage hint, not a verified rating.

---

## Triage notes

**1. F-232..F-282 are not in FINDINGS.md.** The biggest contradiction: `audit/00-backlog.md` introduces ~50 new finding IDs (F-232 through F-282, with some gaps) sourced from tester regression sweeps and recon docs from 2026-04-30 onward. None of these are in `FINDINGS.md`. Notable BLOCKING ones absent from FINDINGS.md include F-234 (cross-user same-table claim), F-256 (Settings persistence — partially closed), F-268 (View Bill navigation diverges), F-270 (KDS/receipt server-TZ third-source bug), F-273 (no "already paid" guard, two-tab payment race), F-276 (payment after shift close), F-278 (receipt timestamp ~5.5h off), F-282 (manual discount UI absent). FINDINGS.md row count is frozen at 247 lines while the backlog has continued to grow; the two registers have diverged. Decide whether to (a) backfill F-232..F-282 into FINDINGS.md, (b) keep FINDINGS.md as the "Phase 1–9 systemic audit" register and treat 00-backlog.md as the "live tester findings" register (this is what 00-backlog.md line 166 explicitly states), or (c) merge.

**2. Numbering gaps in FINDINGS.md.** F-138, F-139, F-140, F-142, F-144, F-147 are skipped (the file goes F-137 → F-141 → F-143 → F-145 → F-146 → F-148...). Not necessarily a problem — IDs may have been allocated and discarded — but worth confirming none are dangling references elsewhere.

**3. F-011 vs F-131 status disagreement.** Both rows describe the same vulnerability (`POST /api/admin/circuit-breakers/reset` having no auth in `server/index.ts:212-223`). F-011 (Phase 1) is marked Open; F-131 (Phase 5) for the same lines is marked "Fixed (2026-04-15)". F-011 should probably also be CLOSED, or one of the two should reference the other. Q-009 and Q-042 both ask about this endpoint — both are technically resolved by F-131's closure but the question file has no closure note.

**4. Several findings are duplicates of each other.** F-016 ↔ F-055 (same WebSocket `?tenantId=` bypass — F-016 closed, F-055 still open and identical text). F-019 ↔ F-057 (same `emitToTenantManagers()` dead code, both Info, both Open). F-045 ↔ F-189-FU2 (same Razorpay HMAC `===` issue). F-046 ↔ F-061 (same IGST gap, different severities). F-072 ↔ F-085 (KOT events by orderId no tenant_id — once at the router, once at storage). F-031..F-033 ↔ F-066..F-068 (transfer/merge/split-bill — once under "Multi-Tenancy" Phase 2, once under "IDOR" Phase 3). Triage should consolidate so each fix branch closes a single ID.

**5. Severity inflation in money/currency findings.** Many monetary aggregation findings (F-107, F-112, F-113, F-114, F-116) are marked HIGH on the assumption that some tenant operates multiple currencies. Q-032 / Q-041 explicitly note this is unconfirmed. If no tenant has cross-currency outlets today, the operational severity drops to MEDIUM until that changes — but the latent risk for any new multi-currency tenant remains HIGH. Worth re-classifying after Q-041 is answered.

**6. KOT/print findings are HIGH but not Launch-relevant under our convention.** F-167, F-168, F-169 are HIGH severity but I marked them Launch-relevant N because they're operational reliability, not security/auth/money/tenant. The user's convention list does not cover "kitchen workflow" — these would be classified HIGH-impact pre-launch by a restaurant-domain reviewer even if not security-classed. Flag for human re-review.

**7. F-130 (JS IEEE 754 doubles) is Info severity but money-domain.** Marked Y because the user said "money handling" → Y. Severity Info understates the systemic impact — every monetary calc in the codebase inherits this risk; it's the umbrella under which F-101, F-117, F-123, F-126, F-127 sit.

**8. Open Questions register has no severity column and no formal "answered" status.** Several questions have been answered by appending a new Q-row that says "Q-XXX answered: ..." rather than updating the original row to CLOSED. I treated those answer-records as CLOSED rows and the questions they answer as also CLOSED. The file has accumulated 8 such answer-records (Q-013, Q-050, Q-051, Q-062, Q-063, Q-081, Q-082, Q-083). Worth restructuring to mark the original questions CLOSED inline.

**9. Status normalization choice — "Mitigated".** F-001, F-002, F-217, F-218 are listed as "Mitigated (rotated 2026-04-15)" rather than "Fixed". I normalized these to CLOSED. The residual concern (key was compromised before rotation, attackers with prior access could have exfiltrated PII encrypted with the old key) is material but is not tracked as a separate finding row — it's only covered indirectly by Q-079 ("Has ENCRYPTION_KEY been rotated since commit e523dfa?") which is now answered for the rotation but does not address the compromise window. Consider a F-217-FU row.

**10. Counts.** FINDINGS.md: 236 rows total (231 numeric + 5 -FU). By severity: 15 Critical (10 Open / 5 Closed), 67 High (56 Open / 11 Closed), 116 Medium (108 Open / 8 Closed), 26 Low (all Open), 11 Info (all Open). By Launch-relevant: 188 Y / 48 N. OPEN-QUESTIONS.md: 83 rows total. By Status: 71 Open / 12 Closed (including 8 answer-records). By Launch-relevant: 65 Y / 18 N. Counts are based on this dump's classification — verify against your own triage if numbers feed into a launch-readiness gate.
