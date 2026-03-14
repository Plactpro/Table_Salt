import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireRole, hashPassword } from "./auth";
import {
  insertTenantSchema, insertMenuCategorySchema, insertMenuItemSchema,
  insertTableSchema, insertReservationSchema, insertOrderSchema,
  insertOrderItemSchema, insertInventoryItemSchema, insertStockMovementSchema,
  insertCustomerSchema, insertStaffScheduleSchema, insertUserSchema,
  insertOfferSchema, insertDeliveryOrderSchema, insertEmployeePerformanceLogSchema,
  insertSalesInquirySchema, insertSupportTicketSchema,
  insertCleaningTemplateSchema, insertCleaningLogSchema,
} from "@shared/schema";
import { sendContactSalesEmail, sendSupportEmail, emailConfig } from "./email";

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
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const { password: _, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
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
    const outlet = await storage.updateOutlet(req.params.id, req.body);
    res.json(outlet);
  });

  app.delete("/api/outlets/:id", requireRole("owner", "manager"), async (req, res) => {
    await storage.deleteOutlet(req.params.id);
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

  app.post("/api/menu-items", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const item = await storage.createMenuItem({ ...req.body, tenantId: user.tenantId });
    res.json(item);
  });

  app.patch("/api/menu-items/:id", requireRole("owner", "manager"), async (req, res) => {
    const item = await storage.updateMenuItem(req.params.id, req.body);
    res.json(item);
  });

  app.delete("/api/menu-items/:id", requireRole("owner", "manager"), async (req, res) => {
    await storage.deleteMenuItem(req.params.id);
    res.json({ message: "Deleted" });
  });

  app.get("/api/tables", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tbs = await storage.getTablesByTenant(user.tenantId);
    res.json(tbs);
  });

  app.post("/api/tables", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const tbl = await storage.createTable({ ...req.body, tenantId: user.tenantId });
    res.json(tbl);
  });

  app.patch("/api/tables/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tbl = await storage.updateTableByTenant(req.params.id, user.tenantId, req.body);
    if (!tbl) return res.status(404).json({ message: "Table not found" });
    res.json(tbl);
  });

  app.delete("/api/tables/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteTableByTenant(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/reservations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const reservationsList = await storage.getReservationsByTenant(user.tenantId);
    res.json(reservationsList);
  });

  app.post("/api/reservations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const reservation = await storage.createReservation({ ...req.body, tenantId: user.tenantId });
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
      const { items, ...orderData } = req.body;
      const order = await storage.createOrder({ ...orderData, tenantId: user.tenantId, waiterId: user.id });
      if (items && items.length > 0) {
        for (const item of items) {
          await storage.createOrderItem({ ...item, orderId: order.id });
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
    const user = req.user as Express.User & { tenantId: string };
    const existing = await storage.getOrder(req.params.id);
    if (!existing) return res.status(404).json({ message: "Order not found" });
    if (existing.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });

    const updateData = { ...req.body };

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
    if (req.body.status === "paid" || req.body.status === "cancelled") {
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

  app.post("/api/inventory", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const item = await storage.createInventoryItem({ ...req.body, tenantId: user.tenantId });
    res.json(item);
  });

  app.patch("/api/inventory/:id", requireRole("owner", "manager"), async (req, res) => {
    const item = await storage.updateInventoryItem(req.params.id, req.body);
    res.json(item);
  });

  app.delete("/api/inventory/:id", requireRole("owner", "manager"), async (req, res) => {
    await storage.deleteInventoryItem(req.params.id);
    res.json({ message: "Deleted" });
  });

  app.post("/api/inventory/:id/adjust", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const { quantity, type, reason } = req.body;
    const item = await storage.getInventoryItem(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });
    const newStock = Number(item.currentStock) + (type === "in" ? Number(quantity) : -Number(quantity));
    await storage.updateInventoryItem(req.params.id, { currentStock: String(newStock) });
    await storage.createStockMovement({
      tenantId: user.tenantId,
      itemId: req.params.id,
      type,
      quantity: String(quantity),
      reason,
    });
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

  app.get("/api/tenant", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tenant = await storage.getTenant(user.tenantId);
    res.json(tenant);
  });

  app.patch("/api/tenant", requireRole("owner"), async (req, res) => {
    const user = req.user as any;
    const tenant = await storage.updateTenant(user.tenantId, req.body);
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

  app.post("/api/offers", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const offer = await storage.createOffer({ ...req.body, tenantId: user.tenantId });
      res.json(offer);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/offers/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const offer = await storage.updateOfferByTenant(req.params.id, user.tenantId, req.body);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    res.json(offer);
  });

  app.delete("/api/offers/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteOfferByTenant(req.params.id, user.tenantId);
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

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return httpServer;
}