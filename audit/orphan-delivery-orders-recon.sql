-- audit/orphan-delivery-orders-recon.sql
-- Read-only recon: orphan delivery orders (orders with delivery-shaped
-- order_type but no delivery_orders companion row).
--
-- HOW TO RUN:
--   Open in TablePlus connected to production. Execute as a single
--   transaction. Output appears in TablePlus result panes.
--
-- This script:
--   - sets the session to read-only (SET default_transaction_read_only = on)
--   - wraps everything in BEGIN ... ROLLBACK so even an accidental
--     write inside would not commit
--   - returns redacted PII only (LEFT(...) prefixes + length + presence
--     flags); no full names or full phones
--   - is idempotent and side-effect-free

SET default_transaction_read_only = on;
BEGIN;

-- Q1: Total orphan count
SELECT 'Q1: orphan_count' AS query_label, COUNT(*) AS orphan_count
FROM orders o
WHERE o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')
  AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.order_id = o.id);

-- Q2: Tenant + order_type breakdown
SELECT 'Q2: tenant_breakdown' AS query_label,
       o.tenant_id, o.order_type, COUNT(*) AS orphan_count
FROM orders o
WHERE o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')
  AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.order_id = o.id)
GROUP BY o.tenant_id, o.order_type
ORDER BY o.tenant_id, o.order_type;

-- Q3: Redacted detail view of every orphan (PII-safe)
SELECT 'Q3: orphan_detail_redacted' AS query_label,
       o.id, o.tenant_id, o.order_type, o.status, o.created_at, o.total, o.channel,
       LEFT(o.customer_name, 3)  AS name_prefix,
       LENGTH(o.customer_name)   AS name_len,
       LEFT(o.customer_phone, 4) AS phone_prefix,
       LENGTH(o.customer_phone)  AS phone_len,
       CASE WHEN o.customer_name  IS NULL OR o.customer_name  = '' THEN 'empty' ELSE 'present' END AS name_state,
       CASE WHEN o.customer_phone IS NULL OR o.customer_phone = '' THEN 'empty' ELSE 'present' END AS phone_state
FROM orders o
WHERE o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')
  AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.order_id = o.id)
ORDER BY o.created_at DESC;

-- Q4: Date range and tenant/day spread
SELECT 'Q4: spread' AS query_label,
       MIN(o.created_at)              AS oldest,
       MAX(o.created_at)              AS newest,
       COUNT(DISTINCT o.tenant_id)    AS unique_tenants,
       COUNT(DISTINCT DATE(o.created_at)) AS unique_days
FROM orders o
WHERE o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')
  AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.order_id = o.id);

-- Q5: Tenant lookup for each tenant_id appearing in the orphan set
SELECT 'Q5: tenants' AS query_label,
       t.id, t.name, t.currency, t.country
FROM tenants t
WHERE t.id IN (
  SELECT DISTINCT o.tenant_id
  FROM orders o
  WHERE o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')
    AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.order_id = o.id)
)
ORDER BY t.id;

-- Q6: Downstream-presence sanity (bills, items)
SELECT 'Q6: downstream_presence' AS query_label,
       o.id,
       EXISTS(SELECT 1 FROM bills       b  WHERE b.order_id  = o.id) AS has_bill,
       EXISTS(SELECT 1 FROM order_items oi WHERE oi.order_id = o.id) AS has_items,
       (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
FROM orders o
WHERE o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')
  AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.order_id = o.id)
ORDER BY o.created_at DESC;

ROLLBACK;
