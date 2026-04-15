import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { emitToTenant } from "../realtime";
import { pool } from "../db";
import { alertEngine } from "../services/alert-engine";
import QRCode from "qrcode";

const REQUEST_TYPES = ["call_server", "order_food", "request_bill", "feedback", "water_refill", "cleaning", "other"] as const;
const PRIORITIES = ["low", "medium", "high"] as const;
const ESCALATION_MINUTES: Record<string, number> = {
  high: 2,
  medium: 5,
  low: 10,
};

export function registerTableRequestRoutes(app: Express): void {
  // IMPORTANT — specific QR sub-paths must be registered BEFORE the generic /api/qr/:token
  // to prevent the /:token wildcard from capturing "restaurant-info", "table", "generate", "tokens", "bulk-download"

  // restaurant-info endpoint (no auth required — invalid token fallback)
  app.get("/api/qr/restaurant-info", async (req, res) => {
    try {
      const { token, outletId } = req.query as { token?: string; outletId?: string };

      // Helper: given a tenantId, return restaurant info
      const fetchByTenantId = async (tenantId: string) => {
        const { rows } = await pool.query(
          `SELECT t.id, t.name, t.phone, rs.logo_url
           FROM tenants t
           LEFT JOIN receipt_settings rs ON rs.tenant_id = t.id AND rs.is_active = true
           WHERE t.id = $1 LIMIT 1`,
          [tenantId]
        );
        return rows[0] ?? null;
      };

      if (token) {
        // Look up tenant even for inactive/expired tokens so invalid-token error state
        // can show the restaurant phone number for a better customer experience
        const qrToken = await storage.getQrTokenByValue(token);
        if (qrToken) {
          const tenant = await fetchByTenantId(qrToken.tenantId);
          if (tenant) {
            return res.json({
              restaurantName: tenant.name,
              phone: tenant.phone ?? null,
              logoUrl: tenant.logo_url ?? null,
            });
          }
        }
      }

      // fallback for truly invalid/unknown tokens — resolve by outletId if provided
      // This ensures the invalid-token screen always has a callable contact path
      if (outletId) {
        const { rows: outletRows } = await pool.query(
          `SELECT o.tenant_id FROM outlets o WHERE o.id = $1 LIMIT 1`,
          [outletId]
        );
        const tenantId = outletRows[0]?.tenant_id;
        if (tenantId) {
          const tenant = await fetchByTenantId(tenantId);
          if (tenant) {
            return res.json({
              restaurantName: tenant.name,
              phone: tenant.phone ?? null,
              logoUrl: tenant.logo_url ?? null,
            });
          }
        }
      }

      res.json({ restaurantName: null, phone: null, logoUrl: null });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET session info for table QR token
  app.get("/api/qr/table/:token/session", async (req, res) => {
    try {
      const qrToken = await storage.getQrTokenByValue(req.params.token);
      if (!qrToken || !qrToken.active) {
        return res.status(404).json({ message: "QR code not found or inactive", errorCode: "INVALID_TOKEN" });
      }

      const table = await storage.getTable(qrToken.tableId);
      if (!table) {
        return res.status(404).json({ message: "Table not found", errorCode: "TABLE_NOT_FOUND" });
      }

      // Check outlet hours
      let outletHours = { open: "09:00", close: "22:00", isOpen: true, nextOpenTime: null as string | null };
      if (qrToken.outletId) {
        try {
          const { rows: outletRows } = await pool.query(
            `SELECT operating_hours FROM outlets WHERE id = $1 LIMIT 1`,
            [qrToken.outletId]
          );
          const oh = outletRows[0]?.operating_hours;
          if (oh && typeof oh === "object") {
            const now = new Date();
            const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
            const todayKey = dayNames[now.getDay()];
            const todayHours = oh[todayKey];
            if (todayHours && todayHours.open && todayHours.close) {
              outletHours.open = todayHours.open;
              outletHours.close = todayHours.close;
              const [openH, openM] = todayHours.open.split(":").map(Number);
              const [closeH, closeM] = todayHours.close.split(":").map(Number);
              const currentMinutes = now.getHours() * 60 + now.getMinutes();
              const openMinutes = openH * 60 + openM;
              const closeMinutes = closeH * 60 + closeM;
              outletHours.isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
              if (!outletHours.isOpen) {
                // Determine next open time: check today (if before open) then scan forward up to 7 days
                if (currentMinutes < openMinutes) {
                  outletHours.nextOpenTime = todayHours.open;
                } else {
                  // Scan next 7 days to find the next day with open hours
                  for (let offset = 1; offset <= 7; offset++) {
                    const nextKey = dayNames[(now.getDay() + offset) % 7];
                    const nextDayHours = oh[nextKey];
                    if (nextDayHours?.open) {
                      const dayLabel = offset === 1 ? "Tomorrow" : dayNames[(now.getDay() + offset) % 7].charAt(0).toUpperCase() + dayNames[(now.getDay() + offset) % 7].slice(1);
                      outletHours.nextOpenTime = `${dayLabel} at ${nextDayHours.open}`;
                      break;
                    }
                  }
                  if (!outletHours.nextOpenTime) outletHours.nextOpenTime = "soon";
                }
              }
            }
          }
        } catch (e) {
          // Operating hours parsing failed; use defaults (isOpen=true)
        }
      }

      // Deactivate sessions that have passed their scheduled expiry
      await pool.query(
        `UPDATE table_qr_sessions SET is_active = false
         WHERE table_id = $1 AND is_active = true AND expires_at IS NOT NULL AND expires_at < NOW()`,
        [qrToken.tableId]
      );

      // Look for active QR session for this table (only not-yet-expired ones)
      const { rows: sessionRows } = await pool.query(
        `SELECT id, session_token, order_ids, started_at, expires_at
         FROM table_qr_sessions
         WHERE table_id = $1 AND is_active = true
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [qrToken.tableId]
      );

      const session = sessionRows[0] ?? null;
      const orderCount = session ? (session.order_ids?.length ?? 0) : 0;

      // canJoin: session exists AND at least one active (unpaid) order is present for joining
      // If all orders in the session are paid, the table is effectively "available" for a new party
      let canJoin = false;
      let hasUnpaidOrders = false;
      if (session && session.order_ids?.length > 0) {
        const { rows: unpaidRows } = await pool.query(
          `SELECT id FROM orders
           WHERE id = ANY($1::text[]) AND status != 'paid' AND payment_status != 'paid'
           LIMIT 1`,
          [session.order_ids]
        );
        hasUnpaidOrders = unpaidRows.length > 0;
        canJoin = hasUnpaidOrders;
      } else if (session && session.order_ids?.length === 0) {
        // Session exists but no orders submitted yet — first diner is browsing; joining is possible
        canJoin = true;
      }

      res.json({
        sessionExists: !!session,
        sessionToken: session?.session_token ?? null,
        orderCount,
        canJoin,
        tableNumber: table.number,
        tableZone: table.zone ?? null,
        outletHours,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Start a new QR table session (race-condition safe via partial unique index)
  app.post("/api/qr/table/:token/session/start", async (req, res) => {
    try {
      const qrToken = await storage.getQrTokenByValue(req.params.token);
      if (!qrToken || !qrToken.active) {
        return res.status(404).json({ message: "QR code not found or inactive", errorCode: "INVALID_TOKEN" });
      }

      const crypto = await import("crypto");
      const newToken = crypto.randomUUID();

      // INSERT ... ON CONFLICT DO NOTHING — if another insert wins the race, we fall through to SELECT
      // Uses the partial unique index on (table_id) WHERE is_active = true
      const { rows: insertRows } = await pool.query(
        `INSERT INTO table_qr_sessions (table_id, tenant_id, outlet_id, session_token)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (table_id) WHERE is_active = true DO NOTHING
         RETURNING *`,
        [qrToken.tableId, qrToken.tenantId, qrToken.outletId ?? null, newToken]
      );

      if (insertRows.length > 0) {
        return res.status(201).json({ session: insertRows[0], created: true });
      }

      // Race condition: another insert won — return the existing session
      const { rows: existingRows } = await pool.query(
        `SELECT * FROM table_qr_sessions WHERE table_id = $1 AND is_active = true LIMIT 1`,
        [qrToken.tableId]
      );

      res.json({ session: existingRows[0], created: false });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET shared session items across all orders in the session (for join mode shared cart view)
  app.get("/api/qr/table/:token/session/items", async (req, res) => {
    try {
      const qrToken = await storage.getQrTokenByValue(req.params.token);
      if (!qrToken || !qrToken.active) {
        return res.status(404).json({ message: "QR code not found or inactive", errorCode: "INVALID_TOKEN" });
      }

      const { rows: sessionRows } = await pool.query(
        `SELECT order_ids FROM table_qr_sessions WHERE table_id = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
        [qrToken.tableId]
      );

      if (!sessionRows[0] || !sessionRows[0].order_ids?.length) {
        return res.json({ items: [] });
      }

      const orderIds: string[] = sessionRows[0].order_ids;
      const { rows: itemRows } = await pool.query(
        `SELECT oi.id, oi.order_id, oi.menu_item_id, oi.name, oi.quantity, oi.price, oi.notes,
                o.guest_name
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.order_id = ANY($1::text[])
           AND o.tenant_id = $2
           AND o.table_id = $3
         ORDER BY oi.order_id, oi.id`,
        [orderIds, qrToken.tenantId, qrToken.tableId]
      );

      res.json({ items: itemRows });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Join an existing QR table session — append orderId to session and return shared orderId
  app.post("/api/qr/table/:token/session/join", async (req, res) => {
    try {
      const qrToken = await storage.getQrTokenByValue(req.params.token);
      if (!qrToken || !qrToken.active) {
        return res.status(404).json({ message: "QR code not found or inactive", errorCode: "INVALID_TOKEN" });
      }

      const { orderId } = req.body;
      if (!orderId) return res.status(400).json({ message: "orderId is required" });

      // Validate order belongs to same tenant and table before linking into session
      const { rows: orderCheck } = await pool.query(
        `SELECT id FROM orders WHERE id = $1 AND tenant_id = $2 AND table_id = $3 LIMIT 1`,
        [orderId, qrToken.tenantId, qrToken.tableId]
      );
      if (orderCheck.length === 0) {
        return res.status(403).json({ message: "Order does not belong to this table" });
      }

      const { rows } = await pool.query(
        `UPDATE table_qr_sessions
         SET order_ids = order_ids || ARRAY[$1::text]
         WHERE table_id = $2 AND is_active = true
         RETURNING *`,
        [orderId, qrToken.tableId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ message: "No active session found for this table" });
      }

      res.json({ session: rows[0] });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET shared order ID for joining customers — returns the first active order in the session
  // Joining customers use this to add their cart items directly to the shared order instead of creating a new one
  app.get("/api/qr/table/:token/session/shared-order", async (req, res) => {
    try {
      const qrToken = await storage.getQrTokenByValue(req.params.token);
      if (!qrToken || !qrToken.active) {
        return res.status(404).json({ message: "QR code not found or inactive", errorCode: "INVALID_TOKEN" });
      }

      const { rows } = await pool.query(
        `SELECT order_ids FROM table_qr_sessions
         WHERE table_id = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [qrToken.tableId]
      );

      const orderIds: string[] = rows[0]?.order_ids ?? [];
      // Return the first linked order ID (the "shared" order joining customers merge into)
      const sharedOrderId = orderIds.length > 0 ? orderIds[0] : null;

      if (!sharedOrderId) {
        return res.json({ sharedOrderId: null });
      }

      // Verify the order is still active (not paid)
      const { rows: orderRows } = await pool.query(
        `SELECT id, status, payment_status FROM orders WHERE id = $1 LIMIT 1`,
        [sharedOrderId]
      );
      const order = orderRows[0];
      const isActive = order && order.status !== "paid" && order.payment_status !== "paid";

      res.json({ sharedOrderId: isActive ? sharedOrderId : null });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Add cart items from a guest session directly to an existing shared order
  // Used when a customer chooses "Join Table's Order" — merges items into the shared order's KOT
  app.post("/api/qr/table/:token/session/add-to-shared-order", async (req, res) => {
    try {
      const qrToken = await storage.getQrTokenByValue(req.params.token);
      if (!qrToken || !qrToken.active) {
        return res.status(404).json({ message: "QR code not found or inactive", errorCode: "INVALID_TOKEN" });
      }

      const { guestSessionId, sharedOrderId } = req.body;
      if (!guestSessionId || !sharedOrderId) {
        return res.status(400).json({ message: "guestSessionId and sharedOrderId are required" });
      }

      // Security: validate the guest session belongs to the same table/tenant as the QR token
      // This prevents cross-session cart manipulation if session IDs are discovered
      const guestSession = await storage.getTableSession(guestSessionId);
      if (!guestSession) {
        return res.status(404).json({ message: "Guest session not found" });
      }
      if (guestSession.tableId !== qrToken.tableId || guestSession.tenantId !== qrToken.tenantId) {
        return res.status(403).json({ message: "Guest session does not belong to this table" });
      }
      if (guestSession.status !== "active") {
        return res.status(409).json({ message: "Guest session is no longer active" });
      }

      // Verify order belongs to same tenant and table, and is still active
      const { rows: orderRows } = await pool.query(
        `SELECT id, tenant_id, table_id, status, payment_status FROM orders
         WHERE id = $1 AND tenant_id = $2 AND table_id = $3 LIMIT 1`,
        [sharedOrderId, qrToken.tenantId, qrToken.tableId]
      );
      const order = orderRows[0];
      if (!order) return res.status(404).json({ message: "Shared order not found for this table" });
      if (order.payment_status === "paid" || order.status === "paid") {
        return res.status(409).json({ message: "Shared order has already been paid" });
      }

      // Get cart items from the guest session
      const cartItems = await storage.getGuestCartItems(guestSessionId);
      if (cartItems.length === 0) {
        return res.status(400).json({ message: "No items in cart to add" });
      }

      // Add each cart item directly to the shared order
      const addedItems = [];
      for (const ci of cartItems) {
        const item = await storage.createOrderItem({
          orderId: sharedOrderId,
          menuItemId: ci.menuItemId,
          name: ci.name,
          quantity: ci.quantity,
          price: ci.price,
          notes: ci.notes,
          itemPrepMinutes: null,
        });
        addedItems.push(item);
      }

      // Clear this customer's guest cart
      await storage.clearGuestCart(guestSessionId);

      // Emit real-time update to kitchen/staff
      const { emitToTenant } = await import("../realtime");
      emitToTenant(qrToken.tenantId, "coordination:order_updated", {
        orderId: sharedOrderId,
        status: order.status,
        source: "qr_dinein",
      });

      res.json({ orderId: sharedOrderId, addedItems, itemCount: addedItems.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/qr/:token", async (req, res) => {
    try {
      const qrToken = await storage.getQrTokenByValue(req.params.token);
      if (!qrToken || !qrToken.active) return res.status(404).json({ message: "QR code not found or inactive" });

      const table = await storage.getTable(qrToken.tableId);
      if (!table) return res.status(404).json({ message: "Table not found" });

      const { rows } = await pool.query(
        `SELECT id, name, currency FROM tenants WHERE id = $1 LIMIT 1`,
        [qrToken.tenantId]
      );
      const tenant = rows[0];
      if (!tenant) return res.status(404).json({ message: "Restaurant not found" });

      let outletName: string | null = null;
      if (qrToken.outletId) {
        const outlet = await storage.getOutletUnchecked(qrToken.outletId);
        outletName = outlet?.name ?? null;
      }

      res.json({
        tokenId: qrToken.id,
        tenantId: qrToken.tenantId,
        outletId: qrToken.outletId,
        tableId: qrToken.tableId,
        tableNumber: table.number,
        tableZone: table.zone,
        restaurantName: tenant.name,
        currency: tenant.currency,
        outletName,
        requestTypes: REQUEST_TYPES,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/table-requests", async (req, res) => {
    try {
      const { token, requestType, guestNote, priority, details } = req.body;
      if (!token) return res.status(400).json({ message: "token is required" });
      if (!requestType) return res.status(400).json({ message: "requestType is required" });
      if (!REQUEST_TYPES.includes(requestType)) return res.status(400).json({ message: `Invalid requestType. Must be one of: ${REQUEST_TYPES.join(", ")}` });

      const qrToken = await storage.getQrTokenByValue(token);
      if (!qrToken || !qrToken.active) return res.status(404).json({ message: "QR code not found or inactive" });

      const effectivePriority = PRIORITIES.includes(priority) ? priority : "medium";

      const request = await storage.createTableRequest({
        tenantId: qrToken.tenantId,
        outletId: qrToken.outletId ?? null,
        tableId: qrToken.tableId,
        qrTokenId: qrToken.id,
        requestType,
        priority: effectivePriority,
        status: "pending",
        guestNote: guestNote ? String(guestNote).slice(0, 500) : null,
        details: details && typeof details === "object" ? details : null,
      });

      const table = await storage.getTable(qrToken.tableId);
      const enrichedRequest = {
        ...request,
        tableNumber: table?.number ?? null,
        tableZone: table?.zone ?? null,
      };

      emitToTenant(qrToken.tenantId, "table-request:new", {
        request: enrichedRequest,
        tableId: qrToken.tableId,
      });

      if (requestType === 'call_server') {
        alertEngine.trigger('ALERT-06', { tenantId: qrToken.tenantId, outletId: qrToken.outletId ?? undefined, referenceId: qrToken.tableId, message: `Waiter requested at Table ${enrichedRequest.tableNumber ?? qrToken.tableId.slice(-4)}` }).catch(() => {});
      }

      res.status(201).json(request);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/table-requests/pending-count", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM table_requests
         WHERE tenant_id = $1 AND status IN ('pending', 'acknowledged')`,
        [user.tenantId]
      );
      res.json({ count: rows[0]?.count ?? 0 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/table-requests/live", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const requests = await storage.getTableRequestsLive(user.tenantId);
      const tables = await storage.getTablesByTenant(user.tenantId);
      const tableMap = new Map(tables.map(t => [t.id, t]));

      const enriched = requests.map(r => ({
        ...r,
        tableNumber: tableMap.get(r.tableId)?.number ?? null,
        tableZone: tableMap.get(r.tableId)?.zone ?? null,
      }));

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/table-requests/history", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string | undefined;

      const requests = await storage.getTableRequestsByTenant(user.tenantId, { limit, offset, status });
      const tables = await storage.getTablesByTenant(user.tenantId);
      const tableMap = new Map(tables.map(t => [t.id, t]));

      const enriched = requests.map(r => ({
        ...r,
        tableNumber: tableMap.get(r.tableId)?.number ?? null,
        tableZone: tableMap.get(r.tableId)?.zone ?? null,
      }));

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/table-requests/analytics", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const analytics = await storage.getTableRequestAnalytics(user.tenantId, from, to);
      res.json(analytics);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/table-requests/:id/acknowledge", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const request = await storage.getTableRequest(req.params.id);
      if (!request || request.tenantId !== user.tenantId) return res.status(404).json({ message: "Request not found" });
      if (request.status === "completed" || request.status === "cancelled") {
        return res.status(400).json({ message: `Cannot acknowledge a ${request.status} request` });
      }

      const updated = await storage.updateTableRequest(req.params.id, {
        status: "acknowledged",
        acknowledgedAt: new Date(),
        assignedTo: user.id,
        assignedToName: user.name ?? user.username,
      });

      emitToTenant(user.tenantId, "table-request:updated", { request: updated });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/table-requests/:id/complete", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const request = await storage.getTableRequest(req.params.id);
      if (!request || request.tenantId !== user.tenantId) return res.status(404).json({ message: "Request not found" });
      if (request.status === "completed") return res.status(400).json({ message: "Request already completed" });

      const { staffNote } = req.body || {};
      const updated = await storage.updateTableRequest(req.params.id, {
        status: "completed",
        completedAt: new Date(),
        staffNote: staffNote ? String(staffNote).slice(0, 1000) : request.staffNote,
      });

      emitToTenant(user.tenantId, "table-request:updated", { request: updated });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/table-requests/:id/assign", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor"), async (req, res) => {
    try {
      const user = req.user as any;
      const request = await storage.getTableRequest(req.params.id);
      if (!request || request.tenantId !== user.tenantId) return res.status(404).json({ message: "Request not found" });

      const { assignedTo, assignedToName } = req.body;
      if (!assignedTo) return res.status(400).json({ message: "assignedTo is required" });

      const updated = await storage.updateTableRequest(req.params.id, {
        assignedTo,
        assignedToName: assignedToName ?? null,
      });

      emitToTenant(user.tenantId, "table-request:updated", { request: updated });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/table-requests/:id/cancel", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const request = await storage.getTableRequest(req.params.id);
      if (!request || request.tenantId !== user.tenantId) return res.status(404).json({ message: "Request not found" });
      if (request.status === "completed" || request.status === "cancelled") {
        return res.status(400).json({ message: `Request is already ${request.status}` });
      }

      const updated = await storage.updateTableRequest(req.params.id, { status: "cancelled" });
      emitToTenant(user.tenantId, "table-request:updated", { request: updated });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/qr/generate/:tableId", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const table = await storage.getTable(req.params.tableId, user.tenantId);
      if (!table) return res.status(404).json({ message: "Table not found" });

      const existing = await storage.getActiveQrToken(table.id);
      if (existing) {
        await storage.deactivateQrToken(existing.id, user.tenantId);
      }

      const crypto = await import("crypto");
      const tokenValue = `qr-${crypto.randomBytes(12).toString("hex")}`;
      const { label } = req.body;

      const qrToken = await storage.createQrToken({
        tenantId: user.tenantId,
        outletId: table.outletId ?? null,
        tableId: table.id,
        token: tokenValue,
        active: true,
        label: label ?? `Table ${table.number}`,
      });

      await storage.updateTableByTenant(table.id, user.tenantId, { qrToken: tokenValue });

      res.status(201).json(qrToken);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/qr/tokens", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tokens = await storage.getQrTokensByTenant(user.tenantId);
      const tables = await storage.getTablesByTenant(user.tenantId);
      const tableMap = new Map(tables.map(t => [t.id, t]));

      const enriched = tokens.map(t => ({
        ...t,
        tableNumber: tableMap.get(t.tableId)?.number ?? null,
        tableZone: tableMap.get(t.tableId)?.zone ?? null,
      }));

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/qr/tokens/:id", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deactivateQrToken(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/qr/bulk-download/:outletId", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const tokens = await storage.getQrTokensByTenant(user.tenantId);
      const outletTokens = outletId === "all"
        ? tokens.filter(t => t.active)
        : tokens.filter(t => t.active && t.outletId === outletId);

      if (outletTokens.length === 0) {
        return res.status(404).json({ message: "No active QR tokens found" });
      }

      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      await Promise.all(outletTokens.map(async (token) => {
        const url = `${req.protocol}://${req.get("host")}/table?qr=${token.token}`;
        const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 });
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
        const rawLabel = token.label ?? token.token;
        const safeLabel = rawLabel.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 80);
        zip.file(`table-${safeLabel}.png`, base64, { base64: true });
      }));

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="qr-codes.zip"`);
      res.send(zipBuffer);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/outlets/:id/qr-settings", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outlet = await storage.getOutlet(req.params.id, user.tenantId);
      if (!outlet || outlet.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Outlet not found" });
      }
      const { rows } = await pool.query(
        `SELECT qr_request_settings FROM outlets WHERE id = $1`,
        [req.params.id]
      );
      res.json({ qrRequestSettings: rows[0]?.qr_request_settings ?? null });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/outlets/:id/qr-settings", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const outlet = await storage.getOutlet(req.params.id, user.tenantId);
      if (!outlet || outlet.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Outlet not found" });
      }
      const { settings } = req.body;
      if (!settings || typeof settings !== "object") {
        return res.status(400).json({ message: "settings object is required" });
      }
      await pool.query(
        `UPDATE outlets SET qr_request_settings = $1 WHERE id = $2`,
        [JSON.stringify(settings), req.params.id]
      );
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}

export function startEscalationJob(): void {
  setInterval(async () => {
    try {
      const live = await pool.query<{
        id: string;
        tenant_id: string;
        priority: string;
        status: string;
        created_at: Date;
        escalated_at: Date | null;
      }>(`
        SELECT id, tenant_id, priority, status, created_at, escalated_at
        FROM table_requests
        WHERE status IN ('pending', 'pending_confirmation', 'acknowledged')
          AND escalated_at IS NULL
      `);

      const now = Date.now();
      for (const row of live.rows) {
        const ageMinutes = (now - new Date(row.created_at).getTime()) / 60000;
        const threshold = ESCALATION_MINUTES[row.priority] ?? 5;
        if (ageMinutes >= threshold) {
          await pool.query(
            `UPDATE table_requests SET escalated_at = now() WHERE id = $1`,
            [row.id]
          );
          const updated = await storage.getTableRequest(row.id);
          if (updated) {
            emitToTenant(row.tenant_id, "table-request:escalated", { request: updated });
          }
        }
      }
    } catch (err) {
      console.error("[EscalationJob] Error:", err);
    }
  }, 60 * 1000);
}

// Cleanup job for expired QR table sessions — runs on server start
export async function cleanupExpiredQrSessions(): Promise<void> {
  try {
    await pool.query(
      `UPDATE table_qr_sessions SET is_active = false
       WHERE is_active = true AND expires_at IS NOT NULL AND expires_at < NOW()`
    );
  } catch (err) {
    console.error("[QrSessionCleanup] Error:", err);
  }
}
