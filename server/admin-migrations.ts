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

  // Task #51: Recipe–Inventory traceability columns on stock_movements
  await pool.query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS order_id TEXT`);
  await pool.query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS menu_item_id TEXT`);
  await pool.query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS recipe_id TEXT`);

  // Task #51: Procurement cost-tracking columns on inventory_items
  await pool.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS purchase_unit TEXT`);
  await pool.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS purchase_unit_conversion NUMERIC(10,4)`);
  await pool.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS average_cost NUMERIC(10,4)`);

  // T001: KDS chef accountability & shift columns on stock_movements
  await pool.query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS chef_id VARCHAR`);
  await pool.query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS chef_name TEXT`);
  await pool.query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS station TEXT`);
  await pool.query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS shift_id VARCHAR`);
  await pool.query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS order_number TEXT`);
  await pool.query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS stock_before NUMERIC(10,4)`);

  // Task #58: stock_after for post-deduction balance in stock_movements
  await pool.query(`ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS stock_after NUMERIC(10,4)`);

  // T001: menu_item_stations junction table (station assignment per menu item)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu_item_stations (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR NOT NULL,
      menu_item_id VARCHAR NOT NULL,
      station TEXT NOT NULL
    )
  `);

  // T001: kot_events table (KOT audit log per station per order item)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kot_events (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR NOT NULL,
      order_id VARCHAR NOT NULL,
      menu_item_id VARCHAR,
      station TEXT,
      chef_id VARCHAR,
      chef_name TEXT,
      shift_id VARCHAR,
      event_type TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // T001: shifts table (Morning/Evening/Night with start/end times)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shifts (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR NOT NULL,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Task #57: wall_screen_token for KDS public wall screen
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wall_screen_token TEXT`);

  // T001/T005: module_config for tenant feature toggles
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS module_config JSONB DEFAULT '{}'`);
}
