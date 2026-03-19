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
]);

export const orderStatusEnum = pgEnum("order_status", [
  "new",
  "sent_to_kitchen",
  "in_progress",
  "ready",
  "served",
  "ready_to_pay",
  "paid",
  "cancelled",
  "voided",
]);

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
  active: boolean("active").default(true),
  moduleConfig: jsonb("module_config").default({}),
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
});

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
});

export const menuCategories = pgTable("menu_categories", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").default(true),
});

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
});

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
});

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
});

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
});

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
});

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
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0"),
  offerId: varchar("offer_id", { length: 36 }),
  channel: text("channel"),
  channelOrderId: text("channel_order_id"),
  channelData: jsonb("channel_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
});

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
});

export const stockMovements = pgTable("stock_movements", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  itemId: varchar("item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  type: text("type").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
});

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
});

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
});

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
});

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
});

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
});

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
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
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
});

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
});

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
});

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
});

export const recipes = pgTable("recipes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  menuItemId: varchar("menu_item_id", { length: 36 }).references(() => menuItems.id),
  name: text("name").notNull(),
  yield: decimal("yield", { precision: 10, scale: 2 }).default("1"),
  yieldUnit: text("yield_unit").default("portion"),
  prepTimeMinutes: integer("prep_time_minutes"),
  notes: text("notes"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  recipeId: varchar("recipe_id", { length: 36 }).notNull().references(() => recipes.id),
  inventoryItemId: varchar("inventory_item_id", { length: 36 }).notNull().references(() => inventoryItems.id),
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull(),
  unit: text("unit").notNull(),
  wastePct: decimal("waste_pct", { precision: 5, scale: 2 }).default("0"),
  sortOrder: integer("sort_order").default(0),
});

export const stockTakes = pgTable("stock_takes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  conductedBy: varchar("conducted_by", { length: 36 }).notNull().references(() => users.id),
  status: text("status").default("draft"),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
});

export const insertKitchenStationSchema = createInsertSchema(kitchenStations).omit({ id: true });
export type KitchenStation = typeof kitchenStations.$inferSelect;
export type InsertKitchenStation = z.infer<typeof insertKitchenStationSchema>;
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
});

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
});

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
});

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
});

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
});

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
});

export const insertSecurityAlertSchema = createInsertSchema(securityAlerts).omit({ id: true, createdAt: true });
export type SecurityAlert = typeof securityAlerts.$inferSelect;
export type InsertSecurityAlert = z.infer<typeof insertSecurityAlertSchema>;