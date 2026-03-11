import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { StatCard } from "@/components/widgets/stat-card";
import { DollarSign, ShoppingCart, Armchair, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function ManagerDashboard() {
  const [, navigate] = useLocation();

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

  const tableStats = stats?.tableStats || [];
  const totalTables = tableStats.reduce((sum: number, t: any) => sum + Number(t.count), 0);
  const occupiedTables = tableStats.find((t: any) => t.status === "occupied")?.count || 0;
  const occupancyPct = totalTables > 0 ? Math.round((Number(occupiedTables) / totalTables) * 100) : 0;

  const inProgressOrders = (stats?.recentOrders || []).filter(
    (o: any) => o.status === "in_progress" || o.status === "new" || o.status === "sent_to_kitchen"
  ).length;

  return (
    <div className="space-y-6" data-testid="dashboard-manager">
      <div>
        <h1 className="text-2xl font-heading font-bold" data-testid="text-dashboard-title">Manager Dashboard</h1>
        <p className="text-muted-foreground">Today's operations at a glance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Today's Sales"
          value={`$${Number(stats?.todayRevenue || 0).toFixed(2)}`}
          subtitle={`${stats?.todayOrders || 0} orders today`}
          icon={DollarSign}
          iconColor="text-green-600"
          iconBg="bg-green-100"
          testId="stat-today-sales"
        />
        <StatCard
          title="Orders In Progress"
          value={inProgressOrders}
          icon={ShoppingCart}
          iconColor="text-orange-600"
          iconBg="bg-orange-100"
          testId="stat-in-progress"
        />
        <StatCard
          title="Table Occupancy"
          value={`${occupancyPct}%`}
          subtitle={`${occupiedTables} of ${totalTables} tables`}
          icon={Armchair}
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
          testId="stat-occupancy"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card data-testid="card-quick-actions">
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={() => navigate("/pos")} data-testid="btn-goto-pos">Open POS</Button>
            <Button variant="secondary" onClick={() => navigate("/tables")} data-testid="btn-goto-tables">View Tables</Button>
            <Button variant="secondary" onClick={() => navigate("/inventory")} data-testid="btn-goto-inventory">Check Inventory</Button>
            <Button variant="secondary" onClick={() => navigate("/orders")} data-testid="btn-goto-orders">All Orders</Button>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <Card data-testid="card-top-menu">
            <CardHeader>
              <CardTitle className="text-base">Top 5 Menu Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(stats?.topItems || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet</p>
              ) : (
                (stats?.topItems || []).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between" data-testid={`top-menu-item-${i}`}>
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card data-testid="card-low-stock-alerts">
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
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm">{item.name}</span>
                    <span className="text-sm text-destructive font-medium">{item.currentStock} {item.unit}</span>
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
