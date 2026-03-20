import type { Express } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../db";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../middleware";
import { auditLogFromReq } from "../audit";
import { securityAlerts } from "@shared/schema";
import { isValidCidr } from "../security";
import { alertDataExport } from "../security-alerts";
import { comparePasswords, hashPassword } from "../auth";
import { isEncrypted, decryptField } from "../encryption";

export function registerComplianceRoutes(app: Express): void {
  app.get("/api/security-alerts", requireAuth, requireRole("owner", "hq_admin", "franchise_owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const acknowledged = req.query.acknowledged === "true" ? true : req.query.acknowledged === "false" ? false : undefined;

      const allAlerts = await db.select().from(securityAlerts)
        .where(
          acknowledged !== undefined
            ? and(eq(securityAlerts.tenantId, user.tenantId), eq(securityAlerts.acknowledged, acknowledged))
            : eq(securityAlerts.tenantId, user.tenantId)
        )
        .orderBy(desc(securityAlerts.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await db.select({ cnt: sql<number>`count(*)` }).from(securityAlerts)
        .where(
          acknowledged !== undefined
            ? and(eq(securityAlerts.tenantId, user.tenantId), eq(securityAlerts.acknowledged, acknowledged))
            : eq(securityAlerts.tenantId, user.tenantId)
        );

      res.json({ data: allAlerts, total: Number(totalResult?.cnt || 0), limit, offset });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/security-alerts/unread-count", requireAuth, requireRole("owner", "hq_admin", "franchise_owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const [result] = await db.select({ cnt: sql<number>`count(*)` }).from(securityAlerts)
        .where(and(eq(securityAlerts.tenantId, user.tenantId), eq(securityAlerts.acknowledged, false)));
      res.json({ count: Number(result?.cnt || 0) });
    } catch (err: any) { res.json({ count: 0 }); }
  });

  app.patch("/api/security-alerts/:id/acknowledge", requireAuth, requireRole("owner", "hq_admin", "franchise_owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const [alert] = await db.select().from(securityAlerts).where(and(eq(securityAlerts.id, req.params.id), eq(securityAlerts.tenantId, user.tenantId)));
      if (!alert) return res.status(404).json({ message: "Alert not found" });
      const [updated] = await db.update(securityAlerts)
        .set({ acknowledged: true, acknowledgedBy: user.id, acknowledgedAt: new Date() })
        .where(eq(securityAlerts.id, req.params.id))
        .returning();
      auditLogFromReq(req, { action: "security_alert_acknowledged", entityType: "security_alert", entityId: req.params.id, entityName: alert.title });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/security-alerts/acknowledge-all", requireAuth, requireRole("owner", "hq_admin", "franchise_owner"), async (req, res) => {
    try {
      const user = req.user as any;
      await db.update(securityAlerts)
        .set({ acknowledged: true, acknowledgedBy: user.id, acknowledgedAt: new Date() })
        .where(and(eq(securityAlerts.tenantId, user.tenantId), eq(securityAlerts.acknowledged, false)));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/security/ip-allowlist", requireAuth, requireRole("owner", "hq_admin"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenant = await storage.getTenant(user.tenantId);
      const mc = (tenant?.moduleConfig || {}) as Record<string, unknown>;
      res.json({ ipAllowlist: mc.ipAllowlist || [], ipAllowlistEnabled: mc.ipAllowlistEnabled || false, ipAllowlistRoles: mc.ipAllowlistRoles || {} });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/security/ip-allowlist", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { ipAllowlist, ipAllowlistEnabled, ipAllowlistRoles } = req.body;
      if (ipAllowlist && !Array.isArray(ipAllowlist)) return res.status(400).json({ message: "ipAllowlist must be an array" });
      if (ipAllowlist) {
        for (const cidr of ipAllowlist) {
          if (typeof cidr !== "string" || !isValidCidr(cidr)) return res.status(400).json({ message: `Invalid CIDR format: ${cidr}` });
        }
      }
      if (ipAllowlistRoles && typeof ipAllowlistRoles === "object") {
        for (const [role, cidrs] of Object.entries(ipAllowlistRoles)) {
          if (!Array.isArray(cidrs)) return res.status(400).json({ message: `Role rules for ${role} must be an array` });
          for (const cidr of cidrs as string[]) {
            if (typeof cidr !== "string" || !isValidCidr(cidr)) return res.status(400).json({ message: `Invalid CIDR format for role ${role}: ${cidr}` });
          }
        }
      }
      const tenant = await storage.getTenant(user.tenantId);
      const mc = (tenant?.moduleConfig || {}) as Record<string, unknown>;
      const updates: Record<string, unknown> = { ...mc };
      if (ipAllowlist !== undefined) updates.ipAllowlist = ipAllowlist;
      if (ipAllowlistEnabled !== undefined) updates.ipAllowlistEnabled = ipAllowlistEnabled;
      if (ipAllowlistRoles !== undefined) updates.ipAllowlistRoles = ipAllowlistRoles;
      await storage.updateTenant(user.tenantId, { moduleConfig: updates });
      auditLogFromReq(req, { action: "ip_allowlist_updated", entityType: "tenant", entityId: user.tenantId, after: { ipAllowlist, ipAllowlistEnabled, ipAllowlistRoles } });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  const gdprExportTokens = new Map<string, { userId: string; tenantId: string; expiresAt: number }>();

  app.post("/api/gdpr/export", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const fullUser = await storage.getUser(user.id);
      if (!fullUser) return res.status(404).json({ message: "User not found" });

      const token = randomBytes(32).toString("hex");
      gdprExportTokens.set(token, { userId: user.id, tenantId: user.tenantId, expiresAt: Date.now() + 10 * 60 * 1000 });

      auditLogFromReq(req, { action: "gdpr_data_export", entityType: "user", entityId: user.id, entityName: user.name });
      alertDataExport(user.id, user.tenantId, user.name, req);
      res.json({ downloadUrl: `/api/gdpr/export/download?token=${token}`, expiresInMinutes: 10 });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/gdpr/export/download", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(400).json({ message: "Missing download token" });

      const entry = gdprExportTokens.get(token);
      if (!entry) return res.status(404).json({ message: "Invalid or expired download link" });
      if (Date.now() > entry.expiresAt) {
        gdprExportTokens.delete(token);
        return res.status(410).json({ message: "Download link has expired" });
      }
      gdprExportTokens.delete(token);

      const fullUser = await storage.getUser(entry.userId);
      if (!fullUser) return res.status(404).json({ message: "User not found" });

      const userOrders = await storage.getOrdersByTenant(entry.tenantId);
      const myOrders = userOrders.filter(o => o.waiterId === entry.userId || o.customerId === entry.userId);
      const allReservations = await storage.getReservationsByTenant(entry.tenantId);
      const mySchedules = await storage.getStaffSchedulesByTenant(entry.tenantId);
      const allCustomers = await storage.getCustomersByTenant(entry.tenantId);
      const matchingCustomer = allCustomers.find(c =>
        (c.email && fullUser.email && c.email === fullUser.email) ||
        (c.phone && fullUser.phone && c.phone === fullUser.phone)
      );
      const myReservations = allReservations.filter(r =>
        (matchingCustomer && r.customerId === matchingCustomer.id) ||
        (fullUser.name && r.customerName === fullUser.name)
      );
      const allFeedback = await storage.getFeedbackByTenant(entry.tenantId);
      const myFeedback = matchingCustomer ? allFeedback.filter(f => f.customerId === matchingCustomer.id) : [];

      const exportData = {
        exportDate: new Date().toISOString(),
        user: {
          name: fullUser.name, username: fullUser.username,
          email: fullUser.email ? (isEncrypted(fullUser.email) ? decryptField(fullUser.email) : fullUser.email) : null,
          phone: fullUser.phone ? (isEncrypted(fullUser.phone) ? decryptField(fullUser.phone) : fullUser.phone) : null,
          role: fullUser.role, active: fullUser.active,
        },
        customerProfile: matchingCustomer ? {
          name: matchingCustomer.name, loyaltyPoints: matchingCustomer.loyaltyPoints,
          loyaltyTier: matchingCustomer.loyaltyTier, totalSpent: matchingCustomer.totalSpent,
          averageSpend: matchingCustomer.averageSpend, tags: matchingCustomer.tags,
          privacyConsents: matchingCustomer.privacyConsents,
        } : null,
        orders: myOrders.map(o => ({ id: o.id, type: o.orderType, status: o.status, total: o.total, createdAt: o.createdAt })),
        reservations: myReservations.map(r => ({ id: r.id, dateTime: r.dateTime, guests: r.guests, status: r.status, notes: r.notes })),
        schedules: mySchedules.filter(s => s.userId === entry.userId).map(s => ({ date: s.date, startTime: s.startTime, endTime: s.endTime })),
        feedback: myFeedback.map(f => ({ rating: f.rating, comment: f.comment, createdAt: f.createdAt })),
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="data-export-${entry.userId}.json"`);
      res.json(exportData);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  async function handleAccountDeletion(req: any, res: any) {
    try {
      const user = req.user as any;
      const { password: confirmPassword } = req.body;
      if (!confirmPassword) return res.status(400).json({ message: "Password confirmation required" });
      const freshUser = await storage.getUser(user.id);
      if (!freshUser) return res.status(404).json({ message: "User not found" });
      const valid = await comparePasswords(confirmPassword, freshUser.password);
      if (!valid) return res.status(401).json({ message: "Invalid password" });
      if (freshUser.role === "owner") return res.status(400).json({ message: "Account owners cannot self-delete. Transfer ownership first." });

      await storage.updateUser(user.id, {
        name: "[deleted]",
        username: `deleted_${user.id.slice(0, 8)}`,
        email: null, phone: null, active: false,
        totpSecret: null, totpEnabled: false,
        recoveryCodes: null, passwordHistory: null,
        password: await hashPassword(randomBytes(32).toString("hex")),
      });

      const allCustomers = await storage.getCustomersByTenant(user.tenantId);
      for (const cust of allCustomers) {
        if (cust.email === freshUser.email || cust.phone === freshUser.phone) {
          await storage.updateCustomer(cust.id, { name: "[deleted]", email: null, phone: null, anonymized: true });
          auditLogFromReq(req, { action: "customer_anonymized", entityType: "customer", entityId: cust.id, entityName: "[deleted]" });
        }
      }

      const allReservations = await storage.getReservationsByTenant(user.tenantId);
      for (const r of allReservations) {
        if (r.customerName === freshUser.name || (r.customerPhone && freshUser.phone && r.customerPhone === freshUser.phone)) {
          await storage.updateReservationByTenant(r.id, user.tenantId, { customerName: "[deleted]", customerPhone: null } as Partial<typeof r>);
        }
      }

      const allWaitlist = await storage.getWaitlistByTenant(user.tenantId);
      for (const w of allWaitlist) {
        if (w.customerName === freshUser.name || (w.customerPhone && freshUser.phone && w.customerPhone === freshUser.phone)) {
          await storage.updateWaitlistEntry(w.id, user.tenantId, { customerName: "[deleted]", customerPhone: null } as Partial<typeof w>);
        }
      }

      const allDeliveries = await storage.getDeliveryOrdersByTenant(user.tenantId);
      for (const d of allDeliveries) {
        if (d.customerPhone && freshUser.phone && d.customerPhone === freshUser.phone) {
          await storage.updateDeliveryOrderByTenant(d.id, user.tenantId, { customerPhone: null, customerAddress: "[deleted]" } as Partial<typeof d>);
        }
      }

      await db.execute(sql`UPDATE orders SET waiter_id = NULL WHERE waiter_id = ${user.id} AND tenant_id = ${user.tenantId}`);

      auditLogFromReq(req, { action: "gdpr_account_deleted", entityType: "user", entityId: user.id, entityName: freshUser.name });
      req.logout(() => { req.session?.destroy(() => {}); });
      res.json({ message: "Account data has been deleted and anonymized" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  }

  app.post("/api/gdpr/anonymize-account", requireAuth, handleAccountDeletion);
  app.post("/api/gdpr/delete-account", requireAuth, handleAccountDeletion);

  app.get("/api/gdpr/retention-policy", requireAuth, requireRole("owner", "hq_admin"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenant = await storage.getTenant(user.tenantId);
      const mc = (tenant?.moduleConfig || {}) as Record<string, unknown>;
      res.json({
        dataRetentionMonths: mc.dataRetentionMonths ?? 36,
        autoDeleteAnonymized: mc.autoDeleteAnonymized ?? false,
        auditLogRetentionMonths: mc.auditLogRetentionMonths ?? 24,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/gdpr/retention-policy", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { dataRetentionMonths, autoDeleteAnonymized, auditLogRetentionMonths } = req.body;
      const tenant = await storage.getTenant(user.tenantId);
      const mc = (tenant?.moduleConfig || {}) as Record<string, unknown>;
      await storage.updateTenant(user.tenantId, {
        moduleConfig: {
          ...mc,
          dataRetentionMonths: dataRetentionMonths ?? mc.dataRetentionMonths,
          autoDeleteAnonymized: autoDeleteAnonymized ?? mc.autoDeleteAnonymized,
          auditLogRetentionMonths: auditLogRetentionMonths ?? mc.auditLogRetentionMonths,
        },
      });
      auditLogFromReq(req, { action: "retention_policy_updated", entityType: "tenant", entityId: user.tenantId, after: { dataRetentionMonths, autoDeleteAnonymized, auditLogRetentionMonths } });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
}
