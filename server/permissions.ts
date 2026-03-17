import type { Request, Response, NextFunction } from "express";
import {
  type PermissionAction,
  type Role,
  rolePermissions,
  supervisorRequiredActions,
  getPermissionsForRole,
  getAllActions,
} from "@shared/permissions-config";

export type { PermissionAction };
export { getPermissionsForRole, getAllActions };

interface UserLike {
  id: string;
  role: string;
  tenantId: string;
  outletId?: string | null;
}

interface PermissionContext {
  outletId?: string;
  resourceOwnerId?: string;
  amount?: number;
  threshold?: number;
}

export function can(user: UserLike, action: PermissionAction, context?: PermissionContext): boolean {
  const perms = rolePermissions[user.role as Role];
  if (!perms) return false;
  if (!perms.includes(action)) return false;
  if (context) {
    if (context.outletId && user.outletId && user.outletId !== context.outletId) {
      if (user.role !== "owner") return false;
    }
    if (context.amount !== undefined && context.threshold !== undefined && context.amount > context.threshold) {
      if (!perms.includes(action)) return false;
    }
  }
  return true;
}

export function needsSupervisorApproval(user: UserLike, action: PermissionAction): boolean {
  if (!supervisorRequiredActions.includes(action)) return false;
  const perms = rolePermissions[user.role as Role];
  if (!perms) return true;
  return !perms.includes(action);
}

export function requirePermission(action: PermissionAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as UserLike | undefined;
    if (!user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!can(user, action)) {
      return res.status(403).json({
        message: "Permission denied",
        action,
        role: user.role,
        requiresSupervisor: needsSupervisorApproval(user, action),
      });
    }
    next();
  };
}
