# Session Notes — 2026-04-30

**Author:** Arunkumar S, with Claude
**Session shape:** Long day (4-5 hours), three production deploys, one Railway plan upgrade, destructive cleanup against production, tester regression triage, audit doc reconcile.
**File path when committed:** `audit/session-notes-2026-04-30.md`

---

## Part 1 — Operating patterns (generalized)

These are patterns this session reinforced. They apply beyond today.

### Pattern 1 — The "did the right thing run?" trap

**What it is:** TablePlus (or any GUI SQL client) executes only what's selected, or only the statement under the cursor. The output indicates the statement that actually ran, not the script you intended to run. If the script body never executed, you'll see the equivalent of `Query 1 OK: SET` — the result of a single line — and conclude wrongly that the script ran successfully.

**Why it bites:** Outputs that look successful (no errors, "OK" status) hide the fact that nothing meaningful happened. By the time you notice ("wait, where are the assertion NOTICES?"), you may have already moved on or, worse, started executing the next phase against a state that hasn't actually changed.

**What works:**

- Always verify selection is whole-script before clicking Run. `Cmd/Ctrl+A` to select all, then `Cmd/Ctrl+Enter`.
- Build self-announcement into the script as the LAST visible thing. A `RAISE NOTICE '====== CLEANUP RAN IN REAL MODE ======';` or, better, a final `SELECT 'CLEANUP COMMITTED. 53 deleted.' AS status;` that puts the result in the Data tab (the default tab) so you don't have to click Message tab to know what happened.
- If output looks suspicious or absent, verify with a separate read-only SELECT against production state before assuming anything.

**The deeper lesson:** Operational uncertainty during production work is the failure mode to eliminate. "I think it worked but I'm not sure" is the worst possible state. Stop, verify, then proceed.

---

### Pattern 2 — Pre-write before destructive operations

**What it is:** Before any destructive prod operation (DELETE, DROP, env-var rotation, mass UPDATE), do these in order: (1) recon to count impact, (2) snapshot of current state, (3) dry-run inside a transaction with `BEGIN ... ROLLBACK`, (4) review dry-run output, (5) flip to `COMMIT`, (6) verify post-state with a separate read-only query.

**Why it works:** Each step is reversible up until step 5. If any step surfaces a surprise, you back out without consequence. The snapshot in step 2 means even step 6 finding a bad outcome is recoverable.

**Anti-pattern to avoid:** Running the "real" version of a destructive script without dry-run first because "we're confident it'll work." Confidence is not a substitute for the dry-run output. The cost of dry-run is 30 seconds; the cost of a wrong COMMIT can be hours of recovery.

**Specific shape that works in this codebase:**

- Recon SQL committed to `audit/*-recon.sql`, run via TablePlus
- Cleanup SQL committed to `audit/*-cleanup.sql` with the comment-toggle pattern (`ROLLBACK;` / `-- COMMIT;` at the bottom, operator flips to `-- ROLLBACK;` / `COMMIT;` for the real run)
- Pre-cleanup snapshot via Railway Backups → New backup before flipping the toggle
- Post-cleanup verification SELECT in a fresh tab

---

### Pattern 3 — Search before asking

**What it is:** When the user references something, the impulse is to ask clarifying questions ("which view? what symptom? which tester?"). Often the answer is already in conversation history, prior session notes, or the audit registry — and asking instead of searching wastes user time and signals that earlier context was lost.

**Why it bites:** The user has to repeat themselves, which is mildly demoralizing and concretely time-costly. The repetition also tends to be paraphrased, which loses fidelity from the original report.

**When to search vs. ask:**
- **Search first** for: identifiers (F-IDs, commit SHAs, branch names), dates, prior session events, anything that already has a place in an existing system.
- **Ask first** for: judgment calls (what tone? which tenant? prefer fast or thorough?), domain knowledge that lives only in user's head.

**The test:** "Could a 30-second search produce the answer?" If yes, search. If no, ask.

---

### Pattern 4 — Identifier collisions are silent failures

**What it is:** Assigning a new ID (F-number, ticket ID, commit message tag) without checking the existing registry produces silent collisions. Same ID, two meanings, hard to untangle later. `git grep F-226` returns both occurrences. The audit trail becomes ambiguous.

**Why it bites:** Collisions don't produce errors. They produce subtle confusion in future sessions. By the time someone notices ("which F-226 did this commit reference?"), the cost to disambiguate is high.

**What works:** Before assigning any new ID, read the most recent registry entry and pick the next free number. Better: have the tool you're using check first ("read FINDINGS.md, tell me the next free F-number, then I'll write the new entries").

---

### Pattern 5 — Working tree discipline (one commit per intent)

**What it is:** Every commit today named exactly which paths to stage (`git add audit/00-backlog.md audit/regression-2026-04-30-findings.md`), never `git add audit/`. This held the line against accidentally sweeping in pre-existing untracked files that were flagged for separate triage.

**Why it works:** The implicit assumption "I know what's untracked" is wrong half the time. Specific paths are self-checking — if a file is staged that shouldn't be, you see it in the diff stat before commit.

**Cost of not doing it:** Audit files commit messages that say "X" but actually contain X + 4 other unreviewed things. Future-you reading the diff thinks the unreviewed files were intentional, propagates them as accepted state.

---

### Pattern 6 — Push at the natural break, not at the marathon end

**What it is:** Push commits after a logically-grouped batch lands, not after every commit and not at "end of day."

**Why it works:** Mid-session push gives the next session a clean origin/main. End-of-day push tends to get skipped because the operator wants to be done. End-of-session "I'll push tomorrow" creates a small mental task that compounds across sessions.

**Today's example:** Pushed at hour 3 (after audit reconcile + cleanup + regression findings — the four-commit batch). Then pushed again at hour 4 (after legal-pages-recon + F-242 backlog entry — the two-commit batch). Each push was its own small operation: pre-verify range, push, watch Railway 3 min, confirm. Both were boring successes.

---

### Pattern 7 — Pushback on production-risk is non-overridable, except by explicit acknowledgment

**What it is:** Some workflow rules ("don't run destructive ops at end of long day", "don't push without verifying", "don't bypass dry-run") are designed to be hard to override. They protect against decision-fatigue mistakes. The user can override, but only by explicitly acknowledging the pushback ("I see your concern, proceeding anyway") — not by just brushing past.

**Why it works:** The acknowledgment makes the override deliberate rather than reflexive. It also creates a record: if the override produces a bad outcome later, you know where the decision was made.

**Today's example:** The "all four options in 15 min" exchange. I pushed back with "that's not realistic for 15 min, here's the math." User said "60+ min". I pushed back again on continuing past hour 4. User said "OK". I asked which kind of OK. User said "Option B — proceed anyway, pushback noted." That's the right shape — explicit override, on the record.

---

## Part 2 — Today's session, specific events

Appendix to Part 1. Useful for future-Arun forgetting what specifically happened.

### Morning state (start of session)

Carried in from yesterday:
- Encryption rotation planned for today
- Backup capability not yet available (Railway Hobby plan)
- 2 unpushed audit commits from yesterday evening
- 4 untracked audit files pre-existing

### Hour 1 — Rotation halt, plan upgrade, outage, recovery

- Discovered Railway Backups tab requires Pro plan — rotation halted (no recovery path without snapshot capability)
- Decided to upgrade Hobby → Pro
- Both Postgres and Table_Salt services went offline ~30 min during the upgrade transition
- Recovery: verified postgres-volume metrics showed flat ~100 MB plateau (data intact), Settings tab confirmed mount path preserved, region preserved. Clicked "Deploy database" — Postgres came back online with all data. Then redeployed Table_Salt. Round-trip verified.
- First manual snapshot taken: 2026-04-30 07:00 UTC, 149 MB

### Hour 2 — PR B (auto-create delivery_orders)

- Pre-recon required local sync with the just-shipped audit doc commit
- Wrote PR B (single file: `server/routers/orders.ts`, +31 lines)
- Server-side validation (line 408) for `req.body.deliveryAddress` non-empty when orderType==="delivery"
- Try/catch insert to `delivery_orders` mirroring `service-coordination.ts:697-706`
- Fields: tenantId, orderId, customerId:null, customerAddress, customerPhone, status:"pending", estimatedTime:45, trackingNotes
- Locked product calls: `message` not `error` key per file precedent; console.error only (no new alert ID); `addrPresent` boolean instead of address preview (PII concern)
- Type-check baseline preserved (328 errors), npm test 182 pass
- Smoke-tested both paths in production: Test A (happy path) order INV-2026-0085 went through; Test B (validation) toast "Delivery address required" appeared. Test A order voided per cleanup decision.

### Hour 3 — Orphan recon

- Wrote `audit/orphan-delivery-orders-recon.sql` (read-only, BEGIN...ROLLBACK wrapped, PII-redacted)
- First needed to fix `.gitignore` which had blanket `*.sql` rule blocking it (originally for DB dumps). Added `!audit/*.sql` exception.
- TablePlus recon results:
  - **53 orphans** (not 18 as audit had assumed)
  - 2 tenants: `6a8281c4...` ("Updated Tenant Name Test", AED) with 52 orphans, `74f513e3...` ("Table Salt Platform", USD) with 1 orphan
  - Both confirmed test/demo via tenant lookup
  - Customer name patterns confirmed test data: `dgd ×5`, `yyy ×3`, `xvz ×3`, `dd ×3`, `JJJ`, `JIJ`, `ttt`, `wqr`, `xyz`, `vn`, `lun`, `Nan`, `abc` — mash-keyboard test entries
  - Q6 downstream: 32 with bills, 51 with items, 83 total order_items, 2 stock_movements
- Decision locked: delete-not-backfill, all 53 rows

### Hour 4 — Cleanup script + execution

- 6 FK constraints reference `orders.id`: `bills`, `delivery_orders`, `feedback`, `kot_events`, `order_items` (all NO ACTION), `stock_movements` (SET NULL)
- Phase 1B added: count rows in not-yet-quantified tables. Result: feedback=0, kot_events=1
- Cleanup script designed with: hard-coded tenant filter (defense in depth), text[] array materialization (no DDL), comment-toggle mode switch (TablePlus-compatible), three RAISE EXCEPTION assertions, idempotency guard at top
- Pre-cleanup snapshot: 2026-04-30 12:17 UTC, 149 MB
- Dry-run executed: all NOTICE lines matched expectations, transaction rolled back as designed
- Real-run executed: deleted 53 orders + 83 order_items + 32 bills + 1 kot_event + 0 feedback; 2 stock_movements rows had order_id set NULL via FK
- Post-cleanup verification: remaining_orphans=0, items_on_orphans=0, bills_on_orphans=0
- Dashboard verification: 335 → 299 orders (Δ=36), AED 16,538.18 → AED 15,078.70 (Δ=AED 1,459.48). Numbers moved proportionately.

### Hour 5 — Tester regression triage

- Tester results received via Excel: 80 of 116 tests run, PASS=54, FAIL=16, BLOCKED=7, SKIPPED=2, NOT RUN=1, pass rate 67.5%
- Critical findings identified:
  - F-232 — Shift indicator missing from POS header (tester report + Perplexity verify + owner manual confirm)
  - F-233 — Billing flow blocked, severity TBD pending owner reproduction
  - F-234 — Cross-user same-table claim creates duplicate orders (M1b promotion to BLOCKING)
  - F-235 — POS-Delivery Assign Agent 404 likely-resolved by today's cleanup
- Lower-priority bugs F-236 through F-241 documented
- F-242 — legal-pages-recon resurrected and committed (was sitting untracked from 2026-04-29)
- Two pushes to origin/main during session, both audit-only deploys, both boring success on Railway

### Specific operational mistakes I (Claude) made today

These are not user-facing problems — they're things I'd do differently next time.

1. **Misread Railway plan tier.** Claimed backups available on all paid plans; actually Pro-only. Corrected via web search after user pointed at the screenshot.
2. **Misread the file-creation preview as having duplicate columns.** The display rendered line numbers in a way that looked like duplicate code. The file was actually fine. Cost one round-trip.
3. **Wrote a recon prompt that violated CLAUDE.md Hard Rule 1** (direct DB connection). Claude Code correctly refused. Switched to documented SOP (SQL file in audit/, run via TablePlus).
4. **Asked clarifying questions instead of searching prior context** — twice. KDS recon framing (the bug was already mostly fixed 8 days ago), F-numbering on regression findings (I assigned F-226+ without checking existing FINDINGS.md, would have caused collision). User correctly pushed back both times.
5. **Sent "stop, don't run anything" alarm when production was actually fine.** The cleanup had committed cleanly; I just couldn't see the Message tab content from the screenshot. Cost user a verification cycle they didn't actually need.

### Things the testers should do differently next regression cycle

Process gaps in tester output, not Table Salt bugs:

1. Fill the Summary tab fields (tester names, hours worked, critical findings rows) — currently all blank
2. Populate the Issues Log sheet — testers used per-test Notes column instead. Fine for small batches, less useful for scanning failures.
3. Attach screenshot folder — every Notes entry referenced a screenshot, none were attached.
4. Don't mark tests as "did not record" — explicitly use SKIPPED or NOT RUN. 12 tests had NaN status.

A short WhatsApp message template covering these will help the next round.

### Useful artifacts produced today

- `audit/orphan-delivery-orders-recon.sql` — recon source-of-truth
- `audit/orphan-delivery-orders-cleanup.sql` — cleanup script with full RUN RESULTS comment block at bottom
- `audit/incident-2026-04-30-railway-pro-upgrade.md` — incident note for today's outage
- `audit/regression-2026-04-30-findings.md` — full regression triage doc
- `audit/legal-pages-recon.md` — fix shape locked for legal pages 404 (was already written 2026-04-29, just committed today)
- This file: `audit/session-notes-2026-04-30.md` — operating patterns + session events

### Tomorrow's Top-3 (per updated `audit/00-backlog.md`)

1. Encryption rotation execution (now genuinely unblocked)
2. F-233 billing reproduction + F-232 shift indicator investigation
3. F-234 M1b implementation (server-side advisory lock for cross-user same-table claim)

Plus housekeeping:
- Triage the 3 untracked SQL files (`cashier-seed-preflight-2026-04-21.sql`, `cashier-users-query-2026-04-21.sql`, `f225-day4-audit.sql`)
- Resolve Co-Authored-By trailer config (GitHub repo settings vs workflow rule update)

---

## Part 3 — Things to remember next time

- Wear the founder hat with discipline, but accept that the discipline rules can be overridden when the time math actually changes (e.g., "60-min cleanup" vs "3-hour cleanup" are different operations even though they accomplish the same end-state).
- Default to "stop and verify" when production state is uncertain. The cost of a 30-second verification query is always less than the cost of acting on a wrong assumption.
- Push commits at logical group boundaries, not at "end of day" — the latter tends to get skipped.
- Search first, ask second.
- Build self-announcement into destructive scripts so the operator never has to wonder "did it run?"
- Don't optimize for "look productive" at hour 5 of a long session. Optimize for "land cleanly."
