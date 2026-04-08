import { eq, and, desc, sql, gte, lte, lt, count, sum, inArray } from "drizzle-orm";
import { db, pool } from "./db";
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
  regions, franchiseInvoices, outletMenuPrices,
  suppliers, supplierCatalogItems, purchaseOrders, purchaseOrderItems,
  goodsReceivedNotes, grnItems, procurementApprovals,
  type OrderChannel, type InsertOrderChannel,
  type ChannelConfig, type InsertChannelConfig,
  type OnlineMenuMapping, type InsertOnlineMenuMapping,
  type Region, type InsertRegion,
  type FranchiseInvoice, type InsertFranchiseInvoice,
  type Supplier, type InsertSupplier,
  type SupplierCatalogItem, type InsertSupplierCatalogItem,
  type PurchaseOrder, type InsertPurchaseOrder,
  type PurchaseOrderItem, type InsertPurchaseOrderItem,
  type GoodsReceivedNote, type InsertGoodsReceivedNote,
  type GrnItem, type InsertGrnItem,
  type ProcurementApproval, type InsertProcurementApproval,
  rfqs, rfqItems, supplierQuotations, quotationItems,
  type RFQ, type InsertRFQ, type RFQItem, type InsertRFQItem,
  type SupplierQuotation, type InsertSupplierQuotation,
  type QuotationItem, type InsertQuotationItem,
  purchaseReturns, purchaseReturnItems,
  type PurchaseReturn, type InsertPurchaseReturn,
  type PurchaseReturnItem, type InsertPurchaseReturnItem,
  stockTransfers, stockTransferItems,
  type StockTransfer, type InsertStockTransfer,
  type StockTransferItem, type InsertStockTransferItem,
  stockCountSessions, stockCountItems,
  type StockCountSession, type InsertStockCountSession,
  type StockCountItem, type InsertStockCountItem,
  damagedInventory,
  type DamagedInventory, type InsertDamagedInventory,
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
  shifts, kotEvents,
  type Shift, type InsertShift,

  type KotEvent, type InsertKotEvent,
  bills, billPayments, posSessions,
  type Bill, type InsertBill,
  type BillPayment, type InsertBillPayment,
  type PosSession, type InsertPosSession,
  printJobs, printJobStatusEnum,
  type PrintJob, type InsertPrintJob,
  tableQrTokens, tableRequests,
  type TableQrToken, type InsertTableQrToken,
  type TableRequest, type InsertTableRequest,
  kitchenCounters, chefRoster, chefAvailability, ticketAssignments,
  type KitchenCounter, type InsertKitchenCounter,
  type ChefRoster, type InsertChefRoster,
  type ChefAvailability, type InsertChefAvailability,
  type TicketAssignment, type InsertTicketAssignment,
  orderCourses, kitchenSettings,
  type OrderCourse, type InsertOrderCourse,
  type KitchenSettings, type InsertKitchenSettings,
  itemTimeLogs, orderTimeSummary, dailyTimePerformance, recipeTimeBenchmarks, timePerformanceTargets,
  type ItemTimeLog, type InsertItemTimeLog,
  type OrderTimeSummary, type InsertOrderTimeSummary,
  type DailyTimePerformance, type InsertDailyTimePerformance,
  type RecipeTimeBenchmark, type InsertRecipeTimeBenchmark,
  type TimePerformanceTarget, type InsertTimePerformanceTarget,
  itemVoidRequests, voidedItems, itemRefireRequests,
  type ItemVoidRequest, type InsertItemVoidRequest,
  type VoidedItem, type InsertVoidedItem,
  type ItemRefireRequest, type InsertItemRefireRequest,
  alertDefinitions, type AlertDefinition, type InsertAlertDefinition,
  alertOutletConfigs, type AlertOutletConfig, type InsertAlertOutletConfig,
  alertEvents, type AlertEvent, type InsertAlertEvent,
  cashSessions, type CashSession, type InsertCashSession,
  cashDrawerEvents, type CashDrawerEvent, type InsertCashDrawerEvent,
  cashPayouts, type CashPayout, type InsertCashPayout,
  cashHandovers, type CashHandover, type InsertCashHandover,
  outletTipSettings, billTips, tipDistributions,
  type OutletTipSettings, type InsertOutletTipSettings,
  type BillTip, type InsertBillTip,
  type TipDistribution, type InsertTipDistribution,
  outletPackingSettings, packingChargeCategories, packingChargeExemptions, billPackingCharges,
  type OutletPackingSettings, type InsertOutletPackingSettings,
  type PackingChargeCategory, type InsertPackingChargeCategory,
  type PackingChargeExemption, type InsertPackingChargeExemption,
  type BillPackingCharge, type InsertBillPackingCharge,
  inAppSupportTickets, inAppSupportTicketReplies,
  type InAppSupportTicket, type InsertInAppSupportTicket,
  type InAppSupportTicketReply, type InsertInAppSupportTicketReply,
  specialResources, resourceUnits, resourceAssignments, resourceCleaningLog,
  type SpecialResource, type InsertSpecialResource,
  type ResourceUnit, type InsertResourceUnit,
  type ResourceAssignment, type InsertResourceAssignment,
  type ResourceCleaningLog, type InsertResourceCleaningLog,
  parkingLayoutConfig, parkingZones, parkingSlots, parkingRates, parkingRateSlabs,
  valetStaff, valetTickets, valetRetrievalRequests, billParkingCharges,
  type ParkingLayoutConfig, type InsertParkingLayoutConfig,
  type ParkingZone, type InsertParkingZone,
  type ParkingSlot, type InsertParkingSlot,
  type ParkingRate, type InsertParkingRate,
  type ParkingRateSlab, type InsertParkingRateSlab,
  type ValetStaff, type InsertValetStaff,
  type ValetTicket, type InsertValetTicket,
  type ValetRetrievalRequest, type InsertValetRetrievalRequest,
  type BillParkingCharge, type InsertBillParkingCharge,
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
  getMenuItemsByTenantAndOutlet(tenantId: string, outletId?: string): Promise<MenuItem[]>;
  getMenuItemsByCategory(categoryId: string): Promise<MenuItem[]>;
  getMenuItem(id: string, tenantId: string): Promise<MenuItem | undefined>;
  createMenuItem(data: InsertMenuItem): Promise<MenuItem>;
  updateMenuItem(id: string, tenantId: string, data: Partial<InsertMenuItem>): Promise<MenuItem | undefined>;
  deleteMenuItem(id: string, tenantId: string, deletedBy?: string): Promise<void>;

  getTableZonesByTenant(tenantId: string): Promise<TableZone[]>;
  createTableZone(data: InsertTableZone): Promise<TableZone>;
  updateTableZone(id: string, tenantId: string, data: Partial<InsertTableZone>): Promise<TableZone | undefined>;
  deleteTableZone(id: string, tenantId: string): Promise<void>;

  getTablesByTenant(tenantId: string): Promise<Table[]>;
  getTable(id: string, tenantId: string): Promise<Table | undefined>;
  createTable(data: InsertTable): Promise<Table>;
  updateTable(id: string, tenantId: string, data: Partial<InsertTable>): Promise<Table | undefined>;
  updateTableByTenant(id: string, tenantId: string, data: Partial<InsertTable>): Promise<Table | undefined>;
  deleteTable(id: string): Promise<void>;
  deleteTableByTenant(id: string, tenantId: string): Promise<void>;

  getWaitlistByTenant(tenantId: string): Promise<WaitlistEntry[]>;
  createWaitlistEntry(data: InsertWaitlistEntry): Promise<WaitlistEntry>;
  updateWaitlistEntry(id: string, tenantId: string, data: Partial<InsertWaitlistEntry>): Promise<WaitlistEntry | undefined>;
  deleteWaitlistEntry(id: string, tenantId: string): Promise<void>;

  getReservationsByTenant(tenantId: string, opts?: { limit?: number; offset?: number }): Promise<Reservation[]>;
  createReservation(data: InsertReservation): Promise<Reservation>;
  updateReservation(id: string, data: Partial<InsertReservation>): Promise<Reservation | undefined>;
  updateReservationByTenant(id: string, tenantId: string, data: Partial<InsertReservation>): Promise<Reservation | undefined>;
  deleteReservationByTenant(id: string, tenantId: string, deletedBy?: string): Promise<void>;

  getOrdersByTenant(tenantId: string, opts?: { limit?: number; offset?: number; status?: string; orderType?: string; dateFrom?: string; dateTo?: string }): Promise<Order[]>;
  getOrder(id: string, tenantId: string): Promise<Order | undefined>;
  getOrderById(id: string): Promise<Order | undefined>;
  getOrderByClientId(tenantId: string, clientOrderId: string): Promise<Order | undefined>;
  getOrderByStripeSessionId(sessionId: string): Promise<Order | undefined>;
  createOrder(data: InsertOrder): Promise<Order>;
  updateOrder(id: string, data: Partial<InsertOrder>, expectedVersion?: number): Promise<Order | undefined>;
  getOrderItemsByOrder(orderId: string): Promise<OrderItem[]>;
  getOrderItemsByTenant(tenantId: string): Promise<any[]>;
  createOrderItem(data: InsertOrderItem): Promise<OrderItem>;
  updateOrderItem(id: string, data: Record<string, any>, tenantId: string): Promise<OrderItem | undefined>;
  getOrderItem(id: string, tenantId: string): Promise<OrderItem | undefined>;

  getInventoryByTenant(tenantId: string, opts?: { limit?: number; offset?: number; itemCategory?: string }): Promise<InventoryItem[]>;
  getPiecewiseInventory(tenantId: string, opts?: { outletId?: string }): Promise<any[]>;
  getBreakageReport(tenantId: string, month: string): Promise<any>;
  getInventoryItem(id: string, tenantId: string): Promise<InventoryItem | undefined>;
  createInventoryItem(data: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(id: string, data: Partial<InsertInventoryItem>, tenantId: string): Promise<InventoryItem | undefined>;
  deleteInventoryItem(id: string, tenantId: string, deletedBy?: string): Promise<void>;
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
  deleteCustomerByTenant(id: string, tenantId: string, deletedBy?: string): Promise<void>;
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
  deleteRecipe(id: string, tenantId: string, deletedBy?: string): Promise<void>;
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


  createKotEvent(data: InsertKotEvent): Promise<KotEvent>;
  getKotEventsByOrder(orderId: string): Promise<KotEvent[]>;
  getKotEventsByTenant(tenantId: string, limit?: number): Promise<KotEvent[]>;

  getKitchenStationsByTenant(tenantId: string): Promise<KitchenStation[]>;
  getKitchenStation(id: string): Promise<KitchenStation | undefined>;
  createKitchenStation(data: InsertKitchenStation): Promise<KitchenStation>;
  updateKitchenStation(id: string, tenantId: string, data: Partial<InsertKitchenStation>): Promise<KitchenStation | undefined>;
  deleteKitchenStation(id: string, tenantId: string): Promise<void>;

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

  getOutletKPIs(tenantId: string, outletId?: string, from?: Date, to?: Date): Promise<Record<string, unknown>[]>;
  getOutletFeedbackMetrics(tenantId: string, from?: Date, to?: Date): Promise<Record<string, unknown>[]>;
  getOutletLabourMetrics(tenantId: string, from?: Date, to?: Date): Promise<Record<string, unknown>[]>;
  getOutletFoodCostMetrics(tenantId: string): Promise<Map<string, string>>;
  getMenuItemsForOutlet(tenantId: string, outletId: string): Promise<Record<string, unknown>[]>;

  getSuppliersByTenant(tenantId: string): Promise<Supplier[]>;
  getSupplier(id: string, tenantId: string): Promise<Supplier | undefined>;
  createSupplier(data: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: string, tenantId: string, data: Partial<InsertSupplier>): Promise<Supplier | undefined>;
  deleteSupplier(id: string, tenantId: string, deletedBy?: string): Promise<void>;

  getSupplierCatalogItems(supplierId: string, tenantId: string): Promise<SupplierCatalogItem[]>;
  getCatalogItemsByInventoryItem(inventoryItemId: string, tenantId: string): Promise<SupplierCatalogItem[]>;
  createSupplierCatalogItem(data: InsertSupplierCatalogItem): Promise<SupplierCatalogItem>;
  updateSupplierCatalogItem(id: string, tenantId: string, data: Partial<InsertSupplierCatalogItem>): Promise<SupplierCatalogItem | undefined>;
  deleteSupplierCatalogItem(id: string, tenantId: string): Promise<void>;

  updateInventoryItemStock(opts: { tx: any; tenantId: string; inventoryItemId: string; deltaQty: number; outletId?: string | null; movementType: string; reason: string; unitCost?: string | null }): Promise<void>;

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
  updateGRN(id: string, tenantId: string, data: Partial<InsertGoodsReceivedNote>): Promise<GoodsReceivedNote | undefined>;
  getGRNItems(grnId: string): Promise<GrnItem[]>;
  createGRNItem(data: InsertGrnItem): Promise<GrnItem>;

  getProcurementApprovals(poId: string): Promise<ProcurementApproval[]>;
  createProcurementApproval(data: InsertProcurementApproval): Promise<ProcurementApproval>;

  // RFQ / Quotations
  getRFQsByTenant(tenantId: string): Promise<RFQ[]>;
  getRFQ(id: string, tenantId: string): Promise<RFQ | undefined>;
  createRFQ(data: InsertRFQ): Promise<RFQ>;
  updateRFQ(id: string, tenantId: string, data: Partial<InsertRFQ>): Promise<RFQ | undefined>;
  getRFQItems(rfqId: string): Promise<RFQItem[]>;
  createRFQItem(data: InsertRFQItem): Promise<RFQItem>;
  deleteRFQItems(rfqId: string): Promise<void>;
  getQuotationsByRFQ(rfqId: string): Promise<SupplierQuotation[]>;
  createSupplierQuotation(data: InsertSupplierQuotation): Promise<SupplierQuotation>;
  getQuotationItems(quotationId: string): Promise<QuotationItem[]>;
  createQuotationItem(data: InsertQuotationItem): Promise<QuotationItem>;

  // Purchase Returns
  getPurchaseReturnsByTenant(tenantId: string): Promise<PurchaseReturn[]>;
  getPurchaseReturn(id: string, tenantId: string): Promise<PurchaseReturn | undefined>;
  createPurchaseReturn(data: InsertPurchaseReturn): Promise<PurchaseReturn>;
  updatePurchaseReturn(id: string, tenantId: string, data: Partial<InsertPurchaseReturn>): Promise<PurchaseReturn | undefined>;
  getPurchaseReturnItems(returnId: string): Promise<PurchaseReturnItem[]>;
  createPurchaseReturnItem(data: InsertPurchaseReturnItem): Promise<PurchaseReturnItem>;
  countPurchaseReturnsByTenant(tenantId: string): Promise<number>;

  // Stock Transfers
  getStockTransfersByTenant(tenantId: string): Promise<StockTransfer[]>;
  getStockTransfer(id: string, tenantId: string): Promise<StockTransfer | undefined>;
  createStockTransfer(data: InsertStockTransfer): Promise<StockTransfer>;
  updateStockTransfer(id: string, tenantId: string, data: Partial<InsertStockTransfer>): Promise<StockTransfer | undefined>;
  getStockTransferItems(transferId: string): Promise<StockTransferItem[]>;
  createStockTransferItem(data: InsertStockTransferItem): Promise<StockTransferItem>;
  updateStockTransferItem(id: string, data: Partial<InsertStockTransferItem>): Promise<StockTransferItem | undefined>;
  countStockTransfersByTenant(tenantId: string): Promise<number>;

  // Stock Count Sessions
  getStockCountsByTenant(tenantId: string): Promise<StockCountSession[]>;
  getStockCount(id: string, tenantId: string): Promise<StockCountSession | undefined>;
  createStockCount(data: InsertStockCountSession): Promise<StockCountSession>;
  updateStockCount(id: string, tenantId: string, data: Partial<InsertStockCountSession>): Promise<StockCountSession | undefined>;
  getStockCountItems(sessionId: string): Promise<StockCountItem[]>;
  createStockCountItem(data: InsertStockCountItem): Promise<StockCountItem>;
  createStockCountItemsBulk(items: InsertStockCountItem[]): Promise<StockCountItem[]>;
  updateStockCountItem(id: string, data: Partial<InsertStockCountItem>): Promise<StockCountItem | undefined>;
  countStockCountsByTenant(tenantId: string): Promise<number>;

  // Damaged Inventory
  getDamagedInventoryByTenant(tenantId: string, opts?: { itemCategory?: string }): Promise<DamagedInventory[]>;
  getDamagedInventoryItem(id: string, tenantId: string): Promise<DamagedInventory | undefined>;
  createDamagedInventory(data: InsertDamagedInventory): Promise<DamagedInventory>;
  updateDamagedInventory(id: string, tenantId: string, data: Partial<InsertDamagedInventory>): Promise<DamagedInventory | undefined>;
  countDamagedInventoryByTenant(tenantId: string): Promise<number>;

  getAuditEventsByTenant(tenantId: string, filters?: {
    from?: Date; to?: Date; userId?: string; action?: string; entityType?: string; outletId?: string; entityId?: string; limit?: number; offset?: number;
  }): Promise<{ events: AuditEvent[]; total: number }>;
  createAuditEvent(data: InsertAuditEvent): Promise<AuditEvent>;
  getAuditEventsByEntity(tenantId: string, entityType: string, entityId: string): Promise<AuditEvent[]>;

  getPromotionRulesByTenant(tenantId: string): Promise<PromotionRule[]>;
  getPromotionRule(id: string, tenantId: string): Promise<PromotionRule | undefined>;
  createPromotionRule(data: InsertPromotionRule): Promise<PromotionRule>;
  updatePromotionRule(id: string, tenantId: string, data: Partial<InsertPromotionRule>): Promise<PromotionRule | undefined>;
  deletePromotionRule(id: string, tenantId: string, deletedBy?: string): Promise<void>;

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

  createPrintJob(data: InsertPrintJob): Promise<PrintJob>;
  getPrintJobsByTenant(tenantId: string, opts?: { status?: typeof printJobStatusEnum.enumValues[number]; limit?: number; referenceId?: string }): Promise<PrintJob[]>;
  updatePrintJob(id: string, tenantId: string, data: Partial<InsertPrintJob>): Promise<PrintJob | undefined>;

  createQrToken(data: InsertTableQrToken): Promise<TableQrToken>;
  getActiveQrToken(tableId: string): Promise<TableQrToken | undefined>;
  getQrTokenByValue(token: string): Promise<TableQrToken | undefined>;
  getQrTokensByTenant(tenantId: string): Promise<TableQrToken[]>;
  deactivateQrToken(id: string, tenantId: string): Promise<void>;

  createTableRequest(data: InsertTableRequest): Promise<TableRequest>;
  getTableRequest(id: string): Promise<TableRequest | undefined>;
  updateTableRequest(id: string, data: Partial<InsertTableRequest>): Promise<TableRequest | undefined>;
  getTableRequestsByTenant(tenantId: string, opts?: { status?: string; limit?: number; offset?: number }): Promise<TableRequest[]>;
  getTableRequestsLive(tenantId: string): Promise<TableRequest[]>;
  getTableRequestAnalytics(tenantId: string, from?: Date, to?: Date): Promise<{
    total: number;
    totalRequests: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    avgResponseSeconds: number | null;
    avgResponseMinutes: number | null;
    avgCompletionSeconds: number | null;
    escalatedCount: number;
    completionRate: number | null;
    topRequestTypes: Array<{ type: string; count: number }>;
    overdueCount: number;
    avgFeedbackRating: number | null;
    byTable: Array<{ tableNumber: number | null; count: number }>;
    byHour: Record<string, number>;
    byDay: Record<string, number>;
    byStaff: Array<{ name: string; count: number; avgResponseMinutes: number | null }>;
    feedbackByRating: Record<string, number>;
  }>;

  // Kitchen Counters
  getCounters(tenantId: string, outletId?: string): Promise<KitchenCounter[]>;
  getCounter(id: string, tenantId: string): Promise<KitchenCounter | undefined>;
  createCounter(data: InsertKitchenCounter): Promise<KitchenCounter>;
  updateCounter(id: string, tenantId: string, data: Partial<InsertKitchenCounter>): Promise<KitchenCounter | undefined>;
  deleteCounter(id: string, tenantId: string): Promise<void>;

  // Chef Roster
  getRoster(tenantId: string, outletId?: string, date?: string): Promise<ChefRoster[]>;
  getRosterEntry(id: string, tenantId: string): Promise<ChefRoster | undefined>;
  createRosterEntry(data: InsertChefRoster): Promise<ChefRoster>;
  updateRosterEntry(id: string, tenantId: string, data: Partial<InsertChefRoster>): Promise<ChefRoster | undefined>;
  deleteRosterEntry(id: string, tenantId: string): Promise<void>;
  copyLastWeekRoster(tenantId: string, outletId: string, weekStart: string): Promise<ChefRoster[]>;

  // Chef Availability
  getChefAvailability(tenantId: string, outletId?: string, date?: string): Promise<ChefAvailability[]>;
  upsertChefAvailability(data: InsertChefAvailability): Promise<ChefAvailability>;
  updateChefAvailabilityStatus(chefId: string, tenantId: string, date: string, status: string, activeTickets?: number): Promise<void>;

  // Ticket Assignments
  getAssignment(id: string, tenantId: string): Promise<TicketAssignment | undefined>;
  getAssignmentByOrderItem(orderItemId: string, tenantId: string): Promise<TicketAssignment | undefined>;
  getLiveAssignments(tenantId: string, outletId?: string): Promise<TicketAssignment[]>;
  createAssignment(data: InsertTicketAssignment): Promise<TicketAssignment>;
  updateAssignment(id: string, tenantId: string, data: Partial<InsertTicketAssignment>): Promise<TicketAssignment | undefined>;
  getAssignmentBoard(tenantId: string, outletId?: string): Promise<{
    counter: KitchenCounter;
    chefs: Array<{ chefId: string; chefName: string; status: string; activeTickets: number }>;
    assignments: TicketAssignment[];
    unassignedCount: number;
  }[]>;
  getAssignmentAnalytics(tenantId: string, from?: Date, to?: Date): Promise<{
    perChef: Array<{ chefId: string; chefName: string; total: number; autoAssigned: number; selfAssigned: number; reassigned: number; avgPrepMin: number | null }>;
    perCounter: Array<{ counterId: string; counterName: string; total: number; unassignedRate: number; avgTicketsPerHour: number }>;
    efficiency: { autoAssignRate: number; avgOrderToAssignSec: number | null; avgAssignToStartSec: number | null };
  }>;

  // Selective Cooking Control (Task #108)
  getOrderItemCookingStatuses(orderId: string): Promise<OrderItem[]>;
  updateOrderItemCooking(id: string, data: {
    cookingStatus?: string;
    suggestedStartAt?: Date | null;
    actualStartAt?: Date | null;
    estimatedReadyAt?: Date | null;
    actualReadyAt?: Date | null;
    itemPrepMinutes?: number | null;
    startedById?: string | null;
    startedByName?: string | null;
    holdReason?: string | null;
    holdUntilItemId?: string | null;
    holdUntilMinutes?: number | null;
    courseNumber?: number | null;
  }): Promise<OrderItem>;
  getOrderCourses(orderId: string): Promise<OrderCourse[]>;
  createOrderCourse(data: InsertOrderCourse): Promise<OrderCourse>;
  updateOrderCourse(orderId: string, courseNumber: number, data: {
    status?: string;
    fireAt?: Date | null;
    firedBy?: string | null;
    firedByName?: string | null;
  }): Promise<void>;
  getKitchenSettings(tenantId: string): Promise<KitchenSettings | undefined>;
  upsertKitchenSettings(tenantId: string, data: Partial<InsertKitchenSettings>): Promise<KitchenSettings>;

  // Task #110: Time Tracking
  createItemTimeLog(data: InsertItemTimeLog): Promise<ItemTimeLog>;
  getItemTimeLog(orderItemId: string): Promise<ItemTimeLog | undefined>;
  getItemTimeLogsByTenant(tenantId: string, opts?: { date?: string; outletId?: string; limit?: number }): Promise<ItemTimeLog[]>;
  getOrderTimeSummary(orderId: string): Promise<OrderTimeSummary | undefined>;
  upsertOrderTimeSummary(data: InsertOrderTimeSummary): Promise<OrderTimeSummary>;
  upsertDailyTimePerformance(data: InsertDailyTimePerformance): Promise<DailyTimePerformance>;
  getDailyTimePerformance(tenantId: string, outletId?: string, dateRange?: number): Promise<DailyTimePerformance[]>;
  getRecipeBenchmark(tenantId: string, menuItemId: string): Promise<RecipeTimeBenchmark | undefined>;
  upsertRecipeBenchmark(data: InsertRecipeTimeBenchmark): Promise<RecipeTimeBenchmark>;
  getTimeTargets(tenantId: string, outletId?: string): Promise<TimePerformanceTarget | undefined>;
  upsertTimeTarget(data: InsertTimePerformanceTarget): Promise<TimePerformanceTarget>;

  // Task #112: Order Ticket History — Query methods
  getOrdersForHistory(tenantId: string, opts: {
    q?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    orderType?: string;
    staffId?: string;
    outletId?: string;
    roleScope?: { role: string; userId: string };
    limit?: number;
    offset?: number;
  }): Promise<{ orders: Record<string, unknown>[]; total: number }>;
  getOrderTicketDetail(orderId: string, tenantId: string): Promise<Record<string, unknown> | null>;
  getOrderTimeline(orderId: string, tenantId: string): Promise<Array<Record<string, unknown>>>;

  createVoidRequest(data: InsertItemVoidRequest): Promise<ItemVoidRequest>;
  getVoidRequest(id: string, tenantId: string): Promise<ItemVoidRequest | undefined>;
  updateVoidRequest(id: string, tenantId: string, data: {
    status?: string;
    approvedBy?: string | null;
    approvedByName?: string | null;
    approvedAt?: Date | null;
    rejectedReason?: string | null;
  }): Promise<ItemVoidRequest | undefined>;
  getPendingVoidRequests(tenantId: string): Promise<ItemVoidRequest[]>;
  createVoidedItem(data: InsertVoidedItem): Promise<VoidedItem>;
  getVoidedItemsByOrder(orderId: string): Promise<VoidedItem[]>;
  createRefireRequest(data: InsertItemRefireRequest): Promise<ItemRefireRequest>;
  getRefireRequestsByOrder(orderId: string): Promise<ItemRefireRequest[]>;
  updateRefireRequest(id: string, tenantId: string, data: {
    status?: string;
    newOrderItemId?: string | null;
    newKotNumber?: string | null;
  }): Promise<ItemRefireRequest | undefined>;

  getAlertDefinitions(tenantId?: string): Promise<AlertDefinition[]>;
  getAlertDefinition(code: string, tenantId?: string): Promise<AlertDefinition | undefined>;
  createAlertEvent(data: InsertAlertEvent): Promise<AlertEvent>;
  getAlertEvents(tenantId: string, outletId?: string, opts?: { hours?: number }): Promise<AlertEvent[]>;
  resolveAlertEvent(id: string, tenantId: string, data: { acknowledgedBy: string }): Promise<AlertEvent | undefined>;
  getUnresolvedAlertEvents(tenantId: string, outletId?: string): Promise<AlertEvent[]>;
  getAlertOutletConfigs(tenantId: string, outletId: string): Promise<AlertOutletConfig[]>;
  upsertAlertOutletConfig(data: { tenantId: string; outletId: string; alertCode: string; isEnabled?: boolean; volumeLevel?: number }): Promise<AlertOutletConfig>;

  // Task #118: Cash Machine
  createCashSession(data: InsertCashSession): Promise<CashSession>;
  getCashSession(id: string): Promise<CashSession | undefined>;
  getActiveCashSession(tenantId: string, cashierId: string): Promise<CashSession | undefined>;
  updateCashSession(id: string, data: Partial<InsertCashSession>): Promise<CashSession | undefined>;
  getCashSessions(tenantId: string, opts?: { status?: string; date?: string; cashierId?: string }): Promise<CashSession[]>;
  createCashDrawerEvent(data: InsertCashDrawerEvent): Promise<CashDrawerEvent>;
  getCashDrawerEvents(sessionId: string): Promise<CashDrawerEvent[]>;
  createCashPayout(data: InsertCashPayout): Promise<CashPayout>;
  getCashPayouts(sessionId: string): Promise<CashPayout[]>;
  createCashHandover(data: InsertCashHandover): Promise<CashHandover>;
  getCashHandovers(sessionId: string): Promise<CashHandover[]>;
  getOutletCurrencySettings(outletId: string): Promise<Record<string, any> | undefined>;
  updateOutletCurrencySettings(outletId: string, data: Record<string, any>): Promise<Record<string, any>>;

  // Tip management
  getOutletTipSettings(outletId: string, tenantId: string): Promise<OutletTipSettings | null>;
  upsertOutletTipSettings(data: Record<string, any>): Promise<OutletTipSettings>;
  getBillTip(billId: string): Promise<BillTip | null>;
  getTipReport(tenantId: string, outletId: string | undefined, date: string): Promise<Record<string, any>>;
  getMyTips(tenantId: string, staffId: string): Promise<Record<string, any>>;
  getTipDistributions(tenantId: string, filters: { staffId?: string; date?: string; isPaid?: boolean }): Promise<TipDistribution[]>;
  markTipDistributionPaid(id: string, tenantId: string): Promise<TipDistribution | null>;

  // Packing charge management
  getOutletPackingSettings(outletId: string, tenantId: string): Promise<OutletPackingSettings | null>;
  upsertOutletPackingSettings(data: Record<string, any>): Promise<OutletPackingSettings>;
  getPackingCategories(outletId: string, tenantId: string): Promise<PackingChargeCategory[]>;
  createPackingCategory(data: InsertPackingChargeCategory): Promise<PackingChargeCategory>;
  updatePackingCategory(id: string, tenantId: string, data: Partial<InsertPackingChargeCategory>): Promise<PackingChargeCategory | null>;
  deletePackingCategory(id: string, tenantId: string): Promise<void>;
  getPackingExemptions(outletId: string, tenantId: string): Promise<PackingChargeExemption[]>;
  createPackingExemption(data: InsertPackingChargeExemption): Promise<PackingChargeExemption>;
  deletePackingExemption(id: string, tenantId: string): Promise<void>;
  createBillPackingCharge(data: InsertBillPackingCharge): Promise<BillPackingCharge>;
  getBillPackingCharge(billId: string): Promise<BillPackingCharge | null>;

  // In-App Support Tickets
  createInAppSupportTicket(data: InsertInAppSupportTicket): Promise<InAppSupportTicket>;
  getInAppSupportTicket(id: string): Promise<InAppSupportTicket | null>;
  getInAppSupportTickets(tenantId: string): Promise<InAppSupportTicket[]>;
  updateInAppSupportTicket(id: string, data: Partial<InAppSupportTicket>): Promise<InAppSupportTicket | null>;
  createInAppSupportTicketReply(data: InsertInAppSupportTicketReply): Promise<InAppSupportTicketReply>;
  getInAppSupportTicketReplies(ticketId: string): Promise<InAppSupportTicketReply[]>;
  getAllInAppSupportTickets(filters: { status?: string; priority?: string; category?: string; tenantId?: string; assignedTo?: string; dateFrom?: string }): Promise<any[]>;
  getInAppSupportStats(): Promise<{ open: number; in_progress: number; replied: number; resolved: number; closed: number; awaiting_support: number; avgResponseTime: number | null; byCategory: Record<string, number> }>;

  // Task #132: Special Resources
  getSpecialResourcesByOutlet(tenantId: string, outletId: string): Promise<SpecialResource[]>;
  createSpecialResource(data: InsertSpecialResource): Promise<SpecialResource>;
  updateSpecialResource(id: string, tenantId: string, data: Partial<InsertSpecialResource>): Promise<SpecialResource | undefined>;
  deleteSpecialResource(id: string, tenantId: string): Promise<void>;
  getResourceUnitsByResource(resourceId: string, tenantId?: string): Promise<ResourceUnit[]>;
  createResourceUnit(data: InsertResourceUnit): Promise<ResourceUnit>;
  updateResourceUnit(id: string, data: Partial<InsertResourceUnit>, tenantId?: string): Promise<ResourceUnit | undefined>;
  getResourceAssignmentsByTable(tableId: string, tenantId: string): Promise<ResourceAssignment[]>;
  getResourceAssignmentsByReservation(reservationId: string, tenantId: string): Promise<ResourceAssignment[]>;
  getActiveResourceAssignmentsByOutlet(outletId: string, tenantId: string): Promise<ResourceAssignment[]>;
  createResourceAssignment(data: any): Promise<ResourceAssignment>;
  updateResourceAssignment(id: string, data: Partial<any>, tenantId?: string): Promise<ResourceAssignment | undefined>;
  getResourceCleaningLog(outletId: string, tenantId: string, limit?: number): Promise<ResourceCleaningLog[]>;
  createResourceCleaningLog(data: InsertResourceCleaningLog): Promise<ResourceCleaningLog>;

  // Task #135: Parking Management
  getParkingConfig(outletId: string, tenantId: string): Promise<ParkingLayoutConfig | undefined>;
  upsertParkingConfig(outletId: string, tenantId: string, data: Partial<InsertParkingLayoutConfig>): Promise<ParkingLayoutConfig>;
  getParkingZones(outletId: string, tenantId: string): Promise<ParkingZone[]>;
  createParkingZone(data: InsertParkingZone): Promise<ParkingZone>;
  updateParkingZone(id: string, tenantId: string, data: Partial<InsertParkingZone>): Promise<ParkingZone | undefined>;
  deleteParkingZone(id: string, tenantId: string): Promise<void>;
  getParkingSlots(outletId: string, tenantId: string): Promise<ParkingSlot[]>;
  createParkingSlot(data: InsertParkingSlot): Promise<ParkingSlot>;
  updateParkingSlot(id: string, tenantId: string, data: Partial<InsertParkingSlot>): Promise<ParkingSlot | undefined>;
  getParkingRates(outletId: string, tenantId: string): Promise<ParkingRate[]>;
  createParkingRate(data: InsertParkingRate): Promise<ParkingRate>;
  updateParkingRate(id: string, tenantId: string, data: Partial<Pick<InsertParkingRate, "vehicleType" | "rateType" | "rateAmount" | "dailyMaxCharge" | "taxRate">>): Promise<ParkingRate | undefined>;
  deleteParkingRate(id: string, tenantId: string): Promise<void>;
  getParkingRateSlabs(rateId: string): Promise<ParkingRateSlab[]>;
  createParkingRateSlab(data: InsertParkingRateSlab): Promise<ParkingRateSlab>;
  deleteRateSlabsByRate(rateId: string): Promise<void>;
  getValetStaff(outletId: string, tenantId: string): Promise<ValetStaff[]>;
  createValetStaff(data: InsertValetStaff): Promise<ValetStaff>;
  updateValetStaff(id: string, tenantId: string, data: Partial<InsertValetStaff>): Promise<ValetStaff | undefined>;
  createValetTicket(data: InsertValetTicket): Promise<ValetTicket>;
  getValetTicket(id: string): Promise<ValetTicket | undefined>;
  getValetTickets(outletId: string, tenantId: string, opts?: { status?: string | string[] }): Promise<ValetTicket[]>;
  updateValetTicket(id: string, tenantId: string, data: Partial<InsertValetTicket>): Promise<ValetTicket | undefined>;
  appendValetTicketEvent(ticketId: string, tenantId: string, event: { eventType: string; performedBy?: string; performedByName?: string; notes?: string }): Promise<void>;
  getValetTicketByBill(billId: string): Promise<ValetTicket | undefined>;
  createRetrievalRequest(data: InsertValetRetrievalRequest): Promise<ValetRetrievalRequest>;
  getRetrievalRequests(outletId: string, tenantId: string, opts?: { status?: string | string[] }): Promise<ValetRetrievalRequest[]>;
  updateRetrievalRequest(id: string, tenantId: string, data: Partial<InsertValetRetrievalRequest>): Promise<ValetRetrievalRequest | undefined>;
  createBillParkingCharge(data: InsertBillParkingCharge): Promise<BillParkingCharge>;
  getBillParkingCharge(billId: string, tenantId: string): Promise<BillParkingCharge | undefined>;
  generateValetTicketNumber(outletId: string, tenantId: string): Promise<string>;
}

function mapCashSessionRow(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    outletId: row.outlet_id,
    posSessionId: row.pos_session_id,
    sessionNumber: row.session_number,
    cashierId: row.cashier_id,
    cashierName: row.cashier_name,
    currencyCode: row.currency_code,
    currencySymbol: row.currency_symbol,
    status: row.status,
    openingFloat: row.opening_float,
    openingFloatBreakdown: row.opening_float_breakdown,
    expectedClosingCash: row.expected_closing_cash,
    physicalClosingCash: row.physical_closing_cash,
    closingBreakdown: row.closing_breakdown,
    cashVariance: row.cash_variance,
    varianceReason: row.variance_reason,
    totalCashSales: row.total_cash_sales,
    totalCashRefunds: row.total_cash_refunds,
    totalCashPayouts: row.total_cash_payouts,
    totalTransactions: row.total_transactions,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/** snake_case → camelCase helpers for raw SQL rows */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function mapRowToCamelCase<T>(row: Record<string, any>): T {
  if (!row) return row as T;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value;
  }
  return result as T;
}

function mapRowsToCamelCase<T>(rows: Record<string, any>[]): T[] {
  return rows.map(row => mapRowToCamelCase<T>(row));
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
    const rows = await db.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.isDeleted, false)));
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
    return db.select().from(menuItems).where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.isDeleted, false))).limit(500);
  }
  async getMenuItemsByTenantAndOutlet(tenantId: string, outletId?: string): Promise<MenuItem[]> {
    const baseItems = await db.select().from(menuItems).where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.isDeleted, false))).limit(500);
    if (!outletId) return baseItems;
    const overrides = await db.select().from(outletMenuPrices).where(
      and(eq(outletMenuPrices.tenantId, tenantId), eq(outletMenuPrices.outletId, outletId), eq(outletMenuPrices.priceType, "OUTLET_BASE"), eq(outletMenuPrices.isActive, true))
    );
    const overrideMap = new Map(overrides.map(o => [o.menuItemId, o.price]));
    return baseItems.map(item => overrideMap.has(item.id) ? { ...item, price: overrideMap.get(item.id)! } : item);
  }
  async getMenuItemsByCategory(categoryId: string) {
    return db.select().from(menuItems).where(and(eq(menuItems.categoryId, categoryId), eq(menuItems.isDeleted, false)));
  }
  async getMenuItem(id: string, tenantId: string) {
    const [i] = await db.select().from(menuItems).where(
      and(eq(menuItems.id, id), eq(menuItems.tenantId, tenantId), eq(menuItems.isDeleted, false))
    );
    return i;
  }
  async createMenuItem(data: InsertMenuItem) {
    const [i] = await db.insert(menuItems).values(data).returning();
    return i;
  }
  async updateMenuItem(id: string, tenantId: string, data: Partial<InsertMenuItem>) {
    const [i] = await db.update(menuItems).set(data).where(and(eq(menuItems.id, id), eq(menuItems.tenantId, tenantId))).returning();
    return i;
  }
  async deleteMenuItem(id: string, tenantId: string, deletedBy?: string) {
    await db.update(menuItems).set({ isDeleted: true, deletedAt: new Date(), deletedBy: deletedBy ?? null }).where(and(eq(menuItems.id, id), eq(menuItems.tenantId, tenantId)));
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
  async getTable(id: string, tenantId: string) {
    const [t] = await db.select().from(tables).where(
      and(eq(tables.id, id), eq(tables.tenantId, tenantId))
    );
    return t;
  }
  async createTable(data: InsertTable) {
    const [t] = await db.insert(tables).values(data).returning();
    return t;
  }
  async updateTable(id: string, tenantId: string, data: Partial<InsertTable>) {
    const [t] = await db.update(tables).set(data).where(and(eq(tables.id, id), eq(tables.tenantId, tenantId))).returning();
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

  async getReservationsByTenant(tenantId: string, opts?: { limit?: number; offset?: number }) {
    let q = db.select().from(reservations).where(and(eq(reservations.tenantId, tenantId), eq(reservations.isDeleted, false))).orderBy(desc(reservations.dateTime)) as any;
    if (opts?.limit !== undefined && opts?.offset !== undefined) q = q.limit(opts.limit).offset(opts.offset);
    const rows = await q;
    return rows.map((r: any) => decryptPiiFields(r as Record<string, unknown>, RESERVATION_PII_FIELDS) as Reservation);
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
  async deleteReservationByTenant(id: string, tenantId: string, deletedBy?: string) {
    await db.update(reservations).set({ isDeleted: true, deletedAt: new Date(), deletedBy: deletedBy ?? null }).where(and(eq(reservations.id, id), eq(reservations.tenantId, tenantId)));
  }

  async getOrdersByTenant(tenantId: string, opts?: { limit?: number; offset?: number; status?: string; orderType?: string; dateFrom?: string; dateTo?: string }) {
    const conditions: any[] = [eq(orders.tenantId, tenantId)];
    if (opts?.status && opts.status !== "all") {
      // O14 fix: support comma-separated composite status values (e.g., "paid,completed")
      const statusParts = opts.status.split(",").map((s: string) => s.trim());
      if (statusParts.length > 1) {
        conditions.push(inArray(orders.status, statusParts as any));
      } else {
        conditions.push(eq(orders.status, opts.status as any));
      }
    }
    if (opts?.orderType && opts.orderType !== "all") conditions.push(eq(orders.orderType, opts.orderType as any));
    if (opts?.dateFrom) conditions.push(gte(orders.createdAt, new Date(opts.dateFrom)));
    if (opts?.dateTo) { const dt = new Date(opts.dateTo); dt.setHours(23, 59, 59, 999); conditions.push(lte(orders.createdAt, dt)); }
    const where = conditions.length > 1 ? and(...conditions) : conditions[0];
    const q = db.select().from(orders).where(where).orderBy(desc(orders.createdAt));
    if (opts?.limit !== undefined && opts?.offset !== undefined) return q.limit(opts.limit).offset(opts.offset);
    if (opts?.limit !== undefined) return q.limit(opts.limit);
    return q;
  }
  async getOrder(id: string, tenantId: string) {
    const [o] = await db.select().from(orders).where(
      and(eq(orders.id, id), eq(orders.tenantId, tenantId))
    );
    return o;
  }
  async getOrderById(id: string) {
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
  async updateOrder(id: string, data: Partial<InsertOrder>, expectedVersion?: number) {
    const { version: _, ...rest }: { version?: number | null; [k: string]: unknown } = data;
    const whereClause = expectedVersion !== undefined
      ? and(eq(orders.id, id), eq(orders.version, expectedVersion))
      : eq(orders.id, id);
    const [o] = await db.update(orders).set({ ...rest, version: sql`COALESCE(${orders.version}, 0) + 1` }).where(whereClause).returning();
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
  async updateOrderItem(id: string, data: Record<string, any>, tenantId: string) {
    const tenantOrderIds = db.select({ id: orders.id }).from(orders).where(eq(orders.tenantId, tenantId));
    const [i] = await db.update(orderItems).set(data).where(
      and(eq(orderItems.id, id), inArray(orderItems.orderId, tenantOrderIds))
    ).returning();
    return i;
  }

  async getInventoryByTenant(tenantId: string, opts?: { limit?: number; offset?: number; itemCategory?: string }) {
    const conditions = [eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.isDeleted, false)];
    if (opts?.itemCategory) {
      conditions.push(eq(inventoryItems.itemCategory, opts.itemCategory));
    }
    const whereClause = and(...conditions);
    const q = db.select().from(inventoryItems).where(whereClause);
    if (opts?.limit !== undefined && opts?.offset !== undefined) return q.limit(opts.limit).offset(opts.offset);
    if (opts?.limit !== undefined) return q.limit(opts.limit);
    return q;
  }
  async getPiecewiseInventory(tenantId: string, _opts?: { outletId?: string }) {
    const result = await pool.query(
      `SELECT id, name, item_category, current_stock::numeric AS "currentStock",
              par_level_per_shift AS "parLevelPerShift", reorder_pieces AS "reorderPieces",
              cost_per_piece::numeric AS "costPerPiece"
       FROM inventory_items
       WHERE tenant_id = $1
         AND item_category IN ('CROCKERY','CUTLERY','GLASSWARE')
       ORDER BY item_category, name`,
      [tenantId]
    );
    return result.rows.map((r: any) => ({
      ...r,
      currentStock: Math.round(Number(r.currentStock)),
      parLevelPerShift: r.parLevelPerShift ? Number(r.parLevelPerShift) : null,
      reorderPieces: r.reorderPieces ? Number(r.reorderPieces) : null,
      costPerPiece: r.costPerPiece ? Number(r.costPerPiece) : null,
      isBelowPar: r.parLevelPerShift !== null && Math.round(Number(r.currentStock)) < Number(r.parLevelPerShift),
      isBelowReorder: r.reorderPieces !== null && Math.round(Number(r.currentStock)) < Number(r.reorderPieces),
    }));
  }
  async getBreakageReport(tenantId: string, month: string) {
    const result = await pool.query(
      `SELECT
         ii.id, ii.name, ii.item_category AS "itemCategory", ii.cost_per_piece::numeric AS "costPerPiece",
         SUM(di.damaged_qty)::int AS "totalPieces",
         SUM(di.total_value)::numeric AS "totalValue",
         di.damage_type AS "damageType",
         di.caused_by_name AS "causedByName",
         COUNT(*) AS "incidentCount"
       FROM damaged_inventory di
       JOIN inventory_items ii ON di.inventory_item_id = ii.id
       WHERE di.tenant_id = $1
         AND ii.item_category IN ('CROCKERY','CUTLERY','GLASSWARE')
         AND di.status = 'approved'
         AND DATE_TRUNC('month', di.damage_date::date) = DATE_TRUNC('month', $2::date)
       GROUP BY ii.id, ii.name, ii.item_category, ii.cost_per_piece, di.damage_type, di.caused_by_name
       ORDER BY "totalValue" DESC`,
      [tenantId, month + '-01']
    );
    const byItem = result.rows;
    const byCause: Record<string, { pieces: number; pct: number }> = {};
    let totalPieces = 0;
    let totalValue = 0;
    for (const row of byItem) {
      totalPieces += Number(row.totalPieces);
      totalValue += Number(row.totalValue);
      const cause = row.damageType || 'UNKNOWN';
      if (!byCause[cause]) byCause[cause] = { pieces: 0, pct: 0 };
      byCause[cause].pieces += Number(row.totalPieces);
    }
    for (const cause of Object.keys(byCause)) {
      byCause[cause].pct = totalPieces > 0 ? Math.round((byCause[cause].pieces / totalPieces) * 100) : 0;
    }
    const byStaff: Record<string, { pieces: number; value: number }> = {};
    for (const row of byItem) {
      if (row.causedByName) {
        if (!byStaff[row.causedByName]) byStaff[row.causedByName] = { pieces: 0, value: 0 };
        byStaff[row.causedByName].pieces += Number(row.totalPieces);
        byStaff[row.causedByName].value += Number(row.totalValue);
      }
    }
    const date = new Date(month + '-01');
    const monthLabel = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    return {
      month: monthLabel,
      byItem,
      byCause,
      byStaff: Object.entries(byStaff).map(([name, v]) => ({ name, ...v })),
      totals: { pieces: totalPieces, value: Number(totalValue.toFixed(2)) },
    };
  }
  async getInventoryItem(id: string, tenantId: string) {
    const [i] = await db.select().from(inventoryItems).where(
      and(eq(inventoryItems.id, id), eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.isDeleted, false))
    );
    return i;
  }
  async createInventoryItem(data: InsertInventoryItem) {
    const [i] = await db.insert(inventoryItems).values(data).returning();
    return i;
  }
  async updateInventoryItem(id: string, data: Partial<InsertInventoryItem>, tenantId: string) {
    const [i] = await db.update(inventoryItems).set(data).where(
      and(eq(inventoryItems.id, id), eq(inventoryItems.tenantId, tenantId))
    ).returning();
    return i;
  }
  async deleteInventoryItem(id: string, tenantId: string, deletedBy?: string) {
    await db.update(inventoryItems).set({ isDeleted: true, deletedAt: new Date(), deletedBy: deletedBy ?? null }).where(
      and(eq(inventoryItems.id, id), eq(inventoryItems.tenantId, tenantId))
    );
  }
  async createStockMovement(data: InsertStockMovement) {
    const [m] = await db.insert(stockMovements).values(data).returning();
    return m;
  }

  async getCustomersByTenant(tenantId: string, opts?: { limit?: number; offset?: number }) {
    const q = db.select().from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.isDeleted, false)));
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
    const [c] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId), eq(customers.isDeleted, false)));
    return c ? decryptPiiFields(c as Record<string, unknown>, CUSTOMER_PII_FIELDS) as Customer : undefined;
  }
  async updateCustomerByTenant(id: string, tenantId: string, data: Partial<InsertCustomer>) {
    const encData = encryptPiiFields(data as Record<string, unknown>, CUSTOMER_PII_FIELDS) as Partial<InsertCustomer>;
    const [c] = await db.update(customers).set(encData).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).returning();
    return c ? decryptPiiFields(c as Record<string, unknown>, CUSTOMER_PII_FIELDS) as Customer : undefined;
  }
  async deleteCustomerByTenant(id: string, tenantId: string, deletedBy?: string) {
    await db.update(customers).set({ isDeleted: true, deletedAt: new Date(), deletedBy: deletedBy ?? null }).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)));
  }
  async getCustomersByLoyaltyTier(tenantId: string, tier: string) {
    const rows = await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.loyaltyTier, tier), eq(customers.isDeleted, false)));
    return rows.map(c => decryptPiiFields(c as Record<string, unknown>, CUSTOMER_PII_FIELDS) as Customer);
  }
  async getCustomersByTags(tenantId: string, tag: string) {
    const rows = await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), sql`${tag} = ANY(${customers.tags})`, eq(customers.isDeleted, false)));
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
        eq(inventoryItems.isDeleted, false),
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

    // Fetch refunds grouped by the bill's creation date (order revenue date), not refund date.
    // This correctly attributes refunds to the day the original revenue was earned.
    const { rows: refundDayRows } = await pool.query(
      `SELECT DATE(b.created_at) AS bill_date, SUM(ABS(bp.amount)) AS refund_total, COUNT(*) AS refund_count
       FROM bill_payments bp
       JOIN bills b ON b.id = bp.bill_id
       WHERE bp.tenant_id = $1
         AND bp.is_refund = true
         AND b.created_at >= $2
         AND b.created_at <= $3
       GROUP BY DATE(b.created_at)`,
      [tenantId, from, to]
    );
    const refundsByDay: Record<string, number> = {};
    let totalRefunded = 0;
    let refundCount = 0;
    for (const r of refundDayRows) {
      const dateStr = String(r.bill_date).split("T")[0];
      const amt = Number(r.refund_total);
      refundsByDay[dateStr] = (refundsByDay[dateStr] ?? 0) + amt;
      totalRefunded += amt;
      refundCount += Number(r.refund_count);
    }

    // Merge refunds into salesByDay — net revenue per day = gross revenue − refunds on that day's bills
    const salesByDayWithRefunds = salesByDay.map((d: { date: string; revenue: string | null; orderCount: number }) => {
      const dateStr = String(d.date).split("T")[0];
      const refund = refundsByDay[dateStr] ?? 0;
      const revenue = Number(d.revenue ?? 0);
      const netRevenue = Math.max(0, revenue - refund);
      return { ...d, refund, netRevenue };
    });

    const grossRevenue = Number(totals?.revenue ?? 0);
    const netRevenue = Math.max(0, grossRevenue - totalRefunded);

    return { salesByDay: salesByDayWithRefunds, totals, totalRefunded, totalRefunds: totalRefunded, refundCount, netRevenue };
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
    return db.select().from(recipes).where(and(eq(recipes.tenantId, tenantId), eq(recipes.isDeleted, false))).orderBy(recipes.name).limit(200);
  }
  async getRecipe(id: string) {
    const [r] = await db.select().from(recipes).where(and(eq(recipes.id, id), eq(recipes.isDeleted, false)));
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
  async deleteRecipe(id: string, tenantId: string, deletedBy?: string) {
    await db.update(recipes).set({ isDeleted: true, deletedAt: new Date(), deletedBy: deletedBy ?? null }).where(and(eq(recipes.id, id), eq(recipes.tenantId, tenantId)));
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
    const [r] = await db.select().from(recipes).where(and(eq(recipes.menuItemId, menuItemId), eq(recipes.isDeleted, false)));
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
  async getOrderItem(id: string, tenantId: string) {
    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, id));
    if (!item) return undefined;
    if (item.orderId) {
      const [parentOrder] = await db.select({ tenantId: orders.tenantId }).from(orders).where(eq(orders.id, item.orderId));
      if (!parentOrder || parentOrder.tenantId !== tenantId) return undefined;
    }
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
    const allRecipes = await db.select().from(recipes).where(and(eq(recipes.tenantId, tenantId), eq(recipes.isDeleted, false)));
    const allIngredients = await db.select().from(recipeIngredients);
    const allItems = await db.select().from(menuItems).where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.isDeleted, false)));
    const invItems = await db.select().from(inventoryItems).where(and(eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.isDeleted, false)));
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
    const items = await db.select().from(menuItems).where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.isDeleted, false)));
    return items;
  }

  async getSuppliersByTenant(tenantId: string) {
    return db.select().from(suppliers).where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.isDeleted, false))).orderBy(suppliers.name).limit(200);
  }
  async getSupplier(id: string, tenantId: string) {
    const [s] = await db.select().from(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId), eq(suppliers.isDeleted, false)));
    return s;
  }
  async createSupplier(data: InsertSupplier) {
    let supplierCode = data.supplierCode;
    if (!supplierCode) {
      const existing = await db.select({ supplierCode: suppliers.supplierCode }).from(suppliers).where(eq(suppliers.tenantId, data.tenantId));
      let maxNum = 0;
      for (const row of existing) {
        if (row.supplierCode && row.supplierCode.startsWith("SUP-")) {
          const n = parseInt(row.supplierCode.replace("SUP-", ""), 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      }
      supplierCode = `SUP-${String(maxNum + 1).padStart(4, "0")}`;
    }
    const [s] = await db.insert(suppliers).values({ ...data, supplierCode }).returning();
    return s;
  }
  async updateSupplier(id: string, tenantId: string, data: Partial<InsertSupplier>) {
    const [s] = await db.update(suppliers).set(data).where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId))).returning();
    return s;
  }
  async deleteSupplier(id: string, tenantId: string, deletedBy?: string) {
    await db.update(suppliers).set({ isDeleted: true, deletedAt: new Date(), deletedBy: deletedBy ?? null }).where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)));
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
    return db.select().from(purchaseOrders).where(and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.isDeleted, false))).orderBy(desc(purchaseOrders.createdAt)).limit(200);
  }
  async countPurchaseOrdersByTenant(tenantId: string) {
    const [row] = await db.select({ total: count() }).from(purchaseOrders).where(eq(purchaseOrders.tenantId, tenantId));
    return row?.total ?? 0;
  }
  async getPurchaseOrder(id: string, tenantId: string) {
    const [po] = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.isDeleted, false)));
    return po;
  }
  async createPurchaseOrder(data: InsertPurchaseOrder) {
    const [po] = await db.insert(purchaseOrders).values(data).returning();
    return po;
  }
  async updateInventoryItemStock(opts: { tx: any; tenantId: string; inventoryItemId: string; deltaQty: number; outletId?: string | null; movementType: string; reason: string; unitCost?: string | null }): Promise<void> {
    const { tx, tenantId, inventoryItemId, deltaQty, outletId, movementType, reason, unitCost } = opts;
    const [inv] = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.isDeleted, false)));
    if (!inv) return;
    const newStock = parseFloat(inv.currentStock || "0") + deltaQty;
    const updateFields: Partial<InsertInventoryItem> = { currentStock: Math.max(0, newStock).toFixed(2) };
    if (unitCost && deltaQty > 0) updateFields.costPrice = unitCost;
    await tx.update(inventoryItems).set(updateFields).where(and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.tenantId, tenantId)));
    await tx.insert(stockMovements).values({ tenantId, itemId: inventoryItemId, type: movementType, quantity: deltaQty.toFixed(4), reason, ...(outletId ? { outletId } : {}) });
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
  async updateGRN(id: string, tenantId: string, data: Partial<InsertGoodsReceivedNote>) {
    const [grn] = await db.update(goodsReceivedNotes).set(data).where(and(eq(goodsReceivedNotes.id, id), eq(goodsReceivedNotes.tenantId, tenantId))).returning();
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

  // RFQ / Quotations
  async getRFQsByTenant(tenantId: string) {
    return db.select().from(rfqs).where(eq(rfqs.tenantId, tenantId)).orderBy(desc(rfqs.createdAt));
  }
  async getRFQ(id: string, tenantId: string) {
    const [r] = await db.select().from(rfqs).where(and(eq(rfqs.id, id), eq(rfqs.tenantId, tenantId)));
    return r;
  }
  async createRFQ(data: InsertRFQ) {
    const [r] = await db.insert(rfqs).values(data).returning();
    return r;
  }
  async updateRFQ(id: string, tenantId: string, data: Partial<InsertRFQ>) {
    const [r] = await db.update(rfqs).set(data).where(and(eq(rfqs.id, id), eq(rfqs.tenantId, tenantId))).returning();
    return r;
  }
  async getRFQItems(rfqId: string) {
    return db.select().from(rfqItems).where(eq(rfqItems.rfqId, rfqId));
  }
  async createRFQItem(data: InsertRFQItem) {
    const [i] = await db.insert(rfqItems).values(data).returning();
    return i;
  }
  async deleteRFQItems(rfqId: string) {
    await db.delete(rfqItems).where(eq(rfqItems.rfqId, rfqId));
  }
  async getQuotationsByRFQ(rfqId: string) {
    return db.select().from(supplierQuotations).where(eq(supplierQuotations.rfqId, rfqId)).orderBy(desc(supplierQuotations.createdAt));
  }
  async createSupplierQuotation(data: InsertSupplierQuotation) {
    const [q] = await db.insert(supplierQuotations).values(data).returning();
    return q;
  }
  async getQuotationItems(quotationId: string) {
    return db.select().from(quotationItems).where(eq(quotationItems.quotationId, quotationId));
  }
  async createQuotationItem(data: InsertQuotationItem) {
    const [qi] = await db.insert(quotationItems).values(data).returning();
    return qi;
  }

  // Purchase Returns
  async getPurchaseReturnsByTenant(tenantId: string) {
    return db.select().from(purchaseReturns).where(eq(purchaseReturns.tenantId, tenantId)).orderBy(desc(purchaseReturns.createdAt));
  }
  async getPurchaseReturn(id: string, tenantId: string) {
    const [r] = await db.select().from(purchaseReturns).where(and(eq(purchaseReturns.id, id), eq(purchaseReturns.tenantId, tenantId)));
    return r;
  }
  async createPurchaseReturn(data: InsertPurchaseReturn) {
    const [r] = await db.insert(purchaseReturns).values(data).returning();
    return r;
  }
  async updatePurchaseReturn(id: string, tenantId: string, data: Partial<InsertPurchaseReturn>) {
    const [r] = await db.update(purchaseReturns).set(data).where(and(eq(purchaseReturns.id, id), eq(purchaseReturns.tenantId, tenantId))).returning();
    return r;
  }
  async getPurchaseReturnItems(returnId: string) {
    return db.select().from(purchaseReturnItems).where(eq(purchaseReturnItems.returnId, returnId));
  }
  async createPurchaseReturnItem(data: InsertPurchaseReturnItem) {
    const [i] = await db.insert(purchaseReturnItems).values(data).returning();
    return i;
  }
  async countPurchaseReturnsByTenant(tenantId: string) {
    const [r] = await db.select({ count: count() }).from(purchaseReturns).where(eq(purchaseReturns.tenantId, tenantId));
    return r?.count ?? 0;
  }

  // Stock Transfers
  async getStockTransfersByTenant(tenantId: string) {
    return db.select().from(stockTransfers).where(eq(stockTransfers.tenantId, tenantId)).orderBy(desc(stockTransfers.createdAt));
  }
  async getStockTransfer(id: string, tenantId: string) {
    const [t] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.tenantId, tenantId)));
    return t;
  }
  async createStockTransfer(data: InsertStockTransfer) {
    const [t] = await db.insert(stockTransfers).values(data).returning();
    return t;
  }
  async updateStockTransfer(id: string, tenantId: string, data: Partial<InsertStockTransfer>) {
    const [t] = await db.update(stockTransfers).set(data).where(and(eq(stockTransfers.id, id), eq(stockTransfers.tenantId, tenantId))).returning();
    return t;
  }
  async getStockTransferItems(transferId: string) {
    return db.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, transferId));
  }
  async createStockTransferItem(data: InsertStockTransferItem) {
    const [i] = await db.insert(stockTransferItems).values(data).returning();
    return i;
  }
  async updateStockTransferItem(id: string, data: Partial<InsertStockTransferItem>) {
    const [i] = await db.update(stockTransferItems).set(data).where(eq(stockTransferItems.id, id)).returning();
    return i;
  }
  async countStockTransfersByTenant(tenantId: string) {
    const [r] = await db.select({ count: count() }).from(stockTransfers).where(eq(stockTransfers.tenantId, tenantId));
    return r?.count ?? 0;
  }

  // Stock Count Sessions
  async getStockCountsByTenant(tenantId: string) {
    return db.select().from(stockCountSessions).where(eq(stockCountSessions.tenantId, tenantId)).orderBy(desc(stockCountSessions.createdAt));
  }
  async getStockCount(id: string, tenantId: string) {
    const [s] = await db.select().from(stockCountSessions).where(and(eq(stockCountSessions.id, id), eq(stockCountSessions.tenantId, tenantId)));
    return s;
  }
  async createStockCount(data: InsertStockCountSession) {
    const [s] = await db.insert(stockCountSessions).values(data).returning();
    return s;
  }
  async updateStockCount(id: string, tenantId: string, data: Partial<InsertStockCountSession>) {
    const [s] = await db.update(stockCountSessions).set(data).where(and(eq(stockCountSessions.id, id), eq(stockCountSessions.tenantId, tenantId))).returning();
    return s;
  }
  async getStockCountItems(sessionId: string) {
    return db.select().from(stockCountItems).where(eq(stockCountItems.sessionId, sessionId));
  }
  async createStockCountItem(data: InsertStockCountItem) {
    const [i] = await db.insert(stockCountItems).values(data).returning();
    return i;
  }
  async createStockCountItemsBulk(items: InsertStockCountItem[]) {
    if (!items.length) return [];
    return db.insert(stockCountItems).values(items).returning();
  }
  async updateStockCountItem(id: string, data: Partial<InsertStockCountItem>) {
    const [i] = await db.update(stockCountItems).set(data).where(eq(stockCountItems.id, id)).returning();
    return i;
  }
  async countStockCountsByTenant(tenantId: string) {
    const [r] = await db.select({ count: count() }).from(stockCountSessions).where(eq(stockCountSessions.tenantId, tenantId));
    return r?.count ?? 0;
  }

  // Damaged Inventory
  async getDamagedInventoryByTenant(tenantId: string, opts?: { itemCategory?: string }) {
    if (opts?.itemCategory) {
      const result = await pool.query(
        `SELECT di.* FROM damaged_inventory di
         JOIN inventory_items ii ON di.inventory_item_id = ii.id
         WHERE di.tenant_id = $1 AND ii.item_category = $2
         ORDER BY di.created_at DESC`,
        [tenantId, opts.itemCategory]
      );
      return result.rows as DamagedInventory[];
    }
    return db.select().from(damagedInventory).where(eq(damagedInventory.tenantId, tenantId)).orderBy(desc(damagedInventory.createdAt));
  }
  async getDamagedInventoryItem(id: string, tenantId: string) {
    const [d] = await db.select().from(damagedInventory).where(and(eq(damagedInventory.id, id), eq(damagedInventory.tenantId, tenantId)));
    return d;
  }
  async createDamagedInventory(data: InsertDamagedInventory) {
    const [d] = await db.insert(damagedInventory).values(data).returning();
    return d;
  }
  async updateDamagedInventory(id: string, tenantId: string, data: Partial<InsertDamagedInventory>) {
    const [d] = await db.update(damagedInventory).set(data).where(and(eq(damagedInventory.id, id), eq(damagedInventory.tenantId, tenantId))).returning();
    return d;
  }
  async countDamagedInventoryByTenant(tenantId: string) {
    const [r] = await db.select({ count: count() }).from(damagedInventory).where(eq(damagedInventory.tenantId, tenantId));
    return r?.count ?? 0;
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
    return db.select().from(promotionRules).where(and(eq(promotionRules.tenantId, tenantId), eq(promotionRules.isDeleted, false))).orderBy(desc(promotionRules.priority));
  }
  async getPromotionRule(id: string, tenantId: string) {
    const [r] = await db.select().from(promotionRules).where(and(eq(promotionRules.id, id), eq(promotionRules.tenantId, tenantId), eq(promotionRules.isDeleted, false)));
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
  async deletePromotionRule(id: string, tenantId: string, deletedBy?: string) {
    await db.update(promotionRules).set({ isDeleted: true, deletedAt: new Date(), deletedBy: deletedBy ?? null }).where(and(eq(promotionRules.id, id), eq(promotionRules.tenantId, tenantId)));
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
    if (data.billNumber) {
      const [b] = await db.insert(bills).values(data).returning();
      return b;
    }
    const MAX_RETRIES = 5;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await db.transaction(async (tx) => {
          const year = new Date().getFullYear();
          const prefix = `INV-${year}-`;
          const [row] = await tx.select({ maxBill: sql<string>`MAX(bill_number)` }).from(bills)
            .where(and(eq(bills.tenantId, data.tenantId), sql`bill_number LIKE ${prefix + "%"}`));
          const lastNum = row?.maxBill ? parseInt(row.maxBill.slice(prefix.length), 10) : 0;
          const billNumber = `${prefix}${(lastNum + 1 + attempt).toString().padStart(4, "0")}`;
          const [b] = await tx.insert(bills).values({ ...data, billNumber }).returning();
          return b;
        });
      } catch (err: any) {
        const isUniqueViolation = err?.code === "23505" || (err?.message ?? "").includes("duplicate key");
        if (!isUniqueViolation) throw err;
        lastError = err;
      }
    }
    throw lastError ?? new Error("Failed to generate a unique bill number after retries");
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

  async createPrintJob(data: InsertPrintJob): Promise<PrintJob> {
    const [job] = await db.insert(printJobs).values(data).returning();
    return job;
  }
  async getPrintJobsByTenant(tenantId: string, opts?: { status?: typeof printJobStatusEnum.enumValues[number]; limit?: number; referenceId?: string }): Promise<PrintJob[]> {
    const conditions = [eq(printJobs.tenantId, tenantId)];
    if (opts?.status) conditions.push(eq(printJobs.status, opts.status));
    if (opts?.referenceId) conditions.push(eq(printJobs.referenceId, opts.referenceId));
    let q = db.select().from(printJobs).where(and(...conditions)).$dynamic();
    q = q.orderBy(desc(printJobs.createdAt));
    if (opts?.limit) q = q.limit(opts.limit);
    return q;
  }
  async updatePrintJob(id: string, tenantId: string, data: Partial<InsertPrintJob>): Promise<PrintJob | undefined> {
    const [job] = await db.update(printJobs).set(data)
      .where(and(eq(printJobs.id, id), eq(printJobs.tenantId, tenantId)))
      .returning();
    return job;
  }

  async createQrToken(data: InsertTableQrToken): Promise<TableQrToken> {
    const [token] = await db.insert(tableQrTokens).values(data).returning();
    return token;
  }
  async getActiveQrToken(tableId: string): Promise<TableQrToken | undefined> {
    const [token] = await db.select().from(tableQrTokens)
      .where(and(eq(tableQrTokens.tableId, tableId), eq(tableQrTokens.active, true)))
      .orderBy(desc(tableQrTokens.createdAt)).limit(1);
    return token;
  }
  async getQrTokenByValue(token: string): Promise<TableQrToken | undefined> {
    const [t] = await db.select().from(tableQrTokens).where(eq(tableQrTokens.token, token));
    return t;
  }
  async getQrTokensByTenant(tenantId: string): Promise<TableQrToken[]> {
    return db.select().from(tableQrTokens)
      .where(eq(tableQrTokens.tenantId, tenantId))
      .orderBy(desc(tableQrTokens.createdAt));
  }
  async deactivateQrToken(id: string, tenantId: string): Promise<void> {
    await db.update(tableQrTokens)
      .set({ active: false, deactivatedAt: new Date() })
      .where(and(eq(tableQrTokens.id, id), eq(tableQrTokens.tenantId, tenantId)));
  }

  async createTableRequest(data: InsertTableRequest): Promise<TableRequest> {
    const [req] = await db.insert(tableRequests).values(data).returning();
    return req;
  }
  async getTableRequest(id: string): Promise<TableRequest | undefined> {
    const [req] = await db.select().from(tableRequests).where(eq(tableRequests.id, id));
    return req;
  }
  async updateTableRequest(id: string, data: Partial<InsertTableRequest>): Promise<TableRequest | undefined> {
    const [req] = await db.update(tableRequests).set(data)
      .where(eq(tableRequests.id, id)).returning();
    return req;
  }
  async getTableRequestsByTenant(tenantId: string, opts?: { status?: string; limit?: number; offset?: number }): Promise<TableRequest[]> {
    const conditions = [eq(tableRequests.tenantId, tenantId)];
    if (opts?.status) conditions.push(eq(tableRequests.status, opts.status));
    let q = db.select().from(tableRequests).where(and(...conditions))
      .orderBy(desc(tableRequests.createdAt)).$dynamic();
    if (opts?.limit) q = q.limit(opts.limit);
    if (opts?.offset) q = q.offset(opts.offset);
    return q;
  }
  async getTableRequestsLive(tenantId: string): Promise<TableRequest[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return db.select().from(tableRequests)
      .where(and(
        eq(tableRequests.tenantId, tenantId),
        sql`(
          ${tableRequests.status} IN ('pending', 'pending_confirmation', 'acknowledged')
          OR (${tableRequests.status} IN ('completed', 'cancelled') AND ${tableRequests.createdAt} >= ${oneDayAgo.toISOString()})
        )`
      ))
      .orderBy(desc(tableRequests.createdAt));
  }
  async getTableRequestAnalytics(tenantId: string, from?: Date, to?: Date): Promise<{
    total: number;
    totalRequests: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    avgResponseSeconds: number | null;
    avgResponseMinutes: number | null;
    avgCompletionSeconds: number | null;
    escalatedCount: number;
    completionRate: number | null;
    topRequestTypes: Array<{ type: string; count: number }>;
    overdueCount: number;
    avgFeedbackRating: number | null;
    byTable: Array<{ tableNumber: number | null; count: number }>;
    byHour: Record<string, number>;
    byDay: Record<string, number>;
    byStaff: Array<{ name: string; count: number; avgResponseMinutes: number | null }>;
    feedbackByRating: Record<string, number>;
    feedbackByDay: Record<string, { count: number; total: number }>;
  }> {
    const conditions = [eq(tableRequests.tenantId, tenantId)];
    if (from) conditions.push(gte(tableRequests.createdAt, from));
    if (to) conditions.push(lte(tableRequests.createdAt, to));
    const rows = await db.select().from(tableRequests).where(and(...conditions));

    const tenantTables = await this.getTablesByTenant(tenantId);
    const tableMap = new Map(tenantTables.map(t => [t.id, t.number]));

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byTableMap: Record<string, number> = {};
    const byHour: Record<string, number> = {};
    const byDay: Record<string, number> = {};
    const feedbackByRating: Record<string, number> = {};
    const feedbackByDay: Record<string, { count: number; total: number }> = {};
    const staffMap: Record<string, { name: string; count: number; totalResponseMs: number; responseCount: number }> = {};

    let totalResponseSecs = 0, responseCount = 0;
    let totalCompletionSecs = 0, completionCount = 0;
    let escalatedCount = 0;
    let totalFeedbackRating = 0, feedbackRatingCount = 0;
    let overdueCount = 0;
    const now = Date.now();

    for (const r of rows) {
      byType[r.requestType] = (byType[r.requestType] ?? 0) + 1;
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      byPriority[r.priority] = (byPriority[r.priority] ?? 0) + 1;

      const tNum = tableMap.get(r.tableId);
      const tKey = String(tNum ?? r.tableId);
      byTableMap[tKey] = (byTableMap[tKey] ?? 0) + 1;

      if (r.createdAt) {
        const d = new Date(r.createdAt);
        const hour = String(d.getHours());
        const isoDay = d.toISOString().slice(0, 10);
        byHour[hour] = (byHour[hour] ?? 0) + 1;
        byDay[isoDay] = (byDay[isoDay] ?? 0) + 1;
      }

      if (r.acknowledgedAt && r.createdAt) {
        const respMs = new Date(r.acknowledgedAt).getTime() - new Date(r.createdAt).getTime();
        totalResponseSecs += respMs / 1000;
        responseCount++;
        if (r.assignedToName) {
          const key = r.assignedToName;
          if (!staffMap[key]) staffMap[key] = { name: key, count: 0, totalResponseMs: 0, responseCount: 0 };
          staffMap[key].count++;
          staffMap[key].totalResponseMs += respMs;
          staffMap[key].responseCount++;
        }
      } else if (r.assignedToName && (r.status === "completed")) {
        const key = r.assignedToName;
        if (!staffMap[key]) staffMap[key] = { name: key, count: 0, totalResponseMs: 0, responseCount: 0 };
        staffMap[key].count++;
      }

      if (r.completedAt && r.createdAt) {
        totalCompletionSecs += (new Date(r.completedAt).getTime() - new Date(r.createdAt).getTime()) / 1000;
        completionCount++;
      }

      if (r.escalatedAt) escalatedCount++;

      if (r.feedbackRating !== null && r.feedbackRating !== undefined) {
        totalFeedbackRating += r.feedbackRating;
        feedbackRatingCount++;
        feedbackByRating[String(r.feedbackRating)] = (feedbackByRating[String(r.feedbackRating)] ?? 0) + 1;
        if (r.createdAt) {
          const isoDay = new Date(r.createdAt).toISOString().slice(0, 10);
          if (!feedbackByDay[isoDay]) feedbackByDay[isoDay] = { count: 0, total: 0 };
          feedbackByDay[isoDay].count++;
          feedbackByDay[isoDay].total += r.feedbackRating;
        }
      }

      if (r.createdAt && (r.status === "pending" || r.status === "acknowledged")) {
        const ageMinutes = (now - new Date(r.createdAt).getTime()) / 60000;
        const thresholdMap: Record<string, number> = { high: 2, medium: 5, low: 10 };
        const threshold = thresholdMap[r.priority] ?? 5;
        if (ageMinutes > threshold && !r.escalatedAt) overdueCount++;
      }
    }

    const total = rows.length;
    const completedCount = byStatus["completed"] ?? 0;
    const topRequestTypes = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));

    const byTable = Object.entries(byTableMap).map(([key, count]) => {
      const num = parseInt(key);
      return { tableNumber: isNaN(num) ? null : num, count };
    }).sort((a, b) => b.count - a.count);

    const byStaff = Object.values(staffMap).map(s => ({
      name: s.name,
      count: s.count,
      avgResponseMinutes: s.responseCount > 0 ? Math.round(s.totalResponseMs / s.responseCount / 60000) : null,
    })).sort((a, b) => b.count - a.count);

    const avgResponseSecs = responseCount > 0 ? Math.round(totalResponseSecs / responseCount) : null;
    return {
      total,
      totalRequests: total,
      byType,
      byStatus,
      byPriority,
      avgResponseSeconds: avgResponseSecs,
      avgResponseMinutes: avgResponseSecs !== null ? Math.round(avgResponseSecs / 60) : null,
      avgCompletionSeconds: completionCount > 0 ? Math.round(totalCompletionSecs / completionCount) : null,
      escalatedCount,
      completionRate: total > 0 ? Math.round((completedCount / total) * 100) : null,
      topRequestTypes,
      overdueCount,
      avgFeedbackRating: feedbackRatingCount > 0 ? Math.round((totalFeedbackRating / feedbackRatingCount) * 10) / 10 : null,
      byTable,
      byHour,
      byDay,
      byStaff,
      feedbackByRating,
      feedbackByDay,
    };
  }

  // ─── Kitchen Counters ────────────────────────────────────────────────────────
  async getCounters(tenantId: string, outletId?: string): Promise<KitchenCounter[]> {
    let q = db.select().from(kitchenCounters).where(eq(kitchenCounters.tenantId, tenantId));
    if (outletId) q = q.where(and(eq(kitchenCounters.tenantId, tenantId), eq(kitchenCounters.outletId, outletId))) as typeof q;
    return q.orderBy(kitchenCounters.sortOrder, kitchenCounters.name);
  }
  async getCounter(id: string, tenantId: string): Promise<KitchenCounter | undefined> {
    const [r] = await db.select().from(kitchenCounters).where(and(eq(kitchenCounters.id, id), eq(kitchenCounters.tenantId, tenantId)));
    return r;
  }
  async createCounter(data: InsertKitchenCounter): Promise<KitchenCounter> {
    const [r] = await db.insert(kitchenCounters).values(data).returning();
    return r;
  }
  async updateCounter(id: string, tenantId: string, data: Partial<InsertKitchenCounter>): Promise<KitchenCounter | undefined> {
    const [r] = await db.update(kitchenCounters).set(data).where(and(eq(kitchenCounters.id, id), eq(kitchenCounters.tenantId, tenantId))).returning();
    return r;
  }
  async deleteCounter(id: string, tenantId: string): Promise<void> {
    await db.delete(kitchenCounters).where(and(eq(kitchenCounters.id, id), eq(kitchenCounters.tenantId, tenantId)));
  }

  // ─── Chef Roster ────────────────────────────────────────────────────────────
  async getRoster(tenantId: string, outletId?: string, date?: string): Promise<ChefRoster[]> {
    const conditions = [eq(chefRoster.tenantId, tenantId)];
    if (outletId) conditions.push(eq(chefRoster.outletId, outletId));
    if (date) conditions.push(eq(chefRoster.shiftDate, date));
    return db.select().from(chefRoster).where(and(...conditions)).orderBy(chefRoster.shiftDate, chefRoster.shiftStart);
  }
  async getRosterEntry(id: string, tenantId: string): Promise<ChefRoster | undefined> {
    const [r] = await db.select().from(chefRoster).where(and(eq(chefRoster.id, id), eq(chefRoster.tenantId, tenantId)));
    return r;
  }
  async createRosterEntry(data: InsertChefRoster): Promise<ChefRoster> {
    const [r] = await db.insert(chefRoster).values(data).returning();
    return r;
  }
  async updateRosterEntry(id: string, tenantId: string, data: Partial<InsertChefRoster>): Promise<ChefRoster | undefined> {
    const [r] = await db.update(chefRoster).set(data).where(and(eq(chefRoster.id, id), eq(chefRoster.tenantId, tenantId))).returning();
    return r;
  }
  async deleteRosterEntry(id: string, tenantId: string): Promise<void> {
    await db.delete(chefRoster).where(and(eq(chefRoster.id, id), eq(chefRoster.tenantId, tenantId)));
  }
  async copyLastWeekRoster(tenantId: string, outletId: string, weekStart: string): Promise<ChefRoster[]> {
    const targetStart = new Date(weekStart);
    const lastStart = new Date(targetStart);
    lastStart.setDate(lastStart.getDate() - 7);
    const lastEnd = new Date(lastStart);
    lastEnd.setDate(lastEnd.getDate() + 6);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const existing = await db.select().from(chefRoster).where(
      and(
        eq(chefRoster.tenantId, tenantId),
        eq(chefRoster.outletId, outletId),
        sql`${chefRoster.shiftDate} >= ${fmt(lastStart)} AND ${chefRoster.shiftDate} <= ${fmt(lastEnd)}`
      )
    );
    if (existing.length === 0) return [];
    const newEntries = existing.map(e => {
      const diff = new Date(e.shiftDate).getTime() - lastStart.getTime();
      const newDate = new Date(targetStart.getTime() + diff);
      return {
        tenantId: e.tenantId,
        outletId: e.outletId,
        chefId: e.chefId,
        chefName: e.chefName,
        counterId: e.counterId,
        counterName: e.counterName,
        shiftDate: fmt(newDate),
        shiftStart: e.shiftStart,
        shiftEnd: e.shiftEnd,
        shiftType: e.shiftType,
        status: "scheduled" as const,
        createdBy: e.createdBy,
      };
    });
    return db.insert(chefRoster).values(newEntries).returning();
  }

  // ─── Chef Availability ───────────────────────────────────────────────────────
  async getChefAvailability(tenantId: string, outletId?: string, date?: string): Promise<ChefAvailability[]> {
    const conditions = [eq(chefAvailability.tenantId, tenantId)];
    if (outletId) conditions.push(eq(chefAvailability.outletId, outletId));
    if (date) conditions.push(eq(chefAvailability.shiftDate, date));
    return db.select().from(chefAvailability).where(and(...conditions));
  }
  async upsertChefAvailability(data: InsertChefAvailability): Promise<ChefAvailability> {
    const today = data.shiftDate ?? new Date().toISOString().slice(0, 10);
    const [existing] = await db.select().from(chefAvailability).where(
      and(eq(chefAvailability.tenantId, data.tenantId), eq(chefAvailability.chefId, data.chefId!), eq(chefAvailability.shiftDate, today))
    );
    if (existing) {
      const [r] = await db.update(chefAvailability).set({ ...data, lastUpdated: new Date() }).where(eq(chefAvailability.id, existing.id)).returning();
      return r;
    }
    const [r] = await db.insert(chefAvailability).values({ ...data, shiftDate: today }).returning();
    return r;
  }
  async updateChefAvailabilityStatus(chefId: string, tenantId: string, date: string, status: string, activeTickets?: number): Promise<void> {
    const updates: Partial<InsertChefAvailability> = { status };
    if (activeTickets !== undefined) updates.activeTickets = activeTickets;
    await db.update(chefAvailability)
      .set({ ...updates, lastUpdated: new Date() })
      .where(and(eq(chefAvailability.chefId, chefId), eq(chefAvailability.tenantId, tenantId), eq(chefAvailability.shiftDate, date)));
  }

  // ─── Ticket Assignments ──────────────────────────────────────────────────────
  async getAssignment(id: string, tenantId: string): Promise<TicketAssignment | undefined> {
    const [r] = await db.select().from(ticketAssignments).where(and(eq(ticketAssignments.id, id), eq(ticketAssignments.tenantId, tenantId)));
    return r;
  }
  async getAssignmentByOrderItem(orderItemId: string, tenantId: string): Promise<TicketAssignment | undefined> {
    const [r] = await db.select().from(ticketAssignments).where(
      and(eq(ticketAssignments.orderItemId, orderItemId), eq(ticketAssignments.tenantId, tenantId))
    );
    return r;
  }
  async getLiveAssignments(tenantId: string, outletId?: string): Promise<TicketAssignment[]> {
    const conditions = [
      eq(ticketAssignments.tenantId, tenantId),
      sql`${ticketAssignments.status} NOT IN ('completed', 'cancelled')`,
    ];
    if (outletId) conditions.push(eq(ticketAssignments.outletId, outletId));
    return db.select().from(ticketAssignments).where(and(...conditions)).orderBy(desc(ticketAssignments.createdAt));
  }
  async createAssignment(data: InsertTicketAssignment): Promise<TicketAssignment> {
    const [r] = await db.insert(ticketAssignments).values(data).returning();
    return r;
  }
  async updateAssignment(id: string, tenantId: string, data: Partial<InsertTicketAssignment>): Promise<TicketAssignment | undefined> {
    const [r] = await db.update(ticketAssignments).set(data).where(and(eq(ticketAssignments.id, id), eq(ticketAssignments.tenantId, tenantId))).returning();
    return r;
  }
  async getAssignmentBoard(tenantId: string, outletId?: string): Promise<{
    counter: KitchenCounter;
    chefs: Array<{ chefId: string; chefName: string; status: string; activeTickets: number }>;
    assignments: TicketAssignment[];
    unassignedCount: number;
  }[]> {
    const counters = await this.getCounters(tenantId, outletId);
    const today = new Date().toISOString().slice(0, 10);
    const availability = await this.getChefAvailability(tenantId, outletId, today);
    const liveAssignments = await this.getLiveAssignments(tenantId, outletId);
    return counters.map(counter => {
      const counterChefs = availability.filter(a => a.counterId === counter.id).map(a => ({
        chefId: a.chefId,
        chefName: "",
        status: a.status ?? "available",
        activeTickets: a.activeTickets ?? 0,
      }));
      const counterAssignments = liveAssignments.filter(a => a.counterId === counter.id);
      const unassignedCount = counterAssignments.filter(a => a.status === "unassigned").length;
      return { counter, chefs: counterChefs, assignments: counterAssignments, unassignedCount };
    });
  }
  async getAssignmentAnalytics(tenantId: string, from?: Date, to?: Date): Promise<{
    perChef: Array<{ chefId: string; chefName: string; total: number; autoAssigned: number; selfAssigned: number; reassigned: number; avgPrepMin: number | null }>;
    perCounter: Array<{ counterId: string; counterName: string; total: number; unassignedRate: number; avgTicketsPerHour: number }>;
    efficiency: { autoAssignRate: number; avgOrderToAssignSec: number | null; avgAssignToStartSec: number | null };
  }> {
    const conditions = [eq(ticketAssignments.tenantId, tenantId)];
    if (from) conditions.push(gte(ticketAssignments.createdAt, from));
    if (to) conditions.push(lte(ticketAssignments.createdAt, to));
    const all = await db.select().from(ticketAssignments).where(and(...conditions));

    const chefMap = new Map<string, { chefName: string; total: number; autoAssigned: number; selfAssigned: number; reassigned: number; prepMins: number[]; }>();
    const counterMap = new Map<string, { counterName: string; total: number; unassigned: number; }>();
    let totalAutoAssign = 0;
    let totalWithChef = 0;
    let totalOrderToAssignSec = 0;
    let orderToAssignCount = 0;
    let totalAssignToStartSec = 0;
    let assignToStartCount = 0;

    for (const a of all) {
      if (a.chefId) {
        const c = chefMap.get(a.chefId) ?? { chefName: a.chefName ?? "", total: 0, autoAssigned: 0, selfAssigned: 0, reassigned: 0, prepMins: [] };
        c.total++;
        if (a.assignmentType === "AUTO_ROSTER" || a.assignmentType === "AUTO_WORKLOAD") { c.autoAssigned++; totalAutoAssign++; }
        if (a.assignmentType === "SELF_ASSIGNED") c.selfAssigned++;
        if (a.assignmentType === "REASSIGNED") c.reassigned++;
        if (a.startedAt && a.completedAt) c.prepMins.push((a.completedAt.getTime() - a.startedAt.getTime()) / 60000);
        chefMap.set(a.chefId, c);
        totalWithChef++;
      }
      if (a.counterId) {
        const ct = counterMap.get(a.counterId) ?? { counterName: a.counterName ?? "", total: 0, unassigned: 0 };
        ct.total++;
        if (a.status === "unassigned") ct.unassigned++;
        counterMap.set(a.counterId, ct);
      }
      if (a.assignedAt && a.createdAt) {
        totalOrderToAssignSec += (a.assignedAt.getTime() - a.createdAt.getTime()) / 1000;
        orderToAssignCount++;
      }
      if (a.startedAt && a.assignedAt) {
        totalAssignToStartSec += (a.startedAt.getTime() - a.assignedAt.getTime()) / 1000;
        assignToStartCount++;
      }
    }

    const perChef = Array.from(chefMap.entries()).map(([chefId, c]) => ({
      chefId,
      chefName: c.chefName,
      total: c.total,
      autoAssigned: c.autoAssigned,
      selfAssigned: c.selfAssigned,
      reassigned: c.reassigned,
      avgPrepMin: c.prepMins.length > 0 ? Math.round((c.prepMins.reduce((a, b) => a + b, 0) / c.prepMins.length) * 10) / 10 : null,
    }));
    const perCounter = Array.from(counterMap.entries()).map(([counterId, c]) => ({
      counterId,
      counterName: c.counterName,
      total: c.total,
      unassignedRate: c.total > 0 ? Math.round((c.unassigned / c.total) * 100) : 0,
      avgTicketsPerHour: 0,
    }));

    return {
      perChef,
      perCounter,
      efficiency: {
        autoAssignRate: totalWithChef > 0 ? Math.round((totalAutoAssign / totalWithChef) * 100) : 0,
        avgOrderToAssignSec: orderToAssignCount > 0 ? Math.round(totalOrderToAssignSec / orderToAssignCount) : null,
        avgAssignToStartSec: assignToStartCount > 0 ? Math.round(totalAssignToStartSec / assignToStartCount) : null,
      },
    };
  }

  async getOrderItemCookingStatuses(orderId: string): Promise<OrderItem[]> {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async updateOrderItemCooking(id: string, data: {
    cookingStatus?: string;
    suggestedStartAt?: Date | null;
    actualStartAt?: Date | null;
    estimatedReadyAt?: Date | null;
    actualReadyAt?: Date | null;
    itemPrepMinutes?: number | null;
    startedById?: string | null;
    startedByName?: string | null;
    holdReason?: string | null;
    holdUntilItemId?: string | null;
    holdUntilMinutes?: number | null;
    courseNumber?: number | null;
  }): Promise<OrderItem> {
    const [updated] = await db.update(orderItems).set(data).where(eq(orderItems.id, id)).returning();
    return updated;
  }

  async getOrderCourses(orderId: string): Promise<OrderCourse[]> {
    return db.select().from(orderCourses).where(eq(orderCourses.orderId, orderId));
  }

  async createOrderCourse(data: InsertOrderCourse): Promise<OrderCourse> {
    const [course] = await db.insert(orderCourses).values(data).returning();
    return course;
  }

  async updateOrderCourse(orderId: string, courseNumber: number, data: {
    status?: string;
    fireAt?: Date | null;
    firedBy?: string | null;
    firedByName?: string | null;
  }): Promise<void> {
    await db.update(orderCourses)
      .set(data)
      .where(and(eq(orderCourses.orderId, orderId), eq(orderCourses.courseNumber, courseNumber)));
  }

  async getKitchenSettings(tenantId: string): Promise<KitchenSettings | undefined> {
    const [row] = await db.select().from(kitchenSettings).where(eq(kitchenSettings.tenantId, tenantId));
    return row;
  }

  async upsertKitchenSettings(tenantId: string, data: Partial<InsertKitchenSettings>): Promise<KitchenSettings> {
    const existing = await this.getKitchenSettings(tenantId);
    if (existing) {
      const allowedFields: Partial<InsertKitchenSettings> = {};
      if (data.cookingControlMode !== undefined) allowedFields.cookingControlMode = data.cookingControlMode;
      if (data.showTimingSuggestions !== undefined) allowedFields.showTimingSuggestions = data.showTimingSuggestions;
      if (data.alertOverdueMinutes !== undefined) allowedFields.alertOverdueMinutes = data.alertOverdueMinutes;
      if (data.allowRushOverride !== undefined) allowedFields.allowRushOverride = data.allowRushOverride;
      if (data.rushRequiresManagerPin !== undefined) allowedFields.rushRequiresManagerPin = data.rushRequiresManagerPin;
      if (data.managerPinHash !== undefined) allowedFields.managerPinHash = data.managerPinHash;
      if (data.autoHoldBarItems !== undefined) allowedFields.autoHoldBarItems = data.autoHoldBarItems;
      if (data.defaultPrepSource !== undefined) allowedFields.defaultPrepSource = data.defaultPrepSource;
      const [updated] = await db.update(kitchenSettings)
        .set(allowedFields)
        .where(eq(kitchenSettings.tenantId, tenantId))
        .returning();
      return updated;
    } else {
      // Explicitly whitelist fields to prevent caller-supplied tenantId override
      const safeFields: Partial<InsertKitchenSettings> = {};
      if (data.cookingControlMode !== undefined) safeFields.cookingControlMode = data.cookingControlMode;
      if (data.showTimingSuggestions !== undefined) safeFields.showTimingSuggestions = data.showTimingSuggestions;
      if (data.alertOverdueMinutes !== undefined) safeFields.alertOverdueMinutes = data.alertOverdueMinutes;
      if (data.allowRushOverride !== undefined) safeFields.allowRushOverride = data.allowRushOverride;
      if (data.rushRequiresManagerPin !== undefined) safeFields.rushRequiresManagerPin = data.rushRequiresManagerPin;
      if (data.managerPinHash !== undefined) safeFields.managerPinHash = data.managerPinHash;
      if (data.autoHoldBarItems !== undefined) safeFields.autoHoldBarItems = data.autoHoldBarItems;
      if (data.defaultPrepSource !== undefined) safeFields.defaultPrepSource = data.defaultPrepSource;
      const [created] = await db.insert(kitchenSettings)
        .values({ ...safeFields, tenantId })
        .returning();
      return created;
    }
  }

  // ── Task #110: Time Tracking storage methods ──────────────────────────────

  async createItemTimeLog(data: InsertItemTimeLog): Promise<ItemTimeLog> {
    const [row] = await db.insert(itemTimeLogs).values(data).onConflictDoUpdate({
      target: itemTimeLogs.orderItemId,
      set: {
        cookingReadyAt: data.cookingReadyAt,
        waiterPickupAt: data.waiterPickupAt,
        servedAt: data.servedAt,
        actualCookingTime: data.actualCookingTime,
        totalKitchenTime: data.totalKitchenTime,
        totalCycleTime: data.totalCycleTime,
        performanceFlag: data.performanceFlag,
      },
    }).returning();
    return row;
  }

  async getItemTimeLog(orderItemId: string): Promise<ItemTimeLog | undefined> {
    const [row] = await db.select().from(itemTimeLogs).where(eq(itemTimeLogs.orderItemId, orderItemId));
    return row;
  }

  async getItemTimeLogsByTenant(tenantId: string, opts: { date?: string; outletId?: string; limit?: number } = {}): Promise<ItemTimeLog[]> {
    const conditions = [eq(itemTimeLogs.tenantId, tenantId)];
    if (opts.date) conditions.push(eq(itemTimeLogs.shiftDate, opts.date));
    if (opts.outletId) conditions.push(eq(itemTimeLogs.outletId, opts.outletId));
    return db.select().from(itemTimeLogs).where(and(...conditions)).limit(opts.limit || 1000).orderBy(desc(itemTimeLogs.createdAt));
  }

  async getOrderTimeSummary(orderId: string): Promise<OrderTimeSummary | undefined> {
    const [row] = await db.select().from(orderTimeSummary).where(eq(orderTimeSummary.orderId, orderId));
    return row;
  }

  async upsertOrderTimeSummary(data: InsertOrderTimeSummary): Promise<OrderTimeSummary> {
    const [row] = await db.insert(orderTimeSummary).values(data).onConflictDoUpdate({
      target: orderTimeSummary.orderId,
      set: {
        allItemsServedAt: data.allItemsServedAt,
        totalKitchenTime: data.totalKitchenTime,
        totalCycleTime: data.totalCycleTime,
        metTarget: data.metTarget,
      },
    }).returning();
    return row;
  }

  async upsertDailyTimePerformance(data: InsertDailyTimePerformance): Promise<DailyTimePerformance> {
    const [row] = await db.insert(dailyTimePerformance).values(data).onConflictDoUpdate({
      target: [dailyTimePerformance.tenantId, dailyTimePerformance.outletId, dailyTimePerformance.performanceDate, dailyTimePerformance.shiftType],
      set: {
        totalOrders: data.totalOrders,
        ordersOnTime: data.ordersOnTime,
        ordersDelayed: data.ordersDelayed,
        avgTotalKitchenTime: data.avgTotalKitchenTime,
        avgTotalCycleTime: data.avgTotalCycleTime,
        onTimePercentage: data.onTimePercentage,
      },
    }).returning();
    return row;
  }

  async getDailyTimePerformance(tenantId: string, outletId?: string, dateRange?: number): Promise<DailyTimePerformance[]> {
    const conditions = [eq(dailyTimePerformance.tenantId, tenantId)];
    if (outletId) conditions.push(eq(dailyTimePerformance.outletId, outletId));
    if (dateRange) {
      const fromDate = new Date(Date.now() - dateRange * 86400000).toISOString().slice(0, 10);
      conditions.push(gte(dailyTimePerformance.performanceDate, fromDate));
    }
    return db.select().from(dailyTimePerformance).where(and(...conditions)).orderBy(dailyTimePerformance.performanceDate);
  }

  async getRecipeBenchmark(tenantId: string, menuItemId: string): Promise<RecipeTimeBenchmark | undefined> {
    const [row] = await db.select().from(recipeTimeBenchmarks)
      .where(and(eq(recipeTimeBenchmarks.tenantId, tenantId), eq(recipeTimeBenchmarks.menuItemId, menuItemId)));
    return row;
  }

  async upsertRecipeBenchmark(data: InsertRecipeTimeBenchmark): Promise<RecipeTimeBenchmark> {
    const [row] = await db.insert(recipeTimeBenchmarks).values(data).onConflictDoUpdate({
      target: [recipeTimeBenchmarks.tenantId, recipeTimeBenchmarks.menuItemId, recipeTimeBenchmarks.counterId],
      set: {
        actualAvgTime: data.actualAvgTime,
        fastestTime: data.fastestTime,
        slowestTime: data.slowestTime,
        p75Time: data.p75Time,
        sampleCount: data.sampleCount,
        lastCalculated: data.lastCalculated,
      },
    }).returning();
    return row;
  }

  async getTimeTargets(tenantId: string, outletId?: string): Promise<TimePerformanceTarget | undefined> {
    const conditions = [eq(timePerformanceTargets.tenantId, tenantId), eq(timePerformanceTargets.isActive, true)];
    if (outletId) conditions.push(eq(timePerformanceTargets.outletId, outletId));
    const [row] = await db.select().from(timePerformanceTargets).where(and(...conditions)).limit(1);
    return row;
  }

  async upsertTimeTarget(data: InsertTimePerformanceTarget): Promise<TimePerformanceTarget> {
    const [row] = await db.insert(timePerformanceTargets).values(data).returning();
    return row;
  }

  // ── Task #112: Order Ticket History ──────────────────────────────────────────

  async getOrdersForHistory(tenantId: string, opts: {
    q?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    orderType?: string;
    staffId?: string;
    outletId?: string;
    roleScope?: { role: string; userId: string };
    limit?: number;
    offset?: number;
  }): Promise<{ orders: Record<string, unknown>[]; total: number }> {
    const conditions: string[] = ["o.tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (opts.roleScope?.role === "waiter") {
      conditions.push(`o.waiter_id = $${paramIdx++}`);
      params.push(opts.roleScope.userId);
    }
    if (opts.dateFrom) { conditions.push(`o.created_at >= $${paramIdx++}`); params.push(opts.dateFrom); }
    if (opts.dateTo) { conditions.push(`o.created_at <= $${paramIdx++}`); params.push(opts.dateTo); }
    if (opts.status) { conditions.push(`o.status = $${paramIdx++}`); params.push(opts.status); }
    if (opts.orderType) { conditions.push(`o.order_type = $${paramIdx++}`); params.push(opts.orderType); }
    if (opts.staffId) { conditions.push(`o.waiter_id = $${paramIdx++}`); params.push(opts.staffId); }
    if (opts.outletId) { conditions.push(`o.outlet_id = $${paramIdx++}`); params.push(opts.outletId); }
    if (opts.q) {
      const sp = `%${opts.q}%`;
      conditions.push(`(o.id ILIKE $${paramIdx} OR o.total::text ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx} OR t.number::text ILIKE $${paramIdx})`);
      params.push(sp);
      paramIdx++;
    }

    const where = conditions.join(" AND ");
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const countRes = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o LEFT JOIN tables t ON t.id = o.table_id LEFT JOIN customers c ON c.id = o.customer_id WHERE ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.total ?? "0");

    const dataRes = await pool.query(
      `SELECT o.id, o.order_type AS channel, o.status, o.payment_method, o.total, o.created_at, o.waiter_id, o.outlet_id,
         t.number AS table_number, u.name AS staff_name,
         (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
         (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.is_voided = true) > 0 AS has_voided_items,
         (SELECT COUNT(*) FROM item_refire_requests rr WHERE rr.order_id = o.id) > 0 AS has_refire,
         b.payment_status, b.id AS bill_id
       FROM orders o
       LEFT JOIN tables t ON t.id = o.table_id
       LEFT JOIN users u ON u.id = o.waiter_id
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN bills b ON b.order_id = o.id
       WHERE ${where}
       ORDER BY o.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );
    return { orders: dataRes.rows, total };
  }

  async getOrderTicketDetail(orderId: string, tenantId: string): Promise<Record<string, unknown> | null> {
    const orderRes = await pool.query(
      `SELECT o.*, t.number AS table_number, u.name AS waiter_name, c.name AS customer_name
       FROM orders o
       LEFT JOIN tables t ON t.id = o.table_id
       LEFT JOIN users u ON u.id = o.waiter_id
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [orderId, tenantId]
    );
    if (!orderRes.rows[0]) return null;

    const itemsRes = await pool.query(
      `SELECT oi.*, oim.spice_level, oim.salt_level, oim.removed_ingredients, oim.has_allergy, oim.allergy_flags, oim.special_notes
       FROM order_items oi LEFT JOIN order_item_modifications oim ON oim.order_item_id = oi.id
       WHERE oi.order_id = $1 ORDER BY oi.course_number ASC, oi.id ASC`,
      [orderId]
    );

    const billRes = await pool.query(
      `SELECT b.*, array_agg(bp.payment_method) AS payment_methods FROM bills b LEFT JOIN bill_payments bp ON bp.bill_id = b.id WHERE b.order_id = $1 GROUP BY b.id ORDER BY b.created_at DESC LIMIT 1`,
      [orderId]
    );

    const voidRes = await pool.query(`SELECT * FROM item_void_requests WHERE order_id = $1 ORDER BY created_at DESC`, [orderId]);
    const refireRes = await pool.query(`SELECT * FROM item_refire_requests WHERE order_id = $1 ORDER BY created_at DESC`, [orderId]);

    return {
      order: orderRes.rows[0],
      items: itemsRes.rows,
      bill: billRes.rows[0] || null,
      voidRequests: voidRes.rows,
      refireRequests: refireRes.rows,
    };
  }

  async getOrderTimeline(orderId: string, tenantId: string): Promise<Array<Record<string, unknown>>> {
    const events: Array<Record<string, unknown>> = [];

    const orderRes = await pool.query(
      `SELECT o.*, t.number AS table_number, u.name AS staff_name FROM orders o LEFT JOIN tables t ON t.id = o.table_id LEFT JOIN users u ON u.id = o.waiter_id WHERE o.id = $1 AND o.tenant_id = $2`,
      [orderId, tenantId]
    );
    if (!orderRes.rows[0]) return events;
    const order = orderRes.rows[0];

    if (order.created_at) events.push({ timestamp: order.created_at, icon: "📋", description: "Order created", performedBy: order.staff_name });
    if (order.kitchen_sent_at) events.push({ timestamp: order.kitchen_sent_at, icon: "🍳", description: "Sent to kitchen" });

    const timeLogsRes = await pool.query(`SELECT * FROM item_time_logs WHERE order_id = $1`, [orderId]);
    for (const tl of timeLogsRes.rows) {
      if (tl.cooking_started_at) events.push({ timestamp: tl.cooking_started_at, icon: "👨‍🍳", description: `Cooking started: ${tl.menu_item_name || "item"}`, performedBy: tl.chef_name });
      if (tl.cooking_ready_at) events.push({ timestamp: tl.cooking_ready_at, icon: "✅", description: `Item ready: ${tl.menu_item_name || "item"}` });
      if (tl.served_at) events.push({ timestamp: tl.served_at, icon: "🍽️", description: `Served: ${tl.menu_item_name || "item"}` });
    }

    const voidRes = await pool.query(`SELECT * FROM item_void_requests WHERE order_id = $1 ORDER BY created_at ASC`, [orderId]);
    for (const vr of voidRes.rows) {
      events.push({ timestamp: vr.created_at, icon: "🚫", description: `Void requested: ${vr.menu_item_name || "item"}`, performedBy: vr.requested_by_name });
      if (vr.status === "approved" && vr.approved_at) events.push({ timestamp: vr.approved_at, icon: "✔️", description: `Void approved: ${vr.menu_item_name || "item"}`, performedBy: vr.approved_by_name });
    }

    const refireRes = await pool.query(`SELECT * FROM item_refire_requests WHERE order_id = $1 ORDER BY created_at ASC`, [orderId]);
    for (const rr of refireRes.rows) {
      events.push({ timestamp: rr.created_at, icon: "🔥", description: `Refire: ${rr.menu_item_name || "item"}`, performedBy: rr.requested_by_name });
    }

    const billRes = await pool.query(`SELECT * FROM bills WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [orderId]);
    if (billRes.rows[0]?.paid_at) events.push({ timestamp: billRes.rows[0].paid_at, icon: "💳", description: `Bill paid — ${billRes.rows[0].payment_method || ""}` });

    const auditRes = await pool.query(`SELECT * FROM audit_events WHERE entity_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`, [orderId, tenantId]);
    for (const ae of auditRes.rows) {
      if (["RECEIPT_REPRINTED", "KOT_REPRINTED", "BILL_REPRINTED"].includes(ae.action)) {
        events.push({ timestamp: ae.created_at, icon: "🖨️", description: `Reprinted: ${ae.action.replace("_REPRINTED", "").toLowerCase()}`, performedBy: ae.user_name });
      }
    }

    events.sort((a, b) => new Date(a.timestamp as string).getTime() - new Date(b.timestamp as string).getTime());
    return events;
  }

  async createVoidRequest(data: InsertItemVoidRequest): Promise<ItemVoidRequest> {
    const [row] = await db.insert(itemVoidRequests).values(data).returning();
    return row;
  }

  async getVoidRequest(id: string, tenantId: string): Promise<ItemVoidRequest | undefined> {
    const [row] = await db.select().from(itemVoidRequests).where(and(eq(itemVoidRequests.id, id), eq(itemVoidRequests.tenantId, tenantId)));
    return row;
  }

  async updateVoidRequest(id: string, tenantId: string, data: {
    status?: string;
    approvedBy?: string | null;
    approvedByName?: string | null;
    approvedAt?: Date | null;
    rejectedReason?: string | null;
  }): Promise<ItemVoidRequest | undefined> {
    const [row] = await db.update(itemVoidRequests).set(data).where(and(eq(itemVoidRequests.id, id), eq(itemVoidRequests.tenantId, tenantId))).returning();
    return row;
  }

  async getPendingVoidRequests(tenantId: string): Promise<ItemVoidRequest[]> {
    return db.select().from(itemVoidRequests).where(and(eq(itemVoidRequests.tenantId, tenantId), eq(itemVoidRequests.status, "pending"))).orderBy(desc(itemVoidRequests.createdAt));
  }

  async createVoidedItem(data: InsertVoidedItem): Promise<VoidedItem> {
    const [row] = await db.insert(voidedItems).values(data).returning();
    return row;
  }

  async getVoidedItemsByOrder(orderId: string): Promise<VoidedItem[]> {
    return db.select().from(voidedItems).where(eq(voidedItems.orderId, orderId));
  }

  async createRefireRequest(data: InsertItemRefireRequest): Promise<ItemRefireRequest> {
    const [row] = await db.insert(itemRefireRequests).values(data).returning();
    return row;
  }

  async getRefireRequestsByOrder(orderId: string): Promise<ItemRefireRequest[]> {
    return db.select().from(itemRefireRequests).where(eq(itemRefireRequests.orderId, orderId)).orderBy(desc(itemRefireRequests.createdAt));
  }

  async updateRefireRequest(id: string, tenantId: string, data: {
    status?: string;
    newOrderItemId?: string | null;
    newKotNumber?: string | null;
  }): Promise<ItemRefireRequest | undefined> {
    const [row] = await db.update(itemRefireRequests).set(data).where(and(eq(itemRefireRequests.id, id), eq(itemRefireRequests.tenantId, tenantId))).returning();
    return row;
  }

  async getAlertDefinitions(tenantId?: string): Promise<AlertDefinition[]> {
    const { rows } = await pool.query(
      `SELECT * FROM alert_definitions WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY alert_code`,
      [tenantId ?? null]
    );
    return rows as AlertDefinition[];
  }

  async getAlertDefinition(code: string, tenantId?: string): Promise<AlertDefinition | undefined> {
    const { rows } = await pool.query(
      `SELECT * FROM alert_definitions WHERE alert_code = $1 AND (tenant_id = $2 OR tenant_id IS NULL) ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END LIMIT 1`,
      [code, tenantId ?? null]
    );
    return rows[0] ? mapRowToCamelCase<AlertDefinition>(rows[0]) : undefined;
  }

  async createAlertEvent(data: InsertAlertEvent): Promise<AlertEvent> {
    const [row] = await db.insert(alertEvents).values(data).returning();
    return row;
  }

  async getAlertEvents(tenantId: string, outletId?: string, opts?: { hours?: number }): Promise<AlertEvent[]> {
    const hours = opts?.hours ?? 4;
    const { rows } = await pool.query(
      outletId
        ? `SELECT * FROM alert_events WHERE tenant_id = $1 AND outlet_id = $2 AND created_at > NOW() - INTERVAL '${hours} hours' ORDER BY created_at DESC`
        : `SELECT * FROM alert_events WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '${hours} hours' ORDER BY created_at DESC`,
      outletId ? [tenantId, outletId] : [tenantId]
    );
    return mapRowsToCamelCase<AlertEvent>(rows);
  }

  async resolveAlertEvent(id: string, tenantId: string, data: { acknowledgedBy: string }): Promise<AlertEvent | undefined> {
    const [row] = await db.update(alertEvents).set({ isResolved: true, acknowledgedBy: data.acknowledgedBy, acknowledgedAt: new Date() }).where(and(eq(alertEvents.id, id), eq(alertEvents.tenantId, tenantId))).returning();
    return row;
  }

  async getUnresolvedAlertEvents(tenantId: string, outletId?: string): Promise<AlertEvent[]> {
    const { rows } = await pool.query(
      outletId
        ? `SELECT * FROM alert_events WHERE tenant_id = $1 AND outlet_id = $2 AND is_resolved = false ORDER BY created_at DESC`
        : `SELECT * FROM alert_events WHERE tenant_id = $1 AND is_resolved = false ORDER BY created_at DESC`,
      outletId ? [tenantId, outletId] : [tenantId]
    );
    return mapRowsToCamelCase<AlertEvent>(rows);
  }

  async getAlertOutletConfigs(tenantId: string, outletId: string): Promise<AlertOutletConfig[]> {
    const { rows } = await pool.query(
      `SELECT * FROM alert_outlet_configs WHERE tenant_id = $1 AND outlet_id = $2`,
      [tenantId, outletId]
    );
    return rows as AlertOutletConfig[];
  }

  async upsertAlertOutletConfig(data: { tenantId: string; outletId: string; alertCode: string; isEnabled?: boolean; volumeLevel?: number }): Promise<AlertOutletConfig> {
    const { rows } = await pool.query(
      `INSERT INTO alert_outlet_configs (tenant_id, outlet_id, alert_code, is_enabled, volume_level, updated_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (tenant_id, outlet_id, alert_code) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         volume_level = EXCLUDED.volume_level,
         updated_at = now()
       RETURNING *`,
      [data.tenantId, data.outletId, data.alertCode, data.isEnabled ?? true, data.volumeLevel ?? 80]
    );
    return mapRowToCamelCase<AlertOutletConfig>(rows[0]);
  }

  // ── Task #118: Cash Machine ────────────────────────────────────────────

  async createCashSession(data: InsertCashSession): Promise<CashSession> {
    const { rows } = await pool.query(
      `INSERT INTO cash_sessions (
         tenant_id, outlet_id, pos_session_id, session_number, cashier_id, cashier_name,
         currency_code, currency_symbol, status, opening_float, opening_float_breakdown,
         expected_closing_cash, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        data.tenantId, data.outletId || null, data.posSessionId || null, data.sessionNumber,
        data.cashierId, data.cashierName || null, data.currencyCode || 'INR',
        data.currencySymbol || '₹', data.status || 'open', data.openingFloat || '0',
        data.openingFloatBreakdown ? JSON.stringify(data.openingFloatBreakdown) : null,
        data.expectedClosingCash || '0', data.notes || null,
      ]
    );
    return mapCashSessionRow(rows[0]) as CashSession;
  }


  async getCashSession(id: string): Promise<CashSession | undefined> {
    const { rows } = await pool.query(`SELECT * FROM cash_sessions WHERE id = $1`, [id]);
    return mapCashSessionRow(rows[0]) as CashSession | undefined;
  }

  async getActiveCashSession(tenantId: string, cashierId: string): Promise<CashSession | undefined> {
    const { rows } = await pool.query(
      `SELECT * FROM cash_sessions WHERE tenant_id = $1 AND cashier_id = $2 AND status = 'open' LIMIT 1`,
      [tenantId, cashierId]
    );
    return mapCashSessionRow(rows[0]) as CashSession | undefined;
  }

  async updateCashSession(id: string, data: Partial<InsertCashSession>): Promise<CashSession | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    const colMap: Record<string, string> = {
      status: 'status',
      physicalClosingCash: 'physical_closing_cash',
      closingBreakdown: 'closing_breakdown',
      cashVariance: 'cash_variance',
      varianceReason: 'variance_reason',
      expectedClosingCash: 'expected_closing_cash',
      closedAt: 'closed_at',
      approvedBy: 'approved_by',
      approvedAt: 'approved_at',
      notes: 'notes',
    };

    for (const [key, col] of Object.entries(colMap)) {
      if (key in data) {
        const val = (data as any)[key];
        if (key === 'closingBreakdown' && val && typeof val === 'object' && !Array.isArray(val)) {
          fields.push(`${col} = $${i++}`);
          values.push(JSON.stringify(val));
        } else {
          fields.push(`${col} = $${i++}`);
          values.push(val);
        }
      }
    }

    if (fields.length === 0) {
      const { rows } = await pool.query(`SELECT * FROM cash_sessions WHERE id = $1`, [id]);
      return mapCashSessionRow(rows[0]) as CashSession;
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE cash_sessions SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    return mapCashSessionRow(rows[0]) as CashSession | undefined;
  }

  async getCashSessions(tenantId: string, opts?: { status?: string; date?: string; cashierId?: string }): Promise<CashSession[]> {
    const conditions = [`tenant_id = $1`];
    const values: any[] = [tenantId];
    let i = 2;

    if (opts?.status) {
      conditions.push(`status = $${i++}`);
      values.push(opts.status);
    }
    if (opts?.cashierId) {
      conditions.push(`cashier_id = $${i++}`);
      values.push(opts.cashierId);
    }
    if (opts?.date) {
      conditions.push(`opened_at::date = $${i++}`);
      values.push(opts.date);
    }

    const { rows } = await pool.query(
      `SELECT * FROM cash_sessions WHERE ${conditions.join(' AND ')} ORDER BY opened_at DESC`,
      values
    );
    return rows.map(mapCashSessionRow) as CashSession[];
  }

  async createCashDrawerEvent(data: InsertCashDrawerEvent): Promise<CashDrawerEvent> {
    const { rows } = await pool.query(
      `INSERT INTO cash_drawer_events (
         tenant_id, outlet_id, session_id, event_type, order_id, bill_id, reference_number,
         amount, tendered_amount, change_given, change_breakdown, running_balance,
         performed_by, performed_by_name, reason, is_manual
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        data.tenantId, data.outletId || null, data.sessionId, data.eventType,
        data.orderId || null, data.billId || null, data.referenceNumber || null,
        data.amount || null, data.tenderedAmount || null, data.changeGiven || null,
        data.changeBreakdown ? JSON.stringify(data.changeBreakdown) : null,
        data.runningBalance || null, data.performedBy, data.performedByName || null,
        data.reason || null, data.isManual ?? false,
      ]
    );
    return mapRowToCamelCase<CashDrawerEvent>(rows[0]);
  }

  async getCashDrawerEvents(sessionId: string): Promise<CashDrawerEvent[]> {
    const { rows } = await pool.query(
      `SELECT * FROM cash_drawer_events WHERE session_id = $1 ORDER BY created_at DESC`,
      [sessionId]
    );
    return mapRowsToCamelCase<CashDrawerEvent>(rows);
  }

  async createCashPayout(data: InsertCashPayout): Promise<CashPayout> {
    const { rows } = await pool.query(
      `INSERT INTO cash_payouts (
         tenant_id, outlet_id, session_id, payout_number, payout_type, amount,
         recipient, reason, approved_by, performed_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        data.tenantId, data.outletId || null, data.sessionId, data.payoutNumber || null,
        data.payoutType, data.amount, data.recipient || null, data.reason,
        data.approvedBy || null, data.performedBy,
      ]
    );
    return mapRowToCamelCase<CashPayout>(rows[0]);
  }

  async getCashPayouts(sessionId: string): Promise<CashPayout[]> {
    const { rows } = await pool.query(
      `SELECT * FROM cash_payouts WHERE session_id = $1 ORDER BY created_at DESC`,
      [sessionId]
    );
    return mapRowsToCamelCase<CashPayout>(rows);
  }

  async createCashHandover(data: InsertCashHandover): Promise<CashHandover> {
    const { rows } = await pool.query(
      `INSERT INTO cash_handovers (
         tenant_id, outlet_id, session_id, handover_number, amount_handed_over,
         denomination_breakdown, handed_by, handed_by_name, received_by, received_by_name, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        data.tenantId, data.outletId || null, data.sessionId, data.handoverNumber || null,
        data.amountHandedOver,
        data.denominationBreakdown ? JSON.stringify(data.denominationBreakdown) : null,
        data.handedBy, data.handedByName || null, data.receivedBy || null,
        data.receivedByName || null, data.notes || null,
      ]
    );
    return mapRowToCamelCase<CashHandover>(rows[0]);
  }

  async getCashHandovers(sessionId: string): Promise<CashHandover[]> {
    const { rows } = await pool.query(
      `SELECT * FROM cash_handovers WHERE session_id = $1 ORDER BY created_at DESC`,
      [sessionId]
    );
    return mapRowsToCamelCase<CashHandover>(rows);
  }

  async getOutletCurrencySettings(outletId: string): Promise<Record<string, any> | undefined> {
    const { rows } = await pool.query(
      `SELECT id, currency_code, currency_symbol, currency_name, currency_position, decimal_places, denomination_config, cash_rounding
       FROM outlets WHERE id = $1`,
      [outletId]
    );
    return mapRowToCamelCase(rows[0]);
  }

  async updateOutletCurrencySettings(outletId: string, data: Record<string, any>): Promise<Record<string, any>> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    const colMap: Record<string, string> = {
      currencyCode: 'currency_code',
      currencySymbol: 'currency_symbol',
      currencyName: 'currency_name',
      currencyPosition: 'currency_position',
      decimalPlaces: 'decimal_places',
      denominationConfig: 'denomination_config',
      cashRounding: 'cash_rounding',
    };

    for (const [key, col] of Object.entries(colMap)) {
      if (key in data && data[key] !== undefined) {
        if (key === 'denominationConfig' && data[key] && typeof data[key] === 'object') {
          fields.push(`${col} = $${i++}`);
          values.push(JSON.stringify(data[key]));
        } else {
          fields.push(`${col} = $${i++}`);
          values.push(data[key]);
        }
      }
    }

    if (fields.length === 0) {
      const { rows } = await pool.query(`SELECT * FROM outlets WHERE id = $1`, [outletId]);
      return mapRowToCamelCase(rows[0]);
    }

    values.push(outletId);
    const { rows } = await pool.query(
      `UPDATE outlets SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, currency_code, currency_symbol, currency_name, currency_position, decimal_places, denomination_config, cash_rounding`,
      values
    );
    return mapRowToCamelCase(rows[0]);
  }

  async getOutletTipSettings(outletId: string, tenantId: string): Promise<OutletTipSettings | null> {
    const { rows } = await pool.query(
      `SELECT * FROM outlet_tip_settings WHERE outlet_id = $1 AND tenant_id = $2 LIMIT 1`,
      [outletId, tenantId]
    );
    return rows[0] ? mapRowToCamelCase(rows[0]) : null;
  }

  async upsertOutletTipSettings(data: Record<string, any>): Promise<OutletTipSettings> {
    const { rows } = await pool.query(`
      INSERT INTO outlet_tip_settings (
        tenant_id, outlet_id, tips_enabled, show_on_pos, show_on_qr, show_on_receipt,
        prompt_style, suggested_pct_1, suggested_pct_2, suggested_pct_3, allow_custom_amount,
        tip_basis, distribution_method, waiter_share_pct, kitchen_share_pct,
        tip_is_taxable, currency_code, currency_symbol, updated_by, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
      ON CONFLICT (tenant_id, outlet_id) DO UPDATE SET
        tips_enabled = EXCLUDED.tips_enabled,
        show_on_pos = EXCLUDED.show_on_pos,
        show_on_qr = EXCLUDED.show_on_qr,
        show_on_receipt = EXCLUDED.show_on_receipt,
        prompt_style = EXCLUDED.prompt_style,
        suggested_pct_1 = EXCLUDED.suggested_pct_1,
        suggested_pct_2 = EXCLUDED.suggested_pct_2,
        suggested_pct_3 = EXCLUDED.suggested_pct_3,
        allow_custom_amount = EXCLUDED.allow_custom_amount,
        tip_basis = EXCLUDED.tip_basis,
        distribution_method = EXCLUDED.distribution_method,
        waiter_share_pct = EXCLUDED.waiter_share_pct,
        kitchen_share_pct = EXCLUDED.kitchen_share_pct,
        tip_is_taxable = EXCLUDED.tip_is_taxable,
        currency_code = EXCLUDED.currency_code,
        currency_symbol = EXCLUDED.currency_symbol,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *
    `, [
      data.tenantId, data.outletId,
      data.tipsEnabled ?? false, data.showOnPos ?? true, data.showOnQr ?? false, data.showOnReceipt ?? true,
      data.promptStyle || "BUTTONS",
      data.suggestedPct1 ?? 5, data.suggestedPct2 ?? 10, data.suggestedPct3 ?? 15,
      data.allowCustomAmount ?? true, data.tipBasis || "SUBTOTAL",
      data.distributionMethod || "INDIVIDUAL",
      data.waiterSharePct ?? 70, data.kitchenSharePct ?? 30,
      data.tipIsTaxable ?? false, data.currencyCode || "INR", data.currencySymbol || "₹",
      data.updatedBy || null,
    ]);
    return mapRowToCamelCase(rows[0]);
  }

  async getBillTip(billId: string): Promise<BillTip | null> {
    const { rows } = await pool.query(
      `SELECT * FROM bill_tips WHERE bill_id = $1 LIMIT 1`,
      [billId]
    );
    return rows[0] ? mapRowToCamelCase(rows[0]) : null;
  }

  async getTipReport(tenantId: string, outletId: string | undefined, date: string): Promise<Record<string, any>> {
    const baseParams: any[] = [tenantId, date];
    let outletFilter = "";
    if (outletId) {
      baseParams.push(outletId);
      outletFilter = `AND outlet_id = $${baseParams.length}`;
    }
    const summaryRes = await pool.query(`
      SELECT COALESCE(SUM(tip_amount), 0) AS total_tips, COUNT(*) AS total_transactions,
             COALESCE(AVG(tip_amount), 0) AS avg_tip_per_bill
      FROM bill_tips WHERE tenant_id = $1 AND DATE(created_at) = $2 ${outletFilter}
    `, baseParams);
    const byMethodRes = await pool.query(`
      SELECT payment_method, SUM(tip_amount) AS total
      FROM bill_tips WHERE tenant_id = $1 AND DATE(created_at) = $2 ${outletFilter}
      GROUP BY payment_method
    `, baseParams);
    const byWaiterRes = await pool.query(`
      SELECT waiter_id, waiter_name, SUM(tip_amount) AS total_tips, COUNT(*) AS count
      FROM bill_tips WHERE tenant_id = $1 AND DATE(created_at) = $2 ${outletFilter}
      GROUP BY waiter_id, waiter_name ORDER BY total_tips DESC
    `, baseParams);
    const byHourRes = await pool.query(`
      SELECT EXTRACT(HOUR FROM created_at)::int AS hour, SUM(tip_amount) AS tips
      FROM bill_tips WHERE tenant_id = $1 AND DATE(created_at) = $2 ${outletFilter}
      GROUP BY hour ORDER BY hour
    `, baseParams);
    const recentRes = await pool.query(`
      SELECT bill_id, tip_amount AS amount, waiter_name, created_at AS time
      FROM bill_tips WHERE tenant_id = $1 AND DATE(created_at) = $2 ${outletFilter}
      ORDER BY created_at DESC LIMIT 20
    `, baseParams);
    const s = summaryRes.rows[0];
    const byMethod: Record<string, number> = {};
    for (const r of byMethodRes.rows) { byMethod[r.payment_method || "CASH"] = Number(r.total); }
    return {
      totalTips: Number(s.total_tips),
      totalTransactions: Number(s.total_transactions),
      avgTipPerBill: Number(s.avg_tip_per_bill),
      byMethod,
      byWaiter: byWaiterRes.rows.map(r => ({ waiterId: r.waiter_id, waiterName: r.waiter_name, totalTips: Number(r.total_tips), count: Number(r.count) })),
      byHour: byHourRes.rows.map(r => ({ hour: r.hour, tips: Number(r.tips) })),
      recentTips: recentRes.rows.map(r => ({ billId: r.bill_id, amount: Number(r.amount), waiterName: r.waiter_name, time: r.time })),
    };
  }

  async getMyTips(tenantId: string, staffId: string): Promise<Record<string, any>> {
    const todayRes = await pool.query(`
      SELECT COALESCE(SUM(share_amount), 0) AS total, COUNT(*) AS count
      FROM tip_distributions WHERE tenant_id = $1 AND staff_id = $2 AND distribution_date = CURRENT_DATE
    `, [tenantId, staffId]);
    const weekRes = await pool.query(`
      SELECT COALESCE(SUM(share_amount), 0) AS total
      FROM tip_distributions WHERE tenant_id = $1 AND staff_id = $2
        AND distribution_date >= CURRENT_DATE - INTERVAL '7 days'
    `, [tenantId, staffId]);
    const monthRes = await pool.query(`
      SELECT COALESCE(SUM(share_amount), 0) AS total
      FROM tip_distributions WHERE tenant_id = $1 AND staff_id = $2
        AND distribution_date >= DATE_TRUNC('month', CURRENT_DATE)
    `, [tenantId, staffId]);
    const recentRes = await pool.query(`
      SELECT td.share_amount AS amount, bt.bill_id AS bill_ref, td.created_at AS time, td.is_paid
      FROM tip_distributions td JOIN bill_tips bt ON bt.id = td.bill_tip_id
      WHERE td.tenant_id = $1 AND td.staff_id = $2
      ORDER BY td.created_at DESC LIMIT 20
    `, [tenantId, staffId]);
    return {
      todayTotal: Number(todayRes.rows[0].total),
      todayCount: Number(todayRes.rows[0].count),
      weekTotal: Number(weekRes.rows[0].total),
      monthTotal: Number(monthRes.rows[0].total),
      recentTips: recentRes.rows.map(r => ({ amount: Number(r.amount), billRef: r.bill_ref, time: r.time, isPaid: r.is_paid })),
    };
  }

  async getTipDistributions(tenantId: string, filters: { staffId?: string; date?: string; isPaid?: boolean }): Promise<TipDistribution[]> {
    const conditions: string[] = [`td.tenant_id = $1`];
    const values: any[] = [tenantId];
    let i = 2;
    if (filters.staffId) { conditions.push(`td.staff_id = $${i++}`); values.push(filters.staffId); }
    if (filters.date) { conditions.push(`td.distribution_date = $${i++}`); values.push(filters.date); }
    if (filters.isPaid !== undefined) { conditions.push(`td.is_paid = $${i++}`); values.push(filters.isPaid); }
    const { rows } = await pool.query(`
      SELECT td.* FROM tip_distributions td
      WHERE ${conditions.join(" AND ")}
      ORDER BY td.created_at DESC LIMIT 200
    `, values);
    return rows;
  }

  async markTipDistributionPaid(id: string, tenantId: string): Promise<TipDistribution | null> {
    const { rows } = await pool.query(
      `UPDATE tip_distributions SET is_paid = true, paid_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId]
    );
    return rows[0] ? mapRowToCamelCase(rows[0]) : null;
  }

  async getOutletPackingSettings(outletId: string, tenantId: string): Promise<OutletPackingSettings | null> {
    const [row] = await db.select().from(outletPackingSettings)
      .where(and(eq(outletPackingSettings.outletId, outletId), eq(outletPackingSettings.tenantId, tenantId)));
    return row || null;
  }

  async upsertOutletPackingSettings(data: Record<string, any>): Promise<OutletPackingSettings> {
    const { rows } = await pool.query(`
      INSERT INTO outlet_packing_settings (
        tenant_id, outlet_id, takeaway_charge_enabled, delivery_charge_enabled,
        charge_type, takeaway_charge_amount, delivery_charge_amount,
        takeaway_per_item, delivery_per_item, max_charge_per_order,
        packing_charge_taxable, packing_charge_tax_pct, show_on_receipt,
        charge_label, currency_code, currency_symbol, updated_by, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
      ON CONFLICT (tenant_id, outlet_id) DO UPDATE SET
        takeaway_charge_enabled = EXCLUDED.takeaway_charge_enabled,
        delivery_charge_enabled = EXCLUDED.delivery_charge_enabled,
        charge_type = EXCLUDED.charge_type,
        takeaway_charge_amount = EXCLUDED.takeaway_charge_amount,
        delivery_charge_amount = EXCLUDED.delivery_charge_amount,
        takeaway_per_item = EXCLUDED.takeaway_per_item,
        delivery_per_item = EXCLUDED.delivery_per_item,
        max_charge_per_order = EXCLUDED.max_charge_per_order,
        packing_charge_taxable = EXCLUDED.packing_charge_taxable,
        packing_charge_tax_pct = EXCLUDED.packing_charge_tax_pct,
        show_on_receipt = EXCLUDED.show_on_receipt,
        charge_label = EXCLUDED.charge_label,
        currency_code = EXCLUDED.currency_code,
        currency_symbol = EXCLUDED.currency_symbol,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *
    `, [
      data.tenantId, data.outletId,
      data.takeawayChargeEnabled ?? false,
      data.deliveryChargeEnabled ?? false,
      data.chargeType ?? 'FIXED_PER_ORDER',
      data.takeawayChargeAmount ?? 0,
      data.deliveryChargeAmount ?? 0,
      data.takeawayPerItem ?? 0,
      data.deliveryPerItem ?? 0,
      data.maxChargePerOrder ?? null,
      data.packingChargeTaxable ?? false,
      data.packingChargeTaxPct ?? 0,
      data.showOnReceipt ?? true,
      data.chargeLabel ?? 'Packing Charge',
      data.currencyCode ?? 'INR',
      data.currencySymbol ?? '₹',
      data.updatedBy ?? null,
    ]);
    return mapRowToCamelCase(rows[0]);
  }

  async getPackingCategories(outletId: string, tenantId: string): Promise<PackingChargeCategory[]> {
    const rows = await db.select().from(packingChargeCategories)
      .where(and(eq(packingChargeCategories.outletId, outletId), eq(packingChargeCategories.tenantId, tenantId)));
    return rows;
  }

  async createPackingCategory(data: InsertPackingChargeCategory): Promise<PackingChargeCategory> {
    const [row] = await db.insert(packingChargeCategories).values(data).returning();
    return row;
  }

  async updatePackingCategory(id: string, tenantId: string, data: Partial<InsertPackingChargeCategory>): Promise<PackingChargeCategory | null> {
    const [row] = await db.update(packingChargeCategories)
      .set(data)
      .where(and(eq(packingChargeCategories.id, id), eq(packingChargeCategories.tenantId, tenantId)))
      .returning();
    return row || null;
  }

  async deletePackingCategory(id: string, tenantId: string): Promise<void> {
    await db.delete(packingChargeCategories)
      .where(and(eq(packingChargeCategories.id, id), eq(packingChargeCategories.tenantId, tenantId)));
  }

  async getPackingExemptions(outletId: string, tenantId: string): Promise<PackingChargeExemption[]> {
    const rows = await db.select().from(packingChargeExemptions)
      .where(and(eq(packingChargeExemptions.outletId, outletId), eq(packingChargeExemptions.tenantId, tenantId)));
    return rows;
  }

  async createPackingExemption(data: InsertPackingChargeExemption): Promise<PackingChargeExemption> {
    const [row] = await db.insert(packingChargeExemptions).values(data).returning();
    return row;
  }

  async deletePackingExemption(id: string, tenantId: string): Promise<void> {
    await db.delete(packingChargeExemptions)
      .where(and(eq(packingChargeExemptions.id, id), eq(packingChargeExemptions.tenantId, tenantId)));
  }

  async createBillPackingCharge(data: InsertBillPackingCharge): Promise<BillPackingCharge> {
    const [row] = await db.insert(billPackingCharges).values(data).returning();
    return row;
  }

  async getBillPackingCharge(billId: string): Promise<BillPackingCharge | null> {
    const [row] = await db.select().from(billPackingCharges).where(eq(billPackingCharges.billId, billId));
    return row || null;
  }

  async createInAppSupportTicket(data: InsertInAppSupportTicket): Promise<InAppSupportTicket> {
    const { rows } = await pool.query(`
      INSERT INTO in_app_support_tickets (tenant_id, created_by, created_by_name, subject, description, category, priority, status, page_context, browser_info, tenant_plan)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9, $10)
      RETURNING *
    `, [data.tenantId, data.createdBy, data.createdByName, data.subject, data.description, data.category, data.priority, data.pageContext, data.browserInfo, data.tenantPlan]);
    return mapRowToCamelCase(rows[0]);
  }

  async getInAppSupportTicket(id: string): Promise<InAppSupportTicket | null> {
    const { rows } = await pool.query(`SELECT * FROM in_app_support_tickets WHERE id = $1`, [id]);
    return rows[0] ? mapRowToCamelCase(rows[0]) : null;
  }

  async getInAppSupportTickets(tenantId: string): Promise<InAppSupportTicket[]> {
    const { rows } = await pool.query(`
      SELECT t.*,
        (SELECT message FROM in_app_support_ticket_replies r WHERE r.ticket_id = t.id ORDER BY r.created_at DESC LIMIT 1) AS latest_reply_preview,
        (SELECT is_admin FROM in_app_support_ticket_replies r WHERE r.ticket_id = t.id ORDER BY r.created_at DESC LIMIT 1) AS latest_reply_is_admin
      FROM in_app_support_tickets t
      WHERE t.tenant_id = $1
      ORDER BY t.created_at DESC
    `, [tenantId]);
    return rows;
  }

  async updateInAppSupportTicket(id: string, data: Partial<InAppSupportTicket>): Promise<InAppSupportTicket | null> {
    const setClauses: string[] = ["updated_at = NOW()"];
    const values: any[] = [];
    let i = 1;
    if (data.status !== undefined) { setClauses.push(`status = $${i++}`); values.push(data.status); }
    if (data.priority !== undefined) { setClauses.push(`priority = $${i++}`); values.push(data.priority); }
    if (data.assignedTo !== undefined) { setClauses.push(`assigned_to = $${i++}`); values.push(data.assignedTo); }
    if (data.resolvedAt !== undefined) { setClauses.push(`resolved_at = $${i++}`); values.push(data.resolvedAt); }
    if (data.lastRepliedAt !== undefined) { setClauses.push(`last_replied_at = $${i++}`); values.push(data.lastRepliedAt); }
    if (data.replyCount !== undefined) { setClauses.push(`reply_count = $${i++}`); values.push(data.replyCount); }
    values.push(id);
    const { rows } = await pool.query(`UPDATE in_app_support_tickets SET ${setClauses.join(", ")} WHERE id = $${i} RETURNING *`, values);
    return rows[0] ? mapRowToCamelCase(rows[0]) : null;
  }

  async createInAppSupportTicketReply(data: InsertInAppSupportTicketReply): Promise<InAppSupportTicketReply> {
    const { rows } = await pool.query(`
      INSERT INTO in_app_support_ticket_replies (ticket_id, tenant_id, author_id, author_name, is_admin, message)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [data.ticketId, data.tenantId, data.authorId, data.authorName, data.isAdmin ?? false, data.message]);
    return mapRowToCamelCase(rows[0]);
  }

  async getInAppSupportTicketReplies(ticketId: string): Promise<InAppSupportTicketReply[]> {
    const { rows } = await pool.query(`
      SELECT * FROM in_app_support_ticket_replies WHERE ticket_id = $1 ORDER BY created_at ASC
    `, [ticketId]);
    return rows;
  }

  async getAllInAppSupportTickets(filters: { status?: string; priority?: string; category?: string; tenantId?: string; assignedTo?: string; dateFrom?: string }): Promise<any[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (filters.status) { conditions.push(`t.status = $${i++}`); values.push(filters.status); }
    if (filters.priority) { conditions.push(`t.priority = $${i++}`); values.push(filters.priority); }
    if (filters.category) { conditions.push(`t.category = $${i++}`); values.push(filters.category); }
    if (filters.tenantId) { conditions.push(`t.tenant_id = $${i++}`); values.push(filters.tenantId); }
    if (filters.assignedTo) { conditions.push(`t.assigned_to = $${i++}`); values.push(filters.assignedTo); }
    if (filters.dateFrom) { conditions.push(`t.created_at >= $${i++}`); values.push(filters.dateFrom); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(`
      SELECT t.*, tn.name AS tenant_name, tn.plan AS tenant_plan_name,
        u.name AS assigned_to_name
      FROM in_app_support_tickets t
      LEFT JOIN tenants tn ON tn.id = t.tenant_id
      LEFT JOIN users u ON u.id = t.assigned_to
      ${where}
      ORDER BY t.created_at DESC
      LIMIT 500
    `, values);
    return rows;
  }

  async getInAppSupportStats(): Promise<{ open: number; in_progress: number; replied: number; resolved: number; closed: number; awaiting_support: number; avgResponseTime: number | null; byCategory: Record<string, number> }> {
    const { rows: statusRows } = await pool.query(`
      SELECT status, COUNT(*) AS count FROM in_app_support_tickets GROUP BY status
    `);
    const { rows: catRows } = await pool.query(`
      SELECT category, COUNT(*) AS count FROM in_app_support_tickets GROUP BY category
    `);
    const { rows: avgRows } = await pool.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (r.created_at - t.created_at)) / 60)::float AS avg_minutes
      FROM in_app_support_tickets t
      JOIN in_app_support_ticket_replies r ON r.ticket_id = t.id AND r.is_admin = true
      WHERE r.created_at = (
        SELECT MIN(r2.created_at) FROM in_app_support_ticket_replies r2
        WHERE r2.ticket_id = t.id AND r2.is_admin = true
      )
    `);
    const statusMap: Record<string, number> = {};
    for (const r of statusRows) statusMap[r.status] = Number(r.count);
    const byCategory: Record<string, number> = {};
    for (const r of catRows) byCategory[r.category] = Number(r.count);
    const avgResponseTime = avgRows[0]?.avg_minutes ? Number(avgRows[0].avg_minutes) : null;
    return {
      open: statusMap["open"] ?? 0,
      in_progress: statusMap["in_progress"] ?? 0,
      replied: statusMap["replied"] ?? 0,
      resolved: statusMap["resolved"] ?? 0,
      closed: statusMap["closed"] ?? 0,
      awaiting_support: statusMap["awaiting_support"] ?? 0,
      avgResponseTime: avgRows[0]?.avg_minutes ? Number(avgRows[0].avg_minutes) : null,
      byCategory,
    };
  }

  // Task #132: Special Resources implementation
  async getSpecialResourcesByOutlet(tenantId: string, outletId: string): Promise<SpecialResource[]> {
    const { rows } = await pool.query(
      `SELECT * FROM special_resources WHERE tenant_id = $1 AND outlet_id = $2 AND is_active = true ORDER BY resource_name ASC`,
      [tenantId, outletId]
    );
    return rows.map((r: any) => ({
      id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id,
      resourceCode: r.resource_code, resourceName: r.resource_name, resourceIcon: r.resource_icon,
      totalUnits: r.total_units, availableUnits: r.available_units, inUseUnits: r.in_use_units,
      underCleaningUnits: r.under_cleaning_units, damagedUnits: r.damaged_units,
      isTrackable: r.is_trackable, requiresSetupTime: r.requires_setup_time,
      notes: r.notes, isActive: r.is_active, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async createSpecialResource(data: InsertSpecialResource): Promise<SpecialResource> {
    const totalUnits = data.totalUnits ?? 0;
    const { rows } = await pool.query(
      `INSERT INTO special_resources (tenant_id, outlet_id, resource_code, resource_name, resource_icon, total_units, available_units, in_use_units, under_cleaning_units, damaged_units, is_trackable, requires_setup_time, notes, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,0,$8,$9,$10,true) RETURNING *`,
      [data.tenantId, data.outletId, data.resourceCode, data.resourceName, data.resourceIcon ?? "🪑",
       totalUnits, totalUnits, data.isTrackable ?? true, data.requiresSetupTime ?? 0, data.notes ?? null]
    );
    const r = rows[0];
    return { id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, resourceCode: r.resource_code, resourceName: r.resource_name, resourceIcon: r.resource_icon, totalUnits: r.total_units, availableUnits: r.available_units, inUseUnits: r.in_use_units, underCleaningUnits: r.under_cleaning_units, damagedUnits: r.damaged_units, isTrackable: r.is_trackable, requiresSetupTime: r.requires_setup_time, notes: r.notes, isActive: r.is_active, createdAt: r.created_at, updatedAt: r.updated_at };
  }

  async updateSpecialResource(id: string, tenantId: string, data: Partial<InsertSpecialResource>): Promise<SpecialResource | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (data.resourceName !== undefined) { fields.push(`resource_name = $${idx++}`); vals.push(data.resourceName); }
    if (data.resourceIcon !== undefined) { fields.push(`resource_icon = $${idx++}`); vals.push(data.resourceIcon); }
    if (data.totalUnits !== undefined) { fields.push(`total_units = $${idx++}`); vals.push(data.totalUnits); }
    if (data.isTrackable !== undefined) { fields.push(`is_trackable = $${idx++}`); vals.push(data.isTrackable); }
    if (data.requiresSetupTime !== undefined) { fields.push(`requires_setup_time = $${idx++}`); vals.push(data.requiresSetupTime); }
    if (data.notes !== undefined) { fields.push(`notes = $${idx++}`); vals.push(data.notes); }
    if (data.isActive !== undefined) { fields.push(`is_active = $${idx++}`); vals.push(data.isActive); }
    if (data.availableUnits !== undefined) { fields.push(`available_units = $${idx++}`); vals.push(data.availableUnits); }
    if (data.damagedUnits !== undefined) { fields.push(`damaged_units = $${idx++}`); vals.push(data.damagedUnits); }
    if (fields.length === 0) return undefined;
    fields.push(`updated_at = NOW()`);
    vals.push(id); vals.push(tenantId);
    const { rows } = await pool.query(
      `UPDATE special_resources SET ${fields.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
      vals
    );
    if (!rows[0]) return undefined;
    const r = rows[0];
    return { id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, resourceCode: r.resource_code, resourceName: r.resource_name, resourceIcon: r.resource_icon, totalUnits: r.total_units, availableUnits: r.available_units, inUseUnits: r.in_use_units, underCleaningUnits: r.under_cleaning_units, damagedUnits: r.damaged_units, isTrackable: r.is_trackable, requiresSetupTime: r.requires_setup_time, notes: r.notes, isActive: r.is_active, createdAt: r.created_at, updatedAt: r.updated_at };
  }

  async deleteSpecialResource(id: string, tenantId: string): Promise<void> {
    await pool.query(`UPDATE special_resources SET is_active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  }

  async getResourceUnitsByResource(resourceId: string, tenantId?: string): Promise<ResourceUnit[]> {
    const tenantFilter = tenantId ? " AND tenant_id = $2" : "";
    const params = tenantId ? [resourceId, tenantId] : [resourceId];
    const { rows } = await pool.query(`SELECT * FROM resource_units WHERE resource_id = $1${tenantFilter} ORDER BY unit_code ASC`, params);
    return rows.map((r: any) => ({ id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, resourceId: r.resource_id, unitCode: r.unit_code, unitName: r.unit_name, status: r.status, currentTableId: r.current_table_id, currentOrderId: r.current_order_id, lastCleanedAt: r.last_cleaned_at, notes: r.notes, createdAt: r.created_at }));
  }

  async createResourceUnit(data: InsertResourceUnit): Promise<ResourceUnit> {
    const { rows } = await pool.query(
      `INSERT INTO resource_units (tenant_id, outlet_id, resource_id, unit_code, unit_name, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [data.tenantId, data.outletId, data.resourceId, data.unitCode, data.unitName ?? null, data.status ?? "available", data.notes ?? null]
    );
    const r = rows[0];
    return { id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, resourceId: r.resource_id, unitCode: r.unit_code, unitName: r.unit_name, status: r.status, currentTableId: r.current_table_id, currentOrderId: r.current_order_id, lastCleanedAt: r.last_cleaned_at, notes: r.notes, createdAt: r.created_at };
  }

  async updateResourceUnit(id: string, data: Partial<InsertResourceUnit>, tenantId?: string): Promise<ResourceUnit | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (data.status !== undefined) { fields.push(`status = $${idx++}`); vals.push(data.status); }
    if (data.notes !== undefined) { fields.push(`notes = $${idx++}`); vals.push(data.notes); }
    if (data.currentTableId !== undefined) { fields.push(`current_table_id = $${idx++}`); vals.push(data.currentTableId); }
    if (data.lastCleanedAt !== undefined) { fields.push(`last_cleaned_at = $${idx++}`); vals.push(data.lastCleanedAt); }
    if (fields.length === 0) return undefined;
    vals.push(id);
    const tenantFilter = tenantId ? ` AND tenant_id = $${idx + 1}` : "";
    if (tenantId) vals.push(tenantId);
    const { rows } = await pool.query(
      `UPDATE resource_units SET ${fields.join(", ")} WHERE id = $${idx}${tenantFilter} RETURNING *`,
      vals
    );
    if (!rows[0]) return undefined;
    const r = rows[0];
    return { id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, resourceId: r.resource_id, unitCode: r.unit_code, unitName: r.unit_name, status: r.status, currentTableId: r.current_table_id, currentOrderId: r.current_order_id, lastCleanedAt: r.last_cleaned_at, notes: r.notes, createdAt: r.created_at };
  }

  async getResourceAssignmentsByTable(tableId: string, tenantId: string): Promise<ResourceAssignment[]> {
    const { rows } = await pool.query(
      `SELECT * FROM resource_assignments WHERE table_id = $1 AND tenant_id = $2 ORDER BY assigned_at DESC`,
      [tableId, tenantId]
    );
    return rows.map((r: any) => ({ id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, resourceId: r.resource_id, resourceName: r.resource_name, resourceUnitId: r.resource_unit_id, unitCode: r.unit_code, tableId: r.table_id, tableNumber: r.table_number, orderId: r.order_id, reservationId: r.reservation_id, quantity: r.quantity, assignedFor: r.assigned_for, status: r.status, specialNotes: r.special_notes, assignedBy: r.assigned_by, assignedByName: r.assigned_by_name, assignedAt: r.assigned_at, returnedAt: r.returned_at, requiresCleaning: r.requires_cleaning, createdAt: r.created_at }));
  }

  async getResourceAssignmentsByReservation(reservationId: string, tenantId: string): Promise<ResourceAssignment[]> {
    const { rows } = await pool.query(
      `SELECT * FROM resource_assignments WHERE reservation_id = $1 AND tenant_id = $2 ORDER BY assigned_at DESC`,
      [reservationId, tenantId]
    );
    return rows.map((r: any) => ({ id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, resourceId: r.resource_id, resourceName: r.resource_name, resourceUnitId: r.resource_unit_id, unitCode: r.unit_code, tableId: r.table_id, tableNumber: r.table_number, orderId: r.order_id, reservationId: r.reservation_id, quantity: r.quantity, assignedFor: r.assigned_for, status: r.status, specialNotes: r.special_notes, assignedBy: r.assigned_by, assignedByName: r.assigned_by_name, assignedAt: r.assigned_at, returnedAt: r.returned_at, requiresCleaning: r.requires_cleaning, createdAt: r.created_at }));
  }

  async getActiveResourceAssignmentsByOutlet(outletId: string, tenantId: string): Promise<ResourceAssignment[]> {
    const { rows } = await pool.query(
      `SELECT * FROM resource_assignments WHERE outlet_id = $1 AND tenant_id = $2 AND status IN ('assigned','in_use') ORDER BY assigned_at DESC`,
      [outletId, tenantId]
    );
    return rows.map((r: any) => ({ id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, resourceId: r.resource_id, resourceName: r.resource_name, resourceUnitId: r.resource_unit_id, unitCode: r.unit_code, tableId: r.table_id, tableNumber: r.table_number, orderId: r.order_id, reservationId: r.reservation_id, quantity: r.quantity, assignedFor: r.assigned_for, status: r.status, specialNotes: r.special_notes, assignedBy: r.assigned_by, assignedByName: r.assigned_by_name, assignedAt: r.assigned_at, returnedAt: r.returned_at, requiresCleaning: r.requires_cleaning, createdAt: r.created_at }));
  }

  async createResourceAssignment(data: any): Promise<ResourceAssignment> {
    const { rows } = await pool.query(
      `INSERT INTO resource_assignments (tenant_id, outlet_id, resource_id, resource_name, resource_unit_id, unit_code, table_id, table_number, order_id, reservation_id, quantity, assigned_for, status, special_notes, assigned_by, assigned_by_name, requires_cleaning)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [data.tenantId, data.outletId, data.resourceId, data.resourceName ?? null, data.resourceUnitId ?? null, data.unitCode ?? null, data.tableId ?? null, data.tableNumber ?? null, data.orderId ?? null, data.reservationId ?? null, data.quantity ?? 1, data.assignedFor ?? null, data.status ?? "assigned", data.specialNotes ?? null, data.assignedBy ?? null, data.assignedByName ?? null, data.requiresCleaning ?? false]
    );
    const r = rows[0];
    return { id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, resourceId: r.resource_id, resourceName: r.resource_name, resourceUnitId: r.resource_unit_id, unitCode: r.unit_code, tableId: r.table_id, tableNumber: r.table_number, orderId: r.order_id, reservationId: r.reservation_id, quantity: r.quantity, assignedFor: r.assigned_for, status: r.status, specialNotes: r.special_notes, assignedBy: r.assigned_by, assignedByName: r.assigned_by_name, assignedAt: r.assigned_at, returnedAt: r.returned_at, requiresCleaning: r.requires_cleaning, createdAt: r.created_at };
  }

  async updateResourceAssignment(id: string, data: Partial<any>, tenantId?: string): Promise<ResourceAssignment | undefined> {
    const fields: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (data.status !== undefined) { fields.push(`status = $${idx++}`); vals.push(data.status); }
    if (data.quantity !== undefined) { fields.push(`quantity = $${idx++}`); vals.push(data.quantity); }
    if (data.returnedAt !== undefined) { fields.push(`returned_at = $${idx++}`); vals.push(data.returnedAt); }
    if (data.requiresCleaning !== undefined) { fields.push(`requires_cleaning = $${idx++}`); vals.push(data.requiresCleaning); }
    if (data.specialNotes !== undefined) { fields.push(`special_notes = $${idx++}`); vals.push(data.specialNotes); }
    if (fields.length === 0) return undefined;
    vals.push(id);
    const tenantFilter = tenantId ? ` AND tenant_id = $${idx + 1}` : "";
    if (tenantId) vals.push(tenantId);
    const { rows } = await pool.query(
      `UPDATE resource_assignments SET ${fields.join(", ")} WHERE id = $${idx}${tenantFilter} RETURNING *`,
      vals
    );
    if (!rows[0]) return undefined;
    const r = rows[0];
    return { id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, resourceId: r.resource_id, resourceName: r.resource_name, resourceUnitId: r.resource_unit_id, unitCode: r.unit_code, tableId: r.table_id, tableNumber: r.table_number, orderId: r.order_id, reservationId: r.reservation_id, quantity: r.quantity, assignedFor: r.assigned_for, status: r.status, specialNotes: r.special_notes, assignedBy: r.assigned_by, assignedByName: r.assigned_by_name, assignedAt: r.assigned_at, returnedAt: r.returned_at, requiresCleaning: r.requires_cleaning, createdAt: r.created_at };
  }

  async getResourceCleaningLog(outletId: string, tenantId: string, limit = 50): Promise<ResourceCleaningLog[]> {
    const { rows } = await pool.query(
      `SELECT rcl.* FROM resource_cleaning_log rcl
       JOIN resource_units ru ON ru.id::text = rcl.resource_unit_id::text
       WHERE rcl.tenant_id = $1 AND ru.outlet_id = $2
       ORDER BY rcl.started_at DESC LIMIT $3`,
      [tenantId, outletId, limit]
    );
    return rows.map((r: any) => ({ id: r.id, tenantId: r.tenant_id, resourceUnitId: r.resource_unit_id, unitCode: r.unit_code, resourceName: r.resource_name, cleaningType: r.cleaning_type, startedAt: r.started_at, completedAt: r.completed_at, cleanedBy: r.cleaned_by, cleanedByName: r.cleaned_by_name, notes: r.notes }));
  }

  async createResourceCleaningLog(data: InsertResourceCleaningLog): Promise<ResourceCleaningLog> {
    const { rows } = await pool.query(
      `INSERT INTO resource_cleaning_log (tenant_id, resource_unit_id, unit_code, resource_name, cleaning_type, completed_at, cleaned_by, cleaned_by_name, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [data.tenantId, data.resourceUnitId, data.unitCode ?? null, data.resourceName ?? null, data.cleaningType ?? "STANDARD", data.completedAt ?? null, data.cleanedBy ?? null, data.cleanedByName ?? null, data.notes ?? null]
    );
    const r = rows[0];
    return { id: r.id, tenantId: r.tenant_id, resourceUnitId: r.resource_unit_id, unitCode: r.unit_code, resourceName: r.resource_name, cleaningType: r.cleaning_type, startedAt: r.started_at, completedAt: r.completed_at, cleanedBy: r.cleaned_by, cleanedByName: r.cleaned_by_name, notes: r.notes };
  }

  // ─── Task #135: Parking Management ───────────────────────────────────────────

  private _mapParkingConfig(r: any): ParkingLayoutConfig {
    return { id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, totalCapacity: r.total_capacity, availableSlots: r.available_slots, valetEnabled: r.valet_enabled, freeMinutes: r.free_minutes, validationEnabled: r.validation_enabled, validationMinSpend: r.validation_min_spend, displayMessage: r.display_message, overnightFee: r.overnight_fee ?? 0, overnightCutoffHour: r.overnight_cutoff_hour ?? 23, createdAt: r.created_at, updatedAt: r.updated_at };
  }
  private _mapParkingZone(r: any): ParkingZone {
    return { id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, name: r.name, level: r.level, color: r.color, totalSlots: r.total_slots, availableSlots: r.available_slots, isActive: r.is_active, sortOrder: r.sort_order, createdAt: r.created_at };
  }
  private _mapParkingSlot(r: any): ParkingSlot {
    return { id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, zoneId: r.zone_id, slotCode: r.slot_code, slotType: r.slot_type, status: r.status, isActive: r.is_active, notes: r.notes, createdAt: r.created_at, posX: r.pos_x, posY: r.pos_y };
  }
  private _mapParkingRate(r: any): ParkingRate {
    return { id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, vehicleType: r.vehicle_type, rateType: r.rate_type, rateAmount: r.rate_amount, dailyMaxCharge: r.daily_max_charge, taxRate: r.tax_rate, isActive: r.is_active, createdAt: r.created_at };
  }
  private _mapParkingRateSlab(r: any): ParkingRateSlab {
    return { id: r.id, rateId: r.rate_id, fromMinutes: r.from_minutes, toMinutes: r.to_minutes, charge: r.charge, createdAt: r.created_at };
  }
  private _mapValetStaff(r: any): ValetStaff {
    return { id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, userId: r.user_id, name: r.name, phone: r.phone, badgeNumber: r.badge_number, isOnDuty: r.is_on_duty, isActive: r.is_active, createdAt: r.created_at };
  }
  private _mapValetTicket(r: any): ValetTicket {
    return {
      id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, ticketNumber: r.ticket_number,
      slotId: r.slot_id, zoneId: r.zone_id, billId: r.bill_id, customerId: r.customer_id ?? null,
      valetStaffId: r.valet_staff_id, vehicleNumber: r.vehicle_number, vehicleType: r.vehicle_type,
      vehicleMake: r.vehicle_make, vehicleColor: r.vehicle_color, customerName: r.customer_name,
      customerPhone: r.customer_phone, status: r.status, entryTime: r.entry_time, exitTime: r.exit_time,
      durationMinutes: r.duration_minutes, chargeAddedToBill: r.charge_added_to_bill,
      events: r.events, notes: r.notes, conditionReport: r.condition_report ?? null, createdAt: r.created_at,
      shiftId: r.shift_id ?? null, isVip: r.is_vip ?? false, vipNotes: r.vip_notes ?? null,
      isOvernight: r.is_overnight ?? false, tipAmount: r.tip_amount ?? null,
      keyType: r.key_type ?? null, keyLocation: r.key_location ?? null,
      chargeAmount: r.charge_amount ?? null, finalCharge: r.final_charge ?? 0,
    };
  }
  private _mapRetrievalRequest(r: any): ValetRetrievalRequest {
    return {
      id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, ticketId: r.ticket_id,
      source: r.source, requestedBy: r.requested_by, requestedByName: r.requested_by_name,
      assignedValetId: r.assigned_valet_id, assignedValetName: r.assigned_valet_name,
      status: r.status, notes: r.notes, completedAt: r.completed_at, createdAt: r.created_at,
      priority: r.priority ?? "NORMAL", queuePosition: r.queue_position ?? null,
      estimatedReadyAt: r.estimated_ready_at ?? null, requestSource: r.request_source ?? null,
    };
  }
  private _mapBillParkingCharge(r: any): BillParkingCharge {
    return { id: r.id, tenantId: r.tenant_id, outletId: r.outlet_id, billId: r.bill_id, ticketId: r.ticket_id, durationMinutes: r.duration_minutes, freeMinutesApplied: r.free_minutes_applied, grossCharge: r.gross_charge, validationDiscount: r.validation_discount, finalCharge: r.final_charge, taxAmount: r.tax_amount, totalCharge: r.total_charge, vehicleType: r.vehicle_type, rateType: r.rate_type, createdAt: r.created_at };
  }

  async getParkingConfig(outletId: string, tenantId: string): Promise<ParkingLayoutConfig | undefined> {
    const { rows } = await pool.query(`SELECT * FROM parking_layout_config WHERE outlet_id = $1 AND tenant_id = $2 LIMIT 1`, [outletId, tenantId]);
    return rows[0] ? this._mapParkingConfig(rows[0]) : undefined;
  }
  async upsertParkingConfig(outletId: string, tenantId: string, data: Partial<InsertParkingLayoutConfig>): Promise<ParkingLayoutConfig> {
    const existing = await this.getParkingConfig(outletId, tenantId);
    const merged = {
      totalCapacity: data.totalCapacity ?? existing?.totalCapacity ?? 0,
      availableSlots: data.availableSlots ?? existing?.availableSlots ?? 0,
      valetEnabled: data.valetEnabled !== undefined ? data.valetEnabled : (existing?.valetEnabled ?? true),
      freeMinutes: data.freeMinutes ?? existing?.freeMinutes ?? 0,
      validationEnabled: data.validationEnabled !== undefined ? data.validationEnabled : (existing?.validationEnabled ?? false),
      validationMinSpend: data.validationMinSpend ?? existing?.validationMinSpend ?? 0,
      displayMessage: data.displayMessage !== undefined ? data.displayMessage : (existing?.displayMessage ?? null),
      overnightFee: (data as any).overnightFee !== undefined ? (data as any).overnightFee : ((existing as any)?.overnightFee ?? 0),
      overnightCutoffHour: (data as any).overnightCutoffHour !== undefined ? (data as any).overnightCutoffHour : ((existing as any)?.overnightCutoffHour ?? 23),
    };
    const { rows } = await pool.query(`
      INSERT INTO parking_layout_config (outlet_id, tenant_id, total_capacity, available_slots, valet_enabled, free_minutes, validation_enabled, validation_min_spend, display_message, overnight_fee, overnight_cutoff_hour)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (tenant_id, outlet_id) DO UPDATE SET
        total_capacity = EXCLUDED.total_capacity,
        available_slots = EXCLUDED.available_slots,
        valet_enabled = EXCLUDED.valet_enabled,
        free_minutes = EXCLUDED.free_minutes,
        validation_enabled = EXCLUDED.validation_enabled,
        validation_min_spend = EXCLUDED.validation_min_spend,
        display_message = EXCLUDED.display_message,
        overnight_fee = EXCLUDED.overnight_fee,
        overnight_cutoff_hour = EXCLUDED.overnight_cutoff_hour,
        updated_at = now()
      RETURNING *
    `, [outletId, tenantId,
      merged.totalCapacity, merged.availableSlots, merged.valetEnabled,
      merged.freeMinutes, merged.validationEnabled, merged.validationMinSpend, merged.displayMessage,
      merged.overnightFee, merged.overnightCutoffHour
    ]);
    return this._mapParkingConfig(rows[0]);
  }

  async getParkingZones(outletId: string, tenantId: string): Promise<ParkingZone[]> {
    const { rows } = await pool.query(`SELECT * FROM parking_zones WHERE outlet_id = $1 AND tenant_id = $2 ORDER BY sort_order`, [outletId, tenantId]);
    return rows.map((r: any) => this._mapParkingZone(r));
  }
  async createParkingZone(data: InsertParkingZone): Promise<ParkingZone> {
    const { rows } = await pool.query(
      `INSERT INTO parking_zones (tenant_id, outlet_id, name, level, color, total_slots, available_slots, is_active, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [data.tenantId, data.outletId, data.name, data.level ?? null, data.color ?? "#3B82F6", data.totalSlots ?? 0, data.availableSlots ?? 0, data.isActive ?? true, data.sortOrder ?? 0]
    );
    return this._mapParkingZone(rows[0]);
  }
  async updateParkingZone(id: string, tenantId: string, data: Partial<InsertParkingZone>): Promise<ParkingZone | undefined> {
    const fields: Record<string, string> = { name: "name", level: "level", color: "color", totalSlots: "total_slots", availableSlots: "available_slots", isActive: "is_active", sortOrder: "sort_order" };
    const sets: string[] = []; const vals: any[] = [id, tenantId];
    for (const [k, col] of Object.entries(fields)) {
      if ((data as any)[k] !== undefined) { vals.push((data as any)[k]); sets.push(`${col} = $${vals.length}`); }
    }
    if (!sets.length) return this.getParkingZones("", tenantId).then(r => r.find(z => z.id === id));
    const { rows } = await pool.query(`UPDATE parking_zones SET ${sets.join(",")} WHERE id=$1 AND tenant_id=$2 RETURNING *`, vals);
    return rows[0] ? this._mapParkingZone(rows[0]) : undefined;
  }
  async deleteParkingZone(id: string, tenantId: string): Promise<void> {
    await pool.query(`DELETE FROM parking_zones WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
  }

  async getParkingSlots(outletId: string, tenantId: string): Promise<ParkingSlot[]> {
    const { rows } = await pool.query(`SELECT * FROM parking_slots WHERE outlet_id = $1 AND tenant_id = $2 ORDER BY slot_code`, [outletId, tenantId]);
    return rows.map((r: any) => this._mapParkingSlot(r));
  }
  async createParkingSlot(data: InsertParkingSlot): Promise<ParkingSlot> {
    const { rows } = await pool.query(
      `INSERT INTO parking_slots (tenant_id, outlet_id, zone_id, slot_code, slot_type, status, is_active, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [data.tenantId, data.outletId, data.zoneId ?? null, data.slotCode, data.slotType ?? "STANDARD", data.status ?? "available", data.isActive ?? true, data.notes ?? null]
    );
    return this._mapParkingSlot(rows[0]);
  }
  async updateParkingSlot(id: string, tenantId: string, data: Partial<InsertParkingSlot>): Promise<ParkingSlot | undefined> {
    const fields: Record<string, string> = { zoneId: "zone_id", slotCode: "slot_code", slotType: "slot_type", status: "status", isActive: "is_active", notes: "notes", posX: "pos_x", posY: "pos_y" };
    const sets: string[] = []; const vals: any[] = [id, tenantId];
    for (const [k, col] of Object.entries(fields)) {
      if ((data as any)[k] !== undefined) { vals.push((data as any)[k]); sets.push(`${col} = $${vals.length}`); }
    }
    if (!sets.length) return undefined;
    const { rows } = await pool.query(`UPDATE parking_slots SET ${sets.join(",")} WHERE id=$1 AND tenant_id=$2 RETURNING *`, vals);
    return rows[0] ? this._mapParkingSlot(rows[0]) : undefined;
  }

  async getParkingRates(outletId: string, tenantId: string): Promise<ParkingRate[]> {
    const { rows } = await pool.query(`SELECT * FROM parking_rates WHERE outlet_id = $1 AND tenant_id = $2 AND is_active = true`, [outletId, tenantId]);
    return rows.map((r: any) => this._mapParkingRate(r));
  }
  async createParkingRate(data: InsertParkingRate): Promise<ParkingRate> {
    const { rows } = await pool.query(
      `INSERT INTO parking_rates (tenant_id, outlet_id, vehicle_type, rate_type, rate_amount, daily_max_charge, tax_rate, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [data.tenantId, data.outletId, data.vehicleType ?? "CAR", data.rateType ?? "HOURLY", data.rateAmount, data.dailyMaxCharge ?? null, data.taxRate ?? 0, data.isActive ?? true]
    );
    return this._mapParkingRate(rows[0]);
  }
  async updateParkingRate(id: string, tenantId: string, data: Partial<Pick<InsertParkingRate, "vehicleType" | "rateType" | "rateAmount" | "dailyMaxCharge" | "taxRate">>): Promise<ParkingRate | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (data.vehicleType !== undefined) { fields.push(`vehicle_type=$${idx++}`); values.push(data.vehicleType); }
    if (data.rateType !== undefined) { fields.push(`rate_type=$${idx++}`); values.push(data.rateType); }
    if (data.rateAmount !== undefined) { fields.push(`rate_amount=$${idx++}`); values.push(data.rateAmount); }
    if (data.dailyMaxCharge !== undefined) { fields.push(`daily_max_charge=$${idx++}`); values.push(data.dailyMaxCharge); }
    if (data.taxRate !== undefined) { fields.push(`tax_rate=$${idx++}`); values.push(data.taxRate); }
    if (fields.length === 0) return undefined;
    values.push(id, tenantId);
    const { rows } = await pool.query(`UPDATE parking_rates SET ${fields.join(",")} WHERE id=$${idx++} AND tenant_id=$${idx} RETURNING *`, values);
    return rows[0] ? this._mapParkingRate(rows[0]) : undefined;
  }
  async deleteParkingRate(id: string, tenantId: string): Promise<void> {
    await pool.query(`UPDATE parking_rates SET is_active = false WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
  }

  async getParkingRateSlabs(rateId: string): Promise<ParkingRateSlab[]> {
    const { rows } = await pool.query(`SELECT * FROM parking_rate_slabs WHERE rate_id = $1 ORDER BY from_minutes`, [rateId]);
    return rows.map((r: any) => this._mapParkingRateSlab(r));
  }
  async createParkingRateSlab(data: InsertParkingRateSlab): Promise<ParkingRateSlab> {
    const { rows } = await pool.query(
      `INSERT INTO parking_rate_slabs (rate_id, from_minutes, to_minutes, charge) VALUES ($1,$2,$3,$4) RETURNING *`,
      [data.rateId, data.fromMinutes, data.toMinutes ?? null, data.charge]
    );
    return this._mapParkingRateSlab(rows[0]);
  }
  async deleteRateSlabsByRate(rateId: string): Promise<void> {
    await pool.query(`DELETE FROM parking_rate_slabs WHERE rate_id=$1`, [rateId]);
  }

  async getValetStaff(outletId: string, tenantId: string): Promise<ValetStaff[]> {
    const { rows } = await pool.query(`SELECT * FROM valet_staff WHERE outlet_id=$1 AND tenant_id=$2 AND is_active=true ORDER BY name`, [outletId, tenantId]);
    return rows.map((r: any) => this._mapValetStaff(r));
  }
  async createValetStaff(data: InsertValetStaff): Promise<ValetStaff> {
    const { rows } = await pool.query(
      `INSERT INTO valet_staff (tenant_id, outlet_id, user_id, name, phone, badge_number, is_on_duty, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [data.tenantId, data.outletId, data.userId ?? null, data.name, data.phone ?? null, data.badgeNumber ?? null, data.isOnDuty ?? false, data.isActive ?? true]
    );
    return this._mapValetStaff(rows[0]);
  }
  async updateValetStaff(id: string, tenantId: string, data: Partial<InsertValetStaff>): Promise<ValetStaff | undefined> {
    const fields: Record<string, string> = { name: "name", phone: "phone", badgeNumber: "badge_number", isOnDuty: "is_on_duty", isActive: "is_active" };
    const sets: string[] = []; const vals: any[] = [id, tenantId];
    for (const [k, col] of Object.entries(fields)) {
      if ((data as any)[k] !== undefined) { vals.push((data as any)[k]); sets.push(`${col} = $${vals.length}`); }
    }
    if (!sets.length) return undefined;
    const { rows } = await pool.query(`UPDATE valet_staff SET ${sets.join(",")} WHERE id=$1 AND tenant_id=$2 RETURNING *`, vals);
    return rows[0] ? this._mapValetStaff(rows[0]) : undefined;
  }

  async createValetTicket(data: InsertValetTicket & { conditionReport?: any }): Promise<ValetTicket> {
    const conditionReportVal = data.conditionReport ? JSON.stringify(data.conditionReport) : null;
    const { rows } = await pool.query(
      `INSERT INTO valet_tickets (tenant_id, outlet_id, ticket_number, slot_id, zone_id, bill_id, valet_staff_id, vehicle_number, vehicle_type, vehicle_make, vehicle_color, customer_name, customer_phone, status, exit_time, duration_minutes, charge_added_to_bill, events, notes, condition_report, shift_id, is_vip, vip_notes, is_overnight, tip_amount, key_type, key_location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *`,
      [data.tenantId, data.outletId, data.ticketNumber, data.slotId ?? null, data.zoneId ?? null, data.billId ?? null, data.valetStaffId ?? null, data.vehicleNumber ?? null, data.vehicleType ?? "CAR", data.vehicleMake ?? null, data.vehicleColor ?? null, data.customerName ?? null, data.customerPhone ?? null, data.status ?? "parked", data.exitTime ?? null, data.durationMinutes ?? null, data.chargeAddedToBill ?? false, JSON.stringify(data.events ?? []), data.notes ?? null, conditionReportVal,
       data.shiftId ?? null, data.isVip ?? false, data.vipNotes ?? null, data.isOvernight ?? false, data.tipAmount ?? null, data.keyType ?? null, data.keyLocation ?? null]
    );
    return this._mapValetTicket(rows[0]);
  }
  async getValetTicket(id: string): Promise<ValetTicket | undefined> {
    const { rows } = await pool.query(`SELECT * FROM valet_tickets WHERE id=$1 LIMIT 1`, [id]);
    return rows[0] ? this._mapValetTicket(rows[0]) : undefined;
  }
  async getValetTickets(outletId: string, tenantId: string, opts?: { status?: string | string[] }): Promise<ValetTicket[]> {
    let q = `SELECT * FROM valet_tickets WHERE outlet_id=$1 AND tenant_id=$2 AND is_deleted=false`;
    const vals: any[] = [outletId, tenantId];
    if (opts?.status) {
      if (Array.isArray(opts.status)) {
        vals.push(opts.status);
        q += ` AND status = ANY($${vals.length})`;
      } else {
        vals.push(opts.status);
        q += ` AND status=$${vals.length}`;
      }
    }
    q += ` ORDER BY created_at DESC`;
    const { rows } = await pool.query(q, vals);
    return rows.map((r: any) => this._mapValetTicket(r));
  }
  async updateValetTicket(id: string, tenantId: string, data: Partial<InsertValetTicket>): Promise<ValetTicket | undefined> {
    const fields: Record<string, string> = {
      slotId: "slot_id", zoneId: "zone_id", billId: "bill_id", valetStaffId: "valet_staff_id",
      vehicleNumber: "vehicle_number", vehicleType: "vehicle_type", vehicleMake: "vehicle_make", vehicleColor: "vehicle_color",
      customerName: "customer_name", customerPhone: "customer_phone", status: "status",
      exitTime: "exit_time", durationMinutes: "duration_minutes", chargeAddedToBill: "charge_added_to_bill",
      events: "events", notes: "notes", conditionReport: "condition_report",
      shiftId: "shift_id", isVip: "is_vip", vipNotes: "vip_notes", isOvernight: "is_overnight",
      tipAmount: "tip_amount", keyType: "key_type", keyLocation: "key_location",
    };
    const sets: string[] = []; const vals: any[] = [id, tenantId];
    for (const [k, col] of Object.entries(fields)) {
      if ((data as any)[k] !== undefined) {
        const jsonbFields = new Set(["events", "conditionReport"]);
        vals.push(jsonbFields.has(k) ? JSON.stringify((data as any)[k]) : (data as any)[k]);
        sets.push(`${col} = $${vals.length}`);
      }
    }
    if (!sets.length) return undefined;
    const { rows } = await pool.query(`UPDATE valet_tickets SET ${sets.join(",")} WHERE id=$1 AND tenant_id=$2 RETURNING *`, vals);
    return rows[0] ? this._mapValetTicket(rows[0]) : undefined;
  }
  async appendValetTicketEvent(ticketId: string, tenantId: string, event: { eventType: string; performedBy?: string; performedByName?: string; notes?: string }): Promise<void> {
    const timestamp = new Date().toISOString();
    const eventEntry = { ...event, timestamp };
    await pool.query(
      `UPDATE valet_tickets SET events = COALESCE(events, '[]'::jsonb) || $1::jsonb WHERE id=$2 AND tenant_id=$3`,
      [JSON.stringify([eventEntry]), ticketId, tenantId]
    );
    await pool.query(
      `INSERT INTO valet_ticket_events (tenant_id, ticket_id, event_type, performed_by, performed_by_name, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
      [tenantId, ticketId, event.eventType, event.performedBy ?? null, event.performedByName ?? null, event.notes ?? null]
    );
  }
  async getValetTicketByBill(billId: string): Promise<ValetTicket | undefined> {
    const { rows } = await pool.query(`SELECT * FROM valet_tickets WHERE bill_id=$1 AND is_deleted=false LIMIT 1`, [billId]);
    return rows[0] ? this._mapValetTicket(rows[0]) : undefined;
  }

  async createRetrievalRequest(data: InsertValetRetrievalRequest): Promise<ValetRetrievalRequest> {
    const { rows } = await pool.query(
      `INSERT INTO valet_retrieval_requests (tenant_id, outlet_id, ticket_id, source, requested_by, requested_by_name, assigned_valet_id, assigned_valet_name, status, notes, completed_at, priority, queue_position, estimated_ready_at, request_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [data.tenantId, data.outletId, data.ticketId, data.source ?? "MANUAL", data.requestedBy ?? null, data.requestedByName ?? null, data.assignedValetId ?? null, data.assignedValetName ?? null, data.status ?? "pending", data.notes ?? null, data.completedAt ?? null,
       data.priority ?? "NORMAL", data.queuePosition ?? null, data.estimatedReadyAt ?? null, data.requestSource ?? null]
    );
    return this._mapRetrievalRequest(rows[0]);
  }
  async getRetrievalRequests(outletId: string, tenantId: string, opts?: { status?: string | string[] }): Promise<ValetRetrievalRequest[]> {
    let q = `SELECT * FROM valet_retrieval_requests WHERE outlet_id=$1 AND tenant_id=$2`;
    const vals: any[] = [outletId, tenantId];
    if (opts?.status) {
      if (Array.isArray(opts.status)) {
        vals.push(opts.status);
        q += ` AND status = ANY($${vals.length})`;
      } else {
        vals.push(opts.status);
        q += ` AND status=$${vals.length}`;
      }
    }
    q += ` ORDER BY CASE WHEN priority='VIP' THEN 0 WHEN priority='URGENT' THEN 1 ELSE 2 END, queue_position NULLS LAST, created_at ASC`;
    const { rows } = await pool.query(q, vals);
    return rows.map((r: any) => this._mapRetrievalRequest(r));
  }
  async updateRetrievalRequest(id: string, tenantId: string, data: Partial<InsertValetRetrievalRequest>): Promise<ValetRetrievalRequest | undefined> {
    const fields: Record<string, string> = { status: "status", assignedValetId: "assigned_valet_id", assignedValetName: "assigned_valet_name", notes: "notes", completedAt: "completed_at", priority: "priority", queuePosition: "queue_position", estimatedReadyAt: "estimated_ready_at" };
    const sets: string[] = []; const vals: any[] = [id, tenantId];
    for (const [k, col] of Object.entries(fields)) {
      if ((data as any)[k] !== undefined) { vals.push((data as any)[k]); sets.push(`${col} = $${vals.length}`); }
    }
    if (!sets.length) return undefined;
    const { rows } = await pool.query(`UPDATE valet_retrieval_requests SET ${sets.join(",")} WHERE id=$1 AND tenant_id=$2 RETURNING *`, vals);
    return rows[0] ? this._mapRetrievalRequest(rows[0]) : undefined;
  }

  async createBillParkingCharge(data: InsertBillParkingCharge): Promise<BillParkingCharge> {
    const { rows } = await pool.query(
      `INSERT INTO bill_parking_charges (tenant_id, outlet_id, bill_id, ticket_id, duration_minutes, free_minutes_applied, gross_charge, validation_discount, final_charge, tax_amount, total_charge, vehicle_type, rate_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (bill_id) DO NOTHING RETURNING *`,
      [data.tenantId, data.outletId ?? null, data.billId, data.ticketId, data.durationMinutes ?? 0, data.freeMinutesApplied ?? 0, data.grossCharge, data.validationDiscount ?? 0, data.finalCharge, data.taxAmount ?? 0, data.totalCharge, data.vehicleType ?? null, data.rateType ?? null]
    );
    return rows[0] ? this._mapBillParkingCharge(rows[0]) : this._mapBillParkingCharge({ ...data, id: "", created_at: new Date() });
  }
  async getBillParkingCharge(billId: string, tenantId: string): Promise<BillParkingCharge | undefined> {
    const { rows } = await pool.query(`SELECT * FROM bill_parking_charges WHERE bill_id=$1 AND tenant_id=$2 LIMIT 1`, [billId, tenantId]);
    return rows[0] ? this._mapBillParkingCharge(rows[0]) : undefined;
  }

  async generateValetTicketNumber(outletId: string, tenantId: string): Promise<string> {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM valet_tickets WHERE tenant_id=$1 AND outlet_id=$2 AND ticket_number LIKE $3`,
      [tenantId, outletId, `VT-${dateStr}-%`]
    );
    const seq = parseInt(rows[0].cnt, 10) + 1;
    return `VT-${dateStr}-${String(seq).padStart(4, "0")}`;
  }
}

export const storage = new DatabaseStorage();
