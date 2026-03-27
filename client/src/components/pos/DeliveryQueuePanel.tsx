import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Truck, Clock, CheckCircle2, XCircle, Send, Package,
  RefreshCw, Layers, ShoppingBag, ChevronDown, ChevronUp,
} from "lucide-react";
import { useEffect } from "react";

const ETA_OPTION_VALUES = [15, 20, 25, 30, 40, 45, 60, 90];

const REJECTION_REASON_KEYS = [
  "outOfStockItems",
  "kitchenAtFullCapacity",
  "tooFarFromDeliveryZone",
  "deliveryPartnerUnavailable",
  "restaurantClosingSoon",
  "invalidOrderDetails",
  "other",
] as const;

interface DeliveryOrderItem {
  id: string;
  name: string;
  quantity: number | null;
  price: string;
}

interface DeliveryChannelData {
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
}

interface DeliveryQueueOrder {
  id: string;
  status: string;
  orderType: string;
  total: string | null;
  subtotal: string | null;
  channelOrderId: string | null;
  channelData: DeliveryChannelData | null;
  channel: string | null;
  createdAt: string | null;
  estimatedReadyAt: string | null;
  queueType: "pending" | "active";
  version: number;
  items: DeliveryOrderItem[];
}

const CHANNEL_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  swiggy:     { label: "Swiggy",     bg: "bg-orange-100", text: "text-orange-700" },
  zomato:     { label: "Zomato",     bg: "bg-red-100",    text: "text-red-700" },
  ubereats:   { label: "Uber Eats",  bg: "bg-green-100",  text: "text-green-700" },
  online:     { label: "Online",     bg: "bg-blue-100",   text: "text-blue-700" },
  aggregator: { label: "Aggregator", bg: "bg-purple-100", text: "text-purple-700" },
};

function getChannelStyle(channel: string | null, deliveryFallback: string) {
  return CHANNEL_STYLES[channel ?? ""] ?? { label: channel || deliveryFallback, bg: "bg-slate-100", text: "text-slate-700" };
}

const COUNTDOWN_READY_SENTINEL = "__READY__";

function useCountdown(target: string | null): string {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    if (!target) { setDisplay(""); return; }
    const update = () => {
      const ms = new Date(target).getTime() - Date.now();
      if (ms <= 0) { setDisplay(COUNTDOWN_READY_SENTINEL); return; }
      const totalSec = Math.floor(ms / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      setDisplay(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [target]);

  return display;
}

function CountdownBadge({ estimatedReadyAt }: { estimatedReadyAt: string | null }) {
  const { t } = useTranslation("pos");
  const display = useCountdown(estimatedReadyAt);
  if (!display) return null;
  const isReady = display === COUNTDOWN_READY_SENTINEL;
  return (
    <Badge className={`gap-1 text-xs ${isReady ? "bg-green-600 text-white" : "bg-amber-100 text-amber-800"}`} data-testid="badge-delivery-countdown">
      <Clock className="h-3 w-3" />
      {isReady ? t("ready") : display}
    </Badge>
  );
}

interface DeliveryQueuePanelProps {
  open: boolean;
  onClose: () => void;
}

export default function DeliveryQueuePanel({ open, onClose }: DeliveryQueuePanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation("pos");
  const queryClient = useQueryClient();
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);
  const [etaMinutes, setEtaMinutes] = useState("30");
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const REJECTION_REASONS = REJECTION_REASON_KEYS.map(k => ({ key: k, label: t(k) }));
  const [rejectionReason, setRejectionReason] = useState<string>(REJECTION_REASON_KEYS[0]);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) =>
    sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });

  const { data: orders = [], refetch } = useQuery<DeliveryQueueOrder[]>({
    queryKey: ["/api/orders/delivery-queue"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/orders/delivery-queue");
      return res.json();
    },
    refetchInterval: 15000,
    enabled: open,
  });

  useRealtimeEvent("order:delivery_accepted", () => refetch());
  useRealtimeEvent("order:delivery_rejected", () => refetch());
  useRealtimeEvent("order:delivery_dispatched", () => refetch());
  useRealtimeEvent("order:new", () => refetch());

  const pendingOrders = orders.filter(o => o.queueType === "pending");
  const activeOrders = orders.filter(o => o.queueType === "active");

  const acceptMutation = useMutation({
    mutationFn: async ({ orderId, etaMin, version }: { orderId: string; etaMin: number; version: number }) => {
      const res = await apiRequest("PATCH", `/api/orders/${orderId}/accept-delivery`, { etaMinutes: etaMin, version });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Request failed" }));
        if (res.status === 409) { refetch(); throw new Error("Order was modified by someone else. Refreshing queue…"); }
        throw new Error(data.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setAcceptingOrderId(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/orders/delivery-queue"] });
      toast({ title: t("orderAccepted"), description: t("etaSetTo", { minutes: etaMinutes }) });
    },
    onError: (e: Error) => toast({ title: t("error", { ns: "common" }), description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ orderId, reason, version }: { orderId: string; reason: string; version: number }) => {
      const res = await apiRequest("PATCH", `/api/orders/${orderId}/reject-delivery`, { rejectionReason: reason, version });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Request failed" }));
        if (res.status === 409) { refetch(); throw new Error("Order was modified by someone else. Refreshing queue…"); }
        throw new Error(data.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setRejectingOrderId(null);
      refetch();
      toast({ title: t("orderRejected"), variant: "destructive" });
    },
    onError: (e: Error) => toast({ title: t("error", { ns: "common" }), description: e.message, variant: "destructive" }),
  });

  const dispatchMutation = useMutation({
    mutationFn: async ({ orderId, version }: { orderId: string; version: number }) => {
      const res = await apiRequest("PATCH", `/api/orders/${orderId}/dispatch-delivery`, { version });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Request failed" }));
        if (res.status === 409) { refetch(); throw new Error("Order was modified by someone else. Refreshing queue…"); }
        throw new Error(data.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: t("orderDispatched") });
    },
    onError: (e: Error) => toast({ title: t("error", { ns: "common" }), description: e.message, variant: "destructive" }),
  });

  const toggleExpanded = useCallback((orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  const formatTime = (iso: string | null) => {
    if (!iso) return "–";
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const OrderCard = useCallback(({ order }: { order: DeliveryQueueOrder }) => {
    const customerName = order.channelData?.customerName || t("customer", { ns: "pos" });
    const channelId = order.channelOrderId || order.id.slice(-6).toUpperCase();
    const isPending = order.queueType === "pending";
    const isReady = order.status === "ready";
    const channelStyle = getChannelStyle(order.channel, t("channelDeliveryFallback"));
    const isExpanded = expandedOrders.has(order.id);
    const visibleItems = isExpanded ? order.items : order.items.slice(0, 3);
    const hasMore = order.items.length > 3;

    return (
      <Card className={`border-l-4 ${isPending ? "border-l-orange-400" : isReady ? "border-l-green-500" : "border-l-blue-400"}`}
        data-testid={`delivery-order-card-${order.id}`}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono" data-testid={`badge-order-id-${order.id}`}>
                  #{channelId}
                </Badge>
                <Badge className={`text-[10px] px-1.5 py-0 ${channelStyle.bg} ${channelStyle.text} border-0`} data-testid={`badge-channel-${order.id}`}>
                  <ShoppingBag className="h-2.5 w-2.5 mr-0.5" />
                  {channelStyle.label}
                </Badge>
                {!isPending && <CountdownBadge estimatedReadyAt={order.estimatedReadyAt} />}
              </div>
              <p className="text-sm font-medium mt-1 truncate" data-testid={`text-customer-${order.id}`}>{customerName}</p>
              <p className="text-xs text-muted-foreground">{formatTime(order.createdAt)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold" data-testid={`text-total-${order.id}`}>{fmt(order.total || 0)}</p>
              <p className="text-xs text-muted-foreground">{order.items.length} item{order.items.length !== 1 ? "s" : ""}</p>
            </div>
          </div>

          <div className="space-y-0.5">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate">{item.quantity}× {item.name}</span>
                <span>{fmt(parseFloat(item.price) * (item.quantity || 1))}</span>
              </div>
            ))}
            {hasMore && (
              <button
                className="flex items-center gap-0.5 text-xs text-primary hover:underline mt-0.5"
                onClick={() => toggleExpanded(order.id)}
                data-testid={`button-toggle-items-${order.id}`}
              >
                {isExpanded ? (
                  <><ChevronUp className="h-3 w-3" />{t("showLess")}</>
                ) : (
                  <><ChevronDown className="h-3 w-3" />{t("moreItems", { count: order.items.length - 3 })}</>
                )}
              </button>
            )}
          </div>

          {isPending ? (
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="flex-1 h-8 bg-green-600 hover:bg-green-700 text-white gap-1 text-xs"
                onClick={() => { setAcceptingOrderId(order.id); setEtaMinutes("30"); }}
                data-testid={`button-accept-${order.id}`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("accept")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1 h-8 gap-1 text-xs"
                onClick={() => { setRejectingOrderId(order.id); setRejectionReason(REJECTION_REASON_KEYS[0]); }}
                data-testid={`button-reject-${order.id}`}
              >
                <XCircle className="h-3.5 w-3.5" />
                {t("reject")}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="w-full h-8 gap-1 text-xs"
              variant={isReady ? "default" : "outline"}
              disabled={dispatchMutation.isPending}
              onClick={() => dispatchMutation.mutate({ orderId: order.id, version: order.version })}
              data-testid={`button-dispatch-${order.id}`}
            >
              <Send className="h-3.5 w-3.5" />
              {t("markDispatched")}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }, [fmt, dispatchMutation, expandedOrders, toggleExpanded]);

  const acceptingOrder = orders.find(o => o.id === acceptingOrderId);
  const rejectingOrder = orders.find(o => o.id === rejectingOrderId);

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2" data-testid="delivery-queue-title">
                <Truck className="h-5 w-5 text-orange-500" />
                {t("deliveryQueueTitle")}
                {pendingOrders.length > 0 && (
                  <Badge className="bg-orange-500 text-white text-xs animate-bounce" data-testid="badge-pending-count">
                    {pendingOrders.length} {t("newBadge")}
                  </Badge>
                )}
              </SheetTitle>
              <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-8 w-8" data-testid="button-refresh-queue" aria-label="Refresh delivery queue">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-hidden">
            <Tabs defaultValue="pending" className="h-full flex flex-col">
              <TabsList className="mx-4 mt-3 mb-2">
                <TabsTrigger value="pending" className="flex-1 gap-1" data-testid="tab-pending-orders">
                  <Package className="h-3.5 w-3.5" />
                  {t("pending", { ns: "common" })}
                  {pendingOrders.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">{pendingOrders.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="active" className="flex-1 gap-1" data-testid="tab-active-orders">
                  <Truck className="h-3.5 w-3.5" />
                  {t("active", { ns: "common" })}
                  {activeOrders.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">{activeOrders.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="flex-1 overflow-y-auto px-4 pb-4 mt-0 space-y-3" data-testid="panel-pending-orders">
                {pendingOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground" data-testid="empty-pending-queue">
                    <Layers className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">{t("noPendingOrders")}</p>
                    <p className="text-xs mt-1">{t("newDeliveryOrdersHint")}</p>
                  </div>
                ) : (
                  pendingOrders.map(order => <OrderCard key={order.id} order={order} />)
                )}
              </TabsContent>

              <TabsContent value="active" className="flex-1 overflow-y-auto px-4 pb-4 mt-0 space-y-3" data-testid="panel-active-orders">
                {activeOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground" data-testid="empty-active-queue">
                    <Truck className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">{t("noActiveDeliveries")}</p>
                    <p className="text-xs mt-1">{t("acceptedOrdersHint")}</p>
                  </div>
                ) : (
                  activeOrders.map(order => <OrderCard key={order.id} order={order} />)
                )}
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!acceptingOrderId} onOpenChange={(v) => !v && setAcceptingOrderId(null)}>
        <DialogContent className="max-w-xs" data-testid="dialog-accept-delivery">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              {t("acceptOrder")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("setEstimatedReadyTimeFor")}{" "}
              <span className="font-medium text-foreground">
                #{acceptingOrder?.channelOrderId || acceptingOrder?.id.slice(-6).toUpperCase()}
              </span>
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("etaMinutes")}</label>
              <Select value={etaMinutes} onValueChange={setEtaMinutes} data-testid="select-eta">
                <SelectTrigger data-testid="select-trigger-eta">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ETA_OPTION_VALUES.map(val => (
                    <SelectItem key={val} value={String(val)} data-testid={`eta-option-${val}`}>
                      {val} {t("etaMinSuffix")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAcceptingOrderId(null)} data-testid="button-cancel-accept">
              {t("cancel", { ns: "common" })}
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={acceptMutation.isPending}
              onClick={() => acceptingOrderId && acceptMutation.mutate({ orderId: acceptingOrderId, etaMin: parseInt(etaMinutes), version: acceptingOrder?.version ?? 1 })}
              data-testid="button-confirm-accept"
            >
              {acceptMutation.isPending ? t("acceptingOrder") : t("confirmAccept")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectingOrderId} onOpenChange={(v) => !v && setRejectingOrderId(null)}>
        <DialogContent className="max-w-xs" data-testid="dialog-reject-delivery">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              {t("rejectOrder")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("rejectingOrder")}{" "}
              <span className="font-medium text-foreground">
                #{rejectingOrder?.channelOrderId || rejectingOrder?.id.slice(-6).toUpperCase()}
              </span>
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("rejectionReasonLabel")}</label>
              <Select value={rejectionReason} onValueChange={setRejectionReason} data-testid="select-rejection-reason">
                <SelectTrigger data-testid="select-trigger-rejection-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map(reason => (
                    <SelectItem key={reason.key} value={reason.key} data-testid={`rejection-reason-${reason.key}`}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectingOrderId(null)} data-testid="button-cancel-reject">
              {t("cancel", { ns: "common" })}
            </Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending}
              onClick={() => rejectingOrderId && rejectMutation.mutate({ orderId: rejectingOrderId, reason: rejectionReason, version: rejectingOrder?.version ?? 1 })}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? t("rejectingOrder") : t("confirmReject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ChannelConfig {
  id: string;
  enabled: boolean;
}

export function DeliveryQueueButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("pos");
  const { data: channelConfigs = [] } = useQuery<ChannelConfig[]>({
    queryKey: ["/api/channel-configs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/channel-configs");
      return res.json();
    },
    staleTime: 60000,
  });

  const hasActiveChannels = channelConfigs.some(c => c.enabled);

  const { data: orders = [] } = useQuery<DeliveryQueueOrder[]>({
    queryKey: ["/api/orders/delivery-queue"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/orders/delivery-queue");
      return res.json();
    },
    refetchInterval: 15000,
    enabled: hasActiveChannels,
  });

  if (!hasActiveChannels) return null;

  const pendingCount = orders.filter(o => o.queueType === "pending").length;

  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-card hover:bg-muted transition-colors"
      data-testid="button-delivery-queue"
    >
      <Truck className="h-3.5 w-3.5 text-orange-500" />
      <span className="hidden sm:inline text-muted-foreground">{t("deliveryTabLabel")}</span>
      {pendingCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white animate-bounce"
          data-testid="badge-delivery-pending-count">
          {pendingCount}
        </span>
      )}
    </button>
  );
}
