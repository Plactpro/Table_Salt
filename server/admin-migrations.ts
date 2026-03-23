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
}
