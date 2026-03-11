import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { OrderTicket } from "@/components/widgets/order-ticket";
import { motion, AnimatePresence } from "framer-motion";
import { Utensils, Flame, CheckCircle2, ChefHat } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface OrderWithItems {
  id: string;
  tableId: string | null;
  status: string;
  createdAt: string | null;
  items: Array<{ name: string; quantity: number | null; notes: string | null; status: string | null }>;
  tableNumber?: number;
}

const columnConfig = [
  {
    key: "new",
    title: "New",
    icon: Utensils,
    borderColor: "border-t-red-600",
    headerBg: "bg-red-50 dark:bg-red-950/40",
    headerText: "text-red-700 dark:text-red-300",
    badgeBg: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    dotColor: "bg-red-600",
  },
  {
    key: "in_progress",
    title: "In Progress",
    icon: Flame,
    borderColor: "border-t-orange-500",
    headerBg: "bg-orange-50 dark:bg-orange-950/40",
    headerText: "text-orange-700 dark:text-orange-300",
    badgeBg: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    dotColor: "bg-orange-500",
  },
  {
    key: "ready",
    title: "Ready",
    icon: CheckCircle2,
    borderColor: "border-t-green-500",
    headerBg: "bg-green-50 dark:bg-green-950/40",
    headerText: "text-green-700 dark:text-green-300",
    badgeBg: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    dotColor: "bg-green-500",
  },
];

export default function KitchenDashboard() {
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/orders"],
  });

  const { data: tables = [] } = useQuery<any[]>({
    queryKey: ["/api/tables"],
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/orders/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const tableMap = new Map(tables.map((t: any) => [t.id, t.number]));

  const kitchenOrders: OrderWithItems[] = orders
    .filter((o: any) => ["new", "sent_to_kitchen", "in_progress", "ready"].includes(o.status))
    .map((o: any) => ({
      ...o,
      tableNumber: o.tableId ? tableMap.get(o.tableId) : undefined,
      items: o.items || [],
    }));

  const newOrders = kitchenOrders.filter((o) => o.status === "new" || o.status === "sent_to_kitchen");
  const inProgressOrders = kitchenOrders.filter((o) => o.status === "in_progress");
  const readyOrders = kitchenOrders.filter((o) => o.status === "ready");

  const columns = [
    { ...columnConfig[0], orders: newOrders },
    { ...columnConfig[1], orders: inProgressOrders },
    { ...columnConfig[2], orders: readyOrders },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-kitchen">
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3">
          <motion.div
            className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <ChefHat className="h-5 w-5 text-primary" />
          </motion.div>
          <div>
            <h1 className="text-2xl font-heading font-bold" data-testid="text-dashboard-title">Kitchen Display</h1>
            <p className="text-muted-foreground">
              {kitchenOrders.length} active ticket{kitchenOrders.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {columns.map((col, colIdx) => {
          const ColIcon = col.icon;
          return (
            <motion.div
              key={col.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: colIdx * 0.08 }}
              className={`space-y-3 border-t-4 ${col.borderColor} pt-0 rounded-xl overflow-hidden`}
            >
              <div className={`flex items-center justify-between p-3 ${col.headerBg} rounded-b-lg`}>
                <div className="flex items-center gap-2">
                  <ColIcon className={`h-4 w-4 ${col.headerText}`} />
                  <h2 className={`font-heading font-semibold text-sm uppercase tracking-wide ${col.headerText}`}>
                    {col.title}
                  </h2>
                </div>
                <Badge className={`${col.badgeBg} font-mono text-xs`}>
                  {col.orders.length}
                </Badge>
              </div>
              <div className="space-y-3 px-1">
                <AnimatePresence mode="popLayout">
                  {col.orders.length === 0 ? (
                    <motion.p
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-muted-foreground text-center py-8"
                    >
                      No tickets
                    </motion.p>
                  ) : (
                    col.orders.map((order) => (
                      <OrderTicket
                        key={order.id}
                        orderId={order.id}
                        tableNumber={order.tableNumber}
                        items={order.items.length > 0 ? order.items : [{ name: "Order items", quantity: 1, notes: null, status: null }]}
                        status={order.status}
                        createdAt={order.createdAt}
                        onStatusChange={(newStatus) => {
                          updateOrderMutation.mutate({ id: order.id, status: newStatus });
                        }}
                        testId={`ticket-${order.id.slice(-4)}`}
                      />
                    ))
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
