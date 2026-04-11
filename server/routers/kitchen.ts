import type { Express } from "express";
import { db } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { storage } from "../storage";
import { requireAuth, requireRole, comparePasswords } from "../auth";
import { verifySupervisorOverride } from "./_shared";
import { emitToTenant } from "../realtime";
import { alertEngine } from "../services/alert-engine";
import { inventoryItems as inventoryItemsTable, stockMovements as stockMovementsTable, securityAlerts, orderItems as orderItemsTable } from "@shared/schema";
import { convertUnits } from "@shared/units";
import { getNextKotSequence } from "./print-jobs";
import { triggerWastageDailySummary } from "./wastage";
import { calculateSuggestedStartTimes } from "../services/cooking-timer";
import { deductRecipeInventoryForItem } from "../lib/deduct-recipe-inventory";
import { recordKdsEvent } from "../services/time-logger";

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
      const activeOrders = allOrders.filter(o => {
        const status = o.status || "";
        if (!["new", "sent_to_kitchen", "in_progress", "ready"].includes(status)) return false;
        if (o.orderType === "delivery" && (status === "new" || status === "on_hold")) return false;
        return true;
      });
      const tickets = [];
      for (const o of activeOrders) {
        const items = await storage.getOrderItemsByOrder(o.id);
        const filteredItems = stationFilter ? items.filter(i => i.station === stationFilter) : items;
        if (filteredItems.length === 0 && stationFilter) continue;
        tickets.push({ ...o, isRush: (o as any).is_rush === true, tableNumber: o.tableId ? tableMap.get(o.tableId) : undefined, items: stationFilter ? filteredItems : items });
      }
      res.json(tickets);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/kds/order-items/:id/status", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const { status } = req.body;
      const validTransitions: Record<string, string[]> = { pending: ["cooking"], cooking: ["ready"], ready: ["recalled", "served"], recalled: ["cooking"] };
      const item = await storage.getOrderItem(req.params.id, user.tenantId);
      if (!item) return res.status(404).json({ message: "Order item not found" });
      const currentStatus = item.status || "pending";
      const allowed = validTransitions[currentStatus];
      if (!allowed || !allowed.includes(status)) return res.status(400).json({ message: `Invalid transition: ${currentStatus} -> ${status}` });
      const order = await storage.getOrder(item.orderId, user.tenantId);
      if (!order) return res.status(403).json({ message: "Forbidden" });
      const updates: Record<string, string | Date | null> = { status };
      if (status === "cooking" && !item.startedAt) updates.startedAt = new Date();
      if (status === "ready") updates.readyAt = new Date();
      if (status === "recalled") { updates.readyAt = null; updates.status = "cooking"; }
      const updated = await storage.updateOrderItem(req.params.id, updates, user.tenantId);
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

      const chefDisplayName = (user as any).name || (user as any).username || "Chef";
      if (status === "cooking") {
        recordKdsEvent("acknowledged", { tenantId: user.tenantId, orderId: item.orderId, orderItemId: req.params.id, userId: user.id, userName: chefDisplayName, timestamp: new Date() }).catch(() => {});
        recordKdsEvent("cooking_started", { tenantId: user.tenantId, orderId: item.orderId, orderItemId: req.params.id, userId: user.id, userName: chefDisplayName, timestamp: new Date() }).catch(() => {});
      }
      if (status === "ready") {
        recordKdsEvent("item_ready", { tenantId: user.tenantId, orderId: item.orderId, orderItemId: req.params.id, userId: user.id, userName: chefDisplayName, timestamp: new Date() }).catch(() => {});
      }

      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/kds/orders/:id/items-status", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string };
      const { status, station } = req.body;
      const validTransitions: Record<string, string[]> = { pending: ["cooking"], cooking: ["ready"], ready: ["recalled", "served"], recalled: ["cooking"] };
      const order = await storage.getOrder(req.params.id, user.tenantId);
      if (!order) return res.status(403).json({ message: "Forbidden" });
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
        await storage.updateOrderItem(item.id, updates, user.tenantId);
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
      const order = await storage.getOrder(req.params.orderId, user.tenantId);
      if (!order) return res.status(403).json({ message: "Forbidden" });
      const items = await storage.getOrderItemsByOrder(req.params.orderId);
      const filtered = station ? items.filter(i => i.station === station) : items;
      const result: any[] = [];
      for (const oi of filtered) {
        if (!oi.menuItemId) continue;
        const recipe = await storage.getRecipeByMenuItem(oi.menuItemId);
        if (!recipe) {
          result.push({
            orderItemId: oi.id,
            menuItemId: oi.menuItemId,
            menuItemName: oi.name,
            quantity: oi.quantity,
            noRecipe: true,
            recipeId: null,
            recipeName: null,
            ingredients: [],
          });
          continue;
        }
        const recipeIngs = await storage.getRecipeIngredients(recipe.id);
        const ingredients: any[] = [];
        for (const ing of recipeIngs) {
          const invItem = await storage.getInventoryItem(ing.inventoryItemId, user.tenantId);
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
          noRecipe: false,
          recipeId: recipe.id,
          recipeName: recipe.name,
          ingredients,
        });
      }
      const hasUnlinkedItems = result.some(r => r.noRecipe);
      res.json({ items: result, hasUnlinkedItems });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/kds/orders/:id/start", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string; id: string; name?: string; username?: string };
      const { station, force = false } = req.body;
      const order = await storage.getOrder(req.params.id, user.tenantId);
      if (!order) return res.status(403).json({ message: "Forbidden" });
      const items = await storage.getOrderItemsByOrder(req.params.id);
      const filtered = station ? items.filter(i => i.station === station && (i.status === "pending" || !i.status)) : items.filter(i => i.status === "pending" || !i.status);
      const activeShift = await storage.getActiveShift(user.tenantId, order.outletId || undefined);
      const chefName = (user as any).name || (user as any).username || "Chef";

      const existingMovements = await storage.getStockMovementsByOrder(order.id);
      const alreadyDeducted = existingMovements.some((m) => m.type === "RECIPE_CONSUMPTION");
      const shouldDeduct = order.channel !== "kiosk" && !alreadyDeducted;

      const stockWrites: Array<{ inventoryItemId: string; qty: number; menuItemId: string; recipeId: string; menuItemName: string }> = [];

      if (shouldDeduct) {
        const insufficientItems: string[] = [];

        for (const oi of filtered) {
          if (!oi.menuItemId) continue;
          const recipe = await storage.getRecipeByMenuItem(oi.menuItemId);
          if (!recipe) {
            console.warn("[kds/start] no-recipe: skipping inventory deduction", { tenantId: user.tenantId, orderId: req.params.id, menuItemId: oi.menuItemId, menuItemName: oi.name });
            continue;
          }
          const recipeIngs = await storage.getRecipeIngredients(recipe.id);
          for (const ing of recipeIngs) {
            const invItem = await storage.getInventoryItem(ing.inventoryItemId, user.tenantId);
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
      }

      if (shouldDeduct && stockWrites.length > 0) {
        const lowStockItems: Array<{ id: string; name: string; after: number; reorder: number; stockMovementId: string }> = [];
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
            const [movement] = await tx.insert(stockMovementsTable).values({
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
            }).returning({ id: stockMovementsTable.id });
            if (reorderLevel > 0 && stockBefore > reorderLevel && stockAfter <= reorderLevel) {
              lowStockItems.push({ id: w.inventoryItemId, name: invRow?.name || w.menuItemName, after: stockAfter, reorder: reorderLevel, stockMovementId: movement?.id });
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
            metadata: { itemId: item.id, currentStock: item.after, reorderLevel: item.reorder, orderId: order.id, stockMovementId: item.stockMovementId },
          });
          emitToTenant(user.tenantId, "low_stock_alert", { itemId: item.id, itemName: item.name, currentStock: item.after, reorderLevel: item.reorder, stockMovementId: item.stockMovementId });
        }
      }

      for (const oi of filtered) {
        await storage.updateOrderItem(oi.id, { status: "cooking", startedAt: new Date() }, user.tenantId);
      }

      if (order.status === "new" || order.status === "sent_to_kitchen") {
        await storage.updateOrder(order.id, { status: "in_progress" });
      }

      if (filtered.length > 0) {
        const kotEvent = await storage.createKotEvent({
          tenantId: user.tenantId,
          outletId: order.outletId || null,
          orderId: order.id,
          station: station || null,
          items: filtered.map(i => ({ id: i.id, name: i.name, quantity: i.quantity })),
        });

        const existingKotJobs = await storage.getPrintJobsByTenant(user.tenantId, { referenceId: order.id });
        const existingKotJobCount = existingKotJobs.filter(j => j.type === "kot").length;

        if (existingKotJobCount === 0) {
          const tables = await storage.getTablesByTenant(user.tenantId);
          const tableNum = order.tableId ? tables.find(t => t.id === order.tableId)?.number : undefined;
          const sentAt = new Date().toISOString();
          const kotSequence = await getNextKotSequence(user.tenantId, order.id);

          const stationsInBatch = station
            ? [station]
            : Array.from(new Set(filtered.map(i => i.station).filter((s): s is string => Boolean(s))));

          if (stationsInBatch.length === 0) {
            await storage.createPrintJob({
              tenantId: user.tenantId,
              type: "kot",
              referenceId: order.id,
              station: null,
              status: "queued",
              payload: {
                kotEventId: kotEvent.id,
                kotSequence,
                orderId: order.id,
                orderType: order.orderType,
                tableNumber: tableNum ?? null,
                station: null,
                sentAt,
                items: filtered.map(i => ({
                  name: i.name, quantity: i.quantity,
                  notes: i.notes, course: i.course,
                })),
              },
            });
          } else {
            for (const stationName of stationsInBatch) {
              const stationItems = filtered.filter(i => i.station === stationName || station === stationName);
              if (stationItems.length === 0) continue;
              await storage.createPrintJob({
                tenantId: user.tenantId,
                type: "kot",
                referenceId: order.id,
                station: stationName,
                status: "queued",
                payload: {
                  kotEventId: kotEvent.id,
                  kotSequence,
                  orderId: order.id,
                  orderType: order.orderType,
                  tableNumber: tableNum ?? null,
                  station: stationName,
                  sentAt,
                  items: stationItems.map(i => ({
                    name: i.name, quantity: i.quantity,
                    notes: i.notes, course: i.course,
                  })),
                },
              });
            }
          }
        }
      }

      emitToTenant(user.tenantId, "order:updated", { orderId: order.id, status: "in_progress", tableId: order.tableId });

      recordKdsEvent("kot_sent", {
        tenantId: user.tenantId,
        orderId: order.id,
        userId: user.id,
        userName: chefName,
        timestamp: new Date(),
      }).catch(() => {});

      res.json({ success: true, deducted: shouldDeduct ? stockWrites.length : 0 });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/kds/wastage", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string; id: string; name?: string; username?: string };
      const { inventoryItemId, quantity, reason, station } = req.body;
      if (!inventoryItemId || !quantity) return res.status(400).json({ message: "inventoryItemId and quantity required" });
      const invItem = await storage.getInventoryItem(inventoryItemId, user.tenantId);
      if (!invItem) return res.status(403).json({ message: "Forbidden" });
      const qty = Number(quantity);
      const chefName = (user as any).name || (user as any).username || "Chef";
      const activeShift = await storage.getActiveShift(user.tenantId);
      const stockBefore = Number(invItem.currentStock || 0);
      const stockAfter = Math.max(0, stockBefore - qty);
      const reorderLevel = Number(invItem.reorderLevel || 0);
      let wastageMovementId: string | undefined;
      await db.transaction(async (tx) => {
        await tx.update(inventoryItemsTable)
          .set({ currentStock: sql`GREATEST(${inventoryItemsTable.currentStock}::numeric - ${qty}, 0)` })
          .where(eq(inventoryItemsTable.id, inventoryItemId));
        const [movement] = await tx.insert(stockMovementsTable).values({
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
        }).returning({ id: stockMovementsTable.id });
        wastageMovementId = movement?.id;
      });
      if (reorderLevel > 0 && stockBefore > reorderLevel && stockAfter <= reorderLevel) {
        await db.insert(securityAlerts).values({
          tenantId: user.tenantId,
          type: "LOW_STOCK",
          severity: "warning",
          title: `Low Stock: ${invItem.name}`,
          description: `Stock dropped to ${stockAfter} (reorder level: ${reorderLevel}) after wastage report by ${chefName}`,
          metadata: { itemId: inventoryItemId, currentStock: stockAfter, reorderLevel, stockMovementId: wastageMovementId },
        });
        emitToTenant(user.tenantId, "low_stock_alert", { itemId: inventoryItemId, itemName: invItem.name, currentStock: stockAfter, reorderLevel, stockMovementId: wastageMovementId });
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
      if (req.body.active === false) {
        const today = new Date().toISOString().slice(0, 10);
        triggerWastageDailySummary(user.tenantId, s.outletId || null, today).catch(() => {});
      }
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

  app.get("/api/kot-events", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { orderId, limit } = req.query;
      if (orderId) {
        const events = await storage.getKotEventsByOrder(orderId as string);
        return res.json(events);
      }
      const events = await storage.getKotEventsByTenant(user.tenantId, limit ? Number(limit) : 100);
      res.json(events);
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

  app.get("/api/kds/wall-token", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenant = await storage.getTenant(user.tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      let token = tenant.wallScreenToken;
      if (!token) token = await storage.regenerateWallScreenToken(user.tenantId);
      res.json({ token });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/kds/wall-token/regenerate", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const token = await storage.regenerateWallScreenToken(user.tenantId);
      res.json({ token });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/kds/wall-tickets", async (req, res) => {
    try {
      const { token, tenantId } = req.query;
      let tenant;
      if (token && typeof token === "string") {
        tenant = await storage.getTenantByWallScreenToken(token);
        if (!tenant) return res.status(403).json({ message: "Invalid wall screen token" });
      } else if (tenantId && typeof tenantId === "string") {
        tenant = await storage.getTenant(tenantId);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      } else {
        return res.status(400).json({ message: "token or tenantId required" });
      }
      const allOrders = await storage.getOrdersByTenant(tenant.id);
      const allTables = await storage.getTablesByTenant(tenant.id);
      const tableMap = new Map(allTables.map(t => [t.id, t.number]));
      const activeOrders = allOrders.filter(o => {
        const status = o.status || "";
        if (!["new", "sent_to_kitchen", "in_progress", "ready"].includes(status)) return false;
        if (o.orderType === "delivery" && (status === "new" || status === "on_hold")) return false;
        return true;
      });
      const liveAssignments = await storage.getLiveAssignments(tenant.id).catch(() => []);
      const assignMap = new Map(liveAssignments.map(a => [a.orderId ?? "", a]));
      const tickets = [];
      for (const o of activeOrders) {
        const items = await storage.getOrderItemsByOrder(o.id);
        const asgn = assignMap.get(o.id);
        tickets.push({
          ...o,
          tableNumber: o.tableId ? tableMap.get(o.tableId) : undefined,
          items,
          assignedChefName: asgn?.chefName ?? null,
          counterName: asgn?.counterName ?? null,
          counterId: asgn?.counterId ?? null,
          assignmentStatus: asgn?.status ?? null,
        });
      }
      res.json(tickets);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/inventory-alerts", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const alerts = await db.select().from(securityAlerts)
        .where(and(eq(securityAlerts.tenantId, user.tenantId), eq(securityAlerts.type, "LOW_STOCK"), eq(securityAlerts.acknowledged, false)))
        .orderBy(sql`${securityAlerts.createdAt} desc`)
        .limit(50);
      res.json(alerts);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/inventory-alerts/count", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const [row] = await db.select({ cnt: sql<number>`count(*)::int` }).from(securityAlerts)
        .where(and(eq(securityAlerts.tenantId, user.tenantId), eq(securityAlerts.type, "LOW_STOCK"), eq(securityAlerts.acknowledged, false)));
      res.json({ count: row?.cnt || 0 });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/inventory-alerts/:id/acknowledge", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await db.update(securityAlerts)
        .set({ acknowledged: true, acknowledgedAt: new Date(), acknowledgedBy: user.id })
        .where(and(eq(securityAlerts.id, req.params.id), eq(securityAlerts.tenantId, user.tenantId)));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/inventory-alerts/acknowledge-all", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await db.update(securityAlerts)
        .set({ acknowledged: true, acknowledgedAt: new Date(), acknowledgedBy: user.id })
        .where(and(eq(securityAlerts.tenantId, user.tenantId), eq(securityAlerts.type, "LOW_STOCK"), eq(securityAlerts.acknowledged, false)));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Task #108: Selective Item Cooking Control endpoints

  // GET /api/kitchen-settings — returns tenant kitchen settings (or defaults)
  app.get("/api/kitchen-settings", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const settings = await storage.getKitchenSettings(user.tenantId);
      if (!settings) {
        return res.json({
          cookingControlMode: "selective",
          showTimingSuggestions: true,
          alertOverdueMinutes: 3,
          allowRushOverride: true,
          rushRequiresManagerPin: true,
          autoHoldBarItems: true,
          defaultPrepSource: "recipe",
          hasManagerPin: false,
        });
      }
      const { managerPinHash: _hash, ...safeSettings } = settings as any;
      res.json({ ...safeSettings, hasManagerPin: !!settings.managerPinHash });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // PUT /api/kitchen-settings — owner/manager: update cooking control settings
  app.put("/api/kitchen-settings", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const body = req.body as Record<string, unknown>;
      // Build safe update: strip direct managerPinHash (prevent override), then hash managerPin if provided
      const updateData: Record<string, unknown> = { ...body };
      delete updateData.managerPinHash;
      delete updateData.managerPin;
      if (typeof body.managerPin === "string" && body.managerPin.length > 0) {
        const { hashPassword } = await import("../auth");
        updateData.managerPinHash = await hashPassword(body.managerPin);
      }
      const settings = await storage.upsertKitchenSettings(user.tenantId, updateData as any);
      // Strip the hash from the response for security
      const { managerPinHash: _, ...safeSettings } = settings as any;
      res.json({ ...safeSettings, hasManagerPin: !!settings.managerPinHash });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // PUT /api/kds/items/:id/start — start cooking a single item
  app.put("/api/kds/items/:id/start", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      const item = await storage.getOrderItem(req.params.id, user.tenantId);
      if (!item) return res.status(404).json({ message: "Order item not found" });
      const order = await storage.getOrder(item.orderId, user.tenantId);
      if (!order) return res.status(403).json({ message: "Forbidden" });

      const kitSettings = await storage.getKitchenSettings(user.tenantId);
      if (kitSettings?.cookingControlMode === "auto_start") {
        return res.status(400).json({ message: "Individual item start not available in auto_start mode" });
      }

      const now = new Date();
      const chefName = (user as any).name || (user as any).username || "Chef";
      const prepMinutes = item.itemPrepMinutes ?? 0;
      const estimatedReadyAt = new Date(now.getTime() + prepMinutes * 60 * 1000);

      // Update both new cookingStatus and legacy status field for backward compatibility
      await storage.updateOrderItemCooking(item.id, {
        cookingStatus: "started",
        actualStartAt: now,
        estimatedReadyAt,
        startedById: user.id,
        startedByName: chefName,
      });
      // Maintain legacy status field used by existing KDS consumers
      await storage.updateOrderItem(item.id, { status: "cooking", startedAt: now }, user.tenantId);
      const updated = await storage.getOrderItem(item.id, user.tenantId);

      // Deduct inventory for this single item (non-fatal, mirrors bulk-start pattern)
      setImmediate(() => {
        deductRecipeInventoryForItem(item, order.id, user.tenantId).catch(err => {
          console.error(`[kds/items/start] Inventory deduction failed for item ${item.id}:`, err);
        });
      });

      // Recalculate timing for remaining course-1 queued items
      const allItems = await storage.getOrderItemsByOrder(order.id);
      const remainingCourse1 = allItems
        .filter(i =>
          i.id !== item.id &&
          (i.courseNumber ?? 1) === 1 &&
          ["queued", "hold", "ready_to_start"].includes(i.cookingStatus || "queued")
        )
        .map(i => ({ id: i.id, name: i.name, prepMinutes: i.itemPrepMinutes ?? 0, courseNumber: 1 }));

      if (remainingCourse1.length > 0) {
        const timings = calculateSuggestedStartTimes(remainingCourse1);
        for (const t of timings) {
          await storage.updateOrderItemCooking(t.itemId, { suggestedStartAt: t.suggestedStartAt });
        }
      }

      if (order.status === "new" || order.status === "sent_to_kitchen") {
        await storage.updateOrder(order.id, { status: "in_progress" });
      }

      emitToTenant(user.tenantId, "kds:item_started", { itemId: item.id, orderId: order.id, startedBy: chefName });

      // Note: hold-release only happens when dependency item is READY (see /ready endpoint)

      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // PUT /api/kds/items/:id/hold — put an item on hold
  app.put("/api/kds/items/:id/hold", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      const { holdReason, holdUntilItemId, holdUntilMinutes } = req.body;
      const item = await storage.getOrderItem(req.params.id, user.tenantId);
      if (!item) return res.status(404).json({ message: "Order item not found" });
      const order = await storage.getOrder(item.orderId, user.tenantId);
      if (!order) return res.status(403).json({ message: "Forbidden" });

      const updated = await storage.updateOrderItemCooking(item.id, {
        cookingStatus: "hold",
        holdReason: holdReason || null,
        holdUntilItemId: holdUntilItemId || null,
        holdUntilMinutes: holdUntilMinutes || null,
      });

      emitToTenant(user.tenantId, "kds:item_held", { itemId: item.id, orderId: order.id, holdReason });

      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // PUT /api/kds/items/:id/ready — mark item as ready
  app.put("/api/kds/items/:id/ready", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      const item = await storage.getOrderItem(req.params.id, user.tenantId);
      if (!item) return res.status(404).json({ message: "Order item not found" });
      const order = await storage.getOrder(item.orderId, user.tenantId);
      if (!order) return res.status(403).json({ message: "Forbidden" });

      const now = new Date();
      await storage.updateOrderItemCooking(item.id, {
        cookingStatus: "ready",
        actualReadyAt: now,
      });
      // Maintain legacy status field used by existing KDS consumers
      await storage.updateOrderItem(item.id, { status: "ready", readyAt: now }, user.tenantId);
      const updated = await storage.getOrderItem(item.id, user.tenantId);

      // Check order status
      const allItems = await storage.getOrderItemsByOrder(order.id);
      const allReadyOrServed = allItems.every(i => ["ready", "served"].includes(i.cookingStatus || "queued"));
      const allServed = allItems.every(i => i.cookingStatus === "served");

      if (allServed) {
        await storage.updateOrder(order.id, { status: "served" });
        emitToTenant(user.tenantId, "order:updated", { orderId: order.id, status: "served" });
      } else if (allReadyOrServed) {
        await storage.updateOrder(order.id, { status: "ready" });
        emitToTenant(user.tenantId, "order:ready", { orderId: order.id });
        alertEngine.trigger('ALERT-04', { tenantId: user.tenantId, outletId: order.outletId ?? undefined, referenceId: order.id, referenceNumber: (order as any).orderNumber ?? undefined, message: `Order #${(order as any).orderNumber || order.id.slice(-6)} ready — collect from pass` }).catch(() => {});
      } else {
        // Some items ready, some still cooking — keep order in_progress
        await storage.updateOrder(order.id, { status: "in_progress" });
      }

      emitToTenant(user.tenantId, "kds:item_ready", { itemId: item.id, orderId: order.id });
      emitToTenant(user.tenantId, "coordination:item_ready", { itemId: item.id, orderId: order.id });

      // Auto-release hold items waiting on this item
      for (const i of allItems) {
        if (i.cookingStatus === "hold" && i.holdUntilItemId === item.id) {
          emitToTenant(user.tenantId, "kds:hold_released", { itemId: i.id, orderId: order.id, releasedByItemId: item.id });
        }
      }

      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // PUT /api/kds/items/:id/rush — rush all items in an order (manager/owner)
  app.put("/api/kds/items/:id/rush", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const item = await storage.getOrderItem(req.params.id, user.tenantId);
      if (!item) return res.status(404).json({ message: "Order item not found" });
      const order = await storage.getOrder(item.orderId, user.tenantId);
      if (!order) return res.status(403).json({ message: "Forbidden" });

      const kitSettings = await storage.getKitchenSettings(user.tenantId);

      // Check allowRushOverride setting — if disabled, rush is blocked entirely
      if (kitSettings && kitSettings.allowRushOverride === false) {
        return res.status(403).json({ message: "Rush override is disabled in kitchen settings" });
      }

      // Enforce manager PIN if configured. PIN is validated against the hashed PIN stored
      // in kitchen_settings.manager_pin_hash (set via PUT /api/kitchen-settings { managerPin }).
      if (kitSettings?.rushRequiresManagerPin ?? true) {
        const { pin } = req.body as { pin?: string };
        if (!pin) {
          return res.status(400).json({ message: "Manager PIN is required to rush an order" });
        }
        const pinHash = kitSettings?.managerPinHash;
        if (!pinHash) {
          return res.status(400).json({ message: "No manager PIN has been configured for this tenant. Set one via kitchen settings." });
        }
        const pinValid = await comparePasswords(pin, pinHash);
        if (!pinValid) {
          return res.status(403).json({ message: "Invalid manager PIN" });
        }
      }

      const allItems = await storage.getOrderItemsByOrder(order.id);
      const now = new Date();
      const chefName = (user as any).name || (user as any).username || "Chef";

      for (const i of allItems) {
        if (["queued", "hold", "ready_to_start"].includes(i.cookingStatus || "queued")) {
          const prepMinutes = i.itemPrepMinutes ?? 0;
          await storage.updateOrderItemCooking(i.id, {
            cookingStatus: "started",
            actualStartAt: now,
            estimatedReadyAt: new Date(now.getTime() + prepMinutes * 60 * 1000),
            startedById: user.id,
            startedByName: chefName,
          });
          // Sync legacy status field for backward compatibility with existing KDS consumers
          await storage.updateOrderItem(i.id, { status: "cooking", startedAt: now }, user.tenantId);
        }
      }

      if (order.status === "new" || order.status === "sent_to_kitchen") {
        await storage.updateOrder(order.id, { status: "in_progress" });
      }

      emitToTenant(user.tenantId, "kds:order_rushed", { orderId: order.id, rushedBy: chefName });

      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // PUT /api/kds/orders/:id/rush — rush all items in an order by orderId (manager/owner)
  app.put("/api/kds/orders/:id/rush", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const order = await storage.getOrder(req.params.id, user.tenantId);
      if (!order) return res.status(404).json({ message: "Order not found" });

      const kitSettings = await storage.getKitchenSettings(user.tenantId);

      if (kitSettings && kitSettings.allowRushOverride === false) {
        return res.status(403).json({ message: "Rush override is disabled in kitchen settings" });
      }

      if (kitSettings?.rushRequiresManagerPin ?? true) {
        const { managerPin, pin } = req.body as { managerPin?: string; pin?: string };
        const providedPin = managerPin || pin;
        if (!providedPin) {
          return res.status(400).json({ message: "Manager PIN is required to rush an order" });
        }
        const pinHash = kitSettings?.managerPinHash;
        if (!pinHash) {
          return res.status(400).json({ message: "No manager PIN has been configured for this tenant. Set one via kitchen settings." });
        }
        const pinValid = await comparePasswords(providedPin, pinHash);
        if (!pinValid) {
          return res.status(403).json({ message: "Invalid manager PIN" });
        }
      }

      const allItems = await storage.getOrderItemsByOrder(order.id);
      const now = new Date();
      const chefName = (user as any).name || (user as any).username || "Chef";

      for (const i of allItems) {
        if (["queued", "hold", "ready_to_start"].includes(i.cookingStatus || "queued")) {
          const prepMinutes = i.itemPrepMinutes ?? 0;
          await storage.updateOrderItemCooking(i.id, {
            cookingStatus: "started",
            actualStartAt: now,
            estimatedReadyAt: new Date(now.getTime() + prepMinutes * 60 * 1000),
            startedById: user.id,
            startedByName: chefName,
          });
          await storage.updateOrderItem(i.id, { status: "cooking", startedAt: now }, user.tenantId);
        }
      }

      if (order.status === "new" || order.status === "sent_to_kitchen") {
        await storage.updateOrder(order.id, { status: "in_progress" });
      }

      emitToTenant(user.tenantId, "kds:order_rushed", { orderId: order.id, rushedBy: chefName });

      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // POST /api/kds/orders/:id/timing — calculate and save timing suggestions
  app.post("/api/kds/orders/:id/timing", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      const order = await storage.getOrder(req.params.id, user.tenantId);
      if (!order) return res.status(403).json({ message: "Forbidden" });

      const { targetReadyTime } = req.body;
      const targetReady = targetReadyTime ? new Date(targetReadyTime) : undefined;

      const items = await storage.getOrderItemsByOrder(order.id);
      // Only calculate timing for course-1 items; course 2+ are deferred until fired
      const course1Items = items.filter(i => (i.courseNumber ?? 1) === 1);
      const laterCourseItems = items.filter(i => (i.courseNumber ?? 1) > 1);

      const timingInput = course1Items.map(i => ({
        id: i.id,
        name: i.name,
        prepMinutes: i.itemPrepMinutes ?? 0,
        courseNumber: 1,
      }));

      const timings = calculateSuggestedStartTimes(timingInput, targetReady);

      for (const t of timings) {
        await storage.updateOrderItemCooking(t.itemId, {
          suggestedStartAt: t.suggestedStartAt,
          estimatedReadyAt: t.estimatedReadyAt,
        });
      }

      // Ensure course 2+ items remain with null timing
      for (const item of laterCourseItems) {
        await storage.updateOrderItemCooking(item.id, {
          suggestedStartAt: null,
          estimatedReadyAt: null,
        });
      }

      res.json(timings);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // GET /api/kds/orders/:id/item-status — get all items with full cooking status + timing
  app.get("/api/kds/orders/:id/item-status", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      const order = await storage.getOrder(req.params.id, user.tenantId);
      if (!order) return res.status(403).json({ message: "Forbidden" });

      const items = await storage.getOrderItemsByOrder(order.id);
      const kitSettings = await storage.getKitchenSettings(user.tenantId);
      const alertOverdueMinutes = kitSettings?.alertOverdueMinutes ?? 3;
      const now = new Date();

      // Staged overdue thresholds:
      //   amber = alertOverdueMinutes (default 3 min) — item-level overdue alert
      //   manager escalation = max(alertOverdueMinutes + 2, 5) min — critical escalation to manager
      const amberThreshold = alertOverdueMinutes;
      const managerThreshold = Math.max(alertOverdueMinutes + 2, 5);

      // Step 1: Promote "queued" items to "ready_to_start" if suggestedStartAt has arrived (0-min overdue).
      // This is the nominal transition — fired here so KDS consumers always see the correct state.
      const readyToStartTransitions: string[] = [];
      for (const item of items) {
        if (item.cookingStatus === "queued" && item.suggestedStartAt && item.suggestedStartAt <= now) {
          await storage.updateOrderItemCooking(item.id, { cookingStatus: "ready_to_start" });
          item.cookingStatus = "ready_to_start";
          readyToStartTransitions.push(item.id);
        }
      }
      if (readyToStartTransitions.length > 0) {
        emitToTenant(user.tenantId, "kds:items_ready_to_start", {
          orderId: order.id,
          itemIds: readyToStartTransitions,
        });
      }

      // Step 2: Compute per-item status enrichment and overdue classification
      const result = items.map(item => {
        let minutesRemaining: number | null = null;
        let minutesOverdueToStart: number | null = null;
        let overdueLevel: "none" | "amber" | "critical" = "none";

        if (item.cookingStatus === "started" && item.estimatedReadyAt) {
          minutesRemaining = Math.round((item.estimatedReadyAt.getTime() - now.getTime()) / 60000);
        }

        // Overdue-to-start: item not yet started but suggestedStartAt has passed.
        // Include ready_to_start and hold states (hold items with suggestedStartAt are
        // overdue if their blocking dependency resolved but they were never unblocked).
        if (
          item.suggestedStartAt &&
          ["ready_to_start", "hold"].includes(item.cookingStatus || "queued")
        ) {
          const overdueMs = now.getTime() - item.suggestedStartAt.getTime();
          if (overdueMs > 0) {
            minutesOverdueToStart = Math.round(overdueMs / 60000);
            if (minutesOverdueToStart >= managerThreshold) overdueLevel = "critical";
            else if (minutesOverdueToStart >= amberThreshold) overdueLevel = "amber";
          }
        }

        return { ...item, minutesRemaining, minutesOverdueToStart, overdueLevel };
      });

      // Step 3: Emit staged overdue alerts for items past the amber/critical thresholds
      const amberItems = result.filter(r => r.overdueLevel !== "none");
      const criticalItems = result.filter(r => r.overdueLevel === "critical");

      if (amberItems.length > 0) {
        emitToTenant(user.tenantId, "kds:item_overdue", {
          orderId: order.id,
          overdueItems: amberItems.map(r => ({
            itemId: r.id,
            itemName: r.name,
            minutesOverdue: r.minutesOverdueToStart,
            overdueLevel: r.overdueLevel,
            suggestedStartAt: r.suggestedStartAt,
          })),
        });
      }
      if (criticalItems.length > 0) {
        emitToTenant(user.tenantId, "kds:manager_alert", {
          type: "items_overdue_critical",
          orderId: order.id,
          count: criticalItems.length,
          items: criticalItems.map(r => ({ itemId: r.id, itemName: r.name, minutesOverdue: r.minutesOverdueToStart })),
        });
      }

      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // POST /api/orders/:id/courses — set up courses for an order
  app.post("/api/orders/:id/courses", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      const order = await storage.getOrder(req.params.id, user.tenantId);
      if (!order) return res.status(403).json({ message: "Forbidden" });

      const { courses } = req.body as { courses: Array<{ courseNumber: number; courseName?: string; itemIds: string[] }> };
      if (!Array.isArray(courses)) return res.status(400).json({ message: "courses array required" });

      // Verify all itemIds belong to this order (security: prevent cross-order mutation)
      const orderItems = await storage.getOrderItemsByOrder(order.id);
      const validItemIds = new Set(orderItems.map(i => i.id));
      for (const c of courses) {
        for (const itemId of c.itemIds) {
          if (!validItemIds.has(itemId)) {
            return res.status(403).json({ message: `Item ${itemId} does not belong to this order` });
          }
        }
      }

      const createdCourses = [];
      for (const c of courses) {
        const created = await storage.createOrderCourse({
          tenantId: user.tenantId,
          orderId: order.id,
          courseNumber: c.courseNumber,
          courseName: c.courseName || null,
          status: c.courseNumber === 1 ? "cooking" : "waiting",
        });
        createdCourses.push(created);

        // Update item course numbers
        for (const itemId of c.itemIds) {
          await storage.updateOrderItemCooking(itemId, { courseNumber: c.courseNumber });
        }
      }

      res.json(createdCourses);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // PUT /api/orders/:id/courses/:num/fire — fire a course
  app.put("/api/orders/:id/courses/:num/fire", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      const order = await storage.getOrder(req.params.id, user.tenantId);
      if (!order) return res.status(403).json({ message: "Forbidden" });

      const courseNumber = parseInt(req.params.num, 10);
      const chefName = (user as any).name || (user as any).username || "Chef";
      const now = new Date();

      await storage.updateOrderCourse(order.id, courseNumber, {
        status: "cooking",
        fireAt: now,
        firedBy: user.id,
        firedByName: chefName,
      });

      // Recalculate timing for items in this course
      const allItems = await storage.getOrderItemsByOrder(order.id);
      const courseItems = allItems
        .filter(i => (i.courseNumber ?? 1) === courseNumber)
        .map(i => ({ id: i.id, name: i.name, prepMinutes: i.itemPrepMinutes ?? 0, courseNumber: i.courseNumber ?? 1 }));

      if (courseItems.length > 0) {
        const timings = calculateSuggestedStartTimes(courseItems);
        for (const t of timings) {
          await storage.updateOrderItemCooking(t.itemId, { suggestedStartAt: t.suggestedStartAt, estimatedReadyAt: t.estimatedReadyAt });
        }
      }

      emitToTenant(user.tenantId, "kds:course_fired", { orderId: order.id, courseNumber, firedBy: chefName });

      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // GET /api/kds/coordinator/live — expeditor live view
  app.get("/api/kds/coordinator/live", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      const allOrders = await storage.getOrdersByTenant(user.tenantId);
      const activeOrders = allOrders.filter(o => ["new", "sent_to_kitchen", "in_progress", "partially_ready", "ready"].includes(o.status || ""));
      const now = new Date();

      const result = [];
      for (const order of activeOrders) {
        const items = await storage.getOrderItemsByOrder(order.id);
        const itemsWithTiming = items.map(item => {
          let minutesRemaining: number | null = null;
          if (item.cookingStatus === "started" && item.estimatedReadyAt) {
            minutesRemaining = Math.round((item.estimatedReadyAt.getTime() - now.getTime()) / 60000);
          }
          return { ...item, minutesRemaining };
        });

        const stationSummary: Record<string, { total: number; started: number; ready: number }> = {};
        for (const item of items) {
          const st = item.station || "unknown";
          if (!stationSummary[st]) stationSummary[st] = { total: 0, started: 0, ready: 0 };
          stationSummary[st].total++;
          if (item.cookingStatus === "started") stationSummary[st].started++;
          if (item.cookingStatus === "ready") stationSummary[st].ready++;
        }

        result.push({ ...order, items: itemsWithTiming, stationSummary });
      }

      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
