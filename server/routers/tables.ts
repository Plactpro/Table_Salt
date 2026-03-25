import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { emitToTenant } from "../realtime";
import { returnResourcesFromTable } from "../services/resource-service";

export function registerTablesRoutes(app: Express): void {
  app.get("/api/table-zones", requireAuth, async (req, res) => {
    const user = req.user as any;
    res.json(await storage.getTableZonesByTenant(user.tenantId));
  });
  app.post("/api/table-zones", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const { tenantId: _t, id: _i, ...body } = req.body;
    const zoneName: string = body.name || "";
    if (process.env.NODE_ENV !== "development") {
      const testPattern = /(test|dup|unique)/i;
      if (testPattern.test(zoneName)) {
        return res.status(400).json({ message: "Zone name contains a reserved test pattern. Please use a different name." });
      }
    }
    res.json(await storage.createTableZone({ ...body, tenantId: user.tenantId }));
  });
  app.patch("/api/table-zones/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const { tenantId: _t, id: _i, ...body } = req.body;
    if (body.name && process.env.NODE_ENV !== "development") {
      const testPattern = /(test|dup|unique)/i;
      if (testPattern.test(body.name)) {
        return res.status(400).json({ message: "Zone name contains a reserved test pattern. Please use a different name." });
      }
    }
    const z = await storage.updateTableZone(req.params.id, user.tenantId, body);
    if (!z) return res.status(404).json({ message: "Zone not found" });
    res.json(z);
  });
  app.delete("/api/table-zones/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteTableZone(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/tables", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tbs = await storage.getTablesByTenant(user.tenantId);
    res.json(tbs);
  });

  app.post("/api/tables", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { tenantId: _t, id: _i, ...body } = req.body;
      if (!body.number && body.number !== 0) {
        return res.status(400).json({ message: "Table number is required" });
      }
      const existingTables = await storage.getTablesByTenant(user.tenantId);
      const zone = body.zone || "Main";
      const duplicate = existingTables.find(t => t.number === parseInt(body.number) && (t.zone || "Main") === zone);
      if (duplicate) {
        return res.status(409).json({ message: `Table ${body.number} already exists in zone "${zone}". Please use a different number.` });
      }
      const tbl = await storage.createTable({ ...body, tenantId: user.tenantId });
      res.json(tbl);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create table" });
    }
  });

  app.patch("/api/tables/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { tenantId: _t, id: _i, ...body } = req.body;
    const tbl = await storage.updateTableByTenant(req.params.id, user.tenantId, body);
    if (!tbl) return res.status(404).json({ message: "Table not found" });
    if (body.status) emitToTenant(user.tenantId, "table:updated", { tableId: req.params.id, status: body.status });
    res.json(tbl);
  });

  app.patch("/api/tables/:id/seat", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { partyName, partySize } = req.body;
    const tbl = await storage.updateTableByTenant(req.params.id, user.tenantId, {
      status: "occupied",
      partyName,
      partySize,
      seatedAt: new Date(),
    });
    if (!tbl) return res.status(404).json({ message: "Table not found" });
    emitToTenant(user.tenantId, "table:updated", { tableId: req.params.id, status: "occupied" });
    res.json(tbl);
  });

  app.patch("/api/tables/:id/clear", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tbl = await storage.updateTableByTenant(req.params.id, user.tenantId, {
      status: "cleaning",
      partyName: null,
      partySize: null,
      seatedAt: null,
      callServerFlag: false,
      requestBillFlag: false,
    });
    if (!tbl) return res.status(404).json({ message: "Table not found" });
    const activeSession = await storage.getActiveTableSession(req.params.id);
    if (activeSession) {
      await storage.updateTableSession(activeSession.id, { status: "closed", closedAt: new Date() });
      await storage.clearGuestCart(activeSession.id);
    }
    returnResourcesFromTable(req.params.id, user.tenantId, false).catch(() => {});
    emitToTenant(user.tenantId, "table:updated", { tableId: req.params.id, status: "cleaning" });
    res.json(tbl);
  });

  app.patch("/api/tables/:id/merge", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { targetTableId } = req.body;
    if (!targetTableId) return res.status(400).json({ message: "Target table ID required" });
    const source = await storage.getTable(req.params.id, user.tenantId);
    const target = await storage.getTable(targetTableId, user.tenantId);
    if (!source) return res.status(404).json({ message: "Source table not found" });
    if (!target) return res.status(404).json({ message: "Target table not found" });
    if (source.mergedWith) return res.status(400).json({ message: "Source table already merged" });
    if (target.mergedWith) return res.status(400).json({ message: "Target table already merged" });
    const tbl = await storage.updateTableByTenant(req.params.id, user.tenantId, {
      mergedWith: targetTableId,
    });
    res.json(tbl);
  });

  app.patch("/api/tables/:id/unmerge", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tbl = await storage.updateTableByTenant(req.params.id, user.tenantId, {
      mergedWith: null,
    });
    if (!tbl) return res.status(404).json({ message: "Table not found" });
    res.json(tbl);
  });

  app.post("/api/tables/:id/transfer", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { targetTableId } = req.body;
    if (!targetTableId) return res.status(400).json({ message: "targetTableId required" });
    const allTables = await storage.getTablesByTenant(user.tenantId);
    const source = allTables.find(t => t.id === req.params.id);
    const target = allTables.find(t => t.id === targetTableId);
    if (!source || !target) return res.status(404).json({ message: "Table not found" });
    if (source.status !== "occupied") return res.status(400).json({ message: "Source table has no party to transfer" });
    if (target.status !== "free") return res.status(400).json({ message: "Target table is not free" });
    await storage.updateTableByTenant(target.id, user.tenantId, {
      status: "occupied", partyName: source.partyName, partySize: source.partySize, seatedAt: source.seatedAt,
    });
    await storage.updateTableByTenant(source.id, user.tenantId, {
      status: "free", partyName: null, partySize: null, seatedAt: null,
    });
    const updated = await storage.getTablesByTenant(user.tenantId);
    res.json({ source: updated.find(t => t.id === source.id), target: updated.find(t => t.id === target.id) });
  });

  app.delete("/api/tables/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteTableByTenant(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/waitlist", requireAuth, async (req, res) => {
    const user = req.user as any;
    res.json(await storage.getWaitlistByTenant(user.tenantId));
  });
  app.post("/api/waitlist", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { tenantId: _t, id: _i, ...body } = req.body;
    res.json(await storage.createWaitlistEntry({ ...body, tenantId: user.tenantId }));
  });
  app.patch("/api/waitlist/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { tenantId: _t, id: _i, ...body } = req.body;
    const w = await storage.updateWaitlistEntry(req.params.id, user.tenantId, body);
    if (!w) return res.status(404).json({ message: "Entry not found" });
    res.json(w);
  });
  app.patch("/api/waitlist/:id/seat", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { tableId } = req.body;
    if (!tableId) return res.status(400).json({ message: "Table ID required" });
    const table = await storage.getTable(tableId, user.tenantId);
    if (!table) return res.status(404).json({ message: "Table not found" });
    if (table.status !== "free") return res.status(400).json({ message: "Table is not available" });
    const allWaitlist = await storage.getWaitlistByTenant(user.tenantId);
    const entry = allWaitlist.find(w => w.id === req.params.id);
    if (!entry) return res.status(404).json({ message: "Waitlist entry not found" });
    const tbl = await storage.updateTableByTenant(tableId, user.tenantId, {
      status: "occupied",
      seatedAt: new Date(),
      partyName: entry.customerName,
      partySize: entry.partySize,
    });
    if (!tbl) return res.status(404).json({ message: "Table not found" });
    const w = await storage.updateWaitlistEntry(req.params.id, user.tenantId, {
      status: "seated",
      seatedTableId: tableId,
      seatedAt: new Date(),
    });
    res.json(w);
  });
  app.delete("/api/waitlist/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    await storage.deleteWaitlistEntry(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/table-analytics", requireAuth, async (req, res) => {
    const user = req.user as any;
    const allTables = await storage.getTablesByTenant(user.tenantId);
    const totalTables = allTables.length;
    const occupied = allTables.filter(t => t.status === "occupied").length;
    const free = allTables.filter(t => t.status === "free").length;
    const reserved = allTables.filter(t => t.status === "reserved").length;
    const cleaning = allTables.filter(t => t.status === "cleaning").length;
    const blocked = allTables.filter(t => t.status === "blocked").length;
    const totalCapacity = allTables.reduce((s, t) => s + (t.capacity || 0), 0);
    const seatedGuests = allTables.filter(t => t.status === "occupied").reduce((s, t) => s + (t.partySize || 0), 0);
    const waitlistAll = await storage.getWaitlistByTenant(user.tenantId);
    const waitingEntries = waitlistAll.filter(w => w.status === "waiting");
    const waitingCount = waitingEntries.length;
    const seatedEntries = waitlistAll.filter(w => w.status === "seated" && w.createdAt && w.seatedAt);
    const avgWaitMinutes = seatedEntries.length > 0
      ? Math.round(seatedEntries.reduce((s, w) => s + (new Date(w.seatedAt!).getTime() - new Date(w.createdAt!).getTime()) / 60000, 0) / seatedEntries.length)
      : 0;
    const zones = new Map<string, { total: number; occupied: number }>();
    for (const t of allTables) {
      const z = t.zone || "Main";
      const cur = zones.get(z) || { total: 0, occupied: 0 };
      cur.total++;
      if (t.status === "occupied") cur.occupied++;
      zones.set(z, cur);
    }
    const occupiedWithTime = allTables.filter(t => t.status === "occupied" && t.seatedAt);
    const avgDiningMinutes = occupiedWithTime.length > 0
      ? Math.round(occupiedWithTime.reduce((s, t) => s + (Date.now() - new Date(t.seatedAt!).getTime()) / 60000, 0) / occupiedWithTime.length)
      : 0;
    const reservationsList = await storage.getReservationsByTenant(user.tenantId);
    const completedToday = reservationsList.filter(r => {
      if (r.status !== "completed" && r.status !== "seated") return false;
      const dt = new Date(r.dateTime);
      const today = new Date();
      return dt.toDateString() === today.toDateString();
    });
    const turnsToday = completedToday.length;
    const avgTurnTime = turnsToday > 0 ? Math.round(avgDiningMinutes * 0.8) : 0;
    const waitByHour: Record<string, number> = {};
    const waitByDay: Record<string, number> = {};
    for (const w of waitlistAll) {
      if (!w.createdAt) continue;
      const d = new Date(w.createdAt);
      const hour = d.getHours();
      const key = `${hour}:00`;
      waitByHour[key] = (waitByHour[key] || 0) + 1;
      const dayKey = d.toLocaleDateString("en-US", { weekday: "short" });
      waitByDay[dayKey] = (waitByDay[dayKey] || 0) + 1;
    }
    res.json({
      totalTables, occupied, free, reserved, cleaning, blocked,
      totalCapacity, seatedGuests,
      occupancyRate: totalTables > 0 ? Math.round((occupied / totalTables) * 100) : 0,
      waitingCount, avgWaitMinutes, avgDiningMinutes,
      turnsToday, avgTurnTime,
      byZone: Object.fromEntries(zones),
      waitByHour, waitByDay,
    });
  });

  app.post("/api/tables/:id/notify", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { channel, message } = req.body;
    const table = await storage.getTable(req.params.id, user.tenantId);
    if (!table) return res.status(404).json({ message: "Table not found" });
    console.log(`[Notification] Channel: ${channel || "sms"}, Table: T${table.number}, Message: ${message || "Your table is ready"}`);
    res.json({ sent: true, channel: channel || "sms", message: message || "Your table is ready" });
  });

  app.post("/api/waitlist/:id/notify", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { channel, message } = req.body;
    const entry = (await storage.getWaitlistByTenant(user.tenantId)).find(w => w.id === req.params.id);
    if (!entry) return res.status(404).json({ message: "Entry not found" });
    await storage.updateWaitlistEntry(req.params.id, user.tenantId, { notificationSent: true });
    console.log(`[Notification] Channel: ${channel || "sms"}, Guest: ${entry.customerName}, Phone: ${entry.customerPhone}, Message: ${message || "Your table is ready"}`);
    res.json({ sent: true, channel: channel || "sms", to: entry.customerPhone, message: message || "Your table is ready" });
  });

  app.get("/api/waitlist/estimated-wait", requireAuth, async (req, res) => {
    const user = req.user as any;
    const partySize = parseInt(req.query.partySize as string) || 2;
    const allTables = await storage.getTablesByTenant(user.tenantId);
    const waitlistAll = await storage.getWaitlistByTenant(user.tenantId);
    const waiting = waitlistAll.filter(w => w.status === "waiting");
    const freeTables = allTables.filter(t => t.status === "free" && (t.capacity || 4) >= partySize);
    if (freeTables.length > 0) {
      res.json({ estimatedMinutes: 0, freeTablesAvailable: freeTables.length });
      return;
    }
    const occupiedWithTime = allTables.filter(t => t.status === "occupied" && t.seatedAt && (t.capacity || 4) >= partySize);
    const avgDining = occupiedWithTime.length > 0
      ? occupiedWithTime.reduce((s, t) => s + (Date.now() - new Date(t.seatedAt!).getTime()) / 60000, 0) / occupiedWithTime.length
      : 45;
    const partiesAhead = waiting.filter(w => w.createdAt && new Date(w.createdAt) < new Date()).length;
    const estimatedMinutes = Math.max(5, Math.round(avgDining * 0.3 + partiesAhead * 8));
    res.json({ estimatedMinutes, partiesAhead, avgDiningMinutes: Math.round(avgDining) });
  });
}
