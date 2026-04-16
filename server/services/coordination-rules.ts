import { pool } from "../db";
import { emitToTenant } from "../realtime";
import { alertEngine } from "./alert-engine";
import { withJobLock, JOB_LOCK } from "../lib/job-lock";

// firedAlerts deduplicates alerts within a session.
// Keys expire after 2 hours so long-lived orders can re-alert if still stuck.
const firedAlerts = new Map<string, number>();
const ALERT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function alertFired(key: string): boolean {
  const ts = firedAlerts.get(key);
  if (ts === undefined) return false;
  if (Date.now() - ts > ALERT_TTL_MS) {
    firedAlerts.delete(key);
    return false;
  }
  return true;
}

function markAlertFired(key: string): void {
  firedAlerts.set(key, Date.now());
}

async function getActiveTenantIds(): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT id FROM tenants WHERE active = true AND slug != 'platform' LIMIT 100`
  );
  return rows.map((r: any) => r.id);
}

async function getActiveOrders(tenantId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT o.*,
       EXTRACT(EPOCH FROM (NOW() - o.created_at)) / 60 AS age_minutes,
       -- Time in current status: pick the most relevant status-entry timestamp
       CASE
         WHEN o.status = 'served' AND o.served_at IS NOT NULL
           THEN EXTRACT(EPOCH FROM (NOW() - o.served_at)) / 60
         WHEN o.status IN ('ready') AND o.fully_ready_at IS NOT NULL
           THEN EXTRACT(EPOCH FROM (NOW() - o.fully_ready_at)) / 60
         WHEN o.status IN ('in_progress', 'sent_to_kitchen') AND o.kitchen_sent_at IS NOT NULL
           THEN EXTRACT(EPOCH FROM (NOW() - o.kitchen_sent_at)) / 60
         ELSE EXTRACT(EPOCH FROM (NOW() - o.created_at)) / 60
       END AS status_age_minutes
     FROM orders o
     WHERE o.tenant_id = $1
       AND o.status NOT IN ('paid', 'cancelled', 'voided', 'completed')`,
    [tenantId]
  );
  return rows;
}

async function getActiveRules(tenantId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM coordination_rules WHERE tenant_id = $1 AND is_active = true`,
    [tenantId]
  );
  return rows;
}

async function createAlert(
  tenantId: string,
  orderId: string | null,
  ruleId: number,
  message: string,
  action: string,
  priority: string = "normal",
  toStaffId?: string | null
): Promise<void> {
  // notify_coordinator currently routes to 'manager' role since there is no
  // dedicated coordinator role in the system. If a coordinator role is introduced
  // in future, update this mapping accordingly.
  const staffRole =
    action === "notify_manager_urgent" ? "manager"
    : action === "notify_waiter" ? "waiter"
    : action === "notify_coordinator" ? "manager"
    : "manager";

  // When toStaffId is provided (e.g., assigned waiter), target them directly
  // in addition to the role-based routing so the message is visible immediately.
  await pool.query(
    `INSERT INTO service_messages
     (tenant_id, order_id, from_staff_id, from_name, from_role, to_staff_id, to_role, message, message_type, priority)
     VALUES ($1, $2, $3, 'System', 'system', $4, $5, $6, 'ORDER_UPDATE', $7)`,
    [tenantId, orderId, 'system', toStaffId ?? null, staffRole, message, priority]
  );

  emitToTenant(tenantId, "coordination:alert", {
    ruleId,
    orderId,
    message,
    priority,
  });
}

function buildAlertKey(orderId: string, ruleId: number): string {
  return `${orderId}:${ruleId}`;
}

async function checkOrderAgeRule(
  order: any,
  rule: any,
  tenantId: string
): Promise<void> {
  const cond = rule.condition_json;
  const threshold = cond.threshold_minutes ?? 20;
  const requiredStatus = cond.status ?? "in_preparation";

  if (requiredStatus !== "any" && order.status !== requiredStatus) return;
  if ((parseFloat(order.age_minutes) ?? 0) < threshold) return;

  const key = buildAlertKey(order.id, rule.id);
  if (alertFired(key)) return;
  markAlertFired(key);

  const msg = rule.message_template
    .replace("{{orderId}}", order.id)
    .replace("{{orderNumber}}", order.order_number || order.id.slice(0, 8))
    .replace("{{minutes}}", Math.round(parseFloat(order.age_minutes) ?? 0).toString())
    .replace("{{status}}", order.status);

  await createAlert(tenantId, order.id, rule.id, msg, rule.action, "high");
}

async function checkItemReadyUnservedRule(
  order: any,
  rule: any,
  tenantId: string
): Promise<void> {
  if (order.status === "served") return;

  const cond = rule.condition_json;
  const threshold = cond.threshold_minutes ?? 5;

  // Check per-item ready_at: find any item that is ready but not served
  const { rows: readyItems } = await pool.query(
    `SELECT id, ready_at, served_at
     FROM order_items
     WHERE order_id = $1
       AND status = 'ready'
       AND served_at IS NULL
       AND ready_at IS NOT NULL
       AND EXTRACT(EPOCH FROM (NOW() - ready_at)) / 60 >= $2`,
    [order.id, threshold]
  );

  if (readyItems.length === 0) return;

  const key = buildAlertKey(order.id, rule.id);
  if (alertFired(key)) return;
  markAlertFired(key);

  const longestReadyMin = Math.round(
    Math.max(
      ...readyItems.map((item: any) =>
        (Date.now() - new Date(item.ready_at).getTime()) / 60000
      )
    )
  );

  const msg = rule.message_template
    .replace("{{orderId}}", order.id)
    .replace("{{orderNumber}}", order.order_number || order.id.slice(0, 8))
    .replace("{{minutes}}", longestReadyMin.toString());

  // Target the assigned waiter directly if available, in addition to role-based routing
  await createAlert(tenantId, order.id, rule.id, msg, rule.action, "normal", order.waiter_id ?? null);
}

async function checkVipDelayedRule(
  order: any,
  rule: any,
  tenantId: string
): Promise<void> {
  const cond = rule.condition_json;
  const threshold = cond.threshold_minutes ?? 5;

  if ((parseFloat(order.age_minutes) ?? 0) < threshold) return;
  if (!order.vip_notes && (order.priority ?? 0) < 4) return;

  const key = buildAlertKey(order.id, rule.id);
  if (alertFired(key)) return;
  markAlertFired(key);

  const msg = rule.message_template
    .replace("{{orderId}}", order.id)
    .replace("{{orderNumber}}", order.order_number || order.id.slice(0, 8))
    .replace("{{minutes}}", Math.round(parseFloat(order.age_minutes) ?? 0).toString());

  await createAlert(tenantId, order.id, rule.id, msg, rule.action, "urgent");
}

async function checkOrderStatusStuckRule(
  order: any,
  rule: any,
  tenantId: string
): Promise<void> {
  const cond = rule.condition_json;
  const threshold = cond.threshold_minutes ?? 30;
  const stuckStatus = cond.status ?? "served";

  if (order.status !== stuckStatus) return;
  // Use status_age_minutes (time since entering this status) not overall order age
  const statusAge = parseFloat(order.status_age_minutes) || parseFloat(order.age_minutes) || 0;
  if (statusAge < threshold) return;

  const key = buildAlertKey(order.id, rule.id);
  if (alertFired(key)) return;
  markAlertFired(key);

  const msg = rule.message_template
    .replace("{{orderId}}", order.id)
    .replace("{{orderNumber}}", order.order_number || order.id.slice(0, 8))
    .replace("{{status}}", order.status)
    .replace("{{minutes}}", Math.round(statusAge).toString());

  await pool.query(
    `INSERT INTO service_messages
     (tenant_id, order_id, from_staff_id, from_name, from_role, to_role, message, message_type, priority)
     VALUES ($1, $2, $3, 'System', 'system', $4, $5, 'ORDER_UPDATE', $6)`,
    [tenantId, order.id, 'system', 'manager', msg, "normal"]
  );

  emitToTenant(tenantId, "coordination:prompt", {
    ruleId: rule.id,
    orderId: order.id,
    message: msg,
    priority: "normal",
  });
}

async function checkActiveKitchenTicketsRule(
  orders: any[],
  rule: any,
  tenantId: string
): Promise<void> {
  const cond = rule.condition_json;
  const threshold = cond.threshold ?? 15;

  // Count active order_item tickets in the kitchen (not just orders)
  // to accurately reflect kitchen workload
  const kitchenOrderIds = orders
    .filter((o: any) => o.status === "in_progress" || o.status === "sent_to_kitchen")
    .map((o: any) => o.id);

  if (kitchenOrderIds.length === 0) return;

  const placeholders = kitchenOrderIds.map((_: any, i: number) => `$${i + 1}`).join(",");
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS ticket_count FROM order_items
     WHERE order_id IN (${placeholders})
       AND status IN ('pending', 'in_preparation', 'sent_to_kitchen')`,
    kitchenOrderIds
  );
  const ticketCount = parseInt(rows[0]?.ticket_count || "0");

  if (ticketCount < threshold) return;

  const key = `overload:${rule.id}`;
  if (alertFired(key)) return;
  markAlertFired(key);

  const msg = rule.message_template
    .replace("{{count}}", ticketCount.toString())
    .replace("{{threshold}}", threshold.toString());

  await pool.query(
    `INSERT INTO service_messages
     (tenant_id, from_staff_id, from_name, from_role, to_role, message, message_type, priority)
     VALUES ($1, $2, 'System', 'system', 'manager', $3, 'KITCHEN_NOTE', 'urgent')`,
    [tenantId, 'system', msg]
  );

  emitToTenant(tenantId, "coordination:overload", {
    ruleId: rule.id,
    message: msg,
    count: ticketCount,
  });
}

async function checkDeliveryTimeAtRiskRule(
  order: any,
  rule: any,
  tenantId: string
): Promise<void> {
  if (order.order_type !== "delivery") return;
  if (!order.promised_time) return;

  const cond = rule.condition_json;
  const threshold = cond.threshold_minutes ?? 10;

  const minutesUntilPromised =
    (new Date(order.promised_time).getTime() - Date.now()) / 60000;

  if (minutesUntilPromised > threshold || minutesUntilPromised < 0) return;
  if (order.status === "served" || order.status === "paid") return;

  const key = buildAlertKey(order.id, rule.id);
  if (alertFired(key)) return;
  markAlertFired(key);

  const msg = rule.message_template
    .replace("{{orderId}}", order.id)
    .replace("{{orderNumber}}", order.order_number || order.id.slice(0, 8))
    .replace("{{minutes}}", Math.round(minutesUntilPromised).toString());

  await createAlert(tenantId, order.id, rule.id, msg, rule.action, "high");
  alertEngine.trigger('ALERT-11', { tenantId, outletId: order.outlet_id ?? undefined, referenceId: order.id, referenceNumber: order.order_number ?? undefined, message: `Delivery at risk: Order #${order.order_number || order.id.slice(-6)}` }).catch(() => {});
}

async function runRulesForTenant(tenantId: string): Promise<void> {
  const [orders, rules] = await Promise.all([
    getActiveOrders(tenantId),
    getActiveRules(tenantId),
  ]);

  for (const rule of rules) {
    try {
      const cond = typeof rule.condition_json === "string"
        ? JSON.parse(rule.condition_json)
        : rule.condition_json;
      rule.condition_json = cond;

      if (rule.trigger_event === "active_kitchen_tickets_exceed") {
        await checkActiveKitchenTicketsRule(orders, rule, tenantId);
        continue;
      }

      for (const order of orders) {
        switch (rule.trigger_event) {
          case "order_age_exceeds":
            await checkOrderAgeRule(order, rule, tenantId);
            break;
          case "item_ready_unserved":
            await checkItemReadyUnservedRule(order, rule, tenantId);
            break;
          case "vip_order_delayed":
            await checkVipDelayedRule(order, rule, tenantId);
            break;
          case "order_status_stuck":
            await checkOrderStatusStuckRule(order, rule, tenantId);
            break;
          case "delivery_time_at_risk":
            await checkDeliveryTimeAtRiskRule(order, rule, tenantId);
            break;
        }
      }
    } catch (err: any) {
      console.error(`[CoordRules] Rule ${rule.id} error:`, err.message);
    }
  }
}

let checkerInterval: ReturnType<typeof setInterval> | null = null;

export function startCoordinationRulesChecker(): void {
  if (checkerInterval) return;

  checkerInterval = setInterval(() => {
    withJobLock(JOB_LOCK.COORDINATION_RULES, async () => {
      const tenantIds = await getActiveTenantIds();
      for (const tenantId of tenantIds) {
        await runRulesForTenant(tenantId);
      }
    }).catch(err => console.error("[CoordRules] Checker error:", err));
  }, 60 * 1000);

  console.log("[CoordRules] Coordination rules checker started (60s interval)");
}
