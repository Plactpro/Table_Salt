import type { PermissionAction } from "../permissions";
import { storage } from "../storage";
import { can } from "../permissions";
import { comparePasswords } from "../auth";
import { auditLogFromReq } from "../audit";
import type { Request } from "express";

export async function getSecuritySettings(tenantId: string) {
  const tenant = await storage.getTenant(tenantId);
  const mc = (tenant?.moduleConfig || {}) as Record<string, any>;
  return {
    requireSupervisorForVoid: mc.requireSupervisorForVoid ?? true,
    requireSupervisorForLargeDiscount: mc.requireSupervisorForLargeDiscount ?? true,
    largeDiscountThreshold: Number(mc.largeDiscountThreshold ?? 20),
    requireSupervisorForPriceChange: mc.requireSupervisorForPriceChange ?? true,
    requireSupervisorForLargeStockAdjustment: mc.requireSupervisorForLargeStockAdjustment ?? true,
    largeStockAdjustmentThreshold: Number(mc.largeStockAdjustmentThreshold ?? 50),
  };
}

export const otpApprovalTokens = new Map<string, { supervisorId: string; supervisorName: string; tenantId: string; action: string; expiresAt: number }>();

export async function verifySupervisorOverride(
  override: { username: string; password: string; otpApprovalToken?: string } | undefined,
  tenantId: string,
  action: PermissionAction,
  req: Request
): Promise<{ verified: boolean; supervisorId?: string; error?: string }> {
  if (!override) return { verified: false, error: "No override provided" };

  if (override.otpApprovalToken) {
    const tokenData = otpApprovalTokens.get(override.otpApprovalToken);
    if (!tokenData) return { verified: false, error: "Invalid or expired approval token" };
    if (tokenData.expiresAt < Date.now()) {
      otpApprovalTokens.delete(override.otpApprovalToken);
      return { verified: false, error: "Approval token expired" };
    }
    if (tokenData.tenantId !== tenantId || tokenData.action !== action) {
      return { verified: false, error: "Approval token does not match this action" };
    }
    otpApprovalTokens.delete(override.otpApprovalToken);
    const user = req.user as { id: string; name: string; tenantId: string } | undefined;
    auditLogFromReq(req, {
      action: "supervisor_override",
      metadata: { supervisorId: tokenData.supervisorId, supervisorName: tokenData.supervisorName, forAction: action, requestedBy: user?.name || "unknown", method: "otp" },
      supervisorId: tokenData.supervisorId,
    });
    return { verified: true, supervisorId: tokenData.supervisorId };
  }

  const supervisor = await storage.getUserByUsername(override.username);
  if (!supervisor || supervisor.tenantId !== tenantId) return { verified: false, error: "Supervisor not found" };
  const validPw = await comparePasswords(override.password, supervisor.password);
  if (!validPw) return { verified: false, error: "Invalid supervisor credentials" };
  if (!can({ id: supervisor.id, role: supervisor.role, tenantId: supervisor.tenantId }, action)) {
    return { verified: false, error: "Supervisor lacks required permission" };
  }
  const user = req.user as { id: string; name: string; tenantId: string } | undefined;
  auditLogFromReq(req, {
    action: "supervisor_override",
    metadata: { supervisorId: supervisor.id, supervisorName: supervisor.name, forAction: action, requestedBy: user?.name || "unknown", method: "credentials" },
    supervisorId: supervisor.id,
  });
  return { verified: true, supervisorId: supervisor.id };
}
