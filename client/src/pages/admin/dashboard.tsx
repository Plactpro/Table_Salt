import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2,
  Users,
  ShoppingBag,
  Activity,
  TrendingUp,
  AlertCircle,
  PauseCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface AdminStats {
  tenants: { total: number; active: number; suspended: number };
  users: { total: number };
  orders: { today: number; thisWeek: number; thisMonth: number; total: number };
  planDistribution: { plan: string; count: number }[];
  businessTypes: { businessType: string; count: number }[];
  newTenantsLast30Days: { date: string; count: number }[];
}

interface AuditEvent {
  id: string;
  tenantId: string | null;
  userId: string | null;
  userName: string;
  action: string;
  entityType: string;
  entityName: string;
  ipAddress: string | null;
  createdAt: string;
  tenantName: string | null;
}

const planColors: Record<string, string> = {
  basic: "bg-slate-400",
  standard: "bg-blue-400",
  premium: "bg-violet-400",
  enterprise: "bg-emerald-400",
};

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  loading,
  testId,
  highlight,
}: {
  title: string;
  value: number | string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  testId: string;
  highlight?: "red" | "amber";
}) {
  const valueColor = highlight === "red" ? "text-red-600" : highlight === "amber" ? "text-amber-600" : "text-slate-900";
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-slate-500 flex items-center gap-2 uppercase tracking-wide">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-20" />
        ) : (
          <div className={`text-3xl font-bold ${valueColor}`} data-testid={`${testId}-value`}>
            {value}
          </div>
        )}
        {sub && !loading && (
          <p className="text-xs text-slate-400 mt-1">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

function NewTenantsSparkline({ data }: { data: { date: string; count: number }[] }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-4">No data</p>;
  }
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-2" data-testid="new-tenants-sparkline">
      <div className="flex items-end gap-0.5 h-16">
        {data.map((d, i) => {
          const heightPct = Math.max((d.count / maxCount) * 100, d.count > 0 ? 4 : 0);
          return (
            <div
              key={i}
              className="flex-1 rounded-sm bg-emerald-400 hover:bg-emerald-500 transition-colors"
              style={{ height: `${heightPct}%` }}
              title={`${d.date}: ${d.count} new tenant${d.count !== 1 ? "s" : ""}`}
              data-testid={`sparkline-bar-${i}`}
            />
          );
        })}
      </div>
      <p className="text-xs text-slate-400 text-center">
        {total} new tenant{total !== 1 ? "s" : ""} in the last 30 days
      </p>
    </div>
  );
}

export default function AdminDashboard() {
  const [, navigate] = useLocation();

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/stats");
      return r.json();
    },
  });

  const { data: recentEvents, isLoading: eventsLoading } = useQuery<AuditEvent[]>({
    queryKey: ["/api/admin/audit-log", "recent"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/audit-log?limit=10");
      return r.json();
    },
  });

  const planTotal = stats?.planDistribution.reduce((s, p) => s + p.count, 0) || 1;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="admin-dashboard">
      <div>
        <h1 className="text-xl font-bold text-slate-900" data-testid="page-title-dashboard">
          Platform Overview
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Real-time metrics across all tenants</p>
      </div>

      {statsError && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Failed to load platform stats. Please refresh.</span>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Tenants"
          value={stats?.tenants.total ?? 0}
          sub={`${stats?.tenants.active ?? 0} active`}
          icon={Building2}
          loading={statsLoading}
          testId="card-kpi-tenants"
        />
        <StatCard
          title="Active Tenants"
          value={stats?.tenants.active ?? 0}
          icon={TrendingUp}
          loading={statsLoading}
          testId="card-kpi-tenants-active"
        />
        <StatCard
          title="Suspended"
          value={stats?.tenants.suspended ?? 0}
          sub="tenants suspended"
          icon={PauseCircle}
          loading={statsLoading}
          testId="card-kpi-tenants-suspended"
          highlight={stats?.tenants.suspended && stats.tenants.suspended > 0 ? "red" : undefined}
        />
        <StatCard
          title="Total Users"
          value={stats?.users.total ?? 0}
          sub="across all tenants"
          icon={Users}
          loading={statsLoading}
          testId="card-kpi-users"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Plan Distribution */}
        <Card data-testid="card-plan-distribution">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700">Plan Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {statsLoading ? (
              <>
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
              </>
            ) : stats?.planDistribution && stats.planDistribution.length > 0 ? (
              stats.planDistribution.map((p) => {
                const pct = Math.round((p.count / planTotal) * 100);
                return (
                  <div key={p.plan} data-testid={`plan-row-${p.plan}`}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="capitalize font-medium text-slate-700">{p.plan}</span>
                      <span className="text-slate-500">{p.count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${planColors[p.plan] ?? "bg-slate-400"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No plan data</p>
            )}
          </CardContent>
        </Card>

        {/* Business Types */}
        <Card data-testid="card-business-types">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700">Business Types</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {statsLoading ? (
              <>
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
              </>
            ) : stats?.businessTypes && stats.businessTypes.length > 0 ? (
              stats.businessTypes.map((b) => (
                <div
                  key={b.businessType}
                  className="flex items-center justify-between text-sm"
                  data-testid={`business-type-row-${b.businessType}`}
                >
                  <span className="text-slate-700 capitalize">
                    {b.businessType?.replace(/_/g, " ")}
                  </span>
                  <Badge variant="outline" className="text-xs">{b.count}</Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No data</p>
            )}
          </CardContent>
        </Card>

        {/* New Tenants Sparkline */}
        <Card data-testid="card-new-tenants-sparkline">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700">New Tenants (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <NewTenantsSparkline data={stats?.newTenantsLast30Days ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Orders summary */}
      <Card data-testid="card-orders-summary">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Orders Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-slate-900" data-testid="orders-today">{stats?.orders.today ?? 0}</div>
                <div className="text-xs text-slate-500">Today</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900" data-testid="orders-this-week">{stats?.orders.thisWeek ?? 0}</div>
                <div className="text-xs text-slate-500">This Week</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900" data-testid="orders-this-month">{stats?.orders.thisMonth ?? 0}</div>
                <div className="text-xs text-slate-500">This Month</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card data-testid="card-recent-activity">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Platform Activity
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => navigate("/admin/audit")}
            data-testid="button-view-all-audit"
          >
            View All
          </Button>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : recentEvents && recentEvents.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {recentEvents.map((e) => (
                <div
                  key={e.id}
                  className="py-2.5 flex items-center justify-between gap-4"
                  data-testid={`activity-row-${e.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs shrink-0 font-mono">
                        {e.action}
                      </Badge>
                      <span className="text-xs text-slate-600 truncate">
                        {e.userName} · {e.entityName || e.entityType}
                      </span>
                    </div>
                    {e.tenantName && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{e.tenantName}</p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">No recent activity</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
