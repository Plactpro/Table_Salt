import { db } from "./db";
import { securityAlerts, auditEvents } from "@shared/schema";
import { eq, and, desc, gte, lte, sql, count } from "drizzle-orm";
import type { Request } from "express";

function getIpFromReq(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
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
    await db.insert(securityAlerts).values({
      tenantId: params.tenantId || null,
      userId: params.userId || null,
      type: params.type,
      severity: params.severity,
      title: params.title,
      description: params.description || null,
      ipAddress: params.ipAddress || null,
      metadata: params.metadata || null,
    });
  } catch (err) {
    console.error("Security alert write failed:", err);
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
          eq(auditEvents.entityName, username)
        )
      );
    const failCount = Number(result?.cnt || 0);
    if (failCount >= 3) {
      let tenantId: string | null = null;
      try {
        const { storage } = await import("./storage");
        const targetUser = await storage.getUserByUsername(username);
        if (targetUser) tenantId = targetUser.tenantId;
      } catch (_) {}
      await createSecurityAlert({
        tenantId,
        type: "brute_force_attempt",
        severity: "critical",
        title: "Possible brute force attack detected",
        description: `${failCount} failed login attempts from IP ${ip} in the last 5 minutes (username: ${username})`,
        ipAddress: ip,
        metadata: { username, failCount, ip },
      });
    }
  } catch (_) {}
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
  } catch (_) {}
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
    severity: "medium",
    title: "Bulk data export performed",
    description: `User ${userName} exported ${rowCount} audit log records`,
    ipAddress: getIpFromReq(req),
    metadata: { userName, rowCount },
  });
}
