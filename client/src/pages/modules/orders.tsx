import { useTranslation } from "react-i18next";
import { PageTitle } from "@/lib/accessibility";
import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { motion } from "framer-motion";
import SupervisorApprovalDialog from "@/components/supervisor-approval-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import {
  Table as UITable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, Eye, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Clock, CheckCircle2,
  XCircle, CircleDot, Send, ChefHat, Bell, UtensilsCrossed, CreditCard, Ban, Receipt, Printer, RotateCcw,
} from "lucide-react";
import type { Order, OrderItem, Table } from "@shared/schema";
import { useOutletTimezone, formatLocal } from "@/hooks/use-outlet-timezone";

type OrderWithItems = Order & { items?: OrderItem[] };

const statusColors: Record<string, string> = {
  new: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  sent_to_kitchen: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  served: "bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-200",
  ready_to_pay: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  voided: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const statusIcons: Record<string, React.ElementType> = {
  new: CircleDot,
  sent_to_kitchen: Send,
  in_progress: ChefHat,
  ready: Bell,
  served: UtensilsCrossed,
  ready_to_pay: Receipt,
  paid: CreditCard,
  completed: CheckCircle2,
  cancelled: XCircle,
  voided: Ban,
};

const NEXT_STATUS: Record<string, string | null> = {
  new: "sent_to_kitchen",
  sent_to_kitchen: "in_progress",
  in_progress: "ready",
  ready: "served",
  served: "ready_to_pay",
  ready_to_pay: "paid",
  paid: null,
  completed: null,
  cancelled: null,
  voided: null,
};

export default function OrdersPage() {
  const { t: tc } = useTranslation("common");
  const { t: to } = useTranslation("orders");
  const { user } = useAuth();
  const outletTimezone = useOutletTimezone();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isManagerOrOwner = user?.role === "owner" || user?.role === "manager";

  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: string | number | null) => {
    if (val == null) return sharedFormatCurrency(0, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });
    return sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });
  };

  const statusLabels: Record<string, string> = {
    new: to("statusNew"),
    sent_to_kitchen: to("statusSentToKitchen"),
    in_progress: to("statusInProgress"),
    ready: to("statusReady"),
    served: to("statusServed"),
    ready_to_pay: to("statusReadyToPay"),
    paid: to("statusPaid"),
    completed: to("statusCompleted"),
    cancelled: to("statusCancelled"),
    voided: to("statusVoided"),
  };

  const typeLabels: Record<string, string> = {
    dine_in: to("dineIn"),
    takeaway: to("takeaway"),
    delivery: to("delivery"),
  };

  const STATUS_OPTIONS = [
    { value: "all", label: to("allStatuses") },
    { value: "new", label: to("statusNew") },
    { value: "sent_to_kitchen", label: to("statusSentToKitchen") },
    { value: "in_progress", label: to("statusInProgress") },
    { value: "ready", label: to("statusReady") },
    { value: "served", label: to("statusServed") },
    { value: "ready_to_pay", label: to("statusReadyToPay") },
    { value: "paid", label: to("statusPaid") },
    { value: "completed", label: to("statusCompleted") },
    { value: "cancelled", label: to("statusCancelled") },
    { value: "voided", label: to("statusVoided") },
  ];

  const ORDER_TYPE_OPTIONS = [
    { value: "all", label: to("allTypes") },
    { value: "dine_in", label: to("dineIn") },
    { value: "takeaway", label: to("takeaway") },
    { value: "delivery", label: to("delivery") },
  ];

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<"createdAt" | "total">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [, navigate] = useLocation();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [supervisorDialog, setSupervisorDialog] = useState<{ open: boolean; orderId: string; action: string; version?: number } | null>(null);
  const [versionConflictOpen, setVersionConflictOpen] = useState(false);
  const [ordersPage, setOrdersPage] = useState(0);
  const [tableChangeConfirm, setTableChangeConfirm] = useState<{ orderId: string; oldTableId: string | null; newTableId: string; version: number } | null>(null);
  const [showTableMoveSelect, setShowTableMoveSelect] = useState(false);
  const ORDERS_LIMIT = 50;

  const { data: ordersRes, isLoading } = useQuery<{ data: Order[]; total: number; limit: number; offset: number }>({
    queryKey: ["/api/orders", ordersPage],
    queryFn: async () => {
      const res = await fetch(`/api/orders?limit=${ORDERS_LIMIT}&offset=${ordersPage * ORDERS_LIMIT}`, { credentials: "include" });
      return res.json();
    },
  });
  const orders = ordersRes?.data ?? [];
  const ordersTotal = ordersRes?.total ?? 0;
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
    mutationFn: async ({ id, status, paymentMethod: pm, supervisorOverride, version }: { id: string; status: string; paymentMethod?: string; supervisorOverride?: { username: string; password: string; otpApprovalToken?: string }; version?: number }) => {
      const body: Record<string, unknown> = { status };
      if (pm) body.paymentMethod = pm;
      if (supervisorOverride) body.supervisorOverride = supervisorOverride;
      if (version !== undefined && version !== null) body.version = version;
      const res = await apiRequest("PATCH", `/api/orders/${id}`, body);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Request failed" }));
        if (res.status === 409 && data.code === "VERSION_CONFLICT") {
          throw Object.assign(new Error(data.message), { isVersionConflict: true });
        }
        if (res.status === 403 && data.requiresSupervisor) {
          throw Object.assign(new Error(data.message), { requiresSupervisor: true, action: data.action, orderId: id, version });
        }
        throw new Error(data.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      if (selectedOrderId) queryClient.invalidateQueries({ queryKey: ["/api/orders", selectedOrderId] });
      toast({ title: to("orderStatusUpdated") });
    },
    onError: (err: unknown) => {
      const error = err as Error & { requiresSupervisor?: boolean; action?: string; orderId?: string; isVersionConflict?: boolean; version?: number };
      if (error.isVersionConflict) {
        setVersionConflictOpen(true);
        return;
      }
      if (error.requiresSupervisor && error.orderId) {
        setSupervisorDialog({ open: true, orderId: error.orderId, action: error.action || "void_order", version: error.version });
        return;
      }
      toast({ variant: "destructive", title: to("failedToUpdate"), description: error.message });
    },
  });

  const changeTableMutation = useMutation({
    mutationFn: async ({ orderId, tableId, version }: { orderId: string; tableId: string; version: number }) => {
      const res = await apiRequest("PATCH", `/api/orders/${orderId}`, { tableId, version });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      if (selectedOrderId) queryClient.invalidateQueries({ queryKey: ["/api/orders", selectedOrderId] });
      setTableChangeConfirm(null);
      setShowTableMoveSelect(false);
      toast({ title: to("tableUpdated"), description: to("orderMovedToNewTable") });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: to("failedToMoveTable"), description: err.message });
    },
  });

  const handleSupervisorApproved = useCallback((_supervisorId: string, credentials: { username: string; password: string; otpApprovalToken?: string }) => {
    if (supervisorDialog) {
      updateStatusMutation.mutate({
        id: supervisorDialog.orderId,
        status: "voided",
        supervisorOverride: credentials,
        version: supervisorDialog.version,
      });
    }
    setSupervisorDialog(null);
  }, [supervisorDialog, updateStatusMutation]);

  const tableMap = useMemo(() => {
    const map: Record<string, string> = {};
    tables.forEach((t) => { map[t.id] = `${to("table")} ${t.number}`; });
    return map;
  }, [tables, to]);

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
    navigate(`/pos/bill/${orderId}`);
  };

  const SERVICE_CHARGE_RATE = Number(tenantData?.serviceCharge || 0) / 100;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageTitle title={tc("orders")} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold" data-testid="text-orders-title">{tc("nav.onlineOrders")}</h1>
          <p className="text-muted-foreground text-sm">{tc("manageAndTrackOrders")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: "total", icon: ClipboardList, label: to("statTotal"), value: summaryStats.total, color: "primary", testId: "stat-total-orders" },
          { key: "active", icon: Clock, label: to("statActive"), value: summaryStats.active, color: "blue", testId: "stat-active-orders" },
          { key: "readyToPay", icon: Receipt, label: to("statusReadyToPay"), value: summaryStats.readyToPay, color: "amber", testId: "stat-ready-to-pay" },
          { key: "completed", icon: CheckCircle2, label: to("statCompleted"), value: summaryStats.completed, color: "green", testId: "stat-completed-orders" },
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
          <CardTitle className="text-lg flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /> {tc("filters")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input data-testid="input-search-orders" placeholder={to("searchOrders")} className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status-filter"><SelectValue placeholder={to("orderStatus")} /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} data-testid={`option-status-${opt.value}`}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger data-testid="select-type-filter"><SelectValue placeholder={to("orderType")} /></SelectTrigger>
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
            <div className="p-8 text-center text-muted-foreground" data-testid="text-loading">{to("loadingOrders")}</div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground" data-testid="text-no-orders">{to("noOrdersFound")}</div>
          ) : (
            <div className="overflow-x-auto">
              <UITable>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">{to("orderId")}</TableHead>
                    <TableHead>{to("orderType")}</TableHead>
                    <TableHead>{to("table")}</TableHead>
                    <TableHead>{to("orderStatus")}</TableHead>
                    <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("total")}>
                      {tc("total")} <SortIcon field="total" />
                    </TableHead>
                    <TableHead>{tc("payment")}</TableHead>
                    <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("createdAt")}>
                      {tc("date")} <SortIcon field="createdAt" />
                    </TableHead>
                    <TableHead className="w-[140px]">{tc("actions")}</TableHead>
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
                        <TableCell className="text-sm text-muted-foreground" data-testid={`text-date-${order.id}`}>{formatLocal(order.createdAt, outletTimezone, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</TableCell>
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
                              <Button variant="outline" size="sm" onClick={() => updateStatusMutation.mutate({ id: order.id, status: NEXT_STATUS[order.status || "new"]!, version: order.version ?? undefined })} disabled={updateStatusMutation.isPending} data-testid={`button-advance-status-${order.id}`} className="hover:scale-110 transition-transform">
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
          {ordersTotal > ORDERS_LIMIT && (
            <div className="flex items-center justify-between px-4 py-3 border-t" data-testid="pagination-controls-orders">
              <p className="text-sm text-muted-foreground">
                {to("showingRange", { from: ordersPage * ORDERS_LIMIT + 1, to: Math.min((ordersPage + 1) * ORDERS_LIMIT, ordersTotal), total: ordersTotal })}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setOrdersPage((p) => Math.max(0, p - 1))} disabled={ordersPage === 0} data-testid="button-prev-page-orders">
                  <ChevronLeft className="h-4 w-4" />
                  {tc("previous")}
                </Button>
                <span className="text-sm font-medium px-2" data-testid="text-page-orders">{to("pageNum", { num: ordersPage + 1 })}</span>
                <Button variant="outline" size="sm" onClick={() => setOrdersPage((p) => p + 1)} disabled={(ordersPage + 1) * ORDERS_LIMIT >= ordersTotal} data-testid="button-next-page-orders">
                  {tc("next")}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedOrderId} onOpenChange={(open) => !open && setSelectedOrderId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-order-detail-title">{to("orderHash", { id: selectedOrderDetail?.id?.slice(-6).toUpperCase() || "" })}</DialogTitle>
            <DialogDescription>{to("viewOrderDetails")}</DialogDescription>
          </DialogHeader>
          {selectedOrderDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">{to("orderStatus")}</p>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[selectedOrderDetail.status || "new"]}`} data-testid="badge-detail-status">
                    {(() => { const SI = statusIcons[selectedOrderDetail.status || "new"] || CircleDot; return <SI className="h-3 w-3" />; })()}
                    {statusLabels[selectedOrderDetail.status || "new"]}
                  </span>
                </div>
                <div>
                  <p className="text-muted-foreground">{to("orderType")}</p>
                  <p className="font-medium" data-testid="text-detail-type">{typeLabels[selectedOrderDetail.orderType || "dine_in"]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{to("table")}</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium" data-testid="text-detail-table">{selectedOrderDetail.tableId ? tableMap[selectedOrderDetail.tableId] || "—" : "—"}</p>
                    {selectedOrderDetail.orderType === "dine_in" && !["paid","voided","cancelled","completed"].includes(selectedOrderDetail.status || "") && (
                      <button
                        className="text-xs text-primary underline hover:no-underline"
                        data-testid="button-move-table-orders"
                        onClick={() => setShowTableMoveSelect(v => !v)}
                      >
                        {to("move")}
                      </button>
                    )}
                  </div>
                  {showTableMoveSelect && (
                    <Select
                      onValueChange={(newTableId) => {
                        if (!selectedOrderDetail.tableId || selectedOrderDetail.tableId === newTableId) {
                          setShowTableMoveSelect(false);
                          return;
                        }
                        const sentStatuses = ["sent_to_kitchen","in_progress","ready","served","ready_to_pay"];
                        const isSent = sentStatuses.includes(selectedOrderDetail.status || "");
                        const orderVersion = selectedOrderDetail.version ?? 0;
                        if (isSent) {
                          setTableChangeConfirm({
                            orderId: selectedOrderDetail.id,
                            oldTableId: selectedOrderDetail.tableId || null,
                            newTableId,
                            version: orderVersion,
                          });
                        } else {
                          changeTableMutation.mutate({
                            orderId: selectedOrderDetail.id,
                            tableId: newTableId,
                            version: orderVersion,
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs w-36 mt-1" data-testid="select-move-table-orders">
                        <SelectValue placeholder={to("selectTable")} />
                      </SelectTrigger>
                      <SelectContent>
                        {tables.filter(t => t.status === "free" || t.id === selectedOrderDetail.tableId).map(t => (
                          <SelectItem key={t.id} value={t.id} data-testid={`option-table-${t.id}`}>
                            {to("table")} {t.number} {t.zone ? `(${t.zone})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">{tc("date")}</p>
                  <p className="font-medium" data-testid="text-detail-date">{formatLocal(selectedOrderDetail.createdAt, outletTimezone)}</p>
                </div>
                {selectedOrderDetail.paymentMethod && (
                  <div>
                    <p className="text-muted-foreground">{tc("payment")}</p>
                    <p className="font-medium" data-testid="text-detail-payment">{selectedOrderDetail.paymentMethod}</p>
                  </div>
                )}
                {selectedOrderDetail.notes && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">{tc("notes")}</p>
                    <p className="font-medium" data-testid="text-detail-notes">{selectedOrderDetail.notes}</p>
                  </div>
                )}
              </div>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">{to("items")}</h4>
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
                  <p className="text-sm text-muted-foreground" data-testid="text-no-items">{to("noItems")}</p>
                )}
              </div>
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tc("subtotal")}</span>
                  <span data-testid="text-detail-subtotal">{fmt(selectedOrderDetail.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tc("tax")}</span>
                  <span data-testid="text-detail-tax">{fmt(selectedOrderDetail.tax)}</span>
                </div>
                {Number(selectedOrderDetail.discount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tc("discount")}</span>
                    <span className="text-red-500" data-testid="text-detail-discount">-{fmt(selectedOrderDetail.discount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>{tc("total")}</span>
                  <span data-testid="text-detail-total">{fmt(selectedOrderDetail.total)}</span>
                </div>
              </div>
              {canUpdateStatus && (
                <div className="flex gap-2 pt-2">
                  {selectedOrderDetail.status === "served" && (
                    <Button className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => updateStatusMutation.mutate({ id: selectedOrderDetail.id, status: "ready_to_pay", version: selectedOrderDetail.version })} disabled={updateStatusMutation.isPending} data-testid="button-mark-ready-to-pay">
                      <Receipt className="h-4 w-4 mr-1" /> {to("markReadyToPay")}
                    </Button>
                  )}
                  {selectedOrderDetail.status === "ready_to_pay" && (
                    <Button className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => handleBillPreview(selectedOrderDetail.id)} data-testid="button-view-bill">
                      <Receipt className="h-4 w-4 mr-1" /> {to("viewBillAndSettle")}
                    </Button>
                  )}
                  {NEXT_STATUS[selectedOrderDetail.status || "new"] && selectedOrderDetail.status !== "served" && selectedOrderDetail.status !== "ready_to_pay" && (
                    <Button onClick={() => updateStatusMutation.mutate({ id: selectedOrderDetail.id, status: NEXT_STATUS[selectedOrderDetail.status || "new"]!, version: selectedOrderDetail.version })} disabled={updateStatusMutation.isPending} data-testid="button-advance-detail-status">
                      {to("advanceTo", { status: statusLabels[NEXT_STATUS[selectedOrderDetail.status || "new"]!] })}
                    </Button>
                  )}
                  {(selectedOrderDetail.status === "paid" || selectedOrderDetail.status === "completed") && (
                    <>
                      <Button variant="outline" onClick={() => { setSelectedOrderId(null); navigate(`/pos/bill/${selectedOrderDetail.id}`); }} data-testid="button-view-bill">
                        <Receipt className="h-4 w-4 mr-1" /> {to("viewBillRefund")}
                      </Button>
                      <Button variant="outline" className="gap-1" onClick={async () => {
                        try {
                          await fetch("/api/print/reprint", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ orderId: selectedOrderDetail.id, type: "receipt", isReprint: true, reason: "Manual reprint from order history" }),
                          });
                          toast({ title: to("reprintQueued"), description: to("receiptSentToPrinter") });
                        } catch (e: any) {
                          toast({ title: to("reprintFailed"), description: e.message, variant: "destructive" });
                        }
                      }} data-testid={`button-reprint-receipt-${selectedOrderDetail.id}`}>
                        <Printer className="h-4 w-4" /> {to("reprintReceipt")}
                      </Button>
                    </>
                  )}
                  {selectedOrderDetail.status !== "cancelled" && selectedOrderDetail.status !== "voided" && selectedOrderDetail.status !== "paid" && selectedOrderDetail.status !== "completed" && (
                    <>
                      {isManagerOrOwner && (
                        <Button variant="destructive" onClick={() => { setSelectedOrderId(null); navigate(`/pos/bill/${selectedOrderDetail.id}`); }} data-testid="button-void-order">
                          <Ban className="h-4 w-4 mr-1" /> {to("voidBill")}
                        </Button>
                      )}
                      <Button variant="outline" className="text-destructive border-destructive/50" onClick={() => updateStatusMutation.mutate({ id: selectedOrderDetail.id, status: "cancelled", version: selectedOrderDetail.version })} disabled={updateStatusMutation.isPending} data-testid="button-cancel-order">
                        {to("cancelOrder")}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {supervisorDialog && (
        <SupervisorApprovalDialog
          open={supervisorDialog.open}
          onOpenChange={(open) => !open && setSupervisorDialog(null)}
          action={supervisorDialog.action}
          actionLabel={to("voidOrder")}
          onApproved={handleSupervisorApproved}
        />
      )}

      <Dialog open={!!tableChangeConfirm} onOpenChange={() => setTableChangeConfirm(null)}>
        <DialogContent className="max-w-sm" data-testid="dialog-wrong-table-confirm-orders">
          <DialogHeader>
            <DialogTitle>{to("moveOrderTitle")}</DialogTitle>
            <DialogDescription>
              {to("moveOrderDesc")}
              {tableChangeConfirm && (
                <> {to("movingFrom")} <strong>{tableChangeConfirm.oldTableId ? tableMap[tableChangeConfirm.oldTableId] || tc("unknown") : to("noTable")}</strong> {to("movingTo")}{" "}
                <strong>{tableMap[tableChangeConfirm.newTableId] || tc("unknown")}</strong>. {to("kitchenWontUpdate")}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => { setTableChangeConfirm(null); setShowTableMoveSelect(false); }} data-testid="button-cancel-table-change-orders">{tc("cancel")}</Button>
            <Button
              variant="destructive"
              disabled={changeTableMutation.isPending}
              data-testid="button-confirm-table-change-orders"
              onClick={() => {
                if (tableChangeConfirm) {
                  changeTableMutation.mutate({
                    orderId: tableChangeConfirm.orderId,
                    tableId: tableChangeConfirm.newTableId,
                    version: tableChangeConfirm.version,
                  });
                }
              }}
            >
              {to("moveOrder")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={versionConflictOpen} onOpenChange={() => {}}>
        <AlertDialogContent data-testid="dialog-version-conflict">
          <AlertDialogHeader>
            <AlertDialogTitle>{to("orderUpdatedByOther")}</AlertDialogTitle>
            <AlertDialogDescription>
              {to("orderUpdatedByOtherDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              data-testid="button-refresh-order"
              onClick={() => {
                setVersionConflictOpen(false);
                if (selectedOrderId) queryClient.invalidateQueries({ queryKey: ["/api/orders", selectedOrderId] });
                queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
              }}
            >
              {to("refreshOrder")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
