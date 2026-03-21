import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { emitToTenant } from "../realtime";
import { pool } from "../db";

const REQUEST_TYPES = ["call_server", "order_food", "request_bill", "feedback", "water_refill", "cleaning", "other"] as const;
const PRIORITIES = ["low", "medium", "high"] as const;
const ESCALATION_MINUTES: Record<string, number> = {
  high: 2,
  medium: 5,
  low: 10,
};

export function registerTableRequestRoutes(app: Express): void {
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
        const outlet = await storage.getOutlet(qrToken.outletId);
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

      emitToTenant(qrToken.tenantId, "table-request:new", {
        request,
        tableId: qrToken.tableId,
      });

      res.status(201).json(request);
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

      const { staffNote } = req.body;
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

  app.put("/api/table-requests/:id/assign", requireRole("owner", "manager"), async (req, res) => {
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

  app.post("/api/qr/generate/:tableId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const table = await storage.getTable(req.params.tableId);
      if (!table || table.tenantId !== user.tenantId) return res.status(404).json({ message: "Table not found" });

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

  app.delete("/api/qr/tokens/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deactivateQrToken(req.params.id, user.tenantId);
      res.json({ success: true });
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
