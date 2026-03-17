import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { motion } from "framer-motion";
import SupervisorApprovalDialog from "@/components/supervisor-approval-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Table as UITable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, Eye, ChevronUp, ChevronDown, ClipboardList, Clock, CheckCircle2,
  XCircle, CircleDot, Send, ChefHat, Bell, UtensilsCrossed, CreditCard, Ban,
  Receipt, Banknote, Wallet, DollarSign,
} from "lucide-react";
import type { Order, OrderItem, Table } from "@shared/schema";

type OrderWithItems = Order & { items?: OrderItem[] };

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "sent_to_kitchen", label: "Sent to Kitchen" },
  { value: "in_progress", label: "In Progress" },
  { value: "ready", label: "Ready" },
  { value: "served", label: "Served" },
  { value: "ready_to_pay", label: "Ready to Pay" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
  { value: "voided", label: "Voided" },
];

const ORDER_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "dine_in", label: "Dine In" },
  { value: "takeaway", label: "Takeaway" },
  { value: "delivery", label: "Delivery" },
];

const statusColors: Record<string, string> = {
  new: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  sent_to_kitchen: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  served: "bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-200",
  ready_to_pay: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  voided: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const statusLabels: Record<string, string> = {
  new: "New",
  sent_to_kitchen: "Sent to Kitchen",
  in_progress: "In Progress",
  ready: "Ready",
  served: "Served",
  ready_to_pay: "Ready to Pay",
  paid: "Paid",
  cancelled: "Cancelled",
  voided: "Voided",
};

const statusIcons: Record<string, React.ElementType> = {
  new: CircleDot,
  sent_to_kitchen: Send,
  in_progress: ChefHat,
  ready: Bell,
  served: UtensilsCrossed,
  ready_to_pay: Receipt,
  paid: CreditCard,
  cancelled: XCircle,
  voided: Ban,
};

const typeLabels: Record<string, string> = {
  dine_in: "Dine In",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

const NEXT_STATUS: Record<string, string | null> = {
  new: "sent_to_kitchen",
  sent_to_kitchen: "in_progress",
  in_progress: "ready",
  ready: "served",
  served: "ready_to_pay",
  ready_to_pay: "paid",
  paid: null,
  cancelled: null,
  voided: null,
};

function formatDate(date: string | Date | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type PaymentMethod = "cash" | "card" | "upi";

export default function OrdersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: string | number | null) => {
    if (val == null) return sharedFormatCurrency(0, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });
    return sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });
  };

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<"createdAt" | "total">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [billPreviewOrder, setBillPreviewOrder] = useState<OrderWithItems | null>(null);
  const [billPaymentMethod, setBillPaymentMethod] = useState<PaymentMethod>("cash");
  const [supervisorDialog, setSupervisorDialog] = useState<{ open: boolean; orderId: string; action: string } | null>(null);

  const { data: orders = [], isLoading } = useQuery<Order[]>({ queryKey: ["/api/orders"] });
  const { data: tables = [] } = useQuery<Table[]>({ queryKey: ["/api/tables"] });
  const { data: tenantData } = useQuery<{ serviceCharge?: string; name?: string }>({ queryKey: ["/api/tenant"] });

  const { data: selectedOrderDetail } = useQuery<OrderWithItems>({
    queryKey: ["/api/orders", selectedOrderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${selectedOrderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order");
      return res.json();
    },
    enabled: !!selectedOrderId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, paymentMethod: pm, supervisorOverride }: { id: string; status: string; paymentMethod?: string; supervisorOverride?: { username: string; password: string; otpApprovalToken?: string } }) => {
      const body: Record<string, unknown> = { status };
      if (pm) body.paymentMethod = pm;
      if (supervisorOverride) body.supervisorOverride = supervisorOverride;
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Request failed" }));
        if (res.status === 403 && data.requiresSupervisor) {
          throw Object.assign(new Error(data.message), { requiresSupervisor: true, action: data.action, orderId: id });
        }
        throw new Error(data.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      if (selectedOrderId) queryClient.invalidateQueries({ queryKey: ["/api/orders", selectedOrderId] });
      toast({ title: "Order status updated" });
    },
    onError: (err: unknown) => {
      const error = err as Error & { requiresSupervisor?: boolean; action?: string; orderId?: string };
      if (error.requiresSupervisor && error.orderId) {
        setSupervisorDialog({ open: true, orderId: error.orderId, action: error.action || "void_order" });
        return;
      }
      toast({ variant: "destructive", title: "Failed to update", description: error.message });
    },
  });

  const handleSupervisorApproved = useCallback((_supervisorId: string, credentials: { username: string; password: string; otpApprovalToken?: string }) => {
    if (supervisorDialog) {
      updateStatusMutation.mutate({
        id: supervisorDialog.orderId,
        status: "voided",
        supervisorOverride: credentials,
      });
    }
    setSupervisorDialog(null);
  }, [supervisorDialog, updateStatusMutation]);

  const tableMap = useMemo(() => {
    const map: Record<string, string> = {};
    tables.forEach((t) => { map[t.id] = `Table ${t.number}`; });
    return map;
  }, [tables]);

  const filteredOrders = useMemo(() => {
    let result = [...orders];
    if (statusFilter !== "all") result = result.filter((o) => o.status === statusFilter);
    if (typeFilter !== "all") result = result.filter((o) => o.orderType === typeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((o) => o.id.toLowerCase().includes(q) || (o.notes && o.notes.toLowerCase().includes(q)) || (o.tableId && tableMap[o.tableId]?.toLowerCase().includes(q)));
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter((o) => o.createdAt && new Date(o.createdAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((o) => o.createdAt && new Date(o.createdAt) <= to);
    }
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "createdAt") cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      else cmp = Number(a.total) - Number(b.total);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [orders, statusFilter, typeFilter, searchQuery, dateFrom, dateTo, sortField, sortDir, tableMap]);

  const canUpdateStatus = user?.role === "owner" || user?.role === "manager" || user?.role === "kitchen" || user?.role === "waiter";

  const toggleSort = (field: "createdAt" | "total") => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: "createdAt" | "total" }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-1 inline" /> : <ChevronDown className="h-3 w-3 ml-1 inline" />;
  };

  const summaryStats = useMemo(() => {
    const total = filteredOrders.length;
    const active = filteredOrders.filter((o) => !["paid", "cancelled", "voided"].includes(o.status || "")).length;
    const readyToPay = filteredOrders.filter((o) => o.status === "ready_to_pay").length;
    const completed = filteredOrders.filter((o) => o.status === "paid").length;
    return { total, active, readyToPay, completed };
  }, [filteredOrders]);

  const handleBillPreview = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order");
      const order: OrderWithItems = await res.json();
      setBillPreviewOrder(order);
      setBillPaymentMethod("cash");
    } catch {
      toast({ variant: "destructive", title: "Error loading bill" });
    }
  };

  const SERVICE_CHARGE_RATE = Number(tenantData?.serviceCharge || 0) / 100;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold" data-testid="text-orders-title">Orders</h1>
          <p className="text-muted-foreground text-sm">Manage and track all orders</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: "total", icon: ClipboardList, label: "Total", value: summaryStats.total, color: "primary", testId: "stat-total-orders" },
          { key: "active", icon: Clock, label: "Active", value: summaryStats.active, color: "blue", testId: "stat-active-orders" },
          { key: "readyToPay", icon: Receipt, label: "Ready to Pay", value: summaryStats.readyToPay, color: "amber", testId: "stat-ready-to-pay" },
          { key: "completed", icon: CheckCircle2, label: "Completed", value: summaryStats.completed, color: "green", testId: "stat-completed-orders" },
        ].map((stat, i) => (
          <motion.div key={stat.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card data-testid={stat.testId} className="transition-all duration-200 hover:shadow-md">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`rounded-lg bg-${stat.color}-100 dark:bg-${stat.color}-900/30 p-2.5`}>
                  <stat.icon className={`h-5 w-5 text-${stat.color}-600`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold" data-testid={`text-${stat.key}-count`}>{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /> Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input data-testid="input-search-orders" placeholder="Search orders..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status-filter"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} data-testid={`option-status-${opt.value}`}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger data-testid="select-type-filter"><SelectValue placeholder="Order Type" /></SelectTrigger>
              <SelectContent>
                {ORDER_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} data-testid={`option-type-${opt.value}`}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input data-testid="input-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input data-testid="input-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground" data-testid="text-loading">Loading orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground" data-testid="text-no-orders">No orders found matching your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <UITable>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Order ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("total")}>
                      Total <SortIcon field="total" />
                    </TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("createdAt")}>
                      Date <SortIcon field="createdAt" />
                    </TableHead>
                    <TableHead className="w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order, index) => {
                    const StatusIcon = statusIcons[order.status || "new"] || CircleDot;
                    const isReadyToPay = order.status === "ready_to_pay";
                    return (
                      <motion.tr
                        key={order.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className={`border-b transition-colors hover:bg-muted/50 ${isReadyToPay ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`}
                        data-testid={`row-order-${order.id}`}
                      >
                        <TableCell className="font-mono text-xs" data-testid={`text-order-id-${order.id}`}>
                          #{order.id.slice(-6).toUpperCase()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`badge-type-${order.id}`}>{typeLabels[order.orderType || "dine_in"]}</Badge>
                        </TableCell>
                        <TableCell data-testid={`text-table-${order.id}`}>{order.tableId ? tableMap[order.tableId] || "—" : "—"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium transition-all duration-300 ${statusColors[order.status || "new"]}`} data-testid={`badge-status-${order.id}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusLabels[order.status || "new"]}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-total-${order.id}`}>{fmt(order.total)}</TableCell>
                        <TableCell className="text-sm" data-testid={`text-payment-${order.id}`}>{order.paymentMethod || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground" data-testid={`text-date-${order.id}`}>{formatDate(order.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedOrderId(order.id)} data-testid={`button-view-order-${order.id}`} className="hover:scale-110 transition-transform">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {isReadyToPay && (
                              <Button variant="outline" size="sm" className="text-amber-600 border-amber-300 hover:bg-amber-50 hover:scale-110 transition-all" onClick={() => handleBillPreview(order.id)} data-testid={`button-bill-preview-${order.id}`}>
                                <Receipt className="h-4 w-4" />
                              </Button>
                            )}
                            {canUpdateStatus && NEXT_STATUS[order.status || "new"] && !isReadyToPay && (
                              <Button variant="outline" size="sm" onClick={() => updateStatusMutation.mutate({ id: order.id, status: NEXT_STATUS[order.status || "new"]! })} disabled={updateStatusMutation.isPending} data-testid={`button-advance-status-${order.id}`} className="hover:scale-110 transition-transform">
                                →
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </TableBody>
              </UITable>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedOrderId} onOpenChange={(open) => !open && setSelectedOrderId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-order-detail-title">Order #{selectedOrderDetail?.id?.slice(-6).toUpperCase() || ""}</DialogTitle>
            <DialogDescription>View order details and manage status</DialogDescription>
          </DialogHeader>
          {selectedOrderDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[selectedOrderDetail.status || "new"]}`} data-testid="badge-detail-status">
                    {(() => { const SI = statusIcons[selectedOrderDetail.status || "new"] || CircleDot; return <SI className="h-3 w-3" />; })()}
                    {statusLabels[selectedOrderDetail.status || "new"]}
                  </span>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium" data-testid="text-detail-type">{typeLabels[selectedOrderDetail.orderType || "dine_in"]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Table</p>
                  <p className="font-medium" data-testid="text-detail-table">{selectedOrderDetail.tableId ? tableMap[selectedOrderDetail.tableId] || "—" : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium" data-testid="text-detail-date">{formatDate(selectedOrderDetail.createdAt)}</p>
                </div>
                {selectedOrderDetail.paymentMethod && (
                  <div>
                    <p className="text-muted-foreground">Payment</p>
                    <p className="font-medium" data-testid="text-detail-payment">{selectedOrderDetail.paymentMethod}</p>
                  </div>
                )}
                {selectedOrderDetail.notes && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Notes</p>
                    <p className="font-medium" data-testid="text-detail-notes">{selectedOrderDetail.notes}</p>
                  </div>
                )}
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Items</h4>
                {selectedOrderDetail.items && selectedOrderDetail.items.length > 0 ? (
                  <div className="space-y-2">
                    {selectedOrderDetail.items.map((item, idx) => (
                      <div key={item.id} className="flex justify-between items-center text-sm" data-testid={`row-order-item-${idx}`}>
                        <div className="flex-1">
                          <span className="font-medium" data-testid={`text-item-name-${idx}`}>{item.name}</span>
                          <span className="text-muted-foreground ml-2" data-testid={`text-item-qty-${idx}`}>x{item.quantity}</span>
                          {item.notes && <p className="text-xs text-muted-foreground" data-testid={`text-item-notes-${idx}`}>{item.notes}</p>}
                        </div>
                        <span className="font-medium" data-testid={`text-item-price-${idx}`}>{fmt(Number(item.price) * (item.quantity || 1))}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-items">No items</p>
                )}
              </div>
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span data-testid="text-detail-subtotal">{fmt(selectedOrderDetail.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span data-testid="text-detail-tax">{fmt(selectedOrderDetail.tax)}</span>
                </div>
                {Number(selectedOrderDetail.discount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="text-red-500" data-testid="text-detail-discount">-{fmt(selectedOrderDetail.discount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span data-testid="text-detail-total">{fmt(selectedOrderDetail.total)}</span>
                </div>
              </div>
              {canUpdateStatus && (
                <div className="flex gap-2 pt-2">
                  {selectedOrderDetail.status === "served" && (
                    <Button className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => updateStatusMutation.mutate({ id: selectedOrderDetail.id, status: "ready_to_pay" })} disabled={updateStatusMutation.isPending} data-testid="button-mark-ready-to-pay">
                      <Receipt className="h-4 w-4 mr-1" /> Mark Ready to Pay
                    </Button>
                  )}
                  {selectedOrderDetail.status === "ready_to_pay" && (
                    <Button className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => handleBillPreview(selectedOrderDetail.id)} data-testid="button-view-bill">
                      <Receipt className="h-4 w-4 mr-1" /> View Bill & Settle
                    </Button>
                  )}
                  {NEXT_STATUS[selectedOrderDetail.status || "new"] && selectedOrderDetail.status !== "served" && selectedOrderDetail.status !== "ready_to_pay" && (
                    <Button onClick={() => updateStatusMutation.mutate({ id: selectedOrderDetail.id, status: NEXT_STATUS[selectedOrderDetail.status || "new"]! })} disabled={updateStatusMutation.isPending} data-testid="button-advance-detail-status">
                      Advance to {statusLabels[NEXT_STATUS[selectedOrderDetail.status || "new"]!]}
                    </Button>
                  )}
                  {selectedOrderDetail.status !== "cancelled" && selectedOrderDetail.status !== "voided" && selectedOrderDetail.status !== "paid" && (
                    <>
                      <Button variant="destructive" onClick={() => updateStatusMutation.mutate({ id: selectedOrderDetail.id, status: "voided" })} disabled={updateStatusMutation.isPending} data-testid="button-void-order">
                        <Ban className="h-4 w-4 mr-1" /> Void
                      </Button>
                      <Button variant="outline" className="text-destructive border-destructive/50" onClick={() => updateStatusMutation.mutate({ id: selectedOrderDetail.id, status: "cancelled" })} disabled={updateStatusMutation.isPending} data-testid="button-cancel-order">
                        Cancel Order
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!billPreviewOrder} onOpenChange={(open) => !open && setBillPreviewOrder(null)}>
        <DialogContent className="max-w-md" data-testid="dialog-bill-preview">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-amber-600" />
              Bill Preview
            </DialogTitle>
            <DialogDescription>Review and settle the bill</DialogDescription>
          </DialogHeader>
          {billPreviewOrder && (
            <div className="space-y-4">
              <div className="text-center border-b pb-3">
                <h3 className="font-heading font-bold text-lg" data-testid="text-bill-restaurant">{tenantData?.name || "Restaurant"}</h3>
                <p className="text-xs text-muted-foreground">Invoice #{billPreviewOrder.id.slice(-6).toUpperCase()}</p>
                <p className="text-xs text-muted-foreground">{formatDate(billPreviewOrder.createdAt)}</p>
                {billPreviewOrder.tableId && (
                  <Badge variant="outline" className="mt-1" data-testid="text-bill-table">{tableMap[billPreviewOrder.tableId] || "—"}</Badge>
                )}
              </div>

              <div className="space-y-2">
                {billPreviewOrder.items?.map((item, idx) => (
                  <div key={item.id} className="flex justify-between text-sm" data-testid={`bill-item-${idx}`}>
                    <div className="flex-1">
                      <span>{item.name}</span>
                      <span className="text-muted-foreground ml-1">x{item.quantity}</span>
                    </div>
                    <span className="font-medium">{fmt(Number(item.price) * (item.quantity || 1))}</span>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span data-testid="text-bill-subtotal">{fmt(billPreviewOrder.subtotal)}</span>
                </div>
                {Number(billPreviewOrder.discount) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span data-testid="text-bill-discount">-{fmt(billPreviewOrder.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax (5%)</span>
                  <span data-testid="text-bill-tax">{fmt(billPreviewOrder.tax)}</span>
                </div>
                {billPreviewOrder.orderType === "dine_in" && SERVICE_CHARGE_RATE > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service Charge ({tenantData?.serviceCharge || 0}%)</span>
                    <span data-testid="text-bill-service">{fmt(Number(billPreviewOrder.subtotal) * SERVICE_CHARGE_RATE)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span data-testid="text-bill-total">
                    {fmt(
                      Number(billPreviewOrder.total) +
                      (billPreviewOrder.orderType === "dine_in" ? Number(billPreviewOrder.subtotal) * SERVICE_CHARGE_RATE : 0)
                    )}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Payment Method</p>
                <div className="flex gap-1">
                  <Button variant={billPaymentMethod === "cash" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setBillPaymentMethod("cash")} data-testid="button-bill-cash">
                    <Banknote className="h-3.5 w-3.5 mr-1" /> Cash
                  </Button>
                  <Button variant={billPaymentMethod === "card" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setBillPaymentMethod("card")} data-testid="button-bill-card">
                    <CreditCard className="h-3.5 w-3.5 mr-1" /> Card
                  </Button>
                  <Button variant={billPaymentMethod === "upi" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setBillPaymentMethod("upi")} data-testid="button-bill-upi">
                    <Wallet className="h-3.5 w-3.5 mr-1" /> UPI
                  </Button>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setBillPreviewOrder(null)} data-testid="button-close-bill">
                  Close
                </Button>
                <Button className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => { updateStatusMutation.mutate({ id: billPreviewOrder.id, status: "paid", paymentMethod: billPaymentMethod }); setBillPreviewOrder(null); }} disabled={updateStatusMutation.isPending} data-testid="button-mark-paid">
                  <DollarSign className="h-4 w-4 mr-1" /> Mark as Paid
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {supervisorDialog && (
        <SupervisorApprovalDialog
          open={supervisorDialog.open}
          onOpenChange={(open) => !open && setSupervisorDialog(null)}
          action={supervisorDialog.action}
          actionLabel="Void Order"
          onApproved={handleSupervisorApproved}
        />
      )}
    </motion.div>
  );
}
