import { rolePermissions, supervisorRequiredActions, actionLabels, type PermissionAction, type UserRole } from "@shared/permissions-config";

export function can(userRole: string, action: PermissionAction): boolean {
  const perms = rolePermissions[userRole as UserRole];
  if (!perms) return false;
  return perms.includes(action);
}

export function needsSupervisorApproval(action: string): boolean {
  return supervisorRequiredActions.includes(action as PermissionAction);
}

export function getActionLabel(action: string): string {
  return actionLabels[action as PermissionAction] || action;
}

export function getPermissionsForRole(role: string): PermissionAction[] {
  return rolePermissions[role as UserRole] || [];
}

export { rolePermissions, supervisorRequiredActions, actionLabels };
export type { PermissionAction, UserRole };
