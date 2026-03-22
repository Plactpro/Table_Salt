import { Router } from "express";
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
} from "../services/prep-notifications";
import { startDeadlineChecker } from "../services/prep-deadline-checker";
import { requireAuth, requireRole } from "../auth";
import { pool } from "../db";
import { emitToTenant } from "../realtime";

export function registerPrepNotificationRoutes(app: Router): void {
  startDeadlineChecker();
  app.get("/api/prep-notifications/unread-count", async (req: any, res) => {
    try {
      const tenantId: string = req.user?.tenantId;
      const chefId: string | null = req.user?.role === "kitchen" ? req.user?.id : null;
      if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
      const count = await getUnreadCount(tenantId, chefId);
      return res.json({ count });
    } catch (err) {
      console.error("[PrepNotif] unread-count error:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/prep-notifications", async (req: any, res) => {
    try {
      const tenantId: string = req.user?.tenantId;
      const chefId: string | null = req.user?.role === "kitchen" ? req.user?.id : null;
      if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;
      const { notifications, total } = await getNotifications(tenantId, chefId, limit, offset);
      const unreadCount = await getUnreadCount(tenantId, chefId);
      return res.json({ notifications, total, unreadCount, limit, offset });
    } catch (err) {
      console.error("[PrepNotif] list error:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  app.patch("/api/prep-notifications/:id/read", async (req: any, res) => {
    try {
      const tenantId: string = req.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
      await markRead(req.params.id, tenantId);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[PrepNotif] mark-read error:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/prep-notifications/read-all", async (req: any, res) => {
    try {
      const tenantId: string = req.user?.tenantId;
      const chefId: string | null = req.user?.role === "kitchen" ? req.user?.id : null;
      if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
      await markAllRead(tenantId, chefId);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[PrepNotif] read-all error:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/prep-notifications/test", async (req: any, res) => {
    try {
      const tenantId: string = req.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
      const notif = await createNotification({
        tenantId,
        chefId: null,
        type: "task_assigned",
        title: "Test notification from server",
        body: "This is a test notification to verify the system works.",
        priority: "MEDIUM",
      });
      return res.json(notif);
    } catch (err) {
      console.error("[PrepNotif] test error:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/prep-assignments/:id/verify", async (req: any, res) => {
    try {
      const tenantId: string = req.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
      const { verifyAssignment } = await import("../services/chef-assignment");
      const { qualityScore, feedback } = req.body;
      const result = await verifyAssignment(
        req.params.id, tenantId,
        req.user?.id ?? "system",
        qualityScore ? Number(qualityScore) : undefined,
        feedback
      );
      return res.json(result);
    } catch (err: any) {
      console.error("[PrepNotif] verify error:", err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/prep-assignments/:id/issue", async (req: any, res) => {
    try {
      const tenantId: string = req.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
      const { reportIssue } = await import("../services/chef-assignment");
      const { note } = req.body;
      const result = await reportIssue(req.params.id, tenantId, note ?? "");
      return res.json(result);
    } catch (err: any) {
      console.error("[PrepNotif] issue error:", err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/prep-assignments/:id/help", async (req: any, res) => {
    try {
      const tenantId: string = req.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
      const { requestHelp } = await import("../services/chef-assignment");
      const result = await requestHelp(req.params.id, tenantId);
      return res.json(result);
    } catch (err: any) {
      console.error("[PrepNotif] help error:", err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/kitchen-staff", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "kitchen"), async (req: any, res) => {
    try {
      const tenantId: string = req.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
      const { storage } = await import("../storage");
      const allUsers = await storage.getUsersByTenant(tenantId);
      const kitchenRoles = ["kitchen", "chef", "assistant"];
      const staff = allUsers
        .filter(u => kitchenRoles.includes(u.role ?? ""))
        .map(u => ({ id: u.id, name: u.name, username: u.username, role: u.role }));
      return res.json(staff);
    } catch (err: any) {
      console.error("[PrepNotif] kitchen-staff error:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/prep-assignments/:id/remind", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "kitchen"), async (req: any, res) => {
    try {
      const tenantId: string = req.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
      const { storage } = await import("../storage");
      const assignment = await storage.getAssignment(req.params.id, tenantId);
      if (!assignment) return res.status(404).json({ error: "Assignment not found" });
      const { reminderNote } = (req.body ?? {}) as { reminderNote?: string };
      const notif = await createNotification({
        tenantId,
        chefId: assignment.chefId ?? null,
        type: "task_reminder",
        title: `⏰ Reminder: ${assignment.menuItemName ?? "Task"} is due soon`,
        body: reminderNote ?? `Please check on your assigned task.`,
        priority: "MEDIUM",
        relatedTaskId: req.params.id,
        relatedMenuItem: assignment.menuItemName,
        actionUrl: `/kitchen`,
        actionLabel: "View Task",
      });
      emitToTenant(tenantId, "prep:task_reminder", {
        taskId: req.params.id,
        taskName: assignment.menuItemName,
        chefId: assignment.chefId,
        chefName: assignment.chefName,
      });
      return res.json({ success: true, notification: notif });
    } catch (err: any) {
      console.error("[PrepNotif] remind error:", err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/prep-assignments/:id", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "kitchen"), async (req: any, res) => {
    try {
      const tenantId: string = req.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
      const { chefId, chefName } = (req.body ?? {}) as { chefId?: string; chefName?: string };
      if (!chefId) return res.status(400).json({ error: "chefId required" });
      const { storage } = await import("../storage");
      const allUsers = await storage.getUsersByTenant(tenantId);
      const kitchenRoles = ["kitchen", "chef", "assistant"];
      const targetUser = allUsers.find(u => String(u.id) === String(chefId) && kitchenRoles.includes(u.role ?? ""));
      if (!targetUser) return res.status(400).json({ error: "Invalid assignee: user not found in this tenant or not a kitchen role" });
      const assignment = await storage.getAssignment(req.params.id, tenantId);
      if (!assignment) return res.status(404).json({ error: "Assignment not found" });
      const oldChefId = assignment.chefId;
      const taskName = assignment.menuItemName ?? "Task";
      const resolvedChefName = chefName ?? targetUser.name ?? targetUser.username;
      const updated = await storage.updateAssignment(req.params.id, tenantId, {
        chefId,
        chefName: resolvedChefName,
        assignmentType: "REASSIGNED",
        reassignReason: "Reassigned via notification drawer",
        status: "assigned",
        assignedAt: new Date(),
      });
      if (!updated) return res.status(404).json({ error: "Assignment not found" });
      emitToTenant(tenantId, "chef-assignment:updated", updated);
      emitToTenant(tenantId, "prep:task_assigned", {
        taskId: req.params.id,
        taskName,
        chefId,
        chefName: resolvedChefName,
      });
      createNotification({
        tenantId,
        chefId,
        type: "task_reassigned",
        title: `📋 New task assigned: ${taskName} (reassigned)`,
        body: `Task has been reassigned to you.`,
        priority: "MEDIUM",
        relatedTaskId: req.params.id,
        relatedMenuItem: taskName,
        actionUrl: `/kitchen`,
        actionLabel: "View Task",
      }).catch(() => {});
      if (oldChefId && oldChefId !== chefId) {
        createNotification({
          tenantId,
          chefId: oldChefId,
          type: "task_reassigned",
          title: `🔄 Task ${taskName} has been reassigned`,
          body: `This task has been moved to another team member.`,
          priority: "LOW",
          relatedTaskId: req.params.id,
          relatedMenuItem: taskName,
        }).catch(() => {});
      }
      return res.json(updated);
    } catch (err: any) {
      console.error("[PrepNotif] reassign error:", err);
      return res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/prep-assignments/:id/progress", requireAuth, async (req: any, res) => {
    try {
      const tenantId: string = req.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

      const { completedQty, totalQty, unit } = req.body;
      if (completedQty === undefined || totalQty === undefined) {
        return res.status(400).json({ error: "completedQty and totalQty are required" });
      }

      const completedNum = Number(completedQty);
      const totalNum = Number(totalQty);
      if (isNaN(completedNum) || isNaN(totalNum) || totalNum <= 0) {
        return res.status(400).json({ error: "Invalid quantity values" });
      }

      const { rows: existing } = await pool.query<{
        id: string;
        tenant_id: string;
        chef_id: string | null;
        chef_name: string | null;
        menu_item_name: string | null;
        completed_qty: string | null;
        total_qty: string | null;
        unit: string | null;
      }>(
        `SELECT id, tenant_id, chef_id, chef_name, menu_item_name, completed_qty, total_qty, unit
         FROM ticket_assignments WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, tenantId]
      );

      if (!existing.length) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const row = existing[0];
      const prevCompletedQty = row.completed_qty ? Number(row.completed_qty) : 0;
      const prevTotalQty = row.total_qty ? Number(row.total_qty) : totalNum;
      const previousPct = prevTotalQty > 0 ? Math.round((prevCompletedQty / prevTotalQty) * 100) : 0;
      const percentComplete = Math.round((completedNum / totalNum) * 100);
      const resolvedUnit = unit ?? row.unit ?? "";

      await pool.query(
        `UPDATE ticket_assignments SET completed_qty = $1, total_qty = $2, unit = $3 WHERE id = $4 AND tenant_id = $5`,
        [completedNum, totalNum, resolvedUnit, req.params.id, tenantId]
      );

      const isPartial = completedNum < totalNum;
      const crossedHalfway = percentComplete >= 50 && previousPct < 50;

      if (isPartial && crossedHalfway) {
        emitToTenant(tenantId, "prep:task_progress", {
          taskId: row.id,
          taskName: row.menu_item_name,
          assignedToName: row.chef_name,
          completedQty: completedNum,
          totalQty: totalNum,
          unit: resolvedUnit,
          percentComplete,
          chefId: row.chef_id,
        });

        createNotification({
          tenantId,
          chefId: row.chef_id,
          type: "task_progress",
          title: `⏳ ${row.chef_name ?? "Chef"} is halfway: ${row.menu_item_name ?? "Task"} (${completedNum}${resolvedUnit} done)`,
          priority: "LOW",
          relatedTaskId: row.id,
          relatedMenuItem: row.menu_item_name,
          actionUrl: "/kitchen",
          actionLabel: "View Task",
        }).catch(() => {});
      }

      return res.json({
        id: row.id,
        completedQty: completedNum,
        totalQty: totalNum,
        unit: resolvedUnit,
        percentComplete,
        halfwayEventFired: isPartial && crossedHalfway,
      });
    } catch (err: any) {
      console.error("[PrepNotif] progress error:", err);
      return res.status(500).json({ error: err.message });
    }
  });
}
