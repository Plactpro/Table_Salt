import { useState } from "react";
import { PageTitle, announceToScreenReader } from "@/lib/accessibility";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  Plus,
  UserX,
  AlertCircle,
  Search,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SuperAdmin {
  id: string;
  username: string;
  name: string;
  email: string | null;
  active: boolean | null;
  totpEnabled: boolean | null;
  lastActive: string | null;
}

interface CreateForm {
  username: string;
  name: string;
  email: string;
  password: string;
}

export default function AdminsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<SuperAdmin | null>(null);
  const [form, setForm] = useState<CreateForm>({ username: "", name: "", email: "", password: "" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const { data: admins, isLoading, error } = useQuery<SuperAdmin[]>({
    queryKey: ["/api/admin/super-admins"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/super-admins");
      return r.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateForm) => {
      const r = await apiRequest("POST", "/api/admin/super-admins", data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/super-admins"] });
      setShowCreate(false);
      setForm({ username: "", name: "", email: "", password: "" });
      announceToScreenReader("Super admin created successfully.");
      toast({ title: "Super admin created successfully" });
    },
    onError: (e: Error) => { announceToScreenReader("Creation failed: " + e.message); toast({ title: "Creation failed", description: e.message, variant: "destructive" }); },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/admin/super-admins/${id}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/super-admins"] });
      setConfirmDeactivate(null);
      announceToScreenReader("Super admin deactivated.");
      toast({ title: "Super admin deactivated" });
    },
    onError: (e: Error) => { announceToScreenReader("Error: " + e.message); toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const filtered = (admins ?? []).filter((a) => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.username.toLowerCase().includes(search.toLowerCase()) && !a.email?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === "active" && a.active === false) return false;
    if (statusFilter === "inactive" && a.active !== false) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4" data-testid="admin-admins-page">
      <PageTitle title="Admin — Admins" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900" data-testid="page-title-admins">
            Super Admins
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Platform-level administrator accounts
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          data-testid="button-add-super-admin"
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Super Admin
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name, username, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-admins"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}>
          <SelectTrigger className="w-36" data-testid="select-admin-status-filter">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Failed to load admin accounts. Please refresh.</span>
        </div>
      )}

      <Card data-testid="card-admins-table">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <ShieldCheck className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">
                {search || statusFilter !== "all" ? "No admins match your filters" : "No super admins found"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100" role="table" aria-label="Super Admins">
              <div role="row" className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr_auto] gap-4 px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide bg-slate-50 rounded-t-lg">
                <span role="columnheader">Name</span>
                <span role="columnheader">Username</span>
                <span role="columnheader">Email</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Last Active</span>
                <span role="columnheader" aria-label="Actions"></span>
              </div>
              {filtered.map((a) => {
                const isSelf = a.id === user?.id;
                return (
                  <div
                    key={a.id}
                    role="row"
                    className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr_auto] gap-4 items-center px-4 py-3 hover:bg-slate-50 transition-colors"
                    data-testid={`row-admin-${a.id}`}
                  >
                    <div role="cell" className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-slate-900 truncate" data-testid={`admin-name-${a.id}`}>
                          {a.name}
                        </p>
                        {isSelf && (
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                            You
                          </Badge>
                        )}
                        {a.totpEnabled && (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            2FA
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p role="cell" className="text-xs text-slate-500 font-mono truncate" data-testid={`admin-username-${a.id}`}>
                      @{a.username}
                    </p>
                    <p role="cell" className="text-xs text-slate-600 truncate" data-testid={`admin-email-${a.id}`}>
                      {a.email ?? "—"}
                    </p>
                    <span role="cell">
                      {a.active === false ? (
                        <Badge variant="outline" className="text-xs text-red-600 border-red-200 bg-red-50">
                          Inactive
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50">
                          Active
                        </Badge>
                      )}
                    </span>
                    <span role="cell" className="text-xs text-slate-400 truncate" data-testid={`admin-last-active-${a.id}`}>
                      {a.lastActive
                        ? new Date(a.lastActive).toLocaleDateString()
                        : <span className="italic">Never</span>}
                    </span>
                    <div role="cell">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setConfirmDeactivate(a)}
                      disabled={isSelf || a.active === false}
                      data-testid={`button-deactivate-admin-${a.id}`}
                    >
                      <UserX className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                      {isSelf ? "Cannot deactivate self" : "Deactivate"}
                    </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent data-testid="dialog-create-super-admin">
          <DialogHeader>
            <DialogTitle>Add Super Admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="sa-name">Full Name</Label>
              <Input
                id="sa-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jane Smith"
                data-testid="input-admin-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-username">Username</Label>
              <Input
                id="sa-username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                placeholder="janesmith"
                data-testid="input-admin-username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-email">Email</Label>
              <Input
                id="sa-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@platform.com"
                data-testid="input-admin-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-password">Password</Label>
              <Input
                id="sa-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="min 8 characters"
                data-testid="input-admin-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} data-testid="button-cancel-create-admin">
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.username || !form.name || !form.email || !form.password}
              data-testid="button-submit-create-admin"
            >
              {createMutation.isPending ? "Creating..." : "Create Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Deactivate */}
      <AlertDialog open={!!confirmDeactivate} onOpenChange={() => setConfirmDeactivate(null)}>
        <AlertDialogContent data-testid="dialog-confirm-deactivate">
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Super Admin</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate <strong>{confirmDeactivate?.name}</strong>?
              They will no longer be able to log in to the platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-deactivate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeactivate && deactivateMutation.mutate(confirmDeactivate.id)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-deactivate"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
