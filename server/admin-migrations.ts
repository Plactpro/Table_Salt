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
}
