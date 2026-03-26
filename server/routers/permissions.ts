import type { Express } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { requireAuth, requireRole, requirePermission } from "../middleware";
import { auditLogFromReq } from "../audit";
import { can, needsSupervisorApproval, getPermissionsForRole, type PermissionAction } from "../permissions";
import { alertRoleEscalation, alertBulkDataExport } from "../security-alerts";
import { comparePasswords } from "../auth";
import { deviceSessions } from "@shared/schema";
import { otpApprovalTokens } from "./_shared";

export function registerPermissionsRoutes(app: Express): void {
  app.get("/api/permissions", requireAuth, async (req, res) => {
    const user = req.user as any;
    const role = String(user.role);
    const perms = getPermissionsForRole(role);
    res.json({ role, permissions: perms });
  });

  app.post("/api/permissions/check", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { action } = req.body;
    if (!action) return res.status(400).json({ message: "action is required" });
    const allowed = can(user as { id: string; role: string; tenantId: string }, action);
    const needsApproval = needsSupervisorApproval(user as { id: string; role: string; tenantId: string }, action);
    res.json({ action, allowed, needsSupervisorApproval: needsApproval });
  });

  app.post("/api/supervisor/verify", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = String(user.tenantId);
      const { username, password, action } = req.body;
      if (!username || !password) return res.status(400).json({ message: "Supervisor credentials required" });

      const supervisor = await storage.getUserByUsername(username);
      if (!supervisor || supervisor.tenantId !== tenantId) {
        await auditLogFromReq(req, { action: "supervisor_verify_failed", metadata: { attemptedUsername: username, forAction: action } });
        return res.status(401).json({ message: "Invalid supervisor credentials" });
      }
      const valid = await comparePasswords(password, supervisor.password);
      if (!valid) {
        await auditLogFromReq(req, { action: "supervisor_verify_failed", metadata: { attemptedUsername: username, forAction: action } });
        return res.status(401).json({ message: "Invalid supervisor credentials" });
      }
      if (!can({ id: supervisor.id, role: supervisor.role, tenantId: supervisor.tenantId }, "supervisor_override")) {
        return res.status(403).json({ message: "User does not have supervisor privileges" });
      }
      if (action && !can({ id: supervisor.id, role: supervisor.role, tenantId: supervisor.tenantId }, action)) {
        return res.status(403).json({ message: `Supervisor lacks permission for action: ${action}` });
      }

      await auditLogFromReq(req, {
        action: "supervisor_override",
        metadata: { supervisorId: supervisor.id, supervisorName: supervisor.name, forAction: action, requestedBy: String(user.name) },
        supervisorId: supervisor.id,
      });

      const { password: _, ...safeSupervisor } = supervisor;
      res.json({ verified: true, supervisor: safeSupervisor });
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Server error" }); }
  });

  app.get("/api/audit-log", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = String(user.tenantId);
      if (!can({ id: String(user.id), role: String(user.role), tenantId }, "view_audit_log")) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const filters: Record<string, unknown> = {};
      if (req.query.from) filters.from = new Date(String(req.query.from));
      if (req.query.to) filters.to = new Date(String(req.query.to));
      if (req.query.userId) filters.userId = String(req.query.userId);
      if (req.query.action) filters.action = String(req.query.action);
      if (req.query.entityType) filters.entityType = String(req.query.entityType);
      if (req.query.outletId) filters.outletId = String(req.query.outletId);
      if (req.query.entityId) filters.entityId = String(req.query.entityId);
      if (req.query.limit) filters.limit = parseInt(String(req.query.limit), 10);
      if (req.query.offset) filters.offset = parseInt(String(req.query.offset), 10);

      const result = await storage.getAuditEventsByTenant(tenantId, filters as {
        from?: Date; to?: Date; userId?: string; action?: string; entityType?: string; outletId?: string; entityId?: string; limit?: number; offset?: number;
      });
      res.json(result);
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Server error" }); }
  });

  app.get("/api/audit-log/entity/:entityType/:entityId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = String(user.tenantId);
      if (!can({ id: String(user.id), role: String(user.role), tenantId }, "view_audit_log")) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const events = await storage.getAuditEventsByEntity(tenantId, req.params.entityType, req.params.entityId);
      res.json({ events });
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Server error" }); }
  });

  // ─── Audit Trail Hard-Protection ─────────────────────────────────────────
  // The audit_events table is append-only. There are intentionally NO DELETE
  // or UPDATE routes for audit_events anywhere in this codebase. Any attempt
  // to add such routes MUST be rejected — audit records are immutable evidence
  // required for compliance and forensic investigations.
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/api/audit-log/export", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = String(user.tenantId);
      if (!can({ id: String(user.id), role: String(user.role), tenantId }, "view_audit_log")) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const filters: Record<string, unknown> = { limit: 5000 };
      if (req.query.from) filters.from = new Date(String(req.query.from));
      if (req.query.to) filters.to = new Date(String(req.query.to));
      if (req.query.userId) filters.userId = String(req.query.userId);
      if (req.query.action) filters.action = String(req.query.action);
      if (req.query.entityType) filters.entityType = String(req.query.entityType);

      const result = await storage.getAuditEventsByTenant(tenantId, filters as {
        from?: Date; to?: Date; userId?: string; action?: string; entityType?: string; limit?: number;
      });

      const headers = ["Date", "User", "Action", "Entity Type", "Entity Name", "Entity ID", "IP Address", "Supervisor"];
      const rows = result.events.map(e => [
        e.createdAt ? new Date(e.createdAt).toISOString() : "",
        e.userName || "",
        e.action,
        e.entityType || "",
        e.entityName || "",
        e.entityId || "",
        e.ipAddress || "",
        e.supervisorId || "",
      ]);
      const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");

      auditLogFromReq(req, { action: "audit_log_exported", entityType: "audit_log", entityId: tenantId, metadata: { rowCount: rows.length } });
      alertBulkDataExport(String(user.id), tenantId, String(user.name), rows.length, req);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=audit-log.csv");
      res.send(csv);
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Server error" }); }
  });

  app.get("/api/audit-log/actions", requireAuth, async (_req, res) => {
    const actions = [
      "login", "logout", "login_failed",
      "order_created", "order_updated", "order_voided",
      "menu_item_created", "menu_item_updated", "menu_item_deleted",
      "menu_category_created", "menu_category_updated", "menu_category_deleted",
      "inventory_adjusted", "inventory_item_created", "inventory_item_updated",
      "offer_created", "offer_updated", "offer_deleted",
      "promotion_rule_created", "promotion_rule_updated", "promotion_rule_deleted",
      "user_created", "user_updated", "user_role_changed",
      "tenant_settings_updated", "security_settings_updated",
      "recipe_created", "recipe_updated", "recipe_deleted",
      "supervisor_override", "supervisor_verify_failed",
      "otp_challenge_issued", "otp_verified", "otp_verify_failed",
      "device_trust_changed", "device_session_revoked",
      "table_updated", "reservation_created", "reservation_updated",
    ];
    res.json(actions);
  });

  app.get("/api/security/settings", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = String(user.tenantId);
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      const modConfig = (tenant.moduleConfig || {}) as Record<string, unknown>;
      res.json({
        idleTimeoutMinutes: modConfig.idleTimeoutMinutes ?? 30,
        maxConcurrentSessions: modConfig.maxConcurrentSessions ?? 5,
        requireSupervisorForVoid: modConfig.requireSupervisorForVoid ?? true,
        requireSupervisorForLargeDiscount: modConfig.requireSupervisorForLargeDiscount ?? true,
        largeDiscountThreshold: modConfig.largeDiscountThreshold ?? 20,
        requireSupervisorForPriceChange: modConfig.requireSupervisorForPriceChange ?? true,
        requireSupervisorForLargeStockAdjustment: modConfig.requireSupervisorForLargeStockAdjustment ?? true,
        largeStockAdjustmentThreshold: modConfig.largeStockAdjustmentThreshold ?? 50,
      });
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Server error" }); }
  });

  app.patch("/api/security/settings", requireRole("owner", "franchise_owner", "hq_admin"), requirePermission("manage_security"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = String(user.tenantId);
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      const modConfig = (tenant.moduleConfig || {}) as Record<string, unknown>;
      const allowed = ["idleTimeoutMinutes", "maxConcurrentSessions", "requireSupervisorForVoid", "requireSupervisorForLargeDiscount", "largeDiscountThreshold", "requireSupervisorForPriceChange", "requireSupervisorForLargeStockAdjustment", "largeStockAdjustmentThreshold"];
      const before: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in req.body) {
          before[key] = modConfig[key];
          modConfig[key] = req.body[key];
        }
      }
      await storage.updateTenant(tenantId, { moduleConfig: modConfig });
      await auditLogFromReq(req, { action: "security_settings_updated", entityType: "tenant", entityId: tenantId, before, after: req.body });
      res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Server error" }); }
  });

  app.get("/api/device-sessions", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const sessions = await db.select().from(deviceSessions)
        .where(eq(deviceSessions.userId, user.id))
        .orderBy(desc(deviceSessions.lastActive));
      res.json(sessions);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/device-sessions", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { deviceFingerprint, deviceName, browser, os } = req.body;
      const ip = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "";
      const [session] = await db.insert(deviceSessions).values({
        tenantId: user.tenantId,
        userId: user.id,
        deviceFingerprint,
        deviceName: deviceName || "Unknown Device",
        browser: browser || "",
        os: os || "",
        ipAddress: ip,
        isTrusted: false,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).returning();
      res.json(session);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/device-sessions/:id/trust", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const [session] = await db.select().from(deviceSessions)
        .where(and(eq(deviceSessions.id, req.params.id), eq(deviceSessions.userId, user.id)));
      if (!session) return res.status(404).json({ message: "Session not found" });
      const [updated] = await db.update(deviceSessions)
        .set({ isTrusted: req.body.trusted ?? true })
        .where(eq(deviceSessions.id, req.params.id)).returning();
      auditLogFromReq(req, { action: "device_trust_changed", entityType: "device_session", entityId: req.params.id, metadata: { trusted: req.body.trusted ?? true, deviceName: session.deviceName } });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/device-sessions/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const [session] = await db.select().from(deviceSessions)
        .where(and(eq(deviceSessions.id, req.params.id), eq(deviceSessions.userId, user.id)));
      if (!session) return res.status(404).json({ message: "Session not found" });
      await db.delete(deviceSessions).where(eq(deviceSessions.id, req.params.id));
      auditLogFromReq(req, { action: "device_session_revoked", entityType: "device_session", entityId: req.params.id, metadata: { deviceName: session.deviceName } });
      res.json({ message: "Session revoked" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  const otpCache = new Map<string, { code: string; action: string; supervisorId: string; supervisorName: string; tenantId: string; expiresAt: number }>();

  app.post("/api/supervisor/otp-challenge", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { username, action } = req.body;
      if (!username || !action) return res.status(400).json({ message: "Username and action are required" });
      const supervisor = await storage.getUserByUsername(username);
      if (!supervisor || supervisor.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Supervisor not found in this tenant" });
      }
      if (!can({ id: supervisor.id, role: supervisor.role, tenantId: supervisor.tenantId }, action as PermissionAction)) {
        return res.status(403).json({ message: `User ${username} does not have permission for ${action}` });
      }
      const code = String(100000 + Math.floor(Math.random() * 900000));
      const challengeId = `otp:${user.tenantId}:${action}:${Date.now()}`;
      otpCache.set(challengeId, { code, action, supervisorId: supervisor.id, supervisorName: supervisor.name, tenantId: user.tenantId, expiresAt: Date.now() + 5 * 60 * 1000 });
      auditLogFromReq(req, { action: "otp_challenge_issued", metadata: { forAction: action, supervisorUsername: username, challengeId } });
      res.json({ challengeId, expiresIn: 300, message: `OTP code (simulated): ${code}` });
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Unknown error" }); }
  });

  app.post("/api/supervisor/otp-verify", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { challengeId, code, action } = req.body;
      const entry = otpCache.get(challengeId);
      if (!entry) return res.status(400).json({ message: "Challenge not found or expired" });
      if (entry.expiresAt < Date.now()) {
        otpCache.delete(challengeId);
        return res.status(400).json({ message: "OTP expired" });
      }
      if (action && entry.action !== action) {
        return res.status(403).json({ message: "OTP was not issued for this action" });
      }
      if (entry.code !== code) {
        auditLogFromReq(req, { action: "otp_verify_failed", metadata: { challengeId } });
        return res.status(403).json({ message: "Invalid OTP code" });
      }
      otpCache.delete(challengeId);
      const approvalToken = `otp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      otpApprovalTokens.set(approvalToken, {
        supervisorId: entry.supervisorId,
        supervisorName: entry.supervisorName,
        tenantId: user.tenantId,
        action: entry.action,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      auditLogFromReq(req, { action: "otp_verified", metadata: { challengeId, forAction: entry.action, supervisorId: entry.supervisorId } });
      res.json({ verified: true, action: entry.action, approvalToken, supervisor: { id: entry.supervisorId, name: entry.supervisorName } });
    } catch (err: unknown) { res.status(500).json({ message: err instanceof Error ? err.message : "Unknown error" }); }
  });

  app.patch("/api/users/:id/role", requireRole("owner"), requirePermission("manage_users"), async (req, res) => {
    try {
      const user = req.user as any;
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser || targetUser.tenantId !== user.tenantId) return res.status(404).json({ message: "User not found" });
      const oldRole = targetUser.role;
      const updated = await storage.updateUser(req.params.id, { role: req.body.role });
      auditLogFromReq(req, {
        action: "user_role_changed",
        entityType: "user",
        entityId: req.params.id,
        entityName: targetUser.name,
        before: { role: oldRole },
        after: { role: req.body.role },
      });
      alertRoleEscalation(req.params.id, user.tenantId, targetUser.name, oldRole, req.body.role, req);
      if (updated) {
        const { password: _, totpSecret: _ts2, recoveryCodes: _rc2, passwordHistory: _ph2, ...safe } = updated;
        res.json(safe);
      } else {
        res.json({});
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
