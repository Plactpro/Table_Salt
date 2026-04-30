# Table Salt — Current-state Backlog

**Date:** 2026-04-29 PM
**Branch:** main, HEAD `8e9e9fa`

Compiled from `audit/02-new-blockers-recon.md`, `audit/FINDINGS.md`, `audit/OPEN-QUESTIONS.md`, `audit/00-orientation.md`, `docs/audits/bug-inventory.md`, and `git log --oneline -50`. `table-salt-bug-inventory-2026-04-18.md` does not exist; closest equivalent is `docs/audits/bug-inventory.md` (last updated 2026-04-22).

---

## Done

Items that have shipped to main this audit cycle, newest first.

| Item | Commit | Description |
|---|---|---|
| PR #14 follow-ups doc | `8e9e9fa` | docs(audit): PR #14 follow-ups — sheet visual sweep, click-outside disabled |
| PR #14 | `a58f26c` | fix: Sheet close button visible above sticky headers (z-20 + pr-12) |
| PR #13 | `bdd82ac` | fix(BL-1) Round 3: guard `getEventIcon` and PrintHistory filter callbacks against undefined `action` |
| Protocol-mismatch ticket doc | `112d1ea` | docs(audit): timeline icon protocol mismatch follow-up recorded |
| PR #12 | `ccac6d0` | fix(BL-1) Round 2: flatten timeline envelope at TicketDetailDrawer useQuery |
| BL-1 R2 recon doc | `2d215f7` | docs(audit): BL-1 Round 2 recon — timeline envelope shape mismatch |
| PR #11 | `66c8912` | merge: backfill script committed (script source only, not yet executed) |
| Backfill script | `fb8a4ff` | feat(scripts): backfill delivery_orders companion rows for orphan POS-Delivery orders |
| PR A recon doc | `0a543d2` | docs(audit): PR A recon — backfill migration scope, Node script + encryption parity |
| 404 SQL probe doc | `07b781a` | docs(audit): 404 SQL probe results + Railway console quirk (42 orphans, 18 operational) |
| 404 recon round 1 | `44415a3` | docs(audit): 404 recon round 1, hypothesis confirmed + Option 4 recommendation |
| EOD 2026-04-28 doc | `5765a8d` | docs(audit): EOD 2026-04-28 + 404 finding from BL-3 verification |
| Regression test plan | `dd74bb7` | docs: regression test plan and blockers (no tests written, blocked on local env) |
| PR #10 | `5ca3899` | fix(BL-1) Round 1: null-coalesce `ticket.status` to prevent toLowerCase crash |
| PR #9 | `f4a93cb` | fix(BL-3) round 2: cast `order_type` to text in NOT EXISTS subquery |
| PR #8 | `3bc6817` | chore(BL-3): error logging on all 6 catch blocks in delivery.ts |
| PR #7 | `f0531bb` | fix(BL-3) round 1: cast `order_type` to text in IN clause |
| PR #6 | `d720247` | fix(BL-2): set `userInitiatedPaymentRef` in handleProceedToPayment |
| PR #5 | `3e54dd2` | fix(X-02): pass `tenantId` to getOrderItemsByOrder in bill creation |
| Phase 0 + recon | `5a31c08` | audit: Phase 0 orientation + 4-blocker recon, anchor scratch ignore |
| .replit untrack | `b6f5e72` | chore: untrack .replit and add to .gitignore |
| PR #2 | `0c878b4` | fix(B1a-01): invalidate board-view query on KDS realtime events |
| PR #1 | `425ae89` | fix(B1b): cast order_status enum to text for archive scheduler WHERE |

Earlier shipped (April 16–22, abridged):
- F-225 Day 4 / F-224 Railway builder pin (`056ab59`), F-223 SSL no-op revert (`e6abaec`)
- M1 (`b9db234`), M3 (`7771254`), B1a/B1b (`4e67108`, `05931a9`)
- F1–F17 (a024e11, 356c0e2, 3d2a86f, 317579c, 6aaf0c8, 8b3051c — see `docs/audits/bug-inventory.md` "FIXED" tables)
- A-01 compose Postgres hardening (`6091078`), A-04 split tsconfig server/client (`72718ee`)

---

## Open

### BLOCKING — prevents end-to-end testing or launch

- **Run `scripts/backfill-delivery-orders-from-pos.ts` against production** for the 18 operational orphan POS-Delivery orders across two tenants — script committed in PR #11 (`fb8a4ff`) but not yet executed; testers cannot click "Assign Agent" on existing POS-Delivery orders until this runs. Source: `audit/02-new-blockers-recon.md` "404 SQL Probe Results" + "PR A Recon".
- **PR B — auto-create `delivery_orders` row inside `POST /api/orders` for delivery-shaped order types.** Without this, every new POS-Delivery order created after the backfill becomes a fresh orphan and re-introduces the 404 on Assign Agent / Mark Ready / Dispatch. Source: `audit/02-new-blockers-recon.md` "404 SQL Probe Results" → "Decision: PR A first because data-only. PR B second once PR A is verified."

### ANNOYING — real bugs that affect users

- **BL-1 schema follow-up.** `orders.status` should get `.notNull()` and a backfill `UPDATE orders SET status = 'new' WHERE status IS NULL;`. PR #10 was defensive client coercion only. Source: EOD addendum line 1285.
- **Timeline icon/action protocol mismatch.** Server `events.push({icon: ...})` vs client `TimelineEvent.action`; even when names align, value namespaces differ (`order_created` vs `created`, `kitchen_sent` vs `kot_sent`, etc.). Result: every event renders the `📌` fallback icon. Source: `audit/02-new-blockers-recon.md` "Addendum 2026-04-29 PM-3".
- **BL-1 Round 2 recon findings 2–5.** `createdAt` format Invalid Date crash, `ticket.id.slice` on null id, filter dropdown emits non-enum values causing 500, server field-name mismatches (`channel`/`orderType`, `staffName`/`waiterName`). Source: EOD addendum line 1287.
- **Order_type enum runtime migration → versioned `.sql` migration.** Current state has swallow-catch attempts at `server/index.ts:450-458` and a duplicate at `server/admin-migrations.ts:4197`; BL-3 fixes are symptom-only at the SQL cast level. Source: EOD addendum line 1286.
- **Regression test plan committed but no tests written.** Blocked on local env. Source: commit `dd74bb7`.
- **F-225 tenant-tz-helper branch — ship/finish/abandon decision pending.** 6 commits of real implementation work (date-fns-tz, helper module with tests, escpos-builder/printer-service updates, calendar wiring, Dockerfile TZ=UTC). Source: EOD addendum line 1284.
- **M2 — UPI payment not implemented.** Placeholder "Show UPI QR" in pos.tsx payment modal. Source: `docs/audits/bug-inventory.md` OPEN-MEDIUM.
- **M4 — Addon KOT creates new order, not appended.** Billing must aggregate parentOrderId chain; verification pending. Source: `docs/audits/bug-inventory.md` OPEN-MEDIUM.
- **M5 — No delivery address field in POS UI.** `deliveryOrders.customerAddress` exists but is never captured for POS-originated delivery orders. Source: `docs/audits/bug-inventory.md` OPEN-MEDIUM.
- **L6 — 328 pre-existing TypeScript errors** in server/** and shared/**, no impact at runtime (esbuild build skips strict check). Needs dedicated `triage/ts-errors` branch. Source: `docs/audits/bug-inventory.md` OPEN-LOW.

### COSMETIC — visual or polish

- **PR #14 Ticket 1: Sheet consumers visual sweep.** 12 of 13 Sheet consumers unaudited; any header content extending to the right edge will overlap the now-visible X close button. Source: `audit/02-new-blockers-recon.md` "PR #14 follow-ups" Ticket 1. (Listed here in addition to FOLLOW-UP because it is purely visual.)
- **L4 — Duplicate delivery endpoints.** `/accept` vs `/accept-delivery`, `/reject` vs `/reject-delivery` — older versions appear leftover. Source: `docs/audits/bug-inventory.md` OPEN-LOW.
- **B1e — kitchen.tsx does not subscribe to `order:stale_archived`.** Live update missed when B1b nightly scheduler archives a stale order. Cosmetic — next query invalidation cycle picks it up. Source: `docs/audits/bug-inventory.md` OPEN-LOW.

### CONFIG — A-numbered audit items

The A-series tracks repo-hygiene / infrastructure items from earlier sessions.

- **A-02 — `.sql` gitignore rule** (referenced in `docs/audits/f225-day4-recon-summary.md:64`). Status not explicitly recorded; assume tracked but unverified.
- **A-06 — docker-compose `mem_limit` / `cpus`.** In-progress on a stash entry (`cc635df`); not yet on its own branch or merged. Source: git stash log.
- **A-14 — QR public surface audit pending.** Referenced in `docs/audits/2026-04-22-fix-plan.md:358`. Cluster of QR endpoints awaits a dedicated audit pass.
- **A-01 (shipped, `6091078`) and A-04 (shipped, `72718ee`)** are listed in Done above; included here for completeness so the A-series is contiguous.

### FOLLOW-UP — items spawned by other PRs

- **PR #14 Ticket 1: Sheet consumers visual sweep** (also listed under COSMETIC). Source: `audit/02-new-blockers-recon.md` "PR #14 follow-ups".
- **PR #14 Ticket 2: Click-outside-to-close disabled globally** (`onInteractOutside={(e) => e.preventDefault()}` at `client/src/components/ui/sheet.tsx:64`). Open product question, not a code fix yet. Source: same.
- **F-016-FU — KDS wall WebSocket frontend update.** Once F-016 server-side bypass is fully removed, frontend at `client/src/pages/dashboards/kds-wall.tsx:834-844` and `kitchen.tsx:1639` must stop passing `?tenantId=`. Blocks KDS wall UI until updated. Source: `audit/FINDINGS.md` row F-016-FU.
- **F-023-FU — Tenant-fields allowlist enforcement.** Add a unit test that fails if the `tenants` table gains a column not explicitly in `OWNER_EDITABLE_FIELDS` or a documented `BLOCKED_FIELDS` list. Source: `audit/FINDINGS.md` row F-023-FU.
- **F-189-FU — Aggregator webhook HMAC over re-stringified JSON, not raw bytes.** May break if the aggregator signs the raw pre-parse body. Verification needed against Zomato/Swiggy/Talabat/UberEats docs. Source: `audit/FINDINGS.md` row F-189-FU.
- **F-189-FU2 — Razorpay HMAC uses `===` instead of `crypto.timingSafeEqual`.** Vulnerable to timing attacks. Source: `audit/FINDINGS.md` row F-189-FU2.
- **M3b — Force-close audit log.** When a manager clicks Force Close past the M3 guard, server should log a `SHIFT_FORCE_CLOSED` audit event with open-item counts. Deferred until owner verifies the M3 guard. Source: `docs/audits/bug-inventory.md` OPEN-MEDIUM.
- **M1b — Server-side table-claim race.** No advisory lock or partial unique index on `(tenant_id, table_id) WHERE status IN ('new', 'in_progress', 'ready')`. Two concurrent POSTs can still double-book. Source: `docs/audits/bug-inventory.md` OPEN-MEDIUM.
- **B1c — Auto "ready → served" transition policy.** After how long should a KDS ticket stuck in `ready` auto-transition to `served`? Recommendation: 6h. Owner decision pending. Source: `docs/audits/bug-inventory.md` OPEN-MEDIUM.
- **B1d — Cross-outlet KDS scoping.** Tickets currently tenant-scoped only; multi-outlet tenants may see all-outlet ticket bleed. Deferred until multi-outlet customers exist. Source: `docs/audits/bug-inventory.md` OPEN-LOW.

### Out of scope for this backlog

- The 200+ findings F-001 through F-231 in `audit/FINDINGS.md` (Phase 1–9 systemic audit). Most are open and tracked there; not duplicated here. Includes all critical IDOR, money/currency, auth, real-time, and infra findings from the prior phased audit pass.
- 80+ open questions Q-001 through Q-082 in `audit/OPEN-QUESTIONS.md`.

---

## Recently completed (2026-04-30)

- Tester verification of PR #9 (BL-3 Round 2 — `order_type` cast fix in NOT EXISTS subquery on /delivery hub) — PASS, confirmed by external testers.
- Tester verification of PR #13 (BL-1 Round 3 — `getEventIcon` and PrintHistory filter callback guards on /tickets drawer) — PASS, confirmed by external testers.

---

## Next

Top 3 to consider next:

1. **M5 — POS UI delivery address field.** Adds a single-line text input to the POS delivery flow when orderType is delivery, mirroring the existing phone-order pattern at phone-order.tsx:461-474. Required prerequisite for PR B; without it, PR B would have to fall back to a "No address" placeholder, immortalizing the design defect. See audit/m5-recon.md for full implementation sketch.

2. **PR B — auto-create delivery_orders row in POST /api/orders.** Closes the POS-Delivery 404-orphan gap. Becomes simpler once M5 ships (the QQ-1 (a)+(c) hybrid disappears because req.body.deliveryAddress will always be present). See audit/pr-b-recon.md for full recon.

3. **Backfill script (scripts/backfill-delivery-orders-from-pos.ts) — production run.** Reconsider whether to run at all. The 18 existing orphans are test data from manual testers, not customer data. Cleaner to delete the test orders directly than to backfill them with junk addresses. Decision deferred until after M5 + PR B ship.
