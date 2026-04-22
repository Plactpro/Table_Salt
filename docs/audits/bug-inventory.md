# Table Salt — Bug Inventory

**Location of truth.** This file is the single source of truth for bug state in the Table Salt repo. Any bug not listed here is either already fixed (and recorded below), or not yet triaged.

**Last updated:** 2026-04-22

## Summary

| Category | Count |
|----------|-------|
| Total bugs tracked | 33 |
| Fixed and deployed | 20 |
| Resolved as invalid | 1 |
| Open (not yet fixed) | 13 |
| Open — BLOCKING | 0 |
| Open — MEDIUM severity | 6 |
| Open — LOW severity | 7 |

## OPEN — BLOCKING

None currently. B1 (KDS stale ticket pollution) was split into five defects on 2026-04-22; two shipped (see FIXED 2026-04-22), three remain open at lower severity (B1c, B1d, B1e).

## OPEN — MEDIUM

| # | Bug | Location | Description |
|---|-----|----------|-------------|
| M1 | Two tabs can target same table | pos.tsx tab management | Nothing prevents Tab 1 and Tab 2 from selecting the same table before either order is sent. Both tabs will create orders on the same table. |
| M2 | UPI payment not implemented | pos.tsx payment modal | Shows placeholder text "Show UPI QR" only. No QR generation, no payment tracking. |
| M4 | Addon KOT creates new order, not appended | orders.ts POST /api/orders | Addon items create a new order with parentOrderId. Billing at /pos/bill/:orderId must aggregate the parentOrderId chain or bill will be incomplete. Needs verification that BillPreviewModal does this. |
| M5 | No delivery address field in POS | pos.tsx delivery flow | deliveryOrders table has customerAddress, but POS UI does not capture it. Manual delivery orders have no address. |
| B1c | Auto "ready → served" transition policy | KDS server-side, policy decision | After how long should a KDS ticket stuck in "ready" auto-transition to "served"? Recommendation: 6 hours. Decision needed from owner before implementation. Part of original B1 split on 2026-04-22. |
| M3b | Force-close audit log | server/routers/pos.ts shift close endpoint | When a manager chooses "Force Close" past the M3 guard, server should log a `SHIFT_FORCE_CLOSED` audit event with open item counts at time of close. Deferred until owner verifies the M3 guard is working as expected in testing. |

## OPEN — LOW

| # | Bug | Location | Description |
|---|-----|----------|-------------|
| L1 | Non-manager cross-shift recall blocked | orders.ts GET /api/orders/on-hold | Non-manager staff cannot recall another staff member's held orders, even in emergencies. |
| L2 | Recalled order loses veg/category info | pos.tsx recallServerOrder | isVeg = null, categoryId = null on recalled server orders. Offer applicability by category will not work. |
| L3 | BOGO/combo/free-item offers not supported in POS client | pos.tsx offers | buy_one_get_one, combo_deal, free_item types exist in enum but are NOT in SUPPORTED_OFFER_TYPES on client. Staff cannot apply these from POS. |
| L4 | Duplicate delivery endpoints | orders.ts | /accept and /accept-delivery, /reject and /reject-delivery — identical logic, older versions without -delivery suffix appear leftover. |
| L5 | Events calendar schema refactor (F-225 Day 3 part 2) | events table schema, client/src/pages/modules/events.tsx | DEFERRED. events table uses plain `timestamp` columns for start_date/end_date with a `setHours(23, 59, 0, 0)` form default at events.tsx:528 as an "end of day" hack. F-225 Commit 2 resolved EV-01 symptom; this entry tracks the underlying schema shape (separate `start_date DATE` / `end_date DATE` columns, optional `start_time` / `end_time TIME`, gated by existing `all_day` boolean). Not breaking anything in production. Recon complete 2026-04-20. Plan before executing: migration affects 8+ consumers (server/routers/events.ts, server/storage.ts, client offers.tsx, staff.tsx, procurement.tsx, plus events.tsx calendar rendering). |
| B1d | Cross-outlet KDS scoping | KDS query layer | Tickets are currently tenant-scoped only. When a tenant has multiple outlets, KDS may display tickets across all outlets instead of the active outlet. Deferred until multi-outlet customers exist. Part of original B1 split on 2026-04-22. |
| B1e | kitchen.tsx does not subscribe to `order:stale_archived` | client/src/pages/dashboards/kitchen.tsx | When the B1b nightly scheduler fires and archives a stale order, the kitchen.tsx view does not receive a live WebSocket update. Next query invalidation cycle picks it up. Cosmetic. Part of original B1 split on 2026-04-22. |

## RESOLVED — INVALID

| # | Bug | Resolution | Date |
|---|-----|------------|------|
| INV-1 | /ticket-history 404 | URL never existed in any branch, commit, or migration. Canonical URL is /tickets, has been since feature's first commit (c36f4d3, 2026-03-23). Sidebar label "Ticket History" was mis-read as URL slug by tester during free exploration. Full investigation: see session handoff 2026-04-20. | 2026-04-20 |

## FIXED — Shipped 2026-04-22

| # | Bug | Fix | Commit |
|---|-----|-----|--------|
| B1a | KDS stale ticket pollution — client invalidation | Added `order:completed` subscription on kitchen-board.tsx; added KDS_ACTIVE_STATUSES filter to `order:updated` handler on kitchen.tsx so tickets are removed from the local store when status exits {new, sent_to_kitchen, in_progress, ready}. Covers defects D and E of the original B1 split. | 4e67108 |
| B1b | Stale-order archive cron | New service `server/services/stale-order-archive-scheduler.ts` runs at 04:00 UTC via node-cron. Iterates active tenants and archives orders in active KDS statuses older than 24h. Uses JOB_LOCK 191011. Matches existing scheduler pattern (daily-report, stock-report, wastage-summary). Covers defect C of the original B1 split. | 05931a9 |
| M3 | POS shift close — no open order check | CloseShiftDialog now blocks with an amber warning when active orders, unsent tabs, held tabs, or occupied tables exist. User can Cancel or Force Close. Added 4 count props, 3 derived values, loading/guard/cash render branches. Six i18n keys added (English real text; es/fr/ar prefixed `[EN]` per no-machine-translate rule). | 7771254 |

## FIXED — Resolved April 16–17, deployed to production

| # | Bug | Fix | Commit |
|---|-----|-----|--------|
| F1 | Takeaway/Delivery KOT never generated (server) | Added order.status === "new" && order.channel === "pos" to KOT condition | a024e11 (Fix A) |
| F2 | Takeaway/Delivery KOT never dispatched (client) | Changed gate from if (isDineIn && data?.id) to if (data?.id && !data?.queued) | a024e11 (Fix D) |
| F3 | transfer-table uses invalid status "available" | Changed to "free" (valid enum value) | a024e11 (Fix B) |
| F4 | Public receipt endpoint crashes (user.tenantId on unauthenticated route) | Changed to bill.tenantId | a024e11 (Fix C) |
| F5 | Recalled server orders have empty sentCartKeys → duplicate KOTs | Set sentCartKeys to all reconstructed cart keys | a024e11 (Fix F) |
| F6 | Split of partially-sent order resends all items to kitchen | Track originalSentKeys and preserve sent status per group | a024e11 (Fix G) |
| F7 | Covers/pax stored in notes string only, not in DB covers column | Added covers field to buildOrderData | a024e11 (Fix E) |
| F8 | Wrong-table change does not update table statuses | Changed to use transfer-table endpoint | a024e11 (Fix H) |
| F9 | KOT creation — missing tenantId in createOrderItem calls | Added tenantId to both call sites | 356c0e2 |
| F10 | Void modal crash — CartItem used instead of server item IDs | Replaced selectedVoidItem with voidModalData | 3d2a86f |
| F11 | order_number always NULL | Added atomic PREFIX-YYYYMMDD-NNN generation after createOrder | 317579c |
| F12 | Bills not auto-created for takeaway orders | Auto-creates bill after order creation if paymentMethod set | 317579c |
| F13 | Void request — kitchen role missing from VOID_REQUEST_ROLES | Added kitchen to allowed roles | 317579c |
| F14 | Schema migration — 49 missing DB columns | Batch ALTER TABLE statements applied | 6aaf0c8 |
| F15 | Currency/tax data bug — all outlets showing INR/India/GST 18% instead of AED/UAE/VAT | Database UPDATE to correct outlet settings | 2026-04-09 |
| F16 | /cash page crash (React error boundary) | Added null guards for all data access | 8b3051c |
| F17 | /kitchen-board crash (corrupted file from commit 28a2ba2) | Restored file + added null guards for ticket item data | 8b3051c |

## Conventions

- **B#** = BLOCKING (open)
- **M#** = MEDIUM (open)
- **L#** = LOW (open)
- **F#** = FIXED (resolved, deployed)
- **INV-#** = INVALID (closed without code change)
- **Sub-identifiers** (e.g., B1a, B1b, B1c, M3b) are used when a single tracked bug is split into multiple fixable parts after deeper recon. Shipped sub-items keep their sub-identifier in the FIXED table (not renumbered as F#) so the relationship to the parent bug stays visible.
- Identifiers are stable once assigned. Do not renumber when adding new bugs — append.

## Adding a new bug

1. Assign next available identifier in the appropriate severity tier.
2. Add row to the relevant OPEN table.
3. Update the Summary counts.
4. Update the Last updated date.
5. Commit with message `docs: track <ID> in bug inventory`.

## Resolving a bug

1. Move the row from OPEN to FIXED (or RESOLVED — INVALID).
2. Add fix commit hash (or resolution note for invalid bugs).
3. Update the Summary counts.
4. Update the Last updated date.
5. Commit with the same commit that contains the fix, or a follow-up docs commit if resolution is documentation-only.
