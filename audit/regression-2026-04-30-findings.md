# Regression Test Findings — 2026-04-30

**Test plan:** /mnt/user-data/uploads/2026-04-30-regression-test-plan__RESULT_.xlsx (received from testers EOD 2026-04-30)
**Testers:** Tester A (Nandhini), Tester B (Madhesh)
**Environment:** Production (www.inifinit.com)
**Coverage:** 80 of 116 tests run (69%)

## Headline numbers

| Status | Count |
|---|---|
| PASS | 54 |
| FAIL | 16 |
| BLOCKED | 7 |
| SKIPPED | 2 |
| NOT RUN | 1 |
| Did not record | 12 |
| **Pass rate (of run)** | **67.5%** |

## Critical findings

### F-232 — Shift session state not visible in POS header (NEW, MEDIUM)

**Reported by tester:** T-001/T-002 — "No 'Start Shift' appears anywhere on owner and manager login."
**Verification (Perplexity):** Logged in as Owner, navigated to POS. No Start Shift modal appeared (consistent with active session). No session timer or shift indicator visible in header either.
**Verification (owner manual):** Confirmed via direct screenshot. Header has Owner badge, status icons, notification bells, user avatar — but no shift name, no elapsed timer, no "Open Shift" indicator.

**Severity:** MEDIUM (UX gap, not operationally blocking). POS functions normally — orders flow, tables work, billing presumably works.

**Impact:** Staff cannot verify that a shift is open. Cannot see shift duration. May affect end-of-day reconciliation if shift state tracking has deeper issues than UI alone.

**Investigation needed:**
- Read client/src/pages/modules/pos.tsx and the POS header component to confirm whether the elapsed-time timer (per useEffect at section 1.3 of audit/table_salt_pos_audit.md) is still being rendered
- Read whatever component renders the header for POS layout
- Check whether session state is non-null (Scenario A — timer just missing) or null (Scenario B — modal logic regression, more concerning)

Defer fix until investigation determines scope.

### F-233 — Billing flow blocked (NEW, severity TBD)

**Reported by tester:** T-070 BLOCKED, T-071/072/073/076 BLOCKED dependent. T-074/075 FAIL "No manual option is available to set the discount."
**Tester quote:** "Payment process is not working."
**Verification:** NOT YET PERFORMED by owner. Tester gave one-line description, no screenshots, no specifics on what "not working" means.

**Severity:** TBD pending owner reproduction. If real, launch-blocker (payment is revenue path). If environmental (Stripe not configured per known state), much lower.

**Investigation needed:** Owner manually reproduces:
1. Create or find dine-in order in `served` or `ready` status
2. Click Bill, navigate to /pos/bill/:orderId
3. Try Cash payment specifically (not Stripe — Stripe known broken per T-027 = Stripe not configured)
4. Document exactly what fails: page error, modal stuck, button doesn't fire, etc.

### F-234 — Cross-user same-table claim creates duplicate orders (CONFIRMED, HIGH)

**Reported by tester:** T-101 (Joint Test) FAIL — "The table appears free for both users, and when orders are placed simultaneously for the same table, the order is created for both the users with the same table number"

**Severity:** HIGH (data corruption shape — two orders on one table is a real-world operational disaster).

**Status:** This is M1b (server-side advisory lock for table claim) which was deferred from 2026-04-22 fix cycle. M1 client-side guard works for same-user case (tabs[] + heldTabs[]) but does not protect cross-user case. M1b remains the canonical fix path.

**Action:** Promote M1b from deferred to launch-blocking. Add to audit/00-backlog.md BLOCKING list. Schedule for implementation BEFORE first paying customer.

### F-235 — POS-Delivery Assign Agent 404 — likely resolved (LIKELY RESOLVED)

**Reported by tester:** T-061 SKIPPED — "Detail panel opens. Customer info shows. Assign Agent shows 404."

**Severity:** LIKELY RESOLVED — tester ran this test before today's afternoon orphan cleanup. The 53 orphan orders deleted at 14:35 UTC included the kind of POS-delivery orders that lacked delivery_orders coordination rows. PR #18 (PR B, 49f8687) auto-creates those rows for new orders. Tester likely tested an orphan; orphan no longer exists.

**Action:** Tomorrow's regression sweep retests with a NEW POS-delivery order created post-cleanup. If it still 404s, escalate to launch-blocker. If passes, mark T-061 resolved.

## Lower-priority findings (real bugs, non-blocking)

| ID | Test ID | Area | Symptom |
|---|---|---|---|
| F-236 | T-010 | POS / Move table | Server transfer-table works (PR #16/PR-009 fix); client UI requires manual refresh |
| F-237 | T-033 | POS / Held orders | Missing delete confirmation dialog |
| F-238 | T-051 | Tickets / Print | Reprint fails: "Could not complete reprint action" |
| F-239 | T-053 | Tickets / Filters | Status filters non-functional |
| F-240 | T-062 | Delivery / Online | Aggregator metadata not visible in detail panel |
| F-241 | T-103 | Sessions / Shift | "Manager do not have shift" — investigate shift permission scoping |

## Working-as-designed (testers misinterpreted as bugs)

| Test ID | Area | Note |
|---|---|---|
| T-012 | POS / Tabs | "Two tabs same table" still happens — KNOWN, M1 client guard same-user only, M1b (F-234) fixes cross-user |
| T-036 | POS / Tabs | No new-tab button after 6 tabs — working-as-designed cap (UX could be clearer; not an actionable bug, no F-ID) |
| T-087 | Settings / Users | Owner can't delete users — only superadmin can deactivate (intentional per current RBAC) |
| T-102 | Concurrency / Orders | Cross-tester recall blocked — by design, only waiter or manager-role can recall |

## Environment / setup, not bugs

| Test ID | Issue |
|---|---|
| T-027 | Stripe 503 — Stripe not configured (known: keys not yet live) |
| T-077 | Printer not configured — env |
| T-080 | No cashier account — tester adapted with different role |
| T-088 | Branch count display — tester couldn't verify count vs DB |

## Process gaps in tester output

These are NOT bugs in Table Salt; they are gaps in how testers reported.

1. **Issues Log sheet empty.** Per-test Notes used instead. Acceptable for this batch size, but Issues Log was the intended consolidated view.
2. **Summary sheet not filled.** Tester names, hours, critical findings rows all blank.
3. **No screenshots provided.** Tester reports referenced screenshots in Notes column but no folder attached.
4. **12 tests have NaN status — neither run nor explicitly marked.**

For next regression cycle: enforce Summary tab fill-in as condition of "test cycle complete." Provide a screenshot attachment template.

## Tomorrow's work list (in priority order)

1. **Manually reproduce F-233 (billing).** If real, becomes launch-blocker. If environmental (Stripe-only), close with note. ~10 min.
2. **Investigate F-232 (shift indicator).** Read pos.tsx header component, determine if Scenario A (missing UI) or Scenario B (session logic regression). ~30 min recon.
3. **Promote F-234 (M1b) to BLOCKING in 00-backlog.md.** Schedule actual M1b implementation. ~5 min doc, +N hours implementation later.
4. **Verify F-235 (Assign Agent) with fresh POS-delivery order.** If passes, mark resolved. If fails, escalate. ~10 min.
5. **Schedule lower-priority bugs (F-236 through F-241) for individual recon/fix branches.** Not blocking; backlog grooming.
