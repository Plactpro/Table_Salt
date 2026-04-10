import type { Express } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
import { eq, sql, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";
import { deliveryOrders as deliveryOrdersTable } from "@shared/schema";
import { sendContactSalesEmail, sendSupportEmail, emailConfig } from "../email";
import { emitToTenant } from "../realtime";

export function registerDeliveryRoutes(app: Express): void {
  
  // [POS-04] Unified delivery view: merge delivery_orders + orders where order_type is delivery
  app.get("/api/delivery-orders/unified", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      // 1. Get from delivery_orders table
      const [deliveryData, [{ total: delTotal }]] = await Promise.all([
        storage.getDeliveryOrdersByTenant(user.tenantId, { limit, offset }),
        db.select({ total: sql<number>`count(*)::int` }).from(deliveryOrdersTable).where(eq(deliveryOrdersTable.tenantId, user.tenantId)),
      ]);

      // 2. Get from orders table where order_type is delivery-related
      const { rows: mainDeliveryOrders } = await pool.query(
        `SELECT o.id, o.tenant_id, o.order_number, o.customer_name, o.customer_phone,
                o.notes, o.status, o.order_type, o.created_at, o.total, o.outlet_id,
                o.channel_order_id
         FROM orders o
         WHERE o.tenant_id = $1
           AND o.order_type IN ('delivery', 'phone_delivery', 'online_delivery', 'third_party')
           AND o.status NOT IN ('paid', 'completed', 'voided')
         ORDER BY o.created_at DESC
         LIMIT $2 OFFSET $3`,
        [user.tenantId, limit, offset]
      );

      // 3. Convert main orders to DeliveryOrder-like shape
      const mainOrdersMapped = mainDeliveryOrders.map((o: any) => {
        const notes = o.notes || '';
        const addressMatch = notes.match(/Address:\s*([^|]+)/);
        return {
          id: 'order-' + o.id,
          _sourceOrderId: o.id,
          tenantId: o.tenant_id,
          orderId: o.id,
          customerName: o.customer_name || null,
          customerPhone: o.customer_phone || null,
          customerAddress: addressMatch ? addressMatch[1].trim() : (o.notes || 'No address'),
          deliveryPartner: o.order_type === 'phone_delivery' ? 'Phone Order' : (o.order_type === 'online_delivery' ? 'Online' : null),
          driverName: null,
          driverPhone: null,
          status: o.status === 'new' ? 'pending' : (o.status === 'sent_to_kitchen' ? 'pending' : (o.status === 'in_progress' ? 'assigned' : (o.status === 'ready' ? 'picked_up' : o.status))),
          estimatedTime: null,
          actualTime: null,
          deliveryFee: null,
          trackingNotes: null,
          notes: o.notes,
          createdAt: o.created_at,
          deliveredAt: null,
          orderNumber: o.order_number,
          orderTotal: o.total,
          _fromMainOrders: true,
        };
      });

      // 4. Deduplicate: if a delivery_order has orderId matching a main order, skip the main order
      const linkedOrderIds = new Set(deliveryData.filter((d: any) => d.orderId).map((d: any) => d.orderId));
      const uniqueMainOrders = mainOrdersMapped.filter((m: any) => !linkedOrderIds.has(m._sourceOrderId));

      const combined = [...deliveryData, ...uniqueMainOrders];
      const totalCount = Number(delTotal) + uniqueMainOrders.length;

      res.json({ data: combined, total: totalCount, limit, offset, hasMore: offset + combined.length < totalCount });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

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
