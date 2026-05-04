# F-247 Phase 2 — Production data recon (2026-05-04)

Afternoon session, continuation of F-247 investigation after Phase 1
static analysis (`audit/f247-phase1-static-investigation-2026-05-04.md`).

The operator ran read-only recon directly against the Railway
production database via TablePlus. Claude Code did not connect to
the DB at any point — per `CLAUDE.md` hard rule 1, all DB reads go
through the operator's TablePlus session. Claude Code's role this
phase is documenting what the operator executed and the resulting
state.

No DB writes. No code changes. No commits.

---

## Read-only recon findings

Phase 1 left five open production questions. The first four were
answered; the fifth (UI render proportion needing `qrDataUrl`) is
answerable from static analysis alone and was not part of this
recon.

### Q1 — Orders in terminal-paid state with no matching `bills` row

```
SELECT o.id, o.tenant_id, o.status, o.created_at, o.order_type, o.channel, o.payment_method
  FROM orders o
  LEFT JOIN bills b ON b.order_id = o.id AND b.tenant_id = o.tenant_id
 WHERE o.status IN ('paid', 'completed')
   AND b.id IS NULL
 ORDER BY o.created_at DESC;
```

**Result: 9 rows.**

This is the full no-bill cohort across the entire production
database. Far smaller than F-234 Phase 2's 67-row cleanup cohort,
and very different in shape — see Q3.

### Q2 — Per-tenant breakdown

All 9 rows are under a **single tenant**: the same busiest
pre-launch test tenant that hosted F-234 Phase 2's 67-row cohort.
No other tenant has a no-bill paid-or-completed order.

This concentrates the investigation: whatever produced the orphan
rows is happening only in test-tenant-shaped traffic, not (yet) in
any other tenant.

### Q3 — Detail of the 9-order cohort

Status: all 9 are `status = 'paid'`. None are `'completed'`.

`payment_method`: all 9 are `card`. Zero `cash`. This contradicts
the Phase 1 hypothesis that "Mark Paid" shortcut at
`server/routers/orders.ts:1133` was producing the orphans — that
path is most plausibly used for cash. The card-only mix points at
a different code path.

`order_type`:
- 4 dine-in (rows 1-4 by created_at desc, all 2026-04 or later)
- 3 takeaway (rows 5-7)
- 2 dine-in (rows 8-9, oldest, 2026-03-13)

`channel`:
- 7 rows: `kiosk`
- 2 rows (the oldest, 2026-03-13): `NULL`

The `NULL`-channel rows predate channel tracking. The 7 `kiosk`
rows post-date it — and span ~3 weeks of accumulation, suggesting
the kiosk order-creation path does not run the same auto-bill
branch the POS path does.

`created_at` range: **2026-03-13 to 2026-05-03**. Spans roughly
seven weeks. Crucially, **no row from today (2026-05-04)**.

### Q4 — Today's orders

Querying today's paid/completed orders:

```
SELECT o.id, o.created_at, o.status, o.payment_method,
       (SELECT COUNT(*) FROM bills WHERE order_id = o.id AND tenant_id = o.tenant_id) AS bill_count
  FROM orders o
 WHERE DATE(o.created_at) = CURRENT_DATE
   AND o.status IN ('paid','completed');
```

**Result: 8 rows, all with `bill_count = 1`.**

Every paid/completed order created today has a corresponding bill
row. Bill creation worked correctly today through the regular
BillPreviewModal flow. The orders the testers reported as broken
have bill rows in production right now.

This means **the testers' "Something went wrong" page is NOT a
missing-bill problem**. The 404 they screenshot was transient —
caught between page mount and bill-creation completion — and the
page failed to recover because the `qrDataUrl` ReferenceError
crashed the render before the recovery `useEffect` could fire.

---

## Updated diagnosis (revising Phase 1)

Phase 1 concluded that the 404 and the `qrDataUrl` crash were
related: the crash prevented the lazy-create `useEffect` from
firing, converting a transient 404 into a permanent one. Phase 2
data refutes this for the active production failure.

The data shows two distinct issues, with different urgency:

**F-247 (active production bug).** The `qrDataUrl is not defined`
ReferenceError at `client/src/components/pos/BillPreviewModal.tsx:2150`
crashes the bill view page even when the bill row exists. Today's
bills exist in production. The 404 in tester DevTools was a
transient race between the initial bill GET and the auto-create
useEffect; the page failed to render the recovered state because
of the scope bug. **Single-file scope fix in `BillPreviewModal.tsx`** —
move `qrDataUrl` and `digitalReceiptUrl` declarations from inside
the `handlePrint` `useCallback` (L723-739) up to the component
body so the JSX at L2150-2160 can read them. Phase 3 decides
whether the lift is to `useState`, plain `const` derived from
`createdBill`, or something else.

**F-250 (separate, pre-existing).** 9 orders that completed
without bills over the past 7 weeks, on one tenant, all `card`,
all `kiosk` or `NULL` channel. The kiosk channel order-creation
path does not auto-create bills (a code path Phase 1 did not
trace). The two `NULL`-channel rows from 2026-03 predate channel
tracking. This is lower severity than F-247: not blocking
today's testing, no active customer impact pre-launch, no bleed
to other tenants.

The Phase 1 "two errors related" framing was correct as a
worst-case static reading but wrong as a description of the
active failure. Today's testers are hitting only F-247.

---

## Decision: no cleanup performed in this phase

Different from F-234 Phase 2's approach, where the operator
voided the entire stuck-row cohort to clear the way for `CREATE
UNIQUE INDEX`.

For F-247, **no cleanup**. Three reasons:

1. The 9 stuck-no-bill orders do not block the F-247 fix. The
   `qrDataUrl` scope bug is independent of historical data state;
   fixing the JSX scope ships regardless of how many no-bill
   orders exist in production.
2. Cleaning the 9 rows up now would obscure the F-250
   investigation that still needs to happen separately. The kiosk
   channel order-creation path needs a code trace to determine
   whether it should be patched or whether the kiosk flow
   intentionally produces no bill (e.g. because the kiosk
   completes via a separate receipt mechanism).
3. The F-247 fix path is independent of the F-250 root cause.
   Conflating the two would slow both.

The 9 rows stay in production as evidence for F-250.

---

## State at the end of Phase 2

- **F-247 fix shape locked**: single-file scope fix in
  `client/src/components/pos/BillPreviewModal.tsx`. Phase 3
  decision memo confirms the exact lift mechanism (`useState` vs.
  derived `const` vs. other) and the dependency-array
  implications.
- **F-250 filed** as a separate finding (see backlog edit). Out
  of scope for the F-247 fix branch.
- **No DB writes performed.** Production data unchanged.
- **No code changes performed.** The F-247 fix is queued for
  Phase 4 implementation after the Phase 3 decision memo.

---

## Spin-off findings (separate from F-250)

Phase 1 also flagged two incidental code-layer gaps that are NOT
the active production bug. Filing as Low-severity hygiene items:

- **F-251**: `PATCH /api/orders/:id` "Mark Paid" shortcut at
  `server/routers/orders.ts:1133` bypasses bill creation and
  emits no audit log for the implicit no-bill completion. Bills
  are revenue-of-record. An order completing without a bill is
  essentially an off-record transaction.
- **F-252**: `POST /api/restaurant-bills` rejects orders with
  zero items at `server/routers/restaurant-billing.ts:226-227`.
  Edge case during item-removal race; the bill view recovery
  path would 404 forever even after F-247 is fixed.

Both filed as Low-severity post-launch hygiene; details in the
backlog edit.

---

## Methodology note

Phase 1's "two errors are related" conclusion was wrong for the
active bug. The 404 and `qrDataUrl` are independent for today's
reproduction: bills exist for today's orders, so today's 404 was
a transient race, not a missing-bill state. The `qrDataUrl`
ReferenceError is the only error blocking the bill view page in
the current production failure mode.

Lesson for future audit chains: when a hypothesis ties two errors
together causally ("A happens because B prevented C"), production
data should test BOTH the cause and the effect, not just the
existence of A and B in code. Phase 1 only tested the static code
paths, which made the chain *plausible*; Phase 2 production data
was needed to disambiguate "plausible" from "actually happening".

For the F-247 fix specifically, this is a small but useful
correction — it tells Phase 3 to ignore the bill-creation gating
question entirely and focus on the JSX scope fix, which is a much
narrower change than fixing both at once would have been.

---

## State summary

- 9 orphan no-bill orders identified, all on one test tenant.
- 0 from today; today's 8 paid/completed orders all have bills.
- F-247 fix shape locked at single-file scope in
  `BillPreviewModal.tsx`.
- F-250, F-251, F-252 filed as separate backlog items (see
  `audit/00-backlog.md`).
- DB unchanged.
- Schema unchanged.
