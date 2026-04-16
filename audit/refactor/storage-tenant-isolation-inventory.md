# Storage Tenant Isolation — Phase A Inventory

**Date:** 2026-04-15
**File:** `server/storage.ts` (4812 lines)
**Structure:** `interface IStorage` (lines 193-896, type signatures only) + `class DatabaseStorage` (lines 897-4812, implementation)
**Method count:** ~240 implementation methods (the 485 grep count double-counts interface + class)

---

## 1. Classification Summary

| Category | Count | Description |
|----------|-------|-------------|
| GREEN | ~160 | Takes tenantId, uses it in every WHERE clause |
| CREATE | ~40 | Insert-only; tenantId in VALUES, no WHERE needed |
| GLOBAL | 8 | Legitimately cross-tenant (platform admin, tenant lookup) |
| RED | 36 | No tenantId — queries by PK only. IDOR vectors. |
| YELLOW | 2 | Takes tenantId but incomplete enforcement |

---

## 2. GLOBAL Functions (8) — Legitimately Cross-Tenant

| Line | Function | Justification |
|------|----------|---------------|
| 898 | `getTenant(id)` | Tenant IS the entity being looked up |
| 902 | `getTenantBySlug(slug)` | Same — tenant lookup |
| 906 | `getTenantByStripeCustomerId(stripeCustomerId)` | Stripe webhook resolution |
| 910 | `getTenantByWallScreenToken(token)` | Wall screen auth token lookup |
| 928 | `getAllTenants()` | Platform admin query |
| 4251 | `getAllInAppSupportTickets(filters)` | Admin support dashboard; tenantId is optional filter |
| 4275 | `getInAppSupportStats()` | Aggregate platform stats |
| 924 | `updateTenant(id, data)` | Updates a tenant's own row by PK (callers verify authorization) |

---

## 3. YELLOW Functions (2) — Incomplete Enforcement

| Line | Function | Issue |
|------|----------|-------|
| 1194 | `updateOrderItem(id, data, tenantId)` | Takes tenantId but enforces it via a subquery (`WHERE orderId IN (SELECT id FROM orders WHERE tenantId = ?)`) rather than a direct join. Functionally correct but the untyped `Record<string, any>` data param is the real problem (fixed by F-121-FU). |
| 3347 | `getOrderItem(id, tenantId)` | Fetches item by PK, then does a secondary query to verify `parentOrder.tenantId === tenantId` in application code. Functionally guarded but not at the SQL level. |

---

## 4. RED Functions — Complete Inventory (36 functions)

### 4a. DEAD CODE — Zero Callers (13 functions)

These are registered in the interface and implemented in the class but have zero call sites anywhere in `server/`. They should be deleted rather than fixed.

| # | Line | Function | Table | Notes |
|---|------|----------|-------|-------|
| 1 | 1005 | `getMenuItemsByCategory(categoryId)` | menu_items | Tenant-scoped variant `getMenuItemsByTenant` used instead |
| 2 | 1147 | `getOrderByStripeSessionId(sessionId)` | orders | |
| 3 | 1098 | `updateReservation(id, data)` | reservations | Tenant-scoped `updateReservationByTenant` used instead |
| 4 | 1062 | `deleteTable(id)` | tables | Tenant-scoped `deleteTableByTenant` used instead |
| 5 | 4746 | `getValetTicketByBill(billId)` | valet_tickets | |
| 6 | 3983 | `getBillTip(billId)` | bill_tips | |
| 7 | 3269 | `getOrderCourses(orderId)` | order_courses | |
| 8 | 3359 | `getOrderTimeSummary(orderId)` | order_time_summary | |
| 9 | 3347 | `getItemTimeLog(orderItemId)` | item_time_logs | |
| 10 | 3611 | `getVoidedItemsByOrder(orderId)` | voided_items | |
| 11 | 3620 | `getRefireRequestsByOrder(orderId)` | item_refire_requests | |
| 12 | 3876 | `getCashHandovers(sessionId)` | cash_handovers | |
| 13 | 4189 | `getBillPackingCharge(billId)` | bill_packing_charges | |

### 4b. CRITICAL — No Tenant Check, Active Callers, Cross-Tenant Mutation Possible (3 functions)

| # | Line | Function | Table | Callers | Caller Has tenantId? | Post-Fetch Check? |
|---|------|----------|-------|---------|---------------------|-------------------|
| 14 | 985 | `updateCategory(id, data)` | menu_categories | menu.ts:29 (1) | Yes | **No** |
| 15 | 989 | `deleteCategory(id)` | menu_categories | menu.ts:36 (1) | Yes | **No** |
| 16 | 3893 | `updateOutletCurrencySettings(outletId, data)` | outlets | cash-machine.ts:544 (1) | Yes | **No** |

### 4c. HIGH — No Tenant Check, Information Disclosure (3 functions)

| # | Line | Function | Table | Callers | Post-Fetch Check? |
|---|------|----------|-------|---------|-------------------|
| 17 | 977 | `getCategory(id)` | menu_categories | menu.ts:28,35 (2) | **No** |
| 18 | 3884 | `getOutletCurrencySettings(outletId)` | outlets | cash-machine.ts:523 (1) | **No** |
| 19 | 958 | `getOutlet(id)` | outlets | 15 callers — guest.ts (4, public by design), pricing.ts:803,846 (**no check**), others checked |

### 4d. MEDIUM — Defense-in-Depth (callers do post-fetch check, but DB query unscoped) (17 functions)

| # | Line | Function | Table | Callers | Notes |
|---|------|----------|-------|---------|-------|
| 20 | 932 | `getUser(id)` | users | 21 | 8 callers check `tenantId`; rest are self-lookups (user's own ID from session) |
| 21 | 1138 | `getOrderById(id)` | orders | 1 (billing.ts:261 Stripe webhook) | Webhook-controlled; orderId from Stripe metadata |
| 22 | 1164 | `updateOrder(id, data, version?)` | orders | ~27 | Most callers use tenant-scoped source for ID; coordination.ts:269 does NOT |
| 23 | 1172 | `getOrderItemsByOrder(orderId)` | order_items | ~45 | All callers derive orderId from tenant-scoped order fetch |
| 24 | 1324 | `updateCustomer(id, data)` | customers | 1 (compliance.ts:293) | Customer from tenant-scoped source |
| 25 | 2695 | `getBill(id)` | bills | 13 | Most callers check tenantId; line 130 intentionally public (receipt) |
| 26 | 2699 | `getBillByOrder(orderId)` | bills | 2 | Both have adequate context |
| 27 | 2742 | `getPosSession(id)` | pos_sessions | 2 | Both check tenantId post-fetch |
| 28 | 3724 | `getCashSession(id)` | cash_sessions | 13 | All check tenantId post-fetch |
| 29 | 3737 | `updateCashSession(id, data)` | cash_sessions | 2 | Both follow prior tenant check |
| 30 | 4692 | `getValetTicket(id)` | valet_tickets | 16 | 12+ check tenantId; parking-charge-service.ts:21 does not |
| 31 | 4203 | `getInAppSupportTicket(id)` | in_app_support_tickets | 6 | Tenant routes check; admin routes skip (by design) |
| 32 | 4220 | `updateInAppSupportTicket(id, data)` | in_app_support_tickets | 4 | Tenant routes pre-checked; admin routes skip |
| 33 | 3826 | `getCashDrawerEvents(sessionId)` | cash_drawer_events | 1 | Prior session tenant check |
| 34 | 3850 | `getCashPayouts(sessionId)` | cash_payouts | 1 | Prior session tenant check |
| 35 | 4645 | `getParkingRateSlabs(rateId)` | parking_rate_slabs | 3 | All derive rateId from tenant-scoped source |
| 36 | 4656 | `deleteRateSlabsByRate(rateId)` | parking_rate_slabs | 1 | Prior tenant-scoped update gates the delete |

---

## 5. Proposed Fix Batches

### Batch 0: Dead Code Deletion (13 functions)
**Effort:** 1 hour. Delete 13 functions from both interface and class. Zero callers means zero risk.
**Functions:** #1-13 from section 4a.

### Batch 1: Menu Category (3 functions, CRITICAL priority)
**Functions:** `getCategory`, `updateCategory`, `deleteCategory`
**Callers:** 2 in menu.ts (single file)
**Fix:** Add `tenantId` param, add to WHERE clause. Update menu.ts callers to pass `user.tenantId`.
**Effort:** 30 min.

### Batch 2: Outlet Currency Settings (2 functions, CRITICAL priority)
**Functions:** `getOutletCurrencySettings`, `updateOutletCurrencySettings`
**Callers:** 2 in cash-machine.ts (single file)
**Fix:** Add `tenantId` param, add to WHERE clause.
**Effort:** 30 min.

### Batch 3: Order Core (3 functions, HIGH priority, large caller count)
**Functions:** `getOrderById`, `updateOrder`, `getOrderItemsByOrder`
**Callers:** ~73 across many files
**Fix:** Add `tenantId` to `updateOrder` and `getOrderItemsByOrder` WHERE clauses. Deprecate `getOrderById` (1 caller in Stripe webhook — route orderId through tenant-scoped `getOrder` instead).
**Effort:** 2-3 days (large caller count requires careful thread-through).

### Batch 4: Bill & Payment (3 functions, MEDIUM priority)
**Functions:** `getBill`, `getBillByOrder`, `getPosSession`
**Callers:** ~17
**Fix:** Add `tenantId` to WHERE. Keep `getBill` without tenantId for the intentionally-public receipt endpoint but create a separate `getBillPublic` that returns limited fields.
**Effort:** 1 day.

### Batch 5: Cash Session (4 functions, MEDIUM priority)
**Functions:** `getCashSession`, `updateCashSession`, `getCashDrawerEvents`, `getCashPayouts`
**Callers:** ~17 in cash-machine.ts
**Fix:** Add `tenantId` to WHERE. All callers already have `user.tenantId`.
**Effort:** 1 day.

### Batch 6: User & Customer (2 functions, MEDIUM priority)
**Functions:** `getUser`, `updateCustomer`
**Callers:** 22 total
**Fix:** `getUser` is special — used in passport deserialize (no tenantId available). Keep the unscoped version for auth deserialize only; create `getUserByTenant(id, tenantId)` for all other callers. `updateCustomer` gets tenantId in WHERE.
**Effort:** 1 day.

### Batch 7: Outlet (1 function, MEDIUM priority)
**Functions:** `getOutlet`
**Callers:** 15
**Fix:** Complex — 4 callers are public guest routes that intentionally use outletId as a capability token. Keep unscoped `getOutlet` for guest routes; create `getOutletByTenant(id, tenantId)` for authenticated routes. Fix pricing.ts:803,846 to use the tenanted version.
**Effort:** 1 day.

### Batch 8: Valet & Parking (3 functions, LOW priority)
**Functions:** `getValetTicket`, `getParkingRateSlabs`, `deleteRateSlabsByRate`
**Callers:** 20
**Fix:** Add `tenantId` to WHERE. Most callers already have it.
**Effort:** 1 day.

### Batch 9: Support Tickets (2 functions, LOW priority)
**Functions:** `getInAppSupportTicket`, `updateInAppSupportTicket`
**Callers:** 10
**Fix:** Create tenant-scoped variants for tenant-facing routes. Keep unscoped for admin routes.
**Effort:** 4 hours.

---

## 6. Safety Net Strategy

### Recommended Approach: Runtime Assertion at Function Entry

Add a mandatory `tenantId` parameter to every RED function (except GLOBAL and the specific exceptions noted above). At the top of each function, assert:

```typescript
function assertTenantId(tenantId: string | undefined | null, functionName: string): asserts tenantId is string {
  if (!tenantId) {
    throw new Error(`[TENANT_GUARD] ${functionName} called without tenantId — this is a bug`);
  }
}
```

**Why this approach over the alternatives:**

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Runtime assertion (throw) | Immediate, loud failure; easy to add; catches bugs in dev/staging; zero type system changes | Crashes the request if a caller forgets tenantId | **Recommended** — fail-fast is correct for a security boundary |
| TypeScript branded types | Compile-time enforcement; impossible to pass raw strings | Massive type refactor across entire codebase; doesn't prevent `as TenantId` casts | Too much churn for this codebase |
| Wrapper/decorator | Centralized; DRY | Requires refactoring all methods to a new call pattern; doesn't work well with Drizzle's query builder | Over-engineered |

**Implementation plan:** Create `server/lib/tenant-guard.ts` with the `assertTenantId` function. Import and call it as the first line of every fixed storage method. The assertion runs in all environments (dev + prod) — a missing tenantId is always a bug, never expected.

---

## 7. Phase B Plan: Safety Net Implementation

1. Create `server/lib/tenant-guard.ts` with `assertTenantId()`.
2. Add unit tests for the guard function.
3. No storage.ts changes yet — Phase B only creates the tool.

---

## 8. Phase C Plan: Batched Function Fixes

**Order (prioritized by blast radius, then caller count):**

| Order | Batch | Functions | Priority | Callers | Effort |
|-------|-------|-----------|----------|---------|--------|
| 1 | Batch 0 | 13 dead code | — | 0 | 1 hour |
| 2 | Batch 1 | 3 menu category | CRITICAL | 2 | 30 min |
| 3 | Batch 2 | 2 outlet currency | CRITICAL | 2 | 30 min |
| 4 | Batch 3 | 3 order core | HIGH | ~73 | 2-3 days |
| 5 | Batch 4 | 3 bill & payment | MEDIUM | ~17 | 1 day |
| 6 | Batch 5 | 4 cash session | MEDIUM | ~17 | 1 day |
| 7 | Batch 6 | 2 user & customer | MEDIUM | 22 | 1 day |
| 8 | Batch 7 | 1 outlet | MEDIUM | 15 | 1 day |
| 9 | Batch 8 | 3 valet & parking | LOW | 20 | 1 day |
| 10 | Batch 9 | 2 support tickets | LOW | 10 | 4 hours |

**Total estimated effort:** ~8-10 days across 10 branches.

Each batch gets its own branch (`refactor/storage-tenant-batch-N-<domain>`), tests, and commit. Batches 1-2 are quick wins that close the CRITICAL IDOR gaps immediately. Batch 3 is the largest and riskiest (73 callers) — should be done carefully with thorough testing.
