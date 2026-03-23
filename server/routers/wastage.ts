import type { Express } from "express";
import { pool } from "../db";
import { requireAuth, requireRole } from "../auth";
import { emitToTenant } from "../realtime";

const WASTAGE_CATEGORIES = [
  "spoilage",
  "overproduction",
  "plate_return",
  "trim_waste",
  "cooking_error",
  "expired",
  "dropped",
  "cross_contamination",
  "portion_error",
  "transfer_loss",
  "quality_rejection",
  "storage_damage",
  "other",
] as const;

async function generateWastageNumberSafe(client: any, tenantId: string, date: string): Promise<string> {
  const datePart = date.replace(/-/g, "");
  const lockKey = Buffer.from(`${tenantId}:${date}`).readUInt32BE(0);
  await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockKey]);
  const { rows } = await client.query(
    `SELECT COUNT(*) AS cnt FROM wastage_logs WHERE tenant_id = $1 AND wastage_date = $2`,
    [tenantId, date]
  );
  const seq = (parseInt(rows[0].cnt) + 1).toString().padStart(4, "0");
  return `WST-${datePart}-${seq}`;
}

async function upsertDailySummary(
  tenantId: string,
  outletId: string | null,
  date: string
): Promise<void> {
  const { rows: logs } = await pool.query(
    `SELECT total_cost, is_preventable, wastage_category, counter_id, counter_name, chef_id, chef_name
     FROM wastage_logs
     WHERE tenant_id = $1 AND COALESCE(outlet_id, '') = COALESCE($2, '') AND wastage_date = $3 AND is_voided = false`,
    [tenantId, outletId || null, date]
  );

  const totalCost = logs.reduce((s: number, r: any) => s + Number(r.total_cost), 0);
  const totalEntries = logs.length;
  const preventableLogs = logs.filter((r: any) => r.is_preventable);
  const preventableCost = preventableLogs.reduce((s: number, r: any) => s + Number(r.total_cost), 0);

  const categoryBreakdown: Record<string, { cost: number; count: number }> = {};
  const counterBreakdown: Record<string, { cost: number; count: number; name: string }> = {};
  const chefBreakdown: Record<string, { cost: number; count: number; name: string }> = {};

  for (const log of logs) {
    const cat = log.wastage_category || "other";
    if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { cost: 0, count: 0 };
    categoryBreakdown[cat].cost += Number(log.total_cost);
    categoryBreakdown[cat].count++;
    if (log.counter_id) {
      const ck = log.counter_id;
      if (!counterBreakdown[ck]) counterBreakdown[ck] = { cost: 0, count: 0, name: log.counter_name || ck };
      counterBreakdown[ck].cost += Number(log.total_cost);
      counterBreakdown[ck].count++;
    }
    if (log.chef_id) {
      const ck = log.chef_id;
      if (!chefBreakdown[ck]) chefBreakdown[ck] = { cost: 0, count: 0, name: log.chef_name || ck };
      chefBreakdown[ck].cost += Number(log.total_cost);
      chefBreakdown[ck].count++;
    }
  }

  const { rows: targetRows } = await pool.query(
    `SELECT target_amount FROM wastage_targets
     WHERE tenant_id = $1 AND is_active = true AND effective_from <= $2
       AND (effective_to IS NULL OR effective_to >= $2)
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, date]
  );
  const targetAmount = targetRows.length > 0 ? targetRows[0].target_amount : null;

  await pool.query(
    `INSERT INTO wastage_daily_summary
       (tenant_id, outlet_id, summary_date, total_cost, total_entries, preventable_cost, preventable_entries,
        target_amount, category_breakdown, counter_breakdown, chef_breakdown, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT (tenant_id, COALESCE(outlet_id, ''), summary_date)
     DO UPDATE SET
       total_cost = EXCLUDED.total_cost,
       total_entries = EXCLUDED.total_entries,
       preventable_cost = EXCLUDED.preventable_cost,
       preventable_entries = EXCLUDED.preventable_entries,
       target_amount = EXCLUDED.target_amount,
       category_breakdown = EXCLUDED.category_breakdown,
       counter_breakdown = EXCLUDED.counter_breakdown,
       chef_breakdown = EXCLUDED.chef_breakdown,
       updated_at = now()`,
    [
      tenantId, outletId || null, date,
      totalCost.toFixed(2), totalEntries,
      preventableCost.toFixed(2), preventableLogs.length,
      targetAmount,
      JSON.stringify(categoryBreakdown),
      JSON.stringify(counterBreakdown),
      JSON.stringify(chefBreakdown),
    ]
  );
}

async function checkAndEmitAlerts(
  tenantId: string,
  outletId: string | null,
  date: string,
  newEntryCost: number,
  ingredientName?: string
): Promise<void> {
  const { rows: todayRows } = await pool.query(
    `SELECT COALESCE(SUM(total_cost), 0) AS total FROM wastage_logs
     WHERE tenant_id = $1 AND COALESCE(outlet_id, '') = COALESCE($2, '') AND wastage_date = $3 AND is_voided = false`,
    [tenantId, outletId || null, date]
  );
  const runningTotal = Number(todayRows[0].total);

  if (newEntryCost > 500) {
    emitToTenant(tenantId, "wastage:high_entry", {
      cost: newEntryCost,
      date,
      ingredientName,
      message: `Single wastage entry of ₹${newEntryCost.toFixed(2)} recorded${ingredientName ? ` for ${ingredientName}` : ""}`,
    });
  }

  const { rows: repeatRows } = await pool.query(
    `SELECT ingredient_name, COUNT(*) AS cnt, SUM(total_cost) AS total
     FROM wastage_logs
     WHERE tenant_id = $1 AND COALESCE(outlet_id, '') = COALESCE($2, '') AND wastage_date = $3 AND is_voided = false
     GROUP BY ingredient_name HAVING COUNT(*) >= 3
     ORDER BY cnt DESC LIMIT 3`,
    [tenantId, outletId || null, date]
  );
  for (const r of repeatRows) {
    emitToTenant(tenantId, "wastage:repeat_pattern", {
      ingredientName: r.ingredient_name,
      count: parseInt(r.cnt),
      totalCost: Number(r.total),
      date,
      message: `${r.ingredient_name} wasted ${r.cnt} times today (₹${Number(r.total).toFixed(2)} total)`,
    });
  }

  const { rows: targetRows } = await pool.query(
    `SELECT target_amount FROM wastage_targets
     WHERE tenant_id = $1 AND is_active = true AND effective_from <= $2
       AND (effective_to IS NULL OR effective_to >= $2)
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, date]
  );

  if (targetRows.length > 0) {
    const target = Number(targetRows[0].target_amount);
    if (target > 0) {
      const prevTotal = runningTotal - newEntryCost;
      const prevPct = (prevTotal / target) * 100;
      const newPct = (runningTotal / target) * 100;

      if (prevPct < 80 && newPct >= 80) {
        emitToTenant(tenantId, "wastage:threshold_alert", {
          totalCost: runningTotal,
          targetAmount: target,
          percentage: Math.round(newPct),
          date,
          message: `Daily wastage has reached ${Math.round(newPct)}% of target (₹${runningTotal.toFixed(2)} / ₹${target.toFixed(2)})`,
        });
      }
      if (prevTotal < target && runningTotal >= target) {
        emitToTenant(tenantId, "wastage:target_exceeded", {
          totalCost: runningTotal,
          targetAmount: target,
          percentage: Math.round(newPct),
          date,
          message: `Daily wastage target exceeded! ₹${runningTotal.toFixed(2)} vs target ₹${target.toFixed(2)}`,
        });
      }
    }
  }
}

export async function triggerWastageDailySummary(
  tenantId: string,
  outletId: string | null,
  date: string
): Promise<void> {
  await upsertDailySummary(tenantId, outletId, date);
}

export function registerWastageRoutes(app: Express): void {

  app.get("/api/wastage/dashboard", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;
      const outletId = (req.query.outletId as string) || null;
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

      const outletCond = outletId
        ? `AND COALESCE(outlet_id, '') = COALESCE($3, '')`
        : "";
      const params2 = outletId ? [tenantId, today, outletId] : [tenantId, today];
      const paramsWeek = outletId ? [tenantId, weekAgo, outletId] : [tenantId, weekAgo];

      const todayQ = outletId
        ? `SELECT COALESCE(SUM(total_cost), 0) AS total, COUNT(*) AS cnt, COALESCE(SUM(CASE WHEN is_preventable THEN total_cost ELSE 0 END), 0) AS preventable_cost FROM wastage_logs WHERE tenant_id = $1 AND wastage_date = $2 AND COALESCE(outlet_id,'') = COALESCE($3,'') AND is_voided = false`
        : `SELECT COALESCE(SUM(total_cost), 0) AS total, COUNT(*) AS cnt, COALESCE(SUM(CASE WHEN is_preventable THEN total_cost ELSE 0 END), 0) AS preventable_cost FROM wastage_logs WHERE tenant_id = $1 AND wastage_date = $2 AND is_voided = false`;
      const weekQ = outletId
        ? `SELECT COALESCE(SUM(total_cost), 0) AS total, COUNT(*) AS cnt FROM wastage_logs WHERE tenant_id = $1 AND wastage_date >= $2 AND COALESCE(outlet_id,'') = COALESCE($3,'') AND is_voided = false`
        : `SELECT COALESCE(SUM(total_cost), 0) AS total, COUNT(*) AS cnt FROM wastage_logs WHERE tenant_id = $1 AND wastage_date >= $2 AND is_voided = false`;

      const revOutletCond = outletId ? "AND outlet_id = $3" : "";
      const todayRevQ = `SELECT COALESCE(SUM(total::numeric), 0) AS revenue FROM orders WHERE tenant_id = $1 AND status IN ('paid','completed') AND DATE(created_at AT TIME ZONE 'UTC') = $2::date ${revOutletCond}`;

      const [todayRes, weekRes, targetRes, recentRes, catRes, counterRes, chefRes, todayRevRes] = await Promise.all([
        pool.query(todayQ, params2),
        pool.query(weekQ, paramsWeek),
        pool.query(
          `SELECT target_amount FROM wastage_targets WHERE tenant_id = $1 AND COALESCE(outlet_id,'') = COALESCE($3,'') AND is_active = true AND effective_from <= $2 AND (effective_to IS NULL OR effective_to >= $2) ORDER BY created_at DESC LIMIT 1`,
          outletId ? [tenantId, today, outletId] : [tenantId, today, null]
        ),
        pool.query(
          `SELECT wl.* FROM wastage_logs wl WHERE wl.tenant_id = $1 ${outletId ? "AND COALESCE(wl.outlet_id,'') = COALESCE($2,'')" : ""} AND wl.is_voided = false ORDER BY wl.created_at DESC LIMIT 10`,
          outletId ? [tenantId, outletId] : [tenantId]
        ),
        pool.query(
          `SELECT wastage_category, SUM(total_cost) AS cost, COUNT(*) AS cnt FROM wastage_logs WHERE tenant_id = $1 AND wastage_date = $2 ${outletId ? "AND COALESCE(outlet_id,'') = COALESCE($3,'')" : ""} AND is_voided = false GROUP BY wastage_category ORDER BY cost DESC`,
          outletId ? [tenantId, today, outletId] : [tenantId, today]
        ),
        pool.query(
          `SELECT counter_id, counter_name, SUM(total_cost) AS cost, COUNT(*) AS cnt FROM wastage_logs WHERE tenant_id = $1 AND wastage_date = $2 ${outletId ? "AND COALESCE(outlet_id,'') = COALESCE($3,'')" : ""} AND is_voided = false AND counter_id IS NOT NULL GROUP BY counter_id, counter_name ORDER BY cost DESC`,
          outletId ? [tenantId, today, outletId] : [tenantId, today]
        ),
        pool.query(
          `SELECT chef_id, chef_name, SUM(total_cost) AS cost, COUNT(*) AS cnt FROM wastage_logs WHERE tenant_id = $1 AND wastage_date = $2 ${outletId ? "AND COALESCE(outlet_id,'') = COALESCE($3,'')" : ""} AND is_voided = false AND chef_id IS NOT NULL GROUP BY chef_id, chef_name ORDER BY cost DESC`,
          outletId ? [tenantId, today, outletId] : [tenantId, today]
        ),
        pool.query(todayRevQ, outletId ? [tenantId, today, outletId] : [tenantId, today]),
      ]);

      const todayTotal = Number(todayRes.rows[0].total);
      const todayCount = parseInt(todayRes.rows[0].cnt);
      const preventableCost = Number(todayRes.rows[0].preventable_cost);
      const weekTotal = Number(weekRes.rows[0].total);
      const targetAmount = targetRes.rows.length > 0 ? Number(targetRes.rows[0].target_amount) : null;
      const targetPct = targetAmount ? Math.min(Math.round((todayTotal / targetAmount) * 100), 999) : null;
      const todayRevenue = Number(todayRevRes.rows[0].revenue);
      const revenueWastagePct = todayRevenue > 0 ? Math.round((todayTotal / todayRevenue) * 100 * 10) / 10 : null;

      res.json({
        today: {
          totalCost: todayTotal,
          entries: todayCount,
          preventableCost,
          preventablePct: todayTotal > 0 ? Math.round((preventableCost / todayTotal) * 100) : 0,
          revenue: todayRevenue,
          revenueWastagePct,
        },
        week: { totalCost: weekTotal, entries: parseInt(weekRes.rows[0].cnt) },
        target: targetAmount ? {
          amount: targetAmount,
          current: todayTotal,
          percentage: targetPct,
          status: targetPct && targetPct >= 100 ? "exceeded" : targetPct && targetPct >= 80 ? "warning" : "ok",
        } : null,
        categoryBreakdown: catRes.rows.map(r => ({ category: r.wastage_category, cost: Number(r.cost), count: parseInt(r.cnt) })),
        counterBreakdown: counterRes.rows.map(r => ({ counterId: r.counter_id, counterName: r.counter_name, cost: Number(r.cost), count: parseInt(r.cnt) })),
        chefBreakdown: chefRes.rows.map(r => ({ chefId: r.chef_id, chefName: r.chef_name, cost: Number(r.cost), count: parseInt(r.cnt) })),
        recentEntries: recentRes.rows,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wastage/trends", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;
      const outletId = (req.query.outletId as string) || null;
      const today = new Date().toISOString().slice(0, 10);
      const day7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const day30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const outletCond = outletId ? "AND COALESCE(outlet_id,'') = COALESCE($3,'')" : "";

      const [trend7, trend30] = await Promise.all([
        pool.query(
          `SELECT wastage_date AS date, COALESCE(SUM(total_cost), 0) AS total_cost, COUNT(*) AS entries FROM wastage_logs WHERE tenant_id = $1 AND wastage_date >= $2 ${outletCond} AND is_voided = false GROUP BY wastage_date ORDER BY wastage_date`,
          outletId ? [tenantId, day7, outletId] : [tenantId, day7]
        ),
        pool.query(
          `SELECT wastage_date AS date, COALESCE(SUM(total_cost), 0) AS total_cost, COUNT(*) AS entries FROM wastage_logs WHERE tenant_id = $1 AND wastage_date >= $2 ${outletCond} AND is_voided = false GROUP BY wastage_date ORDER BY wastage_date`,
          outletId ? [tenantId, day30, outletId] : [tenantId, day30]
        ),
      ]);

      res.json({
        sevenDay: trend7.rows.map(r => ({ date: r.date, totalCost: Number(r.total_cost), entries: parseInt(r.entries) })),
        thirtyDay: trend30.rows.map(r => ({ date: r.date, totalCost: Number(r.total_cost), entries: parseInt(r.entries) })),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wastage/by-chef", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;
      const outletId = (req.query.outletId as string) || null;
      const from = (req.query.from as string) || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
      const outletCond = outletId ? "AND COALESCE(outlet_id,'') = COALESCE($4,'')" : "";

      const { rows } = await pool.query(
        `SELECT chef_id, chef_name, COUNT(*) AS entries, SUM(total_cost) AS total_cost,
                SUM(CASE WHEN is_preventable THEN 1 ELSE 0 END) AS preventable_count, AVG(total_cost) AS avg_cost
         FROM wastage_logs WHERE tenant_id = $1 AND wastage_date >= $2 AND wastage_date <= $3 ${outletCond}
           AND is_voided = false AND chef_id IS NOT NULL
         GROUP BY chef_id, chef_name ORDER BY total_cost DESC`,
        outletId ? [tenantId, from, to, outletId] : [tenantId, from, to]
      );

      res.json(rows.map(r => ({
        chefId: r.chef_id, chefName: r.chef_name,
        entries: parseInt(r.entries), totalCost: Number(r.total_cost),
        preventablePct: r.entries > 0 ? Math.round((parseInt(r.preventable_count) / parseInt(r.entries)) * 100) : 0,
        avgPerEntry: Number(r.avg_cost || 0),
      })));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wastage/by-item", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;
      const outletId = (req.query.outletId as string) || null;
      const from = (req.query.from as string) || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
      const outletCond = outletId ? "AND COALESCE(outlet_id,'') = COALESCE($4,'')" : "";

      const { rows } = await pool.query(
        `SELECT ingredient_id, ingredient_name, unit, COUNT(*) AS entries, SUM(quantity) AS total_qty, SUM(total_cost) AS total_cost
         FROM wastage_logs WHERE tenant_id = $1 AND wastage_date >= $2 AND wastage_date <= $3 ${outletCond} AND is_voided = false
         GROUP BY ingredient_id, ingredient_name, unit ORDER BY total_cost DESC LIMIT 50`,
        outletId ? [tenantId, from, to, outletId] : [tenantId, from, to]
      );

      res.json(rows.map(r => ({
        ingredientId: r.ingredient_id, ingredientName: r.ingredient_name, unit: r.unit,
        entries: parseInt(r.entries), totalQty: Number(r.total_qty), totalCost: Number(r.total_cost),
      })));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wastage/by-category", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;
      const outletId = (req.query.outletId as string) || null;
      const from = (req.query.from as string) || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
      const outletCond = outletId ? "AND COALESCE(outlet_id,'') = COALESCE($4,'')" : "";

      const { rows } = await pool.query(
        `SELECT wastage_category, COUNT(*) AS entries, SUM(total_cost) AS total_cost
         FROM wastage_logs WHERE tenant_id = $1 AND wastage_date >= $2 AND wastage_date <= $3 ${outletCond} AND is_voided = false
         GROUP BY wastage_category ORDER BY total_cost DESC`,
        outletId ? [tenantId, from, to, outletId] : [tenantId, from, to]
      );

      const grandTotal = rows.reduce((s: number, r: any) => s + Number(r.total_cost), 0);
      res.json(rows.map(r => ({
        category: r.wastage_category, entries: parseInt(r.entries), totalCost: Number(r.total_cost),
        pct: grandTotal > 0 ? Math.round((Number(r.total_cost) / grandTotal) * 100) : 0,
      })));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wastage/vs-revenue", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;
      const outletId = (req.query.outletId as string) || null;
      const day30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const outletCond = outletId ? "AND COALESCE(outlet_id,'') = COALESCE($3,'')" : "";
      const revOutletCond = outletId ? "AND outlet_id = $3" : "";

      const [wasteRows, revRows] = await Promise.all([
        pool.query(
          `SELECT wastage_date AS date, COALESCE(SUM(total_cost), 0) AS wastage_cost
           FROM wastage_logs WHERE tenant_id = $1 AND wastage_date >= $2 ${outletCond} AND is_voided = false
           GROUP BY wastage_date ORDER BY wastage_date`,
          outletId ? [tenantId, day30, outletId] : [tenantId, day30]
        ),
        pool.query(
          `SELECT DATE(created_at AT TIME ZONE 'UTC') AS date, COALESCE(SUM(total::numeric), 0) AS revenue
           FROM orders WHERE tenant_id = $1 AND status IN ('paid','completed') AND created_at >= $2 ${revOutletCond}
           GROUP BY DATE(created_at AT TIME ZONE 'UTC') ORDER BY date`,
          outletId ? [tenantId, day30, outletId] : [tenantId, day30]
        ),
      ]);

      const revMap: Record<string, number> = {};
      for (const r of revRows.rows) revMap[r.date.toISOString().slice(0, 10)] = Number(r.revenue);

      res.json(wasteRows.rows.map(r => ({
        date: r.date,
        wastageCost: Number(r.wastage_cost),
        revenue: revMap[r.date] || 0,
        ratio: revMap[r.date] ? Math.round((Number(r.wastage_cost) / Number(revMap[r.date])) * 100) : null,
      })));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wastage/targets", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT * FROM wastage_targets WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [user.tenantId]
      );
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/wastage/targets", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { targetAmount, periodType = "daily", effectiveFrom, effectiveTo, currency = "INR", outletId } = req.body;
      if (!targetAmount || !effectiveFrom) return res.status(400).json({ message: "targetAmount and effectiveFrom required" });

      await pool.query(
        `UPDATE wastage_targets SET is_active = false WHERE tenant_id = $1 AND COALESCE(outlet_id,'') = COALESCE($2,'')`,
        [user.tenantId, outletId || null]
      );
      const { rows } = await pool.query(
        `INSERT INTO wastage_targets (tenant_id, outlet_id, period_type, target_amount, currency, effective_from, effective_to, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8) RETURNING *`,
        [user.tenantId, outletId || null, periodType, targetAmount, currency, effectiveFrom, effectiveTo || null, user.id]
      );
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wastage/alerts", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;
      const outletId = (req.query.outletId as string) || null;
      const today = new Date().toISOString().slice(0, 10);
      const outletCond = outletId ? "AND COALESCE(outlet_id,'') = COALESCE($3,'')" : "";
      const alerts: any[] = [];

      const { rows: todayRows } = await pool.query(
        `SELECT COALESCE(SUM(total_cost), 0) AS total FROM wastage_logs WHERE tenant_id = $1 AND wastage_date = $2 ${outletCond} AND is_voided = false`,
        outletId ? [tenantId, today, outletId] : [tenantId, today]
      );
      const todayTotal = Number(todayRows[0].total);

      const { rows: targetRows } = await pool.query(
        `SELECT target_amount FROM wastage_targets WHERE tenant_id = $1 AND is_active = true AND effective_from <= $2 AND (effective_to IS NULL OR effective_to >= $2) ORDER BY created_at DESC LIMIT 1`,
        [tenantId, today]
      );

      if (targetRows.length > 0) {
        const target = Number(targetRows[0].target_amount);
        const pct = (todayTotal / target) * 100;
        if (pct >= 100) {
          alerts.push({ type: "target_exceeded", severity: "high", message: `Daily wastage target exceeded: ₹${todayTotal.toFixed(2)} / ₹${target.toFixed(2)} (${Math.round(pct)}%)`, date: today });
        } else if (pct >= 80) {
          alerts.push({ type: "threshold_alert", severity: "warning", message: `Daily wastage at ${Math.round(pct)}% of target: ₹${todayTotal.toFixed(2)} / ₹${target.toFixed(2)}`, date: today });
        }
      }

      const { rows: highEntries } = await pool.query(
        `SELECT id, wastage_number, ingredient_name, total_cost, chef_name, wastage_date
         FROM wastage_logs WHERE tenant_id = $1 AND wastage_date = $2 ${outletCond} AND total_cost > 500 AND is_voided = false ORDER BY total_cost DESC LIMIT 5`,
        outletId ? [tenantId, today, outletId] : [tenantId, today]
      );
      for (const e of highEntries) {
        alerts.push({ type: "high_entry", severity: "warning", message: `High single entry: ${e.ingredient_name} — ₹${Number(e.total_cost).toFixed(2)} (${e.wastage_number})`, entryId: e.id, date: e.wastage_date });
      }

      const { rows: repeatRows } = await pool.query(
        `SELECT ingredient_name, COUNT(*) AS cnt, SUM(total_cost) AS total
         FROM wastage_logs WHERE tenant_id = $1 AND wastage_date = $2 ${outletCond} AND is_voided = false
         GROUP BY ingredient_name HAVING COUNT(*) >= 3 ORDER BY cnt DESC LIMIT 3`,
        outletId ? [tenantId, today, outletId] : [tenantId, today]
      );
      for (const r of repeatRows) {
        alerts.push({ type: "repeat_pattern", severity: "info", message: `${r.ingredient_name} wasted ${r.cnt} times today (₹${Number(r.total).toFixed(2)} total)`, date: today });
      }

      const { rows: spoilageRows } = await pool.query(
        `SELECT COALESCE(SUM(total_cost), 0) AS spoilage_total FROM wastage_logs WHERE tenant_id = $1 AND wastage_date = $2 ${outletCond} AND wastage_category = 'spoilage' AND is_voided = false`,
        outletId ? [tenantId, today, outletId] : [tenantId, today]
      );
      if (Number(spoilageRows[0].spoilage_total) > 500) {
        alerts.push({ type: "spoilage_spike", severity: "warning", message: `Spoilage spike today: ₹${Number(spoilageRows[0].spoilage_total).toFixed(2)}`, date: today });
      }

      res.json(alerts);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wastage/export/csv", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;
      const { from, to, category, chefId, counterId, preventable, outletId } = req.query;

      let whereClauses = ["wl.tenant_id = $1", "wl.is_voided = false"];
      const params: any[] = [tenantId];

      if (outletId) { params.push(outletId); whereClauses.push(`COALESCE(wl.outlet_id,'') = COALESCE($${params.length},'')`); }
      if (from) { params.push(from); whereClauses.push(`wl.wastage_date >= $${params.length}`); }
      if (to) { params.push(to); whereClauses.push(`wl.wastage_date <= $${params.length}`); }
      if (category) { params.push(category); whereClauses.push(`wl.wastage_category = $${params.length}`); }
      if (chefId) { params.push(chefId); whereClauses.push(`wl.chef_id = $${params.length}`); }
      if (counterId) { params.push(counterId); whereClauses.push(`wl.counter_id = $${params.length}`); }
      if (preventable !== undefined) { params.push(preventable === "true"); whereClauses.push(`wl.is_preventable = $${params.length}`); }

      const { rows } = await pool.query(
        `SELECT wl.wastage_number, wl.wastage_date, wl.wastage_category, wl.ingredient_name,
                wl.quantity, wl.unit, wl.unit_cost, wl.total_cost, wl.reason,
                wl.is_preventable, wl.chef_name, wl.counter_name, wl.notes, wl.created_at
         FROM wastage_logs wl WHERE ${whereClauses.join(" AND ")} ORDER BY wl.wastage_date DESC, wl.created_at DESC`,
        params
      );

      const headers = ["wastage_number", "wastage_date", "category", "ingredient", "quantity", "unit", "unit_cost", "total_cost", "reason", "preventable", "chef", "counter", "notes", "created_at"];
      const csvLines = [headers.join(",")];
      for (const r of rows) {
        csvLines.push([
          r.wastage_number, r.wastage_date, r.wastage_category, `"${(r.ingredient_name || "").replace(/"/g, '""')}"`,
          r.quantity, r.unit, r.unit_cost, r.total_cost, `"${(r.reason || "").replace(/"/g, '""')}"`,
          r.is_preventable ? "yes" : "no", `"${(r.chef_name || "").replace(/"/g, '""')}"`,
          `"${(r.counter_name || "").replace(/"/g, '""')}"`, `"${(r.notes || "").replace(/"/g, '""')}"`,
          new Date(r.created_at).toISOString(),
        ].join(","));
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=wastage-export-${new Date().toISOString().slice(0, 10)}.csv`);
      res.send(csvLines.join("\n"));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/wastage/shift-bulk", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;
      const { items, outletId, counterId, counterName, shiftId } = req.body;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "items array required" });

      const today = new Date().toISOString().slice(0, 10);
      const chefName = (user as any).name || (user as any).username || "Chef";
      const created: any[] = [];

      for (const item of items) {
        const { ingredientId, ingredientName, quantity, unit, unitCost, wastageCategory, isPreventable, reason } = item;
        if (!ingredientName || !quantity) continue;

        const qty = Number(quantity);
        const cost = Number(unitCost || 0);
        const totalCost = +(qty * cost).toFixed(2);

        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const wastageNumber = await generateWastageNumberSafe(client, tenantId, today);

          let stockMovementId: string | null = null;
          if (ingredientId && qty > 0) {
            const { rows: invRows } = await client.query(
              `SELECT current_stock FROM inventory_items WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [ingredientId, tenantId]
            );
            if (invRows.length > 0) {
              const stockBefore = Number(invRows[0].current_stock);
              const stockAfter = Math.max(0, stockBefore - qty);
              await client.query(`UPDATE inventory_items SET current_stock = GREATEST(current_stock::numeric - $1, 0) WHERE id = $2`, [qty, ingredientId]);
              const { rows: smRows } = await client.query(
                `INSERT INTO stock_movements (tenant_id, item_id, type, quantity, reason, chef_id, chef_name, shift_id, stock_before, stock_after) VALUES ($1,$2,'WASTAGE',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
                [tenantId, ingredientId, String(-qty), `Bulk wastage: ${ingredientName}`, user.id, chefName, shiftId || null, String(stockBefore), String(stockAfter)]
              );
              stockMovementId = smRows[0].id;
            }
          }

          const { rows: wlRows } = await client.query(
            `INSERT INTO wastage_logs (tenant_id, outlet_id, wastage_number, wastage_date, wastage_category, ingredient_id, ingredient_name, quantity, unit, unit_cost, total_cost, reason, is_preventable, chef_id, chef_name, counter_id, counter_name, shift_id, stock_movement_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
            [tenantId, outletId || null, wastageNumber, today, wastageCategory || "other", ingredientId || null, ingredientName,
             qty, unit || "kg", cost, totalCost, reason || null, isPreventable || false, user.id, chefName,
             counterId || null, counterName || null, shiftId || null, stockMovementId]
          );
          await client.query("COMMIT");
          created.push(wlRows[0]);
          await checkAndEmitAlerts(tenantId, outletId || null, today, totalCost, ingredientName);
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      }

      await upsertDailySummary(tenantId, outletId || null, today);
      res.json({ created: created.length, entries: created });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wastage", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;
      const { from, to, category, chefId, counterId, preventable, minCost, outletId, page = "1", limit: limitParam = "50" } = req.query;

      let whereClauses = ["wl.tenant_id = $1"];
      const params: any[] = [tenantId];

      if (outletId) { params.push(outletId); whereClauses.push(`COALESCE(wl.outlet_id,'') = COALESCE($${params.length},'')`); }
      if (from) { params.push(from); whereClauses.push(`wl.wastage_date >= $${params.length}`); }
      if (to) { params.push(to); whereClauses.push(`wl.wastage_date <= $${params.length}`); }
      if (category) { params.push(category); whereClauses.push(`wl.wastage_category = $${params.length}`); }
      if (chefId) { params.push(chefId); whereClauses.push(`wl.chef_id = $${params.length}`); }
      if (counterId) { params.push(counterId); whereClauses.push(`wl.counter_id = $${params.length}`); }
      if (preventable !== undefined) { params.push(preventable === "true"); whereClauses.push(`wl.is_preventable = $${params.length}`); }
      if (minCost) { params.push(Number(minCost)); whereClauses.push(`wl.total_cost >= $${params.length}`); }

      const limitN = Math.min(parseInt(limitParam as string), 200);
      const offset = (parseInt(page as string) - 1) * limitN;
      const whereStr = whereClauses.join(" AND ");

      const [dataRes, countRes] = await Promise.all([
        pool.query(`SELECT wl.* FROM wastage_logs wl WHERE ${whereStr} ORDER BY wl.wastage_date DESC, wl.created_at DESC LIMIT ${limitN} OFFSET ${offset}`, params),
        pool.query(`SELECT COUNT(*) AS total FROM wastage_logs wl WHERE ${whereStr}`, params),
      ]);

      res.json({ data: dataRes.rows, total: parseInt(countRes.rows[0].total), page: parseInt(page as string), limit: limitN });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wastage/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT wl.*, u.name AS chef_display_name, ii.name AS inventory_item_name, ii.sku
         FROM wastage_logs wl
         LEFT JOIN users u ON u.id = wl.chef_id
         LEFT JOIN inventory_items ii ON ii.id = wl.ingredient_id
         WHERE wl.id = $1 AND wl.tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (!rows.length) return res.status(404).json({ message: "Not found" });
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/wastage", requireRole("owner", "manager", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;
      const {
        ingredientId, ingredientName: bodyIngredientName, quantity, unit = "kg",
        unitCost, wastageCategory, reason, isPreventable = false,
        chefId, chefName: bodyChefName, counterId, counterName, shiftId, outletId, notes, isRecovery = false,
      } = req.body;

      if (!quantity || !wastageCategory) return res.status(400).json({ message: "quantity and wastageCategory required" });
      if (!WASTAGE_CATEGORIES.includes(wastageCategory)) {
        return res.status(400).json({ message: `Invalid category. Must be one of: ${WASTAGE_CATEGORIES.join(", ")}` });
      }

      const today = new Date().toISOString().slice(0, 10);
      const chefDisplayName = bodyChefName || (user as any).name || (user as any).username || "Chef";
      const resolvedChefId = chefId || user.id;
      const qty = Number(quantity);

      let resolvedIngredientName = bodyIngredientName;
      let resolvedUnitCost = Number(unitCost || 0);

      if (ingredientId) {
        const { rows: invCheck } = await pool.query(
          `SELECT name, cost_price, average_cost, tenant_id FROM inventory_items WHERE id = $1`, [ingredientId]
        );
        if (!invCheck.length || invCheck[0].tenant_id !== tenantId) return res.status(403).json({ message: "Forbidden: inventory item not found" });
        if (!resolvedIngredientName) resolvedIngredientName = invCheck[0].name;
        if (!resolvedUnitCost) resolvedUnitCost = Number(invCheck[0].average_cost || invCheck[0].cost_price || 0);
      }

      if (!resolvedIngredientName) return res.status(400).json({ message: "ingredientName required" });

      const totalCost = +(qty * resolvedUnitCost).toFixed(2);

      const client = await pool.connect();
      let newEntry: any;
      try {
        await client.query("BEGIN");

        const wastageNumber = await generateWastageNumberSafe(client, tenantId, today);

        let stockMovementId: string | null = null;
        if (ingredientId && qty > 0 && !isRecovery) {
          const { rows: invRows } = await client.query(
            `SELECT current_stock, reorder_level FROM inventory_items WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
            [ingredientId, tenantId]
          );
          if (invRows.length > 0) {
            const stockBefore = Number(invRows[0].current_stock);
            const stockAfter = Math.max(0, stockBefore - qty);
            const reorderLevel = Number(invRows[0].reorder_level || 0);

            await client.query(
              `UPDATE inventory_items SET current_stock = GREATEST(current_stock::numeric - $1, 0) WHERE id = $2`,
              [qty, ingredientId]
            );

            const { rows: smRows } = await client.query(
              `INSERT INTO stock_movements (tenant_id, item_id, type, quantity, reason, chef_id, chef_name, shift_id, stock_before, stock_after)
               VALUES ($1, $2, 'WASTAGE', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
              [tenantId, ingredientId, String(-qty), `Wastage: ${resolvedIngredientName} — ${reason || wastageCategory}`,
               resolvedChefId, chefDisplayName, shiftId || null, String(stockBefore), String(stockAfter)]
            );
            stockMovementId = smRows[0].id;
          }
        }

        const { rows } = await client.query(
          `INSERT INTO wastage_logs
             (tenant_id, outlet_id, wastage_number, wastage_date, wastage_category, ingredient_id, ingredient_name,
              quantity, unit, unit_cost, total_cost, reason, is_preventable, chef_id, chef_name, counter_id, counter_name,
              shift_id, stock_movement_id, is_recovery, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
          [
            tenantId, outletId || null, wastageNumber, today, wastageCategory, ingredientId || null, resolvedIngredientName,
            qty, unit, resolvedUnitCost, totalCost, reason || null, isPreventable, resolvedChefId, chefDisplayName,
            counterId || null, counterName || null, shiftId || null, stockMovementId, isRecovery, notes || null,
          ]
        );
        newEntry = rows[0];

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

      await checkAndEmitAlerts(tenantId, outletId || null, today, totalCost, resolvedIngredientName);
      await upsertDailySummary(tenantId, outletId || null, today);

      res.json(newEntry);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/wastage/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { rows: existing } = await pool.query(
        `SELECT * FROM wastage_logs WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (!existing.length) return res.status(404).json({ message: "Not found" });
      if (existing[0].is_voided) return res.status(400).json({ message: "Cannot edit a voided entry" });

      const { wastageCategory, reason, isPreventable, notes, counterName, counterId } = req.body;
      const updates: string[] = [];
      const params: any[] = [];

      if (wastageCategory !== undefined) { params.push(wastageCategory); updates.push(`wastage_category = $${params.length}`); }
      if (reason !== undefined) { params.push(reason); updates.push(`reason = $${params.length}`); }
      if (isPreventable !== undefined) { params.push(isPreventable); updates.push(`is_preventable = $${params.length}`); }
      if (notes !== undefined) { params.push(notes); updates.push(`notes = $${params.length}`); }
      if (counterName !== undefined) { params.push(counterName); updates.push(`counter_name = $${params.length}`); }
      if (counterId !== undefined) { params.push(counterId); updates.push(`counter_id = $${params.length}`); }

      if (!updates.length) return res.status(400).json({ message: "No fields to update" });

      params.push(req.params.id);
      params.push(user.tenantId);
      const { rows } = await pool.query(
        `UPDATE wastage_logs SET ${updates.join(", ")} WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *`,
        params
      );

      await upsertDailySummary(user.tenantId, rows[0].outlet_id, rows[0].wastage_date);
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/wastage/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { voidReason } = req.body;
      if (!voidReason) return res.status(400).json({ message: "voidReason required" });

      const { rows: existing } = await pool.query(
        `SELECT * FROM wastage_logs WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (!existing.length) return res.status(404).json({ message: "Not found" });
      if (existing[0].is_voided) return res.status(400).json({ message: "Already voided" });

      const { rows } = await pool.query(
        `UPDATE wastage_logs SET is_voided = true, void_reason = $1, voided_at = now(), voided_by = $2
         WHERE id = $3 AND tenant_id = $4 RETURNING *`,
        [voidReason, user.id, req.params.id, user.tenantId]
      );

      await upsertDailySummary(user.tenantId, rows[0].outlet_id, rows[0].wastage_date);
      res.json({ success: true, entry: rows[0] });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
