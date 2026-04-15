/**
 * Shared bulk-start logic for an order — used by both the POST /api/kds/orders/:id/start
 * endpoint and the auto_start cooking mode trigger.
 *
 * Performs:
 * 1. Recipe-based inventory deduction (with idempotency guard)
 * 2. Legacy order_items.status = "cooking" + startedAt timestamp
 * 3. Order status advancement to in_progress
 */
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { storage } from "../storage";
import {
  inventoryItems as inventoryItemsTable,
  stockMovements as stockMovementsTable,
  securityAlerts,
  type Order,
  type OrderItem,
} from "@shared/schema";
import { convertUnits } from "@shared/units";
import { emitToTenant } from "../realtime";

export interface BulkStartResult {
  deducted: number;
  alreadyDeducted: boolean;
  itemsStarted: number;
}

export async function bulkStartOrderItems(
  order: Order,
  items: OrderItem[],
  tenantId: string,
  chefId: string,
  chefName: string,
  station: string | null = null,
  force = false,
): Promise<BulkStartResult> {
  const pending = items.filter(i => i.status === "pending" || !i.status);
  if (pending.length === 0) return { deducted: 0, alreadyDeducted: false, itemsStarted: 0 };

  const existingMovements = await storage.getStockMovementsByOrder(order.id);
  const alreadyDeducted = existingMovements.some(m => m.type === "RECIPE_CONSUMPTION");
  const shouldDeduct = order.channel !== "kiosk" && !alreadyDeducted;
  const activeShift = await storage.getActiveShift(tenantId, order.outletId || undefined);

  const stockWrites: Array<{
    inventoryItemId: string;
    qty: number;
    menuItemId: string;
    recipeId: string;
    menuItemName: string;
  }> = [];

  if (shouldDeduct) {
    for (const oi of pending) {
      if (!oi.menuItemId) continue;
      const recipe = await storage.getRecipeByMenuItem(oi.menuItemId);
      if (!recipe) continue;
      const recipeIngs = await storage.getRecipeIngredients(recipe.id);
      for (const ing of recipeIngs) {
        const invItem = await storage.getInventoryItem(ing.inventoryItemId, tenantId);
        if (!invItem) continue;
        const ingUnit = ing.unit || invItem.unit || "pcs";
        const invUnit = invItem.unit || "pcs";
        const baseQty = Number(ing.quantity) / (1 - Number(ing.wastePct || 0) / 100);
        const convertedQty = convertUnits(baseQty, ingUnit, invUnit);
        const required = Math.round(convertedQty * (oi.quantity || 1) * 100) / 100;
        stockWrites.push({
          inventoryItemId: ing.inventoryItemId,
          qty: required,
          menuItemId: oi.menuItemId,
          recipeId: recipe.id,
          menuItemName: oi.name,
        });
      }
    }

    if (stockWrites.length > 0) {
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
            tenantId,
            itemId: w.inventoryItemId,
            type: "RECIPE_CONSUMPTION",
            quantity: String(-w.qty),
            reason: `KDS auto-start: ${w.menuItemName} prepared by ${chefName}`,
            orderId: order.id,
            orderNumber: (order as any).orderNumber || order.id.slice(0, 6).toUpperCase(),
            menuItemId: w.menuItemId,
            recipeId: w.recipeId,
            chefId,
            chefName,
            station,
            shiftId: activeShift?.id || null,
            stockBefore: String(stockBefore),
            stockAfter: String(stockAfter),
          }).returning({ id: stockMovementsTable.id });
          if (reorderLevel > 0 && stockBefore > reorderLevel && stockAfter <= reorderLevel) {
            lowStockItems.push({ id: w.inventoryItemId, name: invRow?.name || w.menuItemName, after: stockAfter, reorder: reorderLevel, stockMovementId: movement?.id });
          }
        }
      });
      for (const lowItem of lowStockItems) {
        await db.insert(securityAlerts).values({
          tenantId,
          type: "LOW_STOCK",
          severity: "warning",
          title: `Low Stock: ${lowItem.name}`,
          description: `Stock dropped to ${lowItem.after} (reorder: ${lowItem.reorder}) after order #${(order as any).orderNumber || order.id.slice(0, 6).toUpperCase()}`,
          metadata: { itemId: lowItem.id, currentStock: lowItem.after, reorderLevel: lowItem.reorder, orderId: order.id, stockMovementId: lowItem.stockMovementId },
        });
        emitToTenant(tenantId, "low_stock_alert", {
          itemId: lowItem.id,
          itemName: lowItem.name,
          currentStock: lowItem.after,
          reorderLevel: lowItem.reorder,
          stockMovementId: lowItem.stockMovementId,
        });
      }
    }
  }

  const now = new Date();
  for (const oi of pending) {
    await storage.updateOrderItem(oi.id, { status: "cooking", startedAt: now }, tenantId);
    await storage.updateOrderItemCooking(oi.id, {
      cookingStatus: "started",
      actualStartAt: now,
      estimatedReadyAt: new Date(now.getTime() + (oi.itemPrepMinutes ?? 0) * 60 * 1000),
      startedById: chefId,
      startedByName: chefName,
    });
  }

  if (order.status === "new" || order.status === "sent_to_kitchen") {
    await storage.updateOrder(order.id, tenantId, { status: "in_progress" });
  }

  return { deducted: stockWrites.length, alreadyDeducted, itemsStarted: pending.length };
}
