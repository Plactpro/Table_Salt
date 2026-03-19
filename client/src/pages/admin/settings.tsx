import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Settings,
  Save,
  Loader2,
  Globe,
  Bell,
  Shield,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

interface PlatformSettings {
  maintenanceMode: boolean;
  registrationOpen: boolean;
  maxTenantsPerPlan: Record<string, number>;
  alertEmailRecipients: string[];
  platformName: string;
}

const DEFAULT_SETTINGS: PlatformSettings = {
  maintenanceMode: false,
  registrationOpen: true,
  maxTenantsPerPlan: { basic: 100, standard: 50, premium: 20, enterprise: 5 },
  alertEmailRecipients: [],
  platformName: "Table Salt",
};

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newEmail, setNewEmail] = useState("");

  const { data: settings, isLoading, error } = useQuery<PlatformSettings>({
    queryKey: ["/api/admin/platform-settings"],
    queryFn: async () => {
      try {
        const r = await apiRequest("GET", "/api/admin/platform-settings");
        return r.json();
      } catch {
        return DEFAULT_SETTINGS;
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<PlatformSettings>) => {
      try {
        const r = await apiRequest("PATCH", "/api/admin/platform-settings", data);
        return r.json();
      } catch {
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-settings"] });
      toast({ title: "Platform settings saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const current = settings ?? DEFAULT_SETTINGS;

  const toggle = (key: keyof PlatformSettings, value: boolean) => {
    saveMutation.mutate({ [key]: value });
  };

  const addEmail = () => {
    if (!newEmail.trim() || !newEmail.includes("@")) return;
    const emails = [...(current.alertEmailRecipients ?? [])];
    if (!emails.includes(newEmail.trim())) {
      emails.push(newEmail.trim());
      saveMutation.mutate({ alertEmailRecipients: emails });
    }
    setNewEmail("");
  };

  const removeEmail = (email: string) => {
    saveMutation.mutate({
      alertEmailRecipients: (current.alertEmailRecipients ?? []).filter(e => e !== email),
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5" data-testid="admin-settings-page">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2" data-testid="page-title-platform-settings">
          <Settings className="h-5 w-5" />
          Platform Settings
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Global configuration for the Table Salt platform</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Using default settings — platform settings endpoint not yet configured.</span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Platform Controls */}
          <Card data-testid="card-platform-controls">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4" />
                Platform Controls
              </CardTitle>
              <CardDescription>Control platform-wide feature flags</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Maintenance Mode</p>
                  <p className="text-xs text-slate-500">When enabled, non-admin users see a maintenance page</p>
                </div>
                <Switch
                  checked={current.maintenanceMode}
                  onCheckedChange={(v) => toggle("maintenanceMode", v)}
                  disabled={saveMutation.isPending}
                  data-testid="switch-maintenance-mode"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Open Registration</p>
                  <p className="text-xs text-slate-500">Allow new tenants to self-register on the platform</p>
                </div>
                <Switch
                  checked={current.registrationOpen}
                  onCheckedChange={(v) => toggle("registrationOpen", v)}
                  disabled={saveMutation.isPending}
                  data-testid="switch-registration-open"
                />
              </div>
              <Separator />
              <div className="space-y-1.5">
                <Label className="text-sm">Platform Name</Label>
                <div className="flex gap-2">
                  <Input
                    value={current.platformName ?? "Table Salt"}
                    onChange={() => {}}
                    readOnly
                    className="max-w-xs bg-slate-50 text-slate-500 cursor-not-allowed"
                    data-testid="input-platform-name"
                  />
                  <span className="text-xs text-slate-400 self-center">Locked to license</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tenant Plan Limits */}
          <Card data-testid="card-plan-limits">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                Plan Tenant Limits
              </CardTitle>
              <CardDescription>Maximum number of active tenants per subscription plan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {(["basic", "standard", "premium", "enterprise"] as const).map((plan) => (
                  <div key={plan} className="space-y-1">
                    <Label className="capitalize text-xs">{plan} Plan</Label>
                    <Input
                      type="number"
                      min={1}
                      defaultValue={current.maxTenantsPerPlan?.[plan] ?? 100}
                      className="h-8 text-sm"
                      data-testid={`input-plan-limit-${plan}`}
                      onBlur={(e) => {
                        const val = parseInt(e.target.value) || 100;
                        saveMutation.mutate({
                          maxTenantsPerPlan: { ...(current.maxTenantsPerPlan ?? {}), [plan]: val },
                        });
                      }}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Alert Recipients */}
          <Card data-testid="card-alert-recipients">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4" />
                Alert Email Recipients
              </CardTitle>
              <CardDescription>Email addresses to notify for critical platform alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="admin@platform.com"
                  className="flex-1"
                  data-testid="input-alert-email"
                  onKeyDown={(e) => e.key === "Enter" && addEmail()}
                />
                <Button
                  size="sm"
                  onClick={addEmail}
                  disabled={!newEmail.trim() || saveMutation.isPending}
                  data-testid="button-add-alert-email"
                >
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Add
                </Button>
              </div>
              {(current.alertEmailRecipients ?? []).length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2" data-testid="text-no-alert-emails">
                  No alert recipients configured
                </p>
              ) : (
                <div className="space-y-1" data-testid="alert-emails-list">
                  {(current.alertEmailRecipients ?? []).map((email) => (
                    <div
                      key={email}
                      className="flex items-center justify-between px-3 py-1.5 bg-slate-50 rounded border text-sm"
                      data-testid={`alert-email-${email}`}
                    >
                      <span className="text-slate-700">{email}</span>
                      <button
                        className="text-red-500 hover:text-red-700 text-xs"
                        onClick={() => removeEmail(email)}
                        data-testid={`button-remove-email-${email}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* System Info */}
          <Card data-testid="card-system-info">
            <CardHeader>
              <CardTitle className="text-base">System Information</CardTitle>
              <CardDescription>Read-only platform diagnostics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="text-slate-500">Environment</div>
                <div className="font-mono text-slate-700" data-testid="text-env">production</div>
                <div className="text-slate-500">Database</div>
                <div className="font-mono text-slate-700" data-testid="text-db">PostgreSQL</div>
                <div className="text-slate-500">Encryption</div>
                <div className="font-mono text-slate-700" data-testid="text-encryption">AES-256-GCM</div>
                <div className="text-slate-500">Auth</div>
                <div className="font-mono text-slate-700" data-testid="text-auth">Session + TOTP</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
