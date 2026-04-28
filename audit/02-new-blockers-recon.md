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
