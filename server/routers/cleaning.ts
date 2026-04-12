import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { auditPhotoUpload, getPhotoUrl } from "../services/photo-upload";
import { pool } from "../db";
import fs from "fs";
import pathModule from "path";

export function registerCleaningRoutes(app: Express): void {
  app.get("/api/cleaning/templates", requireAuth, async (req, res) => {
    const user = req.user as any;
    const templates = await storage.getCleaningTemplatesByTenant(user.tenantId);
    res.json(templates);
  });

  app.post("/api/cleaning/templates", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...templateData } = req.body;
      const template = await storage.createCleaningTemplate({ ...templateData, tenantId: user.tenantId });
      if (items && Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
          await storage.createCleaningTemplateItem({ templateId: template.id, task: items[i].task || items[i], sortOrder: i });
        }
      }
      const templateItems = await storage.getCleaningTemplateItems(template.id);
      res.json({ ...template, items: templateItems });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/cleaning/templates/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...templateData } = req.body;
      const template = await storage.updateCleaningTemplate(req.params.id, user.tenantId, templateData);
      if (!template) return res.status(404).json({ message: "Template not found" });
      if (items && Array.isArray(items)) {
        await storage.deleteCleaningTemplateItems(template.id);
        for (let i = 0; i < items.length; i++) {
          await storage.createCleaningTemplateItem({ templateId: template.id, task: items[i].task || items[i], sortOrder: i });
        }
      }
      const templateItems = await storage.getCleaningTemplateItems(template.id);
      res.json({ ...template, items: templateItems });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/cleaning/templates/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteCleaningTemplate(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/cleaning/templates/:id/items", requireAuth, async (req, res) => {
    const user = req.user as any;
    const template = await storage.getCleaningTemplate(req.params.id);
    if (!template || template.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Template not found" });
    }
    const items = await storage.getCleaningTemplateItems(req.params.id);
    res.json(items);
  });

  app.get("/api/cleaning/logs", requireAuth, async (req, res) => {
    const user = req.user as any;
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const logs = await storage.getCleaningLogsByTenant(user.tenantId, date);
    res.json(logs);
  });

  app.post("/api/cleaning/logs", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { templateId, templateItemId, date, notes } = req.body;
      if (!templateId || !templateItemId || !date) {
        return res.status(400).json({ message: "templateId, templateItemId, and date are required" });
      }
      const template = await storage.getCleaningTemplate(templateId);
      if (!template || template.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Template not found" });
      }
      const items = await storage.getCleaningTemplateItems(templateId);
      if (!items.some(i => i.id === templateItemId)) {
        return res.status(400).json({ message: "Invalid template item" });
      }
      const existingLogs = await storage.getCleaningLogsByTenant(user.tenantId, new Date(date));
      if (existingLogs.some(l => l.templateItemId === templateItemId)) {
        return res.status(409).json({ message: "Task already completed for this date" });
      }
      const log = await storage.createCleaningLog({ templateId, templateItemId, date: new Date(date), tenantId: user.tenantId, completedBy: user.id, notes: notes || null });
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/cleaning/logs/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    await storage.deleteCleaningLog(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/cleaning/schedules", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const schedules = await storage.getCleaningSchedules(user.tenantId, date);
      res.json(schedules);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/cleaning/schedules", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { templateId, date, assignedTo } = req.body;
      if (!templateId || !date) return res.status(400).json({ message: "templateId and date are required" });
      const template = await storage.getCleaningTemplate(templateId);
      if (!template || template.tenantId !== user.tenantId) return res.status(404).json({ message: "Template not found" });
      if (assignedTo) {
        const assignee = await storage.getUser(assignedTo);
        if (!assignee || assignee.tenantId !== user.tenantId) return res.status(400).json({ message: "Invalid assignee" });
      }
      const schedule = await storage.createCleaningSchedule({ tenantId: user.tenantId, templateId, date: new Date(date), assignedTo: assignedTo || null, status: "pending" });
      res.json(schedule);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/cleaning/schedules/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const allowed: Record<string, boolean> = { assignedTo: true, status: true };
      const updates: Record<string, any> = {};
      for (const key of Object.keys(req.body)) {
        if (allowed[key]) updates[key] = req.body[key];
      }
      if (updates.assignedTo) {
        const assignee = await storage.getUser(updates.assignedTo);
        if (!assignee || assignee.tenantId !== user.tenantId) return res.status(400).json({ message: "Invalid assignee" });
      }
      const updated = await storage.updateCleaningSchedule(req.params.id, user.tenantId, updates);
      if (!updated) return res.status(404).json({ message: "Schedule not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/cleaning/compliance-report", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const allTemplates = await storage.getCleaningTemplatesByTenant(user.tenantId);
      const dayLogs = await storage.getCleaningLogsByTenant(user.tenantId, new Date(date));
      const completedItemIds = new Set(dayLogs.map(l => l.templateItemId));
      const areas: Record<string, { total: number; completed: number; templates: any[] }> = {};
      for (const template of allTemplates) {
        if (template.active === false) continue;
        const items = await storage.getCleaningTemplateItems(template.id);
        const done = items.filter(i => completedItemIds.has(i.id)).length;
        if (!areas[template.area]) areas[template.area] = { total: 0, completed: 0, templates: [] };
        areas[template.area].total += items.length;
        areas[template.area].completed += done;
        areas[template.area].templates.push({
          id: template.id, name: template.name,
          total: items.length, completed: done,
          rate: items.length > 0 ? Math.round((done / items.length) * 100) : 0,
        });
      }
      let totalAll = 0; let completedAll = 0;
      for (const a of Object.values(areas)) { totalAll += a.total; completedAll += a.completed; }
      res.json({ date, overallRate: totalAll > 0 ? Math.round((completedAll / totalAll) * 100) : 0, totalTasks: totalAll, completedTasks: completedAll, remaining: totalAll - completedAll, areas });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/audits/templates", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const templates = await storage.getAuditTemplatesByTenant(user.tenantId);
      const result = await Promise.all(templates.map(async (t) => {
        const items = await storage.getAuditTemplateItems(t.id);
        return { ...t, items };
      }));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/audits/templates", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...templateData } = req.body;
      const template = await storage.createAuditTemplate({ ...templateData, tenantId: user.tenantId });
      if (items && Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
          await storage.createAuditTemplateItem({ ...items[i], templateId: template.id, sortOrder: i });
        }
      }
      const createdItems = await storage.getAuditTemplateItems(template.id);
      res.json({ ...template, items: createdItems });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/audits/templates/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...templateData } = req.body;
      const template = await storage.updateAuditTemplate(req.params.id, user.tenantId, templateData);
      if (!template) return res.status(404).json({ message: "Not found" });
      if (items && Array.isArray(items)) {
        await storage.deleteAuditTemplateItems(template.id);
        for (let i = 0; i < items.length; i++) {
          await storage.createAuditTemplateItem({ ...items[i], templateId: template.id, sortOrder: i });
        }
      }
      const updatedItems = await storage.getAuditTemplateItems(template.id);
      res.json({ ...template, items: updatedItems });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/audits/templates/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const schedules = await storage.getAuditSchedulesByTenant(user.tenantId);
      if (schedules.some(s => s.templateId === req.params.id)) {
        return res.status(400).json({ message: "Cannot delete template with existing scheduled audits" });
      }
      await storage.deleteAuditTemplate(req.params.id, user.tenantId);
      res.json({ message: "Deleted" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/audits/schedules", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { status, from, to } = req.query as any;
      const schedules = await storage.getAuditSchedulesByTenant(user.tenantId, status || undefined, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
      res.json(schedules);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/audits/schedules", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { templateId, scheduledDate, assignedTo, notes } = req.body;
      if (!templateId || !scheduledDate) return res.status(400).json({ message: "templateId and scheduledDate required" });
      const template = await storage.getAuditTemplate(templateId);
      if (!template || template.tenantId !== user.tenantId) return res.status(404).json({ message: "Template not found" });
      if (assignedTo) {
        const assignee = await storage.getUser(assignedTo);
        if (!assignee || assignee.tenantId !== user.tenantId) return res.status(400).json({ message: "Invalid assignee" });
      }
      const items = await storage.getAuditTemplateItems(templateId);
      const maxScore = items.reduce((sum, i) => sum + (i.points || 5), 0);
      const schedule = await storage.createAuditSchedule({ tenantId: user.tenantId, templateId, scheduledDate: new Date(scheduledDate), assignedTo: assignedTo || null, notes: notes || null, status: "pending", maxScore });
      res.json(schedule);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/audits/schedules/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const schedule = await storage.getAuditSchedule(req.params.id);
      if (!schedule || schedule.tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      const template = await storage.getAuditTemplate(schedule.templateId);
      const items = await storage.getAuditTemplateItems(schedule.templateId);
      const responses = await storage.getAuditResponsesBySchedule(schedule.id);
      res.json({ ...schedule, template, items, responses });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/audits/schedules/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const allowed = ["status", "assignedTo", "totalScore", "maxScore", "completedAt", "approvedBy", "notes"] as const;
      const updates: Record<string, any> = {};
      for (const key of allowed) { if (req.body[key] !== undefined) updates[key] = req.body[key]; }
      if (updates.completedAt && typeof updates.completedAt === "string") updates.completedAt = new Date(updates.completedAt);
      if (updates.approvedBy) updates.approvedBy = user.id;
      const updated = await storage.updateAuditSchedule(req.params.id, user.tenantId, updates);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/audits/responses", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { scheduleId, itemId, status, notes, photoUrl } = req.body;
      if (!scheduleId || !itemId || !status) return res.status(400).json({ message: "scheduleId, itemId and status required" });
      if (!["pass", "fail", "na", "pending"].includes(status)) return res.status(400).json({ message: "Invalid status" });
      const schedule = await storage.getAuditSchedule(scheduleId);
      if (!schedule || schedule.tenantId !== user.tenantId) return res.status(404).json({ message: "Schedule not found" });
      const templateItems = await storage.getAuditTemplateItems(schedule.templateId);
      if (!templateItems.some(i => i.id === itemId)) return res.status(400).json({ message: "Item does not belong to this audit's template" });
      const existing = await storage.getAuditResponsesBySchedule(scheduleId);
      const existingResponse = existing.find(r => r.itemId === itemId);
      if (existingResponse) {
        const updated = await storage.updateAuditResponse(existingResponse.id, { status, notes: notes || null, photoUrl: photoUrl || null, completedBy: user.id, completedAt: new Date() });
        res.json(updated);
      } else {
        const response = await storage.createAuditResponse({ scheduleId, itemId, status, notes: notes || null, photoUrl: photoUrl || null, completedBy: user.id, completedAt: new Date() });
        res.json(response);
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/audits/issues", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { status } = req.query as any;
      const issues = await storage.getAuditIssuesByTenant(user.tenantId, status || undefined);
      res.json(issues);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/audits/issues", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { title, description, severity, scheduleId, itemId, assignedTo, dueDate } = req.body;
      if (!title || !severity) return res.status(400).json({ message: "title and severity required" });
      if (!["critical", "high", "medium", "low"].includes(severity)) return res.status(400).json({ message: "Invalid severity" });
      if (assignedTo) {
        const assignee = await storage.getUser(assignedTo);
        if (!assignee || assignee.tenantId !== user.tenantId) return res.status(400).json({ message: "Invalid assignee" });
      }
      const issue = await storage.createAuditIssue({ tenantId: user.tenantId, title, description: description || null, severity, scheduleId: scheduleId || null, itemId: itemId || null, assignedTo: assignedTo || null, dueDate: dueDate ? new Date(dueDate) : null, status: "open" });
      res.json(issue);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/audits/issues/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const allowed = ["title", "description", "severity", "status", "assignedTo", "dueDate", "resolvedAt", "resolvedBy"] as const;
      const updates: Record<string, any> = {};
      for (const key of allowed) { if (req.body[key] !== undefined) updates[key] = req.body[key]; }
      if (updates.resolvedBy) updates.resolvedBy = user.id;
      if (updates.resolvedAt && typeof updates.resolvedAt === "string") updates.resolvedAt = new Date(updates.resolvedAt);
      if (updates.dueDate && typeof updates.dueDate === "string") updates.dueDate = new Date(updates.dueDate);
      const updated = await storage.updateAuditIssue(req.params.id, user.tenantId, updates);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/audits/analytics", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const schedules = await storage.getAuditSchedulesByTenant(user.tenantId);
      const issues = await storage.getAuditIssuesByTenant(user.tenantId);
      const completed = schedules.filter(s => s.status === "completed");
      const totalScore = completed.reduce((sum, s) => sum + (s.totalScore || 0), 0);
      const totalMaxScore = completed.reduce((sum, s) => sum + (s.maxScore || 0), 0);
      const complianceScore = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
      const openIssues = issues.filter(i => i.status === "open" || i.status === "in_progress");
      const criticalIssues = openIssues.filter(i => i.severity === "critical");
      const categoryScores: Record<string, { score: number; max: number }> = {};
      for (const s of completed) {
        const tmpl = await storage.getAuditTemplate(s.templateId);
        if (tmpl) {
          const cat = tmpl.category;
          if (!categoryScores[cat]) categoryScores[cat] = { score: 0, max: 0 };
          categoryScores[cat].score += s.totalScore || 0;
          categoryScores[cat].max += s.maxScore || 0;
        }
      }
      res.json({
        complianceScore, totalAudits: schedules.length, completedAudits: completed.length,
        pendingAudits: schedules.filter(s => s.status === "pending").length,
        overdueAudits: schedules.filter(s => s.status === "overdue").length,
        openIssues: openIssues.length, criticalIssues: criticalIssues.length,
        categoryScores: Object.entries(categoryScores).map(([category, data]) => ({ category, score: data.max > 0 ? Math.round((data.score / data.max) * 100) : 0 })),
        recentAudits: completed.slice(0, 10).map(s => ({ id: s.id, date: s.scheduledDate, score: s.totalScore, maxScore: s.maxScore, percentage: s.maxScore ? Math.round(((s.totalScore || 0) / s.maxScore) * 100) : 0 })),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

    // AUDIT-PHOTOS: Upload
  app.post("/api/audit-photos/:targetType/:targetId", requireAuth, auditPhotoUpload.array("photos", 3), async (req: any, res: any) => {
    try {
      const { targetType, targetId } = req.params;
      const files = req.files as any[];
      if (!files || files.length === 0) return res.status(400).json({ message: "No photos uploaded" });
      const photoUrls = files.map((f: any) => getPhotoUrl(f.filename));
      const table = targetType === "response" ? "audit_responses" : targetType === "issue" ? "audit_issues" : "cleaning_logs";
      const { rows } = await pool.query(
        `SELECT id, COALESCE(photo_urls, '[]'::jsonb) as photo_urls FROM ${table} WHERE id = $1`,
        [targetId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Record not found" });
      const allPhotos = [...((rows[0].photo_urls as string[]) ?? []), ...photoUrls];
      await pool.query(`UPDATE ${table} SET photo_urls = $1::jsonb WHERE id = $2`, [JSON.stringify(allPhotos), targetId]);
      res.json({ success: true, photoUrls, totalPhotos: allPhotos.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // AUDIT-PHOTOS: Get
  app.get("/api/audit-photos/:targetType/:targetId", requireAuth, async (req: any, res: any) => {
    try {
      const { targetType, targetId } = req.params;
      const table = targetType === "response" ? "audit_responses" : targetType === "issue" ? "audit_issues" : "cleaning_logs";
      const { rows } = await pool.query(`SELECT COALESCE(photo_urls, '[]'::jsonb) as photo_urls FROM ${table} WHERE id = $1`, [targetId]);
      if (rows.length === 0) return res.status(404).json({ message: "Not found" });
      res.json({ photoUrls: rows[0].photo_urls });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // AUDIT-PHOTOS: Delete
  app.delete("/api/audit-photos/:targetType/:targetId/:filename", requireAuth, async (req: any, res: any) => {
    try {
      const { targetType, targetId, filename } = req.params;
      const table = targetType === "response" ? "audit_responses" : targetType === "issue" ? "audit_issues" : "cleaning_logs";
      const photoUrl = "/uploads/audit-photos/" + filename;
      const { rows } = await pool.query(`SELECT COALESCE(photo_urls, '[]'::jsonb) as photo_urls FROM ${table} WHERE id = $1`, [targetId]);
      if (rows.length === 0) return res.status(404).json({ message: "Not found" });
      const updated = ((rows[0].photo_urls as string[]) ?? []).filter((u: string) => u !== photoUrl);
      await pool.query(`UPDATE ${table} SET photo_urls = $1::jsonb WHERE id = $2`, [JSON.stringify(updated), targetId]);
      const filePath = pathModule.join(process.cwd(), "uploads", "audit-photos", filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.json({ success: true, remainingPhotos: updated.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
