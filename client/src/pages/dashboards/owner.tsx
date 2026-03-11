import { useQuery } from "@tanstack/react-query";
import { StatCard } from "@/components/widgets/stat-card";
import { ChartWidget } from "@/components/widgets/chart-widget";
import { DataTable } from "@/components/widgets/data-table";
import { DollarSign, ShoppingCart, TrendingUp, Users, AlertTriangle, BarChart3, Star, CalendarDays, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function OwnerDashboard() {
  const { user } = useAuth();

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

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <motion.div
      className="space-y-6"
      data-testid="dashboard-owner"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={fadeUp}>
        <Card className="overflow-hidden border-0 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <motion.div
                className="p-3 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Sparkles className="h-6 w-6 text-primary" />
              </motion.div>
              <div>
                <h1 className="text-2xl font-heading font-bold" data-testid="text-dashboard-title">
                  {greeting}, {user?.name?.split(" ")[0] || "Owner"}
                </h1>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <p className="text-sm">{dateStr}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">Key Metrics</h2>
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
            index={0}
          />
          <StatCard
            title="Total Orders"
            value={stats?.totalOrders || 0}
            subtitle={`Today: ${stats?.todayOrders || 0}`}
            icon={ShoppingCart}
            iconColor="text-amber-700"
            iconBg="bg-amber-100"
            testId="stat-orders"
            index={1}
          />
          <StatCard
            title="Avg Order Value"
            value={`$${avgOrderValue}`}
            icon={TrendingUp}
            iconColor="text-purple-600"
            iconBg="bg-purple-100"
            testId="stat-avg-order"
            index={2}
          />
          <StatCard
            title="Staff Count"
            value={stats?.staffCount || 0}
            icon={Users}
            iconColor="text-orange-600"
            iconBg="bg-orange-100"
            testId="stat-staff"
            index={3}
          />
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">Sales Analytics</h2>
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
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <Card data-testid="card-top-items" className="h-full">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="h-4 w-4 text-yellow-500" />
                  Top Selling Items
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(stats?.topItems || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data yet</p>
                ) : (
                  (stats?.topItems || []).map((item: any, i: number) => (
                    <motion.div
                      key={i}
                      className="flex items-center justify-between"
                      data-testid={`top-item-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.4 + i * 0.06 }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                      <Badge variant="secondary">{item.totalQty} sold</Badge>
                    </motion.div>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-2 mb-3">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">Orders & Alerts</h2>
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
                    new: "bg-amber-100 text-amber-700",
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
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <Card data-testid="card-low-stock" className="h-full">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <motion.div
                    animate={{ scale: (stats?.lowStockItems || []).length > 0 ? [1, 1.15, 1] : 1 }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <AlertTriangle className={`h-4 w-4 ${(stats?.lowStockItems || []).length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                  </motion.div>
                  Low Stock Alerts
                  {(stats?.lowStockItems || []).length > 0 && (
                    <Badge variant="destructive" className="ml-auto text-xs">{(stats?.lowStockItems || []).length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(stats?.lowStockItems || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">All stock levels are good</p>
                ) : (
                  (stats?.lowStockItems || []).map((item: any, i: number) => (
                    <motion.div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-destructive/5 transition-colors"
                      data-testid={`low-stock-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.4 + i * 0.06 }}
                    >
                      <span className="text-sm">{item.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-destructive font-medium">{item.currentStock} {item.unit}</span>
                        <span className="text-xs text-muted-foreground">(min: {item.reorderLevel})</span>
                      </div>
                    </motion.div>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
