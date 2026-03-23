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
  | "supervisor_override"
  | "close_shift"
  | "kitchen_rush";

export type UserRole =
  | "owner"
  | "manager"
  | "waiter"
  | "kitchen"
  | "accountant"
  | "customer"
  | "cashier"
  | "supervisor"
  | "outlet_manager"
  | "hq_admin"
  | "franchise_owner"
  | "auditor"
  | "super_admin"
  | "delivery_agent";

export type Role = UserRole;

export const rolePermissions: Record<UserRole, PermissionAction[]> = {
  owner: [
    "create_order", "edit_order", "void_order", "apply_discount", "apply_large_discount",
    "change_price", "close_day", "view_reports", "view_cost_reports",
    "manage_menu", "edit_recipe", "manage_inventory", "adjust_stock", "large_stock_adjustment",
    "manage_staff", "manage_tables", "manage_outlets", "manage_offers", "manage_crm",
    "manage_delivery", "manage_cleaning", "manage_audits", "manage_suppliers",
    "manage_procurement", "approve_purchase", "manage_integrations", "manage_settings",
    "manage_billing", "manage_users", "view_audit_log", "manage_security", "supervisor_override",
    "close_shift", "kitchen_rush",
  ],
  franchise_owner: [
    "create_order", "edit_order", "void_order", "apply_discount", "apply_large_discount",
    "change_price", "close_day", "view_reports", "view_cost_reports",
    "manage_menu", "edit_recipe", "manage_inventory", "adjust_stock", "large_stock_adjustment",
    "manage_staff", "manage_tables", "manage_outlets", "manage_offers", "manage_crm",
    "manage_delivery", "manage_cleaning", "manage_audits", "manage_suppliers",
    "manage_procurement", "approve_purchase", "manage_integrations", "manage_settings",
    "manage_billing", "manage_users", "view_audit_log", "manage_security", "supervisor_override",
    "close_shift", "kitchen_rush",
  ],
  hq_admin: [
    "view_reports", "view_cost_reports", "manage_menu", "manage_inventory",
    "manage_staff", "manage_outlets", "manage_offers", "manage_crm",
    "manage_delivery", "manage_audits", "manage_suppliers", "manage_procurement",
    "approve_purchase", "manage_integrations", "manage_settings", "manage_billing",
    "manage_users", "view_audit_log", "manage_security",
  ],
  manager: [
    "create_order", "edit_order", "void_order", "apply_discount",
    "close_day", "view_reports", "view_cost_reports",
    "manage_menu", "edit_recipe", "manage_inventory", "adjust_stock",
    "manage_staff", "manage_tables", "manage_outlets", "manage_offers", "manage_crm",
    "manage_delivery", "manage_cleaning", "manage_audits", "manage_suppliers",
    "manage_procurement", "approve_purchase", "manage_users", "view_audit_log", "supervisor_override",
    "close_shift", "kitchen_rush",
  ],
  outlet_manager: [
    "create_order", "edit_order", "void_order", "apply_discount",
    "close_day", "view_reports", "view_cost_reports",
    "manage_menu", "edit_recipe", "manage_inventory", "adjust_stock",
    "manage_staff", "manage_tables", "manage_offers", "manage_crm",
    "manage_delivery", "manage_cleaning", "manage_audits",
    "manage_users", "view_audit_log", "supervisor_override",
    "close_shift", "kitchen_rush",
  ],
  supervisor: [
    "create_order", "edit_order", "void_order", "apply_discount", "apply_large_discount",
    "change_price", "close_day", "view_reports",
    "manage_menu", "manage_inventory", "adjust_stock", "large_stock_adjustment",
    "manage_tables", "manage_cleaning", "supervisor_override",
    "close_shift", "kitchen_rush",
  ],
  cashier: [
    "create_order", "edit_order", "apply_discount", "manage_tables",
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
  auditor: [
    "view_reports", "view_cost_reports", "view_audit_log", "manage_audits",
  ],
  customer: [],
  super_admin: [
    "create_order", "edit_order", "void_order", "apply_discount", "apply_large_discount",
    "change_price", "close_day", "view_reports", "view_cost_reports",
    "manage_menu", "edit_recipe", "manage_inventory", "adjust_stock", "large_stock_adjustment",
    "manage_staff", "manage_tables", "manage_outlets", "manage_offers", "manage_crm",
    "manage_delivery", "manage_cleaning", "manage_audits", "manage_suppliers",
    "manage_procurement", "approve_purchase", "manage_integrations", "manage_settings",
    "manage_billing", "manage_users", "view_audit_log", "manage_security", "supervisor_override",
    "close_shift", "kitchen_rush",
  ],
  delivery_agent: [
    "create_order", "edit_order",
  ],
};

export const supervisorRequiredActions: PermissionAction[] = [
  "void_order",
  "apply_large_discount",
  "change_price",
  "large_stock_adjustment",
  "close_shift",
  "kitchen_rush",
];

export const actionLabels: Record<PermissionAction, string> = {
  create_order: "Create Order",
  edit_order: "Edit Order",
  void_order: "Void Order",
  apply_discount: "Apply Discount",
  apply_large_discount: "Apply Large Discount",
  change_price: "Change Price",
  close_day: "Close Day",
  view_reports: "View Reports",
  view_cost_reports: "View Cost Reports",
  manage_menu: "Manage Menu",
  edit_recipe: "Edit Recipe",
  manage_inventory: "Manage Inventory",
  adjust_stock: "Adjust Stock",
  large_stock_adjustment: "Large Stock Adjustment",
  manage_staff: "Manage Staff",
  manage_tables: "Manage Tables",
  manage_outlets: "Manage Outlets",
  manage_offers: "Manage Offers",
  manage_crm: "Manage CRM",
  manage_delivery: "Manage Delivery",
  manage_cleaning: "Manage Cleaning",
  manage_audits: "Manage Audits",
  manage_suppliers: "Manage Suppliers",
  manage_procurement: "Manage Procurement",
  approve_purchase: "Approve Purchase",
  manage_integrations: "Manage Integrations",
  manage_settings: "Manage Settings",
  manage_billing: "Manage Billing",
  manage_users: "Manage Users",
  view_audit_log: "View Audit Log",
  manage_security: "Manage Security",
  supervisor_override: "Supervisor Override",
  close_shift: "Close Shift",
  kitchen_rush: "Kitchen Rush Order",
};

export const roleLabels: Record<UserRole, string> = {
  owner: "Owner",
  franchise_owner: "Franchise Owner",
  hq_admin: "HQ Admin",
  manager: "Manager",
  outlet_manager: "Outlet Manager",
  supervisor: "Supervisor",
  cashier: "Cashier",
  waiter: "Waiter",
  kitchen: "Kitchen",
  accountant: "Accountant",
  auditor: "Auditor",
  customer: "Customer",
  super_admin: "Super Admin",
  delivery_agent: "Delivery Agent",
};

export const allRoles: UserRole[] = [
  "owner", "franchise_owner", "hq_admin", "manager", "outlet_manager",
  "supervisor", "cashier", "waiter", "kitchen", "accountant", "auditor", "customer",
  "super_admin", "delivery_agent",
];

export function getPermissionsForRole(role: string): PermissionAction[] {
  return rolePermissions[role as UserRole] || [];
}

export function getAllActions(): PermissionAction[] {
  const actions = new Set<PermissionAction>();
  for (const perms of Object.values(rolePermissions)) {
    for (const p of perms) actions.add(p);
  }
  return Array.from(actions);
}
