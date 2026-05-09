-- audit/tampered-orders-recon-2026-05-10.sql
-- Production cleanup recon for 3 orders tampered during F-122 testing on 2026-05-10.
-- READ-ONLY: every query is SELECT-only. No INSERT, UPDATE, DELETE.
-- Run via TablePlus connected to Railway production database.
-- Source: Madhesh + Nandhini QA workbook 2026-05-10 Task 3a (bill amount tampering test).
-- Evidence: Madhesh_screenshots_Table_Salt_09-05-2026.docx images 24-30; Nandhini_9-5-2026.docx image24.
-- See audit/00-backlog.md F-284 for the bug this recon investigates.

-- =================================================================================
-- BILL #1 — #BAA2C4 (Madhesh Test 1)
-- =================================================================================
-- Expected outcome: legitimate payment of W100.10 succeeded (image24 200 OK),
-- then a replay attempt with the SAME idempotency key + tampered amount=50 was
-- rejected with 409 (image25 Console: "409 (Conflict)"). The replay protection
-- worked correctly — server rejected the duplicate idempotency key.
-- Red flag: any payment record with amount != 100.10, OR more than 1 payment record.

-- 1a. Bill metadata
SELECT id, order_id, tenant_id, subtotal, tax, total, status, created_at, updated_at
FROM restaurant_bills
WHERE id = 'f5064d88-e607-43df-91b2-d1038e959166';

-- 1b. Linked order metadata
SELECT id, short_id, status, tenant_id, total, payment_method, created_at
FROM orders
WHERE id = (SELECT order_id FROM restaurant_bills WHERE id = 'f5064d88-e607-43df-91b2-d1038e959166');

-- 1c. All payment records against this bill (with idempotency keys)
SELECT id, restaurant_bill_id, payment_method, amount, idempotency_key, created_at
FROM bill_payments
WHERE restaurant_bill_id = 'f5064d88-e607-43df-91b2-d1038e959166'
ORDER BY created_at;

-- 1d. Sum check: total of payments vs bill total (mismatch = bug)
SELECT
  rb.id AS bill_id,
  rb.total AS bill_total,
  COALESCE(SUM(bp.amount), 0) AS payments_sum,
  COUNT(bp.id) AS payment_count,
  rb.total - COALESCE(SUM(bp.amount), 0) AS difference
FROM restaurant_bills rb
LEFT JOIN bill_payments bp ON bp.restaurant_bill_id = rb.id
WHERE rb.id = 'f5064d88-e607-43df-91b2-d1038e959166'
GROUP BY rb.id, rb.total;


-- =================================================================================
-- BILL #2 — #691A0F (Madhesh Test 2) — THE CRITICAL ONE
-- =================================================================================
-- Expected outcome: legitimate payment of W100.07 succeeded (image28 200 OK),
-- THEN a tampered request with FRESH idempotency key + amount=50 ALSO returned
-- 200 OK (image29 Status: 200 OK, body amount=50). Order status shown as
-- "Completed" in image31. This is the F-284 bug evidence.
--
-- IF this bill has 2 payment records totaling W150.07 against a W100.07 bill,
-- F-284 is confirmed end-to-end. The bill is overpaid by W50 in the database.
--
-- IF this bill has only 1 payment record despite the 200 OK response on the
-- second request, the bug is different: the server returned 200 but didn't
-- persist. Investigation pivots.
--
-- Either outcome is a finding. Run query 2c (payment records) first and look
-- carefully at idempotency_keys and amounts.

-- 2a. Bill metadata
SELECT id, order_id, tenant_id, subtotal, tax, total, status, created_at, updated_at
FROM restaurant_bills
WHERE id = 'df4ce6c2-0ba5-4c3d-b41a-090fe4ea6a41';

-- 2b. Linked order metadata
SELECT id, short_id, status, tenant_id, total, payment_method, created_at
FROM orders
WHERE id = (SELECT order_id FROM restaurant_bills WHERE id = 'df4ce6c2-0ba5-4c3d-b41a-090fe4ea6a41');

-- 2c. ALL payment records against this bill — KEY QUERY for F-284 evidence
SELECT id, restaurant_bill_id, payment_method, amount, idempotency_key, created_at
FROM bill_payments
WHERE restaurant_bill_id = 'df4ce6c2-0ba5-4c3d-b41a-090fe4ea6a41'
ORDER BY created_at;

-- 2d. Sum check
SELECT
  rb.id AS bill_id,
  rb.total AS bill_total,
  COALESCE(SUM(bp.amount), 0) AS payments_sum,
  COUNT(bp.id) AS payment_count,
  rb.total - COALESCE(SUM(bp.amount), 0) AS difference,
  CASE
    WHEN COUNT(bp.id) > 1 AND COALESCE(SUM(bp.amount), 0) > rb.total THEN 'OVERPAID — F-284 confirmed'
    WHEN COUNT(bp.id) > 1 AND COALESCE(SUM(bp.amount), 0) = rb.total THEN 'MATCH but multiple records — different bug'
    WHEN COUNT(bp.id) = 1 THEN 'OK — single payment'
    ELSE 'INSPECT'
  END AS f284_verdict
FROM restaurant_bills rb
LEFT JOIN bill_payments bp ON bp.restaurant_bill_id = rb.id
WHERE rb.id = 'df4ce6c2-0ba5-4c3d-b41a-090fe4ea6a41'
GROUP BY rb.id, rb.total;


-- =================================================================================
-- BILL #3 — #D3C3F2 (Nandhini)
-- =================================================================================
-- Expected outcome: legitimate payment of W100.10, then 6 replay attempts with
-- SAME idempotency key + tampered amount=50 — all 409 rejected (image24 Console
-- shows 6 red-X payment requests). Replay protection worked.
-- Red flag: any payment record with amount != 100.10, OR more than 1 payment record.

-- 3a. Bill metadata
SELECT id, order_id, tenant_id, subtotal, tax, total, status, created_at, updated_at
FROM restaurant_bills
WHERE id = '3357df1c-6578-4a63-af53-86984e09954f';

-- 3b. Linked order metadata
SELECT id, short_id, status, tenant_id, total, payment_method, created_at
FROM orders
WHERE id = (SELECT order_id FROM restaurant_bills WHERE id = '3357df1c-6578-4a63-af53-86984e09954f');

-- 3c. Payment records
SELECT id, restaurant_bill_id, payment_method, amount, idempotency_key, created_at
FROM bill_payments
WHERE restaurant_bill_id = '3357df1c-6578-4a63-af53-86984e09954f'
ORDER BY created_at;

-- 3d. Sum check
SELECT
  rb.id AS bill_id,
  rb.total AS bill_total,
  COALESCE(SUM(bp.amount), 0) AS payments_sum,
  COUNT(bp.id) AS payment_count,
  rb.total - COALESCE(SUM(bp.amount), 0) AS difference
FROM restaurant_bills rb
LEFT JOIN bill_payments bp ON bp.restaurant_bill_id = rb.id
WHERE rb.id = '3357df1c-6578-4a63-af53-86984e09954f'
GROUP BY rb.id, rb.total;


-- =================================================================================
-- CROSS-TENANT SANITY CHECK
-- =================================================================================
-- All 3 bills should be within the same tenant (the test tenant "UPDATED TENANT NAME TEST").
-- If they span multiple tenants, that itself is a finding worth investigating.

SELECT
  rb.id AS bill_id,
  rb.tenant_id,
  t.name AS tenant_name
FROM restaurant_bills rb
LEFT JOIN tenants t ON t.id = rb.tenant_id
WHERE rb.id IN (
  'f5064d88-e607-43df-91b2-d1038e959166',
  'df4ce6c2-0ba5-4c3d-b41a-090fe4ea6a41',
  '3357df1c-6578-4a63-af53-86984e09954f'
);


-- =================================================================================
-- NOTES FOR INTERPRETATION
-- =================================================================================
-- 1. Currency on the test tenant is set to KRW (Korean Won) — this is intentional
--    test data. The W100.07 / W100.10 amounts are KRW, which has 0 decimal places
--    natively but the system appears to be storing 2 decimal places anyway.
--    That is itself a finding (cf. FINDINGS.md F-125 — JPY 0-decimal config gap)
--    but not what this recon is investigating.
-- 2. If query 2d shows "OVERPAID — F-284 confirmed", do NOT attempt to fix the
--    record manually. Document the finding, file a follow-up to clean up via
--    void/refund flow. Direct UPDATE on bill_payments is forbidden by audit rules.
-- 3. If schema column names differ from what's assumed, the query will fail with
--    "column does not exist" — note the actual column name and fix in the SQL
--    file before re-running. Do NOT proceed with partial results.
