import type { Express } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
import { eq, sql, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";
import { requirePermission } from "../permissions";
import { can } from "../permissions";
import { auditLogFromReq } from "../audit";
import { emitToTenant } from "../realtime";
import { getSecuritySettings, verifySupervisorOverride } from "./_shared";
import { inventoryItems as inventoryItemsTable } from "@shared/schema";
import { alertEngine } from "../services/alert-engine";

function sanitizeInventoryBody(body: Record<string, unknown>) {
  const numericFields = ["currentStock", "reorderLevel", "costPrice", "costPerPiece",
                         "parLevelPerShift", "reorderPieces", "parLevelPerShiftUnit"];
  const result = { ...body };
  for (const field of numericFields) {
    if (result[field] === "" || result[field] === undefined) {
      result[field] = null;
    }
  }
  return result;
}

export function registerInventoryRoutes(app: Express): void {
  app.get("/api/inventory", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const itemCategory = req.query.itemCategory as string | undefined;
      const countWhere = itemCategory
        ? and(eq(inventoryItemsTable.tenantId, user.tenantId), eq(inventoryItemsTable.isDeleted, false), eq(inventoryItemsTable.itemCategory, itemCategory))
        : and(eq(inventoryItemsTable.tenantId, user.tenantId), eq(inventoryItemsTable.isDeleted, false));
      const [data, [{ total }]] = await Promise.all([
        storage.getInventoryByTenant(user.tenantId, { limit, offset, itemCategory }),
        db.select({ total: sql<number>`count(*)::int` }).from(inventoryItemsTable).where(countWhere),
      ]);
      res.json({ data, total: Number(total), limit, offset, hasMore: offset + data.length < Number(total) });
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
    const item = await storage.createInventoryItem({ ...sanitizeInventoryBody(req.body), tenantId: user.tenantId });
    res.json(item);
  });

  app.patch("/api/inventory/:id", requireRole("owner", "manager"), requirePermission("manage_inventory"), async (req, res) => {
    const user = req.user as any;
    const item = await storage.updateInventoryItem(req.params.id, sanitizeInventoryBody(req.body), user.tenantId);
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json(item);
  });

  app.delete("/api/inventory/:id", requireRole("owner", "manager"), requirePermission("manage_inventory"), async (req, res) => {
    try {
      const user = req.user as any;
      const item = await storage.getInventoryItem(req.params.id, user.tenantId);
      if (!item) return res.status(404).json({ message: "Item not found" });

      const { rows: activeRecipes } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM recipe_ingredients ri
         JOIN recipes r ON r.id = ri.recipe_id
         WHERE ri.inventory_item_id = $1
           AND r.tenant_id = $2
           AND r.is_deleted = false
           AND r.active = true`,
        [req.params.id, user.tenantId]
      );
      const recipeCount = activeRecipes[0]?.cnt ?? 0;
      if (recipeCount > 0) {
        return res.status(400).json({
          message: `Cannot delete "${item.name}" — it is used in ${recipeCount} active recipe${recipeCount !== 1 ? "s" : ""}`,
          inUse: true,
          count: recipeCount,
        });
      }

      const { rows: poRows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM purchase_order_items poi
         JOIN purchase_orders po ON po.id = poi.purchase_order_id
         WHERE poi.inventory_item_id = $1
           AND po.tenant_id = $2
           AND po.status NOT IN ('closed','cancelled','received')`,
        [req.params.id, user.tenantId]
      );
      const activePOCount = poRows[0]?.cnt ?? 0;
      if (activePOCount > 0) {
        return res.status(400).json({
          message: `Cannot delete "${item.name}" — it is on ${activePOCount} active purchase order${activePOCount !== 1 ? "s" : ""}`,
          inUse: true,
          count: activePOCount,
        });
      }

      await storage.deleteInventoryItem(req.params.id, user.tenantId, user.id);
      res.json({ message: "Deleted" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/inventory/:id/adjust", requireRole("owner", "manager"), requirePermission("adjust_stock"), async (req, res) => {
    const user = req.user as any;
    const { quantity, type, reason, supervisorOverride } = req.body;

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

    // SELECT FOR UPDATE: lock the row within a transaction to prevent race conditions
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2 AND is_deleted = false FOR UPDATE`,
        [req.params.id, user.tenantId]
      );
      if (!rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Item not found" });
      }
      const lockedItem = rows[0];
      const rawNewStock = Number(lockedItem.current_stock) + (type === "in" ? Number(quantity) : -Number(quantity));
      const newStock = lockedItem.unit_type === "PIECE" ? Math.round(rawNewStock) : rawNewStock;
      await client.query(`UPDATE inventory_items SET current_stock = $1 WHERE id = $2`, [String(newStock), req.params.id]);
      const movementType = type === "in" ? "STOCK_IN" : "ADJUSTMENT";
      await client.query(
        `INSERT INTO stock_movements (tenant_id, item_id, type, quantity, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.tenantId, req.params.id, movementType, String(quantity), reason]
      );
      await client.query("COMMIT");
      auditLogFromReq(req, { action: "inventory_adjusted", entityType: "inventory_item", entityId: req.params.id, entityName: lockedItem.name, before: { currentStock: lockedItem.current_stock }, after: { currentStock: String(newStock) }, metadata: { type, quantity, reason } });
      emitToTenant(user.tenantId, "stock:updated", { itemId: req.params.id, itemName: lockedItem.name, currentStock: newStock, type, quantity });
      if (newStock <= 0) {
        alertEngine.trigger("ALERT-10", { tenantId: user.tenantId, outletId: user.outletId ?? undefined, referenceId: req.params.id, message: `Out of stock: ${lockedItem.name}` }).catch(() => {});
      }
      res.json({ message: "Stock adjusted" });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ message: err.message });
    } finally {
      client.release();
    }
  });
}
