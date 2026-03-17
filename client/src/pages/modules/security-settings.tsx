import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Shield, Clock, Monitor, ShieldCheck, KeyRound, Users, Save, Loader2, Smartphone, Trash2, CheckCircle } from "lucide-react";

interface SecuritySettings {
  idleTimeoutMinutes: number;
  maxConcurrentSessions: number;
  requireSupervisorForVoid: boolean;
  requireSupervisorForLargeDiscount: boolean;
  largeDiscountThreshold: number;
  requireSupervisorForPriceChange: boolean;
  requireSupervisorForLargeStockAdjustment: boolean;
  largeStockAdjustmentThreshold: number;
}

interface PermissionsData {
  role: string;
  permissions: string[];
}

const PERMISSION_LABELS: Record<string, string> = {
  create_order: "Create Orders",
  edit_order: "Edit Orders",
  void_order: "Void Orders",
  apply_discount: "Apply Discounts",
  apply_large_discount: "Apply Large Discounts",
  change_price: "Change Prices",
  close_day: "Close Day",
  view_reports: "View Reports",
  view_cost_reports: "View Cost Reports",
  manage_menu: "Manage Menu",
  edit_recipe: "Edit Recipes",
  manage_inventory: "Manage Inventory",
  adjust_stock: "Adjust Stock",
  large_stock_adjustment: "Large Stock Adjustments",
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
  approve_purchase: "Approve Purchases",
  manage_integrations: "Manage Integrations",
  manage_settings: "Manage Settings",
  manage_billing: "Manage Billing",
  manage_users: "Manage Users",
  view_audit_log: "View Audit Log",
  manage_security: "Manage Security",
  supervisor_override: "Supervisor Override",
};

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: "Owner", color: "bg-purple-100 text-purple-800" },
  manager: { label: "Manager", color: "bg-blue-100 text-blue-800" },
  waiter: { label: "Waiter", color: "bg-green-100 text-green-800" },
  kitchen: { label: "Kitchen", color: "bg-orange-100 text-orange-800" },
  accountant: { label: "Accountant", color: "bg-gray-100 text-gray-800" },
};

export default function SecuritySettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: settings, isLoading } = useQuery<SecuritySettings>({
    queryKey: ["/api/security/settings"],
    queryFn: async () => {
      const res = await fetch("/api/security/settings", { credentials: "include" });
      return res.json();
    },
  });

  const { data: permissions } = useQuery<PermissionsData>({
    queryKey: ["/api/permissions"],
    queryFn: async () => {
      const res = await fetch("/api/permissions", { credentials: "include" });
      return res.json();
    },
  });

  const { data: allUsers } = useQuery<Array<{ id: string; name: string; role: string; username: string }>>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      return res.json();
    },
  });

  interface DeviceSession {
    id: string;
    deviceName: string | null;
    browser: string | null;
    os: string | null;
    ipAddress: string | null;
    isTrusted: boolean | null;
    lastActive: string | null;
    createdAt: string | null;
  }

  const { data: deviceSessionsData } = useQuery<DeviceSession[]>({
    queryKey: ["/api/device-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/device-sessions", { credentials: "include" });
      return res.json();
    },
  });

  const trustDeviceMutation = useMutation({
    mutationFn: async ({ id, trusted }: { id: string; trusted: boolean }) => {
      const res = await apiRequest("PATCH", `/api/device-sessions/${id}/trust`, { trusted });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-sessions"] });
      toast({ title: "Device trust status updated" });
    },
  });

  const revokeDeviceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/device-sessions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-sessions"] });
      toast({ title: "Device session revoked" });
    },
  });

  const [form, setForm] = useState<SecuritySettings | null>(null);

  const currentForm = form || settings;

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<SecuritySettings>) => {
      const res = await apiRequest("PATCH", "/api/security/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security/settings"] });
      toast({ title: "Security settings updated" });
      setForm(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (currentForm) saveMutation.mutate(currentForm);
  };

  const updateField = <K extends keyof SecuritySettings>(key: K, value: SecuritySettings[K]) => {
    setForm(prev => ({ ...(prev || settings || {} as SecuritySettings), [key]: value }));
  };

  if (isLoading || !currentForm) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isOwner = user?.role === "owner";

  return (
    <div className="space-y-6" data-testid="security-settings-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-security-title">
            <Shield className="h-6 w-6 text-primary" />
            Security & Governance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Manage access controls, session policies, and supervisor approvals</p>
        </div>
        {isOwner && form && (
          <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-security">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Session Controls
            </CardTitle>
            <CardDescription>Configure session timeout and concurrent session limits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Idle Timeout (minutes)</Label>
              <Input
                type="number"
                value={currentForm.idleTimeoutMinutes}
                onChange={(e) => updateField("idleTimeoutMinutes", parseInt(e.target.value) || 30)}
                min={5}
                max={480}
                disabled={!isOwner}
                data-testid="input-idle-timeout"
              />
              <p className="text-xs text-muted-foreground">Users will be logged out after this period of inactivity</p>
            </div>
            <div className="space-y-2">
              <Label>Max Concurrent Sessions</Label>
              <Input
                type="number"
                value={currentForm.maxConcurrentSessions}
                onChange={(e) => updateField("maxConcurrentSessions", parseInt(e.target.value) || 5)}
                min={1}
                max={20}
                disabled={!isOwner}
                data-testid="input-max-sessions"
              />
              <p className="text-xs text-muted-foreground">Maximum number of active sessions per user</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Supervisor Approvals
            </CardTitle>
            <CardDescription>Control which actions require supervisor authorization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Void Orders</p>
                <p className="text-xs text-muted-foreground">Require approval to void completed orders</p>
              </div>
              <Switch
                checked={currentForm.requireSupervisorForVoid}
                onCheckedChange={(v) => updateField("requireSupervisorForVoid", v)}
                disabled={!isOwner}
                data-testid="switch-supervisor-void"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Large Discounts</p>
                <p className="text-xs text-muted-foreground">Require approval for discounts above threshold</p>
              </div>
              <Switch
                checked={currentForm.requireSupervisorForLargeDiscount}
                onCheckedChange={(v) => updateField("requireSupervisorForLargeDiscount", v)}
                disabled={!isOwner}
                data-testid="switch-supervisor-discount"
              />
            </div>
            {currentForm.requireSupervisorForLargeDiscount && (
              <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                <Label>Discount Threshold (%)</Label>
                <Input
                  type="number"
                  value={currentForm.largeDiscountThreshold}
                  onChange={(e) => updateField("largeDiscountThreshold", parseInt(e.target.value) || 20)}
                  min={1}
                  max={100}
                  disabled={!isOwner}
                  data-testid="input-discount-threshold"
                />
              </div>
            )}
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Price Changes</p>
                <p className="text-xs text-muted-foreground">Require approval when editing menu prices</p>
              </div>
              <Switch
                checked={currentForm.requireSupervisorForPriceChange}
                onCheckedChange={(v) => updateField("requireSupervisorForPriceChange", v)}
                disabled={!isOwner}
                data-testid="switch-supervisor-price"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Large Stock Adjustments</p>
                <p className="text-xs text-muted-foreground">Require approval for stock adjustments above threshold</p>
              </div>
              <Switch
                checked={currentForm.requireSupervisorForLargeStockAdjustment}
                onCheckedChange={(v) => updateField("requireSupervisorForLargeStockAdjustment", v)}
                disabled={!isOwner}
                data-testid="switch-supervisor-stock"
              />
            </div>
            {currentForm.requireSupervisorForLargeStockAdjustment && (
              <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                <Label>Stock Adjustment Threshold (units)</Label>
                <Input
                  type="number"
                  value={currentForm.largeStockAdjustmentThreshold}
                  onChange={(e) => updateField("largeStockAdjustmentThreshold", parseInt(e.target.value) || 50)}
                  min={1}
                  max={10000}
                  disabled={!isOwner}
                  data-testid="input-stock-threshold"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Role Permissions Matrix
          </CardTitle>
          <CardDescription>View permissions assigned to each role in the system</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(ROLE_LABELS).map(([role, config]) => {
              const roleUsers = (allUsers || []).filter(u => u.role === role);
              return (
                <div key={role} className="border rounded-lg p-4" data-testid={`role-permissions-${role}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <Badge className={`${config.color} border-0`}>{config.label}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {roleUsers.length} user{roleUsers.length !== 1 ? "s" : ""}
                      {roleUsers.length > 0 && ` (${roleUsers.map(u => u.name).join(", ")})`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {getPermissionsForRoleFE(role).map(perm => (
                      <Badge key={perm} variant="outline" className="text-xs font-normal">
                        {PERMISSION_LABELS[perm] || perm}
                      </Badge>
                    ))}
                    {getPermissionsForRoleFE(role).length === 0 && (
                      <span className="text-xs text-muted-foreground">No permissions</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Trusted Devices
          </CardTitle>
          <CardDescription>Manage devices that have accessed your account</CardDescription>
        </CardHeader>
        <CardContent>
          {deviceSessionsData && deviceSessionsData.length > 0 ? (
            <div className="space-y-3" data-testid="device-sessions-list">
              {deviceSessionsData.map((ds) => (
                <div key={ds.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`device-session-${ds.id}`}>
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{ds.deviceName || "Unknown Device"}</p>
                      <p className="text-xs text-muted-foreground">
                        {[ds.browser, ds.os].filter(Boolean).join(" · ") || "Unknown"} · {ds.ipAddress || "N/A"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last active: {ds.lastActive ? new Date(ds.lastActive).toLocaleString() : "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ds.isTrusted ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle className="h-3 w-3 mr-1" /> Trusted
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => trustDeviceMutation.mutate({ id: ds.id, trusted: true })}
                        data-testid={`button-trust-device-${ds.id}`}
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Trust
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => revokeDeviceMutation.mutate(ds.id)}
                      data-testid={`button-revoke-device-${ds.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-devices">No device sessions found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
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
  waiter: ["create_order", "edit_order", "apply_discount", "manage_tables"],
  kitchen: ["edit_order"],
  accountant: ["view_reports", "view_cost_reports", "view_audit_log"],
};

function getPermissionsForRoleFE(role: string): string[] {
  return ROLE_PERMISSIONS[role] || [];
}
