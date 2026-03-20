import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "../auth";

export function registerAttendanceRoutes(app: Express): void {
  app.get("/api/attendance/status", requireAuth, async (req, res) => {
    const user = req.user as any;
    const log = await storage.getTodayAttendanceForUser(user.id, user.tenantId);
    res.json(log || null);
  });

  app.get("/api/attendance", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      let from: Date | undefined;
      let to: Date | undefined;
      if (req.query.from) { const d = new Date(req.query.from as string); if (!isNaN(d.getTime())) from = d; }
      if (req.query.to) { const d = new Date(req.query.to as string); if (!isNaN(d.getTime())) to = d; }
      if (!["owner", "manager"].includes(user.role)) {
        const logs = await storage.getAttendanceLogsByUser(user.id, user.tenantId, from, to);
        return res.json(logs);
      }
      const logs = await storage.getAttendanceLogsByTenant(user.tenantId, from, to);
      res.json(logs);
    } catch (err: any) {
      console.error("[Attendance Error]", err);
      res.json([]);
    }
  });

  app.get("/api/attendance/summary", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!["owner", "manager"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const now = new Date();
      let from = new Date(now.getFullYear(), now.getMonth(), 1);
      let to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      if (req.query.from) { const d = new Date(req.query.from as string); if (!isNaN(d.getTime())) from = d; }
      if (req.query.to) { const d = new Date(req.query.to as string); if (!isNaN(d.getTime())) to = d; }
      const summary = await storage.getAttendanceSummary(user.tenantId, from, to);
      res.json(summary);
    } catch (err: any) {
      console.error("[Summary Error]", err);
      res.json([]);
    }
  });

  app.get("/api/attendance/settings", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tenant = await storage.getTenant(user.tenantId);
    const config = (tenant?.moduleConfig as any) || {};
    res.json({ lateThresholdMinutes: config.lateThresholdMinutes || 15 });
  });

  app.put("/api/attendance/settings", requireAuth, async (req, res) => {
    const user = req.user as any;
    if (!["owner", "manager"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    const { lateThresholdMinutes } = req.body;
    const tenant = await storage.getTenant(user.tenantId);
    const existingConfig = (tenant?.moduleConfig as any) || {};
    await storage.updateTenant(user.tenantId, { moduleConfig: { ...existingConfig, lateThresholdMinutes: lateThresholdMinutes || 15 } } as any);
    res.json({ lateThresholdMinutes: lateThresholdMinutes || 15 });
  });

  app.post("/api/attendance/clock-in", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getTodayAttendanceForUser(user.id, user.tenantId);
      if (existing && !existing.clockOut) {
        return res.status(400).json({ message: "Already clocked in today" });
      }
      if (existing && existing.clockOut) {
        return res.status(400).json({ message: "Already completed a shift today" });
      }

      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);

      const schedules = await storage.getStaffSchedulesByTenant(user.tenantId);
      const todayStr = today.toISOString().split("T")[0];
      const myShift = schedules.find((s) => {
        const schedDate = new Date(s.date).toISOString().split("T")[0];
        return s.userId === user.id && schedDate === todayStr;
      });

      let status = "on_time";
      let lateMinutes = 0;
      let scheduleId: string | undefined;

      const tenant = await storage.getTenant(user.tenantId);
      const tenantConfig = (tenant?.moduleConfig as any) || {};
      const lateThreshold = tenantConfig.lateThresholdMinutes || 15;

      if (myShift) {
        scheduleId = myShift.id;
        const [shiftHour, shiftMin] = myShift.startTime.split(":").map(Number);
        const shiftStart = new Date(today);
        shiftStart.setHours(shiftHour, shiftMin, 0, 0);
        const diffMs = now.getTime() - shiftStart.getTime();
        lateMinutes = Math.max(0, Math.floor(diffMs / 60000));
        if (lateMinutes >= lateThreshold) {
          status = "late";
        }
      }

      const log = await storage.createAttendanceLog({
        tenantId: user.tenantId,
        userId: user.id,
        scheduleId: scheduleId || null,
        date: today,
        clockIn: now,
        clockOut: null,
        hoursWorked: null,
        status,
        lateMinutes,
        notes: req.body.notes || null,
      });

      if (myShift) {
        await storage.updateStaffScheduleByTenant(myShift.id, user.tenantId, {
          attendance: status === "late" ? "late" : "present",
        });
      }

      res.json(log);
    } catch (err: any) {
      console.error("[Clock-In Error]", err);
      res.status(500).json({ message: "Failed to clock in" });
    }
  });

  app.post("/api/attendance/clock-out", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getTodayAttendanceForUser(user.id, user.tenantId);
      if (!existing) {
        return res.status(400).json({ message: "No clock-in record found for today" });
      }
      if (existing.clockOut) {
        return res.status(400).json({ message: "Already clocked out today" });
      }

      const now = new Date();
      const clockInTime = new Date(existing.clockIn);
      const diffMs = now.getTime() - clockInTime.getTime();
      const hoursWorked = (diffMs / 3600000).toFixed(2);

      const log = await storage.updateAttendanceLog(existing.id, user.tenantId, {
        clockOut: now,
        hoursWorked,
        notes: req.body.notes || existing.notes,
      });

      res.json(log);
    } catch (err: any) {
      console.error("[Clock-Out Error]", err);
      res.status(500).json({ message: "Failed to clock out" });
    }
  });
}
