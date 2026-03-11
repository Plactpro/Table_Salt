import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { StatCard } from "@/components/widgets/stat-card";
import { Armchair, ClipboardList, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function WaiterDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: orders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ["/api/orders"],
  });

  const { data: tables = [] } = useQuery<any[]>({
    queryKey: ["/api/tables"],
  });

  const myOrders = orders.filter((o: any) => o.waiterId === user?.id);
  const myOpenOrders = myOrders.filter((o: any) =>
    ["new", "sent_to_kitchen", "in_progress", "ready", "served"].includes(o.status)
  );
  const myOpenTableIds = new Set(myOpenOrders.map((o: any) => o.tableId).filter(Boolean));
  const myOpenTables = tables.filter((t: any) => myOpenTableIds.has(t.id));

  const shiftRevenue = myOrders
    .filter((o: any) => o.status === "paid")
    .reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);

  if (ordersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard-waiter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold" data-testid="text-dashboard-title">My Shift</h1>
          <p className="text-muted-foreground">Welcome, {user?.name}</p>
        </div>
        <Button onClick={() => navigate("/pos")} data-testid="btn-new-order">
          + New Order
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="My Open Tables"
          value={myOpenTables.length}
          icon={Armchair}
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
          testId="stat-my-tables"
        />
        <StatCard
          title="My Open Orders"
          value={myOpenOrders.length}
          icon={ClipboardList}
          iconColor="text-orange-600"
          iconBg="bg-orange-100"
          testId="stat-my-orders"
        />
        <StatCard
          title="Shift Revenue"
          value={`$${shiftRevenue.toFixed(2)}`}
          icon={DollarSign}
          iconColor="text-green-600"
          iconBg="bg-green-100"
          testId="stat-shift-revenue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card data-testid="card-my-tables">
            <CardHeader>
              <CardTitle className="text-base">My Open Tables</CardTitle>
            </CardHeader>
            <CardContent>
              {myOpenTables.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No open tables right now</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {myOpenTables.map((t: any) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-lg border bg-card flex items-center justify-between"
                      data-testid={`my-table-${t.number}`}
                    >
                      <div>
                        <p className="font-medium">Table {t.number}</p>
                        <p className="text-xs text-muted-foreground">{t.zone} · {t.capacity} seats</p>
                      </div>
                      <Badge variant="secondary">{t.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <Card data-testid="card-my-orders">
            <CardHeader>
              <CardTitle className="text-base">My Open Orders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {myOpenOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No open orders</p>
              ) : (
                myOpenOrders.map((order: any) => {
                  const statusColors: Record<string, string> = {
                    new: "bg-blue-100 text-blue-700",
                    sent_to_kitchen: "bg-yellow-100 text-yellow-700",
                    in_progress: "bg-orange-100 text-orange-700",
                    ready: "bg-green-100 text-green-700",
                    served: "bg-gray-100 text-gray-700",
                  };
                  return (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      data-testid={`my-order-${order.id.slice(-4)}`}
                    >
                      <div>
                        <p className="font-medium text-sm">#{order.id.slice(-4)}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.orderType?.replace("_", " ")} · ${Number(order.total || 0).toFixed(2)}
                        </p>
                      </div>
                      <Badge className={statusColors[order.status] || ""}>{order.status?.replace("_", " ")}</Badge>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
