import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { OrderTicket } from "@/components/widgets/order-ticket";
import { motion, AnimatePresence } from "framer-motion";
import { Utensils, Flame, CheckCircle2, ChefHat, LogIn, LogOut, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

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
    borderColor: "border-t-teal-600",
    headerBg: "bg-teal-50 dark:bg-teal-950/40",
    headerText: "text-teal-700 dark:text-teal-300",
    badgeBg: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
    dotColor: "bg-teal-600",
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

function KitchenClockCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [elapsed, setElapsed] = useState("");

  const { data: attendanceStatus, isLoading } = useQuery<any>({
    queryKey: ["/api/attendance/status"],
    refetchInterval: 30000,
  });

  const isClockedIn = attendanceStatus && !attendanceStatus.clockOut;
  const isClockedOut = attendanceStatus && attendanceStatus.clockOut;

  useEffect(() => {
    if (!isClockedIn) { setElapsed(""); return; }
    const update = () => {
      const diff = Date.now() - new Date(attendanceStatus.clockIn).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setElapsed(`${h}h ${m}m`);
    };
    update();
    const iv = setInterval(update, 60000);
    return () => clearInterval(iv);
  }, [isClockedIn, attendanceStatus?.clockIn]);

  const clockInMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/attendance/clock-in", {}); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] }); toast({ title: "Clocked In" }); },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/attendance/clock-out", {}); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] }); toast({ title: "Clocked Out" }); },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  if (isLoading) return null;

  return (
    <Card data-testid="card-clock-in-out" className={`border-2 ${isClockedIn ? "border-green-300 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" : "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20"}`}>
      <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {isClockedIn ? <CheckCircle className="h-5 w-5 text-green-600" /> : <Clock className="h-5 w-5 text-orange-600" />}
          <div>
            <span className="font-semibold text-sm" data-testid="text-attendance-status">
              {isClockedIn ? "Clocked In" : isClockedOut ? "Shift Complete" : "Not Clocked In"}
            </span>
            {isClockedIn && elapsed && <span className="text-xs text-muted-foreground ml-2">({elapsed})</span>}
            {isClockedIn && attendanceStatus.status === "late" && <Badge className="bg-amber-100 text-amber-700 text-xs ml-2"><AlertCircle className="h-3 w-3 mr-1" />Late</Badge>}
            {isClockedOut && <span className="text-xs text-muted-foreground ml-2">{attendanceStatus.hoursWorked}h worked</span>}
          </div>
        </div>
        {!isClockedIn && !isClockedOut && (
          <Button size="sm" onClick={() => clockInMutation.mutate()} disabled={clockInMutation.isPending} className="bg-green-600 hover:bg-green-700 gap-1" data-testid="button-clock-in">
            <LogIn className="h-3.5 w-3.5" /> Clock In
          </Button>
        )}
        {isClockedIn && (
          <Button size="sm" variant="outline" onClick={() => clockOutMutation.mutate()} disabled={clockOutMutation.isPending} className="border-red-300 text-red-600 gap-1" data-testid="button-clock-out">
            <LogOut className="h-3.5 w-3.5" /> Clock Out
          </Button>
        )}
      </CardContent>
    </Card>
  );
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
    { ...columnConfig[0], orders: newOrders },
    { ...columnConfig[1], orders: inProgressOrders },
    { ...columnConfig[2], orders: readyOrders },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-kitchen">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
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
        </motion.div>
      </div>

      <KitchenClockCard />

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
