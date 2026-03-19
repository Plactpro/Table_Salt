import { pool } from "./db";

export async function runAdminMigrations(): Promise<void> {
  try {
    await pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'`);
  } catch (_) {
    // Enum value may already exist — safe to ignore
  }

  await pool.query(
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()`
  );

  await pool.query(`
    INSERT INTO tenants (name, slug, plan, active)
    SELECT 'Table Salt Platform', 'platform', 'enterprise', true
    WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'platform')
  `);
}
