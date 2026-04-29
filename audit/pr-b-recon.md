# PR B Recon — auto-create `delivery_orders` row in `POST /api/orders`

**Date:** 2026-04-29 PM
**Scope:** read-only static analysis. No code changed, no migration written, no test added. Cited line numbers are against `main` at commit `584e6af`.

## Summary

PR B adds a single `await storage.createDeliveryOrder({...})` call inside the `POST /api/orders` handler, gated on `orderType` being delivery-shaped. The intent is to stop generating new POS-Delivery "orphan" orders that the unified delivery dashboard surfaces via a synthetic `order-<id>` shape — the synthetic shape is read-only and 404s every operational endpoint (`Assign Agent`, `Mark Ready`, etc.). The mirror pattern already exists at `server/routers/service-coordination.ts:696-707` for phone-orders; PR B's job is to replicate that one-line insert in the POS path. Pairs with PR A (the backfill script committed in PR #11) — together they fix the 18 existing orphans and prevent recurrence.

**Status (2026-04-29 PM):** Blocked on M5 (POS UI delivery address field). After review, founder decision is to add the address input to the POS delivery flow first rather than ship PR B with a placeholder fallback. Pre-launch state means zero existing customer data depends on the placeholder workaround. PR B will be re-scoped once M5 ships — likely simpler than this recon describes (the QQ-1 (a)+(c) hybrid disappears because req.body.deliveryAddress will always be present). This recon document is preserved as-is for re-use after M5.

## POST /api/orders handler today

- **File:** `server/routers/orders.ts`
- **Line range:** **325–843** (~518 lines, inside `registerOrdersRoutes`).
- **Auth:** `requireAuth` (line 325).
- **What it does, in order:**
  1. Idempotency-key claim via atomic INSERT into `idempotency_keys` (lines 338–375). Lost-race path polls for the winner's response with up to 3 retries.
  2. `clientOrderId` duplicate check (lines 377–388).
  3. **Customer name + phone validation for `takeaway`/`delivery`** (lines 392–406). Reads from `req.body.customerName`/`customerPhone`, falls back to parsing `Customer:` and `Phone:` substrings out of `orderData.notes`. Returns 400 if either is missing.
  4. Supervisor-override check for large discounts (lines 408–417).
  5. Server-side menu lookup, combo expansion, price resolution, server-side subtotal/tax/discount/service-charge/total recalc (lines 419–567). Trusts none of the client's monetary inputs.
  6. Outlet resolution (lines 569–577). Tries `orderData.outletId` → `user.outletId` → first outlet for the tenant.
  7. **Order row insert** at line **597** via `storage.createOrder(serverOrderData)`. Wrapped in a try/catch that catches Postgres unique-violation `23505` for duplicate `channel_order_id` and returns 409.
  8. **Atomic order-number generation** (lines 610–623). `SELECT COUNT(*) + 1` then `UPDATE orders SET order_number = ?`. Non-fatal failure logged.
  9. **Order-items insert loop** (lines 624–699). One `storage.createOrderItem(...)` per item, including combo expansion and prep-time snapshot.
  10. Combo order-count increment (lines 700–709).
  11. Table status update if `orderData.tableId` (lines 710–713).
  12. Audit log (line 715).
  13. Realtime emit `order:new` (line 769) + allergy alerts (lines 770–784).
  14. Auto-fire chef assignment + KDS arrival (lines 785–791).
  15. **Auto-create bill** for non-dine-in flows when `orderData.paymentMethod` is set (lines 792–815). The bill is `paymentStatus: "pending"` only — see BL-2 history.
  16. Idempotency response-body store (lines 819–824).
  17. `res.json(orderResponse)` at line 826.
- **What it does NOT do for delivery orders:** zero `delivery_orders` insert anywhere in the entire 518-line handler. Confirmed by grep for `deliveryOrders|delivery_orders|createDeliveryOrder` against `server/routers/orders.ts` → zero hits.
- **Transaction scoping.** Inserts are NOT wrapped in a single DB transaction. `storage.createOrder()`, the `UPDATE orders SET order_number`, the per-item `storage.createOrderItem(...)` loop, and `storage.createBill(...)` are independent awaits. A failure between order insert and item-loop completion leaves the order row in place with a partial item set (no compensating delete).

## delivery_orders schema

`shared/schema.ts:827-859`. Postgres table `delivery_orders`. 17 columns:

| Column | Type | Required | Default | FK |
|---|---|---|---|---|
| `id` | varchar(36) | PK NOT NULL | `gen_random_uuid()` | — |
| `tenant_id` | varchar(36) | NOT NULL | — | → `tenants.id` |
| `order_id` | varchar(36) | nullable | — | → `orders.id` |
| `customer_id` | varchar(36) | nullable | — | → `customers.id` |
| `customer_address` | text | **NOT NULL** | — | — |
| `customer_phone` | text | nullable | — | — |
| `delivery_partner` | text | nullable | — | — |
| `driver_name` | text | nullable | — | — |
| `driver_phone` | text | nullable | — | — |
| `status` | enum `delivery_status` | nullable | `'pending'` | — |
| `estimated_time` | integer | nullable | — | — |
| `actual_time` | integer | nullable | — | — |
| `delivery_fee` | decimal(10,2) | nullable | `'0'` | — |
| `tracking_notes` | text | nullable | — | — |
| `created_at` | timestamp | nullable | `now()` | — |
| `delivered_at` | timestamp | nullable | — | — |

Indexes (line 855–858): `(tenant_id, created_at)` and `(tenant_id, status)`.

PII fields (encrypted by storage layer): `customerPhone`, `customerAddress`. Defined as `DELIVERY_PII_FIELDS` at `server/storage.ts:32`. Encryption is automatic — `storage.createDeliveryOrder()` calls `encryptPiiFields(data, DELIVERY_PII_FIELDS)` at line 1374 before the insert. PR B does NOT need to encrypt manually; pass plaintext to `storage.createDeliveryOrder()` and the storage layer handles AES-256-GCM via `server/encryption.ts`.

`delivery_status` enum values (referenced at line 845; definition not read in this pass) — known values from the backfill script's STATUS_MAP: `pending`, `assigned`, `picked_up`, `cancelled`. The script's status-mapping table is the canonical reference for translating `orders.status` → `delivery_orders.status`.

## delivery-shaped order type values

The order_type universe is **inconsistent between Drizzle source and runtime DB**:

- **Drizzle enum source** (`shared/schema.ts:59-63`) declares **3 values only**: `dine_in`, `takeaway`, `delivery`.
- **Runtime DDL added on every boot** (`server/index.ts:451-453`) appends 3 more via `ALTER TYPE order_type ADD VALUE IF NOT EXISTS '...'`: `phone_delivery`, `online_delivery`, `third_party`.
- **Duplicate runtime DDL** (`server/admin-migrations.ts:4200-4202`) does the same thing.

So the live Postgres `order_type` enum has **6 values**. Drizzle types know about 3 of them. The remaining 3 are reachable only via raw SQL (`pool.query`) or `::text` casts — which is why the unified endpoint at `server/routers/delivery.ts:33` and the Drizzle-style use at `server/routers/orders.ts:187` both spell out the full IN list.

**Canonical "delivery-shaped" list (used in 3 production sites):** `'delivery'`, `'phone_delivery'`, `'online_delivery'`, `'third_party'`. All 4 should trigger PR B's auto-create.

References:
- `server/routers/orders.ts:187` — `inArray(ordersTable.orderType, ["delivery", "phone_delivery", "online_delivery", "third_party"])` (existing delivery-queue endpoint; demonstrates Drizzle accepts the values via type assertion / `inArray` even though the enum source declares only 3).
- `server/routers/delivery.ts:33` — same set inside the unified endpoint's IN clause.
- `scripts/backfill-delivery-orders-from-pos.ts:50` — same set in the backfill script.

This drift is tracked under "Order_type enum runtime migration → versioned `.sql` migration" in `audit/00-backlog.md` (Open / ANNOYING) — out of scope for PR B but means the PR B guard cannot rely on Drizzle's 3-value type alone; it must check against the explicit string list (`"delivery" | "phone_delivery" | "online_delivery" | "third_party"`) like the existing 3 sites above.

## Existing delivery_orders insert sites

Grep `db.insert(deliveryOrders)|createDeliveryOrder|storage\.createDeliveryOrder` across `server/`. **Four call sites:**

| File:line | Context | Encryption | Notes |
|---|---|---|---|
| `server/storage.ts:1373-1377` | `async createDeliveryOrder(data: InsertDeliveryOrder)` | `encryptPiiFields(data, DELIVERY_PII_FIELDS)` at line 1374 | The storage method itself. All callers below funnel through this. Returns the row decrypted. |
| `server/routers/service-coordination.ts:696-707` | Phone-orders endpoint, conditional on `orderType === "delivery" && deliveryAddress` | Via storage method | **Canonical pattern PR B should mirror.** Sets `tenantId`, `orderId`, `customerId`, `customerAddress`, `customerPhone`, `status: "pending"`, `estimatedTime: 45`, `trackingNotes: 'customerName:${customerName}'`. |
| `server/routers/delivery.ts:107-118` | `POST /api/delivery-orders` — manual create | Via storage method | Spreads entire `req.body` (with explicit `tenantId` override). Used for ad-hoc delivery-order creation outside the order flow. |
| `server/seed.ts:464, 479` | Seed-data fixtures | Via storage method | Test data only; runs at boot if seed gate matches. |

**No existing call site lives inside `server/routers/orders.ts`.** That is the gap PR B closes.

## Unified endpoint behavior

`server/routers/delivery.ts:14-82`. `GET /api/delivery-orders/unified`, `requireAuth`. Returns the kanban data the testers' Delivery & Online dashboard reads.

Two sources, joined client-side in JS (not SQL):

1. **`delivery_orders` table** (lines 21–24). `storage.getDeliveryOrdersByTenant(tenantId, {limit, offset})` returns up to `limit` rows scoped by `tenant_id`, plus a `count(*)` for total.
2. **`orders` table for delivery-shaped types** (lines 27–39). Raw `pool.query` selecting `id, tenant_id, order_number, customer_name, customer_phone, notes, status, order_type, created_at, total, outlet_id, channel_order_id` filtered by `order_type::text IN (...)` AND `status NOT IN ('paid','completed','voided')`. Source 2 rows are mapped to a synthetic `DeliveryOrder` shape with `id: 'order-' + o.id` (line 46) — this is the synthetic-ID branch the BL-3 verification testers hit when they clicked Assign Agent.

**Dedup logic (lines 70–72):**
```
const linkedOrderIds = new Set(deliveryData.filter(d => d.orderId).map(d => d.orderId));
const uniqueMainOrders = mainOrdersMapped.filter(m => !linkedOrderIds.has(m._sourceOrderId));
```
A `delivery_orders` row whose `orderId` matches an `orders.id` causes the synthetic version of that order to be dropped. **This is the load-bearing detail for PR B:** as soon as PR B inserts a `delivery_orders` row with `orderId = order.id`, the unified endpoint stops emitting the synthetic `order-<id>` shape for that order, and the front-end will render a single card per order with a real `id` — operations like Assign Agent will succeed because `getDeliveryOrderByTenant(id, tenantId)` will find the row.

**Response shape:** `{data: DeliveryOrder[], total: number, limit, offset, hasMore: boolean}`.

**Join key:** `delivery_orders.order_id = orders.id`. FK declared at `shared/schema.ts:836`.

## Test coverage gap

`tests/` directory listing:
- 12 unit/integration tests: aggregator-webhook-hmac, bill-recalc, circuit-breaker-auth, order-item-fields, storage-batch-1-menu-category, storage-batch-2-outlet-currency, tenant-assertion, tenant-patch-allowlist, unit. Plus a few others (websocket, etc.).
- 8 e2e specs: auth, billing, kitchen, menu, order-management, pos-checkout, staff, support.

Grep across `tests/` for `/api/orders|POST.*orders|delivery_orders|deliveryOrders` returns **zero matches**. Neither the unit tests nor the e2e specs assert on:
- POST /api/orders creating an order at all (likely covered indirectly by `pos-checkout.spec.ts` and `order-management.spec.ts`, but not as an explicit assertion against `/api/orders`).
- That a POS-Delivery order produces a `delivery_orders` companion row.
- That the unified endpoint returns the expected number of rows for a known fixture.

PR B cannot regress an existing assertion (because none exists) but should ideally land with one new test asserting: "create a delivery order via POST /api/orders → assert exactly one `delivery_orders` row exists with `orderId = response.id`". This is also the same assertion that would have caught the original bug.

The regression-test plan committed at `dd74bb7` (`docs/audits/regression-test-plan-step1.md`) does NOT mention BL-3 or this 404; it covers older F1–F13 fixes only.

## Open questions

- **QQ-1 — Source of `customerAddress`.** `delivery_orders.customer_address` is `NOT NULL`. The phone-orders endpoint receives `deliveryAddress` as a discrete request body field. The POS handler has **no equivalent input** today (this is bug **M5** in `docs/audits/bug-inventory.md`: "No delivery address field in POS UI — manual delivery orders have no address"). PR B has to pick a fallback. Options:
    - (a) Read `req.body.deliveryAddress` if present (forward-compatible with M5 when it ships) and fall back to a placeholder.
    - (b) Parse `Address: ...` substring from `orderData.notes` (mirrors the backfill script's regex at `scripts/backfill-delivery-orders-from-pos.ts:99` — but the recon at `audit/02-new-blockers-recon.md:1219-1228` already established the POS UI does not write `Address:` into notes, so this regex hits the fallback branch every time).
    - (c) Hard-code a placeholder like `'No address'` (the backfill script's actual fallback at `scripts/backfill-delivery-orders-from-pos.ts:99`, which is `encryptField(o.notes || "No address")`).
    - (d) Return 400 from POST /api/orders if `orderType` is delivery-shaped and no address is provided. Forces M5 to ship before PR B can be merged.
  - Each is a product call. (c) parallels the backfill script and produces consistent data state but is technically dishonest (the address is unknown, not absent). (a) + (c) hybrid is probably best: prefer real input, fall back to placeholder for parity with backfilled rows.
- **QQ-2 — Customer phone source.** `customer_phone` is nullable but the canonical pattern at service-coordination.ts:702 passes `customerPhone || null`. POST /api/orders already requires `customerPhone` for delivery (line 401–402, returns 400 if missing). So `orderCustomerPhone` is guaranteed truthy at the insertion point — pass it through. No fallback needed.
- **QQ-3 — `customerId` source.** `delivery_orders.customer_id` FKs `customers.id`, nullable. POST /api/orders does not have an established `customerId` resolution path (the takeaway/delivery branch only validates name+phone strings, doesn't look up or create a customer record). Mirror service-coordination.ts:700 which passes `customerId || null` — equivalent to passing `null` until a customer-lookup leg is added. No blocker.
- **QQ-4 — `trackingNotes` parity.** Service-coordination.ts:705 passes `trackingNotes: customerName ? 'customerName:${customerName}' : null`. The unified endpoint's `resolveCustomerName` at `client/src/pages/modules/delivery.tsx:58-73` parses this exact substring as a name-fallback. PR B should set the same string for consistency, even though `orders.customer_name` will also be populated for POS rows (and the dashboard prefers that). No blocker; minor consistency win.
- **QQ-5 — `estimatedTime`.** Service-coordination.ts passes `estimatedTime: 45` (minutes) as a hardcoded default. The `delivery_orders.estimated_time` column is nullable with no default. PR B can pass the same `45` for parity, or `null`. No blocker; product call.
- **QQ-6 — Transaction scoping.** Per the recon doc at `audit/02-new-blockers-recon.md:1432`, the open question is: should the new `createDeliveryOrder` insert be wrapped in a transaction with the `orders` insert so a failure of one rolls back the other? Today's handler does NOT wrap the existing `orders` + `order_items` + `bill` inserts in a single transaction — they are sequential awaits, each independent. Three options:
    - (a) Mirror existing fire-and-forget semantics: independent `await storage.createDeliveryOrder(...)` after order-items insertion, with try/catch around it that logs and continues (matching the fault tolerance of the auto-bill block at lines 794–814). A failure leaves an order without a delivery_orders row — same orphan state PR B is meant to prevent, except now logged.
    - (b) Hard-fail the request: throw on failure, return 500. Order is already inserted at this point so the client sees a 500 but the order row exists. Same partial-state risk as today's order/items split.
    - (c) Move ALL inserts into a single Drizzle transaction. Bigger refactor; out of scope for a "10–15 line" fix per the recon estimate.
  - Decision deferred. (a) preserves current semantics and produces predictable failure mode (logged, but recoverable by re-running the backfill script). The recon at line 1420 explicitly recommends matching "the same semantics as existing inserts" — i.e., (a).
- **QQ-7 — Insertion point.** Where in the 518-line handler does the new `await storage.createDeliveryOrder(...)` belong? Best location is **after the order-items insert loop completes (line 699) and before the table-status update at line 710**, so the delivery row is created after the order is fully formed but before realtime emits announce a new "delivery" order to the dashboard. Alternatively, place it next to the auto-bill block at line 792-815, mirroring its try/catch shape. The recon at line 1416 estimates "around line 700–900 territory" — both spots fit.

## Proposed implementation sketch

**One file changed:** `server/routers/orders.ts`. **Estimated diff: 12–15 lines added.**

Insert a new conditional block after the order-items loop (~line 699) and before the table-status update (~line 710), shaped to mirror `service-coordination.ts:696-707`:

```
if (<order.orderType is delivery-shaped>) {
  try {
    await storage.createDeliveryOrder({
      tenantId: user.tenantId,
      orderId: order.id,
      customerId: <null or resolved>,
      customerAddress: <QQ-1: resolved input or fallback>,
      customerPhone: orderCustomerPhone,            // already validated truthy at lines 401-402
      status: "pending",
      estimatedTime: 45,                             // QQ-5: parity with service-coordination
      trackingNotes: orderCustomerName               // QQ-4: parity
        ? `customerName:${orderCustomerName}`
        : null,
    });
  } catch (delErr) {
    console.error("[orders] delivery_orders auto-create failed (non-fatal):", delErr);
  }
}
```

**Where each field comes from:**
- `tenantId`: `user.tenantId` — same source the rest of the handler uses (line 332).
- `orderId`: `order.id` — set at line 597 from `storage.createOrder` return.
- `customerAddress`: requires QQ-1 resolution; provisionally `req.body.deliveryAddress || "No address"` to mirror the backfill script.
- `customerPhone`: `orderCustomerPhone` — populated at line 405 inside the takeaway/delivery validation block and guaranteed truthy at this point (else the handler would have returned 400 at line 402).
- `status`: literal `"pending"` — matches `delivery_status` enum default.
- `estimatedTime`, `trackingNotes`: parity with `service-coordination.ts:704-705`.
- `customerId`: `null` provisionally (QQ-3); a future PR can add a customer-lookup leg.

**Guard expression (delivery-shaped check).** Mirror the existing list at `orders.ts:187`:
```
const deliveryShaped = ["delivery", "phone_delivery", "online_delivery", "third_party"];
if (deliveryShaped.includes(order.orderType as string)) { ... }
```
Type assertion `as string` because Drizzle's order_type enum source only knows 3 values, but the live DB has 6 (see "delivery-shaped order type values" above).

**Encryption:** none in the router — `storage.createDeliveryOrder` already encrypts `customerPhone` and `customerAddress` automatically via `DELIVERY_PII_FIELDS` (`server/storage.ts:1374`). Pass plaintext.

**Failure semantics:** non-fatal try/catch matching the auto-bill block at `orders.ts:792-815`. A `delivery_orders` insert failure logs a `console.error` and lets the order succeed; the resulting orphan can be cleaned up by re-running PR A's backfill script. (Per QQ-6, this is the recommended approach — change later if product wants a stricter contract.)

**Side effect on the unified endpoint:** zero. Once the new row exists with `orderId = order.id`, the dedup at `server/routers/delivery.ts:71-72` drops the synthetic-ID version of the same order, and the dashboard renders one card with a real `delivery_orders.id`. Assign Agent / Mark Ready / Dispatch all work because `getDeliveryOrderByTenant(id, tenantId)` finds the row.

**Side effect on tests:** no existing test breaks (none exists). New test recommended: "POST /api/orders with `orderType: 'delivery'` produces a `delivery_orders` row with matching `orderId`."

**Out of scope for PR B (separately tracked):**
- M5 — POS UI delivery-address field (`docs/audits/bug-inventory.md` OPEN-MEDIUM). Affects QQ-1's quality but not PR B's correctness.
- Order_type enum runtime migration → versioned SQL (backlog OPEN-ANNOYING). Affects type safety of the guard but not runtime correctness.
- Transaction scoping rewrite (QQ-6, option c). Larger refactor.
- Aggregator webhook path (`server/routers/channels.ts:179-254`) — channel-orders also need delivery_orders rows but go through a different code path; if affected, that's a separate PR.
