import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ImpersonationStartDialog from "@/components/admin/impersonation-start-dialog";
import {
  ArrowLeft,
  Building2,
  Users,
  Store,
  ScrollText,
  PauseCircle,
  PlayCircle,
  ChevronDown,
  AlertCircle,
  UserCheck,
  Pencil,
  Layers,
  ExternalLink,
  CreditCard,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PLANS = ["basic", "standard", "premium", "enterprise"] as const;

const BUSINESS_TYPES = [
  "casual_dining",
  "fast_food",
  "cafe",
  "bar",
  "fine_dining",
  "food_truck",
  "bakery",
  "buffet",
  "cloud_kitchen",
  "other",
] as const;

const MODULES: { key: string; label: string; description: string }[] = [
  { key: "inventory", label: "Inventory Management", description: "Track stock levels, low-stock alerts, and ingredient usage." },
  { key: "procurement", label: "Procurement", description: "Purchase orders, supplier management, and receiving." },
  { key: "delivery", label: "Delivery", description: "Delivery zones, driver assignment, and order tracking." },
  { key: "events", label: "Events & Reservations", description: "Table bookings, private events, and capacity management." },
  { key: "kiosk", label: "Self-Service Kiosk", description: "Customer-facing ordering kiosks at the counter." },
  { key: "online_ordering", label: "Online Ordering", description: "Web/app-based ordering with payment integration." },
  { key: "loyalty", label: "Loyalty & Rewards", description: "Points system, tiers, and customer retention tools." },
  { key: "analytics", label: "Advanced Analytics", description: "Revenue trends, staff performance, and predictive insights." },
];

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  active: boolean | null;
  businessType: string | null;
  currency: string | null;
  timezone: string | null;
  address: string | null;
  createdAt: string | null;
  orderCount: number;
  recentOrderCount: number;
  moduleConfig: Record<string, boolean> | null;
  razorpayEnabled: boolean | null;
  razorpayKeyId: string | null;
  users: {
    id: string;
    name: string;
    username: string;
    email: string | null;
    role: string;
    active: boolean | null;
  }[];
  outlets: {
    id: string;
    name: string;
    active: boolean | null;
    address: string | null;
  }[];
  recentAuditEvents: {
    id: string;
    userName: string;
    action: string;
    entityType: string;
    entityName: string;
    ipAddress: string | null;
    createdAt: string;
  }[];
}

interface EditForm {
  name: string;
  address: string;
  currency: string;
  timezone: string;
  businessType: string;
}

export default function TenantDetailPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/tenants/:id");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = params?.id ?? "";

  const [editOpen, setEditOpen] = useState(false);
  const [impersonateTarget, setImpersonateTarget] = useState<{ userId: string; tenantName: string } | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    address: "",
    currency: "",
    timezone: "",
    businessType: "",
  });

  const { data: tenant, isLoading, error } = useQuery<TenantDetail>({
    queryKey: ["/api/admin/tenants", tenantId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/tenants/${tenantId}`);
      return r.json();
    },
    enabled: !!tenantId,
  });

  const suspendMutation = useMutation({
    mutationFn: async (suspend: boolean) => {
      const endpoint = suspend
        ? `/api/admin/tenants/${tenantId}/suspend`
        : `/api/admin/tenants/${tenantId}/reactivate`;
      const r = await apiRequest("POST", endpoint);
      return r.json();
    },
    onSuccess: (_, suspend) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: suspend ? "Tenant suspended" : "Tenant reactivated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const changePlanMutation = useMutation({
    mutationFn: async (plan: string) => {
      const r = await apiRequest("PATCH", `/api/admin/tenants/${tenantId}`, { plan });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Plan updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async (data: EditForm) => {
      const r = await apiRequest("PATCH", `/api/admin/tenants/${tenantId}`, data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      setEditOpen(false);
      toast({ title: "Tenant updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleModuleMutation = useMutation({
    mutationFn: async ({ module, enabled }: { module: string; enabled: boolean }) => {
      const currentConfig = (tenant?.moduleConfig ?? {}) as Record<string, boolean>;
      const r = await apiRequest("PATCH", `/api/admin/tenants/${tenantId}`, {
        moduleConfig: { ...currentConfig, [module]: enabled },
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleGatewayMutation = useMutation({
    mutationFn: async ({ gateway, enabled }: { gateway: string; enabled: boolean }) => {
      const body: Record<string, boolean> = {};
      if (gateway === "razorpay") body.razorpayEnabled = enabled;
      const r = await apiRequest("PATCH", `/api/admin/tenants/${tenantId}`, body);
      return r.json();
    },
    onSuccess: (_, { gateway, enabled }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantId] });
      toast({ title: `${gateway === "razorpay" ? "Razorpay" : "Gateway"} ${enabled ? "enabled" : "disabled"}` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });


  const openEdit = () => {
    if (!tenant) return;
    setEditForm({
      name: tenant.name,
      address: tenant.address ?? "",
      currency: tenant.currency ?? "USD",
      timezone: tenant.timezone ?? "UTC",
      businessType: tenant.businessType ?? "",
    });
    setEditOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4" data-testid="tenant-detail-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Failed to load tenant. Please go back and try again.</span>
        </div>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/tenants")} data-testid="button-back-to-tenants">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Tenants
        </Button>
      </div>
    );
  }

  const moduleConfig = (tenant.moduleConfig ?? {}) as Record<string, boolean>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4" data-testid="tenant-detail-page">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin/tenants")}
          data-testid="button-back-to-tenants"
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Tenants
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900" data-testid="tenant-name">{tenant.name}</h1>
          <p className="text-sm text-slate-500">{tenant.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          {tenant.active === false ? (
            <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50">Suspended</Badge>
          ) : (
            <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50">Active</Badge>
          )}
          <Badge variant="outline" className="capitalize">{tenant.plan ?? "basic"}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={openEdit}
            data-testid="button-edit-tenant"
            className="gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      </div>

      {/* Tenant Info Card */}
      <Card data-testid="card-tenant-info">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Tenant Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs">Business Type</p>
              <p className="font-medium capitalize" data-testid="tenant-business-type">
                {tenant.businessType?.replace(/_/g, " ") ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Currency</p>
              <p className="font-medium" data-testid="tenant-currency">{tenant.currency ?? "USD"}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Timezone</p>
              <p className="font-medium" data-testid="tenant-timezone">{tenant.timezone ?? "UTC"}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Total Orders</p>
              <p className="font-medium" data-testid="tenant-order-count">{tenant.orderCount}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Orders (Last 30d)</p>
              <p className="font-medium" data-testid="tenant-recent-order-count">{tenant.recentOrderCount}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Created</p>
              <p className="font-medium" data-testid="tenant-created-at">
                {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
          {tenant.address && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-slate-500 text-xs">Address</p>
              <p className="text-sm font-medium" data-testid="tenant-address">{tenant.address}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200" data-testid="card-danger-zone">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-red-700">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">Tenant Status</p>
              <p className="text-xs text-slate-500">
                {tenant.active === false ? "Tenant is currently suspended." : "Tenant is currently active."}
              </p>
            </div>
            <Button
              variant={tenant.active === false ? "outline" : "destructive"}
              size="sm"
              onClick={() => suspendMutation.mutate(tenant.active !== false)}
              disabled={suspendMutation.isPending}
              data-testid="button-toggle-suspend"
              className="gap-2"
            >
              {tenant.active === false ? (
                <><PlayCircle className="h-4 w-4" /> Reactivate</>
              ) : (
                <><PauseCircle className="h-4 w-4" /> Suspend Tenant</>
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <p className="text-sm font-medium text-slate-800">Change Plan</p>
              <p className="text-xs text-slate-500">Current plan: <strong className="capitalize">{tenant.plan ?? "basic"}</strong></p>
            </div>
            <Select
              onValueChange={(v) => changePlanMutation.mutate(v)}
              disabled={changePlanMutation.isPending}
            >
              <SelectTrigger className="w-40" data-testid="select-change-plan">
                <ChevronDown className="h-4 w-4 mr-1" />
                <SelectValue placeholder="Change plan" />
              </SelectTrigger>
              <SelectContent>
                {PLANS.filter((p) => p !== (tenant.plan ?? "basic")).map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="users" data-testid="tenant-detail-tabs">
        <TabsList>
          <TabsTrigger value="users" data-testid="tab-tenant-users">
            <Users className="h-4 w-4 mr-1.5" />
            Users ({tenant.users.length})
          </TabsTrigger>
          <TabsTrigger value="outlets" data-testid="tab-tenant-outlets">
            <Store className="h-4 w-4 mr-1.5" />
            Outlets ({tenant.outlets.length})
          </TabsTrigger>
          <TabsTrigger value="modules" data-testid="tab-tenant-modules">
            <Layers className="h-4 w-4 mr-1.5" />
            Modules
          </TabsTrigger>
          <TabsTrigger value="gateways" data-testid="tab-tenant-gateways">
            <CreditCard className="h-4 w-4 mr-1.5" />
            Payment Gateways
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-tenant-audit">
            <ScrollText className="h-4 w-4 mr-1.5" />
            Audit Events
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardContent className="p-0">
              {tenant.users.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No users</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {tenant.users.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between px-4 py-3"
                      data-testid={`row-tenant-user-${u.id}`}
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{u.name}</p>
                        <p className="text-xs text-slate-400">{u.username} {u.email ? `· ${u.email}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">{u.role}</Badge>
                        {u.active === false && (
                          <Badge variant="outline" className="text-xs text-red-600 border-red-200">Inactive</Badge>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setImpersonateTarget({ userId: u.id, tenantName: tenant.name })}
                          data-testid={`button-impersonate-user-${u.id}`}
                        >
                          <UserCheck className="h-3.5 w-3.5 mr-1" />
                          Impersonate
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outlets">
          <Card>
            <CardContent className="p-0">
              {tenant.outlets.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No outlets</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {tenant.outlets.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between px-4 py-3"
                      data-testid={`row-outlet-${o.id}`}
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{o.name}</p>
                        {o.address && <p className="text-xs text-slate-400">{o.address}</p>}
                      </div>
                      {o.active === false ? (
                        <Badge variant="outline" className="text-xs text-red-600 border-red-200">Inactive</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-200">Active</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules">
          <Card data-testid="card-modules">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Feature Modules
              </CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">
                Enable or disable feature modules for this tenant. Changes take effect immediately.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {MODULES.map((mod) => {
                  const enabled = moduleConfig[mod.key] === true;
                  return (
                    <div
                      key={mod.key}
                      className="flex items-center justify-between px-6 py-4"
                      data-testid={`row-module-${mod.key}`}
                    >
                      <div className="space-y-0.5">
                        <Label
                          htmlFor={`module-${mod.key}`}
                          className="text-sm font-medium text-slate-800 cursor-pointer"
                        >
                          {mod.label}
                        </Label>
                        <p className="text-xs text-slate-400">{mod.description}</p>
                      </div>
                      <Switch
                        id={`module-${mod.key}`}
                        checked={enabled}
                        onCheckedChange={(checked) =>
                          toggleModuleMutation.mutate({ module: mod.key, enabled: checked })
                        }
                        disabled={toggleModuleMutation.isPending}
                        data-testid={`switch-module-${mod.key}`}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gateways">
          <Card data-testid="card-payment-gateways">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Payment Gateway Controls
              </CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">
                Enable or disable payment gateways for this tenant. Tenants configure their own API keys in Settings.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                <div className="flex items-center justify-between px-6 py-4" data-testid="row-gateway-razorpay">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-1.5 rounded-md bg-blue-50">
                      <CreditCard className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="space-y-0.5">
                      <Label htmlFor="gateway-razorpay" className="text-sm font-medium text-slate-800 cursor-pointer">
                        Razorpay
                      </Label>
                      <p className="text-xs text-slate-400">
                        Indian payment gateway — UPI, Cards, Net Banking, Wallets
                      </p>
                      {tenant.razorpayKeyId ? (
                        <div className="flex items-center gap-1 mt-1">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          <span className="text-xs text-green-700">API key configured</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 mt-1">
                          <XCircle className="h-3 w-3 text-amber-500" />
                          <span className="text-xs text-amber-600">No API key set — tenant must configure in Settings</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={tenant.razorpayEnabled ? "default" : "outline"}
                      className={tenant.razorpayEnabled ? "bg-green-100 text-green-700 border-green-200" : "text-slate-400"}
                      data-testid="badge-razorpay-status"
                    >
                      {tenant.razorpayEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Switch
                      id="gateway-razorpay"
                      checked={tenant.razorpayEnabled ?? false}
                      onCheckedChange={(checked) =>
                        toggleGatewayMutation.mutate({ gateway: "razorpay", enabled: checked })
                      }
                      disabled={toggleGatewayMutation.isPending}
                      data-testid="switch-gateway-razorpay"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between px-6 py-4" data-testid="row-gateway-stripe">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-1.5 rounded-md bg-violet-50">
                      <CreditCard className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium text-slate-800">
                        Stripe
                      </Label>
                      <p className="text-xs text-slate-400">
                        Global payment gateway — Cards, Apple Pay, Google Pay
                      </p>
                      <p className="text-xs text-slate-300 mt-1">
                        Configured at platform level via Stripe integration
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs" data-testid="badge-stripe-status">
                    Platform-managed
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <ScrollText className="h-4 w-4" />
                Recent Audit Events
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-emerald-700 hover:text-emerald-800"
                onClick={() => navigate(`/admin/audit?tenantId=${tenantId}`)}
                data-testid="button-view-all-audit"
              >
                View all in Audit Log
                <ExternalLink className="h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {tenant.recentAuditEvents.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No audit events</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {tenant.recentAuditEvents.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between px-4 py-3"
                      data-testid={`row-audit-${e.id}`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-mono">{e.action}</Badge>
                          <span className="text-xs text-slate-600">{e.userName}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{e.entityType} · {e.entityName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleString()}</p>
                        {e.ipAddress && <p className="text-xs text-slate-300">{e.ipAddress}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Tenant Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent aria-describedby={undefined} data-testid="dialog-edit-tenant">
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Tenant name"
                data-testid="input-edit-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-business-type">Business Type</Label>
              <Select
                value={editForm.businessType}
                onValueChange={(v) => setEditForm((f) => ({ ...f, businessType: v }))}
              >
                <SelectTrigger id="edit-business-type" data-testid="select-edit-business-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((bt) => (
                    <SelectItem key={bt} value={bt} className="capitalize">
                      {bt.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-currency">Currency</Label>
                <Input
                  id="edit-currency"
                  value={editForm.currency}
                  onChange={(e) => setEditForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                  placeholder="USD"
                  maxLength={3}
                  data-testid="input-edit-currency"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-timezone">Timezone</Label>
                <Input
                  id="edit-timezone"
                  value={editForm.timezone}
                  onChange={(e) => setEditForm((f) => ({ ...f, timezone: e.target.value }))}
                  placeholder="UTC"
                  data-testid="input-edit-timezone"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                value={editForm.address}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="123 Main St, City, Country"
                data-testid="input-edit-address"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={() => editMutation.mutate(editForm)}
              disabled={editMutation.isPending || !editForm.name.trim()}
              data-testid="button-save-edit"
            >
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Impersonation Start Dialog */}
      {impersonateTarget && (
        <ImpersonationStartDialog
          open={!!impersonateTarget}
          onOpenChange={(open) => { if (!open) setImpersonateTarget(null); }}
          userId={impersonateTarget.userId}
          tenantName={impersonateTarget.tenantName}
          onSuccess={() => { navigate("/"); }}
        />
      )}
    </div>
  );
}
