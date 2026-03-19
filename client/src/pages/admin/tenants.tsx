import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  UserCheck,
  PauseCircle,
  PlayCircle,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  active: boolean | null;
  businessType: string | null;
  userCount: number;
  outletCount: number;
  orderCount: number;
  createdAt: string | null;
  ownerUserId: string | null;
}

const PLANS = ["basic", "standard", "premium", "enterprise"] as const;

function PlanBadge({ plan }: { plan: string | null }) {
  const colors: Record<string, string> = {
    basic: "bg-slate-100 text-slate-700 border-slate-200",
    standard: "bg-blue-50 text-blue-700 border-blue-200",
    premium: "bg-violet-50 text-violet-700 border-violet-200",
    enterprise: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const c = colors[plan ?? "basic"] ?? colors.basic;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${c}`}>
      {plan ?? "basic"}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean | null }) {
  if (active === false) {
    return (
      <Badge variant="outline" className="text-xs text-red-700 border-red-200 bg-red-50">
        Suspended
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50">
      Active
    </Badge>
  );
}

interface CreateTenantForm {
  tenantName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerUsername: string;
  ownerPassword: string;
  plan: string;
  currency: string;
  timezone: string;
  businessType: string;
}

export default function TenantsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateTenantForm>({
    tenantName: "",
    slug: "",
    ownerName: "",
    ownerEmail: "",
    ownerUsername: "",
    ownerPassword: "",
    plan: "basic",
    currency: "USD",
    timezone: "UTC",
    businessType: "casual_dining",
  });

  const { data: tenants, isLoading, error } = useQuery<Tenant[]>({
    queryKey: ["/api/admin/tenants"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/tenants");
      return r.json();
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, suspend }: { id: string; suspend: boolean }) => {
      const endpoint = suspend ? `/api/admin/tenants/${id}/suspend` : `/api/admin/tenants/${id}/reactivate`;
      const r = await apiRequest("POST", endpoint);
      return r.json();
    },
    onSuccess: (_, { suspend }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: suspend ? "Tenant suspended" : "Tenant reactivated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const changePlanMutation = useMutation({
    mutationFn: async ({ id, plan }: { id: string; plan: string }) => {
      const r = await apiRequest("PATCH", `/api/admin/tenants/${id}`, { plan });
      return r.json();
    },
    onSuccess: () => {
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

  const createMutation = useMutation({
    mutationFn: async (data: CreateTenantForm) => {
      const r = await apiRequest("POST", "/api/admin/tenants", data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      setShowCreate(false);
      setForm({ tenantName: "", slug: "", ownerName: "", ownerEmail: "", ownerUsername: "", ownerPassword: "", plan: "basic", currency: "USD", timezone: "UTC", businessType: "casual_dining" });
      toast({ title: "Tenant created successfully" });
    },
    onError: (e: Error) => toast({ title: "Creation failed", description: e.message, variant: "destructive" }),
  });

  const filtered = (tenants ?? []).filter((t) => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.slug.toLowerCase().includes(search.toLowerCase())) return false;
    if (planFilter !== "all" && (t.plan ?? "basic") !== planFilter) return false;
    if (statusFilter === "active" && t.active === false) return false;
    if (statusFilter === "suspended" && t.active !== false) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4" data-testid="admin-tenants-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900" data-testid="page-title-tenants">Tenants</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {tenants?.length ?? 0} total tenants
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          data-testid="button-new-tenant"
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New Tenant
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Failed to load tenants. Please refresh.</span>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-tenants"
          />
        </div>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-36" data-testid="select-plan-filter">
            <SelectValue placeholder="All plans" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {PLANS.map((p) => (
              <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-status-filter">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card data-testid="card-tenants-table">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No tenants found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide bg-slate-50 rounded-t-lg">
                <span>Name / Slug</span>
                <span>Plan</span>
                <span>Status</span>
                <span>Business Type</span>
                <span>Created</span>
                <span></span>
              </div>
              {filtered.map((t) => (
                <div
                  key={t.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 items-center px-4 py-3 hover:bg-slate-50 transition-colors"
                  data-testid={`row-tenant-${t.id}`}
                >
                  <div className="min-w-0">
                    <p
                      className="font-medium text-sm text-slate-900 truncate cursor-pointer hover:text-emerald-600"
                      onClick={() => navigate(`/admin/tenants/${t.id}`)}
                      data-testid={`link-tenant-${t.id}`}
                    >
                      {t.name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{t.slug}</p>
                  </div>
                  <PlanBadge plan={t.plan} />
                  <StatusBadge active={t.active} />
                  <span className="text-sm text-slate-600 capitalize truncate" data-testid={`tenant-business-type-${t.id}`}>
                    {t.businessType?.replace(/_/g, " ") ?? "—"}
                  </span>
                  <span className="text-xs text-slate-500" data-testid={`tenant-created-${t.id}`}>
                    {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        data-testid={`button-tenant-actions-${t.id}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => navigate(`/admin/tenants/${t.id}`)}
                        data-testid={`menu-view-tenant-${t.id}`}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      {t.ownerUserId && (
                        <DropdownMenuItem
                          onClick={() => impersonateMutation.mutate(t.ownerUserId!)}
                          data-testid={`menu-impersonate-owner-${t.id}`}
                          className="text-amber-700"
                        >
                          <UserCheck className="h-4 w-4 mr-2" />
                          Impersonate Owner
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {PLANS.map((p) => (
                        <DropdownMenuItem
                          key={p}
                          disabled={t.plan === p}
                          onClick={() => changePlanMutation.mutate({ id: t.id, plan: p })}
                          data-testid={`menu-plan-${p}-${t.id}`}
                          className="capitalize"
                        >
                          <ChevronDown className="h-4 w-4 mr-2" />
                          Change to {p}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => suspendMutation.mutate({ id: t.id, suspend: t.active !== false })}
                        data-testid={`menu-toggle-suspend-${t.id}`}
                        className={t.active === false ? "text-green-600" : "text-red-600"}
                      >
                        {t.active === false ? (
                          <><PlayCircle className="h-4 w-4 mr-2" /> Reactivate</>
                        ) : (
                          <><PauseCircle className="h-4 w-4 mr-2" /> Suspend</>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Tenant Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg" data-testid="dialog-create-tenant">
          <DialogHeader>
            <DialogTitle>Create New Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="tenantName">Restaurant Name</Label>
                <Input
                  id="tenantName"
                  value={form.tenantName}
                  onChange={(e) => setForm({ ...form, tenantName: e.target.value })}
                  placeholder="My Restaurant"
                  data-testid="input-tenant-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                  placeholder="my-restaurant"
                  data-testid="input-tenant-slug"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan">Plan</Label>
                <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                  <SelectTrigger id="plan" data-testid="select-create-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLANS.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2 border-t pt-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Owner Account</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ownerName">Owner Name</Label>
                <Input
                  id="ownerName"
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  placeholder="John Smith"
                  data-testid="input-owner-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ownerEmail">Owner Email</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  value={form.ownerEmail}
                  onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                  placeholder="owner@restaurant.com"
                  data-testid="input-owner-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ownerUsername">Username</Label>
                <Input
                  id="ownerUsername"
                  value={form.ownerUsername}
                  onChange={(e) => setForm({ ...form, ownerUsername: e.target.value.toLowerCase() })}
                  placeholder="owner"
                  data-testid="input-owner-username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ownerPassword">Password</Label>
                <Input
                  id="ownerPassword"
                  type="password"
                  value={form.ownerPassword}
                  onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
                  placeholder="min 8 characters"
                  data-testid="input-owner-password"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} data-testid="button-cancel-create-tenant">
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.tenantName || !form.slug || !form.ownerName || !form.ownerPassword}
              data-testid="button-submit-create-tenant"
            >
              {createMutation.isPending ? "Creating..." : "Create Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
