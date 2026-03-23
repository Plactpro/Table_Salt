import { pool } from "../db";
import { emitToTenant } from "../realtime";
import { alertEngine } from "./alert-engine";

export type KdsEventType =
  | "kot_sent"
  | "acknowledged"
  | "cooking_started"
  | "item_ready"
  | "waiter_pickup"
  | "item_served";

export interface KdsEventContext {
  tenantId: string;
  orderId: string;
  orderItemId?: string;
  userId: string;
  userName: string;
  timestamp: Date;
}

function diffSeconds(a: Date | string | null | undefined, b: Date | string | null | undefined): number | null {
  if (!a || !b) return null;
  const da = a instanceof Date ? a : new Date(a);
  const db2 = b instanceof Date ? b : new Date(b);
  return Math.round((db2.getTime() - da.getTime()) / 1000);
}

function computePerformanceFlag(actual: number | null, estimated: number | null): string | null {
  if (!actual || !estimated || estimated <= 0) return null;
  const ratio = actual / estimated;
  if (ratio < 0.8) return "FAST";
  if (ratio <= 1.0) return "ON_TIME";
  if (ratio <= 1.2) return "SLOW";
  return "VERY_SLOW";
}

async function upsertItemTimeLog(orderItemId: string, tenantId: string, timestamp: Date): Promise<void> {
  const { rows: itemRows } = await pool.query(
    `SELECT oi.*,
            o.created_at AS order_created_at,
            o.kot_sent_at AS order_kot_sent_at,
            o.outlet_id,
            o.order_type,
            o.waiter_id,
            o.waiter_name,
            o.order_number,
            t.number AS table_number
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN tables t ON t.id = o.table_id
     WHERE oi.id = $1 AND o.tenant_id = $2`,
    [orderItemId, tenantId]
  );
  if (!itemRows[0]) return;
  const item = itemRows[0];

  const shiftDate = new Date(item.order_created_at).toISOString().slice(0, 10);

  const orderReceivedAt: Date | null = item.order_created_at ? new Date(item.order_created_at) : null;
  const kotSentAt: Date | null = item.kot_sent_at ? new Date(item.kot_sent_at) : null;
  const ticketAcknowledgedAt: Date | null = item.ticket_acknowledged_at ? new Date(item.ticket_acknowledged_at) : null;
  const cookingStartedAt: Date | null = item.actual_start_at ? new Date(item.actual_start_at) : null;
  const cookingReadyAt: Date | null = item.actual_ready_at ? new Date(item.actual_ready_at) : null;
  const waiterPickupAt: Date | null = item.waiter_pickup_at ? new Date(item.waiter_pickup_at) : null;
  const servedAt: Date | null = item.served_at ? new Date(item.served_at) : null;

  const waiterResponseTime = diffSeconds(cookingReadyAt, waiterPickupAt);
  const kitchenPickupTime = diffSeconds(orderReceivedAt, kotSentAt);
  const idleWaitTime = diffSeconds(kotSentAt, ticketAcknowledgedAt);
  const actualCookingTime = diffSeconds(cookingStartedAt, cookingReadyAt);
  const passWaitTime = diffSeconds(cookingReadyAt, waiterPickupAt);
  const serviceDeliveryTime = diffSeconds(waiterPickupAt, servedAt);
  const totalKitchenTime = diffSeconds(kotSentAt, cookingReadyAt);
  const totalCycleTime = diffSeconds(orderReceivedAt, servedAt);

  const recipeEstimatedTime = item.item_prep_minutes ? item.item_prep_minutes * 60 : null;
  const timeVariance = recipeEstimatedTime && actualCookingTime != null
    ? actualCookingTime - recipeEstimatedTime
    : null;
  const variancePercent = recipeEstimatedTime && recipeEstimatedTime > 0 && timeVariance != null
    ? parseFloat(((timeVariance / recipeEstimatedTime) * 100).toFixed(2))
    : null;
  const performanceFlag = computePerformanceFlag(actualCookingTime, recipeEstimatedTime);

  const { rows: assignRows } = await pool.query(
    `SELECT ta.counter_id, ta.counter_name, ta.chef_id, ta.chef_name
     FROM ticket_assignments ta
     WHERE ta.order_item_id = $1
     ORDER BY ta.created_at DESC
     LIMIT 1`,
    [orderItemId]
  );
  const assign = assignRows[0];

  const { rows: vipRows } = await pool.query(
    `SELECT 1 FROM vip_order_flags WHERE order_id = $1 LIMIT 1`,
    [item.order_id]
  );

  await pool.query(
    `INSERT INTO item_time_logs (
       tenant_id, outlet_id, order_id, order_number, order_item_id,
       menu_item_id, menu_item_name, counter_id, counter_name,
       chef_id, chef_name, shift_date, order_type, table_number,
       order_received_at, kot_sent_at, ticket_acknowledged_at,
       cooking_started_at, cooking_ready_at,
       waiter_pickup_at, served_at,
       waiter_response_time, kitchen_pickup_time, idle_wait_time,
       actual_cooking_time, pass_wait_time, service_delivery_time,
       total_kitchen_time, total_cycle_time,
       recipe_estimated_time, time_variance, variance_percent,
       performance_flag, was_vip_order, course_number
     ) VALUES (
       $1,$2,$3,$4,$5,
       $6,$7,$8,$9,
       $10,$11,$12,$13,$14,
       $15,$16,$17,
       $18,$19,
       $20,$21,
       $22,$23,$24,
       $25,$26,$27,
       $28,$29,
       $30,$31,$32,
       $33,$34,$35
     )
     ON CONFLICT (order_item_id) DO UPDATE SET
       cooking_ready_at = EXCLUDED.cooking_ready_at,
       waiter_pickup_at = EXCLUDED.waiter_pickup_at,
       served_at = EXCLUDED.served_at,
       waiter_response_time = EXCLUDED.waiter_response_time,
       kitchen_pickup_time = EXCLUDED.kitchen_pickup_time,
       idle_wait_time = EXCLUDED.idle_wait_time,
       actual_cooking_time = EXCLUDED.actual_cooking_time,
       pass_wait_time = EXCLUDED.pass_wait_time,
       service_delivery_time = EXCLUDED.service_delivery_time,
       total_kitchen_time = EXCLUDED.total_kitchen_time,
       total_cycle_time = EXCLUDED.total_cycle_time,
       time_variance = EXCLUDED.time_variance,
       variance_percent = EXCLUDED.variance_percent,
       performance_flag = EXCLUDED.performance_flag,
       chef_id = COALESCE(EXCLUDED.chef_id, item_time_logs.chef_id),
       chef_name = COALESCE(EXCLUDED.chef_name, item_time_logs.chef_name),
       counter_id = COALESCE(EXCLUDED.counter_id, item_time_logs.counter_id),
       counter_name = COALESCE(EXCLUDED.counter_name, item_time_logs.counter_name)`,
    [
      tenantId,
      item.outlet_id,
      item.order_id,
      item.order_number,
      orderItemId,
      item.menu_item_id,
      item.name,
      assign?.counter_id || null,
      assign?.counter_name || null,
      assign?.chef_id || null,
      assign?.chef_name || null,
      shiftDate,
      item.order_type,
      item.table_number ? String(item.table_number) : null,
      orderReceivedAt,
      kotSentAt,
      ticketAcknowledgedAt,
      cookingStartedAt,
      cookingReadyAt,
      waiterPickupAt,
      servedAt,
      waiterResponseTime,
      kitchenPickupTime,
      idleWaitTime,
      actualCookingTime,
      passWaitTime,
      serviceDeliveryTime,
      totalKitchenTime,
      totalCycleTime,
      recipeEstimatedTime,
      timeVariance,
      variancePercent,
      performanceFlag,
      vipRows.length > 0,
      item.course_number || null,
    ]
  );

  if (performanceFlag === 'VERY_SLOW') {
    alertEngine.trigger('ALERT-05', { tenantId, outletId: item.outlet_id ?? undefined, referenceId: item.order_id, message: `Item overdue: ${item.name} — over 120% of estimate` }).catch(() => {});
  }

  if (actualCookingTime != null && recipeEstimatedTime) {
    await pool.query(
      `INSERT INTO recipe_time_benchmarks (tenant_id, menu_item_id, counter_id, estimated_prep_time, actual_avg_time, fastest_time, slowest_time, sample_count, last_calculated)
       VALUES ($1, $2, $3, $4, $5, $5, $5, 1, NOW())
       ON CONFLICT (tenant_id, menu_item_id, counter_id) DO UPDATE SET
         actual_avg_time = ROUND((recipe_time_benchmarks.actual_avg_time * recipe_time_benchmarks.sample_count + $5) / (recipe_time_benchmarks.sample_count + 1)),
         fastest_time = LEAST(recipe_time_benchmarks.fastest_time, $5),
         slowest_time = GREATEST(recipe_time_benchmarks.slowest_time, $5),
         sample_count = recipe_time_benchmarks.sample_count + 1,
         last_calculated = NOW()`,
      [
        tenantId,
        item.menu_item_id,
        assign?.counter_id || "default",
        recipeEstimatedTime,
        actualCookingTime,
      ]
    );
  }
}

export async function recordKdsEvent(eventType: KdsEventType, context: KdsEventContext): Promise<void> {
  try {
    const { tenantId, orderId, orderItemId, userId, userName, timestamp } = context;

    switch (eventType) {
      case "kot_sent": {
        await pool.query(
          `UPDATE orders SET kot_sent_at = COALESCE(kot_sent_at, $1) WHERE id = $2 AND tenant_id = $3`,
          [timestamp, orderId, tenantId]
        );
        await pool.query(
          `UPDATE order_items SET kot_sent_at = COALESCE(kot_sent_at, $1) WHERE order_id = $2`,
          [timestamp, orderId]
        );
        break;
      }

      case "acknowledged": {
        if (!orderItemId) break;
        await pool.query(
          `UPDATE order_items SET ticket_acknowledged_at = COALESCE(ticket_acknowledged_at, $1) WHERE id = $2`,
          [timestamp, orderItemId]
        );
        break;
      }

      case "cooking_started": {
        break;
      }

      case "item_ready": {
        if (!orderItemId) break;
        await upsertItemTimeLog(orderItemId, tenantId, timestamp);

        const { rows: allItems } = await pool.query(
          `SELECT status FROM order_items WHERE order_id = $1`,
          [orderId]
        );
        const allReady = allItems.every((i: any) => i.status === "ready" || i.status === "served");
        if (allReady) {
          await pool.query(
            `UPDATE orders SET all_items_ready_at = COALESCE(all_items_ready_at, $1) WHERE id = $2 AND tenant_id = $3`,
            [timestamp, orderId, tenantId]
          );
        }

        emitToTenant(tenantId, "kds:timing_update", {
          orderId,
          orderItemId,
          eventType: "item_ready",
          timestamp: timestamp.toISOString(),
        });
        break;
      }

      case "waiter_pickup": {
        if (!orderItemId) break;
        await pool.query(
          `UPDATE order_items SET waiter_pickup_at = COALESCE(waiter_pickup_at, $1) WHERE id = $2`,
          [timestamp, orderItemId]
        );
        await upsertItemTimeLog(orderItemId, tenantId, timestamp);
        break;
      }

      case "item_served": {
        if (!orderItemId) break;
        await pool.query(
          `UPDATE order_items SET served_at = COALESCE(served_at, $1) WHERE id = $2`,
          [timestamp, orderItemId]
        );
        await upsertItemTimeLog(orderItemId, tenantId, timestamp);

        const { rows: allItems } = await pool.query(
          `SELECT status, served_at FROM order_items WHERE order_id = $1`,
          [orderId]
        );
        const allServed = allItems.every((i: any) => i.status === "served");
        if (allServed) {
          await pool.query(
            `UPDATE orders SET all_items_served_at = COALESCE(all_items_served_at, $1) WHERE id = $2 AND tenant_id = $3`,
            [timestamp, orderId, tenantId]
          );

          const { rows: orderRows } = await pool.query(
            `SELECT o.*, t.number AS table_number
             FROM orders o
             LEFT JOIN tables t ON t.id = o.table_id
             WHERE o.id = $1 AND o.tenant_id = $2`,
            [orderId, tenantId]
          );
          const order = orderRows[0];
          if (order) {
            const { rows: itemLogs } = await pool.query(
              `SELECT * FROM item_time_logs WHERE order_id = $1`,
              [orderId]
            );
            const totalKitchenTime = itemLogs.length > 0
              ? Math.max(...itemLogs.map((l: any) => l.total_kitchen_time || 0))
              : null;
            const totalCycleTime = order.created_at && timestamp
              ? Math.round((timestamp.getTime() - new Date(order.created_at).getTime()) / 1000)
              : null;

            const { rows: targetRows } = await pool.query(
              `SELECT * FROM time_performance_targets
               WHERE tenant_id = $1 AND (outlet_id = $2 OR outlet_id IS NULL) AND is_active = true
               ORDER BY outlet_id DESC NULLS LAST LIMIT 1`,
              [tenantId, order.outlet_id]
            );
            const target = targetRows[0];
            const targetTime = target?.total_cycle_target || 1500;
            const metTarget = totalCycleTime != null ? totalCycleTime <= targetTime : null;

            const shiftDate = new Date(order.created_at).toISOString().slice(0, 10);
            const firstServed = Math.min(...allItems.map((i: any) => i.served_at ? new Date(i.served_at).getTime() : Infinity));

            await pool.query(
              `INSERT INTO order_time_summary (
                 tenant_id, outlet_id, order_id, order_number, order_type,
                 table_number, waiter_id, waiter_name, total_items,
                 order_received_at, kot_sent_at, first_item_ready_at, all_items_ready_at,
                 first_item_served_at, all_items_served_at,
                 total_kitchen_time, total_cycle_time, target_time, met_target, shift_date
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
               ON CONFLICT (order_id) DO UPDATE SET
                 all_items_served_at = EXCLUDED.all_items_served_at,
                 total_kitchen_time = EXCLUDED.total_kitchen_time,
                 total_cycle_time = EXCLUDED.total_cycle_time,
                 met_target = EXCLUDED.met_target`,
              [
                tenantId,
                order.outlet_id,
                orderId,
                order.order_number,
                order.order_type,
                order.table_number ? String(order.table_number) : null,
                order.waiter_id,
                order.waiter_name,
                allItems.length,
                order.created_at,
                order.kot_sent_at,
                order.first_item_ready_at,
                order.all_items_ready_at || timestamp,
                firstServed !== Infinity ? new Date(firstServed) : null,
                timestamp,
                totalKitchenTime,
                totalCycleTime,
                targetTime,
                metTarget,
                shiftDate,
              ]
            );
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[time-logger] recordKdsEvent error (${eventType}):`, err);
  }
}
