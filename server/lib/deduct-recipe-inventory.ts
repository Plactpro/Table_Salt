import { eq, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { storage } from "../storage";
import {
  inventoryItems as inventoryItemsTable,
  stockMovements as stockMovementsTable,
  type OrderItem,
} from "@shared/schema";
import { convertUnits } from "@shared/units";

export interface DeductionResult {
  deducted: number;
  skipped: number;
  alreadyDone: boolean;
}

export async function deductRecipeInventoryForOrder(
  orderId: string,
  tenantId: string,
  label: string = "order"
): Promise<DeductionResult> {
  const existing = await storage.getStockMovementsByOrder(orderId);
  const alreadyDeducted = existing.some((m) => m.type === "RECIPE_CONSUMPTION");
  if (alreadyDeducted) {
    return { deducted: 0, skipped: 0, alreadyDone: true };
  }

  const orderItems = await storage.getOrderItemsByOrder(orderId);

  type WriteEntry = {
    inventoryItemId: string;
    tenantId: string;
    menuItemId: string;
    recipeId: string;
    qty: number;
    reason: string;
  };

  const writes: WriteEntry[] = [];
  let skipped = 0;

  for (const oi of orderItems) {
    if (!oi.menuItemId) { skipped++; continue; }
    const recipe = await storage.getRecipeByMenuItem(oi.menuItemId);
    if (!recipe) {
      console.warn("[inventory-deduction] no-recipe-skip", { tenantId, orderId, menuItemId: oi.menuItemId, menuItemName: oi.name, source: label });
      skipped++;
      continue;
    }
    const recipeIngs = await storage.getRecipeIngredients(recipe.id);
    for (const ing of recipeIngs) {
            if (!ing.inventoryItemId) { skipped++; continue; }
      const invItem = await storage.getInventoryItem(ing.inventoryItemId, tenantId);
      if (!invItem) continue;
      // Guard: never auto-deduct crockery/cutlery/glassware items
      if (invItem.itemCategory === 'CROCKERY' || invItem.itemCategory === 'CUTLERY' || invItem.itemCategory === 'GLASSWARE') continue;
      const ingUnit = ing.unit || invItem.unit || "pcs";
      const invUnit = invItem.unit || "pcs";
      const baseQty = Number(ing.quantity) / (1 - Number(ing.wastePct || 0) / 100);
      const convertedQty = convertUnits(baseQty, ingUnit, invUnit);
      const qty = Math.round(convertedQty * (oi.quantity || 1) * 100) / 100;
      writes.push({
        inventoryItemId: ing.inventoryItemId,
        tenantId,
        menuItemId: oi.menuItemId,
        recipeId: recipe.id,
        qty,
        reason: `Recipe consumption (${label}): ${oi.name} x${oi.quantity || 1}`,
      });
    }
  }

  if (writes.length > 0) {
    // SELECT FOR UPDATE: lock all inventory rows before deducting to prevent concurrent race conditions
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const w of writes) {
        await client.query(
          `SELECT id FROM inventory_items WHERE id = $1 AND tenant_id = $2 AND is_deleted = false FOR UPDATE`,
          [w.inventoryItemId, w.tenantId]
        );
        await client.query(
          `UPDATE inventory_items SET current_stock = GREATEST(current_stock::numeric - $1, 0) WHERE id = $2 AND tenant_id = $3 AND is_deleted = false`,
          [w.qty, w.inventoryItemId, w.tenantId]
        );
        await client.query(
          `INSERT INTO stock_movements (tenant_id, item_id, type, quantity, reason, order_id, menu_item_id, recipe_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [w.tenantId, w.inventoryItemId, "RECIPE_CONSUMPTION", String(w.qty), w.reason, orderId, w.menuItemId, w.recipeId]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  return { deducted: writes.length, skipped, alreadyDone: false };
}

/**
 * Deduct inventory for a single order item (used by selective cooking start).
 * Checks for an existing RECIPE_CONSUMPTION movement for this specific order item
 * to prevent double-deduction.
 */
export async function deductRecipeInventoryForItem(
  orderItem: OrderItem,
  orderId: string,
  tenantId: string,
): Promise<DeductionResult> {
  if (!orderItem.menuItemId) return { deducted: 0, skipped: 1, alreadyDone: false };

  // Check idempotency: look for existing deduction tagged with this specific order item ID
  // We encode the orderItemId in the reason field since stock_movements has no orderItemId column
  const existing = await storage.getStockMovementsByOrder(orderId);
  const deductionTag = `[oi:${orderItem.id}]`;
  const alreadyDeducted = existing.some(
    (m) => m.type === "RECIPE_CONSUMPTION" && typeof m.reason === "string" && m.reason.includes(deductionTag)
  );
  if (alreadyDeducted) return { deducted: 0, skipped: 0, alreadyDone: true };

  const recipe = await storage.getRecipeByMenuItem(orderItem.menuItemId);
  if (!recipe) return { deducted: 0, skipped: 1, alreadyDone: false };

  const recipeIngs = await storage.getRecipeIngredients(recipe.id);

  type WriteEntry = {
    inventoryItemId: string;
    qty: number;
    reason: string;
  };
  const writes: WriteEntry[] = [];

  for (const ing of recipeIngs) {
          if (!ing.inventoryItemId) continue;
    const invItem = await storage.getInventoryItem(ing.inventoryItemId, tenantId);
    if (!invItem) continue;
    // Guard: never auto-deduct crockery/cutlery/glassware items
    if (invItem.itemCategory === 'CROCKERY' || invItem.itemCategory === 'CUTLERY' || invItem.itemCategory === 'GLASSWARE') continue;
    const ingUnit = ing.unit || invItem.unit || "pcs";
    const invUnit = invItem.unit || "pcs";
    const baseQty = Number(ing.quantity) / (1 - Number(ing.wastePct || 0) / 100);
    const convertedQty = convertUnits(baseQty, ingUnit, invUnit);
    const qty = Math.round(convertedQty * (orderItem.quantity || 1) * 100) / 100;
    writes.push({
      inventoryItemId: ing.inventoryItemId,
      qty,
      reason: `Recipe consumption (item-start): ${orderItem.name} x${orderItem.quantity || 1} ${deductionTag}`,
    });
  }

  if (writes.length > 0) {
    // SELECT FOR UPDATE: lock all inventory rows before deducting to prevent concurrent race conditions
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const w of writes) {
        await client.query(`SELECT id FROM inventory_items WHERE id = $1 AND tenant_id = $2 AND is_deleted = false FOR UPDATE`, [w.inventoryItemId, tenantId]);
        await client.query(
          `UPDATE inventory_items SET current_stock = GREATEST(current_stock::numeric - $1, 0) WHERE id = $2 AND tenant_id = $3 AND is_deleted = false`,
          [w.qty, w.inventoryItemId, tenantId]
        );
        await client.query(
          `INSERT INTO stock_movements (tenant_id, item_id, type, quantity, reason, order_id, menu_item_id, recipe_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [tenantId, w.inventoryItemId, "RECIPE_CONSUMPTION", String(w.qty), w.reason, orderId, orderItem.menuItemId!, recipe.id]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  return { deducted: writes.length, skipped: 0, alreadyDone: false };
}
