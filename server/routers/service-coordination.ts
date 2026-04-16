import type { Express } from "express";
import { requireAuth, requireRole } from "../auth";
import { snapshotPrepTime } from "../lib/snapshot-prep-time";
import { emitToTenant } from "../realtime";
import { storage } from "../storage";
import { db } from "../db";
import { pool } from "../db";
import { orders, deliveryOrders } from "@shared/schema";
import { eq } from "drizzle-orm";
import { recordKdsEvent } from "../services/time-logger";

export function registerServiceCoordinationRoutes(app: Express): void {

  // ── Live Orders ────────────────────────────────────────────────────────────
  app.get("/api/coordination/orders/live", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;

      const { rows: orders } = await pool.query(
        `SELECT
           o.*,
           t.number AS table_number,
           u.name AS waiter_user_name,
           v.id AS vip_flag_id,
           v.vip_level,
           v.special_notes AS vip_special_notes
         FROM orders o
         LEFT JOIN tables t ON t.id = o.table_id
         LEFT JOIN users u ON u.id = o.waiter_id
         LEFT JOIN vip_order_flags v ON v.order_id = o.id
         WHERE o.tenant_id = $1
           AND o.status NOT IN ('paid', 'cancelled', 'voided', 'completed')
         ORDER BY o.priority DESC NULLS LAST, o.created_at ASC`,
        [tenantId]
      );

      const orderIds = orders.map((o: any) => o.id);
      let items: any[] = [];
      if (orderIds.length > 0) {
        const placeholders = orderIds.map((_: any, i: number) => `$${i + 1}`).join(",");
        const { rows } = await pool.query(
          `SELECT * FROM order_items WHERE order_id IN (${placeholders})`,
          orderIds
        );
        items = rows;
      }

      const itemsByOrder: Record<string, any[]> = {};
      for (const item of items) {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
        itemsByOrder[item.order_id].push(item);
      }

      const result = orders.map((o: any) => ({
        ...o,
        items: itemsByOrder[o.id] || [],
        isVip: !!o.vip_flag_id,
      }));

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Update Order Status ────────────────────────────────────────────────────
  app.patch("/api/orders/:id/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const rawStatus = req.body.status as string;
      if (!rawStatus) return res.status(400).json({ message: "status is required" });
      const status = rawStatus === "in_preparation" ? "in_progress" : rawStatus;

      const now = new Date();
      const setClauses = ["status = $1"];
      const values: any[] = [status];

      if (status === "confirmed") {
        setClauses.push(`confirmed_at = COALESCE(confirmed_at, $${values.length + 1})`);
        values.push(now);
      }
      if (status === "in_progress" || status === "sent_to_kitchen") {
        setClauses.push(`kitchen_sent_at = COALESCE(kitchen_sent_at, $${values.length + 1})`);
        values.push(now);
      }
      if (status === "ready") {
        setClauses.push(`actual_ready_time = $${values.length + 1}`);
        values.push(now);
        setClauses.push(`fully_ready_at = $${values.length + 1}`);
        values.push(now);
      }
      if (status === "served") {
        setClauses.push(`served_at = $${values.length + 1}`);
        values.push(now);
      }
      if (status === "paid") {
        setClauses.push(`paid_at = $${values.length + 1}`);
        values.push(now);
        setClauses.push(`payment_status = $${values.length + 1}`);
        values.push("paid");
      }

      values.push(req.params.id, user.tenantId);
      const { rows } = await pool.query(
        `UPDATE orders SET ${setClauses.join(", ")} WHERE id = $${values.length - 1} AND tenant_id = $${values.length} RETURNING *`,
        values
      );

      if (!rows[0]) return res.status(404).json({ message: "Order not found" });

      // PR-012: schedule table_qr_sessions expiry 30 minutes after payment (grace period for staff)
      // A background cleanup process should deactivate sessions where expires_at < NOW();
      // here we stamp the expiry time so the session naturally ages out.
      if (status === "paid" && rows[0].table_id) {
        try {
          await pool.query(
            `UPDATE table_qr_sessions
             SET expires_at = NOW() + INTERVAL '30 minutes'
             WHERE table_id = $1 AND is_active = true
               AND ($2 = ANY(order_ids) OR order_ids = '{}' OR order_ids IS NULL)`,
            [rows[0].table_id, rows[0].id]
          );
        } catch {}
      }

      emitToTenant(user.tenantId, "coordination:order_updated", {
        orderId: rows[0].id,
        status,
        source: rows[0].order_source,
      });

      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Update Order Priority ──────────────────────────────────────────────────
  app.patch("/api/orders/:id/priority", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { priority } = req.body;
      if (priority === undefined) return res.status(400).json({ message: "priority is required" });

      const numericPriority = typeof priority === "number" ? priority
        : priority === "urgent" ? 5
        : priority === "vip" ? 4
        : priority === "high" ? 3
        : priority === "normal" ? 2
        : 1;

      const { rows } = await pool.query(
        `UPDATE orders SET priority = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *`,
        [numericPriority, req.params.id, user.tenantId]
      );

      if (!rows[0]) return res.status(404).json({ message: "Order not found" });

      if (priority === "vip" || numericPriority >= 4) {
        await pool.query(
          `INSERT INTO vip_order_flags (tenant_id, order_id, vip_level, flagged_by)
           VALUES ($1, $2, 'VIP', $3)
           ON CONFLICT (order_id) DO NOTHING`,
          [user.tenantId, req.params.id, user.id]
        );
        emitToTenant(user.tenantId, "coordination:vip_flagged", {
          orderId: rows[0].id,
          orderNumber: rows[0].order_number,
          vipLevel: "VIP",
          notes: null,
        });
      }

      emitToTenant(user.tenantId, "coordination:order_updated", {
        orderId: rows[0].id,
        status: rows[0].status,
        source: rows[0].order_source,
      });

      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Flag Order as VIP ──────────────────────────────────────────────────────
  app.post("/api/orders/:id/vip", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { vipLevel = "VIP", specialNotes, specialSetup, managerNotified = false } = req.body;

      const { rows: orderCheck } = await pool.query(
        `SELECT id, order_number FROM orders WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (!orderCheck[0]) return res.status(404).json({ message: "Order not found" });

      const { rows } = await pool.query(
        `INSERT INTO vip_order_flags (tenant_id, order_id, vip_level, special_notes, special_setup, manager_notified, flagged_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (order_id) DO UPDATE SET
           vip_level = EXCLUDED.vip_level,
           special_notes = EXCLUDED.special_notes,
           special_setup = EXCLUDED.special_setup,
           manager_notified = EXCLUDED.manager_notified
         RETURNING *`,
        [user.tenantId, req.params.id, vipLevel, specialNotes || null, specialSetup || null, managerNotified, user.id]
      );

      await pool.query(
        `UPDATE orders SET vip_notes = $1, priority = GREATEST(COALESCE(priority, 0), 4) WHERE id = $2 AND tenant_id = $3`,
        [specialNotes || null, req.params.id, user.tenantId]
      );

      emitToTenant(user.tenantId, "coordination:vip_flagged", {
        orderId: req.params.id,
        orderNumber: orderCheck[0].order_number,
        vipLevel,
        notes: specialNotes || null,
      });

      res.status(201).json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Update Order Item Status ───────────────────────────────────────────────
  app.patch("/api/orders/:id/items/:itemId/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { status } = req.body;
      if (!status) return res.status(400).json({ message: "status is required" });

      const now = new Date();
      const setClauses = ["status = $1"];
      const values: any[] = [status];

      if (status === "in_preparation" || status === "sent_to_kitchen") {
        setClauses.push(`preparation_started_at = COALESCE(preparation_started_at, $${values.length + 1})`);
        values.push(now);
      }
      if (status === "ready") {
        setClauses.push(`ready_at = $${values.length + 1}`);
        values.push(now);
      }
      if (status === "served") {
        setClauses.push(`served_at = $${values.length + 1}`);
        values.push(now);
      }

      const { rows: orderCheck } = await pool.query(
        `SELECT id FROM orders WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (!orderCheck[0]) return res.status(404).json({ message: "Order not found" });

      if (status === "in_preparation") {
        const { rows: allergyCheck } = await pool.query(
          `SELECT id FROM order_item_modifications
           WHERE order_item_id = $1 AND tenant_id = $2 AND has_allergy = true AND chef_acknowledged = false`,
          [req.params.itemId, user.tenantId]
        );
        if (allergyCheck.length > 0) {
          return res.status(409).json({
            message: "Allergy alert: chef must acknowledge the modification before preparation can begin.",
            code: "ALLERGY_NOT_ACKNOWLEDGED",
          });
        }
      }

      values.push(req.params.itemId, req.params.id);
      const { rows } = await pool.query(
        `UPDATE order_items SET ${setClauses.join(", ")} WHERE id = $${values.length - 1} AND order_id = $${values.length} RETURNING *`,
        values
      );

      if (!rows[0]) return res.status(404).json({ message: "Order item not found" });

      if (status === "ready") {
        const { rows: orderRows } = await pool.query(
          `SELECT o.id, o.table_id, t.number AS table_number, o.waiter_name, o.waiter_id, u.name AS waiter_user_name
           FROM orders o
           LEFT JOIN tables t ON t.id = o.table_id
           LEFT JOIN users u ON u.id = o.waiter_id
           WHERE o.id = $1 AND o.tenant_id = $2`,
          [req.params.id, user.tenantId]
        );
        if (orderRows[0]) {
          const order = orderRows[0];
          await pool.query(
            `UPDATE orders SET first_item_ready_at = COALESCE(first_item_ready_at, $1) WHERE id = $2`,
            [now, req.params.id]
          );
          emitToTenant(user.tenantId, "coordination:item_ready", {
            orderId: req.params.id,
            itemId: req.params.itemId,
            tableNumber: order.table_number,
            waiterName: order.waiter_name || order.waiter_user_name,
          });
        }
        recordKdsEvent("item_ready", {
          tenantId: user.tenantId,
          orderId: req.params.id,
          orderItemId: req.params.itemId,
          userId: user.id,
          userName: (user as any).name || (user as any).username || "Staff",
          timestamp: now,
        }).catch(() => {});
      }

      if (status === "served") {
        recordKdsEvent("item_served", {
          tenantId: user.tenantId,
          orderId: req.params.id,
          orderItemId: req.params.itemId,
          userId: user.id,
          userName: (user as any).name || (user as any).username || "Staff",
          timestamp: now,
        }).catch(() => {});
      }

      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Service Messages ───────────────────────────────────────────────────────
  app.post("/api/service-messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const {
        orderId,
        outletId,
        toStaffId,
        toRole,
        message,
        messageType = "GENERAL",
        priority = "normal",
      } = req.body;

      if (!message) return res.status(400).json({ message: "message is required" });

      const { rows } = await pool.query(
        `INSERT INTO service_messages
         (tenant_id, outlet_id, order_id, from_staff_id, from_name, from_role, to_staff_id, to_role, message, message_type, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          user.tenantId,
          outletId || null,
          orderId || null,
          user.id,
          user.name || user.username,
          user.role,
          toStaffId || null,
          toRole || null,
          message,
          messageType,
          priority,
        ]
      );

      emitToTenant(user.tenantId, "coordination:message", {
        messageId: rows[0].id,
        fromName: user.name || user.username,
        fromRole: user.role,
        toRole: toRole || null,
        message,
        priority,
      });

      res.status(201).json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/service-messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

      const { rows } = await pool.query(
        `SELECT * FROM service_messages
         WHERE tenant_id = $1
           AND (to_staff_id = $2 OR to_role = $3 OR (to_staff_id IS NULL AND to_role IS NULL))
         ORDER BY created_at DESC
         LIMIT $4`,
        [user.tenantId, user.id, user.role, limit]
      );

      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/service-messages/:id/read", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `UPDATE service_messages SET is_read = true, read_at = NOW()
         WHERE id = $1
           AND tenant_id = $2
           AND (
             to_staff_id = $3
             OR to_role = $4
             OR (to_staff_id IS NULL AND to_role IS NULL)
           )
         RETURNING *`,
        [req.params.id, user.tenantId, user.id, user.role]
      );
      if (!rows[0]) return res.status(404).json({ message: "Message not found or not addressed to you" });
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/service-messages/read-all", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      await pool.query(
        `UPDATE service_messages SET is_read = true, read_at = NOW()
         WHERE tenant_id = $1
           AND (
             to_staff_id = $2
             OR to_role = $3
             OR (to_staff_id IS NULL AND to_role IS NULL)
           )
           AND is_read = false`,
        [user.tenantId, user.id, user.role]
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Live KPIs ──────────────────────────────────────────────────────────────
  app.get("/api/coordination/metrics/live", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;

      const [waitRes, kitchenRes, revenueRes, turnoverRes, deliveryRes] = await Promise.all([
        pool.query(
          `SELECT
             AVG(EXTRACT(EPOCH FROM (COALESCE(served_at, NOW()) - created_at)) / 60)::int AS avg_wait_min,
             COUNT(*) FILTER (WHERE served_at IS NOT NULL AND EXTRACT(EPOCH FROM (served_at - created_at)) / 60 <= 30) AS on_time_count,
             COUNT(*) FILTER (WHERE served_at IS NOT NULL) AS served_count
           FROM orders
           WHERE tenant_id = $1
             AND created_at >= NOW() - INTERVAL '24 hours'`,
          [tenantId]
        ),
        pool.query(
          `SELECT COUNT(*) AS active_tickets FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.tenant_id = $1
             AND oi.status IN ('pending', 'in_preparation', 'sent_to_kitchen')
             AND o.status NOT IN ('paid', 'cancelled', 'voided', 'completed')`,
          [tenantId]
        ),
        pool.query(
          `SELECT COALESCE(SUM(total::numeric), 0) AS revenue
           FROM orders
           WHERE tenant_id = $1 AND status = 'paid' AND paid_at >= NOW() - INTERVAL '1 hour'`,
          [tenantId]
        ),
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status IN ('paid', 'completed') AND created_at >= NOW() - INTERVAL '24 hours') AS completed_today,
             COUNT(*) FILTER (WHERE status NOT IN ('paid', 'cancelled', 'voided', 'completed')) AS active_tables
           FROM orders
           WHERE tenant_id = $1 AND order_type = 'dine_in'`,
          [tenantId]
        ),
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE served_at IS NOT NULL AND promised_time IS NOT NULL AND served_at <= promised_time) AS on_time_delivery,
             COUNT(*) FILTER (WHERE served_at IS NOT NULL AND promised_time IS NOT NULL) AS total_with_promise
           FROM orders
           WHERE tenant_id = $1
             AND order_type = 'delivery'
             AND created_at >= NOW() - INTERVAL '24 hours'`,
          [tenantId]
        ),
      ]);

      const waitRow = waitRes.rows[0];
      const servedCount = parseInt(waitRow.served_count || "0");
      const onTimeCount = parseInt(waitRow.on_time_count || "0");

      const turnoverRow = turnoverRes.rows[0];
      const completedToday = parseInt(turnoverRow.completed_today || "0");
      const activeTables = parseInt(turnoverRow.active_tables || "0");
      const tableTurnover = activeTables > 0 ? parseFloat((completedToday / activeTables).toFixed(2)) : 0;

      const deliveryRow = deliveryRes.rows[0];
      const onTimeDelivery = parseInt(deliveryRow.on_time_delivery || "0");
      const totalWithPromise = parseInt(deliveryRow.total_with_promise || "0");
      const deliveryOnTimePct = totalWithPromise > 0 ? Math.round((onTimeDelivery / totalWithPromise) * 100) : 100;

      res.json({
        avg_wait_min: parseInt(waitRow.avg_wait_min || "0"),
        on_time_pct: servedCount > 0 ? Math.round((onTimeCount / servedCount) * 100) : 100,
        kitchen_throughput: parseInt(kitchenRes.rows[0]?.active_tickets || "0"),
        revenue_this_hour: parseFloat(revenueRes.rows[0]?.revenue || "0"),
        table_turnover: tableTurnover,
        delivery_on_time_pct: deliveryOnTimePct,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Coordination Rules ─────────────────────────────────────────────────────
  app.get("/api/coordination/rules", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT * FROM coordination_rules WHERE tenant_id = $1 ORDER BY id ASC`,
        [user.tenantId]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/coordination/rules", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { ruleName, triggerEvent, conditionJson, action, messageTemplate, isActive = true } = req.body;

      if (!ruleName || !triggerEvent || !conditionJson || !action || !messageTemplate) {
        return res.status(400).json({ message: "ruleName, triggerEvent, conditionJson, action, and messageTemplate are required" });
      }

      const { rows } = await pool.query(
        `INSERT INTO coordination_rules (tenant_id, rule_name, trigger_event, condition_json, action, message_template, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          user.tenantId,
          ruleName,
          triggerEvent,
          typeof conditionJson === "string" ? conditionJson : JSON.stringify(conditionJson),
          action,
          messageTemplate,
          isActive,
        ]
      );

      res.status(201).json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/coordination/rules/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { isActive, ruleName, messageTemplate, conditionJson, action } = req.body;

      const sets: string[] = [];
      const values: any[] = [];

      if (isActive !== undefined) { sets.push(`is_active = $${values.length + 1}`); values.push(isActive); }
      if (ruleName !== undefined) { sets.push(`rule_name = $${values.length + 1}`); values.push(ruleName); }
      if (messageTemplate !== undefined) { sets.push(`message_template = $${values.length + 1}`); values.push(messageTemplate); }
      if (conditionJson !== undefined) { sets.push(`condition_json = $${values.length + 1}`); values.push(typeof conditionJson === "string" ? conditionJson : JSON.stringify(conditionJson)); }
      if (action !== undefined) { sets.push(`action = $${values.length + 1}`); values.push(action); }

      if (sets.length === 0) return res.status(400).json({ message: "No fields to update" });

      values.push(req.params.id, user.tenantId);
      const { rows } = await pool.query(
        `UPDATE coordination_rules SET ${sets.join(", ")} WHERE id = $${values.length - 1} AND tenant_id = $${values.length} RETURNING *`,
        values
      );

      if (!rows[0]) return res.status(404).json({ message: "Rule not found" });
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Delivery Agent Management (Task #96) ───────────────────────────────────
  app.patch("/api/delivery-orders/:id/assign-agent", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { agentId, agentName, agentPhone } = req.body;

      const delivery = await storage.getDeliveryOrderByTenant(req.params.id, user.tenantId);
      if (!delivery) return res.status(404).json({ message: "Delivery order not found" });

      const updated = await storage.updateDeliveryOrderByTenant(req.params.id, user.tenantId, {
        driverName: agentName || agentId,
        driverPhone: agentPhone || null,
        status: "assigned",
      });

      emitToTenant(user.tenantId, "coordination:order_updated", {
        orderId: delivery.orderId,
        deliveryOrderId: req.params.id,
        status: "assigned",
        agentName: agentName || agentId,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/delivery-agents", requireAuth, async (req, res) => {
    const agents = [
      { id: "agent-1", name: "Rahul Kumar", phone: "+91 98765 43210", status: "available", currentAssignment: null },
      { id: "agent-2", name: "Suresh Singh", phone: "+91 98765 43211", status: "busy", currentAssignment: "ORD-ABC123" },
      { id: "agent-3", name: "Amit Sharma", phone: "+91 98765 43212", status: "available", currentAssignment: null },
      { id: "agent-4", name: "Priya Patel", phone: "+91 98765 43213", status: "offline", currentAssignment: null },
    ];
    res.json(agents);
  });

  // ── Phone Orders (Task #96) ────────────────────────────────────────────────
  app.post("/api/phone-orders", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const {
        customerPhone,
        customerId,
        customerName,
        orderType,
        deliveryAddress,
        scheduledTime,
        tableId,
        notes,
        allergies,
        items,
        subtotal,
        tax,
        total,
        isAdvance,
        outletId,
      } = req.body;

      const orderNotes = [
        isAdvance ? "[ADVANCE]" : null,
        allergies ? `Allergies: ${allergies}` : null,
        notes || null,
      ]
        .filter(Boolean)
        .join(" | ");

      const mappedOrderType =
        orderType === "delivery" ? "delivery" :
        orderType === "takeaway" ? "takeaway" : "dine_in";

      const order = await storage.createOrder({
        tenantId: user.tenantId,
        outletId: outletId || null,
        customerId: customerId || null,
        tableId: tableId || null,
        waiterId: user.id,
        orderType: mappedOrderType as "delivery" | "takeaway" | "dine_in",
        status: isAdvance ? "on_hold" : "new",
        subtotal: String(subtotal || 0),
        tax: String(tax || 0),
        total: String(total || 0),
        notes: orderNotes || null,
        channel: "PHONE",
        estimatedReadyAt: scheduledTime ? new Date(scheduledTime) : null,
      });

      if (items && items.length > 0) {
        for (const item of items) {
          const itemPrepMinutes = await snapshotPrepTime(item.menuItemId || null);
          await storage.createOrderItem({
            orderId: order.id,
            menuItemId: item.menuItemId || null,
            name: item.name,
            quantity: item.quantity || 1,
            price: String(item.price || 0),
            itemPrepMinutes,
          });
        }
      }

      if (orderType === "delivery" && deliveryAddress) {
        await storage.createDeliveryOrder({
          tenantId: user.tenantId,
          orderId: order.id,
          customerId: customerId || null,
          customerAddress: deliveryAddress,
          customerPhone: customerPhone || null,
          status: "pending",
          estimatedTime: 45,
          trackingNotes: customerName ? `customerName:${customerName}` : null,
        });
      }

      emitToTenant(user.tenantId, "coordination:order_updated", {
        orderId: order.id,
        status: order.status,
        orderType: mappedOrderType,
        source: "PHONE",
      });

      if (!isAdvance) {
        emitToTenant(user.tenantId, "kitchen:new_order", {
          orderId: order.id,
          orderType: mappedOrderType,
          notes: orderNotes,
        });
      }

      res.json({ ...order, orderNumber: order.id.slice(-6).toUpperCase() });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Online Delivery Platform Webhooks (Task #96) ───────────────────────────
  app.post("/api/webhooks/zomato", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const expectedToken = process.env.ZOMATO_WEBHOOK_TOKEN || "zomato-webhook-token";
      if (authHeader !== `Bearer ${expectedToken}`) {
        console.warn("[Webhook/Zomato] Unauthorized attempt");
        return res.status(401).json({ error: "Unauthorized" });
      }
      const payload = req.body;
      console.log("[Webhook/Zomato] Received payload (keys:", Object.keys(payload).join(", ") + ")");
      res.json({ received: true, orderId: null, message: "Zomato webhook stub — payload logged" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/webhooks/swiggy", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const expectedToken = process.env.SWIGGY_WEBHOOK_TOKEN || "swiggy-webhook-token";
      if (authHeader !== `Bearer ${expectedToken}`) {
        console.warn("[Webhook/Swiggy] Unauthorized attempt");
        return res.status(401).json({ error: "Unauthorized" });
      }
      const payload = req.body;
      console.log("[Webhook/Swiggy] Received payload (keys:", Object.keys(payload).join(", ") + ")");
      res.json({ received: true, orderId: null, message: "Swiggy webhook stub — payload logged" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/webhooks/ubereats", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const expectedToken = process.env.UBEREATS_WEBHOOK_TOKEN || "ubereats-webhook-token";
      if (authHeader !== `Bearer ${expectedToken}`) {
        console.warn("[Webhook/UberEats] Unauthorized attempt");
        return res.status(401).json({ error: "Unauthorized" });
      }
      const payload = req.body;
      console.log("[Webhook/UberEats] Received payload (keys:", Object.keys(payload).join(", ") + ")");
      res.json({ received: true, orderId: null, message: "UberEats webhook stub — payload logged" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
