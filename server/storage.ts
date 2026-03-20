import { eq, and, desc, sql, gte, lte, lt, count, sum, inArray } from "drizzle-orm";
import { db } from "./db";
import { encryptField, decryptField, isEncrypted } from "./encryption";

function encryptPiiFields<T extends Record<string, unknown>>(data: T, fields: string[]): T {
  const result = { ...data };
  for (const field of fields) {
    const val = result[field];
    if (typeof val === "string" && val && !isEncrypted(val)) {
      (result as Record<string, unknown>)[field] = encryptField(val);
    }
  }
  return result;
}

function decryptPiiFields<T extends Record<string, unknown>>(record: T, fields: string[]): T {
  if (!record) return record;
  const result = { ...record };
  for (const field of fields) {
    const val = result[field];
    if (typeof val === "string" && isEncrypted(val)) {
      (result as Record<string, unknown>)[field] = decryptField(val);
    }
  }
  return result;
}

const USER_PII_FIELDS = ["email", "phone"];
const CUSTOMER_PII_FIELDS = ["email", "phone"];
const RESERVATION_PII_FIELDS = ["customerPhone"];
const DELIVERY_PII_FIELDS = ["customerPhone", "customerAddress"];
const WAITLIST_PII_FIELDS = ["customerPhone"];
import {
  tenants, users, outlets, menuCategories, menuItems, tableZones, tables, waitlistEntries,
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
  type TableZone, type InsertTableZone,
  type Table, type InsertTable,
  type WaitlistEntry, type InsertWaitlistEntry,
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
  suppliers, supplierCatalogItems, purchaseOrders, purchaseOrderItems,
  goodsReceivedNotes, grnItems, procurementApprovals,
  type OrderChannel, type InsertOrderChannel,
  type ChannelConfig, type InsertChannelConfig,
  type OnlineMenuMapping, type InsertOnlineMenuMapping,
  type Region, type InsertRegion,
  type FranchiseInvoice, type InsertFranchiseInvoice,
  type OutletMenuOverride, type InsertOutletMenuOverride,
  type Supplier, type InsertSupplier,
  type SupplierCatalogItem, type InsertSupplierCatalogItem,
  type PurchaseOrder, type InsertPurchaseOrder,
  type PurchaseOrderItem, type InsertPurchaseOrderItem,
  type GoodsReceivedNote, type InsertGoodsReceivedNote,
  type GrnItem, type InsertGrnItem,
  type ProcurementApproval, type InsertProcurementApproval,
  labourCostSnapshots,
  type LabourCostSnapshot, type InsertLabourCostSnapshot,
  auditEvents,
  type AuditEvent, type InsertAuditEvent,
  promotionRules,
  type PromotionRule, type InsertPromotionRule,
  kioskDevices,
  type KioskDevice, type InsertKioskDevice,
  upsellRules,
  type UpsellRule, type InsertUpsellRule,
  tableSessions, guestCartItems,
  type TableSession, type InsertTableSession,
  type GuestCartItem, type InsertGuestCartItem,
  events,
  type Event, type InsertEvent,
  comboOffers,
  type ComboOffer, type InsertComboOffer,
  shifts, menuItemStations, kotEvents,
  type Shift, type InsertShift,
  type MenuItemStation, type InsertMenuItemStation,
  type KotEvent, type InsertKotEvent,
  bills, billPayments, posSessions,
  type Bill, type InsertBill,
  type BillPayment, type InsertBillPayment,
  type PosSession, type InsertPosSession,
} from "@shared/schema";

export interface IStorage {
  getTenant(id: string): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  getTenantByStripeCustomerId(stripeCustomerId: string): Promise<Tenant | undefined>;
  getTenantByWallScreenToken(token: string): Promise<Tenant | undefined>;
  createTenant(data: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined>;
  regenerateWallScreenToken(tenantId: string): Promise<string>;
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

  getTableZonesByTenant(tenantId: string): Promise<TableZone[]>;
  createTableZone(data: InsertTableZone): Promise<TableZone>;
  updateTableZone(id: string, tenantId: string, data: Partial<InsertTableZone>): Promise<TableZone | undefined>;
  deleteTableZone(id: string, tenantId: string): Promise<void>;

  getTablesByTenant(tenantId: string): Promise<Table[]>;
  getTable(id: string): Promise<Table | undefined>;
  createTable(data: InsertTable): Promise<Table>;
  updateTable(id: string, data: Partial<InsertTable>): Promise<Table | undefined>;
  updateTableByTenant(id: string, tenantId: string, data: Partial<InsertTable>): Promise<Table | undefined>;
  deleteTable(id: string): Promise<void>;
  deleteTableByTenant(id: string, tenantId: string): Promise<void>;

  getWaitlistByTenant(tenantId: string): Promise<WaitlistEntry[]>;
  createWaitlistEntry(data: InsertWaitlistEntry): Promise<WaitlistEntry>;
  updateWaitlistEntry(id: string, tenantId: string, data: Partial<InsertWaitlistEntry>): Promise<WaitlistEntry | undefined>;
  deleteWaitlistEntry(id: string, tenantId: string): Promise<void>;

  getReservationsByTenant(tenantId: string): Promise<Reservation[]>;
  createReservation(data: InsertReservation): Promise<Reservation>;
  updateReservation(id: string, data: Partial<InsertReservation>): Promise<Reservation | undefined>;
  updateReservationByTenant(id: string, tenantId: string, data: Partial<InsertReservation>): Promise<Reservation | undefined>;
  deleteReservationByTenant(id: string, tenantId: string): Promise<void>;

  getOrdersByTenant(tenantId: string, opts?: { limit?: number; offset?: number }): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  getOrderByClientId(tenantId: string, clientOrderId: string): Promise<Order | undefined>;
  getOrderByStripeSessionId(sessionId: string): Promise<Order | undefined>;
  createOrder(data: InsertOrder): Promise<Order>;
  updateOrder(id: string, data: Partial<InsertOrder>): Promise<Order | undefined>;
  getOrderItemsByOrder(orderId: string): Promise<OrderItem[]>;
  getOrderItemsByTenant(tenantId: string): Promise<any[]>;
  createOrderItem(data: InsertOrderItem): Promise<OrderItem>;
  updateOrderItem(id: string, data: Record<string, any>): Promise<OrderItem | undefined>;

  getInventoryByTenant(tenantId: string, opts?: { limit?: number; offset?: number }): Promise<InventoryItem[]>;
  getInventoryItem(id: string): Promise<InventoryItem | undefined>;
  createInventoryItem(data: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(id: string, data: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined>;
  deleteInventoryItem(id: string): Promise<void>;
  createStockMovement(data: InsertStockMovement): Promise<StockMovement>;

  getCustomersByTenant(tenantId: string, opts?: { limit?: number; offset?: number }): Promise<Customer[]>;
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

  getDeliveryOrdersByTenant(tenantId: string, opts?: { limit?: number; offset?: number }): Promise<DeliveryOrder[]>;
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

  getLabourCostSnapshots(tenantId: string, from: Date, to: Date): Promise<LabourCostSnapshot[]>;
  createLabourCostSnapshot(data: InsertLabourCostSnapshot): Promise<LabourCostSnapshot>;

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
  getStockMovementsByTenant(tenantId: string, limit?: number, offset?: number): Promise<StockMovement[]>;
  getStockMovementsByTenantFiltered(tenantId: string, filters: {
    from?: Date; to?: Date; chefId?: string; station?: string;
    type?: string; ingredientId?: string; shiftId?: string;
    limit?: number; offset?: number;
  }): Promise<StockMovement[]>;
  getStockMovementsByOrder(orderId: string): Promise<StockMovement[]>;

  getShiftsByTenant(tenantId: string): Promise<Shift[]>;
  createShift(data: InsertShift): Promise<Shift>;
  updateShift(id: string, tenantId: string, data: Partial<InsertShift>): Promise<Shift | undefined>;
  deleteShift(id: string, tenantId: string): Promise<void>;
  getActiveShift(tenantId: string, outletId?: string): Promise<Shift | undefined>;

  getMenuItemStationsByTenant(tenantId: string): Promise<MenuItemStation[]>;
  getMenuItemStationsByItem(menuItemId: string): Promise<MenuItemStation[]>;
  upsertMenuItemStation(data: InsertMenuItemStation): Promise<MenuItemStation>;
  deleteMenuItemStations(menuItemId: string, tenantId: string): Promise<void>;

  createKotEvent(data: InsertKotEvent): Promise<KotEvent>;
  getKotEventsByOrder(orderId: string): Promise<KotEvent[]>;
  getKotEventsByTenant(tenantId: string, limit?: number): Promise<KotEvent[]>;

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
  getMenuItemsForOutlet(tenantId: string, outletId: string): Promise<Record<string, unknown>[]>;

  getSuppliersByTenant(tenantId: string): Promise<Supplier[]>;
  getSupplier(id: string, tenantId: string): Promise<Supplier | undefined>;
  createSupplier(data: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: string, tenantId: string, data: Partial<InsertSupplier>): Promise<Supplier | undefined>;
  deleteSupplier(id: string, tenantId: string): Promise<void>;

  getSupplierCatalogItems(supplierId: string, tenantId: string): Promise<SupplierCatalogItem[]>;
  getCatalogItemsByInventoryItem(inventoryItemId: string, tenantId: string): Promise<SupplierCatalogItem[]>;
  createSupplierCatalogItem(data: InsertSupplierCatalogItem): Promise<SupplierCatalogItem>;
  updateSupplierCatalogItem(id: string, tenantId: string, data: Partial<InsertSupplierCatalogItem>): Promise<SupplierCatalogItem | undefined>;
  deleteSupplierCatalogItem(id: string, tenantId: string): Promise<void>;

  getPurchaseOrdersByTenant(tenantId: string): Promise<PurchaseOrder[]>;
  countPurchaseOrdersByTenant(tenantId: string): Promise<number>;
  getPurchaseOrder(id: string, tenantId: string): Promise<PurchaseOrder | undefined>;
  createPurchaseOrder(data: InsertPurchaseOrder): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: string, tenantId: string, data: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined>;

  getPurchaseOrderItems(poId: string): Promise<PurchaseOrderItem[]>;
  createPurchaseOrderItem(data: InsertPurchaseOrderItem): Promise<PurchaseOrderItem>;
  updatePurchaseOrderItem(id: string, data: Partial<InsertPurchaseOrderItem>): Promise<PurchaseOrderItem | undefined>;

  getGRNsByTenant(tenantId: string): Promise<GoodsReceivedNote[]>;
  getGRNsByPO(poId: string): Promise<GoodsReceivedNote[]>;
  createGRN(data: InsertGoodsReceivedNote): Promise<GoodsReceivedNote>;
  getGRNItems(grnId: string): Promise<GrnItem[]>;
  createGRNItem(data: InsertGrnItem): Promise<GrnItem>;

  getProcurementApprovals(poId: string): Promise<ProcurementApproval[]>;
  createProcurementApproval(data: InsertProcurementApproval): Promise<ProcurementApproval>;

  getAuditEventsByTenant(tenantId: string, filters?: {
    from?: Date; to?: Date; userId?: string; action?: string; entityType?: string; outletId?: string; entityId?: string; limit?: number; offset?: number;
  }): Promise<{ events: AuditEvent[]; total: number }>;
  createAuditEvent(data: InsertAuditEvent): Promise<AuditEvent>;
  getAuditEventsByEntity(tenantId: string, entityType: string, entityId: string): Promise<AuditEvent[]>;

  getPromotionRulesByTenant(tenantId: string): Promise<PromotionRule[]>;
  getPromotionRule(id: string, tenantId: string): Promise<PromotionRule | undefined>;
  createPromotionRule(data: InsertPromotionRule): Promise<PromotionRule>;
  updatePromotionRule(id: string, tenantId: string, data: Partial<InsertPromotionRule>): Promise<PromotionRule | undefined>;
  deletePromotionRule(id: string, tenantId: string): Promise<void>;

  getKioskDevicesByTenant(tenantId: string): Promise<KioskDevice[]>;
  getKioskDevice(id: string, tenantId: string): Promise<KioskDevice | undefined>;
  getKioskDeviceByToken(token: string): Promise<KioskDevice | undefined>;
  createKioskDevice(data: InsertKioskDevice): Promise<KioskDevice>;
  updateKioskDevice(id: string, tenantId: string, data: Partial<InsertKioskDevice>): Promise<KioskDevice | undefined>;
  deleteKioskDevice(id: string, tenantId: string): Promise<void>;

  getUpsellRulesByTenant(tenantId: string): Promise<UpsellRule[]>;
  getUpsellRule(id: string, tenantId: string): Promise<UpsellRule | undefined>;
  createUpsellRule(data: InsertUpsellRule): Promise<UpsellRule>;
  updateUpsellRule(id: string, tenantId: string, data: Partial<InsertUpsellRule>): Promise<UpsellRule | undefined>;
  deleteUpsellRule(id: string, tenantId: string): Promise<void>;

  getTableByQrToken(outletId: string, qrToken: string): Promise<Table | undefined>;
  getTableSessionsByTable(tableId: string): Promise<TableSession[]>;
  getTableSession(id: string): Promise<TableSession | undefined>;
  getActiveTableSession(tableId: string): Promise<TableSession | undefined>;
  createTableSession(data: InsertTableSession): Promise<TableSession>;
  updateTableSession(id: string, data: Partial<InsertTableSession>): Promise<TableSession | undefined>;

  getGuestCartItems(sessionId: string): Promise<GuestCartItem[]>;
  createGuestCartItem(data: InsertGuestCartItem): Promise<GuestCartItem>;
  updateGuestCartItem(id: string, data: Partial<InsertGuestCartItem>): Promise<GuestCartItem | undefined>;
  deleteGuestCartItem(id: string): Promise<void>;
  clearGuestCart(sessionId: string): Promise<void>;

  getEventsByTenant(tenantId: string): Promise<Event[]>;
  getEvent(id: string, tenantId: string): Promise<Event | undefined>;
  createEvent(data: InsertEvent): Promise<Event>;
  updateEvent(id: string, tenantId: string, data: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: string, tenantId: string): Promise<void>;

  getComboOffersByTenant(tenantId: string): Promise<ComboOffer[]>;
  getComboOffer(id: string, tenantId: string): Promise<ComboOffer | undefined>;
  createComboOffer(data: InsertComboOffer): Promise<ComboOffer>;
  updateComboOffer(id: string, tenantId: string, data: Partial<InsertComboOffer>): Promise<ComboOffer | undefined>;
  deleteComboOffer(id: string, tenantId: string): Promise<void>;
  incrementComboOrderCount(id: string, tenantId: string): Promise<void>;

  generateBillNumber(tenantId: string): Promise<string>;
  createBill(data: InsertBill): Promise<Bill>;
  getBill(id: string): Promise<Bill | undefined>;
  getBillByOrder(orderId: string): Promise<Bill | undefined>;
  getBillsByOrder(orderId: string): Promise<Bill[]>;
  getBillsByTenant(tenantId: string, opts?: { limit?: number; offset?: number; status?: string }): Promise<Bill[]>;
  updateBill(id: string, tenantId: string, data: Partial<InsertBill>): Promise<Bill | undefined>;
  createBillPayment(data: InsertBillPayment): Promise<BillPayment>;
  getBillPayments(billId: string): Promise<BillPayment[]>;
  getBillPaymentsByTenant(tenantId: string, opts?: { limit?: number }): Promise<BillPayment[]>;
  createPosSession(data: InsertPosSession): Promise<PosSession>;
  getActivePosSession(tenantId: string, waiterId: string): Promise<PosSession | undefined>;
  getPosSession(id: string): Promise<PosSession | undefined>;
  closePosSession(id: string, tenantId: string, data: { closingCashCount?: number; closedBy: string; notes?: string }): Promise<PosSession | undefined>;
  updatePosSession(id: string, tenantId: string, data: Partial<InsertPosSession>): Promise<PosSession | undefined>;
  getPosSessionReport(sessionId: string): Promise<{ session: PosSession; billCount: number; totalRevenue: number; revenueByMethod: Record<string, number>; cashSales: number; expectedCash: number }>;
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
  async getTenantByStripeCustomerId(stripeCustomerId: string) {
    const [t] = await db.select().from(tenants).where(eq(tenants.stripeCustomerId, stripeCustomerId));
    return t;
  }
  async getTenantByWallScreenToken(token: string) {
    const [t] = await db.select().from(tenants).where(eq(tenants.wallScreenToken, token));
    return t;
  }
  async regenerateWallScreenToken(tenantId: string): Promise<string> {
    const { randomBytes } = await import("crypto");
    const token = randomBytes(24).toString("base64url");
    await db.update(tenants).set({ wallScreenToken: token }).where(eq(tenants.id, tenantId));
    return token;
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
    return u ? decryptPiiFields(u as Record<string, unknown>, USER_PII_FIELDS) as User : undefined;
  }
  async getUserByUsername(username: string) {
    const [u] = await db.select().from(users).where(eq(users.username, username));
    return u ? decryptPiiFields(u as Record<string, unknown>, USER_PII_FIELDS) as User : undefined;
  }
  async createUser(data: InsertUser) {
    const encData = encryptPiiFields(data as Record<string, unknown>, USER_PII_FIELDS) as InsertUser;
    const [u] = await db.insert(users).values(encData).returning();
    return decryptPiiFields(u as Record<string, unknown>, USER_PII_FIELDS) as User;
  }
  async updateUser(id: string, data: Partial<InsertUser>) {
    const encData = encryptPiiFields(data as Record<string, unknown>, USER_PII_FIELDS) as Partial<InsertUser>;
    const [u] = await db.update(users).set(encData).where(eq(users.id, id)).returning();
    return u ? decryptPiiFields(u as Record<string, unknown>, USER_PII_FIELDS) as User : undefined;
  }
  async getUsersByTenant(tenantId: string) {
    const rows = await db.select().from(users).where(eq(users.tenantId, tenantId));
    return rows.map(u => decryptPiiFields(u as Record<string, unknown>, USER_PII_FIELDS) as User);
  }

  async getOutletsByTenant(tenantId: string) {
    return db.select().from(outlets).where(eq(outlets.tenantId, tenantId)).limit(500);
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
    return db.select().from(menuCategories).where(eq(menuCategories.tenantId, tenantId)).orderBy(menuCategories.sortOrder).limit(500);
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
    return db.select().from(menuItems).where(eq(menuItems.tenantId, tenantId)).limit(500);
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

  async getTableZonesByTenant(tenantId: string) {
    return db.select().from(tableZones).where(eq(tableZones.tenantId, tenantId)).orderBy(tableZones.sortOrder).limit(500);
  }
  async createTableZone(data: InsertTableZone) {
    const [z] = await db.insert(tableZones).values(data).returning();
    return z;
  }
  async updateTableZone(id: string, tenantId: string, data: Partial<InsertTableZone>) {
    const [z] = await db.update(tableZones).set(data).where(and(eq(tableZones.id, id), eq(tableZones.tenantId, tenantId))).returning();
    return z;
  }
  async deleteTableZone(id: string, tenantId: string) {
    await db.delete(tableZones).where(and(eq(tableZones.id, id), eq(tableZones.tenantId, tenantId)));
  }

  async getTablesByTenant(tenantId: string) {
    return db.select().from(tables).where(eq(tables.tenantId, tenantId)).orderBy(tables.number).limit(500);
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

  async getWaitlistByTenant(tenantId: string) {
    const rows = await db.select().from(waitlistEntries).where(eq(waitlistEntries.tenantId, tenantId)).orderBy(waitlistEntries.priority, waitlistEntries.createdAt).limit(200);
    return rows.map(w => decryptPiiFields(w as Record<string, unknown>, WAITLIST_PII_FIELDS) as WaitlistEntry);
  }
  async createWaitlistEntry(data: InsertWaitlistEntry) {
    const encData = encryptPiiFields(data as Record<string, unknown>, WAITLIST_PII_FIELDS) as InsertWaitlistEntry;
    const [w] = await db.insert(waitlistEntries).values(encData).returning();
    return decryptPiiFields(w as Record<string, unknown>, WAITLIST_PII_FIELDS) as WaitlistEntry;
  }
  async updateWaitlistEntry(id: string, tenantId: string, data: Partial<InsertWaitlistEntry>) {
    const encData = encryptPiiFields(data as Record<string, unknown>, WAITLIST_PII_FIELDS) as Partial<InsertWaitlistEntry>;
    const [w] = await db.update(waitlistEntries).set(encData).where(and(eq(waitlistEntries.id, id), eq(waitlistEntries.tenantId, tenantId))).returning();
    return w ? decryptPiiFields(w as Record<string, unknown>, WAITLIST_PII_FIELDS) as WaitlistEntry : undefined;
  }
  async deleteWaitlistEntry(id: string, tenantId: string) {
    await db.delete(waitlistEntries).where(and(eq(waitlistEntries.id, id), eq(waitlistEntries.tenantId, tenantId)));
  }

  async getReservationsByTenant(tenantId: string) {
    const rows = await db.select().from(reservations).where(eq(reservations.tenantId, tenantId)).orderBy(desc(reservations.dateTime));
    return rows.map(r => decryptPiiFields(r as Record<string, unknown>, RESERVATION_PII_FIELDS) as Reservation);
  }
  async createReservation(data: InsertReservation) {
    const encData = encryptPiiFields(data as Record<string, unknown>, RESERVATION_PII_FIELDS) as InsertReservation;
    const [r] = await db.insert(reservations).values(encData).returning();
    return decryptPiiFields(r as Record<string, unknown>, RESERVATION_PII_FIELDS) as Reservation;
  }
  async updateReservation(id: string, data: Partial<InsertReservation>) {
    const encData = encryptPiiFields(data as Record<string, unknown>, RESERVATION_PII_FIELDS) as Partial<InsertReservation>;
    const [r] = await db.update(reservations).set(encData).where(eq(reservations.id, id)).returning();
    return r ? decryptPiiFields(r as Record<string, unknown>, RESERVATION_PII_FIELDS) as Reservation : undefined;
  }
  async updateReservationByTenant(id: string, tenantId: string, data: Partial<InsertReservation>) {
    const encData = encryptPiiFields(data as Record<string, unknown>, RESERVATION_PII_FIELDS) as Partial<InsertReservation>;
    const [r] = await db.update(reservations).set(encData).where(and(eq(reservations.id, id), eq(reservations.tenantId, tenantId))).returning();
    return r ? decryptPiiFields(r as Record<string, unknown>, RESERVATION_PII_FIELDS) as Reservation : undefined;
  }
  async deleteReservationByTenant(id: string, tenantId: string) {
    await db.delete(reservations).where(and(eq(reservations.id, id), eq(reservations.tenantId, tenantId)));
  }

  async getOrdersByTenant(tenantId: string, opts?: { limit?: number; offset?: number }) {
    const q = db.select().from(orders).where(eq(orders.tenantId, tenantId)).orderBy(desc(orders.createdAt));
    if (opts?.limit !== undefined && opts?.offset !== undefined) return q.limit(opts.limit).offset(opts.offset);
    if (opts?.limit !== undefined) return q.limit(opts.limit);
    return q;
  }
  async getOrder(id: string) {
    const [o] = await db.select().from(orders).where(eq(orders.id, id));
    return o;
  }
  async getOrderByClientId(tenantId: string, clientOrderId: string) {
    const [o] = await db.select().from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.channelOrderId, clientOrderId)));
    return o;
  }
  async getOrderByStripeSessionId(sessionId: string) {
    const { pool } = await import("./db");
    const result = await pool.query(
      `SELECT * FROM orders WHERE stripe_payment_session_id = $1 LIMIT 1`,
      [sessionId]
    );
    if (!result.rows[0]) return undefined;
    const row = result.rows[0];
    return {
      ...row,
      stripePaymentSessionId: row.stripe_payment_session_id,
    } as Order;
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
      menuItemId: orderItems.menuItemId,
      name: orderItems.name,
      quantity: orderItems.quantity,
      price: orderItems.price,
      status: orderItems.status,
      station: orderItems.station,
      course: orderItems.course,
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

  async getInventoryByTenant(tenantId: string, opts?: { limit?: number; offset?: number }) {
    const q = db.select().from(inventoryItems).where(eq(inventoryItems.tenantId, tenantId));
    if (opts?.limit !== undefined && opts?.offset !== undefined) return q.limit(opts.limit).offset(opts.offset);
    if (opts?.limit !== undefined) return q.limit(opts.limit);
    return q;
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

  async getCustomersByTenant(tenantId: string, opts?: { limit?: number; offset?: number }) {
    const q = db.select().from(customers).where(eq(customers.tenantId, tenantId));
    let rows: typeof customers.$inferSelect[];
    if (opts?.limit !== undefined && opts?.offset !== undefined) rows = await q.limit(opts.limit).offset(opts.offset);
    else if (opts?.limit !== undefined) rows = await q.limit(opts.limit);
    else rows = await q;
    return rows.map(c => decryptPiiFields(c as Record<string, unknown>, CUSTOMER_PII_FIELDS) as Customer);
  }
  async createCustomer(data: InsertCustomer) {
    const encData = encryptPiiFields(data as Record<string, unknown>, CUSTOMER_PII_FIELDS) as InsertCustomer;
    const [c] = await db.insert(customers).values(encData).returning();
    return decryptPiiFields(c as Record<string, unknown>, CUSTOMER_PII_FIELDS) as Customer;
  }
  async updateCustomer(id: string, data: Partial<InsertCustomer>) {
    const encData = encryptPiiFields(data as Record<string, unknown>, CUSTOMER_PII_FIELDS) as Partial<InsertCustomer>;
    const [c] = await db.update(customers).set(encData).where(eq(customers.id, id)).returning();
    return c ? decryptPiiFields(c as Record<string, unknown>, CUSTOMER_PII_FIELDS) as Customer : undefined;
  }

  async getStaffSchedulesByTenant(tenantId: string) {
    return db.select().from(staffSchedules).where(eq(staffSchedules.tenantId, tenantId)).limit(500);
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
    return db.select().from(offers).where(eq(offers.tenantId, tenantId)).orderBy(desc(offers.createdAt)).limit(200);
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

  async getDeliveryOrdersByTenant(tenantId: string, opts?: { limit?: number; offset?: number }) {
    const q = db.select().from(deliveryOrders).where(eq(deliveryOrders.tenantId, tenantId)).orderBy(desc(deliveryOrders.createdAt));
    let rows: typeof deliveryOrders.$inferSelect[];
    if (opts?.limit !== undefined && opts?.offset !== undefined) rows = await q.limit(opts.limit).offset(opts.offset);
    else if (opts?.limit !== undefined) rows = await q.limit(opts.limit);
    else rows = await q;
    return rows.map(d => decryptPiiFields(d as Record<string, unknown>, DELIVERY_PII_FIELDS) as DeliveryOrder);
  }
  async getDeliveryOrderByTenant(id: string, tenantId: string) {
    const [d] = await db.select().from(deliveryOrders).where(and(eq(deliveryOrders.id, id), eq(deliveryOrders.tenantId, tenantId)));
    return d ? decryptPiiFields(d as Record<string, unknown>, DELIVERY_PII_FIELDS) as DeliveryOrder : undefined;
  }
  async createDeliveryOrder(data: InsertDeliveryOrder) {
    const encData = encryptPiiFields(data as Record<string, unknown>, DELIVERY_PII_FIELDS) as InsertDeliveryOrder;
    const [d] = await db.insert(deliveryOrders).values(encData).returning();
    return decryptPiiFields(d as Record<string, unknown>, DELIVERY_PII_FIELDS) as DeliveryOrder;
  }
  async updateDeliveryOrderByTenant(id: string, tenantId: string, data: Partial<InsertDeliveryOrder>) {
    const encData = encryptPiiFields(data as Record<string, unknown>, DELIVERY_PII_FIELDS) as Partial<InsertDeliveryOrder>;
    const [d] = await db.update(deliveryOrders).set(encData).where(and(eq(deliveryOrders.id, id), eq(deliveryOrders.tenantId, tenantId))).returning();
    return d ? decryptPiiFields(d as Record<string, unknown>, DELIVERY_PII_FIELDS) as DeliveryOrder : undefined;
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
    return c ? decryptPiiFields(c as Record<string, unknown>, CUSTOMER_PII_FIELDS) as Customer : undefined;
  }
  async updateCustomerByTenant(id: string, tenantId: string, data: Partial<InsertCustomer>) {
    const encData = encryptPiiFields(data as Record<string, unknown>, CUSTOMER_PII_FIELDS) as Partial<InsertCustomer>;
    const [c] = await db.update(customers).set(encData).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).returning();
    return c ? decryptPiiFields(c as Record<string, unknown>, CUSTOMER_PII_FIELDS) as Customer : undefined;
  }
  async deleteCustomerByTenant(id: string, tenantId: string) {
    await db.delete(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
  }
  async getCustomersByLoyaltyTier(tenantId: string, tier: string) {
    const rows = await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.loyaltyTier, tier)));
    return rows.map(c => decryptPiiFields(c as Record<string, unknown>, CUSTOMER_PII_FIELDS) as Customer);
  }
  async getCustomersByTags(tenantId: string, tag: string) {
    const rows = await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), sql`${tag} = ANY(${customers.tags})`));
    return rows.map(c => decryptPiiFields(c as Record<string, unknown>, CUSTOMER_PII_FIELDS) as Customer);
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

  async getLabourCostSnapshots(tenantId: string, from: Date, to: Date) {
    return db.select().from(labourCostSnapshots).where(
      and(eq(labourCostSnapshots.tenantId, tenantId), gte(labourCostSnapshots.date, from), lte(labourCostSnapshots.date, to))
    ).orderBy(labourCostSnapshots.date);
  }
  async createLabourCostSnapshot(data: InsertLabourCostSnapshot) {
    const [s] = await db.insert(labourCostSnapshots).values(data).returning();
    return s;
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
    return db.select().from(recipes).where(eq(recipes.tenantId, tenantId)).orderBy(recipes.name).limit(200);
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
  async getStockMovementsByTenant(tenantId: string, limit?: number, offset?: number) {
    const q = db.select().from(stockMovements).where(eq(stockMovements.tenantId, tenantId)).orderBy(desc(stockMovements.createdAt));
    if (limit && offset !== undefined) return q.limit(limit).offset(offset);
    if (limit) return q.limit(limit);
    return q;
  }
  async getStockMovementsByOrder(orderId: string) {
    return db.select().from(stockMovements).where(eq(stockMovements.orderId, orderId)).orderBy(desc(stockMovements.createdAt));
  }

  async getKitchenStationsByTenant(tenantId: string) {
    return db.select().from(kitchenStations).where(eq(kitchenStations.tenantId, tenantId)).orderBy(kitchenStations.sortOrder).limit(200);
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
      totalRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${orders.status} NOT IN ('voided','cancelled') THEN CAST(${orders.total} AS NUMERIC) ELSE 0 END), 0)`,
      totalTax: sql<string>`COALESCE(SUM(CASE WHEN ${orders.status} NOT IN ('voided','cancelled') THEN CAST(${orders.tax} AS NUMERIC) ELSE 0 END), 0)`,
      totalDiscount: sql<string>`COALESCE(SUM(CASE WHEN ${orders.status} NOT IN ('voided','cancelled') THEN CAST(${orders.discountAmount} AS NUMERIC) ELSE 0 END), 0)`,
      avgCheck: sql<string>`COALESCE(AVG(CASE WHEN ${orders.status} NOT IN ('voided','cancelled') THEN CAST(${orders.total} AS NUMERIC) END), 0)`,
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
    const invMap = new Map(invItems.map(i => [i.id, parseFloat(i.costPerBaseUnit || i.costPrice || "0")]));

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

  async getMenuItemsForOutlet(tenantId: string, outletId: string) {
    const items = await db.select().from(menuItems).where(eq(menuItems.tenantId, tenantId));
    const overrideRows = await db.select().from(outletMenuOverrides)
      .where(and(eq(outletMenuOverrides.tenantId, tenantId), eq(outletMenuOverrides.outletId, outletId)));
    const overrideMap = new Map(overrideRows.map(o => [o.menuItemId, o]));
    return items.map(item => {
      const override = overrideMap.get(item.id);
      if (override) {
        return {
          ...item,
          price: override.overridePrice || item.price,
          available: override.available,
          hasOverride: true,
        };
      }
      return { ...item, hasOverride: false };
    }).filter(item => item.available !== false);
  }

  async getSuppliersByTenant(tenantId: string) {
    return db.select().from(suppliers).where(eq(suppliers.tenantId, tenantId)).orderBy(suppliers.name).limit(200);
  }
  async getSupplier(id: string, tenantId: string) {
    const [s] = await db.select().from(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)));
    return s;
  }
  async createSupplier(data: InsertSupplier) {
    const [s] = await db.insert(suppliers).values(data).returning();
    return s;
  }
  async updateSupplier(id: string, tenantId: string, data: Partial<InsertSupplier>) {
    const [s] = await db.update(suppliers).set(data).where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId))).returning();
    return s;
  }
  async deleteSupplier(id: string, tenantId: string) {
    await db.delete(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)));
  }

  async getSupplierCatalogItems(supplierId: string, tenantId: string) {
    return db.select().from(supplierCatalogItems).where(and(eq(supplierCatalogItems.supplierId, supplierId), eq(supplierCatalogItems.tenantId, tenantId)));
  }
  async getCatalogItemsByInventoryItem(inventoryItemId: string, tenantId: string) {
    return db.select().from(supplierCatalogItems).where(and(eq(supplierCatalogItems.inventoryItemId, inventoryItemId), eq(supplierCatalogItems.tenantId, tenantId)));
  }
  async createSupplierCatalogItem(data: InsertSupplierCatalogItem) {
    const [s] = await db.insert(supplierCatalogItems).values(data).returning();
    return s;
  }
  async updateSupplierCatalogItem(id: string, tenantId: string, data: Partial<InsertSupplierCatalogItem>) {
    const [s] = await db.update(supplierCatalogItems).set(data).where(and(eq(supplierCatalogItems.id, id), eq(supplierCatalogItems.tenantId, tenantId))).returning();
    return s;
  }
  async deleteSupplierCatalogItem(id: string, tenantId: string) {
    await db.delete(supplierCatalogItems).where(and(eq(supplierCatalogItems.id, id), eq(supplierCatalogItems.tenantId, tenantId)));
  }

  async getPurchaseOrdersByTenant(tenantId: string) {
    return db.select().from(purchaseOrders).where(eq(purchaseOrders.tenantId, tenantId)).orderBy(desc(purchaseOrders.createdAt)).limit(200);
  }
  async countPurchaseOrdersByTenant(tenantId: string) {
    const [row] = await db.select({ total: count() }).from(purchaseOrders).where(eq(purchaseOrders.tenantId, tenantId));
    return row?.total ?? 0;
  }
  async getPurchaseOrder(id: string, tenantId: string) {
    const [po] = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)));
    return po;
  }
  async createPurchaseOrder(data: InsertPurchaseOrder) {
    const [po] = await db.insert(purchaseOrders).values(data).returning();
    return po;
  }
  async updatePurchaseOrder(id: string, tenantId: string, data: Partial<InsertPurchaseOrder>) {
    const [po] = await db.update(purchaseOrders).set(data).where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId))).returning();
    return po;
  }

  async getPurchaseOrderItems(poId: string) {
    return db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, poId));
  }
  async createPurchaseOrderItem(data: InsertPurchaseOrderItem) {
    const [item] = await db.insert(purchaseOrderItems).values(data).returning();
    return item;
  }
  async updatePurchaseOrderItem(id: string, data: Partial<InsertPurchaseOrderItem>) {
    const [item] = await db.update(purchaseOrderItems).set(data).where(eq(purchaseOrderItems.id, id)).returning();
    return item;
  }

  async getGRNsByTenant(tenantId: string) {
    return db.select().from(goodsReceivedNotes).where(eq(goodsReceivedNotes.tenantId, tenantId)).orderBy(desc(goodsReceivedNotes.createdAt));
  }
  async getGRNsByPO(poId: string) {
    return db.select().from(goodsReceivedNotes).where(eq(goodsReceivedNotes.purchaseOrderId, poId));
  }
  async createGRN(data: InsertGoodsReceivedNote) {
    const [grn] = await db.insert(goodsReceivedNotes).values(data).returning();
    return grn;
  }
  async getGRNItems(grnId: string) {
    return db.select().from(grnItems).where(eq(grnItems.grnId, grnId));
  }
  async createGRNItem(data: InsertGrnItem) {
    const [item] = await db.insert(grnItems).values(data).returning();
    return item;
  }

  async getProcurementApprovals(poId: string) {
    return db.select().from(procurementApprovals).where(eq(procurementApprovals.purchaseOrderId, poId)).orderBy(desc(procurementApprovals.performedAt));
  }
  async createProcurementApproval(data: InsertProcurementApproval) {
    const [a] = await db.insert(procurementApprovals).values(data).returning();
    return a;
  }

  async getAuditEventsByTenant(tenantId: string, filters?: {
    from?: Date; to?: Date; userId?: string; action?: string; entityType?: string; outletId?: string; entityId?: string; limit?: number; offset?: number;
  }) {
    const conditions = [eq(auditEvents.tenantId, tenantId)];
    if (filters?.from) conditions.push(gte(auditEvents.createdAt, filters.from));
    if (filters?.to) conditions.push(lte(auditEvents.createdAt, filters.to));
    if (filters?.userId) conditions.push(eq(auditEvents.userId, filters.userId));
    if (filters?.action) conditions.push(eq(auditEvents.action, filters.action));
    if (filters?.entityType) conditions.push(eq(auditEvents.entityType, filters.entityType));
    if (filters?.outletId) conditions.push(eq(auditEvents.outletId, filters.outletId));
    if (filters?.entityId) conditions.push(eq(auditEvents.entityId, filters.entityId));

    const whereClause = and(...conditions);
    const [totalResult] = await db.select({ count: count() }).from(auditEvents).where(whereClause);
    const total = totalResult?.count ?? 0;

    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const events = await db.select().from(auditEvents)
      .where(whereClause)
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit)
      .offset(offset);

    return { events, total };
  }

  async createAuditEvent(data: InsertAuditEvent) {
    const [e] = await db.insert(auditEvents).values(data).returning();
    return e;
  }

  async getAuditEventsByEntity(tenantId: string, entityType: string, entityId: string) {
    return db.select().from(auditEvents)
      .where(and(
        eq(auditEvents.tenantId, tenantId),
        eq(auditEvents.entityType, entityType),
        eq(auditEvents.entityId, entityId),
      ))
      .orderBy(desc(auditEvents.createdAt));
  }

  async getPromotionRulesByTenant(tenantId: string) {
    return db.select().from(promotionRules).where(eq(promotionRules.tenantId, tenantId)).orderBy(desc(promotionRules.priority));
  }
  async getPromotionRule(id: string, tenantId: string) {
    const [r] = await db.select().from(promotionRules).where(and(eq(promotionRules.id, id), eq(promotionRules.tenantId, tenantId)));
    return r;
  }
  async createPromotionRule(data: InsertPromotionRule) {
    const [r] = await db.insert(promotionRules).values(data).returning();
    return r;
  }
  async updatePromotionRule(id: string, tenantId: string, data: Partial<InsertPromotionRule>) {
    const [r] = await db.update(promotionRules).set(data).where(and(eq(promotionRules.id, id), eq(promotionRules.tenantId, tenantId))).returning();
    return r;
  }
  async deletePromotionRule(id: string, tenantId: string) {
    await db.delete(promotionRules).where(and(eq(promotionRules.id, id), eq(promotionRules.tenantId, tenantId)));
  }

  async getKioskDevicesByTenant(tenantId: string) {
    return db.select().from(kioskDevices).where(eq(kioskDevices.tenantId, tenantId)).orderBy(desc(kioskDevices.createdAt));
  }
  async getKioskDevice(id: string, tenantId: string) {
    const [d] = await db.select().from(kioskDevices).where(and(eq(kioskDevices.id, id), eq(kioskDevices.tenantId, tenantId)));
    return d;
  }
  async getKioskDeviceByToken(token: string) {
    const [d] = await db.select().from(kioskDevices).where(eq(kioskDevices.deviceToken, token));
    return d;
  }
  async createKioskDevice(data: InsertKioskDevice) {
    const [d] = await db.insert(kioskDevices).values(data).returning();
    return d;
  }
  async updateKioskDevice(id: string, tenantId: string, data: Partial<InsertKioskDevice>) {
    const [d] = await db.update(kioskDevices).set(data).where(and(eq(kioskDevices.id, id), eq(kioskDevices.tenantId, tenantId))).returning();
    return d;
  }
  async deleteKioskDevice(id: string, tenantId: string) {
    await db.delete(kioskDevices).where(and(eq(kioskDevices.id, id), eq(kioskDevices.tenantId, tenantId)));
  }

  async getUpsellRulesByTenant(tenantId: string) {
    return db.select().from(upsellRules).where(eq(upsellRules.tenantId, tenantId)).orderBy(desc(upsellRules.priority));
  }
  async getUpsellRule(id: string, tenantId: string) {
    const [r] = await db.select().from(upsellRules).where(and(eq(upsellRules.id, id), eq(upsellRules.tenantId, tenantId)));
    return r;
  }
  async createUpsellRule(data: InsertUpsellRule) {
    const [r] = await db.insert(upsellRules).values(data).returning();
    return r;
  }
  async updateUpsellRule(id: string, tenantId: string, data: Partial<InsertUpsellRule>) {
    const [r] = await db.update(upsellRules).set(data).where(and(eq(upsellRules.id, id), eq(upsellRules.tenantId, tenantId))).returning();
    return r;
  }
  async deleteUpsellRule(id: string, tenantId: string) {
    await db.delete(upsellRules).where(and(eq(upsellRules.id, id), eq(upsellRules.tenantId, tenantId)));
  }

  async getTableByQrToken(outletId: string, qrToken: string) {
    const [t] = await db.select().from(tables).where(and(eq(tables.outletId, outletId), eq(tables.qrToken, qrToken)));
    return t;
  }
  async getTableSessionsByTable(tableId: string) {
    return db.select().from(tableSessions).where(eq(tableSessions.tableId, tableId)).orderBy(desc(tableSessions.createdAt));
  }
  async getTableSession(id: string) {
    const [s] = await db.select().from(tableSessions).where(eq(tableSessions.id, id));
    return s;
  }
  async getActiveTableSession(tableId: string) {
    const [s] = await db.select().from(tableSessions).where(and(eq(tableSessions.tableId, tableId), eq(tableSessions.status, "active")));
    return s;
  }
  async createTableSession(data: InsertTableSession) {
    const [s] = await db.insert(tableSessions).values(data).returning();
    return s;
  }
  async updateTableSession(id: string, data: Partial<InsertTableSession>) {
    const [s] = await db.update(tableSessions).set(data).where(eq(tableSessions.id, id)).returning();
    return s;
  }

  async getGuestCartItems(sessionId: string) {
    return db.select().from(guestCartItems).where(eq(guestCartItems.sessionId, sessionId)).orderBy(guestCartItems.createdAt);
  }
  async createGuestCartItem(data: InsertGuestCartItem) {
    const [item] = await db.insert(guestCartItems).values(data).returning();
    return item;
  }
  async updateGuestCartItem(id: string, data: Partial<InsertGuestCartItem>) {
    const [item] = await db.update(guestCartItems).set(data).where(eq(guestCartItems.id, id)).returning();
    return item;
  }
  async deleteGuestCartItem(id: string) {
    await db.delete(guestCartItems).where(eq(guestCartItems.id, id));
  }
  async clearGuestCart(sessionId: string) {
    await db.delete(guestCartItems).where(eq(guestCartItems.sessionId, sessionId));
  }

  async getEventsByTenant(tenantId: string) {
    return db.select().from(events).where(eq(events.tenantId, tenantId)).orderBy(desc(events.startDate));
  }
  async getEvent(id: string, tenantId: string) {
    const [e] = await db.select().from(events).where(and(eq(events.id, id), eq(events.tenantId, tenantId)));
    return e;
  }
  async createEvent(data: InsertEvent) {
    const [e] = await db.insert(events).values(data).returning();
    return e;
  }
  async updateEvent(id: string, tenantId: string, data: Partial<InsertEvent>) {
    const [e] = await db.update(events).set({ ...data, updatedAt: new Date() }).where(and(eq(events.id, id), eq(events.tenantId, tenantId))).returning();
    return e;
  }
  async deleteEvent(id: string, tenantId: string) {
    await db.delete(events).where(and(eq(events.id, id), eq(events.tenantId, tenantId)));
  }

  async getComboOffersByTenant(tenantId: string) {
    return db.select().from(comboOffers).where(eq(comboOffers.tenantId, tenantId)).orderBy(desc(comboOffers.createdAt)).limit(200);
  }
  async getComboOffer(id: string, tenantId: string) {
    const [c] = await db.select().from(comboOffers).where(and(eq(comboOffers.id, id), eq(comboOffers.tenantId, tenantId)));
    return c;
  }
  async createComboOffer(data: InsertComboOffer) {
    const [c] = await db.insert(comboOffers).values(data).returning();
    return c;
  }
  async updateComboOffer(id: string, tenantId: string, data: Partial<InsertComboOffer>) {
    const [c] = await db.update(comboOffers).set({ ...data, updatedAt: new Date() }).where(and(eq(comboOffers.id, id), eq(comboOffers.tenantId, tenantId))).returning();
    return c;
  }
  async deleteComboOffer(id: string, tenantId: string) {
    await db.delete(comboOffers).where(and(eq(comboOffers.id, id), eq(comboOffers.tenantId, tenantId)));
  }
  async incrementComboOrderCount(id: string, tenantId: string) {
    await db.update(comboOffers).set({ orderCount: sql`${comboOffers.orderCount} + 1` }).where(and(eq(comboOffers.id, id), eq(comboOffers.tenantId, tenantId)));
  }

  async getStockMovementsByTenantFiltered(tenantId: string, filters: {
    from?: Date; to?: Date; chefId?: string; station?: string;
    type?: string; ingredientId?: string; shiftId?: string;
    limit?: number; offset?: number;
  }) {
    const conditions = [eq(stockMovements.tenantId, tenantId)];
    if (filters.from) conditions.push(gte(stockMovements.createdAt, filters.from));
    if (filters.to) {
      const endOfDay = new Date(filters.to);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(lte(stockMovements.createdAt, endOfDay));
    }
    if (filters.chefId) conditions.push(eq(stockMovements.chefId, filters.chefId));
    if (filters.station) conditions.push(eq(stockMovements.station, filters.station));
    if (filters.type) conditions.push(eq(stockMovements.type, filters.type));
    if (filters.ingredientId) conditions.push(eq(stockMovements.itemId, filters.ingredientId));
    if (filters.shiftId) conditions.push(eq(stockMovements.shiftId, filters.shiftId));
    const limit = filters.limit ?? 200;
    const offset = filters.offset ?? 0;
    const rows = await db
      .select({
        id: stockMovements.id,
        tenantId: stockMovements.tenantId,
        itemId: stockMovements.itemId,
        ingredientName: inventoryItems.name,
        ingredientUnit: inventoryItems.unit,
        ingredientCostPrice: inventoryItems.costPrice,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        reason: stockMovements.reason,
        orderId: stockMovements.orderId,
        orderNumber: stockMovements.orderNumber,
        menuItemId: stockMovements.menuItemId,
        chefId: stockMovements.chefId,
        chefName: stockMovements.chefName,
        station: stockMovements.station,
        shiftId: stockMovements.shiftId,
        createdAt: stockMovements.createdAt,
        stockBefore: stockMovements.stockBefore,
        stockAfter: stockMovements.stockAfter,
      })
      .from(stockMovements)
      .leftJoin(inventoryItems, eq(stockMovements.itemId, inventoryItems.id))
      .where(and(...conditions))
      .orderBy(desc(stockMovements.createdAt))
      .limit(limit)
      .offset(offset);
    return rows;
  }

  async getShiftsByTenant(tenantId: string) {
    return db.select().from(shifts).where(eq(shifts.tenantId, tenantId)).orderBy(shifts.startTime).limit(50);
  }
  async createShift(data: InsertShift) {
    const [s] = await db.insert(shifts).values(data).returning();
    return s;
  }
  async updateShift(id: string, tenantId: string, data: Partial<InsertShift>) {
    const [s] = await db.update(shifts).set(data).where(and(eq(shifts.id, id), eq(shifts.tenantId, tenantId))).returning();
    return s;
  }
  async deleteShift(id: string, tenantId: string) {
    await db.delete(shifts).where(and(eq(shifts.id, id), eq(shifts.tenantId, tenantId)));
  }
  async getActiveShift(tenantId: string, outletId?: string) {
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);
    const allShifts = await db.select().from(shifts)
      .where(and(eq(shifts.tenantId, tenantId), eq(shifts.active, true)));
    return allShifts.find(s => {
      if (outletId && s.outletId && s.outletId !== outletId) return false;
      return timeStr >= s.startTime && timeStr <= s.endTime;
    });
  }

  async getMenuItemStationsByTenant(tenantId: string) {
    return db.select().from(menuItemStations).where(eq(menuItemStations.tenantId, tenantId)).limit(500);
  }
  async getMenuItemStationsByItem(menuItemId: string) {
    return db.select().from(menuItemStations).where(eq(menuItemStations.menuItemId, menuItemId));
  }
  async upsertMenuItemStation(data: InsertMenuItemStation) {
    const [existing] = await db.select().from(menuItemStations)
      .where(and(eq(menuItemStations.menuItemId, data.menuItemId), eq(menuItemStations.station, data.station)));
    if (existing) return existing;
    const [s] = await db.insert(menuItemStations).values(data).returning();
    return s;
  }
  async deleteMenuItemStations(menuItemId: string, tenantId: string) {
    await db.delete(menuItemStations).where(and(eq(menuItemStations.menuItemId, menuItemId), eq(menuItemStations.tenantId, tenantId)));
  }

  async createKotEvent(data: InsertKotEvent) {
    const [e] = await db.insert(kotEvents).values(data).returning();
    return e;
  }
  async getKotEventsByOrder(orderId: string) {
    return db.select().from(kotEvents).where(eq(kotEvents.orderId, orderId)).orderBy(desc(kotEvents.sentAt));
  }
  async getKotEventsByTenant(tenantId: string, limit = 100) {
    return db.select().from(kotEvents).where(eq(kotEvents.tenantId, tenantId)).orderBy(desc(kotEvents.sentAt)).limit(limit);
  }

  async generateBillNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const [row] = await db.select({ maxBill: sql<string>`MAX(bill_number)` }).from(bills)
      .where(and(eq(bills.tenantId, tenantId), sql`bill_number LIKE ${prefix + "%"}`));
    const lastNum = row?.maxBill ? parseInt(row.maxBill.slice(prefix.length), 10) : 0;
    const seq = (lastNum + 1).toString().padStart(4, "0");
    return `${prefix}${seq}`;
  }

  async createBill(data: InsertBill): Promise<Bill> {
    if (!data.billNumber) {
      return db.transaction(async (tx) => {
        const year = new Date().getFullYear();
        const prefix = `INV-${year}-`;
        const [row] = await tx.select({ maxBill: sql<string>`MAX(bill_number)` }).from(bills)
          .where(and(eq(bills.tenantId, data.tenantId), sql`bill_number LIKE ${prefix + "%"}`));
        const lastNum = row?.maxBill ? parseInt(row.maxBill.slice(prefix.length), 10) : 0;
        const billNumber = `${prefix}${(lastNum + 1).toString().padStart(4, "0")}`;
        const [b] = await tx.insert(bills).values({ ...data, billNumber }).returning();
        return b;
      });
    }
    const [b] = await db.insert(bills).values(data).returning();
    return b;
  }
  async getBill(id: string): Promise<Bill | undefined> {
    const [b] = await db.select().from(bills).where(eq(bills.id, id));
    return b;
  }
  async getBillByOrder(orderId: string): Promise<Bill | undefined> {
    const [b] = await db.select().from(bills).where(eq(bills.orderId, orderId)).orderBy(desc(bills.createdAt));
    return b;
  }
  async getBillsByTenant(tenantId: string, opts?: { limit?: number; offset?: number; status?: string }): Promise<Bill[]> {
    const conditions = [eq(bills.tenantId, tenantId)];
    if (opts?.status) conditions.push(eq(bills.paymentStatus, opts.status));
    return db.select().from(bills)
      .where(and(...conditions))
      .orderBy(desc(bills.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0);
  }
  async getBillsByOrder(orderId: string): Promise<Bill[]> {
    return db.select().from(bills).where(eq(bills.orderId, orderId)).orderBy(desc(bills.createdAt));
  }
  async updateBill(id: string, tenantId: string, data: Partial<InsertBill>): Promise<Bill | undefined> {
    const [b] = await db.update(bills).set(data).where(and(eq(bills.id, id), eq(bills.tenantId, tenantId))).returning();
    return b;
  }

  async createBillPayment(data: InsertBillPayment): Promise<BillPayment> {
    const [p] = await db.insert(billPayments).values(data).returning();
    return p;
  }
  async getBillPayments(billId: string): Promise<BillPayment[]> {
    return db.select().from(billPayments).where(eq(billPayments.billId, billId)).orderBy(billPayments.createdAt);
  }
  async getBillPaymentsByTenant(tenantId: string, opts?: { limit?: number }): Promise<BillPayment[]> {
    return db.select().from(billPayments).where(eq(billPayments.tenantId, tenantId))
      .orderBy(desc(billPayments.createdAt)).limit(opts?.limit ?? 100);
  }

  async createPosSession(data: InsertPosSession): Promise<PosSession> {
    const [s] = await db.insert(posSessions).values(data).returning();
    return s;
  }
  async getActivePosSession(tenantId: string, waiterId: string): Promise<PosSession | undefined> {
    const [s] = await db.select().from(posSessions)
      .where(and(eq(posSessions.tenantId, tenantId), eq(posSessions.waiterId, waiterId), eq(posSessions.status, "open")))
      .orderBy(desc(posSessions.openedAt));
    return s;
  }
  async getPosSession(id: string): Promise<PosSession | undefined> {
    const [s] = await db.select().from(posSessions).where(eq(posSessions.id, id));
    return s;
  }
  async closePosSession(id: string, tenantId: string, data: { closingCashCount?: number; closedBy: string; notes?: string }): Promise<PosSession | undefined> {
    const [s] = await db.update(posSessions).set({
      status: "closed",
      closingCashCount: data.closingCashCount,
      closedBy: data.closedBy,
      closedAt: new Date(),
      notes: data.notes,
    }).where(and(eq(posSessions.id, id), eq(posSessions.tenantId, tenantId))).returning();
    return s;
  }
  async updatePosSession(id: string, tenantId: string, data: Partial<InsertPosSession>): Promise<PosSession | undefined> {
    const [s] = await db.update(posSessions).set(data).where(and(eq(posSessions.id, id), eq(posSessions.tenantId, tenantId))).returning();
    return s;
  }
  async getPosSessionReport(sessionId: string): Promise<{
    session: PosSession;
    billCount: number;
    totalRevenue: number;
    revenueByMethod: Record<string, number>;
    cashSales: number;
    expectedCash: number;
  }> {
    const [session] = await db.select().from(posSessions).where(eq(posSessions.id, sessionId));
    if (!session) throw new Error("Session not found");
    const sessionBills = await db.select().from(bills).where(eq(bills.posSessionId, sessionId));
    const paidBills = sessionBills.filter(b => b.paymentStatus === "paid");
    const payments = paidBills.length > 0
      ? await db.select().from(billPayments).where(inArray(billPayments.billId, paidBills.map(b => b.id)))
      : [];
    const revenueByMethod: Record<string, number> = {};
    let totalRevenue = 0;
    for (const p of payments) {
      if (!p.isRefund) {
        const method = p.paymentMethod;
        revenueByMethod[method] = (revenueByMethod[method] ?? 0) + Number(p.amount);
        totalRevenue += Number(p.amount);
      }
    }
    const cashSales = revenueByMethod["CASH"] ?? 0;
    const expectedCash = Number(session.openingFloat ?? 0) + cashSales;
    return { session, billCount: paidBills.length, totalRevenue, revenueByMethod, cashSales, expectedCash };
  }
}

export const storage = new DatabaseStorage();