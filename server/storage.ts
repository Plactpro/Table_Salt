import { eq, and, desc, sql, gte, lte, lt, count, sum } from "drizzle-orm";
import { db } from "./db";
import {
  tenants, users, outlets, menuCategories, menuItems, tables,
  reservations, orders, orderItems, inventoryItems, stockMovements,
  customers, staffSchedules, feedback, offers, deliveryOrders, employeePerformanceLogs,
  salesInquiries, supportTickets, attendanceLogs,
  cleaningTemplates, cleaningTemplateItems, cleaningLogs, cleaningSchedules,
  auditTemplates, auditTemplateItems, auditSchedules, auditResponses, auditIssues,
  recipes, recipeIngredients, stockTakes, stockTakeLines, kitchenStations,
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
  type SalesInquiry, type InsertSalesInquiry,
  type SupportTicket, type InsertSupportTicket,
  type AttendanceLog, type InsertAttendanceLog,
  type CleaningTemplate, type InsertCleaningTemplate,
  type CleaningTemplateItem, type InsertCleaningTemplateItem,
  type CleaningLog, type InsertCleaningLog,
  type CleaningSchedule, type InsertCleaningSchedule,
  type AuditTemplate, type InsertAuditTemplate,
  type AuditTemplateItem, type InsertAuditTemplateItem,
  type AuditSchedule, type InsertAuditSchedule,
  type AuditResponse, type InsertAuditResponse,
  type AuditIssue, type InsertAuditIssue,
  type Recipe, type InsertRecipe,
  type RecipeIngredient, type InsertRecipeIngredient,
  type StockTake, type InsertStockTake,
  type StockTakeLine, type InsertStockTakeLine,
  type KitchenStation, type InsertKitchenStation,
  orderChannels, channelConfigs, onlineMenuMappings,
  regions, franchiseInvoices, outletMenuOverrides,
  type OrderChannel, type InsertOrderChannel,
  type ChannelConfig, type InsertChannelConfig,
  type OnlineMenuMapping, type InsertOnlineMenuMapping,
  type Region, type InsertRegion,
  type FranchiseInvoice, type InsertFranchiseInvoice,
  type OutletMenuOverride, type InsertOutletMenuOverride,
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
  updateOutlet(id: string, tenantId: string, data: Partial<InsertOutlet>): Promise<Outlet | undefined>;
  deleteOutlet(id: string, tenantId: string): Promise<void>;

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
  updateTableByTenant(id: string, tenantId: string, data: Partial<InsertTable>): Promise<Table | undefined>;
  deleteTable(id: string): Promise<void>;
  deleteTableByTenant(id: string, tenantId: string): Promise<void>;

  getReservationsByTenant(tenantId: string): Promise<Reservation[]>;
  createReservation(data: InsertReservation): Promise<Reservation>;
  updateReservation(id: string, data: Partial<InsertReservation>): Promise<Reservation | undefined>;
  updateReservationByTenant(id: string, tenantId: string, data: Partial<InsertReservation>): Promise<Reservation | undefined>;
  deleteReservationByTenant(id: string, tenantId: string): Promise<void>;

  getOrdersByTenant(tenantId: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(data: InsertOrder): Promise<Order>;
  updateOrder(id: string, data: Partial<InsertOrder>): Promise<Order | undefined>;
  getOrderItemsByOrder(orderId: string): Promise<OrderItem[]>;
  getOrderItemsByTenant(tenantId: string): Promise<any[]>;
  createOrderItem(data: InsertOrderItem): Promise<OrderItem>;
  updateOrderItem(id: string, data: Record<string, any>): Promise<OrderItem | undefined>;

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

  getFeedbackByTenant(tenantId: string): Promise<Feedback[]>;
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

  updateStaffScheduleByTenant(id: string, tenantId: string, data: Partial<InsertStaffSchedule>): Promise<StaffSchedule | undefined>;
  deleteStaffScheduleByTenant(id: string, tenantId: string): Promise<void>;

  getOrdersWithOfferDetails(tenantId: string): Promise<any[]>;

  getDashboardStats(tenantId: string): Promise<any>;
  getSalesReport(tenantId: string, from: Date, to: Date): Promise<any>;
  createSalesInquiry(data: InsertSalesInquiry): Promise<SalesInquiry>;
  createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket>;

  getAttendanceLogsByTenant(tenantId: string, from?: Date, to?: Date): Promise<AttendanceLog[]>;
  getAttendanceLogsByUser(userId: string, tenantId: string, from?: Date, to?: Date): Promise<AttendanceLog[]>;
  getTodayAttendanceForUser(userId: string, tenantId: string): Promise<AttendanceLog | undefined>;
  createAttendanceLog(data: InsertAttendanceLog): Promise<AttendanceLog>;
  updateAttendanceLog(id: string, tenantId: string, data: Partial<InsertAttendanceLog>): Promise<AttendanceLog | undefined>;
  getAttendanceSummary(tenantId: string, from: Date, to: Date): Promise<any[]>;

  getCleaningTemplatesByTenant(tenantId: string): Promise<CleaningTemplate[]>;
  getCleaningTemplate(id: string): Promise<CleaningTemplate | undefined>;
  createCleaningTemplate(data: InsertCleaningTemplate): Promise<CleaningTemplate>;
  updateCleaningTemplate(id: string, tenantId: string, data: Partial<InsertCleaningTemplate>): Promise<CleaningTemplate | undefined>;
  deleteCleaningTemplate(id: string, tenantId: string): Promise<void>;
  getCleaningTemplateItems(templateId: string): Promise<CleaningTemplateItem[]>;
  createCleaningTemplateItem(data: InsertCleaningTemplateItem): Promise<CleaningTemplateItem>;
  deleteCleaningTemplateItems(templateId: string): Promise<void>;
  getCleaningLogsByTenant(tenantId: string, date?: Date): Promise<CleaningLog[]>;
  createCleaningLog(data: InsertCleaningLog): Promise<CleaningLog>;
  deleteCleaningLog(id: string, tenantId: string): Promise<void>;
  getCleaningSchedules(tenantId: string, date: string): Promise<CleaningSchedule[]>;
  createCleaningSchedule(data: InsertCleaningSchedule): Promise<CleaningSchedule>;
  updateCleaningSchedule(id: string, tenantId: string, data: Partial<InsertCleaningSchedule>): Promise<CleaningSchedule | undefined>;

  getAuditTemplatesByTenant(tenantId: string): Promise<AuditTemplate[]>;
  getAuditTemplate(id: string): Promise<AuditTemplate | undefined>;
  createAuditTemplate(data: InsertAuditTemplate): Promise<AuditTemplate>;
  updateAuditTemplate(id: string, tenantId: string, data: Partial<InsertAuditTemplate>): Promise<AuditTemplate | undefined>;
  deleteAuditTemplate(id: string, tenantId: string): Promise<void>;
  getAuditTemplateItems(templateId: string): Promise<AuditTemplateItem[]>;
  createAuditTemplateItem(data: InsertAuditTemplateItem): Promise<AuditTemplateItem>;
  deleteAuditTemplateItems(templateId: string): Promise<void>;
  getAuditSchedulesByTenant(tenantId: string, status?: string, from?: Date, to?: Date): Promise<AuditSchedule[]>;
  getAuditSchedule(id: string): Promise<AuditSchedule | undefined>;
  createAuditSchedule(data: InsertAuditSchedule): Promise<AuditSchedule>;
  updateAuditSchedule(id: string, tenantId: string, data: Partial<InsertAuditSchedule>): Promise<AuditSchedule | undefined>;
  getAuditResponsesBySchedule(scheduleId: string): Promise<AuditResponse[]>;
  createAuditResponse(data: InsertAuditResponse): Promise<AuditResponse>;
  updateAuditResponse(id: string, data: Partial<InsertAuditResponse>): Promise<AuditResponse | undefined>;
  getAuditIssuesByTenant(tenantId: string, status?: string): Promise<AuditIssue[]>;
  createAuditIssue(data: InsertAuditIssue): Promise<AuditIssue>;
  updateAuditIssue(id: string, tenantId: string, data: Partial<InsertAuditIssue>): Promise<AuditIssue | undefined>;

  getRecipesByTenant(tenantId: string): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe | undefined>;
  createRecipe(data: InsertRecipe): Promise<Recipe>;
  updateRecipe(id: string, tenantId: string, data: Partial<InsertRecipe>): Promise<Recipe | undefined>;
  deleteRecipe(id: string, tenantId: string): Promise<void>;
  getRecipeIngredients(recipeId: string): Promise<RecipeIngredient[]>;
  createRecipeIngredient(data: InsertRecipeIngredient): Promise<RecipeIngredient>;
  deleteRecipeIngredients(recipeId: string): Promise<void>;
  getRecipeByMenuItem(menuItemId: string): Promise<Recipe | undefined>;

  getStockTakesByTenant(tenantId: string): Promise<StockTake[]>;
  getStockTake(id: string): Promise<StockTake | undefined>;
  createStockTake(data: InsertStockTake): Promise<StockTake>;
  updateStockTake(id: string, tenantId: string, data: Partial<InsertStockTake>): Promise<StockTake | undefined>;
  getStockTakeLines(stockTakeId: string): Promise<StockTakeLine[]>;
  createStockTakeLine(data: InsertStockTakeLine): Promise<StockTakeLine>;
  updateStockTakeLine(id: string, data: Partial<InsertStockTakeLine>): Promise<StockTakeLine | undefined>;
  getStockMovementsByTenant(tenantId: string, limit?: number): Promise<StockMovement[]>;

  getKitchenStationsByTenant(tenantId: string): Promise<KitchenStation[]>;
  getKitchenStation(id: string): Promise<KitchenStation | undefined>;
  createKitchenStation(data: InsertKitchenStation): Promise<KitchenStation>;
  updateKitchenStation(id: string, tenantId: string, data: Partial<InsertKitchenStation>): Promise<KitchenStation | undefined>;
  deleteKitchenStation(id: string, tenantId: string): Promise<void>;
  getOrderItem(id: string): Promise<OrderItem | undefined>;

  getOrderChannelsByTenant(tenantId: string): Promise<OrderChannel[]>;
  getOrderChannel(id: string): Promise<OrderChannel | undefined>;
  createOrderChannel(data: InsertOrderChannel): Promise<OrderChannel>;
  updateOrderChannel(id: string, tenantId: string, data: Partial<InsertOrderChannel>): Promise<OrderChannel | undefined>;
  deleteOrderChannel(id: string, tenantId: string): Promise<void>;
  getChannelConfigsByTenant(tenantId: string): Promise<ChannelConfig[]>;
  getChannelConfig(id: string): Promise<ChannelConfig | undefined>;
  createChannelConfig(data: InsertChannelConfig): Promise<ChannelConfig>;
  updateChannelConfig(id: string, tenantId: string, data: Partial<InsertChannelConfig>): Promise<ChannelConfig | undefined>;
  deleteChannelConfig(id: string, tenantId: string): Promise<void>;
  getOnlineMenuMappingsByTenant(tenantId: string): Promise<OnlineMenuMapping[]>;
  createOnlineMenuMapping(data: InsertOnlineMenuMapping): Promise<OnlineMenuMapping>;
  updateOnlineMenuMapping(id: string, tenantId: string, data: Partial<InsertOnlineMenuMapping>): Promise<OnlineMenuMapping | undefined>;
  deleteOnlineMenuMapping(id: string, tenantId: string): Promise<void>;

  getRegionsByTenant(tenantId: string): Promise<Region[]>;
  getRegion(id: string): Promise<Region | undefined>;
  createRegion(data: InsertRegion): Promise<Region>;
  updateRegion(id: string, tenantId: string, data: Partial<InsertRegion>): Promise<Region | undefined>;
  deleteRegion(id: string, tenantId: string): Promise<void>;

  getFranchiseInvoicesByTenant(tenantId: string): Promise<FranchiseInvoice[]>;
  getFranchiseInvoicesByOutlet(outletId: string, tenantId: string): Promise<FranchiseInvoice[]>;
  createFranchiseInvoice(data: InsertFranchiseInvoice): Promise<FranchiseInvoice>;
  updateFranchiseInvoice(id: string, tenantId: string, data: Partial<InsertFranchiseInvoice>): Promise<FranchiseInvoice | undefined>;

  getOutletMenuOverrides(outletId: string, tenantId: string): Promise<OutletMenuOverride[]>;
  createOutletMenuOverride(data: InsertOutletMenuOverride): Promise<OutletMenuOverride>;
  updateOutletMenuOverride(id: string, tenantId: string, data: Partial<InsertOutletMenuOverride>): Promise<OutletMenuOverride | undefined>;
  deleteOutletMenuOverride(id: string, tenantId: string): Promise<void>;

  getOutletKPIs(tenantId: string, outletId?: string, from?: Date, to?: Date): Promise<Record<string, unknown>[]>;
  getOutletFeedbackMetrics(tenantId: string, from?: Date, to?: Date): Promise<Record<string, unknown>[]>;
  getOutletLabourMetrics(tenantId: string, from?: Date, to?: Date): Promise<Record<string, unknown>[]>;
  getOutletFoodCostMetrics(tenantId: string): Promise<Map<string, string>>;
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
  async updateOutlet(id: string, tenantId: string, data: Partial<InsertOutlet>) {
    const [o] = await db.update(outlets).set(data).where(and(eq(outlets.id, id), eq(outlets.tenantId, tenantId))).returning();
    return o;
  }
  async deleteOutlet(id: string, tenantId: string) {
    await db.delete(outlets).where(and(eq(outlets.id, id), eq(outlets.tenantId, tenantId)));
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
  async updateTableByTenant(id: string, tenantId: string, data: Partial<InsertTable>) {
    const [t] = await db.update(tables).set(data).where(and(eq(tables.id, id), eq(tables.tenantId, tenantId))).returning();
    return t;
  }
  async deleteTable(id: string) {
    await db.delete(tables).where(eq(tables.id, id));
  }
  async deleteTableByTenant(id: string, tenantId: string) {
    await db.delete(tables).where(and(eq(tables.id, id), eq(tables.tenantId, tenantId)));
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
  async updateReservationByTenant(id: string, tenantId: string, data: Partial<InsertReservation>) {
    const [r] = await db.update(reservations).set(data).where(and(eq(reservations.id, id), eq(reservations.tenantId, tenantId))).returning();
    return r;
  }
  async deleteReservationByTenant(id: string, tenantId: string) {
    await db.delete(reservations).where(and(eq(reservations.id, id), eq(reservations.tenantId, tenantId)));
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
  async getOrderItemsByTenant(tenantId: string) {
    return db.select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      name: orderItems.name,
      quantity: orderItems.quantity,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(eq(orders.tenantId, tenantId));
  }
  async createOrderItem(data: InsertOrderItem) {
    const [i] = await db.insert(orderItems).values(data).returning();
    return i;
  }
  async updateOrderItem(id: string, data: Record<string, any>) {
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

  async updateStaffScheduleByTenant(id: string, tenantId: string, data: Partial<InsertStaffSchedule>) {
    const [s] = await db.update(staffSchedules).set(data).where(and(eq(staffSchedules.id, id), eq(staffSchedules.tenantId, tenantId))).returning();
    return s;
  }
  async deleteStaffScheduleByTenant(id: string, tenantId: string) {
    await db.delete(staffSchedules).where(and(eq(staffSchedules.id, id), eq(staffSchedules.tenantId, tenantId)));
  }

  async getFeedbackByTenant(tenantId: string) {
    return db.select().from(feedback).where(eq(feedback.tenantId, tenantId)).orderBy(feedback.createdAt);
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

  async createSalesInquiry(data: InsertSalesInquiry) {
    const [inquiry] = await db.insert(salesInquiries).values(data).returning();
    return inquiry;
  }

  async createSupportTicket(data: InsertSupportTicket) {
    const ticketCount = await db.select({ count: count() }).from(supportTickets);
    const num = (ticketCount[0]?.count || 0) + 1;
    const referenceNumber = `SUP-${String(num).padStart(4, "0")}`;
    const [ticket] = await db.insert(supportTickets).values({ ...data, referenceNumber }).returning();
    return ticket;
  }

  async getAttendanceLogsByTenant(tenantId: string, from?: Date, to?: Date) {
    const conditions = [eq(attendanceLogs.tenantId, tenantId)];
    if (from) conditions.push(gte(attendanceLogs.date, from));
    if (to) conditions.push(lt(attendanceLogs.date, to));
    return db.select().from(attendanceLogs).where(and(...conditions)).orderBy(desc(attendanceLogs.date));
  }

  async getAttendanceLogsByUser(userId: string, tenantId: string, from?: Date, to?: Date) {
    const conditions = [eq(attendanceLogs.userId, userId), eq(attendanceLogs.tenantId, tenantId)];
    if (from) conditions.push(gte(attendanceLogs.date, from));
    if (to) conditions.push(lt(attendanceLogs.date, to));
    return db.select().from(attendanceLogs).where(and(...conditions)).orderBy(desc(attendanceLogs.date));
  }

  async getAttendanceSummary(tenantId: string, from: Date, to: Date) {
    const logs = await db.select().from(attendanceLogs).where(
      and(eq(attendanceLogs.tenantId, tenantId), gte(attendanceLogs.date, from), lt(attendanceLogs.date, to))
    );
    const schedules = await db.select().from(staffSchedules).where(
      and(eq(staffSchedules.tenantId, tenantId), gte(staffSchedules.date, from), lt(staffSchedules.date, to))
    );

    const scheduledByUser = new Map<string, number>();
    for (const s of schedules) {
      scheduledByUser.set(s.userId, (scheduledByUser.get(s.userId) || 0) + 1);
    }

    const byUser = new Map<string, { presentDays: number; lateDays: number; totalHours: number }>();
    for (const log of logs) {
      const uid = log.userId;
      if (!byUser.has(uid)) byUser.set(uid, { presentDays: 0, lateDays: 0, totalHours: 0 });
      const u = byUser.get(uid)!;
      u.presentDays++;
      if (log.status === "late") u.lateDays++;
      if (log.hoursWorked) u.totalHours += parseFloat(String(log.hoursWorked));
      if (!scheduledByUser.has(uid)) scheduledByUser.set(uid, u.presentDays);
    }

    const allUserIds = new Set([...Array.from(scheduledByUser.keys()), ...Array.from(byUser.keys())]);
    return Array.from(allUserIds).map((userId) => {
      const stats = byUser.get(userId) || { presentDays: 0, lateDays: 0, totalHours: 0 };
      const scheduled = scheduledByUser.get(userId) || stats.presentDays;
      const absentDays = Math.max(0, scheduled - stats.presentDays);
      const attendanceRate = scheduled > 0 ? parseFloat(((stats.presentDays / scheduled) * 100).toFixed(1)) : (stats.presentDays > 0 ? 100 : 0);
      return {
        userId,
        scheduledDays: scheduled,
        totalDays: stats.presentDays,
        lateDays: stats.lateDays,
        absentDays,
        totalHours: parseFloat(stats.totalHours.toFixed(2)),
        avgHours: stats.presentDays > 0 ? parseFloat((stats.totalHours / stats.presentDays).toFixed(2)) : 0,
        attendanceRate,
      };
    });
  }

  async getTodayAttendanceForUser(userId: string, tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const [log] = await db.select().from(attendanceLogs).where(
      and(
        eq(attendanceLogs.userId, userId),
        eq(attendanceLogs.tenantId, tenantId),
        gte(attendanceLogs.date, today),
        lt(attendanceLogs.date, tomorrow),
      )
    ).orderBy(desc(attendanceLogs.clockIn)).limit(1);
    return log;
  }

  async createAttendanceLog(data: InsertAttendanceLog) {
    const [log] = await db.insert(attendanceLogs).values(data).returning();
    return log;
  }

  async updateAttendanceLog(id: string, tenantId: string, data: Partial<InsertAttendanceLog>) {
    const [log] = await db.update(attendanceLogs).set(data).where(and(eq(attendanceLogs.id, id), eq(attendanceLogs.tenantId, tenantId))).returning();
    return log;
  }

  async getCleaningTemplatesByTenant(tenantId: string) {
    return db.select().from(cleaningTemplates).where(eq(cleaningTemplates.tenantId, tenantId)).orderBy(cleaningTemplates.sortOrder);
  }
  async getCleaningTemplate(id: string) {
    const [t] = await db.select().from(cleaningTemplates).where(eq(cleaningTemplates.id, id));
    return t;
  }
  async createCleaningTemplate(data: InsertCleaningTemplate) {
    const [t] = await db.insert(cleaningTemplates).values(data).returning();
    return t;
  }
  async updateCleaningTemplate(id: string, tenantId: string, data: Partial<InsertCleaningTemplate>) {
    const [t] = await db.update(cleaningTemplates).set(data).where(and(eq(cleaningTemplates.id, id), eq(cleaningTemplates.tenantId, tenantId))).returning();
    return t;
  }
  async deleteCleaningTemplate(id: string, tenantId: string) {
    const [template] = await db.select().from(cleaningTemplates).where(and(eq(cleaningTemplates.id, id), eq(cleaningTemplates.tenantId, tenantId)));
    if (!template) return;
    await db.delete(cleaningLogs).where(
      and(eq(cleaningLogs.templateId, id), eq(cleaningLogs.tenantId, tenantId))
    );
    await db.delete(cleaningTemplateItems).where(eq(cleaningTemplateItems.templateId, id));
    await db.delete(cleaningTemplates).where(and(eq(cleaningTemplates.id, id), eq(cleaningTemplates.tenantId, tenantId)));
  }
  async getCleaningTemplateItems(templateId: string) {
    return db.select().from(cleaningTemplateItems).where(eq(cleaningTemplateItems.templateId, templateId)).orderBy(cleaningTemplateItems.sortOrder);
  }
  async createCleaningTemplateItem(data: InsertCleaningTemplateItem) {
    const [item] = await db.insert(cleaningTemplateItems).values(data).returning();
    return item;
  }
  async deleteCleaningTemplateItems(templateId: string) {
    await db.delete(cleaningTemplateItems).where(eq(cleaningTemplateItems.templateId, templateId));
  }
  async getCleaningLogsByTenant(tenantId: string, date?: Date) {
    const conditions = [eq(cleaningLogs.tenantId, tenantId)];
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      conditions.push(gte(cleaningLogs.date, start));
      conditions.push(lt(cleaningLogs.date, end));
    }
    return db.select().from(cleaningLogs).where(and(...conditions)).orderBy(desc(cleaningLogs.completedAt));
  }
  async createCleaningLog(data: InsertCleaningLog) {
    const [log] = await db.insert(cleaningLogs).values(data).returning();
    return log;
  }
  async deleteCleaningLog(id: string, tenantId: string) {
    await db.delete(cleaningLogs).where(and(eq(cleaningLogs.id, id), eq(cleaningLogs.tenantId, tenantId)));
  }
  async getCleaningSchedules(tenantId: string, date: string) {
    const d = new Date(date);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(start.getTime() + 86400000);
    return db.select().from(cleaningSchedules).where(
      and(eq(cleaningSchedules.tenantId, tenantId), sql`${cleaningSchedules.date} >= ${start} AND ${cleaningSchedules.date} < ${end}`)
    );
  }
  async createCleaningSchedule(data: InsertCleaningSchedule) {
    const [s] = await db.insert(cleaningSchedules).values(data).returning();
    return s;
  }
  async updateCleaningSchedule(id: string, tenantId: string, data: Partial<InsertCleaningSchedule>) {
    const [s] = await db.update(cleaningSchedules).set(data).where(and(eq(cleaningSchedules.id, id), eq(cleaningSchedules.tenantId, tenantId))).returning();
    return s;
  }

  async getAuditTemplatesByTenant(tenantId: string) {
    return db.select().from(auditTemplates).where(eq(auditTemplates.tenantId, tenantId)).orderBy(auditTemplates.name);
  }
  async getAuditTemplate(id: string) {
    const [t] = await db.select().from(auditTemplates).where(eq(auditTemplates.id, id));
    return t;
  }
  async createAuditTemplate(data: InsertAuditTemplate) {
    const [t] = await db.insert(auditTemplates).values(data).returning();
    return t;
  }
  async updateAuditTemplate(id: string, tenantId: string, data: Partial<InsertAuditTemplate>) {
    const [t] = await db.update(auditTemplates).set(data).where(and(eq(auditTemplates.id, id), eq(auditTemplates.tenantId, tenantId))).returning();
    return t;
  }
  async deleteAuditTemplate(id: string, tenantId: string) {
    const items = await this.getAuditTemplateItems(id);
    if (items.length > 0) await this.deleteAuditTemplateItems(id);
    await db.delete(auditTemplates).where(and(eq(auditTemplates.id, id), eq(auditTemplates.tenantId, tenantId)));
  }
  async getAuditTemplateItems(templateId: string) {
    return db.select().from(auditTemplateItems).where(eq(auditTemplateItems.templateId, templateId)).orderBy(auditTemplateItems.sortOrder);
  }
  async createAuditTemplateItem(data: InsertAuditTemplateItem) {
    const [item] = await db.insert(auditTemplateItems).values(data).returning();
    return item;
  }
  async deleteAuditTemplateItems(templateId: string) {
    await db.delete(auditTemplateItems).where(eq(auditTemplateItems.templateId, templateId));
  }
  async getAuditSchedulesByTenant(tenantId: string, status?: string, from?: Date, to?: Date) {
    const conditions: any[] = [eq(auditSchedules.tenantId, tenantId)];
    if (status) conditions.push(eq(auditSchedules.status, status));
    if (from) conditions.push(gte(auditSchedules.scheduledDate, from));
    if (to) conditions.push(lte(auditSchedules.scheduledDate, to));
    return db.select().from(auditSchedules).where(and(...conditions)).orderBy(desc(auditSchedules.scheduledDate));
  }
  async getAuditSchedule(id: string) {
    const [s] = await db.select().from(auditSchedules).where(eq(auditSchedules.id, id));
    return s;
  }
  async createAuditSchedule(data: InsertAuditSchedule) {
    const [s] = await db.insert(auditSchedules).values(data).returning();
    return s;
  }
  async updateAuditSchedule(id: string, tenantId: string, data: Partial<InsertAuditSchedule>) {
    const [s] = await db.update(auditSchedules).set(data).where(and(eq(auditSchedules.id, id), eq(auditSchedules.tenantId, tenantId))).returning();
    return s;
  }
  async getAuditResponsesBySchedule(scheduleId: string) {
    return db.select().from(auditResponses).where(eq(auditResponses.scheduleId, scheduleId));
  }
  async createAuditResponse(data: InsertAuditResponse) {
    const [r] = await db.insert(auditResponses).values(data).returning();
    return r;
  }
  async updateAuditResponse(id: string, data: Partial<InsertAuditResponse>) {
    const [r] = await db.update(auditResponses).set(data).where(eq(auditResponses.id, id)).returning();
    return r;
  }
  async getAuditIssuesByTenant(tenantId: string, status?: string) {
    const conditions: any[] = [eq(auditIssues.tenantId, tenantId)];
    if (status) conditions.push(eq(auditIssues.status, status));
    return db.select().from(auditIssues).where(and(...conditions)).orderBy(desc(auditIssues.createdAt));
  }
  async createAuditIssue(data: InsertAuditIssue) {
    const [issue] = await db.insert(auditIssues).values(data).returning();
    return issue;
  }
  async updateAuditIssue(id: string, tenantId: string, data: Partial<InsertAuditIssue>) {
    const [issue] = await db.update(auditIssues).set(data).where(and(eq(auditIssues.id, id), eq(auditIssues.tenantId, tenantId))).returning();
    return issue;
  }

  async getRecipesByTenant(tenantId: string) {
    return db.select().from(recipes).where(eq(recipes.tenantId, tenantId)).orderBy(recipes.name);
  }
  async getRecipe(id: string) {
    const [r] = await db.select().from(recipes).where(eq(recipes.id, id));
    return r;
  }
  async createRecipe(data: InsertRecipe) {
    const [r] = await db.insert(recipes).values(data).returning();
    return r;
  }
  async updateRecipe(id: string, tenantId: string, data: Partial<InsertRecipe>) {
    const [r] = await db.update(recipes).set(data).where(and(eq(recipes.id, id), eq(recipes.tenantId, tenantId))).returning();
    return r;
  }
  async deleteRecipe(id: string, tenantId: string) {
    await db.delete(recipeIngredients).where(
      sql`${recipeIngredients.recipeId} = ${id}`
    );
    await db.delete(recipes).where(and(eq(recipes.id, id), eq(recipes.tenantId, tenantId)));
  }
  async getRecipeIngredients(recipeId: string) {
    return db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId)).orderBy(recipeIngredients.sortOrder);
  }
  async createRecipeIngredient(data: InsertRecipeIngredient) {
    const [ri] = await db.insert(recipeIngredients).values(data).returning();
    return ri;
  }
  async deleteRecipeIngredients(recipeId: string) {
    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
  }
  async getRecipeByMenuItem(menuItemId: string) {
    const [r] = await db.select().from(recipes).where(eq(recipes.menuItemId, menuItemId));
    return r;
  }

  async getStockTakesByTenant(tenantId: string) {
    return db.select().from(stockTakes).where(eq(stockTakes.tenantId, tenantId)).orderBy(desc(stockTakes.createdAt));
  }
  async getStockTake(id: string) {
    const [st] = await db.select().from(stockTakes).where(eq(stockTakes.id, id));
    return st;
  }
  async createStockTake(data: InsertStockTake) {
    const [st] = await db.insert(stockTakes).values(data).returning();
    return st;
  }
  async updateStockTake(id: string, tenantId: string, data: Partial<InsertStockTake>) {
    const [st] = await db.update(stockTakes).set(data).where(and(eq(stockTakes.id, id), eq(stockTakes.tenantId, tenantId))).returning();
    return st;
  }
  async getStockTakeLines(stockTakeId: string) {
    return db.select().from(stockTakeLines).where(eq(stockTakeLines.stockTakeId, stockTakeId));
  }
  async createStockTakeLine(data: InsertStockTakeLine) {
    const [line] = await db.insert(stockTakeLines).values(data).returning();
    return line;
  }
  async updateStockTakeLine(id: string, data: Partial<InsertStockTakeLine>) {
    const [line] = await db.update(stockTakeLines).set(data).where(eq(stockTakeLines.id, id)).returning();
    return line;
  }
  async getStockMovementsByTenant(tenantId: string, limit?: number) {
    const q = db.select().from(stockMovements).where(eq(stockMovements.tenantId, tenantId)).orderBy(desc(stockMovements.createdAt));
    if (limit) return q.limit(limit);
    return q;
  }

  async getKitchenStationsByTenant(tenantId: string) {
    return db.select().from(kitchenStations).where(eq(kitchenStations.tenantId, tenantId)).orderBy(kitchenStations.sortOrder);
  }
  async getKitchenStation(id: string) {
    const [s] = await db.select().from(kitchenStations).where(eq(kitchenStations.id, id));
    return s;
  }
  async createKitchenStation(data: InsertKitchenStation) {
    const [s] = await db.insert(kitchenStations).values(data).returning();
    return s;
  }
  async updateKitchenStation(id: string, tenantId: string, data: Partial<InsertKitchenStation>) {
    const [s] = await db.update(kitchenStations).set(data).where(and(eq(kitchenStations.id, id), eq(kitchenStations.tenantId, tenantId))).returning();
    return s;
  }
  async deleteKitchenStation(id: string, tenantId: string) {
    await db.delete(kitchenStations).where(and(eq(kitchenStations.id, id), eq(kitchenStations.tenantId, tenantId)));
  }
  async getOrderItem(id: string) {
    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, id));
    return item;
  }

  async getOrderChannelsByTenant(tenantId: string) {
    return db.select().from(orderChannels).where(eq(orderChannels.tenantId, tenantId));
  }
  async getOrderChannel(id: string) {
    const [c] = await db.select().from(orderChannels).where(eq(orderChannels.id, id));
    return c;
  }
  async createOrderChannel(data: InsertOrderChannel) {
    const [c] = await db.insert(orderChannels).values(data).returning();
    return c;
  }
  async updateOrderChannel(id: string, tenantId: string, data: Partial<InsertOrderChannel>) {
    const [c] = await db.update(orderChannels).set(data).where(and(eq(orderChannels.id, id), eq(orderChannels.tenantId, tenantId))).returning();
    return c;
  }
  async deleteOrderChannel(id: string, tenantId: string) {
    await db.delete(orderChannels).where(and(eq(orderChannels.id, id), eq(orderChannels.tenantId, tenantId)));
  }
  async getChannelConfigsByTenant(tenantId: string) {
    return db.select().from(channelConfigs).where(eq(channelConfigs.tenantId, tenantId));
  }
  async getChannelConfig(id: string) {
    const [c] = await db.select().from(channelConfigs).where(eq(channelConfigs.id, id));
    return c;
  }
  async createChannelConfig(data: InsertChannelConfig) {
    const [c] = await db.insert(channelConfigs).values(data).returning();
    return c;
  }
  async updateChannelConfig(id: string, tenantId: string, data: Partial<InsertChannelConfig>) {
    const [c] = await db.update(channelConfigs).set(data).where(and(eq(channelConfigs.id, id), eq(channelConfigs.tenantId, tenantId))).returning();
    return c;
  }
  async deleteChannelConfig(id: string, tenantId: string) {
    await db.delete(channelConfigs).where(and(eq(channelConfigs.id, id), eq(channelConfigs.tenantId, tenantId)));
  }
  async getOnlineMenuMappingsByTenant(tenantId: string) {
    return db.select().from(onlineMenuMappings).where(eq(onlineMenuMappings.tenantId, tenantId));
  }
  async createOnlineMenuMapping(data: InsertOnlineMenuMapping) {
    const [m] = await db.insert(onlineMenuMappings).values(data).returning();
    return m;
  }
  async updateOnlineMenuMapping(id: string, tenantId: string, data: Partial<InsertOnlineMenuMapping>) {
    const [m] = await db.update(onlineMenuMappings).set(data).where(and(eq(onlineMenuMappings.id, id), eq(onlineMenuMappings.tenantId, tenantId))).returning();
    return m;
  }
  async deleteOnlineMenuMapping(id: string, tenantId: string) {
    await db.delete(onlineMenuMappings).where(and(eq(onlineMenuMappings.id, id), eq(onlineMenuMappings.tenantId, tenantId)));
  }

  async getRegionsByTenant(tenantId: string) {
    return db.select().from(regions).where(eq(regions.tenantId, tenantId)).orderBy(regions.sortOrder);
  }
  async getRegion(id: string) {
    const [r] = await db.select().from(regions).where(eq(regions.id, id));
    return r;
  }
  async createRegion(data: InsertRegion) {
    const [r] = await db.insert(regions).values(data).returning();
    return r;
  }
  async updateRegion(id: string, tenantId: string, data: Partial<InsertRegion>) {
    const [r] = await db.update(regions).set(data).where(and(eq(regions.id, id), eq(regions.tenantId, tenantId))).returning();
    return r;
  }
  async deleteRegion(id: string, tenantId: string) {
    await db.delete(regions).where(and(eq(regions.id, id), eq(regions.tenantId, tenantId)));
  }

  async getFranchiseInvoicesByTenant(tenantId: string) {
    return db.select().from(franchiseInvoices).where(eq(franchiseInvoices.tenantId, tenantId)).orderBy(desc(franchiseInvoices.createdAt));
  }
  async getFranchiseInvoicesByOutlet(outletId: string, tenantId: string) {
    return db.select().from(franchiseInvoices).where(and(eq(franchiseInvoices.outletId, outletId), eq(franchiseInvoices.tenantId, tenantId))).orderBy(desc(franchiseInvoices.createdAt));
  }
  async createFranchiseInvoice(data: InsertFranchiseInvoice) {
    const [inv] = await db.insert(franchiseInvoices).values(data).returning();
    return inv;
  }
  async updateFranchiseInvoice(id: string, tenantId: string, data: Partial<InsertFranchiseInvoice>) {
    const [inv] = await db.update(franchiseInvoices).set(data).where(and(eq(franchiseInvoices.id, id), eq(franchiseInvoices.tenantId, tenantId))).returning();
    return inv;
  }

  async getOutletMenuOverrides(outletId: string, tenantId: string) {
    return db.select().from(outletMenuOverrides).where(and(eq(outletMenuOverrides.outletId, outletId), eq(outletMenuOverrides.tenantId, tenantId)));
  }
  async createOutletMenuOverride(data: InsertOutletMenuOverride) {
    const [o] = await db.insert(outletMenuOverrides).values(data).returning();
    return o;
  }
  async updateOutletMenuOverride(id: string, tenantId: string, data: Partial<InsertOutletMenuOverride>) {
    const [o] = await db.update(outletMenuOverrides).set(data).where(and(eq(outletMenuOverrides.id, id), eq(outletMenuOverrides.tenantId, tenantId))).returning();
    return o;
  }
  async deleteOutletMenuOverride(id: string, tenantId: string) {
    await db.delete(outletMenuOverrides).where(and(eq(outletMenuOverrides.id, id), eq(outletMenuOverrides.tenantId, tenantId)));
  }

  async getOutletKPIs(tenantId: string, outletId?: string, from?: Date, to?: Date) {
    const conditions = [eq(orders.tenantId, tenantId)];
    if (outletId) conditions.push(eq(orders.outletId, outletId));
    if (from) conditions.push(gte(orders.createdAt, from));
    if (to) conditions.push(lte(orders.createdAt, to));
    const rows = await db.select({
      outletId: orders.outletId,
      totalOrders: count(orders.id),
      totalRevenue: sum(orders.total),
      totalTax: sum(orders.tax),
      totalDiscount: sum(orders.discountAmount),
      avgCheck: sql<string>`COALESCE(AVG(CAST(${orders.total} AS NUMERIC)), 0)`,
      voidCount: sql<number>`COUNT(CASE WHEN ${orders.status} IN ('voided','cancelled') THEN 1 END)`,
    }).from(orders).where(and(...conditions)).groupBy(orders.outletId);
    return rows as Record<string, unknown>[];
  }

  async getOutletFeedbackMetrics(tenantId: string, from?: Date, to?: Date) {
    const conditions = [eq(feedback.tenantId, tenantId)];
    if (from) conditions.push(gte(feedback.createdAt, from));
    if (to) conditions.push(lte(feedback.createdAt, to));
    const rows = await db.select({
      outletId: sql<string>`COALESCE(${orders.outletId}, 'unknown')`,
      avgRating: sql<string>`ROUND(AVG(${feedback.rating})::numeric, 1)`,
      feedbackCount: count(feedback.id),
    }).from(feedback)
      .leftJoin(orders, eq(feedback.orderId, orders.id))
      .where(and(...conditions))
      .groupBy(orders.outletId);
    return rows as Record<string, unknown>[];
  }

  async getOutletLabourMetrics(tenantId: string, from?: Date, to?: Date) {
    const conditions = [eq(attendanceLogs.tenantId, tenantId)];
    if (from) conditions.push(gte(attendanceLogs.date, from));
    if (to) conditions.push(lte(attendanceLogs.date, to));
    const rows = await db.select({
      outletId: sql<string>`COALESCE(${staffSchedules.outletId}, 'unknown')`,
      labourHours: sql<number>`COALESCE(SUM(CAST(${attendanceLogs.hoursWorked} AS NUMERIC)), 0)`,
    }).from(attendanceLogs)
      .leftJoin(staffSchedules, eq(attendanceLogs.scheduleId, staffSchedules.id))
      .where(and(...conditions))
      .groupBy(staffSchedules.outletId);
    return rows as Record<string, unknown>[];
  }

  async getOutletFoodCostMetrics(tenantId: string): Promise<Map<string, string>> {
    const allRecipes = await db.select().from(recipes).where(eq(recipes.tenantId, tenantId));
    const allIngredients = await db.select().from(recipeIngredients);
    const allItems = await db.select().from(menuItems).where(eq(menuItems.tenantId, tenantId));
    const invItems = await db.select().from(inventoryItems).where(eq(inventoryItems.tenantId, tenantId));
    const invMap = new Map(invItems.map(i => [i.id, parseFloat(i.costPerUnit || "0")]));

    let totalMenuPrice = 0;
    let totalCost = 0;
    for (const recipe of allRecipes) {
      const mi = allItems.find(m => m.id === recipe.menuItemId);
      if (!mi) continue;
      const price = parseFloat(mi.price);
      const ingredients = allIngredients.filter(ri => ri.recipeId === recipe.id);
      let recipeCost = 0;
      for (const ing of ingredients) {
        const unitCost = invMap.get(ing.inventoryItemId) || 0;
        recipeCost += parseFloat(ing.quantity) * unitCost;
      }
      totalMenuPrice += price;
      totalCost += recipeCost;
    }
    const globalFoodCostPct = totalMenuPrice > 0 ? ((totalCost / totalMenuPrice) * 100).toFixed(1) : "0.0";
    const result = new Map<string, string>();
    const outletList = await this.getOutletsByTenant(tenantId);
    for (const o of outletList) {
      result.set(o.id, globalFoodCostPct);
    }
    return result;
  }
}

export const storage = new DatabaseStorage();