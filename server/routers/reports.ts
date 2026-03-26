import type { Express } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth";

const REPORT_CACHE_TTL_HOURS = 2;

function makeParamKey(params: Record<string, any>): string {
  return JSON.stringify(params, Object.keys(params).sort());
}

async function findCachedReport(
  tenantId: string,
  reportType: string,
  params: Record<string, any>
): Promise<{ id: string; status: string; result: any } | null> {
  const paramKey = makeParamKey(params);
  const { rows } = await pool.query(
    `SELECT id, status, result FROM report_cache
     WHERE tenant_id = $1 AND report_type = $2 AND parameters::text = $3
       AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, reportType, paramKey]
  );
  return rows[0] ?? null;
}

async function createReportJob(
  tenantId: string,
  reportType: string,
  outletId: string | null,
  params: Record<string, any>
): Promise<string> {
  const paramKey = makeParamKey(params);
  const expiresAt = new Date(Date.now() + REPORT_CACHE_TTL_HOURS * 60 * 60 * 1000);
  const { rows } = await pool.query(
    `INSERT INTO report_cache (tenant_id, report_type, outlet_id, parameters, status, expires_at)
     VALUES ($1, $2, $3, $4, 'generating', $5) RETURNING id`,
    [tenantId, reportType, outletId, paramKey, expiresAt]
  );
  return rows[0].id;
}

async function updateReportJob(
  jobId: string,
  status: "ready" | "failed",
  result: any
): Promise<void> {
  await pool.query(
    `UPDATE report_cache SET status = $1, result = $2, computed_at = now() WHERE id = $3`,
    [status, JSON.stringify(result), jobId]
  );
}

async function computeWeeklyRevenue(tenantId: string, params: Record<string, any>): Promise<any> {
  const from = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 86400000);
  const to = params.to ? new Date(params.to) : new Date();

  const { rows } = await pool.query(
    `SELECT
       DATE_TRUNC('week', created_at)::date AS week_start,
       COUNT(*) FILTER (WHERE status NOT IN ('cancelled','voided')) AS order_count,
       COALESCE(SUM(total::numeric) FILTER (WHERE status NOT IN ('cancelled','voided')), 0) AS revenue
     FROM orders
     WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
     GROUP BY week_start ORDER BY week_start`,
    [tenantId, from, to]
  );

  const refundRows = await pool.query(
    `SELECT DATE_TRUNC('week', b.created_at)::date AS week_start,
            COALESCE(SUM(bp.amount::numeric), 0) AS refunds
     FROM bill_payments bp
     JOIN bills b ON b.id = bp.bill_id
     WHERE bp.tenant_id = $1 AND bp.is_refund = true AND b.created_at >= $2 AND b.created_at <= $3
     GROUP BY week_start`,
    [tenantId, from, to]
  );

  const refundMap: Record<string, number> = {};
  for (const r of refundRows.rows) {
    refundMap[r.week_start] = Number(r.refunds);
  }

  const weeks = rows.map((r: any) => ({
    weekStart: r.week_start,
    orderCount: parseInt(r.order_count),
    revenue: Number(r.revenue),
    refunds: refundMap[r.week_start] ?? 0,
    netRevenue: Number(r.revenue) - (refundMap[r.week_start] ?? 0),
  }));

  const totalRevenue = weeks.reduce((s: number, w: any) => s + w.revenue, 0);
  const totalOrders = weeks.reduce((s: number, w: any) => s + w.orderCount, 0);
  return { weeks, totalRevenue, totalOrders, from: from.toISOString(), to: to.toISOString() };
}

async function computeTopDishes(tenantId: string, params: Record<string, any>): Promise<any> {
  const from = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 86400000);
  const to = params.to ? new Date(params.to) : new Date();

  const { rows } = await pool.query(
    `SELECT oi.menu_item_id, oi.name, COUNT(*) AS qty, SUM(oi.price::numeric * oi.quantity) AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.tenant_id = $1 AND o.status NOT IN ('cancelled','voided')
       AND o.created_at >= $2 AND o.created_at <= $3
     GROUP BY oi.menu_item_id, oi.name
     ORDER BY revenue DESC LIMIT 50`,
    [tenantId, from, to]
  );

  return {
    topDishes: rows.map((r: any) => ({
      menuItemId: r.menu_item_id,
      name: r.name,
      quantity: parseInt(r.qty),
      revenue: Number(r.revenue),
    })),
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

async function computePeakHours(tenantId: string, params: Record<string, any>): Promise<any> {
  const from = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 86400000);
  const to = params.to ? new Date(params.to) : new Date();

  const { rows } = await pool.query(
    `SELECT
       EXTRACT(DOW FROM created_at)::int AS day_of_week,
       EXTRACT(HOUR FROM created_at)::int AS hour,
       COUNT(*) AS order_count,
       COALESCE(SUM(total::numeric), 0) AS revenue
     FROM orders
     WHERE tenant_id = $1 AND status NOT IN ('cancelled','voided')
       AND created_at >= $2 AND created_at <= $3
     GROUP BY day_of_week, hour ORDER BY day_of_week, hour`,
    [tenantId, from, to]
  );

  const heatmap: Record<string, { orderCount: number; revenue: number }> = {};
  const hourly: Record<number, { orderCount: number; revenue: number }> = {};

  for (const r of rows) {
    const key = `${r.day_of_week}-${r.hour}`;
    heatmap[key] = { orderCount: parseInt(r.order_count), revenue: Number(r.revenue) };
    if (!hourly[r.hour]) hourly[r.hour] = { orderCount: 0, revenue: 0 };
    hourly[r.hour].orderCount += parseInt(r.order_count);
    hourly[r.hour].revenue += Number(r.revenue);
  }

  const peakHour = Object.entries(hourly).sort((a, b) => b[1].orderCount - a[1].orderCount)[0];

  return {
    heatmap,
    hourly: Object.entries(hourly).map(([h, v]) => ({ hour: parseInt(h), ...v })).sort((a, b) => a.hour - b.hour),
    peakHour: peakHour ? { hour: parseInt(peakHour[0]), ...peakHour[1] } : null,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

async function computeStockMovement(tenantId: string, params: Record<string, any>): Promise<any> {
  const from = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 86400000);
  const to = params.to ? new Date(params.to) : new Date();

  const { rows } = await pool.query(
    `SELECT sm.*, ii.name AS item_name, ii.unit
     FROM stock_movements sm
     LEFT JOIN inventory_items ii ON ii.id = sm.inventory_item_id
     WHERE sm.tenant_id = $1 AND sm.created_at >= $2 AND sm.created_at <= $3
     ORDER BY sm.created_at DESC
     LIMIT 1000`,
    [tenantId, from, to]
  );

  const byType: Record<string, { count: number; totalQty: number }> = {};
  for (const r of rows) {
    const t = r.movement_type || "unknown";
    if (!byType[t]) byType[t] = { count: 0, totalQty: 0 };
    byType[t].count++;
    byType[t].totalQty += Math.abs(Number(r.quantity));
  }

  return {
    movements: rows.map((r: any) => ({
      id: r.id,
      itemName: r.item_name,
      unit: r.unit,
      movementType: r.movement_type,
      quantity: Number(r.quantity),
      stockBefore: r.stock_before != null ? Number(r.stock_before) : null,
      stockAfter: r.stock_after != null ? Number(r.stock_after) : null,
      reason: r.reason,
      createdAt: r.created_at,
    })),
    summary: byType,
    total: rows.length,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

async function computeChefAccountability(tenantId: string, params: Record<string, any>): Promise<any> {
  const from = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 86400000);
  const to = params.to ? new Date(params.to) : new Date();

  const { rows } = await pool.query(
    `SELECT
       sm.chef_id, sm.chef_name,
       SUM(sm.quantity::numeric * ii.cost_per_base_unit::numeric) AS wastage_cost,
       COUNT(*) AS wastage_count
     FROM stock_movements sm
     LEFT JOIN inventory_items ii ON ii.id = sm.inventory_item_id
     WHERE sm.tenant_id = $1 AND sm.movement_type IN ('wastage','waste')
       AND sm.created_at >= $2 AND sm.created_at <= $3 AND sm.chef_id IS NOT NULL
     GROUP BY sm.chef_id, sm.chef_name ORDER BY wastage_cost DESC`,
    [tenantId, from, to]
  );

  const kotRows = await pool.query(
    `SELECT chef_id, chef_name, COUNT(*) AS tickets, COUNT(*) FILTER (WHERE status = 'completed') AS completed
     FROM kot_events
     WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3 AND chef_id IS NOT NULL
     GROUP BY chef_id, chef_name`,
    [tenantId, from, to]
  );

  const kotMap: Record<string, any> = {};
  for (const r of kotRows.rows) {
    kotMap[r.chef_id] = { tickets: parseInt(r.tickets), completed: parseInt(r.completed) };
  }

  return {
    chefs: rows.map((r: any) => ({
      chefId: r.chef_id,
      chefName: r.chef_name,
      wastageCost: Number(r.wastage_cost ?? 0),
      wastageCount: parseInt(r.wastage_count),
      tickets: kotMap[r.chef_id]?.tickets ?? 0,
      completedTickets: kotMap[r.chef_id]?.completed ?? 0,
    })),
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

async function computeWastageAnalysis(tenantId: string, params: Record<string, any>): Promise<any> {
  const from = params.from ? params.from : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = params.to ? params.to : new Date().toISOString().slice(0, 10);

  const { rows } = await pool.query(
    `SELECT
       wastage_category, ingredient_name,
       SUM(total_cost::numeric) AS total_cost, COUNT(*) AS cnt,
       SUM(CASE WHEN is_preventable THEN total_cost::numeric ELSE 0 END) AS preventable_cost
     FROM wastage_logs
     WHERE tenant_id = $1 AND wastage_date >= $2 AND wastage_date <= $3 AND is_voided = false
     GROUP BY wastage_category, ingredient_name
     ORDER BY total_cost DESC`,
    [tenantId, from, to]
  );

  const totalCost = rows.reduce((s: number, r: any) => s + Number(r.total_cost), 0);
  const preventableCost = rows.reduce((s: number, r: any) => s + Number(r.preventable_cost), 0);

  const byCategory: Record<string, any> = {};
  for (const r of rows) {
    const cat = r.wastage_category || "other";
    if (!byCategory[cat]) byCategory[cat] = { cost: 0, count: 0 };
    byCategory[cat].cost += Number(r.total_cost);
    byCategory[cat].count += parseInt(r.cnt);
  }

  return {
    totalCost,
    preventableCost,
    preventablePct: totalCost > 0 ? Math.round((preventableCost / totalCost) * 100) : 0,
    byCategory,
    topItems: rows.slice(0, 20).map((r: any) => ({
      ingredientName: r.ingredient_name,
      category: r.wastage_category,
      totalCost: Number(r.total_cost),
      count: parseInt(r.cnt),
      preventableCost: Number(r.preventable_cost),
    })),
    from,
    to,
  };
}

async function computeAuditTrailExport(tenantId: string, params: Record<string, any>): Promise<any> {
  const from = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 86400000);
  const to = params.to ? new Date(params.to) : new Date();

  const { rows } = await pool.query(
    `SELECT id, action, entity_type, entity_id, entity_name, user_id, user_name, user_role,
            created_at, before_snapshot, after_snapshot, metadata
     FROM audit_events
     WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
     ORDER BY created_at DESC LIMIT 5000`,
    [tenantId, from, to]
  );

  return {
    events: rows.map((r: any) => ({
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      entityName: r.entity_name,
      userId: r.user_id,
      userName: r.user_name,
      userRole: r.user_role,
      createdAt: r.created_at,
      before: r.before_snapshot,
      after: r.after_snapshot,
    })),
    total: rows.length,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

async function computeInventoryValuation(tenantId: string, _params: Record<string, any>): Promise<any> {
  const { rows } = await pool.query(
    `SELECT ii.id, ii.name, ii.current_stock, ii.unit, ii.base_unit,
            COALESCE(ii.cost_per_base_unit, ii.cost_price, '0')::numeric AS unit_cost,
            ii.item_category,
            COALESCE(ii.current_stock, 0)::numeric * COALESCE(ii.cost_per_base_unit, ii.cost_price, '0')::numeric AS value
     FROM inventory_items ii
     WHERE ii.tenant_id = $1 AND (ii.is_deleted = false OR ii.is_deleted IS NULL)
     ORDER BY value DESC`,
    [tenantId]
  );

  const totalValue = rows.reduce((s: number, r: any) => s + Number(r.value), 0);

  const byCategory: Record<string, any> = {};
  for (const r of rows) {
    const cat = r.item_category || "uncategorized";
    if (!byCategory[cat]) byCategory[cat] = { value: 0, count: 0 };
    byCategory[cat].value += Number(r.value);
    byCategory[cat].count++;
  }

  return {
    totalValue,
    byCategory,
    items: rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      currentStock: Number(r.current_stock ?? 0),
      unit: r.unit || r.base_unit,
      unitCost: Number(r.unit_cost),
      totalValue: Number(r.value),
      category: r.item_category,
    })),
    generatedAt: new Date().toISOString(),
  };
}

async function computeShiftReconciliation(tenantId: string, params: Record<string, any>): Promise<any> {
  const from = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 86400000);
  const to = params.to ? new Date(params.to) : new Date();

  const { rows: shiftRows } = await pool.query(
    `SELECT cs.id, cs.shift_date, cs.outlet_id, cs.opened_by_name, cs.closed_by_name,
            cs.opening_balance, cs.closing_balance, cs.expected_cash, cs.variance,
            cs.status, cs.opened_at, cs.closed_at
     FROM cash_sessions cs
     WHERE cs.tenant_id = $1 AND cs.opened_at >= $2 AND cs.opened_at <= $3
     ORDER BY cs.opened_at DESC LIMIT 200`,
    [tenantId, from, to]
  );

  const totalVariance = shiftRows.reduce((s: number, r: any) => s + Number(r.variance ?? 0), 0);
  const totalSessions = shiftRows.length;
  const closedSessions = shiftRows.filter((r: any) => r.status === "closed").length;

  return {
    sessions: shiftRows.map((r: any) => ({
      id: r.id,
      shiftDate: r.shift_date,
      outletId: r.outlet_id,
      openedBy: r.opened_by_name,
      closedBy: r.closed_by_name,
      openingBalance: Number(r.opening_balance ?? 0),
      closingBalance: Number(r.closing_balance ?? 0),
      expectedCash: Number(r.expected_cash ?? 0),
      variance: Number(r.variance ?? 0),
      status: r.status,
      openedAt: r.opened_at,
      closedAt: r.closed_at,
    })),
    summary: {
      totalSessions,
      closedSessions,
      openSessions: totalSessions - closedSessions,
      totalVariance,
    },
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

type ReportComputer = (tenantId: string, params: Record<string, any>) => Promise<any>;

const REPORT_COMPUTERS: Record<string, ReportComputer> = {
  WEEKLY_REVENUE: computeWeeklyRevenue,
  TOP_DISHES: computeTopDishes,
  PEAK_HOURS: computePeakHours,
  STOCK_MOVEMENT: computeStockMovement,
  CHEF_ACCOUNTABILITY: computeChefAccountability,
  WASTAGE_ANALYSIS: computeWastageAnalysis,
  AUDIT_TRAIL_EXPORT: computeAuditTrailExport,
  INVENTORY_VALUATION: computeInventoryValuation,
  SHIFT_RECONCILIATION: computeShiftReconciliation,
};

async function enqueueReport(
  tenantId: string,
  reportType: string,
  outletId: string | null,
  params: Record<string, any>
): Promise<{ status: string; jobId: string; result?: any }> {
  const cached = await findCachedReport(tenantId, reportType, params);
  if (cached) {
    if (cached.status === "ready") {
      return { status: "ready", jobId: cached.id, result: cached.result };
    }
    if (cached.status === "generating") {
      return { status: "generating", jobId: cached.id };
    }
  }

  const jobId = await createReportJob(tenantId, reportType, outletId, params);

  const computer = REPORT_COMPUTERS[reportType];
  if (computer) {
    setImmediate(async () => {
      try {
        const result = await computer(tenantId, params);
        await updateReportJob(jobId, "ready", result);
      } catch (err) {
        console.error(`[reports] Failed to compute ${reportType}:`, err);
        await updateReportJob(jobId, "failed", { error: String(err) }).catch(() => {});
      }
    });
  }

  return { status: "generating", jobId };
}

export async function startBackgroundJob(
  tenantId: string,
  reportType: string,
  params: Record<string, unknown>,
  compute: () => Promise<unknown>
): Promise<{ status: "generating" | "ready"; jobId: string; result?: unknown }> {
  const cached = await findCachedReport(tenantId, reportType, params);
  if (cached) {
    if (cached.status === "ready") {
      return { status: "ready", jobId: cached.id, result: cached.result };
    }
    return { status: "generating", jobId: cached.id };
  }

  const jobId = await createReportJob(tenantId, reportType, null, params);
  setImmediate(async () => {
    try {
      const result = await compute();
      await updateReportJob(jobId, "ready", result);
    } catch (err) {
      console.error(`[reports] Background job ${reportType}/${jobId} failed:`, err);
      await updateReportJob(jobId, "failed", { error: String(err) }).catch(() => {});
    }
  });
  return { status: "generating", jobId };
}

export async function getCachedReportResult(
  tenantId: string,
  reportType: string,
  params: Record<string, any>
): Promise<any | null> {
  const cached = await findCachedReport(tenantId, reportType, params);
  if (cached?.status === "ready") return cached.result;
  return null;
}

export async function setCachedReportResult(
  tenantId: string,
  reportType: string,
  params: Record<string, any>,
  result: any
): Promise<void> {
  try {
    const paramKey = makeParamKey(params);
    const expiresAt = new Date(Date.now() + REPORT_CACHE_TTL_HOURS * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO report_cache (tenant_id, report_type, outlet_id, parameters, status, result, computed_at, expires_at)
       VALUES ($1, $2, NULL, $3, 'ready', $4, now(), $5)
       ON CONFLICT DO NOTHING`,
      [tenantId, reportType, paramKey, JSON.stringify(result), expiresAt]
    );
  } catch (_) {}
}

export function registerReportsRoutes(app: Express): void {
  app.get("/api/reports/status/:jobId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { jobId } = req.params;
      const { rows } = await pool.query(
        `SELECT id, status, result, computed_at, expires_at FROM report_cache WHERE id = $1 AND tenant_id = $2`,
        [jobId, user.tenantId]
      );
      if (!rows[0]) return res.status(404).json({ message: "Report job not found" });
      const row = rows[0];
      res.json({
        jobId: row.id,
        status: row.status,
        result: row.status === "ready" ? row.result : undefined,
        computedAt: row.computed_at,
        expiresAt: row.expires_at,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/reports/generate", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { reportType, outletId, from, to, ...extraParams } = req.body;
      if (!reportType) return res.status(400).json({ message: "reportType is required" });
      if (!REPORT_COMPUTERS[reportType]) {
        return res.status(400).json({ message: `Unknown reportType: ${reportType}`, valid: Object.keys(REPORT_COMPUTERS) });
      }
      const params: Record<string, any> = { from, to, ...extraParams };
      const result = await enqueueReport(user.tenantId, reportType, outletId ?? null, params);
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/reports/generate", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { reportType, outletId, from, to } = req.query as Record<string, string>;
      if (!reportType) return res.status(400).json({ message: "reportType is required" });
      if (!REPORT_COMPUTERS[reportType]) {
        return res.status(400).json({ message: `Unknown reportType: ${reportType}`, valid: Object.keys(REPORT_COMPUTERS) });
      }
      const params: Record<string, any> = { from, to };
      const result = await enqueueReport(user.tenantId, reportType, outletId ?? null, params);
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
