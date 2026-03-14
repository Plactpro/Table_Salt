import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { StatCard } from "@/components/widgets/stat-card";
import { DollarSign, ShoppingCart, Armchair, AlertTriangle, Monitor, LayoutGrid, Package, ClipboardList, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@shared/currency";

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

const quickActions = [
  { label: "Open POS", path: "/pos", icon: Monitor, color: "from-teal-500/15 to-teal-600/5", iconColor: "text-teal-600", border: "ring-teal-200 dark:ring-teal-800" },
  { label: "View Tables", path: "/tables", icon: LayoutGrid, color: "from-purple-500/15 to-purple-600/5", iconColor: "text-purple-600", border: "ring-purple-200 dark:ring-purple-800" },
  { label: "Check Inventory", path: "/inventory", icon: Package, color: "from-orange-500/15 to-orange-600/5", iconColor: "text-orange-600", border: "ring-orange-200 dark:ring-orange-800" },
  { label: "All Orders", path: "/orders", icon: ClipboardList, color: "from-green-500/15 to-green-600/5", iconColor: "text-green-600", border: "ring-green-200 dark:ring-green-800" },
];

export default function ManagerDashboard() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/dashboard"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: string | number | null) => formatCurrency(val ?? 0, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });

  const tableStats = stats?.tableStats || [];
  const totalTables = tableStats.reduce((sum: number, t: any) => sum + Number(t.count), 0);
  const occupiedTables = tableStats.find((t: any) => t.status === "occupied")?.count || 0;
  const occupancyPct = totalTables > 0 ? Math.round((Number(occupiedTables) / totalTables) * 100) : 0;

  const inProgressOrders = (stats?.recentOrders || []).filter(
    (o: any) => o.status === "in_progress" || o.status === "new" || o.status === "sent_to_kitchen"
  ).length;

  return (
    <motion.div
      className="space-y-6"
      data-testid="dashboard-manager"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-heading font-bold" data-testid="text-dashboard-title">Manager Dashboard</h1>
        <p className="text-muted-foreground">Today's operations at a glance</p>
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Today's Sales"
          value={fmt(stats?.todayRevenue || 0)}
          subtitle={`${stats?.todayOrders || 0} orders today`}
          icon={DollarSign}
          iconColor="text-green-600"
          iconBg="bg-green-100"
          testId="stat-today-sales"
          index={0}
        />
        <StatCard
          title="Orders In Progress"
          value={inProgressOrders}
          icon={ShoppingCart}
          iconColor="text-orange-600"
          iconBg="bg-orange-100"
          testId="stat-in-progress"
          index={1}
        />
        <StatCard
          title="Table Occupancy"
          value={`${occupancyPct}%`}
          subtitle={`${occupiedTables} of ${totalTables} tables`}
          icon={Armchair}
          iconColor="text-cyan-600"
          iconBg="bg-cyan-100"
          testId="stat-occupancy"
          index={2}
        />
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card data-testid="card-quick-actions">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-primary" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {quickActions.map((action, i) => {
                const ActionIcon = action.icon;
                return (
                  <motion.button
                    key={action.path}
                    onClick={() => navigate(action.path)}
                    className={`group relative flex flex-col items-center gap-3 p-5 rounded-xl bg-gradient-to-br ${action.color} ring-1 ${action.border} transition-all duration-200 cursor-pointer`}
                    data-testid={`btn-goto-${action.path.replace("/", "")}`}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 + i * 0.06 }}
                  >
                    <motion.div
                      whileHover={{ rotate: 8, scale: 1.1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                    >
                      <ActionIcon className={`h-7 w-7 ${action.iconColor}`} />
                    </motion.div>
                    <span className="text-sm font-medium">{action.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card data-testid="card-top-menu" className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                Top 5 Menu Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(stats?.topItems || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet</p>
              ) : (
                (stats?.topItems || []).map((item: any, i: number) => (
                  <motion.div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    data-testid={`top-menu-item-${i}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.35 + i * 0.05 }}
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          <Card data-testid="card-low-stock-alerts" className="h-full">
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
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.4 + i * 0.05 }}
                  >
                    <span className="text-sm">{item.name}</span>
                    <span className="text-sm text-destructive font-medium">{item.currentStock} {item.unit}</span>
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
