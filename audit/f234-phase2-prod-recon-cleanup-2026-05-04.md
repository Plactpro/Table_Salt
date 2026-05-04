# F-234 Phase 2 — Production data recon and cleanup (2026-05-04)

Mid-Monday session, continuation of F-234 investigation after Phase 1
static analysis (`audit/f234-phase1-static-investigation-2026-05-04.md`).

The operator ran read-only recon and a controlled cleanup directly
against the Railway production database via TablePlus. Claude Code
did not connect to the DB at any point — per `CLAUDE.md` hard rule
1, all DB reads/writes go through the operator's TablePlus session.
Claude Code's role this phase is documenting what the operator
executed and the resulting state.

---

## Read-only recon findings

Three questions left open at the end of Phase 1 were answered.

### Q1 — Are there `orders` rows with `status IS NULL`?

**Result: 0 rows.**

This retires one of the three blockers Phase 1 flagged. The
"BL-1 schema follow-up" item (tighten `orders.status` to `NOT NULL`)
is no longer a hard prerequisite for F-234 — the partial unique
index will not silently exclude any existing rows. BL-1 stays open
as defense-in-depth so future inserts cannot regress this property,
but it does not gate the F-234 fix.

### Q2 — Pre-existing duplicates that would block `CREATE UNIQUE INDEX`

The duplicate query, scoped to active statuses:

```
GROUP BY (tenant_id, table_id) HAVING COUNT(*) > 1
WHERE status NOT IN ('paid','completed','cancelled','voided')
  AND status IS NOT NULL
```

returned **15 `(tenant_id, table_id)` pairs**, all under a single
tenant (the busiest pre-launch test tenant). Per-table active-order
counts ranged from 2 to 8.

The companion detail query — every active order, not just duplicates
— surfaced **67 stuck orders across 16 distinct tables**. The 16-vs-15
gap is a HAVING-clause undercount: one of the 16 tables had only one
stuck order, so it did not qualify as a duplicate but was still
occupied by stuck active state. Phase 1's open-question wording
focused on "duplicates that would block index creation" (15 pairs);
the 67/16 picture is the full pre-existing F-234 footprint.

Status mix in the 67 stuck rows: `served`, `ready_to_pay`, `on_hold`,
`in_progress`, and one `ready`. None in `new` or `sent_to_kitchen`
— they are all post-kitchen, mid-bill, or paused states. Created-at
range: **2026-03-13 to 2026-05-04**, i.e. roughly seven weeks of
accumulated test pollution.

### Q3 — Triggers on `orders` and `tables`

**Result: 0 triggers** on either table. Direct `UPDATE` statements
via TablePlus produce no cascading side effects beyond the row write
itself. Side-effect surface for the cleanup is limited to the
WebSocket-event gap covered below.

---

## Decision: what was done and why

The operator inspected a sample of the 67 stuck rows and confirmed
they are all **pre-launch test data**: same waiter accounts repeatedly
seating themselves, no real customer PII, no held orders the team is
currently working on. These rows are pre-existing F-234 victims (or
similar accumulated test pollution from earlier joint-test sessions
and ad-hoc QA).

These rows would block `CREATE UNIQUE INDEX (tenant_id, table_id)
WHERE status IN (...) AND table_id IS NOT NULL` because Postgres
verifies the predicate against existing rows at index-creation time
and fails if any duplicates exist. The fix cannot land until the
duplicates are reconciled.

Two viable reconciliation strategies were considered:

1. **Per-pair manual reconciliation**: keep the most recent
   non-`voided` order on each pair, void the rest. Lower data-loss
   risk for real customer state, higher operator effort.
2. **Bulk void of all 67 stuck rows + free the 16 tables**, marker-
   tagged for traceability. Higher-throughput, only safe because
   the rows were confirmed test data.

The operator chose option 2. The marker tag
`[F-234-prep-cleanup-2026-05-04]` is appended to the `notes` column
on every voided row so the cohort can be re-identified later
without UUIDs (no tenant or table IDs are recorded in this audit
doc per the hard rule for this phase).

---

## What was executed

Two `UPDATE` statements were run via TablePlus, each auto-committed
by Postgres in TablePlus's default "Run Current" mode (no explicit
`BEGIN`/`COMMIT`; PG auto-commit applies to a single statement).
Both writes succeeded.

### UPDATE 1 — void the 67 stuck orders

```
UPDATE orders
   SET status = 'voided',
       notes  = COALESCE(notes, '') || ' [F-234-prep-cleanup-2026-05-04]'
 WHERE tenant_id = (busiest-tenant subquery)
   AND status NOT IN ('paid','completed','cancelled','voided')
   AND status IS NOT NULL
   AND table_id IS NOT NULL
```

Rows affected: **67**. Filter mirrors the detail query's predicate so
no in-flight order outside the 67-row cohort was touched.

### UPDATE 2 — free the 16 affected tables

```
UPDATE tables
   SET status = 'free'
 WHERE id IN (
   SELECT DISTINCT table_id FROM orders
    WHERE notes LIKE '%[F-234-prep-cleanup-2026-05-04]%'
 )
```

Rows affected: **16**. Sourcing the table-ID set via the marker tag
(rather than the raw list from Phase 2's recon query) means the
cleanup is self-correcting if the operator's earlier recon-query
copy-paste lost a row.

---

## Verification

The duplicate query (Q2) was re-run after both updates: **0 rows**.
The active-orders detail query was re-run: 0 stuck rows under the
busiest tenant matching the cleanup predicate. Distinct tables
freed by UPDATE 2 = 16, matching the UPDATE 1 cohort's distinct
`table_id` count and the recon detail query's table count.

The database is now in a state where the proposed F-234 partial
unique index can be created without an existing-row violation:

```
CREATE UNIQUE INDEX idx_orders_active_table_unique
  ON orders (tenant_id, table_id)
  WHERE status IN (<agreed set>)
    AND table_id IS NOT NULL;
```

(The exact status set remains open — see Phase 1 §summary blocker 3
for the `('new','in_progress','ready')` vs the H-6 9-status
convention discussion. Phase 2's cleanup voided rows across the
H-6 set, so either the narrow or wide predicate will pass index
creation now.)

---

## Side-effect note — WebSocket gap

Direct SQL UPDATEs bypass the application's route handlers, which
means **no `table:updated` or `order:updated` WebSocket events were
emitted** for the 67 voided orders or the 16 freed tables. Any POS,
KDS, or coordinator client currently connected will continue to
render the stale (occupied / mid-flight) state until either:

- the client triggers a hard refresh, or
- a subsequent route-handler write to the same row fires the next
  legitimate `emitToTenant(...)` call.

The operator was notified to hard-refresh their own browser session
and to alert the tester team. This is a one-time cost specific to
this cleanup; it does not affect the design of the F-234 fix itself
(which will run through route handlers and emit events normally).

---

## Spin-off finding — file separately

The 67 stuck orders accumulated over seven weeks. None were in
`new` or `sent_to_kitchen` — every stuck row was in a post-kitchen
or mid-bill state (`served`, `ready_to_pay`, `on_hold`,
`in_progress`, one `ready`). This is **a separate bug from F-234**.
Possible root causes worth investigating:

- Bill / payment flow not completing cleanly under tester workflow
  (orders reach `ready_to_pay` and stay there because the bill is
  abandoned without paid/cancelled).
- Tester workflow gap — testers seat tables and walk away without
  closing the order.
- No background reaper for orders left in non-terminal status
  beyond N hours/days.

Recommended action: file as **F-246 — stuck-orders accumulation in
non-terminal status, no cleanup mechanism**, severity Medium,
post-launch hygiene category. Add to `audit/00-backlog.md` ANNOYING
section. The fix shape would be either (a) a B1b-shaped scheduled
job that auto-cancels orders idle in non-terminal status > N
hours, or (b) a finer audit of which workflow step is dropping the
status transition. Out of scope for the F-234 fix branch.

---

## Filter-mismatch note for future audits

The Q2 query used `HAVING COUNT(*) > 1` and returned 15 pairs. The
sibling detail query, used to inspect the actual rows, did **not**
have a HAVING clause and returned 67 rows across 16 tables. The
1-table discrepancy (15 duplicate pairs vs. 16 tables with stuck
orders) cost a verification round — a few minutes of "why are the
counts different" before realising one table had only a single
stuck order, which is still a problem (occupied table, F-234-class
state) but not a duplicate.

Lesson for future audit query chains: when a recon plan runs a
"summary" query and a "detail" query against the same cohort,
the predicates must match unless the difference is intentional and
called out in the plan. In this case both predicates were valid for
their narrow purpose, but the chain would have been clearer if the
detail query had been described as "active stuck rows including
non-duplicate single-stuck tables" rather than as a sibling to the
duplicate-pair count.

---

## State at the end of Phase 2

- 0 stuck active orders under the busiest tenant matching the
  F-234 predicate.
- 16 tables flipped from `occupied` to `free`.
- 67 orders moved from active statuses to `voided`, marker-tagged
  in `notes` as `[F-234-prep-cleanup-2026-05-04]`.
- Schema unchanged; no DDL executed.
- No code changes; no commits in this phase.
- F-234 fix is now unblocked from a data-state perspective. The
  remaining blockers are decision-shaped, not data-shaped: agree
  on the predicate's status set, decide between unique-index-only
  vs. unique-index + `SELECT FOR UPDATE`, and confirm the fix
  branch covers the adjacent paths (`POST /api/tables/:id/seat`,
  guest QR self-order, merge/transfer/split) flagged in Phase 1.
