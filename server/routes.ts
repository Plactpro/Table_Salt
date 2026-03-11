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
} from "@shared/schema";

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

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { password: _, ...safeUser } = req.user as any;
    res.json(safeUser);
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

  app.post("/api/outlets", requireRole("owner"), async (req, res) => {
    const user = req.user as any;
    const outlet = await storage.createOutlet({ ...req.body, tenantId: user.tenantId });
    res.json(outlet);
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
    const tbl = await storage.updateTable(req.params.id, req.body);
    res.json(tbl);
  });

  app.delete("/api/tables/:id", requireRole("owner", "manager"), async (req, res) => {
    await storage.deleteTable(req.params.id);
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
    const reservation = await storage.updateReservation(req.params.id, req.body);
    res.json(reservation);
  });

  app.get("/api/orders", requireAuth, async (req, res) => {
    const user = req.user as any;
    const ordersList = await storage.getOrdersByTenant(user.tenantId);
    res.json(ordersList);
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
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
    const order = await storage.updateOrder(req.params.id, req.body);
    if (req.body.status === "paid" || req.body.status === "cancelled") {
      const fullOrder = await storage.getOrder(req.params.id);
      if (fullOrder?.tableId) {
        await storage.updateTable(fullOrder.tableId, { status: "free" });
      }
    }
    res.json(order);
  });

  app.get("/api/order-items/:orderId", requireAuth, async (req, res) => {
    const items = await storage.getOrderItemsByOrder(req.params.orderId);
    res.json(items);
  });

  app.patch("/api/order-items/:id", requireAuth, async (req, res) => {
    const item = await storage.updateOrderItem(req.params.id, req.body);
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

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return httpServer;
}