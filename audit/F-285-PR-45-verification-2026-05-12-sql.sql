-- F-285 PR #45 verification — SQL diagnostic 2026-05-12 afternoon
--
-- Branch: audit/F-285-PR-45-verification-2026-05-12
-- Tool: TablePlus connected to Railway production (PostgreSQL 18.3)
-- Mode: READ ONLY. No writes. No transactions.
-- Operator: Arunkumar S, in chat session with Claude.
-- Time window: ~17:00-17:30 UAE time.
--
-- Purpose: verify whether PR #45 (F-285 cash drift fix, commit 0e00e9c)
-- actually works in production, after tester Nandhini's Tier III workbook
-- reported 11 of 14 F-285 cases FAILED with identical observation: "cash
-- sale value is remaining 0. Only the float value when opening the shift
-- is added the account."
--
-- Result: PR #45 fix is structurally broken in production. Reader-side
-- case-insensitive lookup at storage.ts:2781 cannot produce data because
-- bills.pos_session_id is 100% NULL across all recent bills, so the join
-- it reads from returns zero rows regardless of case-handling. The bug
-- is on the writer side, not the reader side. Filed as F-294.

-- ============================================================
-- Query A: bills schema introspection (to find correct column names).
-- Initial attempt used "total" column which doesn't exist; the actual
-- columns are total_amount, payment_status, paid_at, pos_session_id, etc.
-- payment_method lives on bill_payments, not bills.
-- ============================================================

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'bills'
ORDER BY ordinal_position;

-- ============================================================
-- Query B: inspect Nandhini's 7 failed bill IDs from REG-01 (F-285)
-- workbook. Bill short IDs from her Tester Notes column:
--   6EDB84 (F285-01), 204C98 / C4D39E / D77FE3 (F285-03),
--   8F4395 (F285-07), 14D9B0 (F285-08), 67850F (F285-N04).
-- All 7 rows returned. payment_status='paid' on all 7. paid_at populated.
-- CRITICAL FINDING: pos_session_id = NULL on all 7.
-- ============================================================

SELECT id, tenant_id, outlet_id, total_amount, payment_status,
       paid_at, created_at, pos_session_id, order_id
FROM bills
WHERE id::text ILIKE '%6edb84%'
   OR id::text ILIKE '%204c98%'
   OR id::text ILIKE '%c4d39e%'
   OR id::text ILIKE '%d77fe3%'
   OR id::text ILIKE '%8f4395%'
   OR id::text ILIKE '%14d9b0%'
   OR id::text ILIKE '%67850f%'
ORDER BY created_at DESC;

-- ============================================================
-- Query C: scope check — is the NULL pos_session_id specific to
-- Nandhini's test session, or a broader pattern?
-- Result: 49 bills since 2026-05-10, ALL 49 have NULL pos_session_id.
-- 100.00% NULL rate. Not test-session specific. Production-wide.
-- ============================================================

SELECT
  COUNT(*) AS total_bills_recent,
  COUNT(pos_session_id) AS bills_with_session,
  COUNT(*) - COUNT(pos_session_id) AS bills_without_session,
  ROUND(100.0 * (COUNT(*) - COUNT(pos_session_id)) / COUNT(*), 2) AS pct_null
FROM bills
WHERE created_at >= '2026-05-10 00:00:00';

-- ============================================================
-- Query D: F-283 PR #50 cross-check — Nandhini's REG-01 split bill
-- failure produced two child order IDs: EC30CE and 82CAB7.
-- Findings:
--   - Both children exist in orders table.
--   - parent_order_id = 4cd9b028-004b-4167-ad96-affa585dc8d3 on both
--     (sequential POST loop ran correctly).
--   - is_split_bill = FALSE on both (despite PR #50 sending true).
--   - total = 0.00 on both (consistent with zero items, see Query E).
-- ============================================================

SELECT id, status, payment_status, parent_order_id, is_split_bill,
       total, channel, order_type, created_at
FROM orders
WHERE id::text ILIKE '%ec30ce%'
   OR id::text ILIKE '%82cab7%'
ORDER BY created_at DESC;

-- ============================================================
-- Query E: F-283 order_items count check on parent + 2 children.
-- Parent (4cd9b028) has 3 items as expected.
-- Both children show 0 rows in result = order_items count is zero.
-- ============================================================

SELECT order_id, COUNT(*) AS item_count
FROM order_items
WHERE order_id::text ILIKE '%6f4b5541%'
   OR order_id::text ILIKE '%bfcba778%'
   OR order_id::text ILIKE '%4cd9b028%'
GROUP BY order_id;

-- ============================================================
-- Conclusions captured in audit/00-backlog.md update notes for
-- F-283, F-285, F-294, and F-296. This SQL file is the artifact
-- record of the diagnostic. Next session uses these as starting
-- point for F-294 Phase 1 (bills.pos_session_id writer investigation)
-- and F-283 Phase 1 retry (Drizzle InsertOrder type + client
-- buildOrderData verification).
-- ============================================================
