# F-031/F-032/F-033 Phase 1 — Combined Static Investigation: Verifying Cross-Tenant IDOR Closures

**Status:** Phase 1 (read-only static investigation). Phase 2 = register reconciliation across four audit doc files; no production code changes (one new fragility finding deferred to its own track as F-289).
**Source:** F-031, F-032, F-033 entries in audit/FINDINGS.md L39-41 marked "Open"; cross-references in audit/findings-status-dump-2026-05-10.md, audit/02-data-flows/order-lifecycle.md, audit/FINAL-REPORT.md.
**Investigation date:** 2026-05-12.
**Branch:** `audit/f031-f032-f033-phase1-combined-2026-05-12`.

---

## §1 Summary

All three findings (F-031 transfer-table cross-tenant IDOR, F-032 merge-tables cross-tenant IDOR, F-033 split-bill cross-tenant IDOR) are **verifiably closed in production code** via commit `08bdcbc` (`fix(security): F-033 close cross-tenant IDOR on transfer-table, merge-tables, split-bill`) merged on 2026-04-16. Their "Open" status in the audit register across four separate files is **stale bookkeeping**, not a real security gap.

Phase 1 verified the closures via three independent methods: (a) git blame on the tenant-scoping arguments at each handler's `storage.*` calls (all point to `08bdcbc`), (b) `git show` on the fix diff (confirms the raw-query removals and `tenantId` arg additions), (c) manual reading of the current handler bodies (no residual unscoped queries).

Phase 1 also surfaced **one new finding** during the live `POST /api/orders` review: the body-spread defense at `server/routers/orders.ts:588-602` is currently safe but relies on JavaScript object-literal key precedence — one prettier "sort object keys alphabetically" run from a Critical cross-tenant write IDOR. Filed as F-289 candidate for separate investigation; deferred per CLAUDE.md hard-rule #2 (read-only to application code in audit pass).

**Phase 2 scope:** register reconciliation only. Flip status in four audit doc files, add explicit cross-reference to commit `08bdcbc` in each. No code changes. F-289 gets its own Phase 1.

---

## §2 Verification methodology

Three independent checks were used to confirm each closure:

1. **git blame on the tenant-scoping args.** For each handler, the lines that pass `user.tenantId` to `storage.*` calls were blame-checked. All point to `08bdcbc12ebb18877419661d72ad25b8f505e032` (TOTCI2026, 2026-04-16 10:04:34 +0530).
2. **git show on commit 08bdcbc.** The diff was reviewed line-by-line to confirm the claimed fixes. The commit removes raw `db.select`/`db.update` calls on `orders` and `order_items`, replaces them with `storage.*` calls that take `tenantId` as a parameter, and adds `AND tenant_id = $...` to the one remaining raw query (the `order_items` UPDATE in merge-tables).
3. **Manual reading of current handler bodies.** Each handler at its current line number (post-drift) was read end-to-end for residual unscoped queries. None found.

**Citation drift.** Every audit register entry cites line numbers that no longer match the code:

| Finding | Audit cite | Current line | Drift |
|---|---|---|---|
| F-031 transfer-table | orders.ts:1265 | orders.ts:1342 | +77 |
| F-032 merge-tables | orders.ts:1295-1305 | orders.ts:1373 | +78-+68 |
| F-033 split-bill | orders.ts:1331 | orders.ts:1407 | +76 |

The drift is consistent (~76 lines) across all three because the same intermediate commits added code earlier in the file. This drift alone doesn't make the audit citations wrong — the *findings* are real — but the citations need refreshing in Phase 2.

---

## §3 F-031 transfer-table — closed

**Original finding:** `POST /api/orders/:id/transfer-table` handler used raw `db.select`/`db.update` calls without tenant scoping. An attacker authenticated as Tenant A could supply a Tenant B order ID and transfer it to a Tenant A table.

**Audit cite:** `server/routers/orders.ts:1265` (FINDINGS.md:39, findings-status-dump-2026-05-10.md:23, order-lifecycle.md, FINAL-REPORT.md).

**Current handler:** `server/routers/orders.ts:1342`.

**Pre-fix bug (from git show 08bdcbc):**
- Raw `db.select().from(orders).where(eq(id, orderId))` — no tenant filter.
- Raw `db.update(orders).set({ tableId }).where(eq(id, orderId))` — no tenant filter.
- `parseInt(req.params.id)` — would produce `NaN` for UUID order IDs.

**The parseInt observation answers F-069 Phase 1's Q-019/Q-025** about whether these endpoints were reachable from the frontend with real (UUID) order IDs. They were not. The pre-fix exploit required guessing integer order IDs that don't exist in this schema. F-031 was a Critical-by-class but Low-by-practical-reachability finding before fix.

**Fix in 08bdcbc:**
- `storage.getOrder(orderId, user.tenantId)` replaces the raw select.
- `storage.updateOrder(orderId, user.tenantId, { tableId })` replaces the raw update.
- `parseInt` removed.

**Current state:** [VERIFIED] tenant-scoped. No residual unscoped queries in the handler body.

---

## §4 F-032 merge-tables — closed

**Original finding:** `POST /api/orders/merge-tables` handler merged order items from a source order into a target order without verifying both orders belong to the caller's tenant. Pre-fix code also did the item move BEFORE the ownership check, allowing cross-tenant item theft if the check would have failed.

**Audit cite:** `server/routers/orders.ts:1295-1305` (FINDINGS.md:40, findings-status-dump-2026-05-10.md:24, order-lifecycle.md).

**Current handler:** `server/routers/orders.ts:1373`.

**Pre-fix bug (from git show 08bdcbc):**
- Item move via raw `db.update(orderItems).set({ orderId: targetOrderId }).where(eq(orderId, sourceOrderId))` — no `AND tenant_id = ...` filter on the WHERE clause.
- Ownership check ordering: the raw `db.select` for the source order happened AFTER the item move (for the table-freeing step), not before — meaning if the move succeeded and the source order didn't belong to the caller's tenant, items had already crossed tenants by the time the code noticed.

**Fix in 08bdcbc:**
- Explicit `storage.getOrder(sourceOrderId, user.tenantId)` AND `storage.getOrder(targetOrderId, user.tenantId)` BEFORE the item move. Either returns null → 404.
- `AND tenant_id = $...` added to the raw `order_items` UPDATE (the one raw query the commit message specifically mentions).
- Two more raw `db.select`/`db.update` calls on the orders table replaced with `storage.updateOrder(sourceOrderId, user.tenantId, ...)`.

**Current state:** [VERIFIED] tenant-scoped on both order references, ownership-check ordering correct (verify → move → cancel), raw `order_items` UPDATE has tenant filter.

**Residual [HYPOTHESIS] observation:** The post-fix code writes a notes string of the form `"Merged into order #" + targetOrderId` via `storage.updateOrder(sourceOrderId, user.tenantId, { status: "cancelled", notes: ... })`. `targetOrderId` was ownership-verified one line above, but is not length/format validated. A caller passing a 100KB string would write a 100KB notes blob. Bounded by the prior ownership check (no exploit path), but Low/Info-worthy if anyone is auditing for input validation hygiene. Not filed as a separate finding — too low-severity for the launch-blocker queue.

---

## §5 F-033 split-bill — closed

**Original finding:** `POST /api/orders/:id/split-bill` handler used raw `db.select` on orders/order_items without tenant scoping when computing split totals.

**Audit cite:** `server/routers/orders.ts:1331` (FINDINGS.md:41, findings-status-dump-2026-05-10.md:26, order-lifecycle.md:132).

**Current handler:** `server/routers/orders.ts:1407`.

**Phase 1 cross-reference:** F-283 Phase 1 (PR #47, audit/f283-phase1-static-investigation-2026-05-11.md) determined that this endpoint is **dead code** — no client caller, no server-side caller, three "split-bill" hits in client are all UI test-ids. The dead-code status doesn't make F-033 historical — the closure of the tenant scoping at the handler is still real work — but it does mean F-033's exploit surface was already zero by the time it would have been triggered.

**Fix in 08bdcbc:**
- `storage.getOrder(orderId, user.tenantId)` at L1415.
- `storage.getOrderItemsByOrder(orderId, user.tenantId)` at L1419.
- `emitToTenant(user.tenantId, ...)` at L1440 — websocket fan-out tenant-scoped.
- `auditLogFromReq(req, ...)` at L1441 — audit entry from session.

**Current state:** [VERIFIED] tenant-scoped. Handler is a pure read-only computation (no DB writes), so even before the fix the worst-case exploit was a read across tenants. With the fix, no exploit surface remains.

**Note:** F-068 in audit/FINDINGS.md was flagged as a duplicate of F-033 by FINAL-REPORT.md:116/123 and findings-status-dump-2026-05-10.md:355. The dup observation stands. F-068's status should track F-033's — Phase 2 also flips F-068 to Closed with the same commit reference.

---

## §6 Traceability gap — secondary register defect

The fix commit and its merge commit name F-033 but not F-031 or F-032, despite the diff covering all three. Verified via `git log --grep`:

| Query | Hits |
|---|---|
| `git log --grep="F-031"` | 0 |
| `git log --grep="F-032"` | 0 |
| `git log --grep="F-033"` | 2 (commit `08bdcbc` + merge `c7ea82f`) |
| `git log --grep="08bdcbc"` | 0 (no later commit back-references the fix SHA) |

[VERIFIED] F-031 and F-032 are unsearchable via Git metadata across the entire repository history. A future auditor running `git log --grep="F-031"` to investigate "what closed F-031?" gets nothing. They would need to know in advance to read the body of the F-033 commit, which mentions transfer-table and merge-tables incidentally in its summary line. No subsequent commit cites the `08bdcbc` SHA either, so back-reference search also fails.

**Secondary defect details:**
- Commit message title: `fix(security): F-033 close cross-tenant IDOR on transfer-table, merge-tables, split-bill` — only F-033 in the searchable position.
- Fix branch name: `fix/F-033-split-bill-cross-tenant` — also misleadingly narrow.
- Commit body lists all three endpoints by route name but not by finding ID.

**Impact:** Audit-traceability only. Not a security issue. But it does explain why the register went un-updated for ~4 weeks: F-031 and F-032 had no Git breadcrumb to trigger reconciliation, and the F-033 commit's title doesn't say "closes F-031" in a way that would prompt updating those entries.

**Recommendation for Phase 2:** Phase 2's register reconciliation must explicitly cite commit `08bdcbc` for all three findings — adding the breadcrumb that the original commit didn't.

---

## §7 NEW finding — POST /api/orders body-spread fragility (F-289 candidate)

**Site:** `server/routers/orders.ts:588-602`.

**Pattern:**
```javascript
const { items, supervisorOverride, dismissedRuleIds, manualDiscountAmount, clientOrderId, ...orderData } = req.body;
// ...
const serverOrderData = {
  ...orderData,                    // L589 — rest-spread of req.body lands here, INCLUDING any attacker-controlled tenantId
  tenantId: user.tenantId,         // L590 — explicit override AFTER the spread
  waiterId: user.id,
  outletId: resolvedOutletId,
  // ...
};
order = await storage.createOrder(serverOrderData);
```

**Why it's currently safe:** JavaScript object-literal key precedence: when the same key appears twice in a literal, the later one wins. `tenantId: user.tenantId` at L590 comes after `...orderData` at L589, so user.tenantId overrides any body-controlled `req.body.tenantId`. Same for `waiterId` and `outletId`.

**Why it's fragile:**
- No `delete orderData.tenantId` before the spread.
- No whitelist-based field copy.
- Safety depends entirely on the textual ordering of keys in the object literal.
- Any future refactor that runs a "sort object keys alphabetically" linter rule, or reorders the literal for any reason, would silently turn this into a Critical cross-tenant write IDOR.

**Exploit path if the defense breaks:** An attacker authenticated as Tenant A POSTs to `/api/orders` with `tenantId: "<Tenant B UUID>"` in the body. The new order is written into Tenant B's namespace. All downstream behavior (KOT firing, table state, billing, audit log) executes against Tenant B's data using Tenant A's identity.

**Severity (Phase 1 estimate):** MEDIUM. Defense-in-depth issue, not currently exploitable. But the failure mode is Critical, and the trigger (linter rule, key sort, refactor) is low-effort and accidental.

**Scope of pattern:** This Phase 1 only inspected `POST /api/orders`. The same `{ ...spread, tenantId: user.tenantId }` pattern likely exists at many other write sites across `server/routers/*`. F-289's own Phase 1 should run `grep -rn "\.\.\.req\.body\|\.\.\.orderData\|\.\.\..*Data" server/routers/` and audit each hit.

**Deferral rationale:** Per CLAUDE.md hard-rule #2 (read-only to application code in audit pass), this Phase 1 reports the finding but does not propose a code-level fix. F-289 gets its own track. Investigating the broader pattern in this Phase 1 would blur audit/fix boundaries and also be premature — fix shape depends on how many sites the pattern appears at.

To be filed as F-289 in `audit/00-backlog.md` FOLLOW-UP section as part of this Phase 2.

---

## §8 Phase 2 scope

Phase 2 is pure register reconciliation + one new finding file. **No production code changes.**

**Edits required:**

1. **`audit/FINDINGS.md`:**
   - L39 (F-031): "Open" → "Closed (08bdcbc, 2026-04-16)".
   - L40 (F-032): "Open" → "Closed (08bdcbc, 2026-04-16)".
   - L41 (F-033): "Open" → "Closed (08bdcbc, 2026-04-16)".
   - Update each entry's line citation from drifted (1265/1295-1305/1331) to current (1342/1373/1407).
   - F-068 (if present and marked dup of F-033): status flip to Closed with same reference.

2. **`audit/findings-status-dump-2026-05-10.md`:**
   - L23 (F-031), L24 (F-032), L26 (F-033): same status flip + line-citation refresh.
   - L355 (F-068 if present): same.

3. **`audit/02-data-flows/order-lifecycle.md`:**
   - L132 ("Split-bill endpoint has no tenant_id check"): note that this was fixed in 08bdcbc.
   - Any equivalent notes for transfer-table and merge-tables: same.

4. **`audit/FINAL-REPORT.md`:**
   - L116 + L123 (F-033/F-068 dup-tracking notes): status flip alongside the dup observation.

5. **`audit/00-backlog.md` FOLLOW-UP section:**
   - File F-289 — POST /api/orders body-spread fragility. ~12-15 line bullet, same shape as F-287 and F-288 (architectural debt, post-launch trigger, investigation steps).

**Estimated PR size:** 4-6 audit doc files modified, ~20-30 lines changed/added total. Single commit, single PR.

---

## §9 Open questions

- **Q-031-Q1 / Q-032-Q1 / Q-033-Q1.** Register reconciliation paths: flip in all four audit doc files (FINDINGS.md, findings-status-dump, order-lifecycle.md, FINAL-REPORT.md)? Phase 1 recommends yes for all four — skipping any leaves an inconsistent register. (Locked.)
- **Q-289-Q1.** Harden the live path at `orders.ts:588` immediately as part of this Phase 2, or defer to F-289's own dedicated Phase 2? Phase 1 recommends defer — premature hardening of one site locks in the wrong fix shape if the same pattern is found across 10+ routers in F-289's own Phase 1.
- **Q-289-Q2.** Should F-289's Phase 1 run a codebase-wide grep for the pattern (`\.\.\.req\.body|\.\.\.orderData|\.\.\..*Data` across `server/routers/`) before proposing fix paths? Phase 1 recommends yes — fix shape (one-line per site vs. shared `safeCreate` helper) depends on count of affected sites.
- **Q-031/032/033-Q2.** F-068 status: is F-068 marked as "Duplicate of F-033" in the register (per FINAL-REPORT.md), and if so should Phase 2 also flip its status to Closed pointing at 08bdcbc? Phase 1 needs to confirm F-068's current status text before deciding — single grep in Phase 2 prep.
- **Q-031/032/033-Q3.** Commit message hygiene going forward — should this project adopt a convention where commit titles include ALL finding IDs being closed (e.g., `fix(security): F-031/F-032/F-033 close cross-tenant IDOR`)? Documenting this convention in CLAUDE.md or a CONTRIBUTING.md prevents recurrence of the F-031/F-032 traceability gap. Out of scope for this Phase 2 (would be a process/docs finding, F-290+ candidate).

---

## §10 Phase 2 recommendation

Phase 2 unblocks immediately. No stakeholder decisions needed beyond Q-031/032/033-Q1 (already recommended yes, locked in §9), Q-289-Q1 (already recommended defer, locked in §9), Q-289-Q2 (already recommended yes, locked in §9 — applies to F-289's own future Phase 1, not this Phase 2).

Optional decisions that don't block:
- Q-031/032/033-Q2 (F-068 status) — Phase 2 prep can grep + decide on the fly.
- Q-031/032/033-Q3 (commit message convention) — defer to a separate process finding.

**Phase 2 estimate:** ~20-30 minutes. Pure markdown edits across 4-5 audit files + one new finding bullet.

**No regression test will be added** — Phase 2 doesn't touch production code. F-289's own Phase 2 will face the standard "no test infrastructure" caveat when it lands.

This commit is PR1 of F-031/F-032/F-033's 4-PR sequence — adapted shape for the combined-closure case:
- **PR1 (this):** Phase 1 audit doc verifying closure + surfacing F-289.
- **PR2:** Q-031/032/033 + Q-289 decisions lock (might be empty given §9 recommendations are clear; consider folding PR1+PR2 if no stakeholder pushback).
- **PR3:** Phase 2 register reconciliation + F-289 filing.
- **PR4:** Follow-up findings filing (likely empty for this track; F-289 itself spawns its own track).

Per the `feedback_tier1_audit_4pr_sequence.md` memory pattern, adapted for the combined-closure shape.

---

*Phase 1 complete. Awaiting stakeholder decisions on Q-031-Q1/Q-032-Q1/Q-033-Q1, Q-289-Q1, Q-289-Q2 before Phase 2.*
