import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { PageTitle } from "@/lib/accessibility";
import { useAuth } from "@/lib/auth";
import { formatCurrency, type FormatCurrencyOptions } from "@shared/currency";
import { motion } from "framer-motion";
import {
  Truck, Package, MapPin, Phone, Clock, User, Plus,
  ChevronRight, CheckCircle, AlertCircle, XCircle,
  Settings, ToggleLeft, ToggleRight, Zap, Timer,
  UserCheck, Send, LayoutGrid, List, MoreVertical,
} from "lucide-react";
import { ListCardSkeleton } from "@/components/ui/skeletons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface DeliveryOrder {
  id: string;
  tenantId: string;
  orderId: string | null;
  customerId: string | null;
  customerAddress: string;
  customerPhone: string | null;
  deliveryPartner: string | null;
  driverName: string | null;
  driverPhone: string | null;
  status: string | null;
  estimatedTime: number | null;
  actualTime: number | null;
  deliveryFee: string | null;
  trackingNotes: string | null;
  createdAt: string | null;
  deliveredAt: string | null;
}

interface CustomerData {
  id: string;
  name: string;
  phone: string | null;
}

interface DeliveryAgent {
  id: string;
  name: string;
  phone: string;
  status: "available" | "busy" | "offline";
  currentAssignment: string | null;
}

type DeliveryStatus = "pending" | "assigned" | "picked_up" | "in_transit" | "delivered" | "cancelled" | "returned";

const statusConfig: Record<DeliveryStatus, { label: string; color: string; icon: typeof Package }> = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-700", icon: Clock },
  assigned: { label: "Assigned", color: "bg-blue-100 text-blue-700", icon: User },
  picked_up: { label: "Picked Up", color: "bg-indigo-100 text-indigo-700", icon: Package },
  in_transit: { label: "In Transit", color: "bg-amber-100 text-amber-700", icon: Truck },
  delivered: { label: "Delivered", color: "bg-green-100 text-green-700", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", icon: XCircle },
  returned: { label: "Returned", color: "bg-orange-100 text-orange-700", icon: AlertCircle },
};

const statusFlow: DeliveryStatus[] = ["pending", "assigned", "picked_up", "in_transit", "delivered"];

const KANBAN_COLUMNS = [
  {
    key: "preparing",
    label: "Preparing",
    subtitle: "Kitchen working",
    statuses: ["pending"] as DeliveryStatus[],
    colorClass: "border-t-amber-400",
    badgeColor: "bg-amber-100 text-amber-700",
  },
  {
    key: "ready",
    label: "Ready to Go",
    subtitle: "Awaiting agent",
    statuses: ["assigned", "picked_up"] as DeliveryStatus[],
    colorClass: "border-t-blue-400",
    badgeColor: "bg-blue-100 text-blue-700",
  },
  {
    key: "out",
    label: "Out for Delivery",
    subtitle: "Dispatched",
    statuses: ["in_transit"] as DeliveryStatus[],
    colorClass: "border-t-purple-400",
    badgeColor: "bg-purple-100 text-purple-700",
  },
];

interface TenantConfig {
  moduleConfig?: {
    deliveryEnabled?: boolean;
  };
}

const DELIVERY_STALE_HOURS = 24;

function getElapsedMinutes(createdAt: string | null) {
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function isDeliveryStale(createdAt: string | null): boolean {
  if (!createdAt) return false;
  return (Date.now() - new Date(createdAt).getTime()) > DELIVERY_STALE_HOURS * 60 * 60 * 1000;
}

function formatDeliveryElapsed(createdAt: string | null): string {
  if (!createdAt) return "0min";
  if (isDeliveryStale(createdAt)) return "stale";
  return `${getElapsedMinutes(createdAt)}min`;
}

function platformIcon(partner: string | null) {
  if (!partner) return "🔵";
  const p = partner.toLowerCase();
  if (p.includes("zomato")) return "🔴";
  if (p.includes("swiggy")) return "🟠";
  if (p.includes("phone") || p.includes("call")) return "📞";
  return "🔵";
}

export default function DeliveryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation("common");
  const currency = user?.tenant?.currency || "USD";
  const currencyOpts: FormatCurrencyOptions = {
    position: (user?.tenant?.currencyPosition || "before") as "before" | "after",
    decimals: user?.tenant?.currencyDecimals ?? 2,
  };
  const fmt = (val: string | number) => formatCurrency(val, currency, currencyOpts);

  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOrder | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    price: string | number;
    modifiers?: unknown;
    notes?: string | null;
  }

  function renderModifiers(modifiers: unknown): string | null {
    if (!modifiers) return null;
    if (typeof modifiers === "string") return modifiers || null;
    if (Array.isArray(modifiers)) {
      const parts = modifiers
        .map((m: unknown) => {
          if (!m) return null;
          if (typeof m === "string") return m;
          const mod = m as Record<string, unknown>;
          return mod.name ? String(mod.name) : null;
        })
        .filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : null;
    }
    if (typeof modifiers === "object") {
      const mod = modifiers as Record<string, unknown>;
      return mod.name ? String(mod.name) : JSON.stringify(modifiers);
    }
    return null;
  }

  const { data: selectedOrderDetail } = useQuery<{ items: OrderItem[] }>({
    queryKey: ["/api/orders", selectedDelivery?.orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${selectedDelivery!.orderId}`, { credentials: "include" });
      if (!res.ok) return { items: [] };
      return res.json();
    },
    enabled: !!selectedDelivery?.orderId && showDetailDialog,
  });
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [assigningDelivery, setAssigningDelivery] = useState<DeliveryOrder | null>(null);

  const { data: tenantConfig } = useQuery<TenantConfig>({
    queryKey: ["/api/tenant"],
  });

  const deliveryEnabled = tenantConfig?.moduleConfig?.deliveryEnabled === true;

  const toggleDeliveryMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const currentConfig = (tenantConfig?.moduleConfig || {}) as Record<string, unknown>;
      const res = await apiRequest("PATCH", "/api/tenant", {
        moduleConfig: { ...currentConfig, deliveryEnabled: enabled },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (err: Error) => {
      toast({ title: t("error"), description: err.message, variant: "destructive" });
    },
  });

  const { data: deliveriesRes, isLoading } = useQuery<{ data: DeliveryOrder[]; total: number }>({
    queryKey: ["/api/delivery-orders"],
    enabled: deliveryEnabled,
    refetchInterval: 30000,
  });
  const deliveries = deliveriesRes?.data ?? [];

  const { data: customersRes } = useQuery<{ data: CustomerData[]; total: number }>({
    queryKey: ["/api/customers"],
    enabled: deliveryEnabled,
  });
  const customers = customersRes?.data ?? [];

  const { data: agents = [] } = useQuery<DeliveryAgent[]>({
    queryKey: ["/api/delivery-agents"],
    enabled: deliveryEnabled,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/delivery-orders/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
      toast({ title: t("deliveryUpdated") });
    },
    onError: (err: Error) => {
      toast({ title: t("error"), description: err.message, variant: "destructive" });
    },
  });

  const assignAgentMutation = useMutation({
    mutationFn: async ({ deliveryId, agentId }: { deliveryId: string; agentId: string }) => {
      const agent = agents.find((a) => a.id === agentId);
      const res = await apiRequest("PATCH", `/api/delivery-orders/${deliveryId}/assign-agent`, {
        agentId,
        agentName: agent?.name,
        agentPhone: agent?.phone,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
      setShowAgentDialog(false);
      setSelectedAgent("");
      setAssigningDelivery(null);
      toast({ title: t("agentAssigned") });
    },
    onError: (err: Error) => {
      toast({ title: t("error"), description: err.message, variant: "destructive" });
    },
  });

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const filteredDeliveries = deliveries.filter((d) =>
    filterStatus === "all" || d.status === filterStatus
  );

  const statusCounts = deliveries.reduce<Record<string, number>>((acc, d) => {
    const s = d.status || "pending";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const advanceStatus = (delivery: DeliveryOrder) => {
    const currentIdx = statusFlow.indexOf(delivery.status as DeliveryStatus);
    if (currentIdx >= 0 && currentIdx < statusFlow.length - 1) {
      const nextStatus = statusFlow[currentIdx + 1];
      const updateData: Record<string, unknown> = { status: nextStatus };
      if (nextStatus === "delivered") {
        updateData.deliveredAt = new Date().toISOString();
      }
      updateMutation.mutate({ id: delivery.id, data: updateData });
    }
  };

  const activeDeliveries = deliveries.filter((d) =>
    d.status && !["delivered", "cancelled", "returned"].includes(d.status)
  ).length;

  const deliveredToday = deliveries.filter((d) => {
    if (d.status !== "delivered" || !d.deliveredAt) return false;
    const today = new Date();
    const del = new Date(d.deliveredAt);
    return del.toDateString() === today.toDateString();
  }).length;

  const avgDeliveryTime = (() => {
    const completed = deliveries.filter((d) => d.actualTime != null);
    if (!completed.length) return null;
    const avg = completed.reduce((sum, d) => sum + (d.actualTime || 0), 0) / completed.length;
    return Math.round(avg);
  })();

  if (!deliveryEnabled) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Truck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-delivery-title">
              Delivery Management
            </h1>
            <p className="text-muted-foreground text-sm">Track and manage delivery orders</p>
          </div>
        </div>

        <Card className="max-w-lg mx-auto">
          <CardContent className="py-12 text-center space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto">
              <Truck className="w-10 h-10 text-amber-600" />
            </div>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200" data-testid="badge-under-review">
              Under Review
            </Badge>
            <div>
              <h2 className="text-xl font-bold font-heading mb-2">Delivery Management</h2>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                This module is currently under review and will be available in a future update.
                Delivery management features including order tracking, driver dispatch, real-time status updates, and third-party delivery partner integrations are being finalized.
              </p>
            </div>
            <div className="text-left max-w-xs mx-auto space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Planned Features</p>
              {[
                "Real-time order tracking & driver dispatch",
                "Delivery partner integrations (Zomato, Swiggy)",
                "Automated delivery fee calculation",
                "Driver performance analytics",
                "Customer delivery notifications",
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {feature}
                </div>
              ))}
            </div>
            <div className="border-t pt-4 mt-4">
              <Button
                onClick={() => toggleDeliveryMutation.mutate(true)}
                variant="outline"
                className="gap-2"
                disabled={toggleDeliveryMutation.isPending}
                data-testid="button-enable-delivery"
              >
                <ToggleRight className="w-4 h-4" />
                Enable Delivery Module
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Enable to start managing deliveries
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageTitle title={t("delivery")} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Truck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-delivery-title">
              {t("delivery")}
            </h1>
            <p className="text-muted-foreground text-sm">{t("delivery")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <Button
              variant={viewMode === "kanban" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("kanban")}
              data-testid="button-view-kanban"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => toggleDeliveryMutation.mutate(false)} disabled={toggleDeliveryMutation.isPending} data-testid="button-disable-delivery">
            <ToggleLeft className="w-4 h-4 mr-1" /> Disable Module
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Preparing", value: statusCounts.pending || 0, color: "text-amber-600", testId: "text-kpi-preparing" },
          { label: "Ready to Dispatch", value: (statusCounts.assigned || 0) + (statusCounts.picked_up || 0), color: "text-blue-600", testId: "text-kpi-ready" },
          { label: "Out for Delivery", value: statusCounts.in_transit || 0, color: "text-purple-600", testId: "text-kpi-out" },
          { label: "Delivered Today", value: deliveredToday, color: "text-green-600", testId: "text-kpi-delivered" },
          { label: "Avg Delivery", value: avgDeliveryTime != null ? `${avgDeliveryTime}min` : "—", color: "text-muted-foreground", testId: "text-kpi-avg" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={`text-xl font-bold ${kpi.color}`} data-testid={kpi.testId}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {viewMode === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {KANBAN_COLUMNS.map((col) => {
            const colDeliveries = deliveries.filter((d) =>
              col.statuses.includes((d.status || "pending") as DeliveryStatus)
            );

            return (
              <div key={col.key} className="space-y-3">
                <div className={`border-t-4 ${col.colorClass} rounded-lg bg-muted/30 p-3`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{col.label}</p>
                      <p className="text-xs text-muted-foreground">{col.subtitle}</p>
                    </div>
                    <Badge className={col.badgeColor} data-testid={`badge-col-count-${col.key}`}>
                      {colDeliveries.length}
                    </Badge>
                  </div>
                </div>

                {colDeliveries.length === 0 ? (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground text-sm">
                    No orders
                  </div>
                ) : (
                  colDeliveries.map((delivery) => {
                    const status = (delivery.status || "pending") as DeliveryStatus;
                    const customer = delivery.customerId ? customerMap.get(delivery.customerId) : null;
                    const platform = platformIcon(delivery.deliveryPartner);
                    const isReady = col.key === "ready";
                    const isOut = col.key === "out";

                    return (
                      <Card
                        key={delivery.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => { setSelectedDelivery(delivery); setShowDetailDialog(true); }}
                        data-testid={`card-delivery-${delivery.id}`}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-base">{platform}</span>
                              <div>
                                <p className="font-semibold text-sm">{customer?.name || "Guest"}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {delivery.customerAddress.length > 30
                                    ? delivery.customerAddress.substring(0, 30) + "..."
                                    : delivery.customerAddress}
                                </p>
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => e.stopPropagation()} aria-label="Order actions menu">
                                  <MoreVertical className="w-3 h-3" aria-hidden="true" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {statusFlow.map((s) => (
                                  <DropdownMenuItem
                                    key={s}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const updateData: Record<string, unknown> = { status: s };
                                      if (s === "delivered") updateData.deliveredAt = new Date().toISOString();
                                      updateMutation.mutate({ id: delivery.id, data: updateData });
                                    }}
                                  >
                                    {statusConfig[s].label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className={`flex items-center gap-1 ${isDeliveryStale(delivery.createdAt) ? "text-gray-400 italic" : ""}`}>
                              <Timer className="w-3 h-3" />
                              {formatDeliveryElapsed(delivery.createdAt)} elapsed
                            </span>
                            {delivery.deliveryFee && (
                              <span className="font-medium">{fmt(Number(delivery.deliveryFee))}</span>
                            )}
                          </div>

                          {delivery.driverName && (
                            <p className="text-xs flex items-center gap-1 text-blue-700">
                              <UserCheck className="w-3 h-3" />
                              {delivery.driverName}
                            </p>
                          )}

                          <div className="flex gap-1.5">
                            {col.key === "preparing" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs h-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssigningDelivery(delivery);
                                  setShowAgentDialog(true);
                                }}
                                data-testid={`button-assign-agent-${delivery.id}`}
                              >
                                <UserCheck className="w-3 h-3 mr-1" /> Assign Agent
                              </Button>
                            )}
                            {isReady && (
                              <Button
                                size="sm"
                                className="flex-1 text-xs h-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateMutation.mutate({ id: delivery.id, data: { status: "in_transit" } });
                                }}
                                data-testid={`button-dispatch-${delivery.id}`}
                              >
                                <Send className="w-3 h-3 mr-1" /> Dispatch
                              </Button>
                            )}
                            {isOut && (
                              <Button
                                size="sm"
                                variant="default"
                                className="flex-1 text-xs h-7 bg-green-600 hover:bg-green-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateMutation.mutate({
                                    id: delivery.id,
                                    data: { status: "delivered", deliveredAt: new Date().toISOString() },
                                  });
                                }}
                                data-testid={`button-mark-delivered-${delivery.id}`}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" /> Mark Delivered
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={filterStatus === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("all")}
              data-testid="button-filter-all"
            >
              All ({deliveries.length})
            </Button>
            {Object.entries(statusConfig).map(([key, cfg]) => (
              <Button
                key={key}
                variant={filterStatus === key ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus(key)}
                data-testid={`button-filter-${key}`}
              >
                {cfg.label} ({statusCounts[key] || 0})
              </Button>
            ))}
          </div>

          {isLoading ? (
            <ListCardSkeleton count={4} />
          ) : filteredDeliveries.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="flex flex-col items-center gap-4">
                  <Truck className="w-12 h-12 text-muted-foreground" />
                  <p className="text-muted-foreground" data-testid="text-no-deliveries">
                    {filterStatus !== "all" ? "No delivery orders with this status." : "No delivery orders yet."}
                  </p>
                  {filterStatus !== "all" ? (
                    <Button variant="outline" onClick={() => setFilterStatus("all")} data-testid="button-clear-delivery-filter">
                      Clear Filter
                    </Button>
                  ) : (
                    <Link href="/pos">
                      <Button data-testid="button-go-to-pos-delivery">
                        <Plus className="w-4 h-4 mr-2" />Create Delivery Order
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredDeliveries.map((delivery, idx) => {
                const status = (delivery.status || "pending") as DeliveryStatus;
                const cfg = statusConfig[status] || statusConfig.pending;
                const StatusIcon = cfg.icon;
                const customer = delivery.customerId ? customerMap.get(delivery.customerId) : null;
                const canAdvance = statusFlow.indexOf(status) >= 0 && statusFlow.indexOf(status) < statusFlow.length - 1;
                return (
                  <motion.div
                    key={delivery.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    <Card
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => { setSelectedDelivery(delivery); setShowDetailDialog(true); }}
                      data-testid={`card-delivery-${delivery.id}`}
                    >
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg.color}`}>
                            <StatusIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base">{platformIcon(delivery.deliveryPartner)}</span>
                              <p className="font-semibold">{customer?.name || "Guest"}</p>
                              <Badge className={cfg.color} data-testid={`badge-delivery-status-${delivery.id}`}>
                                {cfg.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {delivery.customerAddress.length > 40
                                  ? delivery.customerAddress.substring(0, 40) + "..."
                                  : delivery.customerAddress}
                              </span>
                              <span className={`flex items-center gap-1 ${isDeliveryStale(delivery.createdAt) ? "text-gray-400 italic" : ""}`}>
                                <Timer className="w-3 h-3" /> {formatDeliveryElapsed(delivery.createdAt)}
                              </span>
                              {delivery.driverName && (
                                <span className="flex items-center gap-1">
                                  <UserCheck className="w-3 h-3" /> {delivery.driverName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {delivery.deliveryFee && (
                            <span className="font-medium text-sm">
                              Fee: {fmt(Number(delivery.deliveryFee))}
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAssigningDelivery(delivery);
                              setShowAgentDialog(true);
                            }}
                            data-testid={`button-assign-list-${delivery.id}`}
                          >
                            <UserCheck className="w-3 h-3 mr-1" /> Assign
                          </Button>
                          {canAdvance && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); advanceStatus(delivery); }}
                              disabled={updateMutation.isPending}
                              data-testid={`button-advance-${delivery.id}`}
                            >
                              Next <ChevronRight className="w-3 h-3 ml-1" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={showAgentDialog} onOpenChange={(open) => { setShowAgentDialog(open); if (!open) { setSelectedAgent(""); setAssigningDelivery(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("assignDeliveryAgent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select an available agent to assign to this delivery order.
            </p>
            <div className="space-y-2">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    selectedAgent === agent.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  } ${agent.status === "offline" ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  onClick={() => agent.status !== "offline" && setSelectedAgent(agent.id)}
                  disabled={agent.status === "offline"}
                  data-testid={`button-select-agent-${agent.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      agent.status === "available" ? "bg-green-500" :
                      agent.status === "busy" ? "bg-amber-500" : "bg-gray-400"
                    }`} />
                    <div className="text-left">
                      <p className="font-medium text-sm">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.phone}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={
                    agent.status === "available" ? "text-green-700 border-green-300" :
                    agent.status === "busy" ? "text-amber-700 border-amber-300" : "text-gray-500"
                  }>
                    {agent.status}
                  </Badge>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={!selectedAgent || assignAgentMutation.isPending}
                onClick={() => {
                  if (assigningDelivery && selectedAgent) {
                    assignAgentMutation.mutate({ deliveryId: assigningDelivery.id, agentId: selectedAgent });
                  }
                }}
                data-testid="button-confirm-assign"
              >
                Assign Agent
              </Button>
              <Button variant="outline" onClick={() => setShowAgentDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deliveryDetails")}</DialogTitle>
          </DialogHeader>
          {selectedDelivery && (() => {
            const status = (selectedDelivery.status || "pending") as DeliveryStatus;
            const cfg = statusConfig[status] || statusConfig.pending;
            const customer = selectedDelivery.customerId ? customerMap.get(selectedDelivery.customerId) : null;

            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{platformIcon(selectedDelivery.deliveryPartner)}</span>
                  <Badge className={`${cfg.color} text-sm`} data-testid="badge-detail-status">
                    {cfg.label}
                  </Badge>
                  {selectedDelivery.deliveryPartner && (
                    <Badge variant="outline">{selectedDelivery.deliveryPartner}</Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p className="font-medium">{customer?.name || "Guest"}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedDelivery.customerPhone || "—"}</p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Delivery Address</p>
                  <p className="font-medium flex items-start gap-1">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                    {selectedDelivery.customerAddress}
                  </p>
                </div>

                {selectedOrderDetail?.items && selectedOrderDetail.items.length > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-2">Order Items</p>
                    <div className="space-y-1" data-testid="list-order-items">
                      {selectedOrderDetail.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm" data-testid={`item-order-${item.id}`}>
                          <div>
                            <span className="font-medium">{item.quantity}× {item.name}</span>
                            {renderModifiers(item.modifiers) && (
                              <p className="text-xs text-muted-foreground">{renderModifiers(item.modifiers)}</p>
                            )}
                            {item.notes && (
                              <p className="text-xs text-muted-foreground italic">{item.notes}</p>
                            )}
                          </div>
                          <span className="text-muted-foreground">{fmt(Number(item.price) * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(selectedDelivery.driverName || selectedDelivery.driverPhone) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Driver</p>
                      <p className="font-medium">{selectedDelivery.driverName || "—"}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Driver Phone</p>
                      <p className="font-medium">{selectedDelivery.driverPhone || "—"}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">Est. Time</p>
                    <p className="font-bold">{selectedDelivery.estimatedTime || "—"} min</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">Actual Time</p>
                    <p className="font-bold">{selectedDelivery.actualTime || "—"} min</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">Fee</p>
                    <p className="font-bold">{fmt(Number(selectedDelivery.deliveryFee || 0))}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Update Status</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {statusFlow.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={selectedDelivery.status === s ? "default" : "outline"}
                        onClick={() => {
                          const updateData: Record<string, unknown> = { status: s };
                          if (s === "delivered") updateData.deliveredAt = new Date().toISOString();
                          updateMutation.mutate({ id: selectedDelivery.id, data: updateData });
                          setSelectedDelivery({ ...selectedDelivery, status: s });
                        }}
                        disabled={updateMutation.isPending}
                        data-testid={`button-set-status-${s}`}
                      >
                        {statusConfig[s].label}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    setShowDetailDialog(false);
                    setAssigningDelivery(selectedDelivery);
                    setShowAgentDialog(true);
                  }}
                  data-testid="button-assign-agent-detail"
                >
                  <UserCheck className="w-4 h-4" /> Assign / Change Agent
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
