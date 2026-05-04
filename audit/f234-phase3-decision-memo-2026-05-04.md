# F-234 Phase 3 — Decision memo (2026-05-04)

Read-only design memo. No code changes, no migration generation, no
DB connections. Locks the design decisions so the Phase 4
implementation prompt can be derived without further design work.

Prerequisites in context:

- `audit/f234-phase1-static-investigation-2026-05-04.md` — race
  window at `server/routers/orders.ts:606` → `:719-722`, five
  blockers.
- `audit/f234-phase2-prod-recon-cleanup-2026-05-04.md` — 0
  `status IS NULL` rows in production, 67 stuck rows voided,
  16 tables freed, DB ready for `CREATE UNIQUE INDEX`.

---

## Q1 — Status predicate set

### Recommendation

Use the **negative form matching the H-6 convention**:

```
WHERE status IS NOT NULL
  AND status NOT IN ('paid', 'completed', 'cancelled', 'voided')
  AND table_id IS NOT NULL
```

This positively covers the 9 active states (`new`, `on_hold`,
`confirmed`, `sent_to_kitchen`, `in_progress`, `ready`, `served`,
`ready_to_pay`, `pending_payment`) without enumerating them.

### Reasoning

Phase 2 found pre-existing stuck rows in `served`, `ready_to_pay`,
`on_hold`, `in_progress`, and `ready` — five distinct active
statuses. The proposed narrow set `('new','in_progress','ready')`
would have only protected two of them. Any predicate that misses
`served`, `on_hold`, or `sent_to_kitchen` leaves the same race
window open for a held order, an in-flight KOT, or food already on
the table.

The negative form has three operational advantages:

1. **Auto-extends.** New active statuses added later (the
   `orderStatusEnum` already has 13 values; pre-launch tenants might
   exercise more in future) are automatically included without
   rebuilding the index.
2. **Matches existing code convention.** `server/routers/tables.ts:86`
   (the H-6 clear-table guard) already uses this exact form. A
   reviewer encountering the predicate downstream will recognize the
   intent without cross-referencing.
3. **`status IS NOT NULL` is required for correctness.**
   `NULL NOT IN (...)` evaluates to `NULL`, not `TRUE`, in Postgres
   SQL — without the explicit null check the index would silently
   skip null-status rows. Phase 2 confirmed 0 such rows in
   production today, but BL-1 is still open and the predicate must
   be defensive.

`table_id IS NOT NULL` keeps takeaway/delivery orders out of the
constrained set — those orders intentionally have no table.

### Alternatives considered

- **(a) Narrow positive set `('new', 'in_progress', 'ready')`**:
  rejected. Under-covers — 4 of the 5 stuck-status types observed in
  Phase 2 fall outside this set.
- **(b) Wide positive set listing all 9 active statuses**:
  functionally equivalent to the recommended negative form, but
  brittle if a 14th enum value is added.
- **(c) Hybrid**: e.g. drop `confirmed` and `pending_payment` if
  unused. Rejected — production status distribution is unknown
  beyond Phase 2's snapshot, and the negative form sidesteps the
  question entirely.

### Citations

- `shared/schema.ts:42-56` — `orderStatusEnum` 13 values.
- `server/routers/tables.ts:86` — H-6 convention precedent.
- `audit/f234-phase2-prod-recon-cleanup-2026-05-04.md` — observed
  stuck-status distribution.

---

## Q2 — Lock strategy

### Recommendation

**(a) Partial unique index alone, with a 23505 catch translating
the violation into a 409.** No `SELECT FOR UPDATE`, no advisory
lock.

### Reasoning

Postgres enforces a unique-index predicate atomically inside the
INSERT. Two concurrent same-table inserts cannot both succeed under
any concurrency level — the engine serializes the checks at row
level. This is the right place for the guarantee: at the storage
layer, not in application code.

The 23505 path produces a clean, deterministic loser: one INSERT
returns the row, the other raises `23505` with the exact constraint
name. The handler's existing 23505 catch at `server/routers/orders.ts:608`
already discriminates on `dbErr.constraint` — extending it to a
second constraint name is a small change with a small blast radius.

The losing client's "wasted work" before hitting `createOrder`
(price resolution at `:483-500`, promotion engine at `:529-541`,
GST split at `:568-576`) totals ~50-200ms of compute. This is the
only real cost (a) pays vs. (b)/(c). For an edge-case race that
fires when two cashiers literally tap "Send to Kitchen" within a
few hundred ms on the same table, that cost is acceptable.

Idempotency interaction: the idempotency claim at
`server/routers/orders.ts:338-375` runs **before** `createOrder`
and is keyed on `(key, tenant_id)`, not `table_id`. Two concurrent
clients on the same table will use different idempotency keys (or
no key); they both win the idempotency claim and proceed to
`createOrder`, where the loser hits 23505. The losing client's
idempotency row needs cleanup — the existing finally block at
`:861-872` already handles this when `idemResponseStored` is
false.

### Alternatives considered

- **(b) Index + `SELECT FOR UPDATE` on the `tables` row**: the
  inventory-deduction precedent at
  `server/lib/deduct-recipe-inventory.ts:73-95` and
  `server/routers/inventory.ts:173-180` is the right shape if a
  serialization point earlier than the INSERT is needed. It isn't,
  for F-234 specifically. Without the unique index as backstop,
  `SELECT FOR UPDATE` alone does NOT prevent two `INSERT`s — both
  transactions read the locked row, both proceed, both commit. With
  both: redundant. Rejected on Occam grounds.
- **(c) `pg_try_advisory_xact_lock` keyed on hash(tenant, table)**:
  the `server/lib/job-lock.ts:10-43` pattern. Rejected because (i)
  same redundancy critique as (b) once the index exists, and (ii)
  introduces a new failure mode where the loser sees "could not
  acquire lock" rather than the cleaner "table claimed" semantic
  from a 23505 violation. Advisory locks are right for cron-style
  exclusive-access patterns, not row-level uniqueness.

### Citations

- `server/routers/orders.ts:608` — existing 23505 catch (channel_order_id).
- `server/routers/orders.ts:338-375` — idempotency claim.
- `server/routers/orders.ts:861-872` — idempotency cleanup finally.
- `server/lib/deduct-recipe-inventory.ts:73-95` — alternative pattern (rejected).
- `server/lib/job-lock.ts:10-43` — alternative pattern (rejected).

---

## Q3 — Branch scope

Phase 1 deferred reading the merge/transfer/split endpoints. Read
now in the course of this memo.

### Recommendation — in scope for `fix/M1b-cross-user-table-claim`

| Path | File:line | Why in scope |
|---|---|---|
| `POST /api/orders` | `server/routers/orders.ts:325-874` (catch at `:608`, INSERT at `:606`) | Primary fix target. The race window itself. |
| Guest QR self-order | `server/routers/guest.ts:235-241` (createOrder at `:235`, generic catch at `:253`) | Same `storage.createOrder` call, same constraint will fire, currently surfaces as 500 via the generic catch. Add the same 23505→409 discrimination. |
| `PATCH /api/orders/:id/transfer-table` | `server/routers/orders.ts:1342-1369` (updateOrder at `:1356`, generic catch at `:1366`) | UPDATEs `orders.tableId` directly. The partial unique index will catch concurrent transfers to the same destination table. Without 23505 discrimination here, the violation surfaces as 500. |
| `PATCH /api/orders/:id` (when body includes `tableId`) | `server/routers/orders.ts:876+` (PR-009 audit log at `:1167-1173` confirms tableId can be patched) | Same shape as transfer-table. Body can change `tableId` on an active order. Requires the same 23505 catch in the existing handler. |

### Recommendation — follow-up backlog items (not in this branch)

- **F-248 [proposed 2026-05-04]: `POST /api/tables/:id/seat` and
  `PATCH /api/tables/:id` allow concurrent occupied flips without
  an order, bypassing F-234 protection.** Severity: Medium,
  post-launch hygiene. Source paths: `server/routers/tables.ts:67-79`
  (seat) and `:58-65` (PATCH). The partial unique index on `orders`
  does NOT cover these — they UPDATE `tables.status` without
  inserting an order. Two concurrent waiters can both flip a free
  table to occupied (idempotent; both succeed). No duplicate
  orders are produced (so this is less acute than F-234) but the
  race window remains. Fix shape: either a `SELECT ... FOR UPDATE`
  on the `tables` row inside a transaction, or an optimistic
  precondition `WHERE status = 'free'`.
- **F-249 [proposed 2026-05-04]: `POST /api/orders/merge-tables`
  performs an unguarded multi-step write.** Severity: Low. Source:
  `server/routers/orders.ts:1373-1403`. The handler reads source
  and target orders, moves items, marks source `cancelled`, frees
  the source table — all without a transaction. Crash mid-sequence
  leaves orphaned items or a half-merged state. Not the F-234
  race, but worth filing.

### Out of scope (no race window)

- **`POST /api/orders/:id/split-bill`** at
  `server/routers/orders.ts:1407-1447`. Read-only computation —
  enumerates split totals and emits a `bill_split` event. No order
  insert, no table mutation. Not affected by F-234.

### Reasoning

The criterion is "does the path produce duplicate active orders on
the same `(tenant_id, table_id)`?". POST /api/orders and the guest
QR insert path both do, directly. Transfer-table and PATCH-with-
tableId both do, indirectly via UPDATE. The seat/PATCH-tables
paths produce a duplicate "occupied" flip but no duplicate order
— that's a different race shape (less data-corruption, more
UX-confusion) and gets its own finding.

Merge and split are both code-reviewed here; merge has a different
race shape (transactional integrity of the merge itself) and split
has none.

### Citations

- `server/routers/orders.ts:325-874, 1342-1369, 1373-1403, 1407-1447`
- `server/routers/guest.ts:215-254`
- `server/routers/tables.ts:58-79`

---

## Q4 — 23505 error handling

### Recommendation

Discriminate on **exact constraint name match**, return **409
with `code: "TABLE_ALREADY_CLAIMED"`** and the existing active
order's payload.

### Discrimination logic

```
if (dbErr.code === '23505' && dbErr.constraint === 'idx_orders_active_table_unique') {
  // look up the existing active order on this (tenant, table)
  const conflictOrder = await storage.getActiveOrderByTable(user.tenantId, orderData.tableId);
  if (conflictOrder) {
    const conflictItems = await storage.getOrderItemsByOrder(conflictOrder.id, user.tenantId);
    return res.status(409).json({
      code: 'TABLE_ALREADY_CLAIMED',
      message: 'Another user is already taking an order at this table.',
      order: { ...conflictOrder, items: conflictItems },
    });
  }
  return res.status(409).json({
    code: 'TABLE_ALREADY_CLAIMED',
    message: 'Another user is already taking an order at this table.',
  });
}
```

Use **`===` exact match** on `dbErr.constraint`, not
`.includes()`. The existing channel-order-id catch at
`server/routers/orders.ts:608` uses `.includes()`, which is
defensible there because the FK-style constraint name has variant
suffixes. The new partial unique index has a fixed name fully
under our control.

### Response shape

The 409 body matches the idempotency-replay return shape at
`server/routers/orders.ts:367` (`{ ...dupOrder, items: dupItems }`)
where possible — except wrapped in an envelope `{ code, message,
order }` for client discrimination. The client should be able to
tell `TABLE_ALREADY_CLAIMED` apart from the existing 409 "Duplicate
order" path at `:381` and `:611`.

### Storage helper to add (Phase 4)

`storage.getActiveOrderByTable(tenantId, tableId)` does not exist
in the current `server/storage.ts`. Phase 4 adds it as a small
read against the same predicate as the index:

```
SELECT * FROM orders
 WHERE tenant_id = $1 AND table_id = $2
   AND status IS NOT NULL
   AND status NOT IN ('paid','completed','cancelled','voided')
 LIMIT 1
```

Predicate intentionally identical to the index — same set, same
order of conditions — so the planner uses the index for the lookup.

### Apply to all four call sites

Every in-scope call site in Q3 must perform the same discrimination:

- `server/routers/orders.ts:608` — broaden the existing try/catch;
  add the new branch.
- `server/routers/guest.ts:253` — replace the generic `catch (err)
  { 500 }` with a 23505 discriminator first, generic 500 fallback
  second.
- `server/routers/orders.ts:1366` (transfer-table) — same pattern.
- `server/routers/orders.ts` PATCH handler around the
  `updateOrder` call when `tableId` is in the patch body — same
  pattern.

### Client UX hint (Phase 4 frontend, not server)

- Toast: "Another user is already serving this table. Take over their order?"
- Buttons: "Take over" (recall the conflict order's id, switch to addon-KOT mode), "Pick another table" (dismiss, return to table picker).
- The 409's `order` payload gives the client everything it needs to recall — no extra round-trip required.

### Citations

- `server/routers/orders.ts:608, 1366` — existing catch sites.
- `server/routers/orders.ts:367` — idempotency-replay return shape.
- `server/routers/guest.ts:253` — guest QR generic catch.

---

## Q5 — Migration mechanics

### Recommendation

**Hand-write a SQL migration at
`migrations/0001_f234_active_table_unique.sql`** using
`CREATE UNIQUE INDEX CONCURRENTLY`. **Apply via TablePlus**
(operator) before merging the code change. Mirror the index in
`shared/schema.ts` so subsequent `db:push` runs do not regress it.

### Important caveat — workflow assumption mismatch

The Phase 3 prompt says "package.json should have `npm run
db:generate` and `npm run db:migrate`". **Verified — those scripts
do not exist.** `package.json:6-13` defines only one DB script:
`"db:push": "drizzle-kit push"`. The repo uses Drizzle's
schema-push workflow, not the versioned generate+migrate flow.
`audit/00-orientation.md:399` corroborates: "Drizzle's schema-push
(NOT versioned migrate) is the documented dev path".

The single migration file `migrations/0000_quick_bloodstrike.sql`
is a baseline checkpoint, not part of an active migrate-on-deploy
pipeline.

### Why hand-write rather than `db:push`

Two reasons:

1. **Partial-index parity in `drizzle-kit push`** has been
   inconsistent across versions for `WHERE` clauses with `NOT IN`
   and multi-condition predicates. Trusting the push tool with a
   launch-blocking constraint is not appropriate.
2. **`db:push` bypasses the migrations directory** entirely. The
   index would land in production but with no audit trail. Hand-
   writing the SQL and applying it via TablePlus matches the same
   operator-controlled pattern Phase 2 used for the cleanup, which
   the team is already comfortable with.

### Migration file shape

```
-- migrations/0001_f234_active_table_unique.sql
CREATE UNIQUE INDEX CONCURRENTLY idx_orders_active_table_unique
    ON orders (tenant_id, table_id)
 WHERE status IS NOT NULL
   AND status NOT IN ('paid', 'completed', 'cancelled', 'voided')
   AND table_id IS NOT NULL;
```

`CONCURRENTLY` is safe and recommended:
- It does not lock the `orders` table against writes during
  creation. Production POS traffic is uninterrupted.
- It is safe specifically because Phase 2 cleanup already removed
  all pre-existing duplicates. `CREATE UNIQUE INDEX CONCURRENTLY`
  fails if duplicates exist; it would catch any duplicates that
  re-accumulated since Phase 2 — operator should re-run the Q2
  duplicate query immediately before applying.

### Drizzle schema mirror

Add to `shared/schema.ts:500-505` block (the `orders` table's
index list):

```
uniqueIndex("idx_orders_active_table_unique")
  .on(t.tenantId, t.tableId)
  .where(sql`status IS NOT NULL AND status NOT IN ('paid','completed','cancelled','voided') AND table_id IS NOT NULL`)
```

This serves only as a Drizzle-side declaration so that subsequent
`db:push` runs do not propose dropping the index. The actual
creation is by the hand-written SQL.

### Sequence

1. Branch off `main` → `fix/M1b-cross-user-table-claim`.
2. Edit `shared/schema.ts` — add the `uniqueIndex(...)`
   declaration.
3. Write `migrations/0001_f234_active_table_unique.sql` (no
   journal update; this is a manually-applied migration).
4. Edit the four handler call sites identified in Q3/Q4.
5. Add `storage.getActiveOrderByTable(tenantId, tableId)` to
   `server/storage.ts`.
6. `npm run check` (TypeScript). Local integration tests are not
   wired in this repo (no `db:migrate`, no Docker compose for
   tests); skip integration verification at this stage and rely on
   the Phase 6 production verification plan.
7. Commit, push to remote.
8. **Operator runs the SQL via TablePlus on production**, in this
   order:
   - Re-run Phase 2's Q2 duplicate query to confirm 0 duplicates.
   - Run `CREATE UNIQUE INDEX CONCURRENTLY ...`.
   - Verify with `\d orders` or the verification SQL in Q6.
9. Merge PR to `main` → Railway autodeploys the code change.
10. Verify per Q6.

The order matters: index must exist in production before the code
change deploys, otherwise the new 23505 catch will never fire and
the race window stays open. Code change before index is also OK
(the catch is dormant), but creates a confusing observability gap
where the constraint failure logs reference an index that doesn't
exist.

### Rollback

- **Index breaks something**: `DROP INDEX CONCURRENTLY
  idx_orders_active_table_unique;` via TablePlus. Doesn't lock
  writes. Doesn't touch row data. The 23505 catch in deployed code
  becomes dormant — nothing to undo on the code side. Race window
  re-opens.
- **Code change causes regression**: `git revert <SHA>` on `main`,
  Railway redeploys. Index can stay (correct constraint, no
  application code referencing it after revert), or be dropped per
  above.
- **In-flight requests during rollback**: `DROP INDEX
  CONCURRENTLY` does not abort in-flight INSERTs. A claim that was
  about to fail 23505 might succeed during the drop window — same
  recovery path as Phase 2 (manual reconciliation via TablePlus).

### Citations

- `package.json:6-13` — only `db:push` exists.
- `audit/00-orientation.md:399` — workflow confirmation.
- `drizzle.config.ts` — out: `./migrations`, schema:
  `./shared/schema.ts`.
- `audit/02-new-blockers-recon.md:975` — prior advice to
  hand-write SQL alongside Drizzle declarations.
- `migrations/0000_quick_bloodstrike.sql:3474-3477` — existing
  index conventions on the orders table.

---

## Q6 — Verification plan

### Static — index exists in production

Operator runs in TablePlus:

```
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename = 'orders'
   AND indexname = 'idx_orders_active_table_unique';
```

**Pass criterion**: exactly one row, `indexdef` contains
`UNIQUE INDEX`, `(tenant_id, table_id)`, and the predicate
`WHERE status IS NOT NULL AND status NOT IN ...`.

### Behavior — race actually prevented

Operator runs a two-window test against **a staging or QA tenant**
on production:

1. Open two browser windows, two different cashier accounts under
   the same tenant.
2. Both navigate to POS and pick the same free table.
3. Both add 1-2 items to cart.
4. Both click Send to Kitchen at the same moment (count of three).
5. Verify in both browsers:
   - One window shows a success toast and an order number.
   - The other window shows a 409 toast or the new
     `TABLE_ALREADY_CLAIMED` UI ("Take over their order?" / "Pick
     another table").
6. Operator verifies in TablePlus:
   ```
   SELECT id, status, waiter_id, created_at
     FROM orders
    WHERE tenant_id = '<test-tenant>'
      AND table_id = '<test-table>'
      AND status IS NOT NULL
      AND status NOT IN ('paid','completed','cancelled','voided')
    ORDER BY created_at DESC;
   ```

**Pass criterion**: exactly one active row returned. The losing
client's request did not produce a row.

If two-browser timing is hard to coordinate, equivalent test via
`curl` or HTTPie against `POST /api/orders` from two terminals
with valid auth cookies — same expectation.

### Regression — normal flows still work

Tester checklist:

| Flow | Pass criterion |
|---|---|
| Single-user dine-in: free table → 2 items → Send to Kitchen → Bill → Cash → table free | Order created, KOT printed, table flips occupied then free. No 409. |
| Addon KOT: same waiter on same table claims again | Second Send-to-Kitchen returns success; the existing active order's `sentCartKeys` updates. No 409 (same `(tenant, table)` row, just updated, not re-inserted). |
| Takeaway: customer name + items → Send to Kitchen | Order created. No table involved; index predicate excludes via `table_id IS NOT NULL`. No 409. |
| Delivery: address + items → Send to Kitchen | Same as takeaway. |
| Transfer-table to a free table | UPDATE succeeds, old table freed, new table occupied. No 409. |
| Transfer-table to an occupied table | UPDATE rejected with 409 `TABLE_ALREADY_CLAIMED`. |
| Guest QR self-order on a free table | Order created. |
| Guest QR self-order racing a waiter on the same table | One wins, the other gets 409. |

Tester report format: PASS/FAIL per row with screenshot of any 409
toasts or the in-DB row count.

### Citations

- `audit/regression-2026-04-30-findings.md` — tester process
  template the team is already using.
- Q1, Q2, Q4 above for the predicate, lock strategy, and 409
  shape verification anchors.

---

## Locked Decisions (Phase 4 reference)

| ID | Decision |
|---|---|
| D1 — Predicate | `status IS NOT NULL AND status NOT IN ('paid','completed','cancelled','voided') AND table_id IS NOT NULL` |
| D2 — Lock strategy | Partial unique index alone; 23505 → 409 in handlers |
| D3 — Index name | `idx_orders_active_table_unique` |
| D4 — In scope | `POST /api/orders` (`server/routers/orders.ts:325`); guest QR (`server/routers/guest.ts:215`); `PATCH /api/orders/:id/transfer-table` (`:1342`); `PATCH /api/orders/:id` when body has `tableId` (`:876+`) |
| D5 — Out of scope, follow-ups | F-248 (seat/PATCH tables race), F-249 (merge-tables transactional integrity); split-bill confirmed read-only |
| D6 — 23505 discriminator | `dbErr.code === '23505' && dbErr.constraint === 'idx_orders_active_table_unique'` |
| D7 — 409 response shape | `{ code: 'TABLE_ALREADY_CLAIMED', message, order? }` |
| D8 — New storage helper | `storage.getActiveOrderByTable(tenantId, tableId)` mirrors index predicate |
| D9 — Migration mechanics | Hand-write `migrations/0001_f234_active_table_unique.sql` using `CREATE UNIQUE INDEX CONCURRENTLY`; mirror in `shared/schema.ts`; apply via TablePlus before merge; Drizzle workflow does NOT have `db:generate`/`db:migrate` (only `db:push`) — confirmed in `package.json:6-13` |
| D10 — Rollback | `DROP INDEX CONCURRENTLY` (DDL) and/or `git revert` (code) |
| D11 — Verification | Static SQL on `pg_indexes`; behavior 2-browser race test; regression checklist of 8 flows |
