import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { emitToTenant } from "../realtime";
import { pool } from "../db";
import {
  autoAssignTicket,
  selfAssignTicket,
  startAssignment,
  completeAssignment,
  reassignTicket,
  managerAssign,
  rebalanceAssignments,
  startEscalationChecker,
  DEFAULT_ASSIGNMENT_SETTINGS,
} from "../services/chef-assignment";

export function registerKitchenAssignmentRoutes(app: Express): void {
  startEscalationChecker();

  // ── Counters ───────────────────────────────────────────────────────────────
  app.get("/api/counters", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.query.outletId as string | undefined;
      const counters = await storage.getCounters(user.tenantId, outletId);
      res.json(counters);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/counters", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const counter = await storage.createCounter({ ...req.body, tenantId: user.tenantId });
      emitToTenant(user.tenantId, "counter:updated", counter);
      res.status(201).json(counter);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/counters/:id", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const counter = await storage.updateCounter(req.params.id, user.tenantId, req.body);
      if (!counter) return res.status(404).json({ message: "Counter not found" });
      emitToTenant(user.tenantId, "counter:updated", counter);
      res.json(counter);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/counters/:id", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteCounter(req.params.id, user.tenantId);
      emitToTenant(user.tenantId, "counter:updated", { id: req.params.id, deleted: true });
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Roster ─────────────────────────────────────────────────────────────────
  app.get("/api/roster", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, date, weekStart, weekEnd } = req.query as Record<string, string | undefined>;
      if (weekStart && weekEnd) {
        const { rows } = await pool.query(
          `SELECT * FROM chef_roster WHERE tenant_id = $1 AND shift_date >= $2 AND shift_date <= $3 ORDER BY shift_date, shift_start`,
          [user.tenantId, weekStart, weekEnd]
        );
        return res.json(rows);
      }
      const entries = await storage.getRoster(user.tenantId, outletId, date);
      res.json(entries);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/roster", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { id, ...rest } = req.body;
      if (id) {
        const updated = await storage.updateRosterEntry(id, user.tenantId, rest);
        if (!updated) return res.status(404).json({ message: "Entry not found" });
        return res.json(updated);
      }
      const entry = await storage.createRosterEntry({ ...rest, tenantId: user.tenantId, createdBy: user.id });
      res.status(201).json(entry);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/roster/:id", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteRosterEntry(req.params.id, user.tenantId);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/roster/copy-week", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, weekStart } = req.body;
      if (!outletId || !weekStart) return res.status(400).json({ message: "outletId and weekStart required" });
      const entries = await storage.copyLastWeekRoster(user.tenantId, outletId, weekStart);
      res.json(entries);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Chef Availability ──────────────────────────────────────────────────────
  app.get("/api/chef-availability/live", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.query.outletId as string | undefined;
      const date = (req.query.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
      const avail = await storage.getChefAvailability(user.tenantId, outletId, date);
      res.json(avail);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/chef-availability/:chefId/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { status } = req.body;
      const date = req.body.date ?? new Date().toISOString().slice(0, 10);
      await storage.updateChefAvailabilityStatus(req.params.chefId, user.tenantId, date, status);
      const avail = await storage.getChefAvailability(user.tenantId);
      emitToTenant(user.tenantId, "chef-availability:changed", { chefId: req.params.chefId, status });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/chef-availability/check-in", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { chefId, counterId, outletId } = req.body;
      const date = new Date().toISOString().slice(0, 10);
      const avail = await storage.upsertChefAvailability({
        tenantId: user.tenantId,
        outletId: outletId ?? null,
        chefId: chefId ?? user.id,
        counterId: counterId ?? null,
        shiftDate: date,
        status: "available",
        activeTickets: 0,
      });
      await pool.query(
        `UPDATE chef_roster SET status = 'checked_in', checked_in_at = NOW() WHERE tenant_id = $1 AND chef_id = $2 AND shift_date = $3`,
        [user.tenantId, chefId ?? user.id, date]
      );
      emitToTenant(user.tenantId, "chef-availability:changed", avail);
      res.json(avail);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Assignments ────────────────────────────────────────────────────────────
  app.get("/api/assignments/live", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.query.outletId as string | undefined;
      const assignments = await storage.getLiveAssignments(user.tenantId, outletId);
      res.json(assignments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/assignments/board", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.query.outletId as string | undefined;
      const rows = await storage.getAssignmentBoard(user.tenantId, outletId);
      const byCounter: Record<string, any> = {};
      let totalLive = 0;
      let totalWaitMs = 0;
      let waitCount = 0;
      const unassigned: any[] = [];
      const now = Date.now();
      for (const row of rows) {
        byCounter[row.counter.id] = {
          counter: row.counter,
          assignments: row.assignments,
          chefs: row.chefs,
        };
        for (const a of row.assignments) {
          totalLive++;
          if (a.status === "unassigned") unassigned.push(a);
          if (a.createdAt) {
            totalWaitMs += now - new Date(a.createdAt).getTime();
            waitCount++;
          }
        }
      }
      const avgWaitMin = waitCount > 0 ? Math.round(totalWaitMs / waitCount / 60000) : 0;
      res.json({ byCounter, unassigned, totalLive, avgWaitMin });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/assignments/analytics", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { range = "7d" } = req.query as { range?: string };
      let from: Date | undefined;
      const now = new Date();
      if (range === "1d") from = new Date(now.getTime() - 24 * 3600000);
      else if (range === "7d") from = new Date(now.getTime() - 7 * 24 * 3600000);
      else if (range === "30d") from = new Date(now.getTime() - 30 * 24 * 3600000);
      const data = await storage.getAssignmentAnalytics(user.tenantId, from);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/assignments/auto-assign", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const result = await autoAssignTicket(user.tenantId, req.body.outletId ?? user.outletId, req.body);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/assignments/self-assign", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { assignmentId } = req.body;
      if (!assignmentId) return res.status(400).json({ message: "assignmentId required" });
      const result = await selfAssignTicket(assignmentId, user.id, user.name ?? user.username, user.tenantId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/assignments/:id/start", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const result = await startAssignment(req.params.id, user.tenantId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/assignments/:id/complete", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const result = await completeAssignment(req.params.id, user.tenantId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/assignments/:id/reassign", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { reason, chefId, chefName } = req.body;
      if (!reason) return res.status(400).json({ message: "reason required" });
      const result = await reassignTicket(req.params.id, user.tenantId, reason, chefId, chefName);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/assignments/:id/manager-assign", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { chefId, chefName } = req.body;
      if (!chefId) return res.status(400).json({ message: "chefId required" });
      const result = await managerAssign(req.params.id, user.tenantId, chefId, chefName ?? chefId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/assignments/rebalance", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.body;
      if (!outletId) return res.status(400).json({ message: "outletId required" });
      const result = await rebalanceAssignments(user.tenantId, outletId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Assignment Settings per outlet ────────────────────────────────────────
  app.get("/api/outlets/:id/assignment-settings", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outlet = await storage.getOutlet(req.params.id);
      if (!outlet || outlet.tenantId !== user.tenantId) return res.status(404).json({ message: "Outlet not found" });
      const { rows } = await pool.query(`SELECT assignment_settings FROM outlets WHERE id = $1`, [req.params.id]);
      const settings = rows[0]?.assignment_settings ?? DEFAULT_ASSIGNMENT_SETTINGS;
      res.json({ ...DEFAULT_ASSIGNMENT_SETTINGS, ...settings });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/outlets/:id/assignment-settings", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const outlet = await storage.getOutlet(req.params.id);
      if (!outlet || outlet.tenantId !== user.tenantId) return res.status(404).json({ message: "Outlet not found" });
      await pool.query(`UPDATE outlets SET assignment_settings = $1 WHERE id = $2`, [JSON.stringify(req.body), req.params.id]);
      res.json({ ...DEFAULT_ASSIGNMENT_SETTINGS, ...req.body });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
