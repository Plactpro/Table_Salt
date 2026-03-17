export type PermissionAction =
  | "create_order"
  | "edit_order"
  | "void_order"
  | "apply_discount"
  | "apply_large_discount"
  | "change_price"
  | "close_day"
  | "view_reports"
  | "view_cost_reports"
  | "manage_menu"
  | "edit_recipe"
  | "manage_inventory"
  | "adjust_stock"
  | "large_stock_adjustment"
  | "manage_staff"
  | "manage_tables"
  | "manage_outlets"
  | "manage_offers"
  | "manage_crm"
  | "manage_delivery"
  | "manage_cleaning"
  | "manage_audits"
  | "manage_suppliers"
  | "manage_procurement"
  | "approve_purchase"
  | "manage_integrations"
  | "manage_settings"
  | "manage_billing"
  | "manage_users"
  | "view_audit_log"
  | "manage_security"
  | "supervisor_override";

type Role = "owner" | "manager" | "waiter" | "kitchen" | "accountant" | "customer";

const rolePermissions: Record<Role, PermissionAction[]> = {
  owner: [
    "create_order", "edit_order", "void_order", "apply_discount", "apply_large_discount",
    "change_price", "close_day", "view_reports", "view_cost_reports",
    "manage_menu", "edit_recipe", "manage_inventory", "adjust_stock", "large_stock_adjustment",
    "manage_staff", "manage_tables", "manage_outlets", "manage_offers", "manage_crm",
    "manage_delivery", "manage_cleaning", "manage_audits", "manage_suppliers",
    "manage_procurement", "approve_purchase", "manage_integrations", "manage_settings",
    "manage_billing", "manage_users", "view_audit_log", "manage_security", "supervisor_override",
  ],
  manager: [
    "create_order", "edit_order", "void_order", "apply_discount",
    "close_day", "view_reports", "view_cost_reports",
    "manage_menu", "edit_recipe", "manage_inventory", "adjust_stock",
    "manage_staff", "manage_tables", "manage_outlets", "manage_offers", "manage_crm",
    "manage_delivery", "manage_cleaning", "manage_audits", "manage_suppliers",
    "manage_procurement", "approve_purchase", "manage_users", "view_audit_log", "supervisor_override",
  ],
  waiter: [
    "create_order", "edit_order", "apply_discount", "manage_tables",
  ],
  kitchen: [
    "edit_order",
  ],
  accountant: [
    "view_reports", "view_cost_reports", "view_audit_log",
  ],
  customer: [],
};

const supervisorRequiredActions: PermissionAction[] = [
  "void_order",
  "apply_large_discount",
  "change_price",
  "large_stock_adjustment",
];

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

export function getPermissionsForRole(role: string): PermissionAction[] {
  return rolePermissions[role as Role] || [];
}

export function getAllActions(): PermissionAction[] {
  return Object.keys(rolePermissions).reduce<PermissionAction[]>((acc, role) => {
    for (const p of rolePermissions[role as Role]) {
      if (!acc.includes(p)) acc.push(p);
    }
    return acc;
  }, []);
}

import type { Request, Response, NextFunction } from "express";

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
