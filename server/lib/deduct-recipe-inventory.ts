import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  inventoryItems as inventoryItemsTable,
  stockMovements as stockMovementsTable,
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
      const invItem = await storage.getInventoryItem(ing.inventoryItemId);
      if (!invItem) continue;
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
    await db.transaction(async (tx) => {
      for (const w of writes) {
        await tx
          .update(inventoryItemsTable)
          .set({
            currentStock: sql`GREATEST(${inventoryItemsTable.currentStock}::numeric - ${w.qty}, 0)`,
          })
          .where(eq(inventoryItemsTable.id, w.inventoryItemId));
        await tx.insert(stockMovementsTable).values({
          tenantId: w.tenantId,
          itemId: w.inventoryItemId,
          type: "RECIPE_CONSUMPTION",
          quantity: String(w.qty),
          reason: w.reason,
          orderId,
          menuItemId: w.menuItemId,
          recipeId: w.recipeId,
        });
      }
    });
  }

  return { deducted: writes.length, skipped, alreadyDone: false };
}
