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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      maintenance_mode BOOLEAN NOT NULL DEFAULT false,
      registration_open BOOLEAN NOT NULL DEFAULT true,
      platform_name TEXT NOT NULL DEFAULT 'Table Salt Platform',
      max_tenants_per_plan JSONB NOT NULL DEFAULT '{"basic":10,"standard":50,"premium":200,"enterprise":1000}'::jsonb,
      alert_email_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    INSERT INTO platform_settings (id)
    VALUES ('singleton')
    ON CONFLICT (id) DO NOTHING
  `);

  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone TEXT`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cuisine_style TEXT`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS country TEXT`);

  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trialing'`);
  await pool.query(`
    UPDATE tenants
    SET subscription_status = 'active'
    WHERE trial_ends_at IS NULL
      AND subscription_status = 'trialing'
  `);

  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_session_id TEXT`);

  try {
    await pool.query(`ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pending_payment'`);
  } catch (_) {
    // Enum value may already exist
  }
}
