# F-285 Phase 1 — Shift close "Expected Cash" returns opening float verbatim instead of opening + cash sales

Date: 2026-05-11
Branch: audit/f285-phase1-static-investigation-2026-05-11

## §1 — Summary

F-285 is shift-close "Expected Cash" returning opening float verbatim instead of opening + cash sales. Severity HIGH (BLOCKING — money reporting integrity, undetectable cash drift at shift close). Root cause: case-mismatch on payment-method magic strings. The bill_payments writer at server/routers/restaurant-billing.ts:534 stores client-supplied paymentMethod verbatim without case normalization. The close-shift report reader at server/storage.ts:2781 looks up revenueByMethod["CASH"] (uppercase only). When the client writes lowercase "cash" (which one of two parallel POS UIs does), the lookup misses, falls back to 0, and expectedCash collapses to openingFloat. F-286 Phase 2 fix today does NOT cascade-resolve this — F-286 is on orders.payment_status, F-285 is on bill_payments.payment_method. Independent bugs.

## §2 — Reframe note

F-285 is NOT a reframing of F-123. The F-285 backlog entry (audit/00-backlog.md, original PR #37) claims to "reframe F-123 from MEDIUM to HIGH." This was a tester triage error. F-123 (FINDINGS.md:136) is per-item modifier-price rounding at server/routers/orders.ts:492,504 — a subtotal-computation float-arithmetic bug. F-285 is shift-close cash aggregation case-mismatch — different file, different layer, different bug class. F-123 is an independently still-open finding that should not be auto-closed by F-285's Phase 2. PR4 follow-up after Phase 2 will correct the backlog entry text.

## §3 — Schema verification [VERIFIED]

Three relevant tables in shared/schema.ts:

- posSessions (lines 2996-3034): tracks shift state. Columns: openingFloat (decimal default "0"), closingCashCount (decimal nullable), totalRevenue (decimal default "0", populated at close), revenueByMethod (jsonb, populated at close), totalOrders (integer default 0). NO expectedCash column — it's computed at read time, not stored.
- bills (lines 2874-2943): posSessionId column links bill to shift session (the join key for getPosSessionReport).
- billPayments (lines 2952-2993): payment records per bill. paymentMethod column is text (no enum, no constraint). Stored value is whatever the writer transmits.

Phase 2 pre-flight verification note (recon SQL): before Phase 2 code edits, run a read-only SELECT against production bill_payments to confirm distinct paymentMethod values and case distribution. Expected hypothesis: mix of "CASH" (uppercase, from BillPreviewModal.tsx) and "cash" (lowercase, from pos.tsx). Confirms which percentage of historical data is affected.

## §4 — Read-side flow [VERIFIED]

The close-shift handler at server/routers/restaurant-billing.ts:1009-1040 calls storage.getPosSessionReport(session.id). The report function at server/storage.ts:2757-2784:

1. Loads posSessions row.
2. Loads bills WHERE bills.posSessionId = sessionId.
3. Filters paid bills only (bills.paymentStatus === "paid"). Note: filters on bills, not orders — so F-286 dependency confirmed independent (see §5).
4. Loads bill_payments WHERE billPayments.billId IN (paidBills).
5. For each non-refund payment: revenueByMethod[p.paymentMethod] = (existing ?? 0) + amount. Note: uses raw column value as the dictionary key — case-preserving.
6. cashSales = revenueByMethod["CASH"] ?? 0  ← THE BUG SITE. Hardcoded uppercase lookup. If writer stored "cash", this returns undefined ?? 0 = 0.
7. expectedCash = Number(session.openingFloat ?? 0) + cashSales.
8. Returns { session, billCount, totalRevenue, revenueByMethod, cashSales, expectedCash }.

Secondary site: client/src/components/pos/PosSessionModal.tsx:150 ignores server's report.expectedCash and recomputes client-side: const expectedCash = report ? (Number(report.session?.openingFloat ?? 0) + (report.revenueByMethod?.CASH ?? 0)) : 0. Same uppercase magic string. Same case-mismatch surface. Two parallel computations of the same value, both fragile.

Same uppercase pattern repeats at PosSessionModal.tsx:161 (print-report path) and PosSessionModal.tsx:183 (cash-sales table row).

## §5 — F-286 dependency check [VERIFIED — INDEPENDENT]

getPosSessionReport filters on bills.paymentStatus === "paid" — NOT orders.payment_status. F-286's bug (and today's Phase 2 fix) was on the orders-side parallel write; the bills-side write was always correct. Therefore F-285's report has been reading the correct (bill-side) source all along. Today's F-286 Phase 2 fix does NOT cascade-resolve F-285. Two genuinely separate bugs.

## §6 — Write-side and bug-class scope [VERIFIED]

Four createBillPayment call sites in server/routers/restaurant-billing.ts:

- Line 65 (Razorpay finalize): paymentMethod = opts.paymentMethod, no normalization.
- Line 534 (cash/card/UPI loop, F-285 path): paymentMethod = p.paymentMethod from client request body, no normalization. THE WRITER SITE.
- Line 901 (refund): paymentMethod = paymentMethod || "CASH" (uppercase default).
- Line 1171 (manual pending fallback): paymentMethod = paymentMethod || "manual_pending" (lowercase default).

None of the four sites normalize case. All four pass through whatever the client transmits.

Two parallel client POS UIs with conflicting conventions:

- client/src/components/pos/BillPreviewModal.tsx (lines 65, 197, 692, 866, 1684, 1685, 1696, 1925, 2019): TS type union "CASH" | "CARD" | "UPI" | "LOYALTY" | "WALLET". Submits uppercase. End-to-end consistency — UI hits the lookup correctly.
- client/src/pages/modules/pos.tsx (lines 122, 360, 2420, 2431, 2481): TS type union "cash" | "card" | "upi". Submits lowercase. End-to-end consistency in this file BUT lowercase. UI misses the lookup at storage.ts:2781.

Whichever path the F-285 testers used (most likely pos.tsx based on lowercase symptom), bill_payments rows landed lowercase, revenueByMethod["CASH"] missed, drift = full sum of cash sales.

NO defensive constants, NO enums, NO Zod boundary enforcement. Every "CASH"/"cash" in the codebase is a raw magic-string literal. Repo-wide grep counts: ~21 uppercase hits, ~7 lowercase hits, zero defensive constants. Mixed conventions are not a recent regression — the two POS UIs have coexisted for some time.

[HYPOTHESIS — Phase 2 to verify by SQL]: F-285 reproducibility correlates with which UI the cashier used. BillPreviewModal sessions reconcile correctly; pos.tsx sessions show drift = -cash_sales.

## §7 — Fix options

Three credible paths. Phase 1 lays out tradeoffs without locking a recommendation.

**Path A — Reader-side case-insensitive lookup (smallest change):**

Edit server/storage.ts:2781 to normalize lookup. Two implementations:

- Iterate the dictionary keys with `.toUpperCase()` comparison: const cashSales = Object.entries(revenueByMethod).find(([k]) => k.toUpperCase() === "CASH")?.[1] ?? 0
- Or normalize keys at insert: when building revenueByMethod in the loop, use method.toUpperCase() as the key.

Also requires fixing PosSessionModal.tsx:150, 161, 183 with the same pattern (client recomputation).

Estimated: 2-4 lines server, 3 lines client.

Pros: Conservative. No data backfill. Closes immediate symptom for both new and historical data. Bug-class-closing for case-fragility on the reader side.

Cons: Doesn't fix the writer inconsistency. Future readers added by other devs may still be case-sensitive. Stores remain mixed-case in the DB, which is its own audit concern.

**Path C — Writer-side normalization + DB backfill:**

Edit createBillPayment writer at restaurant-billing.ts:534 (and others) to coerce paymentMethod.toUpperCase() before insert. Plus a one-time SQL UPDATE backfill: UPDATE bill_payments SET payment_method = UPPER(payment_method) WHERE payment_method != UPPER(payment_method).

Estimated: 4-6 lines code + 1 SQL migration.

Pros: Single canonical case in the DB going forward. Closes symptom AND normalizes data. Simpler reads (no per-call normalization).

Cons: Backfill writes to production data — destructive operation requiring stakeholder review. Doesn't address the root pattern (no enum, no Zod, no DB constraint) — future readers still trust case discipline. Two parallel POS UIs still write inconsistently at the application layer; only the storage layer is normalized.

**Path D — Architectural fix: paymentMethodEnum + Zod boundary + DB CHECK constraint:**

Add a shared payment-method enum in shared/schema.ts. Migrate the bills/billPayments tables to use the enum (or add CHECK constraint on payment_method column). Add Zod schema validation at API boundary that coerces incoming paymentMethod to canonical case. Migrate all 28 magic-string sites to import the enum.

Estimated: ~30+ files touched, full TS surface change, DB migration with CHECK or enum type.

Pros: Closes the entire bug class permanently. Future regressions impossible at compile time + runtime + DB. Same shape as F-287's "three writers" architectural debt finding.

Cons: Multi-day scope. Risk of breaking existing UIs if migration isn't surgical. Not appropriate for pre-launch work — this is post-launch hardening.

## §8 — Open questions

**Q-285-Q1 [stakeholder decision required]:** Which path for F-285 Phase 2? Path A (reader-side, conservative, ~5 lines) vs Path C (writer-side + backfill, normalizes data) vs Path D (enum + Zod, post-launch only). Recommendation context: Path A is conservative and bug-class-closing on the reader; Path C is more thorough but requires production-data backfill which is destructive; Path D is architectural cleanup that's the same scope as F-287's deferred work. Path A is the cheapest launch-blocker fix.

**Q-285-Q2 [stakeholder decision]:** Should PosSessionModal.tsx use the server-computed report.expectedCash directly, eliminating the client-side recomputation? Currently PosSessionModal.tsx:150 ignores report.expectedCash and recomputes from raw fields. This duplicates the case-sensitivity surface in two layers — server and client both have to be patched in lockstep for any Phase 2 fix. Recommendation context: removing the client recomputation is small (3 lines) and eliminates one layer of fragility. But it's an architectural cleanup that's tangential to F-285's bug — Phase 2 can ship without it.

**Q-285-Q3 [stakeholder decision]:** File F-288 as a separate finding now (Option X) or roll into F-285's Path D as the deferred fix (Option Y)? F-288 would capture: "no payment-method enum, no Zod boundary, no DB constraint — case-fragility class with 28+ magic-string sites." Same shape as F-287's capture pattern from F-286 Phase 2. Recommendation context: filing F-288 separately gives the architectural debt its own F-number for post-launch tracking, mirroring how F-287 was handled. Rolling into F-285 Path D conflates the launch-blocker with the architectural fix.

## §9 — Phase 2 recommendation

Phase 2 should NOT begin until Q-285-Q1, Q-285-Q2, Q-285-Q3 are locked.

Pre-Phase-2 verification (per §3): run read-only SQL against production bill_payments to confirm case distribution. SELECT payment_method, COUNT(*) FROM bill_payments WHERE tenant_id = '<tenant>' GROUP BY payment_method;. Confirms which percentage of historical data uses lowercase. If 100% are uppercase, F-285 may not have a production manifestation today (Path A still recommended for hardening; Path C backfill becomes unnecessary).

Phase 2 size estimate (Path A baseline): 2-4 server lines + 3 client lines = ~7 lines across 2 files. ~30-60 minutes implementation + ~15 minutes regression test work (manual: pay a bill via each POS UI variant, close shift, verify expectedCash matches sum).

If Path C is chosen at Q-285-Q1: add ~4 lines of writer normalization + 1 SQL backfill migration = +30 minutes.

If Path D is chosen at Q-285-Q1: defer Phase 2 entirely until post-launch. F-285 stays open in BLOCKING with explicit "deferred to F-288 architectural fix" note.
