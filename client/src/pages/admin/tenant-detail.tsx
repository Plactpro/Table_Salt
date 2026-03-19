import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PLANS = ["basic", "standard", "premium", "enterprise"] as const;

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

export default function TenantDetailPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/tenants/:id");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = params?.id ?? "";

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

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const r = await apiRequest("POST", `/api/admin/impersonate/${userId}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonation/status"] });
      navigate("/");
    },
    onError: (e: Error) => toast({ title: "Impersonation failed", description: e.message, variant: "destructive" }),
  });

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
                          onClick={() => impersonateMutation.mutate(u.id)}
                          disabled={impersonateMutation.isPending}
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

        <TabsContent value="audit">
          <Card>
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
    </div>
  );
}
