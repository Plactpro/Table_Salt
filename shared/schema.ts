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
  "manager",
  "waiter",
  "kitchen",
  "accountant",
  "customer",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "new",
  "sent_to_kitchen",
  "in_progress",
  "ready",
  "served",
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
  currency: text("currency").default("USD"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  serviceCharge: decimal("service_charge", { precision: 5, scale: 2 }).default("0"),
  plan: text("plan").default("basic"),
  businessType: text("business_type").default("casual_dining"),
  active: boolean("active").default(true),
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
});

export const outlets = pgTable("outlets", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name").notNull(),
  address: text("address"),
  openingHours: text("opening_hours"),
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
  status: tableStatusEnum("status").default("free"),
});

export const reservations = pgTable("reservations", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  tableId: varchar("table_id", { length: 36 }).references(() => tables.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  guests: integer("guests").default(2),
  dateTime: timestamp("date_time").notNull(),
  notes: text("notes"),
  status: reservationStatusEnum("status").default("requested"),
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
  currentStock: decimal("current_stock", { precision: 10, scale: 2 }).default("0"),
  reorderLevel: decimal("reorder_level", { precision: 10, scale: 2 }).default("10"),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }).default("0"),
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

export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertOutletSchema = createInsertSchema(outlets).omit({ id: true });
export const insertMenuCategorySchema = createInsertSchema(menuCategories).omit({ id: true });
export const insertMenuItemSchema = createInsertSchema(menuItems).omit({ id: true });
export const insertTableSchema = createInsertSchema(tables).omit({ id: true });
export const insertReservationSchema = createInsertSchema(reservations).omit({ id: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({ id: true });
export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({ id: true, createdAt: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true });
export const insertStaffScheduleSchema = createInsertSchema(staffSchedules).omit({ id: true });
export const insertFeedbackSchema = createInsertSchema(feedback).omit({ id: true, createdAt: true });
export const insertOfferSchema = createInsertSchema(offers).omit({ id: true, createdAt: true });
export const insertDeliveryOrderSchema = createInsertSchema(deliveryOrders).omit({ id: true, createdAt: true });
export const insertEmployeePerformanceLogSchema = createInsertSchema(employeePerformanceLogs).omit({ id: true, recordedAt: true });

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
export type Table = typeof tables.$inferSelect;
export type InsertTable = z.infer<typeof insertTableSchema>;
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