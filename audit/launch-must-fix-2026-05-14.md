# Launch Must-Fix — Table Salt

**Created:** 2026-05-14
**Status:** Living document. Updated as findings close, reopen, or are re-scoped.
**Companion to:** `audit/00-backlog.md` (the full systemic register). This document is the curated launch view, not a replacement for the backlog.

---

## Purpose

This is the North Star for getting Table Salt to a "first paying restaurant could use it" state. It exists because the full backlog (`00-backlog.md`) tracks ~82 findings across every module, severity, and workflow — far more than blocks launch. This document answers one question only: **what has to be fixed before one specific restaurant can run one specific workflow on Table Salt.**

If a finding is not in this document, it does not block launch. That is the rule. Architectural debt, multi-outlet bugs, QR ordering, kiosk, delivery, combos, parking — all real, all deferred, none of them here.

---

## The locked launch workflow — Workflow α

**Single-outlet dine-in restaurant.**

- One restaurant, one outlet, 5–15 tables
- UAE (AED + VAT 5%) and/or India (INR + GST)
- Cash + card payments
- 1 owner/manager + 3–5 waiters + 1 cashier
- Dine-in service only

**Explicitly OUT of scope for launch:** takeaway, delivery, online orders, third-party aggregators, QR table ordering, self-service kiosk, multi-outlet, combo/BOGO/loyalty offers, parking/valet, multi-currency switching, multi-language.

A finding is MUST-FIX only if it breaks this workflow. A finding is WATCH if it is in this workflow and a restaurant owner would notice it, but it does not stop service. Everything else is DEFER.

---

## MUST-FIX — launch blockers

These prevent the single-outlet dine-in workflow from running correctly end to end. Launch cannot happen until every item here is fixed and tester-verified.

Status legend: `OPEN` = no fix in flight · `PHASE 1` = investigation done, fix not built · `FIX SHIPPED` = fix merged, tester verification pending · `VERIFYING` = tester verification in progress

### Money & billing integrity

**F-256b — Currency setting does not persist after refresh.** `OPEN` (reopened 2026-05-14). A tenant changes their currency, saves, refreshes — the saved currency does not appear in the Settings dropdown. POS itself uses the saved currency, but the Settings read-back is broken. Was marked CLOSED 2026-05-08 on a self-test; cross-validation by Madhesh found it still live. **Next action:** Phase 1 re-investigation — confirm the PR #29 fix is actually live on production, then determine if the bug is read-side or a deploy/caching issue.

**F-256c — Time Zone setting does not persist after refresh.** `OPEN` (reopened 2026-05-14). Same pattern as F-256b — TZ does not persist, Audit Log shows browser TZ. Likely shares a root cause with F-256b in the Settings read-back path. **Next action:** Phase 1 jointly with F-256b.

**F-285 — Shift close "Expected Cash" ignores cash sales.** `FIX SHIPPED` but verification FAILED. Cash payments do not aggregate into the shift-close reconciliation, so a cashier cannot reconcile their drawer at end of day. Fix shipped in PR #45 but is structurally blocked by F-294 (see below) — the fix reads a join filtered by `bills.pos_session_id`, which is 100% NULL. **Next action:** fix F-294 first, then re-verify F-285.

**F-294 — `bills.pos_session_id` never written (100% NULL).** `PHASE 1` in progress. Every bill since 2026-05-10 has a NULL session foreign key. This blocks F-285's fix and breaks every session-scoped financial report. Root cause narrowed: the client sends `posSessionId: null` in the bill-finalize POST — the value is lost client-side somewhere between shift-open and bill-finalize. **Next action:** Phase 2 — find where in the client the `posSessionId` value is dropped. This is the highest-priority blocker because F-285 depends on it.

**F-284 — Payment endpoint accepts new payments on already-paid bills.** `OPEN`. The API allows a payment to be recorded against a bill that is already paid. Severity was reframed CRITICAL → HIGH after recon showed the server returns 200 OK without persisting an overpayment, but it remains a payment-integrity gap. **Next action:** Phase 1 — server-side guard on the payment endpoint to reject when the bill is already in a terminal paid state.

**F-300 — Receipt shows "Paid via Cash" on split-payment bills.** `OPEN` (re-scoped 2026-05-14). Single-method payments render correctly. The bug fires on split-payment bills (one bill settled with more than one method) — the receipt collapses to "Paid via Cash" regardless of the actual method mix. Stays BLOCKING because split payment is in-workflow and a wrong-method tax invoice is an FTA/GST exposure. **Next action:** Phase 1 — the split-payment receipt-rendering path, where the bill has multiple `bill_payments` rows.

### Order & kitchen flow

**F-234 — Two users can claim the same table, creating duplicate orders.** `OPEN`. The table appears free to both users; simultaneous orders create two orders on one table. The client-side guard protects same-user only; a server-side advisory lock or partial unique index is needed. A restaurant cannot run more than one waiter without this. **Next action:** Phase 1 — server-side table-claim lock.

**F-283 — Split bill after KOT creates orders with no items / no value.** `FIX SHIPPED` (Phase 2 in PR4) but verification FAILED for the after-KOT case. Splitting an order that has already been sent to the kitchen still errors with "Split failed F:283". The before-KOT case passes. **Next action:** Phase 1 retry on the after-KOT path — likely the Drizzle insert type for `isSplitBill` or the client `buildOrderData` persistence-set computation.

**F-297 — Cart-only Hold creates a phantom KOT on Recall, then duplicates on Send.** `OPEN`. Holding a cart-only order (no items sent to kitchen) and recalling it makes items appear in the KDS with no KOT fired; then Send-to-Kitchen sends them again, creating duplicate KOT entries. Cross-validated by both testers. Fires only for cart-only Hold — partial-KOT and full-KOT Hold work correctly. **Next action:** Phase 1 — the `recallServerOrder()` client handler; cart-only orders appear to be set to in_progress and emit a kitchen-routing event before the user clicks Send.

**F-303 — Menu items with no kitchen station do not print on KOT.** `OPEN` (filed 2026-05-14). A station-less menu item is sent to the kitchen and appears on the KDS, but does not print on the KOT. The bug is self-concealing — the KDS showing the item masks the missing printed ticket — and hits hardest during a new tenant's first menu setup, when station assignments are incomplete, i.e. during their first real service. **Next action:** Phase 1 — KOT print-job generation appears to skip items with a null `station_id` while the KDS path does not.

### Service operations

**F-276 — Payment can be completed after the shift is closed.** `OPEN`. A payment succeeds against an order even after the POS session it belongs to has been closed, defeating cash reconciliation entirely. **Next action:** Phase 1 — server-side guard rejecting payment when the associated session is closed.

**F-270 — KDS and receipt timestamps show a third timezone (neither tenant TZ nor browser TZ).** `OPEN`. Timestamps on KDS tickets and printed receipts match neither the saved tenant TZ nor the browser TZ — likely server UTC or a container-baked default. Kitchen staff cannot judge order age; UAE FTA rules require tax invoices to show correct local time. Server-side bug. **Next action:** Phase 1 — backend timestamp formatting without tenant context. The abandoned `fix/F-225-tenant-tz-helper` branch is a usable spec reference (~310 lines), not mergeable.

### Platform stability

**F-254 — Production frontend hit by 429 Too Many Requests during normal use.** `PARTIALLY FIXED`. F-254a (rate limiters mounting before `passport.session`, so per-user keying failed) was fixed in PR #23. H-2 through H-5 remain unconfirmed and may have dissolved now that per-user budget is restored. **Next action:** confirm whether any 429s still occur in tester sessions; if none, F-254 can move to CLOSED. If they persist, Phase 1 on the remaining hypotheses.

---

## CLOSED / PENDING SIGN-OFF

Fixed and verified, kept here briefly for traceability rather than in the active list.

**F-286 — `orders.payment_status` not synced with `bills.payment_status`.** Fix shipped (PR #41, Phase 2 four-site fix), tester verification PASSED. Paid bills previously left the linked order showing `payment_status = pending`, under-counting revenue reports by 100%. The one remaining item — Q-286-Q6, whether kiosk/guest Stripe orders create bills with a possible opposite-direction desync — is out-of-workflow and deferred by design. **Closeable.** Not a launch blocker.

---

## WATCH — in-workflow, noticeable, not service-stopping

These are in the single-outlet dine-in workflow and a restaurant owner would notice them, but they do not stop service. Fix before broad marketing; a friendly design-partner first customer may accept them if told in advance.

**F-237 — Held orders: no delete confirmation, and delete itself is broken.** Two-part bug (updated 2026-05-14): no confirmation dialog before deletion, AND the delete button does not actually delete — the held order stays in the list with Recall still enabled. Held orders are recoverable, not data-corrupting, so WATCH.

**F-271 — Cash payment preset buttons missing from Bill Preview Modal.** No 20/50/100/200/Exact preset buttons; the cashier must type the tendered amount every time. Slows service, not a correctness bug.

**F-272 — Cash payment with empty tendered field completes a ₹0 transaction.** The Confirm Payment button stays enabled when the tendered field is empty; an explicit "0" correctly disables it, but an empty field does not. A validation gap — the manager catches the discrepancy at shift close.

**F-273 — CLOSED 2026-05-14.** Two-tab double payment. Cross-validation confirmed the server-side terminal-state guard works (Tab 2 gets 409 Conflict, one payment record in DB). Listed here only to record the closure — no action needed.

**F-274 — Bill page renders a payment receipt for already-paid orders.** Re-opening a paid order shows the post-payment receipt view instead of an "Already paid" badge with a read-only Bill Preview. Confuses cashiers reviewing past orders; risks accidental re-payment attempts. Re-payment is rejected (per F-273), so this is UX confusion, not a double-charge.

**F-275 — Stale Bill Preview does not trigger a version conflict.** If Tab 2 modifies an order while Tab 1 holds a stale Bill Preview, Tab 1's payment proceeds with the old total — customer charged the wrong amount. WATCH — concurrent two-tab same-order editing is outside the target single-outlet workflow. Promote to MUST-FIX if multi-device same-order editing enters the workflow scope.

**F-293 — npm run check is red on main.** Pre-existing TypeScript errors in server/admin-routes.ts, server/routers/permissions.ts, server/routers/pricing.ts, and several client files (App.tsx and others). Not a user-facing blocker, but it means no PR can be type-checked clean until fixed — every fix after this point loses its type-check safety net. Status: tracked, not yet scoped. Next action: dedicated investigation branch to triage and fix, separate from launch-blocker work.

**F-299 — KDS does not update when a sent item is removed from the POS cart.** A removed item stays on the KDS as "to be prepared." Kitchen wastes ingredients on a cancelled item. Operationally annoying, not service-stopping.

**F-301 — Voided orders stay in "Served" status after a successful void.** The void completes but the status does not transition. The order looks active and may be re-billed by mistake; shift reports may miscount. Operational confusion, not financial loss.

**F-302 — Refunds leave no audit trail.** A refund completes (money moves correctly) but creates no visible refund record and shows no refunded amount. A refund cannot be distinguished from a normal payment when reviewing history. Audit-integrity gap — important before scale, not service-stopping at launch.

---

## DEFER — explicitly out of scope for this launch

Recorded here so it is not re-litigated. Everything below is real and tracked in `00-backlog.md`, but does not block the single-outlet dine-in launch:

- **Out-of-workflow features:** takeaway, delivery, online orders, third-party aggregators, QR table ordering, kiosk, phone orders — all associated findings deferred.
- **Multi-outlet:** F-298 (outlet switching) and any multi-outlet finding — the launch is single-outlet by definition.
- **Offers:** combo / BOGO / free-item / loyalty findings — not in the launch workflow.
- **Parking / valet:** entire module out of scope.
- **Architectural / process debt:** F-287, F-288, F-291, F-292, F-293, F-296 and similar — these are real and worth addressing post-launch, but they are not workflow-blocking.
- **Config / tooling:** the A-numbered config items (A-05 through A-14) — opportunistic, post-launch.
- **The ~200 findings in `audit/FINDINGS.md`** (Phases 1–9 systemic audit) — deferred unless a specific finding overlaps with a MUST-FIX item above.

---

## Sequencing notes

**Hard dependency:** F-294 must be fixed before F-285 can be re-verified. F-285's shipped fix reads a join on `bills.pos_session_id`, which F-294 leaves NULL. Do F-294 Phase 2 first.

**Likely shared root cause — investigate together:** F-256b and F-256c (Settings read-back path). Possibly also related to F-270 (the downstream-consumer TZ bug) and the abandoned F-225 work.

**Independent — can be worked in any order:** F-234, F-276, F-284, F-297, F-300, F-303, F-270. None of these block or depend on each other.

**Possibly already closeable with verification, not new work:** F-254 — confirm no 429s occur in tester sessions; if clean, it moves to CLOSED with no code written, dropping the MUST-FIX list to 12. (F-286 has already been moved to CLOSED / PENDING SIGN-OFF on the same basis.)

**Rough effort shape:** several MUST-FIX items are small server-side guards (F-276, F-284, arguably F-234) — a few lines plus a manual test. Others need genuine Phase 1 investigation (F-294 Phase 2, F-256b/c, F-283 retry, F-297, F-300, F-303). F-270 is the largest single piece (timezone handling across KDS + receipts). Realistic focused timeline to clear the list: several weeks, not days — but it is a finite, countable list, not an open-ended audit.

---

## Count at creation (2026-05-14)

- **MUST-FIX:** 13 active blockers. The MUST-FIX section lists 13 entries (F-234, F-254, F-256b, F-256c, F-270, F-276, F-283, F-284, F-285, F-294, F-297, F-300, F-303). F-256b and F-256c are sub-items of one parent finding — count them as one if tracking by finding, two if tracking by fix. **Working number for launch planning: 13 active blockers.**
- **CLOSED / PENDING SIGN-OFF:** 1 (F-286 — fix shipped, verification passed, closeable).
- **WATCH:** 8 in-workflow noticeable findings (F-237, F-271, F-272, F-274, F-275, F-299, F-301, F-302; F-273 closed).
- **DEFER:** everything else in `00-backlog.md` and `FINDINGS.md`.

The MUST-FIX number going up rather than down over the past few days is not regression — it reflects the register becoming honest. Two of the current blockers (F-256b, F-256c) were previously marked closed and were not actually fixed; cross-validation caught that. An accurate list of 13 is worth more than an optimistic list of 10.

---

## How to use this document

When the question is "what should I work on next," the answer is in the MUST-FIX section — start with F-294 (it unblocks F-285), then work the independent items. Do not work anything in DEFER. Do not add to MUST-FIX without checking the finding against Workflow α — if it does not break single-outlet dine-in, it is WATCH or DEFER, not MUST-FIX.

Update this document when a finding closes, reopens, or is re-scoped — same as the backlog. Keep it honest. A wishful North Star is worse than no North Star.
