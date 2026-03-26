import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { emitToTenant } from "../realtime";
import { pool } from "../db";

const COORDINATION_ROLES = ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor"];

export function registerCoordinationRoutes(app: Express): void {
  app.get("/api/coordination/dashboard", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;

      const activeStatuses = ["new", "sent_to_kitchen", "in_progress", "ready", "served"];

      const { rows: orderRows } = await pool.query(
        `SELECT o.*, 
          t.number as table_number, t.zone as table_zone, t.capacity as table_capacity, t.status as table_status, t.seated_at,
          u.name as waiter_name
         FROM orders o
         LEFT JOIN tables t ON o.table_id = t.id
         LEFT JOIN users u ON o.waiter_id = u.id
         WHERE o.tenant_id = $1 AND o.status::text = ANY($2::text[])
         ORDER BY o.created_at DESC
         LIMIT 200`,
        [tenantId, activeStatuses]
      );

      const ordersWithItems = await Promise.all(orderRows.map(async (order: any) => {
        const items = await storage.getOrderItemsByOrder(order.id);
        return {
          id: order.id,
          orderNumber: order.id.slice(-6).toUpperCase(),
          status: order.status,
          orderType: order.order_type,
          tableId: order.table_id,
          tableNumber: order.table_number,
          tableZone: order.table_zone,
          customerId: order.customer_id,
          customerName: order.customer_name,
          waiterId: order.waiter_id,
          waiterName: order.waiter_name,
          covers: order.covers,
          total: order.total,
          notes: order.notes,
          isVip: order.is_vip || false,
          createdAt: order.created_at,
          updatedAt: order.updated_at,
          sentToKitchenAt: order.sent_to_kitchen_at,
          readyAt: order.ready_at,
          servedAt: order.served_at,
          items: items.map((item: any) => ({
            id: item.id,
            menuItemId: item.menuItemId,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            status: item.status || "pending",
            notes: item.notes,
          })),
        };
      }));

      const { rows: tableRows } = await pool.query(
        `SELECT t.*, u.name as waiter_name
         FROM tables t
         LEFT JOIN orders o ON o.table_id = t.id AND o.status::text = ANY($2::text[])
         LEFT JOIN users u ON o.waiter_id = u.id
         WHERE t.tenant_id = $1
         ORDER BY t.number`,
        [tenantId, activeStatuses]
      );

      const receivedOrders = ordersWithItems.filter(o => o.status === "new");
      const preparingOrders = ordersWithItems.filter(o => ["sent_to_kitchen", "in_progress"].includes(o.status));
      const readyOrders = ordersWithItems.filter(o => o.status === "ready");
      const servedOrders = ordersWithItems.filter(o => o.status === "served");

      const now = Date.now();
      const allActiveOrders = [...receivedOrders, ...preparingOrders, ...readyOrders];
      const avgWaitMs = allActiveOrders.length > 0
        ? allActiveOrders.reduce((sum, o) => sum + (now - new Date(o.createdAt).getTime()), 0) / allActiveOrders.length
        : 0;
      const avgWaitMin = Math.round(avgWaitMs / 60000);

      const { rows: tableCountRows } = await pool.query(
        `SELECT COUNT(*) as total, COUNT(CASE WHEN status = 'occupied' THEN 1 END) as occupied FROM tables WHERE tenant_id = $1`,
        [tenantId]
      );

      const tableStats = tableCountRows[0];

      const deliveryOrders = ordersWithItems.filter(o => o.orderType === "delivery");
      const deliveryPending = deliveryOrders.filter(o => ["new"].includes(o.status)).length;
      const deliveryOut = deliveryOrders.filter(o => ["served"].includes(o.status)).length;

      const lateOrders = allActiveOrders.filter(o => {
        const elapsed = (now - new Date(o.createdAt).getTime()) / 60000;
        return elapsed > 20;
      });

      const tablesWithStatus = tableRows.map((t: any) => {
        const tableOrder = ordersWithItems.find(o => o.tableId === t.id);
        let orderStatus = "empty";
        if (tableOrder) {
          if (tableOrder.status === "new") orderStatus = "ordering";
          else if (["sent_to_kitchen", "in_progress"].includes(tableOrder.status)) orderStatus = "in_kitchen";
          else if (tableOrder.status === "ready") orderStatus = "ready";
          else if (tableOrder.status === "ready_to_pay") orderStatus = "bill_requested";
        } else if (t.status === "reserved") {
          orderStatus = "reserved";
        }

        return {
          id: t.id,
          number: t.number,
          zone: t.zone,
          capacity: t.capacity,
          status: t.status,
          orderStatus,
          orderId: tableOrder?.id ?? null,
          orderStatus2: tableOrder?.status ?? null,
          waiterName: t.waiter_name || null,
          partySize: t.party_size,
          seatedAt: t.seated_at,
        };
      });

      res.json({
        summary: {
          avgWaitMin,
          targetWaitMin: 15,
          tablesOccupied: Number(tableStats?.occupied || 0),
          tablesTotal: Number(tableStats?.total || 0),
          deliveryPending,
          deliveryOut,
          alerts: lateOrders.length,
          hour: new Date().getHours(),
        },
        columns: {
          received: receivedOrders,
          preparing: preparingOrders,
          ready: readyOrders,
          served: servedOrders.slice(0, 20),
          issues: lateOrders,
        },
        tables: tablesWithStatus,
        kpis: {
          avgWaitMin,
          targetWaitMin: 15,
          totalOrders: ordersWithItems.length,
          lateOrders: lateOrders.length,
          onTimeOrders: allActiveOrders.length - lateOrders.length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/orders/:id/coordination-status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { status } = req.body;
      if (!status) return res.status(400).json({ message: "Status required" });

      // PR-001: Idempotency — prevent duplicate KOT/coordination status updates (e.g. double-tap)
      const coordIdemKey = req.headers["x-idempotency-key"] as string | undefined;
      if (coordIdemKey) {
        const { rows: claimRows } = await pool.query(
          `INSERT INTO idempotency_keys (key, tenant_id, endpoint, response_code)
           VALUES ($1, $2, 'PATCH /api/coordination-status', 200)
           ON CONFLICT (key, tenant_id) DO NOTHING
           RETURNING key`,
          [coordIdemKey, user.tenantId]
        );
        if (claimRows.length === 0) {
          // Duplicate — return the winner's stored response if available
          const { rows: replayRows } = await pool.query(
            `SELECT response_body FROM idempotency_keys WHERE key = $1 AND tenant_id = $2 AND endpoint = 'PATCH /api/coordination-status' AND created_at > NOW() - INTERVAL '60 seconds'`,
            [coordIdemKey, user.tenantId]
          );
          if (replayRows[0]?.response_body) return res.json(replayRows[0].response_body);
          return res.status(202).json({ code: "PROCESSING", message: "Status update in progress" });
        }
      }

      const order = await storage.getOrder(req.params.id, user.tenantId);
      if (!order) return res.status(404).json({ message: "Order not found" });

      await storage.updateOrder(order.id, { status });
      emitToTenant(user.tenantId, "coordination:order_updated", { orderId: order.id, status });
      emitToTenant(user.tenantId, "order:updated", { orderId: order.id, status });

      if (status === "ready") {
        emitToTenant(user.tenantId, "coordination:item_ready", { orderId: order.id });
      }

      const coordResponse = { success: true };
      if (coordIdemKey) {
        pool.query(
          `UPDATE idempotency_keys SET response_body = $1 WHERE key = $2 AND tenant_id = $3 AND endpoint = 'PATCH /api/coordination-status'`,
          [JSON.stringify(coordResponse), coordIdemKey, user.tenantId]
        ).catch(() => {});
      }
      res.json(coordResponse);
    } catch (err: any) {
      const coordIdemKey = req.headers["x-idempotency-key"] as string | undefined;
      if (coordIdemKey) {
        pool.query(
          `DELETE FROM idempotency_keys WHERE key = $1 AND tenant_id = $2 AND endpoint = 'PATCH /api/coordination-status' AND response_body IS NULL`,
          [coordIdemKey, (req.user as any)?.tenantId]
        ).catch(() => {});
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/coordination/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { recipientRole, message, orderId, template } = req.body;
      if (!message) return res.status(400).json({ message: "Message required" });

      const msg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        senderId: user.id,
        senderName: user.name,
        senderRole: user.role,
        recipientRole: recipientRole || "all",
        message,
        orderId: orderId || null,
        template: template || null,
        createdAt: new Date().toISOString(),
      };

      emitToTenant(user.tenantId, "coordination:message", msg);
      res.json({ success: true, message: msg });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/orders/:orderId/items/:itemId/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { status } = req.body;
      if (!status) return res.status(400).json({ message: "Status required" });

      const order = await storage.getOrder(req.params.orderId, user.tenantId);
      if (!order) return res.status(404).json({ message: "Order not found" });

      await pool.query(
        `UPDATE order_items SET status = $1 WHERE id = $2 AND order_id = $3`,
        [status, req.params.itemId, req.params.orderId]
      );

      emitToTenant(user.tenantId, "coordination:order_updated", {
        orderId: req.params.orderId,
        itemId: req.params.itemId,
        itemStatus: status,
      });

      if (status === "served") {
        const allItems = await storage.getOrderItemsByOrder(req.params.orderId);
        const allServed = allItems.every((item: any) => item.status === "served");
        if (allServed) {
          await storage.updateOrder(req.params.orderId, { status: "served" });
          emitToTenant(user.tenantId, "order:updated", { orderId: req.params.orderId, status: "served" });
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/coordination/waiter-ready-items", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const activeStatuses = ["new", "sent_to_kitchen", "in_progress", "ready"];

      const { rows: orderRows } = await pool.query(
        `SELECT o.*, t.number as table_number
         FROM orders o
         LEFT JOIN tables t ON o.table_id = t.id
         WHERE o.tenant_id = $1 AND o.waiter_id = $2 AND o.status::text = ANY($3::text[])`,
        [user.tenantId, user.id, activeStatuses]
      );

      const readyItems: any[] = [];
      const activeOrders: any[] = [];

      for (const order of orderRows) {
        const items = await storage.getOrderItemsByOrder(order.id);
        const orderData = {
          id: order.id,
          orderNumber: order.id.slice(-6).toUpperCase(),
          status: order.status,
          tableNumber: order.table_number,
          tableId: order.table_id,
          createdAt: order.created_at,
          total: order.total,
          items: items.map((item: any) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            status: item.status || "pending",
          })),
        };

        const orderReadyItems = items.filter((item: any) => item.status === "ready");
        orderReadyItems.forEach((item: any) => {
          readyItems.push({
            itemId: item.id,
            itemName: item.name,
            quantity: item.quantity,
            orderId: order.id,
            orderNumber: order.id.slice(-6).toUpperCase(),
            tableNumber: order.table_number,
            readySince: item.updated_at || order.updated_at,
          });
        });

        if (["new", "sent_to_kitchen", "in_progress", "ready"].includes(order.status)) {
          activeOrders.push(orderData);
        }
      }

      res.json({ readyItems, activeOrders });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
