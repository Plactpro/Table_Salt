# Table Salt — Current-state Backlog

**Date:** 2026-04-30 PM
**Branch:** main, HEAD `1a9e30c`

Compiled from `audit/02-new-blockers-recon.md`, `audit/FINDINGS.md`, `audit/OPEN-QUESTIONS.md`, `audit/00-orientation.md`, `docs/audits/bug-inventory.md`, and `git log --oneline -50`. `table-salt-bug-inventory-2026-04-18.md` does not exist; closest equivalent is `docs/audits/bug-inventory.md` (last updated 2026-04-22).

---

## Done

Items that have shipped to main this audit cycle, newest first.

| Item | Commit | Description |
|---|---|---|
| Audit gitignore exception | `1a9e30c` | chore: allow audit/*.sql under existing *.sql rule, add orphan delivery recon |
| PR #18 (PR B) | `49f8687` | feat(orders): auto-create delivery_orders row for POS-delivery orders (PR B) |
| PR #17 (QQ-7) | `36ccfe0` | fix(security): add waitlist_entries to encryption key rotation endpoint (QQ-7) |
| PR #16 (M5) | `66a1906` | feat(pos): add delivery address field for delivery orders |
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

- **Orphan `delivery_orders` cleanup.** TablePlus recon (2026-04-30 PM) confirmed 53 orphan orders across 2 test tenants (`6a8281c4-8e66-4214-84ad-2d0e3231cc76` "Updated Tenant Name Test" and `74f513e3-9db5-4a9b-b427-6a4c2a6eb082` "Table Salt Platform"). With_bills=32, with_items=51, total_items=83. Recommendation locked: **delete-not-backfill** (test data, not real customer orders). Recon SQL committed at `audit/orphan-delivery-orders-recon.sql`. Cleanup script to be drafted 2026-05-01 morning before regression sweep starts. Supersedes prior "run backfill script" item.
- **Operator action before encryption rotation:** screenshot Railway's "last updated" timestamp on `ENCRYPTION_KEY`, `SESSION_SECRET`, `VAPID_PRIVATE_KEY`. If any >= 2026-04-15, the corresponding rotation phase may be skippable. See `audit/qq-1-session-secret-status.md`. (Rotation deferred from 2026-04-30 to 2026-05-01; backup pre-task now resolved per Pro upgrade — see `audit/incident-2026-04-30-railway-pro-upgrade.md`.)

### ANNOYING — real bugs that affect users

- **BL-1 schema follow-up.** `orders.status` should get `.notNull()` and a backfill `UPDATE orders SET status = 'new' WHERE status IS NULL;`. PR #10 was defensive client coercion only. Source: EOD addendum line 1285.
- **Timeline icon/action protocol mismatch.** Server `events.push({icon: ...})` vs client `TimelineEvent.action`; even when names align, value namespaces differ (`order_created` vs `created`, `kitchen_sent` vs `kot_sent`, etc.). Result: every event renders the `📌` fallback icon. Source: `audit/02-new-blockers-recon.md` "Addendum 2026-04-29 PM-3".
- **BL-1 Round 2 recon findings 2–5.** `createdAt` format Invalid Date crash, `ticket.id.slice` on null id, filter dropdown emits non-enum values causing 500, server field-name mismatches (`channel`/`orderType`, `staffName`/`waiterName`). Source: EOD addendum line 1287.
- **Order_type enum runtime migration → versioned `.sql` migration.** Current state has swallow-catch attempts at `server/index.ts:450-458` and a duplicate at `server/admin-migrations.ts:4197`; BL-3 fixes are symptom-only at the SQL cast level. Source: EOD addendum line 1286.
- **Regression test plan committed but no tests written.** Blocked on local env. Source: commit `dd74bb7`.
- **F-225 tenant-tz-helper branch — ship/finish/abandon decision pending.** 6 commits of real implementation work (date-fns-tz, helper module with tests, escpos-builder/printer-service updates, calendar wiring, Dockerfile TZ=UTC). Source: EOD addendum line 1284.
- **M2 — UPI payment not implemented.** Placeholder "Show UPI QR" in pos.tsx payment modal. Source: `docs/audits/bug-inventory.md` OPEN-MEDIUM.
- **M4 — Addon KOT creates new order, not appended.** Billing must aggregate parentOrderId chain; verification pending. Source: `docs/audits/bug-inventory.md` OPEN-MEDIUM.
- **L6 — 328 pre-existing TypeScript errors** in server/** and shared/**, no impact at runtime (esbuild build skips strict check). Needs dedicated `triage/ts-errors` branch. Source: `docs/audits/bug-inventory.md` OPEN-LOW.
- **GitHub squash-merge auto-injects `Co-authored-by: TOTCI2026 <arunkumar.s@totci.ae>` trailer** despite locked workflow rule against it. Confirmed on PR #17 and PR #18 — two consecutive squash-merges, same trailer, so it's a GitHub repo-settings UI behavior, not user error. Investigate: disable in repo settings (Pull requests → Allow squash merging → trailer config) OR update the workflow rule to accept-and-document the trailer. Until resolved, every squash merge will keep injecting it.
- **Triage 3 untracked pre-existing `audit/*.sql` files** surfaced when the gitignore exception (`1a9e30c`) re-included them: `audit/cashier-seed-preflight-2026-04-21.sql`, `audit/cashier-users-query-2026-04-21.sql`, `audit/f225-day4-audit.sql`. Pre-existing, not from today. Read each, decide commit-or-delete.
- **Configure scheduled backups on Railway.** Pro plan upgrade (2026-04-30) enables manual snapshots; first taken 2026-04-30 07:00 UTC (149 MB incremental). Automated/scheduled snapshots still not configured. RPO/RTO not formalized, restore procedure not written. See `audit/incident-2026-04-30-railway-pro-upgrade.md`.
- **Plaintext PII at rest.** `delivery_orders.driver_phone`, `delivery_orders.driver_name`, `delivery_orders.tracking_notes` are stored plaintext at rest. Should be added to `DELIVERY_PII_FIELDS` in a follow-up PR. See `audit/encryption-key-rotation-recon.md` Risk 5.
- **SESSION_SECRET rotation status conflict.** Three audit docs disagree on whether rotation happened. `audit/FINDINGS.md` F-217/F-218 say "Mitigated (rotated 2026-04-15)". `audit/launch-checklist.md` Severity 1 #1 lists it as still pending. `audit/OPEN-QUESTIONS.md` Q-006/Q-078 still open. Reconcile before Phase 5 of any rotation procedure. See `audit/encryption-key-rotation-recon.md` QQ-1.

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
- PR #16 (M5 — POS UI delivery address field, `66a1906`) — shipped + tester-verified.
- PR #17 (QQ-7 — `waitlist_entries` added to encryption key rotation endpoint, `36ccfe0`) — shipped, awaits verification at rotation time.
- PR #18 (PR B — auto-create `delivery_orders` row in `POST /api/orders` for POS-delivery, `49f8687`) — shipped + smoke-tested in production. Happy-path (test order INV-2026-0085) and validation-path (empty address blocked) both PASSED.
- Audit gitignore exception (`1a9e30c`) — `!audit/*.sql` added under existing `*.sql` rule so recon SQL can be tracked; first tracked file is `audit/orphan-delivery-orders-recon.sql`.
- Railway Pro plan upgrade (~midday UAE time) caused unexpected ~30-minute service-stop on both Postgres and Table_Salt. Recovered cleanly via "Deploy database" + redeploy; volume intact, no data loss. Backup capability now available; first manual snapshot taken 2026-04-30 07:00 UTC (149 MB). See `audit/incident-2026-04-30-railway-pro-upgrade.md`.
- TablePlus recon against production for orphan `delivery_orders`: 53 orphans across 2 test tenants confirmed. Recommendation locked: delete-not-backfill. Cleanup script drafting 2026-05-01.
- Encryption key rotation deferred from 2026-04-30 to 2026-05-01. Procedure in `audit/encryption-key-rotation-recon.md` unchanged; backup pre-task now resolved.

---

## Next

Top 3 to consider next (2026-05-01):

1. **Encryption key rotation execution.** Run the procedure in `audit/encryption-key-rotation-recon.md` against production. Backup pre-task now resolved (manual snapshot 2026-04-30 07:00 UTC, 149 MB). Waitlist rotation gap now covered (PR #17). Operator pre-task: confirm Railway env-var "last updated" timestamps on `ENCRYPTION_KEY`, `SESSION_SECRET`, `VAPID_PRIVATE_KEY` per `audit/qq-1-session-secret-status.md`. Highest-leverage Severity-1 fix remaining.

2. **Orphan `delivery_orders` cleanup.** Draft a delete-not-backfill SQL script for the 53 orphans across 2 test tenants confirmed by TablePlus recon (`audit/orphan-delivery-orders-recon.sql`). Wrap as `BEGIN; ... ROLLBACK;` first for review, then run as `BEGIN; ... COMMIT;` once approved. Aim to land before regression sweep so test data doesn't pollute the verification.

3. **Regression sweep / tester re-verification.** Re-test PRs #16, #17, #18 in dogfood, plus passive verification that PR #9 and PR #13 fixes still hold. PR #17's verification happens organically during the rotation in #1.
