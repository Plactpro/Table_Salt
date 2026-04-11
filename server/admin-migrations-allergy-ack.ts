/**
 * ALL-02: Allergy Acknowledgment Persistence
 * Adds allergy_acknowledged_at + allergy_acknowledged_by columns to
 * order_item_modifications so chef acknowledgments survive page refreshes.
 *
 * Called from runAdminMigrations() in admin-migrations.ts.
 * Idempotent — safe to run on every server start.
 */
import { pool } from "./db";

export async function runAllergyAckMigration(): Promise<void> {
  // ALL-02: persist allergy acknowledgment timestamp + actor
  await pool.query(`
    ALTER TABLE order_item_modifications
      ADD COLUMN IF NOT EXISTS allergy_acknowledged_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS allergy_acknowledged_by VARCHAR(36)
  `);

  // Index for fast lookup of unacknowledged allergy items
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_oim_allergy_unacked
    ON order_item_modifications (has_allergy, allergy_acknowledged_at)
    WHERE has_allergy = true AND allergy_acknowledged_at IS NULL
  `);
}
