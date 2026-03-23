import { pool } from "../db";

export async function runDailyAggregation(tenantId: string, date: Date): Promise<void> {
  const shiftDate = date.toISOString().slice(0, 10);

  const { rows: logs } = await pool.query(
    `SELECT * FROM item_time_logs WHERE tenant_id = $1 AND shift_date = $2`,
    [tenantId, shiftDate]
  );

  if (logs.length === 0) return;

  const { rows: targetRows } = await pool.query(
    `SELECT DISTINCT outlet_id FROM item_time_logs WHERE tenant_id = $1 AND shift_date = $2`,
    [tenantId, shiftDate]
  );

  const outletIds: (string | null)[] = [...new Set(logs.map((l: any) => l.outlet_id as string | null))];

  for (const outletId of outletIds) {
    const outletLogs = logs.filter((l: any) => l.outlet_id === outletId);

    const { rows: targetResult } = await pool.query(
      `SELECT * FROM time_performance_targets
       WHERE tenant_id = $1 AND (outlet_id = $2 OR outlet_id IS NULL) AND is_active = true
       ORDER BY outlet_id DESC NULLS LAST LIMIT 1`,
      [tenantId, outletId]
    );
    const target = targetResult[0];
    const targetKitchenTime = target?.total_kitchen_target || 900;
    const targetCycleTime = target?.total_cycle_target || 1500;

    const shiftGroups = groupBy(outletLogs, (l: any) => l.shift_type || "ALL");

    for (const [shiftType, shiftLogs] of Object.entries(shiftGroups)) {
      const totalOrders = new Set(shiftLogs.map((l: any) => l.order_id)).size;
      const onTime = shiftLogs.filter((l: any) => l.performance_flag === "FAST" || l.performance_flag === "ON_TIME").length;
      const delayed = shiftLogs.filter((l: any) => l.performance_flag === "SLOW" || l.performance_flag === "VERY_SLOW").length;
      const veryFast = shiftLogs.filter((l: any) => l.performance_flag === "FAST").length;

      const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

      const avgWaiterResponse = avg(shiftLogs.map((l: any) => l.waiter_response_time).filter((v: any) => v != null));
      const avgKitchenPickup = avg(shiftLogs.map((l: any) => l.kitchen_pickup_time).filter((v: any) => v != null));
      const avgIdleWait = avg(shiftLogs.map((l: any) => l.idle_wait_time).filter((v: any) => v != null));
      const avgCookingTime = avg(shiftLogs.map((l: any) => l.actual_cooking_time).filter((v: any) => v != null));
      const avgPassWait = avg(shiftLogs.map((l: any) => l.pass_wait_time).filter((v: any) => v != null));
      const avgTotalKitchenTime = avg(shiftLogs.map((l: any) => l.total_kitchen_time).filter((v: any) => v != null));
      const avgTotalCycleTime = avg(shiftLogs.map((l: any) => l.total_cycle_time).filter((v: any) => v != null));

      const hourBuckets = new Map<number, number[]>();
      for (const l of shiftLogs) {
        if (l.order_received_at && l.total_kitchen_time != null) {
          const hr = new Date(l.order_received_at).getHours();
          if (!hourBuckets.has(hr)) hourBuckets.set(hr, []);
          hourBuckets.get(hr)!.push(l.total_kitchen_time);
        }
      }
      let peakHour: number | null = null;
      let peakAvgWait: number | null = null;
      for (const [hr, times] of hourBuckets.entries()) {
        const avgT = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        if (peakAvgWait == null || avgT > peakAvgWait) {
          peakAvgWait = avgT;
          peakHour = hr;
        }
      }

      const counterMap = new Map<string, { total: number; totalTime: number; name: string }>();
      const chefMap = new Map<string, { total: number; totalTime: number; name: string }>();
      const dishMap = new Map<string, { total: number; totalTime: number; name: string }>();

      for (const l of shiftLogs) {
        if (l.counter_id) {
          const c = counterMap.get(l.counter_id) || { total: 0, totalTime: 0, name: l.counter_name || l.counter_id };
          c.total++;
          if (l.actual_cooking_time) c.totalTime += l.actual_cooking_time;
          counterMap.set(l.counter_id, c);
        }
        if (l.chef_id) {
          const c = chefMap.get(l.chef_id) || { total: 0, totalTime: 0, name: l.chef_name || l.chef_id };
          c.total++;
          if (l.actual_cooking_time) c.totalTime += l.actual_cooking_time;
          chefMap.set(l.chef_id, c);
        }
        if (l.menu_item_id) {
          const c = dishMap.get(l.menu_item_id) || { total: 0, totalTime: 0, name: l.menu_item_name || l.menu_item_id };
          c.total++;
          if (l.actual_cooking_time) c.totalTime += l.actual_cooking_time;
          dishMap.set(l.menu_item_id, c);
        }
      }

      const toJsonArr = (map: Map<string, any>) =>
        Array.from(map.entries()).map(([id, v]) => ({
          id,
          name: v.name,
          count: v.total,
          avgTime: v.total > 0 ? Math.round(v.totalTime / v.total) : null,
        }));

      const onTimePct = shiftLogs.length > 0 ? parseFloat(((onTime / shiftLogs.length) * 100).toFixed(2)) : 0;

      await pool.query(
        `INSERT INTO daily_time_performance (
           tenant_id, outlet_id, performance_date, shift_type,
           total_orders, orders_on_time, orders_delayed, orders_very_fast,
           avg_waiter_response, avg_kitchen_pickup, avg_idle_wait, avg_cooking_time,
           avg_pass_wait, avg_total_kitchen_time, avg_total_cycle_time,
           peak_hour, peak_avg_wait,
           by_counter, by_chef, by_dish,
           target_kitchen_time, target_cycle_time, on_time_percentage
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         ON CONFLICT (tenant_id, outlet_id, performance_date, shift_type) DO UPDATE SET
           total_orders = EXCLUDED.total_orders,
           orders_on_time = EXCLUDED.orders_on_time,
           orders_delayed = EXCLUDED.orders_delayed,
           orders_very_fast = EXCLUDED.orders_very_fast,
           avg_waiter_response = EXCLUDED.avg_waiter_response,
           avg_kitchen_pickup = EXCLUDED.avg_kitchen_pickup,
           avg_idle_wait = EXCLUDED.avg_idle_wait,
           avg_cooking_time = EXCLUDED.avg_cooking_time,
           avg_pass_wait = EXCLUDED.avg_pass_wait,
           avg_total_kitchen_time = EXCLUDED.avg_total_kitchen_time,
           avg_total_cycle_time = EXCLUDED.avg_total_cycle_time,
           peak_hour = EXCLUDED.peak_hour,
           peak_avg_wait = EXCLUDED.peak_avg_wait,
           by_counter = EXCLUDED.by_counter,
           by_chef = EXCLUDED.by_chef,
           by_dish = EXCLUDED.by_dish,
           target_kitchen_time = EXCLUDED.target_kitchen_time,
           target_cycle_time = EXCLUDED.target_cycle_time,
           on_time_percentage = EXCLUDED.on_time_percentage`,
        [
          tenantId,
          outletId,
          shiftDate,
          shiftType,
          totalOrders,
          onTime,
          delayed,
          veryFast,
          avgWaiterResponse,
          avgKitchenPickup,
          avgIdleWait,
          avgCookingTime,
          avgPassWait,
          avgTotalKitchenTime,
          avgTotalCycleTime,
          peakHour,
          peakAvgWait,
          JSON.stringify(toJsonArr(counterMap)),
          JSON.stringify(toJsonArr(chefMap)),
          JSON.stringify(toJsonArr(dishMap)),
          targetKitchenTime,
          targetCycleTime,
          onTimePct,
        ]
      );
    }
  }
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
