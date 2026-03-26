import { useState } from "react";
import { PageTitle } from "@/lib/accessibility";
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
  CreditCard,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface PlatformSettings {
  maintenanceMode: boolean;
  registrationOpen: boolean;
  maxTenantsPerPlan: Record<string, number>;
  alertEmailRecipients: string[];
  platformName: string;
}

interface GatewaySettings {
  activePaymentGateway: "stripe" | "razorpay" | "both";
  stripeKeyId: string | null;
  stripeKeySecretConfigured: boolean;
  razorpayKeyId: string | null;
  razorpayKeySecretConfigured: boolean;
}

const DEFAULT_SETTINGS: PlatformSettings = {
  maintenanceMode: false,
  registrationOpen: true,
  maxTenantsPerPlan: { basic: 100, standard: 50, premium: 20, enterprise: 5 },
  alertEmailRecipients: [],
  platformName: "Table Salt",
};

const DEFAULT_GATEWAY: GatewaySettings = {
  activePaymentGateway: "stripe",
  stripeKeyId: null,
  stripeKeySecretConfigured: false,
  razorpayKeyId: null,
  razorpayKeySecretConfigured: false,
};

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newEmail, setNewEmail] = useState("");

  const [stripeKeyId, setStripeKeyId] = useState("");
  const [stripeKeySecret, setStripeKeySecret] = useState("");
  const [razorpayKeyId, setRazorpayKeyId] = useState("");
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("");
  const [showStripeSecret, setShowStripeSecret] = useState(false);
  const [showRazorpaySecret, setShowRazorpaySecret] = useState(false);

  const { data: settings, isLoading, error } = useQuery<PlatformSettings>({
    queryKey: ["/api/admin/platform-settings"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/platform-settings");
      if (!r.ok) throw new Error(`Failed to load settings: ${r.status}`);
      return r.json();
    },
  });

  const { data: gatewayData, isLoading: gatewayLoading } = useQuery<GatewaySettings>({
    queryKey: ["/api/admin/platform-settings/gateway"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/platform-settings/gateway");
      if (!r.ok) throw new Error(`Failed to load gateway settings: ${r.status}`);
      const data = await r.json();
      setStripeKeyId(data.stripeKeyId ?? "");
      setRazorpayKeyId(data.razorpayKeyId ?? "");
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<PlatformSettings>) => {
      const r = await apiRequest("PATCH", "/api/admin/platform-settings", data);
      if (!r.ok) throw new Error(`Failed to save settings: ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-settings"] });
      toast({ title: "Platform settings saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveGatewayMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const r = await apiRequest("PATCH", "/api/admin/platform-settings/gateway", data);
      if (!r.ok) throw new Error(`Failed to save gateway settings: ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-settings/gateway"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/gateway-config"] });
      setStripeKeySecret("");
      setRazorpayKeySecret("");
      toast({ title: "Payment gateway settings saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const current = settings ?? DEFAULT_SETTINGS;
  const gateway = gatewayData ?? DEFAULT_GATEWAY;

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

  const handleGatewaySelect = (gw: "stripe" | "razorpay" | "both") => {
    saveGatewayMutation.mutate({ activePaymentGateway: gw });
  };

  const handleGatewayCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {};
    if (stripeKeyId.trim()) payload.stripeKeyId = stripeKeyId.trim();
    if (stripeKeySecret.trim()) payload.stripeKeySecret = stripeKeySecret.trim();
    if (razorpayKeyId.trim()) payload.razorpayKeyId = razorpayKeyId.trim();
    if (razorpayKeySecret.trim()) payload.razorpayKeySecret = razorpayKeySecret.trim();
    saveGatewayMutation.mutate(payload);
  };

  const gatewayOptions: { id: "stripe" | "razorpay" | "both"; label: string; desc: string }[] = [
    { id: "stripe", label: "Stripe Only", desc: "Use Stripe for all payment contexts" },
    { id: "razorpay", label: "Razorpay Only", desc: "Use Razorpay for all payment contexts" },
    { id: "both", label: "Both (tenants choose)", desc: "Expose both gateways; staff selects at checkout" },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5" data-testid="admin-settings-page">
      <PageTitle title="Admin — Settings" />
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2" data-testid="page-title-platform-settings">
          <Settings className="h-5 w-5" />
          Platform Settings
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Global configuration for the Table Salt platform</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Failed to load platform settings. Please refresh or contact your system administrator.</span>
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
                  <p className="text-xs text-slate-500" data-testid="text-registration-status">
                    {current.registrationOpen ? "Self-registration is enabled — new tenants can sign up freely" : "Self-registration is disabled — contact admin to get started"}
                  </p>
                </div>
                <Switch
                  checked={current.registrationOpen}
                  onCheckedChange={(v) => toggle("registrationOpen", v)}
                  disabled={saveMutation.isPending}
                  data-testid="toggle-self-registration"
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

          {/* Payment Gateway */}
          <Card data-testid="card-payment-gateway">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4" />
                Payment Gateway
              </CardTitle>
              <CardDescription>Choose which payment gateway(s) are active across all POS, kiosk, and online flows</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {gatewayLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="gateway-options">
                    {gatewayOptions.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`gateway-option-${opt.id}`}
                        onClick={() => handleGatewaySelect(opt.id)}
                        disabled={saveGatewayMutation.isPending}
                        className={`relative flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-all ${
                          gateway.activePaymentGateway === opt.id
                            ? "border-primary bg-primary/5 ring-2 ring-primary"
                            : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30"
                        }`}
                      >
                        {gateway.activePaymentGateway === opt.id && (
                          <CheckCircle2 className="absolute top-3 right-3 h-4 w-4 text-primary" />
                        )}
                        <span className="text-sm font-semibold text-slate-800">{opt.label}</span>
                        <span className="text-xs text-slate-500">{opt.desc}</span>
                      </button>
                    ))}
                  </div>

                  <Separator />

                  <form onSubmit={handleGatewayCredentials} className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        Stripe Credentials
                        {gateway.stripeKeySecretConfigured && (
                          <Badge variant="outline" className="text-green-600 border-green-300 text-xs">Configured</Badge>
                        )}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Publishable Key (pk_…)</Label>
                          <Input
                            value={stripeKeyId}
                            onChange={e => setStripeKeyId(e.target.value)}
                            placeholder="pk_live_…"
                            className="text-sm font-mono"
                            data-testid="input-stripe-key-id"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Secret Key (sk_…)</Label>
                          <div className="relative">
                            <Input
                              type={showStripeSecret ? "text" : "password"}
                              value={stripeKeySecret}
                              onChange={e => setStripeKeySecret(e.target.value)}
                              placeholder={gateway.stripeKeySecretConfigured ? "••••••••• (leave blank to keep)" : "sk_live_…"}
                              className="text-sm font-mono pr-9"
                              data-testid="input-stripe-key-secret"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                              onClick={() => setShowStripeSecret(v => !v)}
                              data-testid="button-toggle-stripe-secret"
                            >
                              {showStripeSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        Razorpay Credentials
                        {gateway.razorpayKeySecretConfigured && (
                          <Badge variant="outline" className="text-green-600 border-green-300 text-xs">Configured</Badge>
                        )}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Key ID (rzp_…)</Label>
                          <Input
                            value={razorpayKeyId}
                            onChange={e => setRazorpayKeyId(e.target.value)}
                            placeholder="rzp_live_…"
                            className="text-sm font-mono"
                            data-testid="input-razorpay-key-id"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Key Secret</Label>
                          <div className="relative">
                            <Input
                              type={showRazorpaySecret ? "text" : "password"}
                              value={razorpayKeySecret}
                              onChange={e => setRazorpayKeySecret(e.target.value)}
                              placeholder={gateway.razorpayKeySecretConfigured ? "••••••••• (leave blank to keep)" : "Enter secret…"}
                              className="text-sm font-mono pr-9"
                              data-testid="input-razorpay-key-secret"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                              onClick={() => setShowRazorpaySecret(v => !v)}
                              data-testid="button-toggle-razorpay-secret"
                            >
                              {showRazorpaySecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      size="sm"
                      disabled={saveGatewayMutation.isPending}
                      data-testid="button-save-gateway-credentials"
                    >
                      {saveGatewayMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Save Credentials
                    </Button>
                  </form>
                </>
              )}
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
