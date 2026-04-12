import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import {
  filterValidOrders, computeHourlySales, computeChannelMix, computeHeatmap,
  computeTopItems, computeFinanceTotals, computeWeeklyForecast, isVoidOrCancelled,
} from "../analytics-helpers";
import { pool } from "../db";
import { startBackgroundJob } from "./reports";

function parseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();
  // Date-only string? Parse as noon UTC to prevent timezone day-shift
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T12:00:00Z");
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function registerStaffRoutes(app: Express): void {
  app.get("/api/staff-schedules", requireAuth, async (req, res) => {
    const user = req.user as any;
    const schedules = await storage.getStaffSchedulesByTenant(user.tenantId);
    res.json(schedules);
  });

  app.post("/api/staff-schedules", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { userId, date, startTime, endTime } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "Staff member is required" });
      }
      if (!date) {
        return res.status(400).json({ message: "Date is required" });
      }
      if (!startTime || !endTime) {
        return res.status(400).json({ message: "Start time and end time are required" });
      }
      const shiftDate = parseDate(date);
      if (!shiftDate) {
                        return res.status(400).json({ message: "Invalid shift date - please select a valid date" });
      }
      // SW-3 fix: Drizzle's timestamp column calls .toISOString() internally,
      // so `date` must be a Date object, not a string from req.body.
      const schedule = await storage.createStaffSchedule({
        userId,
        date: shiftDate || new Date(),
        startTime,
        endTime,
        tenantId: user.tenantId,
      });
      res.json(schedule);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create shift" });
    }
  });

  app.patch("/api/staff-schedules/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const schedule = await storage.updateStaffScheduleByTenant(req.params.id, user.tenantId, req.body);
    if (!schedule) return res.status(404).json({ message: "Schedule not found" });
    res.json(schedule);
  });

  app.delete("/api/staff-schedules/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteStaffScheduleByTenant(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/dashboard", requireAuth, async (req, res) => {
    const user = req.user as any;
    const stats = await storage.getDashboardStats(user.tenantId);
    res.json(stats);
  });

  app.get("/api/reports/sales", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = req.query.to ? new Date(req.query.to as string) : new Date();
      const params = { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
      const job = await startBackgroundJob(user.tenantId, "SYNC_SALES", params, () => storage.getSalesReport(user.tenantId, from, to));
      res.json(job);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/analytics/summary", requireAuth, async (req, res) => {
    const user = req.user as any;
    const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();
    const report = await storage.getSalesReport(user.tenantId, from, to);
    res.json({
      totalRevenue: Number(report.totals?.revenue ?? 0),
      totalRefunds: report.totalRefunds,
      totalRefunded: report.totalRefunded,
      refundCount: report.refundCount,
      netRevenue: report.netRevenue,
      orderCount: Number(report.totals?.orderCount ?? 0),
    });
  });

  app.get("/api/reports/operations", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = req.query.to ? new Date(req.query.to as string) : new Date();
      const params = { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
      const job = await startBackgroundJob(user.tenantId, "SYNC_OPERATIONS", params, async () => {
        const allOrders = await storage.getOrdersByTenant(user.tenantId);
        const rangeOrders = allOrders.filter(o => { const d = new Date(o.createdAt!); return d >= from && d <= to; });
        const validOrders = filterValidOrders(rangeOrders);
        const totalRevenue = validOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
        const totalOrders = validOrders.length;
        const { rows: opRefundRows } = await pool.query(
          `SELECT bp.bill_id, bp.amount, bp.created_at, b.created_at AS bill_created_at
           FROM bill_payments bp JOIN bills b ON b.id = bp.bill_id
           WHERE bp.tenant_id = $1 AND bp.is_refund = true AND b.created_at >= $2 AND b.created_at <= $3`,
          [user.tenantId, from, to]
        );
        const opRefunds = opRefundRows.map((r: { bill_id: string; amount: string; created_at: Date | null; bill_created_at: Date | null }) => ({
          billId: r.bill_id, amount: r.amount, createdAt: r.created_at, billCreatedAt: r.bill_created_at,
        }));
        const hourlySales = computeHourlySales(rangeOrders, opRefunds);
        const channelMix = computeChannelMix(rangeOrders);
        const heatmapData = computeHeatmap(rangeOrders);
        const allItems = await storage.getOrderItemsByTenant(user.tenantId);
        const menuItemsList = await storage.getMenuItemsByTenant(user.tenantId);
        const validOrderIds = new Set(validOrders.map(o => o.id));
        const topItems = computeTopItems(allItems, menuItemsList, validOrderIds, 10);
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        const dineInOrders = validOrders.filter(o => o.orderType === "dine_in");
        const itemsByOrder = new Map<string, number>();
        for (const oi of allItems) {
          if (!oi.orderId) continue;
          itemsByOrder.set(oi.orderId, (itemsByOrder.get(oi.orderId) || 0) + (oi.quantity || 1));
        }
        const totalCovers = dineInOrders.reduce((s, o) => s + Math.max(itemsByOrder.get(o.id) || 1, 1), 0);
        const completedOrders = validOrders.filter(o => o.status === "completed" || o.status === "paid");
        let avgTurnMinutes = 0;
        if (completedOrders.length >= 2) {
          const tableOrderMap: Record<string, Date[]> = {};
          for (const o of completedOrders) {
            if (o.tableId) {
              if (!tableOrderMap[o.tableId]) tableOrderMap[o.tableId] = [];
              tableOrderMap[o.tableId].push(new Date(o.createdAt!));
            }
          }
          let totalTurns = 0, turnCount = 0;
          for (const times of Object.values(tableOrderMap)) {
            if (times.length < 2) continue;
            times.sort((a, b) => a.getTime() - b.getTime());
            for (let i = 1; i < times.length; i++) {
              totalTurns += (times[i].getTime() - times[i - 1].getTime()) / 60000;
              turnCount++;
            }
          }
          avgTurnMinutes = turnCount > 0 ? Math.round(totalTurns / turnCount) : 0;
        }
        return {
          hourlySales, channelMix, topItems, heatmapData,
          avgOrderValue: Math.round(avgOrderValue * 100) / 100,
          totalOrders, totalRevenue: Math.round(totalRevenue * 100) / 100,
          avgTurnMinutes, totalCovers,
        };
      });
      res.json(job);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/reports/finance", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = req.query.to ? new Date(req.query.to as string) : new Date();
      const params = { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
      const job = await startBackgroundJob(user.tenantId, "SYNC_FINANCE", params, async () => {
        const allOrders = await storage.getOrdersByTenant(user.tenantId);
        const rangeOrders = allOrders.filter(o => { const d = new Date(o.createdAt!); return d >= from && d <= to; });
        const { netSales, totalTax, totalDiscount, voidCount, voidAmount, dailyFinance } = computeFinanceTotals(rangeOrders);
        const validRangeOrders = filterValidOrders(rangeOrders);
        const rangeOrderIds = new Set(validRangeOrders.map(o => o.id));
        const allOrderItems = await storage.getOrderItemsByTenant(user.tenantId);
        const rangeItems = allOrderItems.filter(oi => rangeOrderIds.has(oi.orderId || ""));
        const allRecipes = await storage.getRecipesByTenant(user.tenantId);
        const inventoryItems = await storage.getInventoryByTenant(user.tenantId);
        const invCostMap = new Map(inventoryItems.map(i => [i.id, parseFloat(i.costPerBaseUnit || i.costPrice || "0")]));
        let totalFoodCost = 0;
        for (const recipe of allRecipes) {
          if (!recipe.menuItemId) continue;
          const itemsForRecipe = rangeItems.filter(oi => oi.menuItemId === recipe.menuItemId);
          if (itemsForRecipe.length === 0) continue;
          const totalQtySold = itemsForRecipe.reduce((s, oi) => s + (oi.quantity || 1), 0);
          const recipeIngredients = await storage.getRecipeIngredients(recipe.id);
          const yieldVal = Number(recipe.yield) || 1;
          for (const ri of recipeIngredients) {
            const unitCost = invCostMap.get(ri.inventoryItemId) || 0;
            const qtyPerPortion = Number(ri.quantity) / yieldVal;
            const wasteMult = 1 + (Number(ri.wastePct) || 0) / 100;
            totalFoodCost += totalQtySold * qtyPerPortion * wasteMult * unitCost;
          }
        }
        const labourSnapshots = await storage.getLabourCostSnapshots(user.tenantId, from, to);
        const totalLabourCost = labourSnapshots.reduce((s, l) => s + (Number(l.actualCost) || 0) + (Number(l.overtimeCost) || 0), 0);
        const { rows: refundRows } = await pool.query(
          `SELECT bp.bill_id, bp.amount FROM bill_payments bp JOIN bills b ON b.id = bp.bill_id
           WHERE bp.tenant_id = $1 AND bp.is_refund = true AND b.created_at >= $2 AND b.created_at <= $3`,
          [user.tenantId, from, to]
        );
        const totalRefunded = refundRows.reduce((s: number, r: { amount: string }) => s + Math.abs(Number(r.amount)), 0);
        const refundCount = refundRows.length;
        const grossSales = netSales + totalTax;
        const netRevenue = Math.max(0, grossSales - totalRefunded);
        const foodCostPct = grossSales > 0 ? (totalFoodCost / grossSales) * 100 : 0;
        const labourPct = grossSales > 0 ? (totalLabourCost / grossSales) * 100 : 0;
        const grossMargin = grossSales - totalFoodCost - totalLabourCost;
        const grossMarginPct = grossSales > 0 ? (grossMargin / grossSales) * 100 : 0;
        const totalRefundedRounded = Math.round(totalRefunded * 100) / 100;
        return {
          netSales: Math.round(netSales * 100) / 100, totalTax: Math.round(totalTax * 100) / 100,
          totalDiscount: Math.round(totalDiscount * 100) / 100, totalRefunded: totalRefundedRounded,
          totalRefunds: totalRefundedRounded, refundCount, netRevenue: Math.round(netRevenue * 100) / 100,
          voidCount, voidAmount: Math.round(voidAmount * 100) / 100,
          foodCostPct: Math.round(foodCostPct * 10) / 10, labourPct: Math.round(labourPct * 10) / 10,
          grossMargin: Math.round(grossMargin * 100) / 100, grossMarginPct: Math.round(grossMarginPct * 10) / 10,
          dailyFinance: Object.values(dailyFinance).sort((a, b) => a.date.localeCompare(b.date)),
          totalLabourCost: Math.round(totalLabourCost * 100) / 100, totalFoodCost: Math.round(totalFoodCost * 100) / 100,
        };
      });
      res.json(job);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/reports/marketing", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const params = { type: "marketing" };
      const job = await startBackgroundJob(user.tenantId, "SYNC_MARKETING", params, async () => {
        const customersList = await storage.getCustomersByTenant(user.tenantId);
        const loyaltyEnrolled = customersList.filter(c => (c.loyaltyPoints || 0) > 0 || c.loyaltyTier).length;
        const totalCustomers = customersList.length;
        const tierBreakdown: Record<string, number> = {};
        let totalPointsOutstanding = 0;
        for (const c of customersList) {
          const tier = c.loyaltyTier || "none";
          tierBreakdown[tier] = (tierBreakdown[tier] || 0) + 1;
          totalPointsOutstanding += c.loyaltyPoints || 0;
        }
        const offers = await storage.getOffersByTenant(user.tenantId);
        const totalRedemptions = offers.reduce((s, o) => s + (o.usageCount || 0), 0);
        const campaignData = offers.map(o => ({
          name: o.name, type: o.type, usageCount: o.usageCount || 0, usageLimit: o.usageLimit,
          value: Number(o.value) || 0, active: o.active,
          uptakeRate: o.usageLimit && o.usageLimit > 0 ? Math.round(((o.usageCount || 0) / o.usageLimit) * 100) : null,
        }));
        const avgSpend = totalCustomers > 0 ? customersList.reduce((s, c) => s + (Number(c.averageSpend) || Number(c.totalSpent) || 0), 0) / totalCustomers : 0;
        const feedback = await storage.getFeedbackByTenant(user.tenantId);
        const avgRating = feedback.length > 0 ? feedback.reduce((s, f) => s + (f.rating || 0), 0) / feedback.length : 0;
        return {
          totalCustomers, loyaltyEnrolled,
          enrollmentRate: totalCustomers > 0 ? Math.round((loyaltyEnrolled / totalCustomers) * 100) : 0,
          tierBreakdown, totalPointsOutstanding, totalRedemptions, campaigns: campaignData,
          avgCustomerSpend: Math.round(avgSpend * 100) / 100,
          avgRating: Math.round(avgRating * 10) / 10, feedbackCount: feedback.length,
        };
      });
      res.json(job);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/reports/forecast", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.query.outletId as string | undefined;
      const weeks = Number(req.query.weeks) || 8;
      const params = { outletId: outletId || null, weeks };
      const job = await startBackgroundJob(user.tenantId, "SYNC_FORECAST", params, async () => {
        const allOrders = await storage.getOrdersByTenant(user.tenantId);
        const { forecast, totalForecastRevenue, totalForecastOrders, weeksAnalyzed } = computeWeeklyForecast(allOrders, weeks, outletId);
        const now = new Date();
        const cutoff = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
        let historicalOrders = allOrders.filter(o => {
          if (!o.createdAt) return false;
          const d = new Date(o.createdAt);
          return d >= cutoff && d <= now && !isVoidOrCancelled(o.status);
        });
        if (outletId) historicalOrders = historicalOrders.filter(o => o.outletId === outletId);
        const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
        const menuMap = new Map(menuItems.map(m => [m.id, m]));
        const orderItems = await storage.getOrderItemsByTenant(user.tenantId);
        const recentOrderIds = new Set(historicalOrders.map(o => o.id));
        const recentItems = orderItems.filter(oi => recentOrderIds.has(oi.orderId || ""));
        const menuItemDemand: Record<string, { name: string; totalQty: number; price: number }> = {};
        for (const oi of recentItems) {
          const mi = menuMap.get(oi.menuItemId || "");
          const name = mi?.name || oi.name || "Unknown";
          const key = mi?.id || name;
          if (!menuItemDemand[key]) menuItemDemand[key] = { name, totalQty: 0, price: Number(mi?.price || oi.price) || 0 };
          menuItemDemand[key].totalQty += (oi.quantity || 1);
        }
        const weeksCount = Math.max(weeksAnalyzed, 1);
        const productionSuggestions = Object.values(menuItemDemand).map(item => ({
          name: item.name, avgWeeklyQty: Math.round(item.totalQty / weeksCount),
          suggestedQty: Math.round((item.totalQty / weeksCount) * 1.1), unitPrice: item.price,
        })).sort((a, b) => b.avgWeeklyQty - a.avgWeeklyQty).slice(0, 20);
        const allRecipes = await storage.getRecipesByTenant(user.tenantId);
        const inventoryItems = await storage.getInventoryByTenant(user.tenantId);
        const invMap = new Map(inventoryItems.map(i => [i.id, { name: i.name, unit: i.unit || i.baseUnit || "unit", costPerUnit: parseFloat(i.costPerBaseUnit || i.costPrice || "0") }]));
        const ingredientDemand: Record<string, { name: string; unit: string; weeklyQty: number; costPerUnit: number }> = {};
        for (const recipe of allRecipes) {
          if (!recipe.menuItemId) continue;
          const demand = menuItemDemand[recipe.menuItemId];
          if (!demand) continue;
          const forecastedWeeklyQty = demand.totalQty / weeksCount;
          const recipeIngredientsList = await storage.getRecipeIngredients(recipe.id);
          const yieldVal = Number(recipe.yield) || 1;
          for (const ri of recipeIngredientsList) {
            const inv = invMap.get(ri.inventoryItemId);
            if (!inv) continue;
            const qtyPerPortion = Number(ri.quantity) / yieldVal;
            const wasteMult = 1 + (Number(ri.wastePct) || 0) / 100;
            const weeklyNeed = forecastedWeeklyQty * qtyPerPortion * wasteMult;
            if (!ingredientDemand[ri.inventoryItemId]) {
              ingredientDemand[ri.inventoryItemId] = { name: inv.name, unit: inv.unit, weeklyQty: 0, costPerUnit: inv.costPerUnit };
            }
            ingredientDemand[ri.inventoryItemId].weeklyQty += weeklyNeed;
          }
        }
        const ingredientSuggestions = Object.entries(ingredientDemand).map(([id, item]) => ({
          inventoryItemId: id, name: item.name, unit: item.unit,
          avgWeeklyNeed: Math.round(item.weeklyQty * 100) / 100,
          suggestedOrder: Math.round(item.weeklyQty * 1.1 * 100) / 100, costPerUnit: item.costPerUnit,
          estimatedWeeklyCost: Math.round(item.weeklyQty * 1.1 * item.costPerUnit * 100) / 100,
        })).sort((a, b) => b.estimatedWeeklyCost - a.estimatedWeeklyCost);
        return { forecast, totalForecastRevenue, totalForecastOrders, weeksAnalyzed, productionSuggestions, ingredientSuggestions, outletId: outletId || null };
      });
      res.json(job);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
