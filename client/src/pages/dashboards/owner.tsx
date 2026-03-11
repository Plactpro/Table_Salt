import { useQuery } from "@tanstack/react-query";
import { StatCard } from "@/components/widgets/stat-card";
import { ChartWidget } from "@/components/widgets/chart-widget";
import { DataTable } from "@/components/widgets/data-table";
import { DollarSign, ShoppingCart, TrendingUp, Users, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function OwnerDashboard() {
  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/dashboard"],
  });

  const { data: salesReport } = useQuery<any>({
    queryKey: ["/api/reports/sales"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const avgOrderValue = stats?.totalOrders > 0
    ? (stats.totalRevenue / stats.totalOrders).toFixed(2)
    : "0.00";

  const chartData = (salesReport?.salesByDay || []).map((d: any) => ({
    date: new Date(d.date).toLocaleDateString("en-US", { weekday: "short" }),
    revenue: Number(d.revenue || 0),
    orders: Number(d.orderCount || 0),
  }));

  return (
    <div className="space-y-6" data-testid="dashboard-owner">
      <div>
        <h1 className="text-2xl font-heading font-bold" data-testid="text-dashboard-title">Owner Dashboard</h1>
        <p className="text-muted-foreground">Overview of your restaurant's performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={`$${Number(stats?.totalRevenue || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          subtitle={`Today: $${Number(stats?.todayRevenue || 0).toFixed(2)}`}
          icon={DollarSign}
          iconColor="text-green-600"
          iconBg="bg-green-100"
          testId="stat-revenue"
        />
        <StatCard
          title="Total Orders"
          value={stats?.totalOrders || 0}
          subtitle={`Today: ${stats?.todayOrders || 0}`}
          icon={ShoppingCart}
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
          testId="stat-orders"
        />
        <StatCard
          title="Avg Order Value"
          value={`$${avgOrderValue}`}
          icon={TrendingUp}
          iconColor="text-purple-600"
          iconBg="bg-purple-100"
          testId="stat-avg-order"
        />
        <StatCard
          title="Staff Count"
          value={stats?.staffCount || 0}
          icon={Users}
          iconColor="text-orange-600"
          iconBg="bg-orange-100"
          testId="stat-staff"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartWidget
            title="Sales (Last 7 Days)"
            data={chartData}
            dataKey="revenue"
            xKey="date"
            type="bar"
            testId="chart-sales"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <Card data-testid="card-top-items">
            <CardHeader>
              <CardTitle className="text-base">Top Selling Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(stats?.topItems || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet</p>
              ) : (
                (stats?.topItems || []).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between" data-testid={`top-item-${i}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground w-5">{i + 1}.</span>
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    <Badge variant="secondary">{item.totalQty} sold</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DataTable
          title="Recent Orders"
          columns={[
            { key: "id", label: "Order", render: (v: string) => `#${v.slice(-4)}` },
            { key: "orderType", label: "Type", render: (v: string) => <Badge variant="outline">{v?.replace("_", " ")}</Badge> },
            {
              key: "status",
              label: "Status",
              render: (v: string) => {
                const colors: Record<string, string> = {
                  new: "bg-blue-100 text-blue-700",
                  in_progress: "bg-orange-100 text-orange-700",
                  ready: "bg-green-100 text-green-700",
                  paid: "bg-emerald-100 text-emerald-700",
                  cancelled: "bg-red-100 text-red-700",
                };
                return <Badge className={colors[v] || ""}>{v?.replace("_", " ")}</Badge>;
              },
            },
            { key: "total", label: "Total", render: (v: string) => `$${Number(v || 0).toFixed(2)}` },
          ]}
          data={stats?.recentOrders || []}
          testId="table-recent-orders"
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <Card data-testid="card-low-stock">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Low Stock Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(stats?.lowStockItems || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">All stock levels are good</p>
              ) : (
                (stats?.lowStockItems || []).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between" data-testid={`low-stock-${i}`}>
                    <span className="text-sm">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-destructive font-medium">{item.currentStock} {item.unit}</span>
                      <span className="text-xs text-muted-foreground">(min: {item.reorderLevel})</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
