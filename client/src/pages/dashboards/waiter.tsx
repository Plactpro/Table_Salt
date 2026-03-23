import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { StatCard } from "@/components/widgets/stat-card";
import {
  Armchair, ClipboardList, DollarSign, Clock, Users, Coffee, UtensilsCrossed,
  CircleDot, Plus, LogIn, LogOut, CheckCircle, AlertCircle, Bell,
  CheckCheck, ChefHat, Package, Star, Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { formatCurrency } from "@shared/currency";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  reserved: { icon: Users, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800" },
  cleaning: { icon: Coffee, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800" },
};

function ClockInOutCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [elapsed, setElapsed] = useState("");

  const { data: attendanceStatus, isLoading: statusLoading } = useQuery<any>({
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] }); toast({ title: "Clocked In", description: "Your shift has started" }); },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/attendance/clock-out", {}); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] }); toast({ title: "Clocked Out", description: "Your shift has ended" }); },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  if (statusLoading) return null;

  return (
    <motion.div variants={fadeUp}>
      <Card data-testid="card-clock-in-out" className={`border-2 ${isClockedIn ? "border-green-300 dark:border-green-800 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30" : "border-orange-200 dark:border-orange-800 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30"}`}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${isClockedIn ? "bg-green-100 dark:bg-green-900/50" : "bg-orange-100 dark:bg-orange-900/50"}`}>
                {isClockedIn ? <CheckCircle className="h-7 w-7 text-green-600" /> : <Clock className="h-7 w-7 text-orange-600" />}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Attendance</p>
                <h3 className="text-lg font-bold font-heading" data-testid="text-attendance-status">
                  {isClockedIn ? "Clocked In" : isClockedOut ? "Shift Complete" : "Not Clocked In"}
                </h3>
                {isClockedIn && (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">
                      Since {new Date(attendanceStatus.clockIn).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {elapsed && <Badge variant="secondary" className="text-xs" data-testid="text-elapsed-time">{elapsed}</Badge>}
                    {attendanceStatus.status === "late" && <Badge className="bg-amber-100 text-amber-700 text-xs"><AlertCircle className="h-3 w-3 mr-1" />Late ({attendanceStatus.lateMinutes}m)</Badge>}
                  </div>
                )}
                {isClockedOut && (
                  <span className="text-xs text-muted-foreground">
                    Worked {attendanceStatus.hoursWorked}h today
                  </span>
                )}
              </div>
            </div>
            <div>
              {!isClockedIn && !isClockedOut && (
                <Button
                  onClick={() => clockInMutation.mutate()}
                  disabled={clockInMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white gap-2 px-6 h-11"
                  data-testid="button-clock-in"
                >
                  <LogIn className="h-4 w-4" />
                  {clockInMutation.isPending ? "Clocking In..." : "Clock In"}
                </Button>
              )}
              {isClockedIn && (
                <Button
                  onClick={() => clockOutMutation.mutate()}
                  disabled={clockOutMutation.isPending}
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 gap-2 px-6 h-11"
                  data-testid="button-clock-out"
                >
                  <LogOut className="h-4 w-4" />
                  {clockOutMutation.isPending ? "Clocking Out..." : "Clock Out"}
                </Button>
              )}
              {isClockedOut && (
                <Badge className="bg-green-100 text-green-700 px-4 py-2 text-sm" data-testid="badge-shift-complete">
                  <CheckCircle className="h-4 w-4 mr-1" /> Complete
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface ReadyItem {
  itemId: string;
  itemName: string;
  quantity: number;
  orderId: string;
  orderNumber: string;
  tableNumber?: number;
  readySince?: string;
}

function ReadyToServeSection({ readyItems, onCollected }: {
  readyItems: ReadyItem[];
  onCollected: (itemId: string, orderId: string) => void;
}) {
  if (readyItems.length === 0) return null;

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
    >
      <Card className="border-2 border-green-400 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20" data-testid="card-ready-to-serve">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <Bell className="h-5 w-5 text-green-600" />
            </motion.div>
            Items Ready to Serve
            <Badge className="bg-green-600 text-white ml-1" data-testid="ready-items-count">{readyItems.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <AnimatePresence>
            {readyItems.map((item) => {
              const sinceMin = item.readySince
                ? Math.floor((Date.now() - new Date(item.readySince).getTime()) / 60000)
                : null;

              return (
                <motion.div
                  key={item.itemId}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10, height: 0 }}
                  className="flex items-center justify-between p-3 rounded-xl border-2 border-green-200 bg-white dark:bg-card gap-3"
                  data-testid={`ready-item-${item.itemId.slice(-4)}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{item.itemName}</span>
                      <Badge variant="outline" className="text-xs">x{item.quantity}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      {item.tableNumber && <span>Table {item.tableNumber}</span>}
                      <span>·</span>
                      <span>Order #{item.orderNumber}</span>
                      {sinceMin !== null && (
                        <>
                          <span>·</span>
                          <span className={sinceMin > 5 ? "text-amber-600 font-medium" : "text-green-600"}>
                            Ready {sinceMin}m ago
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white text-xs shrink-0 gap-1"
                    onClick={() => onCollected(item.itemId, item.orderId)}
                    data-testid={`btn-collected-${item.itemId.slice(-4)}`}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    COLLECTED & SERVING
                  </Button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}

const PLATE_RETURN_REASONS = [
  { value: "not_ordered", label: "Not what was ordered" },
  { value: "quality_issue", label: "Quality issue" },
  { value: "allergy_concern", label: "Allergy concern" },
  { value: "taste_issue", label: "Taste issue" },
  { value: "wrong_temp", label: "Wrong temperature" },
  { value: "customer_changed_mind", label: "Customer changed mind" },
  { value: "other", label: "Other" },
];

const DISH_CONDITIONS = [
  { value: "untouched", label: "Untouched" },
  { value: "partially_eaten", label: "Partially eaten" },
  { value: "fully_eaten", label: "Fully eaten" },
  { value: "damaged", label: "Damaged" },
];

function PlateReturnDialog({
  open,
  onClose,
  orders,
}: {
  open: boolean;
  onClose: () => void;
  orders: any[];
}) {
  const { toast } = useToast();
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [dishCondition, setDishCondition] = useState("");
  const [note, setNote] = useState("");

  const selectedOrder = orders.find((o: any) => o.id === selectedOrderId);
  const orderItems = selectedOrder?.items ?? [];

  const mutation = useMutation({
    mutationFn: async () => {
      const item = orderItems.find((i: any) => i.id === selectedItemId);
      const itemName = item?.name ?? "Unknown Item";
      const qty = item?.quantity ?? 1;
      const reasonLabel = PLATE_RETURN_REASONS.find((r) => r.value === returnReason)?.label ?? returnReason;
      const conditionLabel = DISH_CONDITIONS.find((c) => c.value === dishCondition)?.label ?? dishCondition;
      const msgParts = [
        `PLATE RETURN: ${itemName} (x${qty})`,
        `Order #${selectedOrderId.slice(-6)}`,
        `Reason: ${reasonLabel}`,
        `Condition: ${conditionLabel}`,
      ];
      if (note) msgParts.push(`Note: ${note}`);
      const message = msgParts.join(" | ");
      const res = await apiRequest("POST", "/api/service-messages", {
        orderId: selectedOrderId,
        toRole: "kitchen",
        message,
        messageType: "PLATE_RETURN",
        priority: "high",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Plate Return Notified", description: "Kitchen has been notified to log the wastage." });
      setSelectedOrderId(""); setSelectedItemId(""); setReturnReason(""); setDishCondition(""); setNote("");
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-plate-return">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" /> Plate Return
          </DialogTitle>
          <DialogDescription>
            Notify the kitchen of a returned plate. They will log the wastage entry.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Active Order</Label>
            <Select value={selectedOrderId} onValueChange={(v) => { setSelectedOrderId(v); setSelectedItemId(""); }}>
              <SelectTrigger data-testid="select-plate-order">
                <SelectValue placeholder="Select order..." />
              </SelectTrigger>
              <SelectContent>
                {orders.map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    #{o.id.slice(-4)} {o.tableId ? `· Table ${o.tableNumber ?? "?"}` : ""} — {o.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedOrder && (
            <div className="space-y-1.5">
              <Label>Returned Item</Label>
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger data-testid="select-plate-item">
                  <SelectValue placeholder="Select item..." />
                </SelectTrigger>
                <SelectContent>
                  {orderItems.map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} (x{item.quantity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Return Reason</Label>
            <Select value={returnReason} onValueChange={setReturnReason}>
              <SelectTrigger data-testid="select-return-reason">
                <SelectValue placeholder="Select reason..." />
              </SelectTrigger>
              <SelectContent>
                {PLATE_RETURN_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Dish Condition</Label>
            <Select value={dishCondition} onValueChange={setDishCondition}>
              <SelectTrigger data-testid="select-dish-condition">
                <SelectValue placeholder="Select condition..." />
              </SelectTrigger>
              <SelectContent>
                {DISH_CONDITIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any additional details..."
              rows={2}
              data-testid="input-plate-return-note"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2 border-t">
          <Button
            className="flex-1 bg-destructive hover:bg-destructive/90 gap-2"
            disabled={!selectedOrderId || !selectedItemId || !returnReason || mutation.isPending}
            onClick={() => mutation.mutate()}
            data-testid="btn-submit-plate-return"
          >
            <Trash2 className="h-4 w-4" />
            Notify Kitchen
          </Button>
          <Button variant="outline" onClick={onClose} data-testid="btn-cancel-plate-return">Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function WaiterDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [plateReturnOpen, setPlateReturnOpen] = useState(false);

  const { data: waiterData, isLoading: waiterLoading } = useQuery<{
    readyItems: ReadyItem[];
    activeOrders: any[];
  }>({
    queryKey: ["/api/coordination/waiter-ready-items"],
    refetchInterval: 30000,
  });

  const { data: ordersRes, isLoading: ordersLoading } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/orders"],
  });
  const orders = ordersRes?.data ?? [];

  const { data: tables = [] } = useQuery<any[]>({
    queryKey: ["/api/tables"],
  });

  const { data: tableRequestsData } = useQuery<any[]>({
    queryKey: ["/api/table-requests/live"],
    refetchInterval: 30000,
  });
  const tableRequests = Array.isArray(tableRequestsData) ? tableRequestsData : [];

  const myOrders = orders.filter((o: any) => o.waiterId === user?.id);
  const myOpenOrders = myOrders.filter((o: any) =>
    ["new", "sent_to_kitchen", "in_progress", "ready"].includes(o.status)
  );
  const myOpenTableIds = new Set(myOpenOrders.map((o: any) => o.tableId).filter(Boolean));
  const myOpenTables = tables.filter((t: any) => myOpenTableIds.has(t.id));

  const myPendingRequests = tableRequests.filter((r: any) =>
    r.status === "pending" && myOpenTableIds.has(r.tableId)
  );

  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: string | number | null) => formatCurrency(val ?? 0, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });

  const shiftRevenue = myOrders
    .filter((o: any) => o.status === "paid")
    .reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);

  const serveItemMutation = useMutation({
    mutationFn: async ({ orderId, itemId }: { orderId: string; itemId: string }) => {
      const res = await apiRequest("PATCH", `/api/orders/${orderId}/items/${itemId}/status`, { status: "served" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coordination/waiter-ready-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Item Served", description: "Item marked as collected and serving" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest("PUT", `/api/table-requests/${requestId}/complete`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/table-requests"] });
      toast({ title: "Request Handled", description: "Customer request marked as handled" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const invalidateWaiterData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/coordination/waiter-ready-items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
  }, [queryClient]);

  useRealtimeEvent("coordination:item_ready", (payload: any) => {
    invalidateWaiterData();
    toast({ title: "Item Ready!", description: "An item is ready to serve" });
  });
  useRealtimeEvent("order:updated", invalidateWaiterData);
  useRealtimeEvent("coordination:order_updated", invalidateWaiterData);

  const readyItems = waiterData?.readyItems ?? [];

  const getOrderStatusInfo = (status: string) => {
    const map: Record<string, { label: string; color: string; icon: any }> = {
      new: { label: "New", color: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300", icon: ClipboardList },
      sent_to_kitchen: { label: "In Kitchen", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", icon: ChefHat },
      in_progress: { label: "Preparing", color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300", icon: ChefHat },
      ready: { label: "All Ready", color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300", icon: CheckCheck },
    };
    return map[status] || { label: status, color: "bg-gray-100 text-gray-700", icon: CircleDot };
  };

  if (ordersLoading || waiterLoading) {
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
            <Button
              variant="outline"
              onClick={() => setPlateReturnOpen(true)}
              data-testid="btn-plate-return"
              className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Plate Return
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button onClick={() => navigate("/pos")} data-testid="btn-new-order" className="gap-2">
              <Plus className="h-4 w-4" />
              New Order
            </Button>
          </motion.div>
        </div>
      </motion.div>

      <PlateReturnDialog
        open={plateReturnOpen}
        onClose={() => setPlateReturnOpen(false)}
        orders={myOpenOrders}
      />

      <ClockInOutCard />

      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="My Open Tables"
          value={myOpenTables.length}
          icon={Armchair}
          iconColor="text-teal-600"
          iconBg="bg-teal-100"
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
          value={fmt(shiftRevenue)}
          icon={DollarSign}
          iconColor="text-green-600"
          iconBg="bg-green-100"
          testId="stat-shift-revenue"
          index={2}
        />
      </motion.div>

      <ReadyToServeSection
        readyItems={readyItems}
        onCollected={(itemId, orderId) => serveItemMutation.mutate({ itemId, orderId })}
      />

      {myPendingRequests.length > 0 && (
        <motion.div variants={fadeUp}>
          <Card className="border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20" data-testid="card-customer-requests">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-600" />
                Customer Requests
                <Badge className="bg-amber-500 text-white ml-1" data-testid="requests-count">{myPendingRequests.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <AnimatePresence>
                {myPendingRequests.map((req: any) => (
                  <motion.div
                    key={req.id}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center justify-between p-3 rounded-xl border bg-white dark:bg-card gap-3"
                    data-testid={`request-${req.id.slice(-4)}`}
                  >
                    <div>
                      <p className="text-sm font-medium capitalize">{(req.requestType || req.type || "Request")?.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        Table {tables.find((t: any) => t.id === req.tableId)?.number ?? "?"} ·{" "}
                        {Math.floor((Date.now() - new Date(req.createdAt).getTime()) / 60000)}m ago
                      </p>
                      {(req.guestNote || req.message) && <p className="text-xs text-muted-foreground mt-0.5">{req.guestNote || req.message}</p>}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-xs"
                      onClick={() => handleRequestMutation.mutate(req.id)}
                      data-testid={`btn-handle-request-${req.id.slice(-4)}`}
                    >
                      HANDLE
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      )}

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
          <Card data-testid="card-active-orders" className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                Active Orders
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {myOpenOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No active orders</p>
              ) : (
                myOpenOrders.map((order: any, i: number) => {
                  const statusInfo = getOrderStatusInfo(order.status);
                  const StatusIcon = statusInfo.icon;
                  const elapsedMin = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
                  const elapsedColor = elapsedMin >= 20 ? "text-red-600" : elapsedMin >= 10 ? "text-amber-600" : "text-muted-foreground";

                  return (
                    <motion.div
                      key={order.id}
                      className="flex items-center justify-between p-3 rounded-xl border hover:bg-muted/30 transition-colors"
                      data-testid={`my-order-${order.id.slice(-4)}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">#{order.id.slice(-4)}</p>
                          {order.tableId && (
                            <span className="text-xs text-muted-foreground">
                              Table {tables.find((t: any) => t.id === order.tableId)?.number ?? "?"}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{fmt(Number(order.total || 0))}</span>
                          <span className={`text-xs flex items-center gap-0.5 ${elapsedColor}`}>
                            <Clock className="h-3 w-3" /> {elapsedMin}m
                          </span>
                        </div>
                      </div>
                      <Badge className={`${statusInfo.color} flex items-center gap-1 text-xs`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusInfo.label}
                      </Badge>
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
