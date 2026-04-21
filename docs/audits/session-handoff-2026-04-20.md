# Session Handoff — 2026-04-20

**Duration:** ~5 hours
**Starting state:** fix/F-225-tenant-tz-helper at 979e5f1, production on d1b6014 (unchanged)
**Ending state:** same branch at 979e5f1 (unchanged); two new main commits (984c3c2, 31f9785), unpushed

## Work completed

### 1. `/ticket-history` 404 — closed as INVALID

**User report:** Perplexity bug inventory listed `/ticket-history` 404 as a BLOCKING bug. Testers were seeing a NotFound page when typing that URL.

**Investigation:** Recon across all branches, all git history, deleted files, config files, and Replit-to-Railway migration commits. Results:
- Zero commits ever introduced `/ticket-history` as a URL literal
- Zero deleted files ever contained it
- Two migration commits (`e50fae1`, `9face04`) only touched Stripe / env config, never App.tsx
- Original product spec (`c36f4d3`, 2026-03-23) named the feature "Ticket History" as a UI label but specified `/api/tickets/*` as the path
- Every in-app link (sidebar, POS header, bill-view, dashboards) points correctly to `/tickets`

**Resolution:** INVALID. The canonical URL has always been `/tickets`. The tester was typing the sidebar label "Ticket History" as a URL slug during free exploration. No code change required.

**Tester guidance (new):** "Don't type URLs. Navigate by clicking sidebar items, buttons, and links. A URL you typed that doesn't exist isn't a bug."

### 2. `bug-inventory.md` created as single source of truth

**Commit:** `984c3c2` on main — `docs: add bug-inventory.md as single source of truth`

Establishes `docs/audits/bug-inventory.md` with:
- Summary counts (28 total, 17 fixed, 1 invalid, 11 open)
- 1 BLOCKING (KDS stale tickets), 5 MEDIUM, 4 LOW
- 17 fixes from April 16-17 (a024e11, 356c0e2, 3d2a86f, 317579c, 6aaf0c8, 8b3051c)
- 1 INVALID: `/ticket-history` 404
- Conventions for adding/resolving bugs going forward
- Identifiers: B# BLOCKING, M# MEDIUM, L# LOW, F# FIXED, INV-# INVALID

### 3. F-225 Day 3 part 2 deferred to L5

**Commit:** `31f9785` on main — `docs(inventory): track F-225 Day 3 part 2 as L5 (deferred)`

After recon, decided the events schema refactor is architectural polish, not a bug fix. F-225 Commit 2 already resolved the EV-01 symptom; the underlying schema shape (plain `timestamp` columns with a `setHours(23,59,0,0)` form default at events.tsx:528) is not breaking anything in production. Full migration would affect 8+ consumer files (server/routers/events.ts, server/storage.ts, client offers.tsx, staff.tsx, procurement.tsx, plus events.tsx calendar rendering) and is not justified pre-launch.

**Parked as L5 in bug-inventory.md** with full context so it can be picked up later.

### 4. F-225 Day 4 recon complete; audit script written

Planning-only session. No schema changes. Full recon documented in `docs/audits/f225-day4-recon-summary.md` (see that file for details).

**Audit SQL script:** `D:\audits\Table_Salt\audit\f225-day4-audit.sql` on local disk (342 lines). **Gitignored by design** — the `*.sql` exclusion in .gitignore (dating from audit item A-02, the April 17 database-backup purge) prevents SQL files from being committed. Script is read-only, wrapped in BEGIN/ROLLBACK, safe against production.

**Scope of Day 4:** Convert three columns from `timestamp` → `timestamptz`:
- `reservations.date_time`
- `events.start_date`
- `events.end_date`

### 5. Manual tester test plan v1.1 delivered

Excel workbook with 13 module sheets, 3 reference sheets, ~354 total test cases.

- **v1:** 324 cases covering happy paths, obvious negative cases, role-based access
- **v1.1:** +30 cases covering concurrent modification (8 two-device tests on POS), session/auth edge cases (6), unicode/edge data (4), date boundaries (3), double-submit prevention (4), tenant URL tampering (2), concurrent role changes (2), offline mid-payment (1)

**File:** `TableSalt_TestPlan_v1.1_2026-04-20.xlsx` on local disk. **Not in repo** — binary files don't belong in git. User responsible for backing up separately.

**Delivery status (morning of 2026-04-21):** to be sent to both testers via WhatsApp/email.

## Pushback and course corrections this session

- User pushed back on my initial "probably never existed" conclusion for `/ticket-history`; deeper investigation confirmed the same result definitively. Honest pushback, worth honoring.
- User changed A → B late in session for the v1.1 negative cases. I flagged the change-of-mind, got explicit confirmation, proceeded.
- I over-delivered: said "20 cases" for v1.1, actually added 30. Disclosed honestly.
- One token paste mishap early in session (Railway API token pasted in chat). Caught immediately, revoked both compromised tokens, restarted with `Read-Host -AsSecureString` pattern. Result: Railway on Hobby plan → no PR preview environments. Made the test-plan scope production-only.

## State at end of session

**Branch:** `fix/F-225-tenant-tz-helper` at `979e5f1` (unchanged since last session)
**Main:** two new commits, not pushed:
  - `984c3c2` docs: add bug-inventory.md as single source of truth
  - `31f9785` docs(inventory): track F-225 Day 3 part 2 as L5 (deferred)
**Production:** `d1b6014`, unchanged. Railway still on that tip.
**Audit script:** on local disk, ready to run tomorrow.
**Test plan:** on local disk, ready to send tomorrow.

## Pending work (not started)

- Send test plan v1.1 to testers
- Run the Day 4 audit SQL against production via TablePlus or psql
- Based on results: write F-225 Day 4 migration file (sub-task 2)
- Based on migration: write rollback plan (sub-task 3)
- Merge F-225 to main after Day 4 completes
- Push the two main commits (next time any main commit lands)

## Carry-forward bugs & work

Unchanged from previous handoffs unless noted:
- B1 KDS stale ticket pollution (still open, still BLOCKING)
- 5 MEDIUM + 4 LOW in bug-inventory
- Legal pages (privacy, terms — UAE + India DPDP)
- F-122, F-123, F-124: bill tamper, float drift, manual discount cap
- A-14 QR public surface audit before external guest traffic
- 13 npm audit vulnerabilities
- ESLint + Prettier setup (P4-01)
