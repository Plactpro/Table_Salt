import { db } from "./db";
import { auditEvents } from "@shared/schema";
import type { Request } from "express";

interface AuditLogParams {
  tenantId: string | null;
  userId?: string;
  userName?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  outletId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  supervisorId?: string;
  req?: Request;
}

export async function auditLog(params: AuditLogParams): Promise<void> {
  try {
    const ipAddress = params.req
      ? (params.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || params.req.socket?.remoteAddress || null
      : null;
    const userAgent = params.req?.headers["user-agent"] || null;

    await db.insert(auditEvents).values({
      tenantId: params.tenantId || null,
      userId: params.userId || null,
      userName: params.userName || null,
      action: params.action,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      entityName: params.entityName || null,
      outletId: params.outletId || null,
      before: params.before || null,
      after: params.after || null,
      metadata: params.metadata || null,
      ipAddress,
      userAgent,
      supervisorId: params.supervisorId || null,
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}

export function auditLogFromReq(req: Request, overrides: Omit<AuditLogParams, "tenantId" | "userId" | "userName" | "req">): Promise<void> {
  const user = req.user as { id: string; tenantId: string; name: string } | undefined;
  if (!user) return Promise.resolve();
  return auditLog({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name,
    req,
    ...overrides,
  });
}
