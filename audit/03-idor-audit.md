# Phase 3: IDOR (Insecure Direct Object Reference) Audit

**Date:** 2026-04-15
**Scope:** All router files in `server/routers/`, storage layer `server/storage.ts`
**Method:** Static analysis of every endpoint accepting an ID parameter, tracing through storage functions to verify tenant_id inclusion in queries.

---

## Methodology

For each endpoint that accepts a resource ID (`:id`, `:orderId`, `:billId`, etc.):
1. Check if the router passes `user.tenantId` to the storage function
2. Check if the storage function includes `tenant_id` in its WHERE clause
3. If the router does a fetch-then-check pattern (fetch without tenant_id, then compare `result.tenantId !== user.tenantId`), note the information leakage risk

**SAFE pattern:** `WHERE id = $1 AND tenant_id = $2`
**UNSAFE pattern:** `WHERE id = $1` (no tenant_id check)
**SEMI-SAFE pattern:** Fetch by ID only, then compare tenantId in application code (leaks existence of cross-tenant records via timing)

---

## CRITICAL Findings

### IDOR-001: Order Transfer-Table - No Tenant Scoping [VERIFIED] [Critical]
- **File:** `server/routers/orders.ts` lines 1257-1284
- **Method/Path:** `PATCH /api/orders/:id/transfer-table`
- **Query:** `db.select().from(orders).where(eq(orders.id, orderId))` (line 1265) - NO tenant_id check
- **Write:** `db.update(orders).set({ tableId: newTableId }).where(eq(orders.id, orderId))` (line 1271) - NO tenant_id check
- **Impact:** Any authenticated user can transfer ANY tenant's order to a different table. This modifies order data (tableId) cross-tenant and frees/occupies tables in the attacker's tenant while corrupting the victim's order.
- **Severity:** Critical - writes to cross-tenant financial records

### IDOR-002: Order Merge-Tables - No Tenant Scoping [VERIFIED] [Critical]
- **File:** `server/routers/orders.ts` lines 1288-1317
- **Method/Path:** `POST /api/orders/merge-tables`
- **Queries:**
  - `db.update(orderItems).set({ orderId: targetOrderId }).where(eq(orderItems.orderId, sourceOrderId))` (line 1295) - NO tenant_id
  - `db.select().from(orders).where(eq(orders.id, sourceOrderId))` (line 1300) - NO tenant_id
  - `db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, sourceOrderId))` (line 1303) - NO tenant_id
- **Impact:** Any authenticated user can merge order items from ANY tenant's order into ANY other tenant's order. This moves financial line items cross-tenant and cancels the source order.
- **Severity:** Critical - cross-tenant financial data manipulation, order cancellation

### IDOR-003: Order Split-Bill - No Tenant Scoping [VERIFIED] [Critical]
- **File:** `server/routers/orders.ts` lines 1320-1359
- **Method/Path:** `POST /api/orders/:id/split-bill`
- **Query:** `db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), inArray(orderItems.id, split.itemIds)))` (lines 1331-1335) - NO tenant_id
- **Impact:** Any authenticated user can read order item details (names, prices, quantities, discounts) from ANY tenant's orders by enumerating order IDs.
- **Severity:** Critical - cross-tenant financial data exposure (PII: customer billing details)

### IDOR-004: Loyalty Tier Config - Client-Supplied Tenant ID [VERIFIED] [Critical]
- **File:** `server/routers/customers.ts` lines 150-227
- **Endpoints:**
  - `GET /api/loyalty-tier-config` (line 150)
  - `POST /api/loyalty-tier-config` (line 160) - **DESTRUCTIVE: deletes all tier config first**
  - `POST /api/loyalty-tier-upgrade` (line 175) - **DESTRUCTIVE: modifies all customers**
  - `GET /api/loyalty-tier-log` (line 209)
  - `GET /api/loyalty-tier-stats` (line 219)
- **Pattern:** All use `const tenantId = req.headers["x-tenant-id"]` instead of `user.tenantId` from the authenticated session
- **Impact:** Any authenticated user can set `X-Tenant-Id` header to ANY tenant's ID and:
  1. Read their loyalty tier configuration
  2. **DELETE all their loyalty tier configs and replace with arbitrary data** (POST /api/loyalty-tier-config does DELETE then INSERT)
  3. **Modify all customer loyalty tiers** in the target tenant (POST /api/loyalty-tier-upgrade)
  4. Read loyalty tier change logs
  5. Read loyalty tier statistics
- **Severity:** Critical - full read/write/delete of cross-tenant loyalty configuration and customer data

### IDOR-005: storage.updateOrder - No Tenant Scoping [VERIFIED] [Critical]
- **File:** `server/storage.ts` lines 1164-1171
- **Function:** `updateOrder(id, data, expectedVersion?)`
- **Query:** `WHERE orders.id = id` (no tenant_id in WHERE clause)
- **Callers (that rely solely on this function for writes):**
  - `server/routers/restaurant-billing.ts` line 75: `storage.updateOrder(bill.orderId, { status: "completed" })` - after finalizeBillCompletion
  - `server/routers/restaurant-billing.ts` line 580: `storage.updateOrder(bill.orderId, { status: "completed" })`
  - `server/routers/restaurant-billing.ts` line 748: `storage.updateOrder(bill.orderId, { status: "voided" })`
  - `server/routers/coordination.ts` line 269: `storage.updateOrder(req.params.orderId, { status: "served" })`
  - `server/routers/kitchen.ts` lines 92-99, 145-147, 322, 758, 816, 819, 824, 894, 951
- **Note:** Most callers first verify the order belongs to the user's tenant via `storage.getOrder(id, tenantId)`, so the updateOrder itself is not directly exploitable from those paths. However, the storage function itself is a defense-in-depth gap: if any future caller forgets to pre-validate, updates become cross-tenant.
- **Severity:** High (defense-in-depth gap, not directly exploitable from most current paths)

---

## HIGH Findings

### IDOR-006: Menu Category Update - No Tenant Scoping [VERIFIED] [High]
- **File:** `server/routers/menu.ts` lines 27-32
- **Method/Path:** `PATCH /api/menu-categories/:id`
- **Storage calls:**
  - `storage.getCategory(req.params.id)` -> `WHERE id = $1` (no tenant_id) at storage.ts line 978
  - `storage.updateCategory(req.params.id, req.body)` -> `UPDATE ... WHERE id = $1` (no tenant_id) at storage.ts line 986
- **Impact:** Any authenticated user with owner/manager role can update ANY tenant's menu categories (rename, change sort order, etc.)
- **Severity:** High - cross-tenant operational data modification

### IDOR-007: Menu Category Delete - No Tenant Scoping [VERIFIED] [High]
- **File:** `server/routers/menu.ts` lines 34-38
- **Method/Path:** `DELETE /api/menu-categories/:id`
- **Storage calls:**
  - `storage.getCategory(req.params.id)` -> `WHERE id = $1` (no tenant_id) at storage.ts line 978
  - `storage.deleteCategory(req.params.id)` -> `DELETE ... WHERE id = $1` (no tenant_id) at storage.ts line 990
- **Impact:** Any authenticated user with owner/manager role can delete ANY tenant's menu categories
- **Severity:** High - cross-tenant data destruction

### IDOR-008: storage.getBill - No Tenant Scoping [VERIFIED] [High]
- **File:** `server/storage.ts` lines 2695-2698
- **Function:** `getBill(id)` -> `WHERE id = $1` (no tenant_id)
- **Callers that do post-fetch tenant check (SEMI-SAFE):**
  - `restaurant-billing.ts` line 188: GET `/api/restaurant-bills/:id` - checks `bill.tenantId !== user.tenantId`
  - `restaurant-billing.ts` line 382: POST `/:id/payments` - checks `bill.tenantId !== user.tenantId`
  - `restaurant-billing.ts` line 706: PUT `/:id/void` - checks `bill.tenantId !== user.tenantId`
  - `restaurant-billing.ts` line 807: POST `/:id/refund` - checks `bill.tenantId !== user.tenantId`
  - `restaurant-billing.ts` line 1064: POST `/:id/payment-request` - checks `bill.tenantId !== user.tenantId`
  - `restaurant-billing.ts` line 1170: GET `/:id/payment-status` - checks `bill.tenantId !== user.tenantId`
  - `restaurant-billing.ts` line 1218: POST `/bills/:id/send-email` - checks `bill.tenantId !== user.tenantId`
  - `restaurant-billing.ts` line 1140: POST `/:id/payments/manual-pending` - checks `bill.tenantId !== user.tenantId`
- **Caller WITHOUT tenant check:**
  - `restaurant-billing.ts` line 130: GET `/api/public/receipt/:id` - **NO AUTH, NO TENANT CHECK** - returns bill details, payment methods, and order items to anyone with a bill ID
- **Impact (public endpoint):** Bill IDs (UUIDs) provide some obscurity, but if leaked (e.g., in URLs, logs, QR codes), any person can view full bill details including amounts, items, tax breakdown, and restaurant name.
- **Impact (authenticated endpoints):** The post-fetch check pattern leaks bill existence via timing: a 403 response confirms the bill exists in another tenant, while 404 means it doesn't exist at all.
- **Severity:** High (public receipt endpoint exposes financial data; timing side-channel in authenticated endpoints)

### IDOR-009: storage.getBillByOrder - No Tenant Scoping [VERIFIED] [High]
- **File:** `server/storage.ts` lines 2699-2701
- **Function:** `getBillByOrder(orderId)` -> `WHERE orderId = $1` (no tenant_id)
- **Caller:** `restaurant-billing.ts` line 200: GET `/api/restaurant-bills/by-order/:orderId`
  - Does post-fetch check: `bill.tenantId !== user.tenantId` (line 202)
  - Also called at line 218 for duplicate detection in POST `/api/restaurant-bills` (here it's after a tenant-scoped getOrder, so the orderId is known-safe)
- **Impact:** Timing side-channel: 403 vs 404 reveals whether an order in another tenant has a bill
- **Severity:** Medium

### IDOR-010: storage.getOrderItemsByOrder - No Tenant Scoping [VERIFIED] [High]
- **File:** `server/storage.ts` lines 1172-1174
- **Function:** `getOrderItemsByOrder(orderId)` -> `WHERE orderId = $1` (no tenant_id)
- **Note:** Most callers first validate the order belongs to the user's tenant via `getOrder(id, tenantId)`. However, in `kitchen.ts` line 128 (`PATCH /api/kds/orders/:id/items-status`), the order is validated at line 127 via `getOrder(req.params.id, user.tenantId)`, so the subsequent unscoped `getOrderItemsByOrder` is safe because the orderId was already validated.
- **Direct exposure:** In orders.ts line 42 (`GET /api/order-items/:orderId`), the order is first validated via `getOrder(req.params.orderId, user.tenantId)` before calling `getOrderItemsByOrder`, so this is safe.
- **Defense-in-depth gap:** The storage function itself has no tenant_id check. Any new caller that forgets to pre-validate the order will leak cross-tenant order items.
- **Severity:** High (defense-in-depth gap)

### IDOR-011: storage.getStockMovementsByOrder - No Tenant Scoping [VERIFIED] [High]
- **File:** `server/storage.ts` lines 1895-1897
- **Function:** `getStockMovementsByOrder(orderId)` -> `WHERE orderId = $1` (no tenant_id)
- **Callers:** Used after tenant-scoped order validation in orders.ts and restaurant-billing.ts
- **Defense-in-depth gap:** No tenant_id in the function's WHERE clause
- **Severity:** High (defense-in-depth gap)

### IDOR-012: KOT Events by Order - No Tenant Scoping [VERIFIED] [High]
- **File:** `server/routers/kitchen.ts` lines 525-536
- **Method/Path:** `GET /api/kot-events?orderId=X`
- **Storage function:** `getKotEventsByOrder(orderId)` -> `WHERE orderId = $1` (no tenant_id) at storage.ts line 2652
- **Pattern:** When `orderId` query param is provided (line 530), it calls `getKotEventsByOrder` directly without any tenant validation
- **Impact:** Any authenticated user can read KOT event data (items, quantities, stations, timestamps) from any tenant's orders
- **Severity:** High - cross-tenant operational data exposure

### IDOR-013: storage.getCashSession - No Tenant Scoping (fetch-then-check) [VERIFIED] [Medium]
- **File:** `server/storage.ts` lines 3724-3727
- **Function:** `getCashSession(id)` -> `WHERE id = $1` (no tenant_id)
- **Callers in cash-machine.ts:** All do post-fetch check `session.tenantId !== user.tenantId` (lines 209, 224, 239, 254, etc.)
- **Impact:** Timing side-channel. All calling endpoints do verify tenantId after fetch.
- **Severity:** Medium

### IDOR-014: storage.getValetTicket - No Tenant Scoping (fetch-then-check) [VERIFIED] [Medium]
- **File:** `server/storage.ts` lines 4692-4695
- **Function:** `getValetTicket(id)` -> `WHERE id=$1` (no tenant_id)
- **Callers in parking.ts:** Most do post-fetch check `ticket.tenantId !== user.tenantId` (lines 340, 688, etc.)
- **Impact:** Timing side-channel. All calling endpoints verify tenantId after fetch.
- **Severity:** Medium

### IDOR-015: storage.getCleaningTemplate - No Tenant Scoping (fetch-then-check) [VERIFIED] [Medium]
- **File:** `server/storage.ts` lines 1686-1689
- **Function:** `getCleaningTemplate(id)` -> `WHERE id = $1` (no tenant_id)
- **Caller in cleaning.ts line 60-63:** Does post-fetch check `template.tenantId !== user.tenantId`
- **Impact:** Timing side-channel
- **Severity:** Medium

### IDOR-016: storage.getAuditSchedule - No Tenant Scoping (fetch-then-check) [VERIFIED] [Medium]
- **File:** `server/storage.ts` lines 1793-1796
- **Function:** `getAuditSchedule(id)` -> `WHERE id = $1` (no tenant_id)
- **Caller in cleaning.ts line 271-272:** Does post-fetch check `schedule.tenantId !== user.tenantId`
- **Impact:** Timing side-channel
- **Severity:** Medium

### IDOR-017: storage.getUser - No Tenant Scoping (fetch-then-check) [VERIFIED] [Medium]
- **File:** `server/storage.ts` lines 932-935
- **Function:** `getUser(id)` -> `WHERE id = $1` (no tenant_id)
- **Callers:**
  - auth.ts line 841: `getUser(req.params.userId)` - checks `targetUser.tenantId !== currentUser.tenantId` (line 842)
  - auth.ts line 863: `getUser(req.params.staffId)` - checks (line 864)
  - auth.ts line 895: `getUser(req.params.staffId)` - checks (line 896)
  - permissions.ts line 324: `getUser(req.params.id)` - checks (line 325)
- **Impact:** Timing side-channel: confirms user existence in other tenants. User record (with PII) is loaded into memory before check.
- **Severity:** Medium

### IDOR-018: storage.getOutlet - No Tenant Scoping (fetch-then-check) [VERIFIED] [Medium]
- **File:** `server/storage.ts` lines 958-961
- **Function:** `getOutlet(id)` -> `WHERE id = $1` (no tenant_id)
- **Callers in kitchen-assignment.ts:**
  - Line 320: `getOutlet(req.params.id)` - checks `outlet.tenantId !== user.tenantId` (line 321)
  - Line 333: same pattern (line 334)
- **Impact:** Timing side-channel
- **Severity:** Medium

### IDOR-019: storage.getPosSession - No Tenant Scoping (fetch-then-check) [VERIFIED] [Medium]
- **File:** `server/storage.ts` lines 2742-2744
- **Function:** `getPosSession(id)` -> `WHERE id = $1` (no tenant_id)
- **Caller in restaurant-billing.ts line 998:** checks `session.tenantId !== user.tenantId` (line 999)
- **Caller in restaurant-billing.ts line 1030:** checks (line 1031)
- **Impact:** Timing side-channel
- **Severity:** Medium

### IDOR-020: storage.getTableSession - No Tenant Scoping [VERIFIED] [Medium]
- **File:** `server/storage.ts` lines 2495-2497
- **Function:** `getTableSession(id)` -> `WHERE id = $1` (no tenant_id)
- **Callers in guest.ts:** Used without auth in public guest ordering endpoints (lines 208, 217, 258, 267, 276, 309). These endpoints are intentionally unauthenticated (QR code guest ordering), so no user.tenantId is available. The session ID acts as a bearer token.
- **Impact:** If session IDs are predictable or leaked, any person can access guest cart data and place orders. UUIDs provide reasonable obscurity.
- **Severity:** Medium (depends on UUID entropy)

### IDER-021: storage.updateGuestCartItem / deleteGuestCartItem - No Tenant Scoping [VERIFIED] [Medium]
- **File:** `server/storage.ts` lines 2519-2524
- **Functions:**
  - `updateGuestCartItem(id, data)` -> `WHERE id = $1` (no tenant_id, no session_id)
  - `deleteGuestCartItem(id)` -> `WHERE id = $1` (no tenant_id, no session_id)
- **Caller for delete (guest.ts line 201):** Does check that item exists in session cart (line 200)
- **Impact:** Defense-in-depth gap
- **Severity:** Medium

### IDOR-022: storage.updateOrderItemCooking - No Tenant Scoping [VERIFIED] [Medium]
- **File:** `server/storage.ts` lines 3251-3265
- **Function:** `updateOrderItemCooking(id, data)` -> `WHERE id = $1` (no tenant_id)
- **Callers in kitchen.ts:** All first validate the order item belongs to user's tenant via `getOrderItem(id, tenantId)` then `getOrder(orderId, tenantId)`. Also used in orders.ts fireKdsArrival (internal, non-request-driven).
- **Impact:** Defense-in-depth gap
- **Severity:** Medium

### IDOR-023: storage.getBillPayments - No Tenant Scoping [VERIFIED] [Medium]
- **File:** `server/storage.ts` lines 2724-2726
- **Function:** `getBillPayments(billId)` -> `WHERE billId = $1` (no tenant_id)
- **Callers:** Used after bill is validated via `getBill` + tenantId check in restaurant-billing.ts. Also used in the public receipt endpoint (line 138) where no auth is required.
- **Impact:** In the public receipt endpoint, payment details (method, amount, refund status) are exposed. In authenticated endpoints, this is a defense-in-depth gap.
- **Severity:** Medium

### IDOR-024: storage.getOutletCurrencySettings - No Tenant Scoping [VERIFIED] [Medium]
- **File:** `server/storage.ts` lines 3884-3888
- **Function:** `getOutletCurrencySettings(outletId)` -> `WHERE id = $1` (no tenant_id)
- **Caller in cash-machine.ts line 523:** `getOutletCurrencySettings(req.params.id)` - no tenant check visible
- **Impact:** Any authenticated user can read currency settings of any outlet by ID
- **Severity:** Medium - information disclosure

---

## SAFE Endpoints (Verified Tenant-Scoped)

The following endpoints were verified as properly tenant-scoped:

### orders.ts
- `GET /api/orders` - uses `eq(ordersTable.tenantId, user.tenantId)` (line 127)
- `GET /api/orders/on-hold` - uses `eq(ordersTable.tenantId, user.tenantId)` (line 162)
- `GET /api/orders/delivery-queue` - uses `eq(ordersTable.tenantId, user.tenantId)` (line 180)
- `PATCH /api/orders/:id/accept-delivery` - uses `storage.getOrder(id, tenantId)` (line 197)
- `PATCH /api/orders/:id/reject-delivery` - uses `storage.getOrder(id, tenantId)` (line 225)
- `PATCH /api/orders/:id/dispatch-delivery` - uses `storage.getOrder(id, tenantId)` (line 247)
- `PATCH /api/orders/:id/accept` - uses `storage.getOrder(id, tenantId)` (line 265)
- `PATCH /api/orders/:id/reject` - uses `storage.getOrder(id, tenantId)` (line 293)
- `GET /api/orders/:id` - uses `storage.getOrder(id, tenantId)` (line 314)
- `POST /api/orders` - sets `tenantId: user.tenantId` (line 576)
- `PATCH /api/orders/:id` - uses `storage.getOrder(id, tenantId)` (line 799)
- `GET /api/order-items` - uses `storage.getOrderItemsByTenant(tenantId)` (line 1150)
- `GET /api/order-items/:orderId` - uses `storage.getOrder(orderId, tenantId)` first (line 1156)
- `PATCH /api/order-items/:id` - uses `storage.getOrderItem(id, tenantId)` (line 1166)
- `POST /api/orders/:id/payment-link` - uses `storage.getOrder(id, tenantId)` (line 1179)
- `POST /api/orders/archive-stale` - uses `WHERE tenant_id = $1` (line 1233)

### restaurant-billing.ts
- All authenticated endpoints do post-fetch tenantId check on getBill result
- `GET /api/restaurant-bills` - uses `getBillsByTenant(tenantId)` (line 179)
- `POST /api/restaurant-bills` - validates order via `getOrder(orderId, tenantId)` (line 217)

### customers.ts
- `GET /api/customers` - uses `customers.tenantId = user.tenantId` (line 19)
- `POST /api/customers` - sets `tenantId: user.tenantId` (line 35)
- `GET /api/customers/:id` - uses `getCustomerByTenant(id, tenantId)` (line 89)
- `PATCH /api/customers/:id` - uses `updateCustomerByTenant(id, tenantId, data)` (line 107)
- `DELETE /api/customers/:id` - uses `deleteCustomerByTenant(id, tenantId, userId)` (line 115)
- `GET /api/customers/:id/loyalty-history` - uses `WHERE customer_id = $1 AND tenant_id = $2` (line 136)

### staff.ts
- All endpoints use `user.tenantId` properly

### inventory.ts
- All endpoints use `user.tenantId` properly via storage functions and raw queries
- `POST /api/inventory/:id/adjust` uses `WHERE id = $1 AND tenant_id = $2 ... FOR UPDATE` (line 179)

### menu.ts
- `GET /api/menu-categories` - uses `getCategoriesByTenant(tenantId)` (line 16)
- `POST /api/menu-categories` - sets `tenantId: user.tenantId` (line 22)
- `GET /api/menu-items` - uses `getMenuItemsByTenantAndOutlet(tenantId)` (line 51)
- `POST /api/menu-items` - sets `tenantId: user.tenantId` (line 92)
- `PATCH /api/menu-items/:id` - uses `getMenuItem(id, tenantId)` + `updateMenuItem(id, tenantId, data)` (lines 101, 116)
- `DELETE /api/menu-items/:id` - uses `getMenuItem(id, tenantId)` + `deleteMenuItem(id, tenantId)` (lines 126, 146)
- `GET /api/menu-items/:id/modifiers` - uses `getMenuItem(id, tenantId)` (line 61)
- `GET /api/menu-items/:id/removable-ingredients` - uses `getMenuItem(id, tenantId)` (line 160) but recipe_components query at line 163 filters only by menu_item_id (not tenant_id). Since the menu item was already validated as belonging to the tenant, this is safe.

### tables.ts
- All endpoints use `user.tenantId` via tenant-scoped storage functions

### reservations.ts
- All endpoints use `user.tenantId` via tenant-scoped storage functions

### kitchen.ts
- All KDS endpoints validate orders via `getOrder(id, tenantId)` before proceeding
- All order item endpoints validate via `getOrderItem(id, tenantId)` then `getOrder(orderId, tenantId)`
- **Exception:** KOT events endpoint (see IDOR-012)

### delivery.ts
- All endpoints use `user.tenantId` via tenant-scoped storage functions

### cleaning.ts
- Templates use fetch-then-check pattern (see IDOR-015)
- Audit schedules use fetch-then-check pattern (see IDOR-016)

### cash-machine.ts
- Uses fetch-then-check pattern for getCashSession (see IDOR-013)

### parking.ts
- Uses fetch-then-check pattern for getValetTicket (see IDOR-014)

### auth.ts
- Uses fetch-then-check pattern for getUser (see IDOR-017)

### permissions.ts
- Uses fetch-then-check pattern for getUser (see IDOR-017)

### modifications.ts
- Uses JOIN with tenant_id check: `JOIN orders o ON o.id = oi.order_id WHERE oi.id = $1 AND o.tenant_id = $2` (lines 43-48) - SAFE

### coordination.ts
- Order validation via `getOrder(orderId, tenantId)` before operations (line 251)

### kitchen-assignment.ts
- Uses fetch-then-check pattern for getOutlet (see IDOR-018)

---

## Summary by Severity

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| Critical | 4 | IDOR-001, IDOR-002, IDOR-003, IDOR-004 |
| High | 7 | IDOR-005, IDOR-006, IDOR-007, IDOR-008, IDOR-010, IDOR-011, IDOR-012 |
| Medium | 11 | IDOR-009, IDOR-013 thru IDOR-024 |

---

## Systemic Patterns

### Pattern 1: Storage Functions Without Tenant Scoping
Many storage functions accept only a resource ID and do not include tenant_id in their WHERE clause. This is a systemic architecture issue. Functions confirmed to lack tenant_id:
- `getBill(id)` - storage.ts:2695
- `getBillByOrder(orderId)` - storage.ts:2699
- `getBillPayments(billId)` - storage.ts:2724
- `getCategory(id)` - storage.ts:977
- `updateCategory(id, data)` - storage.ts:985
- `deleteCategory(id)` - storage.ts:989
- `updateOrder(id, data)` - storage.ts:1164
- `getOrderItemsByOrder(orderId)` - storage.ts:1172
- `getStockMovementsByOrder(orderId)` - storage.ts:1895
- `getUser(id)` - storage.ts:932
- `updateUser(id, data)` - storage.ts:945
- `getOutlet(id)` - storage.ts:958
- `getCashSession(id)` - storage.ts:3724
- `getValetTicket(id)` - storage.ts:4692
- `getCleaningTemplate(id)` - storage.ts:1686
- `getAuditSchedule(id)` - storage.ts:1793
- `getTableSession(id)` - storage.ts:2495
- `updateTableSession(id, data)` - storage.ts:2507
- `deleteGuestCartItem(id)` - storage.ts:2523
- `updateGuestCartItem(id, data)` - storage.ts:2519
- `getPosSession(id)` - storage.ts:2742
- `updateOrderItemCooking(id, data)` - storage.ts:3251
- `getKotEventsByOrder(orderId)` - storage.ts:2651
- `getOutletCurrencySettings(outletId)` - storage.ts:3884

### Pattern 2: Client-Supplied Tenant ID
The loyalty tier config endpoints (customers.ts lines 150-227) use `req.headers["x-tenant-id"]` instead of `user.tenantId`. This completely bypasses tenant isolation since any authenticated user can set this header to any value.

### Pattern 3: Fetch-Then-Check
Many endpoints fetch a record by ID without tenant scoping, then compare the record's tenantId against the user's tenantId in application code. This is a semi-safe pattern that:
1. Leaks record existence via timing differences (403 vs 404)
2. Loads potentially sensitive cross-tenant data into server memory before the check
3. Is fragile: if any code path forgets the check, or if the check is accidentally removed, it becomes a full IDOR

---

## Recommendations

1. **Immediate (Critical):** Fix IDOR-001 through IDOR-004 — these allow active cross-tenant data manipulation
2. **Short-term (High):** Add tenant_id to all storage function WHERE clauses as defense-in-depth
3. **Medium-term:** Replace the fetch-then-check pattern with storage functions that accept and filter by tenant_id
4. **Architecture:** Consider a middleware or base query builder that automatically injects tenant_id for all queries
