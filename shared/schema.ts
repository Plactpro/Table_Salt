import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  decimal,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleEnum = pgEnum("user_role", [
  "owner",
  "franchise_owner",
  "hq_admin",
  "manager",
  "outlet_manager",
  "supervisor",
  "cashier",
  "waiter",
  "kitchen",
  "accountant",
  "auditor",
  "customer",
  "super_admin",
  "delivery_agent",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "new",
  "on_hold",
  "confirmed",
  "sent_to_kitchen",
  "in_progress",
  "ready",
  "served",
  "ready_to_pay",
  "paid",
  "completed",
  "cancelled",
  "voided",
  "pending_payment",
]);
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

export const orderTypeEnum = pgEnum("order_type", [
  "dine_in",
  "takeaway",
  "delivery",
]);

export const tableStatusEnum = pgEnum("table_status", [
  "free",
  "occupied",
  "reserved",
  "cleaning",
  "blocked",
]);

export const reservationStatusEnum = pgEnum("reservation_status", [
  "pending",
  "requested",
  "confirmed",
  "seated",
  "completed",
  "no_show",
]);

export const tenants = pgTable("tenants", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  address: text("address"),
  timezone: text("timezone").default("UTC"),
  timeFormat: text("time_format").default("12hr"),
  currency: text("currency").default("USD"),
  currencyPosition: text("currency_position").default("before"),
  currencyDecimals: integer("currency_decimals").default(2),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  taxType: text("tax_type").default("vat"),
  compoundTax: boolean("compound_tax").default(false),
  serviceCharge: decimal("service_charge", { precision: 5, scale: 2 }).default("0"),
  plan: text("plan").default("basic"),
  businessType: text("business_type").default("casual_dining"),
  phone: text("phone"),
  cuisineStyle: text("cuisine_style"),
  country: text("country"),
  active: boolean("active").default(true),
  moduleConfig: jsonb("module_config").default({}),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  subscriptionStatus: text("subscription_status").default("trialing"),
  wallScreenToken: text("wall_screen_token"),
  gstin: text("gstin"),
  cgstRate: decimal("cgst_rate", { precision: 5, scale: 2 }),
  sgstRate: decimal("sgst_rate", { precision: 5, scale: 2 }),
  invoicePrefix: text("invoice_prefix").default("INV"),
  invoiceCounter: integer("invoice_counter").default(0),
  razorpayEnabled: boolean("razorpay_enabled").default(false),
  razorpayKeyId: text("razorpay_key_id"),
  razorpayKeySecret: text("razorpay_key_secret"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: roleEnum("role").notNull().default("waiter"),
  active: boolean("active").default(true),
  hourlyRate: decimal("hourly_rate", { precision: 8, scale: 2 }),
  overtimeRate: decimal("overtime_rate", { precision: 8, scale: 2 }),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").default(false),
  recoveryCodes: text("recovery_codes").array(),
  passwordChangedAt: timestamp("password_changed_at"),
  passwordHistory: text("password_history").array(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_users_tenant_id").on(t.tenantId),
]);

export const regions = pgTable("regions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").default(true),
});

export const outlets = pgTable("outlets", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  regionId: varchar("region_id", { length: 36 }).references(() => regions.id),
  name: text("name").notNull(),
  address: text("address"),
  openingHours: text("opening_hours"),
  isFranchise: boolean("is_franchise").default(false),
  franchiseeName: text("franchisee_name"),
  royaltyRate: decimal("royalty_rate", { precision: 5, scale: 2 }).default("0"),
  minimumGuarantee: decimal("minimum_guarantee", { precision: 10, scale: 2 }).default("0"),
  active: boolean("active").default(true),
}, (t) => [
  index("idx_outlets_tenant_id").on(t.tenantId),
  index("idx_outlets_tenant_active").on(t.tenantId, t.active),
]);

export const menuCategories = pgTable("menu_categories", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").default(true),
}, (t) => [
  index("idx_menu_categories_tenant_id").on(t.tenantId),
]);

export const menuItems = pgTable("menu_items", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  categoryId: varchar("category_id", { length: 36 }).references(() => menuCategories.id),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  image: text("image"),
  isVeg: boolean("is_veg").default(false),
  spicyLevel: integer("spicy_level").default(0),
  available: boolean("available").default(true),
  tags: text("tags").array(),
  ingredients: jsonb("ingredients"),
  station: text("station"),
  course: text("course"),
  hsnCode: text("hsn_code"),
}, (t) => [
  index("idx_menu_items_tenant_id").on(t.tenantId),
  index("idx_menu_items_tenant_category").on(t.tenantId, t.categoryId),
]);

export const tableZones = pgTable("table_zones", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  name: text("name").notNull(),
  color: text("color").default("#6366f1"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
}, (t) => [
  index("idx_table_zones_tenant_id").on(t.tenantId),
]);

export const tables = pgTable("tables", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  number: integer("number").notNull(),
  capacity: integer("capacity").default(4),
  zone: text("zone").default("Main"),
  zoneId: varchar("zone_id", { length: 36 }).references(() => tableZones.id),
  posX: integer("pos_x").default(0),
  posY: integer("pos_y").default(0),
  shape: text("shape").default("square"),
  mergedWith: varchar("merged_with", { length: 36 }),
  seatedAt: timestamp("seated_at"),
  partyName: text("party_name"),
  partySize: integer("party_size"),
  status: tableStatusEnum("status").default("free"),
  qrToken: text("qr_token"),
  callServerFlag: boolean("call_server_flag").default(false),
  requestBillFlag: boolean("request_bill_flag").default(false),
}, (t) => [
  index("idx_tables_tenant_id").on(t.tenantId),
  index("idx_tables_tenant_status").on(t.tenantId, t.status),
  index("idx_tables_tenant_outlet").on(t.tenantId, t.outletId),
]);

export const waitlistEntries = pgTable("waitlist_entries", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  partySize: integer("party_size").notNull().default(2),
  preferredZone: text("preferred_zone"),
  status: text("status").default("waiting"),
  estimatedWaitMinutes: integer("estimated_wait_minutes"),
  notificationSent: boolean("notification_sent").default(false),
  priority: integer("priority").default(0),
  notes: text("notes"),
  seatedTableId: varchar("seated_table_id", { length: 36 }).references(() => tables.id),
  createdAt: timestamp("created_at").defaultNow(),
  seatedAt: timestamp("seated_at"),
}, (t) => [
  index("idx_waitlist_tenant_id").on(t.tenantId),
  index("idx_waitlist_tenant_status").on(t.tenantId, t.status),
  index("idx_waitlist_tenant_created").on(t.tenantId, t.createdAt),
]);

export const reservations = pgTable("reservations", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  tableId: varchar("table_id", { length: 36 }).references(() => tables.id),
  customerId: varchar("customer_id", { length: 36 }).references(() => customers.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  guests: integer("guests").default(2),
  dateTime: timestamp("date_time").notNull(),
  notes: text("notes"),
  status: reservationStatusEnum("status").default("pending"),
}, (t) => [
  index("idx_reservations_tenant_datetime").on(t.tenantId, t.dateTime),
  index("idx_reservations_tenant_status").on(t.tenantId, t.status),
]);

export const orders = pgTable("orders", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  tableId: varchar("table_id", { length: 36 }).references(() => tables.id),
  waiterId: varchar("waiter_id", { length: 36 }).references(() => users.id),
  customerId: varchar("customer_id", { length: 36 }),
  orderType: orderTypeEnum("order_type").default("dine_in"),
  status: orderStatusEnum("status").default("new"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0"),
  serviceCharge: decimal("service_charge", { precision: 10, scale: 2 }).default("0"),
  tips: decimal("tips", { precision: 10, scale: 2 }).default("0"),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0"),
  discountReason: text("discount_reason"),
  offerId: varchar("offer_id", { length: 36 }),
  channel: text("channel"),
  channelOrderId: text("channel_order_id"),
  channelData: jsonb("channel_data"),
  stripePaymentSessionId: text("stripe_payment_session_id"),
  posSessionId: varchar("pos_session_id", { length: 36 }),
  parentOrderId: varchar("parent_order_id", { length: 36 }),
  isHeld: boolean("is_held").default(false),
  kitchenSentAt: timestamp("kitchen_sent_at"),
  estimatedReadyAt: timestamp("estimated_ready_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_orders_tenant_id").on(t.tenantId),
  index("idx_orders_tenant_created").on(t.tenantId, t.createdAt),
  index("idx_orders_tenant_status").on(t.tenantId, t.status),
  index("idx_orders_tenant_table").on(t.tenantId, t.tableId),
]);

export const orderItems = pgTable("order_items", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  menuItemId: varchar("menu_item_id", { length: 36 }).references(() => menuItems.id),
  name: text("name").notNull(),
  quantity: integer("quantity").default(1),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  status: text("status").default("pending"),
  station: text("station"),
  course: text("course"),
  startedAt: timestamp("started_at"),
  readyAt: timestamp("ready_at"),
  metadata: jsonb("metadata"),
  isAddon: boolean("is_addon").default(false),
  modifiers: jsonb("modifiers"),
}, (t) => [
  index("idx_order_items_order_id").on(t.orderId),
]);

export const inventoryItems = pgTable("inventory_items", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  sku: text("sku"),
  category: text("category"),
  unit: text("unit").default("pcs"),
  baseUnit: text("base_unit"),
  conversionRatio: decimal("conversion_ratio", { precision: 10, scale: 4 }).default("1"),
  currentStock: decimal("current_stock", { precision: 10, scale: 2 }).default("0"),
  reorderLevel: decimal("reorder_level", { precision: 10, scale: 2 }).default("10"),
  parLevel: decimal("par_level", { precision: 10, scale: 2 }),
  leadTimeDays: integer("lead_time_days").default(1),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }).default("0"),
  costPerBaseUnit: decimal("cost_per_base_unit", { precision: 10, scale: 4 }),
  supplier: text("supplier"),
  purchaseUnit: text("purchase_unit"),
  purchaseUnitConversion: decimal("purchase_unit_conversion", { precision: 10, scale: 4 }),
  averageCost: decimal("average_cost", { precision: 10, scale: 4 }),
}, (t) => [
  index("idx_inventory_items_tenant_id").on(t.tenantId),
  index("idx_inventory_items_tenant_category").on(t.tenantId, t.category),
]);

export const stockMovements = pgTable("stock_movements", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  itemId: varchar("item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  type: text("type").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  orderId: text("order_id"),
  orderNumber: text("order_number"),
  menuItemId: text("menu_item_id"),
  recipeId: text("recipe_id"),
  chefId: varchar("chef_id", { length: 36 }),
  chefName: text("chef_name"),
  station: text("station"),
  shiftId: varchar("shift_id", { length: 36 }),
  stockBefore: decimal("stock_before", { precision: 10, scale: 4 }),
  stockAfter: decimal("stock_after", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_stock_movements_tenant_created").on(t.tenantId, t.createdAt),
  index("idx_stock_movements_item_id").on(t.itemId),
  index("idx_stock_movements_order_id").on(t.orderId),
]);

export const customers = pgTable("customers", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  loyaltyPoints: integer("loyalty_points").default(0),
  totalSpent: decimal("total_spent", { precision: 10, scale: 2 }).default("0"),
  loyaltyTier: text("loyalty_tier").default("bronze"),
  tags: text("tags").array(),
  averageSpend: decimal("average_spend", { precision: 10, scale: 2 }).default("0"),
  privacyConsents: jsonb("privacy_consents"),
  anonymized: boolean("anonymized").default(false),
  gstin: text("gstin"),
  visitCount: integer("visit_count").default(0),
  lastVisitAt: timestamp("last_visit_at"),
  birthday: text("birthday"),
  anniversary: text("anniversary"),
}, (t) => [
  index("idx_customers_tenant_id").on(t.tenantId),
  index("idx_customers_tenant_loyalty_tier").on(t.tenantId, t.loyaltyTier),
]);

export const staffSchedules = pgTable("staff_schedules", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  date: timestamp("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  role: text("role"),
  attendance: text("attendance").default("scheduled"),
  hourlyRate: decimal("hourly_rate", { precision: 8, scale: 2 }),
}, (t) => [
  index("idx_staff_schedules_tenant_id").on(t.tenantId),
  index("idx_staff_schedules_tenant_user").on(t.tenantId, t.userId),
]);

export const feedback = pgTable("feedback", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  orderId: varchar("order_id", { length: 36 }).references(() => orders.id),
  customerId: varchar("customer_id", { length: 36 }).references(() => customers.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_feedback_tenant_id").on(t.tenantId),
]);

export const offerTypeEnum = pgEnum("offer_type", [
  "percentage",
  "fixed_amount",
  "buy_one_get_one",
  "combo_deal",
  "free_item",
  "happy_hour",
]);

export const offerScopeEnum = pgEnum("offer_scope", [
  "all_items",
  "category",
  "specific_items",
  "order_total",
]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "assigned",
  "picked_up",
  "in_transit",
  "delivered",
  "cancelled",
  "returned",
]);

export const offers = pgTable("offers", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  description: text("description"),
  type: offerTypeEnum("type").notNull().default("percentage"),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  scope: offerScopeEnum("scope").default("all_items"),
  scopeRef: text("scope_ref"),
  minOrderAmount: decimal("min_order_amount", { precision: 10, scale: 2 }),
  maxDiscount: decimal("max_discount", { precision: 10, scale: 2 }),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  active: boolean("active").default(true),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").default(0),
  conditions: jsonb("conditions"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_offers_tenant_id").on(t.tenantId),
  index("idx_offers_tenant_active").on(t.tenantId, t.active),
]);

export const deliveryOrders = pgTable("delivery_orders", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  orderId: varchar("order_id", { length: 36 }).references(() => orders.id),
  customerId: varchar("customer_id", { length: 36 }).references(() => customers.id),
  customerAddress: text("customer_address").notNull(),
  customerPhone: text("customer_phone"),
  deliveryPartner: text("delivery_partner"),
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  status: deliveryStatusEnum("status").default("pending"),
  estimatedTime: integer("estimated_time"),
  actualTime: integer("actual_time"),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).default("0"),
  trackingNotes: text("tracking_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
}, (t) => [
  index("idx_delivery_orders_tenant_created").on(t.tenantId, t.createdAt),
  index("idx_delivery_orders_tenant_status").on(t.tenantId, t.status),
]);

export const employeePerformanceLogs = pgTable("employee_performance_logs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  metricType: text("metric_type").notNull(),
  metricValue: decimal("metric_value", { precision: 10, scale: 2 }).notNull(),
  period: text("period"),
  notes: text("notes"),
  recordedAt: timestamp("recorded_at").defaultNow(),
}, (t) => [
  index("idx_emp_perf_tenant_id").on(t.tenantId),
  index("idx_emp_perf_tenant_user").on(t.tenantId, t.userId),
]);

export const salesInquiries = pgTable("sales_inquiries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: varchar("full_name").notNull(),
  businessName: varchar("business_name").notNull(),
  businessType: varchar("business_type").notNull(),
  numOutlets: varchar("num_outlets"),
  location: varchar("location").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  preferredContact: varchar("preferred_contact").default("email"),
  heardFrom: varchar("heard_from"),
  subscriptionInterest: text("subscription_interest").array(),
  message: text("message").notNull(),
  wantsDemo: boolean("wants_demo").default(false),
  wantsUpdates: boolean("wants_updates").default(false),
  userAgent: text("user_agent"),
  sourcePage: varchar("source_page"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertOutletSchema = createInsertSchema(outlets).omit({ id: true });
export const insertMenuCategorySchema = createInsertSchema(menuCategories).omit({ id: true });
export const insertMenuItemSchema = createInsertSchema(menuItems).omit({ id: true });
export const insertTableZoneSchema = createInsertSchema(tableZones).omit({ id: true });
export const insertTableSchema = createInsertSchema(tables).omit({ id: true });
export const insertWaitlistEntrySchema = createInsertSchema(waitlistEntries).omit({ id: true, createdAt: true });
export const insertReservationSchema = createInsertSchema(reservations).omit({ id: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({ id: true });
export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({ id: true, createdAt: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true });
export const attendanceLogs = pgTable("attendance_logs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  scheduleId: varchar("schedule_id", { length: 36 }).references(() => staffSchedules.id),
  date: timestamp("date").notNull(),
  clockIn: timestamp("clock_in").notNull(),
  clockOut: timestamp("clock_out"),
  hoursWorked: decimal("hours_worked", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("on_time"),
  lateMinutes: integer("late_minutes").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_attendance_tenant_id").on(t.tenantId),
  index("idx_attendance_tenant_created").on(t.tenantId, t.createdAt),
  index("idx_attendance_tenant_user").on(t.tenantId, t.userId),
]);

export const insertStaffScheduleSchema = createInsertSchema(staffSchedules).omit({ id: true });
export const insertAttendanceLogSchema = createInsertSchema(attendanceLogs).omit({ id: true, createdAt: true });
export const insertFeedbackSchema = createInsertSchema(feedback).omit({ id: true, createdAt: true });
export const insertOfferSchema = createInsertSchema(offers).omit({ id: true, createdAt: true });
export const insertDeliveryOrderSchema = createInsertSchema(deliveryOrders).omit({ id: true, createdAt: true });
export const insertEmployeePerformanceLogSchema = createInsertSchema(employeePerformanceLogs).omit({ id: true, recordedAt: true });
export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id"),
  userId: varchar("user_id"),
  userName: varchar("user_name"),
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  issueType: varchar("issue_type").notNull(),
  urgency: varchar("urgency").notNull().default("medium"),
  shortDescription: varchar("short_description", { length: 200 }).notNull(),
  message: text("message"),
  browserInfo: text("browser_info"),
  sourcePage: varchar("source_page"),
  subscriptionTier: varchar("subscription_tier"),
  businessType: varchar("business_type"),
  status: varchar("status").notNull().default("open"),
  referenceNumber: varchar("reference_number"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSalesInquirySchema = createInsertSchema(salesInquiries).omit({ id: true, createdAt: true }).extend({
  fullName: z.string().trim().min(1, "Full name is required").max(200),
  businessName: z.string().trim().min(1, "Business name is required").max(200),
  businessType: z.enum(["Enterprise", "QSR", "Food Truck", "Cafe", "Fine Dining", "Casual Dining", "Cloud Kitchen", "Other"]),
  numOutlets: z.string().max(20).optional().nullable(),
  location: z.string().trim().min(1, "Location is required").max(200),
  email: z.string().trim().email("Invalid email address").max(320),
  phone: z.string().max(30).optional().nullable(),
  preferredContact: z.string().max(20).optional().nullable(),
  heardFrom: z.string().max(50).optional().nullable(),
  subscriptionInterest: z.array(z.string().max(30)).max(10).optional().nullable(),
  message: z.string().trim().min(20, "Message must be at least 20 characters").max(5000),
  wantsDemo: z.boolean().optional().nullable(),
  wantsUpdates: z.boolean().optional().nullable(),
  userAgent: z.string().max(500).optional().nullable(),
  sourcePage: z.string().max(200).optional().nullable(),
});

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true, status: true, referenceNumber: true }).extend({
  email: z.string().trim().email("Invalid email address").max(320),
  phone: z.string().max(30).optional().nullable(),
  issueType: z.enum(["pos_not_loading", "billing_issue", "menu_sync_problem", "staff_scheduling", "reservation_conflict", "inventory_issue", "delivery_issue", "account_access", "performance", "other"]),
  urgency: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  shortDescription: z.string().trim().min(5, "Description must be at least 5 characters").max(200),
  message: z.string().trim().max(5000).optional().nullable(),
  browserInfo: z.string().max(500).optional().nullable(),
  sourcePage: z.string().max(200).optional().nullable(),
  tenantId: z.string().max(100).optional().nullable(),
  userId: z.string().max(100).optional().nullable(),
  userName: z.string().max(200).optional().nullable(),
  subscriptionTier: z.string().max(50).optional().nullable(),
  businessType: z.string().max(50).optional().nullable(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Outlet = typeof outlets.$inferSelect;
export type InsertOutlet = z.infer<typeof insertOutletSchema>;
export type MenuCategory = typeof menuCategories.$inferSelect;
export type InsertMenuCategory = z.infer<typeof insertMenuCategorySchema>;
export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
export type TableZone = typeof tableZones.$inferSelect;
export type InsertTableZone = z.infer<typeof insertTableZoneSchema>;
export type Table = typeof tables.$inferSelect;
export type InsertTable = z.infer<typeof insertTableSchema>;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type InsertWaitlistEntry = z.infer<typeof insertWaitlistEntrySchema>;
export type Reservation = typeof reservations.$inferSelect;
export type InsertReservation = z.infer<typeof insertReservationSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type StaffSchedule = typeof staffSchedules.$inferSelect;
export type InsertStaffSchedule = z.infer<typeof insertStaffScheduleSchema>;
export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Offer = typeof offers.$inferSelect;
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type DeliveryOrder = typeof deliveryOrders.$inferSelect;
export type InsertDeliveryOrder = z.infer<typeof insertDeliveryOrderSchema>;
export type EmployeePerformanceLog = typeof employeePerformanceLogs.$inferSelect;
export type InsertEmployeePerformanceLog = z.infer<typeof insertEmployeePerformanceLogSchema>;
export type SalesInquiry = typeof salesInquiries.$inferSelect;
export type InsertSalesInquiry = z.infer<typeof insertSalesInquirySchema>;
export type AttendanceLog = typeof attendanceLogs.$inferSelect;
export type InsertAttendanceLog = z.infer<typeof insertAttendanceLogSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;

export const cleaningAreaEnum = pgEnum("cleaning_area", [
  "kitchen",
  "restaurant_premises",
  "deep_cleaning",
]);

export const cleaningFrequencyEnum = pgEnum("cleaning_frequency", [
  "hourly",
  "every_2_hours",
  "per_shift",
  "daily",
  "weekly",
  "monthly",
]);

export const cleaningTemplates = pgTable("cleaning_templates", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  area: cleaningAreaEnum("area").notNull(),
  frequency: cleaningFrequencyEnum("frequency").notNull(),
  shift: text("shift"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").default(true),
});

export const cleaningTemplateItems = pgTable("cleaning_template_items", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  templateId: varchar("template_id", { length: 36 }).notNull().references(() => cleaningTemplates.id),
  task: text("task").notNull(),
  sortOrder: integer("sort_order").default(0),
});

export const cleaningLogs = pgTable("cleaning_logs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  templateId: varchar("template_id", { length: 36 }).notNull().references(() => cleaningTemplates.id),
  templateItemId: varchar("template_item_id", { length: 36 }).notNull().references(() => cleaningTemplateItems.id),
  completedBy: varchar("completed_by", { length: 36 }).notNull().references(() => users.id),
  completedAt: timestamp("completed_at").defaultNow(),
  date: timestamp("date").notNull(),
  notes: text("notes"),
}, (t) => [
  index("idx_cleaning_logs_tenant_date").on(t.tenantId, t.date),
]);

export const cleaningSchedules = pgTable("cleaning_schedules", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  templateId: varchar("template_id", { length: 36 }).notNull().references(() => cleaningTemplates.id),
  date: timestamp("date").notNull(),
  assignedTo: varchar("assigned_to", { length: 36 }).references(() => users.id),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCleaningTemplateSchema = createInsertSchema(cleaningTemplates).omit({ id: true });
export const insertCleaningTemplateItemSchema = createInsertSchema(cleaningTemplateItems).omit({ id: true });
export const insertCleaningLogSchema = createInsertSchema(cleaningLogs).omit({ id: true, completedAt: true });
export const insertCleaningScheduleSchema = createInsertSchema(cleaningSchedules).omit({ id: true, createdAt: true });

export type CleaningTemplate = typeof cleaningTemplates.$inferSelect;
export type InsertCleaningTemplate = z.infer<typeof insertCleaningTemplateSchema>;
export type CleaningTemplateItem = typeof cleaningTemplateItems.$inferSelect;
export type InsertCleaningTemplateItem = z.infer<typeof insertCleaningTemplateItemSchema>;
export type CleaningLog = typeof cleaningLogs.$inferSelect;
export type InsertCleaningLog = z.infer<typeof insertCleaningLogSchema>;
export type CleaningSchedule = typeof cleaningSchedules.$inferSelect;
export type InsertCleaningSchedule = z.infer<typeof insertCleaningScheduleSchema>;

export const auditTemplates = pgTable("audit_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  category: text("category").notNull(),
  frequency: text("frequency").notNull(),
  scheduledDay: text("scheduled_day"),
  scheduledTime: text("scheduled_time"),
  riskLevel: text("risk_level").default("medium"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditTemplateItems = pgTable("audit_template_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id", { length: 36 }).notNull().references(() => auditTemplates.id),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  points: integer("points").default(5),
  photoRequired: boolean("photo_required").default(false),
  supervisorApproval: boolean("supervisor_approval").default(false),
  sortOrder: integer("sort_order").default(0),
});

export const auditSchedules = pgTable("audit_schedules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  templateId: varchar("template_id", { length: 36 }).notNull().references(() => auditTemplates.id),
  scheduledDate: timestamp("scheduled_date").notNull(),
  status: text("status").default("pending"),
  assignedTo: varchar("assigned_to", { length: 36 }).references(() => users.id),
  approvedBy: varchar("approved_by", { length: 36 }).references(() => users.id),
  totalScore: integer("total_score"),
  maxScore: integer("max_score"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_audit_schedules_tenant_status").on(t.tenantId, t.status),
  index("idx_audit_schedules_tenant_date").on(t.tenantId, t.scheduledDate),
]);

export const auditResponses = pgTable("audit_responses", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  scheduleId: varchar("schedule_id", { length: 36 }).notNull().references(() => auditSchedules.id),
  itemId: varchar("item_id", { length: 36 }).notNull().references(() => auditTemplateItems.id),
  status: text("status").default("pending"),
  notes: text("notes"),
  photoUrl: text("photo_url"),
  completedBy: varchar("completed_by", { length: 36 }).references(() => users.id),
  completedAt: timestamp("completed_at"),
});

export const auditIssues = pgTable("audit_issues", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  scheduleId: varchar("schedule_id", { length: 36 }).references(() => auditSchedules.id),
  itemId: varchar("item_id", { length: 36 }).references(() => auditTemplateItems.id),
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity").default("medium"),
  status: text("status").default("open"),
  assignedTo: varchar("assigned_to", { length: 36 }).references(() => users.id),
  dueDate: timestamp("due_date"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_audit_issues_tenant_status").on(t.tenantId, t.status),
  index("idx_audit_issues_tenant_created").on(t.tenantId, t.createdAt),
]);

export const recipes = pgTable("recipes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  menuItemId: varchar("menu_item_id", { length: 36 }).references(() => menuItems.id),
  name: text("name").notNull(),
  yield: decimal("yield", { precision: 10, scale: 2 }).default("1"),
  yieldUnit: text("yield_unit").default("portion"),
  prepTimeMinutes: integer("prep_time_minutes"),
  wastePct: decimal("waste_pct", { precision: 5, scale: 2 }).default("0"),
  notes: text("notes"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_recipes_tenant_id").on(t.tenantId),
]);

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  recipeId: varchar("recipe_id", { length: 36 }).notNull().references(() => recipes.id),
  inventoryItemId: varchar("inventory_item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull(),
  unit: text("unit").notNull(),
  wastePct: decimal("waste_pct", { precision: 5, scale: 2 }).default("0"),
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),
}, (t) => [
  index("idx_recipe_ingredients_recipe_id").on(t.recipeId),
]);

export const stockTakes = pgTable("stock_takes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  conductedBy: varchar("conducted_by", { length: 36 }).notNull().references(() => users.id),
  status: text("status").default("draft"),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_stock_takes_tenant_id").on(t.tenantId),
  index("idx_stock_takes_tenant_created").on(t.tenantId, t.createdAt),
]);

export const stockTakeLines = pgTable("stock_take_lines", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  stockTakeId: varchar("stock_take_id", { length: 36 }).notNull().references(() => stockTakes.id),
  inventoryItemId: varchar("inventory_item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  expectedQty: decimal("expected_qty", { precision: 10, scale: 2 }).notNull(),
  countedQty: decimal("counted_qty", { precision: 10, scale: 2 }),
  varianceQty: decimal("variance_qty", { precision: 10, scale: 2 }),
  varianceCost: decimal("variance_cost", { precision: 10, scale: 2 }),
});

export const insertRecipeSchema = createInsertSchema(recipes).omit({ id: true, createdAt: true });
export const insertRecipeIngredientSchema = createInsertSchema(recipeIngredients).omit({ id: true });
export const insertStockTakeSchema = createInsertSchema(stockTakes).omit({ id: true, createdAt: true });
export const insertStockTakeLineSchema = createInsertSchema(stockTakeLines).omit({ id: true });

export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type InsertRecipeIngredient = z.infer<typeof insertRecipeIngredientSchema>;
export type StockTake = typeof stockTakes.$inferSelect;
export type InsertStockTake = z.infer<typeof insertStockTakeSchema>;
export type StockTakeLine = typeof stockTakeLines.$inferSelect;
export type InsertStockTakeLine = z.infer<typeof insertStockTakeLineSchema>;

export const insertAuditTemplateSchema = createInsertSchema(auditTemplates).omit({ id: true, createdAt: true });
export const insertAuditTemplateItemSchema = createInsertSchema(auditTemplateItems).omit({ id: true });
export const insertAuditScheduleSchema = createInsertSchema(auditSchedules).omit({ id: true, createdAt: true });
export const insertAuditResponseSchema = createInsertSchema(auditResponses).omit({ id: true });
export const insertAuditIssueSchema = createInsertSchema(auditIssues).omit({ id: true, createdAt: true });

export type AuditTemplate = typeof auditTemplates.$inferSelect;
export type InsertAuditTemplate = z.infer<typeof insertAuditTemplateSchema>;
export type AuditTemplateItem = typeof auditTemplateItems.$inferSelect;
export type InsertAuditTemplateItem = z.infer<typeof insertAuditTemplateItemSchema>;
export type AuditSchedule = typeof auditSchedules.$inferSelect;
export type InsertAuditSchedule = z.infer<typeof insertAuditScheduleSchema>;
export type AuditResponse = typeof auditResponses.$inferSelect;
export type InsertAuditResponse = z.infer<typeof insertAuditResponseSchema>;
export type AuditIssue = typeof auditIssues.$inferSelect;

export const kitchenStations = pgTable("kitchen_stations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  color: text("color").default("#3B82F6"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").default(true),
  printerUrl: text("printer_url"),
});

export const insertKitchenStationSchema = createInsertSchema(kitchenStations).omit({ id: true });
export type KitchenStation = typeof kitchenStations.$inferSelect;
export type InsertKitchenStation = z.infer<typeof insertKitchenStationSchema>;

export const printJobTypeEnum = pgEnum("print_job_type", ["kot", "bill", "receipt"]);
export const printJobStatusEnum = pgEnum("print_job_status", ["queued", "printed", "failed"]);

export const printJobs = pgTable("print_jobs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  type: printJobTypeEnum("type").notNull(),
  referenceId: varchar("reference_id", { length: 36 }).notNull(),
  station: text("station"),
  status: printJobStatusEnum("status").notNull().default("queued"),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_print_jobs_tenant_status").on(t.tenantId, t.status),
  index("idx_print_jobs_tenant_created").on(t.tenantId, t.createdAt),
]);

export const insertPrintJobSchema = createInsertSchema(printJobs).omit({ id: true, createdAt: true });
export type PrintJob = typeof printJobs.$inferSelect;
export type InsertPrintJob = z.infer<typeof insertPrintJobSchema>;
export type InsertAuditIssue = z.infer<typeof insertAuditIssueSchema>;

export const orderChannels = pgTable("order_channels", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  icon: text("icon"),
  active: boolean("active").default(true),
  commissionPct: decimal("commission_pct", { precision: 5, scale: 2 }).default("0"),
});

export const channelConfigs = pgTable("channel_configs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  channelId: varchar("channel_id", { length: 36 }).notNull().references(() => orderChannels.id),
  outletId: varchar("outlet_id", { length: 36 }).notNull().references(() => outlets.id),
  enabled: boolean("enabled").default(false),
  prepTimeMinutes: integer("prep_time_minutes").default(20),
  packagingFee: decimal("packaging_fee", { precision: 10, scale: 2 }).default("0"),
  autoAccept: boolean("auto_accept").default(false),
});

export const onlineMenuMappings = pgTable("online_menu_mappings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id),
  channelId: varchar("channel_id", { length: 36 }).notNull().references(() => orderChannels.id),
  externalItemId: text("external_item_id"),
  externalPrice: decimal("external_price", { precision: 10, scale: 2 }),
  available: boolean("available").default(true),
});

export const franchiseInvoices = pgTable("franchise_invoices", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).notNull().references(() => outlets.id),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  netSales: decimal("net_sales", { precision: 12, scale: 2 }).notNull(),
  royaltyRate: decimal("royalty_rate", { precision: 5, scale: 2 }).notNull(),
  calculatedRoyalty: decimal("calculated_royalty", { precision: 12, scale: 2 }).notNull(),
  minimumGuarantee: decimal("minimum_guarantee", { precision: 10, scale: 2 }).default("0"),
  finalAmount: decimal("final_amount", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).default("draft"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const outletMenuOverrides = pgTable("outlet_menu_overrides", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).notNull().references(() => outlets.id),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id),
  overridePrice: decimal("override_price", { precision: 10, scale: 2 }),
  available: boolean("available").default(true),
});

export const suppliers = pgTable("suppliers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  paymentTerms: text("payment_terms").default("Net 30"),
  leadTimeDays: integer("lead_time_days").default(3),
  rating: decimal("rating", { precision: 2, scale: 1 }).default("0"),
  notes: text("notes"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_suppliers_tenant_id").on(t.tenantId),
]);

export const supplierCatalogItems = pgTable("supplier_catalog_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => suppliers.id),
  inventoryItemId: varchar("inventory_item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  supplierSku: text("supplier_sku"),
  packSize: decimal("pack_size", { precision: 10, scale: 2 }).default("1"),
  packUnit: text("pack_unit").default("pcs"),
  packCost: decimal("pack_cost", { precision: 10, scale: 2 }).notNull(),
  contractedPrice: decimal("contracted_price", { precision: 10, scale: 2 }),
  lastPurchasePrice: decimal("last_purchase_price", { precision: 10, scale: 2 }),
  preferred: boolean("preferred").default(false),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => suppliers.id),
  poNumber: text("po_number").notNull(),
  status: varchar("status", { length: 30 }).default("draft"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  expectedDelivery: timestamp("expected_delivery"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  approvedBy: varchar("approved_by", { length: 36 }).references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_purchase_orders_tenant_id").on(t.tenantId),
  index("idx_purchase_orders_tenant_status").on(t.tenantId, t.status),
]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  purchaseOrderId: varchar("purchase_order_id", { length: 36 }).notNull().references(() => purchaseOrders.id),
  inventoryItemId: varchar("inventory_item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  catalogItemId: varchar("catalog_item_id", { length: 36 }).references(() => supplierCatalogItems.id),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }).notNull(),
  receivedQty: decimal("received_qty", { precision: 10, scale: 2 }).default("0"),
});

export const goodsReceivedNotes = pgTable("goods_received_notes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  purchaseOrderId: varchar("purchase_order_id", { length: 36 }).notNull().references(() => purchaseOrders.id),
  grnNumber: text("grn_number").notNull(),
  receivedBy: varchar("received_by", { length: 36 }).references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const grnItems = pgTable("grn_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  grnId: varchar("grn_id", { length: 36 }).notNull().references(() => goodsReceivedNotes.id),
  purchaseOrderItemId: varchar("purchase_order_item_id", { length: 36 }).notNull().references(() => purchaseOrderItems.id),
  inventoryItemId: varchar("inventory_item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  quantityReceived: decimal("quantity_received", { precision: 10, scale: 2 }).notNull(),
  actualUnitCost: decimal("actual_unit_cost", { precision: 10, scale: 2 }).notNull(),
  priceVariance: decimal("price_variance", { precision: 10, scale: 2 }).default("0"),
  notes: text("notes"),
});

export const procurementApprovals = pgTable("procurement_approvals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  purchaseOrderId: varchar("purchase_order_id", { length: 36 }).notNull().references(() => purchaseOrders.id),
  action: varchar("action", { length: 20 }).notNull(),
  performedBy: varchar("performed_by", { length: 36 }).notNull().references(() => users.id),
  performedAt: timestamp("performed_at").defaultNow(),
  notes: text("notes"),
});

export const insertRegionSchema = createInsertSchema(regions).omit({ id: true });
export const insertFranchiseInvoiceSchema = createInsertSchema(franchiseInvoices).omit({ id: true, createdAt: true });
export const insertOutletMenuOverrideSchema = createInsertSchema(outletMenuOverrides).omit({ id: true });
export const insertOrderChannelSchema = createInsertSchema(orderChannels).omit({ id: true });
export const insertChannelConfigSchema = createInsertSchema(channelConfigs).omit({ id: true });
export const insertOnlineMenuMappingSchema = createInsertSchema(onlineMenuMappings).omit({ id: true });
export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true, createdAt: true });
export const insertSupplierCatalogItemSchema = createInsertSchema(supplierCatalogItems).omit({ id: true });
export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true, createdAt: true, approvedAt: true });
export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems).omit({ id: true });
export const insertGoodsReceivedNoteSchema = createInsertSchema(goodsReceivedNotes).omit({ id: true, createdAt: true });
export const insertGrnItemSchema = createInsertSchema(grnItems).omit({ id: true });
export const insertProcurementApprovalSchema = createInsertSchema(procurementApprovals).omit({ id: true, performedAt: true });

export type Region = typeof regions.$inferSelect;
export type InsertRegion = z.infer<typeof insertRegionSchema>;
export type FranchiseInvoice = typeof franchiseInvoices.$inferSelect;
export type InsertFranchiseInvoice = z.infer<typeof insertFranchiseInvoiceSchema>;
export type OutletMenuOverride = typeof outletMenuOverrides.$inferSelect;
export type InsertOutletMenuOverride = z.infer<typeof insertOutletMenuOverrideSchema>;
export type OrderChannel = typeof orderChannels.$inferSelect;
export type InsertOrderChannel = z.infer<typeof insertOrderChannelSchema>;
export type ChannelConfig = typeof channelConfigs.$inferSelect;
export type InsertChannelConfig = z.infer<typeof insertChannelConfigSchema>;
export type OnlineMenuMapping = typeof onlineMenuMappings.$inferSelect;
export type InsertOnlineMenuMapping = z.infer<typeof insertOnlineMenuMappingSchema>;
export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type SupplierCatalogItem = typeof supplierCatalogItems.$inferSelect;
export type InsertSupplierCatalogItem = z.infer<typeof insertSupplierCatalogItemSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;
export type GoodsReceivedNote = typeof goodsReceivedNotes.$inferSelect;
export type InsertGoodsReceivedNote = z.infer<typeof insertGoodsReceivedNoteSchema>;
export type GrnItem = typeof grnItems.$inferSelect;
export type InsertGrnItem = z.infer<typeof insertGrnItemSchema>;
export type ProcurementApproval = typeof procurementApprovals.$inferSelect;
export type InsertProcurementApproval = z.infer<typeof insertProcurementApprovalSchema>;

export const labourCostSnapshots = pgTable("labour_cost_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  date: timestamp("date").notNull(),
  role: text("role"),
  scheduledHours: decimal("scheduled_hours", { precision: 8, scale: 2 }).default("0"),
  actualHours: decimal("actual_hours", { precision: 8, scale: 2 }).default("0"),
  overtimeHours: decimal("overtime_hours", { precision: 8, scale: 2 }).default("0"),
  scheduledCost: decimal("scheduled_cost", { precision: 10, scale: 2 }).default("0"),
  actualCost: decimal("actual_cost", { precision: 10, scale: 2 }).default("0"),
  overtimeCost: decimal("overtime_cost", { precision: 10, scale: 2 }).default("0"),
  salesRevenue: decimal("sales_revenue", { precision: 12, scale: 2 }).default("0"),
  labourPct: decimal("labour_pct", { precision: 5, scale: 2 }).default("0"),
  headcount: integer("headcount").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_labour_cost_tenant_id").on(t.tenantId),
  index("idx_labour_cost_tenant_date").on(t.tenantId, t.date),
]);

export const insertLabourCostSnapshotSchema = createInsertSchema(labourCostSnapshots).omit({ id: true, createdAt: true });
export type LabourCostSnapshot = typeof labourCostSnapshots.$inferSelect;
export type InsertLabourCostSnapshot = z.infer<typeof insertLabourCostSnapshotSchema>;

export const auditEvents = pgTable("audit_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }),
  userId: varchar("user_id", { length: 36 }),
  userName: text("user_name"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: varchar("entity_id", { length: 36 }),
  entityName: text("entity_name"),
  outletId: varchar("outlet_id", { length: 36 }),
  before: jsonb("before"),
  after: jsonb("after"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  supervisorId: varchar("supervisor_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_audit_events_tenant_created").on(t.tenantId, t.createdAt),
  index("idx_audit_events_tenant_action").on(t.tenantId, t.action),
  index("idx_audit_events_user_created").on(t.userId, t.createdAt),
]);

export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({ id: true, createdAt: true });
export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;

export const deviceSessions = pgTable("device_sessions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  deviceFingerprint: text("device_fingerprint").notNull(),
  deviceName: text("device_name"),
  browser: text("browser"),
  os: text("os"),
  ipAddress: text("ip_address"),
  isTrusted: boolean("is_trusted").default(false),
  lastActive: timestamp("last_active").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const insertDeviceSessionSchema = createInsertSchema(deviceSessions).omit({ id: true, createdAt: true });
export type DeviceSession = typeof deviceSessions.$inferSelect;
export type InsertDeviceSession = z.infer<typeof insertDeviceSessionSchema>;

export const promotionRules = pgTable("promotion_rules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id),
  name: text("name").notNull(),
  description: text("description"),
  ruleType: text("rule_type").notNull(),
  discountType: text("discount_type").notNull(),
  discountValue: text("discount_value").notNull(),
  scope: text("scope").default("all_items"),
  scopeRef: text("scope_ref"),
  conditions: jsonb("conditions").$type<Record<string, unknown>>(),
  channels: text("channels").array(),
  priority: integer("priority").default(0),
  stackable: boolean("stackable").default(false),
  maxDiscount: text("max_discount"),
  minOrderAmount: text("min_order_amount"),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").default(0),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPromotionRuleSchema = createInsertSchema(promotionRules).omit({ id: true, createdAt: true, usageCount: true });
export type PromotionRule = typeof promotionRules.$inferSelect;
export type InsertPromotionRule = z.infer<typeof insertPromotionRuleSchema>;

export const kioskDevices = pgTable("kiosk_devices", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  name: text("name").notNull(),
  deviceToken: text("device_token").notNull(),
  active: boolean("active").default(true),
  settings: jsonb("settings").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertKioskDeviceSchema = createInsertSchema(kioskDevices).omit({ id: true, createdAt: true });
export type KioskDevice = typeof kioskDevices.$inferSelect;
export type InsertKioskDevice = z.infer<typeof insertKioskDeviceSchema>;

export const upsellRules = pgTable("upsell_rules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id),
  triggerItemId: varchar("trigger_item_id", { length: 36 }),
  triggerCategoryId: varchar("trigger_category_id", { length: 36 }),
  suggestItemId: varchar("suggest_item_id", { length: 36 }).references(() => menuItems.id),
  label: text("label").notNull(),
  priority: integer("priority").default(0),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUpsellRuleSchema = createInsertSchema(upsellRules).omit({ id: true, createdAt: true });
export type UpsellRule = typeof upsellRules.$inferSelect;
export type InsertUpsellRule = z.infer<typeof insertUpsellRuleSchema>;

export const tableSessions = pgTable("table_sessions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  tableId: varchar("table_id", { length: 36 }).notNull().references(() => tables.id),
  token: text("token").notNull(),
  status: text("status").default("active"),
  guestCount: integer("guest_count").default(1),
  orderId: varchar("order_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const insertTableSessionSchema = createInsertSchema(tableSessions).omit({ id: true, createdAt: true });
export type TableSession = typeof tableSessions.$inferSelect;
export type InsertTableSession = z.infer<typeof insertTableSessionSchema>;

export const guestCartItems = pgTable("guest_cart_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id", { length: 36 }).notNull().references(() => tableSessions.id),
  guestLabel: text("guest_label").default("Guest 1"),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id),
  name: text("name").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  notes: text("notes"),
  addOns: jsonb("add_ons"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGuestCartItemSchema = createInsertSchema(guestCartItems).omit({ id: true, createdAt: true });
export type GuestCartItem = typeof guestCartItems.$inferSelect;

export const eventTypeEnum = pgEnum("event_type", ["holiday", "festival", "sports", "corporate", "promotion"]);
export const eventImpactEnum = pgEnum("event_impact", ["low", "medium", "high", "very_high"]);

export const events = pgTable("events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  title: text("title").notNull(),
  description: text("description"),
  type: eventTypeEnum("type").notNull().default("holiday"),
  impact: eventImpactEnum("impact").notNull().default("medium"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  allDay: boolean("all_day").default(true),
  color: varchar("color", { length: 7 }).default("#3b82f6"),
  outlets: text("outlets").array(),
  tags: text("tags").array(),
  linkedOfferId: varchar("linked_offer_id", { length: 36 }),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;
export type InsertGuestCartItem = z.infer<typeof insertGuestCartItemSchema>;

export const comboOffers = pgTable("combo_offers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  description: text("description"),
  comboPrice: decimal("combo_price", { precision: 10, scale: 2 }).notNull(),
  individualTotal: decimal("individual_total", { precision: 10, scale: 2 }).notNull(),
  savingsPercentage: decimal("savings_percentage", { precision: 5, scale: 2 }).notNull(),
  mainItems: jsonb("main_items").notNull(),
  sideItems: jsonb("side_items"),
  addonItems: jsonb("addon_items"),
  validityStart: timestamp("validity_start"),
  validityEnd: timestamp("validity_end"),
  timeSlots: text("time_slots").array(),
  outlets: text("outlets").array(),
  isActive: boolean("is_active").default(true),
  orderCount: integer("order_count").default(0),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_combo_offers_tenant_id").on(t.tenantId),
  index("idx_combo_offers_tenant_active").on(t.tenantId, t.isActive),
]);

export const insertComboOfferSchema = createInsertSchema(comboOffers).omit({ id: true, createdAt: true, updatedAt: true });
export type ComboOffer = typeof comboOffers.$inferSelect;
export type InsertComboOffer = z.infer<typeof insertComboOfferSchema>;

export const alertSeverityEnum = pgEnum("alert_severity", ["info", "warning", "critical"]);

export const securityAlerts = pgTable("security_alerts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }),
  type: text("type").notNull(),
  severity: alertSeverityEnum("severity").notNull().default("warning"),
  title: text("title").notNull(),
  description: text("description"),
  ipAddress: text("ip_address"),
  metadata: jsonb("metadata"),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedBy: varchar("acknowledged_by", { length: 36 }),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_security_alerts_tenant_created").on(t.tenantId, t.createdAt),
  index("idx_security_alerts_tenant_ack").on(t.tenantId, t.acknowledged),
]);

export const insertSecurityAlertSchema = createInsertSchema(securityAlerts).omit({ id: true, createdAt: true });
export type SecurityAlert = typeof securityAlerts.$inferSelect;

export const shifts = pgTable("shifts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  name: text("name").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_shifts_tenant_id").on(t.tenantId),
]);

export const insertShiftSchema = createInsertSchema(shifts).omit({ id: true, createdAt: true });
export type Shift = typeof shifts.$inferSelect;
export type InsertShift = z.infer<typeof insertShiftSchema>;

export const menuItemStations = pgTable("menu_item_stations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id),
  station: text("station").notNull(),
}, (t) => [
  index("idx_menu_item_stations_tenant").on(t.tenantId),
  index("idx_menu_item_stations_item").on(t.menuItemId),
]);

export const insertMenuItemStationSchema = createInsertSchema(menuItemStations).omit({ id: true });
export type MenuItemStation = typeof menuItemStations.$inferSelect;
export type InsertMenuItemStation = z.infer<typeof insertMenuItemStationSchema>;

export const kotEvents = pgTable("kot_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  station: text("station"),
  items: jsonb("items").notNull().default([]),
  sentAt: timestamp("sent_at").defaultNow(),
  receivedAt: timestamp("received_at"),
}, (t) => [
  index("idx_kot_events_tenant_order").on(t.tenantId, t.orderId),
]);

export const insertKotEventSchema = createInsertSchema(kotEvents).omit({ id: true, sentAt: true });
export type KotEvent = typeof kotEvents.$inferSelect;
export type InsertKotEvent = z.infer<typeof insertKotEventSchema>;
export type InsertSecurityAlert = z.infer<typeof insertSecurityAlertSchema>;

export const bills = pgTable("bills", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  billNumber: varchar("bill_number", { length: 50 }).notNull(),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  tableId: varchar("table_id", { length: 36 }).references(() => tables.id),
  customerId: varchar("customer_id", { length: 36 }),
  waiterId: varchar("waiter_id", { length: 36 }).notNull().references(() => users.id),
  waiterName: varchar("waiter_name", { length: 255 }),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0"),
  discountReason: varchar("discount_reason", { length: 255 }),
  serviceCharge: decimal("service_charge", { precision: 10, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0"),
  taxBreakdown: jsonb("tax_breakdown"),
  tips: decimal("tips", { precision: 10, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  paymentStatus: text("payment_status").default("pending"),
  voidReason: text("void_reason"),
  voidedAt: timestamp("voided_at"),
  voidedBy: varchar("voided_by", { length: 36 }),
  posSessionId: varchar("pos_session_id", { length: 36 }),
  covers: integer("covers").default(1),
  invoiceNumber: text("invoice_number"),
  customerGstin: text("customer_gstin"),
  cgstAmount: decimal("cgst_amount", { precision: 10, scale: 2 }),
  sgstAmount: decimal("sgst_amount", { precision: 10, scale: 2 }),
  razorpayOrderId: text("razorpay_order_id"),
  createdAt: timestamp("created_at").defaultNow(),
  paidAt: timestamp("paid_at"),
}, (t) => [
  index("idx_bills_tenant_id").on(t.tenantId),
  index("idx_bills_order_id").on(t.orderId),
  index("idx_bills_tenant_created").on(t.tenantId, t.createdAt),
  index("idx_bills_tenant_status").on(t.tenantId, t.paymentStatus),
  uniqueIndex("idx_bills_tenant_invoice_number_unique").on(t.tenantId, t.invoiceNumber),
]);

export const insertBillSchema = createInsertSchema(bills).omit({ id: true, createdAt: true });
export type Bill = typeof bills.$inferSelect;
export type InsertBill = z.infer<typeof insertBillSchema>;

export const billPayments = pgTable("bill_payments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  billId: varchar("bill_id", { length: 36 }).notNull().references(() => bills.id),
  paymentMethod: varchar("payment_method", { length: 30 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  referenceNo: varchar("reference_no", { length: 100 }),
  collectedBy: varchar("collected_by", { length: 36 }).references(() => users.id),
  isRefund: boolean("is_refund").default(false),
  refundReason: text("refund_reason"),
  razorpayPaymentId: text("razorpay_payment_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_bill_payments_bill_id").on(t.billId),
  index("idx_bill_payments_tenant_id").on(t.tenantId),
]);

export const insertBillPaymentSchema = createInsertSchema(billPayments).omit({ id: true, createdAt: true });
export type BillPayment = typeof billPayments.$inferSelect;
export type InsertBillPayment = z.infer<typeof insertBillPaymentSchema>;

export const posSessions = pgTable("pos_sessions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  waiterId: varchar("waiter_id", { length: 36 }).notNull().references(() => users.id),
  waiterName: varchar("waiter_name", { length: 255 }),
  shiftName: varchar("shift_name", { length: 50 }),
  openingFloat: decimal("opening_float", { precision: 10, scale: 2 }).default("0"),
  closingCashCount: decimal("closing_cash_count", { precision: 10, scale: 2 }),
  closedBy: varchar("closed_by", { length: 36 }),
  status: text("status").default("open"),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  totalOrders: integer("total_orders").default(0),
  totalRevenue: decimal("total_revenue", { precision: 10, scale: 2 }).default("0"),
  revenueByMethod: jsonb("revenue_by_method"),
  notes: text("notes"),
}, (t) => [
  index("idx_pos_sessions_tenant_id").on(t.tenantId),
  index("idx_pos_sessions_waiter_id").on(t.waiterId),
  index("idx_pos_sessions_tenant_status").on(t.tenantId, t.status),
]);

export const insertPosSessionSchema = createInsertSchema(posSessions).omit({ id: true, openedAt: true });
export type PosSession = typeof posSessions.$inferSelect;

export const tableQrTokens = pgTable("table_qr_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  tableId: varchar("table_id", { length: 36 }).notNull().references(() => tables.id),
  token: text("token").notNull(),
  active: boolean("active").default(true),
  label: text("label"),
  createdAt: timestamp("created_at").defaultNow(),
  deactivatedAt: timestamp("deactivated_at"),
}, (t) => [
  uniqueIndex("table_qr_tokens_token_key").on(t.token),
  index("idx_table_qr_tokens_tenant").on(t.tenantId),
  index("idx_table_qr_tokens_table").on(t.tableId),
  index("idx_table_qr_tokens_token").on(t.token),
]);

export const insertTableQrTokenSchema = createInsertSchema(tableQrTokens).omit({ id: true, createdAt: true });
export type TableQrToken = typeof tableQrTokens.$inferSelect;
export type InsertTableQrToken = z.infer<typeof insertTableQrTokenSchema>;

export const tableRequests = pgTable("table_requests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  tableId: varchar("table_id", { length: 36 }).notNull().references(() => tables.id),
  qrTokenId: varchar("qr_token_id", { length: 36 }).references(() => tableQrTokens.id),
  requestType: text("request_type").notNull().default("call_server"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  guestNote: text("guest_note"),
  details: jsonb("details"),
  assignedTo: varchar("assigned_to", { length: 36 }).references(() => users.id),
  assignedToName: text("assigned_to_name"),
  staffNote: text("staff_note"),
  escalatedAt: timestamp("escalated_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  completedAt: timestamp("completed_at"),
  feedbackRating: integer("feedback_rating"),
  feedbackText: text("feedback_text"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_table_requests_tenant").on(t.tenantId),
  index("idx_table_requests_table").on(t.tableId),
  index("idx_table_requests_status").on(t.status),
  index("idx_table_requests_tenant_status").on(t.tenantId, t.status),
]);

export const insertTableRequestSchema = createInsertSchema(tableRequests).omit({ id: true, createdAt: true });
export type TableRequest = typeof tableRequests.$inferSelect;
export type InsertTableRequest = z.infer<typeof insertTableRequestSchema>;

// ─── Task #76: Smart Chef Assignment & Counter Management ─────────────────────

export const kitchenCounters = pgTable("kitchen_counters", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  name: text("name").notNull(),
  counterCode: varchar("counter_code", { length: 20 }),
  handlesCategories: jsonb("handles_categories").$type<string[]>().default([]),
  maxCapacity: integer("max_capacity").default(5),
  displayColor: varchar("display_color", { length: 20 }).default("#3B82F6"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_kitchen_counters_tenant").on(t.tenantId),
]);

export const insertKitchenCounterSchema = createInsertSchema(kitchenCounters).omit({ id: true, createdAt: true });
export type KitchenCounter = typeof kitchenCounters.$inferSelect;
export type InsertKitchenCounter = z.infer<typeof insertKitchenCounterSchema>;

export const chefRoster = pgTable("chef_roster", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  chefId: varchar("chef_id", { length: 36 }).references(() => users.id),
  chefName: text("chef_name"),
  counterId: varchar("counter_id", { length: 36 }).references(() => kitchenCounters.id),
  counterName: text("counter_name"),
  shiftDate: text("shift_date").notNull(),
  shiftStart: text("shift_start").notNull(),
  shiftEnd: text("shift_end").notNull(),
  shiftType: varchar("shift_type", { length: 20 }).default("morning"),
  status: varchar("status", { length: 20 }).default("scheduled"),
  checkedInAt: timestamp("checked_in_at"),
  checkedOutAt: timestamp("checked_out_at"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_chef_roster_tenant").on(t.tenantId),
  index("idx_chef_roster_date").on(t.shiftDate),
  index("idx_chef_roster_counter").on(t.counterId),
]);

export const insertChefRosterSchema = createInsertSchema(chefRoster).omit({ id: true, createdAt: true });
export type ChefRoster = typeof chefRoster.$inferSelect;
export type InsertChefRoster = z.infer<typeof insertChefRosterSchema>;

export const chefAvailability = pgTable("chef_availability", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  chefId: varchar("chef_id", { length: 36 }).notNull().references(() => users.id),
  counterId: varchar("counter_id", { length: 36 }).references(() => kitchenCounters.id),
  shiftDate: text("shift_date"),
  status: varchar("status", { length: 20 }).default("available"),
  activeTickets: integer("active_tickets").default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (t) => [
  index("idx_chef_availability_tenant").on(t.tenantId),
  index("idx_chef_availability_chef").on(t.chefId),
]);

export const insertChefAvailabilitySchema = createInsertSchema(chefAvailability).omit({ id: true, lastUpdated: true });
export type ChefAvailability = typeof chefAvailability.$inferSelect;
export type InsertChefAvailability = z.infer<typeof insertChefAvailabilitySchema>;

export const ticketAssignments = pgTable("ticket_assignments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  orderItemId: varchar("order_item_id", { length: 36 }),
  orderId: varchar("order_id", { length: 36 }),
  menuItemId: varchar("menu_item_id", { length: 36 }),
  menuItemName: text("menu_item_name"),
  tableNumber: integer("table_number"),
  counterId: varchar("counter_id", { length: 36 }).references(() => kitchenCounters.id),
  counterName: text("counter_name"),
  chefId: varchar("chef_id", { length: 36 }).references(() => users.id),
  chefName: text("chef_name"),
  assignmentType: varchar("assignment_type", { length: 30 }).default("UNASSIGNED"),
  assignmentScore: integer("assignment_score"),
  assignedAt: timestamp("assigned_at"),
  acceptedAt: timestamp("accepted_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  status: varchar("status", { length: 20 }).default("unassigned"),
  reassignReason: text("reassign_reason"),
  estimatedTimeMin: integer("estimated_time_min"),
  actualTimeMin: integer("actual_time_min"),
  completedQty: decimal("completed_qty"),
  totalQty: decimal("total_qty"),
  unit: text("unit"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_ticket_assignments_tenant").on(t.tenantId),
  index("idx_ticket_assignments_counter").on(t.counterId),
  index("idx_ticket_assignments_chef").on(t.chefId),
  index("idx_ticket_assignments_status").on(t.status),
  index("idx_ticket_assignments_assigned_at").on(t.assignedAt),
]);

export const insertTicketAssignmentSchema = createInsertSchema(ticketAssignments).omit({ id: true, createdAt: true });
export type TicketAssignment = typeof ticketAssignments.$inferSelect;
export type InsertTicketAssignment = z.infer<typeof insertTicketAssignmentSchema>;
export type InsertPosSession = z.infer<typeof insertPosSessionSchema>;
// ─── Stock Check Reports ────────────────────────────────────────────────────
export const stockCheckReports = pgTable("stock_check_reports", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  reportType: varchar("report_type", { length: 30 }).notNull().default("MANUAL"),
  targetDate: text("target_date").notNull(),
  shiftType: varchar("shift_type", { length: 20 }),
  generatedAt: timestamp("generated_at").defaultNow(),
  generatedBy: varchar("generated_by", { length: 50 }).default("SYSTEM"),
  totalItemsChecked: integer("total_items_checked").default(0),
  itemsSufficient: integer("items_sufficient").default(0),
  itemsLimited: integer("items_limited").default(0),
  itemsCritical: integer("items_critical").default(0),
  itemsUnavailable: integer("items_unavailable").default(0),
  overallStatus: varchar("overall_status", { length: 20 }).default("GREEN"),
  totalShortfallValue: decimal("total_shortfall_value", { precision: 10, scale: 2 }).default("0"),
  acknowledgedBy: varchar("acknowledged_by", { length: 36 }),
  acknowledgedAt: timestamp("acknowledged_at"),
  actionsTaken: jsonb("actions_taken"),
}, (t) => [
  index("idx_stock_check_reports_tenant").on(t.tenantId),
  index("idx_stock_check_reports_date").on(t.tenantId, t.targetDate),
]);

export const insertStockCheckReportSchema = createInsertSchema(stockCheckReports).omit({ id: true, generatedAt: true });
export type StockCheckReport = typeof stockCheckReports.$inferSelect;
export type InsertStockCheckReport = z.infer<typeof insertStockCheckReportSchema>;

export const stockCheckReportItems = pgTable("stock_check_report_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id", { length: 36 }).notNull().references(() => stockCheckReports.id),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull(),
  menuItemName: text("menu_item_name"),
  category: text("category"),
  recipeId: varchar("recipe_id", { length: 36 }),
  plannedQuantity: integer("planned_quantity").default(20),
  maxPossiblePortions: integer("max_possible_portions").notNull().default(0),
  bottleneckIngredient: text("bottleneck_ingredient"),
  bottleneckStock: decimal("bottleneck_stock", { precision: 10, scale: 3 }),
  bottleneckRequired: decimal("bottleneck_required", { precision: 10, scale: 3 }),
  status: varchar("status", { length: 20 }).default("SUFFICIENT"),
  ingredientBreakdown: jsonb("ingredient_breakdown").notNull().default("[]"),
  recommendedAction: varchar("recommended_action", { length: 50 }).default("OK"),
  shortfallCost: decimal("shortfall_cost", { precision: 10, scale: 2 }).default("0"),
  isDisabled: boolean("is_disabled").default(false),
  maxLimit: integer("max_limit"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_stock_report_items_report").on(t.reportId),
  index("idx_stock_report_items_tenant").on(t.tenantId),
]);

export const insertStockCheckReportItemSchema = createInsertSchema(stockCheckReportItems).omit({ id: true, createdAt: true });
export type StockCheckReportItem = typeof stockCheckReportItems.$inferSelect;
export type InsertStockCheckReportItem = z.infer<typeof insertStockCheckReportItemSchema>;

export const dailyPlannedQuantities = pgTable("daily_planned_quantities", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull(),
  plannedDate: text("planned_date").notNull(),
  plannedQty: integer("planned_qty").notNull().default(20),
  actualQtySold: integer("actual_qty_sold").default(0),
  maxLimit: integer("max_limit"),
  isDisabled: boolean("is_disabled").default(false),
  disabledReason: text("disabled_reason"),
  createdBy: varchar("created_by", { length: 36 }),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_daily_planned_qty_tenant_date").on(t.tenantId, t.plannedDate),
  index("idx_daily_planned_qty_menu_item").on(t.menuItemId),
]);

export const insertDailyPlannedQtySchema = createInsertSchema(dailyPlannedQuantities).omit({ id: true, updatedAt: true });
export type DailyPlannedQty = typeof dailyPlannedQuantities.$inferSelect;
export type InsertDailyPlannedQty = z.infer<typeof insertDailyPlannedQtySchema>;

// Task #97: Food Modification System

export const orderItemModifications = pgTable("order_item_modifications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  orderItemId: varchar("order_item_id", { length: 36 }).notNull(),
  orderId: varchar("order_id", { length: 36 }),
  spiceLevel: varchar("spice_level", { length: 30 }),
  saltLevel: varchar("salt_level", { length: 20 }),
  removedIngredients: text("removed_ingredients").array().notNull().default([]),
  hasAllergy: boolean("has_allergy").notNull().default(false),
  allergyFlags: text("allergy_flags").array().notNull().default([]),
  allergyDetails: text("allergy_details"),
  specialNotes: text("special_notes"),
  chefAcknowledged: boolean("chef_acknowledged").notNull().default(false),
  acknowledgedBy: varchar("acknowledged_by", { length: 36 }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_order_item_modifications_tenant").on(t.tenantId),
  index("idx_order_item_modifications_item").on(t.orderItemId),
]);

export const insertOrderItemModificationSchema = createInsertSchema(orderItemModifications).omit({ id: true, createdAt: true, updatedAt: true });
export type OrderItemModification = typeof orderItemModifications.$inferSelect;
export type InsertOrderItemModification = z.infer<typeof insertOrderItemModificationSchema>;

export const recipeComponents = pgTable("recipe_components", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull(),
  ingredientName: text("ingredient_name").notNull(),
  isRemovable: boolean("is_removable").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_recipe_components_menu_item").on(t.menuItemId),
  index("idx_recipe_components_tenant").on(t.tenantId),
]);

export const insertRecipeComponentSchema = createInsertSchema(recipeComponents).omit({ id: true, createdAt: true });
export type RecipeComponent = typeof recipeComponents.$inferSelect;
export type InsertRecipeComponent = z.infer<typeof insertRecipeComponentSchema>;

// ─── Task #99: Food Wastage Tracking ─────────────────────────────────────────

export const wastageLogs = pgTable("wastage_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  wastageNumber: text("wastage_number").notNull(),
  wastageDate: text("wastage_date").notNull(),
  wastageCategory: text("wastage_category").notNull(),
  ingredientId: varchar("ingredient_id", { length: 36 }).references(() => inventoryItems.id),
  ingredientName: text("ingredient_name").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: text("unit").notNull().default("kg"),
  unitCost: decimal("unit_cost", { precision: 10, scale: 4 }).notNull().default("0"),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).notNull().default("0"),
  reason: text("reason"),
  isPreventable: boolean("is_preventable").notNull().default(false),
  chefId: varchar("chef_id", { length: 36 }).references(() => users.id),
  chefName: text("chef_name"),
  counterId: varchar("counter_id", { length: 36 }),
  counterName: text("counter_name"),
  shiftId: varchar("shift_id", { length: 36 }),
  stockMovementId: varchar("stock_movement_id", { length: 36 }),
  isVoided: boolean("is_voided").notNull().default(false),
  voidReason: text("void_reason"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: varchar("voided_by", { length: 36 }),
  isRecovery: boolean("is_recovery").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_wastage_logs_tenant").on(t.tenantId),
  index("idx_wastage_logs_date").on(t.tenantId, t.wastageDate),
  index("idx_wastage_logs_category").on(t.tenantId, t.wastageCategory),
  index("idx_wastage_logs_chef").on(t.tenantId, t.chefId),
  index("idx_wastage_logs_counter").on(t.tenantId, t.counterId),
  index("idx_wastage_logs_ingredient").on(t.tenantId, t.ingredientId),
]);

export const insertWastageLogSchema = createInsertSchema(wastageLogs).omit({ id: true, createdAt: true });
export type WastageLog = typeof wastageLogs.$inferSelect;
export type InsertWastageLog = z.infer<typeof insertWastageLogSchema>;

export const wastageDailySummary = pgTable("wastage_daily_summary", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  summaryDate: text("summary_date").notNull(),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  totalEntries: integer("total_entries").notNull().default(0),
  preventableCost: decimal("preventable_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  preventableEntries: integer("preventable_entries").notNull().default(0),
  targetAmount: decimal("target_amount", { precision: 12, scale: 2 }),
  revenueForDay: decimal("revenue_for_day", { precision: 12, scale: 2 }),
  categoryBreakdown: jsonb("category_breakdown").default("{}"),
  counterBreakdown: jsonb("counter_breakdown").default("{}"),
  chefBreakdown: jsonb("chef_breakdown").default("{}"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_wastage_daily_summary_tenant_date").on(t.tenantId, t.summaryDate),
  uniqueIndex("idx_wastage_daily_summary_unique").on(t.tenantId, t.outletId, t.summaryDate),
]);

export const insertWastageDailySummarySchema = createInsertSchema(wastageDailySummary).omit({ id: true, updatedAt: true });
export type WastageDailySummary = typeof wastageDailySummary.$inferSelect;
export type InsertWastageDailySummary = z.infer<typeof insertWastageDailySummarySchema>;

export const wastageTargets = pgTable("wastage_targets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  periodType: text("period_type").notNull().default("daily"),
  targetAmount: decimal("target_amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").default("INR"),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_wastage_targets_tenant").on(t.tenantId),
  index("idx_wastage_targets_active").on(t.tenantId, t.isActive),
]);

export const insertWastageTargetSchema = createInsertSchema(wastageTargets).omit({ id: true, createdAt: true });
export type WastageTarget = typeof wastageTargets.$inferSelect;
export type InsertWastageTarget = z.infer<typeof insertWastageTargetSchema>;
