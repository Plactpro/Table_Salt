import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";
import { requirePermission } from "../permissions";
import { auditLogFromReq } from "../audit";
import { emitToTenant } from "../realtime";
import { insertRecipeSchema } from "@shared/schema";
import { convertUnits } from "@shared/units";

export function registerRecipesRoutes(app: Express): void {
  app.get("/api/recipes", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const allRecipes = await storage.getRecipesByTenant(user.tenantId);
      const result = await Promise.all(allRecipes.map(async (r) => {
        const ingredients = await storage.getRecipeIngredients(r.id);
        return { ...r, ingredients };
      }));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/recipes/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const recipe = await storage.getRecipe(req.params.id);
      if (!recipe || recipe.tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      const ingredients = await storage.getRecipeIngredients(recipe.id);
      res.json({ ...recipe, ingredients });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/recipes", requireAuth, requirePermission("edit_recipe"), async (req, res) => {
    try {
      const user = req.user as any;
      const { ingredients, ...recipeData } = req.body;
      const validated = insertRecipeSchema.omit({ tenantId: true }).safeParse(recipeData);
      if (!validated.success) return res.status(400).json({ message: "Invalid recipe data", errors: validated.error.format() });
      if (recipeData.menuItemId) {
        const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
        if (!menuItems.find(m => m.id === recipeData.menuItemId)) {
          return res.status(400).json({ message: "Invalid menu item" });
        }
      }
      const tenantInventory = await storage.getInventoryByTenant(user.tenantId);
      const tenantInvIds = new Set(tenantInventory.map(i => i.id));
      const recipe = await storage.createRecipe({ ...recipeData, tenantId: user.tenantId });
      if (ingredients && Array.isArray(ingredients)) {
        for (let i = 0; i < ingredients.length; i++) {
          if (!tenantInvIds.has(ingredients[i].inventoryItemId)) continue;
          await storage.createRecipeIngredient({ ...ingredients[i], recipeId: recipe.id, sortOrder: i });
        }
      }
      const createdIngredients = await storage.getRecipeIngredients(recipe.id);
      auditLogFromReq(req, { action: "recipe_created", entityType: "recipe", entityId: recipe.id, entityName: recipe.name, after: { name: recipe.name, ingredientCount: createdIngredients.length } });
      res.json({ ...recipe, ingredients: createdIngredients });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/recipes/:id", requireAuth, requirePermission("edit_recipe"), async (req, res) => {
    try {
      const user = req.user as any;
      const { ingredients, ...recipeData } = req.body;
      if (recipeData.menuItemId) {
        const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
        if (!menuItems.find((m: any) => m.id === recipeData.menuItemId)) {
          return res.status(400).json({ message: "Invalid menu item" });
        }
      }
      const recipe = await storage.updateRecipe(req.params.id, user.tenantId, recipeData);
      if (!recipe) return res.status(404).json({ message: "Not found" });
      if (ingredients && Array.isArray(ingredients)) {
        const tenantInventory = await storage.getInventoryByTenant(user.tenantId);
        const tenantInvIds = new Set(tenantInventory.map((i: any) => i.id));
        await storage.deleteRecipeIngredients(recipe.id);
        for (let i = 0; i < ingredients.length; i++) {
          if (!tenantInvIds.has(ingredients[i].inventoryItemId)) continue;
          await storage.createRecipeIngredient({ ...ingredients[i], recipeId: recipe.id, sortOrder: i });
        }
      }
      const updatedIngredients = await storage.getRecipeIngredients(recipe.id);
      auditLogFromReq(req, { action: "recipe_updated", entityType: "recipe", entityId: req.params.id, entityName: recipe.name, after: { name: recipe.name, ingredientCount: updatedIngredients.length } });
      res.json({ ...recipe, ingredients: updatedIngredients });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/recipes/:id", requireAuth, requirePermission("edit_recipe"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteRecipe(req.params.id, user.tenantId, user.id);
      auditLogFromReq(req, { action: "recipe_deleted", entityType: "recipe", entityId: req.params.id });
      res.json({ message: "Deleted" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/recipes/unlinked-menu-items", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const allRecipes = await storage.getRecipesByTenant(user.tenantId);
      const linkedMenuItemIds = new Set(allRecipes.map(r => r.menuItemId).filter(Boolean));
      const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
      const unlinked = menuItems.filter(m => m.available !== false && !linkedMenuItemIds.has(m.id));
      res.json(unlinked.map(m => ({ id: m.id, name: m.name, price: m.price, categoryId: m.categoryId })));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/food-cost-report", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { dateFrom, dateTo, outletId } = req.query as { dateFrom?: string; dateTo?: string; outletId?: string };
      const allRecipes = await storage.getRecipesByTenant(user.tenantId);
      const inventory = await storage.getInventoryByTenant(user.tenantId);
      const invMap = new Map(inventory.map(i => [i.id, i]));
      const menuItemsAll = await storage.getMenuItemsByTenant(user.tenantId);
      const menuMap = new Map(menuItemsAll.map(m => [m.id, m]));
      const orders = await storage.getOrdersByTenant(user.tenantId);
      const fromDate = dateFrom ? new Date(dateFrom) : null;
      const toDate = dateTo ? new Date(dateTo + "T23:59:59.999Z") : null;
      const paidOrders = orders.filter(o => {
        if (o.status !== "paid") return false;
        const oDate = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
        if (fromDate && oDate < fromDate) return false;
        if (toDate && oDate > toDate) return false;
        if (outletId && o.outletId !== outletId) return false;
        return true;
      });

      const menuItemSales = new Map<string, number>();
      const menuItemRevenue = new Map<string, number>();
      for (const order of paidOrders) {
        const items = await storage.getOrderItemsByOrder(order.id);
        for (const oi of items) {
          menuItemSales.set(oi.menuItemId, (menuItemSales.get(oi.menuItemId) || 0) + Number(oi.quantity));
          menuItemRevenue.set(oi.menuItemId, (menuItemRevenue.get(oi.menuItemId) || 0) + Number(oi.price) * Number(oi.quantity));
        }
      }

      const ingredientIdealUsage = new Map<string, number>();

      const report = await Promise.all(allRecipes.map(async (recipe) => {
        const ingredients = await storage.getRecipeIngredients(recipe.id);
        let plateCost = 0;
        const soldQty = recipe.menuItemId ? (menuItemSales.get(recipe.menuItemId) || 0) : 0;

        const ingredientDetails = ingredients.map(ing => {
          const invItem = invMap.get(ing.inventoryItemId);
          const costPerUnit = Number(invItem?.costPrice || 0);
          const qty = Number(ing.quantity);
          const waste = Number(ing.wastePct || 0) / 100;
          const effectiveQty = qty / (1 - waste);
          const ingUnit = ing.unit || invItem?.unit || "pcs";
          const invUnit = invItem?.unit || "pcs";
          const convertedQty = convertUnits(effectiveQty, ingUnit, invUnit);
          const cost = convertedQty * costPerUnit;
          plateCost += cost;
          const idealUse = convertedQty * soldQty;
          if (invItem) ingredientIdealUsage.set(invItem.id, (ingredientIdealUsage.get(invItem.id) || 0) + idealUse);
          return { name: invItem?.name || "Unknown", inventoryItemId: ing.inventoryItemId, quantity: qty, unit: ingUnit, wastePct: Number(ing.wastePct || 0), costPerUnit, totalCost: Math.round(cost * 100) / 100, idealUsage: Math.round(idealUse * 100) / 100 };
        });

        const menuItem = recipe.menuItemId ? menuMap.get(recipe.menuItemId) : null;
        const sellingPrice = Number(menuItem?.price || 0);
        const margin = sellingPrice > 0 ? sellingPrice - plateCost : 0;
        const foodCostPct = sellingPrice > 0 ? (plateCost / sellingPrice) * 100 : 0;
        return { recipeId: recipe.id, recipeName: recipe.name, menuItemName: menuItem?.name || null, menuItemId: recipe.menuItemId, categoryId: menuItem?.categoryId || null, sellingPrice: Math.round(sellingPrice * 100) / 100, plateCost: Math.round(plateCost * 100) / 100, margin: Math.round(margin * 100) / 100, foodCostPct: Math.round(foodCostPct * 10) / 10, soldQty, totalIdealCost: Math.round(plateCost * soldQty * 100) / 100, ingredients: ingredientDetails };
      }));

      const movements = await storage.getStockMovementsByTenant(user.tenantId, 10000);
      const actualUsageByItem = new Map<string, number>();
      for (const mv of movements) {
        if (mv.type !== "out") continue;
        const mvDate = mv.createdAt instanceof Date ? mv.createdAt : new Date(mv.createdAt);
        if (fromDate && mvDate < fromDate) continue;
        if (toDate && mvDate > toDate) continue;
        if (outletId && mv.outletId !== outletId) continue;
        actualUsageByItem.set(mv.itemId, (actualUsageByItem.get(mv.itemId) || 0) + Number(mv.quantity));
      }

      const varianceByIngredient = Array.from(ingredientIdealUsage.entries()).map(([itemId, idealQty]) => {
        const item = invMap.get(itemId);
        if (!item) return null;
        const actualUsed = actualUsageByItem.get(itemId) || 0;
        const varianceQty = actualUsed - idealQty;
        const costPrice = Number(item.costPrice || 0);
        return { itemId, itemName: item.name, unit: item.unit, idealUsage: Math.round(idealQty * 100) / 100, actualUsage: Math.round(actualUsed * 100) / 100, varianceQty: Math.round(varianceQty * 100) / 100, currentStock: Number(item.currentStock || 0), costPrice, idealCost: Math.round(idealQty * costPrice * 100) / 100, actualCost: Math.round(actualUsed * costPrice * 100) / 100, varianceCost: Math.round(varianceQty * costPrice * 100) / 100 };
      }).filter(Boolean);

      const totalCost = report.reduce((s, r) => s + r.plateCost, 0);
      const totalRevenue = report.reduce((s, r) => s + r.sellingPrice, 0);
      const avgFoodCostPct = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
      const totalSalesCost = report.reduce((s, r) => s + r.totalIdealCost, 0);
      const totalSalesRevenue = report.reduce((s, r) => s + r.sellingPrice * r.soldQty, 0);
      const salesWeightedFoodCostPct = totalSalesRevenue > 0 ? (totalSalesCost / totalSalesRevenue) * 100 : 0;
      const topMovers = inventory.map(item => ({ itemId: item.id, itemName: item.name, usage: Math.round((ingredientIdealUsage.get(item.id) || 0) * 100) / 100, unit: item.unit })).sort((a, b) => b.usage - a.usage).slice(0, 10);
      const reorderSuggestions = inventory.filter(item => { const stock = Number(item.currentStock || 0); const par = Number(item.parLevel || item.reorderLevel || 0); return stock <= par && par > 0; }).map(item => ({ itemId: item.id, itemName: item.name, currentStock: Number(item.currentStock || 0), reorderLevel: Number(item.reorderLevel || 0), parLevel: Number(item.parLevel || 0), leadTimeDays: Number(item.leadTimeDays || 1), suggestedOrder: Math.max(0, Number(item.parLevel || item.reorderLevel || 0) * 2 - Number(item.currentStock || 0)), unit: item.unit }));

      const linkedMenuItemIds = new Set(allRecipes.map(r => r.menuItemId).filter(Boolean));
      const untrackedMenuItems = menuItemsAll
        .filter(m => m.available !== false && !linkedMenuItemIds.has(m.id) && menuItemSales.has(m.id))
        .map(m => ({
          id: m.id,
          name: m.name,
          price: Number(m.price || 0),
          categoryId: m.categoryId,
          timesSold: menuItemSales.get(m.id) || 0,
          totalRevenue: Math.round((menuItemRevenue.get(m.id) || 0) * 100) / 100,
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      res.json({ recipes: report, summary: { totalCost: Math.round(totalCost * 100) / 100, totalRevenue: Math.round(totalRevenue * 100) / 100, avgFoodCostPct: Math.round(avgFoodCostPct * 10) / 10, totalSalesCost: Math.round(totalSalesCost * 100) / 100, totalSalesRevenue: Math.round(totalSalesRevenue * 100) / 100, salesWeightedFoodCostPct: Math.round(salesWeightedFoodCostPct * 10) / 10 }, varianceByIngredient, topMovers, reorderSuggestions, untrackedMenuItems });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/stock-takes", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getStockTakesByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/stock-takes/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const take = await storage.getStockTake(req.params.id);
      if (!take || take.tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      const lines = await storage.getStockTakeLines(take.id);
      res.json({ ...take, lines });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/stock-takes", requireRole("owner", "manager"), requirePermission("adjust_stock"), async (req, res) => {
    try {
      const user = req.user as any;
      const inventory = await storage.getInventoryByTenant(user.tenantId);
      const take = await storage.createStockTake({ tenantId: user.tenantId, conductedBy: user.id, status: "draft", notes: req.body.notes || null });
      for (const item of inventory) {
        await storage.createStockTakeLine({ stockTakeId: take.id, inventoryItemId: item.id, expectedQty: item.currentStock || "0" });
      }
      const lines = await storage.getStockTakeLines(take.id);
      res.json({ ...take, lines });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/stock-takes/:id/lines/:lineId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const take = await storage.getStockTake(req.params.id);
      if (!take || take.tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      const { countedQty } = req.body;
      const lines = await storage.getStockTakeLines(take.id);
      const line = lines.find(l => l.id === req.params.lineId);
      if (!line) return res.status(404).json({ message: "Line not found" });
      const variance = Number(countedQty) - Number(line.expectedQty);
      const invItem = await storage.getInventoryItem(line.inventoryItemId, user.tenantId);
      const varianceCost = variance * Number(invItem?.costPrice || 0);
      const updated = await storage.updateStockTakeLine(req.params.lineId, { countedQty: String(countedQty), varianceQty: String(variance), varianceCost: String(Math.round(varianceCost * 100) / 100) });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/stock-takes/:id/complete", requireRole("owner", "manager"), requirePermission("adjust_stock"), async (req, res) => {
    try {
      const user = req.user as any;
      const take = await storage.getStockTake(req.params.id);
      if (!take || take.tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      const lines = await storage.getStockTakeLines(take.id);
      let adjustmentCount = 0;
      for (const line of lines) {
        if (line.countedQty !== null && line.countedQty !== undefined) {
          await storage.updateInventoryItem(line.inventoryItemId, { currentStock: line.countedQty }, user.tenantId);
          const variance = Number(line.countedQty) - Number(line.expectedQty);
          if (variance !== 0) {
            adjustmentCount++;
            await storage.createStockMovement({ tenantId: user.tenantId, itemId: line.inventoryItemId, type: variance > 0 ? "in" : "out", quantity: String(Math.abs(variance)), reason: `Stock take adjustment (Take #${take.id.slice(0, 8)})` });
          }
        }
      }
      const updated = await storage.updateStockTake(req.params.id, user.tenantId, { status: "completed", completedAt: new Date() });
      auditLogFromReq(req, { action: "inventory_adjusted", entityType: "stock_take", entityId: req.params.id, metadata: { type: "stock_take_complete", linesCount: lines.length, adjustments: adjustmentCount } });
      emitToTenant(user.tenantId, "stock:updated", { stockTakeId: req.params.id, adjustmentCount, source: "stock_take" });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

}
