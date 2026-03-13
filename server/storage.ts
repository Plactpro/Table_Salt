import { eq, and, desc, sql, gte, lte, count, sum } from "drizzle-orm";
import { db } from "./db";
import {
  tenants, users, outlets, menuCategories, menuItems, tables,
  reservations, orders, orderItems, inventoryItems, stockMovements,
  customers, staffSchedules, feedback, offers, deliveryOrders, employeePerformanceLogs,
  type Tenant, type InsertTenant,
  type User, type InsertUser,
  type Outlet, type InsertOutlet,
  type MenuCategory, type InsertMenuCategory,
  type MenuItem, type InsertMenuItem,
  type Table, type InsertTable,
  type Reservation, type InsertReservation,
  type Order, type InsertOrder,
  type OrderItem, type InsertOrderItem,
  type InventoryItem, type InsertInventoryItem,
  type StockMovement, type InsertStockMovement,
  type Customer, type InsertCustomer,
  type StaffSchedule, type InsertStaffSchedule,
  type Feedback, type InsertFeedback,
  type Offer, type InsertOffer,
  type DeliveryOrder, type InsertDeliveryOrder,
  type EmployeePerformanceLog, type InsertEmployeePerformanceLog,
} from "@shared/schema";

export interface IStorage {
  getTenant(id: string): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  createTenant(data: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined>;
  getAllTenants(): Promise<Tenant[]>;

  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  getUsersByTenant(tenantId: string): Promise<User[]>;

  getOutletsByTenant(tenantId: string): Promise<Outlet[]>;
  getOutlet(id: string): Promise<Outlet | undefined>;
  createOutlet(data: InsertOutlet): Promise<Outlet>;
  updateOutlet(id: string, data: Partial<InsertOutlet>): Promise<Outlet | undefined>;
  deleteOutlet(id: string): Promise<void>;

  getCategoriesByTenant(tenantId: string): Promise<MenuCategory[]>;
  getCategory(id: string): Promise<MenuCategory | undefined>;
  createCategory(data: InsertMenuCategory): Promise<MenuCategory>;
  updateCategory(id: string, data: Partial<InsertMenuCategory>): Promise<MenuCategory | undefined>;
  deleteCategory(id: string): Promise<void>;

  getMenuItemsByTenant(tenantId: string): Promise<MenuItem[]>;
  getMenuItemsByCategory(categoryId: string): Promise<MenuItem[]>;
  getMenuItem(id: string): Promise<MenuItem | undefined>;
  createMenuItem(data: InsertMenuItem): Promise<MenuItem>;
  updateMenuItem(id: string, data: Partial<InsertMenuItem>): Promise<MenuItem | undefined>;
  deleteMenuItem(id: string): Promise<void>;

  getTablesByTenant(tenantId: string): Promise<Table[]>;
  getTable(id: string): Promise<Table | undefined>;
  createTable(data: InsertTable): Promise<Table>;
  updateTable(id: string, data: Partial<InsertTable>): Promise<Table | undefined>;
  deleteTable(id: string): Promise<void>;

  getReservationsByTenant(tenantId: string): Promise<Reservation[]>;
  createReservation(data: InsertReservation): Promise<Reservation>;
  updateReservation(id: string, data: Partial<InsertReservation>): Promise<Reservation | undefined>;

  getOrdersByTenant(tenantId: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(data: InsertOrder): Promise<Order>;
  updateOrder(id: string, data: Partial<InsertOrder>): Promise<Order | undefined>;
  getOrderItemsByOrder(orderId: string): Promise<OrderItem[]>;
  createOrderItem(data: InsertOrderItem): Promise<OrderItem>;
  updateOrderItem(id: string, data: Partial<InsertOrderItem>): Promise<OrderItem | undefined>;

  getInventoryByTenant(tenantId: string): Promise<InventoryItem[]>;
  getInventoryItem(id: string): Promise<InventoryItem | undefined>;
  createInventoryItem(data: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(id: string, data: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined>;
  deleteInventoryItem(id: string): Promise<void>;
  createStockMovement(data: InsertStockMovement): Promise<StockMovement>;

  getCustomersByTenant(tenantId: string): Promise<Customer[]>;
  createCustomer(data: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined>;

  getStaffSchedulesByTenant(tenantId: string): Promise<StaffSchedule[]>;
  createStaffSchedule(data: InsertStaffSchedule): Promise<StaffSchedule>;

  createFeedback(data: InsertFeedback): Promise<Feedback>;

  getOffersByTenant(tenantId: string): Promise<Offer[]>;
  getOfferByTenant(id: string, tenantId: string): Promise<Offer | undefined>;
  createOffer(data: InsertOffer): Promise<Offer>;
  updateOfferByTenant(id: string, tenantId: string, data: Partial<InsertOffer>): Promise<Offer | undefined>;
  deleteOfferByTenant(id: string, tenantId: string): Promise<void>;

  getDeliveryOrdersByTenant(tenantId: string): Promise<DeliveryOrder[]>;
  getDeliveryOrderByTenant(id: string, tenantId: string): Promise<DeliveryOrder | undefined>;
  createDeliveryOrder(data: InsertDeliveryOrder): Promise<DeliveryOrder>;
  updateDeliveryOrderByTenant(id: string, tenantId: string, data: Partial<InsertDeliveryOrder>): Promise<DeliveryOrder | undefined>;
  deleteDeliveryOrderByTenant(id: string, tenantId: string): Promise<void>;

  getPerformanceLogsByTenant(tenantId: string): Promise<EmployeePerformanceLog[]>;
  getPerformanceLogsByUserAndTenant(userId: string, tenantId: string): Promise<EmployeePerformanceLog[]>;
  createPerformanceLog(data: InsertEmployeePerformanceLog): Promise<EmployeePerformanceLog>;
  deletePerformanceLogByTenant(id: string, tenantId: string): Promise<void>;

  getCustomerByTenant(id: string, tenantId: string): Promise<Customer | undefined>;
  updateCustomerByTenant(id: string, tenantId: string, data: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomerByTenant(id: string, tenantId: string): Promise<void>;
  getCustomersByLoyaltyTier(tenantId: string, tier: string): Promise<Customer[]>;
  getCustomersByTags(tenantId: string, tag: string): Promise<Customer[]>;

  updatePerformanceLogByTenant(id: string, tenantId: string, data: Partial<InsertEmployeePerformanceLog>): Promise<EmployeePerformanceLog | undefined>;

  getOrdersWithOfferDetails(tenantId: string): Promise<any[]>;

  getDashboardStats(tenantId: string): Promise<any>;
  getSalesReport(tenantId: string, from: Date, to: Date): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  async getTenant(id: string) {
    const [t] = await db.select().from(tenants).where(eq(tenants.id, id));
    return t;
  }
  async getTenantBySlug(slug: string) {
    const [t] = await db.select().from(tenants).where(eq(tenants.slug, slug));
    return t;
  }
  async createTenant(data: InsertTenant) {
    const [t] = await db.insert(tenants).values(data).returning();
    return t;
  }
  async updateTenant(id: string, data: Partial<InsertTenant>) {
    const [t] = await db.update(tenants).set(data).where(eq(tenants.id, id)).returning();
    return t;
  }
  async getAllTenants() {
    return db.select().from(tenants);
  }

  async getUser(id: string) {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    return u;
  }
  async getUserByUsername(username: string) {
    const [u] = await db.select().from(users).where(eq(users.username, username));
    return u;
  }
  async createUser(data: InsertUser) {
    const [u] = await db.insert(users).values(data).returning();
    return u;
  }
  async updateUser(id: string, data: Partial<InsertUser>) {
    const [u] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return u;
  }
  async getUsersByTenant(tenantId: string) {
    return db.select().from(users).where(eq(users.tenantId, tenantId));
  }

  async getOutletsByTenant(tenantId: string) {
    return db.select().from(outlets).where(eq(outlets.tenantId, tenantId));
  }
  async getOutlet(id: string) {
    const [o] = await db.select().from(outlets).where(eq(outlets.id, id));
    return o;
  }
  async createOutlet(data: InsertOutlet) {
    const [o] = await db.insert(outlets).values(data).returning();
    return o;
  }
  async updateOutlet(id: string, data: Partial<InsertOutlet>) {
    const [o] = await db.update(outlets).set(data).where(eq(outlets.id, id)).returning();
    return o;
  }
  async deleteOutlet(id: string) {
    await db.delete(outlets).where(eq(outlets.id, id));
  }

  async getCategoriesByTenant(tenantId: string) {
    return db.select().from(menuCategories).where(eq(menuCategories.tenantId, tenantId)).orderBy(menuCategories.sortOrder);
  }
  async getCategory(id: string) {
    const [c] = await db.select().from(menuCategories).where(eq(menuCategories.id, id));
    return c;
  }
  async createCategory(data: InsertMenuCategory) {
    const [c] = await db.insert(menuCategories).values(data).returning();
    return c;
  }
  async updateCategory(id: string, data: Partial<InsertMenuCategory>) {
    const [c] = await db.update(menuCategories).set(data).where(eq(menuCategories.id, id)).returning();
    return c;
  }
  async deleteCategory(id: string) {
    await db.delete(menuCategories).where(eq(menuCategories.id, id));
  }

  async getMenuItemsByTenant(tenantId: string) {
    return db.select().from(menuItems).where(eq(menuItems.tenantId, tenantId));
  }
  async getMenuItemsByCategory(categoryId: string) {
    return db.select().from(menuItems).where(eq(menuItems.categoryId, categoryId));
  }
  async getMenuItem(id: string) {
    const [i] = await db.select().from(menuItems).where(eq(menuItems.id, id));
    return i;
  }
  async createMenuItem(data: InsertMenuItem) {
    const [i] = await db.insert(menuItems).values(data).returning();
    return i;
  }
  async updateMenuItem(id: string, data: Partial<InsertMenuItem>) {
    const [i] = await db.update(menuItems).set(data).where(eq(menuItems.id, id)).returning();
    return i;
  }
  async deleteMenuItem(id: string) {
    await db.delete(menuItems).where(eq(menuItems.id, id));
  }

  async getTablesByTenant(tenantId: string) {
    return db.select().from(tables).where(eq(tables.tenantId, tenantId)).orderBy(tables.number);
  }
  async getTable(id: string) {
    const [t] = await db.select().from(tables).where(eq(tables.id, id));
    return t;
  }
  async createTable(data: InsertTable) {
    const [t] = await db.insert(tables).values(data).returning();
    return t;
  }
  async updateTable(id: string, data: Partial<InsertTable>) {
    const [t] = await db.update(tables).set(data).where(eq(tables.id, id)).returning();
    return t;
  }
  async deleteTable(id: string) {
    await db.delete(tables).where(eq(tables.id, id));
  }

  async getReservationsByTenant(tenantId: string) {
    return db.select().from(reservations).where(eq(reservations.tenantId, tenantId)).orderBy(desc(reservations.dateTime));
  }
  async createReservation(data: InsertReservation) {
    const [r] = await db.insert(reservations).values(data).returning();
    return r;
  }
  async updateReservation(id: string, data: Partial<InsertReservation>) {
    const [r] = await db.update(reservations).set(data).where(eq(reservations.id, id)).returning();
    return r;
  }

  async getOrdersByTenant(tenantId: string) {
    return db.select().from(orders).where(eq(orders.tenantId, tenantId)).orderBy(desc(orders.createdAt));
  }
  async getOrder(id: string) {
    const [o] = await db.select().from(orders).where(eq(orders.id, id));
    return o;
  }
  async createOrder(data: InsertOrder) {
    const [o] = await db.insert(orders).values(data).returning();
    return o;
  }
  async updateOrder(id: string, data: Partial<InsertOrder>) {
    const [o] = await db.update(orders).set(data).where(eq(orders.id, id)).returning();
    return o;
  }
  async getOrderItemsByOrder(orderId: string) {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }
  async createOrderItem(data: InsertOrderItem) {
    const [i] = await db.insert(orderItems).values(data).returning();
    return i;
  }
  async updateOrderItem(id: string, data: Partial<InsertOrderItem>) {
    const [i] = await db.update(orderItems).set(data).where(eq(orderItems.id, id)).returning();
    return i;
  }

  async getInventoryByTenant(tenantId: string) {
    return db.select().from(inventoryItems).where(eq(inventoryItems.tenantId, tenantId));
  }
  async getInventoryItem(id: string) {
    const [i] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    return i;
  }
  async createInventoryItem(data: InsertInventoryItem) {
    const [i] = await db.insert(inventoryItems).values(data).returning();
    return i;
  }
  async updateInventoryItem(id: string, data: Partial<InsertInventoryItem>) {
    const [i] = await db.update(inventoryItems).set(data).where(eq(inventoryItems.id, id)).returning();
    return i;
  }
  async deleteInventoryItem(id: string) {
    await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
  }
  async createStockMovement(data: InsertStockMovement) {
    const [m] = await db.insert(stockMovements).values(data).returning();
    return m;
  }

  async getCustomersByTenant(tenantId: string) {
    return db.select().from(customers).where(eq(customers.tenantId, tenantId));
  }
  async createCustomer(data: InsertCustomer) {
    const [c] = await db.insert(customers).values(data).returning();
    return c;
  }
  async updateCustomer(id: string, data: Partial<InsertCustomer>) {
    const [c] = await db.update(customers).set(data).where(eq(customers.id, id)).returning();
    return c;
  }

  async getStaffSchedulesByTenant(tenantId: string) {
    return db.select().from(staffSchedules).where(eq(staffSchedules.tenantId, tenantId));
  }
  async createStaffSchedule(data: InsertStaffSchedule) {
    const [s] = await db.insert(staffSchedules).values(data).returning();
    return s;
  }

  async createFeedback(data: InsertFeedback) {
    const [f] = await db.insert(feedback).values(data).returning();
    return f;
  }

  async getOffersByTenant(tenantId: string) {
    return db.select().from(offers).where(eq(offers.tenantId, tenantId)).orderBy(desc(offers.createdAt));
  }
  async getOfferByTenant(id: string, tenantId: string) {
    const [o] = await db.select().from(offers).where(and(eq(offers.id, id), eq(offers.tenantId, tenantId)));
    return o;
  }
  async createOffer(data: InsertOffer) {
    const [o] = await db.insert(offers).values(data).returning();
    return o;
  }
  async updateOfferByTenant(id: string, tenantId: string, data: Partial<InsertOffer>) {
    const [o] = await db.update(offers).set(data).where(and(eq(offers.id, id), eq(offers.tenantId, tenantId))).returning();
    return o;
  }
  async deleteOfferByTenant(id: string, tenantId: string) {
    await db.delete(offers).where(and(eq(offers.id, id), eq(offers.tenantId, tenantId)));
  }

  async getDeliveryOrdersByTenant(tenantId: string) {
    return db.select().from(deliveryOrders).where(eq(deliveryOrders.tenantId, tenantId)).orderBy(desc(deliveryOrders.createdAt));
  }
  async getDeliveryOrderByTenant(id: string, tenantId: string) {
    const [d] = await db.select().from(deliveryOrders).where(and(eq(deliveryOrders.id, id), eq(deliveryOrders.tenantId, tenantId)));
    return d;
  }
  async createDeliveryOrder(data: InsertDeliveryOrder) {
    const [d] = await db.insert(deliveryOrders).values(data).returning();
    return d;
  }
  async updateDeliveryOrderByTenant(id: string, tenantId: string, data: Partial<InsertDeliveryOrder>) {
    const [d] = await db.update(deliveryOrders).set(data).where(and(eq(deliveryOrders.id, id), eq(deliveryOrders.tenantId, tenantId))).returning();
    return d;
  }
  async deleteDeliveryOrderByTenant(id: string, tenantId: string) {
    await db.delete(deliveryOrders).where(and(eq(deliveryOrders.id, id), eq(deliveryOrders.tenantId, tenantId)));
  }

  async getPerformanceLogsByTenant(tenantId: string) {
    return db.select().from(employeePerformanceLogs).where(eq(employeePerformanceLogs.tenantId, tenantId)).orderBy(desc(employeePerformanceLogs.recordedAt));
  }
  async getPerformanceLogsByUserAndTenant(userId: string, tenantId: string) {
    return db.select().from(employeePerformanceLogs).where(and(eq(employeePerformanceLogs.userId, userId), eq(employeePerformanceLogs.tenantId, tenantId))).orderBy(desc(employeePerformanceLogs.recordedAt));
  }
  async createPerformanceLog(data: InsertEmployeePerformanceLog) {
    const [p] = await db.insert(employeePerformanceLogs).values(data).returning();
    return p;
  }
  async updatePerformanceLogByTenant(id: string, tenantId: string, data: Partial<InsertEmployeePerformanceLog>) {
    const [p] = await db.update(employeePerformanceLogs).set(data).where(and(eq(employeePerformanceLogs.id, id), eq(employeePerformanceLogs.tenantId, tenantId))).returning();
    return p;
  }
  async deletePerformanceLogByTenant(id: string, tenantId: string) {
    await db.delete(employeePerformanceLogs).where(and(eq(employeePerformanceLogs.id, id), eq(employeePerformanceLogs.tenantId, tenantId)));
  }

  async getCustomerByTenant(id: string, tenantId: string) {
    const [c] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
    return c;
  }
  async updateCustomerByTenant(id: string, tenantId: string, data: Partial<InsertCustomer>) {
    const [c] = await db.update(customers).set(data).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).returning();
    return c;
  }
  async deleteCustomerByTenant(id: string, tenantId: string) {
    await db.delete(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
  }
  async getCustomersByLoyaltyTier(tenantId: string, tier: string) {
    return db.select().from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.loyaltyTier, tier)));
  }
  async getCustomersByTags(tenantId: string, tag: string) {
    return db.select().from(customers).where(and(eq(customers.tenantId, tenantId), sql`${tag} = ANY(${customers.tags})`));
  }

  async getOrdersWithOfferDetails(tenantId: string) {
    const result = await db.select({
      order: orders,
      offerName: offers.name,
      offerType: offers.type,
      offerValue: offers.value,
    }).from(orders)
      .leftJoin(offers, eq(orders.offerId, offers.id))
      .where(eq(orders.tenantId, tenantId))
      .orderBy(desc(orders.createdAt));
    return result.map(r => ({
      ...r.order,
      offer: r.offerName ? { name: r.offerName, type: r.offerType, value: r.offerValue } : null,
    }));
  }

  async getDashboardStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [orderStats] = await db.select({
      totalOrders: count(),
      totalRevenue: sum(orders.total),
    }).from(orders).where(eq(orders.tenantId, tenantId));

    const [todayStats] = await db.select({
      todayOrders: count(),
      todayRevenue: sum(orders.total),
    }).from(orders).where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, today)));

    const [staffCount] = await db.select({ count: count() }).from(users).where(eq(users.tenantId, tenantId));

    const lowStockItems = await db.select().from(inventoryItems).where(
      and(
        eq(inventoryItems.tenantId, tenantId),
        sql`CAST(${inventoryItems.currentStock} AS DECIMAL) <= CAST(${inventoryItems.reorderLevel} AS DECIMAL)`
      )
    );

    const tableStats = await db.select({
      status: tables.status,
      count: count(),
    }).from(tables).where(eq(tables.tenantId, tenantId)).groupBy(tables.status);

    const recentOrders = await db.select().from(orders)
      .where(eq(orders.tenantId, tenantId))
      .orderBy(desc(orders.createdAt))
      .limit(10);

    const topItems = await db.select({
      name: orderItems.name,
      totalQty: sum(orderItems.quantity),
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(eq(orders.tenantId, tenantId))
      .groupBy(orderItems.name)
      .orderBy(desc(sum(orderItems.quantity)))
      .limit(5);

    return {
      totalOrders: Number(orderStats?.totalOrders || 0),
      totalRevenue: Number(orderStats?.totalRevenue || 0),
      todayOrders: Number(todayStats?.todayOrders || 0),
      todayRevenue: Number(todayStats?.todayRevenue || 0),
      staffCount: Number(staffCount?.count || 0),
      lowStockItems,
      tableStats,
      recentOrders,
      topItems,
    };
  }

  async getSalesReport(tenantId: string, from: Date, to: Date) {
    const salesByDay = await db.select({
      date: sql<string>`DATE(${orders.createdAt})`,
      revenue: sum(orders.total),
      orderCount: count(),
    }).from(orders)
      .where(and(
        eq(orders.tenantId, tenantId),
        gte(orders.createdAt, from),
        lte(orders.createdAt, to),
      ))
      .groupBy(sql`DATE(${orders.createdAt})`)
      .orderBy(sql`DATE(${orders.createdAt})`);

    const [totals] = await db.select({
      revenue: sum(orders.total),
      tax: sum(orders.tax),
      discount: sum(orders.discount),
      orderCount: count(),
    }).from(orders)
      .where(and(
        eq(orders.tenantId, tenantId),
        gte(orders.createdAt, from),
        lte(orders.createdAt, to),
      ));

    return { salesByDay, totals };
  }
}

export const storage = new DatabaseStorage();