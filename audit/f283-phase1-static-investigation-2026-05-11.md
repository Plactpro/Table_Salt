# F-283 Phase 1 — Static Investigation: Split bill creates orders with no items

**Status:** Phase 1 (read-only static investigation). Phase 2 implementation pending stakeholder decisions on Q-283-Q1 through Q-283-Q6.
**Source:** Tester reports from Madhesh + Nandhini independent confirmation, 2026-05-10 QA workbook Task 1 state F.
**Investigation date:** 2026-05-11 (continued through 2026-05-12).
**Branch:** `audit/f283-phase1-static-investigation-2026-05-11`.

---

## §1 Summary

When a dine-in order with 2+ items is split via the POS split dialog, both resulting orders are persisted to the database with order rows but **no `order_items` rows**. Clicking "View Bill" on a split order returns HTTP 400 ("Cannot create bill for order with no items"); the Online Orders list shows the orders with no items and zero value.

**Root cause:** Conflated semantics in the client's `buildOrderData` function at `client/src/pages/modules/pos.tsx:1167-1169`. A single `itemsToSend` filter is overloaded with two responsibilities:

1. **KOT-firing scope** — items to send to kitchen (must filter out already-sent items to avoid duplicate KOTs).
2. **Order item persistence** — items to write as `order_items` rows (must include all items in the order, regardless of KOT history).

For a typical bill-time split of a fully-KOT'd dine-in order, every item is already in `sentCartKeys`. The filter empties `itemsToSend`. The server's `POST /api/orders` handler creates the order row but skips the `order_items` insert loop because `items.length === 0`. Two empty orders.

**Phase 1 reframes the backlog hypothesis:** the original framing ("split-bill handler is missing the order_items duplication step") is partially correct on symptom but wrong on locus. The bug is on the **client**, in `buildOrderData`. The "split endpoint" referenced in the backlog (`/api/orders/:id/split-bill` at `server/routers/orders.ts:1407`) doesn't even create orders — it's a read-only computation, and Phase 1 confirmed it is unreachable dead code.

---

## §2 Reframe note (corrects backlog framing)

The backlog entry at `audit/00-backlog.md:72` states:

> Investigation: split endpoint creates new order rows but appears to not copy/move order_items rows; likely server/routers/orders.ts split-bill handler is missing the order_items duplication step.

This is wrong in three specific ways. Phase 1 reframes:

1. **The split endpoint at `server/routers/orders.ts:1407` does NOT create new order rows.** It is a pure read-only computation: filters items, sums totals, emits a websocket event, audit-logs, returns split metadata. Lines 1407-1447, no INSERT/UPDATE/DELETE.
2. **The `splitOrderMutation` in `pos.tsx:1421` does NOT call the split-bill endpoint.** It calls `POST /api/orders` N times — one per non-empty group — using the regular order creation path.
3. **The bug is on the client, not the server.** The server's order creation handler is doing exactly what its caller asked: persist an order with the items provided. The client provides zero items because of the conflated `buildOrderData` filter.

This reframing is preserved in the Phase 1 doc rather than mutating the original backlog entry, following the F-285 PR4 supersession pattern (PR #46).

---

## §3 Schema verification

**`orders` table** (`shared/schema.ts:426-510`):
- Line 449: `isSplitBill: boolean("is_split_bill").default(false)` — pre-existing affordance for marking split orders. Currently unused by the split flow.
- Line 488: `parentOrderId: varchar("parent_order_id", { length: 36 })` — column exists, but:
  - No `.references()` constraint (not a foreign key).
  - Not `.notNull()` (nullable, defaults to NULL).
  - Not indexed. Existing indexes (lines 500-505) cover `tenantId`, `tenantId+createdAt`, `tenantId+status`, `tenantId+tableId`. No `parentOrderId` index — queries filtering by it would full-scan the orders table.

**`orderItems` table** (`shared/schema.ts:508`): standard separation, FK to `orders` via `orderId`.

**Implications for fix paths:**
- Path C (server-side parent-copy via `parentOrderId`) is viable as a code-only change — no schema migration required. The column already exists.
- The lack of FK + index on `parentOrderId` is a separate concern. Q-283-Q3 captures it.

---

## §4 Bug chain (verbatim trace)

The full client-to-server chain that produces the symptom:

**Step 1.** User opens split dialog, assigns items to N groups, clicks "Place Split Orders". Triggers `splitOrderMutation.mutate(groups)` (`pos.tsx:1479`).

**Step 2.** `splitOrderMutation.mutationFn` (`pos.tsx:1421-1437`) iterates non-empty groups. For each group:

```javascript
const alreadySentInGroup = group.filter(c => originalSentKeys.has(c.cartKey)).map(c => c.cartKey);
const tabForGroup: OrderTab = { ...(activeTab!), id: makeid(), cart: group, sentCartKeys: alreadySentInGroup };
const orderData = buildOrderData(undefined, tabForGroup);
const payload = parentOrderId ? { ...orderData, parentOrderId } : orderData;
const res = await apiRequest("POST", "/api/orders", payload);
```

**Step 3.** `buildOrderData(undefined, tabForGroup)` (`pos.tsx:1160+`) computes:

```javascript
const sentKeys = new Set(tab.sentCartKeys);          // line 1167
const tabIsDineIn = tab.orderType === "dine_in";
const isAddonKot = sentKeys.size > 0 && tabIsDineIn; // line 1169
const itemsToSend = isAddonKot
  ? tab.cart.filter(c => !sentKeys.has(c.cartKey))   // ← THE BUG (for split case)
  : tab.cart;
```

For a fully-KOT'd dine-in order being split: `tab.sentCartKeys` contains every item's cart key. `sentKeys.size > 0 && tabIsDineIn === true` → `isAddonKot === true`. `itemsToSend = tab.cart.filter(c => !sentKeys.has(c.cartKey))` returns an **empty array**.

**Step 4.** `orderData.items = []`. The payload posted to `POST /api/orders` has zero line items.

**Step 5.** Server handler (`server/routers/orders.ts:325+`) destructures the payload (line 333), constructs `serverOrderData`, calls `storage.createOrder(serverOrderData)` at line 606. **Order row is created.**

**Step 6.** Server hits the item-persist gate at `orders.ts:633`:

```javascript
if (items && items.length > 0) {
  // loop that calls storage.createOrderItem for each
}
```

`items.length === 0`, loop is skipped, **zero `order_items` rows persisted**.

**Step 7.** Server returns `{ id, version, ... }`. Client onSuccess (`pos.tsx:1438+`) creates new tab with `heldOrderId: orders[i]?.id`, invalidates `/api/orders` query, refetch pulls the empty order into the Online Orders list.

**Result:** Two database orders, both with order rows but no `order_items`. Both render as empty in the Online Orders list. "View Bill" returns 400 because the bill creation handler requires items.

---

## §5 The conflated semantics

The `itemsToSend` array in `buildOrderData` drives **two distinct downstream behaviors** that have different correctness requirements:

**(a) KOT fire-set.** The items the kitchen needs to start cooking for this order. For an addon-KOT (cashier adds new items mid-meal), this MUST exclude items already sent — otherwise the kitchen receives duplicate tickets.

**(b) `order_items` persistence set.** The items written as line items on this order's row. For ALL orders, this MUST include every item that belongs on the order — KOT history is irrelevant to whether the database needs the row.

These two responsibilities are merged into one filter today. Addon-KOT correctness wins, persistence correctness loses for the split case.

The fix is to **separate them**: the persistence set is always full, the KOT fire-set is filtered. Both are computed in `buildOrderData`, both flow into the payload, the server uses each appropriately (persist all items; fire KOT only for items not flagged `isAddon`).

---

## §6 Dead endpoint finding

`POST /api/orders/:id/split-bill` at `server/routers/orders.ts:1407-1447` is **dead code**.

**Verification:**
- Server-side: only the route definition (`orders.ts:1407`). No internal calls.
- Client-side: three hits for the literal "split-bill" — `client/src/pages/guest.tsx:1394`, `client/src/pages/modules/pos.tsx:2313`, `pos.tsx:2647`. All three are UI test-ids (`data-testid="button-split-bill"` / `dialog-split-bill"`). None call the API.
- The pos.tsx button at line 2313 opens the split dialog locally (`setShowSplitDialog(true)`), which drives the `splitOrderMutation` flow — which calls `POST /api/orders`, never `/split-bill`.

The endpoint computes per-split totals from existing items and returns metadata. No DB writes. ~40 lines of unused logic.

**Disposition options for Phase 2:**
- Delete it (cleanup, ~40 lines removed).
- Repurpose it as the dedicated split-order endpoint per Path D (reuse route name with new semantics).
- Leave it as-is (non-launch-blocking; defer to a post-launch architectural-cleanup finding).

Captured as Q-283-Q4.

---

## §7 Fix paths

Four candidate paths, from smallest scope to largest:

### Path A — `splitOrderMutation` sets `sentCartKeys: []`

**Where:** `pos.tsx:1429`.
**Change:** ~1 line. `sentCartKeys: alreadySentInGroup` → `sentCartKeys: []`.
**Effect:** `isAddonKot === false` for split groups. `itemsToSend = tab.cart` (full). Server persists all items. Items also fire to KOT.
**Trade-off:** ❌ Unacceptable. Already-cooking items get duplicate KOTs sent to the kitchen on split.

### Path B — `buildOrderData` distinguishes "addon" vs "split" mode (RECOMMENDED for smallest correct scope)

**Where:** `buildOrderData` in `pos.tsx:1160+`.
**Change:** ~5-10 lines. Add `isSplit` flag to the function signature (or detect via tab field). When `isSplit === true`: `itemsToSend = tab.cart` (full), but each item gets `isAddon: true` so the server suppresses KOT fire for them. The persistence set and KOT fire-set diverge.
**Effect:** Server persists all items. KOT not fired (because all items are flagged `isAddon`). Same effect as the existing addon-KOT flow but with full persistence.
**Trade-off:** Cleanest client-side fix. Doesn't touch server. Doesn't depend on `parentOrderId` semantics. Doesn't require server logic that doesn't exist today.

### Path C — Server-side parent-copy via `parentOrderId`

**Where:** `POST /api/orders` handler in `orders.ts:325+`.
**Change:** ~10-15 lines. When request has `parentOrderId` AND `items` is empty, server queries `storage.getOrderItemsByOrder(parentOrderId, tenantId)` and inserts copies into the new order's `order_items`.
**Effect:** Client unchanged. Server transparently handles the empty-items-with-parent case.
**Trade-off:** Cleaner client. But: introduces server logic that depends on a varchar field with no FK constraint and no index. Repeats parent items into every split (duplicates the rows). Doesn't handle item-subset splits cleanly (the typical split sends a subset to each group, not all items to all groups).

Path C is **not the right fix for the symmetric-subset case** the splitOrderMutation actually does. Each group has a different subset; copying all parent items would give wrong contents. Path C would only work if the client also sent the `itemIds` for each split, which means we're back to needing client changes anyway.

### Path D — Dedicated `POST /api/orders/:id/split-order` endpoint

**Where:** New route, possibly repurposing the dead `/split-bill` route.
**Change:** ~50+ lines. Atomic transaction: create N child orders with proper `order_items` rows, set `parentOrderId` and `isSplitBill` flags, optionally void/cancel parent or mark it superseded.
**Effect:** Full server-side correctness. Atomic. Auditable as a single operation.
**Trade-off:** Cleanest architecturally. Largest scope. Requires schema considerations (`parentOrderId` index, FK constraint).

### Recommendation context

**For launch (smallest correct scope):** Path B. ~5-10 lines, client-side only, no schema changes, addresses the root cause directly (semantic conflation) by separating persistence from KOT-firing.

**For post-launch architectural cleanup:** Path D, captured as a future finding. Path D becomes the right shape once the launch-blocker queue clears.

This is a stakeholder decision — Q-283-Q1.

---

## §8 Open questions

- **Q-283-Q1.** Fix path: A / B / C / D? Phase 1 recommends B for launch, D as eventual architectural goal.
- **Q-283-Q2.** Parent order disposition after split: stays as `in_progress` with no UI affordance to find it (current behavior); cancelled; voided; marked `isSplitBill: true`; bill voided. Currently the parent persists indefinitely with `status: "in_progress"`, the client tab is dropped, and the parent has no children-link in the UI.
- **Q-283-Q3.** `parentOrderId` integrity: add `.references()` FK constraint and an index, or leave as-is? Affects Path C/D performance and referential integrity guarantees. Not blocking Path B.
- **Q-283-Q4.** Dead `/api/orders/:id/split-bill` endpoint at `orders.ts:1407-1447`: delete (~40 lines), repurpose (Path D), or defer to post-launch cleanup finding?
- **Q-283-Q5.** Manual discount apportionment: current `splitOrderMutation` spreads `activeTab` per-group via `{ ...(activeTab!), ... }`. Each split group inherits the full `tab.discount` from the parent → over-discount (parent's discount applied to each child's full subtotal). Confirmed structurally but not measured against test data. Independent of Q-283-Q1 — must be fixed regardless of fix path.
- **Q-283-Q6.** `isSplitBill` flag (`schema.ts:449`): should Phase 2 set it on parent (when split happens) or children (since they came from a split) or both? Currently unused by all flows.

---

## §9 Phase 2 recommendation

**Phase 2 unblocks once Q-283-Q1 (path) and Q-283-Q5 (discount apportionment) are decided.** Other questions (Q-283-Q2 disposition, Q-283-Q3 FK, Q-283-Q4 dead code, Q-283-Q6 flag) can either be deferred to a post-launch finding or bundled into Phase 2 depending on the locked path.

If Q-283-Q1 = Path B (recommended):
- Phase 2 scope: ~5-10 lines in `buildOrderData` (`pos.tsx:1160+`). Optional ~3-5 lines in `splitOrderMutation` to pass the `isSplit` flag.
- No server changes.
- No schema changes.
- Phase 2 closes Q-283-Q5 in the same PR (manual discount apportionment) since both are client-side, both touch the same mutation.
- Q-283-Q2/Q3/Q4/Q6 deferred to post-launch follow-up findings (F-289+).

If Q-283-Q1 = Path D:
- Phase 2 scope: ~50+ lines new endpoint, server-side, plus client refactor to use it.
- Likely 2-3 PRs (endpoint, client refactor, schema migration if Q-283-Q3 = yes).
- Higher risk, longer timeline. Not recommended pre-launch.

**No regression test will be added** — project has no automated test infrastructure as of 2026-05-12. Manual verification via testers per the established Tier III workbook pattern.

---

*Phase 1 complete. Awaiting stakeholder decisions on Q-283-Q1 through Q-283-Q6 before Phase 2.*
