import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { pool } from "../db";
import { auditLogFromReq } from "../audit";
import { emitToTenant } from "../realtime";
import { routeAndPrint } from "../services/printer-service";
import { recordKdsEvent } from "../services/time-logger";
import { z } from "zod";
import type { PoolClient } from "pg";
import { alertEngine } from "../services/alert-engine";

type AuthUser = {
  id: string;
  tenantId: string;
  name: string;
  role: string;
  outletId?: string;
};

function getUser(req: Request): AuthUser {
  return req.user as AuthUser;
}

const VOID_REQUEST_ROLES = ["waiter", "cashier", "manager", "outlet_manager", "supervisor", "owner", "super_admin", "hq_admin"];
const VOID_APPROVE_ROLES = ["manager", "outlet_manager", "supervisor", "owner", "super_admin", "hq_admin"];
const REFIRE_ROLES = ["waiter", "manager", "outlet_manager", "supervisor", "owner", "super_admin", "hq_admin"];
const KOT_REPRINT_ROLES = ["kitchen", "waiter", "manager", "outlet_manager", "supervisor", "owner", "super_admin", "hq_admin"];

function generateKotNumber(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `REFIRE-${datePart}-${rand}`;
}

function roleDateLimitDays(role: string): number | null {
  if (role === "waiter" || role === "cashier") return 7;
  if (role === "kitchen") return 1;
  if (["manager", "outlet_manager", "supervisor", "accountant", "auditor"].includes(role)) return 90;
  return null;
}

/** Write an audit event inside an active pool transaction client — hard-fails so transaction rolls back on audit failure */
async function auditInTx(
  client: PoolClient,
  tenantId: string,
  userId: string,
  userName: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (tenant_id, user_id, user_name, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, userId, userName, action, entityType, entityId, JSON.stringify(metadata)]
  );
}

/** Check kitchen station access for a given order */
async function kitchenCanAccessOrder(user: AuthUser, orderId: string): Promise<boolean> {
  // Check if the order is from today first
  const orderRes = await pool.query(`SELECT created_at FROM orders WHERE id = $1 AND tenant_id = $2`, [orderId, user.tenantId]);
  if (!orderRes.rows[0]) return false;
  const orderDate = new Date(orderRes.rows[0].created_at);
  const today = new Date();
  if (orderDate.toDateString() !== today.toDateString()) return false;

  // Outlet scope: kitchen users must belong to the order's outlet
  if (user.outletId) {
    const outletCheck = await pool.query(`SELECT outlet_id FROM orders WHERE id = $1`, [orderId]);
    if (outletCheck.rows[0]?.outlet_id && outletCheck.rows[0].outlet_id !== user.outletId) return false;
  }

  // Station scope: kitchen user can see order if any item in the order belongs to their assigned stations
  const rosterRes = await pool.query(
    `SELECT cr.counter_id, kc.name AS counter_name
     FROM chef_roster cr
     JOIN kitchen_counters kc ON kc.id = cr.counter_id
     WHERE cr.tenant_id = $1 AND cr.chef_id = $2 AND cr.shift_date = CURRENT_DATE`,
    [user.tenantId, user.id]
  );
  if (rosterRes.rows.length === 0) {
    // No roster assignment today — allow access within outlet for kitchen users
    return true;
  }
  const stationNames = rosterRes.rows.map((r: { counter_name: string }) => r.counter_name);
  const stationPlaceholders = stationNames.map((_: string, i: number) => `$${i + 2}`).join(", ");
  const stationCheck = await pool.query(
    `SELECT 1 FROM order_items WHERE order_id = $1 AND station IN (${stationPlaceholders}) LIMIT 1`,
    [orderId, ...stationNames]
  );
  return stationCheck.rows.length > 0;
}

/**
 * Centralized access check for ticket-level operations.
 * Enforces: own-order scoping for waiter/cashier, date-window limits for all roles, station scoping for kitchen.
 */
async function canAccessOrder(user: AuthUser, orderId: string, orderRow: Record<string, unknown>): Promise<boolean> {
  // Waiter: own orders only (no date override — date window is handled below)
  if (user.role === "waiter" && orderRow.waiter_id !== user.id) return false;

  // Cashier: all orders in window, no own-order restriction
  // Kitchen: station-scoped (includes today-only + outlet checks)
  if (user.role === "kitchen") {
    return kitchenCanAccessOrder(user, orderId);
  }

  // Date-window enforcement for waiter and cashier
  const dayLimit = roleDateLimitDays(user.role);
  if (dayLimit !== null && user.role !== "kitchen") {
    const orderDate = new Date(orderRow.created_at as string);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dayLimit);
    if (orderDate < cutoff) return false;
  }

  // manager/outlet_manager/supervisor/owner/admin: no restrictions beyond tenant
  return true;
}

export function registerTicketHistoryRoutes(app: Express) {
  // ── GET /api/tickets/void-requests/pending — BEFORE /:orderId wildcard ────────
  app.get("/api/tickets/void-requests/pending", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      if (!VOID_APPROVE_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const result = await pool.query(
        `SELECT vr.*, o.status AS order_status, o.total AS order_total, t.number AS table_number
         FROM item_void_requests vr
         LEFT JOIN orders o ON o.id = vr.order_id
         LEFT JOIN tables t ON t.id = o.table_id
         WHERE vr.tenant_id = $1 AND vr.status = 'pending'
         ORDER BY vr.created_at DESC`,
        [user.tenantId]
      );
      return res.json(result.rows);
    } catch (err) {
      console.error("[ticket-history] pending void-requests error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── GET /api/tickets/void-requests/pending-count ─────────────────────────────
  app.get("/api/tickets/void-requests/pending-count", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      if (!VOID_APPROVE_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const result = await pool.query(
        `SELECT COUNT(*)::int AS count FROM item_void_requests WHERE tenant_id = $1 AND status = 'pending'`,
        [user.tenantId]
      );
      return res.json({ count: result.rows[0]?.count ?? 0 });
    } catch (err) {
      console.error("[ticket-history] pending void-requests count error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── GET /api/tickets/history ──────────────────────────────────────────────────
  app.get("/api/tickets/history", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const {
        q,
        date,
        dateFrom,
        dateTo,
        status,
        orderType,
        staffId,
        outletId,
        limit: limitRaw = "50",
        offset: offsetRaw = "0",
      } = req.query as Record<string, string>;

      const limit = Math.min(parseInt(limitRaw) || 50, 200);
      const offset = parseInt(offsetRaw) || 0;

      const conditions: string[] = ["o.tenant_id = $1"];
      const params: unknown[] = [user.tenantId];
      let paramIdx = 2;

      const dayLimit = roleDateLimitDays(user.role);

      if (user.role === "waiter") {
        conditions.push(`o.waiter_id = $${paramIdx++}`);
        params.push(user.id);
      }

      if (user.role === "kitchen") {
        conditions.push(`DATE(o.created_at) = CURRENT_DATE`);
        // Always scope kitchen users to their outlet
        const kitchenOutletId = user.outletId;
        if (kitchenOutletId) {
          conditions.push(`o.outlet_id = $${paramIdx++}`);
          params.push(kitchenOutletId);
        }
        // Station filter: best-effort via chef_roster
        try {
          const rosterRes = await pool.query(
            `SELECT cr.counter_id, kc.name AS counter_name
             FROM chef_roster cr
             JOIN kitchen_counters kc ON kc.id = cr.counter_id
             WHERE cr.tenant_id = $1 AND cr.chef_id = $2 AND cr.shift_date = CURRENT_DATE`,
            [user.tenantId, user.id]
          );
          if (rosterRes.rows.length > 0) {
            const stationNames = rosterRes.rows.map((r: { counter_name: string }) => r.counter_name);
            const stationPlaceholders = stationNames.map((_: string, i: number) => `$${paramIdx + i}`).join(", ");
            conditions.push(
              `EXISTS (SELECT 1 FROM order_items oi2 WHERE oi2.order_id = o.id AND oi2.station IN (${stationPlaceholders}))`
            );
            params.push(...stationNames);
            paramIdx += stationNames.length;
          }
        } catch (_) { /* station filter is best-effort */ }
      }

      if (date) {
        if (date === "today") {
          conditions.push(`DATE(o.created_at) = CURRENT_DATE`);
        } else if (date === "yesterday") {
          conditions.push(`DATE(o.created_at) = CURRENT_DATE - INTERVAL '1 day'`);
        } else if (date === "week") {
          conditions.push(`DATE(o.created_at) BETWEEN DATE_TRUNC('week', CURRENT_DATE) AND CURRENT_DATE`);
        } else if (date === "month") {
          conditions.push(`DATE(o.created_at) BETWEEN DATE_TRUNC('month', CURRENT_DATE) AND CURRENT_DATE`);
        } else if (date === "all") {
          // No date restriction — show all time
        } else {
          conditions.push(`DATE(o.created_at) = $${paramIdx++}`);
          params.push(date);
        }
      } else {
        if (dayLimit !== null && user.role !== "kitchen") {
          conditions.push(`o.created_at >= NOW() - INTERVAL '${dayLimit} days'`);
        }
        if (dateFrom) { conditions.push(`o.created_at >= $${paramIdx++}`); params.push(dateFrom); }
        if (dateTo) { conditions.push(`o.created_at <= $${paramIdx++}`); params.push(dateTo); }
      }

      // Status filter: support 'voided' as a synthetic status (orders with at least one voided item)
      if (status === "voided") {
        conditions.push(`EXISTS (SELECT 1 FROM order_items oi_v WHERE oi_v.order_id = o.id AND oi_v.is_voided = true)`);
      } else if (status === "active") {
        conditions.push(`o.status NOT IN ('paid', 'cancelled', 'refunded')`);
      } else if (status === "paid") {
        conditions.push(`o.status = 'paid'`);
      } else if (status) {
        conditions.push(`o.status = $${paramIdx++}`);
        params.push(status);
      }

      if (orderType) { conditions.push(`o.order_type = $${paramIdx++}`); params.push(orderType); }
      if (staffId && VOID_APPROVE_ROLES.includes(user.role)) {
        conditions.push(`o.waiter_id = $${paramIdx++}`);
        params.push(staffId);
      }
      if (outletId && user.role !== "kitchen") {
        conditions.push(`o.outlet_id = $${paramIdx++}`);
        params.push(outletId);
      }

      // Text search: order number, table number, customer name, amount
      if (q) {
        const searchParam = `%${q}%`;
        conditions.push(
          `(o.order_number ILIKE $${paramIdx} OR t.number::text ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx} OR o.total::text ILIKE $${paramIdx})`
        );
        params.push(searchParam);
        paramIdx++;
      }

      const where = conditions.join(" AND ");

      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM orders o
         LEFT JOIN tables t ON t.id = o.table_id
         LEFT JOIN customers c ON c.id = o.customer_id
         WHERE ${where}`,
        params
      );
      const total = parseInt(countResult.rows[0]?.total ?? "0");

      const dataParams = [...params, limit, offset];
      const dataResult = await pool.query(
        `SELECT
           o.id,
           o.order_number AS "orderNumber",
           o.order_type AS channel,
           o.status,
           o.payment_method AS "paymentMethod",
           o.total AS "totalAmount",
           o.created_at AS "createdAt",
           o.waiter_id AS "waiterId",
           o.outlet_id AS "outletId",
           t.number AS "tableNumber",
           u.name AS "staffName",
           (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS "itemCount",
           (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.is_voided = true) > 0 AS "hasVoidedItems",
           (SELECT COUNT(*) FROM item_refire_requests rr WHERE rr.order_id = o.id) > 0 AS "hasRefire",
           b.payment_status AS "paymentStatus",
           b.id AS "billId"
         FROM orders o
         LEFT JOIN tables t ON t.id = o.table_id
         LEFT JOIN users u ON u.id = o.waiter_id
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN bills b ON b.order_id = o.id
         WHERE ${where}
         ORDER BY o.created_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        dataParams
      );

      auditLogFromReq(req, {
        action: "TICKET_VIEWED",
        entityType: "order_search",
        metadata: { q, status, orderType, dateFrom, dateTo, total },
      }).catch(() => {});

      if (process.env.NODE_ENV !== "production") {
        console.debug(
          `[ticket-history] date=${date ?? "none"} total=${total} sample:`,
          dataResult.rows.slice(0, 3).map((r: Record<string, unknown>) => ({ id: r.id, orderNumber: r.orderNumber, createdAt: r.createdAt }))
        );
      }

      return res.json({ orders: dataResult.rows, total, hasMore: offset + limit < total });
    } catch (err) {
      console.error("[ticket-history] history search error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── GET /api/tickets/:orderId/timeline — BEFORE /:orderId generic ─────────────
  app.get("/api/tickets/:orderId/timeline", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const { orderId } = req.params;

      const orderRes = await pool.query(
        `SELECT o.*, t.number AS table_number, u.name AS staff_name
         FROM orders o
         LEFT JOIN tables t ON t.id = o.table_id
         LEFT JOIN users u ON u.id = o.waiter_id
         WHERE o.id = $1 AND o.tenant_id = $2`,
        [orderId, user.tenantId]
      );
      if (!orderRes.rows[0]) return res.status(404).json({ message: "Order not found" });
      const order = orderRes.rows[0];

      if (!(await canAccessOrder(user, orderId, order))) return res.status(403).json({ message: "Access denied" });

      const events: Array<{ timestamp: string; icon: string; description: string; performedBy?: string; performedByRole?: string }> = [];

      if (order.created_at) events.push({ timestamp: order.created_at, icon: "order_created", description: "Order created", performedBy: order.staff_name });
      if (order.kitchen_sent_at) events.push({ timestamp: order.kitchen_sent_at, icon: "kitchen_sent", description: "Sent to kitchen" });

      const timeLogsRes = await pool.query(`SELECT * FROM item_time_logs WHERE order_id = $1`, [orderId]);
      for (const tl of timeLogsRes.rows) {
        if (tl.cooking_started_at) events.push({ timestamp: tl.cooking_started_at, icon: "cooking_started", description: `Cooking started: ${tl.menu_item_name || "item"}`, performedBy: tl.chef_name });
        if (tl.cooking_ready_at) events.push({ timestamp: tl.cooking_ready_at, icon: "item_ready", description: `Item ready: ${tl.menu_item_name || "item"}` });
        if (tl.served_at) events.push({ timestamp: tl.served_at, icon: "item_served", description: `Served: ${tl.menu_item_name || "item"}` });
      }

      const voidRes = await pool.query(`SELECT * FROM item_void_requests WHERE order_id = $1 ORDER BY created_at ASC`, [orderId]);
      for (const vr of voidRes.rows) {
        events.push({ timestamp: vr.created_at, icon: "void_requested", description: `Void requested: ${vr.menu_item_name || "item"} — ${vr.void_reason}`, performedBy: vr.requested_by_name, performedByRole: vr.requested_by_role });
        if (vr.status === "approved" && vr.approved_at) events.push({ timestamp: vr.approved_at, icon: "void_approved", description: `Void approved: ${vr.menu_item_name || "item"}`, performedBy: vr.approved_by_name });
        else if (vr.status === "rejected") events.push({ timestamp: vr.approved_at || vr.created_at, icon: "void_rejected", description: `Void rejected: ${vr.menu_item_name || "item"}`, performedBy: vr.approved_by_name });
      }

      const refireRes = await pool.query(`SELECT * FROM item_refire_requests WHERE order_id = $1 ORDER BY created_at ASC`, [orderId]);
      for (const rr of refireRes.rows) {
        events.push({ timestamp: rr.created_at, icon: "refire_requested", description: `Refire: ${rr.menu_item_name || "item"} — ${rr.refire_reason}`, performedBy: rr.requested_by_name });
      }

      const billRes = await pool.query(`SELECT * FROM bills WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [orderId]);
      if (billRes.rows[0]?.paid_at) {
        events.push({ timestamp: billRes.rows[0].paid_at, icon: "bill_paid", description: `Bill paid — ${billRes.rows[0].payment_method || ""}` });
      }

      const auditRes = await pool.query(
        `SELECT * FROM audit_events WHERE entity_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
        [orderId, user.tenantId]
      );
      for (const ae of auditRes.rows) {
        if (["RECEIPT_REPRINTED", "KOT_REPRINTED", "BILL_REPRINTED"].includes(ae.action)) {
          events.push({ timestamp: ae.created_at, icon: "reprinted", description: `Reprinted: ${ae.action.replace("_REPRINTED", "").toLowerCase()}`, performedBy: ae.user_name });
        }
      }

      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return res.json({ events });
    } catch (err) {
      console.error("[ticket-history] timeline error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── GET /api/tickets/:orderId/refires ─────────────────────────────────────────
  app.get("/api/tickets/:orderId/refires", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const { orderId } = req.params;

      const orderRes = await pool.query(`SELECT * FROM orders WHERE id = $1 AND tenant_id = $2`, [orderId, user.tenantId]);
      if (!orderRes.rows[0]) return res.status(404).json({ message: "Order not found" });
      const order = orderRes.rows[0];

      if (!(await canAccessOrder(user, orderId, order))) return res.status(403).json({ message: "Access denied" });

      const result = await pool.query(
        `SELECT rr.*, oi.cooking_status AS new_item_status
         FROM item_refire_requests rr
         LEFT JOIN order_items oi ON oi.id = rr.new_order_item_id
         WHERE rr.order_id = $1 AND rr.tenant_id = $2
         ORDER BY rr.created_at DESC`,
        [orderId, user.tenantId]
      );
      return res.json(result.rows);
    } catch (err) {
      console.error("[ticket-history] refires error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── GET /api/tickets/:orderId — full ticket detail ────────────────────────────
  app.get("/api/tickets/:orderId", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const { orderId } = req.params;

      const orderRes = await pool.query(
        `SELECT o.*, t.number AS table_number, u.name AS waiter_name, c.name AS customer_name
         FROM orders o
         LEFT JOIN tables t ON t.id = o.table_id
         LEFT JOIN users u ON u.id = o.waiter_id
         LEFT JOIN customers c ON c.id = o.customer_id
         WHERE o.id = $1 AND o.tenant_id = $2`,
        [orderId, user.tenantId]
      );
      if (!orderRes.rows[0]) return res.status(404).json({ message: "Order not found" });
      const order = orderRes.rows[0];

      if (!(await canAccessOrder(user, orderId, order))) return res.status(403).json({ message: "Access denied" });

      // Items with modifications + item_time_logs enrichment for cooking times and chef data
      const itemsRes = await pool.query(
        `SELECT oi.*,
           oim.spice_level, oim.salt_level, oim.removed_ingredients, oim.has_allergy, oim.allergy_flags, oim.special_notes,
           itl.cooking_started_at AS tl_cooking_started_at,
           itl.cooking_ready_at  AS tl_cooking_ready_at,
           itl.actual_cooking_time AS tl_actual_cooking_time,
           itl.chef_name         AS tl_chef_name,
           itl.counter_name      AS tl_counter_name,
           itl.performance_flag  AS tl_performance_flag
         FROM order_items oi
         LEFT JOIN order_item_modifications oim ON oim.order_item_id = oi.id
         LEFT JOIN item_time_logs itl ON itl.order_item_id = oi.id
         WHERE oi.order_id = $1
         ORDER BY oi.course_number ASC, oi.id ASC`,
        [orderId]
      );

      const billRes = await pool.query(
        `SELECT b.*, array_agg(bp.payment_method) AS payment_methods
         FROM bills b
         LEFT JOIN bill_payments bp ON bp.bill_id = b.id
         WHERE b.order_id = $1
         GROUP BY b.id
         ORDER BY b.created_at DESC LIMIT 1`,
        [orderId]
      );

      const voidRes = await pool.query(`SELECT * FROM item_void_requests WHERE order_id = $1 ORDER BY created_at DESC`, [orderId]);
      const refireRes = await pool.query(`SELECT * FROM item_refire_requests WHERE order_id = $1 ORDER BY created_at DESC`, [orderId]);

      auditLogFromReq(req, {
        action: "TICKET_VIEWED",
        entityType: "order",
        entityId: orderId,
      }).catch(() => {});

      return res.json({
        order,
        items: itemsRes.rows,
        bill: billRes.rows[0] || null,
        voidRequests: voidRes.rows,
        refireRequests: refireRes.rows,
      });
    } catch (err) {
      console.error("[ticket-history] ticket detail error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── POST /api/tickets/:orderId/reprint/receipt ────────────────────────────────
  app.post("/api/tickets/:orderId/reprint/receipt", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const { orderId } = req.params;

      const orderRes = await pool.query(`SELECT * FROM orders WHERE id = $1 AND tenant_id = $2`, [orderId, user.tenantId]);
      if (!orderRes.rows[0]) return res.status(404).json({ message: "Order not found" });
      const order = orderRes.rows[0];

      if (!(await canAccessOrder(user, orderId, order))) return res.status(403).json({ message: "Access denied" });

      // receipt job type requires bill ID as referenceId
      const billRes = await pool.query(`SELECT id FROM bills WHERE order_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`, [orderId, user.tenantId]);
      if (!billRes.rows[0]) return res.status(404).json({ message: "No bill found for this order" });
      const billId = billRes.rows[0].id;

      const printResult = await routeAndPrint({
        jobType: "receipt",
        referenceId: billId,
        outletId: order.outlet_id,
        tenantId: user.tenantId,
        triggeredByName: user.name,
        isReprint: true,
        reprintReason: req.body?.reason || "Ticket history reprint",
      });

      await auditLogFromReq(req, {
        action: "RECEIPT_REPRINTED",
        entityType: "order",
        entityId: orderId,
        metadata: { reason: req.body?.reason, billId, jobIds: printResult.jobIds },
      });

      return res.json({ success: true, message: "Receipt reprint queued", jobIds: printResult.jobIds });
    } catch (err) {
      console.error("[ticket-history] reprint/receipt error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── POST /api/tickets/:orderId/reprint/kot ────────────────────────────────────
  app.post("/api/tickets/:orderId/reprint/kot", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const { orderId } = req.params;

      if (!KOT_REPRINT_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const orderRes = await pool.query(`SELECT * FROM orders WHERE id = $1 AND tenant_id = $2`, [orderId, user.tenantId]);
      if (!orderRes.rows[0]) return res.status(404).json({ message: "Order not found" });
      const order = orderRes.rows[0];

      if (!(await canAccessOrder(user, orderId, order))) return res.status(403).json({ message: "Access denied" });

      // KOT reprint uses order ID as referenceId
      const printResult = await routeAndPrint({
        jobType: "reprint_kot",
        referenceId: orderId,
        outletId: order.outlet_id,
        tenantId: user.tenantId,
        triggeredByName: user.name,
        isReprint: true,
        reprintReason: req.body?.reason || "Ticket history KOT reprint",
      });

      await auditLogFromReq(req, {
        action: "KOT_REPRINTED",
        entityType: "order",
        entityId: orderId,
        metadata: { reason: req.body?.reason, jobIds: printResult.jobIds },
      });

      return res.json({ success: true, message: "KOT reprint queued", jobIds: printResult.jobIds });
    } catch (err) {
      console.error("[ticket-history] reprint/kot error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── POST /api/tickets/:orderId/reprint/bill ───────────────────────────────────
  app.post("/api/tickets/:orderId/reprint/bill", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const { orderId } = req.params;

      if (!VOID_APPROVE_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const orderRes = await pool.query(`SELECT * FROM orders WHERE id = $1 AND tenant_id = $2`, [orderId, user.tenantId]);
      if (!orderRes.rows[0]) return res.status(404).json({ message: "Order not found" });
      const order = orderRes.rows[0];

      if (!(await canAccessOrder(user, orderId, order))) return res.status(403).json({ message: "Access denied" });

      // reprint_bill job type requires bill ID as referenceId
      const billRes = await pool.query(`SELECT id FROM bills WHERE order_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`, [orderId, user.tenantId]);
      if (!billRes.rows[0]) return res.status(404).json({ message: "No bill found for this order" });
      const billId = billRes.rows[0].id;

      const printResult = await routeAndPrint({
        jobType: "reprint_bill",
        referenceId: billId,
        outletId: order.outlet_id,
        tenantId: user.tenantId,
        triggeredByName: user.name,
        isReprint: true,
        reprintReason: req.body?.reason || "Ticket history bill reprint",
      });

      await auditLogFromReq(req, {
        action: "BILL_REPRINTED",
        entityType: "order",
        entityId: orderId,
        metadata: { reason: req.body?.reason, billId, jobIds: printResult.jobIds },
      });

      return res.json({ success: true, message: "Bill reprint queued", jobIds: printResult.jobIds });
    } catch (err) {
      console.error("[ticket-history] reprint/bill error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── POST /api/tickets/:orderId/send-whatsapp (Phase 1 stub) ──────────────────
  app.post("/api/tickets/:orderId/send-whatsapp", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const { orderId } = req.params;
      const orderRes = await pool.query(`SELECT * FROM orders WHERE id = $1 AND tenant_id = $2`, [orderId, user.tenantId]);
      if (!orderRes.rows[0]) return res.status(404).json({ message: "Order not found" });
      if (!(await canAccessOrder(user, orderId, orderRes.rows[0]))) return res.status(403).json({ message: "Access denied" });
      await auditLogFromReq(req, { action: "WHATSAPP_SENT", entityType: "order", entityId: orderId });
      return res.json({ success: true, message: "WhatsApp delivery queued" });
    } catch (err) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── POST /api/tickets/:orderId/send-email (Phase 1 stub) ─────────────────────
  app.post("/api/tickets/:orderId/send-email", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const { orderId } = req.params;
      const orderRes = await pool.query(`SELECT * FROM orders WHERE id = $1 AND tenant_id = $2`, [orderId, user.tenantId]);
      if (!orderRes.rows[0]) return res.status(404).json({ message: "Order not found" });
      if (!(await canAccessOrder(user, orderId, orderRes.rows[0]))) return res.status(403).json({ message: "Access denied" });
      await auditLogFromReq(req, { action: "EMAIL_SENT", entityType: "order", entityId: orderId });
      return res.json({ success: true, message: "Email delivery queued" });
    } catch (err) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── POST /api/tickets/:orderId/void-request ───────────────────────────────────
  app.post("/api/tickets/:orderId/void-request", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      if (!VOID_REQUEST_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { orderId } = req.params;

      const bodySchema = z.object({
        orderItemId: z.string().min(1),
        voidReason: z.string().min(1),
        voidType: z.string().min(1),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      const { orderItemId, voidReason, voidType } = parsed.data;

      const orderRes = await pool.query(
        `SELECT o.*, t.number AS table_number FROM orders o LEFT JOIN tables t ON t.id = o.table_id WHERE o.id = $1 AND o.tenant_id = $2`,
        [orderId, user.tenantId]
      );
      if (!orderRes.rows[0]) return res.status(404).json({ message: "Order not found" });
      const order = orderRes.rows[0];

      if (!(await canAccessOrder(user, orderId, order))) return res.status(403).json({ message: "Access denied" });

      const itemRes = await pool.query(`SELECT * FROM order_items WHERE id = $1 AND order_id = $2`, [orderItemId, orderId]);
      if (!itemRes.rows[0]) return res.status(404).json({ message: "Order item not found" });
      const item = itemRes.rows[0];

      if (item.is_voided) return res.status(409).json({ message: "Item is already voided" });

      const existingVoid = await pool.query(
        `SELECT id FROM item_void_requests WHERE order_item_id = $1 AND status = 'pending'`,
        [orderItemId]
      );
      if (existingVoid.rows.length > 0) {
        return res.status(409).json({ message: "A pending void request already exists for this item" });
      }

      const result = await pool.query(
        `INSERT INTO item_void_requests (
          tenant_id, outlet_id, order_id, order_number, order_item_id,
          menu_item_name, quantity, unit_price, total_value,
          void_reason, void_type, status,
          requested_by, requested_by_name, requested_by_role
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12,$13,$14)
        RETURNING *`,
        [
          user.tenantId, order.outlet_id, orderId, order.order_number || null, orderItemId,
          item.name, item.quantity, item.price,
          (parseFloat(item.price) * (item.quantity || 1)).toFixed(2),
          voidReason, voidType, user.id, user.name, user.role,
        ]
      );
      const voidRequest = result.rows[0];

      await auditLogFromReq(req, {
        action: "ITEM_VOID_REQUESTED",
        entityType: "order_item",
        entityId: orderItemId,
        metadata: { orderId, voidReason, voidType, voidRequestId: voidRequest.id },
      });

      emitToTenant(user.tenantId, "void_request:new", {
        voidRequestId: voidRequest.id,
        orderNumber: order.order_number || orderId.slice(-6),
        itemName: item.name,
        requestedBy: user.name,
        tableNumber: order.table_number,
        _targetRoles: VOID_APPROVE_ROLES,
      });

      alertEngine.trigger('ALERT-09', { tenantId: user.tenantId, outletId: order.outlet_id ?? undefined, referenceId: voidRequest.id, referenceNumber: order.order_number ?? undefined, message: `Void request: ${item.name} — ${user.name}` }).catch(() => {});

      return res.status(201).json(voidRequest);
    } catch (err) {
      console.error("[ticket-history] void-request error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── PUT /api/tickets/void-requests/:id/approve ───────────────────────────────
  app.put("/api/tickets/void-requests/:id/approve", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      if (!VOID_APPROVE_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { id } = req.params;

      const vrRes = await pool.query(`SELECT * FROM item_void_requests WHERE id = $1 AND tenant_id = $2`, [id, user.tenantId]);
      if (!vrRes.rows[0]) return res.status(404).json({ message: "Void request not found" });
      const vr = vrRes.rows[0];
      if (vr.status !== "pending") return res.status(409).json({ message: "Void request is not pending" });

      const now = new Date();

      const client = await pool.connect();
      let newSubtotal = 0;
      try {
        await client.query("BEGIN");

        await client.query(
          `UPDATE item_void_requests SET status = 'approved', approved_by = $1, approved_by_name = $2, approved_at = $3 WHERE id = $4`,
          [user.id, user.name, now, id]
        );

        await client.query(
          `UPDATE order_items SET is_voided = true, voided_at = $1, voided_reason = $2, void_request_id = $3 WHERE id = $4`,
          [now, vr.void_reason, id, vr.order_item_id]
        );

        await client.query(
          `INSERT INTO voided_items (tenant_id, order_id, order_item_id, void_request_id, menu_item_name, quantity, unit_price, total_value, void_reason, void_type, voided_by, voided_by_name, approved_by, approved_by_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [user.tenantId, vr.order_id, vr.order_item_id, id, vr.menu_item_name, vr.quantity, vr.unit_price, vr.total_value, vr.void_reason, vr.void_type, vr.requested_by, vr.requested_by_name, user.id, user.name]
        );

        const totalRes = await client.query(
          `SELECT COALESCE(SUM(price::numeric * quantity), 0) AS new_subtotal FROM order_items WHERE order_id = $1 AND is_voided = false`,
          [vr.order_id]
        );
        newSubtotal = parseFloat(totalRes.rows[0]?.new_subtotal ?? "0");

        // Check if order is already paid — warning must be captured in audit metadata
        const orderStatusRes = await client.query(
          `SELECT status, payment_method FROM orders WHERE id = $1`,
          [vr.order_id]
        );
        const orderRow = orderStatusRes.rows[0];
        const alreadyPaid = orderRow?.status === "paid" || !!orderRow?.payment_method;
        const warningMessage = alreadyPaid ? "Order already paid — manual refund may be required" : undefined;

        await client.query(
          `UPDATE orders SET subtotal = $1, total = $2 WHERE id = $3`,
          [newSubtotal.toFixed(2), newSubtotal.toFixed(2), vr.order_id]
        );

        // Audit events inside the same transaction for atomicity
        await auditInTx(client, user.tenantId, user.id, user.name, "ITEM_VOID_APPROVED", "order_item", vr.order_item_id, {
          orderId: vr.order_id, voidRequestId: id, newOrderTotal: newSubtotal,
          ...(warningMessage ? { warningMessage } : {}),
        });
        await auditInTx(client, user.tenantId, user.id, user.name, "ITEM_VOIDED", "order_item", vr.order_item_id, {
          orderId: vr.order_id, voidRequestId: id,
        });

        await client.query("COMMIT");
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }

      emitToTenant(user.tenantId, "void_request:approved", {
        voidRequestId: id,
        orderItemId: vr.order_item_id,
        newOrderTotal: newSubtotal,
        requestedBy: vr.requested_by,
        _targetRoles: VOID_REQUEST_ROLES,
      });
      emitToTenant(user.tenantId, "bill:updated", {
        orderId: vr.order_id,
        newTotal: newSubtotal,
      });

      const updatedVr = await pool.query(`SELECT * FROM item_void_requests WHERE id = $1`, [id]);
      return res.json(updatedVr.rows[0]);
    } catch (err) {
      console.error("[ticket-history] void approve error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── PUT /api/tickets/void-requests/:id/reject ─────────────────────────────────
  app.put("/api/tickets/void-requests/:id/reject", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      if (!VOID_APPROVE_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { id } = req.params;
      const { rejectedReason } = req.body;

      const vrRes = await pool.query(`SELECT * FROM item_void_requests WHERE id = $1 AND tenant_id = $2`, [id, user.tenantId]);
      if (!vrRes.rows[0]) return res.status(404).json({ message: "Void request not found" });
      const vr = vrRes.rows[0];
      if (vr.status !== "pending") return res.status(409).json({ message: "Void request is not pending" });

      await pool.query(
        `UPDATE item_void_requests SET status = 'rejected', rejected_reason = $1, approved_by = $2, approved_by_name = $3 WHERE id = $4`,
        [rejectedReason || null, user.id, user.name, id]
      );

      await auditLogFromReq(req, {
        action: "ITEM_VOID_REJECTED",
        entityType: "order_item",
        entityId: vr.order_item_id,
        metadata: { orderId: vr.order_id, voidRequestId: id, rejectedReason },
      });

      emitToTenant(user.tenantId, "void_request:rejected", {
        voidRequestId: id,
        orderItemId: vr.order_item_id,
        rejectedReason,
        requestedBy: vr.requested_by,
        _targetRoles: VOID_REQUEST_ROLES,
      });

      const updatedVr = await pool.query(`SELECT * FROM item_void_requests WHERE id = $1`, [id]);
      return res.json(updatedVr.rows[0]);
    } catch (err) {
      console.error("[ticket-history] void reject error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── POST /api/tickets/:orderId/refire ─────────────────────────────────────────
  app.post("/api/tickets/:orderId/refire", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      const { orderId } = req.params;

      if (!REFIRE_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const bodySchema = z.object({
        orderItemId: z.string().min(1),
        refireReason: z.string().min(1),
        assignToChefId: z.string().optional(),
        assignToChefName: z.string().optional(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      const { orderItemId, refireReason, assignToChefId, assignToChefName } = parsed.data;

      const orderRes = await pool.query(`SELECT * FROM orders WHERE id = $1 AND tenant_id = $2`, [orderId, user.tenantId]);
      if (!orderRes.rows[0]) return res.status(404).json({ message: "Order not found" });
      const order = orderRes.rows[0];

      if (!(await canAccessOrder(user, orderId, order))) return res.status(403).json({ message: "Access denied" });

      const itemRes = await pool.query(`SELECT * FROM order_items WHERE id = $1 AND order_id = $2`, [orderItemId, orderId]);
      if (!itemRes.rows[0]) return res.status(404).json({ message: "Order item not found" });
      const item = itemRes.rows[0];
      if (item.is_voided) return res.status(409).json({ message: "Cannot refire a voided item" });

      const modsRes = await pool.query(`SELECT * FROM order_item_modifications WHERE order_item_id = $1`, [orderItemId]);

      const client = await pool.connect();
      let newItemId: string;
      let refireRequest: Record<string, unknown>;
      const newKotNumber = generateKotNumber();

      try {
        await client.query("BEGIN");

        const newItemRes = await client.query(
          `INSERT INTO order_items (
            order_id, menu_item_id, name, quantity, price, notes, status, station, course,
            item_prep_minutes, started_by_id, started_by_name, course_number,
            is_refire, original_item_id, cooking_status, modifiers
          ) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,$11,$12,true,$13,'queued',$14)
          RETURNING *`,
          [
            orderId, item.menu_item_id, item.name, item.quantity, item.price,
            item.notes, item.station, item.course, item.item_prep_minutes,
            assignToChefId || item.started_by_id, assignToChefName || item.started_by_name,
            item.course_number, orderItemId, item.modifiers,
          ]
        );
        const newItem = newItemRes.rows[0];
        newItemId = newItem.id;

        for (const mod of modsRes.rows) {
          await client.query(
            `INSERT INTO order_item_modifications (tenant_id, order_item_id, order_id, spice_level, salt_level, removed_ingredients, has_allergy, allergy_flags, allergy_details, special_notes, chef_acknowledged)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)`,
            [mod.tenant_id, newItemId, orderId, mod.spice_level, mod.salt_level, mod.removed_ingredients, mod.has_allergy, mod.allergy_flags, mod.allergy_details, mod.special_notes]
          );
        }

        const refireRes = await client.query(
          `INSERT INTO item_refire_requests (
            tenant_id, outlet_id, order_id, order_number, order_item_id,
            new_order_item_id, menu_item_name, quantity, refire_reason,
            priority, assign_to_chef_id, assign_to_chef_name, new_kot_number,
            status, requested_by, requested_by_name
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'high',$10,$11,$12,'sent',$13,$14)
          RETURNING *`,
          [
            user.tenantId, order.outlet_id, orderId, order.order_number || null,
            orderItemId, newItemId, item.name, item.quantity, refireReason,
            assignToChefId || null, assignToChefName || null, newKotNumber,
            user.id, user.name,
          ]
        );
        refireRequest = refireRes.rows[0];

        const today = new Date().toISOString().slice(0, 10);
        await client.query(
          `INSERT INTO wastage_logs (tenant_id, outlet_id, wastage_number, wastage_date, wastage_category, ingredient_name, quantity, unit, unit_cost, total_cost, reason, is_preventable, is_voided)
           VALUES ($1,$2,$3,$4,'PLATE_RETURN',$5,$6,'pcs',$7,$8,$9,false,false)`,
          [
            user.tenantId, order.outlet_id, `WL-REFIRE-${Date.now()}`, today,
            item.name, item.quantity, item.price,
            (parseFloat(item.price) * (item.quantity || 1)).toFixed(2),
            refireReason,
          ]
        );

        // Audit events inside the same transaction for atomicity
        await auditInTx(client, user.tenantId, user.id, user.name, "ITEM_REFIRE_REQUESTED", "order_item", orderItemId, {
          orderId, refireReason, newOrderItemId: newItemId, newKotNumber,
        });
        await auditInTx(client, user.tenantId, user.id, user.name, "ITEM_REFIRED", "order_item", newItemId, {
          orderId, originalItemId: orderItemId, newKotNumber,
        });

        await client.query("COMMIT");
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }

      // Bootstrap KDS time tracking for the new refire item (outside transaction — non-blocking)
      await recordKdsEvent("kot_sent", {
        tenantId: user.tenantId,
        orderId,
        orderItemId: newItemId!,
        userId: user.id,
        userName: user.name,
        timestamp: new Date(),
      }).catch((err) => console.error("[ticket-history] recordKdsEvent error:", err));

      emitToTenant(user.tenantId, "kds:refire_ticket", {
        orderId,
        orderNumber: order.order_number || orderId.slice(-6),
        newOrderItemId: newItemId!,
        menuItemName: item.name,
        quantity: item.quantity,
        newKotNumber,
        priority: "HIGH",
        assignToChefId: assignToChefId || null,
        assignToChefName: assignToChefName || null,
        refireReason,
      });

      return res.status(201).json({
        refireRequest,
        newOrderItemId: newItemId!,
        newKotNumber,
      });
    } catch (err) {
      console.error("[ticket-history] refire error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
}
