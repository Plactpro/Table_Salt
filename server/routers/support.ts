import type { Express, Request, Response } from "express";
import { requireAuth, requireRole } from "../auth";
import { storage } from "../storage";
import { emitToTenant } from "../realtime";
import { pool } from "../db";
import { z } from "zod";
import { sendSupportReplyEmail } from "../services/email-service";

function requireSuperAdminOrPlatform(req: Request, res: Response, next: Function) {
  const user = req.user as any;
  if (!user) return res.status(401).json({ message: "Unauthorized" });
  if ((user.role as string) === "super_admin" || user.tenantId === "platform") return next();
  return res.status(403).json({ message: "Admin access required" });
}

const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(255),
  description: z.string().trim().min(10),
  category: z.enum(["general", "billing", "technical", "feature", "training"]).default("general"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  pageContext: z.string().optional(),
  browserInfo: z.string().optional(),
});

const replySchema = z.object({
  message: z.string().trim().min(1),
});

const adminUpdateSchema = z.object({
  status: z.enum(["open", "in_progress", "replied", "awaiting_support", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignedTo: z.string().optional(),
});

export function registerSupportRoutes(app: Express): void {

  // ─── Tenant-facing routes ──────────────────────────────────────────────────

  app.post("/api/support/tickets", requireAuth, requireRole("owner", "manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const parsed = createTicketSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: parsed.error.format() });

      const tenant = await storage.getTenant(user.tenantId);
      const ticket = await storage.createInAppSupportTicket({
        tenantId: user.tenantId,
        createdBy: user.id,
        createdByName: user.name,
        subject: parsed.data.subject,
        description: parsed.data.description,
        category: parsed.data.category,
        priority: parsed.data.priority,
        pageContext: parsed.data.pageContext,
        browserInfo: parsed.data.browserInfo,
        tenantPlan: tenant?.plan,
        status: "open",
        assignedTo: null,
      });
      res.status(201).json(ticket);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/support/tickets", requireAuth, requireRole("owner", "manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const tickets = await storage.getInAppSupportTickets(user.tenantId);
      res.json(tickets);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/support/tickets/:id", requireAuth, requireRole("owner", "manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const ticket = await storage.getInAppSupportTicket(req.params.id) as any;
      if (!ticket || ticket.tenant_id !== user.tenantId) return res.status(404).json({ message: "Ticket not found" });
      const replies = await storage.getInAppSupportTicketReplies(req.params.id);
      res.json({ ...ticket, replies });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/support/tickets/:id/reply", requireAuth, requireRole("owner", "manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const parsed = replySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed" });

      const ticket = await storage.getInAppSupportTicket(req.params.id) as any;
      if (!ticket || ticket.tenant_id !== user.tenantId) return res.status(404).json({ message: "Ticket not found" });

      const reply = await storage.createInAppSupportTicketReply({
        ticketId: req.params.id,
        tenantId: user.tenantId,
        authorId: user.id,
        authorName: user.name,
        isAdmin: false,
        message: parsed.data.message,
      });

      const currentCount = ticket.reply_count ?? 0;
      await storage.updateInAppSupportTicket(req.params.id, {
        status: "awaiting_support",
        lastRepliedAt: new Date(),
        replyCount: currentCount + 1,
      });

      res.status(201).json(reply);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/support/tickets/:id/close", requireAuth, requireRole("owner", "manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const ticket = await storage.getInAppSupportTicket(req.params.id) as any;
      if (!ticket || ticket.tenant_id !== user.tenantId) return res.status(404).json({ message: "Ticket not found" });
      const updated = await storage.updateInAppSupportTicket(req.params.id, {
        status: "closed",
        resolvedAt: new Date(),
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Admin-facing routes ───────────────────────────────────────────────────

  app.get("/api/admin/support/admins", requireAuth, requireSuperAdminOrPlatform, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query<{ id: string; name: string; username: string; role: string }>(
        `SELECT id, name, username, role FROM users WHERE role = 'super_admin' ORDER BY name ASC`
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/support/tickets", requireAuth, requireSuperAdminOrPlatform, async (req: Request, res: Response) => {
    try {
      const { status, priority, category, tenantId, assignedTo, dateFrom } = req.query as Record<string, string>;
      const tickets = await storage.getAllInAppSupportTickets({ status, priority, category, tenantId, assignedTo, dateFrom });
      res.json(tickets);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/support/stats", requireAuth, requireSuperAdminOrPlatform, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getInAppSupportStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/support/tickets/:id", requireAuth, requireSuperAdminOrPlatform, async (req: Request, res: Response) => {
    try {
      const ticket = await storage.getInAppSupportTicket(req.params.id) as any;
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      const replies = await storage.getInAppSupportTicketReplies(req.params.id);
      const tenantId = ticket.tenant_id;
      const tenant = tenantId ? await storage.getTenant(tenantId) : null;
      let outletCount = 0;
      if (tenantId) {
        const outlets = await storage.getOutletsByTenant(tenantId);
        outletCount = outlets.length;
      }
      res.json({
        ...ticket,
        replies,
        tenantContext: tenant
          ? { name: tenant.name, plan: tenant.plan, createdAt: tenant.createdAt, outletCount }
          : null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/support/tickets/:id/reply", requireAuth, requireSuperAdminOrPlatform, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const parsed = replySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed" });

      const ticket = await storage.getInAppSupportTicket(req.params.id) as any;
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      const reply = await storage.createInAppSupportTicketReply({
        ticketId: req.params.id,
        tenantId: ticket.tenant_id,
        authorId: user.id,
        authorName: user.name,
        isAdmin: true,
        message: parsed.data.message,
      });

      const currentCount = ticket.reply_count ?? 0;
      await storage.updateInAppSupportTicket(req.params.id, {
        status: "replied",
        lastRepliedAt: new Date(),
        replyCount: currentCount + 1,
      });

      emitToTenant(ticket.tenant_id, "support:new_reply", {
        ticketId: ticket.id,
        message: parsed.data.message.substring(0, 100),
        adminName: "Support Team",
      });

      // Send email notification to ticket creator
      try {
        const { rows: creatorRows } = await pool.query(
          `SELECT email FROM users WHERE id = $1 AND email IS NOT NULL AND email <> '' LIMIT 1`,
          [ticket.created_by]
        );
        const creatorEmail = creatorRows[0]?.email;
        if (creatorEmail) {
          const appUrl = process.env.APP_URL || "https://tablesalt.app";
          const ticketUrl = `${appUrl}/support?ticket=${ticket.id}`;
          sendSupportReplyEmail(creatorEmail, ticket.subject, parsed.data.message, ticketUrl).catch(() => {});
        }
      } catch (_) {}

      res.status(201).json(reply);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/support/tickets/:id", requireAuth, requireSuperAdminOrPlatform, async (req: Request, res: Response) => {
    try {
      const parsed = adminUpdateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed" });

      const ticket = await storage.getInAppSupportTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      const updateData: Record<string, any> = {};
      if (parsed.data.status) updateData.status = parsed.data.status;
      if (parsed.data.priority) updateData.priority = parsed.data.priority;
      if (parsed.data.assignedTo !== undefined) updateData.assignedTo = parsed.data.assignedTo;
      if (parsed.data.status === "resolved" || parsed.data.status === "closed") {
        updateData.resolvedAt = new Date();
      }

      const updated = await storage.updateInAppSupportTicket(req.params.id, updateData);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
