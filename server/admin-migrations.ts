import { pool } from "./db";
import { hashPassword } from "./auth";
import { runAllergyAckMigration } from "./admin-migrations-allergy-ack";

export async function runAdminMigrations(): Promise<void> {
  try {
    await pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'`);
  } catch (_) {
    // Enum value may already exist — safe to ignore
  }

  try {
    await pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'cleaning_staff'`);
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

  // Task #60: Restaurant billing tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bills (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR NOT NULL,
      outlet_id VARCHAR,
      bill_number TEXT NOT NULL,
      order_id VARCHAR NOT NULL,
      table_id VARCHAR,
      customer_id VARCHAR,
      waiter_id VARCHAR,
      waiter_name TEXT,
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount_reason TEXT,
      service_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
      tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      tax_breakdown JSONB,
      tips NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      pos_session_id VARCHAR,
      void_reason TEXT,
      voided_at TIMESTAMPTZ,
      voided_by VARCHAR,
      paid_at TIMESTAMPTZ,
      covers INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bill_payments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR NOT NULL,
      bill_id VARCHAR NOT NULL,
      payment_method TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      reference_no TEXT,
      is_refund BOOLEAN NOT NULL DEFAULT false,
      refund_reason TEXT,
      collected_by VARCHAR,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pos_sessions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR NOT NULL,
      outlet_id VARCHAR,
      waiter_id VARCHAR NOT NULL,
      waiter_name TEXT,
      shift_name TEXT,
      opening_float NUMERIC(12,2) NOT NULL DEFAULT 0,
      closing_cash_count NUMERIC(12,2),
      status TEXT NOT NULL DEFAULT 'open',
      total_orders INTEGER NOT NULL DEFAULT 0,
      total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
      revenue_by_method JSONB,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      closed_at TIMESTAMPTZ,
      closed_by VARCHAR,
      notes TEXT
    )
  `);

  // Unique constraint to prevent duplicate bill numbers per tenant (concurrent creation safety)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS bills_tenant_bill_number_uidx
    ON bills (tenant_id, bill_number)
  `);

  // Task #64: GST-Compliant Invoicing
  // Tenant GST fields (INR-only)
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS gstin TEXT`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5,2)`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5,2)`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_prefix TEXT DEFAULT 'INV'`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_counter INTEGER DEFAULT 0`);

  // Menu item HSN/SAC code
  await pool.query(`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS hsn_code TEXT`);

  // Customer GSTIN + visit tracking + birthday/anniversary
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS gstin TEXT`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday TEXT`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS anniversary TEXT`);

  // Bill GST columns
  await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS invoice_number TEXT`);
  await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS customer_gstin TEXT`);
  await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(10,2)`);
  await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(10,2)`);

  // Unique index: one invoice_number per tenant (partial — only non-null invoice numbers)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_tenant_invoice_number_unique
    ON bills (tenant_id, invoice_number)
    WHERE invoice_number IS NOT NULL
  `);

  // Razorpay fields — tenants
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS razorpay_enabled BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS razorpay_key_id TEXT`);

  // Razorpay order/payment link stored on bill
  await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT`);

  // Razorpay payment ID stored on bill_payments for reconciliation
  await pool.query(`ALTER TABLE bill_payments ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT`);

  // Task #105: Razorpay refund ID stored on refund bill_payments for reconciliation
  await pool.query(`ALTER TABLE bill_payments ADD COLUMN IF NOT EXISTS razorpay_refund_id TEXT`);

  // Per-tenant Razorpay key secret (stored encrypted-at-rest by DB; only accessible server-side)
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS razorpay_key_secret TEXT`);

  // Task #66: Delivery Order Queue — estimated ready time + rejection reason on orders
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);

  // Task #68: KOT & Bill Printing Infrastructure
  // printerUrl on kitchen_stations for per-station thermal printer config
  await pool.query(`ALTER TABLE kitchen_stations ADD COLUMN IF NOT EXISTS printer_url TEXT`);

  // print_job_type enum
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE print_job_type AS ENUM ('kot', 'bill', 'receipt');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  // print_job_status enum
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE print_job_status AS ENUM ('queued', 'printed', 'failed');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  // print_jobs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS print_jobs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      type print_job_type NOT NULL,
      reference_id VARCHAR(36) NOT NULL,
      station TEXT,
      status print_job_status NOT NULL DEFAULT 'queued',
      payload JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_print_jobs_tenant_status ON print_jobs (tenant_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_print_jobs_tenant_created ON print_jobs (tenant_id, created_at)`);

  // Task #69: Payment Gateway Super Admin Toggle
  // Add gateway selection + credential fields to platform_settings
  await pool.query(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS active_payment_gateway TEXT NOT NULL DEFAULT 'stripe'`);
  await pool.query(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS stripe_key_id TEXT`);
  await pool.query(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS stripe_key_secret TEXT`);
  await pool.query(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS razorpay_key_id TEXT`);
  await pool.query(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS razorpay_key_secret TEXT`);

  // Task #73: Table QR Token table (dedicated QR tokens for customer request system)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS table_qr_tokens (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      outlet_id VARCHAR(36) REFERENCES outlets(id),
      table_id VARCHAR(36) NOT NULL REFERENCES tables(id),
      token TEXT NOT NULL UNIQUE,
      active BOOLEAN NOT NULL DEFAULT true,
      label TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deactivated_at TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_table_qr_tokens_tenant ON table_qr_tokens (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_table_qr_tokens_table ON table_qr_tokens (table_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_table_qr_tokens_token ON table_qr_tokens (token)`);

  // Task #73: Table Requests table (customer service requests via QR code)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS table_requests (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      outlet_id VARCHAR(36) REFERENCES outlets(id),
      table_id VARCHAR(36) NOT NULL REFERENCES tables(id),
      qr_token_id VARCHAR(36) REFERENCES table_qr_tokens(id),
      request_type TEXT NOT NULL DEFAULT 'call_server',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      guest_note TEXT,
      assigned_to VARCHAR(36) REFERENCES users(id),
      assigned_to_name TEXT,
      staff_note TEXT,
      escalated_at TIMESTAMPTZ,
      acknowledged_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      feedback_rating INTEGER,
      feedback_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_table_requests_tenant ON table_requests (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_table_requests_table ON table_requests (table_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_table_requests_status ON table_requests (status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_table_requests_tenant_status ON table_requests (tenant_id, status)`);

  // Task #74: Add structured details column to table_requests
  await pool.query(`ALTER TABLE table_requests ADD COLUMN IF NOT EXISTS details JSONB`);

  // Task #75: QR Request Settings per outlet
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS qr_request_settings JSONB`);

  // Task #76: Smart Chef Assignment & Counter Management
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kitchen_counters (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      outlet_id VARCHAR(36) REFERENCES outlets(id),
      name TEXT NOT NULL,
      counter_code VARCHAR(20),
      handles_categories JSONB DEFAULT '[]'::jsonb,
      max_capacity INT DEFAULT 5,
      display_color VARCHAR(20) DEFAULT '#3B82F6',
      is_active BOOLEAN DEFAULT true,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_kitchen_counters_tenant ON kitchen_counters (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_kitchen_counters_outlet ON kitchen_counters (outlet_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chef_roster (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      outlet_id VARCHAR(36) REFERENCES outlets(id),
      chef_id VARCHAR(36) REFERENCES users(id),
      chef_name TEXT,
      counter_id VARCHAR(36) REFERENCES kitchen_counters(id),
      counter_name TEXT,
      shift_date TEXT NOT NULL,
      shift_start TEXT NOT NULL,
      shift_end TEXT NOT NULL,
      shift_type VARCHAR(20) DEFAULT 'morning',
      status VARCHAR(20) DEFAULT 'scheduled',
      checked_in_at TIMESTAMPTZ,
      checked_out_at TIMESTAMPTZ,
      created_by VARCHAR(36) REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chef_roster_tenant ON chef_roster (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chef_roster_date ON chef_roster (shift_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chef_roster_counter ON chef_roster (counter_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chef_availability (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      outlet_id VARCHAR(36) REFERENCES outlets(id),
      chef_id VARCHAR(36) NOT NULL REFERENCES users(id),
      counter_id VARCHAR(36) REFERENCES kitchen_counters(id),
      shift_date TEXT,
      status VARCHAR(20) DEFAULT 'available',
      active_tickets INT DEFAULT 0,
      last_updated TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chef_availability_tenant ON chef_availability (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chef_availability_chef ON chef_availability (chef_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chef_availability_unique ON chef_availability (tenant_id, chef_id, shift_date)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_assignments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      outlet_id VARCHAR(36) REFERENCES outlets(id),
      order_item_id VARCHAR(36),
      order_id VARCHAR(36),
      menu_item_id VARCHAR(36),
      menu_item_name TEXT,
      table_number INT,
      counter_id VARCHAR(36) REFERENCES kitchen_counters(id),
      counter_name TEXT,
      chef_id VARCHAR(36) REFERENCES users(id),
      chef_name TEXT,
      assignment_type VARCHAR(30) DEFAULT 'UNASSIGNED',
      assignment_score INT,
      assigned_at TIMESTAMPTZ,
      accepted_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      status VARCHAR(20) DEFAULT 'unassigned',
      reassign_reason TEXT,
      estimated_time_min INT,
      actual_time_min INT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_assignments_tenant ON ticket_assignments (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_assignments_counter ON ticket_assignments (counter_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_assignments_chef ON ticket_assignments (chef_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_assignments_status ON ticket_assignments (status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_assignments_assigned_at ON ticket_assignments (assigned_at)`);

  // Assignment settings stored in outlets table
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS assignment_settings JSONB`);

  // Seed default kitchen counters for existing tenants that have none
  const tenantsWithoutCounters = await pool.query(`
    SELECT DISTINCT t.id AS tenant_id, o.id AS outlet_id
    FROM tenants t
    JOIN outlets o ON o.tenant_id = t.id
    WHERE NOT EXISTS (
      SELECT 1 FROM kitchen_counters kc WHERE kc.tenant_id = t.id
    )
    LIMIT 50
  `);
  for (const row of tenantsWithoutCounters.rows) {
    const defaults = [
      { name: "Hot Counter", counterCode: "hot", displayColor: "#ef4444", sortOrder: 0 },
      { name: "Cold Counter", counterCode: "cold", displayColor: "#3b82f6", sortOrder: 1 },
      { name: "Grill Station", counterCode: "grill", displayColor: "#f97316", sortOrder: 2 },
      { name: "Dessert Bar", counterCode: "dessert", displayColor: "#a855f7", sortOrder: 3 },
    ];
    for (const d of defaults) {
      await pool.query(
        `INSERT INTO kitchen_counters (id, tenant_id, outlet_id, name, counter_code, display_color, max_capacity, is_active, sort_order)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 4, true, $6)
         ON CONFLICT DO NOTHING`,
        [row.tenant_id, row.outlet_id, d.name, d.counterCode, d.displayColor, d.sortOrder]
      );
    }
  }

  // ─── Stock Capacity Report tables ─────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_check_reports (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      outlet_id VARCHAR(36) REFERENCES outlets(id),
      report_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
      target_date TEXT NOT NULL,
      shift_type VARCHAR(20),
      generated_at TIMESTAMPTZ DEFAULT now(),
      generated_by VARCHAR(50) DEFAULT 'SYSTEM',
      total_items_checked INT DEFAULT 0,
      items_sufficient INT DEFAULT 0,
      items_limited INT DEFAULT 0,
      items_critical INT DEFAULT 0,
      items_unavailable INT DEFAULT 0,
      overall_status VARCHAR(20) DEFAULT 'GREEN',
      total_shortfall_value DECIMAL(10,2) DEFAULT 0,
      acknowledged_by VARCHAR(36),
      acknowledged_at TIMESTAMPTZ,
      actions_taken JSONB
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_check_reports_tenant ON stock_check_reports (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_check_reports_date ON stock_check_reports (tenant_id, target_date)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_check_report_items (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id VARCHAR(36) NOT NULL REFERENCES stock_check_reports(id) ON DELETE CASCADE,
      tenant_id VARCHAR(36) NOT NULL,
      menu_item_id VARCHAR(36) NOT NULL,
      menu_item_name TEXT,
      category TEXT,
      recipe_id VARCHAR(36),
      planned_quantity INT DEFAULT 20,
      max_possible_portions INT NOT NULL DEFAULT 0,
      bottleneck_ingredient TEXT,
      bottleneck_stock DECIMAL(10,3),
      bottleneck_required DECIMAL(10,3),
      status VARCHAR(20) DEFAULT 'SUFFICIENT',
      ingredient_breakdown JSONB NOT NULL DEFAULT '[]',
      recommended_action VARCHAR(50) DEFAULT 'OK',
      shortfall_cost DECIMAL(10,2) DEFAULT 0,
      is_disabled BOOLEAN DEFAULT false,
      max_limit INT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_report_items_report ON stock_check_report_items (report_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_report_items_tenant ON stock_check_report_items (tenant_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_planned_quantities (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36),
      menu_item_id VARCHAR(36) NOT NULL,
      planned_date TEXT NOT NULL,
      planned_qty INT NOT NULL DEFAULT 20,
      actual_qty_sold INT DEFAULT 0,
      max_limit INT,
      is_disabled BOOLEAN DEFAULT false,
      disabled_reason TEXT,
      created_by VARCHAR(36),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_planned_qty_tenant_date ON daily_planned_quantities (tenant_id, planned_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_planned_qty_menu_item ON daily_planned_quantities (menu_item_id)`);
  try {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_planned_qty_unique ON daily_planned_quantities (tenant_id, menu_item_id, planned_date)`);
  } catch (_) {
    // May fail if duplicate rows exist; will be dropped below anyway
  }

  // Task #79: Migrate daily_planned_quantities unique index to include outlet_id for proper multi-outlet scoping.
  // Drop the old constraint (no outlet_id) and replace with outlet-aware partial indexes.
  await pool.query(`DROP INDEX IF EXISTS idx_daily_planned_qty_unique`);
  // Unique index when outlet_id IS NULL (single-outlet tenants)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_planned_qty_no_outlet_unique
    ON daily_planned_quantities (tenant_id, menu_item_id, planned_date)
    WHERE outlet_id IS NULL
  `);
  // Unique index when outlet_id IS NOT NULL (multi-outlet tenants)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_planned_qty_with_outlet_unique
    ON daily_planned_quantities (tenant_id, outlet_id, menu_item_id, planned_date)
    WHERE outlet_id IS NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS prep_notifications (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      chef_id VARCHAR(36),
      type VARCHAR(50) NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      priority VARCHAR(10) NOT NULL DEFAULT 'LOW',
      related_task_id VARCHAR(36),
      related_order_id VARCHAR(36),
      related_menu_item VARCHAR(255),
      action_url TEXT,
      action_label TEXT,
      action2_url TEXT,
      action2_label TEXT,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prep_notifications_chef ON prep_notifications (tenant_id, chef_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prep_notifications_unread ON prep_notifications (tenant_id, chef_id, read_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prep_notifications_created ON prep_notifications (tenant_id, created_at DESC)`);

  await pool.query(`ALTER TABLE ticket_assignments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE ticket_assignments ADD COLUMN IF NOT EXISTS verified_by VARCHAR(36)`);
  await pool.query(`ALTER TABLE ticket_assignments ADD COLUMN IF NOT EXISTS quality_score INT`);
  await pool.query(`ALTER TABLE ticket_assignments ADD COLUMN IF NOT EXISTS verification_feedback TEXT`);
  await pool.query(`ALTER TABLE ticket_assignments ADD COLUMN IF NOT EXISTS issue_note TEXT`);
  await pool.query(`ALTER TABLE ticket_assignments ADD COLUMN IF NOT EXISTS help_requested BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE ticket_assignments ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE ticket_assignments ADD COLUMN IF NOT EXISTS overdue_alerted BOOLEAN DEFAULT false`);

  // ─── Task #79: Stock Capacity Seed Data ──────────────────────────────────
  // Seed demo reports for the first active tenant (fully idempotent)
  try {
    const { rows: seedTenants } = await pool.query(
      `SELECT t.id AS tenant_id, o.id AS outlet_id
       FROM tenants t
       LEFT JOIN outlets o ON o.tenant_id = t.id
       WHERE t.active = true AND t.slug != 'platform'
       ORDER BY t.created_at
       LIMIT 1`
    );

    if (seedTenants.length > 0) {
      const { tenant_id: tenantId, outlet_id: outletId } = seedTenants[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      // Seed dishes: 18 SUFFICIENT, 7 LIMITED, 4 CRITICAL, 2 UNAVAILABLE
      // Each dish has a stable seed ID derived from tenant+name for idempotency
      const seedDishes = [
        // SUFFICIENT dishes (18)
        { key: "ctm", name: "Chicken Tikka Masala", category: "Mains", status: "SUFFICIENT", maxPortions: 45, planned: 30, bottleneck: "Chicken Breast", bottleneckStock: 13.5, bottleneckRequired: 0.3, shortfall: 0 },
        { key: "pbm", name: "Paneer Butter Masala", category: "Mains", status: "SUFFICIENT", maxPortions: 60, planned: 40, bottleneck: "Paneer", bottleneckStock: 12, bottleneckRequired: 0.2, shortfall: 0 },
        { key: "dmk", name: "Dal Makhani", category: "Mains", status: "SUFFICIENT", maxPortions: 80, planned: 50, bottleneck: "Black Lentils", bottleneckStock: 8, bottleneckRequired: 0.1, shortfall: 0 },
        { key: "ppn", name: "Palak Paneer", category: "Mains", status: "SUFFICIENT", maxPortions: 55, planned: 35, bottleneck: "Spinach", bottleneckStock: 11, bottleneckRequired: 0.2, shortfall: 0 },
        { key: "gnaan", name: "Garlic Naan", category: "Bread", status: "SUFFICIENT", maxPortions: 200, planned: 100, bottleneck: "All-Purpose Flour", bottleneckStock: 20, bottleneckRequired: 0.1, shortfall: 0 },
        { key: "bnaan", name: "Butter Naan", category: "Bread", status: "SUFFICIENT", maxPortions: 200, planned: 100, bottleneck: "All-Purpose Flour", bottleneckStock: 20, bottleneckRequired: 0.1, shortfall: 0 },
        { key: "brice", name: "Biryani Rice", category: "Rice", status: "SUFFICIENT", maxPortions: 70, planned: 50, bottleneck: "Basmati Rice", bottleneckStock: 10.5, bottleneckRequired: 0.15, shortfall: 0 },
        { key: "raita", name: "Raita", category: "Sides", status: "SUFFICIENT", maxPortions: 120, planned: 60, bottleneck: "Yogurt", bottleneckStock: 12, bottleneckRequired: 0.1, shortfall: 0 },
        { key: "mlassi", name: "Mango Lassi", category: "Beverages", status: "SUFFICIENT", maxPortions: 90, planned: 50, bottleneck: "Mango Pulp", bottleneckStock: 9, bottleneckRequired: 0.1, shortfall: 0 },
        { key: "mchai", name: "Masala Chai", category: "Beverages", status: "SUFFICIENT", maxPortions: 150, planned: 80, bottleneck: "Tea Leaves", bottleneckStock: 3, bottleneckRequired: 0.02, shortfall: 0 },
        { key: "samosa", name: "Samosa (2 pcs)", category: "Starters", status: "SUFFICIENT", maxPortions: 100, planned: 60, bottleneck: "Potato", bottleneckStock: 15, bottleneckRequired: 0.15, shortfall: 0 },
        { key: "csoup", name: "Chicken Soup", category: "Starters", status: "SUFFICIENT", maxPortions: 65, planned: 40, bottleneck: "Chicken Stock", bottleneckStock: 13, bottleneckRequired: 0.2, shortfall: 0 },
        { key: "troti", name: "Tandoori Roti", category: "Bread", status: "SUFFICIENT", maxPortions: 180, planned: 100, bottleneck: "Whole Wheat Flour", bottleneckStock: 18, bottleneckRequired: 0.1, shortfall: 0 },
        { key: "gjamun", name: "Gulab Jamun", category: "Desserts", status: "SUFFICIENT", maxPortions: 80, planned: 50, bottleneck: "Milk Powder", bottleneckStock: 8, bottleneckRequired: 0.1, shortfall: 0 },
        { key: "kheer", name: "Kheer", category: "Desserts", status: "SUFFICIENT", maxPortions: 70, planned: 40, bottleneck: "Milk", bottleneckStock: 21, bottleneckRequired: 0.3, shortfall: 0 },
        { key: "agobi", name: "Aloo Gobi", category: "Mains", status: "SUFFICIENT", maxPortions: 50, planned: 30, bottleneck: "Cauliflower", bottleneckStock: 10, bottleneckRequired: 0.2, shortfall: 0 },
        { key: "cmasala", name: "Chana Masala", category: "Mains", status: "SUFFICIENT", maxPortions: 75, planned: 45, bottleneck: "Chickpeas", bottleneckStock: 7.5, bottleneckRequired: 0.1, shortfall: 0 },
        { key: "mrjosh", name: "Mutton Rogan Josh", category: "Mains", status: "SUFFICIENT", maxPortions: 40, planned: 25, bottleneck: "Mutton", bottleneckStock: 10, bottleneckRequired: 0.25, shortfall: 0 },
        // LIMITED dishes (7)
        { key: "prawns", name: "Prawn Masala", category: "Mains", status: "LIMITED", maxPortions: 18, planned: 30, bottleneck: "Prawns", bottleneckStock: 1.8, bottleneckRequired: 0.1, shortfall: 120 },
        { key: "fcurry", name: "Fish Curry", category: "Mains", status: "LIMITED", maxPortions: 20, planned: 35, bottleneck: "Fish Fillet", bottleneckStock: 4, bottleneckRequired: 0.2, shortfall: 300 },
        { key: "lkebab", name: "Lamb Seekh Kebab", category: "Starters", status: "LIMITED", maxPortions: 25, planned: 40, bottleneck: "Minced Lamb", bottleneckStock: 5, bottleneckRequired: 0.2, shortfall: 375 },
        { key: "mtikka", name: "Mushroom Tikka", category: "Starters", status: "LIMITED", maxPortions: 22, planned: 35, bottleneck: "Button Mushrooms", bottleneckStock: 2.2, bottleneckRequired: 0.1, shortfall: 195 },
        { key: "ppasta", name: "Pesto Pasta", category: "Fusion", status: "LIMITED", maxPortions: 28, planned: 45, bottleneck: "Basil Pesto", bottleneckStock: 2.8, bottleneckRequired: 0.1, shortfall: 255 },
        { key: "csalad", name: "Caesar Salad", category: "Salads", status: "LIMITED", maxPortions: 30, planned: 45, bottleneck: "Romaine Lettuce", bottleneckStock: 4.5, bottleneckRequired: 0.15, shortfall: 225 },
        { key: "avotoast", name: "Avocado Toast", category: "Breakfast", status: "LIMITED", maxPortions: 20, planned: 30, bottleneck: "Avocado", bottleneckStock: 10, bottleneckRequired: 0.5, shortfall: 250 },
        // CRITICAL dishes (4)
        { key: "lbisque", name: "Lobster Bisque", category: "Starters", status: "CRITICAL", maxPortions: 8, planned: 25, bottleneck: "Lobster", bottleneckStock: 0.8, bottleneckRequired: 0.1, shortfall: 1700 },
        { key: "wagyu", name: "Wagyu Beef Steak", category: "Premium", status: "CRITICAL", maxPortions: 5, planned: 20, bottleneck: "Wagyu Beef", bottleneckStock: 1.5, bottleneckRequired: 0.3, shortfall: 4500 },
        { key: "trisotto", name: "Truffle Risotto", category: "Premium", status: "CRITICAL", maxPortions: 7, planned: 25, bottleneck: "Truffle Oil", bottleneckStock: 0.35, bottleneckRequired: 0.05, shortfall: 900 },
        { key: "bsalad", name: "Burrata Salad", category: "Salads", status: "CRITICAL", maxPortions: 10, planned: 30, bottleneck: "Burrata Cheese", bottleneckStock: 1, bottleneckRequired: 0.1, shortfall: 800 },
        // UNAVAILABLE dishes (2)
        { key: "fgpate", name: "Foie Gras Pate", category: "Premium", status: "UNAVAILABLE", maxPortions: 0, planned: 15, bottleneck: "Foie Gras", bottleneckStock: 0, bottleneckRequired: 0.1, shortfall: 2250 },
        { key: "oysters", name: "Oysters Rockefeller", category: "Seafood", status: "UNAVAILABLE", maxPortions: 0, planned: 20, bottleneck: "Fresh Oysters", bottleneckStock: 0, bottleneckRequired: 0.3, shortfall: 2400 },
      ];

      // Determine overall status
      const overallStatus = "RED"; // 4 CRITICAL items → RED

      // Insert tomorrow's report with a deterministic seed ID for idempotency
      const seedReportId = `seed-scr-${tenantId.slice(0, 8)}-tomorrow`;
      await pool.query(
        `INSERT INTO stock_check_reports
         (id, tenant_id, outlet_id, report_type, target_date, generated_by,
          total_items_checked, items_sufficient, items_limited, items_critical,
          items_unavailable, overall_status, total_shortfall_value)
         VALUES ($1, $2, $3, 'SCHEDULED', $4, 'SYSTEM', $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [seedReportId, tenantId, outletId, tomorrowStr, seedDishes.length,
         seedDishes.filter(d => d.status === "SUFFICIENT").length,
         seedDishes.filter(d => d.status === "LIMITED").length,
         seedDishes.filter(d => d.status === "CRITICAL").length,
         seedDishes.filter(d => d.status === "UNAVAILABLE").length,
         overallStatus,
         seedDishes.reduce((s, d) => s + d.shortfall, 0)]
      );

      // Insert report items with deterministic IDs for full idempotency
      for (const dish of seedDishes) {
        const itemId = `seed-item-${dish.key}-${tenantId.slice(0, 8)}`;
        const menuItemId = `seed-mi-${dish.key}-${tenantId.slice(0, 8)}`;
        const breakdown = JSON.stringify([{
          inventoryItemId: `seed-inv-${dish.key}`,
          name: dish.bottleneck,
          unit: "kg",
          currentStock: dish.bottleneckStock,
          requiredPerPortion: dish.bottleneckRequired,
          maxPortions: dish.maxPortions,
          availabilityPct: Math.min(100, Math.round((dish.maxPortions / dish.planned) * 100)),
          costPrice: dish.shortfall > 0 ? Math.round((dish.shortfall / Math.max(1, (dish.planned - dish.maxPortions) * dish.bottleneckRequired)) * 100) / 100 : 50,
        }]);

        await pool.query(
          `INSERT INTO stock_check_report_items
           (id, report_id, tenant_id, menu_item_id, menu_item_name, category, recipe_id,
            planned_quantity, max_possible_portions, bottleneck_ingredient, bottleneck_stock,
            bottleneck_required, status, ingredient_breakdown, recommended_action, shortfall_cost)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (id) DO NOTHING`,
          [
            itemId, seedReportId, tenantId, menuItemId, dish.name, dish.category,
            dish.planned, dish.maxPortions, dish.bottleneck, dish.bottleneckStock,
            dish.bottleneckRequired * dish.planned,
            dish.status, breakdown,
            dish.status === "SUFFICIENT" ? "OK" : dish.status === "LIMITED" ? "MONITOR" : dish.status === "CRITICAL" ? "REORDER_URGENT" : "PULL_FROM_MENU",
            dish.shortfall
          ]
        );

      }

      // Seed daily_planned_quantities for actual menu items of this tenant
      const { rows: actualMenuItems } = await pool.query(
        `SELECT id FROM menu_items WHERE tenant_id = $1 AND available = true LIMIT 50`,
        [tenantId]
      );
      for (const mi of actualMenuItems) {
        // Use partial-index-aware conflict clause to avoid cross-outlet overwrites
        if (outletId) {
          await pool.query(
            `INSERT INTO daily_planned_quantities
             (tenant_id, outlet_id, menu_item_id, planned_date, planned_qty, is_disabled, created_by)
             VALUES ($1, $2, $3, $4, 20, false, 'SYSTEM')
             ON CONFLICT (tenant_id, outlet_id, menu_item_id, planned_date) WHERE outlet_id IS NOT NULL DO NOTHING`,
            [tenantId, outletId, mi.id, tomorrowStr]
          );
        } else {
          await pool.query(
            `INSERT INTO daily_planned_quantities
             (tenant_id, outlet_id, menu_item_id, planned_date, planned_qty, is_disabled, created_by)
             VALUES ($1, NULL, $2, $3, 20, false, 'SYSTEM')
             ON CONFLICT (tenant_id, menu_item_id, planned_date) WHERE outlet_id IS NULL DO NOTHING`,
            [tenantId, mi.id, tomorrowStr]
          );
        }
      }

      // Seed 7 days of historical reports (idempotent — deterministic IDs)
      for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
        const histDate = new Date();
        histDate.setDate(histDate.getDate() - dayOffset);
        const histDateStr = histDate.toISOString().slice(0, 10);
        const histReportId = `seed-scr-${tenantId.slice(0, 8)}-hist${dayOffset}`;

        const variation = dayOffset % 3;
        const histSufficient = 18 - variation;
        const histLimited = 7 + (variation > 1 ? 1 : 0);
        const histCritical = 4 - (variation === 2 ? 1 : 0);
        const histUnavailable = 2 + (variation === 1 ? 1 : 0);
        const histStatus = histCritical > 2 ? "RED" : histLimited > 5 ? "AMBER" : "GREEN";
        const histTotal = histSufficient + histLimited + histCritical + histUnavailable;

        await pool.query(
          `INSERT INTO stock_check_reports
           (id, tenant_id, outlet_id, report_type, target_date, generated_by,
            total_items_checked, items_sufficient, items_limited, items_critical,
            items_unavailable, overall_status, total_shortfall_value, generated_at)
           VALUES ($1, $2, $3, 'SCHEDULED', $4, 'SYSTEM', $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO NOTHING`,
          [histReportId, tenantId, outletId, histDateStr, histTotal,
           histSufficient, histLimited, histCritical, histUnavailable,
           histStatus, (histLimited * 250 + histCritical * 1500 + histUnavailable * 2000),
           histDate]
        );
      }
    }
  } catch (err) {
    console.error("[Admin migrations] Stock capacity seed error (non-fatal):", err);
  }

  await pool.query(`ALTER TABLE ticket_assignments ADD COLUMN IF NOT EXISTS completed_qty NUMERIC`);
  await pool.query(`ALTER TABLE ticket_assignments ADD COLUMN IF NOT EXISTS total_qty NUMERIC`);
  await pool.query(`ALTER TABLE ticket_assignments ADD COLUMN IF NOT EXISTS unit TEXT`);

  // Task #93: KV store for platform-level settings (VAPID keys, etc.)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_settings_kv (
      key text PRIMARY KEY,
      value text NOT NULL,
      created_at timestamptz DEFAULT now()
    )
  `);

  // Task #93: Browser Push Notifications — push_subscriptions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id serial PRIMARY KEY,
      user_id text NOT NULL,
      tenant_id text NOT NULL,
      endpoint text NOT NULL UNIQUE,
      p256dh text NOT NULL,
      auth text NOT NULL,
      created_at timestamptz DEFAULT now()
    )
  `);

  // Task #94: Service Coordination System — orders table additions
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority integer DEFAULT 2`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number varchar(50)`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at timestamptz`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source varchar(30) DEFAULT 'POS'`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS section varchar(50)`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS covers integer DEFAULT 1`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS special_instructions text`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS allergies text`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS vip_notes text`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS promised_time timestamptz`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_ready_time timestamptz`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS first_item_ready_at timestamptz`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fully_ready_at timestamptz`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS served_at timestamptz`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_split_bill boolean DEFAULT false`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status varchar(20) DEFAULT 'pending'`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS coordinator_id varchar(36)`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiter_name varchar(255)`);

  // Task #94: Service Coordination System — order_items table additions
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS chef_id varchar(36)`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS chef_name varchar(255)`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS counter_id varchar(36)`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS counter_name varchar(100)`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS preparation_started_at timestamptz`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS served_at timestamptz`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS prep_time_minutes integer`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS special_note text`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_addon boolean NOT NULL DEFAULT false`);

  // Task #94: Fix tenant_id type in coordination tables (if they were created with integer type)
  // This handles the case where tables were created with incorrect integer type for tenant_id
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'coordination_rules' AND column_name = 'tenant_id' AND data_type = 'integer'
      ) THEN
        ALTER TABLE coordination_rules ALTER COLUMN tenant_id TYPE varchar(36) USING tenant_id::varchar;
      END IF;
    END $$
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'service_messages' AND column_name = 'tenant_id' AND data_type = 'integer'
      ) THEN
        ALTER TABLE service_messages ALTER COLUMN tenant_id TYPE varchar(36) USING tenant_id::varchar;
        ALTER TABLE service_messages ALTER COLUMN from_staff_id TYPE varchar(36) USING from_staff_id::varchar;
        ALTER TABLE service_messages ALTER COLUMN to_staff_id TYPE varchar(36) USING to_staff_id::varchar;
      END IF;
    END $$
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'vip_order_flags' AND column_name = 'tenant_id' AND data_type = 'integer'
      ) THEN
        ALTER TABLE vip_order_flags ALTER COLUMN tenant_id TYPE varchar(36) USING tenant_id::varchar;
      END IF;
    END $$
  `);

  // Task #94: vip_order_flags table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vip_order_flags (
      id serial PRIMARY KEY,
      tenant_id varchar(36) NOT NULL,
      order_id varchar(36) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      vip_level varchar(20) DEFAULT 'VIP',
      special_notes text,
      special_setup text,
      manager_notified boolean DEFAULT false,
      flagged_by varchar(36),
      created_at timestamptz DEFAULT now()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vip_order_flags_order_unique ON vip_order_flags(order_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vip_order_flags_tenant ON vip_order_flags(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vip_order_flags_order ON vip_order_flags(order_id)`);

  // Task #94: service_messages table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_messages (
      id serial PRIMARY KEY,
      tenant_id varchar(36) NOT NULL,
      outlet_id varchar(36),
      order_id varchar(36) REFERENCES orders(id) ON DELETE SET NULL,
      from_staff_id varchar(36) NOT NULL,
      from_name varchar(255),
      from_role varchar(50),
      to_staff_id varchar(36),
      to_role varchar(50),
      message text NOT NULL,
      message_type varchar(30) DEFAULT 'GENERAL',
      priority varchar(10) DEFAULT 'normal',
      is_read boolean DEFAULT false,
      read_at timestamptz,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_service_messages_tenant ON service_messages(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_service_messages_to_staff ON service_messages(to_staff_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_service_messages_created ON service_messages(created_at DESC)`);

  // Task #94: coordination_rules table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coordination_rules (
      id serial PRIMARY KEY,
      tenant_id varchar(36) NOT NULL,
      rule_name varchar(255) NOT NULL,
      trigger_event varchar(50) NOT NULL,
      condition_json jsonb NOT NULL,
      action varchar(50) NOT NULL,
      message_template text NOT NULL,
      is_active boolean DEFAULT true,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_coordination_rules_tenant ON coordination_rules(tenant_id)`);

  // Task #94: Seed default coordination rules for existing tenants that have none
  const { rows: tenantsWithoutRules } = await pool.query(`
    SELECT t.id AS tenant_id
    FROM tenants t
    WHERE t.slug != 'platform'
      AND NOT EXISTS (
        SELECT 1 FROM coordination_rules cr WHERE cr.tenant_id = t.id
      )
    LIMIT 50
  `);

  const defaultRules = [
    { name: "Order Age Exceeds 20min in Preparation", event: "order_age_exceeds", cond: { threshold_minutes: 20, status: "in_progress" }, action: "notify_coordinator", template: "Order #{{orderNumber}} has been in preparation for {{minutes}} minutes. Please check status.", active: true },
    { name: "Item Ready Unserved for 5min", event: "item_ready_unserved", cond: { threshold_minutes: 5 }, action: "notify_waiter", template: "Order #{{orderNumber}} is ready and has not been served for {{minutes}} minutes.", active: true },
    { name: "VIP Order Delayed 5min", event: "vip_order_delayed", cond: { threshold_minutes: 5 }, action: "notify_manager_urgent", template: "URGENT: VIP Order #{{orderNumber}} has been waiting for {{minutes}} minutes.", active: true },
    { name: "Order Stuck in Served State 30min", event: "order_status_stuck", cond: { threshold_minutes: 30, status: "served" }, action: "prompt_coordinator", template: "Order #{{orderNumber}} has been in '{{status}}' state for {{minutes}} minutes. Please close the order.", active: true },
    { name: "Kitchen Overload — More than 15 Active Tickets", event: "active_kitchen_tickets_exceed", cond: { threshold: 15 }, action: "notify_manager_urgent", template: "Kitchen is overloaded with {{count}} active tickets (threshold: {{threshold}}). Immediate attention required.", active: true },
    { name: "Delivery Time at Risk — Less than 10min Remaining", event: "delivery_time_at_risk", cond: { threshold_minutes: 10 }, action: "notify_coordinator", template: "Delivery Order #{{orderNumber}} is at risk — only {{minutes}} minutes until promised time.", active: false },
    { name: "Order Age Exceeds 45min Any Status", event: "order_age_exceeds", cond: { threshold_minutes: 45, status: "any" }, action: "notify_manager_urgent", template: "Order #{{orderNumber}} is {{minutes}} minutes old. Please investigate.", active: false },
    { name: "Order Paid Status Confirmation", event: "order_status_stuck", cond: { threshold_minutes: 5, status: "paid" }, action: "notify_coordinator", template: "Order #{{orderNumber}} marked paid — please ensure table has been cleared.", active: false },
  ];

  for (const { tenant_id } of tenantsWithoutRules) {
    for (const rule of defaultRules) {
      await pool.query(
        `INSERT INTO coordination_rules (tenant_id, rule_name, trigger_event, condition_json, action, message_template, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [tenant_id, rule.name, rule.event, JSON.stringify(rule.cond), rule.action, rule.template, rule.active]
      );
    }
  }

  // Task #94: Add delivery_agent to user_role enum if not present
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'user_role'::regtype
          AND enumlabel = 'delivery_agent'
      ) THEN
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'delivery_agent';
      END IF;
    END $$
  `);

  // Task #94: Add confirmed to order_status enum if not present
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'order_status'::regtype
          AND enumlabel = 'confirmed'
      ) THEN
        ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'confirmed';
      END IF;
    END $$
  `);

  // Note: delivery_agent user seeding is done in seed.ts only (dev/demo data)
  // Migrations are schema-only and must not provision user accounts in production

  // Task #97: Food Modification System — order_item_modifications table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_item_modifications (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      order_item_id VARCHAR(36) NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      order_id VARCHAR(36) REFERENCES orders(id) ON DELETE CASCADE,
      spice_level VARCHAR(30),
      salt_level VARCHAR(20),
      removed_ingredients TEXT[] NOT NULL DEFAULT '{}',
      has_allergy BOOLEAN NOT NULL DEFAULT false,
      allergy_flags TEXT[] NOT NULL DEFAULT '{}',
      allergy_details TEXT,
      special_notes TEXT,
      chef_acknowledged BOOLEAN NOT NULL DEFAULT false,
      acknowledged_by VARCHAR(36),
      acknowledged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE order_item_modifications ADD COLUMN IF NOT EXISTS order_id VARCHAR(36) REFERENCES orders(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE order_item_modifications ADD COLUMN IF NOT EXISTS allergy_flags TEXT[] NOT NULL DEFAULT '{}'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_order_item_modifications_order ON order_item_modifications (order_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_order_item_modifications_item ON order_item_modifications (order_item_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_order_item_modifications_tenant ON order_item_modifications (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_order_item_modifications_allergy ON order_item_modifications (tenant_id, has_allergy) WHERE has_allergy = true`);

  // Task #97: recipe_components table with is_removable flag for ingredient removal workflow
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recipe_components (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      menu_item_id VARCHAR(36) NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
      ingredient_name TEXT NOT NULL,
      is_removable BOOLEAN NOT NULL DEFAULT true,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE recipe_components ADD COLUMN IF NOT EXISTS is_removable BOOLEAN NOT NULL DEFAULT true`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_recipe_components_menu_item ON recipe_components (menu_item_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_recipe_components_tenant ON recipe_components (tenant_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_components_unique ON recipe_components (menu_item_id, ingredient_name)`);

  // Task #99: Food Wastage Tracking
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wastage_logs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      outlet_id VARCHAR(36) REFERENCES outlets(id),
      wastage_number TEXT NOT NULL,
      wastage_date TEXT NOT NULL,
      wastage_category TEXT NOT NULL,
      ingredient_id VARCHAR(36) REFERENCES inventory_items(id),
      ingredient_name TEXT NOT NULL,
      quantity NUMERIC(10,3) NOT NULL,
      unit TEXT NOT NULL DEFAULT 'kg',
      unit_cost NUMERIC(10,4) NOT NULL DEFAULT 0,
      total_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
      reason TEXT,
      is_preventable BOOLEAN NOT NULL DEFAULT false,
      chef_id VARCHAR(36) REFERENCES users(id),
      chef_name TEXT,
      counter_id VARCHAR(36),
      counter_name TEXT,
      shift_id VARCHAR(36),
      stock_movement_id VARCHAR(36),
      is_voided BOOLEAN NOT NULL DEFAULT false,
      void_reason TEXT,
      voided_at TIMESTAMPTZ,
      voided_by VARCHAR(36),
      is_recovery BOOLEAN NOT NULL DEFAULT false,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wastage_logs_tenant ON wastage_logs (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wastage_logs_date ON wastage_logs (tenant_id, wastage_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wastage_logs_category ON wastage_logs (tenant_id, wastage_category)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wastage_logs_chef ON wastage_logs (tenant_id, chef_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wastage_logs_counter ON wastage_logs (tenant_id, counter_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wastage_logs_ingredient ON wastage_logs (tenant_id, ingredient_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wastage_daily_summary (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      outlet_id VARCHAR(36) REFERENCES outlets(id),
      summary_date TEXT NOT NULL,
      total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_entries INT NOT NULL DEFAULT 0,
      preventable_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
      preventable_entries INT NOT NULL DEFAULT 0,
      target_amount NUMERIC(12,2),
      revenue_for_day NUMERIC(12,2),
      category_breakdown JSONB DEFAULT '{}',
      counter_breakdown JSONB DEFAULT '{}',
      chef_breakdown JSONB DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wastage_daily_summary_tenant_date ON wastage_daily_summary (tenant_id, summary_date)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wastage_daily_summary_unique ON wastage_daily_summary (tenant_id, COALESCE(outlet_id, ''), summary_date)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wastage_targets (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      outlet_id VARCHAR(36) REFERENCES outlets(id),
      period_type TEXT NOT NULL DEFAULT 'daily',
      target_amount NUMERIC(12,2) NOT NULL,
      currency TEXT DEFAULT 'INR',
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by VARCHAR(36),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wastage_targets_tenant ON wastage_targets (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wastage_targets_active ON wastage_targets (tenant_id, is_active)`);

  // Task #101: Printer Integration — extend print_job_type enum
  try {
    await pool.query(`ALTER TYPE print_job_type ADD VALUE IF NOT EXISTS 'label'`);
  } catch (_) {}
  try {
    await pool.query(`ALTER TYPE print_job_type ADD VALUE IF NOT EXISTS 'report'`);
  } catch (_) {}
  try {
    await pool.query(`ALTER TYPE print_job_type ADD VALUE IF NOT EXISTS 'test'`);
  } catch (_) {}
  try {
    await pool.query(`ALTER TYPE print_job_type ADD VALUE IF NOT EXISTS 'reprint_kot'`);
  } catch (_) {}
  try {
    await pool.query(`ALTER TYPE print_job_type ADD VALUE IF NOT EXISTS 'reprint_bill'`);
  } catch (_) {}

  // Task #101: Extend print_job_status enum
  try {
    await pool.query(`ALTER TYPE print_job_status ADD VALUE IF NOT EXISTS 'printing'`);
  } catch (_) {}
  try {
    await pool.query(`ALTER TYPE print_job_status ADD VALUE IF NOT EXISTS 'completed'`);
  } catch (_) {}
  try {
    await pool.query(`ALTER TYPE print_job_status ADD VALUE IF NOT EXISTS 'cancelled'`);
  } catch (_) {}

  // Task #101: Extend print_jobs table with new columns
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS outlet_id VARCHAR(36) REFERENCES outlets(id)`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS printer_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS content TEXT`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS content_format TEXT DEFAULT 'escpos'`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS error_message TEXT`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS triggered_by_name TEXT`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS is_reprint BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS reprint_reason TEXT`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);

  // Add reference_id column alias if missing (existing column is reference_id)
  // The existing print_jobs table uses reference_id already from Task #68

  // Task #101: printers table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS printers (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      outlet_id VARCHAR(36) REFERENCES outlets(id),
      printer_name TEXT NOT NULL,
      printer_type VARCHAR(30) NOT NULL DEFAULT 'KITCHEN',
      connection_type VARCHAR(30) NOT NULL DEFAULT 'NETWORK_IP',
      ip_address TEXT,
      port INTEGER DEFAULT 9100,
      usb_device_path TEXT,
      paper_width VARCHAR(10) DEFAULT '80mm',
      characters_per_line INTEGER DEFAULT 42,
      print_language VARCHAR(20) DEFAULT 'ESC_POS',
      counter_id VARCHAR(36) REFERENCES kitchen_counters(id),
      is_default BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      status VARCHAR(20) DEFAULT 'unknown',
      last_ping_at TIMESTAMPTZ,
      last_print_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_printers_tenant ON printers (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_printers_outlet ON printers (outlet_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_printers_tenant_active ON printers (tenant_id, is_active)`);

  // Task #101: printer_templates table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS printer_templates (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      template_type VARCHAR(20) NOT NULL,
      template_name TEXT NOT NULL,
      header_lines JSONB DEFAULT '[]'::jsonb,
      footer_lines JSONB DEFAULT '["Thank you for dining with us!"]'::jsonb,
      show_logo BOOLEAN DEFAULT false,
      logo_url TEXT,
      show_tax_breakdown BOOLEAN DEFAULT true,
      show_item_notes BOOLEAN DEFAULT true,
      show_modifications BOOLEAN DEFAULT true,
      show_qr_code BOOLEAN DEFAULT false,
      qr_code_content TEXT,
      font_size VARCHAR(20) DEFAULT 'normal',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_printer_templates_tenant ON printer_templates (tenant_id)`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_printer_templates_tenant_type
    ON printer_templates (tenant_id, template_type)
  `);

  // Task #101: print_settings JSONB column on outlets
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS print_settings JSONB`);

  // Task #101: Seed printers for existing tenants that have none
  try {
    const { rows: tenantsWithoutPrinters } = await pool.query(`
      SELECT DISTINCT t.id AS tenant_id, o.id AS outlet_id
      FROM tenants t
      JOIN outlets o ON o.tenant_id = t.id
      WHERE t.slug != 'platform'
        AND NOT EXISTS (SELECT 1 FROM printers p WHERE p.tenant_id = t.id)
      LIMIT 10
    `);

    for (const { tenant_id, outlet_id } of tenantsWithoutPrinters) {
      const { rows: counters } = await pool.query(
        `SELECT id FROM kitchen_counters WHERE tenant_id = $1 LIMIT 1`,
        [tenant_id]
      );
      const grillCounterId = counters[0]?.id ?? null;

      const printerDefs = [
        { name: "Grill KOT", type: "KITCHEN", conn: "NETWORK_IP", ip: "192.168.1.101", port: 9100, status: "online", isDefault: true },
        { name: "Bar Printer", type: "BAR", conn: "NETWORK_IP", ip: "192.168.1.102", port: 9100, status: "online", isDefault: false },
        { name: "Cashier Printer", type: "CASHIER", conn: "NETWORK_IP", ip: "192.168.1.103", port: 9100, status: "low_paper", isDefault: true },
        { name: "Label Printer", type: "LABEL", conn: "USB", ip: null, port: null, status: "online", isDefault: true },
        { name: "Manager Printer", type: "MANAGER", conn: "NETWORK_IP", ip: "192.168.1.105", port: 9100, status: "offline", isDefault: false },
      ];

      for (const def of printerDefs) {
        const printerId = `seed-prt-${tenant_id.slice(0, 8)}-${def.name.replace(/\s+/g, "-").toLowerCase()}`;
        await pool.query(
          `INSERT INTO printers
           (id, tenant_id, outlet_id, printer_name, printer_type, connection_type,
            ip_address, port, paper_width, characters_per_line, print_language,
            counter_id, is_default, is_active, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '80mm', 42, 'ESC_POS', $9, $10, true, $11)
           ON CONFLICT (id) DO NOTHING`,
          [
            printerId, tenant_id, outlet_id, def.name, def.type, def.conn,
            def.ip, def.port,
            def.type === "KITCHEN" ? grillCounterId : null,
            def.isDefault, def.status,
          ]
        );
      }

      // Seed 10 print jobs in history
      const { rows: printerRows } = await pool.query(
        `SELECT id, printer_type FROM printers WHERE tenant_id = $1 LIMIT 5`,
        [tenant_id]
      );

      const jobTypes = ["kot", "bill", "receipt", "kot", "label", "kot", "bill", "receipt", "kot", "bill"];
      const jobStatuses = ["completed", "completed", "completed", "failed", "completed", "completed", "completed", "completed", "completed", "failed"];

      for (let i = 0; i < 10; i++) {
        const seedJobId = `seed-job-${tenant_id.slice(0, 8)}-${i}`;
        const printer = printerRows[i % printerRows.length];
        const minsAgo = (i + 1) * 15;
        await pool.query(
          `INSERT INTO print_jobs
           (id, tenant_id, outlet_id, printer_id, type, reference_id, status,
            attempts, max_attempts, payload, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 3, '{}', now() - interval '${minsAgo} minutes')
           ON CONFLICT (id) DO NOTHING`,
          [
            seedJobId, tenant_id, outlet_id, printer?.id ?? null,
            jobTypes[i], `seed-ref-${i}`, jobStatuses[i],
          ]
        );
      }

      // Seed KOT, BILL, and LABEL templates
      const templateDefs = [
        {
          type: "KOT", name: "Default KOT Template",
          header: [],
          footer: [],
          showTax: false, showNotes: true, showMods: true, showQr: false,
        },
        {
          type: "BILL", name: "Default Bill Template",
          header: [],
          footer: ["Thank you for dining with us!", "Please visit us again"],
          showTax: true, showNotes: true, showMods: false, showQr: false,
        },
        {
          type: "LABEL", name: "Default Label Template",
          header: [],
          footer: [],
          showTax: false, showNotes: false, showMods: false, showQr: false,
        },
      ];

      for (const td of templateDefs) {
        const seedTemplateId = `seed-tmpl-${tenant_id.slice(0, 8)}-${td.type.toLowerCase()}`;
        await pool.query(
          `INSERT INTO printer_templates
           (id, tenant_id, template_type, template_name, header_lines, footer_lines,
            show_tax_breakdown, show_item_notes, show_modifications, show_qr_code, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
           ON CONFLICT (id) DO NOTHING`,
          [
            seedTemplateId, tenant_id, td.type, td.name,
            JSON.stringify(td.header), JSON.stringify(td.footer),
            td.showTax, td.showNotes, td.showMods, td.showQr,
          ]
        );
      }

      // Seed auto-print settings on outlet
      await pool.query(
        `UPDATE outlets SET print_settings = $2 WHERE id = $1 AND print_settings IS NULL`,
        [outlet_id, JSON.stringify({ autoKot: true, autoReceipt: true, autoBill: false, autoLabel: false })]
      );
    }
  } catch (seedErr) {
    console.error("[Admin migrations] Printer seed error (non-fatal):", seedErr);
  }

  // Task #103: Multi-Outlet Pricing — outlet_menu_prices table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS outlet_menu_prices (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      menu_item_id VARCHAR(36) NOT NULL,
      price_type TEXT NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      currency TEXT DEFAULT 'USD',
      order_type TEXT,
      time_slot_start TEXT,
      time_slot_end TEXT,
      day_of_week JSONB,
      customer_segment TEXT,
      valid_from DATE,
      valid_until DATE,
      priority INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      notes TEXT,
      created_by VARCHAR(36),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_outlet_menu_prices_tenant ON outlet_menu_prices (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_outlet_menu_prices_outlet ON outlet_menu_prices (outlet_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_outlet_menu_prices_item ON outlet_menu_prices (menu_item_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_outlet_menu_prices_tenant_outlet_item ON outlet_menu_prices (tenant_id, outlet_id, menu_item_id)`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_outlet_menu_prices_unique
    ON outlet_menu_prices (tenant_id, outlet_id, menu_item_id, price_type, COALESCE(order_type,''), COALESCE(time_slot_start,''), COALESCE(day_of_week::text,'[]'), COALESCE(customer_segment,''))
  `);

  // Task #103: price_resolution_log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_resolution_log (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36),
      order_id VARCHAR(36),
      order_item_id VARCHAR(36),
      menu_item_id VARCHAR(36) NOT NULL,
      menu_item_name TEXT,
      base_price NUMERIC(10,2) NOT NULL,
      resolved_price NUMERIC(10,2) NOT NULL,
      price_rule_id VARCHAR(36),
      price_type_applied TEXT,
      resolution_reason TEXT,
      resolved_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_price_resolution_log_tenant ON price_resolution_log (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_price_resolution_log_menu_item ON price_resolution_log (menu_item_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_price_resolution_log_order ON price_resolution_log (order_id)`);

  // ─── Supplier Extended Fields ───────────────────────────────────────────────
  await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_code VARCHAR(30)`);
  await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city VARCHAR(100)`);
  await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS state VARCHAR(100)`);
  await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS country VARCHAR(100)`);
  await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2)`);
  await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'AED'`);
  await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS gst_number VARCHAR(30)`);
  await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS pan_number VARCHAR(20)`);
  await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100)`);
  await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_account VARCHAR(40)`);
  await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(20)`);
  await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_preferred BOOLEAN DEFAULT false`);

  // ─── Purchase Order Extended Fields ─────────────────────────────────────────
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_source VARCHAR(20) DEFAULT 'DIRECT'`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS quotation_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50)`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_outlet_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS billing_address TEXT`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS shipping_charge DECIMAL(10,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS balance_due DECIMAL(12,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS internal_notes TEXT`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255)`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255)`);

  await pool.query(`ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS ingredient_name VARCHAR(255)`);
  await pool.query(`ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS unit VARCHAR(20)`);
  await pool.query(`ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS received_quantity DECIMAL(10,3) DEFAULT 0`);
  await pool.query(`ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS pending_quantity DECIMAL(10,3)`);
  await pool.query(`ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS tax_percent DECIMAL(5,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS item_status VARCHAR(20) DEFAULT 'pending'`);

  await pool.query(`ALTER TABLE goods_received_notes ADD COLUMN IF NOT EXISTS outlet_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE goods_received_notes ADD COLUMN IF NOT EXISTS supplier_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE goods_received_notes ADD COLUMN IF NOT EXISTS supplier_invoice_no VARCHAR(100)`);
  await pool.query(`ALTER TABLE goods_received_notes ADD COLUMN IF NOT EXISTS supplier_invoice_date DATE`);
  await pool.query(`ALTER TABLE goods_received_notes ADD COLUMN IF NOT EXISTS received_by_name VARCHAR(255)`);
  await pool.query(`ALTER TABLE goods_received_notes ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft'`);
  await pool.query(`ALTER TABLE goods_received_notes ADD COLUMN IF NOT EXISTS total_items INT`);
  await pool.query(`ALTER TABLE goods_received_notes ADD COLUMN IF NOT EXISTS total_value DECIMAL(12,2)`);
  await pool.query(`ALTER TABLE goods_received_notes ADD COLUMN IF NOT EXISTS variance_notes TEXT`);
  await pool.query(`ALTER TABLE goods_received_notes ADD COLUMN IF NOT EXISTS po_delivery_id VARCHAR(36)`);

  await pool.query(`ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS accepted_qty DECIMAL(10,3)`);
  await pool.query(`ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS rejected_qty DECIMAL(10,3) DEFAULT 0`);
  await pool.query(`ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100)`);
  await pool.query(`ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS expiry_date DATE`);
  await pool.query(`ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS storage_location VARCHAR(100)`);
  await pool.query(`ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS quality_status VARCHAR(20) DEFAULT 'accepted'`);
  await pool.query(`ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);


  // ─── Procurement Expansion: RFQ, Returns, Transfers, Stock Counts, Damage ───
  try { await pool.query(`CREATE TYPE rfq_status AS ENUM ('draft','sent','received','comparing','approved','rejected','expired')`); } catch (_) {}
  try { await pool.query(`CREATE TYPE return_status AS ENUM ('draft','approved','dispatched','acknowledged','closed')`); } catch (_) {}
  try { await pool.query(`CREATE TYPE transfer_status AS ENUM ('pending','approved','in_transit','received','partially_received','cancelled')`); } catch (_) {}
  try { await pool.query(`CREATE TYPE count_status AS ENUM ('scheduled','in_progress','completed','approved')`); } catch (_) {}
  try { await pool.query(`CREATE TYPE damage_status AS ENUM ('reported','under_review','approved','disposed','written_off')`); } catch (_) {}

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rfqs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      rfq_number VARCHAR(30) NOT NULL,
      status rfq_status DEFAULT 'draft',
      required_by DATE,
      notes TEXT,
      supplier_ids TEXT[] DEFAULT '{}',
      created_by VARCHAR(36) REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rfqs_tenant ON rfqs (tenant_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rfq_items (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      rfq_id VARCHAR(36) NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
      inventory_item_id VARCHAR(36) NOT NULL REFERENCES inventory_items(id),
      quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
      unit VARCHAR(20) NOT NULL DEFAULT 'kg',
      specifications TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rfq_items_rfq ON rfq_items (rfq_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplier_quotations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      rfq_id VARCHAR(36) NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
      supplier_id VARCHAR(36) NOT NULL REFERENCES suppliers(id),
      quotation_number VARCHAR(50),
      validity_date DATE,
      payment_terms VARCHAR(20),
      delivery_days INTEGER,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_supplier_quotations_rfq ON supplier_quotations (rfq_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotation_items (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      quotation_id VARCHAR(36) NOT NULL REFERENCES supplier_quotations(id) ON DELETE CASCADE,
      inventory_item_id VARCHAR(36) NOT NULL REFERENCES inventory_items(id),
      unit_price NUMERIC(10,2),
      tax_pct NUMERIC(5,2) DEFAULT 0,
      not_available BOOLEAN DEFAULT false,
      notes TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items (quotation_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_returns (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      return_number VARCHAR(30) NOT NULL,
      supplier_id VARCHAR(36) NOT NULL REFERENCES suppliers(id),
      purchase_order_id VARCHAR(36) REFERENCES purchase_orders(id),
      return_type VARCHAR(40) NOT NULL,
      recovery_option VARCHAR(30) NOT NULL DEFAULT 'Credit Note',
      status return_status DEFAULT 'draft',
      total_value NUMERIC(12,2) DEFAULT 0,
      debit_note VARCHAR(50),
      notes TEXT,
      created_by VARCHAR(36) REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_purchase_returns_tenant ON purchase_returns (tenant_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_return_items (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      return_id VARCHAR(36) NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
      inventory_item_id VARCHAR(36) NOT NULL REFERENCES inventory_items(id),
      return_qty NUMERIC(10,2) NOT NULL,
      unit_price NUMERIC(10,2) NOT NULL,
      reason TEXT,
      condition VARCHAR(30)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON purchase_return_items (return_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_transfers (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      transfer_number VARCHAR(30) NOT NULL,
      from_outlet_id VARCHAR(36) REFERENCES outlets(id),
      to_outlet_id VARCHAR(36) REFERENCES outlets(id),
      status transfer_status DEFAULT 'pending',
      driver_name VARCHAR(100),
      vehicle_number VARCHAR(30),
      estimated_arrival DATE,
      dispatched_at TIMESTAMPTZ,
      notes TEXT,
      created_by VARCHAR(36) REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_transfers_tenant ON stock_transfers (tenant_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_transfer_items (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      transfer_id VARCHAR(36) NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
      inventory_item_id VARCHAR(36) NOT NULL REFERENCES inventory_items(id),
      requested_qty NUMERIC(10,2) NOT NULL,
      actual_qty NUMERIC(10,2),
      notes TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON stock_transfer_items (transfer_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_count_sessions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      count_number VARCHAR(30) NOT NULL,
      count_type VARCHAR(30) NOT NULL DEFAULT 'Full',
      outlet_id VARCHAR(36) REFERENCES outlets(id),
      status count_status DEFAULT 'scheduled',
      scheduled_date DATE NOT NULL,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      approved_by VARCHAR(36) REFERENCES users(id),
      reason TEXT,
      created_by VARCHAR(36) REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_count_sessions_tenant ON stock_count_sessions (tenant_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_count_items (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id VARCHAR(36) NOT NULL REFERENCES stock_count_sessions(id) ON DELETE CASCADE,
      inventory_item_id VARCHAR(36) NOT NULL REFERENCES inventory_items(id),
      system_qty NUMERIC(10,2) NOT NULL DEFAULT 0,
      physical_qty NUMERIC(10,2),
      counted BOOLEAN DEFAULT false,
      notes TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_count_items_session ON stock_count_items (session_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS damaged_inventory (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      damage_number VARCHAR(30) NOT NULL,
      inventory_item_id VARCHAR(36) NOT NULL REFERENCES inventory_items(id),
      damaged_qty NUMERIC(10,2) NOT NULL,
      unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
      damage_type VARCHAR(40) NOT NULL,
      damage_cause TEXT,
      damage_date DATE NOT NULL,
      damage_location VARCHAR(100),
      disposal_method VARCHAR(40) NOT NULL DEFAULT 'DISCARDED',
      insurance_claim_no VARCHAR(50),
      insurance_amount NUMERIC(10,2),
      status damage_status DEFAULT 'reported',
      reviewed_by VARCHAR(36) REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      notes TEXT,
      created_by VARCHAR(36) REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_damaged_inventory_tenant ON damaged_inventory (tenant_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_damaged_inventory_number ON damaged_inventory (tenant_id, damage_number)`);

  // Normalize procurement status defaults to match spec
  try {
    await pool.query(`ALTER TABLE stock_transfers ALTER COLUMN status SET DEFAULT 'requested'`);
  } catch (_) {
    // Safe to ignore — enum value may not include 'requested' in this environment
  }

  // Add FK from purchase_orders.quotation_id → supplier_quotations.id (if not already present)
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_purchase_orders_quotation_id'
        AND table_name = 'purchase_orders'
      ) THEN
        ALTER TABLE purchase_orders
          ADD CONSTRAINT fk_purchase_orders_quotation_id
          FOREIGN KEY (quotation_id) REFERENCES supplier_quotations(id);
      END IF;
    END $$
  `);
  // Add FK from purchase_orders.delivery_outlet_id → outlets.id (if not already present)
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_purchase_orders_delivery_outlet_id'
        AND table_name = 'purchase_orders'
      ) THEN
        ALTER TABLE purchase_orders
          ADD CONSTRAINT fk_purchase_orders_delivery_outlet_id
          FOREIGN KEY (delivery_outlet_id) REFERENCES outlets(id);
      END IF;
    END $$
  `);


  // CURR-FIX: Migrate all existing outlets from INR to AED
  await pool.query(`UPDATE outlets SET currency_code = 'AED', currency_symbol = 'د.إ', currency_name = 'UAE Dirham', outlet_tax_rate = 5 WHERE currency_symbol != 'د.إ' OR currency_name != 'UAE Dirham' OR currency_code != 'AED' OR currency_code IS NULL;`);
  console.log('[Migration] CURR-FIX: outlets updated to AED');

  // CRM-SERVER-V: Clean invalid phone numbers
  try {
    const phoneResult = await pool.query(`UPDATE customers SET phone = NULL WHERE phone IS NOT NULL AND phone ~ '[^0-9+\\-\\s()]'`);
    console.log('[Migration] CRM-SERVER-V: cleaned ' + (phoneResult.rowCount || 0) + ' invalid phone rows');
  } catch (err) {
    console.error('[Migration] CRM-SERVER-V: phone cleanup error (non-fatal):', err);
  }

  // MODIFIER-GROUPS-001: Create modifier tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS modifier_groups (
              id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
              tenant_id VARCHAR(36) NOT NULL,
      name VARCHAR(100) NOT NULL,
      selection_type VARCHAR(20) NOT NULL DEFAULT 'single',
      is_required BOOLEAN NOT NULL DEFAULT false,
      min_selections INTEGER DEFAULT 0,
      max_selections INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS modifier_options (
              id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
              group_id VARCHAR(36) NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
              tenant_id VARCHAR(36) NOT NULL,
      name VARCHAR(100) NOT NULL,
      price_adjustment DECIMAL(10,2) DEFAULT 0,
      is_default BOOLEAN DEFAULT false,
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true
    );
    CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
              id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
              menu_item_id VARCHAR(36) NOT NULL,
              group_id VARCHAR(36) NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
              tenant_id VARCHAR(36) NOT NULL,
      sort_order INTEGER DEFAULT 0,
      UNIQUE(menu_item_id, group_id)
    );
    CREATE INDEX IF NOT EXISTS idx_modifier_groups_tenant ON modifier_groups(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_modifier_options_group ON modifier_options(group_id);
    CREATE INDEX IF NOT EXISTS idx_menu_item_modifiers_item ON menu_item_modifier_groups(menu_item_id);
  `);
  console.log('[Migration] MODIFIER-GROUPS-001: tables created');

  // MODIFIER-GROUPS-002: Seed real modifier groups for all tenants
  const { rows: modTenants } = await pool.query(
    `SELECT DISTINCT tenant_id FROM outlets WHERE active = true`
  );
  for (const tenant of modTenants) {
    const tid = tenant.tenant_id;
    const { rows: existingMod } = await pool.query(
      `SELECT id FROM modifier_groups WHERE tenant_id = $1 LIMIT 1`, [tid]
    );
    if (existingMod.length > 0) continue;
    const modGroups = [
      { name: "Cooking Temperature", st: "single", req: true, min: 1, max: 1, so: 1, opts: [
        { n: "Rare", p: 0, so: 1 }, { n: "Medium Rare", p: 0, so: 2, d: true }, { n: "Medium", p: 0, so: 3 }, { n: "Well Done", p: 0, so: 4 }
      ]},
      { name: "Sauce Choice", st: "single", req: false, min: 0, max: 1, so: 2, opts: [
        { n: "Lemon Butter", p: 0, so: 1, d: true }, { n: "Peppercorn", p: 2, so: 2 }, { n: "BBQ", p: 0, so: 3 }, { n: "Chimichurri", p: 2, so: 4 }, { n: "Garlic Herb", p: 0, so: 5 }
      ]},
      { name: "Pasta Type", st: "single", req: false, min: 0, max: 1, so: 3, opts: [
        { n: "Regular", p: 0, so: 1, d: true }, { n: "Gluten-Free Pasta", p: 5, so: 2 }, { n: "Extra Portion", p: 8, so: 3 }
      ]},
      { name: "Protein Add-On", st: "multi", req: false, min: 0, max: 3, so: 4, opts: [
        { n: "Add Grilled Chicken", p: 8, so: 1 }, { n: "Add Prawns", p: 12, so: 2 }, { n: "Add Extra Cheese", p: 4, so: 3 }
      ]},
      { name: "Spice Level", st: "single", req: false, min: 0, max: 1, so: 5, opts: [
        { n: "Mild", p: 0, so: 1 }, { n: "Medium", p: 0, so: 2, d: true }, { n: "Hot", p: 0, so: 3 }, { n: "Extra Hot", p: 0, so: 4 }
      ]},
      { name: "Coffee Size", st: "single", req: true, min: 1, max: 1, so: 6, opts: [
        { n: "Regular", p: 0, so: 1, d: true }, { n: "Large", p: 3, so: 2 }
      ]},
      { name: "Milk Type", st: "single", req: false, min: 0, max: 1, so: 7, opts: [
        { n: "Whole Milk", p: 0, so: 1, d: true }, { n: "Oat Milk", p: 3, so: 2 }, { n: "Almond Milk", p: 3, so: 3 }, { n: "Skimmed Milk", p: 0, so: 4 }
      ]},
      { name: "Side Choice", st: "single", req: false, min: 0, max: 1, so: 8, opts: [
        { n: "French Fries", p: 0, so: 1, d: true }, { n: "Seasonal Salad", p: 0, so: 2 }, { n: "Mashed Potato", p: 0, so: 3 }, { n: "Steamed Rice", p: 0, so: 4 }
      ]},
      { name: "Allergen Flags", st: "multi", req: false, min: 0, max: 4, so: 9, opts: [
        { n: "No Nuts", p: 0, so: 1 }, { n: "No Dairy", p: 0, so: 2 }, { n: "No Gluten", p: 0, so: 3 }, { n: "No Shellfish", p: 0, so: 4 }
      ]},
      { name: "Starter Sauce", st: "multi", req: false, min: 0, max: 3, so: 10, opts: [
        { n: "Tartar", p: 0, so: 1 }, { n: "Sweet Chili", p: 0, so: 2 }, { n: "Ranch", p: 0, so: 3 }, { n: "Sriracha Mayo", p: 0, so: 4 }
      ]},
    ];
    for (const g of modGroups) {
      const { rows: [inserted] } = await pool.query(
        `INSERT INTO modifier_groups (tenant_id, name, selection_type, is_required, min_selections, max_selections, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [tid, g.name, g.st, g.req, g.min, g.max, g.so]
      );
      for (const o of g.opts) {
        await pool.query(
          `INSERT INTO modifier_options (group_id, tenant_id, name, price_adjustment, is_default, sort_order) VALUES ($1, $2, $3, $4, $5, $6)`,
          [inserted.id, tid, o.n, o.p, o.d || false, o.so]
        );
      }
    }
    console.log(`[Migration] MODIFIER-GROUPS-002: seeded tenant ${tid}`);
  }

    // ALL-02: Allergy acknowledgment migration
  await runAllergyAckMigration();
  // ALLERGEN: Add allergen columns to menu_items and order_items
  try {
    await pool.query(`
      ALTER TABLE menu_items
        ADD COLUMN IF NOT EXISTS allergen_flags JSONB DEFAULT '{}';
      ALTER TABLE menu_items
        ADD COLUMN IF NOT EXISTS allergen_may_contain JSONB DEFAULT '{}';
      ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS allergen_flags JSONB DEFAULT '{}';
      ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS allergen_may_contain JSONB DEFAULT '{}';
    `);
    console.log('[Migration] ALLERGEN: allergen columns added to menu_items and order_items');
  } catch (err: any) {
    console.error('[Migration] ALLERGEN error:', err.message);
  }

  console.log('[Migration] ALL-02: allergy ack migration complete');
}

export async function runTask108Migrations(): Promise<void> {
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cooking_status VARCHAR(30) DEFAULT 'queued'`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS suggested_start_at TIMESTAMP`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS actual_start_at TIMESTAMP`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMP`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS actual_ready_at TIMESTAMP`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_prep_minutes INT`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS started_by_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS started_by_name VARCHAR(255)`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS hold_reason TEXT`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS hold_until_item_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS hold_until_minutes INT`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS course_number INT DEFAULT 1`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_courses (
      id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id     VARCHAR(36) NOT NULL,
      order_id      VARCHAR(36) NOT NULL,
      course_number INT NOT NULL,
      course_name   VARCHAR(50),
      status        VARCHAR(20) DEFAULT 'waiting',
      fire_at       TIMESTAMP,
      fired_by      VARCHAR(36),
      fired_by_name VARCHAR(255),
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_order_courses_order_id ON order_courses (order_id)`);

  // Create kitchen_settings first (fresh DB), then ALTER for pre-existing tables missing the column
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kitchen_settings (
      id                        VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id                 VARCHAR(36) NOT NULL UNIQUE,
      cooking_control_mode      VARCHAR(20) DEFAULT 'selective',
      show_timing_suggestions   BOOLEAN DEFAULT true,
      alert_overdue_minutes     INT DEFAULT 3,
      allow_rush_override       BOOLEAN DEFAULT true,
      rush_requires_manager_pin BOOLEAN DEFAULT true,
      manager_pin_hash          TEXT,
      auto_hold_bar_items       BOOLEAN DEFAULT true,
      default_prep_source       VARCHAR(20) DEFAULT 'recipe',
      created_at                TIMESTAMP DEFAULT NOW(),
      updated_at                TIMESTAMP DEFAULT NOW()
    )
  `);
  // For tenants already on a previous version of this table, add the column idempotently
  await pool.query(`ALTER TABLE kitchen_settings ADD COLUMN IF NOT EXISTS manager_pin_hash TEXT`);

  // ── Task #110: Cooking & Preparation Time Tracking ──────────────────────────

  // Missing timestamp columns on order_items
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS kot_sent_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS ticket_acknowledged_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS waiter_pickup_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS served_at TIMESTAMPTZ`);

  // Missing timestamp columns on orders
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS kot_sent_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS all_items_ready_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS all_items_served_at TIMESTAMPTZ`);

  // item_time_logs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS item_time_logs (
      id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id               VARCHAR(36) NOT NULL,
      outlet_id               VARCHAR(36),
      order_id                VARCHAR(36) NOT NULL,
      order_number            VARCHAR(50),
      order_item_id           VARCHAR(36) NOT NULL UNIQUE,
      menu_item_id            VARCHAR(36),
      menu_item_name          VARCHAR(255),
      counter_id              VARCHAR(36),
      counter_name            VARCHAR(100),
      chef_id                 VARCHAR(36),
      chef_name               VARCHAR(255),
      shift_date              DATE NOT NULL,
      shift_type              VARCHAR(20),
      order_type              VARCHAR(30),
      table_number            VARCHAR(20),
      order_received_at       TIMESTAMPTZ,
      kot_sent_at             TIMESTAMPTZ,
      ticket_acknowledged_at  TIMESTAMPTZ,
      cooking_started_at      TIMESTAMPTZ,
      cooking_ready_at        TIMESTAMPTZ,
      order_fully_ready_at    TIMESTAMPTZ,
      waiter_pickup_at        TIMESTAMPTZ,
      served_at               TIMESTAMPTZ,
      waiter_response_time    INT,
      kitchen_pickup_time     INT,
      idle_wait_time          INT,
      actual_cooking_time     INT,
      pass_wait_time          INT,
      service_delivery_time   INT,
      total_kitchen_time      INT,
      total_cycle_time        INT,
      recipe_estimated_time   INT,
      time_variance           INT,
      variance_percent        DECIMAL(5,2),
      performance_flag        VARCHAR(20),
      had_modifications       BOOLEAN DEFAULT false,
      had_allergy_flag        BOOLEAN DEFAULT false,
      was_rush_order          BOOLEAN DEFAULT false,
      was_vip_order           BOOLEAN DEFAULT false,
      course_number           INT,
      created_at              TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_item_time_logs_tenant ON item_time_logs(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_item_time_logs_order_id ON item_time_logs(order_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_item_time_logs_order_item_id ON item_time_logs(order_item_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_item_time_logs_chef_id ON item_time_logs(chef_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_item_time_logs_menu_item ON item_time_logs(menu_item_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_item_time_logs_shift_date ON item_time_logs(tenant_id, shift_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_item_time_logs_outlet ON item_time_logs(outlet_id, shift_date)`);

  // order_time_summary table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_time_summary (
      id                    VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id             VARCHAR(36) NOT NULL,
      outlet_id             VARCHAR(36),
      order_id              VARCHAR(36) NOT NULL UNIQUE,
      order_number          VARCHAR(50),
      order_type            VARCHAR(30),
      table_number          VARCHAR(20),
      waiter_id             VARCHAR(36),
      waiter_name           VARCHAR(255),
      total_items           INT,
      order_received_at     TIMESTAMPTZ,
      kot_sent_at           TIMESTAMPTZ,
      first_item_ready_at   TIMESTAMPTZ,
      all_items_ready_at    TIMESTAMPTZ,
      first_item_served_at  TIMESTAMPTZ,
      all_items_served_at   TIMESTAMPTZ,
      total_kitchen_time    INT,
      total_cycle_time      INT,
      target_time           INT,
      met_target            BOOLEAN,
      delay_reason          TEXT,
      customer_rating       INT,
      shift_date            DATE,
      shift_type            VARCHAR(20),
      created_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_order_time_summary_tenant ON order_time_summary(tenant_id, shift_date)`);

  // daily_time_performance table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_time_performance (
      id                    VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id             VARCHAR(36) NOT NULL,
      outlet_id             VARCHAR(36),
      performance_date      DATE NOT NULL,
      shift_type            VARCHAR(20),
      total_orders          INT DEFAULT 0,
      orders_on_time        INT DEFAULT 0,
      orders_delayed        INT DEFAULT 0,
      orders_very_fast      INT DEFAULT 0,
      avg_waiter_response   INT,
      avg_kitchen_pickup    INT,
      avg_idle_wait         INT,
      avg_cooking_time      INT,
      avg_pass_wait         INT,
      avg_total_kitchen_time INT,
      avg_total_cycle_time  INT,
      peak_hour             INT,
      peak_avg_wait         INT,
      by_counter            JSONB,
      by_chef               JSONB,
      by_dish               JSONB,
      target_kitchen_time   INT,
      target_cycle_time     INT,
      on_time_percentage    DECIMAL(5,2),
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, outlet_id, performance_date, shift_type)
    )
  `);

  // recipe_time_benchmarks table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recipe_time_benchmarks (
      id                  VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id           VARCHAR(36) NOT NULL,
      menu_item_id        VARCHAR(36) NOT NULL,
      counter_id          VARCHAR(36),
      estimated_prep_time INT NOT NULL,
      actual_avg_time     INT,
      fastest_time        INT,
      slowest_time        INT,
      p75_time            INT,
      sample_count        INT DEFAULT 0,
      last_calculated     TIMESTAMPTZ,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, menu_item_id, counter_id)
    )
  `);

  // time_performance_targets table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS time_performance_targets (
      id                        VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id                 VARCHAR(36) NOT NULL,
      outlet_id                 VARCHAR(36),
      order_type                VARCHAR(30) DEFAULT 'ALL',
      target_name               VARCHAR(100),
      waiter_response_target    INT DEFAULT 120,
      kitchen_pickup_target     INT DEFAULT 60,
      total_kitchen_target      INT DEFAULT 900,
      total_cycle_target        INT DEFAULT 1500,
      alert_at_percent          INT DEFAULT 80,
      is_active                 BOOLEAN DEFAULT true,
      created_at                TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Task #112: Order Ticket History — new columns on order_items
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_voided BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS voided_reason TEXT`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS void_request_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_refire BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS original_item_id VARCHAR(36)`);

  // Task #112: item_void_requests table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS item_void_requests (
      id                  VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id           VARCHAR(36) NOT NULL,
      outlet_id           VARCHAR(36),
      order_id            VARCHAR(36) NOT NULL,
      order_number        VARCHAR(50),
      order_item_id       VARCHAR(36) NOT NULL,
      menu_item_name      VARCHAR(255),
      quantity            INT,
      unit_price          DECIMAL(10,2),
      total_value         DECIMAL(10,2),
      void_reason         TEXT NOT NULL,
      void_type           VARCHAR(30) NOT NULL,
      status              VARCHAR(20) DEFAULT 'pending',
      requested_by        VARCHAR(36) NOT NULL,
      requested_by_name   VARCHAR(255),
      requested_by_role   VARCHAR(50),
      approved_by         VARCHAR(36),
      approved_by_name    VARCHAR(255),
      rejected_reason     TEXT,
      approved_at         TIMESTAMPTZ,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_void_requests_tenant ON item_void_requests(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_void_requests_order ON item_void_requests(order_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_void_requests_status ON item_void_requests(tenant_id, status)`);

  // Task #112: voided_items table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voided_items (
      id                  VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id           VARCHAR(36) NOT NULL,
      order_id            VARCHAR(36) NOT NULL,
      order_item_id       VARCHAR(36) NOT NULL,
      void_request_id     VARCHAR(36) NOT NULL,
      menu_item_name      VARCHAR(255),
      quantity            INT,
      unit_price          DECIMAL(10,2),
      total_value         DECIMAL(10,2),
      void_reason         TEXT,
      void_type           VARCHAR(30),
      voided_by           VARCHAR(36) NOT NULL,
      voided_by_name      VARCHAR(255),
      approved_by         VARCHAR(36) NOT NULL,
      approved_by_name    VARCHAR(255),
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_voided_items_tenant ON voided_items(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_voided_items_order ON voided_items(order_id)`);

  // Task #112: item_refire_requests table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS item_refire_requests (
      id                  VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id           VARCHAR(36) NOT NULL,
      outlet_id           VARCHAR(36),
      order_id            VARCHAR(36) NOT NULL,
      order_number        VARCHAR(50),
      order_item_id       VARCHAR(36) NOT NULL,
      new_order_item_id   VARCHAR(36),
      menu_item_name      VARCHAR(255),
      quantity            INT,
      refire_reason       TEXT NOT NULL,
      priority            VARCHAR(20) DEFAULT 'high',
      assign_to_chef_id   VARCHAR(36),
      assign_to_chef_name VARCHAR(255),
      new_kot_number      VARCHAR(50),
      status              VARCHAR(20) DEFAULT 'sent',
      requested_by        VARCHAR(36) NOT NULL,
      requested_by_name   VARCHAR(255),
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_refire_requests_tenant ON item_refire_requests(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_refire_requests_order ON item_refire_requests(order_id)`);

  // Task #114: Alert System — 3 new tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_definitions (
      id                    VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id             VARCHAR(36),
      alert_code            VARCHAR(20) NOT NULL,
      alert_name            VARCHAR(100) NOT NULL,
      sound_key             VARCHAR(50) NOT NULL,
      urgency               VARCHAR(20) NOT NULL DEFAULT 'normal',
      target_roles          JSONB NOT NULL DEFAULT '[]',
      requires_acknowledge  BOOLEAN DEFAULT false,
      repeat_interval_sec   INT DEFAULT 0,
      can_be_disabled       BOOLEAN DEFAULT true,
      min_volume            INT DEFAULT 0,
      is_active             BOOLEAN DEFAULT true,
      is_system_default     BOOLEAN DEFAULT false,
      created_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_alert_def_code ON alert_definitions(alert_code)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_alert_def_tenant ON alert_definitions(tenant_id)`);
  await pool.query(`
    DELETE FROM alert_definitions a
    WHERE tenant_id IS NULL
      AND id NOT IN (
        SELECT MIN(id) FROM alert_definitions WHERE tenant_id IS NULL GROUP BY alert_code
      )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_def_system_default ON alert_definitions(alert_code) WHERE tenant_id IS NULL`);

  // Task #116: Crockery & Cutlery Tracking — inventory_items new columns
  await pool.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_category VARCHAR(30) DEFAULT 'INGREDIENT'`);
  await pool.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_type VARCHAR(20) DEFAULT 'WEIGHT'`);
  await pool.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS par_level_per_shift INT`);
  await pool.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS reorder_pieces INT`);
  await pool.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS cost_per_piece DECIMAL(10,2)`);
  await pool.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS supplier_id_ref VARCHAR(36)`);
  await pool.query(`UPDATE inventory_items SET item_category = 'INGREDIENT' WHERE item_category IS NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inventory_item_category ON inventory_items(tenant_id, item_category)`);

  // Task #116: stock_count_items — variance_reason column
  await pool.query(`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS variance_reason VARCHAR(50)`);

  // Task #116: damaged_inventory — photo_url and caused_by_name columns
  await pool.query(`ALTER TABLE damaged_inventory ADD COLUMN IF NOT EXISTS photo_url TEXT`);
  await pool.query(`ALTER TABLE damaged_inventory ADD COLUMN IF NOT EXISTS caused_by_name VARCHAR(100)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_outlet_configs (
      id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id     VARCHAR(36) NOT NULL,
      outlet_id     VARCHAR(36) NOT NULL,
      alert_code    VARCHAR(20) NOT NULL,
      is_enabled    BOOLEAN DEFAULT true,
      volume_level  INT DEFAULT 80,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_outlet_config_unique ON alert_outlet_configs(tenant_id, outlet_id, alert_code)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_events (
      id                   VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id            VARCHAR(36) NOT NULL,
      outlet_id            VARCHAR(36),
      alert_code           VARCHAR(20) NOT NULL,
      urgency              VARCHAR(20) NOT NULL,
      reference_id         VARCHAR(36),
      reference_number     VARCHAR(50),
      message              TEXT NOT NULL,
      target_roles         JSONB NOT NULL DEFAULT '[]',
      is_resolved          BOOLEAN DEFAULT false,
      acknowledged_by      VARCHAR(36),
      acknowledged_at      TIMESTAMPTZ,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_alert_events_tenant ON alert_events(tenant_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_alert_events_outlet ON alert_events(outlet_id, is_resolved)`);

  // Task #118: Cash Machine — outlet currency columns
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS currency_code VARCHAR(10) DEFAULT 'INR'`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(10) DEFAULT '₹'`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS currency_name VARCHAR(50) DEFAULT 'Indian Rupee'`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS currency_position VARCHAR(10) DEFAULT 'before'`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS decimal_places INT DEFAULT 2`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS denomination_config JSONB`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS cash_rounding VARCHAR(20) DEFAULT 'NONE'`);

  // Task #118: Cash Machine — cash_sessions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cash_sessions (
      id                        VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id                 VARCHAR(36) NOT NULL,
      outlet_id                 VARCHAR(36),
      pos_session_id            VARCHAR(36),
      session_number            VARCHAR(50) NOT NULL,
      cashier_id                VARCHAR(36) NOT NULL,
      cashier_name              VARCHAR(255),
      currency_code             VARCHAR(10) NOT NULL DEFAULT 'INR',
      currency_symbol           VARCHAR(10) DEFAULT '₹',
      status                    VARCHAR(20) DEFAULT 'open',
      opening_float             DECIMAL(12,2) NOT NULL DEFAULT 0,
      opening_float_breakdown   JSONB,
      expected_closing_cash     DECIMAL(12,2) DEFAULT 0,
      physical_closing_cash     DECIMAL(12,2),
      closing_breakdown         JSONB,
      cash_variance             DECIMAL(12,2),
      variance_reason           TEXT,
      total_cash_sales          DECIMAL(12,2) DEFAULT 0,
      total_cash_refunds        DECIMAL(12,2) DEFAULT 0,
      total_cash_payouts        DECIMAL(12,2) DEFAULT 0,
      total_transactions        INT DEFAULT 0,
      opened_at                 TIMESTAMPTZ DEFAULT NOW(),
      closed_at                 TIMESTAMPTZ,
      approved_by               VARCHAR(36),
      approved_at               TIMESTAMPTZ,
      notes                     TEXT,
      created_at                TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_number ON cash_sessions(tenant_id, session_number)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cash_sessions_cashier ON cash_sessions(tenant_id, cashier_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cash_sessions_outlet ON cash_sessions(outlet_id, status)`);

  // Task #118: Cash Machine — cash_drawer_events table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cash_drawer_events (
      id                VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id         VARCHAR(36) NOT NULL,
      outlet_id         VARCHAR(36),
      session_id        VARCHAR(36) NOT NULL,
      event_type        VARCHAR(30) NOT NULL,
      order_id          VARCHAR(36),
      bill_id           VARCHAR(36),
      reference_number  VARCHAR(50),
      amount            DECIMAL(12,2),
      tendered_amount   DECIMAL(12,2),
      change_given      DECIMAL(12,2),
      change_breakdown  JSONB,
      running_balance   DECIMAL(12,2),
      performed_by      VARCHAR(36) NOT NULL,
      performed_by_name VARCHAR(255),
      reason            TEXT,
      is_manual         BOOLEAN DEFAULT false,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cash_events_session ON cash_drawer_events(session_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cash_events_tenant ON cash_drawer_events(tenant_id, created_at DESC)`);

  // Task #118: Cash Machine — cash_payouts table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cash_payouts (
      id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id       VARCHAR(36) NOT NULL,
      outlet_id       VARCHAR(36),
      session_id      VARCHAR(36) NOT NULL,
      payout_number   VARCHAR(50),
      payout_type     VARCHAR(30) NOT NULL,
      amount          DECIMAL(12,2) NOT NULL,
      recipient       VARCHAR(255),
      reason          TEXT NOT NULL,
      approved_by     VARCHAR(36),
      receipt_url     TEXT,
      performed_by    VARCHAR(36) NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cash_payouts_session ON cash_payouts(session_id)`);

  // Task #118: Cash Machine — cash_handovers table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cash_handovers (
      id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id               VARCHAR(36) NOT NULL,
      outlet_id               VARCHAR(36),
      session_id              VARCHAR(36) NOT NULL,
      handover_number         VARCHAR(50),
      amount_handed_over      DECIMAL(12,2) NOT NULL,
      denomination_breakdown  JSONB,
      handed_by               VARCHAR(36) NOT NULL,
      handed_by_name          VARCHAR(255),
      received_by             VARCHAR(36),
      received_by_name        VARCHAR(255),
      notes                   TEXT,
      created_at              TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cash_handovers_session ON cash_handovers(session_id)`);

  // Task #120: Tip Management System
  await pool.query(`
    CREATE TABLE IF NOT EXISTS outlet_tip_settings (
      id                    VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id             VARCHAR(36) NOT NULL,
      outlet_id             VARCHAR(36) NOT NULL,
      tips_enabled          BOOLEAN DEFAULT false,
      show_on_pos           BOOLEAN DEFAULT true,
      show_on_qr            BOOLEAN DEFAULT false,
      show_on_receipt       BOOLEAN DEFAULT true,
      prompt_style          VARCHAR(20) DEFAULT 'BUTTONS',
      suggested_pct_1       INT DEFAULT 5,
      suggested_pct_2       INT DEFAULT 10,
      suggested_pct_3       INT DEFAULT 15,
      allow_custom_amount   BOOLEAN DEFAULT true,
      tip_basis             VARCHAR(20) DEFAULT 'SUBTOTAL',
      distribution_method   VARCHAR(20) DEFAULT 'INDIVIDUAL',
      waiter_share_pct      INT DEFAULT 70,
      kitchen_share_pct     INT DEFAULT 30,
      tip_is_taxable        BOOLEAN DEFAULT false,
      currency_code         VARCHAR(10) DEFAULT 'INR',
      currency_symbol       VARCHAR(5) DEFAULT '₹',
      updated_by            VARCHAR(36),
      updated_at            TIMESTAMPTZ DEFAULT NOW(),
      created_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_outlet_tip_settings ON outlet_tip_settings(tenant_id, outlet_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bill_tips (
      id                    VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id             VARCHAR(36) NOT NULL,
      outlet_id             VARCHAR(36) NOT NULL,
      bill_id               VARCHAR(36) NOT NULL,
      order_id              VARCHAR(36) NOT NULL,
      tip_amount            DECIMAL(10,2) NOT NULL,
      tip_type              VARCHAR(20) NOT NULL,
      tip_percentage        DECIMAL(5,2),
      tip_basis_amount      DECIMAL(10,2),
      payment_method        VARCHAR(30),
      waiter_id             VARCHAR(36),
      waiter_name           VARCHAR(255),
      distribution_method   VARCHAR(20),
      is_distributed        BOOLEAN DEFAULT false,
      distributed_at        TIMESTAMPTZ,
      created_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bill_tips_tenant ON bill_tips(tenant_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bill_tips_bill ON bill_tips(bill_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bill_tips_waiter ON bill_tips(waiter_id, created_at DESC)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_bill_tips_bill ON bill_tips(bill_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tip_distributions (
      id                    VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id             VARCHAR(36) NOT NULL,
      outlet_id             VARCHAR(36) NOT NULL,
      bill_tip_id           VARCHAR(36) NOT NULL,
      staff_id              VARCHAR(36) NOT NULL,
      staff_name            VARCHAR(255),
      staff_role            VARCHAR(50),
      share_percentage      DECIMAL(5,2),
      share_amount          DECIMAL(10,2),
      distribution_date     DATE,
      is_paid               BOOLEAN DEFAULT false,
      paid_at               TIMESTAMPTZ,
      created_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tip_distributions_tip ON tip_distributions(bill_tip_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tip_distributions_staff ON tip_distributions(staff_id, distribution_date DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tip_distributions_tenant ON tip_distributions(tenant_id, distribution_date DESC)`);

  // Task #120: Add tip_type and tip_waiter_id to bills
  await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS tip_type VARCHAR(20)`);
  await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS tip_waiter_id VARCHAR(36)`);

  // Task #122: Packing Charges Management
  await pool.query(`
    CREATE TABLE IF NOT EXISTS outlet_packing_settings (
      id                        VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id                 VARCHAR(36) NOT NULL,
      outlet_id                 VARCHAR(36) NOT NULL,
      takeaway_charge_enabled   BOOLEAN DEFAULT false,
      delivery_charge_enabled   BOOLEAN DEFAULT false,
      charge_type               VARCHAR(20) DEFAULT 'FIXED_PER_ORDER',
      takeaway_charge_amount    DECIMAL(10,2) DEFAULT 0,
      delivery_charge_amount    DECIMAL(10,2) DEFAULT 0,
      takeaway_per_item         DECIMAL(10,2) DEFAULT 0,
      delivery_per_item         DECIMAL(10,2) DEFAULT 0,
      max_charge_per_order      DECIMAL(10,2),
      packing_charge_taxable    BOOLEAN DEFAULT false,
      packing_charge_tax_pct    DECIMAL(5,2) DEFAULT 0,
      show_on_receipt           BOOLEAN DEFAULT true,
      charge_label              VARCHAR(100) DEFAULT 'Packing Charge',
      currency_code             VARCHAR(10) DEFAULT 'INR',
      currency_symbol           VARCHAR(5) DEFAULT '₹',
      updated_by                VARCHAR(36),
      updated_at                TIMESTAMPTZ DEFAULT NOW(),
      created_at                TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_outlet_packing ON outlet_packing_settings(tenant_id, outlet_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS packing_charge_categories (
      id                    VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id             VARCHAR(36) NOT NULL,
      outlet_id             VARCHAR(36) NOT NULL,
      category_name         VARCHAR(100) NOT NULL,
      takeaway_charge       DECIMAL(10,2) DEFAULT 0,
      delivery_charge       DECIMAL(10,2) DEFAULT 0,
      applies_to_categories JSONB,
      created_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_packing_cat_outlet ON packing_charge_categories(outlet_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS packing_charge_exemptions (
      id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id       VARCHAR(36) NOT NULL,
      outlet_id       VARCHAR(36) NOT NULL,
      exemption_type  VARCHAR(20) NOT NULL,
      reference_id    VARCHAR(36) NOT NULL,
      reference_name  VARCHAR(255),
      reason          TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_packing_exemptions_outlet ON packing_charge_exemptions(outlet_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bill_packing_charges (
      id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id       VARCHAR(36) NOT NULL,
      outlet_id       VARCHAR(36) NOT NULL,
      bill_id         VARCHAR(36) NOT NULL,
      order_id        VARCHAR(36) NOT NULL,
      order_type      VARCHAR(20) NOT NULL,
      charge_type     VARCHAR(20) NOT NULL,
      charge_amount   DECIMAL(10,2) NOT NULL,
      tax_amount      DECIMAL(10,2) DEFAULT 0,
      total_amount    DECIMAL(10,2) NOT NULL,
      item_count      INT,
      breakdown       JSONB,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_bill_packing ON bill_packing_charges(bill_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bill_packing_outlet ON bill_packing_charges(outlet_id, created_at DESC)`);

  await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS packing_charge DECIMAL(10,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS packing_charge_label VARCHAR(100) DEFAULT 'Packing Charge'`);
  await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS packing_charge_tax DECIMAL(10,2) DEFAULT 0`);

  // Task #125: In-App Support Ticket System
  await pool.query(`
    CREATE TABLE IF NOT EXISTS in_app_support_tickets (
      id                VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id         VARCHAR(36) NOT NULL,
      created_by        VARCHAR(36) NOT NULL,
      created_by_name   VARCHAR(255),
      subject           VARCHAR(255) NOT NULL,
      description       TEXT NOT NULL,
      category          VARCHAR(50) NOT NULL DEFAULT 'general',
      priority          VARCHAR(20) DEFAULT 'normal',
      status            VARCHAR(20) DEFAULT 'open',
      assigned_to       VARCHAR(36),
      page_context      TEXT,
      browser_info      TEXT,
      tenant_plan       VARCHAR(50),
      resolved_at       TIMESTAMPTZ,
      last_replied_at   TIMESTAMPTZ,
      reply_count       INT DEFAULT 0,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_in_app_support_tickets_tenant ON in_app_support_tickets(tenant_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_in_app_support_tickets_status ON in_app_support_tickets(status, created_at DESC)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS in_app_support_ticket_replies (
      id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      ticket_id     VARCHAR(36) NOT NULL,
      tenant_id     VARCHAR(36) NOT NULL,
      author_id     VARCHAR(36) NOT NULL,
      author_name   VARCHAR(255),
      is_admin      BOOLEAN DEFAULT false,
      message       TEXT NOT NULL,
      attachments   JSONB,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_in_app_support_replies_ticket ON in_app_support_ticket_replies(ticket_id, created_at ASC)`);

  // Task #124: Add email_hash for deterministic uniqueness checking (email is encrypted with random IV)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_hash TEXT`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_email_hash ON users(email_hash) WHERE email_hash IS NOT NULL`);

  // Task #132: Special Resource Management System
  await pool.query(`
    CREATE TABLE IF NOT EXISTS special_resources (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      resource_code VARCHAR(30) NOT NULL,
      resource_name VARCHAR(100) NOT NULL,
      resource_icon VARCHAR(10) DEFAULT '🪑',
      total_units INT NOT NULL DEFAULT 0,
      available_units INT NOT NULL DEFAULT 0,
      in_use_units INT DEFAULT 0,
      under_cleaning_units INT DEFAULT 0,
      damaged_units INT DEFAULT 0,
      is_trackable BOOLEAN DEFAULT true,
      requires_setup_time INT DEFAULT 0,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_special_resources_outlet ON special_resources(tenant_id, outlet_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_special_resources_code ON special_resources(outlet_id, resource_code) WHERE is_active = true`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS resource_units (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      resource_id VARCHAR(36) NOT NULL,
      unit_code VARCHAR(30) NOT NULL,
      unit_name VARCHAR(100),
      status VARCHAR(20) DEFAULT 'available',
      current_table_id VARCHAR(36),
      current_order_id VARCHAR(36),
      last_cleaned_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_resource_units_resource ON resource_units(resource_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_resource_units_outlet ON resource_units(outlet_id, status)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_units_unique_code ON resource_units(resource_id, unit_code)`);
  // Add FK constraint idempotently — catches duplicate_object error only
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE resource_units ADD CONSTRAINT fk_resource_units_resource_id
        FOREIGN KEY (resource_id) REFERENCES special_resources(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS resource_assignments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      resource_id VARCHAR(36) NOT NULL,
      resource_name VARCHAR(100),
      resource_unit_id VARCHAR(36),
      unit_code VARCHAR(30),
      table_id VARCHAR(36),
      table_number VARCHAR(20),
      order_id VARCHAR(36),
      reservation_id VARCHAR(36),
      quantity INT DEFAULT 1,
      assigned_for VARCHAR(50),
      status VARCHAR(20) DEFAULT 'assigned',
      special_notes TEXT,
      assigned_by VARCHAR(36),
      assigned_by_name VARCHAR(255),
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      returned_at TIMESTAMPTZ,
      requires_cleaning BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_resource_assignments_tenant ON resource_assignments(tenant_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_resource_assignments_table ON resource_assignments(table_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_resource_assignments_reservation ON resource_assignments(reservation_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_resource_assignments_resource ON resource_assignments(resource_id, status)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS resource_cleaning_log (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id VARCHAR(36) NOT NULL,
      resource_unit_id VARCHAR(36) NOT NULL,
      unit_code VARCHAR(30),
      resource_name VARCHAR(100),
      cleaning_type VARCHAR(20) DEFAULT 'STANDARD',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      cleaned_by VARCHAR(36),
      cleaned_by_name VARCHAR(255),
      notes TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_resource_cleaning_unit ON resource_cleaning_log(resource_unit_id, started_at DESC)`);

  await pool.query(`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS resource_requirements JSONB DEFAULT '[]'`);

  // Task #130: Dark mode persistence — store user theme preference
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(20) DEFAULT 'system'`);

  // Task #131: Performance - DB indexes for frequently queried tables
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bills_tenant_created ON bills(tenant_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bills_outlet_created ON bills(outlet_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_status_tenant ON orders(tenant_id, status, created_at DESC)`);

  // Task #129: Trial warning email sent flags (idempotent delivery)
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_warning_sent_7d BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_warning_sent_3d BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_warning_sent_1d BOOLEAN DEFAULT false`);

  // Task #128: Password reset tokens table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prt_expires ON password_reset_tokens(expires_at)`);

  // Task #128: Active session management columns
  await pool.query(`ALTER TABLE session ADD COLUMN IF NOT EXISTS user_id VARCHAR`);
  await pool.query(`ALTER TABLE session ADD COLUMN IF NOT EXISTS ip_address TEXT`);
  await pool.query(`ALTER TABLE session ADD COLUMN IF NOT EXISTS user_agent TEXT`);
  await pool.query(`ALTER TABLE session ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ DEFAULT now()`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_session_user ON session(user_id) WHERE user_id IS NOT NULL`);

  // Expand alert_code columns to accommodate longer alert codes (e.g. PARKING_RETRIEVAL_REQUESTED)
  await pool.query(`ALTER TABLE alert_definitions ALTER COLUMN alert_code TYPE VARCHAR(50)`);
  await pool.query(`ALTER TABLE alert_outlet_configs ALTER COLUMN alert_code TYPE VARCHAR(50)`);
  await pool.query(`ALTER TABLE alert_events ALTER COLUMN alert_code TYPE VARCHAR(50)`);

  // Task #135: Parking Management System
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parking_layout_config (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      total_capacity INTEGER NOT NULL DEFAULT 0,
      available_slots INTEGER NOT NULL DEFAULT 0,
      valet_enabled BOOLEAN NOT NULL DEFAULT true,
      free_minutes INTEGER NOT NULL DEFAULT 0,
      validation_enabled BOOLEAN NOT NULL DEFAULT false,
      validation_min_spend NUMERIC(12,2) DEFAULT 0,
      display_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_parking_config_outlet ON parking_layout_config(tenant_id, outlet_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_parking_config_tenant ON parking_layout_config(tenant_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS parking_zones (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      name TEXT NOT NULL,
      level TEXT,
      color TEXT DEFAULT '#3B82F6',
      total_slots INTEGER NOT NULL DEFAULT 0,
      available_slots INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_parking_zones_tenant ON parking_zones(tenant_id, outlet_id)`);
  await pool.query(`ALTER TABLE parking_zones ADD COLUMN IF NOT EXISTS description TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS parking_slots (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      zone_id VARCHAR(36),
      slot_code VARCHAR(30) NOT NULL,
      slot_type VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
      status VARCHAR(20) NOT NULL DEFAULT 'available',
      is_active BOOLEAN NOT NULL DEFAULT true,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_parking_slots_tenant ON parking_slots(tenant_id, outlet_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_parking_slots_zone ON parking_slots(zone_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_parking_slots_status ON parking_slots(tenant_id, status)`);
  await pool.query(`ALTER TABLE parking_slots ADD COLUMN IF NOT EXISTS pos_x INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE parking_slots ADD COLUMN IF NOT EXISTS pos_y INTEGER DEFAULT 0`);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE parking_slots ADD CONSTRAINT fk_parking_slots_zone
        FOREIGN KEY (zone_id) REFERENCES parking_zones(id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS parking_rates (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      vehicle_type VARCHAR(30) NOT NULL DEFAULT 'CAR',
      rate_type VARCHAR(20) NOT NULL DEFAULT 'HOURLY',
      rate_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      daily_max_charge NUMERIC(12,2),
      tax_rate NUMERIC(5,2) DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_parking_rates_tenant ON parking_rates(tenant_id, outlet_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS parking_rate_slabs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      rate_id VARCHAR(36) NOT NULL,
      from_minutes INTEGER NOT NULL,
      to_minutes INTEGER,
      charge NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_parking_rate_slabs_rate ON parking_rate_slabs(rate_id)`);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE parking_rate_slabs ADD CONSTRAINT fk_parking_rate_slabs_rate
        FOREIGN KEY (rate_id) REFERENCES parking_rates(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS valet_staff (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36),
      name TEXT NOT NULL,
      phone TEXT,
      badge_number VARCHAR(30),
      is_on_duty BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_staff_tenant ON valet_staff(tenant_id, outlet_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS valet_tickets (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      ticket_number TEXT NOT NULL,
      slot_id VARCHAR(36),
      zone_id VARCHAR(36),
      bill_id VARCHAR(36),
      valet_staff_id VARCHAR(36),
      vehicle_number TEXT,
      vehicle_type VARCHAR(30) NOT NULL DEFAULT 'CAR',
      vehicle_make TEXT,
      vehicle_color TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'parked',
      entry_time TIMESTAMPTZ NOT NULL DEFAULT now(),
      exit_time TIMESTAMPTZ,
      duration_minutes INTEGER,
      charge_added_to_bill BOOLEAN NOT NULL DEFAULT false,
      events JSONB NOT NULL DEFAULT '[]',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_tickets_tenant ON valet_tickets(tenant_id, outlet_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_tickets_status ON valet_tickets(tenant_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_tickets_bill ON valet_tickets(bill_id)`);
  // Drop old tenant-only unique index if it exists, then recreate outlet-scoped
  await pool.query(`DROP INDEX IF EXISTS idx_valet_tickets_number`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_valet_tickets_number ON valet_tickets(tenant_id, outlet_id, ticket_number)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS valet_ticket_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      ticket_id VARCHAR(36) NOT NULL,
      event_type TEXT NOT NULL,
      performed_by VARCHAR(36),
      performed_by_name TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_events_ticket ON valet_ticket_events(ticket_id)`);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE valet_ticket_events ADD CONSTRAINT fk_valet_events_ticket
        FOREIGN KEY (ticket_id) REFERENCES valet_tickets(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS valet_retrieval_requests (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      ticket_id VARCHAR(36) NOT NULL,
      source VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
      requested_by VARCHAR(36),
      requested_by_name TEXT,
      assigned_valet_id VARCHAR(36),
      assigned_valet_name TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      notes TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_retrieval_tenant ON valet_retrieval_requests(tenant_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_retrieval_ticket ON valet_retrieval_requests(ticket_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bill_parking_charges (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36),
      bill_id VARCHAR(36) NOT NULL,
      ticket_id VARCHAR(36) NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      free_minutes_applied INTEGER NOT NULL DEFAULT 0,
      gross_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
      validation_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
      final_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
      tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
      vehicle_type VARCHAR(30),
      rate_type VARCHAR(20),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bill_parking_charges_bill ON bill_parking_charges(bill_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bill_parking_charges_tenant ON bill_parking_charges(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bill_parking_charges_ticket ON bill_parking_charges(ticket_id)`);

  // Task #137: Add missing prep_time_minutes column to menu_items
  await pool.query(`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS prep_time_minutes integer`);

  // Task #144: Advertisement Display & Additional Income System (Enterprise only)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ad_campaigns (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36),
      campaign_name VARCHAR(255) NOT NULL,
      campaign_type VARCHAR(20) NOT NULL DEFAULT 'OWN',
      advertiser_name VARCHAR(255),
      advertiser_contact VARCHAR(255),
      advertiser_phone VARCHAR(30),
      advertiser_email VARCHAR(255),
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      active_hours_start TIME DEFAULT '00:00',
      active_hours_end TIME DEFAULT '23:59',
      active_days JSONB DEFAULT '[1,2,3,4,5,6,7]',
      display_locations JSONB NOT NULL DEFAULT '["KIOSK"]',
      display_duration_sec INT DEFAULT 10,
      display_priority INT DEFAULT 5,
      revenue_model VARCHAR(20),
      rate_per_day DECIMAL(10,2),
      rate_per_1000_imp DECIMAL(10,2),
      total_contract_value DECIMAL(12,2),
      amount_paid DECIMAL(12,2) DEFAULT 0,
      balance_due DECIMAL(12,2) DEFAULT 0,
      submitted_for_approval_at TIMESTAMP,
      approved_by VARCHAR(36),
      approved_at TIMESTAMP,
      rejection_reason TEXT,
      total_impressions INT DEFAULT 0,
      total_clicks INT DEFAULT 0,
      created_by VARCHAR(36) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ad_campaigns_tenant ON ad_campaigns (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns (tenant_id, status)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ad_creatives (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id VARCHAR(36) NOT NULL,
      campaign_id VARCHAR(36) NOT NULL,
      creative_name VARCHAR(255),
      file_type VARCHAR(20) NOT NULL,
      file_url TEXT NOT NULL,
      file_name VARCHAR(255),
      file_size_bytes BIGINT NOT NULL,
      file_size_display VARCHAR(20),
      mime_type VARCHAR(50),
      dimensions VARCHAR(30),
      duration_seconds INT,
      display_order INT DEFAULT 1,
      is_active BOOLEAN DEFAULT true,
      passed_content_check BOOLEAN DEFAULT false,
      content_check_notes TEXT,
      uploaded_by VARCHAR(36),
      uploaded_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign ON ad_creatives (campaign_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ad_creatives_tenant ON ad_creatives (tenant_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ad_impressions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36),
      campaign_id VARCHAR(36) NOT NULL,
      creative_id VARCHAR(36) NOT NULL,
      display_location VARCHAR(30),
      displayed_at TIMESTAMP DEFAULT NOW(),
      duration_shown_sec INT,
      device_id VARCHAR(100),
      session_id VARCHAR(100)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ad_impressions_campaign ON ad_impressions (campaign_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ad_impressions_tenant ON ad_impressions (tenant_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ad_revenue_records (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id VARCHAR(36) NOT NULL,
      campaign_id VARCHAR(36) NOT NULL,
      advertiser_name VARCHAR(255),
      revenue_period VARCHAR(20),
      period_start DATE,
      period_end DATE,
      impressions INT DEFAULT 0,
      amount_earned DECIMAL(10,2),
      payment_status VARCHAR(20) DEFAULT 'pending',
      invoice_number VARCHAR(50),
      paid_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ad_revenue_tenant ON ad_revenue_records (tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ad_revenue_campaign ON ad_revenue_records (campaign_id)`);

  // BUG-01/02/03: Seed demo tables for the seed/demo tenant if it has no tables yet.
  // Only targets the first non-platform tenant (the demo seed tenant), never real-tenant data.
  const seedTenantRes = await pool.query(`
    SELECT t.id AS tenant_id, o.id AS outlet_id
    FROM tenants t
    JOIN outlets o ON o.tenant_id = t.id
    WHERE t.slug != 'platform'
      AND NOT EXISTS (SELECT 1 FROM tables tb WHERE tb.tenant_id = t.id)
    ORDER BY t.created_at ASC NULLS LAST
    LIMIT 1
  `);
  if (seedTenantRes.rows.length > 0) {
    const { tenant_id, outlet_id } = seedTenantRes.rows[0];
    const demoTables = [
      { number: 1, capacity: 2, zone: "Main", status: "free", shape: "square", posX: 40, posY: 40 },
      { number: 2, capacity: 4, zone: "Main", status: "free", shape: "square", posX: 180, posY: 40 },
      { number: 3, capacity: 4, zone: "Main", status: "free", shape: "square", posX: 320, posY: 40 },
      { number: 4, capacity: 6, zone: "Main", status: "free", shape: "rectangle", posX: 460, posY: 40 },
      { number: 5, capacity: 2, zone: "Outdoor", status: "free", shape: "circle", posX: 40, posY: 180 },
      { number: 6, capacity: 4, zone: "Outdoor", status: "free", shape: "square", posX: 180, posY: 180 },
    ];
    for (const dt of demoTables) {
      await pool.query(
        `INSERT INTO tables (id, tenant_id, outlet_id, number, capacity, zone, status, shape, pos_x, pos_y)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING`,
        [tenant_id, outlet_id, dt.number, dt.capacity, dt.zone, dt.status, dt.shape, dt.posX, dt.posY]
      );
    }
  }

  // Task #151: Seed delivery agent accounts (idempotent — skip if usernames already exist)
  const deliveryAgents = [
    { username: "delivery1", name: "Carlos Mendez", email: "carlos@grandkitchen.com" },
    { username: "delivery2", name: "Jamie Park", email: "jamie@grandkitchen.com" },
    { username: "delivery3", name: "Priya Sharma", email: "priya@grandkitchen.com" },
  ];
  const tenantRow = await pool.query(
    `SELECT id FROM tenants WHERE slug != 'platform' ORDER BY created_at ASC LIMIT 1`
  );
  if (tenantRow.rows.length > 0) {
    const tenantId = tenantRow.rows[0].id;
    const pw = await hashPassword("demo123");
    for (const agent of deliveryAgents) {
      const exists = await pool.query(
        `SELECT 1 FROM users WHERE username = $1`,
        [agent.username]
      );
      if (exists.rows.length === 0) {
        await pool.query(
          `INSERT INTO users (id, tenant_id, username, password, name, email, role, active)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'delivery_agent', true)`,
          [tenantId, agent.username, pw, agent.name, agent.email]
        );
      }
    }
  }

  // Task #151 / BUG-11: Fix Charlotte (username: cleaning) — ensure cleaning_staff role
  await pool.query(`
    UPDATE users SET role = 'cleaning_staff'
    WHERE username = 'cleaning' AND role != 'cleaning_staff'
  `);

  // Task #163 / BUG-014: Re-run Charlotte role fix to ensure it is applied
  await pool.query(`
    UPDATE users SET role = 'cleaning_staff'
    WHERE username = 'cleaning'
  `);

  // Task #163 / BUG-013: Clean up test zones (DupTestZone, UniqueTestZone) from demo tenant
  await pool.query(`
    DELETE FROM table_zones
    WHERE name ~* '(test|dup|unique)'
    AND tenant_id IN (SELECT id FROM tenants WHERE name ILIKE '%demo%' OR slug ILIKE '%demo%')
  `);
  // Also remove exact test zone names scoped to demo tenants (catches single-tenant demo setups)
  await pool.query(`
    DELETE FROM table_zones
    WHERE name IN ('DupTestZone', 'UniqueTestZone')
    AND tenant_id IN (SELECT id FROM tenants WHERE name ILIKE '%demo%' OR slug ILIKE '%demo%')
  `);

  // Task #163 / BUG-011: Fix Combo Meal Deal promotion description to accurately reflect auto-apply behavior
  await pool.query(`
    UPDATE promotion_rules
    SET description = 'Auto-applied at POS when conditions are met. Customers receive a combo discount when ordering qualifying items together.'
    WHERE name ILIKE '%Combo Meal Deal%'
    AND (description ILIKE '%Not applicable at POS%' OR description ILIKE '%manual application only%')
  `);

  // Task #164: CRM sync — customer_id FK on valet_tickets + parking stats on customers
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS vehicle_plates TEXT[] DEFAULT ARRAY[]::TEXT[]`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS parking_visit_count INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS parking_total_spent DECIMAL(10,2) DEFAULT 0`);

  // Task #165: Condition report on valet_tickets + scheduled retrieval on valet_retrieval_requests
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS condition_report JSONB`);
  await pool.query(`ALTER TABLE valet_retrieval_requests ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP`);


  // Task #168: Impersonation Trust & Transparency — impersonation sessions audit table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS impersonation_sessions (
      id                      VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id               VARCHAR(36) NOT NULL,
      super_admin_id          VARCHAR(36) NOT NULL,
      super_admin_name        VARCHAR(255) NOT NULL,
      impersonated_user_id    VARCHAR(36) NOT NULL,
      impersonated_user_name  VARCHAR(255) NOT NULL,
      impersonated_user_role  VARCHAR(50),
      access_mode             VARCHAR(20) DEFAULT 'READ_ONLY',
      status                  VARCHAR(20) DEFAULT 'active',
      access_reason           TEXT NOT NULL,
      support_ticket_id       VARCHAR(100),
      started_at              TIMESTAMP NOT NULL DEFAULT NOW(),
      ended_at                TIMESTAMP,
      duration_minutes        INT,
      last_activity_at        TIMESTAMP,
      session_timeout_minutes INT DEFAULT 30,
      ip_address              VARCHAR(50),
      edit_unlocked           BOOLEAN DEFAULT false,
      edit_unlocked_at        TIMESTAMP,
      edit_unlock_reason      TEXT,
      pages_visited           JSONB DEFAULT '[]',
      changes_made            BOOLEAN DEFAULT false,
      created_at              TIMESTAMP DEFAULT NOW()
    )
  `);

  // Task #168 follow-up: add auto_expired tracking column (safe if already exists)
  await pool.query(`ALTER TABLE impersonation_sessions ADD COLUMN IF NOT EXISTS auto_expired BOOLEAN DEFAULT false`);

  // Task #168: Tenant access preferences table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_access_preferences (
      id                   VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id            VARCHAR(36) NOT NULL UNIQUE,
      show_access_log      BOOLEAN DEFAULT true,
      notify_on_access     BOOLEAN DEFAULT false,
      notify_email         VARCHAR(255),
      allow_edit_mode      BOOLEAN DEFAULT true,
      created_at           TIMESTAMP DEFAULT NOW(),
      updated_at           TIMESTAMP DEFAULT NOW()
    )
  `);

  // Task #169: Compliance Foundations
  // 1. Breach incidents (GDPR Article 33 — 72hr notification requirement)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS breach_incidents (
      id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       VARCHAR(36),
      title           TEXT NOT NULL,
      description     TEXT NOT NULL,
      severity        VARCHAR(20) NOT NULL DEFAULT 'medium',
      status          VARCHAR(30) NOT NULL DEFAULT 'detected',
      detected_at     TIMESTAMP NOT NULL DEFAULT NOW(),
      contained_at    TIMESTAMP,
      notified_at     TIMESTAMP,
      resolved_at     TIMESTAMP,
      affected_records INTEGER DEFAULT 0,
      affected_data_types TEXT[],
      root_cause      TEXT,
      remediation     TEXT,
      reported_by_id  VARCHAR(36),
      reported_by_name TEXT,
      notification_deadline TIMESTAMP,
      tenant_notified BOOLEAN DEFAULT false,
      authority_notified BOOLEAN DEFAULT false,
      created_at      TIMESTAMP DEFAULT NOW(),
      updated_at      TIMESTAMP DEFAULT NOW()
    )
  `);

  // 2. Consent log (GDPR Article 7)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS consent_log (
      id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         VARCHAR(36) NOT NULL,
      tenant_id       VARCHAR(36) NOT NULL,
      document_type   VARCHAR(30) NOT NULL,
      document_version VARCHAR(20) NOT NULL,
      accepted_at     TIMESTAMP NOT NULL DEFAULT NOW(),
      ip_address      VARCHAR(50),
      user_agent      VARCHAR(500)
    )
  `);

  // 3. System health log (SOC 2 Availability)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_health_log (
      id              SERIAL PRIMARY KEY,
      checked_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      status          VARCHAR(20) NOT NULL,
      db_response_ms  INTEGER,
      process_uptime_seconds INTEGER,
      memory_used_mb  INTEGER,
      active_sessions INTEGER DEFAULT 0
    )
  `);

  // 4. Platform settings additions (ToS and Privacy Policy versioning)
  await pool.query(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS tos_version VARCHAR(20) DEFAULT '2026-01'`);
  await pool.query(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(20) DEFAULT '2026-01'`);
  await pool.query(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS tos_url TEXT DEFAULT '/legal/terms'`);
  await pool.query(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS privacy_url TEXT DEFAULT '/legal/privacy'`);

  // Task #170: Compliance Phase 2

  // 1.1 CERT-In columns on breach_incidents
  await pool.query(`ALTER TABLE breach_incidents ADD COLUMN IF NOT EXISTS certin_notified BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE breach_incidents ADD COLUMN IF NOT EXISTS certin_notified_at TIMESTAMP`);
  await pool.query(`ALTER TABLE breach_incidents ADD COLUMN IF NOT EXISTS certin_reference_no VARCHAR(100)`);
  await pool.query(`ALTER TABLE breach_incidents ADD COLUMN IF NOT EXISTS requires_dpa_notification BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE breach_incidents ADD COLUMN IF NOT EXISTS notification_rationale TEXT`);

  // 1.2 Performance indexes
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_breach_tenant_status ON breach_incidents(tenant_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_consent_log_user_doc ON consent_log(user_id, document_type)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_health_log_checked_at ON system_health_log(checked_at DESC)`);

  // 1.3 PCI DSS SAQ completion log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pci_saq_log (
      id                  VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      completed_by_id     VARCHAR(36) NOT NULL,
      completed_by_name   TEXT NOT NULL,
      saq_type            VARCHAR(20) NOT NULL DEFAULT 'SAQ-A',
      completion_date     DATE NOT NULL,
      valid_until         DATE NOT NULL,
      scope_description   TEXT,
      qsa_name            TEXT,
      payment_gateways    TEXT[],
      notes               TEXT,
      document_reference  TEXT,
      created_at          TIMESTAMP DEFAULT NOW()
    )
  `);

  // 1.4 Vendor risk assessment
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_risk_assessments (
      id                  VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_name         TEXT NOT NULL UNIQUE,
      vendor_category     VARCHAR(50) NOT NULL,
      website             TEXT,
      service_description TEXT,
      data_processed      TEXT[],
      risk_level          VARCHAR(20) NOT NULL DEFAULT 'medium',
      compliance_certs    TEXT[],
      dpa_in_place        BOOLEAN DEFAULT false,
      dpa_signed_date     DATE,
      last_reviewed_at    DATE,
      next_review_due     DATE,
      notes               TEXT,
      is_active           BOOLEAN DEFAULT true,
      created_by_id       VARCHAR(36),
      created_by_name     TEXT,
      created_at          TIMESTAMP DEFAULT NOW(),
      updated_at          TIMESTAMP DEFAULT NOW()
    )
  `);

  // Add unique constraint to existing table if not present (idempotent)
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vendor_risk_assessments_vendor_name_key' AND conrelid = 'vendor_risk_assessments'::regclass
      ) THEN
        ALTER TABLE vendor_risk_assessments ADD CONSTRAINT vendor_risk_assessments_vendor_name_key UNIQUE (vendor_name);
      END IF;
    END $$;
  `).catch(() => {});

  // Seed vendor risk assessments (idempotent — ON CONFLICT (vendor_name) DO NOTHING)
  await pool.query(`
    INSERT INTO vendor_risk_assessments (vendor_name, vendor_category, website, service_description,
      data_processed, risk_level, compliance_certs, dpa_in_place, is_active, created_by_name)
    VALUES
      ('Stripe', 'payment_processor', 'stripe.com',
       'Subscription billing and payment processing for platform tenants',
       ARRAY['tenant billing email', 'subscription amounts'],
       'high', ARRAY['PCI DSS Level 1', 'SOC 2 Type 2', 'ISO 27001'], true, true, 'System'),

      ('Razorpay', 'payment_processor', 'razorpay.com',
       'Restaurant customer payment processing (hosted payment links)',
       ARRAY['customer payment amounts', 'order references'],
       'high', ARRAY['PCI DSS Level 1', 'RBI Licensed PA'], true, true, 'System'),

      ('Replit / AWS', 'hosting', 'replit.com',
       'Application hosting and managed PostgreSQL database',
       ARRAY['all tenant data', 'all customer data'],
       'critical', ARRAY['SOC 2 Type 2'], false, true, 'System')

    ON CONFLICT (vendor_name) DO NOTHING
  `);

  // 1.5 Incident response playbook
  await pool.query(`
    CREATE TABLE IF NOT EXISTS incident_response_playbook (
      id                  VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      step_number         INTEGER NOT NULL UNIQUE,
      step_title          TEXT NOT NULL,
      step_description    TEXT NOT NULL,
      responsible_role    TEXT,
      time_target         TEXT,
      checklist           JSONB DEFAULT '[]',
      notes               TEXT,
      last_tested_at      DATE,
      created_at          TIMESTAMP DEFAULT NOW(),
      updated_at          TIMESTAMP DEFAULT NOW()
    )
  `);

  // Add unique constraint on step_number to existing table if not present (idempotent)
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'incident_response_playbook_step_number_key' AND conrelid = 'incident_response_playbook'::regclass
      ) THEN
        ALTER TABLE incident_response_playbook ADD CONSTRAINT incident_response_playbook_step_number_key UNIQUE (step_number);
      END IF;
    END $$;
  `).catch(() => {});

  // Seed playbook steps (idempotent — ON CONFLICT (step_number) DO NOTHING)
  await pool.query(`
    INSERT INTO incident_response_playbook
      (step_number, step_title, step_description, responsible_role, time_target, checklist)
    VALUES
      (1, 'Detection & Initial Assessment',
       'Identify that a potential incident has occurred. Classify severity.',
       'On-call Engineer / Support Lead',
       'Immediately (T+0)',
       '["Confirm incident is real (not false alarm)", "Classify severity: low/medium/high/critical", "Open a breach_incident record in the platform", "Notify CTO/Security Lead immediately"]'::jsonb),

      (2, 'Containment',
       'Stop the breach from spreading. Preserve evidence.',
       'CTO / Lead Engineer',
       'Within 1 hour',
       '["Isolate affected systems or accounts", "Revoke compromised credentials", "Preserve logs — do NOT delete anything", "Update incident status to investigating"]'::jsonb),

      (3, 'CERT-In Notification (India)',
       'Notify India CERT-In within 6 hours of detection.',
       'CTO / Legal',
       'Within 6 hours (CERT-In legal requirement)',
       '["File report at https://www.cert-in.org.in", "Include: incident type, affected systems, timeline", "Record CERT-In reference number in breach record", "Mark certin_notified = true in platform"]'::jsonb),

      (4, 'Tenant Notification (GDPR)',
       'Notify affected tenants within 72 hours of detection.',
       'Support Lead / CTO',
       'Within 72 hours (GDPR Article 33)',
       '["Draft notification email to affected tenant owners", "Include: what happened, what data, what we are doing", "Send via registered email + in-app security alert", "Mark tenant_notified = true in breach record", "Update incident status to notified"]'::jsonb),

      (5, 'Eradication & Recovery',
       'Remove the cause of the breach and restore normal operations.',
       'Lead Engineer',
       'Within 24 hours of containment',
       '["Remove malicious code or unauthorized access", "Apply security patches", "Reset all potentially compromised credentials", "Restore from backup if needed", "Update incident status to contained"]'::jsonb),

      (6, 'Post-Incident Review',
       'Learn from the incident to prevent recurrence.',
       'CTO + Full team',
       'Within 7 days of resolution',
       '["Root cause analysis (5 whys)", "Document remediation steps taken", "Update security policies if needed", "Add learnings to this playbook", "Update incident status to resolved"]'::jsonb)

    ON CONFLICT (step_number) DO NOTHING
  `);

  // 1.5b Jurisdiction & legal fields on outlets
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS jurisdiction_code VARCHAR(10)`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS tax_registration_number VARCHAR(100)`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS outlet_tax_rate DECIMAL(5,2)`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS trade_license_number VARCHAR(100)`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS trade_license_authority VARCHAR(100)`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS trade_license_expiry DATE`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS company_registration_no VARCHAR(100)`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS grievance_officer_name VARCHAR(200)`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS grievance_officer_email VARCHAR(200)`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS regulatory_footer_text TEXT`);
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS invoice_additional_info TEXT`);
  await pool.query(`
    UPDATE outlets
    SET jurisdiction_code = currency_code
    WHERE jurisdiction_code IS NULL AND currency_code IS NOT NULL
  `);

  // 1.6b GDPR Art. 18 — Right to Restriction of Processing columns on users
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS processing_restricted BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS restriction_requested_at TIMESTAMP`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS restriction_reason TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS restriction_lifted_at TIMESTAMP`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS restriction_lifted_by_id VARCHAR(36)`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_processing_restricted
      ON users(tenant_id, processing_restricted)
      WHERE processing_restricted = true
  `);

  // 1.6 Cookie consent records
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cookie_consent_log (
      id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         VARCHAR(36),
      tenant_id       VARCHAR(36),
      session_id      VARCHAR(255),
      analytics       BOOLEAN DEFAULT false,
      marketing       BOOLEAN DEFAULT false,
      necessary       BOOLEAN DEFAULT true,
      accepted_at     TIMESTAMP NOT NULL DEFAULT NOW(),
      ip_address      VARCHAR(50),
      user_agent      VARCHAR(500)
    )
  `);

  // Task #179: Valet Parking Phase 1 — Shifts, Key Management, Priority Queue, VIP, Overnight, Tips

  // New table: valet_shifts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS valet_shifts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
      shift_type VARCHAR(20) NOT NULL DEFAULT 'EVENING',
      head_valet_id VARCHAR(36),
      head_valet_name TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      vehicle_count INTEGER NOT NULL DEFAULT 0,
      total_tips NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_fees NUMERIC(12,2) NOT NULL DEFAULT 0,
      incidents INTEGER NOT NULL DEFAULT 0,
      opening_notes TEXT,
      closing_notes TEXT,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      closed_at TIMESTAMPTZ,
      created_by VARCHAR(36),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_shifts_tenant ON valet_shifts(tenant_id, outlet_id, shift_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_shifts_status ON valet_shifts(tenant_id, status)`);

  // New table: valet_staff_assignments (shift-to-staff mapping)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS valet_staff_assignments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      shift_id VARCHAR(36) NOT NULL,
      staff_id VARCHAR(36) NOT NULL,
      staff_name TEXT,
      role VARCHAR(30) NOT NULL DEFAULT 'VALET',
      zone VARCHAR(100),
      clock_in TIMESTAMPTZ,
      clock_out TIMESTAMPTZ,
      vehicles_handled INTEGER NOT NULL DEFAULT 0,
      tips_collected NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_staff_assignments_shift ON valet_staff_assignments(shift_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_staff_assignments_staff ON valet_staff_assignments(staff_id, tenant_id)`);

  // New table: key_storage_locations
  await pool.query(`
    CREATE TABLE IF NOT EXISTS key_storage_locations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      location_code VARCHAR(50) NOT NULL,
      location_name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 50,
      current_count INTEGER NOT NULL DEFAULT 0,
      is_secure BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_key_storage_code ON key_storage_locations(tenant_id, outlet_id, location_code)`);

  // Task #180: Valet Phase 2 — valet_incidents table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS valet_incidents (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      ticket_id VARCHAR(36),
      shift_id VARCHAR(36),
      incident_number VARCHAR(30) NOT NULL UNIQUE,
      incident_type VARCHAR(40) NOT NULL DEFAULT 'OTHER',
      severity VARCHAR(20) NOT NULL DEFAULT 'LOW',
      description TEXT NOT NULL,
      vehicle_number TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      reported_by_id VARCHAR(36),
      reported_by_name TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      resolution TEXT,
      manager_notified BOOLEAN NOT NULL DEFAULT false,
      police_report_no TEXT,
      insurance_claim_no TEXT,
      estimated_damage_cost DECIMAL(10,2),
      actual_damage_cost DECIMAL(10,2),
      resolved_by_id VARCHAR(36),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_incidents_tenant ON valet_incidents(tenant_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_incidents_outlet ON valet_incidents(outlet_id, tenant_id)`);

  // Task #180: Add overnight config to parking_layout_config
  await pool.query(`ALTER TABLE parking_layout_config ADD COLUMN IF NOT EXISTS overnight_fee DECIMAL(10,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE parking_layout_config ADD COLUMN IF NOT EXISTS overnight_cutoff_hour INTEGER DEFAULT 23`);

  // New table: key_management_log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS key_management_log (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      ticket_id VARCHAR(36),
      action VARCHAR(40) NOT NULL,
      performed_by VARCHAR(36),
      performed_by_name TEXT,
      key_location VARCHAR(100),
      incident_id VARCHAR(36),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_key_log_tenant ON key_management_log(tenant_id, outlet_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_key_log_ticket ON key_management_log(ticket_id)`);

  // Ensure key_management_log has all Phase 1 columns (idempotent ALTERs for cases where Phase 2 schema was applied first)
  await pool.query(`ALTER TABLE key_management_log ADD COLUMN IF NOT EXISTS key_location VARCHAR(100)`);
  await pool.query(`ALTER TABLE key_management_log ADD COLUMN IF NOT EXISTS performed_by VARCHAR(36)`);
  await pool.query(`ALTER TABLE key_management_log ADD COLUMN IF NOT EXISTS incident_id VARCHAR(36)`);

  // Extend valet_tickets with new columns
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS shift_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS vip_notes TEXT`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS is_overnight BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(12,2)`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS key_tag_number VARCHAR(50)`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS key_type VARCHAR(20)`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS key_location VARCHAR(100)`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS slot_code VARCHAR(50)`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS zone_name TEXT`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS table_number TEXT`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS parked_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS parked_by_name TEXT`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS retrieved_by_name TEXT`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS charge_amount NUMERIC(10,2)`);
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS final_charge DECIMAL(10,2) DEFAULT 0`);

  // Extend valet_retrieval_requests with priority + queue fields
  await pool.query(`ALTER TABLE valet_retrieval_requests ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'NORMAL'`);
  await pool.query(`ALTER TABLE valet_retrieval_requests ADD COLUMN IF NOT EXISTS queue_position INTEGER`);
  await pool.query(`ALTER TABLE valet_retrieval_requests ADD COLUMN IF NOT EXISTS request_source VARCHAR(30)`);
  await pool.query(`ALTER TABLE valet_retrieval_requests ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ`);

  // Task #179: Demo seed — valet parking data for the first non-platform tenant
  // Guarded: skip if valet_staff already seeded for this outlet (idempotent)
  {
    const demoTenantRow = await pool.query(
      `SELECT t.id AS tenant_id, o.id AS outlet_id
       FROM tenants t JOIN outlets o ON o.tenant_id = t.id
       WHERE t.slug != 'platform'
       ORDER BY t.created_at ASC NULLS LAST LIMIT 1`
    );
    if (demoTenantRow.rows.length > 0) {
      const { tenant_id, outlet_id } = demoTenantRow.rows[0];

      // Check if already seeded
      const alreadySeeded = await pool.query(
        `SELECT 1 FROM valet_staff WHERE tenant_id=$1 AND outlet_id=$2 AND badge_number IN ('VAL-001','VAL-002') LIMIT 1`,
        [tenant_id, outlet_id]
      );

      if (alreadySeeded.rows.length === 0) {
        // parking_layout_config
        await pool.query(`
          INSERT INTO parking_layout_config (id, tenant_id, outlet_id, valet_enabled, total_capacity, available_slots, free_minutes, display_message, updated_at)
          VALUES (gen_random_uuid(), $1, $2, true, 40, 30, 15, '10 spots available', now())
          ON CONFLICT (tenant_id, outlet_id) DO UPDATE SET valet_enabled=true, total_capacity=40, free_minutes=15
        `, [tenant_id, outlet_id]);

        // 2 zones
        const gfZoneId = `seed-pz-gf-${outlet_id.slice(0,8)}`;
        const bsZoneId = `seed-pz-bs-${outlet_id.slice(0,8)}`;
        await pool.query(`
          INSERT INTO parking_zones (id, tenant_id, outlet_id, name, description, total_slots, available_slots, color, is_active)
          VALUES ($1, $2, $3, 'Ground Floor', 'Main ground floor parking area', 6, 4, '#3b82f6', true)
          ON CONFLICT DO NOTHING
        `, [gfZoneId, tenant_id, outlet_id]);
        await pool.query(`
          INSERT INTO parking_zones (id, tenant_id, outlet_id, name, description, total_slots, available_slots, color, is_active)
          VALUES ($1, $2, $3, 'Basement', 'Underground parking level B1', 4, 2, '#8b5cf6', true)
          ON CONFLICT DO NOTHING
        `, [bsZoneId, tenant_id, outlet_id]);

        // 10 slots (mix of available/occupied)
        const slotsData = [
          { id: `seed-ps-a01-${outlet_id.slice(0,8)}`, code: 'A-01', zoneId: gfZoneId, type: 'STANDARD', status: 'occupied', x: 1, y: 1 },
          { id: `seed-ps-a02-${outlet_id.slice(0,8)}`, code: 'A-02', zoneId: gfZoneId, type: 'STANDARD', status: 'available', x: 2, y: 1 },
          { id: `seed-ps-a03-${outlet_id.slice(0,8)}`, code: 'A-03', zoneId: gfZoneId, type: 'LARGE', status: 'available', x: 3, y: 1 },
          { id: `seed-ps-a04-${outlet_id.slice(0,8)}`, code: 'A-04', zoneId: gfZoneId, type: 'STANDARD', status: 'available', x: 1, y: 2 },
          { id: `seed-ps-a05-${outlet_id.slice(0,8)}`, code: 'A-05', zoneId: gfZoneId, type: 'COMPACT', status: 'available', x: 2, y: 2 },
          { id: `seed-ps-a06-${outlet_id.slice(0,8)}`, code: 'A-06', zoneId: gfZoneId, type: 'STANDARD', status: 'available', x: 3, y: 2 },
          { id: `seed-ps-b01-${outlet_id.slice(0,8)}`, code: 'B-01', zoneId: bsZoneId, type: 'STANDARD', status: 'occupied', x: 1, y: 3 },
          { id: `seed-ps-b02-${outlet_id.slice(0,8)}`, code: 'B-02', zoneId: bsZoneId, type: 'STANDARD', status: 'available', x: 2, y: 3 },
          { id: `seed-ps-b03-${outlet_id.slice(0,8)}`, code: 'B-03', zoneId: bsZoneId, type: 'COMPACT', status: 'available', x: 3, y: 3 },
          { id: `seed-ps-b04-${outlet_id.slice(0,8)}`, code: 'B-04', zoneId: bsZoneId, type: 'LARGE', status: 'available', x: 1, y: 4 },
        ];
        for (const s of slotsData) {
          await pool.query(`
            INSERT INTO parking_slots (id, tenant_id, outlet_id, zone_id, slot_code, slot_type, status, pos_x, pos_y, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
            ON CONFLICT DO NOTHING
          `, [s.id, tenant_id, outlet_id, s.zoneId, s.code, s.type, s.status, s.x, s.y]);
        }

        // 2 valet staff
        const staff1Id = `seed-vs-001-${outlet_id.slice(0,8)}`;
        const staff2Id = `seed-vs-002-${outlet_id.slice(0,8)}`;
        await pool.query(`
          INSERT INTO valet_staff (id, tenant_id, outlet_id, name, phone, badge_number, is_on_duty, is_active)
          VALUES ($1, $2, $3, 'Ravi Kumar', '+91-98765-00001', 'VAL-001', true, true)
          ON CONFLICT DO NOTHING
        `, [staff1Id, tenant_id, outlet_id]);
        await pool.query(`
          INSERT INTO valet_staff (id, tenant_id, outlet_id, name, phone, badge_number, is_on_duty, is_active)
          VALUES ($1, $2, $3, 'Priya Singh', '+91-98765-00002', 'VAL-002', true, true)
          ON CONFLICT DO NOTHING
        `, [staff2Id, tenant_id, outlet_id]);

        // 2 key storage locations
        const kslBoxA = `seed-ksl-boxa-${outlet_id.slice(0,8)}`;
        const kslDesk = `seed-ksl-desk-${outlet_id.slice(0,8)}`;
        await pool.query(`
          INSERT INTO key_storage_locations (id, tenant_id, outlet_id, location_code, location_name, capacity, current_count, is_secure)
          VALUES ($1, $2, $3, 'BOX-A', 'Key Box A (Main)', 30, 2, true)
          ON CONFLICT DO NOTHING
        `, [kslBoxA, tenant_id, outlet_id]);
        await pool.query(`
          INSERT INTO key_storage_locations (id, tenant_id, outlet_id, location_code, location_name, capacity, current_count, is_secure)
          VALUES ($1, $2, $3, 'HEAD_DESK', 'Head Valet Desk', 10, 0, false)
          ON CONFLICT DO NOTHING
        `, [kslDesk, tenant_id, outlet_id]);

        // 1 active shift (Evening, head: Ravi Kumar)
        const shiftId = `seed-shift-eve-${outlet_id.slice(0,8)}`;
        await pool.query(`
          INSERT INTO valet_shifts (id, tenant_id, outlet_id, shift_date, shift_type, head_valet_id, head_valet_name, status, vehicle_count, total_tips, opened_at)
          VALUES ($1, $2, $3, CURRENT_DATE, 'EVENING', $4, 'Ravi Kumar', 'active', 2, 0, now() - INTERVAL '2 hours')
          ON CONFLICT DO NOTHING
        `, [shiftId, tenant_id, outlet_id, staff1Id]);

        // Staff assignments for the shift
        await pool.query(`
          INSERT INTO valet_staff_assignments (id, tenant_id, shift_id, staff_id, staff_name, role, zone, clock_in, vehicles_handled, tips_collected)
          VALUES (gen_random_uuid(), $1, $2, $3, 'Ravi Kumar', 'HEAD_VALET', 'Ground Floor', now() - INTERVAL '2 hours', 1, 0)
          ON CONFLICT DO NOTHING
        `, [tenant_id, shiftId, staff1Id]);
        await pool.query(`
          INSERT INTO valet_staff_assignments (id, tenant_id, shift_id, staff_id, staff_name, role, zone, clock_in, vehicles_handled, tips_collected)
          VALUES (gen_random_uuid(), $1, $2, $3, 'Priya Singh', 'VALET', 'Basement', now() - INTERVAL '2 hours', 1, 0)
          ON CONFLICT DO NOTHING
        `, [tenant_id, shiftId, staff2Id]);

        // 2 active tickets: one VIP (A-01), one normal (B-01)
        const slot1Id = `seed-ps-a01-${outlet_id.slice(0,8)}`;
        const slot2Id = `seed-ps-b01-${outlet_id.slice(0,8)}`;
        const ticket1Id = `seed-vt-001-${outlet_id.slice(0,8)}`;
        const ticket2Id = `seed-vt-002-${outlet_id.slice(0,8)}`;
        await pool.query(`
          INSERT INTO valet_tickets (id, tenant_id, outlet_id, ticket_number, slot_id, zone_id, valet_staff_id, vehicle_number, vehicle_type, vehicle_make, vehicle_color, customer_name, customer_phone, status, entry_time, shift_id, is_vip, vip_notes, is_overnight, key_type, key_location, slot_code, zone_name, parked_by_name)
          VALUES ($1, $2, $3, 'VP-0001', $4, $5, $6, 'MH01AB1234', 'SUV', 'Mercedes', 'Black', 'Arjun Mehta', '+91-99999-00001', 'parked', now() - INTERVAL '1 hour', $7, true, 'Regular VIP guest', false, 'Physical', 'BOX-A', 'A-01', 'Ground Floor', 'Ravi Kumar')
          ON CONFLICT DO NOTHING
        `, [ticket1Id, tenant_id, outlet_id, slot1Id, gfZoneId, staff1Id, shiftId]);
        await pool.query(`
          INSERT INTO valet_tickets (id, tenant_id, outlet_id, ticket_number, slot_id, zone_id, valet_staff_id, vehicle_number, vehicle_type, vehicle_make, vehicle_color, customer_name, customer_phone, status, entry_time, shift_id, is_vip, is_overnight, key_type, key_location, slot_code, zone_name, parked_by_name)
          VALUES ($1, $2, $3, 'VP-0002', $4, $5, $6, 'DL05CD5678', 'CAR', 'Honda', 'White', 'Sunita Rao', '+91-99999-00002', 'requested', now() - INTERVAL '30 minutes', $7, false, false, 'Physical', 'BOX-A', 'B-01', 'Basement', 'Priya Singh')
          ON CONFLICT DO NOTHING
        `, [ticket2Id, tenant_id, outlet_id, slot2Id, bsZoneId, staff2Id, shiftId]);

        // 1 pending retrieval request for the normal ticket
        await pool.query(`
          INSERT INTO valet_retrieval_requests (id, tenant_id, outlet_id, ticket_id, source, requested_by_name, status, priority, queue_position)
          VALUES (gen_random_uuid(), $1, $2, $3, 'MANUAL', 'Sunita Rao', 'pending', 'NORMAL', 1)
          ON CONFLICT DO NOTHING
        `, [tenant_id, outlet_id, ticket2Id]);

        // Key log entries
        await pool.query(`
          INSERT INTO key_management_log (id, tenant_id, outlet_id, ticket_id, action, performed_by_name, key_location, notes)
          VALUES (gen_random_uuid(), $1, $2, $3, 'KEY_RECEIVED', 'Ravi Kumar', 'BOX-A', 'Key received from customer')
          ON CONFLICT DO NOTHING
        `, [tenant_id, outlet_id, ticket1Id]);
        await pool.query(`
          INSERT INTO key_management_log (id, tenant_id, outlet_id, ticket_id, action, performed_by_name, key_location, notes)
          VALUES (gen_random_uuid(), $1, $2, $3, 'KEY_RECEIVED', 'Priya Singh', 'BOX-A', 'Key received from customer')
          ON CONFLICT DO NOTHING
        `, [tenant_id, outlet_id, ticket2Id]);
      }
    }
  }

  // PR-002: Soft delete columns — add is_deleted + deleted_at to 10 tables
  const softDeleteTables = [
    "menu_items",
    "users",
    "customers",
    "suppliers",
    "inventory_items",
    "valet_tickets",
    "purchase_orders",
    "recipes",
    "promotion_rules",
    "reservations",
  ];
  for (const tbl of softDeleteTables) {
    await pool.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(36)`);
  }

  // Partial indexes for soft-deleted rows (where is_deleted = false) on each table
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_menu_items_not_deleted ON menu_items(tenant_id) WHERE is_deleted = false`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_not_deleted ON users(tenant_id) WHERE is_deleted = false`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customers_not_deleted ON customers(tenant_id) WHERE is_deleted = false`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_suppliers_not_deleted ON suppliers(tenant_id) WHERE is_deleted = false`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inventory_items_not_deleted ON inventory_items(tenant_id) WHERE is_deleted = false`);
  // valet_tickets and purchase_orders have outlet_id — use composite index
  await pool.query(`DROP INDEX IF EXISTS idx_valet_tickets_not_deleted`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_valet_tickets_not_deleted ON valet_tickets(tenant_id, outlet_id) WHERE is_deleted = false`);
  await pool.query(`DROP INDEX IF EXISTS idx_purchase_orders_not_deleted`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_purchase_orders_not_deleted ON purchase_orders(tenant_id, outlet_id) WHERE is_deleted = false`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_recipes_not_deleted ON recipes(tenant_id) WHERE is_deleted = false`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_promotion_rules_not_deleted ON promotion_rules(tenant_id) WHERE is_deleted = false`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reservations_not_deleted ON reservations(tenant_id) WHERE is_deleted = false`);

  // PR-002: Order version column for optimistic locking
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`);

  // PR-002: Nightly cleanup — hard-delete soft-deleted records older than 30 days (runs once on server start)
  for (const tbl of softDeleteTables) {
    await pool.query(`DELETE FROM ${tbl} WHERE is_deleted = true AND deleted_at < NOW() - INTERVAL '30 days'`);
  }

  // PR-007: Per-outlet IANA timezone
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'UTC'`);

  // Seed outlet timezone from tenant timezone where outlet has default 'UTC' but tenant has a real timezone
  await pool.query(`
    UPDATE outlets o
    SET timezone = t.timezone
    FROM tenants t
    WHERE o.tenant_id = t.id
      AND (o.timezone IS NULL OR o.timezone = 'UTC')
      AND t.timezone IS NOT NULL
      AND t.timezone != 'UTC'
  `);

  // PR-001: Idempotency — idempotency_key column on orders table
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100)`);
  await pool.query(`ALTER TABLE orders ALTER COLUMN idempotency_key TYPE VARCHAR(100)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`);

  // PR-001: Idempotency keys table (for KOT and other non-persistent endpoints)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key VARCHAR(100) NOT NULL,
      tenant_id VARCHAR(36) NOT NULL,
      endpoint TEXT NOT NULL,
      response_code INTEGER NOT NULL DEFAULT 200,
      response_body JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (key, tenant_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at)`);
  // Cleanup records older than 5 minutes on startup
  await pool.query(`DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '5 minutes'`);

  // PR-001: Session token for concurrent session detection
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS session_token VARCHAR(36)`);

  // PR-001: PIN login columns for staff users
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(100)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_expires_at TIMESTAMPTZ`);

  // PR-001: Gateway-down fallback — track gateway_status on bill payments
  await pool.query(`ALTER TABLE bill_payments ADD COLUMN IF NOT EXISTS gateway_status VARCHAR(30)`);

  // PR-001: Explicit FK from refund record → original payment record for per-payment cap scoping.
  // Works for all payment methods (Razorpay, cash, UPI, card, etc.).
  await pool.query(`ALTER TABLE bill_payments ADD COLUMN IF NOT EXISTS original_payment_id VARCHAR(36) REFERENCES bill_payments(id)`);

  // PR-001: Widen idempotency key columns to VARCHAR(100) for composite keys (pay-<billId>-<uuid>)
  await pool.query(`ALTER TABLE idempotency_keys ALTER COLUMN key TYPE VARCHAR(100)`);
  await pool.query(`ALTER TABLE orders ALTER COLUMN idempotency_key TYPE VARCHAR(100)`);

  // PR-005: report_cache table for background report jobs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_cache (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      report_type VARCHAR(64) NOT NULL,
      outlet_id VARCHAR(36),
      parameters JSONB NOT NULL DEFAULT '{}',
      status VARCHAR(20) NOT NULL DEFAULT 'generating',
      result JSONB,
      computed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_report_cache_tenant_type_status
    ON report_cache(tenant_id, report_type, status)
  `);

  // PR-010: audit_events_archive table — identical schema to audit_events plus archived_at
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_events_archive (
      id VARCHAR(36) PRIMARY KEY,
      tenant_id VARCHAR(36),
      user_id VARCHAR(36),
      user_name TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id VARCHAR(36),
      entity_name TEXT,
      outlet_id VARCHAR(36),
      before JSONB,
      after JSONB,
      metadata JSONB,
      ip_address TEXT,
      user_agent TEXT,
      supervisor_id VARCHAR(36),
      created_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_events_archive_tenant_created
    ON audit_events_archive (tenant_id, created_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_audit_events_archive_archived_at
    ON audit_events_archive (archived_at)
  `);

  // PR-010: auto_acknowledged column on alert_events
  await pool.query(`
    ALTER TABLE alert_events ADD COLUMN IF NOT EXISTS auto_acknowledged BOOLEAN DEFAULT false
  `);
}

export async function runTask184Migrations(): Promise<void> {
  // PR-004: idle_timeout_minutes per outlet (owner/manager can configure per-outlet idle logout)
  await pool.query(`ALTER TABLE outlets ADD COLUMN IF NOT EXISTS idle_timeout_minutes INTEGER DEFAULT 30`);

  // PR-004: Enhanced print_jobs table — add outlet_id, attempts, last_attempted_at, error_message if not exist
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS outlet_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS error_message TEXT`);
  await pool.query(`ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS printer_id VARCHAR(36)`);

  // PR-004: Index on (tenant_id, status, printer_id) for print job queue polling
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_print_jobs_tenant_status_printer ON print_jobs (tenant_id, status, printer_id)`);
}

export async function runTask191Migrations(): Promise<void> {
  // PR-011: system_events table for circuit breaker and gateway failure logging
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_events (
      id SERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON system_events (created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_system_events_event_type ON system_events (event_type)
  `);

  // PR-011: last_webhook_at and webhook_alert_threshold_minutes on order_channels
  await pool.query(`
    ALTER TABLE order_channels ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ
  `);

  await pool.query(`
    ALTER TABLE order_channels ADD COLUMN IF NOT EXISTS webhook_alert_threshold_minutes INTEGER DEFAULT 120
  `);

  // PR-012: table_qr_sessions — multi-customer table ordering sessions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS table_qr_sessions (
      id SERIAL PRIMARY KEY,
      table_id VARCHAR(36) NOT NULL REFERENCES tables(id),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36),
      session_token VARCHAR(36) NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
      order_ids TEXT[] DEFAULT '{}',
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT true
    )
  `);

  // PR-012: ensure order_ids column is TEXT[] (fix from earlier INTEGER[] migration)
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'table_qr_sessions'
          AND column_name = 'order_ids'
          AND udt_name = '_int4'
      ) THEN
        ALTER TABLE table_qr_sessions ALTER COLUMN order_ids TYPE TEXT[] USING order_ids::text[];
      END IF;
    END $$
  `).catch(() => {});

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_table_qr_sessions_table_active
    ON table_qr_sessions (table_id, is_active)
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_table_qr_sessions_active
    ON table_qr_sessions (table_id)
    WHERE is_active = true
  `);

  // PR-013: User language preference for i18n
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'en'`);

  // PR-013: Tenant default language for new staff
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_language VARCHAR(10) DEFAULT 'en'`);

  // Task #209: Add final_charge to valet_tickets as authoritative charge field for revenue queries
  await pool.query(`ALTER TABLE valet_tickets ADD COLUMN IF NOT EXISTS final_charge NUMERIC(12,2) NOT NULL DEFAULT 0`);

  // POS-1/CB-FIX: Missing orders columns that Drizzle schema defines but no ALTER TABLE migration existed.
  // Without these, INSERT INTO orders fails → 500 → circuit breaker trips OPEN.
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel TEXT`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel_order_id TEXT`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel_data JSONB`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_session_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_held BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_sent_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36)`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_reason TEXT`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS offer_id VARCHAR(36)`);
}

// P3-Deploy: valet constraint drop + super admin password repair
export async function runP3DeployMigrations(): Promise<void> {
  // 1. Drop the orphaned valet_tickets FK constraint that blocks schema sync
  await pool.query(`
    ALTER TABLE valet_tickets
    DROP CONSTRAINT IF EXISTS valet_tickets_shift_id_shifts_id_fk
  `);

  // 2. Fix super admin password — previous setup used bcrypt but app uses scrypt.
  // Hash generated with exact auth.ts logic: randomBytes(16).toString('hex') as salt, scrypt(password, salt, 64)
  // Password: SuperAdmin@2026 — verified round-trip with comparePasswords()
  const SCRYPT_HASH = "129e1de35477cd64276c89288b61dd680092f98cd5b96af7190e52272f19265bd3911a50544e196c75cc7e534081d273323d12c5a7977f2707b0890c4bd1a3cf.938b76eb77b877c2db717273887e1a26";
  await pool.query(`
    UPDATE users
    SET password = $1
    WHERE role = 'super_admin'
  `, [SCRYPT_HASH]);
}


// Chef Assignment & Counter Management migrations
export async function runChefAssignmentMigrations(): Promise<void> {
  // kitchen_counters table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kitchen_counters (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      name VARCHAR(100) NOT NULL,
      counter_code VARCHAR(20) NOT NULL,
      handles_categories JSONB DEFAULT '[]',
      max_capacity INTEGER DEFAULT 5,
      display_color VARCHAR(20) DEFAULT '#3B82F6',
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS kitchen_counters_tenant_idx ON kitchen_counters(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS kitchen_counters_outlet_idx ON kitchen_counters(outlet_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS kitchen_counters_tenant_outlet_idx ON kitchen_counters(tenant_id, outlet_id)`);

  // chef_roster table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chef_roster (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      chef_id VARCHAR(36) NOT NULL,
      chef_name VARCHAR(200),
      counter_id VARCHAR(36) NOT NULL,
      counter_name VARCHAR(100),
      shift_date DATE NOT NULL,
      shift_start TIME,
      shift_end TIME,
      shift_type VARCHAR(20) DEFAULT 'morning',
      status VARCHAR(20) DEFAULT 'scheduled',
      checked_in_at TIMESTAMPTZ,
      checked_out_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS chef_roster_tenant_idx ON chef_roster(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chef_roster_chef_idx ON chef_roster(chef_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chef_roster_counter_idx ON chef_roster(counter_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chef_roster_shift_date_idx ON chef_roster(shift_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chef_roster_tenant_outlet_date_idx ON chef_roster(tenant_id, outlet_id, shift_date)`);

  // chef_availability table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chef_availability (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      chef_id VARCHAR(36) NOT NULL,
      counter_id VARCHAR(36),
      shift_date DATE NOT NULL,
      status VARCHAR(20) DEFAULT 'available',
      active_tickets INTEGER DEFAULT 0,
      last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS chef_availability_tenant_idx ON chef_availability(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chef_availability_chef_idx ON chef_availability(chef_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chef_availability_counter_idx ON chef_availability(counter_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chef_availability_status_idx ON chef_availability(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chef_availability_tenant_outlet_idx ON chef_availability(tenant_id, outlet_id)`);

  // ticket_assignments table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_assignments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL,
      outlet_id VARCHAR(36) NOT NULL,
      ticket_id VARCHAR(36),
      order_id VARCHAR(36),
      menu_item_id VARCHAR(36),
      menu_item_name VARCHAR(200),
      counter_id VARCHAR(36),
      counter_name VARCHAR(100),
      chef_id VARCHAR(36),
      chef_name VARCHAR(200),
      assignment_type VARCHAR(20) DEFAULT 'auto',
      assignment_score INTEGER DEFAULT 0,
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      accepted_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      status VARCHAR(20) DEFAULT 'unassigned',
      reassign_reason TEXT,
      estimated_time_min INTEGER,
      actual_time_min INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_assignments_tenant_idx ON ticket_assignments(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_assignments_counter_idx ON ticket_assignments(counter_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_assignments_chef_idx ON ticket_assignments(chef_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_assignments_status_idx ON ticket_assignments(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_assignments_assigned_at_idx ON ticket_assignments(assigned_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_assignments_tenant_outlet_idx ON ticket_assignments(tenant_id, outlet_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_assignments_order_idx ON ticket_assignments(order_id)`);
}
