# F-286 Phase 1 — Static Investigation
## orders.payment_status / bills.payment_status desync

**Date:** 2026-05-11
**Branch:** audit/f286-phase1-static-investigation-2026-05-11
**Scope:** read-only investigation of `server/routers/restaurant-billing.ts` bill-completion paths and the orders/bills schema. No code changes in this phase.
**F-286 source row:** `audit/00-backlog.md:75` — added in PR #37 (2026-05-10) from yesterday's tampered-orders recon SQL.

---

## §1 — Summary

F-286 is a desync between `bills.payment_status` and `orders.payment_status` (and the parallel `paid_at` columns). Yesterday's recon (`audit/tampered-orders-recon-2026-05-10.sql`) found 100% desync across 3 bills inspected: bills correctly marked paid, linked orders left at `payment_status='pending'` / `paid_at=NULL`. Phase 1 verified the bug at the code level. Severity reconfirmed at **HIGH (BLOCKING — money reporting integrity AND runtime correctness in `table-requests.ts`)**. Scope expanded from yesterday's "1-line fix" framing to a class-of-sites bug: every bill-state-flip site in `restaurant-billing.ts` writes `bills.payment_status` but omits the parallel write on the linked order. The bill-completion flow sets `orders.status="completed"` (not `"paid"`), which never triggers the only existing `orders.payment_status` write path in `service-coordination.ts:100`.

---

## §2 — Schema verification [VERIFIED]

Both columns asserted by the F-286 backlog entry exist on the orders table:

| Column | File:line | Type | Default |
|--------|-----------|------|---------|
| `orders.paid_at` | `shared/schema.ts:452` | `timestamp` with timezone | nullable |
| `orders.payment_status` | `shared/schema.ts:453` | `varchar(20)` | `"pending"` |
| `bills.payment_status` | `shared/schema.ts:2906` | `text` | `"pending"` |
| `bills.paid_at` | `shared/schema.ts:2931` | `timestamp` (no timezone) | nullable |

**Type-mismatch fingerprint of separate evolution:**
- `payment_status` is `varchar(20)` on orders vs `text` on bills
- `paid_at` is timestamptz on orders vs timestamp on bills

Same logical concepts, different storage. Strong signal that the two columns were added at different times by different code paths, with no review for symmetry.

**Index asymmetry:** `bills` has `idx_bills_tenant_status` on `(tenant_id, payment_status)` (`shared/schema.ts:2937`). The orders table has indexes on `(tenant_id)`, `(tenant_id, created_at)`, `(tenant_id, status)`, `(tenant_id, table_id)` (`shared/schema.ts:501-504`) — **NO index on `payment_status`**. This is consistent with `orders.payment_status` being treated as second-class: not optimized for query, not referenced by readers — yet readers in `table-requests.ts` DO filter on it (see §5).

The migration that added `orders.payment_status` is at `server/admin-migrations.ts:821`:
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status varchar(20) DEFAULT 'pending'
```

---

## §3 — Write-path map [VERIFIED]

All 5 sites that flip `bills.payment_status` in `server/routers/restaurant-billing.ts`:

| # | Site (line) | Trigger | bills write | Parallel orders update | What's missing |
|---|------------|---------|-------------|------------------------|----------------|
| 1 | line 587, 594 | Cash payment success (`POST /api/restaurant-bills/:id/payments`) | `paymentStatus: newStatus` + `paidAt` (line 587-589) | `storage.updateOrder(... { status: "completed", paymentMethod })` (line 594) | `orders.payment_status` not set; `orders.paid_at` not set |
| 2 | line 62, 76 | `finalizeBillCompletion()` — Razorpay webhook AND polling (line 1211) | `paymentStatus: "paid", paidAt: new Date()` (line 62) | `storage.updateOrder(... { status: "completed", paymentMethod })` (line 76) | Same as #1 — `orders.payment_status` and `orders.paid_at` not set |
| 3 | line 762, 769 | Bill void (`POST /api/restaurant-bills/:id/void`) | `paymentStatus: "voided", voidReason, voidedAt, voidedBy` (line 762) | `storage.updateOrder(... { status: "voided" })` (line 769) | `orders.payment_status` left at default `"pending"` — no parallel "voided" mirror |
| 4 | line 921 | Refund (`POST /api/restaurant-bills/:id/refund`) | `paymentStatus: newPaymentStatus` ("refunded" or "partially_refunded") | **NONE** | No `storage.updateOrder()` call exists in the refund block at all |
| 5 | line 1179 | Razorpay gateway-down fallback | `paymentStatus: "pending_gateway_reconciliation"` | None | N/A — transient state during gateway recovery; no order change appropriate at this point |

**Sites #1, #2, #3 share identical structure:** correct `bills` write, partial `orders` write that touches `status` but never `payment_status` or `paid_at`. **Site #4 has no order write at all.** Site #5 is the only one where the omission is intentional.

The Razorpay polling endpoint at `server/routers/restaurant-billing.ts:1187-1227` calls `finalizeBillCompletion(...)` at line 1211 — inherits #2's bug.

---

## §4 — Where `orders.payment_status` IS written [VERIFIED]

Server-wide grep for `paymentStatus` and `payment_status` writes:

**1. `server/routers/service-coordination.ts:97-106` — production write site.**
```typescript
if (status === "paid") {
  setClauses.push(`paid_at = $${values.length + 1}`);
  values.push(now);
  setClauses.push(`payment_status = $${values.length + 1}`);
  values.push("paid");
}
// ...
const { rows } = await pool.query(
  `UPDATE orders SET ${setClauses.join(", ")} WHERE id = $${values.length - 1} AND tenant_id = $${values.length} RETURNING *`,
  values
);
```
This writes `orders.paid_at = NOW()` AND `orders.payment_status = 'paid'` — but **only when the request payload has `status === "paid"`**. Triggered via the service-coordination endpoint(s) in this file, NOT by bill-completion flows.

**2. `server/seed.ts:2044, 2047, 2050` — dev seed only.**
Three calls to `makeOrder({ ... paymentStatus: "paid", paidAt: new Date(...) })` for fixture orders. Not invoked at runtime.

**Conclusion: `orders.payment_status` is NOT a dead column.** It IS written by status-flip-to-`"paid"` paths through `service-coordination.ts`. But the bill-completion flow at `restaurant-billing.ts:594` and `:76` sets `orders.status="completed"` (not `"paid"`). The "completed" → "paid" status transition is never made by the bill-completion paths, so the parallel `payment_status` update never fires.

This is the root cause of the recon's 100% desync rate: bills are correctly marked paid, orders correctly transition to "completed" — but the orders' own payment fields are stranded at their migration defaults forever.

---

## §5 — Read paths and blast radius [VERIFIED]

**Three predicates in `server/routers/table-requests.ts` filter or check by `orders.payment_status`. All three silently misclassify paid orders.**

| Line | Predicate | Effect when status='completed' AND payment_status='pending' |
|------|-----------|--------------------------------------------------------------|
| 168 | `WHERE id = ANY($1::text[]) AND status != 'paid' AND payment_status != 'paid'` | Both clauses TRUE — order treated as **active** in cleanup logic |
| 334 | `const isActive = order && order.status !== "paid" && order.payment_status !== "paid";` | Both clauses TRUE — `isActive=true` for paid orders |
| 377 | `if (order.payment_status === "paid" \|\| order.status === "paid") { ... }` | Status="completed" doesn't match "paid"; payment_status="pending" doesn't match — branch SKIPPED for paid orders |

Effect: any logic in `table-requests.ts` that depends on detecting paid orders via these predicates will treat actually-paid orders as still active. Concrete consequences depend on the surrounding handlers (table availability, request routing, cleanup decisions) — Phase 1 did not trace each handler's downstream behavior.

**Note on `server/routers/ticket-history.ts:309`** — reads `b.payment_status AS "paymentStatus"` (alias on the bills join). Reads `bills.payment_status`, not `orders.payment_status`. **Unaffected** by F-286.

**[HYPOTHESIS — Phase 2 should grep]**

Beyond `table-requests.ts`, the F-286 backlog entry calls out cash float reconciliation, daily revenue reports, and tax calculations as silently affected. Phase 1 did not enumerate these read sites. A Phase 2 grep across `server/` and `client/src/` for queries filtering orders by `payment_status` (or any `getOrders…` storage helper that includes a `payment_status` predicate) is needed to size the blast radius accurately for the severity argument.

---

## §6 — Severity reassessment [VERIFIED]

**HIGH (BLOCKING) reaffirmed.**

Yesterday's backlog entry framed F-286 purely as a money-reporting-integrity bug: any reporting query that filters orders by payment_status will under-report paid orders by 100%, breaking cash float reconciliation, daily revenue, and tax calculations.

Phase 1 finding adds a second axis: **runtime correctness in `table-requests.ts`**. Three read predicates silently misclassify paid orders as active. This is not a reporting issue — it's live UI/workflow logic.

Both effects compound. Severity stands.

---

## §7 — Fix options

### Path A — point-fix at every bill-state-flip site

Five concrete edits in `server/routers/restaurant-billing.ts`:

| Site | Edit |
|------|------|
| Line 76 (finalizeBillCompletion) | Add `paymentStatus: "paid", paidAt: new Date()` to the `storage.updateOrder` call |
| Line 594 (cash payment) | Same: add `paymentStatus: "paid", paidAt: new Date()` |
| Line 769 (void) | Add `paymentStatus: "voided"` to the `storage.updateOrder` call (subject to Q-286-Q2) |
| Line 921 (refund) | Add a NEW `storage.updateOrder` call setting `paymentStatus: newPaymentStatus` (subject to Q-286-Q3) |
| Line 1179 (gateway-down) | No change — transient state, no order update appropriate |

Estimated 4-8 lines across 4 sites in 1 file. Conservative. Does not resolve the deeper `orders.status="completed"` vs `orders.payment_status="paid"` semantic ambiguity but synchronizes the two columns where their ground-truth is unambiguous.

### Path B — column collapse

`orders.status` and `orders.payment_status` carry overlapping semantics. The bill-completion path uses `"completed"` on `status` while every other consumer (table-requests.ts, the migration default, the service-coordination handler) uses `"paid"` on either column. The cleaner fix is to audit which column downstream readers actually rely on, then either delete `orders.payment_status` or unify the value space ("completed" vs "paid").

**Out of scope for F-286.** Path B requires its own static-investigation phase. Phase 1 does NOT recommend Path B as the F-286 fix. Track as a separate finding for a future investigation.

---

## §8 — Open questions

| ID | Question | Why it matters | How to resolve |
|----|----------|----------------|----------------|
| Q-286-Q1 | Confirm Path A is the correct F-286 fix. Path B is acknowledged but not in scope. | Phase 2 cannot start until path is locked. Path A gives a 4-8 line fix; Path B is a much larger investigation. | Stakeholder decision. |
| Q-286-Q2 | At the void site (`restaurant-billing.ts:769`), `bills.payment_status` flips to `"voided"`. Should `orders.payment_status` also flip to `"voided"`? Or is `"voided"` only meaningful at the bill level? | Determines exact text of the line 769 edit in Path A. | Product call. |
| Q-286-Q3 | The refund site (`restaurant-billing.ts:921`) currently doesn't update the linked order at all. Should it? At minimum: should `orders.payment_status` reflect `"refunded"` or `"partially_refunded"` after a refund? | Determines whether Path A adds a NEW `storage.updateOrder` call at line 921 or leaves the order untouched. | Product call. |
| Q-286-Q4 | The orders.ts `PATCH /api/orders/:id` endpoint (mentioned in F-247 §3.1 Path D as a "Mark Paid" shortcut) — does it also write `orders.payment_status`, or only `orders.status`? | Affects Phase 2 fix scope: if PATCH-paid does write `payment_status`, the desync only fires through bill-completion paths; if it doesn't, there's a third write-gap site to fix. | 60-second grep before Phase 2 starts. |
| Q-286-Q5 | Enumerate all reporting queries that filter orders by `payment_status`. | Phase 1 did not grep for this. Needed to size the blast radius accurately for the severity argument and to verify the F-286 backlog entry's claim that reports under-report paid orders by 100%. | Phase 2 should answer via grep across `server/` and `client/src/` for `payment_status` reads on the orders table. |

---

## §9 — Phase 2 recommendation

Phase 2 should NOT begin until:
- **Q-286-Q1** locked (Path A confirmed as the fix)
- **Q-286-Q2** locked (void semantics on `orders.payment_status`)
- **Q-286-Q3** locked (refund semantics on the order — update or leave alone)

After locking these, the implementation is ~4-8 lines across 4 sites in `server/routers/restaurant-billing.ts`. Estimated effort: 30-60 minutes of code edits plus ~30 minutes of regression test work.

**Required regression test:** create a bill, pay it via the cash-payment path (`POST /api/restaurant-bills/:id/payments`), then assert the linked order has `payment_status="paid"` and `paid_at` populated. Mirror tests for the Razorpay-finalize path, the void path, and the refund path (per Q-286-Q2 and Q-286-Q3 outcomes).

---

## Appendix — files read in Phase 1

| File | Lines read | Purpose |
|------|------------|---------|
| `audit/00-backlog.md` | 75 (F-286 entry) | Source row for this investigation |
| `audit/02-data-flows/payment.md` | 1-150 (full) | Payment flow narrative + sequence diagram + tenant_id checks |
| `audit/f247-phase1-static-investigation-2026-05-04.md` | 1-605 (full) | Earlier bill-creation investigation; documents Path D "Mark Paid" shortcut |
| `audit/tampered-orders-recon-2026-05-10.sql` | 1-170 (full) | Yesterday's recon — F-286 source data |
| `shared/schema.ts` | 426-505 (orders), 2874-2945 (bills), spot-checks at 4525-4549 and 5735-5754 | Orders/bills/other tables column verification |
| `server/routers/restaurant-billing.ts` | 50-110 (finalizeBillCompletion), 373-700 (cash payment block), 750-820 (void), 910-980 (refund), 1170-1230 (gateway-down + polling) | All 5 bill-state-flip sites |
| `server/routers/service-coordination.ts` | 80-130 | The only production `orders.payment_status` write site |

Greps performed:
- `paymentStatus` / `payment_status` / `paidAt` / `paid_at` on `server/routers/restaurant-billing.ts`
- `db.update(orders)` / `UPDATE orders` on `server/routers/restaurant-billing.ts`
- `paymentStatus` / `payment_status` server-wide
- `paymentStatus.*paid|paymentStatus.*=.*'paid'|payment_status.*=.*'paid'` server-wide (read sites)
- `setClauses.push` on `server/routers/service-coordination.ts` (verification grep — no duplicate writes found)
- `F-286` and `payment_status` across `audit/` and `docs/`

[All file reads marked VERIFIED. The Razorpay webhook handler at `server/index.ts:65-106` was inferred from `audit/02-data-flows/payment.md` line 101 citation but not directly read in Phase 1 — its inheritance of `finalizeBillCompletion()`'s F-286 bug is therefore [VERIFIED] only insofar as the function it calls is verified-broken.]
