import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import {
  Shield, Clock, Monitor, ShieldCheck, KeyRound, Users, Save, Loader2,
  Smartphone, Trash2, CheckCircle, Lock, QrCode, Copy, Eye, EyeOff,
  AlertTriangle, Bell, Globe, Download, UserX, Database, Plus, X, Info,
} from "lucide-react";

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

import { actionLabels, rolePermissions, allRoles, roleLabels } from "@shared/permissions-config";

const PERMISSION_LABELS: Record<string, string> = actionLabels;

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800",
  franchise_owner: "bg-red-100 text-red-800",
  hq_admin: "bg-violet-100 text-violet-800",
  manager: "bg-blue-100 text-blue-800",
  outlet_manager: "bg-indigo-100 text-indigo-800",
  supervisor: "bg-yellow-100 text-yellow-800",
  cashier: "bg-cyan-100 text-cyan-800",
  waiter: "bg-green-100 text-green-800",
  kitchen: "bg-orange-100 text-orange-800",
  accountant: "bg-gray-100 text-gray-800",
  auditor: "bg-slate-100 text-slate-800",
  customer: "bg-neutral-100 text-neutral-600",
};

function getRoleLabel(role: string): string {
  return (roleLabels as Record<string, string>)[role] || role;
}

function getRoleColor(role: string): string {
  return ROLE_COLORS[role] || "bg-gray-100 text-gray-800";
}

export default function SecuritySettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: settings, isLoading } = useQuery<SecuritySettings>({
    queryKey: ["/api/security/settings"],
    queryFn: async () => {
      const res = await fetch("/api/security/settings", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load security settings: ${res.status}`);
      return res.json();
    },
  });

  const { data: permissions } = useQuery<PermissionsData>({
    queryKey: ["/api/permissions"],
    queryFn: async () => {
      const res = await fetch("/api/permissions", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load permissions: ${res.status}`);
      return res.json();
    },
  });

  const { data: allUsers } = useQuery<Array<{ id: string; name: string; role: string; username: string }>>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load users: ${res.status}`);
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
      if (!res.ok) throw new Error(`Failed to load device sessions: ${res.status}`);
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

      <div
        className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5 text-sm"
        data-testid="banner-encryption-info"
      >
        <Info className="h-4 w-4 text-primary shrink-0" />
        <span className="text-muted-foreground">
          All sensitive data is encrypted at rest using <strong className="text-foreground">AES-256-GCM</strong>.
          Authentication uses <strong className="text-foreground">Session + TOTP</strong>.
          TLS enforced in production via HSTS.
        </span>
      </div>

      <SecurityAlertsCard />

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TwoFactorCard />
        <PasswordChangeCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IpAllowlistCard />
        <DataPrivacyCard />
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
            {allRoles.map((role) => {
              const roleUsers = (allUsers || []).filter(u => u.role === role);
              return (
                <div key={role} className="border rounded-lg p-4" data-testid={`role-permissions-${role}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <Badge className={`${getRoleColor(role)} border-0`}>{getRoleLabel(role)}</Badge>
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

interface AlertItem {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string | null;
  ipAddress: string | null;
  acknowledged: boolean;
  createdAt: string | null;
}

function SecurityAlertsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isOwner = user?.role === "owner" || user?.role === "hq_admin" || user?.role === "franchise_owner";

  const { data: alertsData } = useQuery<{ data: AlertItem[]; total: number }>({
    queryKey: ["/api/security-alerts"],
    queryFn: async () => {
      const res = await fetch("/api/security-alerts?limit=20", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load security alerts: ${res.status}`);
      return res.json();
    },
    enabled: isOwner,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/security-alerts/${id}/acknowledge`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/security-alerts/unread-count"] });
      toast({ title: "Alert acknowledged" });
    },
  });

  const acknowledgeAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/security-alerts/acknowledge-all");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/security-alerts/unread-count"] });
      toast({ title: "All alerts acknowledged" });
    },
  });

  if (!isOwner) return null;

  const alerts = alertsData?.data || [];
  const unacknowledged = alerts.filter(a => !a.acknowledged);

  const severityColors: Record<string, string> = {
    critical: "bg-red-100 text-red-800 border-red-200",
    warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
    info: "bg-blue-100 text-blue-800 border-blue-200",
  };

  const severityIcons: Record<string, typeof AlertTriangle> = {
    critical: AlertTriangle,
    warning: Bell,
    info: Shield,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Security Alerts
              {unacknowledged.length > 0 && (
                <Badge variant="destructive" className="ml-2" data-testid="badge-unread-alerts">
                  {unacknowledged.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Monitor suspicious activity and security events</CardDescription>
          </div>
          {unacknowledged.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => acknowledgeAllMutation.mutate()}
              disabled={acknowledgeAllMutation.isPending}
              data-testid="button-acknowledge-all-alerts"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Acknowledge All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No security alerts</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto" data-testid="security-alerts-list">
            {alerts.map((alert) => {
              const IconComp = severityIcons[alert.severity] || Shield;
              return (
                <div
                  key={alert.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${alert.acknowledged ? "opacity-60" : ""} ${severityColors[alert.severity] || ""}`}
                  data-testid={`security-alert-${alert.id}`}
                >
                  <IconComp className="h-5 w-5 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{alert.title}</p>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{alert.severity}</Badge>
                    </div>
                    {alert.description && <p className="text-xs mt-0.5 opacity-80">{alert.description}</p>}
                    <p className="text-[10px] mt-1 opacity-60">
                      {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : ""}
                      {alert.ipAddress ? ` · IP: ${alert.ipAddress}` : ""}
                    </p>
                  </div>
                  {!alert.acknowledged && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => acknowledgeMutation.mutate(alert.id)}
                      disabled={acknowledgeMutation.isPending}
                      data-testid={`button-acknowledge-alert-${alert.id}`}
                    >
                      <CheckCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const MANAGEABLE_ROLES = ["owner", "manager", "waiter", "kitchen", "accountant"] as const;

function IpAllowlistCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user?.role === "owner";
  const [newCidr, setNewCidr] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [newRoleCidr, setNewRoleCidr] = useState("");

  interface IpAllowlistData {
    ipAllowlist: string[];
    ipAllowlistEnabled: boolean;
    ipAllowlistRoles: Record<string, string[]>;
  }

  const { data: ipData } = useQuery<IpAllowlistData>({
    queryKey: ["/api/security/ip-allowlist"],
    queryFn: async () => {
      const res = await fetch("/api/security/ip-allowlist", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load IP allowlist: ${res.status}`);
      return res.json();
    },
    enabled: isOwner || user?.role === "hq_admin",
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { ipAllowlist?: string[]; ipAllowlistEnabled?: boolean; ipAllowlistRoles?: Record<string, string[]> }) => {
      const res = await apiRequest("PUT", "/api/security/ip-allowlist", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security/ip-allowlist"] });
      toast({ title: "IP access rules updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const addCidr = () => {
    if (!newCidr.trim()) return;
    const currentList = ipData?.ipAllowlist || [];
    if (currentList.includes(newCidr.trim())) {
      toast({ title: "Already in list", variant: "destructive" });
      return;
    }
    saveMutation.mutate({ ipAllowlist: [...currentList, newCidr.trim()] });
    setNewCidr("");
  };

  const removeCidr = (cidr: string) => {
    const currentList = ipData?.ipAllowlist || [];
    saveMutation.mutate({ ipAllowlist: currentList.filter(c => c !== cidr) });
  };

  const toggleEnabled = (enabled: boolean) => {
    saveMutation.mutate({ ipAllowlistEnabled: enabled });
  };

  const addRoleCidr = () => {
    if (!selectedRole || !newRoleCidr.trim()) return;
    const roles = { ...(ipData?.ipAllowlistRoles || {}) };
    const roleList = roles[selectedRole] || [];
    if (roleList.includes(newRoleCidr.trim())) {
      toast({ title: "Already in role list", variant: "destructive" });
      return;
    }
    roles[selectedRole] = [...roleList, newRoleCidr.trim()];
    saveMutation.mutate({ ipAllowlistRoles: roles });
    setNewRoleCidr("");
  };

  const removeRoleCidr = (role: string, cidr: string) => {
    const roles = { ...(ipData?.ipAllowlistRoles || {}) };
    roles[role] = (roles[role] || []).filter(c => c !== cidr);
    if (roles[role].length === 0) delete roles[role];
    saveMutation.mutate({ ipAllowlistRoles: roles });
  };

  if (!isOwner && user?.role !== "hq_admin") return null;

  const roleRules = ipData?.ipAllowlistRoles || {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          IP Access Rules
        </CardTitle>
        <CardDescription>Restrict admin access to trusted IP addresses (global and per-role)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable IP Allowlist</p>
            <p className="text-xs text-muted-foreground">When enabled, only listed IPs can access admin routes</p>
          </div>
          <Switch
            checked={ipData?.ipAllowlistEnabled || false}
            onCheckedChange={toggleEnabled}
            disabled={!isOwner || saveMutation.isPending}
            data-testid="switch-ip-allowlist"
          />
        </div>
        <Separator />
        <div className="space-y-2">
          <Label>Global Allowed IPs / CIDR Ranges</Label>
          <p className="text-xs text-muted-foreground">Applies to all roles unless overridden by role-specific rules below</p>
          <div className="flex gap-2">
            <Input
              value={newCidr}
              onChange={(e) => setNewCidr(e.target.value)}
              placeholder="e.g., 192.168.1.0/24 or 10.0.0.1"
              disabled={!isOwner}
              data-testid="input-new-cidr"
            />
            <Button
              onClick={addCidr}
              disabled={!newCidr.trim() || !isOwner || saveMutation.isPending}
              size="sm"
              data-testid="button-add-cidr"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {(ipData?.ipAllowlist || []).length > 0 ? (
          <div className="space-y-2" data-testid="ip-allowlist">
            {(ipData?.ipAllowlist || []).map((cidr, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 border rounded">
                <code className="text-sm font-mono">{cidr}</code>
                {isOwner && (
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => removeCidr(cidr)} data-testid={`button-remove-cidr-${idx}`}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">No global IP rules configured. All IPs are allowed.</p>
        )}
        <Separator />
        <div className="space-y-2">
          <Label>Role-Specific IP Rules</Label>
          <p className="text-xs text-muted-foreground">Override global rules for specific roles. When set, only these IPs are allowed for that role.</p>
          <div className="flex gap-2">
            <Select value={selectedRole || "__none__"} onValueChange={(v) => setSelectedRole(v === "__none__" ? "" : v)} disabled={!isOwner}>
              <SelectTrigger className="w-36" data-testid="select-role-ip">
                <SelectValue placeholder="Select role..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select role...</SelectItem>
                {MANAGEABLE_ROLES.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={newRoleCidr}
              onChange={(e) => setNewRoleCidr(e.target.value)}
              placeholder="e.g., 10.0.0.0/8"
              disabled={!isOwner || !selectedRole}
              className="flex-1"
              data-testid="input-role-cidr"
            />
            <Button
              onClick={addRoleCidr}
              disabled={!selectedRole || !newRoleCidr.trim() || !isOwner || saveMutation.isPending}
              size="sm"
              data-testid="button-add-role-cidr"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {Object.keys(roleRules).length > 0 ? (
          <div className="space-y-3" data-testid="role-ip-rules">
            {Object.entries(roleRules).map(([role, cidrs]) => (
              <div key={role} className="space-y-1">
                <p className="text-sm font-medium capitalize">{role}</p>
                {(cidrs as string[]).map((cidr, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 border rounded ml-4">
                    <code className="text-sm font-mono">{cidr}</code>
                    {isOwner && (
                      <Button variant="ghost" size="sm" className="text-red-500" onClick={() => removeRoleCidr(role, cidr)} data-testid={`button-remove-role-cidr-${role}-${idx}`}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">No role-specific rules. Global rules apply to all roles.</p>
        )}
      </CardContent>
    </Card>
  );
}

function DataPrivacyCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user?.role === "owner";
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: retentionPolicy } = useQuery<{ dataRetentionMonths: number; autoDeleteAnonymized: boolean; auditLogRetentionMonths: number }>({
    queryKey: ["/api/gdpr/retention-policy"],
    queryFn: async () => {
      const res = await fetch("/api/gdpr/retention-policy", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load retention policy: ${res.status}`);
      return res.json();
    },
    enabled: isOwner || user?.role === "hq_admin",
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/gdpr/export", { method: "POST", credentials: "include", headers: { "x-csrf-token": document.cookie.match(/csrf-token=([^;]+)/)?.[1] || "" } });
      if (!res.ok) throw new Error("Export failed");
      const { downloadUrl } = await res.json() as { downloadUrl: string };
      const downloadRes = await fetch(downloadUrl, { credentials: "include" });
      if (!downloadRes.ok) throw new Error("Download failed");
      const data = await downloadRes.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `data-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Data exported successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    },
  });

  const anonymizeMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiRequest("POST", "/api/gdpr/delete-account", { password });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Account anonymized" });
      window.location.href = "/";
    },
    onError: (err: Error) => {
      toast({ title: "Anonymization failed", description: err.message, variant: "destructive" });
    },
  });

  const retentionMutation = useMutation({
    mutationFn: async (data: { dataRetentionMonths?: number; autoDeleteAnonymized?: boolean; auditLogRetentionMonths?: number }) => {
      const res = await apiRequest("PUT", "/api/gdpr/retention-policy", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gdpr/retention-policy"] });
      toast({ title: "Retention policy updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Data & Privacy
        </CardTitle>
        <CardDescription>GDPR controls, data export, and retention policies</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Export My Data</p>
              <p className="text-xs text-muted-foreground">Download a JSON file of your personal data</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              data-testid="button-export-data"
            >
              {exportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
              Export
            </Button>
          </div>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">Delete My Account</p>
                <p className="text-xs text-muted-foreground">Anonymize all personal data. This cannot be undone.</p>
              </div>
              {!showDeleteConfirm && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid="button-delete-account"
                >
                  <UserX className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              )}
            </div>
            {showDeleteConfirm && (
              <div className="p-3 border border-red-200 rounded-lg bg-red-50 space-y-2">
                <p className="text-xs text-red-800 font-medium">This will permanently anonymize your account data.</p>
                <Input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter your password to confirm"
                  data-testid="input-delete-account-password"
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => anonymizeMutation.mutate(deletePassword)}
                    disabled={!deletePassword || anonymizeMutation.isPending}
                    data-testid="button-confirm-delete-account"
                  >
                    {anonymizeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Confirm Delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {(isOwner || user?.role === "hq_admin") && retentionPolicy && (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="text-sm font-semibold">Retention Policy</p>
              <div className="space-y-2">
                <Label>Data Retention Period</Label>
                <Select
                  value={String(retentionPolicy.dataRetentionMonths)}
                  onValueChange={(v) => retentionMutation.mutate({ dataRetentionMonths: parseInt(v) })}
                  disabled={!isOwner}
                >
                  <SelectTrigger data-testid="select-data-retention">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">12 months</SelectItem>
                    <SelectItem value="24">24 months</SelectItem>
                    <SelectItem value="36">36 months</SelectItem>
                    <SelectItem value="60">60 months</SelectItem>
                    <SelectItem value="120">10 years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Audit Log Retention</Label>
                <Select
                  value={String(retentionPolicy.auditLogRetentionMonths)}
                  onValueChange={(v) => retentionMutation.mutate({ auditLogRetentionMonths: parseInt(v) })}
                  disabled={!isOwner}
                >
                  <SelectTrigger data-testid="select-audit-retention">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">12 months</SelectItem>
                    <SelectItem value="24">24 months</SelectItem>
                    <SelectItem value="36">36 months</SelectItem>
                    <SelectItem value="60">60 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Auto-purge anonymized records</p>
                  <p className="text-xs text-muted-foreground">Automatically delete anonymized customer data after retention period</p>
                </div>
                <Switch
                  checked={retentionPolicy.autoDeleteAnonymized}
                  onCheckedChange={(v) => retentionMutation.mutate({ autoDeleteAnonymized: v })}
                  disabled={!isOwner}
                  data-testid="switch-auto-purge"
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TwoFactorCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"idle" | "setup" | "verify" | "recovery">("idle");
  const [qrData, setQrData] = useState<{ qrCodeUrl: string; secret: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisable, setShowDisable] = useState(false);

  const is2FAEnabled = (user as Record<string, unknown>)?.totpEnabled === true;

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/2fa/setup");
      return res.json();
    },
    onSuccess: (data: { qrCodeUrl: string; secret: string }) => {
      setQrData(data);
      setStep("setup");
    },
    onError: (err: Error) => {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/auth/2fa/verify", { code });
      return res.json();
    },
    onSuccess: (data: { recoveryCodes: string[] }) => {
      setRecoveryCodes(data.recoveryCodes);
      setStep("recovery");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Two-factor authentication enabled" });
    },
    onError: (err: Error) => {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiRequest("POST", "/api/auth/2fa/disable", { password });
      return res.json();
    },
    onSuccess: () => {
      setShowDisable(false);
      setDisablePassword("");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Two-factor authentication disabled" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to disable", description: err.message, variant: "destructive" });
    },
  });

  const copyRecoveryCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    toast({ title: "Recovery codes copied to clipboard" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>Add an extra layer of security to your account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "idle" && !is2FAEnabled && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Protect your account with TOTP-based two-factor authentication using apps like Google Authenticator, Authy, or 1Password.
            </p>
            <Button
              onClick={() => setupMutation.mutate()}
              disabled={setupMutation.isPending}
              data-testid="button-setup-2fa"
            >
              {setupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
              Set Up 2FA
            </Button>
          </div>
        )}

        {step === "idle" && is2FAEnabled && !showDisable && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <p className="text-sm font-medium text-green-800">Two-factor authentication is enabled</p>
            </div>
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700"
              onClick={() => setShowDisable(true)}
              data-testid="button-disable-2fa"
            >
              Disable 2FA
            </Button>
          </div>
        )}

        {step === "idle" && is2FAEnabled && showDisable && (
          <div className="space-y-3">
            <Label>Enter your password to confirm</Label>
            <Input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="Current password"
              data-testid="input-disable-2fa-password"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => disableMutation.mutate(disablePassword)}
                disabled={!disablePassword || disableMutation.isPending}
                data-testid="button-confirm-disable-2fa"
              >
                {disableMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirm Disable
              </Button>
              <Button variant="ghost" onClick={() => { setShowDisable(false); setDisablePassword(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === "setup" && qrData && (
          <div className="space-y-4">
            <p className="text-sm">Scan this QR code with your authenticator app:</p>
            <div className="flex justify-center">
              <img src={qrData.qrCodeUrl} alt="2FA QR Code" className="w-48 h-48 border rounded-lg" data-testid="img-2fa-qr" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Or enter this secret manually:</Label>
              <code className="block text-xs bg-muted p-2 rounded font-mono break-all" data-testid="text-2fa-secret">{qrData.secret}</code>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Enter the 6-digit code from your app to verify</Label>
              <Input
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="000000"
                className="text-center text-lg tracking-widest font-mono"
                maxLength={6}
                data-testid="input-2fa-verify"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => verifyMutation.mutate(verifyCode)}
                disabled={verifyCode.length !== 6 || verifyMutation.isPending}
                data-testid="button-verify-2fa"
              >
                {verifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Verify & Enable
              </Button>
              <Button variant="ghost" onClick={() => { setStep("idle"); setQrData(null); setVerifyCode(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === "recovery" && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <p className="text-sm font-medium text-yellow-800 mb-1">Save your recovery codes!</p>
              <p className="text-xs text-yellow-700">Store these codes safely. Each code can only be used once if you lose access to your authenticator app.</p>
            </div>
            <div className="grid grid-cols-2 gap-2" data-testid="recovery-codes-list">
              {recoveryCodes.map((code, i) => (
                <code key={i} className="text-sm bg-muted p-2 rounded font-mono text-center">{code}</code>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={copyRecoveryCodes} data-testid="button-copy-recovery-codes">
                <Copy className="h-4 w-4 mr-2" />
                Copy All
              </Button>
              <Button onClick={() => { setStep("idle"); setRecoveryCodes([]); setQrData(null); setVerifyCode(""); }}>
                Done
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PasswordChangeCard() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  interface PasswordPolicy {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireDigit: boolean;
    requireSpecialChar: boolean;
    preventReuseCount: number;
    maxAgeDays: number;
  }

  const { data: policy } = useQuery<PasswordPolicy>({
    queryKey: ["/api/auth/password-policy"],
    queryFn: async () => {
      const res = await fetch("/api/auth/password-policy", { credentials: "include" });
      return res.json();
    },
  });

  const changeMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/auth/change-password", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: Error) => {
      toast({ title: "Password change failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    changeMutation.mutate({ currentPassword, newPassword });
  };

  const checks = policy ? [
    { label: `At least ${policy.minLength} characters`, met: newPassword.length >= policy.minLength },
    ...(policy.requireUppercase ? [{ label: "Uppercase letter", met: /[A-Z]/.test(newPassword) }] : []),
    ...(policy.requireLowercase ? [{ label: "Lowercase letter", met: /[a-z]/.test(newPassword) }] : []),
    ...(policy.requireDigit ? [{ label: "Number", met: /[0-9]/.test(newPassword) }] : []),
    ...(policy.requireSpecialChar ? [{ label: "Special character", met: /[^A-Za-z0-9]/.test(newPassword) }] : []),
  ] : [];

  const allMet = checks.length > 0 && checks.every(c => c.met);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Change Password
        </CardTitle>
        <CardDescription>Update your account password</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Current Password</Label>
          <div className="relative">
            <Input
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              data-testid="input-current-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowCurrent(!showCurrent)}
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>New Password</Label>
          <div className="relative">
            <Input
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              data-testid="input-new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowNew(!showNew)}
              tabIndex={-1}
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {newPassword && checks.length > 0 && (
          <div className="space-y-1 text-xs" data-testid="password-requirements">
            {checks.map((c, i) => (
              <div key={i} className={`flex items-center gap-1.5 ${c.met ? "text-green-600" : "text-muted-foreground"}`}>
                <CheckCircle className={`h-3 w-3 ${c.met ? "text-green-600" : "text-gray-300"}`} />
                {c.label}
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <Label>Confirm New Password</Label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            data-testid="input-confirm-password"
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-red-500">Passwords don't match</p>
          )}
        </div>
        {policy && policy.preventReuseCount > 0 && (
          <p className="text-xs text-muted-foreground">Cannot reuse your last {policy.preventReuseCount} passwords</p>
        )}
        <Button
          onClick={handleSubmit}
          disabled={!currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || !allMet || changeMutation.isPending}
          data-testid="button-change-password"
        >
          {changeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
          Change Password
        </Button>
      </CardContent>
    </Card>
  );
}

function getPermissionsForRoleFE(role: string): string[] {
  return (rolePermissions as Record<string, string[]>)[role] || [];
}
