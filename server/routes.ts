import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { setupAuth, requireAuth, requireRole, hashPassword, comparePasswords } from "./auth";
import { getAdapter } from "./aggregator-adapters";
import {
  isVoidOrCancelled, filterOrdersByDateRange, filterValidOrders,
  computeHourlySales, computeChannelMix, computeHeatmap, computeTopItems,
  computeFinanceTotals, computeWeeklyForecast,
} from "./analytics-helpers";
import {
  insertTenantSchema, insertMenuCategorySchema, insertMenuItemSchema,
  insertTableSchema, insertReservationSchema, insertOrderSchema,
  insertOrderItemSchema, insertInventoryItemSchema, insertStockMovementSchema,
  insertCustomerSchema, insertStaffScheduleSchema, insertUserSchema,
  insertOfferSchema, insertDeliveryOrderSchema, insertEmployeePerformanceLogSchema,
  insertSalesInquirySchema, insertSupportTicketSchema,
  insertCleaningTemplateSchema, insertCleaningLogSchema,
  insertAuditTemplateSchema, insertAuditScheduleSchema, insertAuditIssueSchema,
  insertRecipeSchema, insertStockTakeSchema,
  insertRegionSchema, insertFranchiseInvoiceSchema, insertOutletMenuOverrideSchema,
  insertSupplierSchema, insertSupplierCatalogItemSchema, insertPurchaseOrderSchema,
  insertPurchaseOrderItemSchema, insertGoodsReceivedNoteSchema, insertGrnItemSchema,
  insertTableZoneSchema, insertWaitlistEntrySchema,
  deviceSessions,
} from "@shared/schema";
import { convertUnits } from "@shared/units";
import { sendContactSalesEmail, sendSupportEmail, emailConfig } from "./email";
import { can, needsSupervisorApproval, getPermissionsForRole, requirePermission, type PermissionAction } from "./permissions";
import { auditLog, auditLogFromReq } from "./audit";

async function verifySupervisorOverride(
  override: { username: string; password: string } | undefined,
  tenantId: string,
  action: PermissionAction,
  req: import("express").Request
): Promise<{ verified: boolean; supervisorId?: string; error?: string }> {
  if (!override) return { verified: false, error: "No override provided" };
  const supervisor = await storage.getUserByUsername(override.username);
  if (!supervisor || supervisor.tenantId !== tenantId) return { verified: false, error: "Supervisor not found" };
  const validPw = await comparePasswords(override.password, supervisor.password);
  if (!validPw) return { verified: false, error: "Invalid supervisor credentials" };
  if (!can({ id: supervisor.id, role: supervisor.role, tenantId: supervisor.tenantId }, action)) {
    return { verified: false, error: "Supervisor lacks required permission" };
  }
  const user = req.user as { id: string; name: string; tenantId: string } | undefined;
  auditLogFromReq(req, {
    action: "supervisor_override",
    metadata: { supervisorId: supervisor.id, supervisorName: supervisor.name, forAction: action, requestedBy: user?.name || "unknown" },
    supervisorId: supervisor.id,
  });
  return { verified: true, supervisorId: supervisor.id };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { restaurantName, name, username, password } = req.body;
      if (!restaurantName || !name || !username || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }
      const slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
      const tenant = await storage.createTenant({ name: restaurantName, slug });
      const outlet = await storage.createOutlet({ tenantId: tenant.id, name: "Main Branch" });
      const hashedPw = await hashPassword(password);
      const user = await storage.createUser({
        tenantId: tenant.id,
        username,
        password: hashedPw,
        name,
        role: "owner",
      });
      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed" });
        const { password: _, ...safeUser } = user;
        return res.json(safeUser);
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        auditLog({ tenantId: null, action: "login_failed", metadata: { username: req.body.username }, req });
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        auditLog({ tenantId: user.tenantId, userId: user.id, userName: user.name, action: "login", entityType: "user", entityId: user.id, entityName: user.name, req });
        const { password: _, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    const u = req.user as Record<string, unknown> | undefined;
    if (u) {
      auditLog({ tenantId: String(u.tenantId), userId: String(u.id), userName: String(u.name), action: "logout", entityType: "user", entityId: String(u.id), req });
    }
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { password: _, ...safeUser } = req.user as any;
    const tenant = await storage.getTenant(safeUser.tenantId);
    res.json({ ...safeUser, tenant: tenant ? { id: tenant.id, name: tenant.name, plan: tenant.plan, businessType: tenant.businessType, currency: tenant.currency, timezone: tenant.timezone, timeFormat: tenant.timeFormat, currencyPosition: tenant.currencyPosition, currencyDecimals: tenant.currencyDecimals, taxRate: tenant.taxRate, taxType: tenant.taxType, compoundTax: tenant.compoundTax, serviceCharge: tenant.serviceCharge } : null });
  });

  app.get("/api/users", requireAuth, async (req, res) => {
    const user = req.user as any;
    const users = await storage.getUsersByTenant(user.tenantId);
    res.json(users.map(({ password: _, ...u }) => u));
  });

  app.post("/api/users", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const hashedPw = await hashPassword(req.body.password || "demo123");
      const newUser = await storage.createUser({
        ...req.body,
        tenantId: user.tenantId,
        password: hashedPw,
      });
      const { password: _, ...safeUser } = newUser;
      auditLogFromReq(req, { action: "user_created", entityType: "user", entityId: newUser.id, entityName: newUser.name, after: { name: newUser.name, role: newUser.role } });
      res.json(safeUser);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/users/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const data = { ...req.body };
      if (data.password) {
        data.password = await hashPassword(data.password);
      }
      const updated = await storage.updateUser(req.params.id, data);
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { password: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/outlets", requireAuth, async (req, res) => {
    const user = req.user as any;
    const outletList = await storage.getOutletsByTenant(user.tenantId);
    res.json(outletList);
  });

  app.post("/api/outlets", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const outlet = await storage.createOutlet({ ...req.body, tenantId: user.tenantId });
    res.json(outlet);
  });

  app.patch("/api/outlets/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as Express.User & { tenantId: string };
    const outlet = await storage.updateOutlet(req.params.id, user.tenantId, req.body);
    res.json(outlet);
  });

  app.delete("/api/outlets/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as Express.User & { tenantId: string };
    await storage.deleteOutlet(req.params.id, user.tenantId);
    res.json({ success: true });
  });

  app.get("/api/menu-categories", requireAuth, async (req, res) => {
    const user = req.user as any;
    const cats = await storage.getCategoriesByTenant(user.tenantId);
    res.json(cats);
  });

  app.post("/api/menu-categories", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const cat = await storage.createCategory({ ...req.body, tenantId: user.tenantId });
    res.json(cat);
  });

  app.patch("/api/menu-categories/:id", requireRole("owner", "manager"), async (req, res) => {
    const cat = await storage.updateCategory(req.params.id, req.body);
    res.json(cat);
  });

  app.delete("/api/menu-categories/:id", requireRole("owner", "manager"), async (req, res) => {
    await storage.deleteCategory(req.params.id);
    res.json({ message: "Deleted" });
  });

  app.get("/api/menu-items", requireAuth, async (req, res) => {
    const user = req.user as any;
    const items = await storage.getMenuItemsByTenant(user.tenantId);
    res.json(items);
  });

  app.post("/api/menu-items", requireRole("owner", "manager"), requirePermission("manage_menu"), async (req, res) => {
    const user = req.user as any;
    const item = await storage.createMenuItem({ ...req.body, tenantId: user.tenantId });
    auditLogFromReq(req, { action: "menu_item_created", entityType: "menu_item", entityId: item.id, entityName: item.name, after: { name: item.name, price: item.price } });
    res.json(item);
  });

  app.patch("/api/menu-items/:id", requireRole("owner", "manager"), requirePermission("manage_menu"), async (req, res) => {
    const user = req.user as any;
    const existing = await storage.getMenuItem(req.params.id);

    if (existing && req.body.price && String(req.body.price) !== String(existing.price)) {
      if (!can(user, "change_price")) {
        if (req.body.supervisorOverride) {
          const result = await verifySupervisorOverride(req.body.supervisorOverride, user.tenantId, "change_price", req);
          if (!result.verified) return res.status(403).json({ message: result.error || "Supervisor verification failed" });
        } else {
          return res.status(403).json({ message: "Permission denied", action: "change_price", requiresSupervisor: true });
        }
      }
    }

    const { supervisorOverride: _so, ...updateData } = req.body;
    const item = await storage.updateMenuItem(req.params.id, updateData);
    if (existing) auditLogFromReq(req, { action: "menu_item_updated", entityType: "menu_item", entityId: req.params.id, entityName: existing.name, before: { name: existing.name, price: existing.price }, after: updateData });
    res.json(item);
  });

  app.delete("/api/menu-items/:id", requireRole("owner", "manager"), requirePermission("manage_menu"), async (req, res) => {
    const existing = await storage.getMenuItem(req.params.id);
    await storage.deleteMenuItem(req.params.id);
    if (existing) auditLogFromReq(req, { action: "menu_item_deleted", entityType: "menu_item", entityId: req.params.id, entityName: existing.name });
    res.json({ message: "Deleted" });
  });

  app.get("/api/table-zones", requireAuth, async (req, res) => {
    const user = req.user as any;
    res.json(await storage.getTableZonesByTenant(user.tenantId));
  });
  app.post("/api/table-zones", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const { tenantId: _t, id: _i, ...body } = req.body;
    res.json(await storage.createTableZone({ ...body, tenantId: user.tenantId }));
  });
  app.patch("/api/table-zones/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const { tenantId: _t, id: _i, ...body } = req.body;
    const z = await storage.updateTableZone(req.params.id, user.tenantId, body);
    if (!z) return res.status(404).json({ message: "Zone not found" });
    res.json(z);
  });
  app.delete("/api/table-zones/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteTableZone(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/tables", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tbs = await storage.getTablesByTenant(user.tenantId);
    res.json(tbs);
  });

  app.post("/api/tables", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const { tenantId: _t, id: _i, ...body } = req.body;
    const tbl = await storage.createTable({ ...body, tenantId: user.tenantId });
    res.json(tbl);
  });

  app.patch("/api/tables/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { tenantId: _t, id: _i, ...body } = req.body;
    const tbl = await storage.updateTableByTenant(req.params.id, user.tenantId, body);
    if (!tbl) return res.status(404).json({ message: "Table not found" });
    res.json(tbl);
  });

  app.patch("/api/tables/:id/seat", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { partyName, partySize } = req.body;
    const tbl = await storage.updateTableByTenant(req.params.id, user.tenantId, {
      status: "occupied",
      partyName,
      partySize,
      seatedAt: new Date(),
    });
    if (!tbl) return res.status(404).json({ message: "Table not found" });
    res.json(tbl);
  });

  app.patch("/api/tables/:id/clear", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tbl = await storage.updateTableByTenant(req.params.id, user.tenantId, {
      status: "cleaning",
      partyName: null,
      partySize: null,
      seatedAt: null,
    });
    if (!tbl) return res.status(404).json({ message: "Table not found" });
    res.json(tbl);
  });

  app.patch("/api/tables/:id/merge", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { targetTableId } = req.body;
    if (!targetTableId) return res.status(400).json({ message: "Target table ID required" });
    const source = await storage.getTable(req.params.id);
    const target = await storage.getTable(targetTableId);
    if (!source || source.tenantId !== user.tenantId) return res.status(404).json({ message: "Source table not found" });
    if (!target || target.tenantId !== user.tenantId) return res.status(404).json({ message: "Target table not found" });
    if (source.mergedWith) return res.status(400).json({ message: "Source table already merged" });
    if (target.mergedWith) return res.status(400).json({ message: "Target table already merged" });
    const tbl = await storage.updateTableByTenant(req.params.id, user.tenantId, {
      mergedWith: targetTableId,
    });
    res.json(tbl);
  });

  app.patch("/api/tables/:id/unmerge", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tbl = await storage.updateTableByTenant(req.params.id, user.tenantId, {
      mergedWith: null,
    });
    if (!tbl) return res.status(404).json({ message: "Table not found" });
    res.json(tbl);
  });

  app.post("/api/tables/:id/transfer", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { targetTableId } = req.body;
    if (!targetTableId) return res.status(400).json({ message: "targetTableId required" });
    const allTables = await storage.getTablesByTenant(user.tenantId);
    const source = allTables.find(t => t.id === req.params.id);
    const target = allTables.find(t => t.id === targetTableId);
    if (!source || !target) return res.status(404).json({ message: "Table not found" });
    if (source.status !== "occupied") return res.status(400).json({ message: "Source table has no party to transfer" });
    if (target.status !== "free") return res.status(400).json({ message: "Target table is not free" });
    await storage.updateTableByTenant(target.id, user.tenantId, {
      status: "occupied", partyName: source.partyName, partySize: source.partySize, seatedAt: source.seatedAt,
    });
    await storage.updateTableByTenant(source.id, user.tenantId, {
      status: "free", partyName: null, partySize: null, seatedAt: null,
    });
    const updated = await storage.getTablesByTenant(user.tenantId);
    res.json({ source: updated.find(t => t.id === source.id), target: updated.find(t => t.id === target.id) });
  });

  app.delete("/api/tables/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteTableByTenant(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/waitlist", requireAuth, async (req, res) => {
    const user = req.user as any;
    res.json(await storage.getWaitlistByTenant(user.tenantId));
  });
  app.post("/api/waitlist", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { tenantId: _t, id: _i, ...body } = req.body;
    res.json(await storage.createWaitlistEntry({ ...body, tenantId: user.tenantId }));
  });
  app.patch("/api/waitlist/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { tenantId: _t, id: _i, ...body } = req.body;
    const w = await storage.updateWaitlistEntry(req.params.id, user.tenantId, body);
    if (!w) return res.status(404).json({ message: "Entry not found" });
    res.json(w);
  });
  app.patch("/api/waitlist/:id/seat", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { tableId } = req.body;
    if (!tableId) return res.status(400).json({ message: "Table ID required" });
    const table = await storage.getTable(tableId);
    if (!table || table.tenantId !== user.tenantId) return res.status(404).json({ message: "Table not found" });
    if (table.status !== "free") return res.status(400).json({ message: "Table is not available" });
    const allWaitlist = await storage.getWaitlistByTenant(user.tenantId);
    const entry = allWaitlist.find(w => w.id === req.params.id);
    if (!entry) return res.status(404).json({ message: "Waitlist entry not found" });
    const tbl = await storage.updateTableByTenant(tableId, user.tenantId, {
      status: "occupied",
      seatedAt: new Date(),
      partyName: entry.customerName,
      partySize: entry.partySize,
    });
    if (!tbl) return res.status(404).json({ message: "Table not found" });
    const w = await storage.updateWaitlistEntry(req.params.id, user.tenantId, {
      status: "seated",
      seatedTableId: tableId,
      seatedAt: new Date(),
    });
    res.json(w);
  });
  app.delete("/api/waitlist/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    await storage.deleteWaitlistEntry(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/table-analytics", requireAuth, async (req, res) => {
    const user = req.user as any;
    const allTables = await storage.getTablesByTenant(user.tenantId);
    const totalTables = allTables.length;
    const occupied = allTables.filter(t => t.status === "occupied").length;
    const free = allTables.filter(t => t.status === "free").length;
    const reserved = allTables.filter(t => t.status === "reserved").length;
    const cleaning = allTables.filter(t => t.status === "cleaning").length;
    const blocked = allTables.filter(t => t.status === "blocked").length;
    const totalCapacity = allTables.reduce((s, t) => s + (t.capacity || 0), 0);
    const seatedGuests = allTables.filter(t => t.status === "occupied").reduce((s, t) => s + (t.partySize || 0), 0);
    const waitlistAll = await storage.getWaitlistByTenant(user.tenantId);
    const waitingEntries = waitlistAll.filter(w => w.status === "waiting");
    const waitingCount = waitingEntries.length;
    const seatedEntries = waitlistAll.filter(w => w.status === "seated" && w.createdAt && w.seatedAt);
    const avgWaitMinutes = seatedEntries.length > 0
      ? Math.round(seatedEntries.reduce((s, w) => s + (new Date(w.seatedAt!).getTime() - new Date(w.createdAt!).getTime()) / 60000, 0) / seatedEntries.length)
      : 0;
    const zones = new Map<string, { total: number; occupied: number }>();
    for (const t of allTables) {
      const z = t.zone || "Main";
      const cur = zones.get(z) || { total: 0, occupied: 0 };
      cur.total++;
      if (t.status === "occupied") cur.occupied++;
      zones.set(z, cur);
    }
    const occupiedWithTime = allTables.filter(t => t.status === "occupied" && t.seatedAt);
    const avgDiningMinutes = occupiedWithTime.length > 0
      ? Math.round(occupiedWithTime.reduce((s, t) => s + (Date.now() - new Date(t.seatedAt!).getTime()) / 60000, 0) / occupiedWithTime.length)
      : 0;
    const reservationsList = await storage.getReservationsByTenant(user.tenantId);
    const completedToday = reservationsList.filter(r => {
      if (r.status !== "completed" && r.status !== "seated") return false;
      const dt = new Date(r.dateTime);
      const today = new Date();
      return dt.toDateString() === today.toDateString();
    });
    const turnsToday = completedToday.length;
    const avgTurnTime = turnsToday > 0 ? Math.round(avgDiningMinutes * 0.8) : 0;
    const waitByHour: Record<string, number> = {};
    const waitByDay: Record<string, number> = {};
    for (const w of waitlistAll) {
      if (!w.createdAt) continue;
      const d = new Date(w.createdAt);
      const hour = d.getHours();
      const key = `${hour}:00`;
      waitByHour[key] = (waitByHour[key] || 0) + 1;
      const dayKey = d.toLocaleDateString("en-US", { weekday: "short" });
      waitByDay[dayKey] = (waitByDay[dayKey] || 0) + 1;
    }
    res.json({
      totalTables, occupied, free, reserved, cleaning, blocked,
      totalCapacity, seatedGuests,
      occupancyRate: totalTables > 0 ? Math.round((occupied / totalTables) * 100) : 0,
      waitingCount, avgWaitMinutes, avgDiningMinutes,
      turnsToday, avgTurnTime,
      byZone: Object.fromEntries(zones),
      waitByHour, waitByDay,
    });
  });

  app.post("/api/tables/:id/notify", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { channel, message } = req.body;
    const table = await storage.getTable(req.params.id);
    if (!table || table.tenantId !== user.tenantId) return res.status(404).json({ message: "Table not found" });
    console.log(`[Notification] Channel: ${channel || "sms"}, Table: T${table.number}, Message: ${message || "Your table is ready"}`);
    res.json({ sent: true, channel: channel || "sms", message: message || "Your table is ready" });
  });

  app.post("/api/waitlist/:id/notify", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { channel, message } = req.body;
    const entry = (await storage.getWaitlistByTenant(user.tenantId)).find(w => w.id === req.params.id);
    if (!entry) return res.status(404).json({ message: "Entry not found" });
    await storage.updateWaitlistEntry(req.params.id, user.tenantId, { notificationSent: true });
    console.log(`[Notification] Channel: ${channel || "sms"}, Guest: ${entry.customerName}, Phone: ${entry.customerPhone}, Message: ${message || "Your table is ready"}`);
    res.json({ sent: true, channel: channel || "sms", to: entry.customerPhone, message: message || "Your table is ready" });
  });

  app.get("/api/waitlist/estimated-wait", requireAuth, async (req, res) => {
    const user = req.user as any;
    const partySize = parseInt(req.query.partySize as string) || 2;
    const allTables = await storage.getTablesByTenant(user.tenantId);
    const waitlistAll = await storage.getWaitlistByTenant(user.tenantId);
    const waiting = waitlistAll.filter(w => w.status === "waiting");
    const freeTables = allTables.filter(t => t.status === "free" && (t.capacity || 4) >= partySize);
    if (freeTables.length > 0) {
      res.json({ estimatedMinutes: 0, freeTablesAvailable: freeTables.length });
      return;
    }
    const occupiedWithTime = allTables.filter(t => t.status === "occupied" && t.seatedAt && (t.capacity || 4) >= partySize);
    const avgDining = occupiedWithTime.length > 0
      ? occupiedWithTime.reduce((s, t) => s + (Date.now() - new Date(t.seatedAt!).getTime()) / 60000, 0) / occupiedWithTime.length
      : 45;
    const partiesAhead = waiting.filter(w => w.createdAt && new Date(w.createdAt) < new Date()).length;
    const estimatedMinutes = Math.max(5, Math.round(avgDining * 0.3 + partiesAhead * 8));
    res.json({ estimatedMinutes, partiesAhead, avgDiningMinutes: Math.round(avgDining) });
  });

  app.get("/api/reservations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const reservationsList = await storage.getReservationsByTenant(user.tenantId);
    res.json(reservationsList);
  });

  app.post("/api/reservations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { tenantId: _t, id: _i, ...body } = req.body;
    if (body.dateTime && typeof body.dateTime === "string") body.dateTime = new Date(body.dateTime);
    const reservation = await storage.createReservation({ ...body, tenantId: user.tenantId });
    res.json(reservation);
  });

  app.patch("/api/reservations/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const reservation = await storage.updateReservationByTenant(req.params.id, user.tenantId, req.body);
    if (!reservation) return res.status(404).json({ message: "Reservation not found" });
    res.json(reservation);
  });

  app.delete("/api/reservations/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteReservationByTenant(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/orders", requireAuth, async (req, res) => {
    const user = req.user as any;
    const ordersList = await storage.getOrdersByTenant(user.tenantId);
    res.json(ordersList);
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    const user = req.user as Express.User & { tenantId: string };
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
    const items = await storage.getOrderItemsByOrder(order.id);
    res.json({ ...order, items });
  });

  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { items, supervisorOverride, ...orderData } = req.body;

      const discountPct = Number(orderData.discount || 0);
      if (discountPct > 15 && !can(user, "apply_large_discount")) {
        if (supervisorOverride) {
          const result = await verifySupervisorOverride(supervisorOverride, user.tenantId, "apply_large_discount", req);
          if (!result.verified) return res.status(403).json({ message: result.error || "Supervisor verification failed" });
        } else {
          return res.status(403).json({ message: "Permission denied", action: "apply_large_discount", requiresSupervisor: true });
        }
      }

      const order = await storage.createOrder({ ...orderData, tenantId: user.tenantId, waiterId: user.id });
      if (items && items.length > 0) {
        const menuItemsList = await storage.getMenuItemsByTenant(user.tenantId);
        const menuMap = new Map(menuItemsList.map(m => [m.id, m]));
        for (const item of items) {
          const mi = item.menuItemId ? menuMap.get(item.menuItemId) : undefined;
          await storage.createOrderItem({
            ...item,
            orderId: order.id,
            station: item.station || mi?.station || null,
            course: item.course || mi?.course || null,
          });
        }
      }
      if (orderData.tableId) {
        await storage.updateTable(orderData.tableId, { status: "occupied" });
      }
      const orderItems = await storage.getOrderItemsByOrder(order.id);
      res.json({ ...order, items: orderItems });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/orders/:id", requireAuth, async (req, res) => {
    const user = req.user as Express.User & { tenantId: string; id: string; role: string; name: string };
    const existing = await storage.getOrder(req.params.id);
    if (!existing) return res.status(404).json({ message: "Order not found" });
    if (existing.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });

    if (req.body.status === "voided" && !can(user, "void_order")) {
      if (req.body.supervisorOverride) {
        const result = await verifySupervisorOverride(req.body.supervisorOverride, user.tenantId, "void_order", req);
        if (!result.verified) return res.status(403).json({ message: result.error || "Supervisor verification failed" });
      } else {
        return res.status(403).json({ message: "Permission denied", action: "void_order", requiresSupervisor: needsSupervisorApproval(user, "void_order") });
      }
    }

    if (req.body.discount !== undefined) {
      const discountPct = Number(req.body.discount);
      if (discountPct > 15 && !can(user, "apply_large_discount")) {
        if (req.body.supervisorOverride) {
          const result = await verifySupervisorOverride(req.body.supervisorOverride, user.tenantId, "apply_large_discount", req);
          if (!result.verified) return res.status(403).json({ message: result.error || "Supervisor verification failed" });
        } else {
          return res.status(403).json({ message: "Permission denied", action: "apply_large_discount", requiresSupervisor: true });
        }
      }
    }

    const { supervisorOverride: _svOverride, ...updateData } = req.body as Record<string, any>;

    if (req.body.status === "paid" && existing.orderType === "dine_in") {
      const tenant = await storage.getTenant(user.tenantId);
      const serviceChargeRate = Number(tenant?.serviceCharge || 0) / 100;
      if (serviceChargeRate > 0) {
        const subtotal = Number(existing.subtotal || 0);
        const serviceChargeAmount = subtotal * serviceChargeRate;
        const existingTotal = Number(existing.total || 0);
        updateData.total = (existingTotal + serviceChargeAmount).toFixed(2);
        updateData.notes = [existing.notes, `Service charge (${tenant?.serviceCharge}%): ${serviceChargeAmount.toFixed(2)}`].filter(Boolean).join(" | ");
      }
    }

    const order = await storage.updateOrder(req.params.id, updateData);

    if (req.body.status === "voided" || req.body.status === "cancelled") {
      auditLogFromReq(req, {
        action: req.body.status === "voided" ? "order_voided" : "order_updated",
        entityType: "order", entityId: req.params.id,
        before: { status: existing.status, total: existing.total },
        after: { status: req.body.status },
      });
    } else if (existing.status !== req.body.status) {
      auditLogFromReq(req, { action: "order_updated", entityType: "order", entityId: req.params.id, before: { status: existing.status }, after: { status: req.body.status } });
    }

    if (req.body.status === "paid" && existing.status !== "paid") {
      if (existing.tableId) {
        await storage.updateTable(existing.tableId, { status: "free" });
      }
      try {
        const oItems = await storage.getOrderItemsByOrder(req.params.id);
        for (const oi of oItems) {
          if (!oi.menuItemId) continue;
          const recipe = await storage.getRecipeByMenuItem(oi.menuItemId);
          if (!recipe) continue;
          const recipeIngs = await storage.getRecipeIngredients(recipe.id);
          for (const ing of recipeIngs) {
            const invItem = await storage.getInventoryItem(ing.inventoryItemId);
            const ingUnit = ing.unit || invItem?.unit || "pcs";
            const invUnit = invItem?.unit || "pcs";
            const baseQty = Number(ing.quantity) / (1 - Number(ing.wastePct || 0) / 100);
            const convertedQty = convertUnits(baseQty, ingUnit, invUnit);
            const qty = convertedQty * (oi.quantity || 1);
            if (invItem) {
              const newStock = Math.max(0, Number(invItem.currentStock) - qty);
              await storage.updateInventoryItem(ing.inventoryItemId, { currentStock: String(Math.round(newStock * 100) / 100) });
              await storage.createStockMovement({
                tenantId: user.tenantId,
                itemId: ing.inventoryItemId,
                type: "out",
                quantity: String(Math.round(qty * 100) / 100),
                reason: `Auto-depletion: ${oi.name} x${oi.quantity}`,
              });
            }
          }
        }
      } catch (depErr) {
        console.error("Auto-depletion error:", depErr);
      }
    } else if (req.body.status === "cancelled") {
      if (existing.tableId) {
        await storage.updateTable(existing.tableId, { status: "free" });
      }
    }
    res.json(order);
  });

  app.get("/api/order-items", requireAuth, async (req, res) => {
    const user = req.user as any;
    const items = await storage.getOrderItemsByTenant(user.tenantId);
    res.json(items);
  });

  app.get("/api/order-items/:orderId", requireAuth, async (req, res) => {
    const user = req.user as any;
    const order = await storage.getOrder(req.params.orderId);
    if (!order || order.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Order not found" });
    }
    const items = await storage.getOrderItemsByOrder(req.params.orderId);
    res.json(items);
  });

  app.patch("/api/order-items/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const item = await storage.updateOrderItem(req.params.id, req.body);
    if (!item) return res.status(404).json({ message: "Item not found" });
    const order = await storage.getOrder(item.orderId);
    if (!order || order.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(item);
  });

  app.get("/api/inventory", requireAuth, async (req, res) => {
    const user = req.user as any;
    const inv = await storage.getInventoryByTenant(user.tenantId);
    res.json(inv);
  });

  app.post("/api/inventory", requireRole("owner", "manager"), requirePermission("manage_inventory"), async (req, res) => {
    const user = req.user as any;
    const item = await storage.createInventoryItem({ ...req.body, tenantId: user.tenantId });
    res.json(item);
  });

  app.patch("/api/inventory/:id", requireRole("owner", "manager"), requirePermission("manage_inventory"), async (req, res) => {
    const item = await storage.updateInventoryItem(req.params.id, req.body);
    res.json(item);
  });

  app.delete("/api/inventory/:id", requireRole("owner", "manager"), async (req, res) => {
    await storage.deleteInventoryItem(req.params.id);
    res.json({ message: "Deleted" });
  });

  app.post("/api/inventory/:id/adjust", requireRole("owner", "manager"), requirePermission("adjust_stock"), async (req, res) => {
    const user = req.user as any;
    const { quantity, type, reason, supervisorOverride } = req.body;
    const item = await storage.getInventoryItem(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    const isLargeAdjustment = Number(quantity) >= 50;
    if (isLargeAdjustment && !can(user, "large_stock_adjustment")) {
      if (supervisorOverride) {
        const result = await verifySupervisorOverride(supervisorOverride, user.tenantId, "large_stock_adjustment", req);
        if (!result.verified) return res.status(403).json({ message: result.error || "Supervisor verification failed" });
      } else {
        return res.status(403).json({ message: "Permission denied", action: "large_stock_adjustment", requiresSupervisor: true });
      }
    }

    const newStock = Number(item.currentStock) + (type === "in" ? Number(quantity) : -Number(quantity));
    await storage.updateInventoryItem(req.params.id, { currentStock: String(newStock) });
    await storage.createStockMovement({
      tenantId: user.tenantId,
      itemId: req.params.id,
      type,
      quantity: String(quantity),
      reason,
    });
    auditLogFromReq(req, { action: "inventory_adjusted", entityType: "inventory_item", entityId: req.params.id, entityName: item.name, before: { currentStock: item.currentStock }, after: { currentStock: String(newStock) }, metadata: { type, quantity, reason } });
    res.json({ message: "Stock adjusted" });
  });

  app.get("/api/customers", requireAuth, async (req, res) => {
    const user = req.user as any;
    const custs = await storage.getCustomersByTenant(user.tenantId);
    res.json(custs);
  });

  app.post("/api/customers", requireAuth, async (req, res) => {
    const user = req.user as any;
    const customer = await storage.createCustomer({ ...req.body, tenantId: user.tenantId });
    res.json(customer);
  });

  app.get("/api/customers/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const customer = await storage.getCustomerByTenant(req.params.id, user.tenantId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.patch("/api/customers/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const customer = await storage.updateCustomerByTenant(req.params.id, user.tenantId, req.body);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.delete("/api/customers/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteCustomerByTenant(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/staff-schedules", requireAuth, async (req, res) => {
    const user = req.user as any;
    const schedules = await storage.getStaffSchedulesByTenant(user.tenantId);
    res.json(schedules);
  });

  app.post("/api/staff-schedules", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const schedule = await storage.createStaffSchedule({ ...req.body, tenantId: user.tenantId });
    res.json(schedule);
  });

  app.get("/api/dashboard", requireAuth, async (req, res) => {
    const user = req.user as any;
    const stats = await storage.getDashboardStats(user.tenantId);
    res.json(stats);
  });

  app.get("/api/reports/sales", requireAuth, async (req, res) => {
    const user = req.user as any;
    const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();
    const report = await storage.getSalesReport(user.tenantId, from, to);
    res.json(report);
  });

  app.get("/api/reports/operations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();
    const allOrders = await storage.getOrdersByTenant(user.tenantId);
    const rangeOrders = allOrders.filter(o => {
      const d = new Date(o.createdAt!);
      return d >= from && d <= to;
    });
    const validOrders = filterValidOrders(rangeOrders);
    const totalRevenue = validOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const totalOrders = validOrders.length;
    const hourlySales = computeHourlySales(rangeOrders);
    const channelMix = computeChannelMix(rangeOrders);
    const heatmapData = computeHeatmap(rangeOrders);
    const allItems = await storage.getOrderItemsByTenant(user.tenantId);
    const menuItemsList = await storage.getMenuItemsByTenant(user.tenantId);
    const validOrderIds = new Set(validOrders.map(o => o.id));
    const topItems = computeTopItems(allItems, menuItemsList, validOrderIds, 10);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const dineInOrders = validOrders.filter(o => o.orderType === "dine_in");
    const itemsByOrder = new Map<string, number>();
    for (const oi of allItems) {
      if (!oi.orderId) continue;
      itemsByOrder.set(oi.orderId, (itemsByOrder.get(oi.orderId) || 0) + (oi.quantity || 1));
    }
    const totalCovers = dineInOrders.reduce((s, o) => s + Math.max(itemsByOrder.get(o.id) || 1, 1), 0);
    const completedOrders = validOrders.filter(o => o.status === "completed" || o.status === "paid");
    let avgTurnMinutes = 0;
    if (completedOrders.length >= 2) {
      const allTables = await storage.getTablesByTenant(user.tenantId);
      const tableOrderMap: Record<string, Date[]> = {};
      for (const o of completedOrders) {
        if (o.tableId) {
          if (!tableOrderMap[o.tableId]) tableOrderMap[o.tableId] = [];
          tableOrderMap[o.tableId].push(new Date(o.createdAt!));
        }
      }
      let totalTurns = 0, turnCount = 0;
      for (const times of Object.values(tableOrderMap)) {
        if (times.length < 2) continue;
        times.sort((a, b) => a.getTime() - b.getTime());
        for (let i = 1; i < times.length; i++) {
          totalTurns += (times[i].getTime() - times[i - 1].getTime()) / 60000;
          turnCount++;
        }
      }
      avgTurnMinutes = turnCount > 0 ? Math.round(totalTurns / turnCount) : 0;
    }
    res.json({
      hourlySales,
      channelMix,
      topItems,
      heatmapData,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      totalOrders,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgTurnMinutes,
      totalCovers,
    });
  });

  app.get("/api/reports/finance", requireAuth, async (req, res) => {
    const user = req.user as any;
    const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();
    const allOrders = await storage.getOrdersByTenant(user.tenantId);
    const rangeOrders = allOrders.filter(o => {
      const d = new Date(o.createdAt!);
      return d >= from && d <= to;
    });
    const { netSales, totalTax, totalDiscount, voidCount, voidAmount, dailyFinance } = computeFinanceTotals(rangeOrders);
    const validRangeOrders = filterValidOrders(rangeOrders);
    const rangeOrderIds = new Set(validRangeOrders.map(o => o.id));
    const allOrderItems = await storage.getOrderItemsByTenant(user.tenantId);
    const rangeItems = allOrderItems.filter(oi => rangeOrderIds.has(oi.orderId || ""));
    const allRecipes = await storage.getRecipesByTenant(user.tenantId);
    const inventoryItems = await storage.getInventoryByTenant(user.tenantId);
    const invCostMap = new Map(inventoryItems.map(i => [i.id, parseFloat(i.costPerBaseUnit || i.costPrice || "0")]));
    let totalFoodCost = 0;
    for (const recipe of allRecipes) {
      if (!recipe.menuItemId) continue;
      const itemsForRecipe = rangeItems.filter(oi => oi.menuItemId === recipe.menuItemId);
      if (itemsForRecipe.length === 0) continue;
      const totalQtySold = itemsForRecipe.reduce((s, oi) => s + (oi.quantity || 1), 0);
      const recipeIngredients = await storage.getRecipeIngredients(recipe.id);
      const yieldVal = Number(recipe.yield) || 1;
      for (const ri of recipeIngredients) {
        const unitCost = invCostMap.get(ri.inventoryItemId) || 0;
        const qtyPerPortion = Number(ri.quantity) / yieldVal;
        const wasteMult = 1 + (Number(ri.wastePct) || 0) / 100;
        totalFoodCost += totalQtySold * qtyPerPortion * wasteMult * unitCost;
      }
    }
    const labourSnapshots = await storage.getLabourCostSnapshots(user.tenantId, from, to);
    const totalLabourCost = labourSnapshots.reduce((s, l) => s + (Number(l.actualCost) || 0) + (Number(l.overtimeCost) || 0), 0);
    const grossSales = netSales + totalTax;
    const foodCostPct = grossSales > 0 ? (totalFoodCost / grossSales) * 100 : 0;
    const labourPct = grossSales > 0 ? (totalLabourCost / grossSales) * 100 : 0;
    const grossMargin = grossSales - totalFoodCost - totalLabourCost;
    const grossMarginPct = grossSales > 0 ? (grossMargin / grossSales) * 100 : 0;
    res.json({
      netSales: Math.round(netSales * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      voidCount,
      voidAmount: Math.round(voidAmount * 100) / 100,
      foodCostPct: Math.round(foodCostPct * 10) / 10,
      labourPct: Math.round(labourPct * 10) / 10,
      grossMargin: Math.round(grossMargin * 100) / 100,
      grossMarginPct: Math.round(grossMarginPct * 10) / 10,
      dailyFinance: Object.values(dailyFinance).sort((a, b) => a.date.localeCompare(b.date)),
      totalLabourCost: Math.round(totalLabourCost * 100) / 100,
      totalFoodCost: Math.round(totalFoodCost * 100) / 100,
    });
  });

  app.get("/api/reports/marketing", requireAuth, async (req, res) => {
    const user = req.user as any;
    const customers = await storage.getCustomersByTenant(user.tenantId);
    const loyaltyEnrolled = customers.filter(c => (c.loyaltyPoints || 0) > 0 || c.loyaltyTier).length;
    const totalCustomers = customers.length;
    const tierBreakdown: Record<string, number> = {};
    let totalPointsOutstanding = 0;
    for (const c of customers) {
      const tier = c.loyaltyTier || "none";
      tierBreakdown[tier] = (tierBreakdown[tier] || 0) + 1;
      totalPointsOutstanding += c.loyaltyPoints || 0;
    }
    const offers = await storage.getOffersByTenant(user.tenantId);
    const totalRedemptions = offers.reduce((s, o) => s + (o.usageCount || 0), 0);
    const campaignData = offers.map(o => {
      const uplift = o.usageLimit && o.usageLimit > 0 ? Math.round(((o.usageCount || 0) / o.usageLimit) * 100) : null;
      return {
        name: o.name,
        type: o.type,
        usageCount: o.usageCount || 0,
        usageLimit: o.usageLimit,
        value: Number(o.value) || 0,
        active: o.active,
        uptakeRate: uplift,
      };
    });
    const avgSpend = totalCustomers > 0 ? customers.reduce((s, c) => s + (Number(c.averageSpend) || Number(c.totalSpent) || 0), 0) / totalCustomers : 0;
    const feedback = await storage.getFeedbackByTenant(user.tenantId);
    const avgRating = feedback.length > 0 ? feedback.reduce((s, f) => s + (f.rating || 0), 0) / feedback.length : 0;
    res.json({
      totalCustomers,
      loyaltyEnrolled,
      enrollmentRate: totalCustomers > 0 ? Math.round((loyaltyEnrolled / totalCustomers) * 100) : 0,
      tierBreakdown,
      totalPointsOutstanding,
      totalRedemptions,
      campaigns: campaignData,
      avgCustomerSpend: Math.round(avgSpend * 100) / 100,
      avgRating: Math.round(avgRating * 10) / 10,
      feedbackCount: feedback.length,
    });
  });

  app.get("/api/reports/forecast", requireAuth, async (req, res) => {
    const user = req.user as any;
    const allOrders = await storage.getOrdersByTenant(user.tenantId);
    const outletId = req.query.outletId as string | undefined;
    const weeks = Number(req.query.weeks) || 8;
    const { forecast, totalForecastRevenue, totalForecastOrders, weeksAnalyzed } = computeWeeklyForecast(allOrders, weeks, outletId);
    const now = new Date();
    const cutoff = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
    let historicalOrders = allOrders.filter(o => {
      if (!o.createdAt) return false;
      const d = new Date(o.createdAt);
      return d >= cutoff && d <= now && !isVoidOrCancelled(o.status);
    });
    if (outletId) historicalOrders = historicalOrders.filter(o => o.outletId === outletId);
    const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
    const menuMap = new Map(menuItems.map(m => [m.id, m]));
    const orderItems = await storage.getOrderItemsByTenant(user.tenantId);
    const recentOrderIds = new Set(historicalOrders.map(o => o.id));
    const recentItems = orderItems.filter(oi => recentOrderIds.has(oi.orderId || ""));
    const menuItemDemand: Record<string, { name: string; totalQty: number; price: number }> = {};
    for (const oi of recentItems) {
      const mi = menuMap.get(oi.menuItemId || "");
      const name = mi?.name || oi.name || "Unknown";
      const key = mi?.id || name;
      if (!menuItemDemand[key]) menuItemDemand[key] = { name, totalQty: 0, price: Number(mi?.price || oi.price) || 0 };
      menuItemDemand[key].totalQty += (oi.quantity || 1);
    }
    const weeksCount = Math.max(weeksAnalyzed, 1);
    const productionSuggestions = Object.values(menuItemDemand).map(item => ({
      name: item.name,
      avgWeeklyQty: Math.round(item.totalQty / weeksCount),
      suggestedQty: Math.round((item.totalQty / weeksCount) * 1.1),
      unitPrice: item.price,
    })).sort((a, b) => b.avgWeeklyQty - a.avgWeeklyQty).slice(0, 20);
    const allRecipes = await storage.getRecipesByTenant(user.tenantId);
    const inventoryItems = await storage.getInventoryByTenant(user.tenantId);
    const invMap = new Map(inventoryItems.map(i => [i.id, { name: i.name, unit: i.unit || i.baseUnit || "unit", costPerUnit: parseFloat(i.costPerBaseUnit || i.costPrice || "0") }]));
    const ingredientDemand: Record<string, { name: string; unit: string; weeklyQty: number; costPerUnit: number }> = {};
    for (const recipe of allRecipes) {
      if (!recipe.menuItemId) continue;
      const demand = menuItemDemand[recipe.menuItemId];
      if (!demand) continue;
      const forecastedWeeklyQty = demand.totalQty / weeksCount;
      const recipeIngredientsList = await storage.getRecipeIngredients(recipe.id);
      const yieldVal = Number(recipe.yield) || 1;
      for (const ri of recipeIngredientsList) {
        const inv = invMap.get(ri.inventoryItemId);
        if (!inv) continue;
        const qtyPerPortion = Number(ri.quantity) / yieldVal;
        const wasteMult = 1 + (Number(ri.wastePct) || 0) / 100;
        const weeklyNeed = forecastedWeeklyQty * qtyPerPortion * wasteMult;
        if (!ingredientDemand[ri.inventoryItemId]) {
          ingredientDemand[ri.inventoryItemId] = { name: inv.name, unit: inv.unit, weeklyQty: 0, costPerUnit: inv.costPerUnit };
        }
        ingredientDemand[ri.inventoryItemId].weeklyQty += weeklyNeed;
      }
    }
    const ingredientSuggestions = Object.entries(ingredientDemand).map(([id, item]) => ({
      inventoryItemId: id,
      name: item.name,
      unit: item.unit,
      avgWeeklyNeed: Math.round(item.weeklyQty * 100) / 100,
      suggestedOrder: Math.round(item.weeklyQty * 1.1 * 100) / 100,
      costPerUnit: item.costPerUnit,
      estimatedWeeklyCost: Math.round(item.weeklyQty * 1.1 * item.costPerUnit * 100) / 100,
    })).sort((a, b) => b.estimatedWeeklyCost - a.estimatedWeeklyCost);
    res.json({
      forecast,
      totalForecastRevenue,
      totalForecastOrders,
      weeksAnalyzed,
      productionSuggestions,
      ingredientSuggestions,
      outletId: outletId || null,
    });
  });

  app.get("/api/tenant", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tenant = await storage.getTenant(user.tenantId);
    res.json(tenant);
  });

  app.patch("/api/tenant", requireRole("owner"), async (req, res) => {
    const user = req.user as any;
    const before = await storage.getTenant(user.tenantId);
    const tenant = await storage.updateTenant(user.tenantId, req.body);
    auditLogFromReq(req, { action: "tenant_settings_updated", entityType: "tenant", entityId: user.tenantId, before: before ? { name: before.name, currency: before.currency, taxRate: before.taxRate } : null, after: req.body });
    res.json(tenant);
  });

  // Offers CRUD (tenant-scoped)
  app.get("/api/offers", requireAuth, async (req, res) => {
    const user = req.user as any;
    const offerList = await storage.getOffersByTenant(user.tenantId);
    res.json(offerList);
  });

  app.get("/api/offers/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const offer = await storage.getOfferByTenant(req.params.id, user.tenantId);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    res.json(offer);
  });

  app.post("/api/offers", requireRole("owner", "manager"), requirePermission("manage_offers"), async (req, res) => {
    try {
      const user = req.user as any;
      const offer = await storage.createOffer({ ...req.body, tenantId: user.tenantId });
      auditLogFromReq(req, { action: "offer_created", entityType: "offer", entityId: offer.id, entityName: offer.name, after: { name: offer.name, type: offer.type, value: offer.value } });
      res.json(offer);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/offers/:id", requireRole("owner", "manager"), requirePermission("manage_offers"), async (req, res) => {
    const user = req.user as any;
    const existing = await storage.getOfferByTenant(req.params.id, user.tenantId);
    const offer = await storage.updateOfferByTenant(req.params.id, user.tenantId, req.body);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    if (existing) auditLogFromReq(req, { action: "offer_updated", entityType: "offer", entityId: req.params.id, entityName: existing.name, before: { name: existing.name, active: existing.active }, after: req.body });
    res.json(offer);
  });

  app.delete("/api/offers/:id", requireRole("owner", "manager"), requirePermission("manage_offers"), async (req, res) => {
    const user = req.user as any;
    const existing = await storage.getOfferByTenant(req.params.id, user.tenantId);
    await storage.deleteOfferByTenant(req.params.id, user.tenantId);
    if (existing) auditLogFromReq(req, { action: "offer_deleted", entityType: "offer", entityId: req.params.id, entityName: existing.name });
    res.json({ message: "Deleted" });
  });

  // Delivery Orders CRUD (tenant-scoped)
  app.get("/api/delivery-orders", requireAuth, async (req, res) => {
    const user = req.user as any;
    const deliveries = await storage.getDeliveryOrdersByTenant(user.tenantId);
    res.json(deliveries);
  });

  app.get("/api/delivery-orders/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const delivery = await storage.getDeliveryOrderByTenant(req.params.id, user.tenantId);
    if (!delivery) return res.status(404).json({ message: "Delivery order not found" });
    res.json(delivery);
  });

  app.post("/api/delivery-orders", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const delivery = await storage.createDeliveryOrder({ ...req.body, tenantId: user.tenantId });
      res.json(delivery);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/delivery-orders/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const delivery = await storage.updateDeliveryOrderByTenant(req.params.id, user.tenantId, req.body);
    if (!delivery) return res.status(404).json({ message: "Delivery order not found" });
    res.json(delivery);
  });

  app.delete("/api/delivery-orders/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteDeliveryOrderByTenant(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/feedback", requireAuth, async (req, res) => {
    const user = req.user as any;
    const items = await storage.getFeedbackByTenant(user.tenantId);
    res.json(items);
  });

  app.post("/api/feedback", requireAuth, async (req, res) => {
    const user = req.user as any;
    const fb = await storage.createFeedback({ ...req.body, tenantId: user.tenantId });
    res.json(fb);
  });

  // Employee Performance Logs CRUD (tenant-scoped)
  app.get("/api/performance-logs", requireAuth, async (req, res) => {
    const user = req.user as any;
    const logs = await storage.getPerformanceLogsByTenant(user.tenantId);
    res.json(logs);
  });

  app.get("/api/performance-logs/user/:userId", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const logs = await storage.getPerformanceLogsByUserAndTenant(req.params.userId, user.tenantId);
    res.json(logs);
  });

  app.post("/api/performance-logs", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const log = await storage.createPerformanceLog({ ...req.body, tenantId: user.tenantId });
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/performance-logs/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const log = await storage.updatePerformanceLogByTenant(req.params.id, user.tenantId, req.body);
    if (!log) return res.status(404).json({ message: "Performance log not found" });
    res.json(log);
  });

  app.delete("/api/performance-logs/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deletePerformanceLogByTenant(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  // Enhanced customer queries
  app.get("/api/customers/by-tier/:tier", requireAuth, async (req, res) => {
    const user = req.user as any;
    const custs = await storage.getCustomersByLoyaltyTier(user.tenantId, req.params.tier);
    res.json(custs);
  });

  app.get("/api/customers/by-tag/:tag", requireAuth, async (req, res) => {
    const user = req.user as any;
    const custs = await storage.getCustomersByTags(user.tenantId, req.params.tag);
    res.json(custs);
  });

  // Orders with offer details
  app.get("/api/orders-with-offers", requireAuth, async (req, res) => {
    const user = req.user as any;
    const result = await storage.getOrdersWithOfferDetails(user.tenantId);
    res.json(result);
  });

  app.patch("/api/staff-schedules/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const schedule = await storage.updateStaffScheduleByTenant(req.params.id, user.tenantId, req.body);
    if (!schedule) return res.status(404).json({ message: "Schedule not found" });
    res.json(schedule);
  });

  app.delete("/api/staff-schedules/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteStaffScheduleByTenant(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/contact-config", (_req, res) => {
    res.json({
      salesEnabled: emailConfig.enableContactSales,
      supportEnabled: emailConfig.enableContactSupport,
    });
  });

  app.post("/api/contact-sales", async (req, res) => {
    try {
      if (!emailConfig.enableContactSales) {
        return res.status(403).json({ message: "Contact sales is currently disabled" });
      }
      const parsed = insertSalesInquirySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
      }
      const inquiry = await storage.createSalesInquiry(parsed.data);
      try {
        await sendContactSalesEmail(parsed.data);
      } catch (emailErr) {
        console.error("[Contact Sales] Email notification failed (inquiry saved):", emailErr);
      }
      res.json({ message: "Inquiry submitted successfully", id: inquiry.id });
    } catch (err: any) {
      console.error("[Contact Sales Error]", err);
      res.status(500).json({ message: "Failed to submit inquiry. Please try again." });
    }
  });

  app.post("/api/contact-support", async (req, res) => {
    try {
      if (!emailConfig.enableContactSupport) {
        return res.status(403).json({ message: "Contact support is currently disabled" });
      }
      const parsed = insertSupportTicketSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
      }
      const data = { ...parsed.data };
      const authUser = req.user as any;
      if (authUser) {
        data.tenantId = authUser.tenantId || data.tenantId;
        data.userId = authUser.id || data.userId;
        data.userName = authUser.name || data.userName;
      }
      const ticket = await storage.createSupportTicket(data);
      try {
        await sendSupportEmail(data, ticket.referenceNumber || "");
      } catch (emailErr) {
        console.error("[Contact Support] Email notification failed (ticket saved):", emailErr);
      }
      res.json({
        message: "Support ticket created successfully",
        id: ticket.id,
        referenceNumber: ticket.referenceNumber,
      });
    } catch (err: any) {
      console.error("[Contact Support Error]", err);
      res.status(500).json({ message: "Failed to create support ticket. Please try again." });
    }
  });

  app.get("/api/attendance/status", requireAuth, async (req, res) => {
    const user = req.user as any;
    const log = await storage.getTodayAttendanceForUser(user.id, user.tenantId);
    res.json(log || null);
  });

  app.get("/api/attendance", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      let from: Date | undefined;
      let to: Date | undefined;
      if (req.query.from) { const d = new Date(req.query.from as string); if (!isNaN(d.getTime())) from = d; }
      if (req.query.to) { const d = new Date(req.query.to as string); if (!isNaN(d.getTime())) to = d; }
      if (!["owner", "manager"].includes(user.role)) {
        const logs = await storage.getAttendanceLogsByUser(user.id, user.tenantId, from, to);
        return res.json(logs);
      }
      const logs = await storage.getAttendanceLogsByTenant(user.tenantId, from, to);
      res.json(logs);
    } catch (err: any) {
      console.error("[Attendance Error]", err);
      res.json([]);
    }
  });

  app.get("/api/attendance/summary", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!["owner", "manager"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const now = new Date();
      let from = new Date(now.getFullYear(), now.getMonth(), 1);
      let to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      if (req.query.from) { const d = new Date(req.query.from as string); if (!isNaN(d.getTime())) from = d; }
      if (req.query.to) { const d = new Date(req.query.to as string); if (!isNaN(d.getTime())) to = d; }
      const summary = await storage.getAttendanceSummary(user.tenantId, from, to);
      res.json(summary);
    } catch (err: any) {
      console.error("[Summary Error]", err);
      res.json([]);
    }
  });

  app.get("/api/attendance/settings", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tenant = await storage.getTenant(user.tenantId);
    const config = (tenant?.moduleConfig as any) || {};
    res.json({ lateThresholdMinutes: config.lateThresholdMinutes || 15 });
  });

  app.put("/api/attendance/settings", requireAuth, async (req, res) => {
    const user = req.user as any;
    if (!["owner", "manager"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    const { lateThresholdMinutes } = req.body;
    const tenant = await storage.getTenant(user.tenantId);
    const existingConfig = (tenant?.moduleConfig as any) || {};
    await storage.updateTenant(user.tenantId, { moduleConfig: { ...existingConfig, lateThresholdMinutes: lateThresholdMinutes || 15 } } as any);
    res.json({ lateThresholdMinutes: lateThresholdMinutes || 15 });
  });

  app.post("/api/attendance/clock-in", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getTodayAttendanceForUser(user.id, user.tenantId);
      if (existing && !existing.clockOut) {
        return res.status(400).json({ message: "Already clocked in today" });
      }
      if (existing && existing.clockOut) {
        return res.status(400).json({ message: "Already completed a shift today" });
      }

      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);

      const schedules = await storage.getStaffSchedulesByTenant(user.tenantId);
      const todayStr = today.toISOString().split("T")[0];
      const myShift = schedules.find((s) => {
        const schedDate = new Date(s.date).toISOString().split("T")[0];
        return s.userId === user.id && schedDate === todayStr;
      });

      let status = "on_time";
      let lateMinutes = 0;
      let scheduleId: string | undefined;

      const tenant = await storage.getTenant(user.tenantId);
      const tenantConfig = (tenant?.moduleConfig as any) || {};
      const lateThreshold = tenantConfig.lateThresholdMinutes || 15;

      if (myShift) {
        scheduleId = myShift.id;
        const [shiftHour, shiftMin] = myShift.startTime.split(":").map(Number);
        const shiftStart = new Date(today);
        shiftStart.setHours(shiftHour, shiftMin, 0, 0);
        const diffMs = now.getTime() - shiftStart.getTime();
        lateMinutes = Math.max(0, Math.floor(diffMs / 60000));
        if (lateMinutes >= lateThreshold) {
          status = "late";
        }
      }

      const log = await storage.createAttendanceLog({
        tenantId: user.tenantId,
        userId: user.id,
        scheduleId: scheduleId || null,
        date: today,
        clockIn: now,
        clockOut: null,
        hoursWorked: null,
        status,
        lateMinutes,
        notes: req.body.notes || null,
      });

      if (myShift) {
        await storage.updateStaffScheduleByTenant(myShift.id, user.tenantId, {
          attendance: status === "late" ? "late" : "present",
        });
      }

      res.json(log);
    } catch (err: any) {
      console.error("[Clock-In Error]", err);
      res.status(500).json({ message: "Failed to clock in" });
    }
  });

  app.post("/api/attendance/clock-out", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getTodayAttendanceForUser(user.id, user.tenantId);
      if (!existing) {
        return res.status(400).json({ message: "No clock-in record found for today" });
      }
      if (existing.clockOut) {
        return res.status(400).json({ message: "Already clocked out today" });
      }

      const now = new Date();
      const clockInTime = new Date(existing.clockIn);
      const diffMs = now.getTime() - clockInTime.getTime();
      const hoursWorked = (diffMs / 3600000).toFixed(2);

      const log = await storage.updateAttendanceLog(existing.id, user.tenantId, {
        clockOut: now,
        hoursWorked,
        notes: req.body.notes || existing.notes,
      });

      res.json(log);
    } catch (err: any) {
      console.error("[Clock-Out Error]", err);
      res.status(500).json({ message: "Failed to clock out" });
    }
  });

  app.get("/api/cleaning/templates", requireAuth, async (req, res) => {
    const user = req.user as any;
    const templates = await storage.getCleaningTemplatesByTenant(user.tenantId);
    res.json(templates);
  });

  app.post("/api/cleaning/templates", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...templateData } = req.body;
      const template = await storage.createCleaningTemplate({ ...templateData, tenantId: user.tenantId });
      if (items && Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
          await storage.createCleaningTemplateItem({ templateId: template.id, task: items[i].task || items[i], sortOrder: i });
        }
      }
      const templateItems = await storage.getCleaningTemplateItems(template.id);
      res.json({ ...template, items: templateItems });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/cleaning/templates/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...templateData } = req.body;
      const template = await storage.updateCleaningTemplate(req.params.id, user.tenantId, templateData);
      if (!template) return res.status(404).json({ message: "Template not found" });
      if (items && Array.isArray(items)) {
        await storage.deleteCleaningTemplateItems(template.id);
        for (let i = 0; i < items.length; i++) {
          await storage.createCleaningTemplateItem({ templateId: template.id, task: items[i].task || items[i], sortOrder: i });
        }
      }
      const templateItems = await storage.getCleaningTemplateItems(template.id);
      res.json({ ...template, items: templateItems });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/cleaning/templates/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteCleaningTemplate(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/cleaning/templates/:id/items", requireAuth, async (req, res) => {
    const user = req.user as any;
    const template = await storage.getCleaningTemplate(req.params.id);
    if (!template || template.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Template not found" });
    }
    const items = await storage.getCleaningTemplateItems(req.params.id);
    res.json(items);
  });

  app.get("/api/cleaning/logs", requireAuth, async (req, res) => {
    const user = req.user as any;
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const logs = await storage.getCleaningLogsByTenant(user.tenantId, date);
    res.json(logs);
  });

  app.post("/api/cleaning/logs", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { templateId, templateItemId, date, notes } = req.body;
      if (!templateId || !templateItemId || !date) {
        return res.status(400).json({ message: "templateId, templateItemId, and date are required" });
      }
      const template = await storage.getCleaningTemplate(templateId);
      if (!template || template.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Template not found" });
      }
      const items = await storage.getCleaningTemplateItems(templateId);
      if (!items.some(i => i.id === templateItemId)) {
        return res.status(400).json({ message: "Invalid template item" });
      }
      const existingLogs = await storage.getCleaningLogsByTenant(user.tenantId, new Date(date));
      if (existingLogs.some(l => l.templateItemId === templateItemId)) {
        return res.status(409).json({ message: "Task already completed for this date" });
      }
      const log = await storage.createCleaningLog({ templateId, templateItemId, date: new Date(date), tenantId: user.tenantId, completedBy: user.id, notes: notes || null });
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/cleaning/logs/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    await storage.deleteCleaningLog(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/cleaning/schedules", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const schedules = await storage.getCleaningSchedules(user.tenantId, date);
      res.json(schedules);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/cleaning/schedules", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { templateId, date, assignedTo } = req.body;
      if (!templateId || !date) return res.status(400).json({ message: "templateId and date are required" });
      const template = await storage.getCleaningTemplate(templateId);
      if (!template || template.tenantId !== user.tenantId) return res.status(404).json({ message: "Template not found" });
      if (assignedTo) {
        const assignee = await storage.getUser(assignedTo);
        if (!assignee || assignee.tenantId !== user.tenantId) return res.status(400).json({ message: "Invalid assignee" });
      }
      const schedule = await storage.createCleaningSchedule({ tenantId: user.tenantId, templateId, date: new Date(date), assignedTo: assignedTo || null, status: "pending" });
      res.json(schedule);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/cleaning/schedules/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const allowed: Record<string, boolean> = { assignedTo: true, status: true };
      const updates: Record<string, any> = {};
      for (const key of Object.keys(req.body)) {
        if (allowed[key]) updates[key] = req.body[key];
      }
      if (updates.assignedTo) {
        const assignee = await storage.getUser(updates.assignedTo);
        if (!assignee || assignee.tenantId !== user.tenantId) return res.status(400).json({ message: "Invalid assignee" });
      }
      const updated = await storage.updateCleaningSchedule(req.params.id, user.tenantId, updates);
      if (!updated) return res.status(404).json({ message: "Schedule not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/cleaning/compliance-report", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const allTemplates = await storage.getCleaningTemplatesByTenant(user.tenantId);
      const dayLogs = await storage.getCleaningLogsByTenant(user.tenantId, new Date(date));
      const completedItemIds = new Set(dayLogs.map(l => l.templateItemId));
      const areas: Record<string, { total: number; completed: number; templates: any[] }> = {};
      for (const template of allTemplates) {
        if (template.active === false) continue;
        const items = await storage.getCleaningTemplateItems(template.id);
        const done = items.filter(i => completedItemIds.has(i.id)).length;
        if (!areas[template.area]) areas[template.area] = { total: 0, completed: 0, templates: [] };
        areas[template.area].total += items.length;
        areas[template.area].completed += done;
        areas[template.area].templates.push({
          id: template.id,
          name: template.name,
          total: items.length,
          completed: done,
          rate: items.length > 0 ? Math.round((done / items.length) * 100) : 0,
        });
      }
      let totalAll = 0;
      let completedAll = 0;
      for (const a of Object.values(areas)) {
        totalAll += a.total;
        completedAll += a.completed;
      }
      res.json({
        date,
        overallRate: totalAll > 0 ? Math.round((completedAll / totalAll) * 100) : 0,
        totalTasks: totalAll,
        completedTasks: completedAll,
        remaining: totalAll - completedAll,
        areas,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/audits/templates", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const templates = await storage.getAuditTemplatesByTenant(user.tenantId);
      const result = await Promise.all(templates.map(async (t) => {
        const items = await storage.getAuditTemplateItems(t.id);
        return { ...t, items };
      }));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/audits/templates", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...templateData } = req.body;
      const template = await storage.createAuditTemplate({ ...templateData, tenantId: user.tenantId });
      if (items && Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
          await storage.createAuditTemplateItem({ ...items[i], templateId: template.id, sortOrder: i });
        }
      }
      const createdItems = await storage.getAuditTemplateItems(template.id);
      res.json({ ...template, items: createdItems });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/audits/templates/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...templateData } = req.body;
      const template = await storage.updateAuditTemplate(req.params.id, user.tenantId, templateData);
      if (!template) return res.status(404).json({ message: "Not found" });
      if (items && Array.isArray(items)) {
        await storage.deleteAuditTemplateItems(template.id);
        for (let i = 0; i < items.length; i++) {
          await storage.createAuditTemplateItem({ ...items[i], templateId: template.id, sortOrder: i });
        }
      }
      const updatedItems = await storage.getAuditTemplateItems(template.id);
      res.json({ ...template, items: updatedItems });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/audits/templates/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const schedules = await storage.getAuditSchedulesByTenant(user.tenantId);
      if (schedules.some(s => s.templateId === req.params.id)) {
        return res.status(400).json({ message: "Cannot delete template with existing scheduled audits" });
      }
      await storage.deleteAuditTemplate(req.params.id, user.tenantId);
      res.json({ message: "Deleted" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/audits/schedules", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { status, from, to } = req.query as any;
      const schedules = await storage.getAuditSchedulesByTenant(
        user.tenantId,
        status || undefined,
        from ? new Date(from) : undefined,
        to ? new Date(to) : undefined
      );
      res.json(schedules);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/audits/schedules", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { templateId, scheduledDate, assignedTo, notes } = req.body;
      if (!templateId || !scheduledDate) return res.status(400).json({ message: "templateId and scheduledDate required" });
      const template = await storage.getAuditTemplate(templateId);
      if (!template || template.tenantId !== user.tenantId) return res.status(404).json({ message: "Template not found" });
      if (assignedTo) {
        const assignee = await storage.getUser(assignedTo);
        if (!assignee || assignee.tenantId !== user.tenantId) return res.status(400).json({ message: "Invalid assignee" });
      }
      const items = await storage.getAuditTemplateItems(templateId);
      const maxScore = items.reduce((sum, i) => sum + (i.points || 5), 0);
      const schedule = await storage.createAuditSchedule({
        tenantId: user.tenantId,
        templateId,
        scheduledDate: new Date(scheduledDate),
        assignedTo: assignedTo || null,
        notes: notes || null,
        status: "pending",
        maxScore,
      });
      res.json(schedule);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/audits/schedules/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const schedule = await storage.getAuditSchedule(req.params.id);
      if (!schedule || schedule.tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      const template = await storage.getAuditTemplate(schedule.templateId);
      const items = await storage.getAuditTemplateItems(schedule.templateId);
      const responses = await storage.getAuditResponsesBySchedule(schedule.id);
      res.json({ ...schedule, template, items, responses });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/audits/schedules/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const allowed = ["status", "assignedTo", "totalScore", "maxScore", "completedAt", "approvedBy", "notes"] as const;
      const updates: Record<string, any> = {};
      for (const key of allowed) { if (req.body[key] !== undefined) updates[key] = req.body[key]; }
      if (updates.completedAt && typeof updates.completedAt === "string") updates.completedAt = new Date(updates.completedAt);
      if (updates.approvedBy) updates.approvedBy = user.id;
      const updated = await storage.updateAuditSchedule(req.params.id, user.tenantId, updates);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/audits/responses", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { scheduleId, itemId, status, notes, photoUrl } = req.body;
      if (!scheduleId || !itemId || !status) return res.status(400).json({ message: "scheduleId, itemId and status required" });
      if (!["pass", "fail", "na", "pending"].includes(status)) return res.status(400).json({ message: "Invalid status" });
      const schedule = await storage.getAuditSchedule(scheduleId);
      if (!schedule || schedule.tenantId !== user.tenantId) return res.status(404).json({ message: "Schedule not found" });
      const templateItems = await storage.getAuditTemplateItems(schedule.templateId);
      if (!templateItems.some(i => i.id === itemId)) return res.status(400).json({ message: "Item does not belong to this audit's template" });
      const existing = await storage.getAuditResponsesBySchedule(scheduleId);
      const existingResponse = existing.find(r => r.itemId === itemId);
      if (existingResponse) {
        const updated = await storage.updateAuditResponse(existingResponse.id, {
          status, notes: notes || null, photoUrl: photoUrl || null,
          completedBy: user.id, completedAt: new Date(),
        });
        res.json(updated);
      } else {
        const response = await storage.createAuditResponse({
          scheduleId, itemId, status, notes: notes || null, photoUrl: photoUrl || null,
          completedBy: user.id, completedAt: new Date(),
        });
        res.json(response);
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/audits/issues", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { status } = req.query as any;
      const issues = await storage.getAuditIssuesByTenant(user.tenantId, status || undefined);
      res.json(issues);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/audits/issues", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { title, description, severity, scheduleId, itemId, assignedTo, dueDate } = req.body;
      if (!title || !severity) return res.status(400).json({ message: "title and severity required" });
      if (!["critical", "high", "medium", "low"].includes(severity)) return res.status(400).json({ message: "Invalid severity" });
      if (assignedTo) {
        const assignee = await storage.getUser(assignedTo);
        if (!assignee || assignee.tenantId !== user.tenantId) return res.status(400).json({ message: "Invalid assignee" });
      }
      const issue = await storage.createAuditIssue({
        tenantId: user.tenantId, title, description: description || null,
        severity, scheduleId: scheduleId || null, itemId: itemId || null,
        assignedTo: assignedTo || null, dueDate: dueDate ? new Date(dueDate) : null,
        status: "open",
      });
      res.json(issue);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/audits/issues/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const allowed = ["title", "description", "severity", "status", "assignedTo", "dueDate", "resolvedAt", "resolvedBy"] as const;
      const updates: Record<string, any> = {};
      for (const key of allowed) { if (req.body[key] !== undefined) updates[key] = req.body[key]; }
      if (updates.resolvedBy) updates.resolvedBy = user.id;
      if (updates.resolvedAt && typeof updates.resolvedAt === "string") updates.resolvedAt = new Date(updates.resolvedAt);
      if (updates.dueDate && typeof updates.dueDate === "string") updates.dueDate = new Date(updates.dueDate);
      const updated = await storage.updateAuditIssue(req.params.id, user.tenantId, updates);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/audits/analytics", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const schedules = await storage.getAuditSchedulesByTenant(user.tenantId);
      const issues = await storage.getAuditIssuesByTenant(user.tenantId);
      const completed = schedules.filter(s => s.status === "completed");
      const totalScore = completed.reduce((sum, s) => sum + (s.totalScore || 0), 0);
      const totalMaxScore = completed.reduce((sum, s) => sum + (s.maxScore || 0), 0);
      const complianceScore = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
      const openIssues = issues.filter(i => i.status === "open" || i.status === "in_progress");
      const criticalIssues = openIssues.filter(i => i.severity === "critical");
      const categoryScores: Record<string, { score: number; max: number }> = {};
      for (const s of completed) {
        const tmpl = await storage.getAuditTemplate(s.templateId);
        if (tmpl) {
          const cat = tmpl.category;
          if (!categoryScores[cat]) categoryScores[cat] = { score: 0, max: 0 };
          categoryScores[cat].score += s.totalScore || 0;
          categoryScores[cat].max += s.maxScore || 0;
        }
      }
      res.json({
        complianceScore,
        totalAudits: schedules.length,
        completedAudits: completed.length,
        pendingAudits: schedules.filter(s => s.status === "pending").length,
        overdueAudits: schedules.filter(s => s.status === "overdue").length,
        openIssues: openIssues.length,
        criticalIssues: criticalIssues.length,
        categoryScores: Object.entries(categoryScores).map(([category, data]) => ({
          category,
          score: data.max > 0 ? Math.round((data.score / data.max) * 100) : 0,
        })),
        recentAudits: completed.slice(0, 10).map(s => ({
          id: s.id,
          date: s.scheduledDate,
          score: s.totalScore,
          maxScore: s.maxScore,
          percentage: s.maxScore ? Math.round(((s.totalScore || 0) / s.maxScore) * 100) : 0,
        })),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Recipes CRUD ──
  app.get("/api/recipes", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const allRecipes = await storage.getRecipesByTenant(user.tenantId);
      const result = await Promise.all(allRecipes.map(async (r) => {
        const ingredients = await storage.getRecipeIngredients(r.id);
        return { ...r, ingredients };
      }));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/recipes/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const recipe = await storage.getRecipe(req.params.id);
      if (!recipe || recipe.tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      const ingredients = await storage.getRecipeIngredients(recipe.id);
      res.json({ ...recipe, ingredients });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/recipes", requireRole("owner", "manager"), requirePermission("edit_recipe"), async (req, res) => {
    try {
      const user = req.user as any;
      const { ingredients, ...recipeData } = req.body;
      const validated = insertRecipeSchema.omit({ tenantId: true }).safeParse(recipeData);
      if (!validated.success) return res.status(400).json({ message: "Invalid recipe data", errors: validated.error.format() });
      if (recipeData.menuItemId) {
        const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
        if (!menuItems.find(m => m.id === recipeData.menuItemId)) {
          return res.status(400).json({ message: "Invalid menu item" });
        }
      }
      const tenantInventory = await storage.getInventoryByTenant(user.tenantId);
      const tenantInvIds = new Set(tenantInventory.map(i => i.id));
      const recipe = await storage.createRecipe({ ...recipeData, tenantId: user.tenantId });
      if (ingredients && Array.isArray(ingredients)) {
        for (let i = 0; i < ingredients.length; i++) {
          if (!tenantInvIds.has(ingredients[i].inventoryItemId)) continue;
          await storage.createRecipeIngredient({ ...ingredients[i], recipeId: recipe.id, sortOrder: i });
        }
      }
      const createdIngredients = await storage.getRecipeIngredients(recipe.id);
      auditLogFromReq(req, { action: "recipe_created", entityType: "recipe", entityId: recipe.id, entityName: recipe.name, after: { name: recipe.name, ingredientCount: createdIngredients.length } });
      res.json({ ...recipe, ingredients: createdIngredients });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/recipes/:id", requireRole("owner", "manager"), requirePermission("edit_recipe"), async (req, res) => {
    try {
      const user = req.user as any;
      const { ingredients, ...recipeData } = req.body;
      if (recipeData.menuItemId) {
        const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
        if (!menuItems.find(m => m.id === recipeData.menuItemId)) {
          return res.status(400).json({ message: "Invalid menu item" });
        }
      }
      const recipe = await storage.updateRecipe(req.params.id, user.tenantId, recipeData);
      if (!recipe) return res.status(404).json({ message: "Not found" });
      if (ingredients && Array.isArray(ingredients)) {
        const tenantInventory = await storage.getInventoryByTenant(user.tenantId);
        const tenantInvIds = new Set(tenantInventory.map(i => i.id));
        await storage.deleteRecipeIngredients(recipe.id);
        for (let i = 0; i < ingredients.length; i++) {
          if (!tenantInvIds.has(ingredients[i].inventoryItemId)) continue;
          await storage.createRecipeIngredient({ ...ingredients[i], recipeId: recipe.id, sortOrder: i });
        }
      }
      const updatedIngredients = await storage.getRecipeIngredients(recipe.id);
      auditLogFromReq(req, { action: "recipe_updated", entityType: "recipe", entityId: req.params.id, entityName: recipe.name, after: { name: recipe.name, ingredientCount: updatedIngredients.length } });
      res.json({ ...recipe, ingredients: updatedIngredients });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/recipes/:id", requireRole("owner", "manager"), requirePermission("edit_recipe"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteRecipe(req.params.id, user.tenantId);
      auditLogFromReq(req, { action: "recipe_deleted", entityType: "recipe", entityId: req.params.id });
      res.json({ message: "Deleted" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Food Cost Report ──
  app.get("/api/food-cost-report", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const allRecipes = await storage.getRecipesByTenant(user.tenantId);
      const inventory = await storage.getInventoryByTenant(user.tenantId);
      const invMap = new Map(inventory.map(i => [i.id, i]));
      const menuItemsAll = await storage.getMenuItemsByTenant(user.tenantId);
      const menuMap = new Map(menuItemsAll.map(m => [m.id, m]));
      const orders = await storage.getOrdersByTenant(user.tenantId);
      const paidOrders = orders.filter(o => o.status === "paid");

      const menuItemSales = new Map<string, number>();
      for (const order of paidOrders) {
        const items = await storage.getOrderItemsByOrder(order.id);
        for (const oi of items) {
          menuItemSales.set(oi.menuItemId, (menuItemSales.get(oi.menuItemId) || 0) + Number(oi.quantity));
        }
      }

      const ingredientIdealUsage = new Map<string, number>();

      const report = await Promise.all(allRecipes.map(async (recipe) => {
        const ingredients = await storage.getRecipeIngredients(recipe.id);
        let plateCost = 0;
        const soldQty = recipe.menuItemId ? (menuItemSales.get(recipe.menuItemId) || 0) : 0;

        const ingredientDetails = ingredients.map(ing => {
          const invItem = invMap.get(ing.inventoryItemId);
          const costPerUnit = Number(invItem?.costPrice || 0);
          const qty = Number(ing.quantity);
          const waste = Number(ing.wastePct || 0) / 100;
          const effectiveQty = qty / (1 - waste);
          const ingUnit = ing.unit || invItem?.unit || "pcs";
          const invUnit = invItem?.unit || "pcs";
          const convertedQty = convertUnits(effectiveQty, ingUnit, invUnit);
          const cost = convertedQty * costPerUnit;
          plateCost += cost;

          const idealUse = convertedQty * soldQty;
          if (invItem) {
            ingredientIdealUsage.set(invItem.id, (ingredientIdealUsage.get(invItem.id) || 0) + idealUse);
          }

          return {
            name: invItem?.name || "Unknown",
            inventoryItemId: ing.inventoryItemId,
            quantity: qty,
            unit: ingUnit,
            wastePct: Number(ing.wastePct || 0),
            costPerUnit,
            totalCost: Math.round(cost * 100) / 100,
            idealUsage: Math.round(idealUse * 100) / 100,
          };
        });

        const menuItem = recipe.menuItemId ? menuMap.get(recipe.menuItemId) : null;
        const sellingPrice = Number(menuItem?.price || 0);
        const margin = sellingPrice > 0 ? sellingPrice - plateCost : 0;
        const foodCostPct = sellingPrice > 0 ? (plateCost / sellingPrice) * 100 : 0;

        return {
          recipeId: recipe.id,
          recipeName: recipe.name,
          menuItemName: menuItem?.name || null,
          menuItemId: recipe.menuItemId,
          sellingPrice: Math.round(sellingPrice * 100) / 100,
          plateCost: Math.round(plateCost * 100) / 100,
          margin: Math.round(margin * 100) / 100,
          foodCostPct: Math.round(foodCostPct * 10) / 10,
          soldQty,
          totalIdealCost: Math.round(plateCost * soldQty * 100) / 100,
          ingredients: ingredientDetails,
        };
      }));

      const movements = await storage.getStockMovementsByTenant(user.tenantId, 10000);
      const actualUsageByItem = new Map<string, number>();
      for (const mv of movements) {
        if (mv.type === "out") {
          actualUsageByItem.set(mv.itemId, (actualUsageByItem.get(mv.itemId) || 0) + Number(mv.quantity));
        }
      }

      const varianceByIngredient = Array.from(ingredientIdealUsage.entries()).map(([itemId, idealQty]) => {
        const item = invMap.get(itemId);
        if (!item) return null;
        const actualUsed = actualUsageByItem.get(itemId) || 0;
        const varianceQty = actualUsed - idealQty;
        const costPrice = Number(item.costPrice || 0);
        return {
          itemId,
          itemName: item.name,
          unit: item.unit,
          idealUsage: Math.round(idealQty * 100) / 100,
          actualUsage: Math.round(actualUsed * 100) / 100,
          varianceQty: Math.round(varianceQty * 100) / 100,
          currentStock: Number(item.currentStock || 0),
          costPrice,
          idealCost: Math.round(idealQty * costPrice * 100) / 100,
          actualCost: Math.round(actualUsed * costPrice * 100) / 100,
          varianceCost: Math.round(varianceQty * costPrice * 100) / 100,
        };
      }).filter(Boolean);

      const totalCost = report.reduce((s, r) => s + r.plateCost, 0);
      const totalRevenue = report.reduce((s, r) => s + r.sellingPrice, 0);
      const avgFoodCostPct = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
      const totalSalesCost = report.reduce((s, r) => s + r.totalIdealCost, 0);
      const totalSalesRevenue = report.reduce((s, r) => s + r.sellingPrice * r.soldQty, 0);
      const salesWeightedFoodCostPct = totalSalesRevenue > 0 ? (totalSalesCost / totalSalesRevenue) * 100 : 0;

      const topMovers = inventory
        .map(item => {
          const ideal = ingredientIdealUsage.get(item.id) || 0;
          return { itemId: item.id, itemName: item.name, usage: Math.round(ideal * 100) / 100, unit: item.unit };
        })
        .sort((a, b) => b.usage - a.usage)
        .slice(0, 10);

      const reorderSuggestions = inventory
        .filter(item => {
          const stock = Number(item.currentStock || 0);
          const par = Number(item.parLevel || item.reorderLevel || 0);
          return stock <= par && par > 0;
        })
        .map(item => ({
          itemId: item.id,
          itemName: item.name,
          currentStock: Number(item.currentStock || 0),
          reorderLevel: Number(item.reorderLevel || 0),
          parLevel: Number(item.parLevel || 0),
          leadTimeDays: Number(item.leadTimeDays || 1),
          suggestedOrder: Math.max(0, Number(item.parLevel || item.reorderLevel || 0) * 2 - Number(item.currentStock || 0)),
          unit: item.unit,
        }));

      res.json({
        recipes: report,
        summary: {
          totalCost: Math.round(totalCost * 100) / 100,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          avgFoodCostPct: Math.round(avgFoodCostPct * 10) / 10,
          totalSalesCost: Math.round(totalSalesCost * 100) / 100,
          totalSalesRevenue: Math.round(totalSalesRevenue * 100) / 100,
          salesWeightedFoodCostPct: Math.round(salesWeightedFoodCostPct * 10) / 10,
        },
        varianceByIngredient,
        topMovers,
        reorderSuggestions,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Stock Takes ──
  app.get("/api/stock-takes", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const takes = await storage.getStockTakesByTenant(user.tenantId);
      res.json(takes);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/stock-takes/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const take = await storage.getStockTake(req.params.id);
      if (!take || take.tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      const lines = await storage.getStockTakeLines(take.id);
      res.json({ ...take, lines });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/stock-takes", requireRole("owner", "manager"), requirePermission("adjust_stock"), async (req, res) => {
    try {
      const user = req.user as any;
      const inventory = await storage.getInventoryByTenant(user.tenantId);
      const take = await storage.createStockTake({ tenantId: user.tenantId, conductedBy: user.id, status: "draft", notes: req.body.notes || null });
      for (const item of inventory) {
        await storage.createStockTakeLine({
          stockTakeId: take.id,
          inventoryItemId: item.id,
          expectedQty: item.currentStock || "0",
        });
      }
      const lines = await storage.getStockTakeLines(take.id);
      res.json({ ...take, lines });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/stock-takes/:id/lines/:lineId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const take = await storage.getStockTake(req.params.id);
      if (!take || take.tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      const { countedQty } = req.body;
      const lines = await storage.getStockTakeLines(take.id);
      const line = lines.find(l => l.id === req.params.lineId);
      if (!line) return res.status(404).json({ message: "Line not found" });
      const variance = Number(countedQty) - Number(line.expectedQty);
      const invItem = await storage.getInventoryItem(line.inventoryItemId);
      const varianceCost = variance * Number(invItem?.costPrice || 0);
      const updated = await storage.updateStockTakeLine(req.params.lineId, {
        countedQty: String(countedQty),
        varianceQty: String(variance),
        varianceCost: String(Math.round(varianceCost * 100) / 100),
      });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/stock-takes/:id/complete", requireRole("owner", "manager"), requirePermission("adjust_stock"), async (req, res) => {
    try {
      const user = req.user as any;
      const take = await storage.getStockTake(req.params.id);
      if (!take || take.tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      const lines = await storage.getStockTakeLines(take.id);
      let adjustmentCount = 0;
      for (const line of lines) {
        if (line.countedQty !== null && line.countedQty !== undefined) {
          await storage.updateInventoryItem(line.inventoryItemId, { currentStock: line.countedQty });
          const variance = Number(line.countedQty) - Number(line.expectedQty);
          if (variance !== 0) {
            adjustmentCount++;
            await storage.createStockMovement({
              tenantId: user.tenantId,
              itemId: line.inventoryItemId,
              type: variance > 0 ? "in" : "out",
              quantity: String(Math.abs(variance)),
              reason: `Stock take adjustment (Take #${take.id.slice(0, 8)})`,
            });
          }
        }
      }
      const updated = await storage.updateStockTake(req.params.id, user.tenantId, { status: "completed", completedAt: new Date() });
      auditLogFromReq(req, { action: "inventory_adjusted", entityType: "stock_take", entityId: req.params.id, metadata: { type: "stock_take_complete", linesCount: lines.length, adjustments: adjustmentCount } });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Stock Movements History ──
  app.get("/api/stock-movements", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const movements = await storage.getStockMovementsByTenant(user.tenantId, limit);
      res.json(movements);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Kitchen Stations CRUD ──
  app.get("/api/kitchen-stations", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const stations = await storage.getKitchenStationsByTenant(user.tenantId);
      res.json(stations);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/kitchen-stations", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const station = await storage.createKitchenStation({ ...req.body, tenantId: user.tenantId });
      res.json(station);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/kitchen-stations/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const station = await storage.updateKitchenStation(req.params.id, user.tenantId, req.body);
      if (!station) return res.status(404).json({ message: "Station not found" });
      res.json(station);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/kitchen-stations/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteKitchenStation(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── KDS Order Item Status Transitions ──
  app.get("/api/kds/tickets", requireAuth, async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const stationFilter = req.query.station as string | undefined;
      const allOrders = await storage.getOrdersByTenant(user.tenantId);
      const allTables = await storage.getTablesByTenant(user.tenantId);
      const tableMap = new Map(allTables.map(t => [t.id, t.number]));
      const activeOrders = allOrders.filter(o => ["new", "sent_to_kitchen", "in_progress", "ready"].includes(o.status || ""));
      const tickets = [];
      for (const o of activeOrders) {
        const items = await storage.getOrderItemsByOrder(o.id);
        const filteredItems = stationFilter ? items.filter(i => i.station === stationFilter) : items;
        if (filteredItems.length === 0 && stationFilter) continue;
        tickets.push({
          ...o,
          tableNumber: o.tableId ? tableMap.get(o.tableId) : undefined,
          items: stationFilter ? filteredItems : items,
        });
      }
      res.json(tickets);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/kds/order-items/:id/status", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const { status } = req.body;
      const validTransitions: Record<string, string[]> = {
        pending: ["cooking"],
        cooking: ["ready"],
        ready: ["recalled", "served"],
        recalled: ["cooking"],
      };
      const item = await storage.getOrderItem(req.params.id);
      if (!item) return res.status(404).json({ message: "Order item not found" });
      const currentStatus = item.status || "pending";
      const allowed = validTransitions[currentStatus];
      if (!allowed || !allowed.includes(status)) return res.status(400).json({ message: `Invalid transition: ${currentStatus} -> ${status}` });
      const order = await storage.getOrder(item.orderId);
      if (!order || order.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const updates: Record<string, string | Date | null> = { status };
      if (status === "cooking" && !item.startedAt) updates.startedAt = new Date();
      if (status === "ready") updates.readyAt = new Date();
      if (status === "recalled") { updates.readyAt = null; updates.status = "cooking"; }
      const updated = await storage.updateOrderItem(req.params.id, updates);
      if (status === "cooking" && (order.status === "new" || order.status === "sent_to_kitchen")) {
        await storage.updateOrder(item.orderId, { status: "in_progress" });
      }
      if (status === "recalled" && order.status === "ready") {
        await storage.updateOrder(item.orderId, { status: "in_progress" });
      }
      if (status === "ready" || status === "served") {
        const freshItems = await storage.getOrderItemsByOrder(item.orderId);
        const allServed = freshItems.every(i => i.status === "served");
        const allReadyOrServed = freshItems.every(i => i.status === "ready" || i.status === "served");
        if (allServed) await storage.updateOrder(item.orderId, { status: "served" });
        else if (allReadyOrServed) await storage.updateOrder(item.orderId, { status: "ready" });
      }
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Bulk update order item status (e.g. mark all items in order as started) ──
  app.patch("/api/kds/orders/:id/items-status", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const { status, station } = req.body;
      const validTransitions: Record<string, string[]> = {
        pending: ["cooking"],
        cooking: ["ready"],
        ready: ["recalled", "served"],
        recalled: ["cooking"],
      };
      const order = await storage.getOrder(req.params.id);
      if (!order || order.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const items = await storage.getOrderItemsByOrder(req.params.id);
      const filtered = station ? items.filter(i => i.station === station) : items;
      for (const item of filtered) {
        const currentStatus = item.status || "pending";
        const allowed = validTransitions[currentStatus];
        if (!allowed || !allowed.includes(status)) continue;
        const updates: Record<string, string | Date | null> = { status };
        if (status === "cooking" && !item.startedAt) updates.startedAt = new Date();
        if (status === "ready") updates.readyAt = new Date();
        if (status === "recalled") { updates.readyAt = null; updates.status = "cooking"; }
        await storage.updateOrderItem(item.id, updates);
      }
      const freshItems = await storage.getOrderItemsByOrder(req.params.id);
      const allServed = freshItems.every(i => i.status === "served");
      const allReadyOrServed = freshItems.every(i => i.status === "ready" || i.status === "served");
      if (allServed) await storage.updateOrder(req.params.id, { status: "served" });
      else if (allReadyOrServed) await storage.updateOrder(req.params.id, { status: "ready" });
      if (status === "cooking" && (order.status === "new" || order.status === "sent_to_kitchen")) {
        await storage.updateOrder(req.params.id, { status: "in_progress" });
      }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Order Channels CRUD ──
  app.get("/api/order-channels", requireAuth, async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const channels = await storage.getOrderChannelsByTenant(user.tenantId);
      res.json(channels);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.post("/api/order-channels", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const channel = await storage.createOrderChannel({ ...req.body, tenantId: user.tenantId });
      res.json(channel);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.patch("/api/order-channels/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const channel = await storage.updateOrderChannel(req.params.id, user.tenantId, req.body);
      res.json(channel);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.delete("/api/order-channels/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      await storage.deleteOrderChannel(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Channel Configs CRUD ──
  app.get("/api/channel-configs", requireAuth, async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const configs = await storage.getChannelConfigsByTenant(user.tenantId);
      res.json(configs);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.post("/api/channel-configs", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const config = await storage.createChannelConfig({ ...req.body, tenantId: user.tenantId });
      res.json(config);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.patch("/api/channel-configs/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const config = await storage.updateChannelConfig(req.params.id, user.tenantId, req.body);
      res.json(config);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.delete("/api/channel-configs/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      await storage.deleteChannelConfig(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Online Menu Mappings CRUD ──
  app.get("/api/online-menu-mappings", requireAuth, async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const mappings = await storage.getOnlineMenuMappingsByTenant(user.tenantId);
      res.json(mappings);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.post("/api/online-menu-mappings", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const mapping = await storage.createOnlineMenuMapping({ ...req.body, tenantId: user.tenantId });
      res.json(mapping);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.patch("/api/online-menu-mappings/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const mapping = await storage.updateOnlineMenuMapping(req.params.id, user.tenantId, req.body);
      res.json(mapping);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.delete("/api/online-menu-mappings/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      await storage.deleteOnlineMenuMapping(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Aggregator Order Ingestion (mock adapter pattern) ──
  app.post("/api/aggregator/ingest", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const { channel, channelOrderId, items, customerName, customerPhone, customerAddress, notes } = req.body;
      if (!channel || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "channel and items[] are required" });
      }
      const channels = await storage.getOrderChannelsByTenant(user.tenantId);
      const ch = channels.find(c => c.slug === channel);
      if (!ch) return res.status(400).json({ message: `Unknown channel: ${channel}` });
      const normalizedOrder = {
        channelOrderId: channelOrderId || `${channel.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        items: (items as Array<Record<string, unknown>>).map((i: Record<string, unknown>) => ({ externalItemId: String(i.externalItemId || ""), menuItemId: String(i.menuItemId || ""), name: String(i.name || ""), quantity: Number(i.quantity || 1), price: String(i.price || "0") })),
        customerName: customerName || "", customerPhone: customerPhone || "", customerAddress: customerAddress || "", notes: notes || "",
      };
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
      const menuMap = new Map(menuItems.map(m => [m.id, m]));
      const mappings = await storage.getOnlineMenuMappingsByTenant(user.tenantId);
      const externalToMenuId = new Map(mappings.filter(m => m.channelId === ch.id).map(m => [m.externalItemId, m.menuItemId]));
      let subtotal = 0;
      const orderItemsData: Array<{ menuItemId: string | null; name: string; quantity: number; price: string; station: string | null; course: string | null }> = [];
      for (const item of normalizedOrder.items) {
        let menuItemId: string | undefined = item.menuItemId;
        if (!menuItemId && item.externalItemId) menuItemId = externalToMenuId.get(item.externalItemId);
        const mi = menuItemId ? menuMap.get(menuItemId) : undefined;
        if (menuItemId && !mi) menuItemId = undefined;
        const price = item.price || (mi ? mi.price : "0");
        subtotal += parseFloat(price) * item.quantity;
        orderItemsData.push({ menuItemId: menuItemId || null, name: item.name || mi?.name || "Unknown Item", quantity: item.quantity, price, station: mi?.station || null, course: mi?.course || null });
      }
      const tenant = await storage.getTenant(user.tenantId);
      const taxRate = parseFloat(tenant?.taxRate || "0");
      const tax = subtotal * (taxRate / 100);
      const total = subtotal + tax;
      const order = await storage.createOrder({
        tenantId: user.tenantId, outletId: outlets[0]?.id || null, orderType: "delivery", status: "new",
        subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: total.toFixed(2),
        channel: ch.slug, channelOrderId: normalizedOrder.channelOrderId,
        channelData: { customerName: normalizedOrder.customerName, customerPhone: normalizedOrder.customerPhone, customerAddress: normalizedOrder.customerAddress } as Record<string, unknown>,
        notes: normalizedOrder.notes || null,
      });
      for (const oi of orderItemsData) {
        await storage.createOrderItem({ orderId: order.id, menuItemId: oi.menuItemId, name: oi.name, quantity: oi.quantity, price: oi.price, station: oi.station, course: oi.course });
      }
      res.json(order);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Aggregator Webhook (parse raw platform payload via adapter) ──
  app.post("/api/aggregator/webhook/:platform", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const platform = req.params.platform;
      const adapter = getAdapter(platform);
      if (!adapter) return res.status(400).json({ message: `No adapter for platform: ${platform}` });
      const channels = await storage.getOrderChannelsByTenant(user.tenantId);
      const ch = channels.find(c => c.slug === platform);
      if (!ch) return res.status(400).json({ message: `Channel ${platform} not configured` });
      const parsed = adapter.parseOrder(req.body);
      const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
      const menuMap = new Map(menuItems.map(m => [m.id, m]));
      const mappings = await storage.getOnlineMenuMappingsByTenant(user.tenantId);
      const externalToMenuId = new Map(mappings.filter(m => m.channelId === ch.id).map(m => [m.externalItemId, m.menuItemId]));
      let subtotal = 0;
      const orderItemsData: Array<{ menuItemId: string | null; name: string; quantity: number; price: string; station: string | null; course: string | null }> = [];
      for (const item of parsed.items) {
        let menuItemId: string | undefined = item.menuItemId;
        if (!menuItemId && item.externalItemId) menuItemId = externalToMenuId.get(item.externalItemId);
        const mi = menuItemId ? menuMap.get(menuItemId) : undefined;
        if (menuItemId && !mi) menuItemId = undefined;
        const price = item.price || (mi ? mi.price : "0");
        subtotal += parseFloat(price) * item.quantity;
        orderItemsData.push({ menuItemId: menuItemId || null, name: item.name || mi?.name || "Unknown", quantity: item.quantity, price, station: mi?.station || null, course: mi?.course || null });
      }
      const tenant = await storage.getTenant(user.tenantId);
      const taxRate = parseFloat(tenant?.taxRate || "0");
      const tax = subtotal * (taxRate / 100);
      const total = subtotal + tax;
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      const order = await storage.createOrder({
        tenantId: user.tenantId, outletId: outlets[0]?.id || null, orderType: "delivery", status: "new",
        subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: total.toFixed(2),
        channel: platform, channelOrderId: parsed.channelOrderId,
        channelData: { customerName: parsed.customerName, customerPhone: parsed.customerPhone, customerAddress: parsed.customerAddress } as Record<string, unknown>,
        notes: parsed.notes || null,
      });
      for (const oi of orderItemsData) {
        await storage.createOrderItem({ orderId: order.id, menuItemId: oi.menuItemId, name: oi.name, quantity: oi.quantity, price: oi.price, station: oi.station, course: oi.course });
      }
      res.json(order);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Mock Aggregator Feeds (adapter pattern - simulate incoming orders) ──
  app.post("/api/aggregator/simulate/:platform", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const platform = req.params.platform;
      const adapter = getAdapter(platform);
      if (!adapter) return res.status(400).json({ message: `No adapter for platform: ${platform}` });
      const channels = await storage.getOrderChannelsByTenant(user.tenantId);
      const ch = channels.find(c => c.slug === platform);
      if (!ch) return res.status(400).json({ message: `Channel ${platform} not configured` });
      const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
      if (menuItems.length === 0) return res.status(400).json({ message: "No menu items available" });
      const mockOrder = adapter.generateMockOrder(menuItems.map(m => ({ id: m.id, name: m.name, price: m.price })));
      const menuMap = new Map(menuItems.map(m => [m.id, m]));
      let subtotal = 0;
      const orderItemsData: Array<{ menuItemId: string; name: string; quantity: number; price: string; station: string | null; course: string | null }> = [];
      for (const item of mockOrder.items) {
        const mi = item.menuItemId ? menuMap.get(item.menuItemId) : undefined;
        subtotal += parseFloat(item.price) * item.quantity;
        orderItemsData.push({ menuItemId: item.menuItemId || "", name: item.name, quantity: item.quantity, price: item.price, station: mi?.station || null, course: mi?.course || null });
      }
      const tenant = await storage.getTenant(user.tenantId);
      const taxRate = parseFloat(tenant?.taxRate || "0");
      const tax = subtotal * (taxRate / 100);
      const total = subtotal + tax;
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      const order = await storage.createOrder({
        tenantId: user.tenantId, outletId: outlets[0]?.id || null, orderType: "delivery", status: "new",
        subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: total.toFixed(2),
        channel: platform, channelOrderId: mockOrder.channelOrderId,
        channelData: { customerName: mockOrder.customerName, customerPhone: mockOrder.customerPhone, customerAddress: mockOrder.customerAddress } as Record<string, unknown>,
        notes: mockOrder.notes || null,
      });
      for (const oi of orderItemsData) {
        await storage.createOrderItem({ orderId: order.id, menuItemId: oi.menuItemId, name: oi.name, quantity: oi.quantity, price: oi.price, station: oi.station, course: oi.course });
      }
      res.json({ order, simulatedPayload: mockOrder });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Regions CRUD ──
  app.get("/api/regions", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const regions = await storage.getRegionsByTenant(user.tenantId);
      res.json(regions);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.post("/api/regions", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const data = insertRegionSchema.parse({ ...req.body, tenantId: user.tenantId });
      const region = await storage.createRegion(data);
      res.json(region);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });
  app.patch("/api/regions/:id", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const region = await storage.updateRegion(req.params.id, user.tenantId, req.body);
      if (!region) return res.status(404).json({ message: "Region not found" });
      res.json(region);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.delete("/api/regions/:id", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      await storage.deleteRegion(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Franchise Invoices ──
  app.get("/api/franchise-invoices", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const outletId = req.query.outletId as string | undefined;
      const invoices = outletId
        ? await storage.getFranchiseInvoicesByOutlet(outletId, user.tenantId)
        : await storage.getFranchiseInvoicesByTenant(user.tenantId);
      res.json(invoices);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.post("/api/franchise-invoices", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      const outlet = outlets.find(o => o.id === req.body.outletId);
      if (!outlet) return res.status(400).json({ message: "Outlet not found in your tenant" });
      if (!outlet.isFranchise) return res.status(400).json({ message: "Outlet is not a franchise" });
      const body = { ...req.body, tenantId: user.tenantId };
      if (typeof body.periodStart === "string") body.periodStart = new Date(body.periodStart);
      if (typeof body.periodEnd === "string") body.periodEnd = new Date(body.periodEnd);
      const data = insertFranchiseInvoiceSchema.parse(body);
      const invoice = await storage.createFranchiseInvoice(data);
      res.json(invoice);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });
  app.post("/api/franchise-invoices/calculate", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const { outletId, periodStart, periodEnd } = req.body;
      if (!outletId || !periodStart || !periodEnd) return res.status(400).json({ message: "outletId, periodStart, periodEnd required" });
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      const outlet = outlets.find(o => o.id === outletId);
      if (!outlet || !outlet.isFranchise) return res.status(400).json({ message: "Outlet is not a franchise" });
      const kpis = await storage.getOutletKPIs(user.tenantId, outletId, new Date(periodStart), new Date(periodEnd));
      const kpi = kpis[0] || { totalRevenue: "0" };
      const netSales = parseFloat(String(kpi.totalRevenue || "0"));
      const royaltyRate = parseFloat(outlet.royaltyRate || "0");
      const minGuarantee = parseFloat(outlet.minimumGuarantee || "0");
      const calculatedRoyalty = netSales * (royaltyRate / 100);
      const finalAmount = Math.max(calculatedRoyalty, minGuarantee);
      res.json({ outletId, outletName: outlet.name, periodStart, periodEnd, netSales: netSales.toFixed(2), royaltyRate: royaltyRate.toFixed(2), calculatedRoyalty: calculatedRoyalty.toFixed(2), minimumGuarantee: minGuarantee.toFixed(2), finalAmount: finalAmount.toFixed(2) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.patch("/api/franchise-invoices/:id", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const invoice = await storage.updateFranchiseInvoice(req.params.id, user.tenantId, req.body);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      res.json(invoice);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Outlet Menu Overrides ──
  app.get("/api/outlet-menu-overrides/:outletId", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const overrides = await storage.getOutletMenuOverrides(req.params.outletId, user.tenantId);
      res.json(overrides);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.post("/api/outlet-menu-overrides", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      if (!outlets.find(o => o.id === req.body.outletId)) return res.status(400).json({ message: "Outlet not found in your tenant" });
      const allItems = await storage.getMenuItemsByTenant(user.tenantId);
      if (!allItems.find(m => m.id === req.body.menuItemId)) return res.status(400).json({ message: "Menu item not found in your tenant" });
      const data = insertOutletMenuOverrideSchema.parse({ ...req.body, tenantId: user.tenantId });
      const override = await storage.createOutletMenuOverride(data);
      res.json(override);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });
  app.patch("/api/outlet-menu-overrides/:id", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const override = await storage.updateOutletMenuOverride(req.params.id, user.tenantId, req.body);
      if (!override) return res.status(404).json({ message: "Override not found" });
      res.json(override);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.delete("/api/outlet-menu-overrides/:id", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      await storage.deleteOutletMenuOverride(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── HQ / Cross-Outlet KPIs ──
  app.get("/api/hq/outlet-kpis", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const outletId = req.query.outletId as string | undefined;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const kpis = await storage.getOutletKPIs(user.tenantId, outletId, from, to);
      const allOutlets = await storage.getOutletsByTenant(user.tenantId);
      const outletMapLocal = new Map(allOutlets.map(o => [o.id, o]));

      const [feedbackMetrics, labourMetrics, foodCostReport] = await Promise.all([
        storage.getOutletFeedbackMetrics(user.tenantId, from, to),
        storage.getOutletLabourMetrics(user.tenantId, from, to),
        storage.getOutletFoodCostMetrics(user.tenantId),
      ]);

      const feedbackMap = new Map(feedbackMetrics.map((f: any) => [f.outletId, f]));
      const labourMap = new Map(labourMetrics.map((l: any) => [l.outletId, l]));

      const enriched = kpis.map(k => {
        const outlet = outletMapLocal.get(k.outletId as string);
        const fb = feedbackMap.get(k.outletId as string) || { avgRating: "0", feedbackCount: 0 };
        const lab = labourMap.get(k.outletId as string) || { labourHours: 0 };
        const revenue = parseFloat(String(k.totalRevenue || "0"));
        const estimatedLabourCost = Number(lab.labourHours || 0) * 15;
        const labourPct = revenue > 0 ? ((estimatedLabourCost / revenue) * 100).toFixed(1) : "0.0";
        const foodCostPct = foodCostReport.get(k.outletId as string) || "0.0";
        const rating = parseFloat(String(fb.avgRating || "0"));
        const count = Number(fb.feedbackCount || 0);
        const promoters = Math.round(count * Math.max(0, (rating - 4) / 1));
        const detractors = Math.round(count * Math.max(0, (3 - rating) / 3));
        const nps = count > 0 ? Math.round(((promoters - detractors) / count) * 100) : 0;
        return {
          ...k,
          outletName: outlet?.name || "Unknown",
          isFranchise: outlet?.isFranchise || false,
          regionId: outlet?.regionId || null,
          avgRating: fb.avgRating,
          feedbackCount: fb.feedbackCount,
          nps,
          labourCostPct: labourPct,
          foodCostPct,
        };
      });
      res.json(enriched);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/outlets/:outletId/menu", requireAuth, async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const items = await storage.getMenuItemsForOutlet(user.tenantId, req.params.outletId);
      res.json(items);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Suppliers ──
  app.get("/api/suppliers", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      res.json(await storage.getSuppliersByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.get("/api/suppliers/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const s = await storage.getSupplier(req.params.id, user.tenantId);
      if (!s) return res.status(404).json({ message: "Supplier not found" });
      res.json(s);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.post("/api/suppliers", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const data = insertSupplierSchema.parse({ ...req.body, tenantId: user.tenantId });
      res.json(await storage.createSupplier(data));
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });
  app.patch("/api/suppliers/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const s = await storage.updateSupplier(req.params.id, user.tenantId, req.body);
      if (!s) return res.status(404).json({ message: "Supplier not found" });
      res.json(s);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.delete("/api/suppliers/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      await storage.deleteSupplier(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Supplier Catalog Items ──
  app.get("/api/suppliers/:supplierId/catalog", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      res.json(await storage.getSupplierCatalogItems(req.params.supplierId, user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.post("/api/supplier-catalog-items", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const data = insertSupplierCatalogItemSchema.parse({ ...req.body, tenantId: user.tenantId });
      res.json(await storage.createSupplierCatalogItem(data));
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });
  app.patch("/api/supplier-catalog-items/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const s = await storage.updateSupplierCatalogItem(req.params.id, user.tenantId, req.body);
      if (!s) return res.status(404).json({ message: "Catalog item not found" });
      res.json(s);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.delete("/api/supplier-catalog-items/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      await storage.deleteSupplierCatalogItem(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Purchase Orders ──
  app.get("/api/purchase-orders", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      res.json(await storage.getPurchaseOrdersByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.get("/api/purchase-orders/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const po = await storage.getPurchaseOrder(req.params.id, user.tenantId);
      if (!po) return res.status(404).json({ message: "PO not found" });
      const items = await storage.getPurchaseOrderItems(po.id);
      const grns = await storage.getGRNsByPO(po.id);
      const approvals = await storage.getProcurementApprovals(po.id);
      res.json({ ...po, items, grns, approvals });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.post("/api/purchase-orders", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string; id: string };
      const { items, ...poBody } = req.body;
      if (poBody.expectedDelivery && typeof poBody.expectedDelivery === "string") {
        poBody.expectedDelivery = new Date(poBody.expectedDelivery);
      }
      const poCount = (await storage.getPurchaseOrdersByTenant(user.tenantId)).length;
      const poNumber = poBody.poNumber || `PO-${String(poCount + 1).padStart(4, "0")}`;
      const data = insertPurchaseOrderSchema.parse({ ...poBody, tenantId: user.tenantId, poNumber, createdBy: user.id });
      const po = await storage.createPurchaseOrder(data);
      let totalAmount = 0;
      if (items && Array.isArray(items)) {
        for (const item of items) {
          const totalCost = parseFloat(item.quantity) * parseFloat(item.unitCost);
          totalAmount += totalCost;
          await storage.createPurchaseOrderItem(insertPurchaseOrderItemSchema.parse({
            purchaseOrderId: po.id,
            inventoryItemId: item.inventoryItemId,
            catalogItemId: item.catalogItemId || null,
            quantity: item.quantity,
            unitCost: item.unitCost,
            totalCost: totalCost.toFixed(2),
          }));
        }
        await storage.updatePurchaseOrder(po.id, user.tenantId, { totalAmount: totalAmount.toFixed(2) });
      }
      res.json({ ...po, totalAmount: totalAmount.toFixed(2) });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });
  app.patch("/api/purchase-orders/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      if (req.body.expectedDelivery && typeof req.body.expectedDelivery === "string") {
        req.body.expectedDelivery = new Date(req.body.expectedDelivery);
      }
      const po = await storage.updatePurchaseOrder(req.params.id, user.tenantId, req.body);
      if (!po) return res.status(404).json({ message: "PO not found" });
      res.json(po);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── PO Approval ──
  app.post("/api/purchase-orders/:id/approve", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string; id: string };
      const po = await storage.getPurchaseOrder(req.params.id, user.tenantId);
      if (!po) return res.status(404).json({ message: "PO not found" });
      if (po.status !== "draft") return res.status(400).json({ message: "Only draft POs can be approved" });
      await storage.updatePurchaseOrder(po.id, user.tenantId, { status: "approved", approvedBy: user.id, approvedAt: new Date() });
      await storage.createProcurementApproval({ tenantId: user.tenantId, purchaseOrderId: po.id, action: "approved", performedBy: user.id, notes: req.body.notes || null });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.post("/api/purchase-orders/:id/send", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string; id: string };
      const po = await storage.getPurchaseOrder(req.params.id, user.tenantId);
      if (!po) return res.status(404).json({ message: "PO not found" });
      if (po.status !== "approved") return res.status(400).json({ message: "PO must be approved before sending" });
      await storage.updatePurchaseOrder(po.id, user.tenantId, { status: "sent" });
      await storage.createProcurementApproval({ tenantId: user.tenantId, purchaseOrderId: po.id, action: "sent", performedBy: user.id, notes: null });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Goods Received Notes ──
  app.get("/api/grns", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      res.json(await storage.getGRNsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
  app.post("/api/grns", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string; id: string };
      const { items, purchaseOrderId, notes } = req.body;
      if (!purchaseOrderId || !items || !Array.isArray(items)) return res.status(400).json({ message: "purchaseOrderId and items required" });
      const po = await storage.getPurchaseOrder(purchaseOrderId, user.tenantId);
      if (!po) return res.status(404).json({ message: "PO not found" });

      const grnCount = (await storage.getGRNsByTenant(user.tenantId)).length;
      const grnNumber = `GRN-${String(grnCount + 1).padStart(4, "0")}`;
      const grn = await storage.createGRN(insertGoodsReceivedNoteSchema.parse({ tenantId: user.tenantId, purchaseOrderId, grnNumber, receivedBy: user.id, notes: notes || null }));

      const poItems = await storage.getPurchaseOrderItems(purchaseOrderId);
      const poItemMap = new Map(poItems.map(pi => [pi.id, pi]));

      for (const item of items) {
        const poItem = poItemMap.get(item.purchaseOrderItemId);
        if (!poItem) continue;
        const variance = parseFloat(item.actualUnitCost) - parseFloat(poItem.unitCost);
        await storage.createGRNItem(insertGrnItemSchema.parse({
          grnId: grn.id,
          purchaseOrderItemId: item.purchaseOrderItemId,
          inventoryItemId: poItem.inventoryItemId,
          quantityReceived: item.quantityReceived,
          actualUnitCost: item.actualUnitCost,
          priceVariance: variance.toFixed(2),
          notes: item.notes || null,
        }));

        const newReceivedQty = parseFloat(poItem.receivedQty || "0") + parseFloat(item.quantityReceived);
        await storage.updatePurchaseOrderItem(poItem.id, { receivedQty: newReceivedQty.toFixed(2) });

        const invItem = await storage.getInventoryItem(poItem.inventoryItemId);
        if (invItem) {
          const conversionRatio = parseFloat(invItem.conversionRatio || "1");
          const receivedQtyBase = parseFloat(item.quantityReceived) * conversionRatio;
          const newStock = parseFloat(invItem.currentStock || "0") + receivedQtyBase;
          const costPerBaseUnit = conversionRatio > 0 ? (parseFloat(item.actualUnitCost) / conversionRatio).toFixed(4) : item.actualUnitCost;
          await storage.updateInventoryItem(invItem.id, { currentStock: newStock.toFixed(2), costPrice: item.actualUnitCost, costPerBaseUnit });
          await storage.createStockMovement({ tenantId: user.tenantId, itemId: invItem.id, type: "received", quantity: receivedQtyBase.toFixed(2), reason: `GRN ${grnNumber} from PO ${po.poNumber}` });
        }
      }

      const updatedPoItems = await storage.getPurchaseOrderItems(purchaseOrderId);
      const allFullyReceived = updatedPoItems.every(pi => parseFloat(pi.receivedQty || "0") >= parseFloat(pi.quantity));
      const anyReceived = updatedPoItems.some(pi => parseFloat(pi.receivedQty || "0") > 0);
      const newStatus = allFullyReceived ? "closed" : anyReceived ? "partially_received" : po.status;
      if (newStatus !== po.status) {
        await storage.updatePurchaseOrder(po.id, user.tenantId, { status: newStatus });
      }

      res.json(grn);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });
  app.get("/api/grns/:id/items", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const grns = await storage.getGRNsByTenant(user.tenantId);
      const grn = grns.find(g => g.id === req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      res.json(await storage.getGRNItems(req.params.id));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Purchase Analytics ──
  app.get("/api/procurement/analytics", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const pos = await storage.getPurchaseOrdersByTenant(user.tenantId);
      const allSuppliers = await storage.getSuppliersByTenant(user.tenantId);
      const invItems = await storage.getInventoryByTenant(user.tenantId);
      const invMap = new Map(invItems.map(i => [i.id, i]));

      const spendBySupplier: Record<string, { name: string; total: number; count: number }> = {};
      const spendByItem: Record<string, { name: string; total: number; count: number }> = {};
      let totalSpend = 0;
      let totalPOs = pos.length;
      let closedPOs = 0;
      const supplierMap = new Map(allSuppliers.map(s => [s.id, s]));

      for (const po of pos) {
        const amount = parseFloat(po.totalAmount || "0");
        totalSpend += amount;
        if (po.status === "closed") closedPOs++;
        const supplier = supplierMap.get(po.supplierId);
        const sName = supplier?.name || "Unknown";
        if (!spendBySupplier[po.supplierId]) spendBySupplier[po.supplierId] = { name: sName, total: 0, count: 0 };
        spendBySupplier[po.supplierId].total += amount;
        spendBySupplier[po.supplierId].count++;

        const poItems = await storage.getPurchaseOrderItems(po.id);
        for (const item of poItems) {
          const inv = invMap.get(item.inventoryItemId);
          const iName = inv?.name || "Unknown";
          if (!spendByItem[item.inventoryItemId]) spendByItem[item.inventoryItemId] = { name: iName, total: 0, count: 0 };
          spendByItem[item.inventoryItemId].total += parseFloat(item.totalCost);
          spendByItem[item.inventoryItemId].count++;
        }
      }

      const grns = await storage.getGRNsByTenant(user.tenantId);
      const variances: Array<{ itemName: string; expected: number; actual: number; variance: number }> = [];
      for (const grn of grns) {
        const grnItemsList = await storage.getGRNItems(grn.id);
        for (const gi of grnItemsList) {
          if (parseFloat(gi.priceVariance || "0") !== 0) {
            const inv = invMap.get(gi.inventoryItemId);
            variances.push({
              itemName: inv?.name || "Unknown",
              expected: parseFloat(gi.actualUnitCost) - parseFloat(gi.priceVariance || "0"),
              actual: parseFloat(gi.actualUnitCost),
              variance: parseFloat(gi.priceVariance || "0"),
            });
          }
        }
      }

      res.json({
        totalSpend: totalSpend.toFixed(2),
        totalPOs,
        closedPOs,
        activePOs: totalPOs - closedPOs,
        supplierCount: allSuppliers.length,
        spendBySupplier: Object.values(spendBySupplier).sort((a, b) => b.total - a.total),
        spendByItem: Object.values(spendByItem).sort((a, b) => b.total - a.total).slice(0, 20),
        topVariances: variances.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 20),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Low Stock → PR Generation ──
  app.get("/api/procurement/low-stock", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const items = await storage.getInventoryByTenant(user.tenantId);
      const lowStock = items.filter(i => {
        const stock = parseFloat(i.currentStock || "0");
        const reorder = parseFloat(i.reorderLevel || "0");
        return stock <= reorder && reorder > 0;
      }).map(i => ({
        ...i,
        suggestedQty: Math.max(0, parseFloat(i.parLevel || "0") - parseFloat(i.currentStock || "0")).toFixed(2),
      }));
      res.json(lowStock);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Workforce & Labour Cost ──
  app.get("/api/workforce/dashboard", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as unknown as Record<string, unknown>;
      const tenantId = String(user.tenantId);
      const period = String(req.query.period || "week");
      const now = new Date();
      const from = new Date(now);
      if (period === "day") { from.setHours(0, 0, 0, 0); }
      else if (period === "month") { from.setDate(1); from.setHours(0, 0, 0, 0); }
      else { from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0); }

      const schedules = await storage.getStaffSchedulesByTenant(tenantId);
      const allUsers = await storage.getUsersByTenant(tenantId);
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const outlets = await storage.getOutletsByTenant(tenantId);
      const outletMap = new Map(outlets.map(o => [o.id, o]));
      const attendanceLogs = await storage.getAttendanceLogsByTenant(tenantId, from, now);

      const periodSchedules = schedules.filter(s => {
        const d = new Date(s.date);
        return d >= from && d <= now;
      });

      const orders = await storage.getOrdersByTenant(tenantId);
      const periodOrders = orders.filter(o => {
        const d = new Date(o.createdAt!);
        return d >= from && d <= now && o.status !== "voided" && o.status !== "cancelled";
      });
      const totalSales = periodOrders.reduce((sum, o) => sum + parseFloat(o.total || "0"), 0);

      const parseHours = (start: string, end: string) => {
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        let h = (eh * 60 + em) - (sh * 60 + sm);
        if (h < 0) h += 24 * 60;
        return h / 60;
      };
      const defaultRates: Record<string, number> = { owner: 50, manager: 35, waiter: 18, kitchen: 20, accountant: 30 };
      const getRate = (u: { hourlyRate?: string | null; role: string }, schedRate?: string | null) => {
        if (schedRate) return parseFloat(schedRate);
        if (u.hourlyRate) return parseFloat(u.hourlyRate);
        return defaultRates[u.role] || 18;
      };
      const getOvertimeRate = (u: { overtimeRate?: string | null; hourlyRate?: string | null; role: string }) => {
        if (u.overtimeRate) return parseFloat(u.overtimeRate);
        return getRate(u) * 1.5;
      };

      let totalScheduledHours = 0, totalActualHours = 0, totalScheduledCost = 0, totalActualCost = 0;
      let totalOvertimeHours = 0, totalOvertimeCost = 0;
      const byRole: Record<string, { scheduledHours: number; actualHours: number; scheduledCost: number; actualCost: number; headcount: Set<string> }> = {};
      const byOutlet: Record<string, { name: string; scheduledHours: number; actualHours: number; scheduledCost: number; actualCost: number; sales: number; headcount: Set<string> }> = {};
      const byDay: Record<string, { date: string; scheduledCost: number; actualCost: number; sales: number }> = {};
      const standardHoursPerDay = 8;

      for (const s of periodSchedules) {
        const u = userMap.get(s.userId);
        if (!u) continue;
        const hours = parseHours(s.startTime, s.endTime);
        const rate = getRate(u, s.hourlyRate);
        const cost = hours * rate;
        totalScheduledHours += hours;
        totalScheduledCost += cost;
        const role = s.role || u.role;
        if (!byRole[role]) byRole[role] = { scheduledHours: 0, actualHours: 0, scheduledCost: 0, actualCost: 0, headcount: new Set() };
        byRole[role].scheduledHours += hours;
        byRole[role].scheduledCost += cost;
        byRole[role].headcount.add(s.userId);
        const oid = s.outletId || "main";
        const oName = s.outletId ? (outletMap.get(s.outletId)?.name || "Unknown") : "Main";
        if (!byOutlet[oid]) byOutlet[oid] = { name: oName, scheduledHours: 0, actualHours: 0, scheduledCost: 0, actualCost: 0, sales: 0, headcount: new Set() };
        byOutlet[oid].scheduledHours += hours;
        byOutlet[oid].scheduledCost += cost;
        byOutlet[oid].headcount.add(s.userId);
        const dateKey = new Date(s.date).toISOString().split("T")[0];
        if (!byDay[dateKey]) byDay[dateKey] = { date: dateKey, scheduledCost: 0, actualCost: 0, sales: 0 };
        byDay[dateKey].scheduledCost += cost;
      }

      const scheduleByUserDate = new Map<string, typeof periodSchedules[0]>();
      for (const s of periodSchedules) {
        scheduleByUserDate.set(`${s.userId}|${new Date(s.date).toISOString().split("T")[0]}`, s);
      }

      for (const log of attendanceLogs) {
        const u = userMap.get(log.userId);
        if (!u) continue;
        const hours = parseFloat(log.hoursWorked || "0");
        const rate = getRate(u);
        const otRate = getOvertimeRate(u);
        const regularHours = Math.min(hours, standardHoursPerDay);
        const overtimeHours = Math.max(0, hours - standardHoursPerDay);
        const cost = regularHours * rate + overtimeHours * otRate;
        totalActualHours += hours;
        totalActualCost += cost;
        totalOvertimeHours += overtimeHours;
        totalOvertimeCost += overtimeHours * otRate;
        const role = u.role;
        if (!byRole[role]) byRole[role] = { scheduledHours: 0, actualHours: 0, scheduledCost: 0, actualCost: 0, headcount: new Set() };
        byRole[role].actualHours += hours;
        byRole[role].actualCost += cost;
        byRole[role].headcount.add(log.userId);
        const dateKey = new Date(log.date).toISOString().split("T")[0];
        if (!byDay[dateKey]) byDay[dateKey] = { date: dateKey, scheduledCost: 0, actualCost: 0, sales: 0 };
        byDay[dateKey].actualCost += cost;
        const matchedSchedule = scheduleByUserDate.get(`${log.userId}|${dateKey}`);
        const oid = matchedSchedule?.outletId || "main";
        const oName = matchedSchedule?.outletId ? (outletMap.get(matchedSchedule.outletId)?.name || "Unknown") : "Main";
        if (!byOutlet[oid]) byOutlet[oid] = { name: oName, scheduledHours: 0, actualHours: 0, scheduledCost: 0, actualCost: 0, sales: 0, headcount: new Set() };
        byOutlet[oid].actualHours += hours;
        byOutlet[oid].actualCost += cost;
        byOutlet[oid].headcount.add(log.userId);
      }

      for (const o of periodOrders) {
        const dateKey = new Date(o.createdAt!).toISOString().split("T")[0];
        if (!byDay[dateKey]) byDay[dateKey] = { date: dateKey, scheduledCost: 0, actualCost: 0, sales: 0 };
        byDay[dateKey].sales += parseFloat(o.total || "0");
        if (o.outletId) {
          const oid = o.outletId;
          if (byOutlet[oid]) byOutlet[oid].sales += parseFloat(o.total || "0");
        }
      }

      const byHour: Record<string, { hour: number; scheduledCost: number; actualCost: number; sales: number }> = {};
      for (const s of periodSchedules) {
        const u = userMap.get(s.userId); if (!u) continue;
        const rate = getRate(u, s.hourlyRate);
        const [sh] = s.startTime.split(":").map(Number);
        const [eh] = s.endTime.split(":").map(Number);
        const endH = eh <= sh ? eh + 24 : eh;
        for (let h = sh; h < endH; h++) {
          const hKey = String(h % 24).padStart(2, "0");
          if (!byHour[hKey]) byHour[hKey] = { hour: h % 24, scheduledCost: 0, actualCost: 0, sales: 0 };
          byHour[hKey].scheduledCost += rate;
        }
      }
      for (const log of attendanceLogs) {
        const u = userMap.get(log.userId); if (!u) continue;
        const rate = getRate(u);
        const clockIn = log.clockIn ? new Date(log.clockIn) : null;
        const clockOut = log.clockOut ? new Date(log.clockOut) : null;
        if (clockIn) {
          const startH = clockIn.getHours();
          const hours = parseFloat(log.hoursWorked || "0");
          const endH = startH + Math.ceil(hours);
          for (let h = startH; h < endH; h++) {
            const hKey = String(h % 24).padStart(2, "0");
            if (!byHour[hKey]) byHour[hKey] = { hour: h % 24, scheduledCost: 0, actualCost: 0, sales: 0 };
            byHour[hKey].actualCost += rate;
          }
        }
      }
      for (const o of periodOrders) {
        const h = new Date(o.createdAt!).getHours();
        const hKey = String(h).padStart(2, "0");
        if (!byHour[hKey]) byHour[hKey] = { hour: h, scheduledCost: 0, actualCost: 0, sales: 0 };
        byHour[hKey].sales += parseFloat(o.total || "0");
      }

      const labourPct = totalSales > 0 ? (totalActualCost / totalSales) * 100 : 0;
      const salesPerLabourHour = totalActualHours > 0 ? totalSales / totalActualHours : 0;

      const tenant = await storage.getTenant(tenantId);
      const modConfig = (tenant?.moduleConfig || {}) as Record<string, unknown>;
      const labourTargetPct = parseFloat(String(modConfig.labourTargetPct || "30"));

      res.json({
        kpis: {
          totalScheduledHours: parseFloat(totalScheduledHours.toFixed(2)),
          totalActualHours: parseFloat(totalActualHours.toFixed(2)),
          totalScheduledCost: parseFloat(totalScheduledCost.toFixed(2)),
          totalActualCost: parseFloat(totalActualCost.toFixed(2)),
          totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
          totalOvertimeCost: parseFloat(totalOvertimeCost.toFixed(2)),
          totalSales: parseFloat(totalSales.toFixed(2)),
          labourPct: parseFloat(labourPct.toFixed(1)),
          salesPerLabourHour: parseFloat(salesPerLabourHour.toFixed(2)),
          labourTargetPct,
          headcount: new Set(periodSchedules.map(s => s.userId)).size,
        },
        byRole: Object.entries(byRole).map(([role, d]) => ({
          role, scheduledHours: parseFloat(d.scheduledHours.toFixed(2)), actualHours: parseFloat(d.actualHours.toFixed(2)),
          scheduledCost: parseFloat(d.scheduledCost.toFixed(2)), actualCost: parseFloat(d.actualCost.toFixed(2)),
          headcount: d.headcount.size,
        })),
        byOutlet: Object.entries(byOutlet).map(([id, d]) => ({
          outletId: id, name: d.name,
          scheduledHours: parseFloat(d.scheduledHours.toFixed(2)), actualHours: parseFloat(d.actualHours.toFixed(2)),
          scheduledCost: parseFloat(d.scheduledCost.toFixed(2)), actualCost: parseFloat(d.actualCost.toFixed(2)),
          sales: parseFloat(d.sales.toFixed(2)), labourPct: d.sales > 0 ? parseFloat(((d.actualCost / d.sales) * 100).toFixed(1)) : 0,
          headcount: d.headcount.size,
        })),
        byDay: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
          ...d, scheduledCost: parseFloat(d.scheduledCost.toFixed(2)),
          actualCost: parseFloat(d.actualCost.toFixed(2)), sales: parseFloat(d.sales.toFixed(2)),
          labourPct: d.sales > 0 ? parseFloat(((d.actualCost / d.sales) * 100).toFixed(1)) : 0,
        })),
        byHour: Object.values(byHour).sort((a, b) => a.hour - b.hour).map(h => ({
          hour: h.hour, label: `${String(h.hour).padStart(2, "0")}:00`,
          scheduledCost: parseFloat(h.scheduledCost.toFixed(2)), actualCost: parseFloat(h.actualCost.toFixed(2)),
          sales: parseFloat(h.sales.toFixed(2)),
          labourPct: h.sales > 0 ? parseFloat(((h.actualCost / h.sales) * 100).toFixed(1)) : 0,
        })),
        period,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/workforce/timesheet", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as unknown as Record<string, unknown>;
      const tenantId = String(user.tenantId);
      const fromStr = String(req.query.from || "");
      const toStr = String(req.query.to || "");
      const now = new Date();
      const from = fromStr ? new Date(fromStr) : (() => { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0); return d; })();
      const to = toStr ? (() => { const d = new Date(toStr); d.setHours(23,59,59,999); return d; })() : now;

      const schedules = await storage.getStaffSchedulesByTenant(tenantId);
      const allUsers = await storage.getUsersByTenant(tenantId);
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const logs = await storage.getAttendanceLogsByTenant(tenantId, from, to);
      const logsByUser = new Map<string, typeof logs>();
      for (const l of logs) {
        if (!logsByUser.has(l.userId)) logsByUser.set(l.userId, []);
        logsByUser.get(l.userId)!.push(l);
      }

      const periodSchedules = schedules.filter(s => { const d = new Date(s.date); return d >= from && d <= to; });
      const schedByUser = new Map<string, typeof periodSchedules>();
      for (const s of periodSchedules) {
        if (!schedByUser.has(s.userId)) schedByUser.set(s.userId, []);
        schedByUser.get(s.userId)!.push(s);
      }

      const parseHours = (start: string, end: string) => {
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        let h = (eh * 60 + em) - (sh * 60 + sm); if (h < 0) h += 24 * 60; return h / 60;
      };
      const defaultRates: Record<string, number> = { owner: 50, manager: 35, waiter: 18, kitchen: 20, accountant: 30 };
      const getRate = (u: { hourlyRate?: string | null; role: string }, schedRate?: string | null) => {
        if (schedRate) return parseFloat(schedRate);
        if (u.hourlyRate) return parseFloat(u.hourlyRate);
        return defaultRates[u.role] || 18;
      };

      const allUserIds = new Set([...Array.from(schedByUser.keys()), ...Array.from(logsByUser.keys())]);
      const rows = Array.from(allUserIds).map(userId => {
        const u = userMap.get(userId);
        if (!u) return null;
        const userScheds = schedByUser.get(userId) || [];
        const userLogs = logsByUser.get(userId) || [];
        let scheduledHours = 0; let actualHours = 0;
        for (const s of userScheds) scheduledHours += parseHours(s.startTime, s.endTime);
        for (const l of userLogs) actualHours += parseFloat(l.hoursWorked || "0");
        const rate = getRate(u);
        const otRate = u.overtimeRate ? parseFloat(u.overtimeRate) : rate * 1.5;
        const overtimeHours = Math.max(0, actualHours - scheduledHours);
        const regularHours = actualHours - overtimeHours;
        const actualCost = regularHours * rate + overtimeHours * otRate;
        const scheduledCost = scheduledHours * rate;
        return {
          userId, name: u.name, role: u.role, hourlyRate: rate,
          scheduledHours: parseFloat(scheduledHours.toFixed(2)),
          actualHours: parseFloat(actualHours.toFixed(2)),
          overtimeHours: parseFloat(overtimeHours.toFixed(2)),
          scheduledCost: parseFloat(scheduledCost.toFixed(2)),
          actualCost: parseFloat(actualCost.toFixed(2)),
          variance: parseFloat((actualCost - scheduledCost).toFixed(2)),
          shiftsScheduled: userScheds.length,
          shiftsWorked: userLogs.length,
        };
      }).filter(Boolean);

      res.json({ rows, from: from.toISOString(), to: to.toISOString() });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/workforce/timesheet/csv", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as unknown as Record<string, unknown>;
      const tenantId = String(user.tenantId);
      const fromStr = String(req.query.from || "");
      const toStr = String(req.query.to || "");
      const now = new Date();
      const from = fromStr ? new Date(fromStr) : (() => { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0); return d; })();
      const to = toStr ? (() => { const d = new Date(toStr); d.setHours(23,59,59,999); return d; })() : now;

      const schedules = await storage.getStaffSchedulesByTenant(tenantId);
      const allUsers = await storage.getUsersByTenant(tenantId);
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const logs = await storage.getAttendanceLogsByTenant(tenantId, from, to);
      const logsByUser = new Map<string, typeof logs>();
      for (const l of logs) { if (!logsByUser.has(l.userId)) logsByUser.set(l.userId, []); logsByUser.get(l.userId)!.push(l); }
      const periodSchedules = schedules.filter(s => { const d = new Date(s.date); return d >= from && d <= to; });
      const schedByUser = new Map<string, typeof periodSchedules>();
      for (const s of periodSchedules) { if (!schedByUser.has(s.userId)) schedByUser.set(s.userId, []); schedByUser.get(s.userId)!.push(s); }
      const parseHours = (start: string, end: string) => { const [sh, sm] = start.split(":").map(Number); const [eh, em] = end.split(":").map(Number); let h = (eh * 60 + em) - (sh * 60 + sm); if (h < 0) h += 24 * 60; return h / 60; };
      const defaultRates: Record<string, number> = { owner: 50, manager: 35, waiter: 18, kitchen: 20, accountant: 30 };
      const getRate = (u: { hourlyRate?: string | null; role: string }, schedRate?: string | null) => { if (schedRate) return parseFloat(schedRate); if (u.hourlyRate) return parseFloat(u.hourlyRate); return defaultRates[u.role] || 18; };

      const allUserIds = new Set([...Array.from(schedByUser.keys()), ...Array.from(logsByUser.keys())]);
      const csvLines = ["Name,Role,Hourly Rate,Scheduled Hours,Actual Hours,Overtime Hours,Scheduled Cost,Actual Cost,Variance,Shifts Scheduled,Shifts Worked"];
      for (const userId of allUserIds) {
        const u = userMap.get(userId); if (!u) continue;
        const userScheds = schedByUser.get(userId) || [];
        const userLogs = logsByUser.get(userId) || [];
        let scheduledHours = 0; let actualHours = 0;
        for (const s of userScheds) scheduledHours += parseHours(s.startTime, s.endTime);
        for (const l of userLogs) actualHours += parseFloat(l.hoursWorked || "0");
        const rate = getRate(u);
        const otRate = u.overtimeRate ? parseFloat(u.overtimeRate) : rate * 1.5;
        const overtimeHours = Math.max(0, actualHours - scheduledHours);
        const regularHours = actualHours - overtimeHours;
        const actualCost = regularHours * rate + overtimeHours * otRate;
        const scheduledCost = scheduledHours * rate;
        csvLines.push(`"${u.name}",${u.role},${rate},${scheduledHours.toFixed(2)},${actualHours.toFixed(2)},${overtimeHours.toFixed(2)},${scheduledCost.toFixed(2)},${actualCost.toFixed(2)},${(actualCost - scheduledCost).toFixed(2)},${userScheds.length},${userLogs.length}`);
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="timesheet_${from.toISOString().split("T")[0]}_${to.toISOString().split("T")[0]}.csv"`);
      res.send(csvLines.join("\n"));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/workforce/alerts", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as unknown as Record<string, unknown>;
      const tenantId = String(user.tenantId);
      const tenant = await storage.getTenant(tenantId);
      const modConfig = (tenant?.moduleConfig || {}) as Record<string, unknown>;
      const labourTargetPct = parseFloat(String(modConfig.labourTargetPct || "30"));

      const now = new Date();
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 6); weekAgo.setHours(0,0,0,0);
      const schedules = await storage.getStaffSchedulesByTenant(tenantId);
      const allUsers = await storage.getUsersByTenant(tenantId);
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const logs = await storage.getAttendanceLogsByTenant(tenantId, weekAgo, now);
      const orders = await storage.getOrdersByTenant(tenantId);

      const parseHours = (start: string, end: string) => { const [sh, sm] = start.split(":").map(Number); const [eh, em] = end.split(":").map(Number); let h = (eh * 60 + em) - (sh * 60 + sm); if (h < 0) h += 24 * 60; return h / 60; };
      const defaultRates: Record<string, number> = { owner: 50, manager: 35, waiter: 18, kitchen: 20, accountant: 30 };

      const byDay: Record<string, { cost: number; sales: number }> = {};
      for (const log of logs) {
        const u = userMap.get(log.userId); if (!u) continue;
        const rate = u.hourlyRate ? parseFloat(u.hourlyRate) : (defaultRates[u.role] || 18);
        const hours = parseFloat(log.hoursWorked || "0");
        const dateKey = new Date(log.date).toISOString().split("T")[0];
        if (!byDay[dateKey]) byDay[dateKey] = { cost: 0, sales: 0 };
        byDay[dateKey].cost += hours * rate;
      }
      for (const s of schedules.filter(s => { const d = new Date(s.date); return d >= weekAgo && d <= now; })) {
        const u = userMap.get(s.userId); if (!u) continue;
        const dateKey = new Date(s.date).toISOString().split("T")[0];
        if (!byDay[dateKey]) byDay[dateKey] = { cost: 0, sales: 0 };
      }
      for (const o of orders.filter(o => { const d = new Date(o.createdAt!); return d >= weekAgo && d <= now && o.status !== "voided" && o.status !== "cancelled"; })) {
        const dateKey = new Date(o.createdAt!).toISOString().split("T")[0];
        if (!byDay[dateKey]) byDay[dateKey] = { cost: 0, sales: 0 };
        byDay[dateKey].sales += parseFloat(o.total || "0");
      }

      const alerts = Object.entries(byDay)
        .filter(([, d]) => d.sales > 0 && (d.cost / d.sales) * 100 > labourTargetPct)
        .map(([date, d]) => ({
          date, labourCost: parseFloat(d.cost.toFixed(2)), sales: parseFloat(d.sales.toFixed(2)),
          labourPct: parseFloat(((d.cost / d.sales) * 100).toFixed(1)), target: labourTargetPct,
          severity: ((d.cost / d.sales) * 100) > labourTargetPct * 1.2 ? "critical" : "warning",
        }))
        .sort((a, b) => b.labourPct - a.labourPct);

      const overtimeAlerts = logs.filter(l => parseFloat(l.hoursWorked || "0") > 8).map(l => {
        const u = userMap.get(l.userId);
        return { date: new Date(l.date).toISOString().split("T")[0], userId: l.userId, name: u?.name || "—", hours: parseFloat(l.hoursWorked || "0"), overtimeHours: parseFloat(l.hoursWorked || "0") - 8 };
      });

      res.json({ labourTargetPct, costAlerts: alerts, overtimeAlerts });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/workforce/snapshots", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as unknown as Record<string, unknown>;
      const tenantId = String(user.tenantId);
      const fromStr = String(req.query.from || "");
      const toStr = String(req.query.to || "");
      const now = new Date();
      const from = fromStr ? new Date(fromStr) : (() => { const d = new Date(now); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0); return d; })();
      const to = toStr ? new Date(toStr) : now;
      const snapshots = await storage.getLabourCostSnapshots(tenantId, from, to);
      res.json(snapshots);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/workforce/snapshots/generate", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as unknown as Record<string, unknown>;
      const tenantId = String(user.tenantId);
      const dateStr = String(req.body.date || "");
      const targetDate = dateStr ? new Date(dateStr) : (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })();
      targetDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDate); nextDay.setDate(nextDay.getDate() + 1);

      const schedules = await storage.getStaffSchedulesByTenant(tenantId);
      const allUsers = await storage.getUsersByTenant(tenantId);
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const logs = await storage.getAttendanceLogsByTenant(tenantId, targetDate, nextDay);
      const orders = await storage.getOrdersByTenant(tenantId);

      const daySchedules = schedules.filter(s => { const d = new Date(s.date); d.setHours(0,0,0,0); return d.getTime() === targetDate.getTime(); });
      const dayOrders = orders.filter(o => { const d = new Date(o.createdAt!); return d >= targetDate && d < nextDay && o.status !== "voided" && o.status !== "cancelled"; });
      const totalSales = dayOrders.reduce((s, o) => s + parseFloat(o.total || "0"), 0);

      const parseHours = (start: string, end: string) => { const [sh, sm] = start.split(":").map(Number); const [eh, em] = end.split(":").map(Number); let h = (eh * 60 + em) - (sh * 60 + sm); if (h < 0) h += 24 * 60; return h / 60; };
      const defaultRates: Record<string, number> = { owner: 50, manager: 35, waiter: 18, kitchen: 20, accountant: 30 };
      const standardHours = 8;

      const byRole: Record<string, { scheduledHrs: number; actualHrs: number; overtimeHrs: number; scheduledCost: number; actualCost: number; overtimeCost: number; headcount: Set<string> }> = {};

      for (const s of daySchedules) {
        const u = userMap.get(s.userId); if (!u) continue;
        const hrs = parseHours(s.startTime, s.endTime);
        const rate = s.hourlyRate ? parseFloat(s.hourlyRate) : (u.hourlyRate ? parseFloat(u.hourlyRate) : (defaultRates[u.role] || 18));
        const role = s.role || u.role;
        if (!byRole[role]) byRole[role] = { scheduledHrs: 0, actualHrs: 0, overtimeHrs: 0, scheduledCost: 0, actualCost: 0, overtimeCost: 0, headcount: new Set() };
        byRole[role].scheduledHrs += hrs;
        byRole[role].scheduledCost += hrs * rate;
        byRole[role].headcount.add(s.userId);
      }

      for (const log of logs) {
        const u = userMap.get(log.userId); if (!u) continue;
        const hrs = parseFloat(log.hoursWorked || "0");
        const rate = u.hourlyRate ? parseFloat(u.hourlyRate) : (defaultRates[u.role] || 18);
        const otRate = u.overtimeRate ? parseFloat(u.overtimeRate) : rate * 1.5;
        const regularHrs = Math.min(hrs, standardHours);
        const overtimeHrs = Math.max(0, hrs - standardHours);
        const role = u.role;
        if (!byRole[role]) byRole[role] = { scheduledHrs: 0, actualHrs: 0, overtimeHrs: 0, scheduledCost: 0, actualCost: 0, overtimeCost: 0, headcount: new Set() };
        byRole[role].actualHrs += hrs;
        byRole[role].overtimeHrs += overtimeHrs;
        byRole[role].actualCost += regularHrs * rate + overtimeHrs * otRate;
        byRole[role].overtimeCost += overtimeHrs * otRate;
        byRole[role].headcount.add(log.userId);
      }

      const created: Array<Record<string, unknown>> = [];
      for (const [role, d] of Object.entries(byRole)) {
        const totalActualCost = d.actualCost;
        const snapshot = await storage.createLabourCostSnapshot({
          tenantId, date: targetDate, role,
          scheduledHours: String(d.scheduledHrs.toFixed(2)),
          actualHours: String(d.actualHrs.toFixed(2)),
          overtimeHours: String(d.overtimeHrs.toFixed(2)),
          scheduledCost: String(d.scheduledCost.toFixed(2)),
          actualCost: String(totalActualCost.toFixed(2)),
          overtimeCost: String(d.overtimeCost.toFixed(2)),
          salesRevenue: String(totalSales.toFixed(2)),
          labourPct: totalSales > 0 ? String(((totalActualCost / totalSales) * 100).toFixed(1)) : "0",
          headcount: d.headcount.size,
        });
        created.push(snapshot);
      }

      res.json({ date: targetDate.toISOString().split("T")[0], snapshotsCreated: created.length, snapshots: created });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/workforce/settings", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as unknown as Record<string, unknown>;
      const tenantId = String(user.tenantId);
      const { labourTargetPct } = req.body;
      const parsed = parseFloat(labourTargetPct);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) return res.status(400).json({ message: "labourTargetPct must be a number between 0 and 100" });
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      const modConfig = (tenant.moduleConfig || {}) as Record<string, unknown>;
      modConfig.labourTargetPct = parsed;
      await storage.updateTenant(tenantId, { moduleConfig: modConfig });
      res.json({ success: true, labourTargetPct: modConfig.labourTargetPct });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/permissions", requireAuth, async (req, res) => {
    const user = req.user as unknown as Record<string, unknown>;
    const role = String(user.role);
    const perms = getPermissionsForRole(role);
    res.json({ role, permissions: perms });
  });

  app.post("/api/permissions/check", requireAuth, async (req, res) => {
    const user = req.user as unknown as Record<string, unknown>;
    const { action } = req.body;
    if (!action) return res.status(400).json({ message: "action is required" });
    const allowed = can(user as { id: string; role: string; tenantId: string }, action);
    const needsApproval = needsSupervisorApproval(user as { id: string; role: string; tenantId: string }, action);
    res.json({ action, allowed, needsSupervisorApproval: needsApproval });
  });

  app.post("/api/supervisor/verify", requireAuth, async (req, res) => {
    try {
      const user = req.user as unknown as Record<string, unknown>;
      const tenantId = String(user.tenantId);
      const { username, password, action } = req.body;
      if (!username || !password) return res.status(400).json({ message: "Supervisor credentials required" });

      const supervisor = await storage.getUserByUsername(username);
      if (!supervisor || supervisor.tenantId !== tenantId) {
        await auditLogFromReq(req, { action: "supervisor_verify_failed", metadata: { attemptedUsername: username, forAction: action } });
        return res.status(401).json({ message: "Invalid supervisor credentials" });
      }
      const valid = await comparePasswords(password, supervisor.password);
      if (!valid) {
        await auditLogFromReq(req, { action: "supervisor_verify_failed", metadata: { attemptedUsername: username, forAction: action } });
        return res.status(401).json({ message: "Invalid supervisor credentials" });
      }
      if (!can({ id: supervisor.id, role: supervisor.role, tenantId: supervisor.tenantId }, "supervisor_override")) {
        return res.status(403).json({ message: "User does not have supervisor privileges" });
      }

      await auditLogFromReq(req, {
        action: "supervisor_override",
        metadata: { supervisorId: supervisor.id, supervisorName: supervisor.name, forAction: action, requestedBy: String(user.name) },
        supervisorId: supervisor.id,
      });

      const { password: _, ...safeSupervisor } = supervisor;
      res.json({ verified: true, supervisor: safeSupervisor });
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Server error" }); }
  });

  app.get("/api/audit-log", requireAuth, async (req, res) => {
    try {
      const user = req.user as unknown as Record<string, unknown>;
      const tenantId = String(user.tenantId);
      if (!can({ id: String(user.id), role: String(user.role), tenantId }, "view_audit_log")) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const filters: Record<string, unknown> = {};
      if (req.query.from) filters.from = new Date(String(req.query.from));
      if (req.query.to) filters.to = new Date(String(req.query.to));
      if (req.query.userId) filters.userId = String(req.query.userId);
      if (req.query.action) filters.action = String(req.query.action);
      if (req.query.entityType) filters.entityType = String(req.query.entityType);
      if (req.query.outletId) filters.outletId = String(req.query.outletId);
      if (req.query.entityId) filters.entityId = String(req.query.entityId);
      if (req.query.limit) filters.limit = parseInt(String(req.query.limit), 10);
      if (req.query.offset) filters.offset = parseInt(String(req.query.offset), 10);

      const result = await storage.getAuditEventsByTenant(tenantId, filters as {
        from?: Date; to?: Date; userId?: string; action?: string; entityType?: string; outletId?: string; entityId?: string; limit?: number; offset?: number;
      });
      res.json(result);
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Server error" }); }
  });

  app.get("/api/audit-log/entity/:entityType/:entityId", requireAuth, async (req, res) => {
    try {
      const user = req.user as unknown as Record<string, unknown>;
      const tenantId = String(user.tenantId);
      if (!can({ id: String(user.id), role: String(user.role), tenantId }, "view_audit_log")) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const events = await storage.getAuditEventsByEntity(tenantId, req.params.entityType, req.params.entityId);
      res.json({ events });
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Server error" }); }
  });

  app.get("/api/audit-log/export", requireAuth, async (req, res) => {
    try {
      const user = req.user as unknown as Record<string, unknown>;
      const tenantId = String(user.tenantId);
      if (!can({ id: String(user.id), role: String(user.role), tenantId }, "view_audit_log")) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const filters: Record<string, unknown> = { limit: 5000 };
      if (req.query.from) filters.from = new Date(String(req.query.from));
      if (req.query.to) filters.to = new Date(String(req.query.to));
      if (req.query.userId) filters.userId = String(req.query.userId);
      if (req.query.action) filters.action = String(req.query.action);
      if (req.query.entityType) filters.entityType = String(req.query.entityType);

      const result = await storage.getAuditEventsByTenant(tenantId, filters as {
        from?: Date; to?: Date; userId?: string; action?: string; entityType?: string; limit?: number;
      });

      const headers = ["Date", "User", "Action", "Entity Type", "Entity Name", "Entity ID", "IP Address", "Supervisor"];
      const rows = result.events.map(e => [
        e.createdAt ? new Date(e.createdAt).toISOString() : "",
        e.userName || "",
        e.action,
        e.entityType || "",
        e.entityName || "",
        e.entityId || "",
        e.ipAddress || "",
        e.supervisorId || "",
      ]);
      const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=audit-log.csv");
      res.send(csv);
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Server error" }); }
  });

  app.get("/api/audit-log/actions", requireAuth, async (_req, res) => {
    const actions = [
      "login", "logout", "login_failed",
      "order_created", "order_updated", "order_voided",
      "menu_item_created", "menu_item_updated", "menu_item_deleted",
      "menu_category_created", "menu_category_updated", "menu_category_deleted",
      "inventory_adjusted", "inventory_item_created", "inventory_item_updated",
      "offer_created", "offer_updated", "offer_deleted",
      "user_created", "user_updated", "user_role_changed",
      "tenant_settings_updated", "security_settings_updated",
      "recipe_created", "recipe_updated", "recipe_deleted",
      "supervisor_override", "supervisor_verify_failed",
      "otp_challenge_issued", "otp_verified", "otp_verify_failed",
      "device_trust_changed", "device_session_revoked",
      "table_updated", "reservation_created", "reservation_updated",
    ];
    res.json(actions);
  });

  app.get("/api/security/settings", requireAuth, async (req, res) => {
    try {
      const user = req.user as unknown as Record<string, unknown>;
      const tenantId = String(user.tenantId);
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      const modConfig = (tenant.moduleConfig || {}) as Record<string, unknown>;
      res.json({
        idleTimeoutMinutes: modConfig.idleTimeoutMinutes ?? 30,
        maxConcurrentSessions: modConfig.maxConcurrentSessions ?? 5,
        requireSupervisorForVoid: modConfig.requireSupervisorForVoid ?? true,
        requireSupervisorForLargeDiscount: modConfig.requireSupervisorForLargeDiscount ?? true,
        largeDiscountThreshold: modConfig.largeDiscountThreshold ?? 20,
        requireSupervisorForPriceChange: modConfig.requireSupervisorForPriceChange ?? true,
        requireSupervisorForLargeStockAdjustment: modConfig.requireSupervisorForLargeStockAdjustment ?? true,
        largeStockAdjustmentThreshold: modConfig.largeStockAdjustmentThreshold ?? 50,
      });
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Server error" }); }
  });

  app.patch("/api/security/settings", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as unknown as Record<string, unknown>;
      const tenantId = String(user.tenantId);
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      const modConfig = (tenant.moduleConfig || {}) as Record<string, unknown>;
      const allowed = ["idleTimeoutMinutes", "maxConcurrentSessions", "requireSupervisorForVoid", "requireSupervisorForLargeDiscount", "largeDiscountThreshold", "requireSupervisorForPriceChange", "requireSupervisorForLargeStockAdjustment", "largeStockAdjustmentThreshold"];
      const before: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in req.body) {
          before[key] = modConfig[key];
          modConfig[key] = req.body[key];
        }
      }
      await storage.updateTenant(tenantId, { moduleConfig: modConfig });
      await auditLogFromReq(req, { action: "security_settings_updated", entityType: "tenant", entityId: tenantId, before, after: req.body });
      res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Server error" }); }
  });

  // Device Sessions
  app.get("/api/device-sessions", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const sessions = await db.select().from(deviceSessions)
        .where(eq(deviceSessions.userId, user.id))
        .orderBy(desc(deviceSessions.lastActive));
      res.json(sessions);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/device-sessions", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { deviceFingerprint, deviceName, browser, os } = req.body;
      const ip = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "";
      const [session] = await db.insert(deviceSessions).values({
        tenantId: user.tenantId,
        userId: user.id,
        deviceFingerprint,
        deviceName: deviceName || "Unknown Device",
        browser: browser || "",
        os: os || "",
        ipAddress: ip,
        isTrusted: false,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).returning();
      res.json(session);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/device-sessions/:id/trust", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const [session] = await db.select().from(deviceSessions)
        .where(and(eq(deviceSessions.id, req.params.id), eq(deviceSessions.userId, user.id)));
      if (!session) return res.status(404).json({ message: "Session not found" });
      const [updated] = await db.update(deviceSessions)
        .set({ isTrusted: req.body.trusted ?? true })
        .where(eq(deviceSessions.id, req.params.id)).returning();
      auditLogFromReq(req, { action: "device_trust_changed", entityType: "device_session", entityId: req.params.id, metadata: { trusted: req.body.trusted ?? true, deviceName: session.deviceName } });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/device-sessions/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const [session] = await db.select().from(deviceSessions)
        .where(and(eq(deviceSessions.id, req.params.id), eq(deviceSessions.userId, user.id)));
      if (!session) return res.status(404).json({ message: "Session not found" });
      await db.delete(deviceSessions).where(eq(deviceSessions.id, req.params.id));
      auditLogFromReq(req, { action: "device_session_revoked", entityType: "device_session", entityId: req.params.id, metadata: { deviceName: session.deviceName } });
      res.json({ message: "Session revoked" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Supervisor OTP simulation
  app.post("/api/supervisor/otp-challenge", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { action } = req.body;
      const code = String(100000 + Math.floor(Math.random() * 900000));
      const cacheKey = `otp:${user.tenantId}:${action}:${Date.now()}`;
      (global as any).__otpCache = (global as any).__otpCache || {};
      (global as any).__otpCache[cacheKey] = { code, action, userId: user.id, expiresAt: Date.now() + 5 * 60 * 1000 };
      auditLogFromReq(req, { action: "otp_challenge_issued", metadata: { forAction: action, cacheKey } });
      res.json({ challengeId: cacheKey, expiresIn: 300, message: `OTP code (simulated): ${code}` });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/supervisor/otp-verify", requireAuth, async (req, res) => {
    try {
      const { challengeId, code } = req.body;
      const cache = (global as any).__otpCache || {};
      const entry = cache[challengeId];
      if (!entry) return res.status(400).json({ message: "Challenge not found or expired" });
      if (entry.expiresAt < Date.now()) {
        delete cache[challengeId];
        return res.status(400).json({ message: "OTP expired" });
      }
      if (entry.code !== code) {
        auditLogFromReq(req, { action: "otp_verify_failed", metadata: { challengeId } });
        return res.status(403).json({ message: "Invalid OTP code" });
      }
      delete cache[challengeId];
      auditLogFromReq(req, { action: "otp_verified", metadata: { challengeId, forAction: entry.action } });
      res.json({ verified: true, action: entry.action });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // User role change audit
  app.patch("/api/users/:id/role", requireRole("owner"), requirePermission("manage_users"), async (req, res) => {
    try {
      const user = req.user as any;
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser || targetUser.tenantId !== user.tenantId) return res.status(404).json({ message: "User not found" });
      const oldRole = targetUser.role;
      const updated = await storage.updateUser(req.params.id, { role: req.body.role });
      auditLogFromReq(req, {
        action: "user_role_changed",
        entityType: "user",
        entityId: req.params.id,
        entityName: targetUser.name,
        before: { role: oldRole },
        after: { role: req.body.role },
      });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return httpServer;
}