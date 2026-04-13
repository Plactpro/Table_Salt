import { Pool } from "pg";

export async function checkAndUpgradeLoyaltyTier(
  pool: Pool, tenantId: string, customerId: number
): Promise<{ upgraded: boolean; newTier?: string }> {
  try {
    const cfg = await pool.query(
      "SELECT * FROM loyalty_tier_config WHERE tenant_id = $1 AND is_active = true ORDER BY min_spend DESC",
      [tenantId]
    );
    if (cfg.rows.length === 0) return { upgraded: false };

    const c = await pool.query(
      `SELECT c.id, c.loyalty_tier, COALESCE(SUM(o.total), 0)::int as total_spend, COUNT(o.id)::int as total_visits
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id::text AND o.tenant_id = c.tenant_id
       WHERE c.id = $1 AND c.tenant_id = $2 GROUP BY c.id`,
      [customerId, tenantId]
    );
    if (c.rows.length === 0) return { upgraded: false };

    const cust = c.rows[0];
    let newTier = "bronze";
    for (const tier of cfg.rows) {
      if (cust.total_spend >= tier.min_spend && cust.total_visits >= (tier.min_visits || 0)) {
        newTier = tier.tier_name; break;
      }
    }

    if (newTier !== cust.loyalty_tier) {
      await pool.query("UPDATE customers SET loyalty_tier = $1 WHERE id = $2 AND tenant_id = $3", [newTier, cust.id, tenantId]);
      await pool.query(
        `INSERT INTO loyalty_tier_log (tenant_id, customer_id, previous_tier, new_tier, reason, total_spend, total_visits)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, cust.id, cust.loyalty_tier || "bronze", newTier, "Auto-upgrade", cust.total_spend, cust.total_visits]
      );
      return { upgraded: true, newTier };
    }
    return { upgraded: false };
  } catch (err) {
    console.error('Loyalty tier check failed:', err);
    return { upgraded: false };
  }
}
