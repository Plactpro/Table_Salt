import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, BarChart2, TrendingUp, Users, ShoppingBag, DollarSign } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";

interface AnalyticsData {
  tenantGrowth: { month: string; count: number }[];
  userRegistrations: { month: string; count: number }[];
  weeklyOrderVolume: { week: string; count: number }[];
  planRevenue: { plan: string; count: number; price: number; revenue: number }[];
  topTenantsByOrders: { id: string; name: string; slug: string; plan: string; orderCount: number }[];
  platformHealth: { dbOk: boolean; uptimeSeconds: number };
}

function formatMonth(m: string): string {
  const [year, month] = m.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function formatWeek(w: string): string {
  const d = new Date(w);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PLAN_COLORS: Record<string, string> = {
  basic: "#94a3b8",
  standard: "#60a5fa",
  premium: "#a78bfa",
  enterprise: "#34d399",
};

export default function AnalyticsPage() {
  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/analytics");
      return r.json();
    },
  });

  const totalRevenueProxy = data?.planRevenue.reduce((s, p) => s + p.revenue, 0) ?? 0;

  // Fill months for tenant growth
  const tenantGrowthData = data?.tenantGrowth.map((d) => ({
    ...d,
    label: formatMonth(d.month),
  })) ?? [];

  const userRegData = data?.userRegistrations.map((d) => ({
    ...d,
    label: formatMonth(d.month),
  })) ?? [];

  const weeklyData = data?.weeklyOrderVolume.map((d) => ({
    ...d,
    label: formatWeek(d.week),
  })) ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="admin-analytics-page">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2" data-testid="page-title-analytics">
          <BarChart2 className="h-5 w-5 text-emerald-700" />
          Platform Analytics
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Growth trends and usage insights across the platform</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Failed to load analytics data. Please refresh.</span>
        </div>
      )}

      {/* Revenue Proxy Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-revenue-proxy">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              MRR Proxy
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-9 w-24" /> : (
              <div className="text-3xl font-bold text-slate-900" data-testid="text-mrr-proxy">
                ${totalRevenueProxy.toLocaleString()}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-1">Estimated monthly revenue</p>
          </CardContent>
        </Card>

        {data?.planRevenue.map((p) => (
          <Card key={p.plan} data-testid={`card-plan-revenue-${p.plan}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide capitalize">
                {p.plan}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-9 w-20" /> : (
                <div className="text-2xl font-bold text-slate-900">
                  ${p.revenue.toLocaleString()}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1">{p.count} tenant{p.count !== 1 ? "s" : ""} × ${p.price}/mo</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tenant Growth */}
      <Card data-testid="card-tenant-growth">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Tenant Growth (Last 12 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : tenantGrowthData.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-12">No tenant data in the last 12 months</p>
          ) : (
            <ResponsiveContainer width="100%" height={220} data-testid="chart-tenant-growth">
              <BarChart data={tenantGrowthData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 6 }}
                  formatter={(v: number) => [v, "New Tenants"]}
                />
                <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} name="New Tenants" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* User Registrations + Weekly Orders side by side */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card data-testid="card-user-registrations">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Users className="h-4 w-4" />
              User Registrations (Last 12 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : userRegData.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-12">No user data in the last 12 months</p>
            ) : (
              <ResponsiveContainer width="100%" height={200} data-testid="chart-user-registrations">
                <LineChart data={userRegData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 6 }}
                    formatter={(v: number) => [v, "New Users"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#7c3aed"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#7c3aed" }}
                    name="New Users"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-weekly-orders">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Weekly Order Volume (Last 8 Weeks)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : weeklyData.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-12">No order data in the last 8 weeks</p>
            ) : (
              <ResponsiveContainer width="100%" height={200} data-testid="chart-weekly-orders">
                <BarChart data={weeklyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 6 }}
                    formatter={(v: number) => [v, "Orders"]}
                  />
                  <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} name="Orders" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Plan Revenue Proxy */}
      <Card data-testid="card-plan-revenue-chart">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Revenue by Plan (Proxy)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !data?.planRevenue || data.planRevenue.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-12">No plan data available</p>
          ) : (
            <div className="space-y-3" data-testid="plan-revenue-breakdown">
              {data.planRevenue
                .sort((a, b) => b.revenue - a.revenue)
                .map((p) => {
                  const maxRevenue = Math.max(...(data.planRevenue.map(x => x.revenue)), 1);
                  const pct = Math.round((p.revenue / maxRevenue) * 100);
                  return (
                    <div key={p.plan} data-testid={`plan-revenue-row-${p.plan}`}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: PLAN_COLORS[p.plan] ?? "#94a3b8" }}
                          />
                          <span className="capitalize font-medium text-slate-700">{p.plan}</span>
                          <Badge variant="outline" className="text-xs">{p.count} tenants</Badge>
                        </div>
                        <span className="font-semibold text-slate-900">${p.revenue.toLocaleString()}/mo</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: PLAN_COLORS[p.plan] ?? "#94a3b8" }}
                        />
                      </div>
                    </div>
                  );
                })}
              <p className="text-xs text-slate-400 mt-2">
                * Revenue figures are estimates based on plan pricing. Actual billing may differ.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
