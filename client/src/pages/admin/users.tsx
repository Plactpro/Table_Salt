import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ImpersonationStartDialog from "@/components/admin/impersonation-start-dialog";
import {
  Search,
  MoreHorizontal,
  UserCheck,
  UserX,
  KeyRound,
  Users,
  AlertCircle,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AdminUser {
  id: string;
  tenantId: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  active: boolean | null;
  totpEnabled: boolean | null;
  tenantName: string | null;
  tenantPlan: string | null;
  lastLogin: string | null;
}

interface Tenant {
  id: string;
  name: string;
}

const ROLES = ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor", "cashier", "waiter", "kitchen", "accountant", "auditor"] as const;
const PAGE_SIZE = 50;

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    owner: "bg-violet-50 text-violet-700 border-violet-200",
    manager: "bg-blue-50 text-blue-700 border-blue-200",
    cashier: "bg-amber-50 text-amber-700 border-amber-200",
    waiter: "bg-cyan-50 text-cyan-700 border-cyan-200",
    kitchen: "bg-orange-50 text-orange-700 border-orange-200",
    accountant: "bg-emerald-50 text-emerald-700 border-emerald-200",
    auditor: "bg-slate-50 text-slate-700 border-slate-200",
  };
  const c = colors[role] ?? "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${c}`}>
      {role.replace(/_/g, " ")}
    </span>
  );
}

export default function UsersPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [resetForUser, setResetForUser] = useState<string | null>(null);
  const [impersonateTarget, setImpersonateTarget] = useState<{ userId: string; tenantName: string } | null>(null);

  const offset = page * PAGE_SIZE;

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (search.trim()) params.set("search", search.trim());
  if (tenantFilter !== "all") params.set("tenantId", tenantFilter);
  if (roleFilter !== "all") params.set("role", roleFilter);

  const { data: usersRes, isLoading, error } = useQuery<{ data: AdminUser[]; total: number; limit: number; offset: number }>({
    queryKey: ["/api/admin/users", search, tenantFilter, roleFilter, page],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/users?${params}`);
      return r.json();
    },
  });

  const allUsersData = usersRes?.data ?? [];
  const total = usersRes?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filtered = allUsersData.filter((u) => {
    if (statusFilter === "active" && u.active === false) return false;
    if (statusFilter === "inactive" && u.active !== false) return false;
    return true;
  });

  const resetPage = () => setPage(0);

  const { data: tenantsRes } = useQuery<{ data: Tenant[]; total: number }>({
    queryKey: ["/api/admin/tenants", "all"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/tenants?limit=200");
      return r.json();
    },
  });
  const tenants = tenantsRes?.data;

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const r = await apiRequest("PATCH", `/api/admin/users/${id}`, { active });
      return r.json();
    },
    onSuccess: (_, { active }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: active ? "User reactivated" : "User deactivated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/admin/users/${id}/reset-password`);
      return r.json();
    },
    onSuccess: (data, id) => {
      setTempPassword(data.tempPassword);
      setResetForUser(id);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });


  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4" data-testid="admin-users-page">
      <div>
        <h1 className="text-xl font-bold text-slate-900" data-testid="page-title-users">Users</h1>
        <p className="text-sm text-slate-500 mt-0.5" data-testid="text-users-total">
          {total} total users across all tenants
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Failed to load users. Please refresh.</span>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name or username..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            className="pl-9"
            data-testid="input-search-users"
          />
        </div>
        <Select value={tenantFilter} onValueChange={(v) => { setTenantFilter(v); resetPage(); }}>
          <SelectTrigger className="w-44" data-testid="select-tenant-filter">
            <SelectValue placeholder="All tenants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tenants</SelectItem>
            {(tenants ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); resetPage(); }}>
          <SelectTrigger className="w-36" data-testid="select-role-filter">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, " ")}</SelectItem>
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
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card data-testid="card-users-table">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No users found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_80px_1fr_auto] gap-3 px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide bg-slate-50 rounded-t-lg">
                <span>User</span>
                <span>Role</span>
                <span>Tenant</span>
                <span>Status</span>
                <span>2FA</span>
                <span>Last Login</span>
                <span></span>
              </div>
              {filtered.map((u) => (
                <div
                  key={u.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_80px_1fr_auto] gap-3 items-center px-4 py-3 hover:bg-slate-50 transition-colors"
                  data-testid={`row-user-${u.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-900 truncate">{u.name}</p>
                    <p className="text-xs text-slate-400 truncate">
                      @{u.username}{u.email ? ` · ${u.email}` : ""}
                    </p>
                  </div>
                  <RoleBadge role={u.role} />
                  <span
                    className="text-xs text-slate-600 truncate cursor-pointer hover:text-emerald-600"
                    onClick={() => navigate(`/admin/tenants/${u.tenantId}`)}
                    data-testid={`link-user-tenant-${u.id}`}
                  >
                    {u.tenantName ?? "—"}
                  </span>
                  <span>
                    {u.active === false ? (
                      <Badge variant="outline" className="text-xs text-red-600 border-red-200 bg-red-50">Inactive</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50">Active</Badge>
                    )}
                  </span>
                  <span data-testid={`text-2fa-${u.id}`}>
                    {u.totpEnabled ? (
                      <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-200 bg-emerald-50 gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        On
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-400">Off</span>
                    )}
                  </span>
                  <span className="text-xs text-slate-500" data-testid={`text-last-login-${u.id}`}>
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "—"}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        data-testid={`button-user-actions-${u.id}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setImpersonateTarget({ userId: u.id, tenantName: u.tenantName ?? "Tenant" })}
                        data-testid={`menu-impersonate-user-${u.id}`}
                      >
                        <UserCheck className="h-4 w-4 mr-2" />
                        Impersonate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => resetPasswordMutation.mutate(u.id)}
                        data-testid={`menu-reset-password-${u.id}`}
                      >
                        <KeyRound className="h-4 w-4 mr-2" />
                        Reset Password
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => toggleActiveMutation.mutate({ id: u.id, active: u.active === false })}
                        data-testid={`menu-toggle-active-${u.id}`}
                        className={u.active === false ? "text-green-600" : "text-red-600"}
                      >
                        {u.active === false ? (
                          <><UserCheck className="h-4 w-4 mr-2" /> Reactivate</>
                        ) : (
                          <><UserX className="h-4 w-4 mr-2" /> Deactivate</>
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500" data-testid="users-pagination">
          <span>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              data-testid="button-users-prev"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <span className="text-xs">Page {page + 1} of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              data-testid="button-users-next"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Temp Password Dialog */}
      <Dialog open={!!tempPassword} onOpenChange={() => { setTempPassword(null); setResetForUser(null); }}>
        <DialogContent data-testid="dialog-temp-password">
          <DialogHeader>
            <DialogTitle>Password Reset</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              The temporary password has been set. Share this securely with the user.
            </p>
            <div className="bg-slate-50 border rounded-lg p-3 font-mono text-sm text-slate-900 select-all break-all" data-testid="text-temp-password">
              {tempPassword}
            </div>
            <p className="text-xs text-slate-400">
              The user must change this password on next login.
            </p>
          </div>
          <Button
            className="w-full"
            onClick={() => { setTempPassword(null); setResetForUser(null); }}
            data-testid="button-close-temp-password"
          >
            Done
          </Button>
        </DialogContent>
      </Dialog>

      <p className="sr-only" aria-hidden>{resetForUser}</p>

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
