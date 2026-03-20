import type { Express } from "express";
import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { emitToTenant } from "../realtime";
import { inventoryItems as inventoryItemsTable, stockMovements as stockMovementsTable, securityAlerts } from "@shared/schema";
import { convertUnits } from "@shared/units";

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
        if (bulkOrderStatus === "served") { emitToTenant(user.tenantId, "order:completed", { orderId: req.params.id, status: bulkOrderStatus, tableId: order.tableId }); }
        else { emitToTenant(user.tenantId, "order:updated", { orderId: req.params.id, status: bulkOrderStatus, tableId: order.tableId }); }
      }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/kds/recipe-check/:orderId", requireAuth, async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const { station } = req.query;
      const order = await storage.getOrder(req.params.orderId);
      if (!order || order.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const items = await storage.getOrderItemsByOrder(req.params.orderId);
      const filtered = station ? items.filter(i => i.station === station) : items;
      const result: any[] = [];
      for (const oi of filtered) {
        if (!oi.menuItemId) continue;
        const recipe = await storage.getRecipeByMenuItem(oi.menuItemId);
        if (!recipe) continue;
        const recipeIngs = await storage.getRecipeIngredients(recipe.id);
        const ingredients: any[] = [];
        for (const ing of recipeIngs) {
          const invItem = await storage.getInventoryItem(ing.inventoryItemId);
          if (!invItem) continue;
          const ingUnit = ing.unit || invItem.unit || "pcs";
          const invUnit = invItem.unit || "pcs";
          const baseQty = Number(ing.quantity) / (1 - Number(ing.wastePct || 0) / 100);
          const convertedQty = convertUnits(baseQty, ingUnit, invUnit);
          const required = Math.round(convertedQty * (oi.quantity || 1) * 100) / 100;
          const available = Number(invItem.currentStock || 0);
          ingredients.push({
            id: ing.id,
            inventoryItemId: ing.inventoryItemId,
            name: invItem.name,
            required,
            available,
            unit: invUnit,
            sufficient: available >= required,
            status: available >= required ? "ok" : available > 0 ? "low" : "out",
          });
        }
        result.push({
          orderItemId: oi.id,
          menuItemId: oi.menuItemId,
          menuItemName: oi.name,
          quantity: oi.quantity,
          recipeId: recipe.id,
          recipeName: recipe.name,
          ingredients,
        });
      }
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/kds/orders/:id/start", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string; id: string; name?: string; username?: string };
      const { station, force = false } = req.body;
      const order = await storage.getOrder(req.params.id);
      if (!order || order.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const items = await storage.getOrderItemsByOrder(req.params.id);
      const filtered = station ? items.filter(i => i.station === station && (i.status === "pending" || !i.status)) : items.filter(i => i.status === "pending" || !i.status);
      const activeShift = await storage.getActiveShift(user.tenantId, order.outletId || undefined);
      const chefName = (user as any).name || (user as any).username || "Chef";

      const stockWrites: Array<{ inventoryItemId: string; qty: number; menuItemId: string; recipeId: string; menuItemName: string }> = [];
      const insufficientItems: string[] = [];

      for (const oi of filtered) {
        if (!oi.menuItemId) continue;
        const recipe = await storage.getRecipeByMenuItem(oi.menuItemId);
        if (!recipe) continue;
        const recipeIngs = await storage.getRecipeIngredients(recipe.id);
        for (const ing of recipeIngs) {
          const invItem = await storage.getInventoryItem(ing.inventoryItemId);
          if (!invItem) continue;
          const ingUnit = ing.unit || invItem.unit || "pcs";
          const invUnit = invItem.unit || "pcs";
          const baseQty = Number(ing.quantity) / (1 - Number(ing.wastePct || 0) / 100);
          const convertedQty = convertUnits(baseQty, ingUnit, invUnit);
          const required = Math.round(convertedQty * (oi.quantity || 1) * 100) / 100;
          const available = Number(invItem.currentStock || 0);
          if (available < required && !force) {
            insufficientItems.push(`${invItem.name} (need ${required}${invUnit}, have ${available}${invUnit})`);
          }
          stockWrites.push({ inventoryItemId: ing.inventoryItemId, qty: required, menuItemId: oi.menuItemId, recipeId: recipe.id, menuItemName: oi.name });
        }
      }

      if (insufficientItems.length > 0 && !force) {
        return res.status(409).json({ message: "Insufficient stock", insufficientItems });
      }

      if (order.channel !== "kiosk" && stockWrites.length > 0) {
        const lowStockItems: Array<{ id: string; name: string; after: number; reorder: number }> = [];
        await db.transaction(async (tx) => {
          for (const w of stockWrites) {
            const before = await tx.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, w.inventoryItemId));
            const invRow = before[0];
            const stockBefore = Number(invRow?.currentStock || 0);
            const stockAfter = Math.max(0, stockBefore - w.qty);
            const reorderLevel = Number(invRow?.reorderLevel || 0);
            await tx.update(inventoryItemsTable)
              .set({ currentStock: sql`GREATEST(${inventoryItemsTable.currentStock}::numeric - ${w.qty}, 0)` })
              .where(eq(inventoryItemsTable.id, w.inventoryItemId));
            await tx.insert(stockMovementsTable).values({
              tenantId: user.tenantId,
              itemId: w.inventoryItemId,
              type: "RECIPE_CONSUMPTION",
              quantity: String(-w.qty),
              reason: `KDS: ${w.menuItemName} prepared by ${chefName}`,
              orderId: order.id,
              orderNumber: (order as any).orderNumber || order.id.slice(0, 6).toUpperCase(),
              menuItemId: w.menuItemId,
              recipeId: w.recipeId,
              chefId: user.id,
              chefName,
              station: station || null,
              shiftId: activeShift?.id || null,
              stockBefore: String(stockBefore),
              stockAfter: String(stockAfter),
            });
            if (reorderLevel > 0 && stockBefore > reorderLevel && stockAfter <= reorderLevel) {
              lowStockItems.push({ id: w.inventoryItemId, name: w.menuItemName, after: stockAfter, reorder: reorderLevel });
            }
          }
        });
        for (const item of lowStockItems) {
          await db.insert(securityAlerts).values({
            tenantId: user.tenantId,
            type: "LOW_STOCK",
            severity: "warning",
            title: `Low Stock: ${item.name}`,
            description: `Stock dropped to ${item.after} (reorder level: ${item.reorder}) after order #${(order as any).orderNumber || order.id.slice(0, 6).toUpperCase()}`,
            metadata: { itemId: item.id, currentStock: item.after, reorderLevel: item.reorder, orderId: order.id },
          });
          emitToTenant(user.tenantId, "low_stock_alert", { itemId: item.id, itemName: item.name, currentStock: item.after, reorderLevel: item.reorder });
        }
      }

      for (const oi of filtered) {
        await storage.updateOrderItem(oi.id, { status: "cooking", startedAt: new Date() });
      }

      if (order.status === "new" || order.status === "sent_to_kitchen") {
        await storage.updateOrder(order.id, { status: "in_progress" });
      }

      if (filtered.length > 0) {
        await storage.createKotEvent({
          tenantId: user.tenantId,
          outletId: order.outletId || null,
          orderId: order.id,
          station: station || null,
          items: filtered.map(i => ({ id: i.id, name: i.name, quantity: i.quantity })),
        });
      }

      emitToTenant(user.tenantId, "order:updated", { orderId: order.id, status: "in_progress", tableId: order.tableId });
      res.json({ success: true, deducted: order.channel !== "kiosk" ? stockWrites.length : 0 });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/kds/wastage", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string; id: string; name?: string; username?: string };
      const { inventoryItemId, quantity, reason, station } = req.body;
      if (!inventoryItemId || !quantity) return res.status(400).json({ message: "inventoryItemId and quantity required" });
      const invItem = await storage.getInventoryItem(inventoryItemId);
      if (!invItem || invItem.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const qty = Number(quantity);
      const chefName = (user as any).name || (user as any).username || "Chef";
      const activeShift = await storage.getActiveShift(user.tenantId);
      const stockBefore = Number(invItem.currentStock || 0);
      const stockAfter = Math.max(0, stockBefore - qty);
      const reorderLevel = Number(invItem.reorderLevel || 0);
      await db.transaction(async (tx) => {
        await tx.update(inventoryItemsTable)
          .set({ currentStock: sql`GREATEST(${inventoryItemsTable.currentStock}::numeric - ${qty}, 0)` })
          .where(eq(inventoryItemsTable.id, inventoryItemId));
        await tx.insert(stockMovementsTable).values({
          tenantId: user.tenantId,
          itemId: inventoryItemId,
          type: "WASTAGE",
          quantity: String(-qty),
          reason: reason || `Wastage reported by ${chefName}`,
          chefId: user.id,
          chefName,
          station: station || null,
          shiftId: activeShift?.id || null,
          stockBefore: String(stockBefore),
          stockAfter: String(stockAfter),
        });
      });
      if (reorderLevel > 0 && stockBefore > reorderLevel && stockAfter <= reorderLevel) {
        await db.insert(securityAlerts).values({
          tenantId: user.tenantId,
          type: "LOW_STOCK",
          severity: "warning",
          title: `Low Stock: ${invItem.name}`,
          description: `Stock dropped to ${stockAfter} (reorder level: ${reorderLevel}) after wastage report by ${chefName}`,
          metadata: { itemId: inventoryItemId, currentStock: stockAfter, reorderLevel },
        });
        emitToTenant(user.tenantId, "low_stock_alert", { itemId: inventoryItemId, itemName: invItem.name, currentStock: stockAfter, reorderLevel });
      }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/shifts", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getShiftsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/shifts", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.createShift({ ...req.body, tenantId: user.tenantId }));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/shifts/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const s = await storage.updateShift(req.params.id, user.tenantId, req.body);
      if (!s) return res.status(404).json({ message: "Shift not found" });
      res.json(s);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/shifts/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteShift(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/shifts/active", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.query;
      const shift = await storage.getActiveShift(user.tenantId, outletId as string | undefined);
      res.json(shift || null);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/menu-item-stations", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getMenuItemStationsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/menu-item-stations", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.upsertMenuItemStation({ ...req.body, tenantId: user.tenantId }));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/menu-item-stations/:menuItemId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteMenuItemStations(req.params.menuItemId, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/stock-movements", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { from, to, chefId, station, type, ingredientId, shiftId, limit, offset } = req.query;
      const movements = await storage.getStockMovementsByTenantFiltered(user.tenantId, {
        from: from ? new Date(from as string) : undefined,
        to: to ? new Date(to as string) : undefined,
        chefId: chefId as string | undefined,
        station: station as string | undefined,
        type: type as string | undefined,
        ingredientId: ingredientId as string | undefined,
        shiftId: shiftId as string | undefined,
        limit: limit ? Number(limit) : 200,
        offset: offset ? Number(offset) : 0,
      });
      res.json(movements);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/kds/wall-tickets", async (req, res) => {
    try {
      const { tenantId } = req.query;
      if (!tenantId || typeof tenantId !== "string") return res.status(400).json({ message: "tenantId required" });
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      const allOrders = await storage.getOrdersByTenant(tenantId);
      const allTables = await storage.getTablesByTenant(tenantId);
      const tableMap = new Map(allTables.map(t => [t.id, t.number]));
      const activeOrders = allOrders.filter(o => ["new", "sent_to_kitchen", "in_progress", "ready"].includes(o.status || ""));
      const tickets = [];
      for (const o of activeOrders) {
        const items = await storage.getOrderItemsByOrder(o.id);
        tickets.push({ ...o, tableNumber: o.tableId ? tableMap.get(o.tableId) : undefined, items });
      }
      res.json(tickets);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/inventory-alerts", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      const alerts = await db.select().from(securityAlerts)
        .where(and(eq(securityAlerts.tenantId, user.tenantId), eq(securityAlerts.type, "LOW_STOCK"), eq(securityAlerts.acknowledged, false)))
        .orderBy(sql`${securityAlerts.createdAt} desc`)
        .limit(50);
      res.json(alerts);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/inventory-alerts/count", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const [row] = await db.select({ cnt: sql<number>`count(*)::int` }).from(securityAlerts)
        .where(and(eq(securityAlerts.tenantId, user.tenantId), eq(securityAlerts.type, "LOW_STOCK"), eq(securityAlerts.acknowledged, false)));
      res.json({ count: row?.cnt || 0 });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/inventory-alerts/:id/acknowledge", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      await db.update(securityAlerts)
        .set({ acknowledged: true, acknowledgedAt: new Date() })
        .where(and(eq(securityAlerts.id, req.params.id), eq(securityAlerts.tenantId, user.tenantId)));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/inventory-alerts/acknowledge-all", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await db.update(securityAlerts)
        .set({ acknowledged: true, acknowledgedAt: new Date() })
        .where(and(eq(securityAlerts.tenantId, user.tenantId), eq(securityAlerts.type, "LOW_STOCK"), eq(securityAlerts.acknowledged, false)));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
