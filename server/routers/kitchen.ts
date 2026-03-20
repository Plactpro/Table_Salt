import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { emitToTenant } from "../realtime";

export function registerKitchenRoutes(app: Express): void {
  app.get("/api/kitchen-stations", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getKitchenStationsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/kitchen-stations", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.createKitchenStation({ ...req.body, tenantId: user.tenantId }));
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
        tickets.push({ ...o, tableNumber: o.tableId ? tableMap.get(o.tableId) : undefined, items: stationFilter ? filteredItems : items });
      }
      res.json(tickets);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/kds/order-items/:id/status", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const { status } = req.body;
      const validTransitions: Record<string, string[]> = { pending: ["cooking"], cooking: ["ready"], ready: ["recalled", "served"], recalled: ["cooking"] };
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
      let newOrderStatus: string | null = null;
      if (status === "cooking" && (order.status === "new" || order.status === "sent_to_kitchen")) { await storage.updateOrder(item.orderId, { status: "in_progress" }); newOrderStatus = "in_progress"; }
      if (status === "recalled" && order.status === "ready") { await storage.updateOrder(item.orderId, { status: "in_progress" }); newOrderStatus = "in_progress"; }
      if (status === "ready" || status === "served") {
        const freshItems = await storage.getOrderItemsByOrder(item.orderId);
        const allServed = freshItems.every(i => i.status === "served");
        const allReadyOrServed = freshItems.every(i => i.status === "ready" || i.status === "served");
        if (allServed) { await storage.updateOrder(item.orderId, { status: "served" }); newOrderStatus = "served"; }
        else if (allReadyOrServed) { await storage.updateOrder(item.orderId, { status: "ready" }); newOrderStatus = "ready"; }
      }
      emitToTenant(user.tenantId, "order:item_updated", { itemId: req.params.id, orderId: item.orderId, status: updated.status, orderStatus: newOrderStatus || order.status });
      if (newOrderStatus && newOrderStatus !== order.status) {
        const terminalKds = ["served"];
        if (terminalKds.includes(newOrderStatus)) { emitToTenant(user.tenantId, "order:completed", { orderId: item.orderId, status: newOrderStatus, tableId: order.tableId }); }
        else { emitToTenant(user.tenantId, "order:updated", { orderId: item.orderId, status: newOrderStatus, tableId: order.tableId }); }
      }
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/kds/orders/:id/items-status", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const { status, station } = req.body;
      const validTransitions: Record<string, string[]> = { pending: ["cooking"], cooking: ["ready"], ready: ["recalled", "served"], recalled: ["cooking"] };
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
      let bulkOrderStatus = order.status;
      if (allServed) { await storage.updateOrder(req.params.id, { status: "served" }); bulkOrderStatus = "served"; }
      else if (allReadyOrServed) { await storage.updateOrder(req.params.id, { status: "ready" }); bulkOrderStatus = "ready"; }
      if (status === "cooking" && (order.status === "new" || order.status === "sent_to_kitchen")) { await storage.updateOrder(req.params.id, { status: "in_progress" }); bulkOrderStatus = "in_progress"; }
      emitToTenant(user.tenantId, "order:item_updated", { orderId: req.params.id, status, orderStatus: bulkOrderStatus });
      if (bulkOrderStatus !== order.status) {
        if (["served"].includes(bulkOrderStatus)) { emitToTenant(user.tenantId, "order:completed", { orderId: req.params.id, status: bulkOrderStatus, tableId: order.tableId }); }
        else { emitToTenant(user.tenantId, "order:updated", { orderId: req.params.id, status: bulkOrderStatus, tableId: order.tableId }); }
      }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
