-- audit/orphan-delivery-orders-cleanup.sql
--
-- Purpose: Delete 53 orphan delivery_orders rows + downstream rows
-- across 2 test tenants. Pivot from earlier "backfill" plan to
-- delete-not-backfill (orphans confirmed by recon to be test data
-- from manual testers, not real customer orders). Tracks the
-- BLOCKING entry in audit/00-backlog.md.
--
-- Date drafted: 2026-04-30
-- Recon source: audit/orphan-delivery-orders-recon.sql (committed 1a9e30c)
--
-- ============================================================
-- HOW TO RUN
-- ============================================================
--
-- STEP 1 — DRY RUN (default; no data change)
--   Open this file in TablePlus connected to production.
--   Execute the entire script as-is. The transaction ends with
--   ROLLBACK so no rows are persisted.
--   Review the RAISE NOTICE output. Confirm:
--     - Pre-counts match recon (orders=53, order_items=83, bills=32,
--       kot_events=1, feedback=0; stock_movements=2 will FK-SET-NULL)
--     - Each DELETE reports the expected row_count
--     - Post-cleanup orphan count is 0 (RAISE EXCEPTION fires if not)
--     - Post-cleanup per-table residual counts are 0 each
--     - stock_movements SET-NULL count matches v_stock_pre
--
-- STEP 2 — REAL RUN (after dry-run output approved)
--   Edit the last two lines of this file:
--     1. Comment out      ROLLBACK;   -- (current default — dry run)
--     2. Uncomment    --  COMMIT;     -- (becomes REAL run)
--   Save and execute again. RAISE NOTICE output will be identical;
--   the difference is the changes now persist.
--
-- ============================================================
-- WARNING — DESTRUCTIVE OPERATION
-- ============================================================
-- This script DELETES rows from 5 tables for orders matching ALL of:
--
--   tenant_id IN (
--     '6a8281c4-8e66-4214-84ad-2d0e3231cc76',  -- "Updated Tenant Name Test" (AED)
--     '74f513e3-9db5-4a9b-b427-6a4c2a6eb082'   -- "Table Salt Platform"       (USD)
--   )
--   AND order_type IN (
--     'delivery', 'phone_delivery', 'online_delivery', 'third_party'
--   )
--   AND no matching delivery_orders row exists for that order
--
-- Tables touched (DELETE):
--     orders, order_items, bills, kot_events, feedback
-- Tables touched (FK SET NULL on order_id):
--     stock_movements   (rows preserved; order_id becomes NULL)
--
-- Constraints respected by this script:
--     - No DDL (no CREATE / ALTER / DROP / TRUNCATE; no temp tables)
--     - No UPDATEs (only DELETEs; SET NULL is automatic via FK)
--     - No sequence resets
--     - tenant_id + order_type filters are defense-in-depth
-- ============================================================

-- Reset session read-only flag in case operator ran the recon SQL
-- earlier in this session (recon sets default_transaction_read_only = on).
SET default_transaction_read_only = off;

BEGIN;

DO $cleanup$
DECLARE
  v_orphan_ids        text[];
  v_stock_mvmt_ids    text[];
  v_orders_pre        INTEGER;
  v_items_pre         INTEGER;
  v_bills_pre         INTEGER;
  v_kot_pre           INTEGER;
  v_feedback_pre      INTEGER;
  v_stock_pre         INTEGER;
  v_deleted_items     INTEGER;
  v_deleted_bills     INTEGER;
  v_deleted_kot       INTEGER;
  v_deleted_feedback  INTEGER;
  v_deleted_orders    INTEGER;
  v_remaining_orphans INTEGER;
  v_items_post        INTEGER;
  v_bills_post        INTEGER;
  v_kot_post          INTEGER;
  v_feedback_post     INTEGER;
  v_stock_nulled      INTEGER;
BEGIN

  -- ----- Materialize the orphan ID set -----
  -- Frozen here at the top of the DO block. Every DELETE below
  -- references the same array. Defense in depth: even if rows
  -- changed mid-transaction (which they should not under normal
  -- operation), every DELETE operates on the exact set the recon
  -- validated.
  SELECT COALESCE(array_agg(o.id), ARRAY[]::text[])
  INTO v_orphan_ids
  FROM orders o
  WHERE o.tenant_id IN (
          '6a8281c4-8e66-4214-84ad-2d0e3231cc76',
          '74f513e3-9db5-4a9b-b427-6a4c2a6eb082'
        )
    AND o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')
    AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.order_id = o.id);

  v_orders_pre := COALESCE(array_length(v_orphan_ids, 1), 0);

  -- Materialize the stock_movements row IDs so we can verify
  -- post-cleanup that exactly those rows had their order_id
  -- set to NULL via FK ON DELETE SET NULL.
  SELECT COALESCE(array_agg(sm.id), ARRAY[]::text[])
  INTO v_stock_mvmt_ids
  FROM stock_movements sm
  WHERE sm.order_id = ANY(v_orphan_ids);

  -- ----- Pre-counts -----
  SELECT COUNT(*) INTO v_items_pre    FROM order_items     WHERE order_id = ANY(v_orphan_ids);
  SELECT COUNT(*) INTO v_bills_pre    FROM bills           WHERE order_id = ANY(v_orphan_ids);
  SELECT COUNT(*) INTO v_kot_pre      FROM kot_events      WHERE order_id = ANY(v_orphan_ids);
  SELECT COUNT(*) INTO v_feedback_pre FROM feedback        WHERE order_id = ANY(v_orphan_ids);
  SELECT COUNT(*) INTO v_stock_pre    FROM stock_movements WHERE order_id = ANY(v_orphan_ids);

  RAISE NOTICE '========== Pre-cleanup counts ==========';
  RAISE NOTICE 'Pre-cleanup: orders=%, order_items=%, bills=%, kot_events=%, feedback=%',
    v_orders_pre, v_items_pre, v_bills_pre, v_kot_pre, v_feedback_pre;
  RAISE NOTICE 'Plus stock_movements=% (will be SET NULL via FK, not deleted)', v_stock_pre;
  RAISE NOTICE 'Expected from recon: orders=53, order_items=83, bills=32, kot_events=1, feedback=0, stock_movements=2';

  IF v_orders_pre = 0 THEN
    RAISE EXCEPTION 'No orphan orders found — either already cleaned up, or the tenant_id/order_type filter has drifted. Aborting.';
  END IF;

  -- ----- DELETEs in dependency order -----
  -- Children first, then parent (orders).
  -- stock_movements is FK ON DELETE SET NULL — handled automatically
  -- by the orders DELETE at the end; not deleted here.

  DELETE FROM order_items WHERE order_id = ANY(v_orphan_ids);
  GET DIAGNOSTICS v_deleted_items = ROW_COUNT;
  RAISE NOTICE 'DELETE order_items: % rows', v_deleted_items;

  DELETE FROM bills WHERE order_id = ANY(v_orphan_ids);
  GET DIAGNOSTICS v_deleted_bills = ROW_COUNT;
  RAISE NOTICE 'DELETE bills: % rows', v_deleted_bills;

  DELETE FROM kot_events WHERE order_id = ANY(v_orphan_ids);
  GET DIAGNOSTICS v_deleted_kot = ROW_COUNT;
  RAISE NOTICE 'DELETE kot_events: % rows', v_deleted_kot;

  DELETE FROM feedback WHERE order_id = ANY(v_orphan_ids);
  GET DIAGNOSTICS v_deleted_feedback = ROW_COUNT;
  RAISE NOTICE 'DELETE feedback: % rows', v_deleted_feedback;

  DELETE FROM orders WHERE id = ANY(v_orphan_ids);
  GET DIAGNOSTICS v_deleted_orders = ROW_COUNT;
  RAISE NOTICE 'DELETE orders: % rows', v_deleted_orders;

  -- ----- Post-cleanup verification -----
  RAISE NOTICE '========== Post-cleanup verification ==========';

  -- (1) Re-run the recon's Q1 query and assert orphan count is 0.
  SELECT COUNT(*)
  INTO v_remaining_orphans
  FROM orders o
  WHERE o.tenant_id IN (
          '6a8281c4-8e66-4214-84ad-2d0e3231cc76',
          '74f513e3-9db5-4a9b-b427-6a4c2a6eb082'
        )
    AND o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')
    AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.order_id = o.id);

  RAISE NOTICE 'Recon Q1 re-run (remaining orphans): % (expected 0)', v_remaining_orphans;

  IF v_remaining_orphans <> 0 THEN
    RAISE EXCEPTION 'Post-cleanup orphan count is %, expected 0 — assertion failed; transaction will roll back.', v_remaining_orphans;
  END IF;

  -- (2) Per-table residual counts referenced by the original orphan
  --     IDs (the IDs themselves no longer exist; queries must return 0).
  SELECT COUNT(*) INTO v_items_post    FROM order_items WHERE order_id = ANY(v_orphan_ids);
  SELECT COUNT(*) INTO v_bills_post    FROM bills       WHERE order_id = ANY(v_orphan_ids);
  SELECT COUNT(*) INTO v_kot_post      FROM kot_events  WHERE order_id = ANY(v_orphan_ids);
  SELECT COUNT(*) INTO v_feedback_post FROM feedback    WHERE order_id = ANY(v_orphan_ids);

  RAISE NOTICE 'Per-table residuals (expected 0 each): order_items=%, bills=%, kot_events=%, feedback=%',
    v_items_post, v_bills_post, v_kot_post, v_feedback_post;

  IF v_items_post <> 0 OR v_bills_post <> 0 OR v_kot_post <> 0 OR v_feedback_post <> 0 THEN
    RAISE EXCEPTION 'Per-table residual non-zero — child rows survived the parent DELETE; transaction will roll back.';
  END IF;

  -- (3) stock_movements SET-NULL verification: the rows we materialized
  --     before the DELETE should now have order_id = NULL via FK
  --     ON DELETE SET NULL.
  SELECT COUNT(*)
  INTO v_stock_nulled
  FROM stock_movements
  WHERE id = ANY(v_stock_mvmt_ids)
    AND order_id IS NULL;

  RAISE NOTICE 'stock_movements rows previously linked to orphans, now order_id=NULL: % (expected %)',
    v_stock_nulled, v_stock_pre;

  IF v_stock_nulled <> v_stock_pre THEN
    RAISE EXCEPTION 'stock_movements SET-NULL count mismatch (% expected, % actual); transaction will roll back.',
      v_stock_pre, v_stock_nulled;
  END IF;

  RAISE NOTICE '========== Cleanup complete ==========';
  RAISE NOTICE 'Deleted: orders=%, order_items=%, bills=%, kot_events=%, feedback=%',
    v_deleted_orders, v_deleted_items, v_deleted_bills, v_deleted_kot, v_deleted_feedback;
  RAISE NOTICE 'SET-NULL: stock_movements=%', v_stock_nulled;
  RAISE NOTICE 'See bottom of file for transaction termination (ROLLBACK = dry run, COMMIT = real run).';

END $cleanup$;

-- ============================================================
-- TRANSACTION TERMINATION   (CURRENT MODE: DRY RUN)
-- ============================================================
-- After dry-run output is reviewed and approved:
--   1. Comment out the ROLLBACK below
--   2. Uncomment the COMMIT below
--   3. Re-run this script in TablePlus
-- ============================================================
ROLLBACK;
-- COMMIT;

-- ============================================================
-- RUN RESULTS
-- ============================================================
--
-- Dry-run executed: 2026-04-30 (TablePlus, "ServeOS Production : railway")
--   Pre-cleanup counts (matched recon exactly):
--     orders=53, order_items=83, bills=32, kot_events=1, feedback=0
--     stock_movements=2 (will SET NULL via FK)
--   All three assertions passed; transaction rolled back as designed.
--
-- Real-run executed: 2026-04-30 (after fresh manual snapshot 2026-04-30 12:17 UTC)
--   Output identical to dry-run; transaction COMMITTED.
--   Deleted: orders=53, order_items=83, bills=32, kot_events=1, feedback=0
--   SET NULL: stock_movements=2
--
-- Post-cleanup verification (separate read-only SELECT in TablePlus):
--   remaining_orphans=0
--   items_on_orphans=0
--   bills_on_orphans=0
--
-- All counts match expectations. No anomalies.
-- ============================================================
