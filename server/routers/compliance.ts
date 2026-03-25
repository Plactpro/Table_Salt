import type { Express } from "express";
import { eq, and, desc, sql, gte, lt } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../db";
import { pool } from "../db";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../middleware";
import { requireSuperAdmin } from "../auth";
import { auditLogFromReq } from "../audit";
import { securityAlerts } from "@shared/schema";
import { isValidCidr } from "../security";
import { alertDataExport, createSecurityAlert } from "../security-alerts";
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

  app.get("/api/health", async (_req, res) => {
    const start = Date.now();
    let dbStatus = "connected";
    try {
      await pool.query("SELECT 1");
    } catch (_) {
      dbStatus = "disconnected";
    }
    if (dbStatus === "disconnected") {
      return res.status(503).json({
        status: "degraded",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        db: "disconnected",
        uptime: Math.floor(process.uptime()),
      });
    }
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      db: "connected",
      uptime: Math.floor(process.uptime()),
    });
  });

  // ─── Feature 1: Breach Incidents ────────────────────────────────────────────

  app.post("/api/admin/breach-incidents", requireSuperAdmin, async (req, res) => {
    try {
      const user = req.user as any;
      const { title, description, severity, tenantId, affectedRecords, affectedDataTypes, rootCause } = req.body;
      if (!title || !description || !severity) {
        return res.status(400).json({ message: "title, description, and severity are required" });
      }
      const detectedAt = new Date();
      const notificationDeadline = new Date(detectedAt.getTime() + 72 * 60 * 60 * 1000);
      const { rows: [incident] } = await pool.query(
        `INSERT INTO breach_incidents (tenant_id, title, description, severity, status, detected_at, notification_deadline,
          affected_records, affected_data_types, root_cause, reported_by_id, reported_by_name)
         VALUES ($1, $2, $3, $4, 'detected', $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [tenantId || null, title, description, severity, detectedAt, notificationDeadline,
          affectedRecords || 0, affectedDataTypes || [], rootCause || null, user.id, user.name]
      );
      auditLogFromReq(req, { action: "breach_incident_created", entityType: "breach_incident", entityId: incident.id, entityName: title });
      res.status(201).json(incident);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/admin/breach-incidents", requireSuperAdmin, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const severity = req.query.severity as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      let whereClause = "WHERE 1=1";
      const params: any[] = [];
      if (status) { params.push(status); whereClause += ` AND status = $${params.length}`; }
      if (severity) { params.push(severity); whereClause += ` AND severity = $${params.length}`; }
      const { rows } = await pool.query(
        `SELECT bi.*, t.name as tenant_name,
          EXTRACT(EPOCH FROM (notification_deadline - NOW())) / 3600 AS hours_remaining
         FROM breach_incidents bi
         LEFT JOIN tenants t ON t.id = bi.tenant_id
         ${whereClause}
         ORDER BY detected_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      );
      const { rows: [totalRow] } = await pool.query(
        `SELECT COUNT(*) as cnt FROM breach_incidents ${whereClause}`,
        params
      );
      res.json({ data: rows, total: parseInt(totalRow.cnt), limit, offset });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/admin/breach-incidents/:id", requireSuperAdmin, async (req, res) => {
    try {
      const { rows: [incident] } = await pool.query(
        `SELECT bi.*, t.name as tenant_name,
          EXTRACT(EPOCH FROM (notification_deadline - NOW())) / 3600 AS hours_remaining
         FROM breach_incidents bi
         LEFT JOIN tenants t ON t.id = bi.tenant_id
         WHERE bi.id = $1`,
        [req.params.id]
      );
      if (!incident) return res.status(404).json({ message: "Incident not found" });
      res.json(incident);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/admin/breach-incidents/:id", requireSuperAdmin, async (req, res) => {
    try {
      const { rows: [existing] } = await pool.query(`SELECT * FROM breach_incidents WHERE id = $1`, [req.params.id]);
      if (!existing) return res.status(404).json({ message: "Incident not found" });
      const { status, containedAt, notifiedAt, resolvedAt, rootCause, remediation, tenantNotified, authorityNotified } = req.body;
      const updates: string[] = ["updated_at = NOW()"];
      const params: any[] = [req.params.id];
      if (status !== undefined) { params.push(status); updates.push(`status = $${params.length}`); }
      if (containedAt !== undefined) { params.push(containedAt); updates.push(`contained_at = $${params.length}`); }
      if (notifiedAt !== undefined) { params.push(notifiedAt); updates.push(`notified_at = $${params.length}`); }
      if (resolvedAt !== undefined) { params.push(resolvedAt); updates.push(`resolved_at = $${params.length}`); }
      if (rootCause !== undefined) { params.push(rootCause); updates.push(`root_cause = $${params.length}`); }
      if (remediation !== undefined) { params.push(remediation); updates.push(`remediation = $${params.length}`); }
      if (tenantNotified !== undefined) { params.push(tenantNotified); updates.push(`tenant_notified = $${params.length}`); }
      if (authorityNotified !== undefined) { params.push(authorityNotified); updates.push(`authority_notified = $${params.length}`); }
      if (status === "notified" && !existing.notified_at) { updates.push("notified_at = NOW()"); }
      if (status === "resolved" && !existing.resolved_at) { updates.push("resolved_at = NOW()"); }
      const { rows: [updated] } = await pool.query(
        `UPDATE breach_incidents SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
        params
      );
      if (status === "notified" && existing.tenant_id && existing.status !== "notified") {
        try {
          const alertSev = existing.severity === "critical" ? "critical" : existing.severity === "high" ? "critical" : "warning";
          await createSecurityAlert({
            tenantId: existing.tenant_id,
            type: "data_breach",
            severity: alertSev as "info" | "warning" | "critical",
            title: "Data security notice from Table Salt support",
            description: `A data security incident (${existing.severity}) affecting your account requires your attention. Data types potentially involved: ${(existing.affected_data_types || []).join(", ") || "unknown"}. Detected: ${new Date(existing.detected_at).toLocaleDateString()}. Please review the incident details and take any required action.`,
            metadata: { incidentId: existing.id },
          });
        } catch (e) { console.warn("createSecurityAlert failed (non-fatal):", e); }
      }
      auditLogFromReq(req, { action: "breach_incident_updated", entityType: "breach_incident", entityId: req.params.id, entityName: existing.title, after: { status } });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/tenant/breach-incidents", requireAuth, requireRole("owner", "hq_admin"), async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT * FROM breach_incidents WHERE tenant_id = $1 AND status IN ('notified', 'resolved') ORDER BY detected_at DESC`,
        [user.tenantId]
      );
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Feature 2: Consent Endpoints ───────────────────────────────────────────

  app.post("/api/consent/accept", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { documentType, documentVersion } = req.body;
      if (!documentType || !documentVersion) return res.status(400).json({ message: "documentType and documentVersion are required" });
      if (!["tos", "privacy_policy"].includes(documentType)) return res.status(400).json({ message: "Invalid documentType" });
      const ip = (req.headers["x-forwarded-for"] as string || req.ip || "").split(",")[0].trim();
      const userAgent = (req.headers["user-agent"] || "").slice(0, 500);
      await pool.query(
        `INSERT INTO consent_log (user_id, tenant_id, document_type, document_version, accepted_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, NOW(), $5, $6)`,
        [user.id, user.tenantId, documentType, documentVersion, ip, userAgent]
      );
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/consent/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT DISTINCT ON (document_type) document_type, document_version, accepted_at
         FROM consent_log WHERE user_id = $1 ORDER BY document_type, accepted_at DESC`,
        [user.id]
      );
      const { rows: [settings] } = await pool.query(
        `SELECT tos_version, privacy_version, tos_url, privacy_url FROM platform_settings WHERE id = 'singleton' LIMIT 1`
      );
      const tosRow = rows.find(r => r.document_type === "tos");
      const privacyRow = rows.find(r => r.document_type === "privacy_policy");
      res.json({
        tos: tosRow ? { version: tosRow.document_version, acceptedAt: tosRow.accepted_at } : null,
        privacy_policy: privacyRow ? { version: privacyRow.document_version, acceptedAt: privacyRow.accepted_at } : null,
        platform: {
          tosVersion: settings?.tos_version || "2026-01",
          privacyVersion: settings?.privacy_version || "2026-01",
          tosUrl: settings?.tos_url || "/legal/terms",
          privacyUrl: settings?.privacy_url || "/legal/privacy",
        },
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/admin/consent-stats", requireSuperAdmin, async (req, res) => {
    try {
      const { rows: [settings] } = await pool.query(
        `SELECT tos_version, privacy_version FROM platform_settings WHERE id = 'singleton' LIMIT 1`
      );
      const currentTosVersion = settings?.tos_version || "2026-01";
      const currentPrivacyVersion = settings?.privacy_version || "2026-01";
      const { rows: [totalsRow] } = await pool.query(`SELECT COUNT(*) as total FROM users WHERE active = true AND role != 'super_admin'`);
      const { rows: [tosRow] } = await pool.query(
        `SELECT COUNT(DISTINCT user_id) as cnt FROM consent_log WHERE document_type = 'tos' AND document_version = $1`,
        [currentTosVersion]
      );
      const { rows: [privacyRow] } = await pool.query(
        `SELECT COUNT(DISTINCT user_id) as cnt FROM consent_log WHERE document_type = 'privacy_policy' AND document_version = $1`,
        [currentPrivacyVersion]
      );
      const totalUsers = parseInt(totalsRow?.total || "0");
      const tosCurrent = parseInt(tosRow?.cnt || "0");
      const privacyCurrent = parseInt(privacyRow?.cnt || "0");
      res.json({
        totalUsers,
        currentTosVersion,
        currentPrivacyVersion,
        usersAcceptedCurrentTos: tosCurrent,
        usersAcceptedCurrentPrivacy: privacyCurrent,
        usersPendingTosReacceptance: Math.max(0, totalUsers - tosCurrent),
        usersPendingPrivacyReacceptance: Math.max(0, totalUsers - privacyCurrent),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Feature 3: System Health Endpoint ──────────────────────────────────────

  app.get("/api/admin/system-health", requireSuperAdmin, async (req, res) => {
    try {
      const { rows: [current] } = await pool.query(
        `SELECT * FROM system_health_log ORDER BY checked_at DESC LIMIT 1`
      );
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const { rows: [stats24h] } = await pool.query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as ok_count,
          AVG(db_response_ms) as avg_db_ms,
          MIN(db_response_ms) as min_db_ms,
          MAX(db_response_ms) as max_db_ms,
          SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) as incidents
         FROM system_health_log WHERE checked_at > $1`,
        [yesterday]
      );
      const { rows: [stats30d] } = await pool.query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as ok_checks,
          SUM(CASE WHEN status = 'degraded' THEN 1 ELSE 0 END) as degraded_checks,
          SUM(CASE WHEN status = 'down' THEN 1 ELSE 0 END) as down_checks
         FROM system_health_log WHERE checked_at > $1`,
        [thirtyDaysAgo]
      );
      const { rows: recent } = await pool.query(
        `SELECT status, db_response_ms, checked_at, memory_used_mb, process_uptime_seconds
         FROM system_health_log ORDER BY checked_at DESC LIMIT 48`
      );
      const total24h = parseInt(stats24h?.total || "0");
      const ok24h = parseInt(stats24h?.ok_count || "0");
      const total30d = parseInt(stats30d?.total || "0");
      const ok30d = parseInt(stats30d?.ok_checks || "0");
      res.json({
        current: current ? {
          status: current.status,
          dbResponseMs: current.db_response_ms,
          memoryUsedMb: current.memory_used_mb,
          uptimeSeconds: current.process_uptime_seconds,
          checkedAt: current.checked_at,
        } : null,
        last24h: {
          uptime_pct: total24h > 0 ? Math.round((ok24h / total24h) * 1000) / 10 : 100,
          avg_db_ms: Math.round(parseFloat(stats24h?.avg_db_ms || "0")),
          min_db_ms: parseInt(stats24h?.min_db_ms || "0"),
          max_db_ms: parseInt(stats24h?.max_db_ms || "0"),
          incidents: parseInt(stats24h?.incidents || "0"),
        },
        last30d: {
          uptime_pct: total30d > 0 ? Math.round((ok30d / total30d) * 1000) / 10 : 100,
          total_checks: total30d,
          ok_checks: ok30d,
          degraded_checks: parseInt(stats30d?.degraded_checks || "0"),
          down_checks: parseInt(stats30d?.down_checks || "0"),
        },
        recent: recent.reverse(),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Feature 4: Per-Tenant Compliance Report ─────────────────────────────────

  app.get("/api/compliance/report", requireAuth, requireRole("owner", "hq_admin", "franchise_owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const format = (req.query.format as string) || "json";
      const tenant = await storage.getTenant(user.tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      const mc = (tenant.moduleConfig || {}) as Record<string, any>;

      // Access control
      const { rows: [accessStats] } = await pool.query(
        `SELECT
          COUNT(*) as total_users,
          SUM(CASE WHEN totp_enabled = true THEN 1 ELSE 0 END) as mfa_users
         FROM users WHERE tenant_id = $1 AND active = true`,
        [user.tenantId]
      );
      const { rows: roleRows } = await pool.query(
        `SELECT role, COUNT(*) as cnt FROM users WHERE tenant_id = $1 AND active = true GROUP BY role`,
        [user.tenantId]
      );
      const byRole: Record<string, number> = {};
      for (const r of roleRows) byRole[r.role] = parseInt(r.cnt);
      const totalUsers = parseInt(accessStats?.total_users || "0");
      const mfaUsers = parseInt(accessStats?.mfa_users || "0");

      // Consent records (most recent by type for the requesting user)
      const { rows: consentRows } = await pool.query(
        `SELECT DISTINCT ON (document_type) document_type, document_version, accepted_at
         FROM consent_log WHERE user_id = $1 ORDER BY document_type, accepted_at DESC`,
        [user.id]
      );
      const tosConsent = consentRows.find(r => r.document_type === "tos");
      const privacyConsent = consentRows.find(r => r.document_type === "privacy_policy");
      const { rows: [platformSettings] } = await pool.query(
        `SELECT tos_version, privacy_version FROM platform_settings WHERE id = 'singleton' LIMIT 1`
      );

      // Audit log stats
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const { rows: [auditStats] } = await pool.query(
        `SELECT COUNT(*) as total,
          SUM(CASE WHEN created_at > $2 THEN 1 ELSE 0 END) as last_30d,
          MIN(created_at) as oldest,
          MAX(created_at) as newest
         FROM audit_events WHERE tenant_id = $1`,
        [user.tenantId, thirtyDaysAgo]
      );

      // Impersonation sessions
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const { rows: [impersonationStats] } = await pool.query(
        `SELECT
          COUNT(*) as total_all_time,
          SUM(CASE WHEN started_at > $2 THEN 1 ELSE 0 END) as last_90d,
          SUM(CASE WHEN started_at > $2 AND access_mode = 'EDIT' THEN 1 ELSE 0 END) as edit_sessions_90d
         FROM impersonation_sessions WHERE tenant_id = $1`,
        [user.tenantId, ninetyDaysAgo]
      );

      // Security alerts
      const { rows: [alertStats] } = await pool.query(
        `SELECT
          SUM(CASE WHEN NOT acknowledged THEN 1 ELSE 0 END) as unacknowledged,
          SUM(CASE WHEN created_at > $2 THEN 1 ELSE 0 END) as last_30d
         FROM security_alerts WHERE tenant_id = $1`,
        [user.tenantId, thirtyDaysAgo]
      );

      // GDPR data requests
      const { rows: [gdprStats] } = await pool.query(
        `SELECT
          SUM(CASE WHEN action = 'gdpr_data_export' AND created_at > $2 THEN 1 ELSE 0 END) as exports_90d,
          SUM(CASE WHEN action IN ('gdpr_account_deleted','gdpr_deletion_request') AND created_at > $2 THEN 1 ELSE 0 END) as deletions_90d
         FROM audit_events WHERE tenant_id = $1`,
        [user.tenantId, ninetyDaysAgo]
      );

      // Breach incidents
      const { rows: [breachStats] } = await pool.query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status NOT IN ('resolved') THEN 1 ELSE 0 END) as open,
          MAX(detected_at) as last_incident
         FROM breach_incidents WHERE tenant_id = $1`,
        [user.tenantId]
      );

      const ipAllowlistEnabled = !!(mc.ipAllowlistEnabled);

      const report = {
        generatedAt: now.toISOString(),
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          country: tenant.country || null,
          createdAt: tenant.createdAt || null,
          subscriptionStatus: tenant.subscriptionStatus || "trialing",
        },
        dataProtection: {
          encryptionAtRest: true,
          encryptionInTransit: "TLS 1.2+",
          retentionPolicyMonths: mc.dataRetentionMonths ?? 36,
          autoDeleteAnonymized: mc.autoDeleteAnonymized ?? false,
          auditLogRetentionMonths: mc.auditLogRetentionMonths ?? 24,
        },
        accessControl: {
          totalActiveUsers: totalUsers,
          byRole,
          usersWithMFA: mfaUsers,
          mfaAdoptionPct: totalUsers > 0 ? Math.round((mfaUsers / totalUsers) * 100) : 0,
          ipAllowlistEnabled,
        },
        consentRecords: {
          tosVersion: platformSettings?.tos_version || "2026-01",
          tosAcceptedAt: tosConsent?.accepted_at || null,
          privacyPolicyVersion: platformSettings?.privacy_version || "2026-01",
          privacyPolicyAcceptedAt: privacyConsent?.accepted_at || null,
        },
        auditLog: {
          totalEntriesAllTime: parseInt(auditStats?.total || "0"),
          entriesLast30Days: parseInt(auditStats?.last_30d || "0"),
          oldestEntry: auditStats?.oldest || null,
          newestEntry: auditStats?.newest || null,
        },
        impersonationSessions: {
          totalAllTime: parseInt(impersonationStats?.total_all_time || "0"),
          last90Days: parseInt(impersonationStats?.last_90d || "0"),
          editSessionsLast90Days: parseInt(impersonationStats?.edit_sessions_90d || "0"),
        },
        securityAlerts: {
          totalUnacknowledged: parseInt(alertStats?.unacknowledged || "0"),
          last30Days: parseInt(alertStats?.last_30d || "0"),
        },
        dataRequests: {
          gdprExportsLast90Days: parseInt(gdprStats?.exports_90d || "0"),
          deletionRequestsLast90Days: parseInt(gdprStats?.deletions_90d || "0"),
        },
        breachIncidents: {
          total: parseInt(breachStats?.total || "0"),
          open: parseInt(breachStats?.open || "0"),
          lastIncidentDate: breachStats?.last_incident || null,
        },
      };

      auditLogFromReq(req, { action: "compliance_report_exported", entityType: "tenant", entityId: user.tenantId, entityName: tenant.name, metadata: { format } });

      if (format === "csv-summary") {
        const csvRows = [
          ["Field", "Value"],
          ["Generated At", report.generatedAt],
          ["Tenant Name", report.tenant.name],
          ["Plan", report.tenant.plan],
          ["Subscription Status", report.tenant.subscriptionStatus],
          ["Encryption At Rest", "AES-256-GCM"],
          ["Encryption In Transit", report.dataProtection.encryptionInTransit],
          ["Retention Policy (months)", String(report.dataProtection.retentionPolicyMonths)],
          ["Auto-delete Anonymized", String(report.dataProtection.autoDeleteAnonymized)],
          ["Total Active Users", String(report.accessControl.totalActiveUsers)],
          ["Users With MFA", String(report.accessControl.usersWithMFA)],
          ["MFA Adoption %", String(report.accessControl.mfaAdoptionPct)],
          ["IP Allowlist Enabled", String(report.accessControl.ipAllowlistEnabled)],
          ["ToS Version", report.consentRecords.tosVersion],
          ["ToS Accepted At", String(report.consentRecords.tosAcceptedAt || "Not accepted")],
          ["Privacy Policy Version", report.consentRecords.privacyPolicyVersion],
          ["Privacy Policy Accepted At", String(report.consentRecords.privacyPolicyAcceptedAt || "Not accepted")],
          ["Audit Log Total Entries", String(report.auditLog.totalEntriesAllTime)],
          ["Audit Log Last 30 Days", String(report.auditLog.entriesLast30Days)],
          ["Impersonation Sessions (All Time)", String(report.impersonationSessions.totalAllTime)],
          ["Impersonation Sessions (90d)", String(report.impersonationSessions.last90Days)],
          ["Edit Sessions (90d)", String(report.impersonationSessions.editSessionsLast90Days)],
          ["Unacknowledged Security Alerts", String(report.securityAlerts.totalUnacknowledged)],
          ["Security Alerts (30d)", String(report.securityAlerts.last30Days)],
          ["GDPR Exports (90d)", String(report.dataRequests.gdprExportsLast90Days)],
          ["Deletion Requests (90d)", String(report.dataRequests.deletionRequestsLast90Days)],
          ["Breach Incidents Total", String(report.breachIncidents.total)],
          ["Open Breach Incidents", String(report.breachIncidents.open)],
          ["Last Incident Date", String(report.breachIncidents.lastIncidentDate || "None")],
        ];
        const csv = csvRows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="compliance-report-${user.tenantId}.csv"`);
        return res.send(csv);
      }

      res.json(report);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}

// ─── Health Logger ───────────────────────────────────────────────────────────

export function startHealthLogger(): void {
  const runCheck = async () => {
    try {
      const t0 = Date.now();
      await pool.query("SELECT 1");
      const ms = Date.now() - t0;
      const memMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const uptime = Math.floor(process.uptime());
      const status = ms < 500 ? "ok" : ms < 2000 ? "degraded" : "down";
      await pool.query(
        `INSERT INTO system_health_log (status, db_response_ms, process_uptime_seconds, memory_used_mb, active_sessions)
         VALUES ($1, $2, $3, $4, 0)`,
        [status, ms, uptime, memMb]
      );
    } catch (err) {
      try {
        await pool.query(
          `INSERT INTO system_health_log (status, db_response_ms, process_uptime_seconds, memory_used_mb, active_sessions)
           VALUES ('down', NULL, $1, $2, 0)`,
          [Math.floor(process.uptime()), Math.round(process.memoryUsage().heapUsed / 1024 / 1024)]
        );
      } catch (_) { /* silently ignore if DB is completely unavailable */ }
    }
  };
  runCheck();
  setInterval(runCheck, 5 * 60 * 1000);
}
