# Phase 3 — Tenant Isolation Audit

**Date:** 2026-04-15
**Scope:** All server-side code (services, routers, storage, realtime, admin)
**Method:** Static analysis of every database query, every endpoint parameter source, and every cross-cutting concern

---

## 1. Service Files — tenant_id in Database Queries

Audited all 33 files in `server/services/`. Each database query was checked for tenant_id in its WHERE clause.

### Summary

| Category | Files | Queries |
|----------|-------|---------|
| No DB queries (safe by nature) | 7 | 0 |
| All queries tenant-scoped | 7 | ~40 |
| Mixed: some flagged | 19 | ~35 flagged out of ~120 |
| **Total flagged queries** | — | **~35** |

### Pattern A: Intentional Cross-Tenant Scheduler Scans (~10 queries)

Background jobs that process all tenants by design. They scan broadly, then scope downstream operations using `row.tenant_id`. Acceptable pattern but represents a concentrated privilege point.

| File | Line(s) | Table | Purpose |
|------|---------|-------|---------|
| `advance-order-scheduler.ts` | 11-21 | orders | Find all held advance orders across tenants |
| `prep-deadline-checker.ts` | 18-37 | ticket_assignments | Find all overdue tickets across tenants |
| `reservation-reminders.ts` | 9-17, 51-59 | reservations | Find upcoming reservations across tenants |
| `daily-report-scheduler.ts` | 22-24 | tenants + users | Find all active tenants for daily report |
| `alert-engine.ts` | 145-147 | staff_schedules | Find all tenant IDs with active schedules |
| `trial-warning-mailer.ts` | 20-29, 35-48 | tenants | Find tenants with expiring trials |
| `stock-report-scheduler.ts` | 12-16 | tenants + outlets | Find all active tenant/outlet combos |
| `wastage-summary-scheduler.ts` | 14 | tenants | Find all active tenant IDs |
| `coordination-rules.ts` | 25-28 | tenants | Find all active tenants for rule checking |
| `chef-assignment.ts` | 578-579 | ticket_assignments | Find unassigned tickets across tenants |

### Pattern B: Business Logic Queries Missing tenant_id (~35 queries) [VERIFIED]

These are NOT scheduler scans — they are business logic functions that query tables by primary key or foreign key without including tenant_id. While UUIDs make accidental cross-tenant collision improbable, this is a defense-in-depth failure. A leaked or guessed UUID enables cross-tenant access.

#### printer-service.ts (11 flagged queries — highest concentration)

| Line(s) | Table | Query Pattern | Risk |
|---------|-------|--------------|------|
| 237-241 | orders + tables | `WHERE o.id = $1` | Reads any tenant's order for receipt printing |
| 247-250 | order_items + menu_items | `WHERE oi.order_id = $1` | Reads any tenant's order items |
| 363-369 | bills + orders + tables | `WHERE b.id = $1` | Reads any tenant's bill for printing |
| 374-376 | order_items | `WHERE oi.order_id = $1` | Reads any tenant's items |
| 397-400 | outlets | `WHERE id = $1` | Reads any tenant's outlet config |
| 462-464 | bill_payments | `WHERE bill_id = $1` | Reads any tenant's payment records |
| 519-526 | bills | `WHERE b.id = $1` | Reads any tenant's bill (refund receipt) |
| 534-543 | bill_payments | `WHERE bill_id/$1` | Reads any tenant's refund details |
| 618-619 | orders + order_items | `WHERE id = $1` | Reads any tenant's order |
| 182-198 | print_jobs | `WHERE id = $2` | Updates any tenant's print jobs |
| 212 | printers | `WHERE id = $1` | Updates any tenant's printer status |

#### time-logger.ts (7 flagged queries)

| Line(s) | Table | Query Pattern | Risk |
|---------|-------|--------------|------|
| 86-93 | ticket_assignments | `WHERE order_item_id = $1` | Reads chef assignments cross-tenant |
| 96-98 | vip_order_flags | `WHERE order_id = $1` | Reads VIP flags cross-tenant |
| 220-222 | order_items | `WHERE order_id = $2` | **Updates** order items cross-tenant |
| 229-231 | order_items | `WHERE id = $2` | **Updates** order items cross-tenant |
| 244-246, 283-285 | order_items | `WHERE order_id = $1` | Reads item status cross-tenant |
| 267-269, 275-277 | order_items | `WHERE id = $2` | **Updates** order items cross-tenant |
| 303-305 | item_time_logs | `WHERE order_id = $1` | Reads timing data cross-tenant |

#### resource-service.ts (5 flagged queries)

| Line(s) | Table | Query Pattern | Risk |
|---------|-------|--------------|------|
| 6-9 | resource_assignments | `WHERE resource_id = $1` | Reads assignments cross-tenant |
| 14-16 | resource_units | `WHERE resource_id = $1` | Reads unit counts cross-tenant |
| 22-24 | resource_units | `WHERE resource_id = $1` | Reads damaged counts cross-tenant |
| 29-31 | special_resources | `WHERE id = $1` | Reads resource details cross-tenant |
| 43-46 | special_resources | `WHERE id = $5` | **Updates** availability cross-tenant |

#### Other service files

| File | Line(s) | Table | Query Pattern |
|------|---------|-------|--------------|
| `bulk-start-order.ts` | 82 | inventory_items | `WHERE id = $1` (SELECT, no tenant) |
| `bulk-start-order.ts` | 87-89 | inventory_items | `WHERE id = $1` (**UPDATE**, no tenant) |
| `chef-assignment.ts` | 34-36 | outlets | `WHERE id = $1` (reads outlet settings) |
| `chef-assignment.ts` | 319-320 | menu_items | `WHERE id = $1` (reads menu item name) |
| `coordination-rules.ts` | 137-145 | order_items | `WHERE order_id = $1` (reads items) |
| `coordination-rules.ts` | 249-253 | order_items | `WHERE order_id IN (...)` (reads items) |
| `alert-engine.ts` | 111-113 | alert_events | `WHERE id = $1` (reads alert by PK) |
| `alert-engine.ts` | 172-174 | attendance | `WHERE user_id = $1 AND date = $2` (no tenant) |
| `advance-order-scheduler.ts` | 24-26 | orders | `WHERE id = $1` (**UPDATE**, no tenant) |
| `prep-deadline-checker.ts` | 57-59 | ticket_assignments | `WHERE id = $1` (**UPDATE**, no tenant) |
| `reservation-reminders.ts` | 40-42, 80-82 | reservations | `WHERE id = $1` (**UPDATE**, no tenant) |
| `stock-capacity.ts` | 109-114 | recipe_ingredients + inventory_items | `WHERE recipe_id = ANY($1)` (no tenant) |
| `push-sender.ts` | 72-74 | push_subscriptions | `WHERE user_id = $1` (no tenant) |
| `tip-service.ts` | 68-70 | bills | `WHERE id = $3` (**UPDATE**, no tenant) |
| `tip-service.ts` | 144-146 | tip_distributions | `WHERE bill_tip_id/$2 AND staff_id/$3` (no tenant) |
| `tip-service.ts` | 164-166 | bill_tips | `WHERE id = $1` (no tenant) |

#### SQL Injection Risk
- `chef-assignment.ts:585` — String interpolation of `settings.unassignedTimeoutMin` into SQL interval: `` `...INTERVAL '${settings.unassignedTimeoutMin} minutes'` ``. Value comes from JSONB in `outlets.assignment_settings`. If that field can be set to a malicious value via `PATCH /api/outlets/:id`, this is exploitable.

---

## 2. Tenant ID Source and Spoofing

### How tenant_id is established

| Source | Method | Spoofable? |
|--------|--------|-----------|
| **Session (primary)** | `passport.deserializeUser` loads user from DB; `req.user.tenantId` set from `users.tenant_id` column | **No** — derived from server-side DB lookup |
| **WebSocket cookie** | `realtime.ts:71-107` parses session cookie, verifies HMAC, looks up user | **No** |
| **WebSocket `?token=`** | Wall screen: `storage.getTenantByWallScreenToken()` | **No** — validated against DB |
| **WebSocket `?qrToken=`** | QR session: `storage.getQrTokenByValue()` | **No** — validated against DB |
| **WebSocket `?tenantId=`** | `storage.getTenant(rawId)` — only checks existence | **YES** — any UUID grants access |
| **`x-tenant-id` header** | Used in 5 loyalty endpoints in `customers.ts:150-227` | **YES** — arbitrary cross-tenant access |
| **`req.body.tenantId`** | Used in `ads.ts:602-634` (ad impressions) | **YES** — limited impact (impression inflation) |
| **Guest `outletId` in URL** | `guest.ts` — `storage.getOutlet(outletId)` derives tenantId | **No** — outletId acts as capability token (UUID) |
| **Kiosk `x-kiosk-token`** | `kiosk.ts` — `storage.getKioskDeviceByToken()` derives tenantId | **No** — 32-byte random token |
| **QR `token` in URL** | `table-requests.ts` — `storage.getQrTokenByValue()` | **No** — validated against DB |

### [CRITICAL] x-tenant-id Header Spoofing (customers.ts:150-227)

Five loyalty-tier endpoints read tenant_id from `req.headers["x-tenant-id"]` instead of `req.user.tenantId`:

| Endpoint | Line | Impact |
|----------|------|--------|
| `GET /api/loyalty-tier-config` | 150-157 | **Read** any tenant's loyalty tier config |
| `POST /api/loyalty-tier-config` | 160-172 | **Delete + rewrite** any tenant's tier config |
| `POST /api/loyalty-tier-upgrade` | 175-206 | **Modify** any tenant's customer tier records |
| `GET /api/loyalty-tier-log` | 209-216 | **Read** any tenant's tier change history |
| `GET /api/loyalty-tier-stats` | 219-226 | **Read** any tenant's loyalty statistics |

The `POST /api/loyalty-tier-config` endpoint at line 165 performs `DELETE FROM loyalty_tier_config WHERE tenant_id = $1` using the header value. Any authenticated user can destroy another tenant's loyalty configuration.

This pattern exists **nowhere else** in the codebase — it appears to be a developer error.

---

## 3. IDOR (Insecure Direct Object Reference) Analysis

### Router-Level IDOR Summary

Audited all 48+ router files for endpoints that accept resource IDs without verifying tenant ownership.

#### Critical IDOR Findings

| File | Endpoint | Line(s) | Issue |
|------|----------|---------|-------|
| `orders.ts` | `PATCH /api/orders/:id/transfer-table` | 1265,1271 | SELECT + UPDATE on orders with `WHERE id = $1` only — no tenant_id |
| `orders.ts` | `POST /api/orders/merge-tables` | 1295-1305 | All queries on orders/order_items use `WHERE id = $1` only — cross-tenant item transfer |
| `orders.ts` | `POST /api/orders/:id/split-bill` | 1331-1335 | Reads order items by orderId with no tenant scoping |
| `customers.ts` | 5 loyalty endpoints | 150-227 | Uses `x-tenant-id` header — full cross-tenant CRUD |

#### High IDOR Findings

| File | Endpoint/Function | Line(s) | Issue |
|------|-------------------|---------|-------|
| `menu.ts` | `PATCH /api/menu-categories/:id` | 28-36 | `storage.getCategory()` and `updateCategory()` query by ID only — no tenant_id |
| `menu.ts` | `DELETE /api/menu-categories/:id` | 28-36 | `storage.deleteCategory()` by ID only |
| `kitchen.ts` | `GET /api/kds/orders/:orderId/kot-events` | 530 | `getKotEventsByOrder()` fetches by orderId with no tenant check |

#### Storage Layer Root Cause

24 functions in `server/storage.ts` accept only a resource ID without tenant_id in their WHERE clause. These are the root cause of all IDOR findings:

| Function | Table(s) | Pattern |
|----------|----------|---------|
| `getOrder(id)` | orders | `WHERE id = $1` (has optional tenantId param, not always passed) |
| `updateOrder(id, data, version)` | orders | `WHERE id = $1 AND version = $2` (no tenant) |
| `getBill(id)` | bills | `WHERE id = $1` |
| `getUser(id)` | users | `WHERE id = $1` |
| `getOutlet(id)` | outlets | `WHERE id = $1` |
| `getCategory(id)` | menu_categories | `WHERE id = $1` |
| `updateCategory(id, data)` | menu_categories | `WHERE id = $1` |
| `deleteCategory(id)` | menu_categories | `WHERE id = $1` |
| `getOrderItemsByOrder(orderId)` | order_items | `WHERE order_id = $1` |
| `getCashSession(id)` | cash_sessions | `WHERE id = $1` |
| `getValetTicket(id)` | valet_tickets | `WHERE id = $1` |
| `getPosSession(id)` | pos_session_snapshots | `WHERE id = $1` |
| `getCleaningTemplate(id)` | cleaning_templates | `WHERE id = $1` |
| `getStockMovementsByOrder(orderId)` | stock_movements | `WHERE order_id = $1` |
| `getKotEventsByOrder(orderId)` | kot_events | `WHERE order_id = $1` |
| ... and ~9 more | Various | Same pattern |

Many callers pre-validate tenant ownership at the router level (fetch resource, check `.tenantId === user.tenantId`), but this is a fragile pattern. Any new caller that skips the pre-check inherits the IDOR.

---

## 4. Tenant Isolation in Cross-Cutting Concerns

### Redis Cache Keys

**File:** `server/services/pubsub.ts`, `server/realtime.ts`

| Concern | Implementation | Scoped? |
|---------|---------------|---------|
| WS pub/sub channels | `tenant:{tenantId}` prefix | **Yes** |
| Rate limiter (Redis store) | `user-{userId}` or IP-based | **Yes** (per-user, not per-tenant) |

Redis channel isolation is correct. The vulnerability is in the WebSocket registration layer (bare `?tenantId=` param), not the pub/sub layer.

### File Storage (S3 / Local)

**File:** `server/services/file-storage.ts`

| Concern | Implementation | Scoped? |
|---------|---------------|---------|
| S3 key format | `uploads/{randomUUID}/{originalName}` | **No** — no tenant prefix |
| Local path format | `uploads/{timestamp}-{random}{ext}` | **No** — no tenant prefix |
| Delete function | Accepts arbitrary URL, extracts S3 key | **No** — no tenant validation |

Files are protected by UUID obscurity only. No server-side check that a referenced file belongs to the requesting tenant. The `deleteFile()` function accepts any URL.

### Menu Cache

**File:** `server/lib/menu-cache.ts`

- Cache keyed by `outletId` (UUID) — no collision risk across tenants.
- `invalidateByTenant(tenantId)` at line 39-47 iterates cache keys looking for `tenantId:` prefix, but actual keys are plain `outletId`. The invalidation function is broken — it won't match any keys. This is a functional bug, not a security issue.

### Background Jobs

All 20 background jobs are started from the main process (`server/index.ts`). There is no job queue isolation — all jobs run in the same event loop with access to all tenants' data. The scheduler scan pattern (Pattern A above) means a single bug in the scheduler loop could affect all tenants simultaneously.

---

## 5. Global Tables Access Control

| Table | PII? | Write Access | Read Access | Isolation |
|-------|------|-------------|-------------|-----------|
| `session` | Yes (user_id, IP, UA) | express-session (via PG store) | Scoped by `sid` or `user_id` in all queries | **Adequate** — properly scoped |
| `platformSettings` | No (but stores Stripe/Razorpay secrets) | `requireSuperAdmin` + `requireFreshSession` | `requireSuperAdmin` (some GETs) + unauthenticated `GET /api/platform/gateway-config` (only exposes `activePaymentGateway` field) | **Adequate** — but secrets in this table are readable by any code that queries it |
| `platformSettingsKv` | No | Only `push-sender.ts` (VAPID keys) | Only `push-sender.ts` | **Adequate** |
| `systemEvents` | No | Circuit breaker, billing, cash drawer code | `requireSuperAdmin` | **Adequate** |
| `systemHealthLog` | No | Compliance health logger (5-min interval) | `requireSuperAdmin` | **Adequate** |
| `salesInquiries` | **Yes** (name, email, phone) | Unauthenticated `POST /api/contact-sales` | **No read endpoint** — data accumulates with no review or cleanup | **Gap** — PII accumulates unreviewed |
| `supportTickets` (legacy) | Yes (optional) | Unauthenticated `POST /api/contact-support` | **No read endpoint** | **Gap** — same as salesInquiries |
| `in_app_support_tickets` (active) | Yes | `requireAuth` + `requireRole(owner,manager)` | Tenant-scoped reads; admin can read all | **Adequate** |

---

## 6. Admin Routes Cross-Tenant Capabilities

**File:** `server/admin-routes.ts` (2387 lines)

### What Admins Can Do Across Tenants

| Action | Endpoint | Auth | Audit Logged |
|--------|----------|------|-------------|
| List all tenants + stats | `GET /api/admin/tenants` | superAdmin + freshSession | No (read) |
| View full tenant detail (users, outlets, orders, audit) | `GET /api/admin/tenants/:id` | superAdmin + freshSession | No (read) |
| Create tenant | `POST /api/admin/tenants` | superAdmin + freshSession | **Yes** |
| Modify tenant (incl. plan) | `PATCH /api/admin/tenants/:id` | superAdmin + freshSession | **Yes** |
| Suspend/reactivate tenant | `POST /api/admin/tenants/:id/suspend` | superAdmin + freshSession | **Yes** |
| List all users across tenants | `GET /api/admin/users` | superAdmin + freshSession | No (read) |
| Toggle user active/inactive | `PATCH /api/admin/users/:id` | superAdmin + freshSession | **Yes** |
| Reset any user's password | `POST /api/admin/users/:id/reset-password` | superAdmin + freshSession | **Yes** |
| View all audit events | `GET /api/admin/audit-log` | superAdmin + freshSession | No (read) |
| View all security alerts | `GET /api/admin/security-alerts` | superAdmin + freshSession | No (read) |
| Modify platform payment config | `PATCH /api/admin/platform-settings/gateway` | superAdmin + freshSession | **Yes** |
| Rotate encryption key | `POST /api/admin/encryption/rotate-key` | superAdmin + freshSession | **Yes** |
| Impersonate any non-admin user | `POST /api/admin/impersonate/:userId` | superAdmin | **Yes** (with IP, reason, mode) |

### Admin Endpoints Missing `requireFreshSession`

These superAdmin endpoints skip concurrent-session detection:
- `GET /api/admin/stats` (line 606) — cross-tenant aggregate statistics
- `GET /api/admin/super-admins` (line 1236) — lists all super admin accounts with emails
- `GET /api/admin/analytics` (line 1609) — cross-tenant growth/revenue data
- `GET /api/admin/platform-settings` (line 1408) — platform configuration
- `GET /api/admin/platform-settings/gateway` (line 1477) — payment gateway config
- `GET /api/admin/system-events` (line 2293) — system event log
- `POST /api/admin/circuit-breakers/reset` (line 2332) — resets all circuit breakers

### Impersonation Controls [VERIFIED]

The impersonation system has strong controls:
- Cannot impersonate another super_admin or deactivated users
- Requires a reason (logged to `impersonation_sessions` table with IP)
- Defaults to READ_ONLY mode; edit mode requires separate unlock with reason
- Tenant owners can opt out of edit mode via `tenant_access_preferences.allow_edit_mode`
- Tenant owners/managers can view access log via `GET /api/tenant/access-log`
- Session timeout (configurable, default 30 min)

**Vulnerability:** The `accessMode` parameter comes from `req.body` (line 139) and is not validated against an enum. The READ_ONLY check at line 367 only blocks when `accessMode === "READ_ONLY"`. A non-standard value like `"WRITE"` would bypass read-only enforcement, since the check is for the specific string `"READ_ONLY"`, not for membership in an allowed set.

### No Admin-Specific Rate Limiting

No rate limiting exists on admin API endpoints. A compromised super admin session could exfiltrate all tenant data without throttling.

---

## 7. Cross-Tenant Endpoints from Phase 2 (Deep Trace)

### Transfer Table — `PATCH /api/orders/:id/transfer-table` (orders.ts:1257-1284)

```
Line 1260: const orderId = parseInt(req.params.id)  // parseInt on UUID → NaN
Line 1265: SELECT ... FROM orders WHERE id = $1      // NO tenant_id
Line 1271: UPDATE orders SET table_id = $1 WHERE id = $2  // NO tenant_id
Line 1274: UPDATE tables SET status = 'available' WHERE id = $1  // NO tenant_id
```

**Impact:** Any authenticated user can transfer any order from any tenant to a different table. The `parseInt` on UUID params would produce NaN, which likely causes the query to return no results (Postgres `WHERE id = NaN` returns nothing). This makes the endpoint non-functional rather than actively exploitable — but it's a latent vulnerability if IDs change to integers.

### Merge Tables — `POST /api/orders/merge-tables` (orders.ts:1288-1317)

```
Line 1295: SELECT ... FROM orders WHERE id = $1       // NO tenant_id (source)
Line 1297: SELECT ... FROM orders WHERE id = $1       // NO tenant_id (target)
Line 1300: UPDATE order_items SET order_id = $1 WHERE order_id = $2  // NO tenant_id
Line 1304: UPDATE orders SET status = 'cancelled' WHERE id = $1      // NO tenant_id
```

**Impact:** Can move items between any two orders across tenants, cancel the source order, and leave the target order with stale totals (no recalculation). Same `parseInt` mitigation applies.

### Split Bill — `POST /api/orders/:id/split-bill` (orders.ts:1320-1359)

```
Line 1323: const orderId = parseInt(req.params.id)  // parseInt on UUID → NaN
Line 1331: SELECT ... FROM order_items WHERE order_id = $1 AND id IN (...)  // NO tenant_id
```

**Impact:** Can read item details (names, prices, quantities) from any tenant's orders. Read-only (no mutations). Same `parseInt` mitigation applies.

### Verdict

These three endpoints are likely **non-functional** in the current UUID-based schema (parseInt(UUID) → NaN → no rows matched). They are dead code from an earlier integer-ID era. However, they remain latent vulnerabilities if the ID scheme ever changes, and their existence indicates a pattern of unsafe coding practices.

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Service files audited | 33 |
| Flagged queries (business logic, missing tenant_id) | ~35 |
| Intentional cross-tenant scans (schedulers) | ~10 |
| Spoofable tenant_id sources | 3 (x-tenant-id header, ?tenantId= WS, req.body ad impressions) |
| Storage functions without tenant_id in WHERE | 24 |
| Router-level IDOR findings (Critical) | 4 endpoints |
| Router-level IDOR findings (High) | 3 endpoints |
| Global tables with PII and no read/cleanup | 2 (salesInquiries, supportTickets) |
| Admin endpoints missing requireFreshSession | 7 |
