import { Router } from "express";
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
} from "../services/prep-notifications";
import { startDeadlineChecker } from "../services/prep-deadline-checker";

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
}
