import { db, pool } from "./db";
import { securityAlerts, auditEvents } from "@shared/schema";
import { eq, and, gte, lte, count } from "drizzle-orm";
import type { Request } from "express";
import { emitToTenant } from "./realtime";

function getIpFromReq(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"] as string | undefined;
  if (forwarded) {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  return req.socket?.remoteAddress || "unknown";
}

interface CreateAlertParams {
  tenantId: string | null;
  userId?: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export async function createSecurityAlert(params: CreateAlertParams): Promise<void> {
  try {
    const [inserted] = await db.insert(securityAlerts).values({
      tenantId: params.tenantId || null,
      userId: params.userId || null,
      type: params.type,
      severity: params.severity,
      title: params.title,
      description: params.description || null,
      ipAddress: params.ipAddress || null,
      metadata: params.metadata || null,
    }).returning({ id: securityAlerts.id });

    if (params.severity === "critical" && params.type === "potential_breach_hint" && inserted?.id) {
      const payload = {
        type: "security_alert",
        severity: "critical",
        message: params.title,
        alertId: inserted.id,
        description: params.description,
      };
      if (params.tenantId) {
        emitToTenant(params.tenantId, "security_alert", payload);
      }
      try {
        const { rows: platformRows } = await pool.query(
          `SELECT id FROM tenants WHERE slug = 'platform' LIMIT 1`
        );
        if (platformRows[0]?.id && platformRows[0].id !== params.tenantId) {
          emitToTenant(platformRows[0].id, "security_alert", payload);
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error("Security alert write failed:", err instanceof Error ? err.message : String(err));
  }
}

export async function checkFailedLoginAlert(username: string, req: Request): Promise<void> {
  const ip = getIpFromReq(req);
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  try {
    const [result] = await db
      .select({ cnt: count() })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "login_failed"),
          gte(auditEvents.createdAt, fiveMinutesAgo),
          eq(auditEvents.entityName, username),
          eq(auditEvents.ipAddress, ip)
        )
      );
    const failCount = Number(result?.cnt || 0);
    if (failCount >= 3) {
      let tenantId: string | null = null;
      try {
        const { storage } = await import("./storage");
        const targetUser = await storage.getUserByUsername(username);
        if (targetUser) tenantId = targetUser.tenantId;
      } catch (lookupErr) {
        console.warn("checkFailedLoginAlert: could not look up tenant for user", username, lookupErr instanceof Error ? lookupErr.message : String(lookupErr));
      }
      await createSecurityAlert({
        tenantId,
        type: "brute_force_attempt",
        severity: "critical",
        title: "Possible brute force attack detected",
        description: `${failCount} failed login attempts for username "${username}" from IP ${ip} in the last 5 minutes`,
        ipAddress: ip,
        metadata: { username, failCount, ip },
      });
    }
  } catch (err) {
    console.error("checkFailedLoginAlert error:", err instanceof Error ? err.message : String(err));
  }
}

export async function checkNewIpLoginAlert(userId: string, tenantId: string, userName: string, req: Request): Promise<void> {
  const ip = getIpFromReq(req);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const fiveSecondsAgo = new Date(Date.now() - 5000);
  try {
    const [result] = await db
      .select({ cnt: count() })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.userId, userId),
          eq(auditEvents.action, "login"),
          eq(auditEvents.ipAddress, ip),
          gte(auditEvents.createdAt, thirtyDaysAgo),
          lte(auditEvents.createdAt, fiveSecondsAgo)
        )
      );
    const seenCount = Number(result?.cnt || 0);
    if (seenCount === 0) {
      await createSecurityAlert({
        tenantId,
        userId,
        type: "new_ip_login",
        severity: "warning",
        title: "Login from new IP address",
        description: `User ${userName} logged in from a new IP address: ${ip}`,
        ipAddress: ip,
        metadata: { userName, ip },
      });
    }
  } catch (err) {
    console.error("checkNewIpLoginAlert error:", err instanceof Error ? err.message : String(err));
  }
}

export async function alertPasswordChanged(userId: string, tenantId: string, userName: string, req: Request): Promise<void> {
  await createSecurityAlert({
    tenantId,
    userId,
    type: "password_changed",
    severity: "info",
    title: "Password changed",
    description: `User ${userName} changed their password`,
    ipAddress: getIpFromReq(req),
    metadata: { userName },
  });
}

export async function alert2FADisabled(userId: string, tenantId: string, userName: string, req: Request): Promise<void> {
  await createSecurityAlert({
    tenantId,
    userId,
    type: "2fa_disabled",
    severity: "warning",
    title: "Two-factor authentication disabled",
    description: `User ${userName} disabled 2FA on their account`,
    ipAddress: getIpFromReq(req),
    metadata: { userName },
  });
}

export async function alertRoleEscalation(userId: string, tenantId: string, userName: string, oldRole: string, newRole: string, req: Request): Promise<void> {
  const highRoles = ["owner", "hq_admin", "franchise_owner"];
  if (highRoles.includes(newRole) && !highRoles.includes(oldRole)) {
    await createSecurityAlert({
      tenantId,
      userId,
      type: "role_escalation",
      severity: "critical",
      title: "User role escalated to admin level",
      description: `User ${userName} role changed from ${oldRole} to ${newRole}`,
      ipAddress: getIpFromReq(req),
      metadata: { userName, oldRole, newRole },
    });
  }
}

export async function alertDataExport(userId: string, tenantId: string, userName: string, req: Request): Promise<void> {
  await createSecurityAlert({
    tenantId,
    userId,
    type: "data_export",
    severity: "info",
    title: "Personal data export requested",
    description: `User ${userName} exported their personal data`,
    ipAddress: getIpFromReq(req),
    metadata: { userName },
  });
}

export async function alertBulkDataExport(userId: string, tenantId: string, userName: string, rowCount: number, req: Request): Promise<void> {
  await createSecurityAlert({
    tenantId,
    userId,
    type: "bulk_data_export",
    severity: "warning",
    title: "Bulk data export performed",
    description: `User ${userName} exported ${rowCount} audit log records`,
    ipAddress: getIpFromReq(req),
    metadata: { userName, rowCount },
  });
}

// ─── Breach Auto-Detection Functions ─────────────────────────────────────────

// In-memory API rate counter (simple sliding window, no Redis needed)
const apiCallCounts = new Map<string, { count: number; windowStart: number }>();

function incrementApiCounter(userId: string): number {
  const now = Date.now();
  const windowMs = 60_000;
  const entry = apiCallCounts.get(userId);
  if (!entry || now - entry.windowStart > windowMs) {
    apiCallCounts.set(userId, { count: 1, windowStart: now });
    return 1;
  }
  entry.count++;
  return entry.count;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of apiCallCounts.entries()) {
    if (now - entry.windowStart > 120_000) apiCallCounts.delete(key);
  }
}, 5 * 60_000);

export async function checkOffHoursBulkAccess(
  userId: string, tenantId: string, userName: string,
  endpoint: string, recordCount: number, req: Request
): Promise<void> {
  const hour = new Date().getUTCHours();
  const isOffHours = hour >= 22 || hour <= 5;
  if (isOffHours && recordCount > 500) {
    const ip = getIpFromReq(req);
    await createSecurityAlert({
      tenantId,
      userId,
      type: "potential_breach_hint",
      severity: "critical",
      title: "Off-Hours Bulk Data Access",
      description:
        `${userName} accessed ${recordCount} records from ${endpoint} ` +
        `at ${new Date().toISOString()} (off-hours). ` +
        `IP: ${ip}. Investigate if this was expected.`,
      ipAddress: ip,
      metadata: { endpoint, recordCount, hour, ip },
    });
  }
}

export async function checkMultiAccountSameIp(
  ip: string, tenantId: string
): Promise<void> {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(DISTINCT user_id) as cnt
      FROM audit_events
      WHERE ip_address = $1
        AND tenant_id = $2
        AND action = 'login'
        AND created_at > NOW() - INTERVAL '30 minutes'
    `, [ip, tenantId]);

    const count = parseInt(rows[0]?.cnt || "0");
    if (count >= 5) {
      const { rows: existing } = await pool.query(`
        SELECT id FROM security_alerts
        WHERE tenant_id = $1
          AND type = 'potential_breach_hint'
          AND metadata->>'ip' = $2
          AND metadata->>'detectionType' = 'multi_account_ip'
          AND created_at > NOW() - INTERVAL '1 hour'
        LIMIT 1
      `, [tenantId, ip]);
      if (existing.length > 0) return;

      await createSecurityAlert({
        tenantId,
        type: "potential_breach_hint",
        severity: "critical",
        title: "Single IP Accessing Multiple Accounts",
        description:
          `IP address ${ip} has logged into ${count} different accounts ` +
          `in the last 30 minutes. This may indicate credential stuffing or ` +
          `unauthorized access. Consider blocking this IP.`,
        ipAddress: ip,
        metadata: { ip, distinctAccounts: count, detectionType: "multi_account_ip" },
      });
    }
  } catch (err) {
    console.error("checkMultiAccountSameIp error:", err instanceof Error ? err.message : String(err));
  }
}

export async function checkCrossAccountFailedLogins(
  ip: string, tenantId: string
): Promise<void> {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*) as fail_count, COUNT(DISTINCT entity_id) as account_count
      FROM audit_events
      WHERE ip_address = $1
        AND action = 'login_failed'
        AND created_at > NOW() - INTERVAL '10 minutes'
    `, [ip]);

    const failCount = parseInt(rows[0]?.fail_count || "0");
    const accountCount = parseInt(rows[0]?.account_count || "0");

    if (accountCount >= 3 && failCount >= 20) {
      const existing = await pool.query(`
        SELECT id FROM security_alerts
        WHERE type = 'potential_breach_hint'
          AND metadata->>'ip' = $1
          AND metadata->>'detectionType' = 'credential_stuffing'
          AND created_at > NOW() - INTERVAL '1 hour'
        LIMIT 1
      `, [ip]);
      if (existing.rows.length > 0) return;

      await createSecurityAlert({
        tenantId,
        type: "potential_breach_hint",
        severity: "critical",
        title: "Possible Credential Stuffing Attack",
        description:
          `IP ${ip} attempted login on ${accountCount} different accounts ` +
          `with ${failCount} failures in the last 10 minutes. ` +
          `This pattern matches credential stuffing. Consider blocking this IP immediately.`,
        ipAddress: ip,
        metadata: { ip, failCount, accountCount, detectionType: "credential_stuffing" },
      });
    }
  } catch (err) {
    console.error("checkCrossAccountFailedLogins error:", err instanceof Error ? err.message : String(err));
  }
}

export async function checkApiRateAnomaly(
  userId: string, tenantId: string, userName: string, req: Request
): Promise<void> {
  const count = incrementApiCounter(userId);
  if (count === 300) {
    const ip = getIpFromReq(req);
    await createSecurityAlert({
      tenantId,
      userId,
      type: "potential_breach_hint",
      severity: "critical",
      title: "Unusually High API Call Rate",
      description:
        `${userName} has made ${count}+ API requests in the last 60 seconds. ` +
        `This may indicate automated scraping or a compromised account. ` +
        `IP: ${ip}`,
      ipAddress: ip,
      metadata: { callCount: count, ip, windowSeconds: 60 },
    });
  }
}
