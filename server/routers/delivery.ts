import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";
import { deliveryOrders as deliveryOrdersTable } from "@shared/schema";
import { sendContactSalesEmail, sendSupportEmail, emailConfig } from "../email";
import { emitToTenant } from "../realtime";

export function registerDeliveryRoutes(app: Express): void {
  app.get("/api/delivery-orders", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const [data, [{ total }]] = await Promise.all([
        storage.getDeliveryOrdersByTenant(user.tenantId, { limit, offset }),
        db.select({ total: sql<number>`count(*)::int` }).from(deliveryOrdersTable).where(eq(deliveryOrdersTable.tenantId, user.tenantId)),
      ]);
      res.json({ data, total: Number(total), limit, offset, hasMore: offset + data.length < Number(total) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
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
      emitToTenant(user.tenantId, "delivery:updated", { deliveryOrderId: delivery.id, status: delivery.status });
      res.json(delivery);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/delivery-orders/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const body = { ...req.body };
    for (const field of ["deliveredAt", "scheduledAt", "createdAt"] as const) {
      if (body[field] != null && typeof body[field] === "string") {
        body[field] = new Date(body[field]);
      }
    }
    if (body.status === "in_transit" || body.status === "out_for_delivery") {
      const existing = await storage.getDeliveryOrderByTenant(req.params.id, user.tenantId);
      if (!existing) return res.status(404).json({ message: "Delivery order not found" });
      const driverName = body.driverName || existing.driverName;
      if (!driverName || String(driverName).trim() === "") {
        return res.status(400).json({ message: "A delivery agent must be assigned before marking the order as Out for Delivery." });
      }
    }
    const delivery = await storage.updateDeliveryOrderByTenant(req.params.id, user.tenantId, body);
    if (!delivery) return res.status(404).json({ message: "Delivery order not found" });
    emitToTenant(user.tenantId, "delivery:updated", { deliveryOrderId: req.params.id, status: delivery.status });
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

  app.get("/api/contact-config", (_req, res) => {
    res.json({
      salesEnabled: emailConfig.enableContactSales,
      supportEnabled: emailConfig.enableContactSupport,
    });
  });

  app.post("/api/contact/sales", async (req, res) => {
    try {
      const { name, email, restaurantName, phone, message } = req.body;
      if (!name || !email || !restaurantName) {
        return res.status(400).json({ message: "Name, email, and restaurant name are required" });
      }
      if (!emailConfig.enableContactSales) {
        return res.status(503).json({ message: "Contact sales is not available at this time" });
      }
      await sendContactSalesEmail({ name, email, restaurantName, phone, message });
      res.json({ success: true, message: "Your inquiry has been sent. We'll get back to you soon!" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/contact/support", async (req, res) => {
    try {
      const { name, email, subject, message, priority } = req.body;
      if (!name || !email || !subject || !message) {
        return res.status(400).json({ message: "Name, email, subject, and message are required" });
      }
      if (!emailConfig.enableContactSupport) {
        return res.status(503).json({ message: "Support contact is not available at this time" });
      }
      await sendSupportEmail({ name, email, subject, message, priority });
      res.json({ success: true, message: "Your support request has been submitted. We'll respond shortly!" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
