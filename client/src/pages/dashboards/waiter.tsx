import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { StatCard } from "@/components/widgets/stat-card";
import { Armchair, ClipboardList, DollarSign, Clock, Users, Coffee, UtensilsCrossed, CircleDot, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

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

function ShiftClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = time.getHours().toString().padStart(2, "0");
  const minutes = time.getMinutes().toString().padStart(2, "0");
  const seconds = time.getSeconds().toString().padStart(2, "0");

  return (
    <motion.div
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 ring-1 ring-primary/10"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <Clock className="h-4 w-4 text-primary" />
      <span className="font-mono text-lg font-bold tabular-nums tracking-wider" data-testid="text-shift-clock">
        {hours}
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >:</motion.span>
        {minutes}
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >:</motion.span>
        <span className="text-sm text-muted-foreground">{seconds}</span>
      </span>
    </motion.div>
  );
}

const tableStatusConfig: Record<string, { icon: any; color: string; bg: string; border: string }> = {
  available: { icon: Armchair, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800" },
  occupied: { icon: UtensilsCrossed, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30", border: "border-orange-200 dark:border-orange-800" },
  reserved: { icon: Users, color: "text-amber-700", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800" },
  cleaning: { icon: Coffee, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800" },
};

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
    <motion.div
      className="space-y-6"
      data-testid="dashboard-waiter"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={fadeUp} className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold" data-testid="text-dashboard-title">My Shift</h1>
          <p className="text-muted-foreground">Welcome, {user?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <ShiftClock />
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button onClick={() => navigate("/pos")} data-testid="btn-new-order" className="gap-2">
              <Plus className="h-4 w-4" />
              New Order
            </Button>
          </motion.div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="My Open Tables"
          value={myOpenTables.length}
          icon={Armchair}
          iconColor="text-amber-700"
          iconBg="bg-amber-100"
          testId="stat-my-tables"
          index={0}
        />
        <StatCard
          title="My Open Orders"
          value={myOpenOrders.length}
          icon={ClipboardList}
          iconColor="text-orange-600"
          iconBg="bg-orange-100"
          testId="stat-my-orders"
          index={1}
        />
        <StatCard
          title="Shift Revenue"
          value={`$${shiftRevenue.toFixed(2)}`}
          icon={DollarSign}
          iconColor="text-green-600"
          iconBg="bg-green-100"
          testId="stat-shift-revenue"
          index={2}
        />
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card data-testid="card-my-tables" className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Armchair className="h-4 w-4 text-primary" />
                My Open Tables
              </CardTitle>
            </CardHeader>
            <CardContent>
              {myOpenTables.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No open tables right now</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {myOpenTables.map((t: any, i: number) => {
                    const cfg = tableStatusConfig[t.status] || tableStatusConfig.available;
                    const StatusIcon = cfg.icon;
                    return (
                      <motion.div
                        key={t.id}
                        className={`p-4 rounded-xl border-2 ${cfg.border} ${cfg.bg} flex items-center gap-3 transition-all duration-200`}
                        data-testid={`my-table-${t.number}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: 0.25 + i * 0.06 }}
                        whileHover={{ scale: 1.03, y: -2 }}
                      >
                        <div className={`p-2 rounded-lg ${cfg.bg}`}>
                          <StatusIcon className={`h-5 w-5 ${cfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">Table {t.number}</p>
                          <p className="text-xs text-muted-foreground">{t.zone} · {t.capacity} seats</p>
                        </div>
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          <CircleDot className={`h-3 w-3 ${cfg.color}`} />
                        </motion.div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
        >
          <Card data-testid="card-my-orders" className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                My Open Orders
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {myOpenOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No open orders</p>
              ) : (
                myOpenOrders.map((order: any, i: number) => {
                  const statusColors: Record<string, string> = {
                    new: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                    sent_to_kitchen: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
                    in_progress: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
                    ready: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
                    served: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
                  };
                  return (
                    <motion.div
                      key={order.id}
                      className="flex items-center justify-between p-3 rounded-xl border hover:bg-muted/30 transition-colors"
                      data-testid={`my-order-${order.id.slice(-4)}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
                    >
                      <div>
                        <p className="font-medium text-sm">#{order.id.slice(-4)}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.orderType?.replace("_", " ")} · ${Number(order.total || 0).toFixed(2)}
                        </p>
                      </div>
                      <Badge className={statusColors[order.status] || ""}>{order.status?.replace("_", " ")}</Badge>
                    </motion.div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
