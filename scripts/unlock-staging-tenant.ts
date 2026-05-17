import { pool } from "../server/db";

async function main() {
  await pool.query(
    "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz"
  );
  const r = await pool.query(
    `UPDATE tenants
       SET subscription_expires_at = '2099-12-31',
           subscription_status = 'active',
           plan = 'premium',
           trial_ends_at = '2099-12-31'
     WHERE slug = 'staging-test'
     RETURNING slug, plan, subscription_status, subscription_expires_at, trial_ends_at`
  );
  console.log("ROWS UPDATED:", r.rowCount);
  console.log(r.rows[0]);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
