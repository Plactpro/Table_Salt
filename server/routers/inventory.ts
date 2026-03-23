import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, sql, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";
import { requirePermission } from "../permissions";
import { can } from "../permissions";
import { auditLogFromReq } from "../audit";
import { emitToTenant } from "../realtime";
import { getSecuritySettings, verifySupervisorOverride } from "./_shared";
import { inventoryItems as inventoryItemsTable } from "@shared/schema";
import { alertEngine } from "../services/alert-engine";

export function registerInventoryRoutes(app: Express): void {
  app.get("/api/inventory", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const itemCategory = req.query.itemCategory as string | undefined;
      const countWhere = itemCategory
        ? and(eq(inventoryItemsTable.tenantId, user.tenantId), eq(inventoryItemsTable.itemCategory, itemCategory))
        : eq(inventoryItemsTable.tenantId, user.tenantId);
      const [data, [{ total }]] = await Promise.all([
        storage.getInventoryByTenant(user.tenantId, { limit, offset, itemCategory }),
        db.select({ total: sql<number>`count(*)::int` }).from(inventoryItemsTable).where(countWhere),
      ]);
      res.json({ data, total: Number(total), limit, offset });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/inventory/par-check/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const items = await storage.getPiecewiseInventory(user.tenantId, { outletId: req.params.outletId });
      for (const item of items) {
        if (item.isBelowReorder) {
          alertEngine.trigger('ALERT-10', {
            tenantId: user.tenantId,
            outletId: req.params.outletId,
            referenceId: item.id,
            message: `${item.name} below par level: ${item.currentStock} pcs (Par: ${item.parLevelPerShift} pcs)`,
          }).catch(() => {});
        }
      }
      res.json(items);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
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

  app.delete("/api/inventory/:id", requireRole("owner", "manager"), requirePermission("manage_inventory"), async (req, res) => {
    await storage.deleteInventoryItem(req.params.id);
    res.json({ message: "Deleted" });
  });

  app.post("/api/inventory/:id/adjust", requireRole("owner", "manager"), requirePermission("adjust_stock"), async (req, res) => {
    const user = req.user as any;
    const { quantity, type, reason, supervisorOverride } = req.body;
    const item = await storage.getInventoryItem(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    const secSettings = await getSecuritySettings(user.tenantId);
    const isLargeAdjustment = Number(quantity) >= secSettings.largeStockAdjustmentThreshold;
    if (secSettings.requireSupervisorForLargeStockAdjustment && isLargeAdjustment && !can(user, "large_stock_adjustment")) {
      if (supervisorOverride) {
        const result = await verifySupervisorOverride(supervisorOverride, user.tenantId, "large_stock_adjustment", req);
        if (!result.verified) return res.status(403).json({ message: result.error || "Supervisor verification failed" });
      } else {
        return res.status(403).json({ message: "Permission denied", action: "large_stock_adjustment", requiresSupervisor: true });
      }
    }

    const rawNewStock = Number(item.currentStock) + (type === "in" ? Number(quantity) : -Number(quantity));
    const newStock = item.unitType === 'PIECE' ? Math.round(rawNewStock) : rawNewStock;
    await storage.updateInventoryItem(req.params.id, { currentStock: String(newStock) });
    await storage.createStockMovement({
      tenantId: user.tenantId,
      itemId: req.params.id,
      type,
      quantity: String(quantity),
      reason,
    });
    auditLogFromReq(req, { action: "inventory_adjusted", entityType: "inventory_item", entityId: req.params.id, entityName: item.name, before: { currentStock: item.currentStock }, after: { currentStock: String(newStock) }, metadata: { type, quantity, reason } });
    emitToTenant(user.tenantId, "stock:updated", { itemId: req.params.id, itemName: item.name, currentStock: newStock, type, quantity });
    if (newStock <= 0) {
      alertEngine.trigger('ALERT-10', { tenantId: user.tenantId, outletId: (user as any).outletId ?? undefined, referenceId: req.params.id, message: `Out of stock: ${item.name}` }).catch(() => {});
    }
    res.json({ message: "Stock adjusted" });
  });
}
