# 02 — New Blockers Recon (2026-04-27)

Read-only static analysis of four production blockers. Every claim cites file:line. No code was modified. No commands beyond `git log/show/blame` were run.

Scope:
- Blocker 1 — Ticket History page does not load
- Blocker 2 — Takeaway cash payment does not mark bill paid
- Blocker 3 — Phone delivery orders missing from Delivery & Online dashboard
- X-02 — TENANT_GUARD on dine-in bill page (`/pos/bill/<orderId>`)

---

## Blocker 1 — Ticket History page "something went wrong"

**Confidence: Medium.** A single, deterministic culprit could not be pinned in static analysis. Listing the most plausible render-time crash candidates and the one server-side response-shape mismatch that could ripple into the render.

### What the page is

- Route: `/tickets` → `client/src/App.tsx:619` (`TicketHistoryPage`, lazy-loaded at `client/src/App.tsx:99`).
- Page component: `client/src/pages/tickets/index.tsx` (`TicketHistoryPage`, default export at line 62).
- API: `GET /api/tickets/history` and `GET /api/tickets/void-requests/pending-count`, served from `server/routers/ticket-history.ts:167` and `:149`.
- "Something went wrong" copy lives in the global error boundary at `client/src/components/GlobalErrorBoundary.tsx:69` — so a render-phase exception in `TicketHistoryPage`, not a server 500, is what produces the symptom.

### Server-side observations [VERIFIED]

The list query at `server/routers/ticket-history.ts:293-320` returns this shape:

```
{ id, orderNumber, channel, status, paymentMethod, totalAmount,
  createdAt, waiterId, outletId, tableNumber, staffName, itemCount,
  hasVoidedItems, hasRefire, paymentStatus, billId }
```

Wrapped in `{ orders, total, hasMore }` (`server/routers/ticket-history.ts:335`).

Three field-name mismatches against the client `TicketRow` interface at `client/src/pages/tickets/index.tsx:22-33`:

1. Server `channel` ← derived from `o.order_type` (line 297). Client expects `orderType` (line 32). `ticket.orderType` is therefore always `undefined` on this page (used at line 402-404 — defensively wrapped, no crash here, but the column displays "—" instead of the order type label).
2. Server `staffName` (line 305). Client expects `waiterName` (line 31). Just a missing label, no crash.
3. Client interface declares `page` and `pageSize` on the response (lines 38-39), server returns `total` and `hasMore` instead (line 335). Client never reads `data.page` / `data.pageSize`, so this is also a soft mismatch.

None of these alone crash the React tree. They show up as missing fields in the UI.

### Client-side render-crash candidates [HYPOTHESIS]

Three places in the render tree throw an unhandled exception if their inputs are not what they assume. Any one of them ripples up to `GlobalErrorBoundary` and produces the symptom.

a) `client/src/pages/tickets/index.tsx:53`
```
const s = statusMap[ticket.status.toLowerCase()] || …
```
Throws `Cannot read properties of null/undefined (reading 'toLowerCase')` if any returned ticket has `status === null`. The `orders.status` column has a default of `"new"` (`shared/schema.ts:465`), so a NULL is unlikely on freshly-created orders. But the column is nullable in Postgres (no `notNull()`), and `tests/` and seed/replit data could include rows with `status` set to NULL by hand or by migrations. Severity: HIGH if encountered, but only crashes the table when a NULL-status ticket happens to fall in the result set.

b) `client/src/pages/tickets/index.tsx:407`
```
{ticket.createdAt ? format(new Date(ticket.createdAt), "h:mm a") : "—"}
```
`date-fns format(new Date("..."), "h:mm a")` throws `RangeError: Invalid time value` if `new Date(ticket.createdAt)` produces an Invalid Date. Server returns `o.created_at AS "createdAt"` — Postgres `timestamp without time zone` (per `shared/schema.ts:493`, `.defaultNow()`, no `withTimezone`). When this is serialized via JSON, Drizzle's pg returns it as a Date stringified to ISO; that should parse. But mixed-tz boot-time DDL and Railway TZ=UTC notes (`docs/audits/bug-inventory.md:F-225`) make timezone-edge dates plausible inputs. Same blast radius — one bad row ⇒ table-level crash.

c) Status filter mismatch noise. `client/src/pages/tickets/index.tsx:75-76` initializes `statusFilter` to `"void_requests"` if the URL has `?filter=void-requests`. The server only special-cases `voided`, `active`, `paid` (`server/routers/ticket-history.ts:250-258`); for any other value (including `void_requests`, `refire`, `high_value`) it falls into the generic `o.status = $X` branch (line 256-258). That returns an empty result set (orderStatusEnum has no value `void_requests`/`refire`/`high_value`) — empty results, not a crash. So this is informational, not the cause.

### Recent history

`git log --oneline -- client/src/pages/tickets/index.tsx`:
```
3d943ad fix(void): align void rejection reason field name between client and server
f43864d fix: QA Round-2 bug fixes (6 bugs, Task #154)
7c35c3a feat(tickets): Phase 1 Order Ticket History UI — all issues resolved
```

`git log --oneline -- server/routers/ticket-history.ts` (last 3):
```
f0a5aac fix: void request persistence, auto-create bill on takeaway settlement, order number generation
03b65f2 fix(kitchen): include void reason in void_request event payload (O4)
b1431b7 fix(tickets): align modification data structure between ticket detail server and client
```

Closest prior fix in the same area: `80df464 Fix dashboard 404, ticket totals zero, and ticket drawer crash` already addressed an earlier "Something went wrong" that originated in `TicketDetailDrawer`. That fix did not change `tickets/index.tsx`.

### Proposed fix approach

Two minimal changes that together harden the render against both candidates (a) and (b), without modifying server response shape:

1. `client/src/pages/tickets/index.tsx:53` — null-guard the status:
   `const s = statusMap[(ticket.status || "").toLowerCase()] || { label: ticket.status ?? "—", className: "..." };`
2. `client/src/pages/tickets/index.tsx:407` — guard against Invalid Date:
   wrap `new Date(ticket.createdAt)` in a `Number.isNaN(d.getTime())` check before `format(...)`.

If a fast confirmation is possible: add a `try { format(new Date(...)) } catch {…}` console.error at line 407 in dev, reproduce the crash with current production data, and confirm which of (a) or (b) hits first. (Owner work, not Claude's.)

### Open question

What does the production tester's browser console show as the actual exception? `GlobalErrorBoundary.componentDidCatch` POSTs to `/api/errors/client` (`client/src/components/GlobalErrorBoundary.tsx:32-43`) — the error body is the deterministic answer. Worth grabbing before merging any fix.

---

## Blocker 2 — Takeaway cash payment does not mark bill paid

**Confidence: High.** Root cause is server-side: the auto-bill creation in `POST /api/orders` hard-codes `paymentStatus: "pending"` regardless of the submitted `paymentMethod`. No follow-up settlement call is made by the takeaway client path.

### Trace

1. **Client — payment method captured before order placement, never replayed against bill.** In `client/src/pages/modules/pos.tsx`:
   - `handlePlaceOrder` (line 1353-1384). For non-dine-in carts (line 1366) it opens the in-line cash/card/UPI modal via `setShowPaymentModal(true)` (line 1380). It does **not** capture the tendered amount on the server side.
   - `confirmPaymentAndPlace` (line 1386-1389) closes the modal and fires `placeOrderMutation.mutate(undefined)`. The tendered amount and selected `paymentMethod` are not sent to any settlement endpoint at this point.
   - On success (line 1316-1320), takeaway/delivery flow opens `BillPreviewModal` via `setShowBillModal(true)`. That modal — not the inline payment modal — is what would call `POST /api/restaurant-bills/:id/payments`. There is no auto-call to it; the cashier must walk the modal forward.

2. **Server — auto-bill always created as pending.** In `server/routers/orders.ts:792-815`:
```
// FIX 2: Auto-create bill for takeaway/delivery when paymentMethod is provided
if (orderData.paymentMethod && order.status === "new") {
  …
  autoBill = await storage.createBill({
    …
    paymentStatus: "pending",
    posSessionId: orderData.posSessionId || null,
  });
}
```
Hard-coded `"pending"` on line 808. No `bill_payments` row is inserted. No `paid_at` on the order.

3. **Dine-in path is fine because it goes through the right endpoint.** `client/src/components/pos/BillPreviewModal.tsx:560-622` (`payBillMutation`) `POST`s `/api/restaurant-bills/:id/payments`, which is the only endpoint that flips `paymentStatus` to `paid` (`server/routers/restaurant-billing.ts:62`). Dine-in funnels through `BillPreviewModal` because there is no auto-bill (the gate at `orders.ts:794` requires both `orderData.paymentMethod` AND `order.status === "new"`; dine-in orders are placed with `status` set to `sent_to_kitchen` for KOT and the cashier later opens `BillPreviewModal`, which lazily creates the bill and immediately routes through the payment mutation).

### Evidence the in-line payment modal collects but discards data

`client/src/pages/modules/pos.tsx:2389-2471` is the takeaway/delivery payment modal. The cashier picks `cash`/`card`/`upi` and types `tenderedAmount` (line 2420). The Confirm button (line 2465-2468) fires `confirmPaymentAndPlace` — which only places the order. Tendered amount, change due, and reference are never POSTed.

### Bug-inventory cross-check [VERIFIED]

`docs/audits/bug-inventory.md:78` lists this as F12 (FIXED) "Bills not auto-created for takeaway orders". The fix landed in `f0a5aac` (was `317579c` per the inventory note; the repo history was rewritten). The fix only created the bill — it did not settle it. The current bug is the residual gap.

### Proposed fix approach

Two viable layers; pick one. Server-side is the more surgical of the two and matches the dine-in invariant ("a paid bill is one with a `bill_payments` row and `paid_at` set").

- **Server (preferred):** in `server/routers/orders.ts:798-810`, when `orderData.paymentMethod` is one of the immediate-settlement methods (`cash`, `upi`, `card`), wrap the `storage.createBill` call in a transaction that also inserts a `bill_payments` row of method/amount = `paymentMethod` / `order.total`, sets bill.paymentStatus = `"paid"` and bill.paidAt = NOW(), and updates the order: `status = 'paid'`, `paid_at = NOW()`. This mirrors what `POST /api/restaurant-bills/:id/payments` already does for dine-in (`server/routers/restaurant-billing.ts:62` and surrounding payment-row insertion). Externalize the side of effects (tip handling, idempotency, audit log) into a helper used by both endpoints to avoid divergence.
- **Client (alternative):** after `placeOrderMutation` resolves with `{bill}` for non-dine-in, call `POST /api/restaurant-bills/:id/payments` with the captured `paymentMethod` and `tenderedAmount`. Keeps the server endpoint single-purpose but adds a network round-trip on the hot path.

The server fix is cleaner because it eliminates the "bill exists but is unpaid" intermediate state — that intermediate state is what is leaking into reports and into the tester's UI today.

---

## Blocker 3 — Phone delivery orders don't appear in Delivery & Online

**Confidence: Medium-Low on a hard root cause.** On paper, a phone order with `orderType="delivery"` should reach the dashboard. There are three failure modes that all match the symptom; I can identify each in code but cannot disambiguate without runtime data.

### Pages and endpoints

- Phone/Advance Order Entry: `client/src/pages/modules/phone-order.tsx` (default export `PhoneOrderPage` at line 65).
- Submission: `POST /api/phone-orders` → `server/routers/service-coordination.ts:633-728`.
- Delivery & Online dashboard: `client/src/pages/modules/delivery-hub.tsx:5-31` wraps:
  - `client/src/pages/modules/delivery.tsx` (the "Delivery" tab) → reads `GET /api/delivery-orders/unified` (handler in `server/routers/delivery.ts:14-79`).
  - `client/src/pages/modules/orders-hub.tsx` (the "Online Orders" tab) — separate.

### What phone delivery actually writes [VERIFIED]

`server/routers/service-coordination.ts:662-680`:
```
const mappedOrderType =
  orderType === "delivery" ? "delivery" :
  orderType === "takeaway" ? "takeaway" : "dine_in";

const order = await storage.createOrder({
  …
  orderType: mappedOrderType as "delivery" | "takeaway" | "dine_in",
  status: isAdvance ? "on_hold" : "new",
  …
  channel: "PHONE",
});
```
Then `server/routers/service-coordination.ts:696-707`:
```
if (orderType === "delivery" && deliveryAddress) {
  await storage.createDeliveryOrder({
    tenantId, orderId: order.id, customerId, customerAddress: deliveryAddress,
    customerPhone, status: "pending", estimatedTime: 45,
    trackingNotes: customerName ? `customerName:${customerName}` : null,
  });
}
```

So when the cashier picks **Delivery**: `orders.order_type = 'delivery'`, `orders.channel = 'PHONE'`, `orders.status = 'new'`, plus a `delivery_orders` row with `status = 'pending'`.

### What the reader filter accepts [VERIFIED]

`server/routers/delivery.ts:27-39`:
```
SELECT … FROM orders o
WHERE o.tenant_id = $1
  AND o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')
  AND o.status NOT IN ('paid', 'completed', 'voided')
  AND (o.channel_order_id IS NULL OR NOT EXISTS (SELECT 1 FROM order_channels oc
     WHERE oc.name = o.order_type AND oc.tenant_id = o.tenant_id AND oc.active = false))
ORDER BY o.created_at DESC
```
Plus a parallel `delivery_orders` fetch via `storage.getDeliveryOrdersByTenant` (`server/storage.ts:1361-1368`). The two are concatenated and de-duplicated by `orderId` at `server/routers/delivery.ts:71-74`.

`'delivery'` is in the IN-list. `channel` (the column the bug-inventory hint mentioned) is **not** part of the filter — only `channel_order_id` is, and phone orders never set it. So writer ⇄ reader on `order_type` is consistent.

### So why might it not appear?

Three live mechanisms each reproduce "order created, doesn't appear" and need to be ruled in or out by the user:

1. **Module gate:** `client/src/pages/modules/delivery.tsx:248-252` only fires the unified query when `tenantConfig?.moduleConfig?.deliveryEnabled === true` (computed at line 229). When delivery is not yet enabled the page renders the "Under Review / Enable Delivery Module" placeholder (`client/src/pages/modules/delivery.tsx:371-435`). On a fresh tenant this is the most likely cause — but only the user can confirm `moduleConfig.deliveryEnabled` for the test tenant.
2. **`orderType: "advance"` is silently miscategorized as dine_in.** If the tester picked the "Advance (Scheduled)" select option instead of "Delivery" (`client/src/pages/modules/phone-order.tsx:430`), the request body sets `orderType: "advance"` (`client/src/pages/modules/phone-order.tsx:229`). The server mapping at `server/routers/service-coordination.ts:662-664` falls through to `"dine_in"`. The order is then **invisible** to the delivery dashboard. The form does not show the delivery-address field for `orderType: "advance"` (`client/src/pages/modules/phone-order.tsx:461`), so this only bites if the tester intended a scheduled delivery — and `phone-order.tsx:439-440` actually labels the date field `"Scheduled Date & Time"` for advance, conflating the two intents.
3. **Sparse render data on the `delivery_orders` entry.** `server/routers/delivery.ts:21-24` returns `delivery_orders` rows directly. They have no `orderNumber`, no `orderTotal`, no `customer_name` column (schema at `shared/schema.ts:827-859`). After dedup (`server/routers/delivery.ts:71-72` drops the matching `orders` row because `orderId` is set), the rendered card shows a "Guest" customer header (`delivery.tsx:541` falls through to "Guest" if `resolveCustomerName` returns null) and no order number. The `customer_address` substring at `client/src/pages/modules/delivery.tsx:545` requires `customerAddress` to be present (it is, per the `notNull()` schema), but a tester scanning a kanban board with no order number or money may be looking past the entry. This is rendering-quality, not data-presence — but it should be considered before declaring "missing".

### Adjacent verifiable detail [VERIFIED]

`server/routers/service-coordination.ts:666-680` does not pass `customerName` or `customerPhone` into `storage.createOrder`. The `orders.customer_name` / `orders.customer_phone` columns (`shared/schema.ts:497-498`) exist and the dashboard reads them at `server/routers/delivery.ts:28-29`. They will be NULL for every phone order. The fallback chain `resolveCustomerName` (`client/src/pages/modules/delivery.tsx:58-73`) parses `trackingNotes` to recover the name. So the data path technically works but is fragile.

### Proposed fix approach

- Confirm which mode the tester hit — module gate, `advance` miscategorization, or sparse-card invisibility — by asking what option they picked and whether `delivery` is enabled in the test tenant.
- If (1): no code change; document module enablement.
- If (2) — most likely candidate that is also a real bug regardless of this report: change `server/routers/service-coordination.ts:662-664` to a stricter mapping that rejects unknown `orderType` values (`return res.status(400)` before insert), or extend the mapping to honor advance-with-delivery (`orderType === "advance" && deliveryAddress` ⇒ `mappedOrderType = "delivery"`), and add a regression test that asserts every supported UI option produces a row that the unified query returns.
- If (3): populate `customer_name`/`customer_phone`/`order_number` on the `orders` row inside the phone-order endpoint, and have `server/routers/delivery.ts:21-24` join `orders` so `delivery_orders` cards know their order number/total.

### Open question

What does the tester see when they reproduce: empty kanban, "Under Review" page, or a kanban with cards that don't look like their order?

---

## X-02 — TENANT_GUARD on dine-in `/pos/bill/<orderId>`

**Confidence: High.** Single line, single missing argument, single endpoint. Diagnosis confirmed.

### Failing call site [VERIFIED]

`server/routers/restaurant-billing.ts:224`
```
const orderItems = await storage.getOrderItemsByOrder(orderId);
```
Inside `app.post("/api/restaurant-bills", …)` (handler starts at `restaurant-billing.ts:211`).

`storage.getOrderItemsByOrder` at `server/storage.ts:1157-1159`:
```
async getOrderItemsByOrder(orderId: string, tenantId: string) {
  assertTenantId(tenantId, "getOrderItemsByOrder");
  return db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.tenantId, tenantId)));
}
```
With `tenantId === undefined` the `assertTenantId` throws the exact error string the tester sees. Tested by reading the assertion message convention in `CLAUDE.md` ("[TENANT_GUARD] <function name> called without a valid tenantId (got <value>) …").

Every other call site to `getOrderItemsByOrder` in the codebase passes both arguments — verified by grepping all 38 call sites; the only single-argument call is `restaurant-billing.ts:224`. Cited representative siblings:
- `server/routers/restaurant-billing.ts:193, :206, :1244` — each `storage.getOrderItemsByOrder(order.id, user.tenantId)` ✓
- `server/routers/orders.ts:171, :192, :321, :714, :1051, :1208, :1388` — all two-argument ✓
- `server/routers/kitchen.ts:64, :95, :128, :141, :163, :227, :756, :826, :889, :947, :985, :1025, :1121, :1171, :1199` — all two-argument ✓
- `server/lib/deduct-recipe-inventory.ts:28` — two-argument ✓

### Why dine-in differs from takeaway/delivery [VERIFIED]

The full-page bill view (`/pos/bill/:orderId`) renders `BillPreviewModal` with `fullPage={true}` (`client/src/pages/pos/bill-view.tsx:81-97`).

Inside the modal at `client/src/components/pos/BillPreviewModal.tsx:448-453`:
```
useEffect(() => {
  if (fullPage && orderId && existingBillStatus === "success" && !existingBillData && !createdBill && !createBillMutation.isPending) {
    userInitiatedPaymentRef.current = true;
    createBillMutation.mutate();
  }
}, [fullPage, orderId, existingBillStatus, existingBillData, createdBill]);
```
`createBillMutation` POSTs `/api/restaurant-bills` (`BillPreviewModal.tsx:528-545`). For the takeaway/delivery flow, the auto-bill at `server/routers/orders.ts:792-815` already created the bill, so `existingBillData` is non-null and this effect does not fire. For the dine-in flow there is no auto-bill (the gate at `orders.ts:794` fails because dine-in orders are typically placed without `paymentMethod` and not all dine-in orders sit in `status = "new"` by the time the bill view opens), so `existingBillData` is null and the effect calls the broken endpoint.

### When this regressed [VERIFIED]

`git log -L 220,230:server/routers/restaurant-billing.ts`:
- The line was introduced in commit `940299c` "fix(api): F-121 server-side bill total recalculation from order items" on **2026-04-15 14:42 IST**. Before this commit there was no `getOrderItemsByOrder` call here.
- The TENANT_GUARD assertion in storage was added later the same day in `9d4cfc9` "refactor(storage): Batch 3 enforce tenantId on order core functions" at **2026-04-15 17:04 IST**.
- The two together produced the regression. Between 14:42 and 17:04 the call existed without a guard — it would have happily returned cross-tenant order items (a quiet IDOR risk) until 17:04 when the guard converted it to a 500.

`git log --oneline -- server/routers/restaurant-billing.ts` shows no later commit touching this line.

### Proposed one-line fix

`server/routers/restaurant-billing.ts:224`, replace
```
const orderItems = await storage.getOrderItemsByOrder(orderId);
```
with
```
const orderItems = await storage.getOrderItemsByOrder(orderId, user.tenantId);
```
`user.tenantId` is in scope (line 213). No other change needed.

### Side note

Worth checking the F-121 commit for any other single-argument storage calls it added; the pattern of the regression suggests the author was working from memory of the pre-Batch-3 signature. A grep for `\bstorage\.\w+ByOrder\(\s*\w+\s*\)` would catch siblings.

---

## Adjacent observations (not investigated)

These were noticed in passing while tracing the four scoped items. One-liners only — none investigated to root cause.

- `server/routers/ticket-history.ts:299` — server returns `o.order_type AS channel`, but the client `tickets/index.tsx` `TicketRow` interface declares `orderType?: string` (line 32). Field-name mismatch; soft only, no crash.
- `server/routers/ticket-history.ts:305` — server returns `staffName`; client expects `waiterName` (`tickets/index.tsx:31`). Soft mismatch.
- `client/src/pages/tickets/index.tsx:75-76` — sends `status=void_requests` / `status=refire` / `status=high_value` to a server that only knows `voided`/`active`/`paid` (`server/routers/ticket-history.ts:250-258`). Returns empty list silently.
- `server/routers/service-coordination.ts:666-680` — `phone-orders` endpoint ignores user-supplied `customerName`/`customerPhone` when creating the `orders` row (only saves to `delivery_orders.tracking_notes`). Means orders.customer_name is NULL for all phone orders.
- `server/routers/service-coordination.ts:662-664` — `orderType: "advance"` falls through to `dine_in`, silently re-classifying advance scheduled orders. Likely an oversight — the schema enum has only `dine_in`/`takeaway`/`delivery`, so "advance" needs to be split into `advance + sub-type`, not collapsed.
- `client/src/pages/modules/pos.tsx:2389-2471` — the in-line cash payment modal accepts `tenderedAmount` and computes `change due`, but never persists tendered/change to the bill. Audit trail loses the cash drawer arithmetic.
- `client/src/pages/modules/delivery.tsx:545` — `delivery.customerAddress.length` access. `customerAddress` is `notNull()` in the schema (`shared/schema.ts:840`), so safe today, but no defensive null-check; future schema relaxation would crash the kanban.
- `server/routers/orders.ts:178-197` `/api/orders/delivery-queue` returns `[]` on any error (line 196 swallows 500). Operationally hides outages.

---

## Open questions for the user

1. Blocker 1 — what is the actual exception text captured by `GlobalErrorBoundary` (POSTed to `/api/errors/client`)? That answers (a) vs (b) instantly.
2. Blocker 2 — is the intended UX "cash entered in the inline modal settles the bill" or "the cashier always confirms in BillPreviewModal"? The fix differs.
3. Blocker 3 — was the test order placed with `Order Type = Delivery` or `Order Type = Advance (Scheduled)`? And is `tenant.moduleConfig.deliveryEnabled` true on the test tenant?
4. X-02 — would the user prefer the surgical `restaurant-billing.ts:224` add-arg fix, or also a defensive sweep through F-121's other introductions for the same pattern?

---

## Addendum 2026-04-28: restaurant-billing.ts full storage audit

Read-only enumeration of every `storage.<fn>(...)` call in `server/routers/restaurant-billing.ts` (1452 lines, 81 calls), cross-referenced against `server/storage.ts` signatures. The goal: find every call that omits a `tenantId` argument that the storage layer requires.

### Storage functions referenced (signatures from `server/storage.ts`)

| Function | storage.ts line | Signature | tenantId required by signature | `assertTenantId` (TENANT_GUARD) |
|----------|------|-----------|--------------------------------|------------------------------|
| `getTenant` | 891 | `(id)` | n/a — `id` IS the tenantId | no |
| `updateTable` | 1063 | `(id, tenantId, data)` | YES | no |
| `getOrder` | 1133 | `(id, tenantId)` | YES | no |
| `updateOrder` | 1148 | `(id, tenantId, data, expectedVersion?)` | YES | YES (1149) |
| `getOrderItemsByOrder` | 1157 | `(orderId, tenantId)` | YES | YES (1158) |
| `getInventoryItem` | 1271 | `(id, tenantId)` | YES | no |
| `updateInventoryItem` | 1281 | `(id, data, tenantId)` | YES | no |
| `createStockMovement` | 1292 | `(data: InsertStockMovement)` | n/a — `data.tenantId` on insert | no |
| `getCustomerByTenant` | 1405 | `(id, tenantId)` | YES | no |
| `updateCustomerByTenant` | 1409 | `(id, tenantId, data)` | YES | no |
| `getStockMovementsByOrder` | 1882 | `(orderId)` | NO | no |
| `createBill` | 2655 | `(data: InsertBill)` | n/a — `data.tenantId` on insert | no |
| `getBill` | 2682 | `(id, tenantId)` | YES | YES (2683) |
| `getBillUnchecked` | 2690 | `(id)` | NO — intentional, public/webhook only | no |
| `getBillByOrder` | 2694 | `(orderId, tenantId)` | YES | YES (2695) |
| `getBillsByTenant` | 2699 | `(tenantId, opts?)` | YES | no |
| `updateBill` | 2711 | `(id, tenantId, data)` | YES | no |
| `createBillPayment` | 2716 | `(data: InsertBillPayment)` | n/a — `data.tenantId` on insert | no |
| `getBillPayments` | 2720 | `(billId)` | NO | no |
| `createPosSession` | 2728 | `(data: InsertPosSession)` | n/a — `data.tenantId` on insert | no |
| `getActivePosSession` | 2732 | `(tenantId, waiterId)` | YES | no |
| `getPosSession` | 2738 | `(id, tenantId)` | YES | YES (2739) |
| `closePosSession` | 2743 | `(id, tenantId, data)` | YES | no |
| `updatePosSession` | 2753 | `(id, tenantId, data)` | YES | no |
| `getPosSessionReport` | 2757 | `(sessionId)` | NO | no |

Functions marked **YES** for "tenantId required" + **YES** for `assertTenantId` are the ones that throw a 500 at runtime when tenantId is missing — the X-02 failure mode. The other "YES" rows fail silently (SQL `eq(col, undefined)` returns no rows) which is bad in a different way but does not surface as a 500.

### Per-call summary table

Route / context column abbreviations:
- `req.user.tenantId` ← route uses `requireAuth` middleware
- `bill.tenantId` ← derived from a bill record fetched earlier in the same handler
- `helper` ← inside `finalizeBillCompletion()` helper, `bill.tenantId` from the typed argument
- `public` ← `/api/public/receipt/:id` — no auth, must derive tenantId from the bill record

| # | Line | Storage call (one-line) | Sig requires tenantId? | tenantId passed? | Verdict | Severity |
|---|------|-------------------------|------------------------|------------------|---------|----------|
| 1 | 62 | `updateBill(bill.id, bill.tenantId, …)` | YES | YES (helper) | OK | Info |
| 2 | 65 | `createBillPayment({ tenantId: bill.tenantId, … })` | n/a (data) | YES (in data) | OK | Info |
| 3 | 76 | `updateOrder(bill.orderId, bill.tenantId, …)` | YES | YES (helper) | OK | Info |
| 4 | 80 | `updateTable(bill.tableId, bill.tenantId, …)` | YES | YES (helper) | OK | Info |
| 5 | 87 | `getCustomerByTenant(bill.customerId, bill.tenantId)` | YES | YES (helper) | OK | Info |
| 6 | 99 | `updateCustomerByTenant(bill.customerId, bill.tenantId, …)` | YES | YES (helper) | OK | Info |
| 7 | 114 | `getBill(bill.id, bill.tenantId)` | YES | YES (helper) | OK | Info |
| 8 | 131 | `getBillUnchecked(req.params.id)` | NO (public-only) | n/a | OK (intentional, public route) | Info |
| 9 | 139 | `getBillPayments(bill.id)` | NO | n/a | OK (sig has none); see Open Q 2 | Info |
| 10 | 140 | `getOrder(bill.orderId, bill.tenantId)` | YES | YES (bill.tenantId) | OK | Info |
| 11 | 141 | `getOrderItemsByOrder(order.id, bill.tenantId)` | YES | YES (bill.tenantId) | OK | Info |
| 12 | 180 | `getBillsByTenant(user.tenantId, …)` | YES | YES (req.user.tenantId) | OK | Info |
| 13 | 188 | `getBill(req.params.id, user.tenantId)` | YES | YES | OK | Info |
| 14 | 191 | `getBillPayments(bill.id)` | NO | n/a | OK; see Open Q 2 | Info |
| 15 | 192 | `getOrder(bill.orderId, user.tenantId)` | YES | YES | OK | Info |
| 16 | 193 | `getOrderItemsByOrder(order.id, user.tenantId)` | YES | YES | OK | Info |
| 17 | 201 | `getBillByOrder(req.params.orderId, user.tenantId)` | YES | YES | OK | Info |
| 18 | 204 | `getBillPayments(bill.id)` | NO | n/a | OK; see Open Q 2 | Info |
| 19 | 205 | `getOrder(bill.orderId, user.tenantId)` | YES | YES | OK | Info |
| 20 | 206 | `getOrderItemsByOrder(order.id, user.tenantId)` | YES | YES | OK | Info |
| 21 | 217 | `getOrder(orderId, user.tenantId)` | YES | YES | OK | Info |
| 22 | 219 | `getBillByOrder(orderId, user.tenantId)` | YES | YES | OK | Info |
| 23 | **224** | **`getOrderItemsByOrder(orderId)`** | **YES** | **NO** | **BUG (X-02)** | **HIGH** |
| 24 | 286 | `getTenant(user.tenantId)` | n/a (id is tenantId) | YES | OK | Info |
| 25 | 328 | `createBill({ tenantId: user.tenantId, … })` | n/a (data) | YES (in data) | OK | Info |
| 26 | 395 | `getBill(req.params.id, user.tenantId)` | YES | YES | OK | Info |
| 27 | 461 | `getTenant(user.tenantId)` | n/a | YES | OK | Info |
| 28 | 521 | `getCustomerByTenant(loyaltyCustomerId, user.tenantId)` | YES | YES | OK | Info |
| 29 | 534 | `createBillPayment({ tenantId: user.tenantId, … })` | n/a (data) | YES (in data) | OK | Info |
| 30 | 581 | `getBillPayments(bill.id)` | NO | n/a | OK; see Open Q 2 | Info |
| 31 | 586 | `updateBill(bill.id, user.tenantId, …)` | YES | YES | OK | Info |
| 32 | 594 | `updateOrder(bill.orderId, user.tenantId, …)` | YES | YES | OK | Info |
| 33 | 596 | `updateTable(bill.tableId, user.tenantId, …)` | YES | YES | OK | Info |
| 34 | 602 | `getCustomerByTenant(effectiveLoyaltyCustomerId, user.tenantId)` | YES | YES | OK | Info |
| 35 | 618 | `updateCustomerByTenant(effectiveLoyaltyCustomerId, user.tenantId, …)` | YES | YES | OK | Info |
| 36 | 719 | `getBill(req.params.id, user.tenantId)` | YES | YES | OK | Info |
| 37 | 727 | `getBillPayments(bill.id)` | NO | n/a | OK; see Open Q 2 | Info |
| 38 | 733 | `getStockMovementsByOrder(bill.orderId)` | NO | n/a | OK (sig has none); see Open Q 2 | Info |
| 39 | 736 | `getInventoryItem(mv.itemId, user.tenantId)` | YES | YES | OK | Info |
| 40 | 741 | `updateInventoryItem(mv.itemId, {…}, user.tenantId)` | YES | YES (3rd arg) | OK | Info |
| 41 | 744 | `createStockMovement({ tenantId: user.tenantId, … })` | n/a (data) | YES (in data) | OK | Info |
| 42 | 762 | `updateBill(bill.id, user.tenantId, …)` | YES | YES | OK | Info |
| 43 | 769 | `updateOrder(bill.orderId, user.tenantId, …)` | YES | YES | OK | Info |
| 44 | 771 | `updateTable(bill.tableId, user.tenantId, …)` | YES | YES | OK | Info |
| 45 | 776 | `getCustomerByTenant(bill.customerId, user.tenantId)` | YES | YES | OK | Info |
| 46 | 780 | `updateCustomerByTenant(bill.customerId, user.tenantId, …)` | YES | YES | OK | Info |
| 47 | 790 | `getBillPayments(bill.id)` | NO | n/a | OK; see Open Q 2 | Info |
| 48 | 827 | `getBill(req.params.id, user.tenantId)` | YES | YES | OK | Info |
| 49 | 837 | `getBillPayments(bill.id)` | NO | n/a | OK; see Open Q 2 | Info |
| 50 | 873 | `getTenant(user.tenantId)` | n/a | YES | OK | Info |
| 51 | 901 | `createBillPayment({ tenantId: user.tenantId, … })` | n/a (data) | YES (in data) | OK | Info |
| 52 | 921 | `updateBill(bill.id, user.tenantId, …)` | YES | YES | OK | Info |
| 53 | 927 | `getCustomerByTenant(customerId, user.tenantId)` | YES | YES | OK | Info |
| 54 | 937 | `updateCustomerByTenant(customerId, user.tenantId, …)` | YES | YES | OK | Info |
| 55 | 981 | `getActivePosSession(user.tenantId, user.id)` | YES | YES | OK | Info |
| 56 | 989 | `getActivePosSession(user.tenantId, user.id)` | YES | YES | OK | Info |
| 57 | 995 | `createPosSession({ tenantId: user.tenantId, … })` | n/a (data) | YES (in data) | OK | Info |
| 58 | 1019 | `getPosSession(sessionId, user.tenantId)` | YES | YES | OK | Info |
| 59 | 1022 | `getActivePosSession(user.tenantId, user.id)` | YES | YES | OK | Info |
| 60 | 1026 | `getPosSessionReport(session.id)` | NO | n/a | OK (sig has none); see Open Q 4 | Info |
| 61 | 1027 | `updatePosSession(session.id, user.tenantId, …)` | YES | YES | OK | Info |
| 62 | 1032 | `closePosSession(session.id, user.tenantId, …)` | YES | YES | OK | Info |
| 63 | 1046 | `getActivePosSession(user.tenantId, user.id)` | YES | YES | OK | Info |
| 64 | 1048 | `getPosSessionReport(active.id)` | NO | n/a | OK (sig has none); see Open Q 4 | Info |
| 65 | 1051 | `getPosSession(sessionId, user.tenantId)` | YES | YES | OK | Info |
| 66 | 1053 | `getPosSessionReport(sessionId)` | NO | n/a | OK (sig has none); see Open Q 4 | Info |
| 67 | 1084 | `getBill(req.params.id, user.tenantId)` | YES | YES | OK | Info |
| 68 | 1089 | `getTenant(user.tenantId)` | n/a | YES | OK | Info |
| 69 | 1096 | `updateBill(bill.id, user.tenantId, …)` | YES | YES | OK | Info |
| 70 | 1120 | `updateBill(bill.id, user.tenantId, …)` | YES | YES | OK | Info |
| 71 | 1160 | `getBill(req.params.id, user.tenantId)` | YES | YES | OK | Info |
| 72 | 1170 | `createBillPayment({ tenantId: user.tenantId, … })` | n/a (data) | YES (in data) | OK | Info |
| 73 | 1179 | `updateBill(bill.id, user.tenantId, …)` | YES | YES | OK | Info |
| 74 | 1190 | `getBill(req.params.id, user.tenantId)` | YES | YES | OK | Info |
| 75 | 1198 | `getTenant(user.tenantId)` | n/a | YES | OK | Info |
| 76 | 1207 | `getBill(bill.id, user.tenantId)` | YES | YES | OK | Info |
| 77 | 1238 | `getBill(req.params.id, user.tenantId)` | YES | YES | OK | Info |
| 78 | 1242 | `getBillPayments(bill.id)` | NO | n/a | OK; see Open Q 2 | Info |
| 79 | 1243 | `getOrder(bill.orderId, user.tenantId)` | YES | YES | OK | Info |
| 80 | 1244 | `getOrderItemsByOrder(order.id, user.tenantId)` | YES | YES | OK | Info |
| 81 | 1245 | `getTenant(user.tenantId)` | n/a | YES | OK | Info |

**Headline result: exactly one TENANT_GUARD violation in `restaurant-billing.ts` — line 224. Every other call passes a tenantId where the signature requires one.**

### Per-bug detail

#### BUG #1 — line 224 (already known as X-02)

- **File:line** — `server/routers/restaurant-billing.ts:224`
- **Current code** — `const orderItems = await storage.getOrderItemsByOrder(orderId);`
- **Proposed fix** — `const orderItems = await storage.getOrderItemsByOrder(orderId, user.tenantId);`
- **Source of tenantId for the fix** — `req.user.tenantId`. Route is `app.post("/api/restaurant-bills", requireAuth, …)` declared at `restaurant-billing.ts:211`; `const user = req.user as any;` is already in scope at line 213 and used by the rest of the handler (lines 217, 219, 270, 286, 312, 322, 329, 335…). No new variable extraction needed.
- **Confidence** — HIGH. The storage signature at `storage.ts:1157` is `getOrderItemsByOrder(orderId: string, tenantId: string)` and the next line (`assertTenantId(tenantId, "getOrderItemsByOrder")`) throws when tenantId is undefined. Calling with a single argument is a TS error that would have been caught at compile time if strict mode were applied to this call site — the implication is that this site type-erases through `as any` somewhere, or the call was added without a fresh build. The two sibling calls in the same handler (lines 193 and 206) pass `user.tenantId` correctly.
- **Affects which user actions** — `POST /api/restaurant-bills`, the bill-creation endpoint. Every flow that finalises an order into a bill hits this path:
  - **Dine-in:** "Generate Bill" / "Print Preview" on the dine-in POS bill page (`/pos/bill/<orderId>`).
  - **Takeaway:** the takeaway checkout flow, after the cashier confirms order items.
  - **Delivery:** delivery dashboard's "Bill" action when finalising a delivery order for payment.
  - All three throw `Error: tenantId is required for getOrderItemsByOrder` → the catch at line 384 returns HTTP 500 with that message → client surfaces "something went wrong" / red toast and the bill row never gets created. Order remains in `pending`/`active` and the table stays seated.

### Open questions

1. The task brief stated "the recon flagged a SECOND likely violation at line 247 (`getOrderById(order.id)`)". I verified the current file: line 247 is `packingChargeAmount = frontendPackingCharge;` (inside the takeaway/delivery packing-charge branch), and a grep for `getOrderById` across `server/routers/restaurant-billing.ts` returns zero matches. There is no `getOrderById` call anywhere in this file. Possibilities: (a) the recon's line number was stale relative to the current file, (b) it was hallucinated, or (c) the recon meant a different file. **No bug found at line 247.** This conflicts with the brief — flagging for the user to reconcile.
2. Eight calls to `storage.getBillPayments(billId)` (lines 139, 191, 204, 581, 727, 790, 837, 1242) and one call to `storage.getStockMovementsByOrder(orderId)` (line 733) take only an entity ID — no tenantId in the signature. These are NOT TENANT_GUARD violations (no tenantId argument exists to be missing), but they are **cross-tenant data-exposure risks**: if a UUID from another tenant is ever substituted into the URL or fetched via a parent record that wasn't tenant-checked first, the storage layer will not refuse. In every restaurant-billing.ts case the parent (`bill`/`order`) was fetched under the right tenantId immediately before, so the calls are safe in this file *today*. Worth a separate pass on those storage signatures (consider: should they accept and enforce tenantId?).
3. Functions that take tenantId in their signature but lack `assertTenantId`: `updateBill`, `updateTable`, `getCustomerByTenant`, `updateCustomerByTenant`, `getInventoryItem`, `updateInventoryItem`, `getOrder`, `closePosSession`, `updatePosSession`, `getActivePosSession`, `getBillsByTenant`. A future regression that passes `undefined` here would silently match no rows (returning `undefined` / `[]`) rather than throwing 500 — a quieter but worse-for-debugging failure mode. Considered out of scope for this audit; flagged for a hardening sweep.
4. `storage.getPosSessionReport(sessionId)` (lines 1026, 1048, 1053) does not validate tenant ownership at the storage layer. The handlers above each call do a prior `getPosSession(sessionId, user.tenantId)` (lines 1019, 1051) or `getActivePosSession(user.tenantId, user.id)` (line 1046) check first, so the report is never returned for a session belonging to a different tenant *as long as those checks remain in place*. A future refactor that drops the `getPosSession` precheck would expose another tenant's session report. Worth tightening `getPosSessionReport` to take and enforce tenantId; out of scope here.
5. The recon's "side note" suggested grepping for `\bstorage\.\w+ByOrder\(\s*\w+\s*\)` to catch siblings of the X-02 pattern. Done implicitly by the table above: only `getOrderItemsByOrder(orderId)` at line 224 matches the single-arg `…ByOrder(...)` pattern. `getStockMovementsByOrder(bill.orderId)` at line 733 *is* single-arg but the function signature is also single-arg, so it's not a regression.

---

## Addendum 2026-04-28: BL-2 fix recon

### Summary

BL-2: takeaway/delivery orders paid with cash leave the auto-created bill in `paymentStatus = "pending"` because the order-creation handler creates the bill but never records a payment or flips the status. Confidence **HIGH** that the root cause is in `server/routers/orders.ts:792-815`: the block calls `storage.createBill({ … paymentStatus: "pending" … })` and stops — there is no follow-up `createBillPayment` / `updateBill` to mark it paid. Fix is server-side: when `orderData.paymentMethod === "cash"` and the auto-bill is created, immediately record a `bill_payments` row and update the bill's `paymentStatus` to `"paid"` (with `paidAt`); client adds `tenderedAmount` to the request body for forward-compat with cash-drawer audit.

### Server-side change

- **File:** `server/routers/orders.ts`
- **Block to modify:** lines 792-815 (auto-bill creation block, comment "FIX 2: Auto-create bill for takeaway/delivery when paymentMethod is provided")

#### Existing code (verbatim, lines 792-815)

```ts
      // FIX 2: Auto-create bill for takeaway/delivery when paymentMethod is provided
      let autoBill = null;
      if (orderData.paymentMethod && order.status === "new") {
        try {
          const existingBill = await storage.getBillByOrder(order.id, user.tenantId);
          if (!existingBill) {
            autoBill = await storage.createBill({
              tenantId: user.tenantId,
              orderId: order.id,
              tableId: order.tableId || null,
              customerId: order.customerId || null,
              subtotal: order.subtotal,
              discountAmount: order.discount || "0",
              serviceCharge: order.serviceCharge || "0",
              taxAmount: order.tax || "0",
              totalAmount: order.total,
              paymentStatus: "pending",
              posSessionId: orderData.posSessionId || null,
            });
          }
        } catch (billErr) {
          console.error("[orders] auto-bill creation failed (non-fatal):", billErr);
        }
      }
```

#### Proposed code (with auto-payment for cash)

```ts
      // FIX 2: Auto-create bill for takeaway/delivery when paymentMethod is provided
      let autoBill = null;
      if (orderData.paymentMethod && order.status === "new") {
        try {
          const existingBill = await storage.getBillByOrder(order.id, user.tenantId);
          if (!existingBill) {
            autoBill = await storage.createBill({
              tenantId: user.tenantId,
              orderId: order.id,
              tableId: order.tableId || null,
              customerId: order.customerId || null,
              subtotal: order.subtotal,
              discountAmount: order.discount || "0",
              serviceCharge: order.serviceCharge || "0",
              taxAmount: order.tax || "0",
              totalAmount: order.total,
              paymentStatus: "pending",
              posSessionId: orderData.posSessionId || null,
            });

            // BL-2 fix: cash takeaway/delivery is paid at order time — record the payment
            // and flip the bill to "paid". Card flows are settled by Stripe webhook;
            // UPI is a placeholder. Both remain "pending" here.
            if (autoBill && (orderData.paymentMethod as string).toLowerCase() === "cash") {
              await storage.createBillPayment({
                tenantId: user.tenantId,
                billId: autoBill.id,
                paymentMethod: "CASH",
                amount: order.total,
                collectedBy: user.id,
                isRefund: false,
              });
              autoBill = (await storage.updateBill(autoBill.id, user.tenantId, {
                paymentStatus: "paid",
                paidAt: new Date(),
              })) ?? autoBill;

              // Fire-and-forget: cash session totals + drawer event.
              // Mirrors restaurant-billing.ts:546-578 for the manual payment path.
              const cashAmount = Number(order.total);
              const tendered = orderData.tenderedAmount != null ? Number(orderData.tenderedAmount) : null;
              setImmediate(async () => {
                try {
                  const { rows: sessRows } = await pool.query(
                    `SELECT id FROM cash_sessions WHERE cashier_id = $1 AND status = 'open' AND tenant_id = $2 LIMIT 1`,
                    [user.id, user.tenantId]
                  );
                  if (sessRows[0]) {
                    const sessionId = sessRows[0].id;
                    await pool.query(
                      `UPDATE cash_sessions
                       SET total_cash_sales = total_cash_sales + $1,
                           total_transactions = total_transactions + 1,
                           expected_closing_cash = opening_float + total_cash_sales + $1 - total_cash_refunds - total_cash_payouts
                       WHERE id = $2`,
                      [cashAmount, sessionId]
                    );
                    await logCashDrawerEvent({
                      tenantId: user.tenantId,
                      cashierId: user.id,
                      cashierName: user.name || user.username,
                      eventType: "SALE",
                      billId: autoBill.id,
                      orderId: order.id,
                      amount: cashAmount,
                      sessionId,
                    });
                  }
                } catch (e) {
                  console.error("[orders] auto-payment cash session update failed:", e);
                }
                void tendered; // reserved for future logCashDrawerEvent extension (cash_drawer_events.tendered_amount column exists at shared/schema.ts:4371)
              });
            }
          }
        } catch (billErr) {
          console.error("[orders] auto-bill creation failed (non-fatal):", billErr);
        }
      }
```

#### Justification: Approach B (inline) over Approach A (extract service)

Approach B is the right call here. The existing endpoint at `server/routers/restaurant-billing.ts:387` is ~330 lines because it has to handle idempotency replay, multi-payment splits, tip distribution, loyalty redemption, tax-rate sanity checks, field-integrity validation, and order completion (mark order `completed`, free table, emit `order:completed`). **None** of that applies to the auto-payment path: it is always a single CASH tender, the amount equals `order.total` (server-computed), the order must stay in `new` status because the kitchen still has to cook it, and idempotency is already provided by the parent `POST /api/orders` handler at orders.ts:818-824. Extracting a shared service means untangling those endpoint-specific concerns from the genuinely shared "create-payment-and-mark-paid" core — a refactor that touches both files and risks regressing the manual-payment endpoint that was just hardened in PR-001/PR-004. Inlining the 30-line subset here keeps the BL-2 fix surgical and reversible. If a third caller emerges (e.g., UPI auto-settle), revisit and extract.

#### Source of identifiers in scope at the insertion point

| Identifier | In scope at line 810? | Source |
|------------|------------------------|--------|
| `user.tenantId` | YES | `const user = req.user as Express.User & {…}` (declared earlier in `POST /api/orders` handler — used throughout the block, e.g. line 796, 799, 822, 834) |
| `user.id` | YES | same |
| `user.name` / `user.username` | YES | same |
| `autoBill.id` | YES | created on line 798-810 |
| `order.total` | YES | `order` is the just-created order (returned by `storage.createOrder` earlier in the handler — used at line 803, 807) |
| `order.id` | YES | same |
| `orderData.paymentMethod` | YES | from `req.body`, gated by line 794 |
| `orderData.tenderedAmount` | YES (after client patch lands) | from `req.body`; backwards-compat: `null`/`undefined` if client is older |
| `pool` | YES | imported at orders.ts:5 |

#### Imports to add

Only one:

```ts
import { logCashDrawerEvent } from "./cash-drawer-log";
```

…goes alongside the existing router imports (orders.ts:7-24). `storage`, `pool`, `setImmediate` (Node global) are already in scope.

### Client-side change

- **File:** `client/src/pages/modules/pos.tsx`
- **Block to modify:** `buildOrderData` callback, lines 1158-1241 — specifically the trailing conditional block that attaches `paymentMethod` for non-dine-in (line 1236).

#### Existing code (verbatim, lines 1234-1241)

```ts
    };
    if (tab.heldOrderId) orderData.parentOrderId = tab.heldOrderId;
    if (!tabIsDineIn) orderData.paymentMethod = paymentMethod;
    if (!tabIsDineIn) { orderData.customerName = tab.customerName?.trim() || null; orderData.customerPhone = tab.customerPhone?.trim() || null; }
    if (supervisorOverride) orderData.supervisorOverride = supervisorOverride;
    if (!isAddonKot && tab.dismissedRuleIds.length > 0) orderData.dismissedRuleIds = tab.dismissedRuleIds;
    return orderData;
  }, [activeTab, paymentMethod, tenantServiceChargePct, tenantCompoundTax, taxRate]);
```

#### Proposed code

```ts
    };
    if (tab.heldOrderId) orderData.parentOrderId = tab.heldOrderId;
    if (!tabIsDineIn) orderData.paymentMethod = paymentMethod;
    if (!tabIsDineIn && paymentMethod === "cash" && tenderedAmount) {
      orderData.tenderedAmount = parseFloat(Number(tenderedAmount).toFixed(2)).toFixed(2);
    }
    if (!tabIsDineIn) { orderData.customerName = tab.customerName?.trim() || null; orderData.customerPhone = tab.customerPhone?.trim() || null; }
    if (supervisorOverride) orderData.supervisorOverride = supervisorOverride;
    if (!isAddonKot && tab.dismissedRuleIds.length > 0) orderData.dismissedRuleIds = tab.dismissedRuleIds;
    return orderData;
  }, [activeTab, paymentMethod, tenderedAmount, tenantServiceChargePct, tenantCompoundTax, taxRate]);
```

Two edits:
1. Insert a 3-line guarded assignment after line 1236 that adds `tenderedAmount` (as a 2-decimal string, matching the server's monetary string convention used by `subtotal`, `tax`, `total` in the same `orderData` object) only when both the order is not dine-in AND the payment method is cash AND the user has typed a value.
2. Add `tenderedAmount` to the `useCallback` dependency array on line 1241 so the closure picks up state changes.

#### Conditions under which `tenderedAmount` is sent

| Condition | Sent? |
|-----------|-------|
| `tab.orderType === "dine_in"` | NO — guarded by `!tabIsDineIn`. Dine-in pays at end-of-meal via the standard bill flow. |
| `paymentMethod === "card"` | NO — Stripe webhook owns the paid transition. |
| `paymentMethod === "upi"` | NO — placeholder, not implemented. |
| `paymentMethod === "cash"` AND `tenderedAmount === ""` | NO — user hasn't entered an amount; the modal's confirm button is also disabled (line 2466), so this branch shouldn't fire in practice. |
| `paymentMethod === "cash"` AND `!tabIsDineIn` AND `tenderedAmount` truthy | YES |

The state is already populated by the cash modal at pos.tsx:566 (`useState("")`), set by the input at pos.tsx:2420 and quick-tender buttons at 2423-2433, and validated `>= total` by the disabled-state on the confirm button at pos.tsx:2466. `confirmPaymentAndPlace` (line 1386) closes the modal and triggers `placeOrderMutation`, which calls `buildOrderData` — so `tenderedAmount` is reliably non-empty by the time `buildOrderData` reads it.

### Validation

- **Does the server need to validate the new `tenderedAmount` field?** **Soft validation only.** The bill-paid transition does NOT depend on `tenderedAmount` (the payment amount stored in `bill_payments` is `order.total`, server-computed). `tenderedAmount` is informational — it documents what the customer handed over so the cash drawer audit trail (`cash_drawer_events.tendered_amount`, schema.ts:4371) can be populated later. A reasonable middle ground: in the orders.ts auto-payment block, parse with `Number()` and only persist if the result is finite and `>= Number(order.total) - 0.01`. Hard-rejecting with 4xx would be wrong because the bill-paid transition still works correctly without it — keep the order-creation path resilient.

- **Client sends `tenderedAmount` but server doesn't expect it (deploy lag — old server, new client):** Safe. The current orders.ts handler reads `orderData.paymentMethod` (line 794) and `orderData.posSessionId` (line 809) by name; any extra field on the JSON body is ignored by the handler and never persisted (Drizzle's `storage.createBill` and `storage.createOrder` only consume known columns). No 400, no schema rejection — the field just falls on the floor. Forward-compat is implicit.

- **Server expects `tenderedAmount` but client doesn't send it (deploy lag — new server, old client):** Safe. The proposed server code reads `orderData.tenderedAmount != null` and falls back to `null`. The bill-paid transition runs identically whether `tenderedAmount` is present or absent — only the cash-drawer event's `tendered_amount` column would be NULL (which it already is today, since `logCashDrawerEvent` doesn't accept the field yet). No throw, no 500.

- **Idempotency interaction:** the parent endpoint stores `response_body` only after auto-bill (and now auto-payment) completes (orders.ts:825 sets `idemResponseStored = true` AFTER `res.json`). On replay, the same order/bill/payment trio is returned without re-running the side effects. No double-charging.

### Open questions

1. **Recon mismatch — service file:** Last night's recon (audit/02-new-blockers-recon.md, Blocker 2) and this task brief both refer to `restaurantBillingService.createBillForOrder(...)`, but **no such file or function exists** anywhere under `server/`. The auto-bill code is inline at `orders.ts:798-810` calling `storage.createBill` directly. The recon was written against an imagined module structure. Flagging because the same misunderstanding could cause a fix-author to look in the wrong place.
2. **Order-status semantics for paid takeaway:** the current flow leaves the order in `status = "new"` after auto-payment — kitchen still has to cook it. The dine-in payment endpoint at `restaurant-billing.ts:594` flips order `status` to `"completed"` on full payment. Should takeaway/delivery cash-paid orders also auto-transition through some intermediate state (e.g., `paid` flag, `payment_status` on `orders` table at schema.ts:453), or is the current "new + bill paid" combo the intended state? Going with "leave order alone, only flip bill" in the proposed fix since the kitchen still owns the lifecycle. **Open for confirmation.**
3. **`order.total` is a decimal string, not a number:** at `orders.ts:807` the bill is created with `totalAmount: order.total` (string from Drizzle decimal). The proposed `createBillPayment({ amount: order.total, … })` passes the same string, which `bill_payments.amount` accepts (also `decimal`). Confirmed by inspection of schema.ts:2905 (`bills.totalAmount`) and the existing `createBillPayment` calls in restaurant-billing.ts:537, 904 which pass `String(p.amount)`. No conversion needed.
4. **Cash drawer event when no open session:** `logCashDrawerEvent` at cash-drawer-log.ts:35 silently returns if no open `cash_sessions` row exists for `(tenantId, cashierId)`. Means: if a cashier hasn't opened their till but takes a cash takeaway order (operationally suspect but possible), the bill flips to "paid" but no cash drawer event is recorded. Mirrors the manual-payment endpoint's behavior at restaurant-billing.ts:553-573. Documenting, not fixing.
5. **`logCashDrawerEvent` does not accept `tenderedAmount`:** the helper signature (cash-drawer-log.ts:11-21) takes `amount` but not `tenderedAmount` / `changeGiven`, even though the columns exist on `cash_drawer_events` (schema.ts:4371-4372). Extending the helper to accept and persist these is a separate, pre-existing gap (already noted in the recon's "Adjacent observations" for `pos.tsx:2389-2471`). The proposed BL-2 fix carries `tenderedAmount` from client to server but does not yet write it — `void tendered;` line is a deliberate pin so a follow-up PR can flip it on without re-shipping the client.
6. **Bill auto-print:** the manual-payment endpoint fires `routeAndPrint({ jobType: "receipt", … })` at restaurant-billing.ts:625-634 on full payment. Should the auto-payment path also auto-print the receipt for takeaway/delivery cash orders? Not included in the proposed fix to keep the diff minimal; flagging as a UX question.

### Confidence

**HIGH** — the bug is mechanical and the fix is mechanical. (a) The bug location is verified: `orders.ts:808` literally writes `paymentStatus: "pending"` and there is no subsequent payment-recording code in the same try-block (lines 794-815). (b) The fix mirrors the well-tested manual path at `restaurant-billing.ts:534-591` — same `createBillPayment` shape, same `updateBill` arguments, same setImmediate cash-session update. (c) Every identifier the new code references is already in lexical scope at the insertion point (verified above). (d) Backwards/forwards-compat is symmetric: extra body fields are ignored by old servers, missing body fields fall back to `null` on new servers. (e) Idempotency is unchanged because the auto-payment lives inside the same `try` block whose response is captured by the parent handler's existing idempotency machinery. The only residual risk is the order-status semantic question (Open Q 2) — a product decision, not a code-correctness issue. Recommend proceeding to a fix branch once Open Q 2 is resolved.

---

## Addendum 2026-04-28 (revised): BL-2 root cause — version conflict on Proceed to Payment

### Summary

The user-visible symptom "nothing happens when I click Proceed to Payment" is caused by a missing ref-setter in `BillPreviewModal.tsx:handleProceedToPayment` (line 709) — a regression introduced by commit `b1b4d87` ("POS-05 remove auto-advance from bill preview") on 2026-04-11. The mutation runs and succeeds, but `onSuccess` does not advance to the payment step because it gates on `userInitiatedPaymentRef.current`, which `handleProceedToPayment` never sets. The reported "PATCH /api/orders/:id 409" requests **do not originate from the bill page** under static tracing — the bill page (`bill-view.tsx`) and `BillPreviewModal.tsx` make no `PATCH /api/orders/:id` calls of any kind, so the 409s must be coming from a different component or session. **Confidence HIGH for the silent-failure root cause; LOW for any 409-PATCH theory absent additional evidence.**

### Bill page location

- **Route registration:** `client/src/App.tsx:571` — `<Route path="/pos/bill/:orderId">{() => <GuardedRoute path="/pos" component={BillViewPage} />}</Route>`
- **Lazy import:** `client/src/App.tsx:59` — `const BillViewPage = lazy(() => import("@/pages/pos/bill-view"));`
- **Page component:** `client/src/pages/pos/bill-view.tsx:11-100` — thin wrapper that fetches the order via `GET /api/orders/:orderId` (line 21) and renders `<BillPreviewModal open={true} fullPage={true} … />` (line 81-97).
- **Modal component:** `client/src/components/pos/BillPreviewModal.tsx:115-2398` — the actual UI for preview / payment / receipt steps.
- **"Proceed to Payment" button:** `client/src/components/pos/BillPreviewModal.tsx:1541-1543` — `<Button onClick={handleProceedToPayment} disabled={createBillMutation.isPending || !grandTotal || grandTotal <= 0} … data-testid="button-proceed-payment">`.
- **Click handler:** `BillPreviewModal.tsx:709-720` — `handleProceedToPayment`. Calls `createBillMutation.mutate()` only.

### Client-side mutation

- **Mutation declaration:** `BillPreviewModal.tsx:528-558` — `createBillMutation`.
- **HTTP call:** `POST /api/restaurant-bills` (line 530). **NOT** `PATCH /api/orders/:id`.
- **Body shape (lines 530-544):** `{ orderId, tableId, customerId, subtotal, discountAmount, serviceCharge, taxAmount, taxBreakdown, tips: "0", totalAmount, parkingCharge, posSessionId, customerGstin }`. No `version` field, no order PATCH.
- **Source of `orderId` at click time:** prop drilled from `bill-view.tsx:93` where `orderId={order.id}` is derived from `useParams<{ orderId: string }>()` (`bill-view.tsx:12`) — read-only, never mutated by the bill page.
- **Source of `version` at click time:** **N/A** — the bill page and modal never read or transmit `order.version`. A grep for `version` in `BillPreviewModal.tsx` returns zero matches; in `bill-view.tsx`, only the typed `Order` field is referenced indirectly via `order.subtotal/.tax/.total`, never `.version`.
- **Websocket subscription that touches the order:** `BillPreviewModal.tsx:199-204` — `useRealtimeEvent("bill:updated", …)` invalidates `["/api/orders"]` query (causing a *re-fetch*, GET) but never PATCHes. No other order-related realtime subscriptions in the modal.
- **Auto-fire of `createBillMutation`:** `BillPreviewModal.tsx:448-453` — when `fullPage && !existingBillData && !createdBill`, the effect sets `userInitiatedPaymentRef.current = true` (line 450) and calls `createBillMutation.mutate()` (line 451). This is the **only** place that sets the ref to true.

### Server-side PATCH handler

- **Handler:** `server/routers/orders.ts:845-1166` — `app.patch("/api/orders/:id", requireAuth, …)`.
- **Version-check logic (verbatim, lines 877-882, 992-996):**
  ```ts
  // Optimistic locking: version is REQUIRED for all order updates.
  // Clients must always send the current version they loaded; server rejects stale updates with 409.
  if (req.body.version === undefined || req.body.version === null) {
    return res.status(400).json({ code: "VERSION_REQUIRED", message: "Order version is required for updates. Reload the order and try again." });
  }
  const clientVersion = Number(req.body.version);
  …
  // Strip version from updateData before passing to Drizzle — version is managed by the server.
  const { version: _versionField, ...updateDataNoVersion }: Record<string, unknown> = updateData;
  // Build atomic WHERE clause: always include version (now always required)
  const orderWhereClause = and(eq(ordersTable.id, req.params.id), eq(ordersTable.version, clientVersion));
  const updateDataWithVersion = { ...updateDataNoVersion, version: sql`COALESCE(${ordersTable.version}, 0) + 1` };
  ```
- **409 throw point (lines 1045-1048):**
  ```ts
  // If version check failed (no rows updated), return 409
  if (!order) {
    return res.status(409).json({ code: "VERSION_CONFLICT", message: "Order was updated by someone else — refresh and try again." });
  }
  ```
  `order` is `undefined` when the atomic UPDATE matched zero rows because `clientVersion !== currentVersion`. There is no "X-Y" diagnostic in the response — just the generic message.
- **Allowed status transitions:** the handler accepts any value in `req.body.status`. Branches that have additional behavior:
  - `"sent_to_kitchen"` (lines 857-875, 1050-1099) — KOT printing, KDS arrival
  - `"paid"` (lines 909-927, 939-976, 1102-1105) — service-charge top-up for dine-in, recipe inventory deduction, free table
  - `"voided"` / `"cancelled"` (lines 977-990, 1106-1112, 1124-1130) — recipe reversal, free table, audit
  - any terminal status (lines 1115-1122) — emit `order:completed`; otherwise emit `order:updated`
- **Sibling 409 throwers** (delivery sub-routes that ALSO 409 on stale version):
  - `PATCH /api/orders/:id/accept-delivery` (line 199-225) — 409 at line 207
  - `PATCH /api/orders/:id/reject-delivery` (line 227-247) — 409 at line 235
  - `PATCH /api/orders/:id/dispatch-delivery` (line 249-265) — 409 at line 257
  - `PATCH /api/orders/:id/accept` (line 267-293) — 409 at line 275
  - `PATCH /api/orders/:id/reject` (line 295-?) — 409 at line 303
  - `POST /api/orders` (line 377-381) — 409 on duplicate `clientOrderId` (different shape: `{ message: "Duplicate order", order: {...} }`)
  None of these are wired up from the bill page, but a tester with another tab open (e.g. `/orders` or the delivery dashboard) could trigger them concurrently.

### Root cause

**The actual user-visible bug ("nothing happens") is in `BillPreviewModal.tsx`, not in the version-conflict path.**

Step-by-step trace, with file:line evidence:

1. Tester places a takeaway order from POS — `placeOrderMutation` at `pos.tsx:1243` fires `POST /api/orders` with `paymentMethod: "cash"`.
2. Server creates the order at version 1, then auto-creates a bill with `paymentStatus: "pending"` (`orders.ts:794-815`, the FIX 2 block from commit `f0a5aac`). No PATCH happens.
3. Tester navigates to `/pos/bill/<orderId>` (or pos.tsx opens the in-page modal at `pos.tsx:1317`).
4. `BillPreviewModal` mounts. The "existing bill" query at `BillPreviewModal.tsx:397-406` returns the auto-created bill (`existingBillData` non-null).
5. The effect at `BillPreviewModal.tsx:436-446` sets `createdBill = existingBillData`. Step stays at `"preview"` (line 443-444 explicitly comments: *"O6: Do NOT auto-advance to 'payment' for unpaid/partially_paid bills"*).
6. The auto-fire effect at `BillPreviewModal.tsx:448-453` does **not** run because `createdBill` is now truthy (line 449 condition `!createdBill` fails).
7. Tester clicks "Proceed to Payment" → `handleProceedToPayment` (`BillPreviewModal.tsx:709-720`) runs.
8. `handleProceedToPayment` calls `createBillMutation.mutate()` (line 719). It does **NOT** set `userInitiatedPaymentRef.current = true`.
9. The mutation calls `POST /api/restaurant-bills`. Server returns the existing bill with `alreadyExists: true, paymentStatus: "pending"` (per `restaurant-billing.ts:219-220`).
10. `onSuccess` (`BillPreviewModal.tsx:547-556`) runs:
    ```ts
    if (bill.alreadyExists && bill.paymentStatus === "paid") {
      setStep("receipt");                       // FALSE: paymentStatus is "pending"
    } else if (userInitiatedPaymentRef.current) {
      setStep("payment");                       // FALSE: ref is false (handler never set it)
    }
    ```
11. Neither branch fires. `step` remains `"preview"`. The component re-renders with the same UI it already had. **From the tester's POV: nothing happens.**

The regression is from commit **`b1b4d87`** (`fix(pos): remove auto-advance from bill preview, require manual confirmation [POS-05]`, 2026-04-11). That commit:
- Added `userInitiatedPaymentRef = useRef(false)` at line 135.
- Set the ref in the auto-fire effect at line 450 (the *automatic* path).
- Changed `onSuccess` from unconditional `setStep("payment")` to gated `else if (userInitiatedPaymentRef.current) { setStep("payment"); }`.
- **Forgot to set the ref in `handleProceedToPayment`** (the *user-initiated* path the commit message names).

The commit's intent ("require manual confirmation") is preserved by the fix — the manual-confirmation IS the click on "Proceed to Payment", and that click should set the ref to true.

**The 409 PATCH /api/orders observations do not match the bill page code paths.** Tracing every `apiRequest` and `fetch` call in `bill-view.tsx` and `BillPreviewModal.tsx`, the only PATCH calls are:
- `BillPreviewModal.tsx:821, 824, 827` — `PATCH /api/print-jobs/:id/status`
- `BillPreviewModal.tsx:985` — `PATCH /api/customers/:id`

There is no `PATCH /api/orders/:id` anywhere in the bill page or its modal. The reported 409s must originate from a different component active in the same browser session. See "Race condition candidates" below.

### Race condition candidates

Ranked by likelihood given the static evidence.

1. **Stale-version PATCH from another open tab/page (orders.tsx, orders-hub.tsx, or DeliveryQueuePanel).** *(Most likely source of the 409s — but they are NOT what's silencing the Proceed button.)*
   - `client/src/pages/modules/orders.tsx:178` and `:212` — `updateStatusMutation` and `changeTableMutation`, both PATCH `/api/orders/:id` with `version` (when present in component state).
   - `client/src/pages/modules/orders-hub.tsx:231` — PATCH `/api/orders/:id` with `{ status }` and **no version field**, which would 400 (VERSION_REQUIRED), not 409 — so this can't be the source.
   - `client/src/components/pos/DeliveryQueuePanel.tsx:171, 190, 208` — PATCH delivery sub-routes; only fires if the panel is open.
   - The version becomes stale because: (a) `orders.tsx` query at `["/api/orders", selectedOrderId]` is invalidated only on its own mutations (line 191-193); a websocket `order:updated` from `orders.ts:1118-1120` triggers `/api/orders` invalidation in `pos.tsx:644` but not necessarily in `orders.tsx` (which has no `useRealtimeEvent` hook — verified via grep: zero matches). If the user has both tabs and clicks Mark Ready to Pay on `/orders` after the bill was auto-created at order placement, **`orders.version` may already have been bumped** by the FIX 3 `order_number` raw SQL update (`orders.ts:619` — though this UPDATE does NOT touch `version`, so this sub-theory is wrong) or by the auto-bill creation which doesn't touch version either. So 1+1 doesn't equal 2 here on direct read.
   - Confidence: MEDIUM. The 409 source is *somewhere* — orders.tsx with stale state is the most plausible candidate.

2. **TanStack Query auto-retry inflating one 409 into three.**
   - **Ruled out.** `client/src/lib/queryClient.ts:218-220` sets `mutations: { retry: false }`, and queries retry only for network errors not 4xx (line 209-214). So a single PATCH cannot become three 409s via Query's retry.

3. **`syncManager` retrying a queued POST /api/orders that returns 409.**
   - `client/src/lib/sync-manager.ts:382` — `if (res.ok || res.status === 409)` treats 409 as success. So a queued offline order that gets a 409 (duplicate `clientOrderId`) is marked `completed` after one attempt, not retried.
   - **Ruled out as a multiplier**, but could be the source of *one* 409 if the takeaway order was placed offline and synced — though that 409 would be on POST /api/orders, not PATCH.

4. **Held-tab PATCH from `pos.tsx` running while the user is on the bill page.**
   - `pos.tsx:1043, 1052, 1109, 1152` PATCH `/api/orders/:id` with `version`. These all fire from `holdOrderMutation` or `recallServerOrder` and require user interaction in the POS view. Since wouter unmounts `pos.tsx` when navigating to `/pos/bill/:id` (verified via the lazy-route boundary at `App.tsx:571`), these mutations cannot be *initiated* from the bill page. An *in-flight* mutation initiated from POS *just before* navigation could 409 if version was stale, but the timing window is narrow.
   - Confidence: LOW.

5. **An external process (a second user, a kitchen-board action, a webhook) bumping version between page-load fetch and Pay click.**
   - Possible but unverifiable from static analysis. Would explain a single 409, not three.

6. **Dev-tools network panel showing an unrelated PATCH that happens to coincide.**
   - The user may have conflated 409s from a background tab/page with the silent Pay button. The "PATCH /api/orders" URL is correct *somewhere* in the app, just not on the bill page.

### Proposed fix

**Single-line addition to `client/src/components/pos/BillPreviewModal.tsx`:**

- **File:** `client/src/components/pos/BillPreviewModal.tsx`
- **Location:** inside `handleProceedToPayment`, between the validation guards (lines 711-718) and `createBillMutation.mutate()` (line 719) — i.e. add at line 719 before the mutate call:

```ts
const handleProceedToPayment = () => {
  if (!orderId) {
    toast({ title: tp("orderNotPlacedYet"), description: tp("placeOrderFirst"), variant: "destructive" });
    return;
  }
  if (!grandTotal || grandTotal <= 0) {
    toast({ title: "No amount to pay", description: "Please add items to the order before proceeding to payment.", variant: "destructive" });
    return;
  }
  userInitiatedPaymentRef.current = true;   // ← ADD THIS LINE
  createBillMutation.mutate();
};
```

- **Plain English:** the click handler must mark the upcoming `createBillMutation.mutate()` as "user-initiated" so that `onSuccess` (line 552) advances the modal to the `"payment"` step. Without this, when the bill already exists (the typical path now that auto-bill is enabled), `onSuccess` falls through both branches and the step remains `"preview"` — the rendered UI doesn't change and the click appears to do nothing.

- **Estimated risk:** **LOW.** The fix is symmetric with the existing auto-fire effect at line 450 which already does the same thing. The ref is reset to `false` in `onSuccess` (line 555) so there is no risk of leaking state across sessions. Only behavior change: the user-initiated path now advances to the payment step exactly like it did before commit `b1b4d87` for the alreadyExists case. The post-`b1b4d87` *intent* — "no auto-advance from preview without explicit user action" — is preserved because the ref is only set inside an explicit click handler (and inside the `fullPage` auto-fire effect, which represents the navigate-to-/pos/bill action that *is* user-initiated by definition).

- **Estimated diff size:** **+1 line, −0 lines.**

### Open questions

1. **The reported 409 PATCH /api/orders does not match any code path on the bill page.** Static tracing confirms `bill-view.tsx` and `BillPreviewModal.tsx` make zero PATCH calls to `/api/orders/:id`. Either the user misread the DevTools method (e.g., POST → PATCH), the URL (e.g., `/api/restaurant-bills` → `/api/orders`), or the 409s come from a different tab/component active in the same session. **Need:** the actual DevTools network panel screenshot or HAR export, or the *Initiator* column for the failing requests, to pin the source. *Stop-and-fix-anyway:* the user-visible "nothing happens" symptom is fully explained by the `userInitiatedPaymentRef` bug; that fix can be shipped without resolving the 409 mystery.
2. **Why three?** TanStack Query mutations have `retry: false` (queryClient.ts:219); syncManager treats 409 as success; nothing in the traced code retries a 409. Three consecutive 409s most likely means three click events on the same stale-version button (e.g., `Mark Ready to Pay` in `orders.tsx:590` clicked thrice while the version in component state is stale). Need confirmation from the tester whether they clicked anything else three times.
3. **Should `handleProceedToPayment` also force-refetch `existingBillData` before submitting?** Today it doesn't, so if the bill on the server has been updated by a concurrent process (refunded, voided), the client may submit against stale local state. Out of scope for this fix; flagging as a hardening idea.
4. **Should the auto-fire effect at `BillPreviewModal.tsx:448-453` also skip when `existingBillData` is truthy?** The condition does check `!existingBillData`, but `existingBillData` is initially `undefined` (loading state), then becomes `null` (404 → no bill) or the bill object. Net effect: the effect runs when `existingBillStatus === "success" && existingBillData == null`. That's correct, but worth confirming the query's `retry: false` (line 405) means a transient network blip won't leave us in `success + null` for a bill that does exist. (In practice the surface area of this is small.)
5. **Was POS-05's "remove auto-advance from bill preview" itself the right design?** The commit was reactive to a UX issue ("staff must always see the bill preview first"). The fix preserves that — clicking Proceed to Payment is the explicit user action that advances. But if product wants the preview-confirm-pay flow to be one tap on the existing bill, the alternative is to revert POS-05 entirely. Out of scope for this recon.

### Confidence

**HIGH for the user-visible "nothing happens" root cause and the proposed one-line fix.** The trace is fully verifiable against the current source: every step has a file:line citation, the bug is explained by a missing ref-setter in the click handler, and the fix is symmetric with code already present elsewhere in the same file (line 450). Git blame confirms the regression was introduced in commit `b1b4d87` (POS-05) on 2026-04-11. The fix is one line, behind no feature flag, with no schema or API impact.

**LOW for any theory that the 409 PATCH /api/orders is causally connected to the silent Pay button.** Static analysis cannot find a path from the bill page to `PATCH /api/orders/:id`. Either the diagnosis is misattributed (most likely given the absent code path) or the 409s come from concurrent activity in another tab. **Recommendation:** ship the one-line fix to clear the user-visible symptom, then have the tester re-run the scenario with DevTools recording. If 409s still appear after the fix, capture the *Initiator* column and we can trace from there. Don't block the silent-failure fix on the 409 investigation — they appear to be independent.

---

## Addendum 2026-04-28: BL-3 root cause — delivery dashboard 500

### Summary

`GET /api/delivery-orders/unified` returns 500 because its raw-SQL `WHERE` clause filters `o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')` (`server/routers/delivery.ts:33`), but the `order_type` Postgres enum (`shared/schema.ts:59-63`) only declares **three** values: `dine_in`, `takeaway`, `delivery`. The three extra literals fail enum-cast validation, Postgres raises `invalid input value for enum order_type: "phone_delivery"`, and the handler's catch returns 500. The dashboard at `client/src/pages/modules/delivery.tsx:248-253` falls back to `deliveries = []` and renders all-zero counters and "No orders" in every column. **Confidence HIGH.**

### Endpoint

- **HTTP method + path:** `GET /api/delivery-orders/unified`
- **Route registration / handler:** `server/routers/delivery.ts:14` — `app.get("/api/delivery-orders/unified", requireAuth, async (req, res) => { … })`. Handler body runs lines 14-79 in the same arrow function.
- **Introduced by:** commit `f6e16ea` (2026-04-10), `fix(delivery): fix order_type filter, cancel button, channel visibility, order ID display [POS-04]` — the commit that added the unified endpoint with this exact `IN` clause. Verified via `git show f6e16ea -- server/routers/delivery.ts`.

### Handler code

The breaking SQL block (verbatim, `server/routers/delivery.ts:27-39`):

```ts
const { rows: mainDeliveryOrders } = await pool.query(
  `SELECT o.id, o.tenant_id, o.order_number, o.customer_name, o.customer_phone,
          o.notes, o.status, o.order_type, o.created_at, o.total, o.outlet_id,
          o.channel_order_id
   FROM orders o
   WHERE o.tenant_id = $1
     AND o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')
     AND o.status NOT IN ('paid', 'completed', 'voided')
                 AND (o.channel_order_id IS NULL OR NOT EXISTS (SELECT 1 FROM order_channels oc WHERE oc.name = o.order_type AND oc.tenant_id = o.tenant_id AND oc.active = false))
   ORDER BY o.created_at DESC
   LIMIT $2 OFFSET $3`,
  [user.tenantId, limit, offset]
);
```

The catch wrapper is at line 78 — `catch (err: any) { res.status(500).json({ message: err.message }); }`. Postgres returns the exception message in `err.message`, the network panel sees a 500, and the tester sees "Failed to load resource: status of 500".

### Dashboard component

- **File:** `client/src/pages/modules/delivery.tsx`
- **Query hook:** `delivery.tsx:248-252` — `useQuery<{ data: DeliveryOrder[]; total: number }>({ queryKey: ["/api/delivery-orders/unified"], enabled: deliveryEnabled, refetchInterval: 30000 })`
- **Expected response shape:** `{ data: DeliveryOrder[]; total: number }`. The handler intends to return `{ data: combined, total: totalCount, limit, offset, hasMore }` (delivery.ts:77) — compatible. **The shape is fine; the issue is the handler never gets there.**
- **Empty-state fall-through:** `delivery.tsx:253` — `const deliveries = deliveriesRes?.data ?? [];`. When the query throws (500 → TanStack Query treats as error), `deliveriesRes` is `undefined`, `deliveries` becomes `[]`, every Kanban column renders empty, every counter renders 0. **This is exactly what the tester sees.**
- The query is also auto-refetched every 30 seconds (`refetchInterval: 30000`), so the tester also sees a steady stream of 500s in the network panel — matching the BL-2-verification observation of repeated `delivery-orders/unified:1` 500s.

### Root cause

**Two-line root cause, in plain English:**

1. The Postgres enum `order_type` is declared at `shared/schema.ts:59-63` with exactly three values:
   ```ts
   export const orderTypeEnum = pgEnum("order_type", [
     "dine_in",
     "takeaway",
     "delivery",
   ]);
   ```
2. The unified-delivery handler filters with four values, three of which are not in the enum:
   ```sql
   AND o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')
   ```

   Postgres tries to cast each literal to the `order_type` enum type. Casting `'phone_delivery'`, `'online_delivery'`, or `'third_party'` to `order_type` raises:
   ```
   invalid input value for enum order_type: "phone_delivery"
   ```

   The exception propagates out of `pool.query`, hits the catch at line 78, and the handler returns HTTP 500.

**Aggravating factor — runtime migration that was meant to extend the enum but is unreliable:**

- `server/index.ts:450-458` runs `ALTER TYPE order_type ADD VALUE IF NOT EXISTS 'phone_delivery'` (and the other two) at app startup, wrapped in `try { … } catch (err) { console.error('[Migration] DELIVERY-FIX: enum migration error:', err); }`. The catch swallows errors silently.
- `server/admin-migrations.ts:4197-4212` defines `runDeliveryQueueEnumMigration()` with the same intent, but a grep for the function name across `server/` returns only its declaration — **it is never called**.
- There is no committed `.sql` migration in `migrations/` that extends the enum (verified via `grep` over `migrations/`).
- Net: in any environment where the startup migration fails or is skipped (fresh DB without the right startup ordering, transaction interaction, partial-failure of an earlier ALTER, or an environment where the catch swallowed a real error), the enum stays at three values and the unified handler 500s. The Drizzle source-of-truth (`shared/schema.ts:59-63`) is also stale relative to the runtime intent.

**Suspicious-but-not-blocking sub-clause in the same query (`delivery.ts:35`):**

```sql
AND (o.channel_order_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM order_channels oc
   WHERE oc.name = o.order_type AND oc.tenant_id = o.tenant_id AND oc.active = false))
```

`order_channels.name` is `text` (free-form labels like "Phone", "Talabat", "Website" — see `shared/schema.ts:1614-1631`). `o.order_type` is the enum. Postgres auto-casts the enum to text for this comparison, so it does not raise — but the predicate is **semantically nonsense** (channel labels won't equal enum slugs). Even if it ran, it would essentially never match, making the entire `NOT EXISTS` always true, which makes the whole `(channel_order_id IS NULL OR NOT EXISTS …)` clause always true — i.e. the disabled-channel filter never actually filters anything. Out of scope for the BL-3 fix; flagged below as Open Question 2.

### Proposed fix

**Two-character SQL change at `server/routers/delivery.ts:33`:**

- **File:** `server/routers/delivery.ts`
- **Current:** `AND o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')`
- **Proposed:** `AND o.order_type::text IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')`
- **One-paragraph description:** cast the column to `text` *before* the `IN` comparison so Postgres compares string-against-string and never tries to cast the literals to the enum type. With the cast, rows whose `order_type::text` is literally `'phone_delivery'`, `'online_delivery'`, or `'third_party'` will match if those values are actually present in the column (e.g. on environments where the runtime ALTER succeeded), and will harmlessly not match where the enum was never extended — but in **neither case does the query 500**. The dashboard recovers immediately. This fix is independent of whether `runDeliveryQueueEnumMigration` ever ran or whether `shared/schema.ts:59-63` gets updated; both of those are now follow-ups, not blockers.
- **Estimated risk:** **LOW.** The cast-to-text is a standard PG idiom; behavior is unchanged for rows whose `order_type` is one of the existing enum values, and the new behavior for non-enum values is "no row matches" rather than "query throws". No write paths or other handlers touched. The same line is the only place `order_type IN (…)` appears in the unified endpoint.
- **Estimated diff size:** **+0 lines / −0 lines / 1 line modified** (single in-place edit, `o.order_type` → `o.order_type::text`).
- **Source of any new identifiers:** none. `::text` is standard PostgreSQL syntax already used elsewhere in the codebase (e.g. `425ae89` "fix(B1b): cast order_status enum to text for archive scheduler WHERE clause" — same pattern, same fix).

### Open questions

1. **Did the runtime migration at `server/index.ts:450-458` ever succeed in production?** I cannot verify without DB access. If it did, the enum has six values today and `phone_delivery`/`online_delivery`/`third_party` rows are real; the dashboard *intent* is preserved by the cast-to-text fix. If it did not, those literals will simply never match — same behavior the bug exhibited (3-value enum filtering for `'delivery'` only). Either way the cast fix prevents the 500. **A separate ticket should run a one-off SQL `SELECT enum_range(NULL::order_type)` via TablePlus to confirm production state.** This is exactly the read-only `audit/` SQL pattern from CLAUDE.md.
2. **The `oc.name = o.order_type` subquery is semantically wrong** (channel labels vs enum values). It does not 500, but it makes the disabled-channel filter a no-op. Out of scope for the BL-3 unblock; should be tracked as a separate fix to either (a) compare `oc.slug = o.order_type::text` (if order_channels.slug aligns with enum values), or (b) compare against `o.channel` (text column on orders) instead of `o.order_type`. Reading the column at `shared/schema.ts:483` (`channel: text("channel")`) suggests (b) is the original intent.
3. **`shared/schema.ts:59-63` is stale relative to runtime migration intent.** Even if the cast-to-text fix lands, future Drizzle-driven schema syncs (`drizzle-kit push`) could try to drop the runtime-added enum values. Should be reconciled by adding `phone_delivery`/`online_delivery`/`third_party` to the `pgEnum` declaration AND committing a real `.sql` migration to `migrations/` that ALTERs the enum. Out of scope for the BL-3 unblock.
4. **`runDeliveryQueueEnumMigration` in `server/admin-migrations.ts:4197` is dead code** — defined but never called. If it was meant to be the migration's permanent home (and the inline block at `server/index.ts:450-458` was meant to be deleted once the function was wired), that wiring never happened. Either delete the dead function or wire it into startup and delete the inline block. Cosmetic; not blocking.
5. **The earlier "Adjacent observations" note in this same file flagged `service-coordination.ts:662-664` for `orderType: "advance"` falling through to `dine_in` because the schema enum has only three values.** That observation was correct as a static read of `shared/schema.ts`, but missed that `server/index.ts:450-458` extends the enum at runtime. Both observations point at the same root issue — the enum isn't stable across schema definition / runtime migration / runner ALTERs. Tracking together with Open Question 3.

### Confidence

**HIGH.** The handler code, the schema enum declaration, the runtime migration, and the dashboard contract are all read directly from the current source — no inference or hypothesis. The chain from "tester clicks dashboard" → "useQuery fires `/api/delivery-orders/unified`" → "raw SQL `IN` includes literals not in the enum" → "Postgres raises invalid-input error" → "handler catch returns 500" → "useQuery falls back, dashboard shows zeros" is end-to-end verifiable in the current tree. The proposed fix (`::text` cast) is a known idiom already used in the codebase for the same class of bug (commit `425ae89` did the same fix on the `order_status` enum in the B1b archive scheduler). The risk surface is one line in one file; no other handler, route, or storage function changes; no schema or migration change; no client change. Recommend proceeding to a fix branch (`fix/BL-3-delivery-dashboard-500`) once the team confirms the production enum state from Open Question 1 — though even without that confirmation, the cast-to-text fix is safe to ship.

---

## Addendum 2026-04-28: BL-1 Static Recon (Round 2)

**Goal of this round.** Round 1 listed "three plausible candidates" with Medium confidence. Production has since shipped a fresh deploy and the page is still broken; no `/api/errors/client` payload was captured. This round goes deeper: every render-throw candidate enumerated against the actual server response shape, every field-name mismatch reconciled, recent commits surfaced, and a single highest-confidence minimal fix proposed (not applied).

### Findings

Ranked by likelihood that this is the production crash. Each finding has a verifiable file:line citation and the minimum runtime data that would confirm or rule it out.

#### 1) [HYPOTHESIS — HIGH confidence] `ticket.status.toLowerCase()` throws when `status` is null

- **Location:** `client/src/pages/tickets/index.tsx:53`
  ```ts
  const s = statusMap[ticket.status.toLowerCase()] || { label: ticket.status, … };
  ```
- **Why it can throw:** `TicketRow.status` is typed as a non-nullable `string` (line 29), but the server query at `server/routers/ticket-history.ts:298` selects `o.status` directly from the `orders` table. The `orders.status` column is declared in `shared/schema.ts:465` as
  ```ts
  status: orderStatusEnum("status").default("new"),
  ```
  — note the absence of `.notNull()`. The Postgres column is nullable. Drizzle's `.default()` only adds a `DEFAULT` clause; rows inserted by raw SQL or pre-default migrations can have `status = NULL`. When such a row is serialised, `ticket.status` arrives as `null`, and `null.toLowerCase()` throws `TypeError: Cannot read properties of null (reading 'toLowerCase')`. React unwinds, the global error boundary at `client/src/components/GlobalErrorBoundary.tsx:69` catches, the page shows "Something went wrong."
- **JS error type:** `TypeError`.
- **Why this is the top candidate:**
  - StatusBadge is rendered for **every row** (`client/src/pages/tickets/index.tsx:414`). The page crashes on the first row with `status = null`, regardless of which user opens it.
  - `orderStatusEnum` (`shared/schema.ts:42-56`) has 13 values; line 53's `statusMap` only maps 8 (`paid`, `void`, `voided`, `active`, `in_progress`, `new`, `sent_to_kitchen`, `closed`). The `||` fallback at line 53 handles unknown enum values fine — `{ label: ticket.status, … }` renders the raw string. The only crash path is `null` (or `undefined`).
  - It only takes one orphan row to break the page for everyone whose date filter or tenant covers it. That matches the production symptom (broken for all roles, no captured client error — the boundary suppresses console output unless explicitly forwarded).
- **Runtime data needed to confirm:**
  - One read-only SQL probe (per CLAUDE.md "audit/ SQL" pattern), e.g. `SELECT id, status, created_at FROM orders WHERE tenant_id = $1 AND status IS NULL LIMIT 5;`. A single matching row confirms the hypothesis.
  - Or: capture the `useQuery` response payload at `client/src/pages/tickets/index.tsx:105-107` in DevTools Network and inspect the `orders[*].status` field. Any `null` confirms it.

#### 2) [HYPOTHESIS — MEDIUM confidence] `format(new Date(ticket.createdAt), …)` throws on invalid date

- **Location:** `client/src/pages/tickets/index.tsx:407`
  ```ts
  {ticket.createdAt ? format(new Date(ticket.createdAt), "h:mm a") : "—"}
  ```
- **Why it can throw:** the truthy guard catches `null`, `undefined`, and empty string, but not invalid date strings. `new Date("not a date")` returns `Invalid Date`; `date-fns/format` then throws `RangeError: Invalid time value`. The server returns `o.created_at AS "createdAt"` (`server/routers/ticket-history.ts:301`) — `created_at` is declared `timestamp("created_at").defaultNow()` (`shared/schema.ts:493`) and is also nullable (no `.notNull()`). Most production rows will have a valid timestamp, but a manually inserted or partially migrated row could have a malformed value.
- **JS error type:** `RangeError`.
- **Why this is lower-ranked than (1):**
  - `created_at` failures are vanishingly rare in practice — `defaultNow()` covers nearly every insert path, and Postgres rejects non-timestamp casts at write time.
  - The truthy guard already shields `null` and empty string, the two realistic cases.
  - StatusBadge (Finding 1) renders before this cell in some rendering interleavings; if both were present in the same row, Finding 1 would surface first.
- **Runtime data needed to confirm:** the captured response payload — any `createdAt` that isn't a valid ISO 8601 string (e.g. `"0000-00-00"`, empty object, raw integer) would confirm.

#### 3) [HYPOTHESIS — LOW confidence] `ticket.id.slice(-6)` if `id` is missing

- **Location:** `client/src/pages/tickets/index.tsx:397`
  ```tsx
  #{ticket.orderNumber || ticket.id.slice(-6).toUpperCase()}
  ```
- **Why it can throw:** the `||` falls through to `ticket.id.slice(...)` whenever `orderNumber` is falsy. If `id` is also nullish, `null.slice` throws. `orders.id` is declared `varchar("id", { length: 36 }).primaryKey().default(sql\`gen_random_uuid()\`)` (`shared/schema.ts:429-431`) — primary key, never null in practice. Almost certainly not the bug, listed only for completeness.
- **Runtime data needed to confirm:** any `orders[*].id === null || undefined` in the response.

#### 4) [HYPOTHESIS — LOW confidence — RULED OUT as the *page-load* crash] Server 500 on `status=void`/`refire`/`high_value`/`void_requests`

- **Locations:**
  - Filter dropdown options at `client/src/pages/tickets/index.tsx:308`, `:310`, `:311`; chip filters at `:169-170`.
  - Server-side fall-through at `server/routers/ticket-history.ts:256-259`:
    ```ts
    } else if (status) {
      conditions.push(`o.status = $${paramIdx++}`);
      params.push(status);
    }
    ```
- **What goes wrong:** the dropdown emits `status="void"` (line 308 — note: enum value is `voided`, not `void`) and `status="refire"` (line 310) and `status="high_value"` (line 170). None of those literals are members of `orderStatusEnum`. The handler binds the literal directly into `o.status = $N` against a Postgres enum column → `invalid_text_representation` → 500. Same class of bug as BL-3.
- **Why this is *not* the page-load crash:** the page loads with `status=all` by default (`client/src/pages/tickets/index.tsx:75-76`, falling through to "no status filter") — no enum cast happens on the initial query. The 500 only fires once a user selects one of the broken filter values. The reported symptom is "page does not load" — i.e. the initial render crashes, not a subsequent filter click. So this finding is a real bug worth a separate ticket but not the BL-1 root cause.
- **Severity if fixed independently:** Medium. It's a soft-failure mode (empty list + toast, not a render crash), masked by the global query error handler.

#### 5) [VERIFIED] Field-name mismatches — soft, do not crash

The list query at `server/routers/ticket-history.ts:293-320` returns:

```
{ id, orderNumber, channel, status, paymentMethod, totalAmount,
  createdAt, waiterId, outletId, tableNumber, staffName, itemCount,
  hasVoidedItems, hasRefire, paymentStatus, billId }
```

Wrapped in `{ orders, total, hasMore }` (`server/routers/ticket-history.ts:335`). See full reconciliation table below. None of these crash the render — they cause missing-data UI artifacts ("—" placeholders, missing waiter labels) — but they are real product bugs.

### Field-name reconciliation

Server response key (`ticket-history.ts:293-320`) → Client `TicketRow` field (`tickets/index.tsx:22-33`).

| Server key       | SQL source                         | Client expects   | Status        | Effect on UI                                      |
|------------------|------------------------------------|------------------|---------------|---------------------------------------------------|
| `id`             | `o.id`                             | `id`             | match         | works                                             |
| `orderNumber`    | `o.order_number`                   | `orderNumber`    | match         | works (line 397)                                  |
| `channel`        | `o.order_type AS channel`          | `orderType`      | **MISMATCH**  | "Table / Type" col renders "—" (line 402-404)     |
| `status`         | `o.status` (no alias)              | `status`         | match (name)  | crash candidate per Finding 1                     |
| `paymentMethod`  | `o.payment_method`                 | (not declared)   | unused        | server sends, client ignores                       |
| `totalAmount`    | `o.total`                          | `totalAmount`    | match         | works (line 411)                                  |
| `createdAt`      | `o.created_at`                     | `createdAt`      | match (name)  | crash candidate per Finding 2                     |
| `waiterId`       | `o.waiter_id`                      | (not declared)   | unused        | sent, ignored                                      |
| `outletId`       | `o.outlet_id`                      | (not declared)   | unused        | sent, ignored                                      |
| `tableNumber`    | `t.number`                         | `tableNumber`    | match         | works (line 400-401)                              |
| `staffName`      | `u.name AS staffName`              | `waiterName`     | **MISMATCH**  | not displayed in this view (drawer renders waiter) |
| `itemCount`      | subquery COUNT                     | `itemCount`      | match         | works (line 409)                                  |
| `hasVoidedItems` | EXISTS subquery                    | (not declared)   | unused        | sent, ignored                                      |
| `hasRefire`      | EXISTS subquery                    | `hasRefire`      | match         | works (line 57)                                   |
| `paymentStatus`  | `b.payment_status`                 | (not declared)   | unused        | sent, ignored                                      |
| `billId`         | `b.id`                             | (not declared)   | unused        | sent, ignored                                      |

Response envelope: server `{ orders, total, hasMore }` (line 335) vs client `{ orders, total, page, pageSize }` interface (`tickets/index.tsx:35-40`). Client only reads `orders` and `total`; `page`/`pageSize` are stale typing. Soft.

### Recent commits affecting these files

`client/src/pages/tickets/index.tsx` (most recent first):
- `3d943ad` fix(void): align void rejection reason field name between client and server
- `f43864d` fix: QA Round-2 bug fixes (6 bugs, Task #154)
- `7c35c3a` feat(tickets): Phase 1 Order Ticket History UI — all issues resolved (the original landing of this page)

`server/routers/ticket-history.ts` (most recent 10):
- `f0a5aac` fix: void request persistence, auto-create bill on takeaway settlement, order number generation
- `03b65f2` fix(kitchen): include void reason in void_request event payload (O4)
- `b1431b7` fix(tickets): align modification data structure between ticket detail server and client
- `ceb7f49` fix(void): add per-order void-requests endpoint
- `b80aaaa` fix(void): add pending-count endpoint for void request badge
- `80df464` Fix dashboard 404, ticket totals zero, and ticket drawer crash (Task #160) — touched `ticket-history.ts` (2 lines), `TicketDetailDrawer.tsx` (2 lines), `App.tsx` (1 line). Did **not** touch `tickets/index.tsx`. Whatever this commit fixed in the drawer crash, it did not address the list-page render crash.
- `f43864d` fix: QA Round-2 bug fixes (6 bugs, Task #154)
- `505efc0` fix(ticket-history): Translate date filter strings to proper SQL date ranges
- `97fd2b1` Task #114: Audible Alert System
- `0e7ba31` fix: Task #112 — APPROVED_WITH_COMMENTS feedback (round 6)

`shared/schema.ts` — no recent commit altered the `orderStatusEnum` declaration or the `orders.status` column's nullability. The `.default("new")` without `.notNull()` has been there since the table was introduced.

**Note.** The most recent commit named "ticket drawer crash" (`80df464`) is a different surface from BL-1: it fixed the *detail drawer* crash (Task #160), not the *list page* render. The list page has not received a defensive null-status fix in any commit on `main`.

### Proposed minimal fix (DO NOT APPLY)

Single-line, single-file change at `client/src/pages/tickets/index.tsx:53`:

```diff
- const s = statusMap[ticket.status.toLowerCase()] || { label: ticket.status, className: "bg-muted text-muted-foreground border-0" };
+ const s = statusMap[(ticket.status ?? "").toLowerCase()] || { label: ticket.status ?? "Unknown", className: "bg-muted text-muted-foreground border-0" };
```

- **Why this fix:** addresses Finding 1 — the only render-throw candidate that does not require server-side data corruption to manifest, and the only one whose backstop (the Drizzle column nullability) is verifiable in static source. Null status renders as "Unknown" with the muted style, page stays alive, every other row renders normally.
- **Why a single line:** scope discipline (CLAUDE.md hard rule 2c — one fix per branch). Findings 2-5 are real but not load-blocking; track separately.
- **Why not also fix Finding 2 (`createdAt`):** the truthy guard already covers the realistic null case. Hardening it would add a try/catch around `format()`, which is more risk than the bug it prevents until we have evidence of malformed timestamps.
- **Why not also fix the schema (`.notNull()` on `orders.status`):** that's a migration, much larger scope, and requires a backfill plan for any existing null rows. Defensive client coercion unblocks the page today; schema fix follows as a separate ticket.
- **Risk:** Low. The page already renders unknown enum values via the `||` fallback at the same line — coercion of `null` into `""` falls into the same fallback path. No other render site references `ticket.status` on this page.
- **Diff size:** 1 line modified, 0 added, 0 deleted.
- **New identifiers:** none. `??` is already used elsewhere in this file (e.g. line 87, line 409).

### Open questions / data needed

1. **Is `orders.status` actually NULL for any row in production?** Read-only SQL: `SELECT COUNT(*) FROM orders WHERE tenant_id = $TENANT AND status IS NULL;` for any affected tenant. If zero across all tenants, the proposed fix still hardens the contract but is no longer load-bearing — the real bug is elsewhere and this round's HIGH-confidence pick is wrong.
2. **Has anyone captured the `/api/errors/client` payload yet?** The user said "no payload was logged." Worth checking whether `client/src/main.tsx` actually wires the `GlobalErrorBoundary` to POST to `/api/errors/client` — if the boundary swallows without forwarding, that explains the silence and is itself a bug. Out of scope for this recon but worth a sibling ticket.
3. **Is the `channel` ↔ `orderType` mismatch (Finding 5, row 3) what the user perceives as "Type column always shows —"?** If so, fixing the SQL alias from `o.order_type AS channel` → `o.order_type AS "orderType"` at `server/routers/ticket-history.ts:297` is a one-character-class change worth bundling once BL-1 is unblocked.
4. **Schema reconciliation: should `orders.status` get `.notNull()`?** Every code path I've read assumes it. The Drizzle declaration is the only place that allows null. A future migration ticket should add `.notNull()` and a backfill (`UPDATE orders SET status = 'new' WHERE status IS NULL;`).
5. **The dropdown emits status values not in the enum (`void`, `refire`, `high_value`, `void_requests`).** Finding 4 documents this as a soft 500 path. Track as a separate ticket — server should either translate `void`→`voided`, treat `refire`/`high_value` as synthetic filters (similar to how `voided`/`active`/`paid` are handled at `server/routers/ticket-history.ts:250-256`), or 400 on unknown status values rather than constructing a query that the enum rejects.

### Confidence

**HIGH on the *finding*; MEDIUM on the *root cause* until the SQL probe in Open Question 1 returns.** Static analysis can prove that the column is nullable, that the client assumes non-null, and that the resulting throw is exactly the symptom — but it cannot prove that production has any null rows today. The fix is safe to ship even if Finding 1 is wrong, because it only changes behavior when `ticket.status` is `null`/`undefined`, which the type system already says cannot happen. If a single null row exists anywhere, this fix unblocks the page; if none exists, the fix is a no-op and the next round's deep recon expands to Findings 2-5.

---

## Addendum 2026-04-28 PM: BL-3 Logging Recon

**Premise correction up front.** The task brief says "use the existing Pino logger." There is no Pino logger in this codebase. `package.json` contains no `pino` (or `winston`) dependency, and zero files import a `logger` object — `grep -r "logger\.error" server/routers/` returns no matches; `grep -r "from .*logger" server/` returns only `time-logger` (a KDS event recorder) and `query-logger` (a slow-query interceptor that itself uses `console.warn`). The actual repo convention is `console.error("[tag] context:", err)`, used uniformly across every router that logs at all. Railway captures `console.*` to its log stream the same way it would capture Pino — so the gap is not a logger choice, it's that delivery.ts simply doesn't call any logger in its catch blocks.

This recon scopes the change to *match the existing convention*, not to introduce Pino.

### Current state

- **File:line of the `/unified` catch block:** `server/routers/delivery.ts:78`
- **Exact code today:**
  ```ts
  } catch (err: any) { res.status(500).json({ message: err.message }); }
  ```
- **What gets logged today:** nothing. No `console.error`, no `logger.error`, no structured log call. The 500 surfaces in Railway access logs only as `path=/api/delivery-orders/unified status=500 durationMs=…` because the access-log middleware records that envelope independent of the handler. The error message and stack are returned to the client in the response body and then dropped on the floor — which also incidentally leaks `err.message` (e.g. raw Postgres error text) to the API consumer, a separate hardening issue worth tracking.
- **What gets returned:** `{ message: <pg error string or generic Error.message> }` with HTTP 500.

### Existing logger usage

There is no Pino/Winston logger in this codebase. Routes that log do so via `console.error`. Three representative patterns:

1. **`server/routers/prep-notifications.ts:23-26`** — full `err` object passed (Node prints stack and any enumerable properties, including pg's `code`/`detail`/`hint`):
   ```ts
   } catch (err) {
     console.error("[PrepNotif] unread-count error:", err);
     return res.status(500).json({ error: "Internal error" });
   }
   ```

2. **`server/routers/attendance.ts:24-27`** — same shape, slightly different tag:
   ```ts
   } catch (err) {
     console.error("[Attendance Error]", err);
     res.status(500).json({ message: "Internal server error" });
   }
   ```

3. **`server/routers/modifiers.ts:55-58`** — *anti-pattern*: only logs `err.message`, drops the stack and pg error fields. Do not mirror this one:
   ```ts
   } catch (err: any) {
     console.error('[modifiers] GET groups:', err.message);
     res.status(500).json({ message: err.message });
   }
   ```

The pattern to mirror is (1) — full `err` object, prefixed tag for grep-ability, generic response body. (2) is also fine; (3) is the gap we're closing, not a target.

### Proposed minimal change (DO NOT APPLY)

- **File:line:** `server/routers/delivery.ts:78` (and, see *Scope decision*, lines 91, 108-110, 172-174, 208-210, 224-226).
- **Before/after diff for `/unified` only:**

  ```diff
  -    } catch (err: any) { res.status(500).json({ message: err.message }); }
  +    } catch (err: any) {
  +      console.error("[delivery/unified]", err);
  +      res.status(500).json({ message: "Internal server error" });
  +    }
  ```

  Three behavioral changes packed into one diff:
  - **Adds the log call.** Mirrors `prep-notifications.ts:23-26` exactly.
  - **Drops `err.message` from the response body.** Returning raw pg error text to the client is the leak that has been masking the bug — once we log server-side, the response should be generic. This also matches every other handler that logs.
  - **Same status code, same shape (`{ message }`), different content.** The client already treats 500 as opaque; nothing on the client reads `data.message` for branching.

- **Confidence:** **HIGH** that this surfaces the actual error in Railway logs. `console.error` writes to stderr, which Railway captures verbatim and puts in the same log stream as the access logger. Node's default error formatter prints `err.stack` plus any enumerable own-properties of `err` — for `pg` errors that includes `code` (e.g. `22P02` for `invalid_text_representation`), `routine`, `hint`, `position`, and the offending SQL fragment. That is enough to root-cause any handler-internal throw without further instrumentation.

### Scope decision

**Recommend: all six catch blocks in `delivery.ts` in one diff.** Justification: every catch in this file has the same gap, the same one-line fix, and the same risk surface; six 1-line additions is +6 lines / 6 modifications, well within "tiny diff." Catching only `/unified` would leave the same blind spot on five sibling endpoints — including `POST /api/delivery-orders` (line 108-110) and `POST /api/contact/sales` (line 208-210), both of which take user input and are realistic 500 candidates.

Catch blocks in `server/routers/delivery.ts`:

| Line  | Endpoint                          | Current log? |
|-------|-----------------------------------|--------------|
| 78    | `GET /api/delivery-orders/unified` | none         |
| 91    | `GET /api/delivery-orders`         | none         |
| 108-110 | `POST /api/delivery-orders`      | none         |
| 172-174 | `POST /api/performance-logs`     | none         |
| 208-210 | `POST /api/contact/sales`        | none         |
| 224-226 | `POST /api/contact/support`      | none         |

(Note: the brief mentions a `PATCH /api/orders/:id/accept-delivery` handler — that endpoint lives in `server/routers/orders.ts`, not `delivery.ts`. Out of scope for this recon; flag separately if needed.)

If even six lines feels too broad for tomorrow morning, fall back to **/unified only** — it's the actively-broken endpoint and gives us the BL-3 diagnostic we need today.

### Risks

- **Response body change.** Today's response includes `err.message` (often raw pg error text). Switching to `"Internal server error"` is strictly safer (no info leak) but is technically a breaking change for any client that surfaces `data.message` to the user. Searching the client for consumers of this endpoint (`/api/delivery-orders/unified`): they read `data.data` and `data.total` from the success path; the error path goes through TanStack Query's default error handler which uses HTTP status, not body text. Low risk.
- **Log volume.** Six catches across delivery routes; if `/unified` is broken in production, every dashboard load logs one error. Acceptable — that's the point. If volume becomes a concern, sample later.
- **PII / secrets in logs.** The `pg` library does **not** include bound parameters in its error objects (only the SQL fragment, position, and error code). The handlers do not currently embed user input into thrown errors. So the err object should not carry customer name/phone/address. **However:** the `req.body` of `POST /api/contact/sales` and `POST /api/contact/support` contains email/phone, and `POST /api/delivery-orders` contains customer address. The proposed diff logs `err`, not `req.body`, so it does not capture this PII. Do not extend the log to include `req.body` without a redactor. No redaction strategy needed *for the proposed diff as written*; needed only if scope grows.
- **Stack truncation.** Railway's log line limit is ~64 KB; pg errors with full SQL fragments fit comfortably. No truncation concern.

### Confidence

**HIGH.** All claims are read directly from current source. The pattern to mirror is verified at three sites. The premise correction (no Pino) is verified by `grep` returning zero matches across `server/`. The proposed diff is mechanical — same shape used by the routes that already log correctly. The single non-mechanical decision (drop `err.message` from response) is defended by the same pattern in `prep-notifications.ts` and `attendance.ts`, which both return generic error strings.

---

## Addendum 2026-04-28 EOD: Day Summary and Tomorrow's Handoff

**Date of work:** 2026-04-28
**Production deploys today:** 6 (X-02, BL-2, BL-3 round 1, BL-3 logging, BL-3 round 2, BL-1)

### What shipped to production

| Order | PR | Commit | Description |
|-------|----|----|-------------|
| 1 | #5 | 3e54dd2 | X-02: pass tenantId to getOrderItemsByOrder for dine-in bills |
| 2 | #6 | d720247 | BL-2: set userInitiatedPaymentRef in handleProceedToPayment |
| 3 | #7 | f0531bb | BL-3 (round 1, incomplete): cast order_type to text in IN clause |
| 4 | #8 | 3bc6817 | BL-3 logging: add console.error to all 6 catch blocks in delivery.ts |
| 5 | #9 | f4a93cb | BL-3 (round 2, complete): cast order_type to text in NOT EXISTS subquery |
| 6 | #10 | 5ca3899 | BL-1: null-coalesce ticket.status to prevent toLowerCase crash |

Final main HEAD after EOD: `ee223f4` (merge of PR #10).

### Tester verification status (as of EOD 2026-04-28)

- **X-02:** PASSED earlier today
- **BL-2:** PASSED earlier today
- **BL-3 round 1:** FAILED — testers reported same 500 in DevTools after PR #7
- **BL-3 round 2 + logging:** Verified by founder personally (23 delivery orders rendering, no 500). Tester re-verification message sent at EOD for next-day verification.
- **BL-1:** Verified by founder personally (Ticket History page renders cleanly with 11+ rows visible). Tester re-verification not yet requested as of EOD.

### Diagnostic lessons captured today

**1. BL-3 took three attempts.** The first cast fix (PR #7) addressed only the IN clause and missed the NOT EXISTS comparison in the same query. We could not diagnose the remaining bug because production logs only captured request metadata (path, status, durationMs) — not the actual error message. We had to ship error logging (PR #8) before we could see what the real bug was. The captured error `[delivery/unified] error: operator does not exist: text = order_type` then made the second fix (PR #9) a one-line change with HIGH confidence rather than a guess.

**Lesson:** when a fix is shipped from a hypothesis without runtime data, treat the next failure as evidence the hypothesis was incomplete, not just wrong. Add observability before iterating.

**2. AI summaries are not verification.** Today saw three instances of AI-generated summaries that were confidently wrong: BL-2's first recon (wrong scope), BL-3's first Railway log summary (right gap identification but missed the real diagnostic data), and an attempted Perplexity browser check of the BL-1 fix (could not actually log into the tenant, returned a hallucinated answer). Direct verification with screenshots from the founder's actual browser was the only reliable signal.

**Lesson:** for production verification, screenshots > summaries. For diagnostic data, raw logs > AI interpretations of logs.

**3. The "one-line fix" temptation is a trap.** Today, three separate "one-line fixes" were proposed with HIGH confidence. Two were correct (BL-2 round 2, BL-1). One was wrong (BL-3 round 1). The recon discipline of "verify the recon yourself before sending Claude Code anything" is what caught the BL-3 round 1 mistake before we wasted more time on a third guess.

**Lesson:** confidence is not certainty. Recon-first is non-negotiable, even when the fix looks obvious.

### Open from 2026-04-28, deferred

1. **Tester verification of BL-1.** Not yet requested. Add to morning tester message on 2026-04-29.
2. **Tester re-verification of BL-3.** Message already sent. Expect results when testers start their next shift.
3. **F-225 tenant-tz-helper branch decision.** Still untouched. 6 commits of real implementation work (date-fns-tz, helper module with tests, escpos-builder/printer-service updates, calendar wiring, Dockerfile TZ=UTC). Ship/finish/abandon decision pending.
4. **BL-1 schema follow-up.** `orders.status` should get `.notNull()` and a backfill (`UPDATE orders SET status = 'new' WHERE status IS NULL;`). Tracked as separate ticket — today's fix is defensive client coercion only.
5. **Schema reconciliation for `order_type` enum runtime migration.** `server/index.ts:450-458` has a swallow-catch attempt; `server/admin-migrations.ts:4197` has a duplicate. Today's BL-3 fixes are symptom-only at the SQL level. Real .sql migration in `migrations/` is the correct fix. Tracked as backlog.
6. **Findings 2-5 from BL-1 Round 2 recon.** All real but non-load-blocking. If next-day BL-1 verification reveals the page is still broken, these are the next candidates: createdAt format on invalid date (MEDIUM), ticket.id.slice on null (LOW), filter dropdown emitting non-enum values (causes 500 on filter click — same class as BL-3, MEDIUM), server field-name mismatches (cosmetic).

### Process gaps observed today

1. **Pre-merge "Files changed" review was skipped on 6 of 6 PRs today.** Diffs were all small and nothing got past us, but the habit needs to be in place before a non-trivial diff arrives.
2. **`tatus` file was created accidentally** by a stray `git status >` redirect at some point during the day. Caught and deleted before any commit. No harm.

---

## Addendum 2026-04-29 AM: 404 Bug Discovered During BL-3 Tester Verification

**Reported by:** Manual testers (Nandhini, Madhesh) during morning tester verification of BL-3 fix.

### Tester report summary

- **Test 1 (Dashboard loads with existing orders):** PASSED — counters show real numbers, orders render in Preparing/Ready/Out for Delivery columns, `/api/delivery-orders/unified` returns 200.
- **Test 2 (New POS Delivery order appears in dashboard):** PASSED with caveat — the new POS Delivery order DID appear in the Preparing column, but clicking "Assign Agent" on it triggered an error.
- **Test 3 (Phone delivery flow regression check):** PASSED.

### The 404 finding

When tester (logged in as Manager — Jordan Rivera) clicked "Assign Agent" on a POS-sourced delivery order:

- Modal opened correctly with 4 delivery agents listed (Rahul Kumar available, Suresh Singh busy, Amit Sharma available, Priya Patel offline)
- Tester selected an agent and clicked "Assign Agent"
- Red toast appeared: **"Error / 404: Delivery order not found"**
- DevTools Network tab showed three `PATCH /api/delivery-orders/order-87541db0-0d51-47eb-9174-a7daff…` requests, all returning **404 (Not Found)**

### Working hypothesis (not yet verified)

This 404 is a *consequence* of yesterday's BL-3 fix, not a regression of it.

The BL-3 fix made the unified endpoint surface orders from both the `delivery_orders` table AND the `orders` table (where `order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')`). For orders sourced via the POS-Delivery flow, the row exists in `orders` but not in `delivery_orders`. The unified endpoint synthesises a `DeliveryOrder`-like shape with an `id` of `order-<orders.id>` (see `server/routers/delivery.ts:46`).

When the client fires `PATCH /api/delivery-orders/<id>` for assign-agent, the PATCH handler looks up `delivery_orders` by that synthetic ID. The row doesn't exist, so the server returns 404.

**Consequence:** dashboard surfaces POS-Delivery orders correctly (yesterday's fix), but operations on those orders (Assign Agent, Mark Ready, Dispatch, etc.) all return 404. Phone-delivery orders that have a real `delivery_orders` row work fine.

### Recon required before fix

Before proposing a fix, the following needs verification:

1. Confirm the synthetic ID prefix logic at `server/routers/delivery.ts:46` is what's producing `order-…` IDs.
2. Read the PATCH handler at `app.patch("/api/delivery-orders/:id", …)` to confirm it does not strip the `order-` prefix or fall through to `orders` table lookup.
3. Enumerate all other endpoints under `/api/delivery-orders/:id/…` that would have the same 404 problem (delete, accept, reject, dispatch, etc.).
4. Determine the count of POS-Delivery orders currently in production that would need backfill if Option 2 below is chosen.

### Possible fix options (not yet decided)

1. **Cosmetic:** disable Assign Agent button for synthetic IDs on the client. Hides the problem; doesn't solve it.
2. **Server: auto-create delivery_orders row on POS-Delivery order creation.** Fixes root cause going forward. Doesn't help existing orders without backfill.
3. **Server: PATCH handler strips `order-` prefix and operates on `orders` table directly.** Most complex; needs to be applied to every endpoint under `/api/delivery-orders/:id/…`.
4. **Backfill + Option 2 together.** Cleanest end state, requires a data migration.

Decision: defer until recon completes. Recon scheduled for 2026-04-29 morning.

---

## Addendum 2026-04-29 AM: 404 Recon (Round 1)

**Status:** [VERIFIED] hypothesis confirmed end-to-end. The 404 originates from `service-coordination.ts:601`, not from `delivery.ts` as initially supposed (both paths return the identical message string "Delivery order not found", so the tester's screenshot was ambiguous).

### Confirmed facts

**Q1 — Synthetic ID prefix logic.** [VERIFIED]
`server/routers/delivery.ts:46` constructs `id: 'order-' + o.id` inside the `mainOrdersMapped` map function (lines 42–68). This is the *only* site in the server that produces `order-…` IDs:

```
46:          id: 'order-' + o.id,
```

`grep -rn "'order-' +" server/` returns this single hit. The synthetic-ID rows are then concatenated into the response payload at `delivery.ts:74` (`const combined = [...deliveryData, ...uniqueMainOrders]`) and shipped to the client.

**Q2 — PATCH handler behaviour.** [VERIFIED]
The tester's failing call was **`PATCH /api/delivery-orders/:id/assign-agent`**, defined at `server/routers/service-coordination.ts:595–620`, *not* the bare `PATCH /api/delivery-orders/:id` in `delivery.ts:120`. Both share the same 404 message, but only the assign-agent variant is invoked from the dashboard's "Assign Agent" modal (see `client/src/pages/modules/delivery.tsx:283`).

The assign-agent handler:
- **Does NOT strip any prefix.** `req.params.id` is passed through verbatim (`service-coordination.ts:600`, `:603`, `:611`).
- Calls `storage.getDeliveryOrderByTenant(req.params.id, user.tenantId)` at `service-coordination.ts:600`.
- Returns 404 at `service-coordination.ts:601`: `if (!delivery) return res.status(404).json({ message: "Delivery order not found" });` — this is the exact toast text the tester reported.

`storage.getDeliveryOrderByTenant` (`server/storage.ts:1369–1372`) issues:
```
db.select().from(deliveryOrders).where(and(eq(deliveryOrders.id, id), eq(deliveryOrders.tenantId, tenantId)))
```
With `id = "order-87541db0…"`, no row exists in `delivery_orders` (the actual `orders.id` UUID is `87541db0…`, with no `order-` prefix). The query returns `[]`, the storage method returns `undefined`, and the handler returns 404. **Hypothesis fully confirmed.**

**Q3 — Endpoint enumeration.** See table below.

**Q4 — Production state of POS-Delivery orders.** [VERIFIED]
`POST /api/orders` (`server/routers/orders.ts:325`) does **not** create a `delivery_orders` companion row. Confirmed by:
- `grep -in "delivery_orders\|deliveryOrder\|createDeliveryOrder" server/routers/orders.ts` → **zero hits.**
- The handler inserts only into `orders` and `order_items` (and idempotency-keys, audit, etc.).

By contrast, `POST /api/phone-orders` (`server/routers/service-coordination.ts:633`) **does** create one, conditionally, at `service-coordination.ts:696–707`:
```
if (orderType === "delivery" && deliveryAddress) {
  await storage.createDeliveryOrder({ tenantId, orderId, customerAddress, customerPhone, status: "pending", ... });
}
```

**Implication:** every POS-Delivery order ever placed (i.e. orders with `order_type IN ('delivery','online_delivery','third_party')` originating from the POS UI, not from the phone-orders flow) is missing a `delivery_orders` companion row. They are surfaced to the unified dashboard via the synthetic-ID branch only. Every operation that requires a `delivery_orders` lookup will 404 for those orders. Phone-delivery orders created via `/api/phone-orders` are unaffected because they have a real row.

**Q5 — Recommendation.** See section below.

### Endpoint enumeration

All routes are under `/api/delivery-orders`. Affected = "would 404 (or silently no-op) on a synthetic `order-…` ID."

| Method | Path                                  | File:line                       | Affected by 404? | Client trigger (component:line)                                  |
|--------|---------------------------------------|---------------------------------|------------------|------------------------------------------------------------------|
| GET    | `/api/delivery-orders/unified`        | delivery.ts:14                  | No (producer of synthetic IDs) | client/src/pages/modules/delivery.tsx:249 (queryKey)               |
| GET    | `/api/delivery-orders`                | delivery.ts:84                  | No (list, no `:id`) — but never returns synthetic IDs, so the per-agent dashboard never sees them | client/src/pages/dashboards/delivery-agent.tsx:86 (queryKey)       |
| GET    | `/api/delivery-orders/:id`            | delivery.ts:100                 | **Yes** (storage.getDeliveryOrderByTenant returns undefined → 404 at line 103) | none currently — endpoint is unused by the client                  |
| POST   | `/api/delivery-orders`                | delivery.ts:107                 | No (create, no `:id`) | none — POS uses POST `/api/orders`; phone flow uses `service-coordination.ts:697` directly |
| PATCH  | `/api/delivery-orders/:id`            | delivery.ts:120                 | **Yes** (404 at lines 130 and 137; both via the same storage methods) | client/src/pages/modules/delivery.tsx:268 — fired from delivery.tsx:349, :570, :625, :639, :968, :1011 (status transitions: Mark Ready, Out for Delivery, Delivered, etc.) |
| PATCH  | `/api/delivery-orders/:id`            | (same as above)                 | (same)           | client/src/pages/dashboards/delivery-agent.tsx:96 — but that page reads from `/api/delivery-orders` (non-unified), so it never receives synthetic IDs and is unaffected in practice |
| DELETE | `/api/delivery-orders/:id`            | delivery.ts:143                 | **Latent bug:** `storage.deleteDeliveryOrderByTenant` (storage.ts:1383–1385) silently no-ops with no `RETURNING`/rowcount check, so a synthetic-ID delete returns 200 OK while deleting nothing. Not currently triggered by the client. | none currently — endpoint is unused by the client                  |
| PATCH  | `/api/delivery-orders/:id/assign-agent` | service-coordination.ts:595   | **Yes** (404 at line 601) — **THIS is the route that produced the tester's 404** | client/src/pages/modules/delivery.tsx:283 — fired from delivery.tsx:845 (Assign Agent modal confirm button) |

Three real client-facing failure paths today: the assign-agent PATCH (Q5 below) and the bare PATCH for status transitions (Mark Ready / Out for Delivery / Delivered). Two latent server-side issues for endpoints the client doesn't currently call: `GET /:id` (would 404) and `DELETE /:id` (would silently no-op — separate latent bug worth flagging but out of scope for this fix).

### Recommendation

**Pick Option 4: backfill `delivery_orders` rows for existing POS-Delivery `orders`, AND auto-create a `delivery_orders` row inside `POST /api/orders` whenever `orderType` is delivery-shaped going forward.**

**Justification.** Option 1 (client-side hide) leaves the underlying inability to assign agents in place — managers literally cannot dispatch any POS-sourced delivery order, which negates the value of yesterday's BL-3 unified-view fix. Option 3 (strip-prefix and operate on `orders`) is superficially attractive because it requires no DB writes, but it doesn't actually work: the assign-agent handler writes `driverName` and `driverPhone` into `delivery_orders` columns (`service-coordination.ts:603–607`), and those columns don't exist on `orders`. To make Option 3 work the schema would have to be extended (or driver fields stored in `orders.notes` or a side table), which is more invasive than a `delivery_orders` insert. Option 2 alone fixes the forward path but leaves every existing in-flight POS-Delivery order broken; given those orders are by definition not yet `paid/completed/voided` (the unified endpoint filters those out at `delivery.ts:34`), they will keep appearing in the dashboard and keep failing to dispatch until backfilled. Option 4 is Option 2 plus a one-shot `INSERT INTO delivery_orders SELECT FROM orders WHERE …` migration that closes the existing-order gap in a single deploy. The two halves can also ship as separate PRs (migration first, then auto-create) to limit per-change risk.

**Estimated diff size.**
- `server/routers/orders.ts`: ~10–15 lines added inside the POST handler, after order-item creation (around line 700–900 territory; exact insertion point TBD by the fix author), wrapped in an `if (orderType is delivery-shaped)` guard mirroring `service-coordination.ts:696`.
- One new migration file (e.g. `migrations/####_backfill_delivery_orders.sql`): ~5–10 lines doing `INSERT INTO delivery_orders (id, tenant_id, order_id, customer_phone, customer_address, status, created_at) SELECT … FROM orders o WHERE o.order_type IN (...) AND o.status NOT IN ('paid','completed','voided') AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.order_id = o.id)`.
- Files touched: **2.** Optional unit/integration test bringing it to 3.

**Risk: MEDIUM.** Backfill writes to production data; mitigated by the standard `BEGIN; … ROLLBACK;` dry-run protocol and by the `NOT EXISTS` clause being idempotent. Auto-create-on-POST adds a new write inside the order-creation transaction — must be inside the same transaction (or compensating-rollback path) so a `delivery_orders` insert failure doesn't leave a half-created order. PII handling: `delivery_orders` encrypts `customerPhone`/`customerAddress` via `DELIVERY_PII_FIELDS` (`storage.ts:1374`); the backfill must apply the same encryption when copying from `orders`, which is plaintext in `orders.customer_phone`. This is the highest-risk leg of the work.

**What it does NOT fix (defer to backlog).**
- The silent-no-op `DELETE /api/delivery-orders/:id` bug at `storage.ts:1383–1385` — separate finding, low priority while the endpoint is unused.
- Tester's observation of "three PATCH requests" — likely React Query retry behaviour on 4xx (or three rapid clicks). Not blocking; worth verifying in a follow-up but doesn't change the fix.
- The unified endpoint's `order_channels` cross-join filter at `delivery.ts:35` — unrelated to this 404.
- The `compliance.ts:315` anonymisation path which hits `updateDeliveryOrderByTenant` — only relevant for orders that have a `delivery_orders` row, so the backfill broadens its reach (intended), but no code change needed.

### Open questions / data needed

1. **SQL probe (recommended before merging the backfill leg).** Count POS-Delivery `orders` in production that lack a matching `delivery_orders` row, broken down by status. A read-only `audit/probe-####.sql` wrapped in `BEGIN; SET default_transaction_read_only = on; … ROLLBACK;` would size the backfill and confirm the hypothesis at runtime. Decision deferred to user.
2. **Three-PATCH observation.** Whether the tester's three identical 404s reflect React Query auto-retry, three discrete clicks, or a debounce gap in the modal. Resolvable by checking React Query default `retry` setting in `client/src/lib/queryClient.ts` — out of scope for this recon round.
3. **Transaction scoping.** Does `POST /api/orders` already run its inserts inside a single DB transaction, or are `orders` and `order_items` independent? If independent, the auto-create-on-POST leg should be added with the same semantics as existing inserts (and the failure mode documented), not retrofitted into a transaction. Worth confirming before the fix branch is opened.

## Addendum 2026-04-29 AM: 404 SQL Probe Results

**Probes run:** 2026-04-29 AM, Railway Postgres production database, query console (Database → Data → Query).

### Orphan inventory

POS-Delivery `orders` rows (`order_type::text IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')`) lacking a matching `delivery_orders` companion row, broken down by tenant and status:

| Tenant | Tenant Name | Status | Count |
|---|---|---|---|
| 6a8281c4-8e66-4214-84ad-2d0e3231cc76 | Updated Tenant Name Test | cancelled | 23 |
| 6a8281c4-8e66-4214-84ad-2d0e3231cc76 | Updated Tenant Name Test | new | 13 |
| 6a8281c4-8e66-4214-84ad-2d0e3231cc76 | Updated Tenant Name Test | served | 2 |
| 6a8281c4-8e66-4214-84ad-2d0e3231cc76 | Updated Tenant Name Test | ready_to_pay | 2 |
| 6a8281c4-8e66-4214-84ad-2d0e3231cc76 | Updated Tenant Name Test | voided | 1 |
| 74f513e3-9db5-4a9b-b427-6a4c2a6eb082 | Table Salt Platform | new | 1 |

**Total: 42 orphans across 2 tenants.**

### Operational vs dead-status breakdown

The unified dashboard endpoint filters out `paid`, `completed`, `voided`. The dashboard typically also hides `cancelled`. Operational orphans (visible on dashboard, clickable, and currently triggering 404s):

- new: 14 (13 + 1 cross-tenant)
- served: 2
- ready_to_pay: 2

**Operational orphan total: 18 across 2 tenants.**

The remaining 24 orphans (23 cancelled + 1 voided) are dead orders. They exist in `orders` but don't surface in the dashboard. They do NOT need backfill operationally — only for tidiness. The backfill SQL should target operational statuses only, not these.

### Tenant identity verification

`74f513e3-9db5-4a9b-b427-6a4c2a6eb082` was initially unfamiliar. SQL lookup confirmed:

- **Name:** "Table Salt Platform"
- **Status:** legitimate platform-level tenant in the `tenants` table
- **Likely role:** system/super-admin tenant created during initial setup
- **Anomaly noted:** has 1 POS-Delivery order in `new` status. Platform tenants don't usually have customer orders. Likely a test/seed order, not a security concern.

The other tenant `6a8281c4-...` ("Updated Tenant Name Test") is the primary test tenant the team has been working with throughout April 2026.

Both tenants are real and operational. The backfill plan is unaffected.

### Backfill scope decision (deferred)

Two paths under consideration:

1. **Operational-only backfill.** Target only `new`, `served`, `ready_to_pay` statuses. Backfills 18 rows. Leaves cancelled/voided orphans alone — they're invisible to operations and don't break the dashboard.
2. **Full backfill.** Target all delivery-shaped orders without companions. Backfills 42 rows. Cleaner data state, including dead orders.

Recommendation deferred to fix branch. Option 1 is the minimum viable fix; Option 2 is the principled fix. The encryption-parity work is the same in both — only the WHERE clause differs.

### Railway query console quirk

The Railway Postgres "Database → Data → Query" console silently swallows result rows when a query is wrapped in `BEGIN; … ROLLBACK;`, even for pure SELECTs. The query reports "Query ran successfully" but the result table shows "0 rows" — regardless of the actual row count from the underlying query.

**Workaround:** for SELECT-only probes, omit the transaction wrapper. SELECT is read-only by definition; the wrapper adds nothing.

**For future write operations** (e.g. backfill migrations), do NOT use this console. Connect via `psql` or DBeaver using the `DATABASE_URL` from Railway Variables, where transactional control is reliable.

This is a Railway UI bug, not a database bug. Three probes (Q1, Q2, Q3) returned 0 rows misleadingly before this was diagnosed; rerunning the same SQL without the wrapper returned the actual data. Documenting this for tomorrow's session and future SQL work.

### Decision

Proceed with **Option Y from the recon — two PRs:**

- **PR A:** SQL backfill migration (no code change). Targets the 18 operational orphans across both tenants. Encrypts `customerPhone`/`customerAddress` to match `delivery_orders` PII contract.
- **PR B:** auto-create `delivery_orders` row inside `POST /api/orders` whenever `orderType` is delivery-shaped. Code change, prevents recurrence.

PR A first because it's data-only. PR B second once PR A is verified working. The two PRs are independent — either can be merged without the other, though both are needed for full fix.

Recon for PR A scope (encryption logic, exact migration shape) is the next step.

---

## Addendum 2026-04-29 AM: PR A Recon (Backfill Migration Scope)

**Scope:** what the migration author needs to know before writing the backfill. Read-only — no migration code is proposed here. Severity headline: **the migration cannot be pure SQL.** It must run in Node and call `encryptField()` per row.

### Encryption mechanism

[VERIFIED] **Node-side, AES-256-GCM, key derived from `ENCRYPTION_KEY` env var.**

- Helper module: `server/encryption.ts` (full file, 60 lines).
- Cipher: `aes-256-gcm`, IV 16 bytes (random per call), auth tag 16 bytes (`encryption.ts:3–5`).
- Key derivation: `scryptSync(process.env.ENCRYPTION_KEY, "table-salt-encryption-v1", 32)` (`encryption.ts:10–17`). Key cached in module-scope `derivedKey`.
- Public functions: `encryptField(plaintext)` (`encryption.ts:20–29`), `decryptField(ciphertext)` (`encryption.ts:31–55`), `isEncrypted(value)` (`encryption.ts:57–59`).
- Storage format: a **single text column** containing `enc:<iv-hex>:<authTag-hex>:<ciphertext-hex>` (`encryption.ts:28`). Disambiguator is the literal `enc:` prefix; `isEncrypted` simply tests `startsWith("enc:")`.
- The `storage.createDeliveryOrder` path encrypts via `encryptPiiFields(data, DELIVERY_PII_FIELDS)` at `storage.ts:1374`, which iterates each PII field name and calls `encryptField` on string values that are not already encrypted (`storage.ts:6–14`). Idempotent: passing already-encrypted text is a no-op (the `isEncrypted` guard).

**Implication for the migration:** Postgres has no AES-GCM primitive in a stock install (and `pgcrypto`'s `pgp_sym_encrypt` uses a different format and key derivation). Replicating the existing ciphertext format from SQL is not feasible without re-implementing scrypt + GCM in PL/pgSQL — and even then, future rotations of the encryption code would diverge. **The backfill must run in Node, importing `encryptField` from `server/encryption.ts`.**

### Storage shape

`shared/schema.ts:827–859`. Both delivery PII columns are single `text` columns; **no separate `_iv`, `_tag`, or `_encrypted` columns** — IV and auth tag are packed into the same string per the format above.

```ts
// shared/schema.ts:840
customerAddress: text("customer_address").notNull(),
// shared/schema.ts:841
customerPhone: text("customer_phone"),
```

`customerAddress` is `NOT NULL` — the migration must insert *something* even when no address exists in the source row. `customerPhone` is nullable.

No migration file needed to install pgcrypto/pgp helpers — there are none. The encryption boundary is exclusively in Node application code.

### DELIVERY_PII_FIELDS contract

`server/storage.ts:32`:

```ts
const DELIVERY_PII_FIELDS = ["customerPhone", "customerAddress"];
```

Two fields covered: `customerPhone`, `customerAddress`. **Encryption is transparent** when a caller goes through the storage helpers (`storage.createDeliveryOrder` at `storage.ts:1373–1376`, `updateDeliveryOrderByTenant` at `storage.ts:1378–1382`, `getDeliveryOrderByTenant` at `storage.ts:1369–1372`, `getDeliveryOrdersByTenant` at `storage.ts:1367`). The caller passes plaintext; the helper applies `encryptPiiFields` on write and `decryptPiiFields` on read.

If the migration script bypasses the storage layer and uses `db.insert(deliveryOrders).values(...)` or `pool.query("INSERT ...")` directly, **the script must call `encryptField()` itself for both PII columns** — there is no DB-side trigger or default that would do it.

Two non-PII fields that look like PII but are *not* in `DELIVERY_PII_FIELDS` and therefore are stored in plaintext: `driverPhone` (col `driver_phone`) and `driverName` (col `driver_name`). Out of scope for this PR but flagged for the backlog.

### Address parsing

**Where the regex expects to read from:** `server/routers/delivery.ts:44` does `notes.match(/Address:\s*([^|]+)/)` over `orders.notes` text, with the fallback at `delivery.ts:52`: `addressMatch ? addressMatch[1].trim() : (o.notes || 'No address')`.

**Where `Address:` is supposed to be written into `orders.notes`:** [VERIFIED] **nowhere in the POS path.** The POS-Delivery flow constructs `orders.notes` at `client/src/pages/modules/pos.tsx:1219–1228` and writes only:

```ts
// pos.tsx:1219–1228 (verbatim)
const parts: string[] = [];
if (!tabIsDineIn) {
  if (tab.customerName?.trim()) parts.push(`Customer: ${tab.customerName.trim()}`);
  if (tab.customerPhone?.trim()) parts.push(`Phone: ${tab.customerPhone.trim()}`);
}
if (tabIsDineIn && (tab.covers ?? 1) > 1) parts.push(`Covers: ${tab.covers}`);
if (tab.orderNotes?.trim()) parts.push(tab.orderNotes.trim());
if (offlinePaymentPendingRef.current) parts.push("payment_pending_offline: true");
return parts.length > 0 ? parts.join(" | ") : null;
```

There is no `Address:` segment, and the POS UI in `pos.tsx` has no field that captures a delivery address (only `customerName` and `customerPhone` are collected). `grep` for `Address:` across the entire client returns only translation keys, no construction site.

**The `delivery.ts:44` regex was written speculatively or for a different code path that never landed.** It will never match a POS-sourced order. All 18 POS-Delivery orphans will therefore hit the fallback branch at `delivery.ts:52`, and the dashboard currently renders `o.notes || 'No address'` (the entire pipe-delimited notes string, e.g. `"Customer: David Park | Phone: +1-555-0201"`) in the address column.

**Recommended migration fallback (preserves dashboard parity):** insert the same fallback expression into `customer_address`, encrypted: `o.notes || 'No address'`. This means existing dashboard cards keep displaying the same string they show today. Once PR B (auto-create on POST) lands the long-term shape will improve, but for the backfill, parity > correctness.

**Edge cases observed:**
- `pos.tsx:1228` returns `null` when no parts assembled (dine-in with no extras). For delivery orders the customer-name guard always pushes at least `Customer: ...` if entered, but for a delivery order placed *without* a customer name the API would have rejected it at `orders.ts:398–402` — so `notes` is never `NULL` for a successfully-placed POS-Delivery order, only sometimes for non-delivery types. Safe to assume `o.notes` is non-null for the 18 orphans, but the fallback `|| 'No address'` covers the corner.
- Other delivery sources do populate proper addresses: `service-coordination.ts:701` (`customerAddress: deliveryAddress`) and `aggregator-adapters.ts:54, 71, 94, 111, 134, 151, 183, 207` for Zomato/Swiggy/Uber/etc. via `channels.ts:142, 170, 260, 300`. Those flows go through `storage.createDeliveryOrder` already and are not orphans.
- No order in the codebase writes a literal `Address:` prefix. The regex is dead code today.

### Migration mechanism recommendation

**Node one-shot script.** Mirror `scripts/encrypt-existing-pii.ts` (76 lines). Concretely:

- Path: `scripts/backfill-delivery-orders-from-pos.ts` (proposed name; mirrors plural-`scripts/` convention used by all other one-shots; `script/` singular has only `script/build.ts` and is unrelated).
- Imports to mirror `encrypt-existing-pii.ts:1–4`:
  ```ts
  import { db } from "../server/db";
  import { orders, deliveryOrders } from "../shared/schema";
  import { encryptField } from "../server/encryption";
  ```
- Invocation pattern: `npx tsx scripts/backfill-delivery-orders-from-pos.ts` (analogous to `scripts/encrypt-existing-pii.ts`). Requires `ENCRYPTION_KEY` and `DATABASE_URL` in env.
- Run mode: standalone one-shot, **not** wired into `runAdminMigrations` (`server/admin-migrations.ts`). Rationale: `runAdminMigrations` runs on every deploy and is for schema/idempotent platform setup. A one-time data backfill belongs alongside `encrypt-existing-pii.ts`. The probe's `NOT EXISTS` clause makes re-runs safe, but unnecessary work on every deploy is wasteful and adds boot-time risk.
- Pattern fidelity reference: `scripts/encrypt-existing-pii.ts:45–56` (the `deliveryCount` block) shows exactly how to read delivery rows, encrypt PII fields on the Node side, and write back. The new script does the inverse half (insert new rows from a join) but uses the same `db` + `encryptField` plumbing.

The script should either (a) call `storage.createDeliveryOrder` per row — gets transparent encryption for free — or (b) compute the encrypted values locally and `db.insert(deliveryOrders).values([...]).onConflictDoNothing()`. Option (b) is faster and the bulk size (≤42 even for full backfill) makes the difference negligible; option (a) reads more cleanly and inherits any future encryption changes automatically. Migration author's call.

### Required column inventory

`shared/schema.ts:827–859`. NOT NULL columns the migration must populate are bolded.

| `delivery_orders` column | NOT NULL? | Source from `orders` | Encrypted? |
|---|---|---|---|
| **id** | yes (PK) | omit — DB default `gen_random_uuid()` (`schema.ts:830–832`) | no |
| **tenant_id** | yes (`schema.ts:833–835`) | `orders.tenant_id` (FK match) | no |
| order_id | nullable (`schema.ts:836`) | `orders.id` — populate to link backwards (used by `service-coordination.ts:610` and the `linkedOrderIds` dedupe at `delivery.ts:71–72`) | no |
| customer_id | nullable (`schema.ts:837–839`) | `orders.customer_id` if non-null, else null | no |
| **customer_address** | yes (`schema.ts:840`) | `orders.notes \|\| 'No address'` (regex on `Address:` is dead — see Address parsing) | **YES** — `encryptField()` |
| customer_phone | nullable (`schema.ts:841`) | `orders.customer_phone` (plaintext text col, `schema.ts:498`); skip encrypt if null | **YES** if non-null |
| delivery_partner | nullable (`schema.ts:842`) | null (POS orders have no aggregator partner) | no |
| driver_name | nullable (`schema.ts:843`) | null | no |
| driver_phone | nullable (`schema.ts:844`) | null | no |
| status | has default `'pending'` (`schema.ts:845`) | mapped — see status mapping below | no |
| estimated_time | nullable (`schema.ts:846`) | null (no source field) | no |
| actual_time | nullable (`schema.ts:847`) | null | no |
| delivery_fee | has default `'0'` (`schema.ts:848–850`) | omit (use default) | no |
| tracking_notes | nullable (`schema.ts:851`) | for dashboard parity, set `\`customerName:${orders.customer_name}\`` if `customer_name` non-null, else null. Mirrors `service-coordination.ts:705` exactly. | no (plaintext — not in `DELIVERY_PII_FIELDS`; flagged for backlog) |
| created_at | has default `now()` (`schema.ts:852`) | **`orders.created_at`** — pass explicitly so the historical timestamp is preserved (otherwise the dashboard would re-sort backfilled orders to the present moment) | no |
| delivered_at | nullable (`schema.ts:853`) | null | no |

**Status mapping.** The runtime synthetic-shape mapping at `delivery.ts:56` covers four order statuses; the rest pass through. The `delivery_status` enum (`shared/schema.ts:784–792`) is `["pending","assigned","picked_up","in_transit","delivered","cancelled","returned"]`. The `order_status` enum (`shared/schema.ts:42–56`) is `["new","on_hold","confirmed","sent_to_kitchen","in_progress","ready","served","ready_to_pay","paid","completed","cancelled","voided","pending_payment"]`.

Operational orphans the backfill targets (per the probe):

| `orders.status` | Count | Maps to `delivery_status` | Source |
|---|---|---|---|
| `new` | 14 | `pending` | runtime mapping at `delivery.ts:56` |
| `served` | 2 | **not mapped** — `served` is not in `delivery_status` | runtime would pass through and a direct INSERT would fail the enum check |
| `ready_to_pay` | 2 | **not mapped** — `ready_to_pay` is not in `delivery_status` | same |

Recommended migration mapping (covers the four runtime cases plus the two gaps):

```
new            → pending
sent_to_kitchen → pending
in_progress    → assigned
ready          → picked_up
served         → picked_up   (semantically: order is out of kitchen and effectively gone; see open question)
ready_to_pay   → pending     (payment-terminal state; no physical-delivery analog)
cancelled      → cancelled
voided         → cancelled   (only relevant if PR A scope is widened to dead orders; not for the 18-row scope)
```

The two non-runtime mappings (`served`, `ready_to_pay`) are judgement calls — see Open questions.

### Safety / idempotency

**Where clause to use, justified:**

```sql
SELECT o.id, o.tenant_id, o.customer_id, o.customer_name, o.customer_phone, o.notes, o.status, o.created_at
FROM orders o
WHERE o.tenant_id = $1                                                  -- tenant scope; loop over the 2 tenants explicitly OR omit if running platform-wide
  AND o.order_type::text IN ('delivery','phone_delivery','online_delivery','third_party')
  AND o.status::text IN ('new','served','ready_to_pay')                 -- operational scope (18 rows); widen to include cancelled/voided only if Option 2 is chosen
  AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.order_id = o.id)
```

Justification:

- `order_type` filter mirrors `delivery.ts:33`. Same string set — keeps the backfill aligned with the unified-endpoint definition of "delivery-shaped".
- `status` filter mirrors the dashboard's operational set (`new`, `served`, `ready_to_pay`); excludes `cancelled`/`voided` per the probe's "operational vs dead" decision (recon line 1453–1463).
- `NOT EXISTS` predicate makes the script idempotent: re-running after a partial failure picks up only un-backfilled orphans. `delivery_orders.order_id` is the FK column (`schema.ts:836`, `varchar("order_id").references(() => orders.id)`); confirmed via grep — the only references are `delivery_orders.order_id` → `orders.id`. There is no `UNIQUE` constraint on `order_id`, so a buggy re-run without the `NOT EXISTS` clause would silently double-insert. The clause is load-bearing for safety, not just optimisation.
- Tenant scoping in the loop (rather than in the SQL) lets the script log per-tenant counts (mirrors `encrypt-existing-pii.ts` style).

**Constraint inventory checked:**
- `delivery_orders.id` PK with default `gen_random_uuid()` — no collision risk.
- `delivery_orders.tenant_id` FK to `tenants.id` (`schema.ts:835`) — both target tenants verified to exist (recon line 1469–1474).
- `delivery_orders.order_id` FK to `orders.id` (`schema.ts:836`); no `onDelete` clause means default RESTRICT — irrelevant for INSERT.
- `delivery_orders.customer_id` FK to `customers.id` (`schema.ts:837–839`); pass null when source `orders.customer_id` is null to avoid FK violations on stale references.
- No partial unique indexes on `delivery_orders` (`schema.ts:855–858` declares only two non-unique tenant/created and tenant/status indexes).

No migration-author trap detected.

### Open questions that block writing the migration

These are the two remaining judgement calls. The migration author should confirm before merging PR A.

1. **Status mapping for `served` and `ready_to_pay`.** No precedent in the runtime mapping. Suggested defaults in the table above (`served → picked_up`, `ready_to_pay → pending`), but the operations team owns the semantic. If the dashboard column expectations differ (e.g. a manager wants `served` to render as "ready for handoff" not "picked up"), the mapping should change accordingly. Closeable by a one-liner Slack to whoever owns the delivery dashboard UX.
2. **Whether to populate `tracking_notes` with `customerName:<name>` for dashboard parity.** The runtime synthetic shape exposes `customerName` via the unified endpoint at `delivery.ts:50`, but `delivery_orders` has no `customerName` column — the phone-orders flow stuffs it into `tracking_notes` instead (`service-coordination.ts:705`). Doing the same in the backfill keeps the dashboard from suddenly losing the customer name on backfilled rows. **Strongly recommended.** Marked open only because it's a behavioural decision that should be explicit in the PR description, not because the answer is unclear.
3. **Tracking-notes plaintext PII (out-of-scope flag).** `tracking_notes` is plaintext (not in `DELIVERY_PII_FIELDS`), but it will contain `customerName`. This is not new — `service-coordination.ts:705` does the same — but the backfill broadens the data footprint. Recommend a separate finding/PR to either (a) add `trackingNotes` to `DELIVERY_PII_FIELDS` or (b) move customer name to a proper column. Not blocking PR A.

No further runtime probes needed. PR A is unblocked once the status mapping is confirmed.

---

## Addendum 2026-04-29 PM: BL-1 Round 2 - post-fix verification failure (timeline envelope)

**Premise.** Round 1's fix (PR #10) shipped to production. Today's tester verification on `www.inifinit.com/tickets` shows the page now renders the table, but the Global Error Boundary replaces page content with "Something went wrong" once the user interacts. Console: `TypeError: (n || []).slice is not a function`. Stack top frame: `index-CwXMzz0e.js:1:12069`; subsequent frames in `table-qr-CCArcIKA.js` (a Vite shared-chunk between the `tickets` page and the `qr` build entry per `vite.config.ts:46` — not a separate code path). Round 1's diagnosis and fix were correct; this addendum identifies a second, pre-existing crash that Round 1 didn't touch and that surfaces only now that the page renders far enough to be clicked.

> **Naming note.** The user's task brief referenced `client/src/pages/ticket-history.tsx`; that file does not exist. The actual page source is `client/src/pages/tickets/index.tsx`, exported as `TicketHistoryPage` and lazily imported at `client/src/App.tsx:99`, mounted at `/tickets` (`App.tsx:619`). All findings below cite the real path.

### 1) Round 1 fix — what shipped (PR #10 / commit `5ca3899`)

- File: `client/src/pages/tickets/index.tsx`
- Line: **53 only** (single-line change). Diff:
  ```
  - statusMap[ticket.status.toLowerCase()] || { label: ticket.status, ... }
  + statusMap[(ticket.status ?? "").toLowerCase()] || { label: ticket.status ?? "Unknown", ... }
  ```
- Verified via `git show 5ca3899` — no other files in the diff.
- This is exactly the proposed fix from the prior addendum at `02-new-blockers-recon.md:1113-1118`. It addressed Finding 1 (`ticket.status.toLowerCase()` on a null status). The fix is correct for Round 1's symptom: `StatusBadge` now renders unknown/null statuses as "Unknown" and the page no longer crashes during the table render.

### 2) Today's tester finding

- **URL:** `www.inifinit.com/tickets`.
- **Symptom:** page initially renders the ticket list table; on tester interaction, error card "Something went wrong" replaces page content.
- **Browser console error:** `TypeError: (n || []).slice is not a function`.
- **Stack trace top frame:** `index-CwXMzz0e.js:1:12069`.
- **Subsequent frames:** `at ms, yu, ku, Tm, km, Wm, pb, sc, Km, hp, tl` in `table-qr-CCArcIKA.js`. The `table-qr-...` chunk is a Vite-generated common chunk between the `/tickets` page and the QR build entry declared at `vite.config.ts:43-47` (`main` and `qr` rollup inputs share Table UI primitives); the minified frames are React Fiber internals, not a separate failure surface.

### 3) Single source of `(n || []).slice` in the codebase

`grep -nE "\|\| \[\]\)\.slice" client/src` across the entire client source returns exactly two hits:

- `client/src/pages/modules/audits.tsx:537` — `Array.from(e.target.files || []).slice(0, 3)` — file upload handler, runs only on file-input change. Unrelated to `/tickets`.
- `client/src/components/tickets/TicketDetailDrawer.tsx:274` — `const displayedTimeline = showFullTimeline ? (timeline || []) : (timeline || []).slice(0, 10);` — **only candidate that exists in the `/tickets` render tree.**

The literal `|| []` and `.slice` survive minification because both are short and `[]` is a literal. The variable name `timeline` minifies to `n`, producing exactly the production error string. No other `.slice` call in the `/tickets` render path matches this pattern (`grep` for all `.slice(` in `client/src/components/tickets/` returns only line 274 and a `ticket.id.slice(-6)` string slice at line 296).

### 4) Server/client shape mismatch on `/api/tickets/:orderId/timeline`

**Server handler** at `server/routers/ticket-history.ts:343-406`. The success path (line 401) returns:

```ts
return res.json({ events });
```

— an object envelope, not a bare array. Every other exit on this handler also returns an object: `404 {message}` (line 356), `403 {message}` (line 359), `500 {message}` (line 404). No code path returns a bare array.

`git log -L 401,401:server/routers/ticket-history.ts` shows the `{events}` envelope was introduced by commit `0e7ba31` (Task #112 round 6) when the file was created. **Pre-existing shape — not introduced by any recent BL-1 / BL-2 / BL-3 work.**

**Client query** at `client/src/components/tickets/TicketDetailDrawer.tsx:200-203`:

```ts
const { data: timeline, isLoading: timelineLoading } = useQuery<TimelineEvent[]>({
  queryKey: [`/api/tickets/${orderId}/timeline`],
  enabled: !!orderId && open && showTimeline,
});
```

Type parameter `TimelineEvent[]` declares `timeline` as a bare array. No `select` transform is supplied, so the default queryFn at `client/src/lib/queryClient.ts:115-175` (specifically line 160: `return responseBody`) hands the parsed JSON straight through. Runtime value of `timeline` is therefore `{events: TimelineEvent[]}` — truthy, **not** an array.

**Failure point** at `client/src/components/tickets/TicketDetailDrawer.tsx:274`:

```ts
const displayedTimeline = showFullTimeline ? (timeline || []) : (timeline || []).slice(0, 10);
```

`(timeline || [])` short-circuits to `timeline` because the envelope object is truthy. `.slice` does not exist on a plain object → `TypeError: (n || []).slice is not a function`. Two further uses of the same `(timeline || [])` idiom in this file at lines 539 and 545 (both `.filter`, used inside the Print History section) would crash with `filter is not a function` if line 274 were skipped, but line 274 evaluates first at the top of the component body before the `if (!open) return null` early return at line 276.

### 5) When the crash fires

The drawer is rendered unconditionally at `client/src/pages/tickets/index.tsx:466-471` (`<TicketDetailDrawer open={!!selectedOrderId} ... />`), so the component body always runs and **line 274 always evaluates**.

- **Drawer closed (`selectedOrderId === null`):** `enabled` is false, `timeline` is `undefined`, `(undefined || []).slice(0,10)` returns `[]`. No crash.
- **Drawer open:** `enabled` is true, query resolves with the envelope, `timeline` becomes truthy non-array, line 274 throws.

Two trigger paths:

1. **URL has `?order=xyz`** (`pages/tickets/index.tsx:70`, `:80`). `selectedOrderId` initialises non-null, drawer opens on first render, query fires, crash happens before any user interaction.
2. **Tester clicks a ticket row** at `pages/tickets/index.tsx:394` or `:422`. `setSelectedOrderId(ticket.id)` opens the drawer, query fires, crash. Given the tester URL was `www.inifinit.com/tickets` (no query string in the report), this is the most likely path.

### 6) Why Round 1 passed verification

Round 1's verification confirmed that the page no longer crashes during the table render — which it doesn't. The verification did not include opening any individual ticket. The drawer's `(timeline || []).slice(0, 10)` only evaluates against non-array data once `enabled` becomes true, which only happens when the drawer is opened. Round 1's fix is a true positive; today's failure is a separate, pre-existing crash exposed by Round 1's success — the page now renders far enough that the tester can click a row and trigger the second bug.

### 7) Cross-reference with PR #7 (`f0531bb`) and PR #9 (`f4a93cb`) — BL-3

`git show --stat` on both commits confirms each touched **only** `server/routers/delivery.ts` (1 line each). Neither touched `server/routers/ticket-history.ts`. The `/api/tickets/:orderId/timeline` endpoint and its `{events}` envelope are independent of BL-3. The shape mismatch has existed since commit `0e7ba31` (per `git log -L`), which predates the BL-3 work by many weeks. BL-3's SQL casts have no path to alter the ticket-history endpoint's response shape.

### 8) Hypothesis confidence

**HIGH.** Every link in the chain is verified by source code, not inferred:

- Server returns `{events}` — `server/routers/ticket-history.ts:401`.
- Client expects array — `TicketDetailDrawer.tsx:200-203` declares `useQuery<TimelineEvent[]>` with no transform.
- Default queryFn passes raw JSON through — `client/src/lib/queryClient.ts:160`.
- Crash site uses `(timeline || []).slice` which fails on truthy non-array — `TicketDetailDrawer.tsx:274`.
- Minified error string `(n || []).slice is not a function` matches that line uniquely in the codebase (`grep` results in section 3).
- Drawer renders unconditionally and line 274 evaluates on every render — `pages/tickets/index.tsx:466-471` and `TicketDetailDrawer.tsx:274` (top of body, before early return at line 276).

The only thing static analysis cannot prove is that the tester actually clicked a row vs. arrived with `?order=` in the URL — but both paths route to the same crash, so the distinction does not change the diagnosis or the fix.

### 9) Proposed minimal fix (DO NOT APPLY)

Add a `select` transform to the timeline `useQuery` to flatten the envelope at the query boundary. File: `client/src/components/tickets/TicketDetailDrawer.tsx`, lines 200-203.

```diff
  const { data: timeline, isLoading: timelineLoading } = useQuery<TimelineEvent[]>({
    queryKey: [`/api/tickets/${orderId}/timeline`],
    enabled: !!orderId && open && showTimeline,
+   select: (raw: unknown) =>
+     Array.isArray(raw) ? (raw as TimelineEvent[]) : ((raw as { events?: TimelineEvent[] })?.events ?? []),
  });
```

- **Why this fix.** Tolerates both shapes (current `{events}` envelope; future bare-array if the server is ever changed). Guarantees `timeline` is an array at every consumer site (lines 274, 495, 517, 539, 545), so all four `(timeline || []).method` and `timeline.length` references stop being landmines.
- **Why this idiom.** The same `select` transform pattern is already used in this file at `TicketDetailDrawer.tsx:149-197` for the ticket-detail query (mapping `{order, items, bill}` → `TicketDetail`). Same place, same shape of intervention.
- **Diff size.** 2 lines added inside one existing object literal, 0 deleted.
- **Files changed.** **1** — `client/src/components/tickets/TicketDetailDrawer.tsx`.
- **Risk.** Low. The transform is a pure function; it does not change network behaviour or cache keys. If the server response is already an array (future server fix), the `Array.isArray` branch returns it unchanged. If it is the envelope, the `events ?? []` branch returns the inner array. If it is neither (e.g. a 5xx that bypassed `throwIfResNotOk`), the `?? []` falls back to an empty array.

### 10) Alternative considered and rejected — server-side change

Drop the envelope on the server (`return res.json(events)` at `ticket-history.ts:401`). Smaller diff (one line) but rejected because:

- Server-side shape changes have a wider blast radius. Any other consumer (e.g. an internal tool, a test fixture, a future mobile client) that reads `body.events` would silently break.
- The client-side `select` transform is strictly more tolerant — it accepts either shape. A server change would force every consumer to update simultaneously.
- The endpoint's prior commit `0e7ba31` (Task #112 round 6) explicitly chose the envelope; reversing that without understanding the original motivation risks reintroducing whatever it was guarding against.

### 11) Verification probes

No SQL probe required — this is a static contract mismatch fully verifiable from source.

1. **DevTools Network capture** on `GET /api/tickets/{orderId}/timeline` from any production session. Confirm response body is `{events: [...]}`. One screenshot or copy-paste of the response body, no schema query needed.
2. **Pre-fix reproduction**: visit `/tickets?order=<known-order-id>` while logged in. Without the fix, page should crash with the exact error string. With the fix applied, drawer should open and the timeline section should render (or display "No timeline events available." for orders with no events).
3. **Post-deploy smoke test**: tester opens `/tickets`, clicks any row from the list. Drawer opens, timeline section either lists events or shows the empty-state message, console clean, no Error Boundary card. Same flow that reproduced the crash today.

### 12) Files that would need to change

**1 file:** `client/src/components/tickets/TicketDetailDrawer.tsx` (lines 200-203, 2 lines added).

No server change. No schema change. No migration. No test fixture change (no existing tests in this path per `grep -r "TicketDetailDrawer" client/`). Single-file, single-PR fix.

### Open questions / data needed

1. **Did the tester arrive with `?order=` in the URL or click a row?** Either path triggers the same crash, so the diagnosis is unchanged either way — but knowing which would clarify the user-visible reproduction steps for the post-deploy smoke test.
2. **Are there other `{wrapper}` envelopes the client treats as bare arrays?** `grep` for `useQuery<.*\[\]>` against the matching server handler shapes is worth running as a separate audit pass — this addendum addresses the timeline call only.
3. **Should `voidRequests` at `TicketDetailDrawer.tsx:205-208` be checked?** Server handler at `ticket-history.ts:436-451` returns `result.rows` directly (line 446) — bare array, no envelope. Safe. Cross-checked; not affected.

---

## Addendum 2026-04-29 PM-3: BL-1 Round 3 finding — timeline icon/action protocol mismatch (separate ticket)

**Premise.** Round 3 (commit `34b33d6` on `fix/BL-1-round-3-getEventIcon-guard`, ship in progress) lands a 3-line defensive guard at `client/src/components/tickets/TicketDetailDrawer.tsx:110, :542, :548` that null-coalesces `event.action` to `""` before `.toLowerCase()`, stopping the production crash reported on `www.inifinit.com/tickets`. The crash is fixed. The same recon pass (see prior addendum "BL-1 Round 2 - post-fix verification failure") surfaced a deeper protocol mismatch between the timeline server handler and the timeline client interface that the Round 3 guard does **not** resolve. This addendum documents that protocol bug as a separate, lower-priority follow-up so it does not get lost once the crash fix ships.

### The two layers of the mismatch

#### Layer A — field name

The server handler at `server/routers/ticket-history.ts:343-406` declares the event type at line 361:

```ts
const events: Array<{ timestamp: string; icon: string; description: string; performedBy?: string; performedByRole?: string }> = [];
```

— field is **`icon`**, not `action`. All eleven `events.push(...)` call sites (lines 363, 364, 368, 369, 370, 375, 376, 377, 382, 387, 396) use `icon: "..."`. None use `action: ...`.

The client interface at `client/src/components/tickets/TicketDetailDrawer.tsx:59-66` declares:

```ts
export interface TimelineEvent {
  id?: string;
  action: string;
  description?: string;
  performerName?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}
```

— field is **`action`** and is required. **Result at runtime: every `event.action` value is `undefined`.** That is exactly what the Round 3 fix guards against — the guard does not align the field names; it only stops the crash.

#### Layer B — value namespace

Even if Layer A were resolved (e.g. server renamed `icon` → `action` everywhere), the **values** the server emits do not match the keys in the client `EVENT_ICONS` lookup at `TicketDetailDrawer.tsx:90-107`.

Server emits these eleven distinct icon strings (`server/routers/ticket-history.ts`):
- `"order_created"` (line 363)
- `"kitchen_sent"` (line 364)
- `"cooking_started"` (line 368)
- `"item_ready"` (line 369)
- `"item_served"` (line 370)
- `"void_requested"` (line 375)
- `"void_approved"` (line 376)
- `"void_rejected"` (line 377)
- `"refire_requested"` (line 382)
- `"bill_paid"` (line 387)
- `"reprinted"` (line 396)

Client `EVENT_ICONS` keys (`TicketDetailDrawer.tsx:91-106`):
- `created`, `kot_sent`, `cooking`, `ready`, `served`, `paid`, `closed`
- `void_requested`, `void_approved`, `void_rejected`
- `refire`, `viewed`
- `reprinted`, `receipt_reprinted`, `kot_reprinted`, `bill_reprinted`

Intersection (server values that match a client key directly): **`void_requested`, `void_approved`, `void_rejected`, `reprinted`** — four out of eleven.

Mismatches (server emits, client has no matching key):
- `order_created` vs client `created`
- `kitchen_sent` vs client `kot_sent`
- `cooking_started` vs client `cooking`
- `item_ready` vs client `ready`
- `item_served` vs client `served`
- `refire_requested` vs client `refire`
- `bill_paid` vs client `paid`

Client-only keys never emitted by the server: `closed`, `viewed`, `receipt_reprinted`, `kot_reprinted`, `bill_reprinted`.

**Result:** even with Layer A fixed, seven of the eleven event types (`order_created`, `kitchen_sent`, `cooking_started`, `item_ready`, `item_served`, `refire_requested`, `bill_paid`) would still fall through `EVENT_ICONS[key]` to `undefined`, then to the `|| "📌"` fallback at `TicketDetailDrawer.tsx:111`. Only the four void/reprint events would render their intended icon.

### User-visible impact

Today (after Round 3 ships): the timeline section in the ticket-detail drawer renders one row per server event, each labelled with the literal `📌` fallback icon. Description text is correct (`event.description` is populated by the server). Timestamp is correct. The icon column was clearly intended to convey event type at a glance — different glyphs per category — and currently conveys nothing.

This is a **render bug, not a crash**. Users can read the timeline. The icon column is just visually flat across all rows.

### Why it has not been reported

- Before PR #12 (the timeline-envelope `select` fix), `(timeline || []).slice` crashed before the timeline section ever rendered. The icon column was never visible.
- Between PR #12 shipping (~4:15 PM 2026-04-29) and Round 3 shipping, the `.toLowerCase()` crash at `getEventIcon` fired on every drawer open. The icon column was still never visible.
- Once Round 3 ships, users will see the timeline render correctly with `📌` on every row. They have no reference for what the icons should look like — there is no spec page, no screenshot of the intended design, no tester acceptance criteria currently calling out per-event-type icons. They will not flag it as broken.
- Therefore: this can sit indefinitely until someone audits it.

### Resolution options for a future PR

Three options. Recommendation: **Option 2.**

**Option 1 — server-side alignment.** Rename `icon:` → `action:` in all eleven `events.push(...)` calls (`server/routers/ticket-history.ts:361, 363-396`) AND change the emitted values to match the client `EVENT_ICONS` keys (e.g. `"order_created"` → `"created"`, `"kitchen_sent"` → `"kot_sent"`, etc.). Roughly 12 lines changed in one file.
- Risk: any other consumer of `GET /api/tickets/:orderId/timeline` that reads `body.events[].icon` or expects the existing values would break. Grep across `client/src` for `/api/tickets/.*timeline` returns hits only at `TicketDetailDrawer.tsx:201` (queryKey) and `TicketDetailDrawer.tsx:237` (invalidate); no other consumer file. So in practice the risk is limited to *future* consumers and any external/mobile/test code I cannot see from this repo. If those don't exist, Option 1 is also safe.

**Option 2 — client-side alignment (recommended).** Two sub-changes in one PR, both in `client/src/components/tickets/TicketDetailDrawer.tsx`:
1. Rename `action: string` → `icon: string` in the `TimelineEvent` interface (line 62) and update consumers at lines 110 (param), 503 (`event.action` → `event.icon`), 505 (fallback chain), 542, 548 (filter predicates), 550 (display).
2. Replace the `EVENT_ICONS` keys at lines 91-106 with the values the server actually emits: `order_created`, `kitchen_sent`, `cooking_started`, `item_ready`, `item_served`, `void_requested`, `void_approved`, `void_rejected`, `refire_requested`, `bill_paid`, `reprinted`. Choose appropriate emoji per event. Remove unused keys (`closed`, `viewed`, `receipt_reprinted`, `kot_reprinted`, `bill_reprinted`) unless future server emission is planned.

Diff size: ~8 modified lines for the rename, ~10 modified lines for the keys. One file. Server unchanged — zero blast radius for other consumers. Easier to verify: `npm run check` plus a smoke test where each event type's icon is sanity-checked.

Why Option 2 over Option 1: client is the single consumer (verified by grep above); a client-only change has strictly smaller blast radius than a server change. The Round 3 defensive guard (`?? ""`) can stay in place even after Option 2 ships — it becomes a belt-and-braces safety net rather than the primary fix.

**Option 3 — transitional dual-emission.** Server emits both `icon` and `action` fields, both old and new value strings, deprecating one over time. Heavy-handed for an internal API with one consumer; not recommended.

### Verification before the future PR ships

1. **DevTools Network capture** on `GET /api/tickets/:orderId/timeline` against a real ticket in production or staging. Confirm the response body shape is `{events: [{timestamp, icon, description, performedBy, performedByRole}, ...]}` matching the static analysis above. Note any drift if the server emits additional or different fields than the source code suggests.
2. **Confirm the exact set of icon string values the server actually emits** by reading the JSON body, not just source code. The list above is from static reading of `server/routers/ticket-history.ts:343-406` on `main` at commit `5765a8d`; if any newer commit has added `events.push(...)` calls, the list grows.
3. **Cross-check** the live values against the prospective new `EVENT_ICONS` keys in the Option 2 diff. Document any extra/missing values; pick an emoji for each.
4. **Decide on the canonical naming scheme.** Server's `order_created` is a verb-noun pair; client's `created` is just the verb. Server's pattern is more descriptive and future-proof if more entity types appear (e.g. distinguishing `bill_paid` from a hypothetical `partial_paid`). The Option 2 recommendation aligns the client to the server's existing pattern. If the team prefers the client's terser pattern, Option 1 (server change) becomes the right path instead.

### Status flag

This is a **separate, follow-up ticket — NOT part of any pending PR**. The Round 3 fix shipping right now (commit `34b33d6`) stops the crash via three null-coalesce guards. Those guards are sufficient to unblock the tester and remain as a safety net even after the protocol-mismatch fix lands. This addendum captures the deeper bug for a future audit cycle.

### Open questions

1. **Is there any non-source-tree consumer of `GET /api/tickets/:orderId/timeline`?** Mobile app, partner integration, internal tool, test harness, BI export. Grep across `client/src` confirms no file under that tree consumes `events[].icon`. Outside the repo cannot be verified from here. Worth a one-line check with whoever owns external integrations before Option 1 is considered.
2. **Was the icon column ever working in any prior commit?** A `git log -p -- client/src/components/tickets/TicketDetailDrawer.tsx` filtered for changes to `EVENT_ICONS` would show whether the keys ever matched the server values, or whether the mismatch has existed since the timeline feature was first introduced. If always-broken, the design intent for icons may have drifted before implementation; surface that to whoever owns the timeline UX.
3. **Should the unused client-only keys (`closed`, `viewed`, `receipt_reprinted`, `kot_reprinted`, `bill_reprinted`) be removed or kept as forward-looking placeholders?** Removing them keeps the dictionary tight; keeping them documents intended future events. No strong preference; flag for the PR author to decide.

## PR #14 follow-ups (2026-04-29 PM)

PR #14 (`fix/ticket-drawer-close-button`, commit `c274d7d`) added `z-20` to the auto-rendered `SheetPrimitive.Close` in `client/src/components/ui/sheet.tsx:68` and `pr-12` to the SheetHeader in `client/src/components/tickets/TicketDetailDrawer.tsx:294`. The z-index bump is a global change to the Sheet primitive — it now affects every Sheet consumer in the app, not only the ticket-detail drawer. Two follow-up items below.

### Ticket 1 — Sheet consumers visual sweep

- **Severity:** cosmetic / low
- **Trigger:** PR #14's `z-20` bump on `client/src/components/ui/sheet.tsx:68` makes the auto-rendered X close button visible on every Sheet in the app. The button sits at `absolute right-4 top-4` (16 px from the right and top edges of `SheetContent`) and is `h-4 w-4` — it occupies a 16×16 px box between 16 px and 32 px from the right edge.
- **Risk:** any Sheet whose header content (titles, badges, action buttons, filters) extends to the right edge of its header will now overlap the visible X. The TicketDetailDrawer is already paired in PR #14 (`pr-12` on the SheetHeader); the other 12 consumers are unaudited.
- **Action:** walk each Sheet consumer, check header right-edge padding against any content that lands in the 16–32 px right-edge zone, and add `pr-12` (or equivalent right-side padding) where collisions occur. Consumers that already leave generous right padding need no change. One commit per file or one bundled commit, at the author's discretion.
- **How to find consumers:** grep `@/components/ui/sheet` across `client/src` (13 hits as of this addendum). Files identified during PR #14 recon:
  - `client/src/pages/menu/menu-pricing.tsx`
  - `client/src/pages/modules/parking.tsx`
  - `client/src/pages/modules/pos.tsx`
  - `client/src/pages/procurement/suppliers.tsx`
  - `client/src/pages/procurement/quotations.tsx`
  - `client/src/components/admin/admin-layout.tsx`
  - `client/src/components/coordination/order-detail-panel.tsx`
  - `client/src/components/notifications/prep-notification-drawer.tsx`
  - `client/src/components/modifications/ModificationDrawer.tsx`
  - `client/src/components/coordination/service-message-panel.tsx`
  - `client/src/components/pos/DeliveryQueuePanel.tsx`
  - `client/src/components/tickets/TicketDetailDrawer.tsx` (already addressed in PR #14)
  - `client/src/components/ui/sidebar.tsx` (mobile sidebar — mostly nav, low collision risk)

### Ticket 2 — Click-outside-to-close disabled globally

- **Severity:** open product question (no code fix yet)
- **Location:** `client/src/components/ui/sheet.tsx:64`
- **Current behavior:** the SheetContent passes `onInteractOutside={(e) => e.preventDefault()}` to the underlying Radix Dialog. This disables backdrop-click-to-close for **every Sheet in the app** — across all 13 consumers. The only ways to dismiss a Sheet are the ESC key and the X close button (now visible after PR #14).
- **Question:** is this intentional or accidental?
  - **Intentional reading:** prevents accidental data loss in in-progress edit drawers (POS order detail, modification drawer, supplier forms, etc.) where a stray click would discard unsaved input.
  - **Accidental reading:** the line looks like a copy-paste from a shadcn/ui template, possibly applied without a consumer-by-consumer assessment. Some Sheets (e.g. the read-only TicketDetailDrawer, the prep-notification-drawer) have no in-progress state worth protecting and would benefit from backdrop-click dismissal as a third close path.
- **Action:** product/design call, not a code fix yet. If the intent is mixed (some Sheets want backdrop-close, others don't), the right solution is to lift `onInteractOutside` out of the primitive and let each consumer opt in or out via prop, rather than enforcing one policy globally.
