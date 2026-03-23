import type { Express } from "express";
import { requireAuth, requireRole } from "../auth";
import { pool } from "../db";
import { runDailyAggregation } from "../services/time-aggregator";
import { recordKdsEvent } from "../services/time-logger";

export function registerTimePerformanceRoutes(app: Express): void {

  // ── Manual time-log endpoints ─────────────────────────────────────────────

  app.post("/api/time-logs/kot-sent/:orderId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      await recordKdsEvent("kot_sent", {
        tenantId: user.tenantId,
        orderId: req.params.orderId,
        userId: user.id,
        userName: user.name || user.username || "Unknown",
        timestamp: new Date(),
      });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/time-logs/acknowledged/:itemId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(`SELECT order_id FROM order_items WHERE id = $1`, [req.params.itemId]);
      if (!rows[0]) return res.status(404).json({ message: "Item not found" });
      await recordKdsEvent("acknowledged", {
        tenantId: user.tenantId,
        orderId: rows[0].order_id,
        orderItemId: req.params.itemId,
        userId: user.id,
        userName: user.name || user.username || "Unknown",
        timestamp: new Date(),
      });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/time-logs/item-ready/:itemId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(`SELECT order_id FROM order_items WHERE id = $1`, [req.params.itemId]);
      if (!rows[0]) return res.status(404).json({ message: "Item not found" });
      await recordKdsEvent("item_ready", {
        tenantId: user.tenantId,
        orderId: rows[0].order_id,
        orderItemId: req.params.itemId,
        userId: user.id,
        userName: user.name || user.username || "Unknown",
        timestamp: new Date(),
      });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/time-logs/waiter-pickup/:itemId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(`SELECT order_id FROM order_items WHERE id = $1`, [req.params.itemId]);
      if (!rows[0]) return res.status(404).json({ message: "Item not found" });
      await recordKdsEvent("waiter_pickup", {
        tenantId: user.tenantId,
        orderId: rows[0].order_id,
        orderItemId: req.params.itemId,
        userId: user.id,
        userName: user.name || user.username || "Unknown",
        timestamp: new Date(),
      });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/time-logs/item-served/:itemId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(`SELECT order_id FROM order_items WHERE id = $1`, [req.params.itemId]);
      if (!rows[0]) return res.status(404).json({ message: "Item not found" });
      await recordKdsEvent("item_served", {
        tenantId: user.tenantId,
        orderId: rows[0].order_id,
        orderItemId: req.params.itemId,
        userId: user.id,
        userName: user.name || user.username || "Unknown",
        timestamp: new Date(),
      });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Analytics endpoints ───────────────────────────────────────────────────

  app.get("/api/time-performance/dashboard", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, date, dateRange = "7d" } = req.query as Record<string, string>;
      const tenantId = user.tenantId;

      const days = parseInt(dateRange.replace("d", "")) || 7;
      const fromDate = date ? new Date(date) : new Date(Date.now() - days * 86400000);
      const toDate = date ? new Date(new Date(date).getTime() + 86400000) : new Date();

      const params: any[] = [tenantId, fromDate, toDate];
      let outletFilter = "";
      if (outletId) { params.push(outletId); outletFilter = `AND outlet_id = $${params.length}`; }

      const { rows: kpiRows } = await pool.query(
        `SELECT
           AVG(total_kitchen_time) AS avg_kitchen_time,
           AVG(total_cycle_time) AS avg_cycle_time,
           COUNT(*) FILTER (WHERE performance_flag IN ('FAST','ON_TIME')) * 100.0 / NULLIF(COUNT(*),0) AS on_time_rate,
           MIN(total_cycle_time) AS fastest_cycle,
           COUNT(DISTINCT order_id) AS order_count
         FROM item_time_logs
         WHERE tenant_id = $1 AND order_received_at >= $2 AND order_received_at < $3 ${outletFilter}`,
        params
      );

      const { rows: waterfallRows } = await pool.query(
        `SELECT
           AVG(waiter_response_time) AS waiter_response,
           AVG(kitchen_pickup_time) AS kitchen_pickup,
           AVG(idle_wait_time) AS idle_wait,
           AVG(actual_cooking_time) AS cooking,
           AVG(pass_wait_time) AS pass_wait,
           AVG(service_delivery_time) AS service_delivery
         FROM item_time_logs
         WHERE tenant_id = $1 AND order_received_at >= $2 AND order_received_at < $3 ${outletFilter}`,
        params
      );

      const kpi = kpiRows[0] || {};
      const wf = waterfallRows[0] || {};

      res.json({
        kpis: {
          avgKitchenTime: kpi.avg_kitchen_time ? Math.round(Number(kpi.avg_kitchen_time)) : null,
          avgCycleTime: kpi.avg_cycle_time ? Math.round(Number(kpi.avg_cycle_time)) : null,
          onTimeRate: kpi.on_time_rate ? parseFloat(Number(kpi.on_time_rate).toFixed(1)) : null,
          fastestCycle: kpi.fastest_cycle ? Math.round(Number(kpi.fastest_cycle)) : null,
          orderCount: parseInt(kpi.order_count || "0"),
        },
        waterfall: [
          { stage: "waiter_response", avgSeconds: wf.waiter_response ? Math.round(Number(wf.waiter_response)) : null },
          { stage: "kitchen_pickup", avgSeconds: wf.kitchen_pickup ? Math.round(Number(wf.kitchen_pickup)) : null },
          { stage: "idle_wait", avgSeconds: wf.idle_wait ? Math.round(Number(wf.idle_wait)) : null },
          { stage: "cooking", avgSeconds: wf.cooking ? Math.round(Number(wf.cooking)) : null },
          { stage: "pass_wait", avgSeconds: wf.pass_wait ? Math.round(Number(wf.pass_wait)) : null },
          { stage: "service_delivery", avgSeconds: wf.service_delivery ? Math.round(Number(wf.service_delivery)) : null },
        ],
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/time-performance/by-dish", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, date } = req.query as Record<string, string>;
      const tenantId = user.tenantId;

      const fromDate = date ? new Date(date) : new Date(Date.now() - 7 * 86400000);
      const toDate = date ? new Date(new Date(date).getTime() + 86400000) : new Date();

      const params: any[] = [tenantId, fromDate, toDate];
      let outletFilter = "";
      if (outletId) { params.push(outletId); outletFilter = `AND outlet_id = $${params.length}`; }

      const { rows } = await pool.query(
        `SELECT
           menu_item_id,
           menu_item_name,
           COUNT(*) AS count,
           AVG(recipe_estimated_time) AS estimated_avg,
           AVG(actual_cooking_time) AS actual_avg,
           AVG(variance_percent) AS avg_variance_pct,
           MODE() WITHIN GROUP (ORDER BY performance_flag) AS most_common_flag
         FROM item_time_logs
         WHERE tenant_id = $1 AND order_received_at >= $2 AND order_received_at < $3
           AND menu_item_id IS NOT NULL AND actual_cooking_time IS NOT NULL ${outletFilter}
         GROUP BY menu_item_id, menu_item_name
         ORDER BY AVG(variance_percent) DESC NULLS LAST`,
        params
      );

      res.json(rows.map((r: any) => ({
        menuItemId: r.menu_item_id,
        menuItemName: r.menu_item_name,
        count: parseInt(r.count),
        estimatedAvg: r.estimated_avg ? Math.round(Number(r.estimated_avg)) : null,
        actualAvg: r.actual_avg ? Math.round(Number(r.actual_avg)) : null,
        variancePct: r.avg_variance_pct ? parseFloat(Number(r.avg_variance_pct).toFixed(1)) : null,
        performanceFlag: r.most_common_flag,
      })));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/time-performance/by-chef", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, date } = req.query as Record<string, string>;
      const tenantId = user.tenantId;

      const fromDate = date ? new Date(date) : new Date(Date.now() - 7 * 86400000);
      const toDate = date ? new Date(new Date(date).getTime() + 86400000) : new Date();

      const params: any[] = [tenantId, fromDate, toDate];
      let outletFilter = "";
      if (outletId) { params.push(outletId); outletFilter = `AND outlet_id = $${params.length}`; }

      const { rows } = await pool.query(
        `SELECT
           chef_id,
           chef_name,
           COUNT(*) AS dish_count,
           AVG(actual_cooking_time) AS avg_cooking_time,
           AVG(recipe_estimated_time) AS avg_estimated_time,
           COUNT(*) FILTER (WHERE performance_flag IN ('FAST','ON_TIME')) * 100.0 / NULLIF(COUNT(*),0) AS on_time_pct
         FROM item_time_logs
         WHERE tenant_id = $1 AND order_received_at >= $2 AND order_received_at < $3
           AND chef_id IS NOT NULL AND actual_cooking_time IS NOT NULL ${outletFilter}
         GROUP BY chef_id, chef_name
         ORDER BY AVG(actual_cooking_time) ASC`,
        params
      );

      res.json(rows.map((r: any) => {
        const avgCooking = r.avg_cooking_time ? Math.round(Number(r.avg_cooking_time)) : null;
        const avgEstimated = r.avg_estimated_time ? Math.round(Number(r.avg_estimated_time)) : null;
        const vsEstimatePct = avgCooking && avgEstimated && avgEstimated > 0
          ? parseFloat(((avgCooking / avgEstimated) * 100).toFixed(1))
          : null;
        const onTimePct = r.on_time_pct ? parseFloat(Number(r.on_time_pct).toFixed(1)) : null;
        let starRating = 3;
        if (onTimePct != null) {
          if (onTimePct >= 90) starRating = 5;
          else if (onTimePct >= 75) starRating = 4;
          else if (onTimePct >= 60) starRating = 3;
          else if (onTimePct >= 40) starRating = 2;
          else starRating = 1;
        }
        return {
          chefId: r.chef_id,
          chefName: r.chef_name,
          dishCount: parseInt(r.dish_count),
          avgCookingTime: avgCooking,
          vsEstimatePct,
          onTimePct,
          starRating,
        };
      }));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/time-performance/by-hour", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, date } = req.query as Record<string, string>;
      const tenantId = user.tenantId;

      const fromDate = date ? new Date(date) : new Date(new Date().toISOString().slice(0, 10));
      const toDate = new Date(fromDate.getTime() + 86400000);

      const params: any[] = [tenantId, fromDate, toDate];
      let outletFilter = "";
      if (outletId) { params.push(outletId); outletFilter = `AND outlet_id = $${params.length}`; }

      const { rows } = await pool.query(
        `SELECT
           EXTRACT(HOUR FROM order_received_at)::int AS hour,
           COUNT(DISTINCT order_id) AS order_count,
           AVG(total_kitchen_time) AS avg_kitchen_time,
           COUNT(*) FILTER (WHERE performance_flag IN ('FAST','ON_TIME')) * 100.0 / NULLIF(COUNT(*),0) AS on_time_pct
         FROM item_time_logs
         WHERE tenant_id = $1 AND order_received_at >= $2 AND order_received_at < $3 ${outletFilter}
         GROUP BY EXTRACT(HOUR FROM order_received_at)::int
         ORDER BY hour`,
        params
      );

      const result = Array.from({ length: 24 }, (_, i) => {
        const row = rows.find((r: any) => parseInt(r.hour) === i);
        const avgKitchenTime = row ? Math.round(Number(row.avg_kitchen_time)) : null;
        const onTimePct = row ? parseFloat(Number(row.on_time_pct).toFixed(1)) : null;
        let statusFlag = "normal";
        if (avgKitchenTime != null) {
          if (avgKitchenTime > 1200) statusFlag = "critical";
          else if (avgKitchenTime > 900) statusFlag = "slow";
          else if (avgKitchenTime < 600) statusFlag = "fast";
        }
        return {
          hour: i,
          orderCount: row ? parseInt(row.order_count) : 0,
          avgKitchenTime,
          onTimePct,
          statusFlag,
        };
      });

      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/time-performance/bottlenecks", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, date } = req.query as Record<string, string>;
      const tenantId = user.tenantId;

      const fromDate = date ? new Date(date) : new Date(Date.now() - 7 * 86400000);
      const toDate = date ? new Date(new Date(date).getTime() + 86400000) : new Date();

      const params: any[] = [tenantId, fromDate, toDate];
      let outletFilter = "";
      if (outletId) { params.push(outletId); outletFilter = `AND outlet_id = $${params.length}`; }

      const [slowWaiters, slowCounters, slowDishes, longPassWait] = await Promise.all([
        pool.query(
          `SELECT chef_id, chef_name,
                  AVG(waiter_response_time) AS avg_response,
                  COUNT(*) AS count
           FROM item_time_logs
           WHERE tenant_id = $1 AND order_received_at >= $2 AND order_received_at < $3
             AND waiter_response_time IS NOT NULL ${outletFilter}
           GROUP BY chef_id, chef_name
           HAVING AVG(waiter_response_time) > 300
           ORDER BY AVG(waiter_response_time) DESC LIMIT 5`,
          params
        ),
        pool.query(
          `SELECT counter_id, counter_name,
                  AVG(actual_cooking_time) AS avg_cooking,
                  COUNT(*) AS count
           FROM item_time_logs
           WHERE tenant_id = $1 AND order_received_at >= $2 AND order_received_at < $3
             AND actual_cooking_time IS NOT NULL AND counter_id IS NOT NULL ${outletFilter}
           GROUP BY counter_id, counter_name
           HAVING AVG(actual_cooking_time) > 1200
           ORDER BY AVG(actual_cooking_time) DESC LIMIT 5`,
          params
        ),
        pool.query(
          `SELECT menu_item_id, menu_item_name,
                  AVG(actual_cooking_time) AS avg_cooking,
                  AVG(recipe_estimated_time) AS avg_estimated,
                  AVG(variance_percent) AS avg_variance,
                  COUNT(*) AS count
           FROM item_time_logs
           WHERE tenant_id = $1 AND order_received_at >= $2 AND order_received_at < $3
             AND actual_cooking_time IS NOT NULL AND variance_percent IS NOT NULL ${outletFilter}
           GROUP BY menu_item_id, menu_item_name
           HAVING AVG(variance_percent) > 20
           ORDER BY AVG(variance_percent) DESC LIMIT 10`,
          params
        ),
        pool.query(
          `SELECT EXTRACT(HOUR FROM order_received_at)::int AS hour,
                  AVG(pass_wait_time) AS avg_pass_wait,
                  COUNT(*) AS count
           FROM item_time_logs
           WHERE tenant_id = $1 AND order_received_at >= $2 AND order_received_at < $3
             AND pass_wait_time IS NOT NULL ${outletFilter}
           GROUP BY EXTRACT(HOUR FROM order_received_at)::int
           HAVING AVG(pass_wait_time) > 180
           ORDER BY AVG(pass_wait_time) DESC LIMIT 5`,
          params
        ),
      ]);

      res.json({
        slowWaiters: slowWaiters.rows.map((r: any) => ({
          chefId: r.chef_id,
          chefName: r.chef_name,
          avgResponseSec: Math.round(Number(r.avg_response)),
          count: parseInt(r.count),
        })),
        slowCounters: slowCounters.rows.map((r: any) => ({
          counterId: r.counter_id,
          counterName: r.counter_name,
          avgCookingSec: Math.round(Number(r.avg_cooking)),
          count: parseInt(r.count),
        })),
        slowDishes: slowDishes.rows.map((r: any) => ({
          menuItemId: r.menu_item_id,
          menuItemName: r.menu_item_name,
          avgCookingSec: Math.round(Number(r.avg_cooking)),
          avgEstimatedSec: r.avg_estimated ? Math.round(Number(r.avg_estimated)) : null,
          avgVariancePct: parseFloat(Number(r.avg_variance).toFixed(1)),
          count: parseInt(r.count),
        })),
        longPassWaitByHour: longPassWait.rows.map((r: any) => ({
          hour: parseInt(r.hour),
          avgPassWaitSec: Math.round(Number(r.avg_pass_wait)),
          count: parseInt(r.count),
        })),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/time-performance/trend", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, days = "30" } = req.query as Record<string, string>;
      const tenantId = user.tenantId;

      const numDays = parseInt(days) || 30;
      const fromDate = new Date(Date.now() - numDays * 86400000);

      const params: any[] = [tenantId, fromDate.toISOString().slice(0, 10)];
      let outletFilter = "";
      if (outletId) { params.push(outletId); outletFilter = `AND outlet_id = $${params.length}`; }

      const { rows } = await pool.query(
        `SELECT * FROM daily_time_performance
         WHERE tenant_id = $1 AND performance_date >= $2 ${outletFilter}
         ORDER BY performance_date ASC`,
        params
      );

      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/time-performance/shift-report", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, shiftDate, shiftType } = req.query as Record<string, string>;
      const tenantId = user.tenantId;

      const date = shiftDate || new Date().toISOString().slice(0, 10);

      const params: any[] = [tenantId, date];
      let outletFilter = "";
      if (outletId) { params.push(outletId); outletFilter = `AND outlet_id = $${params.length}`; }
      let shiftFilter = "";
      if (shiftType) { params.push(shiftType); shiftFilter = `AND shift_type = $${params.length}`; }

      const { rows: logs } = await pool.query(
        `SELECT * FROM item_time_logs
         WHERE tenant_id = $1 AND shift_date = $2 ${outletFilter} ${shiftFilter}`,
        params
      );

      const { rows: orderSummaries } = await pool.query(
        `SELECT * FROM order_time_summary
         WHERE tenant_id = $1 AND shift_date = $2 ${outletFilter}`,
        params
      );

      const totalOrders = new Set(logs.map((l: any) => l.order_id)).size;
      const onTime = logs.filter((l: any) => ["FAST", "ON_TIME"].includes(l.performance_flag)).length;
      const onTimePct = logs.length > 0 ? parseFloat(((onTime / logs.length) * 100).toFixed(1)) : 0;

      const sortedByTime = [...orderSummaries].sort((a: any, b: any) => (a.total_cycle_time || 9999) - (b.total_cycle_time || 9999));
      const fastestOrder = sortedByTime[0] || null;
      const slowestOrder = sortedByTime[sortedByTime.length - 1] || null;

      const chefMap = new Map<string, { name: string; count: number; onTime: number }>();
      for (const l of logs) {
        if (!l.chef_id) continue;
        const c = chefMap.get(l.chef_id) || { name: l.chef_name || l.chef_id, count: 0, onTime: 0 };
        c.count++;
        if (["FAST", "ON_TIME"].includes(l.performance_flag)) c.onTime++;
        chefMap.set(l.chef_id, c);
      }
      const topPerformers = Array.from(chefMap.entries())
        .map(([id, v]) => ({ chefId: id, chefName: v.name, count: v.count, onTimePct: v.count > 0 ? parseFloat(((v.onTime / v.count) * 100).toFixed(1)) : 0 }))
        .sort((a, b) => b.onTimePct - a.onTimePct)
        .slice(0, 3);

      const itemsNeedingAttention = logs
        .filter((l: any) => l.performance_flag === "VERY_SLOW")
        .map((l: any) => ({
          orderItemId: l.order_item_id,
          menuItemName: l.menu_item_name,
          actualCookingTime: l.actual_cooking_time,
          estimatedTime: l.recipe_estimated_time,
          variancePct: l.variance_percent,
          chefName: l.chef_name,
        }))
        .slice(0, 10);

      res.json({
        date,
        shiftType: shiftType || "ALL",
        totalOrders,
        totalItems: logs.length,
        onTimePct,
        fastestOrder: fastestOrder ? { orderId: fastestOrder.order_id, cycleSec: fastestOrder.total_cycle_time } : null,
        slowestOrder: slowestOrder ? { orderId: slowestOrder.order_id, cycleSec: slowestOrder.total_cycle_time } : null,
        topPerformers,
        itemsNeedingAttention,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Targets ───────────────────────────────────────────────────────────────

  app.get("/api/time-targets/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT * FROM time_performance_targets
         WHERE tenant_id = $1 AND (outlet_id = $2 OR outlet_id IS NULL) AND is_active = true
         ORDER BY outlet_id DESC NULLS LAST LIMIT 1`,
        [user.tenantId, req.params.outletId]
      );
      res.json(rows[0] || {
        waiterResponseTarget: 120,
        kitchenPickupTarget: 60,
        totalKitchenTarget: 900,
        totalCycleTarget: 1500,
        alertAtPercent: 80,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/time-targets/:outletId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { waiterResponseTarget, kitchenPickupTarget, totalKitchenTarget, totalCycleTarget, alertAtPercent, targetName, orderType } = req.body;

      const { rows } = await pool.query(
        `INSERT INTO time_performance_targets
           (tenant_id, outlet_id, order_type, target_name, waiter_response_target,
            kitchen_pickup_target, total_kitchen_target, total_cycle_target, alert_at_percent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [
          user.tenantId,
          req.params.outletId,
          orderType || "ALL",
          targetName || "Default",
          waiterResponseTarget || 120,
          kitchenPickupTarget || 60,
          totalKitchenTarget || 900,
          totalCycleTarget || 1500,
          alertAtPercent || 80,
        ]
      );

      if (!rows[0]) {
        const { rows: updated } = await pool.query(
          `UPDATE time_performance_targets SET
             waiter_response_target = $1,
             kitchen_pickup_target = $2,
             total_kitchen_target = $3,
             total_cycle_target = $4,
             alert_at_percent = $5,
             target_name = $6
           WHERE tenant_id = $7 AND outlet_id = $8 AND is_active = true
           RETURNING *`,
          [
            waiterResponseTarget || 120,
            kitchenPickupTarget || 60,
            totalKitchenTarget || 900,
            totalCycleTarget || 1500,
            alertAtPercent || 80,
            targetName || "Default",
            user.tenantId,
            req.params.outletId,
          ]
        );
        return res.json(updated[0]);
      }

      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Benchmarks ────────────────────────────────────────────────────────────

  app.get("/api/recipe-benchmarks/:menuItemId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT * FROM recipe_time_benchmarks WHERE tenant_id = $1 AND menu_item_id = $2`,
        [user.tenantId, req.params.menuItemId]
      );
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/recipe-benchmarks/calibrate", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;

      const { rows: items } = await pool.query(
        `SELECT menu_item_id, menu_item_name,
                COUNT(*) AS sample_count,
                AVG(actual_cooking_time) AS avg_time,
                MIN(actual_cooking_time) AS min_time,
                MAX(actual_cooking_time) AS max_time,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY actual_cooking_time) AS p75_time,
                AVG(recipe_estimated_time) AS current_estimated
         FROM item_time_logs
         WHERE tenant_id = $1 AND actual_cooking_time IS NOT NULL AND menu_item_id IS NOT NULL
         GROUP BY menu_item_id, menu_item_name
         HAVING COUNT(*) >= 20`,
        [tenantId]
      );

      const changes: any[] = [];
      for (const item of items) {
        const avgTime = Math.round(Number(item.avg_time));
        const currentEstimated = item.current_estimated ? Math.round(Number(item.current_estimated)) : null;
        const newEstimatedMinutes = Math.round(avgTime / 60);

        await pool.query(
          `INSERT INTO recipe_time_benchmarks (tenant_id, menu_item_id, counter_id, estimated_prep_time, actual_avg_time, fastest_time, slowest_time, p75_time, sample_count, last_calculated)
           VALUES ($1,$2,'default',$3,$4,$5,$6,$7,$8,NOW())
           ON CONFLICT (tenant_id, menu_item_id, counter_id) DO UPDATE SET
             actual_avg_time = $4,
             fastest_time = $5,
             slowest_time = $6,
             p75_time = $7,
             sample_count = $8,
             last_calculated = NOW()`,
          [
            tenantId,
            item.menu_item_id,
            avgTime,
            avgTime,
            Math.round(Number(item.min_time)),
            Math.round(Number(item.max_time)),
            Math.round(Number(item.p75_time)),
            parseInt(item.sample_count),
          ]
        );

        if (currentEstimated && Math.abs((avgTime - currentEstimated) / currentEstimated) > 0.15) {
          await pool.query(
            `UPDATE menu_items SET prep_time_minutes = $1 WHERE id = $2 AND tenant_id = $3`,
            [newEstimatedMinutes, item.menu_item_id, tenantId]
          );
          changes.push({
            menuItemId: item.menu_item_id,
            menuItemName: item.menu_item_name,
            oldEstimatedSec: currentEstimated,
            newEstimatedSec: avgTime,
            newPrepMinutes: newEstimatedMinutes,
            sampleCount: parseInt(item.sample_count),
          });
        }
      }

      res.json({ calibrated: items.length, changes });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Daily aggregation trigger ──────────────────────────────────────────────

  app.post("/api/time-performance/aggregate", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { date } = req.body;
      const aggregateDate = date ? new Date(date) : new Date(Date.now() - 86400000);
      await runDailyAggregation(user.tenantId, aggregateDate);
      res.json({ success: true, date: aggregateDate.toISOString().slice(0, 10) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
