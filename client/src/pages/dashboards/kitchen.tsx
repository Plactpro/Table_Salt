import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { OrderTicket } from "@/components/widgets/order-ticket";
import { motion } from "framer-motion";

interface OrderWithItems {
  id: string;
  tableId: string | null;
  status: string;
  createdAt: string | null;
  items: Array<{ name: string; quantity: number | null; notes: string | null; status: string | null }>;
  tableNumber?: number;
}

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
    { title: "New", orders: newOrders, color: "border-blue-500" },
    { title: "In Progress", orders: inProgressOrders, color: "border-orange-500" },
    { title: "Ready", orders: readyOrders, color: "border-green-500" },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-kitchen">
      <div>
        <h1 className="text-2xl font-heading font-bold" data-testid="text-dashboard-title">Kitchen Display</h1>
        <p className="text-muted-foreground">
          {kitchenOrders.length} active ticket{kitchenOrders.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {columns.map((col) => (
          <motion.div
            key={col.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`space-y-3 border-t-4 ${col.color} pt-4`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-semibold text-sm uppercase tracking-wide">
                {col.title}
              </h2>
              <span className="text-sm text-muted-foreground">{col.orders.length}</span>
            </div>
            <div className="space-y-3">
              {col.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No tickets</p>
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
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
