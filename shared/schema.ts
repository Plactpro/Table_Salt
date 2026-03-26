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
  date,
  numeric,
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
  "cleaning_staff",
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
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: varchar("deleted_by", { length: 36 }),
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
  currencyCode: varchar("currency_code", { length: 10 }).default("INR"),
  currencySymbol: varchar("currency_symbol", { length: 10 }).default("₹"),
  currencyName: varchar("currency_name", { length: 50 }).default("Indian Rupee"),
  currencyPosition: varchar("currency_position", { length: 10 }).default("before"),
  decimalPlaces: integer("decimal_places").default(2),
  denominationConfig: jsonb("denomination_config"),
  cashRounding: varchar("cash_rounding", { length: 20 }).default("NONE"),
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
  prepTimeMinutes: integer("prep_time_minutes"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: varchar("deleted_by", { length: 36 }),
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
  resourceRequirements: jsonb("resource_requirements").default([]),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: varchar("deleted_by", { length: 36 }),
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
  version: integer("version").notNull().default(1),
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
  cookingStatus: varchar("cooking_status", { length: 30 }).default("queued"),
  suggestedStartAt: timestamp("suggested_start_at"),
  actualStartAt: timestamp("actual_start_at"),
  estimatedReadyAt: timestamp("estimated_ready_at"),
  actualReadyAt: timestamp("actual_ready_at"),
  itemPrepMinutes: integer("item_prep_minutes"),
  startedById: varchar("started_by_id", { length: 36 }),
  startedByName: varchar("started_by_name", { length: 255 }),
  holdReason: text("hold_reason"),
  holdUntilItemId: varchar("hold_until_item_id", { length: 36 }),
  holdUntilMinutes: integer("hold_until_minutes"),
  courseNumber: integer("course_number").default(1),
  isVoided: boolean("is_voided").default(false),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedReason: text("voided_reason"),
  voidRequestId: varchar("void_request_id", { length: 36 }),
  isRefire: boolean("is_refire").default(false),
  originalItemId: varchar("original_item_id", { length: 36 }),
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
  itemCategory: varchar("item_category", { length: 30 }).default("INGREDIENT"),
  unitType: varchar("unit_type", { length: 20 }).default("WEIGHT"),
  parLevelPerShift: integer("par_level_per_shift"),
  reorderPieces: integer("reorder_pieces"),
  costPerPiece: decimal("cost_per_piece", { precision: 10, scale: 2 }),
  supplierIdRef: varchar("supplier_id_ref", { length: 36 }),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: varchar("deleted_by", { length: 36 }),
}, (t) => [
  index("idx_inventory_items_tenant_id").on(t.tenantId),
  index("idx_inventory_items_tenant_category").on(t.tenantId, t.category),
  index("idx_inventory_item_category").on(t.tenantId, t.itemCategory),
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
  vehiclePlates: text("vehicle_plates").array().default([]),
  parkingVisitCount: integer("parking_visit_count").default(0),
  parkingTotalSpent: decimal("parking_total_spent", { precision: 10, scale: 2 }).default("0"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: varchar("deleted_by", { length: 36 }),
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
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: varchar("deleted_by", { length: 36 }),
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
  supplierCode: varchar("supplier_code", { length: 30 }),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  country: varchar("country", { length: 100 }),
  paymentTerms: text("payment_terms").default("Net 30"),
  creditLimit: numeric("credit_limit", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("AED"),
  gstNumber: varchar("gst_number", { length: 30 }),
  panNumber: varchar("pan_number", { length: 20 }),
  bankName: varchar("bank_name", { length: 100 }),
  bankAccount: varchar("bank_account", { length: 40 }),
  bankIfsc: varchar("bank_ifsc", { length: 20 }),
  leadTimeDays: integer("lead_time_days").default(3),
  rating: decimal("rating", { precision: 2, scale: 1 }).default("0"),
  isPreferred: boolean("is_preferred").default(false),
  notes: text("notes"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: varchar("deleted_by", { length: 36 }),
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
  poSource: varchar("po_source", { length: 20 }).default("DIRECT"),
  quotationId: varchar("quotation_id", { length: 36 }).references(() => supplierQuotations.id),
  priority: varchar("priority", { length: 20 }).default("normal"),
  paymentTerms: varchar("payment_terms", { length: 50 }),
  deliveryOutletId: varchar("delivery_outlet_id", { length: 36 }).references(() => outlets.id),
  deliveryAddress: text("delivery_address"),
  billingAddress: text("billing_address"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).default("0"),
  shippingCharge: decimal("shipping_charge", { precision: 10, scale: 2 }).default("0"),
  amountPaid: decimal("amount_paid", { precision: 12, scale: 2 }).default("0"),
  balanceDue: decimal("balance_due", { precision: 12, scale: 2 }).default("0"),
  internalNotes: text("internal_notes"),
  sentAt: timestamp("sent_at"),
  updatedAt: timestamp("updated_at"),
  supplierName: varchar("supplier_name", { length: 255 }),
  createdByName: varchar("created_by_name", { length: 255 }),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: varchar("deleted_by", { length: 36 }),
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
  ingredientName: varchar("ingredient_name", { length: 255 }),
  unit: varchar("unit", { length: 20 }),
  receivedQuantity: decimal("received_quantity", { precision: 10, scale: 3 }).default("0"),
  pendingQuantity: decimal("pending_quantity", { precision: 10, scale: 3 }),
  taxPercent: decimal("tax_percent", { precision: 5, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0"),
  itemStatus: varchar("item_status", { length: 20 }).default("pending"),
});

export const goodsReceivedNotes = pgTable("goods_received_notes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  purchaseOrderId: varchar("purchase_order_id", { length: 36 }).notNull().references(() => purchaseOrders.id),
  grnNumber: text("grn_number").notNull(),
  receivedBy: varchar("received_by", { length: 36 }).references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  outletId: varchar("outlet_id", { length: 36 }),
  supplierId: varchar("supplier_id", { length: 36 }),
  supplierInvoiceNo: varchar("supplier_invoice_no", { length: 100 }),
  supplierInvoiceDate: date("supplier_invoice_date"),
  receivedByName: varchar("received_by_name", { length: 255 }),
  status: varchar("status", { length: 20 }).default("draft"),
  totalItems: integer("total_items"),
  totalValue: decimal("total_value", { precision: 12, scale: 2 }),
  varianceNotes: text("variance_notes"),
  poDeliveryId: varchar("po_delivery_id", { length: 36 }),
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
  acceptedQty: decimal("accepted_qty", { precision: 10, scale: 3 }),
  rejectedQty: decimal("rejected_qty", { precision: 10, scale: 3 }).default("0"),
  batchNumber: varchar("batch_number", { length: 100 }),
  expiryDate: date("expiry_date"),
  storageLocation: varchar("storage_location", { length: 100 }),
  qualityStatus: varchar("quality_status", { length: 20 }).default("accepted"),
  rejectionReason: text("rejection_reason"),
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
export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true, createdAt: true });
export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems).omit({ id: true });
export const insertGoodsReceivedNoteSchema = createInsertSchema(goodsReceivedNotes).omit({ id: true, createdAt: true });
export const insertGrnItemSchema = createInsertSchema(grnItems).omit({ id: true });
export const insertProcurementApprovalSchema = createInsertSchema(procurementApprovals).omit({ id: true, performedAt: true });

// ─── RFQ / Quotations ─────────────────────────────────────────────────────────
export const rfqStatusEnum = pgEnum("rfq_status", ["draft", "sent", "received", "comparing", "approved", "rejected", "expired"]);

export const rfqs = pgTable("rfqs", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  rfqNumber: varchar("rfq_number", { length: 30 }).notNull(),
  status: rfqStatusEnum("status").default("draft"),
  requiredBy: date("required_by"),
  notes: text("notes"),
  supplierIds: text("supplier_ids").array().default([]),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const rfqItems = pgTable("rfq_items", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqId: varchar("rfq_id", { length: 36 }).notNull().references(() => rfqs.id, { onDelete: "cascade" }),
  inventoryItemId: varchar("inventory_item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unit: varchar("unit", { length: 20 }).notNull().default("kg"),
  specifications: text("specifications"),
});

export const supplierQuotations = pgTable("supplier_quotations", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  rfqId: varchar("rfq_id", { length: 36 }).notNull().references(() => rfqs.id, { onDelete: "cascade" }),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => suppliers.id),
  quotationNumber: varchar("quotation_number", { length: 50 }),
  validityDate: date("validity_date"),
  paymentTerms: varchar("payment_terms", { length: 20 }),
  deliveryDays: integer("delivery_days"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const quotationItems = pgTable("quotation_items", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotationId: varchar("quotation_id", { length: 36 }).notNull().references(() => supplierQuotations.id, { onDelete: "cascade" }),
  inventoryItemId: varchar("inventory_item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }),
  taxPct: numeric("tax_pct", { precision: 5, scale: 2 }).default("0"),
  notAvailable: boolean("not_available").default(false),
  notes: text("notes"),
});

export const insertRfqSchema = createInsertSchema(rfqs).omit({ id: true, createdAt: true });
export const insertRfqItemSchema = createInsertSchema(rfqItems).omit({ id: true });
export const insertSupplierQuotationSchema = createInsertSchema(supplierQuotations).omit({ id: true, createdAt: true });
export const insertQuotationItemSchema = createInsertSchema(quotationItems).omit({ id: true });
export type RFQ = typeof rfqs.$inferSelect;
export type InsertRFQ = z.infer<typeof insertRfqSchema>;
export type RFQItem = typeof rfqItems.$inferSelect;
export type SupplierQuotation = typeof supplierQuotations.$inferSelect;
export type QuotationItem = typeof quotationItems.$inferSelect;

// ─── Purchase Returns ──────────────────────────────────────────────────────────
export const returnStatusEnum = pgEnum("return_status", ["draft", "approved", "dispatched", "acknowledged", "closed"]);

export const purchaseReturns = pgTable("purchase_returns", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  returnNumber: varchar("return_number", { length: 30 }).notNull(),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => suppliers.id),
  purchaseOrderId: varchar("purchase_order_id", { length: 36 }).references(() => purchaseOrders.id),
  returnType: varchar("return_type", { length: 40 }).notNull(),
  recoveryOption: varchar("recovery_option", { length: 30 }).notNull().default("Credit Note"),
  status: returnStatusEnum("status").default("draft"),
  totalValue: numeric("total_value", { precision: 12, scale: 2 }).default("0"),
  debitNote: varchar("debit_note", { length: 50 }),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const purchaseReturnItems = pgTable("purchase_return_items", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  returnId: varchar("return_id", { length: 36 }).notNull().references(() => purchaseReturns.id, { onDelete: "cascade" }),
  inventoryItemId: varchar("inventory_item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  returnQty: numeric("return_qty", { precision: 10, scale: 2 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  condition: varchar("condition", { length: 30 }),
});

export const insertPurchaseReturnSchema = createInsertSchema(purchaseReturns).omit({ id: true, createdAt: true });
export const insertPurchaseReturnItemSchema = createInsertSchema(purchaseReturnItems).omit({ id: true });
export type PurchaseReturn = typeof purchaseReturns.$inferSelect;
export type InsertPurchaseReturn = z.infer<typeof insertPurchaseReturnSchema>;
export type PurchaseReturnItem = typeof purchaseReturnItems.$inferSelect;

// ─── Stock Transfers ───────────────────────────────────────────────────────────
export const transferStatusEnum = pgEnum("transfer_status", ["pending", "approved", "in_transit", "received", "partially_received", "cancelled"]);

export const stockTransfers = pgTable("stock_transfers", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  transferNumber: varchar("transfer_number", { length: 30 }).notNull(),
  fromOutletId: varchar("from_outlet_id", { length: 36 }).references(() => outlets.id),
  toOutletId: varchar("to_outlet_id", { length: 36 }).references(() => outlets.id),
  status: transferStatusEnum("status").default("pending"),
  driverName: varchar("driver_name", { length: 100 }),
  vehicleNumber: varchar("vehicle_number", { length: 30 }),
  estimatedArrival: date("estimated_arrival"),
  dispatchedAt: timestamp("dispatched_at"),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const stockTransferItems = pgTable("stock_transfer_items", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  transferId: varchar("transfer_id", { length: 36 }).notNull().references(() => stockTransfers.id, { onDelete: "cascade" }),
  inventoryItemId: varchar("inventory_item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  requestedQty: numeric("requested_qty", { precision: 10, scale: 2 }).notNull(),
  actualQty: numeric("actual_qty", { precision: 10, scale: 2 }),
  notes: text("notes"),
});

export const insertStockTransferSchema = createInsertSchema(stockTransfers).omit({ id: true, createdAt: true, dispatchedAt: true });
export const insertStockTransferItemSchema = createInsertSchema(stockTransferItems).omit({ id: true });
export type StockTransfer = typeof stockTransfers.$inferSelect;
export type InsertStockTransfer = z.infer<typeof insertStockTransferSchema>;
export type StockTransferItem = typeof stockTransferItems.$inferSelect;

// ─── Stock Count Sessions ──────────────────────────────────────────────────────
export const countStatusEnum = pgEnum("count_status", ["scheduled", "in_progress", "completed", "approved"]);

export const stockCountSessions = pgTable("stock_count_sessions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  countNumber: varchar("count_number", { length: 30 }).notNull(),
  countType: varchar("count_type", { length: 30 }).notNull().default("Full"),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  status: countStatusEnum("status").default("scheduled"),
  scheduledDate: date("scheduled_date").notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by", { length: 36 }).references(() => users.id),
  reason: text("reason"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const stockCountItems = pgTable("stock_count_items", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: varchar("session_id", { length: 36 }).notNull().references(() => stockCountSessions.id, { onDelete: "cascade" }),
  inventoryItemId: varchar("inventory_item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  systemQty: numeric("system_qty", { precision: 10, scale: 2 }).notNull().default("0"),
  physicalQty: numeric("physical_qty", { precision: 10, scale: 2 }),
  counted: boolean("counted").default(false),
  notes: text("notes"),
  varianceReason: varchar("variance_reason", { length: 50 }),
});

export const insertStockCountSessionSchema = createInsertSchema(stockCountSessions).omit({ id: true, createdAt: true, startedAt: true, completedAt: true, approvedAt: true });
export const insertStockCountItemSchema = createInsertSchema(stockCountItems).omit({ id: true });
export type StockCountSession = typeof stockCountSessions.$inferSelect;
export type InsertStockCountSession = z.infer<typeof insertStockCountSessionSchema>;
export type StockCountItem = typeof stockCountItems.$inferSelect;

// ─── Damaged Inventory ─────────────────────────────────────────────────────────
export const damageStatusEnum = pgEnum("damage_status", ["reported", "under_review", "approved", "disposed", "written_off"]);

export const damagedInventory = pgTable("damaged_inventory", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  damageNumber: varchar("damage_number", { length: 30 }).notNull(),
  inventoryItemId: varchar("inventory_item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  damagedQty: numeric("damaged_qty", { precision: 10, scale: 2 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 10, scale: 2 }).notNull().default("0"),
  totalValue: numeric("total_value", { precision: 12, scale: 2 }).notNull().default("0"),
  damageType: varchar("damage_type", { length: 40 }).notNull(),
  damageCause: text("damage_cause"),
  damageDate: date("damage_date").notNull(),
  damageLocation: varchar("damage_location", { length: 100 }),
  disposalMethod: varchar("disposal_method", { length: 40 }).notNull().default("DISCARDED"),
  insuranceClaimNo: varchar("insurance_claim_no", { length: 50 }),
  insuranceAmount: numeric("insurance_amount", { precision: 10, scale: 2 }),
  status: damageStatusEnum("status").default("reported"),
  reviewedBy: varchar("reviewed_by", { length: 36 }).references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  photoUrl: text("photo_url"),
  causedByName: varchar("caused_by_name", { length: 100 }),
});

export const insertDamagedInventorySchema = createInsertSchema(damagedInventory).omit({ id: true, createdAt: true, reviewedAt: true });
export type DamagedInventory = typeof damagedInventory.$inferSelect;
export type InsertDamagedInventory = z.infer<typeof insertDamagedInventorySchema>;

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

export const quotationRequests = pgTable("quotation_requests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  rfqNumber: varchar("rfq_number", { length: 50 }).notNull(),
  status: varchar("status", { length: 30 }).default("draft"),
  requestedBy: varchar("requested_by", { length: 36 }).references(() => users.id),
  requestedByName: varchar("requested_by_name", { length: 255 }),
  requiredByDate: date("required_by_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  uniqueIndex("idx_quotation_requests_tenant_rfq").on(t.tenantId, t.rfqNumber),
]);

export const quotationRequestItems = pgTable("quotation_request_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  rfqId: varchar("rfq_id", { length: 36 }).notNull().references(() => quotationRequests.id),
  inventoryItemId: varchar("inventory_item_id", { length: 36 }).references(() => inventoryItems.id),
  ingredientName: varchar("ingredient_name", { length: 255 }),
  requiredQuantity: decimal("required_quantity", { precision: 10, scale: 3 }),
  unit: varchar("unit", { length: 30 }),
  specifications: text("specifications"),
});

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
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: varchar("deleted_by", { length: 36 }),
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
  tipType: varchar("tip_type", { length: 20 }),
  tipWaiterId: varchar("tip_waiter_id", { length: 36 }),
  packingCharge: decimal("packing_charge", { precision: 10, scale: 2 }).default("0"),
  packingChargeLabel: varchar("packing_charge_label", { length: 100 }).default("Packing Charge"),
  packingChargeTax: decimal("packing_charge_tax", { precision: 10, scale: 2 }).default("0"),
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
  razorpayRefundId: text("razorpay_refund_id"),
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

// Task #101: Printer Integration

export const printers = pgTable("printers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  outletId: varchar("outlet_id", { length: 36 }).references(() => outlets.id),
  printerName: text("printer_name").notNull(),
  printerType: varchar("printer_type", { length: 30 }).notNull().default("KITCHEN"),
  connectionType: varchar("connection_type", { length: 30 }).notNull().default("NETWORK_IP"),
  ipAddress: text("ip_address"),
  port: integer("port").default(9100),
  usbDevicePath: text("usb_device_path"),
  paperWidth: varchar("paper_width", { length: 10 }).default("80mm"),
  charactersPerLine: integer("characters_per_line").default(42),
  printLanguage: varchar("print_language", { length: 20 }).default("ESC_POS"),
  counterId: varchar("counter_id", { length: 36 }),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  status: varchar("status", { length: 20 }).default("unknown"),
  lastPingAt: timestamp("last_ping_at", { withTimezone: true }),
  lastPrintAt: timestamp("last_print_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_printers_tenant").on(t.tenantId),
  index("idx_printers_outlet").on(t.outletId),
  index("idx_printers_tenant_active").on(t.tenantId, t.isActive),
]);

export const insertPrinterSchema = createInsertSchema(printers).omit({ id: true, createdAt: true });
export type Printer = typeof printers.$inferSelect;
export type InsertPrinter = z.infer<typeof insertPrinterSchema>;

export const printerTemplates = pgTable("printer_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  templateType: varchar("template_type", { length: 20 }).notNull(),
  templateName: text("template_name").notNull(),
  headerLines: jsonb("header_lines").default([]),
  footerLines: jsonb("footer_lines").default(["Thank you for dining with us!"]),
  showLogo: boolean("show_logo").default(false),
  logoUrl: text("logo_url"),
  showTaxBreakdown: boolean("show_tax_breakdown").default(true),
  showItemNotes: boolean("show_item_notes").default(true),
  showModifications: boolean("show_modifications").default(true),
  showQrCode: boolean("show_qr_code").default(false),
  qrCodeContent: text("qr_code_content"),
  fontSize: varchar("font_size", { length: 20 }).default("normal"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_printer_templates_tenant").on(t.tenantId),
  uniqueIndex("idx_printer_templates_tenant_type").on(t.tenantId, t.templateType),
]);

export const insertPrinterTemplateSchema = createInsertSchema(printerTemplates).omit({ id: true, createdAt: true });
export type PrinterTemplate = typeof printerTemplates.$inferSelect;
export type InsertPrinterTemplate = z.infer<typeof insertPrinterTemplateSchema>;

// ─── Task #103: Multi-Outlet Pricing ─────────────────────────────────────────

export const outletMenuPrices = pgTable("outlet_menu_prices", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull(),
  priceType: text("price_type").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),
  orderType: text("order_type"),
  timeSlotStart: text("time_slot_start"),
  timeSlotEnd: text("time_slot_end"),
  dayOfWeek: jsonb("day_of_week"),
  customerSegment: text("customer_segment"),
  validFrom: text("valid_from"),
  validUntil: text("valid_until"),
  priority: integer("priority").default(0),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_outlet_menu_prices_tenant").on(t.tenantId),
  index("idx_outlet_menu_prices_outlet").on(t.outletId),
  index("idx_outlet_menu_prices_item").on(t.menuItemId),
  index("idx_outlet_menu_prices_tenant_outlet_item").on(t.tenantId, t.outletId, t.menuItemId),
]);

export const insertOutletMenuPriceSchema = createInsertSchema(outletMenuPrices).omit({ id: true, createdAt: true, updatedAt: true });
export type OutletMenuPrice = typeof outletMenuPrices.$inferSelect;
export type InsertOutletMenuPrice = z.infer<typeof insertOutletMenuPriceSchema>;

export const priceResolutionLog = pgTable("price_resolution_log", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  orderId: varchar("order_id", { length: 36 }),
  orderItemId: varchar("order_item_id", { length: 36 }),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull(),
  menuItemName: text("menu_item_name"),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  resolvedPrice: decimal("resolved_price", { precision: 10, scale: 2 }).notNull(),
  priceRuleId: varchar("price_rule_id", { length: 36 }),
  priceTypeApplied: text("price_type_applied"),
  resolutionReason: text("resolution_reason"),
  resolvedAt: timestamp("resolved_at").defaultNow(),
}, (t) => [
  index("idx_price_resolution_log_tenant").on(t.tenantId),
  index("idx_price_resolution_log_menu_item").on(t.menuItemId),
  index("idx_price_resolution_log_order").on(t.orderId),
]);

export const insertPriceResolutionLogSchema = createInsertSchema(priceResolutionLog).omit({ id: true, resolvedAt: true });
export type PriceResolutionLogEntry = typeof priceResolutionLog.$inferSelect;
export type InsertPriceResolutionLogEntry = z.infer<typeof insertPriceResolutionLogSchema>;

export const orderCourses = pgTable("order_courses", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  orderId: varchar("order_id", { length: 36 }).notNull(),
  courseNumber: integer("course_number").notNull(),
  courseName: varchar("course_name", { length: 50 }),
  status: varchar("status", { length: 20 }).default("waiting"),
  fireAt: timestamp("fire_at"),
  firedBy: varchar("fired_by", { length: 36 }),
  firedByName: varchar("fired_by_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_order_courses_order_id").on(t.orderId),
]);

export const insertOrderCourseSchema = createInsertSchema(orderCourses).omit({ id: true, createdAt: true });
export type OrderCourse = typeof orderCourses.$inferSelect;
export type InsertOrderCourse = z.infer<typeof insertOrderCourseSchema>;

export const kitchenSettings = pgTable("kitchen_settings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().unique(),
  cookingControlMode: varchar("cooking_control_mode", { length: 20 }).default("selective"),
  showTimingSuggestions: boolean("show_timing_suggestions").default(true),
  alertOverdueMinutes: integer("alert_overdue_minutes").default(3),
  allowRushOverride: boolean("allow_rush_override").default(true),
  rushRequiresManagerPin: boolean("rush_requires_manager_pin").default(true),
  managerPinHash: text("manager_pin_hash"),
  autoHoldBarItems: boolean("auto_hold_bar_items").default(true),
  defaultPrepSource: varchar("default_prep_source", { length: 20 }).default("recipe"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertKitchenSettingsSchema = createInsertSchema(kitchenSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type KitchenSettings = typeof kitchenSettings.$inferSelect;
export type InsertKitchenSettings = z.infer<typeof insertKitchenSettingsSchema>;

// ─── Task #110: Cooking & Preparation Time Tracking ──────────────────────────

export const itemTimeLogs = pgTable("item_time_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  orderId: varchar("order_id", { length: 36 }).notNull(),
  orderNumber: varchar("order_number", { length: 50 }),
  orderItemId: varchar("order_item_id", { length: 36 }).notNull().unique(),
  menuItemId: varchar("menu_item_id", { length: 36 }),
  menuItemName: varchar("menu_item_name", { length: 255 }),
  counterId: varchar("counter_id", { length: 36 }),
  counterName: varchar("counter_name", { length: 100 }),
  chefId: varchar("chef_id", { length: 36 }),
  chefName: varchar("chef_name", { length: 255 }),
  shiftDate: date("shift_date").notNull(),
  shiftType: varchar("shift_type", { length: 20 }),
  orderType: varchar("order_type", { length: 30 }),
  tableNumber: varchar("table_number", { length: 20 }),
  orderReceivedAt: timestamp("order_received_at", { withTimezone: true }),
  kotSentAt: timestamp("kot_sent_at", { withTimezone: true }),
  ticketAcknowledgedAt: timestamp("ticket_acknowledged_at", { withTimezone: true }),
  cookingStartedAt: timestamp("cooking_started_at", { withTimezone: true }),
  cookingReadyAt: timestamp("cooking_ready_at", { withTimezone: true }),
  orderFullyReadyAt: timestamp("order_fully_ready_at", { withTimezone: true }),
  waiterPickupAt: timestamp("waiter_pickup_at", { withTimezone: true }),
  servedAt: timestamp("served_at", { withTimezone: true }),
  waiterResponseTime: integer("waiter_response_time"),
  kitchenPickupTime: integer("kitchen_pickup_time"),
  idleWaitTime: integer("idle_wait_time"),
  actualCookingTime: integer("actual_cooking_time"),
  passWaitTime: integer("pass_wait_time"),
  serviceDeliveryTime: integer("service_delivery_time"),
  totalKitchenTime: integer("total_kitchen_time"),
  totalCycleTime: integer("total_cycle_time"),
  recipeEstimatedTime: integer("recipe_estimated_time"),
  timeVariance: integer("time_variance"),
  variancePercent: decimal("variance_percent", { precision: 5, scale: 2 }),
  performanceFlag: varchar("performance_flag", { length: 20 }),
  hadModifications: boolean("had_modifications").default(false),
  hadAllergyFlag: boolean("had_allergy_flag").default(false),
  wasRushOrder: boolean("was_rush_order").default(false),
  wasVipOrder: boolean("was_vip_order").default(false),
  courseNumber: integer("course_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_item_time_logs_tenant").on(t.tenantId),
  index("idx_item_time_logs_order_id_drz").on(t.orderId),
  index("idx_item_time_logs_chef_id_drz").on(t.chefId),
  index("idx_item_time_logs_menu_item_drz").on(t.menuItemId),
  index("idx_item_time_logs_shift_date_drz").on(t.tenantId, t.shiftDate),
  index("idx_item_time_logs_outlet_drz").on(t.outletId, t.shiftDate),
]);

export const insertItemTimeLogSchema = createInsertSchema(itemTimeLogs).omit({ id: true, createdAt: true });
export type ItemTimeLog = typeof itemTimeLogs.$inferSelect;
export type InsertItemTimeLog = z.infer<typeof insertItemTimeLogSchema>;

export const orderTimeSummary = pgTable("order_time_summary", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  orderId: varchar("order_id", { length: 36 }).notNull().unique(),
  orderNumber: varchar("order_number", { length: 50 }),
  orderType: varchar("order_type", { length: 30 }),
  tableNumber: varchar("table_number", { length: 20 }),
  waiterId: varchar("waiter_id", { length: 36 }),
  waiterName: varchar("waiter_name", { length: 255 }),
  totalItems: integer("total_items"),
  orderReceivedAt: timestamp("order_received_at", { withTimezone: true }),
  kotSentAt: timestamp("kot_sent_at", { withTimezone: true }),
  firstItemReadyAt: timestamp("first_item_ready_at", { withTimezone: true }),
  allItemsReadyAt: timestamp("all_items_ready_at", { withTimezone: true }),
  firstItemServedAt: timestamp("first_item_served_at", { withTimezone: true }),
  allItemsServedAt: timestamp("all_items_served_at", { withTimezone: true }),
  totalKitchenTime: integer("total_kitchen_time"),
  totalCycleTime: integer("total_cycle_time"),
  targetTime: integer("target_time"),
  metTarget: boolean("met_target"),
  delayReason: text("delay_reason"),
  customerRating: integer("customer_rating"),
  shiftDate: date("shift_date"),
  shiftType: varchar("shift_type", { length: 20 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_order_time_summary_tenant_drz").on(t.tenantId, t.shiftDate),
]);

export const insertOrderTimeSummarySchema = createInsertSchema(orderTimeSummary).omit({ id: true, createdAt: true });
export type OrderTimeSummary = typeof orderTimeSummary.$inferSelect;
export type InsertOrderTimeSummary = z.infer<typeof insertOrderTimeSummarySchema>;

export const dailyTimePerformance = pgTable("daily_time_performance", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  performanceDate: date("performance_date").notNull(),
  shiftType: varchar("shift_type", { length: 20 }),
  totalOrders: integer("total_orders").default(0),
  ordersOnTime: integer("orders_on_time").default(0),
  ordersDelayed: integer("orders_delayed").default(0),
  ordersVeryFast: integer("orders_very_fast").default(0),
  avgWaiterResponse: integer("avg_waiter_response"),
  avgKitchenPickup: integer("avg_kitchen_pickup"),
  avgIdleWait: integer("avg_idle_wait"),
  avgCookingTime: integer("avg_cooking_time"),
  avgPassWait: integer("avg_pass_wait"),
  avgTotalKitchenTime: integer("avg_total_kitchen_time"),
  avgTotalCycleTime: integer("avg_total_cycle_time"),
  peakHour: integer("peak_hour"),
  peakAvgWait: integer("peak_avg_wait"),
  byCounter: jsonb("by_counter"),
  byChef: jsonb("by_chef"),
  byDish: jsonb("by_dish"),
  targetKitchenTime: integer("target_kitchen_time"),
  targetCycleTime: integer("target_cycle_time"),
  onTimePercentage: decimal("on_time_percentage", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex("idx_daily_time_perf_unique").on(t.tenantId, t.outletId, t.performanceDate, t.shiftType),
]);

export const insertDailyTimePerformanceSchema = createInsertSchema(dailyTimePerformance).omit({ id: true, createdAt: true });
export type DailyTimePerformance = typeof dailyTimePerformance.$inferSelect;
export type InsertDailyTimePerformance = z.infer<typeof insertDailyTimePerformanceSchema>;

export const recipeTimeBenchmarks = pgTable("recipe_time_benchmarks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull(),
  counterId: varchar("counter_id", { length: 36 }),
  estimatedPrepTime: integer("estimated_prep_time").notNull(),
  actualAvgTime: integer("actual_avg_time"),
  fastestTime: integer("fastest_time"),
  slowestTime: integer("slowest_time"),
  p75Time: integer("p75_time"),
  sampleCount: integer("sample_count").default(0),
  lastCalculated: timestamp("last_calculated", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex("idx_recipe_benchmarks_unique").on(t.tenantId, t.menuItemId, t.counterId),
]);

export const insertRecipeTimeBenchmarkSchema = createInsertSchema(recipeTimeBenchmarks).omit({ id: true, createdAt: true });
export type RecipeTimeBenchmark = typeof recipeTimeBenchmarks.$inferSelect;
export type InsertRecipeTimeBenchmark = z.infer<typeof insertRecipeTimeBenchmarkSchema>;

export const timePerformanceTargets = pgTable("time_performance_targets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  orderType: varchar("order_type", { length: 30 }).default("ALL"),
  targetName: varchar("target_name", { length: 100 }),
  waiterResponseTarget: integer("waiter_response_target").default(120),
  kitchenPickupTarget: integer("kitchen_pickup_target").default(60),
  totalKitchenTarget: integer("total_kitchen_target").default(900),
  totalCycleTarget: integer("total_cycle_target").default(1500),
  alertAtPercent: integer("alert_at_percent").default(80),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertTimePerformanceTargetSchema = createInsertSchema(timePerformanceTargets).omit({ id: true, createdAt: true });
export type TimePerformanceTarget = typeof timePerformanceTargets.$inferSelect;
export type InsertTimePerformanceTarget = z.infer<typeof insertTimePerformanceTargetSchema>;

// ─── Task #112: Order Ticket History ─────────────────────────────────────────

export const itemVoidRequests = pgTable("item_void_requests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  orderId: varchar("order_id", { length: 36 }).notNull(),
  orderNumber: varchar("order_number", { length: 50 }),
  orderItemId: varchar("order_item_id", { length: 36 }).notNull(),
  menuItemName: varchar("menu_item_name", { length: 255 }),
  quantity: integer("quantity"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  totalValue: decimal("total_value", { precision: 10, scale: 2 }),
  voidReason: text("void_reason").notNull(),
  voidType: varchar("void_type", { length: 30 }).notNull(),
  status: varchar("status", { length: 20 }).default("pending"),
  requestedBy: varchar("requested_by", { length: 36 }).notNull(),
  requestedByName: varchar("requested_by_name", { length: 255 }),
  requestedByRole: varchar("requested_by_role", { length: 50 }),
  approvedBy: varchar("approved_by", { length: 36 }),
  approvedByName: varchar("approved_by_name", { length: 255 }),
  rejectedReason: text("rejected_reason"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_void_requests_tenant").on(t.tenantId),
  index("idx_void_requests_order").on(t.orderId),
  index("idx_void_requests_status").on(t.tenantId, t.status),
]);

export const insertItemVoidRequestSchema = createInsertSchema(itemVoidRequests).omit({ id: true, createdAt: true });
export type ItemVoidRequest = typeof itemVoidRequests.$inferSelect;
export type InsertItemVoidRequest = z.infer<typeof insertItemVoidRequestSchema>;

export const voidedItems = pgTable("voided_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  orderId: varchar("order_id", { length: 36 }).notNull(),
  orderItemId: varchar("order_item_id", { length: 36 }).notNull(),
  voidRequestId: varchar("void_request_id", { length: 36 }).notNull(),
  menuItemName: varchar("menu_item_name", { length: 255 }),
  quantity: integer("quantity"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  totalValue: decimal("total_value", { precision: 10, scale: 2 }),
  voidReason: text("void_reason"),
  voidType: varchar("void_type", { length: 30 }),
  voidedBy: varchar("voided_by", { length: 36 }).notNull(),
  voidedByName: varchar("voided_by_name", { length: 255 }),
  approvedBy: varchar("approved_by", { length: 36 }).notNull(),
  approvedByName: varchar("approved_by_name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_voided_items_tenant").on(t.tenantId),
  index("idx_voided_items_order").on(t.orderId),
]);

export const insertVoidedItemSchema = createInsertSchema(voidedItems).omit({ id: true, createdAt: true });
export type VoidedItem = typeof voidedItems.$inferSelect;
export type InsertVoidedItem = z.infer<typeof insertVoidedItemSchema>;

export const itemRefireRequests = pgTable("item_refire_requests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  orderId: varchar("order_id", { length: 36 }).notNull(),
  orderNumber: varchar("order_number", { length: 50 }),
  orderItemId: varchar("order_item_id", { length: 36 }).notNull(),
  newOrderItemId: varchar("new_order_item_id", { length: 36 }),
  menuItemName: varchar("menu_item_name", { length: 255 }),
  quantity: integer("quantity"),
  refireReason: text("refire_reason").notNull(),
  priority: varchar("priority", { length: 20 }).default("high"),
  assignToChefId: varchar("assign_to_chef_id", { length: 36 }),
  assignToChefName: varchar("assign_to_chef_name", { length: 255 }),
  newKotNumber: varchar("new_kot_number", { length: 50 }),
  status: varchar("status", { length: 20 }).default("sent"),
  requestedBy: varchar("requested_by", { length: 36 }).notNull(),
  requestedByName: varchar("requested_by_name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_refire_requests_tenant").on(t.tenantId),
  index("idx_refire_requests_order").on(t.orderId),
]);

export const insertItemRefireRequestSchema = createInsertSchema(itemRefireRequests).omit({ id: true, createdAt: true });
export type ItemRefireRequest = typeof itemRefireRequests.$inferSelect;
export type InsertItemRefireRequest = z.infer<typeof insertItemRefireRequestSchema>;

// ── Task #114: Alert System ────────────────────────────────────────────────

export const alertDefinitions = pgTable("alert_definitions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }),
  alertCode: varchar("alert_code", { length: 20 }).notNull(),
  alertName: varchar("alert_name", { length: 100 }).notNull(),
  soundKey: varchar("sound_key", { length: 50 }).notNull(),
  urgency: varchar("urgency", { length: 20 }).notNull().default("normal"),
  targetRoles: jsonb("target_roles").notNull().default([]),
  requiresAcknowledge: boolean("requires_acknowledge").default(false),
  repeatIntervalSec: integer("repeat_interval_sec").default(0),
  canBeDisabled: boolean("can_be_disabled").default(true),
  minVolume: integer("min_volume").default(0),
  isActive: boolean("is_active").default(true),
  isSystemDefault: boolean("is_system_default").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_alert_def_code").on(t.alertCode),
  index("idx_alert_def_tenant").on(t.tenantId),
]);

export const insertAlertDefinitionSchema = createInsertSchema(alertDefinitions).omit({ id: true, createdAt: true });
export type AlertDefinition = typeof alertDefinitions.$inferSelect;
export type InsertAlertDefinition = z.infer<typeof insertAlertDefinitionSchema>;

export const alertOutletConfigs = pgTable("alert_outlet_configs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  alertCode: varchar("alert_code", { length: 20 }).notNull(),
  isEnabled: boolean("is_enabled").default(true),
  volumeLevel: integer("volume_level").default(80),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex("idx_alert_outlet_config_unique").on(t.tenantId, t.outletId, t.alertCode),
]);

export const insertAlertOutletConfigSchema = createInsertSchema(alertOutletConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type AlertOutletConfig = typeof alertOutletConfigs.$inferSelect;
export type InsertAlertOutletConfig = z.infer<typeof insertAlertOutletConfigSchema>;

export const alertEvents = pgTable("alert_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  alertCode: varchar("alert_code", { length: 20 }).notNull(),
  urgency: varchar("urgency", { length: 20 }).notNull(),
  referenceId: varchar("reference_id", { length: 36 }),
  referenceNumber: varchar("reference_number", { length: 50 }),
  message: text("message").notNull(),
  targetRoles: jsonb("target_roles").notNull().default([]),
  isResolved: boolean("is_resolved").default(false),
  acknowledgedBy: varchar("acknowledged_by", { length: 36 }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_alert_events_tenant").on(t.tenantId, t.createdAt),
  index("idx_alert_events_outlet").on(t.outletId, t.isResolved),
]);

export const insertAlertEventSchema = createInsertSchema(alertEvents).omit({ id: true, createdAt: true });
export type AlertEvent = typeof alertEvents.$inferSelect;
export type InsertAlertEvent = z.infer<typeof insertAlertEventSchema>;

// ── Task #118: Cash Machine ────────────────────────────────────────────────

export const cashSessions = pgTable("cash_sessions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  posSessionId: varchar("pos_session_id", { length: 36 }),
  sessionNumber: varchar("session_number", { length: 50 }).notNull(),
  cashierId: varchar("cashier_id", { length: 36 }).notNull(),
  cashierName: varchar("cashier_name", { length: 255 }),
  currencyCode: varchar("currency_code", { length: 10 }).notNull().default("INR"),
  currencySymbol: varchar("currency_symbol", { length: 10 }).default("₹"),
  status: varchar("status", { length: 20 }).default("open"),
  openingFloat: decimal("opening_float", { precision: 12, scale: 2 }).notNull().default("0"),
  openingFloatBreakdown: jsonb("opening_float_breakdown"),
  expectedClosingCash: decimal("expected_closing_cash", { precision: 12, scale: 2 }).default("0"),
  physicalClosingCash: decimal("physical_closing_cash", { precision: 12, scale: 2 }),
  closingBreakdown: jsonb("closing_breakdown"),
  cashVariance: decimal("cash_variance", { precision: 12, scale: 2 }),
  varianceReason: text("variance_reason"),
  totalCashSales: decimal("total_cash_sales", { precision: 12, scale: 2 }).default("0"),
  totalCashRefunds: decimal("total_cash_refunds", { precision: 12, scale: 2 }).default("0"),
  totalCashPayouts: decimal("total_cash_payouts", { precision: 12, scale: 2 }).default("0"),
  totalTransactions: integer("total_transactions").default(0),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  approvedBy: varchar("approved_by", { length: 36 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex("idx_cash_sessions_number").on(t.tenantId, t.sessionNumber),
  index("idx_cash_sessions_cashier").on(t.tenantId, t.cashierId, t.status),
  index("idx_cash_sessions_outlet").on(t.outletId, t.status),
]);

export const insertCashSessionSchema = createInsertSchema(cashSessions).omit({ id: true, createdAt: true });
export type CashSession = typeof cashSessions.$inferSelect;
export type InsertCashSession = z.infer<typeof insertCashSessionSchema>;

export const cashDrawerEvents = pgTable("cash_drawer_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  sessionId: varchar("session_id", { length: 36 }).notNull(),
  eventType: varchar("event_type", { length: 30 }).notNull(),
  orderId: varchar("order_id", { length: 36 }),
  billId: varchar("bill_id", { length: 36 }),
  referenceNumber: varchar("reference_number", { length: 50 }),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  tenderedAmount: decimal("tendered_amount", { precision: 12, scale: 2 }),
  changeGiven: decimal("change_given", { precision: 12, scale: 2 }),
  changeBreakdown: jsonb("change_breakdown"),
  runningBalance: decimal("running_balance", { precision: 12, scale: 2 }),
  performedBy: varchar("performed_by", { length: 36 }).notNull(),
  performedByName: varchar("performed_by_name", { length: 255 }),
  reason: text("reason"),
  isManual: boolean("is_manual").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_cash_events_session").on(t.sessionId, t.createdAt),
  index("idx_cash_events_tenant").on(t.tenantId, t.createdAt),
]);

export const insertCashDrawerEventSchema = createInsertSchema(cashDrawerEvents).omit({ id: true, createdAt: true });
export type CashDrawerEvent = typeof cashDrawerEvents.$inferSelect;
export type InsertCashDrawerEvent = z.infer<typeof insertCashDrawerEventSchema>;

export const cashPayouts = pgTable("cash_payouts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  sessionId: varchar("session_id", { length: 36 }).notNull(),
  payoutNumber: varchar("payout_number", { length: 50 }),
  payoutType: varchar("payout_type", { length: 30 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  recipient: varchar("recipient", { length: 255 }),
  reason: text("reason").notNull(),
  approvedBy: varchar("approved_by", { length: 36 }),
  receiptUrl: text("receipt_url"),
  performedBy: varchar("performed_by", { length: 36 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_cash_payouts_session").on(t.sessionId),
]);

export const insertCashPayoutSchema = createInsertSchema(cashPayouts).omit({ id: true, createdAt: true });
export type CashPayout = typeof cashPayouts.$inferSelect;
export type InsertCashPayout = z.infer<typeof insertCashPayoutSchema>;

export const cashHandovers = pgTable("cash_handovers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  sessionId: varchar("session_id", { length: 36 }).notNull(),
  handoverNumber: varchar("handover_number", { length: 50 }),
  amountHandedOver: decimal("amount_handed_over", { precision: 12, scale: 2 }).notNull(),
  denominationBreakdown: jsonb("denomination_breakdown"),
  handedBy: varchar("handed_by", { length: 36 }).notNull(),
  handedByName: varchar("handed_by_name", { length: 255 }),
  receivedBy: varchar("received_by", { length: 36 }),
  receivedByName: varchar("received_by_name", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_cash_handovers_session").on(t.sessionId),
]);

export const insertCashHandoverSchema = createInsertSchema(cashHandovers).omit({ id: true, createdAt: true });
export type CashHandover = typeof cashHandovers.$inferSelect;
export type InsertCashHandover = z.infer<typeof insertCashHandoverSchema>;

// Task #120: Tip Management System

export const outletTipSettings = pgTable("outlet_tip_settings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  tipsEnabled: boolean("tips_enabled").default(false),
  showOnPos: boolean("show_on_pos").default(true),
  showOnQr: boolean("show_on_qr").default(false),
  showOnReceipt: boolean("show_on_receipt").default(true),
  promptStyle: varchar("prompt_style", { length: 20 }).default("BUTTONS"),
  suggestedPct1: integer("suggested_pct_1").default(5),
  suggestedPct2: integer("suggested_pct_2").default(10),
  suggestedPct3: integer("suggested_pct_3").default(15),
  allowCustomAmount: boolean("allow_custom_amount").default(true),
  tipBasis: varchar("tip_basis", { length: 20 }).default("SUBTOTAL"),
  distributionMethod: varchar("distribution_method", { length: 20 }).default("INDIVIDUAL"),
  waiterSharePct: integer("waiter_share_pct").default(70),
  kitchenSharePct: integer("kitchen_share_pct").default(30),
  tipIsTaxable: boolean("tip_is_taxable").default(false),
  currencyCode: varchar("currency_code", { length: 10 }).default("INR"),
  currencySymbol: varchar("currency_symbol", { length: 5 }).default("₹"),
  updatedBy: varchar("updated_by", { length: 36 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertOutletTipSettingsSchema = createInsertSchema(outletTipSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type OutletTipSettings = typeof outletTipSettings.$inferSelect;
export type InsertOutletTipSettings = z.infer<typeof insertOutletTipSettingsSchema>;

export const billTips = pgTable("bill_tips", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  billId: varchar("bill_id", { length: 36 }).notNull(),
  orderId: varchar("order_id", { length: 36 }).notNull(),
  tipAmount: decimal("tip_amount", { precision: 10, scale: 2 }).notNull(),
  tipType: varchar("tip_type", { length: 20 }).notNull(),
  tipPercentage: decimal("tip_percentage", { precision: 5, scale: 2 }),
  tipBasisAmount: decimal("tip_basis_amount", { precision: 10, scale: 2 }),
  paymentMethod: varchar("payment_method", { length: 30 }),
  waiterId: varchar("waiter_id", { length: 36 }),
  waiterName: varchar("waiter_name", { length: 255 }),
  distributionMethod: varchar("distribution_method", { length: 20 }),
  isDistributed: boolean("is_distributed").default(false),
  distributedAt: timestamp("distributed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertBillTipSchema = createInsertSchema(billTips).omit({ id: true, createdAt: true });
export type BillTip = typeof billTips.$inferSelect;
export type InsertBillTip = z.infer<typeof insertBillTipSchema>;

export const tipDistributions = pgTable("tip_distributions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  billTipId: varchar("bill_tip_id", { length: 36 }).notNull(),
  staffId: varchar("staff_id", { length: 36 }).notNull(),
  staffName: varchar("staff_name", { length: 255 }),
  staffRole: varchar("staff_role", { length: 50 }),
  sharePercentage: decimal("share_percentage", { precision: 5, scale: 2 }),
  shareAmount: decimal("share_amount", { precision: 10, scale: 2 }),
  distributionDate: text("distribution_date"),
  isPaid: boolean("is_paid").default(false),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertTipDistributionSchema = createInsertSchema(tipDistributions).omit({ id: true, createdAt: true });
export type TipDistribution = typeof tipDistributions.$inferSelect;
export type InsertTipDistribution = z.infer<typeof insertTipDistributionSchema>;

// Task #122: Packing Charges Management

export const outletPackingSettings = pgTable("outlet_packing_settings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  takeawayChargeEnabled: boolean("takeaway_charge_enabled").default(false),
  deliveryChargeEnabled: boolean("delivery_charge_enabled").default(false),
  chargeType: varchar("charge_type", { length: 20 }).default("FIXED_PER_ORDER"),
  takeawayChargeAmount: decimal("takeaway_charge_amount", { precision: 10, scale: 2 }).default("0"),
  deliveryChargeAmount: decimal("delivery_charge_amount", { precision: 10, scale: 2 }).default("0"),
  takeawayPerItem: decimal("takeaway_per_item", { precision: 10, scale: 2 }).default("0"),
  deliveryPerItem: decimal("delivery_per_item", { precision: 10, scale: 2 }).default("0"),
  maxChargePerOrder: decimal("max_charge_per_order", { precision: 10, scale: 2 }),
  packingChargeTaxable: boolean("packing_charge_taxable").default(false),
  packingChargeTaxPct: decimal("packing_charge_tax_pct", { precision: 5, scale: 2 }).default("0"),
  showOnReceipt: boolean("show_on_receipt").default(true),
  chargeLabel: varchar("charge_label", { length: 100 }).default("Packing Charge"),
  currencyCode: varchar("currency_code", { length: 10 }).default("INR"),
  currencySymbol: varchar("currency_symbol", { length: 5 }).default("₹"),
  updatedBy: varchar("updated_by", { length: 36 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertOutletPackingSettingsSchema = createInsertSchema(outletPackingSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type OutletPackingSettings = typeof outletPackingSettings.$inferSelect;
export type InsertOutletPackingSettings = z.infer<typeof insertOutletPackingSettingsSchema>;

export const packingChargeCategories = pgTable("packing_charge_categories", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  categoryName: varchar("category_name", { length: 100 }).notNull(),
  takeawayCharge: decimal("takeaway_charge", { precision: 10, scale: 2 }).default("0"),
  deliveryCharge: decimal("delivery_charge", { precision: 10, scale: 2 }).default("0"),
  appliesToCategories: jsonb("applies_to_categories"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertPackingChargeCategorySchema = createInsertSchema(packingChargeCategories).omit({ id: true, createdAt: true });
export type PackingChargeCategory = typeof packingChargeCategories.$inferSelect;
export type InsertPackingChargeCategory = z.infer<typeof insertPackingChargeCategorySchema>;

export const packingChargeExemptions = pgTable("packing_charge_exemptions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  exemptionType: varchar("exemption_type", { length: 20 }).notNull(),
  referenceId: varchar("reference_id", { length: 36 }).notNull(),
  referenceName: varchar("reference_name", { length: 255 }),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertPackingChargeExemptionSchema = createInsertSchema(packingChargeExemptions).omit({ id: true, createdAt: true });
export type PackingChargeExemption = typeof packingChargeExemptions.$inferSelect;
export type InsertPackingChargeExemption = z.infer<typeof insertPackingChargeExemptionSchema>;

export const billPackingCharges = pgTable("bill_packing_charges", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  billId: varchar("bill_id", { length: 36 }).notNull(),
  orderId: varchar("order_id", { length: 36 }).notNull(),
  orderType: varchar("order_type", { length: 20 }).notNull(),
  chargeType: varchar("charge_type", { length: 20 }).notNull(),
  chargeAmount: decimal("charge_amount", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  itemCount: integer("item_count"),
  breakdown: jsonb("breakdown"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertBillPackingChargeSchema = createInsertSchema(billPackingCharges).omit({ id: true, createdAt: true });
export type BillPackingCharge = typeof billPackingCharges.$inferSelect;
export type InsertBillPackingCharge = z.infer<typeof insertBillPackingChargeSchema>;

// Task #125: In-App Support Ticket System
export const inAppSupportTickets = pgTable("in_app_support_tickets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  createdBy: varchar("created_by", { length: 36 }).notNull(),
  createdByName: varchar("created_by_name", { length: 255 }),
  subject: varchar("subject", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  priority: varchar("priority", { length: 20 }).default("normal"),
  status: varchar("status", { length: 20 }).default("open"),
  assignedTo: varchar("assigned_to", { length: 36 }),
  pageContext: text("page_context"),
  browserInfo: text("browser_info"),
  tenantPlan: varchar("tenant_plan", { length: 50 }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  lastRepliedAt: timestamp("last_replied_at", { withTimezone: true }),
  replyCount: integer("reply_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const inAppSupportTicketReplies = pgTable("in_app_support_ticket_replies", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id", { length: 36 }).notNull(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  authorId: varchar("author_id", { length: 36 }).notNull(),
  authorName: varchar("author_name", { length: 255 }),
  isAdmin: boolean("is_admin").default(false),
  message: text("message").notNull(),
  attachments: jsonb("attachments"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertInAppSupportTicketSchema = createInsertSchema(inAppSupportTickets).omit({
  id: true, createdAt: true, updatedAt: true, replyCount: true, resolvedAt: true, lastRepliedAt: true,
}).extend({
  subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(255),
  description: z.string().trim().min(10, "Description must be at least 10 characters"),
  category: z.enum(["general", "billing", "technical", "feature", "training"]).default("general"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

export const insertInAppSupportTicketReplySchema = createInsertSchema(inAppSupportTicketReplies).omit({
  id: true, createdAt: true,
}).extend({
  message: z.string().trim().min(1, "Message cannot be empty"),
});

export type InAppSupportTicket = typeof inAppSupportTickets.$inferSelect;
export type InsertInAppSupportTicket = z.infer<typeof insertInAppSupportTicketSchema>;
export type InAppSupportTicketReply = typeof inAppSupportTicketReplies.$inferSelect;
export type InsertInAppSupportTicketReply = z.infer<typeof insertInAppSupportTicketReplySchema>;

// Task #132: Special Resource Management System
export const specialResources = pgTable("special_resources", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  resourceCode: varchar("resource_code", { length: 30 }).notNull(),
  resourceName: varchar("resource_name", { length: 100 }).notNull(),
  resourceIcon: varchar("resource_icon", { length: 10 }).default("🪑"),
  totalUnits: integer("total_units").notNull().default(0),
  availableUnits: integer("available_units").notNull().default(0),
  inUseUnits: integer("in_use_units").default(0),
  underCleaningUnits: integer("under_cleaning_units").default(0),
  damagedUnits: integer("damaged_units").default(0),
  isTrackable: boolean("is_trackable").default(true),
  requiresSetupTime: integer("requires_setup_time").default(0),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertSpecialResourceSchema = createInsertSchema(specialResources).omit({ id: true, createdAt: true, updatedAt: true });
export type SpecialResource = typeof specialResources.$inferSelect;
export type InsertSpecialResource = z.infer<typeof insertSpecialResourceSchema>;

export const resourceUnits = pgTable("resource_units", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  resourceId: varchar("resource_id", { length: 36 }).notNull(),
  unitCode: varchar("unit_code", { length: 30 }).notNull(),
  unitName: varchar("unit_name", { length: 100 }),
  status: varchar("status", { length: 20 }).default("available"),
  currentTableId: varchar("current_table_id", { length: 36 }),
  currentOrderId: varchar("current_order_id", { length: 36 }),
  lastCleanedAt: timestamp("last_cleaned_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertResourceUnitSchema = createInsertSchema(resourceUnits).omit({ id: true, createdAt: true });
export type ResourceUnit = typeof resourceUnits.$inferSelect;
export type InsertResourceUnit = z.infer<typeof insertResourceUnitSchema>;

export const resourceAssignments = pgTable("resource_assignments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  resourceId: varchar("resource_id", { length: 36 }).notNull(),
  resourceName: varchar("resource_name", { length: 100 }),
  resourceUnitId: varchar("resource_unit_id", { length: 36 }),
  unitCode: varchar("unit_code", { length: 30 }),
  tableId: varchar("table_id", { length: 36 }),
  tableNumber: varchar("table_number", { length: 20 }),
  orderId: varchar("order_id", { length: 36 }),
  reservationId: varchar("reservation_id", { length: 36 }),
  quantity: integer("quantity").default(1),
  assignedFor: varchar("assigned_for", { length: 50 }),
  status: varchar("status", { length: 20 }).default("assigned"),
  specialNotes: text("special_notes"),
  assignedBy: varchar("assigned_by", { length: 36 }),
  assignedByName: varchar("assigned_by_name", { length: 255 }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  requiresCleaning: boolean("requires_cleaning").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertResourceAssignmentSchema = createInsertSchema(resourceAssignments).omit({ id: true, createdAt: true, assignedAt: true });
export type ResourceAssignment = typeof resourceAssignments.$inferSelect;
export type InsertResourceAssignment = z.infer<typeof insertResourceAssignmentSchema>;

export const resourceCleaningLog = pgTable("resource_cleaning_log", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  resourceUnitId: varchar("resource_unit_id", { length: 36 }).notNull(),
  unitCode: varchar("unit_code", { length: 30 }),
  resourceName: varchar("resource_name", { length: 100 }),
  cleaningType: varchar("cleaning_type", { length: 20 }).default("STANDARD"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cleanedBy: varchar("cleaned_by", { length: 36 }),
  cleanedByName: varchar("cleaned_by_name", { length: 255 }),
  notes: text("notes"),
});

export const insertResourceCleaningLogSchema = createInsertSchema(resourceCleaningLog).omit({ id: true, startedAt: true });
export type ResourceCleaningLog = typeof resourceCleaningLog.$inferSelect;
export type InsertResourceCleaningLog = z.infer<typeof insertResourceCleaningLogSchema>;

// ─── Task #135: Parking Management System ────────────────────────────────────

export const parkingLayoutConfig = pgTable("parking_layout_config", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  totalCapacity: integer("total_capacity").notNull().default(0),
  availableSlots: integer("available_slots").notNull().default(0),
  valetEnabled: boolean("valet_enabled").notNull().default(true),
  freeMinutes: integer("free_minutes").notNull().default(0),
  validationEnabled: boolean("validation_enabled").notNull().default(false),
  validationMinSpend: numeric("validation_min_spend", { precision: 12, scale: 2 }).default("0"),
  displayMessage: text("display_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
export const insertParkingLayoutConfigSchema = createInsertSchema(parkingLayoutConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type ParkingLayoutConfig = typeof parkingLayoutConfig.$inferSelect;
export type InsertParkingLayoutConfig = z.infer<typeof insertParkingLayoutConfigSchema>;

export const parkingZones = pgTable("parking_zones", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  name: text("name").notNull(),
  level: text("level"),
  color: text("color").default("#3B82F6"),
  totalSlots: integer("total_slots").notNull().default(0),
  availableSlots: integer("available_slots").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const insertParkingZoneSchema = createInsertSchema(parkingZones).omit({ id: true, createdAt: true });
export type ParkingZone = typeof parkingZones.$inferSelect;
export type InsertParkingZone = z.infer<typeof insertParkingZoneSchema>;

export const parkingSlots = pgTable("parking_slots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  zoneId: varchar("zone_id", { length: 36 }),
  slotCode: varchar("slot_code", { length: 30 }).notNull(),
  slotType: varchar("slot_type", { length: 20 }).notNull().default("STANDARD"),
  status: varchar("status", { length: 20 }).notNull().default("available"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const insertParkingSlotSchema = createInsertSchema(parkingSlots).omit({ id: true, createdAt: true });
export type ParkingSlot = typeof parkingSlots.$inferSelect;
export type InsertParkingSlot = z.infer<typeof insertParkingSlotSchema>;

export const parkingRates = pgTable("parking_rates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  vehicleType: varchar("vehicle_type", { length: 30 }).notNull().default("CAR"),
  rateType: varchar("rate_type", { length: 20 }).notNull().default("HOURLY"),
  rateAmount: numeric("rate_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  dailyMaxCharge: numeric("daily_max_charge", { precision: 12, scale: 2 }),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const insertParkingRateSchema = createInsertSchema(parkingRates).omit({ id: true, createdAt: true });
export type ParkingRate = typeof parkingRates.$inferSelect;
export type InsertParkingRate = z.infer<typeof insertParkingRateSchema>;

export const parkingRateSlabs = pgTable("parking_rate_slabs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  rateId: varchar("rate_id", { length: 36 }).notNull(),
  fromMinutes: integer("from_minutes").notNull(),
  toMinutes: integer("to_minutes"),
  charge: numeric("charge", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const insertParkingRateSlabSchema = createInsertSchema(parkingRateSlabs).omit({ id: true, createdAt: true });
export type ParkingRateSlab = typeof parkingRateSlabs.$inferSelect;
export type InsertParkingRateSlab = z.infer<typeof insertParkingRateSlabSchema>;

export const valetStaff = pgTable("valet_staff", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }),
  name: text("name").notNull(),
  phone: text("phone"),
  badgeNumber: varchar("badge_number", { length: 30 }),
  isOnDuty: boolean("is_on_duty").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const insertValetStaffSchema = createInsertSchema(valetStaff).omit({ id: true, createdAt: true });
export type ValetStaff = typeof valetStaff.$inferSelect;
export type InsertValetStaff = z.infer<typeof insertValetStaffSchema>;

export const valetTickets = pgTable("valet_tickets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  ticketNumber: text("ticket_number").notNull(),
  slotId: varchar("slot_id", { length: 36 }),
  zoneId: varchar("zone_id", { length: 36 }),
  billId: varchar("bill_id", { length: 36 }),
  customerId: varchar("customer_id", { length: 36 }),
  valetStaffId: varchar("valet_staff_id", { length: 36 }),
  vehicleNumber: text("vehicle_number"),
  vehicleType: varchar("vehicle_type", { length: 30 }).notNull().default("CAR"),
  vehicleMake: text("vehicle_make"),
  vehicleColor: text("vehicle_color"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  status: varchar("status", { length: 20 }).notNull().default("parked"),
  entryTime: timestamp("entry_time", { withTimezone: true }).defaultNow(),
  exitTime: timestamp("exit_time", { withTimezone: true }),
  durationMinutes: integer("duration_minutes"),
  chargeAddedToBill: boolean("charge_added_to_bill").notNull().default(false),
  events: jsonb("events").default([]),
  notes: text("notes"),
  conditionReport: jsonb("condition_report"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  shiftId: varchar("shift_id", { length: 36 }),
  isVip: boolean("is_vip").notNull().default(false),
  vipNotes: text("vip_notes"),
  isOvernight: boolean("is_overnight").notNull().default(false),
  tipAmount: numeric("tip_amount", { precision: 10, scale: 2 }),
  keyType: varchar("key_type", { length: 30 }),
  keyLocation: text("key_location"),
  chargeAmount: numeric("charge_amount", { precision: 10, scale: 2 }),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: varchar("deleted_by", { length: 36 }),
});
export const insertValetTicketSchema = createInsertSchema(valetTickets).omit({ id: true, createdAt: true, entryTime: true });
export type ValetTicket = typeof valetTickets.$inferSelect;
export type InsertValetTicket = z.infer<typeof insertValetTicketSchema>;

export const valetTicketEvents = pgTable("valet_ticket_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  ticketId: varchar("ticket_id", { length: 36 }).notNull(),
  eventType: text("event_type").notNull(),
  performedBy: varchar("performed_by", { length: 36 }),
  performedByName: text("performed_by_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const insertValetTicketEventSchema = createInsertSchema(valetTicketEvents).omit({ id: true, createdAt: true });
export type ValetTicketEvent = typeof valetTicketEvents.$inferSelect;
export type InsertValetTicketEvent = z.infer<typeof insertValetTicketEventSchema>;

export const valetRetrievalRequests = pgTable("valet_retrieval_requests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }).notNull(),
  ticketId: varchar("ticket_id", { length: 36 }).notNull(),
  source: varchar("source", { length: 30 }).notNull().default("MANUAL"),
  requestedBy: varchar("requested_by", { length: 36 }),
  requestedByName: text("requested_by_name"),
  assignedValetId: varchar("assigned_valet_id", { length: 36 }),
  assignedValetName: text("assigned_valet_name"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  notes: text("notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  priority: varchar("priority", { length: 10 }).notNull().default("NORMAL"),
  queuePosition: integer("queue_position"),
  estimatedReadyAt: timestamp("estimated_ready_at", { withTimezone: true }),
  requestSource: varchar("request_source", { length: 30 }),
});
export const insertValetRetrievalRequestSchema = createInsertSchema(valetRetrievalRequests).omit({ id: true, createdAt: true });
export type ValetRetrievalRequest = typeof valetRetrievalRequests.$inferSelect;
export type InsertValetRetrievalRequest = z.infer<typeof insertValetRetrievalRequestSchema>;

export const billParkingCharges = pgTable("bill_parking_charges", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  outletId: varchar("outlet_id", { length: 36 }),
  billId: varchar("bill_id", { length: 36 }).notNull(),
  ticketId: varchar("ticket_id", { length: 36 }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  freeMinutesApplied: integer("free_minutes_applied").notNull().default(0),
  grossCharge: numeric("gross_charge", { precision: 12, scale: 2 }).notNull().default("0"),
  validationDiscount: numeric("validation_discount", { precision: 12, scale: 2 }).notNull().default("0"),
  finalCharge: numeric("final_charge", { precision: 12, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalCharge: numeric("total_charge", { precision: 12, scale: 2 }).notNull().default("0"),
  vehicleType: varchar("vehicle_type", { length: 30 }),
  rateType: varchar("rate_type", { length: 20 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const insertBillParkingChargeSchema = createInsertSchema(billParkingCharges).omit({ id: true, createdAt: true });
export type BillParkingCharge = typeof billParkingCharges.$inferSelect;
export type InsertBillParkingCharge = z.infer<typeof insertBillParkingChargeSchema>;
