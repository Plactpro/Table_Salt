# Table Salt — v1 Launch Scope (LOCKED)

**Date locked:** 2026-05-16
**Status:** Active. This is the single North Star for v1 launch.
**Supersedes:** `audit/launch-must-fix-2026-05-14.md` (the earlier 13-blocker list was
compiled before scope was locked; several of its items are now v2 and are no longer
launch blockers).

---

## How to use this document

Every "should I work on X?" question is answered here. If X is not one of the
9 launch items, not item #0, or not one of the 4 known launch blockers, then X
waits. It does not get worked on for v1. This rule is the point of the document.

This document defines what "launched" means as a set of outcomes a real
restaurant can achieve — not a list of features. v1 ships when all 9 items are
reliably true across a 4+ hour service with zero failures.

---

## Nothing is deleted — preservation principle

Locking scope is a prioritisation decision, not a destruction decision. To be
explicit and permanent:

- **No application code is deleted.** Every one of the ~48 modules stays in the
  repository. v2 modules are *hidden* (feature flag / sidebar removal) when the
  hide work is done. Hiding is not deleting. The code remains, fully intact,
  ready to be re-enabled for v2, v3, and beyond.
- **No database tables are dropped.** The production schema is untouched by this
  decision. Tables belonging to v2 features (parking, loyalty, etc.) remain.
- **No findings are deleted.** `FINDINGS.md` and `00-backlog.md` remain frozen
  registers. Every finding stays written down with its file paths and line
  numbers. Scope locking only re-prioritises findings: those concerning v2
  modules are deferred; those concerning the 9 launch items stay active.
- **The staging environment follows the same rule.** Once the staging Postgres
  schema is pushed, staging tables are also not to be dropped without an
  explicit, deliberate decision. Staging is a safe place to test, not a place
  where data is casually destroyed.

If anything is ever to be deleted, it is a separate, explicit decision — never a
side effect of this scope lock.

---

## Product definition — Table Salt v1

Single-outlet, dine-in restaurant management.

- One outlet. Dine-in service only.
- Cash and card payment.
- UAE (VAT 5%) or India (GST) tax.
- One price. No subscription tiers.
- 5–15 tables.
- Staff roles: owner / manager, waiters, cashier.

Everything else is post-launch (see the v2 list below).

---

## Item #0 — Auth & roles (silent foundation)

Owner, manager, waiter, and cashier each log in and see the screens and actions
appropriate to their role. This is non-negotiable and underlies every item
below. It is numbered #0 because it is not a separate workflow the user thinks
about — it is the foundation every other item depends on.

---

## The 9 launch items

v1 is launched when, across a full real service day, a single-outlet dine-in
restaurant can do all 9 of these without failure.

| # | Item | What it means | Known risk |
|---|------|---------------|-----------|
| 1 | Owner sees yesterday | On open, an owner/manager can view the prior day's closing summary — covers, revenue, open/voided bills — accurately. | Depends on a working "yesterday's summary" view (see Monday verification task 1). |
| 2 | Manager sets up the day | Manager can open the floor plan, set table availability, and confirm the menu including marking daily specials active/inactive. | — |
| 3 | Waiter opens an order on a table | Waiter taps a table, starts a new order, adds items one by one, and submits. | — |
| 4 | Kitchen receives it | The submitted order reaches the kitchen — printed KOT or kitchen screen — correctly and completely. | — |
| 5 | Mid-meal additions work | Waiter adds items to an already-open table order; the kitchen receives only the new items; and all items land on the **same bill**. | **F-280** — currently broken (add-on items create a separate bill). Biggest remaining fix. |
| 6 | Bill generates correctly | Waiter/cashier generates the bill for a table — all items, correct VAT/GST, correct total. | — |
| 7 | Payment closes the loop | Cashier records cash or card payment; the bill closes; the table resets to available. | — |
| 8 | Void works | A wrongly-rung item can be voided, with supervisor approval; the voided order updates status correctly, frees its table, and cannot be billed. | **F-301** — currently broken (voided order keeps status, holds table, can enter payment flow). |
| 9 | Shift open/close with cash reconciliation | Shift opens with a cash float; shift closes with a guarded reconciliation (correct role required, warning if open orders exist); end-of-day report (orders, revenue, table turnover, voids/discounts) is produced and the cash figure matches counted cash. | **TC-076 / TC-077** — currently broken (no role guard on close, no open-order warning). |

**v1 ships when all 9 items are reliably true across a 4+ hour service with zero
failures.**

---

## Known launch blockers

These are the open bugs that sit directly on the 9 items and must be fixed
before v1 can be called done. The table below is the source of truth for the
count.

| Blocker | Affects | Description |
|---------|---------|-------------|
| F-280 | Item #5 | Add-on items create a separate bill instead of joining the original bill. Confirmed 2026-05-15 (TC-028). Largest remaining fix. |
| F-268 | Items #6, #7 | SERVED orders have no Bill button; View Bill navigation diverges by order state. Re-opened 2026-05-14. Blocks billing and payment for served orders. |
| F-276 | Item #9 | Payment can be completed after the shift has been closed, defeating cash-float reconciliation. |
| F-284 | Item #7 | Payment endpoint accepts new payments on an already-paid bill (returns 200 OK; no overpayment persisted, but the path should not exist). |
| F-297 | Items #3, #4 | Cart-only Hold creates a phantom KOT on Recall; Send-to-Kitchen then creates duplicate items in the KDS. |
| F-300 | Items #6, #7 | Split-payment receipt collapses to "Paid via Cash" regardless of the actual method mix. Tax-invoice integrity exposure (UAE FTA / India GST). Split payment — one bill, multiple methods — is in v1 scope. |
| F-301 | Item #8 | Voided order keeps "In Progress" status, does not free its table, and can still enter the payment flow. Confirmed 2026-05-15 (TC-058 / TC-059 / TC-060). |
| F-303 | Item #4 | Menu items with no kitchen station are sent to the KDS but silently omitted from the printed KOT. Self-concealing. |
| F-256c | Item #6 | Tenant-configured time zone reverts after page refresh; the configured time zone must persist. |
| F-270 | Items #4, #6 | KDS and receipt timestamps display the wrong time zone. Shares a root cause with F-256c. |
| TC-076 | Item #9 | A non-manager can close a shift with no supervisor approval. Confirmed 2026-05-15. |
| TC-077 | Item #9 | A shift can be closed with open unpaid orders and no warning. Confirmed 2026-05-15. |

11 independent fixes — F-256c and F-270 share a root cause and are resolved as
one fix.

**Verify-then-decide.** F-286 (order/bill payment-status desync) and F-234
(cross-user same-table duplicate orders) are unclassified pending a targeted
verification check — neither a confirmed blocker nor cleared.

Findings raised against v2 modules remain in the registers but are not launch
blockers and are not worked on for v1.

Blocker list reconciled against all BLOCKING-tagged findings in
audit/00-backlog.md on 2026-05-16.

Correction 2026-05-17: this document originally labelled the add-on-bill blocker "F-013" (item #5 and the blocker table). That was a mislabel. FINDINGS.md F-013 is an unrelated auth finding (prep-notification endpoints requiring no authentication). The add-on-bill bug's correct register entry is F-280 in audit/00-backlog.md. Both references have been corrected to F-280.

---

## Module split

### LAUNCH — modules required for the 9 items (≈15)

| Module | Supports |
|--------|----------|
| Auth | Item #0 |
| Dashboard | Items #1, #2 |
| POS | Items #3, #5, #6, #7, #8 |
| Tables | Items #2, #3, #7 |
| Menu | Item #2 |
| Kitchen Board / KDS | Item #4 |
| Kitchen Settings | Item #4 (station setup) |
| Billing | Items #6, #7 |
| Cash Machine | Items #7, #9 |
| Shift Reconciliation | Item #9 |
| Orders | Item #1 and operational order lookup during/after service |
| Settings | Tenant configuration (tax, currency) |
| Printer Setup | Item #4 (KOT), Item #6 (bill print) |
| Promotions — **minimal only** | Discount-on-bill: a fixed-amount or percentage discount applied to a bill with a reason. NOT the full promotions/offers engine. |
| Reports — **minimal only** | End-of-day report and yesterday's summary only. The other ~9 Reports sub-tabs are v2. |

### V2 — hidden at launch, code retained

Decided borderline modules now confirmed v2: Menu Pricing, Recipe Editor,
Service Hub, CRM, Wastage Control, Wastage Log, Cleaning, Inventory, Tip Report.

Already-known v2 set: takeaway, delivery, online ordering, QR ordering, kiosk,
multi-outlet, loyalty, combos, parking, valet, third-party aggregator
integrations, Advertisements, Events & Special Days, Internal Audits,
Omnichannel, Live Requests, QR Settings, Phone Orders, split bill, Pro and
Enterprise tiers, multi-currency switching, multi-language switching, and the
~9 non-basic Reports sub-tabs.

All v2 modules are hidden, not deleted (see preservation principle above).

---

## Monday verification tasks

Two open questions could not be answered from scope discussion alone and need a
quick check before the LAUNCH module list is final.

1. **Reports views existence.** Confirm that a working "yesterday's summary"
   view (for item #1) and a working "end-of-day report" view (for item #9)
   actually exist and function. If the Dashboard plus the shift-close report
   cover items #1 and #9, the Reports hub can be hidden almost entirely. If
   they do not, a minimal Reports page must stay in the LAUNCH set.

2. **Promotions discount reachability.** Confirm that the basic discount-on-bill
   capability (fixed amount or percentage, with a reason) is reachable when the
   Promotions hub is hidden. If the discount control lives inside the POS /
   billing flow rather than on the Promotions page, hiding the hub is safe. If
   it lives only on the Promotions page, that path must be preserved.

---

## Out of scope for v1 — explicit

For absolute clarity, the following are NOT part of v1 and are not to be worked
on until v1 has shipped and has a paying customer:

Split bill, takeaway, delivery, online ordering, QR ordering, self-service
kiosk, multi-outlet / franchise / HQ console, loyalty, combo offers, parking
and valet, third-party aggregator integrations, advertisements, events
calendar, internal audits, omnichannel analytics, live customer requests,
tip reporting through the system, recipe-based food costing, software
inventory / stock management, the full promotions engine, multi-currency
switching, multi-language switching, and the Pro and Enterprise subscription
tiers.

These remain in the codebase. They are the roadmap. They are not v1.
