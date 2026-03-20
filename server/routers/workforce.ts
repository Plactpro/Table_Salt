import type { Express } from "express";
import { storage } from "../storage";
import { requireRole } from "../middleware";

export function registerWorkforceRoutes(app: Express): void {
  const parseHours = (start: string, end: string) => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let h = (eh * 60 + em) - (sh * 60 + sm);
    if (h < 0) h += 24 * 60;
    return h / 60;
  };

  const defaultRates: Record<string, number> = { owner: 50, manager: 35, waiter: 18, kitchen: 20, accountant: 30 };

  const getRate = (u: { hourlyRate?: string | null; role: string }, schedRate?: string | null) => {
    if (schedRate) return parseFloat(schedRate);
    if (u.hourlyRate) return parseFloat(u.hourlyRate);
    return defaultRates[u.role] || 18;
  };

  const getOvertimeRate = (u: { overtimeRate?: string | null; hourlyRate?: string | null; role: string }) => {
    if (u.overtimeRate) return parseFloat(u.overtimeRate);
    return getRate(u) * 1.5;
  };

  app.get("/api/workforce/dashboard", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = String(user.tenantId);
      const period = String(req.query.period || "week");
      const now = new Date();
      const from = new Date(now);
      if (period === "day") { from.setHours(0, 0, 0, 0); }
      else if (period === "month") { from.setDate(1); from.setHours(0, 0, 0, 0); }
      else { from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0); }

      const schedules = await storage.getStaffSchedulesByTenant(tenantId);
      const allUsers = await storage.getUsersByTenant(tenantId);
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const outlets = await storage.getOutletsByTenant(tenantId);
      const outletMap = new Map(outlets.map(o => [o.id, o]));
      const attendanceLogs = await storage.getAttendanceLogsByTenant(tenantId, from, now);

      const periodSchedules = schedules.filter(s => {
        const d = new Date(s.date);
        return d >= from && d <= now;
      });

      const orders = await storage.getOrdersByTenant(tenantId);
      const periodOrders = orders.filter(o => {
        const d = new Date(o.createdAt!);
        return d >= from && d <= now && o.status !== "voided" && o.status !== "cancelled";
      });
      const totalSales = periodOrders.reduce((sum, o) => sum + parseFloat(o.total || "0"), 0);

      const standardHoursPerDay = 8;
      let totalScheduledHours = 0, totalActualHours = 0, totalScheduledCost = 0, totalActualCost = 0;
      let totalOvertimeHours = 0, totalOvertimeCost = 0;
      const byRole: Record<string, { scheduledHours: number; actualHours: number; scheduledCost: number; actualCost: number; headcount: Set<string> }> = {};
      const byOutlet: Record<string, { name: string; scheduledHours: number; actualHours: number; scheduledCost: number; actualCost: number; sales: number; headcount: Set<string> }> = {};
      const byDay: Record<string, { date: string; scheduledCost: number; actualCost: number; sales: number }> = {};

      for (const s of periodSchedules) {
        const u = userMap.get(s.userId);
        if (!u) continue;
        const hours = parseHours(s.startTime, s.endTime);
        const rate = getRate(u, s.hourlyRate);
        const cost = hours * rate;
        totalScheduledHours += hours;
        totalScheduledCost += cost;
        const role = s.role || u.role;
        if (!byRole[role]) byRole[role] = { scheduledHours: 0, actualHours: 0, scheduledCost: 0, actualCost: 0, headcount: new Set() };
        byRole[role].scheduledHours += hours;
        byRole[role].scheduledCost += cost;
        byRole[role].headcount.add(s.userId);
        const oid = s.outletId || "main";
        const oName = s.outletId ? (outletMap.get(s.outletId)?.name || "Unknown") : "Main";
        if (!byOutlet[oid]) byOutlet[oid] = { name: oName, scheduledHours: 0, actualHours: 0, scheduledCost: 0, actualCost: 0, sales: 0, headcount: new Set() };
        byOutlet[oid].scheduledHours += hours;
        byOutlet[oid].scheduledCost += cost;
        byOutlet[oid].headcount.add(s.userId);
        const dateKey = new Date(s.date).toISOString().split("T")[0];
        if (!byDay[dateKey]) byDay[dateKey] = { date: dateKey, scheduledCost: 0, actualCost: 0, sales: 0 };
        byDay[dateKey].scheduledCost += cost;
      }

      const scheduleByUserDate = new Map<string, (typeof periodSchedules)[0]>();
      for (const s of periodSchedules) {
        scheduleByUserDate.set(`${s.userId}|${new Date(s.date).toISOString().split("T")[0]}`, s);
      }

      for (const log of attendanceLogs) {
        const u = userMap.get(log.userId);
        if (!u) continue;
        const hours = parseFloat(log.hoursWorked || "0");
        const rate = getRate(u);
        const otRate = getOvertimeRate(u);
        const regularHours = Math.min(hours, standardHoursPerDay);
        const overtimeHours = Math.max(0, hours - standardHoursPerDay);
        const cost = regularHours * rate + overtimeHours * otRate;
        totalActualHours += hours;
        totalActualCost += cost;
        totalOvertimeHours += overtimeHours;
        totalOvertimeCost += overtimeHours * otRate;
        const role = u.role;
        if (!byRole[role]) byRole[role] = { scheduledHours: 0, actualHours: 0, scheduledCost: 0, actualCost: 0, headcount: new Set() };
        byRole[role].actualHours += hours;
        byRole[role].actualCost += cost;
        byRole[role].headcount.add(log.userId);
        const dateKey = new Date(log.date).toISOString().split("T")[0];
        if (!byDay[dateKey]) byDay[dateKey] = { date: dateKey, scheduledCost: 0, actualCost: 0, sales: 0 };
        byDay[dateKey].actualCost += cost;
        const matchedSchedule = scheduleByUserDate.get(`${log.userId}|${dateKey}`);
        const oid = matchedSchedule?.outletId || "main";
        const oName = matchedSchedule?.outletId ? (outletMap.get(matchedSchedule.outletId)?.name || "Unknown") : "Main";
        if (!byOutlet[oid]) byOutlet[oid] = { name: oName, scheduledHours: 0, actualHours: 0, scheduledCost: 0, actualCost: 0, sales: 0, headcount: new Set() };
        byOutlet[oid].actualHours += hours;
        byOutlet[oid].actualCost += cost;
        byOutlet[oid].headcount.add(log.userId);
      }

      for (const o of periodOrders) {
        const dateKey = new Date(o.createdAt!).toISOString().split("T")[0];
        if (!byDay[dateKey]) byDay[dateKey] = { date: dateKey, scheduledCost: 0, actualCost: 0, sales: 0 };
        byDay[dateKey].sales += parseFloat(o.total || "0");
        if (o.outletId) {
          const oid = o.outletId;
          if (byOutlet[oid]) byOutlet[oid].sales += parseFloat(o.total || "0");
        }
      }

      const byHour: Record<string, { hour: number; scheduledCost: number; actualCost: number; sales: number }> = {};
      for (const s of periodSchedules) {
        const u = userMap.get(s.userId); if (!u) continue;
        const rate = getRate(u, s.hourlyRate);
        const [sh] = s.startTime.split(":").map(Number);
        const [eh] = s.endTime.split(":").map(Number);
        const endH = eh <= sh ? eh + 24 : eh;
        for (let h = sh; h < endH; h++) {
          const hKey = String(h % 24).padStart(2, "0");
          if (!byHour[hKey]) byHour[hKey] = { hour: h % 24, scheduledCost: 0, actualCost: 0, sales: 0 };
          byHour[hKey].scheduledCost += rate;
        }
      }
      for (const log of attendanceLogs) {
        const u = userMap.get(log.userId); if (!u) continue;
        const rate = getRate(u);
        const clockIn = log.clockIn ? new Date(log.clockIn) : null;
        if (clockIn) {
          const startH = clockIn.getHours();
          const hours = parseFloat(log.hoursWorked || "0");
          const endH = startH + Math.ceil(hours);
          for (let h = startH; h < endH; h++) {
            const hKey = String(h % 24).padStart(2, "0");
            if (!byHour[hKey]) byHour[hKey] = { hour: h % 24, scheduledCost: 0, actualCost: 0, sales: 0 };
            byHour[hKey].actualCost += rate;
          }
        }
      }
      for (const o of periodOrders) {
        const h = new Date(o.createdAt!).getHours();
        const hKey = String(h).padStart(2, "0");
        if (!byHour[hKey]) byHour[hKey] = { hour: h, scheduledCost: 0, actualCost: 0, sales: 0 };
        byHour[hKey].sales += parseFloat(o.total || "0");
      }

      const labourPct = totalSales > 0 ? (totalActualCost / totalSales) * 100 : 0;
      const salesPerLabourHour = totalActualHours > 0 ? totalSales / totalActualHours : 0;

      const tenant = await storage.getTenant(tenantId);
      const modConfig = (tenant?.moduleConfig || {}) as Record<string, unknown>;
      const labourTargetPct = parseFloat(String(modConfig.labourTargetPct || "30"));

      res.json({
        kpis: {
          totalScheduledHours: parseFloat(totalScheduledHours.toFixed(2)),
          totalActualHours: parseFloat(totalActualHours.toFixed(2)),
          totalScheduledCost: parseFloat(totalScheduledCost.toFixed(2)),
          totalActualCost: parseFloat(totalActualCost.toFixed(2)),
          totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
          totalOvertimeCost: parseFloat(totalOvertimeCost.toFixed(2)),
          totalSales: parseFloat(totalSales.toFixed(2)),
          labourPct: parseFloat(labourPct.toFixed(1)),
          salesPerLabourHour: parseFloat(salesPerLabourHour.toFixed(2)),
          labourTargetPct,
          headcount: new Set(periodSchedules.map(s => s.userId)).size,
        },
        byRole: Object.entries(byRole).map(([role, d]) => ({
          role, scheduledHours: parseFloat(d.scheduledHours.toFixed(2)), actualHours: parseFloat(d.actualHours.toFixed(2)),
          scheduledCost: parseFloat(d.scheduledCost.toFixed(2)), actualCost: parseFloat(d.actualCost.toFixed(2)),
          headcount: d.headcount.size,
        })),
        byOutlet: Object.entries(byOutlet).map(([id, d]) => ({
          outletId: id, name: d.name,
          scheduledHours: parseFloat(d.scheduledHours.toFixed(2)), actualHours: parseFloat(d.actualHours.toFixed(2)),
          scheduledCost: parseFloat(d.scheduledCost.toFixed(2)), actualCost: parseFloat(d.actualCost.toFixed(2)),
          sales: parseFloat(d.sales.toFixed(2)), labourPct: d.sales > 0 ? parseFloat(((d.actualCost / d.sales) * 100).toFixed(1)) : 0,
          headcount: d.headcount.size,
        })),
        byDay: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
          ...d, scheduledCost: parseFloat(d.scheduledCost.toFixed(2)),
          actualCost: parseFloat(d.actualCost.toFixed(2)), sales: parseFloat(d.sales.toFixed(2)),
          labourPct: d.sales > 0 ? parseFloat(((d.actualCost / d.sales) * 100).toFixed(1)) : 0,
        })),
        byHour: Object.values(byHour).sort((a, b) => a.hour - b.hour).map(h => ({
          hour: h.hour, label: `${String(h.hour).padStart(2, "0")}:00`,
          scheduledCost: parseFloat(h.scheduledCost.toFixed(2)), actualCost: parseFloat(h.actualCost.toFixed(2)),
          sales: parseFloat(h.sales.toFixed(2)),
          labourPct: h.sales > 0 ? parseFloat(((h.actualCost / h.sales) * 100).toFixed(1)) : 0,
        })),
        period,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/workforce/timesheet", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = String(user.tenantId);
      const fromStr = String(req.query.from || "");
      const toStr = String(req.query.to || "");
      const now = new Date();
      const from = fromStr ? new Date(fromStr) : (() => { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0); return d; })();
      const to = toStr ? (() => { const d = new Date(toStr); d.setHours(23,59,59,999); return d; })() : now;

      const schedules = await storage.getStaffSchedulesByTenant(tenantId);
      const allUsers = await storage.getUsersByTenant(tenantId);
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const logs = await storage.getAttendanceLogsByTenant(tenantId, from, to);
      const logsByUser = new Map<string, typeof logs>();
      for (const l of logs) {
        if (!logsByUser.has(l.userId)) logsByUser.set(l.userId, []);
        logsByUser.get(l.userId)!.push(l);
      }

      const periodSchedules = schedules.filter(s => { const d = new Date(s.date); return d >= from && d <= to; });
      const schedByUser = new Map<string, typeof periodSchedules>();
      for (const s of periodSchedules) {
        if (!schedByUser.has(s.userId)) schedByUser.set(s.userId, []);
        schedByUser.get(s.userId)!.push(s);
      }

      const allUserIds = new Set([...Array.from(schedByUser.keys()), ...Array.from(logsByUser.keys())]);
      const rows = Array.from(allUserIds).map(userId => {
        const u = userMap.get(userId);
        if (!u) return null;
        const userScheds = schedByUser.get(userId) || [];
        const userLogs = logsByUser.get(userId) || [];
        let scheduledHours = 0; let actualHours = 0;
        for (const s of userScheds) scheduledHours += parseHours(s.startTime, s.endTime);
        for (const l of userLogs) actualHours += parseFloat(l.hoursWorked || "0");
        const rate = getRate(u);
        const otRate = u.overtimeRate ? parseFloat(u.overtimeRate) : rate * 1.5;
        const overtimeHours = Math.max(0, actualHours - scheduledHours);
        const regularHours = actualHours - overtimeHours;
        const actualCost = regularHours * rate + overtimeHours * otRate;
        const scheduledCost = scheduledHours * rate;
        return {
          userId, name: u.name, role: u.role, hourlyRate: rate,
          scheduledHours: parseFloat(scheduledHours.toFixed(2)),
          actualHours: parseFloat(actualHours.toFixed(2)),
          overtimeHours: parseFloat(overtimeHours.toFixed(2)),
          scheduledCost: parseFloat(scheduledCost.toFixed(2)),
          actualCost: parseFloat(actualCost.toFixed(2)),
          variance: parseFloat((actualCost - scheduledCost).toFixed(2)),
          shiftsScheduled: userScheds.length,
          shiftsWorked: userLogs.length,
        };
      }).filter(Boolean);

      res.json({ rows, from: from.toISOString(), to: to.toISOString() });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/workforce/timesheet/csv", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = String(user.tenantId);
      const fromStr = String(req.query.from || "");
      const toStr = String(req.query.to || "");
      const now = new Date();
      const from = fromStr ? new Date(fromStr) : (() => { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0); return d; })();
      const to = toStr ? (() => { const d = new Date(toStr); d.setHours(23,59,59,999); return d; })() : now;

      const schedules = await storage.getStaffSchedulesByTenant(tenantId);
      const allUsers = await storage.getUsersByTenant(tenantId);
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const logs = await storage.getAttendanceLogsByTenant(tenantId, from, to);
      const logsByUser = new Map<string, typeof logs>();
      for (const l of logs) { if (!logsByUser.has(l.userId)) logsByUser.set(l.userId, []); logsByUser.get(l.userId)!.push(l); }
      const periodSchedules = schedules.filter(s => { const d = new Date(s.date); return d >= from && d <= to; });
      const schedByUser = new Map<string, typeof periodSchedules>();
      for (const s of periodSchedules) { if (!schedByUser.has(s.userId)) schedByUser.set(s.userId, []); schedByUser.get(s.userId)!.push(s); }

      const allUserIds = new Set([...Array.from(schedByUser.keys()), ...Array.from(logsByUser.keys())]);
      const csvLines = ["Name,Role,Hourly Rate,Scheduled Hours,Actual Hours,Overtime Hours,Scheduled Cost,Actual Cost,Variance,Shifts Scheduled,Shifts Worked"];
      for (const userId of allUserIds) {
        const u = userMap.get(userId); if (!u) continue;
        const userScheds = schedByUser.get(userId) || [];
        const userLogs = logsByUser.get(userId) || [];
        let scheduledHours = 0; let actualHours = 0;
        for (const s of userScheds) scheduledHours += parseHours(s.startTime, s.endTime);
        for (const l of userLogs) actualHours += parseFloat(l.hoursWorked || "0");
        const rate = getRate(u);
        const otRate = u.overtimeRate ? parseFloat(u.overtimeRate) : rate * 1.5;
        const overtimeHours = Math.max(0, actualHours - scheduledHours);
        const regularHours = actualHours - overtimeHours;
        const actualCost = regularHours * rate + overtimeHours * otRate;
        const scheduledCost = scheduledHours * rate;
        csvLines.push(`"${u.name}",${u.role},${rate},${scheduledHours.toFixed(2)},${actualHours.toFixed(2)},${overtimeHours.toFixed(2)},${scheduledCost.toFixed(2)},${actualCost.toFixed(2)},${(actualCost - scheduledCost).toFixed(2)},${userScheds.length},${userLogs.length}`);
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="timesheet_${from.toISOString().split("T")[0]}_${to.toISOString().split("T")[0]}.csv"`);
      res.send(csvLines.join("\n"));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/workforce/alerts", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = String(user.tenantId);
      const tenant = await storage.getTenant(tenantId);
      const modConfig = (tenant?.moduleConfig || {}) as Record<string, unknown>;
      const labourTargetPct = parseFloat(String(modConfig.labourTargetPct || "30"));

      const now = new Date();
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 6); weekAgo.setHours(0,0,0,0);
      const schedules = await storage.getStaffSchedulesByTenant(tenantId);
      const allUsers = await storage.getUsersByTenant(tenantId);
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const logs = await storage.getAttendanceLogsByTenant(tenantId, weekAgo, now);
      const orders = await storage.getOrdersByTenant(tenantId);

      const byDay: Record<string, { cost: number; sales: number }> = {};
      for (const log of logs) {
        const u = userMap.get(log.userId); if (!u) continue;
        const rate = u.hourlyRate ? parseFloat(u.hourlyRate) : (defaultRates[u.role] || 18);
        const hours = parseFloat(log.hoursWorked || "0");
        const dateKey = new Date(log.date).toISOString().split("T")[0];
        if (!byDay[dateKey]) byDay[dateKey] = { cost: 0, sales: 0 };
        byDay[dateKey].cost += hours * rate;
      }
      for (const s of schedules.filter(s => { const d = new Date(s.date); return d >= weekAgo && d <= now; })) {
        const u = userMap.get(s.userId); if (!u) continue;
        const dateKey = new Date(s.date).toISOString().split("T")[0];
        if (!byDay[dateKey]) byDay[dateKey] = { cost: 0, sales: 0 };
      }
      for (const o of orders.filter(o => { const d = new Date(o.createdAt!); return d >= weekAgo && d <= now && o.status !== "voided" && o.status !== "cancelled"; })) {
        const dateKey = new Date(o.createdAt!).toISOString().split("T")[0];
        if (!byDay[dateKey]) byDay[dateKey] = { cost: 0, sales: 0 };
        byDay[dateKey].sales += parseFloat(o.total || "0");
      }

      const alerts = Object.entries(byDay)
        .filter(([, d]) => d.sales > 0 && (d.cost / d.sales) * 100 > labourTargetPct)
        .map(([date, d]) => ({
          date, labourCost: parseFloat(d.cost.toFixed(2)), sales: parseFloat(d.sales.toFixed(2)),
          labourPct: parseFloat(((d.cost / d.sales) * 100).toFixed(1)), target: labourTargetPct,
          severity: ((d.cost / d.sales) * 100) > labourTargetPct * 1.2 ? "critical" : "warning",
        }))
        .sort((a, b) => b.labourPct - a.labourPct);

      const overtimeAlerts = logs.filter(l => parseFloat(l.hoursWorked || "0") > 8).map(l => {
        const u = userMap.get(l.userId);
        return { date: new Date(l.date).toISOString().split("T")[0], userId: l.userId, name: u?.name || "—", hours: parseFloat(l.hoursWorked || "0"), overtimeHours: parseFloat(l.hoursWorked || "0") - 8 };
      });

      res.json({ labourTargetPct, costAlerts: alerts, overtimeAlerts });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/workforce/snapshots", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = String(user.tenantId);
      const fromStr = String(req.query.from || "");
      const toStr = String(req.query.to || "");
      const now = new Date();
      const from = fromStr ? new Date(fromStr) : (() => { const d = new Date(now); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0); return d; })();
      const to = toStr ? new Date(toStr) : now;
      res.json(await storage.getLabourCostSnapshots(tenantId, from, to));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/workforce/snapshots/generate", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = String(user.tenantId);
      const dateStr = String(req.body.date || "");
      const targetDate = dateStr ? new Date(dateStr) : (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })();
      targetDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDate); nextDay.setDate(nextDay.getDate() + 1);

      const schedules = await storage.getStaffSchedulesByTenant(tenantId);
      const allUsers = await storage.getUsersByTenant(tenantId);
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const logs = await storage.getAttendanceLogsByTenant(tenantId, targetDate, nextDay);
      const orders = await storage.getOrdersByTenant(tenantId);

      const daySchedules = schedules.filter(s => { const d = new Date(s.date); d.setHours(0,0,0,0); return d.getTime() === targetDate.getTime(); });
      const dayOrders = orders.filter(o => { const d = new Date(o.createdAt!); return d >= targetDate && d < nextDay && o.status !== "voided" && o.status !== "cancelled"; });
      const totalSales = dayOrders.reduce((s, o) => s + parseFloat(o.total || "0"), 0);

      const standardHours = 8;
      const byRole: Record<string, { scheduledHrs: number; actualHrs: number; overtimeHrs: number; scheduledCost: number; actualCost: number; overtimeCost: number; headcount: Set<string> }> = {};

      for (const s of daySchedules) {
        const u = userMap.get(s.userId); if (!u) continue;
        const hrs = parseHours(s.startTime, s.endTime);
        const rate = s.hourlyRate ? parseFloat(s.hourlyRate) : (u.hourlyRate ? parseFloat(u.hourlyRate) : (defaultRates[u.role] || 18));
        const role = s.role || u.role;
        if (!byRole[role]) byRole[role] = { scheduledHrs: 0, actualHrs: 0, overtimeHrs: 0, scheduledCost: 0, actualCost: 0, overtimeCost: 0, headcount: new Set() };
        byRole[role].scheduledHrs += hrs;
        byRole[role].scheduledCost += hrs * rate;
        byRole[role].headcount.add(s.userId);
      }

      for (const log of logs) {
        const u = userMap.get(log.userId); if (!u) continue;
        const hrs = parseFloat(log.hoursWorked || "0");
        const rate = u.hourlyRate ? parseFloat(u.hourlyRate) : (defaultRates[u.role] || 18);
        const otRate = u.overtimeRate ? parseFloat(u.overtimeRate) : rate * 1.5;
        const regularHrs = Math.min(hrs, standardHours);
        const overtimeHrs = Math.max(0, hrs - standardHours);
        const role = u.role;
        if (!byRole[role]) byRole[role] = { scheduledHrs: 0, actualHrs: 0, overtimeHrs: 0, scheduledCost: 0, actualCost: 0, overtimeCost: 0, headcount: new Set() };
        byRole[role].actualHrs += hrs;
        byRole[role].overtimeHrs += overtimeHrs;
        byRole[role].actualCost += regularHrs * rate + overtimeHrs * otRate;
        byRole[role].overtimeCost += overtimeHrs * otRate;
        byRole[role].headcount.add(log.userId);
      }

      const created: Array<Record<string, unknown>> = [];
      for (const [role, d] of Object.entries(byRole)) {
        const snapshot = await storage.createLabourCostSnapshot({
          tenantId, date: targetDate, role,
          scheduledHours: String(d.scheduledHrs.toFixed(2)),
          actualHours: String(d.actualHrs.toFixed(2)),
          overtimeHours: String(d.overtimeHrs.toFixed(2)),
          scheduledCost: String(d.scheduledCost.toFixed(2)),
          actualCost: String(d.actualCost.toFixed(2)),
          overtimeCost: String(d.overtimeCost.toFixed(2)),
          salesRevenue: String(totalSales.toFixed(2)),
          labourPct: totalSales > 0 ? String(((d.actualCost / totalSales) * 100).toFixed(1)) : "0",
          headcount: d.headcount.size,
        });
        created.push(snapshot);
      }

      res.json({ date: targetDate.toISOString().split("T")[0], snapshotsCreated: created.length, snapshots: created });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/workforce/settings", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = String(user.tenantId);
      const { labourTargetPct } = req.body;
      const parsed = parseFloat(labourTargetPct);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) return res.status(400).json({ message: "labourTargetPct must be a number between 0 and 100" });
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      const modConfig = (tenant.moduleConfig || {}) as Record<string, unknown>;
      modConfig.labourTargetPct = parsed;
      await storage.updateTenant(tenantId, { moduleConfig: modConfig });
      res.json({ success: true, labourTargetPct: modConfig.labourTargetPct });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
