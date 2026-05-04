# F-247 Phase 1 — Static investigation (2026-05-04)

Read-only investigation of the bill-view production failure: a 404
on `GET /api/restaurant-bills/by-order/:orderId` and a
`ReferenceError: qrDataUrl is not defined` on `/pos/bill/:orderId`.
Reproduces on dine-in card AND cash, both via direct navigation and
via "View Bill / Refund" from the orders modal.

> **Note on H1/H2/H3:** the prompt's Summary section asks which of
> H1/H2/H3 are confirmed/refuted/open, but no hypotheses were
> spelled out earlier in the prompt. Cannot evaluate against
> hypotheses that weren't provided. The Summary instead reports
> what the static evidence does and does not establish.

---

## 1. The bill VIEW page

### Finding

The route is wired at `client/src/App.tsx:573`:

```
<Route path="/pos/bill/:orderId">{() => <GuardedRoute path="/pos" component={BillViewPage} />}</Route>
```

The component is `client/src/pages/pos/bill-view.tsx` (101 lines).
On mount it fires **one** API call:

```
21:      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
```

That is, it fetches the order, not the bill. It does not call
`/api/restaurant-bills/by-order/...` itself.

The page then renders `<BillPreviewModal ... fullPage={true}>` with
the order data passed as props (`bill-view.tsx:81-97`). The bill
fetch and the `qrDataUrl` reference both live inside
`BillPreviewModal`, not in `bill-view.tsx`.

`bill-view.tsx` does **not** reference `qrDataUrl` at any line.

### Confidence: HIGH

Direct read of the entire 101-line file.

### Citation

- `client/src/App.tsx:573` — route registration.
- `client/src/pages/pos/bill-view.tsx:1-101` — component.
- `client/src/pages/pos/bill-view.tsx:18-26` — order fetch.
- `client/src/pages/pos/bill-view.tsx:81-97` — modal mount with
  `fullPage={true}`.

---

## 2. The `/api/restaurant-bills/by-order/:orderId` endpoint

### Finding

`server/routers/restaurant-billing.ts:198-209`:

```
198:  app.get("/api/restaurant-bills/by-order/:orderId", requireAuth, async (req, res) => {
199:    try {
200:      const user = req.user as any;
201:      const bill = await storage.getBillByOrder(req.params.orderId, user.tenantId);
202:      if (!bill) return res.status(404).json({ message: "No bill for this order" });
203:      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
204:      const payments = await storage.getBillPayments(bill.id);
205:      const order = bill.orderId ? await storage.getOrder(bill.orderId, user.tenantId) : undefined;
206:      const items = order ? await storage.getOrderItemsByOrder(order.id, user.tenantId) : [];
207:      res.json({ ...bill, payments, order, items, amountInWords: numWords(Number(bill.totalAmount)) });
208:    } catch (err: any) { res.status(500).json({ message: err.message }); }
209:  });
```

The lookup is `storage.getBillByOrder(orderId, tenantId)`,
implemented at `server/storage.ts:2694-2698`:

```
2694:  async getBillByOrder(orderId: string, tenantId: string): Promise<Bill | undefined> {
2695:    assertTenantId(tenantId, "getBillByOrder");
2696:    const [b] = await db.select().from(bills).where(and(eq(bills.orderId, orderId), eq(bills.tenantId, tenantId))).orderBy(desc(bills.createdAt));
2697:    return b;
2698:  }
```

**The filter is two conditions: `orderId` AND `tenantId`. There is
NO `paymentStatus` filter, NO `voidedAt` filter, NO `outletId`
filter.** The 404 fires if and only if there is **no row in `bills`
with that `(orderId, tenantId)` pair**.

### Confidence: HIGH

Direct read of both the route handler and the storage function.

### Verdict on the 404

The 404 is not a filter mistake. The 404 is correct given the
data: when it returns, no bill record exists for that order in
that tenant. The next section finds why.

### Citation

- `server/routers/restaurant-billing.ts:198-209`
- `server/storage.ts:2694-2698`

---

## 3. Bill record creation paths

There are exactly **two** places that INSERT into `bills`. A grep
on `storage.createBill\(|insert\(bills\)|createBill\(` returns:

```
server/storage.ts:572              createBill(data: InsertBill)  — interface decl
server/storage.ts:2655             async createBill(data)         — implementation
server/storage.ts:2657, 2671       db.insert(bills).values(...)   — two internal branches (one with billNumber tx)
server/routers/orders.ts:829       storage.createBill({...})       — auto-bill on order creation
server/routers/restaurant-billing.ts:328   storage.createBill({...}) — manual bill creation via POST /api/restaurant-bills
```

So two callers: the `POST /api/orders` auto-bill path, and the
`POST /api/restaurant-bills` manual path.

### Path A — auto-bill on order creation (orders.ts)

`server/routers/orders.ts:823-846`:

```
823:      // FIX 2: Auto-create bill for takeaway/delivery when paymentMethod is provided
824:      let autoBill = null;
825:      if (orderData.paymentMethod && order.status === "new") {
826:        try {
827:          const existingBill = await storage.getBillByOrder(order.id, user.tenantId);
828:          if (!existingBill) {
829:            autoBill = await storage.createBill({ ... paymentStatus: "pending", ... });
830-841:        }
842:        } catch (billErr) {
843:          console.error("[orders] auto-bill creation failed (non-fatal):", billErr);
844:        }
845:      }
```

The guard at L825 is `paymentMethod && order.status === "new"`.

The order's `status` value is set client-side in
`client/src/pages/modules/pos.tsx:1232`:

```
1232:      status: tabIsDineIn ? "in_progress" : "new",
```

**Dine-in orders start at `status = "in_progress"`** (so they
appear directly on KDS) **and therefore SKIP the auto-bill
branch**. Takeaway and delivery orders start at `status = "new"`,
which does enter the branch (and FIX 2's commit message confirms
this is intentional — see Section 6).

### Path B — manual bill via POST /api/restaurant-bills

`server/routers/restaurant-billing.ts:211-355`. Validates the
referenced order exists, checks for an existing bill (returns it
with `alreadyExists: true` if found), recomputes monetary fields
server-side, then `storage.createBill(...)` at L328.

This is the path `BillPreviewModal` uses for both takeaway and
dine-in. The client triggers it through `createBillMutation`:

- `client/src/components/pos/BillPreviewModal.tsx:528-558` — the
  mutation definition: `apiRequest("POST", "/api/restaurant-bills", {...})`.
- `client/src/components/pos/BillPreviewModal.tsx:451` — fired when
  the bill modal is opened via the regular POS payment flow.
- `client/src/components/pos/BillPreviewModal.tsx:448-453` — fired
  on mount when `fullPage` is true (i.e. when the bill view page
  loads), if `existingBillStatus === "success" && !existingBillData`.

So `bill-view.tsx` rendering `BillPreviewModal` with
`fullPage={true}` is meant to lazily auto-create the bill for any
order that doesn't yet have one. This works in principle — but
only if the modal renders successfully (see Section 4).

### Path C — there is no payment-time bill creator

The payment endpoint `POST /api/restaurant-bills/:id/payments`
(`server/routers/restaurant-billing.ts:387-1156`) requires the
bill to already exist (`if (!bill) return 404`, L396). It does
not create a bill. It records payments and flips
`paymentStatus` on an existing bill row.

### Path D — order PATCH "mark paid" does NOT create a bill

`server/routers/orders.ts:1133-1142`:

```
1133:    if (req.body.status === "paid" && existing.status !== "paid" && existing.tableId) {
1134:      await storage.updateTable(existing.tableId, user.tenantId, { status: "free" });
1135:      emitToTenant(user.tenantId, "table:updated", { tableId: existing.tableId, status: "free" });
1136:      returnResourcesFromTable(existing.tableId, user.tenantId, false).catch(() => {});
1137:    }
```

A `PATCH /api/orders/:id` with `status: "paid"` flips the table to
free but **does not create a bill row**. The client surfaces this
"Mark Paid" shortcut at
`client/src/pages/modules/orders-hub.tsx:603`:

```
603:  ...status === "served" && <Button ... onClick={() => updateOrderStatus.mutate({ id: selectedOrder.id, status: "paid" })}...>
```

This is a bypass path: an order can complete (`status="paid"`,
table freed) without going through the bill flow. Subsequent
attempts to view the bill at `/pos/bill/:orderId` will 404 forever
because no bill row exists and Path B requires the modal to
auto-create one — which depends on Section 4.

### Confidence: HIGH

Read of every call site to `storage.createBill` and a grep over
`status === "paid"` on the client.

### Citation

- `server/routers/orders.ts:823-846, 1133-1142`
- `server/routers/restaurant-billing.ts:211-355, 387-1156`
- `server/storage.ts:572, 2655-2680`
- `client/src/pages/modules/pos.tsx:1232`
- `client/src/components/pos/BillPreviewModal.tsx:448-453, 528-558`
- `client/src/pages/modules/orders-hub.tsx:603`

---

## 4. The `qrDataUrl` variable origin

### Finding

`qrDataUrl` is **declared inside the `handlePrint` `useCallback`**
at `client/src/components/pos/BillPreviewModal.tsx:734`:

```
723:  const handlePrint = useCallback(async () => {
...
728:    const digitalReceiptUrl = createdBill?.id
729:      ? `${window.location.origin}/receipt/${createdBill.id}`
730:      : null;
...
732:    // O7: Pre-generate QR code as data URL so it is available in print contexts
733:    // (external API fetches fail or load too late during printing)
734:    let qrDataUrl: string | null = null;
735:    if (digitalReceiptUrl) {
736:      try {
737:        qrDataUrl = await QRCode.toDataURL(digitalReceiptUrl, ...);
738:      } catch (_) {}
739:    }
```

It is a function-local `let` declared inside the callback at L723.
Scope ends at the callback's closing `}` (around L862, before the
deps array).

But the same name is referenced **at the component-body JSX level**
at L2150 and L2153:

```
2150:              {qrDataUrl && (
2151:                <div className="flex flex-col items-center gap-1 py-2 border rounded-lg bg-muted/30"
2152:                  data-testid="qr-receipt-display">
2153:                  <img src={qrDataUrl} alt="Scan for digital receipt" width={96} height={96} />
2154:                  <p className="text-xs text-muted-foreground">Scan for digital receipt</p>
2155:                  <button className="text-xs text-primary underline"
2156:                    onClick={() => navigator.clipboard.writeText(digitalReceiptUrl || "")}>
2157:                    Copy link
2158:                  </button>
2159:                </div>
2160:              )}
```

`digitalReceiptUrl` (also declared inside `handlePrint` at L728)
is referenced at the same JSX scope at L2156.

**Neither name has a binding at the JSX scope.** A grep across the
entire file confirms `qrDataUrl` and `digitalReceiptUrl` are
declared exactly once each, both inside `handlePrint`. There is no
`const qrDataUrl =`, `let qrDataUrl =`, or `useState<...>` for
either name at the component body level.

When the JSX at L2150 evaluates `qrDataUrl` during a render that
reaches that branch, the JavaScript engine looks up the name in
enclosing scopes, finds no binding, and throws `ReferenceError:
qrDataUrl is not defined`. This is exactly the production error.

### Was this recently introduced?

`git log --oneline -20 -- client/src/components/pos/BillPreviewModal.tsx`:

```
20aa50b feat(pos): email receipt SMTP + QR receipt display in payment confirmation [POS-EMAIL-QR]
44914f9 fix: P2 Batch B — Fix 4 Billing & QR Bugs (O6, O7, O8, O10)
```

Commit `20aa50b` (2026-04-11) added the L2150 JSX block. The diff
on that commit shows the exact block being inserted into the
button row (`git show 20aa50b -- client/src/components/pos/BillPreviewModal.tsx`).
The introducing PR description: "feat(pos): email receipt SMTP +
QR receipt display in payment confirmation [POS-EMAIL-QR]".

The `handlePrint`-local `qrDataUrl` was added in `44914f9`
(commits earlier) as part of "Fix 4 Billing & QR Bugs (O6, O7,
O8, O10)" — see the comment `// O7: Pre-generate QR code` at
L732. So the function-scoped `qrDataUrl` predates the JSX
reference; commit `20aa50b` added a JSX usage that erroneously
assumed component-body scope.

This bug has been in the code since 2026-04-11. It manifests only
when the JSX block at L2150 is rendered, which depends on the
component flow.

### Confidence: HIGH

Grep returned every reference to `qrDataUrl` in
`client/src` — only the five lines at 422, 434, 496, 497 (in
`print-utils.ts`, a typed parameter) and 734, 737, 801, 2150, 2153
(in `BillPreviewModal.tsx`). The function declaration vs JSX usage
mismatch is unambiguous on direct read.

### Citation

- `client/src/components/pos/BillPreviewModal.tsx:723-739, 2150-2160`
- `git show 20aa50b -- client/src/components/pos/BillPreviewModal.tsx`

---

## 5. Bills schema

### Finding

`shared/schema.ts:2874-2943`. Mirrored in
`migrations/0000_quick_bloodstrike.sql` as the `bills` table.

| Column          | Type                | NOT NULL | FK / default              |
|-----------------|---------------------|----------|---------------------------|
| `id`            | varchar(36) PK      | yes      | `gen_random_uuid()`       |
| `tenant_id`     | varchar(36)         | **yes**  | FK → `tenants.id`         |
| `outlet_id`     | varchar(36)         | no       | FK → `outlets.id`         |
| `bill_number`   | varchar(50)         | **yes**  |                           |
| `order_id`      | varchar(36)         | **yes**  | FK → `orders.id`          |
| `table_id`      | varchar(36)         | no       | FK → `tables.id`          |
| `customer_id`   | varchar(36)         | no       | (no FK declared in Drizzle) |
| `waiter_id`     | varchar(36)         | no       | FK → `users.id`           |
| `total_amount`  | decimal(10,2)       | **yes**  |                           |
| `payment_status`| text                | no       | default `'pending'`       |
| `paid_at`       | timestamp           | no       |                           |
| (other money/tax/packing fields, all defaulted)         |                           |

Indexes (`shared/schema.ts:2933-2942`):

- `idx_bills_tenant_id` on `(tenant_id)` — non-unique
- `idx_bills_order_id` on `(order_id)` — **non-unique**
- `idx_bills_tenant_created` on `(tenant_id, created_at)` —
  non-unique
- `idx_bills_tenant_status` on `(tenant_id, payment_status)` —
  non-unique
- `idx_bills_tenant_invoice_number_unique` UNIQUE on
  `(tenant_id, invoice_number)` — only constraint, only relevant
  to GST tenants where `invoice_number` is set

**One bill per order is NOT enforced at the schema layer.** The
schema permits multiple bill rows with the same `order_id`. The
"one bill per order" invariant is enforced only by code
convention: the `existing = getBillByOrder(...)` check at
`server/routers/restaurant-billing.ts:219-220` returns the
existing bill before INSERT, and `getBillByOrder` reads the most
recent by `created_at desc` (`server/storage.ts:2696`). Under
race or partial failure, duplicates could form.

### Confidence: HIGH

Direct read of the Drizzle definition and grep over UNIQUE
constraints in the migration file.

### Citation

- `shared/schema.ts:2874-2943`
- `migrations/0000_quick_bloodstrike.sql` — bills table block
- `server/storage.ts:2694-2698` — `getBillByOrder`

---

## 6. Recent history of bill creation logic

### Finding

`git log --oneline -20` on the two relevant files.

#### `server/routers/orders.ts` (auto-bill site)

The auto-bill block at L823-846 was added in commit
**`f0a5aac`** (2026-04-17):

```
f0a5aac fix: void request persistence, auto-create bill on takeaway settlement, order number generation
```

Commit body (verbatim, abridged):

> FIX 2: Auto-create bill for takeaway/delivery — when POST
> /api/orders receives paymentMethod and order status is "new",
> automatically creates a bill record with paymentStatus="pending"
> via storage.createBill(). Prevents orphaned orders without
> bills when user skips BillPreviewModal.

This commit message confirms the **intentional scope** of FIX 2:
takeaway/delivery only. Dine-in is **deliberately excluded**
(its initial status is `"in_progress"`, not `"new"`). The
designer-intent was that dine-in would always go through the
explicit bill flow (`POST /api/restaurant-bills` from
BillPreviewModal). What designer-intent did NOT cover is the
"Mark Paid" shortcut at `client/src/pages/modules/orders-hub.tsx:603`
that PATCHes `status: "paid"` directly without ever opening the
bill modal — this leaves dine-in orders without any bill row.

No subsequent commit on `orders.ts` has touched the auto-bill
block. It is unchanged since 2026-04-17.

#### `server/routers/restaurant-billing.ts`

Recent commits touching this file:

```
3e54dd2 fix(X-02): pass tenantId to getOrderItemsByOrder in bill creation
6432e19 fix: money integrity — tip payout idempotency, void guard against existing payments
769de46 fix: resolve 6 critical POS bugs (KOT, table transfer, receipt crash, recall, split, covers)
b5c4aed Merge fix/F-121-bill-recalc into main
1c585d2 refactor(storage): Batch 4 enforce tenantId on bill & payment functions
9d4cfc9 refactor(storage): Batch 3 enforce tenantId on order core functions
940299c fix(api): F-121 server-side bill total recalculation from order items
ce27769 fix(currency): fix hardcoded AED in ModifierDialog, POS tender, cash denominations, server fallbacks [CURRENCY-FIX]
20aa50b feat(pos): email receipt SMTP + QR receipt display in payment confirmation [POS-EMAIL-QR]
8d973ff fix(tips): add GET and PATCH /api/tip-settings endpoints [TIP-ENDPOINT]
```

Notable: the same `20aa50b` commit that introduced the JSX
`qrDataUrl` reference in BillPreviewModal also touched
`server/routers/restaurant-billing.ts` (37 insertions per
`git show --stat 20aa50b`). That side of the change adds the
email-receipt POST endpoint; it does not affect the bill lookup
predicate at `:198-209`.

### Confidence: HIGH

Direct git log read; commit body verbatim from `git show f0a5aac`.

### Citation

- `f0a5aac` — auto-bill commit (2026-04-17).
- `20aa50b` — QR display commit (2026-04-11), introduces the bug.
- `server/routers/orders.ts:823-846` — unchanged since `f0a5aac`.

---

## Summary

### Where does the 404 come from?

The 404 means **no row exists in `bills` for the given
`(order_id, tenant_id)`**. The lookup at
`server/routers/restaurant-billing.ts:201` filters by `orderId
AND tenantId` only — there is no status/payment filter to "miss"
a row.

Why no bill row exists for a completed dine-in order:

1. **Auto-bill in `POST /api/orders` (orders.ts:825) is gated on
   `order.status === "new"`**, which excludes dine-in (which
   starts at `"in_progress"`). Intentional per FIX 2 commit
   `f0a5aac`.
2. **Dine-in orders rely on `BillPreviewModal` to call
   `POST /api/restaurant-bills`** explicitly. That modal is
   normally opened during the POS payment flow and works fine
   when not crashing (Section 3 Path B).
3. **The "Mark Paid" shortcut at orders-hub.tsx:603** completes
   the order via `PATCH /api/orders/:id` with `status: "paid"`,
   freeing the table without ever creating a bill (Section 3
   Path D). After this shortcut, viewing `/pos/bill/:orderId`
   has no bill row to find.
4. **`bill-view.tsx` mounting `BillPreviewModal` with
   `fullPage={true}`** is the recovery path: the modal's
   `useEffect` at `BillPreviewModal.tsx:448-453` is supposed to
   auto-fire `createBillMutation` when the GET returns null. But
   that effect runs AFTER React commits the render — and the
   render itself crashes on the `qrDataUrl` ReferenceError before
   commit. So the recovery path never executes.

The 404 is therefore a symptom of two problems compounding: (a)
no bill is ever created via the PATCH-paid shortcut, and (b) the
designed lazy-fix in `bill-view.tsx` cannot fire because the
modal renders crash.

### Where does the `qrDataUrl` error come from?

`client/src/components/pos/BillPreviewModal.tsx:2150` (and L2153):

```
2150:              {qrDataUrl && (
2151:                <div ... data-testid="qr-receipt-display">
2152:                  <img src={qrDataUrl} ... />
```

`qrDataUrl` and `digitalReceiptUrl` (referenced at L2156) are
**declared as function-local variables inside the `handlePrint`
useCallback** at L723-739, not at component-body scope. The JSX
at L2150 evaluates them in component-body scope, where no binding
exists, throwing `ReferenceError`. Introduced 2026-04-11 in
commit `20aa50b`.

### Are the two errors related?

**Yes — same root cause is the design of the bill view page.** The
404 is "expected and normally recoverable" *only because* the
modal is supposed to render and auto-create the bill via its
useEffect. The `qrDataUrl` ReferenceError prevents that render,
which prevents the recovery, which converts a transient 404 into a
permanent one for orders without pre-existing bills.

If the `qrDataUrl` bug is fixed in isolation, the 404 self-heals
on the next render via the L448 useEffect — assuming the order
has order_items (the manual-bill endpoint at
`server/routers/restaurant-billing.ts:225-227` rejects orders
with no items).

If the bill-creation gating is fixed in isolation (e.g. extending
auto-bill to dine-in or making PATCH-paid create a bill), the
`qrDataUrl` ReferenceError still fires whenever the bill view
page renders the action-button section, breaking the page's UI
even when the bill exists.

Both must be fixed for `/pos/bill/:orderId` to work reliably.

### Hypotheses (H1/H2/H3)

The prompt's Summary asks which of H1/H2/H3 are
confirmed/refuted/open, but the prompt body did not list the
hypotheses. Cannot evaluate. If the operator can supply the
hypotheses they had in mind, this section can be filled in; the
findings above stand on their own evidence regardless.

### Open questions for production data recon

These cannot be answered from static analysis; a TablePlus
read-only script would resolve them.

1. **How many `orders` rows are in a terminal-paid state with no
   matching `bills` row?**
   ```
   SELECT o.id, o.tenant_id, o.status, o.created_at
     FROM orders o
     LEFT JOIN bills b ON b.order_id = o.id AND b.tenant_id = o.tenant_id
    WHERE o.status IN ('paid', 'completed')
      AND b.id IS NULL
    ORDER BY o.created_at DESC
    LIMIT 100;
   ```
   Tells us how many orders are silently in the "no-bill" state
   the testers are hitting. Distinguishes between "Mark Paid
   shortcut was used" and "BillPreviewModal flow ran but failed".
2. **Per-tenant breakdown of the same query**, to see whether
   this is concentrated on the busiest pre-launch test tenant
   (likely the same one Phase 2 of F-234 cleaned up).
3. **Sample rows from the no-bill cohort**: do they have
   payment_method set on the `orders` row, or is it null? If set,
   it implies the PATCH-paid shortcut path; if null, it implies
   a different completion route.
4. **Confirm bills schema in production** matches Drizzle —
   specifically that no UNIQUE on `(order_id)` exists. If it does,
   the auto-create useEffect could 23505 on race; if it doesn't,
   duplicates are theoretically possible.
5. **What proportion of orders coming through `/pos/bill/:orderId`
   actually need the `qrDataUrl` to render?** The L2150 `&&` guard
   means the JSX only attempts to read `qrDataUrl` when the
   variable is truthy (in component scope: undefined, which is
   falsy in TypeScript but `qrDataUrl` is *not declared* — that's
   a ReferenceError at lookup time, not a falsy short-circuit).
   So the guard does not help. Confirms via static analysis only;
   no production data needed.

### Incidental findings

- **Schema gap (already noted in F-234 Phase 1 work):**
  `idx_bills_order_id` is non-unique. A partial unique index on
  `(tenant_id, order_id)` for non-voided rows would be a
  defensive upgrade; out of scope for F-247 fix but worth filing.
- **`server/routers/restaurant-billing.ts:226-227`** rejects bill
  creation for orders with no items. If a dine-in order ever
  reaches `/pos/bill/:orderId` with zero items (race during item
  removal?), the auto-create useEffect would fail and the page
  would 404 forever even if `qrDataUrl` is fixed. Edge case.
- **`server/routers/orders.ts:1133` (PATCH-paid)** does not emit
  any audit-log entry for the implicit "no-bill" completion. This
  is a finance/audit gap — bills are revenue-of-record, and an
  order completing without a bill is essentially an off-record
  transaction. Worth filing separately.
