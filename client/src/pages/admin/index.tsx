import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Building2, Users, ShoppingBag, Activity, LogOut, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AdminStats {
  tenants: { total: number; active: number; suspended: number };
  users: { total: number };
  orders: { today: number; thisWeek: number; thisMonth: number; total: number };
  planDistribution: { plan: string; count: number }[];
  businessTypes: { businessType: string; count: number }[];
  newTenantsLast30Days: { date: string; count: number }[];
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  active: boolean | null;
  userCount: number;
  outletCount: number;
  orderCount: number;
  createdAt: string | null;
}

export default function AdminPanel() {
  const { logout, user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/stats");
      if (!r.ok) throw new Error("Failed to load stats");
      return r.json();
    },
  });

  const { data: tenantList, isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/admin/tenants"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/tenants");
      if (!r.ok) throw new Error("Failed to load tenants");
      return r.json();
    },
  });

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-emerald-600" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Table Salt Platform Admin</h1>
            <p className="text-xs text-gray-500">Logged in as {user?.name}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-admin-logout" className="gap-2 text-gray-600">
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </header>

      <main className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Platform Overview</h2>
          <p className="text-sm text-gray-500 mt-0.5">Real-time metrics across all tenants</p>
        </div>

        {statsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card data-testid="stat-card-tenants">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Tenants
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900" data-testid="stat-tenants-total">{stats?.tenants.total ?? 0}</div>
                <div className="flex gap-2 mt-1">
                  <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50">
                    {stats?.tenants.active ?? 0} active
                  </Badge>
                  {(stats?.tenants.suspended ?? 0) > 0 && (
                    <Badge variant="outline" className="text-xs text-red-700 border-red-200 bg-red-50">
                      {stats?.tenants.suspended} suspended
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="stat-card-users">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Users className="h-4 w-4" /> Staff Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900" data-testid="stat-users-total">{stats?.users.total ?? 0}</div>
                <p className="text-xs text-gray-400 mt-1">across all tenants</p>
              </CardContent>
            </Card>

            <Card data-testid="stat-card-orders-today">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" /> Orders Today
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900" data-testid="stat-orders-today">{stats?.orders.today ?? 0}</div>
                <p className="text-xs text-gray-400 mt-1">{stats?.orders.thisMonth ?? 0} this month</p>
              </CardContent>
            </Card>

            <Card data-testid="stat-card-orders-total">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Total Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900" data-testid="stat-orders-total">{stats?.orders.total ?? 0}</div>
                <p className="text-xs text-gray-400 mt-1">{stats?.orders.thisWeek ?? 0} this week</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Tenants</h3>
          {tenantsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg border divide-y">
              {tenantList && tenantList.length > 0 ? tenantList.map((t) => (
                <div key={t.id} className="px-4 py-3 flex items-center justify-between" data-testid={`row-tenant-${t.id}`}>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.slug} · {t.userCount} users · {t.outletCount} outlets · {t.orderCount} orders</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">{t.plan ?? "basic"}</Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs ${t.active ? "text-green-700 border-green-200 bg-green-50" : "text-red-700 border-red-200 bg-red-50"}`}
                    >
                      {t.active ? "Active" : "Suspended"}
                    </Badge>
                  </div>
                </div>
              )) : (
                <div className="px-4 py-6 text-center text-sm text-gray-400">No tenants found</div>
              )}
            </div>
          )}
        </div>

        {stats && stats.planDistribution.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-700">Plan Distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.planDistribution.map((p) => (
                  <div key={p.plan} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-gray-700">{p.plan}</span>
                    <Badge variant="outline">{p.count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-700">Business Types</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.businessTypes.map((b) => (
                  <div key={b.businessType} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{b.businessType?.replace(/_/g, " ")}</span>
                    <Badge variant="outline">{b.count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">
          Full super admin panel (tenant management, impersonation, user controls) — coming in the next update.
        </p>
      </main>
    </div>
  );
}
