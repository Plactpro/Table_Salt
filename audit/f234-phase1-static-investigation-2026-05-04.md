# F-234 Phase 1 — Static investigation (2026-05-04)

Read-only static analysis of the cross-user same-table claim race
(F-234). No code changes. No migrations. No DB connections.

Scope: identify the race window in code, characterize the schema and
existing concurrency primitives, and surface blockers visible at the
code layer that would affect the proposed fix shape (partial unique
index on `orders(tenant_id, table_id) WHERE status IN (...)` plus
optional `SELECT FOR UPDATE` / advisory lock).

---

## 1. Table-claim code path

### Finding

The dine-in table claim happens implicitly via `POST /api/orders` —
there is no separate "claim table" endpoint. The handler reads no
table state, takes no lock, and is not wrapped in a transaction
spanning the order insert and the table-status update.

Sequence inside the handler:

1. **Idempotency** (`orders.ts:338-375`): atomic INSERT into
   `idempotency_keys` with `ON CONFLICT (key, tenant_id) DO NOTHING`.
   This dedupes a single client's retries — it does **not** dedupe
   two different clients on the same table.
2. **Validation, pricing, discount engine** (`orders.ts:377-576`):
   pure compute, no DB lock relevant to the table.
3. **`storage.createOrder(serverOrderData)`** (`orders.ts:606`): a
   plain `db.insert(orders).values(data).returning()` (`storage.ts:1144-1147`).
   No `tableId` precondition is enforced. No FK or unique constraint
   on the orders table covers `(tenant_id, table_id, status)`.
4. **Order-number sequence** (`orders.ts:619-632`): `SELECT COUNT(*)+1`
   then `UPDATE orders SET order_number = ...`. Race-prone for
   `order_number` on its own (two concurrent inserts can both read the
   same count) — orthogonal to F-234, flagged for incidental.
5. **Order-items insert loop** (`orders.ts:633-708`): per-item insert,
   no transaction wrapping it with the order insert.
6. **Table flip to occupied** (`orders.ts:719-722`):
   ```
   if (orderData.tableId) {
     await storage.updateTable(orderData.tableId, user.tenantId, { status: "occupied" });
     emitToTenant(user.tenantId, "table:updated", { tableId: orderData.tableId, status: "occupied" });
   }
   ```
   `storage.updateTable` (`storage.ts:1063-1066`) is a plain Drizzle
   UPDATE keyed only on `(id, tenantId)`. No optimistic concurrency
   check on the previous status — it does not refuse to occupy an
   already-occupied table.

There is **no pre-INSERT check** on `tables.status` and **no transaction
spanning the `INSERT INTO orders` and the `UPDATE tables`**. The two
statements run on the global Drizzle pool with autocommit semantics.

### Race window

Between two concurrent `POST /api/orders` calls with the same
`(tenant_id, table_id)`:

- Step 1 (idempotency) succeeds for both (different client keys, or
  no key at all).
- Step 2 onwards run in parallel.
- Both reach `storage.createOrder` (`orders.ts:606`) and both INSERTs
  succeed — there is no constraint to fail.
- Both reach the table flip (`orders.ts:719-722`) and both UPDATEs
  succeed (idempotent set to `'occupied'`).

Result: two orders in `status = 'new'` with the same `(tenant_id,
table_id)`, one waiter sees their cart, the other sees theirs, the
table row shows `'occupied'` once. Matches the F-234 reproduction.

### Citation

- `server/routers/orders.ts:325` — handler entry
- `server/routers/orders.ts:606` — `storage.createOrder` call (no
  pre-check on tables row)
- `server/routers/orders.ts:719-722` — table flip after the fact
- `server/storage.ts:1144-1147` — `createOrder` is a plain insert
- `server/storage.ts:1063-1066` — `updateTable` is a plain update,
  no optimistic precondition

### Confidence: HIGH

Direct read of every line in the handler from entry through table
flip; underlying storage methods inspected.

### Verdict on F-234 cause

The race window **is**: `orders.ts:606` (insert) → `orders.ts:720`
(table flip), executed without a lock or constraint on
`(tenant_id, table_id, status)`. Two concurrent requests both reach
this region with the same `tableId`; both succeed.

### Adjacent paths that share the defect

- `POST /api/tables/:id/seat` (`server/routers/tables.ts:67-79`):
  blindly sets `status: "occupied"` with no read-and-lock; same
  shape, different operation. Does not create an order.
- `PATCH /api/tables/:id` (`server/routers/tables.ts:58-65`): generic
  body passthrough — also unguarded.
- Guest QR self-order (`server/routers/guest.ts:237`): inserts
  `status: "new"`, `orderType: "dine_in"` directly with the session's
  `tableId`. A guest QR session and a waiter creating a fresh dine-in
  on the same table simultaneously hit the same race window.
- `POST /api/orders/merge-tables`, `POST /api/orders/:id/transfer-table`,
  `POST /api/orders/:id/split-bill` (`server/routers/orders.ts:1342`,
  `1373`, `1407`): not yet inspected — out of scope for Phase 1, but
  flag for a Phase 2 sweep before the fix lands.

---

## 2. orders schema

### Finding

`orders` table definition: `shared/schema.ts:426-506`. SQL
counterpart: `migrations/0000_quick_bloodstrike.sql:1507-1571`.

Relevant columns for the proposed fix:

| Column      | Type             | NOT NULL | Default        |
|-------------|------------------|----------|----------------|
| `id`        | varchar(36)      | yes (PK) | `gen_random_uuid()` |
| `tenant_id` | varchar(36)      | **yes**  | —              |
| `outlet_id` | varchar(36)      | no       | —              |
| `table_id`  | varchar(36)      | **no**   | —              |
| `status`    | `order_status` enum | **no** | `'new'`       |
| `order_type`| `order_type` enum | no      | `'dine_in'`    |

`orderStatusEnum` (`shared/schema.ts:42-56`, mirrored in
`migrations/0000_quick_bloodstrike.sql:11`) enumerates 13 values:

```
'new', 'on_hold', 'confirmed', 'sent_to_kitchen', 'in_progress',
'ready', 'served', 'ready_to_pay', 'paid', 'completed', 'cancelled',
'voided', 'pending_payment'
```

Existing indexes on `orders` (`shared/schema.ts:500-505`, mirrored at
`migrations/0000_quick_bloodstrike.sql:3474-3477`):

- `idx_orders_tenant_id` on `(tenant_id)`
- `idx_orders_tenant_created` on `(tenant_id, created_at)`
- `idx_orders_tenant_status` on `(tenant_id, status)`
- `idx_orders_tenant_table` on `(tenant_id, table_id)` — **not unique**

Existing UNIQUE constraints on `orders`: none. (Verified by grepping
the entire migration for `UNIQUE` and `unique\(` — every UNIQUE on a
related table has a different scope. Match list at
`migrations/0000_quick_bloodstrike.sql:289, 1073, 1164, 1293, 1504,
2754, 2870, 3395, 3413, 3418, 3433, 3493, 3499, 3503, 3522, 3546`;
none is on the `orders` table itself.)

### Nullability blockers for the proposed fix

- `tenant_id` is `NOT NULL` ✓ — partial unique index is safe along
  this axis.
- `table_id` is **nullable** — required, because takeaway/delivery
  orders intentionally have no table. A partial unique index whose
  predicate is `WHERE table_id IS NOT NULL AND status IN (...)` is
  the standard form here; without `table_id IS NOT NULL` in the
  predicate, Postgres treats `NULL` table_ids as distinct rows
  (which is desired for non-dine-in orders).
- `status` is **nullable** (no `.notNull()` in Drizzle, no `NOT NULL`
  in SQL — `migrations/0000_quick_bloodstrike.sql:1537`). A partial
  index `WHERE status IN ('new', ...)` will silently exclude rows
  where `status IS NULL`. This is the same defect already filed in
  the backlog as "BL-1 schema follow-up" — `orders.status` should
  get `.notNull()` and a backfill `UPDATE orders SET status = 'new'
  WHERE status IS NULL;` PR #10 was a defensive client-side
  null-coalesce only, so production may currently hold rows with
  `status IS NULL`. Production data recon needed (see Open Questions).

### `orderStatusEnum` mismatch with the proposed predicate

The proposal uses `status IN ('new', 'in_progress', 'ready')`. That
**under-covers** the table-occupied lifecycle. A table is still
occupied during these statuses that the proposed predicate excludes:

- `'on_hold'` — order held but table still seated
- `'confirmed'` — pre-kitchen confirmation
- `'sent_to_kitchen'` — KOT sent, waiting on prep
- `'served'` — food on table, guest still seated
- `'ready_to_pay'` — bill being prepared
- `'pending_payment'` — payment in flight

For comparison, the codebase's existing convention (in
`server/routers/tables.ts:86`, the `H-6` clear-table guard) uses the
inverse:

```
status NOT IN ('paid', 'completed', 'cancelled', 'voided')
```

Translating that to a positive list yields 9 statuses, not 3. The
fix's predicate set should be reconciled with this convention before
the index is created — using only 3 statuses leaves the same race
window open across `on_hold`, `sent_to_kitchen`, `served`, etc.

### tables schema (referenced)

`shared/schema.ts:327-358`. `tables.tenantId` is `notNull()`,
`tables.status` is `tableStatusEnum` defaulting to `'free'`, also
not declared `notNull()` (same nullability shape as `orders.status`).
`tableStatusEnum` (`shared/schema.ts:65-71`): `'free', 'occupied',
'reserved', 'cleaning', 'blocked'`.

### Confidence: HIGH

Direct read of the Drizzle definitions and the SQL migration; greped
for all UNIQUE constraints in the migration.

---

## 3. Existing migrations

### Finding

The repo has a single Drizzle migration. Drizzle journal:
`migrations/meta/_journal.json` — one entry, `0000_quick_bloodstrike`,
timestamp `1776367232009` (2026-04-15 epoch).

| File | Summary |
|---|---|
| `migrations/0000_quick_bloodstrike.sql` | Initial baseline. Defines all enums (incl. `order_status`), all tables (incl. `orders` at L1507, `tables` at the appropriate offset), all FKs, all indexes. 3553 lines. |
| `migrations/meta/_journal.json` | Drizzle journal — single entry pointing at the above. |
| `migrations/meta/0000_snapshot.json` | Drizzle snapshot for the same baseline. |

### Migrations that touch the orders table or order_status enum

All in `0000_quick_bloodstrike.sql`:

- L11: `CREATE TYPE "public"."order_status" AS ENUM(...)` — the 13
  values listed in §2 above.
- L1507-1571 (region): `CREATE TABLE "orders" (...)` — column
  definitions including `"table_id" varchar(36)` and
  `"status" "order_status" DEFAULT 'new'` (no NOT NULL).
- L3262-3266: FK constraints on orders (`tenant_id`, `outlet_id`,
  `table_id`, `waiter_id`, `customer_id`).
- L3474-3477: the four indexes on orders listed in §2 — none unique.

There is **no migration adding a unique constraint or partial unique
index on the orders table**. There is no migration altering
`order_status`. There is no migration tightening `orders.status` to
NOT NULL.

### Confidence: HIGH

Single migration directory; full grep of `CREATE TABLE.*orders`,
`CREATE INDEX.*orders`, `CREATE UNIQUE.*orders`, `order_status`, and
`ALTER TABLE.*orders` confirms only the baseline touches orders.

---

## 4. Existing locking / concurrency patterns

### Finding

The codebase has an established **`SELECT FOR UPDATE` within a
manually-managed transaction** pattern, used for inventory
deduction. Six call sites:

| File:Line | Locks | Purpose |
|---|---|---|
| `server/lib/deduct-recipe-inventory.ts:80, 162` | `inventory_items` row | Prevent concurrent recipe-driven stock depletion. |
| `server/routers/inventory.ts:178` | `inventory_items` row | Prevent concurrent inventory edits. |
| `server/routers/procurement.ts:907, 974` | `inventory_items` row | Stock-count finalization, damage report deduction. |
| `server/routers/wastage.ts:596, 727` | `inventory_items` row | Wastage stock decrement. |
| `server/services/resource-service.ts:97` | `special_resources` row | Resource-allocation guard. |

Every site follows this template (e.g. `server/routers/inventory.ts:173-180`):

```
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const { rows } = await client.query(
    `SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2 ... FOR UPDATE`,
    [id, tenantId]
  );
  ...
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
}
```

There is also a **Postgres advisory-lock helper** for cron-style jobs
at `server/lib/job-lock.ts:10-28`:

```
export async function withJobLock(jobId: number, fn: () => Promise<void>): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT pg_try_advisory_xact_lock($1) AS acquired", [jobId]);
    if (!rows[0].acquired) { await client.query("ROLLBACK"); return false; }
    await fn();
    await client.query("COMMIT");
    return true;
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}
```

Lock IDs are stable integers in `JOB_LOCK` (`server/lib/job-lock.ts:31-43`).
The helper is `pg_try_advisory_xact_lock` — non-blocking, transaction-
scoped. For a per-(tenant, table) lock during order claim, a blocking
`pg_advisory_xact_lock` keyed on a hash of `(tenant_id, table_id)`
would be the analogous pattern; the helper would need a sibling for
keys exceeding `bigint` (i.e. two-arg form) or a stable hash.

`db.transaction` (Drizzle's higher-level transaction) is also used in
this codebase — e.g. `server/routers/orders.ts:1031, 1052` for
stock-depletion within `PATCH /api/orders/:id`. It is **not** used in
`POST /api/orders` for the table-claim path.

`SERIALIZABLE` and `pg_advisory_lock` (non-`xact_` variant) — no
matches in `server/`.

### Citation

- `server/lib/deduct-recipe-inventory.ts:73-95, 156-185`
- `server/lib/job-lock.ts:10-43`
- `server/routers/inventory.ts:173-180`
- `server/routers/procurement.ts:898-920, 968-985`
- `server/routers/wastage.ts:592-608, 720-737`
- `server/services/resource-service.ts:90-110`
- `server/routers/orders.ts:1029-1071` (the existing `db.transaction`
  use inside PATCH, but only for stock — not table claim)

### Confidence: HIGH

Full grep over `server/` for the four target tokens.

### Implication for the fix

A unique-index-only fix would surface as a `23505` error on the
losing INSERT, and the handler already has a `23505` branch
(`orders.ts:608`) but it is scoped to the `channel_order_id`
constraint — would need to be broadened to handle the new
`(tenant_id, table_id)` partial-unique violation gracefully (return
409 with the existing order, like the idempotency replay does).

A `SELECT FOR UPDATE` on the `tables` row inside a transaction that
also performs the order INSERT is the in-codebase pattern most
analogous to existing inventory-deduction code. An advisory lock
keyed on `(tenant_id, table_id)` is also available via the existing
`job-lock.ts` shape but would need a non-`JOB_LOCK` ID space.

---

## 5. Same-table prevention check (existing)

### Finding

**No prevention attempt exists** for two open orders on the same
table. The grep produced one near-miss and several false positives:

- `server/routers/guest.ts:121-122`: lists existing tableOrders to
  build a "running bill" view for the guest QR — a read for display,
  not a guard. Filters by `o.status !== "paid" && !== "cancelled" &&
  !== "voided"`.
- `server/routers/tables.ts:124`: `if (source.status !== "occupied")
  return res.status(400)...` — a guard for the `merge` operation,
  not for order claim.
- `server/routers/orders.ts:1167`: `if (req.body.tableId &&
  req.body.tableId !== existing.tableId)` — audit log on table
  change, not a guard.

There is no `SELECT ... FROM orders WHERE table_id = $1 AND status
IN (...)` precheck inside `POST /api/orders` and no equivalent
inside `storage.createOrder`.

The H-6 clear-table guard at `server/routers/tables.ts:85-91` is the
closest existing precedent for "this table has an active order"
logic — but it runs on `PATCH /api/tables/:id/clear`, not on order
creation:

```
const { rows: unsettled } = await pool.query(
  `SELECT COUNT(*)::int AS cnt FROM orders WHERE table_id = $1 AND tenant_id = $2 AND status NOT IN ('paid', 'completed', 'cancelled', 'voided')`,
  [req.params.id, user.tenantId]
);
if (unsettled[0]?.cnt > 0) { return res.status(400).json(...); }
```

This is a **count-then-act** check (TOCTOU shape). If repurposed for
the claim path without a lock or constraint, it would still race —
two requests can both COUNT zero, then both INSERT.

### Citation

- `server/routers/orders.ts` (full file): no `SELECT ... FROM orders
  WHERE table_id` precheck before `createOrder`.
- `server/routers/tables.ts:85-91` — H-6 unsettled-orders guard
  (TOCTOU shape, on a different endpoint).
- `server/routers/guest.ts:121-122` — read-for-display, not a guard.

### Confidence: HIGH

Grep was exhaustive on `server/`; the only matches that mention
`orders` and `tableId` together are the ones above.

### Verdict

There is **no race-prone prevention attempt** because there is **no
prevention attempt at all** on the `POST /api/orders` claim path.
The fix is greenfield from a behavior standpoint; it will not have
to undo an existing wrong guard, only add a new correct one.

---

## Summary

### Where is the race window?

- `server/routers/orders.ts:606` — `storage.createOrder` insert.
- `server/routers/orders.ts:719-722` — table-flip update.
- These two statements run on the autocommit pool with no lock and
  no transaction wrapping them. Two concurrent same-`tableId`
  requests both reach the insert, both succeed.

### Is there any existing prevention attempt that's race-prone, or none at all?

**None at all** on the order-claim path. The closest sibling is the
H-6 unsettled-orders guard on `PATCH /api/tables/:id/clear`
(`server/routers/tables.ts:85-91`), which is itself TOCTOU-shaped
(count-then-act). A guard of that shape on the claim path would
still race; the lock or unique constraint is doing the real work.

### Blockers visible in code that would prevent the proposed fix

1. **`orders.status` is nullable** (`shared/schema.ts:465`,
   `migrations/0000_quick_bloodstrike.sql:1537`). A partial unique
   index whose predicate references `status IN (...)` will silently
   exclude rows with `status IS NULL`. The "BL-1 schema follow-up"
   item already in the backlog (`audit/00-backlog.md` ANNOYING
   section) is a hard prerequisite or co-requisite of this fix:
   `orders.status` must get `NOT NULL` and a backfill before the
   partial index is trusted.
2. **`orders.table_id` is nullable** (intentional — non-dine-in
   orders). This is not a blocker but it dictates the predicate
   shape: include `table_id IS NOT NULL` in the partial-index
   predicate, otherwise Postgres treats null table_ids as distinct
   rows (which is fine but conceptually muddled — explicit is
   better).
3. **The proposed status set `('new', 'in_progress', 'ready')`
   under-covers the lifecycle.** The codebase's own H-6 convention
   is `NOT IN ('paid', 'completed', 'cancelled', 'voided')`, which
   positively includes 9 statuses, not 3. Without expanding the
   set to at least include `on_hold, confirmed, sent_to_kitchen,
   served, ready_to_pay, pending_payment`, the index leaves the
   race open for a held or sent-to-kitchen order on the same table.
4. **Idempotency replay path expects a single `23505` constraint
   shape** (`server/routers/orders.ts:608`, scoped to
   `channel_order_id`). The `try/catch` around `createOrder` will
   need a second `23505` branch for the new partial-unique
   violation, returning 409 with the conflicting active order so
   the losing client can recover gracefully (matching the existing
   idempotency-replay return shape at `orders.ts:367`).
5. **No existing transaction wraps order insert + table flip.** A
   `SELECT FOR UPDATE`-on-tables fix needs a manually-managed pool
   client (matching the inventory pattern in
   `server/lib/deduct-recipe-inventory.ts:73-95`) or a
   `db.transaction` block (matching `server/routers/orders.ts:1031`
   in PATCH). Either is fine; both are precedented.
6. **Adjacent paths share the defect** and would not be covered by
   a fix scoped to `POST /api/orders` alone: `POST
   /api/tables/:id/seat`, `PATCH /api/tables/:id`, the guest QR
   self-order at `server/routers/guest.ts:237`, and possibly the
   merge/transfer/split endpoints at `orders.ts:1373, 1342, 1407`.
   A unique-index-on-orders fix WOULD cover the guest QR path
   (because that path also INSERTs into `orders` with a `tableId`)
   but NOT the `seat` path (which only sets the table to occupied
   and creates no order).

### Open questions for production data recon

These cannot be answered from static analysis; a TablePlus read-only
script (per the audit hard rules) would resolve them.

1. **Are there `orders` rows with `status IS NULL` in production?**
   If yes, the BL-1 schema follow-up must run first; the partial
   index will not protect those rows.
2. **Are there active duplicates today?** A query like
   `SELECT tenant_id, table_id, COUNT(*) FROM orders WHERE table_id
   IS NOT NULL AND status IN (proposed-set) GROUP BY 1,2 HAVING
   COUNT(*) > 1` will identify pre-existing duplicates that would
   block index creation. They must be reconciled (one kept, others
   void/cancelled) before `CREATE UNIQUE INDEX` succeeds.
3. **Which exact status set should the predicate use?** The H-6
   convention (9-status NOT-IN) suggests one answer; the proposal
   text suggests another (3-status IN). Production status
   distribution and CEO/operator decision determine the right set.
4. **Are there orders with `status IS NULL AND table_id IS NOT NULL`?**
   These are the rows most at risk under both the current bug and
   the planned fix.
5. **Is `pg_try_advisory_xact_lock` already in active use** outside
   the cron path (`server/lib/job-lock.ts`)? Static analysis says
   no, but a pg_locks snapshot would confirm.
6. **What concurrency does production actually see?** The race
   requires two near-simultaneous claims. If production logs
   already show duplicate inserts at the millisecond scale, the
   fix's urgency is real; if F-234 was reproduced only under
   contrived joint testing, urgency is lower (but the bug remains).

### Incidental findings

- **`order_number` generation race** at `server/routers/orders.ts:619-628`:
  `SELECT COUNT(*)+1 FROM orders WHERE ... AND DATE(created_at) =
  CURRENT_DATE AND order_number IS NOT NULL`, then `UPDATE orders
  SET order_number = ...`. Two concurrent inserts on the same date
  for the same tenant can both read the same count and both write
  the same `order_number`. Severity: Medium (display/audit, not
  data-corruption). Out of F-234 scope but should be filed.
- **Guest QR self-order is unguarded** (`server/routers/guest.ts:237`).
  A walk-up waiter and a guest scanning the QR for the same table
  hit the same race. Worth confirming this path is actually wired
  to production tenants before raising severity, but the code path
  exists.
- **`tables.status` is nullable** (`shared/schema.ts:348`). Same
  defect shape as `orders.status` and BL-1 — should be tightened in
  the same hardening pass.
- **`createOrder` does not write `order_number`** synchronously with
  the row — there's a window where `orders.order_number IS NULL`
  even after the row is committed. Tickets/print-jobs using
  `order_number` for display fall back to `id.slice(-6)`. Cosmetic.
