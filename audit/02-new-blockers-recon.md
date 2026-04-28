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
