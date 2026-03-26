import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Workflow, RefreshCw, MessageSquare, Clock, AlertTriangle,
  TrendingUp, ChevronDown, ChevronUp,
  Utensils,
} from "lucide-react";
import { OrderCard, type CoordinationOrder } from "@/components/coordination/order-card";
import { OrderDetailPanel } from "@/components/coordination/order-detail-panel";
import { ServiceMessagePanel } from "@/components/coordination/service-message-panel";

interface DashboardData {
  summary: {
    avgWaitMin: number;
    targetWaitMin: number;
    tablesOccupied: number;
    tablesTotal: number;
    deliveryPending: number;
    deliveryOut: number;
    alerts: number;
    hour: number;
  };
  columns: {
    received: CoordinationOrder[];
    preparing: CoordinationOrder[];
    ready: CoordinationOrder[];
    served: CoordinationOrder[];
    issues: CoordinationOrder[];
  };
  tables: Array<{
    id: string;
    number: number;
    zone: string;
    capacity: number;
    status: string;
    orderStatus: string;
    orderId: string | null;
    waiterName: string | null;
    partySize: number | null;
    seatedAt: string | null;
  }>;
  kpis: {
    avgWaitMin: number;
    targetWaitMin: number;
    totalOrders: number;
    lateOrders: number;
    onTimeOrders: number;
  };
}

const COLUMN_CONFIG = [
  { key: "received", label: "RECEIVED", color: "bg-teal-50 border-teal-200 dark:bg-teal-950/20", headerColor: "bg-teal-600", description: "New orders" },
  { key: "preparing", label: "PREPARING", color: "bg-blue-50 border-blue-200 dark:bg-blue-950/20", headerColor: "bg-blue-600", description: "In kitchen" },
  { key: "ready", label: "READY", color: "bg-green-50 border-green-200 dark:bg-green-950/20", headerColor: "bg-green-600", description: "Ready to serve" },
  { key: "served", label: "SERVED", color: "bg-gray-50 border-gray-200 dark:bg-gray-900/20", headerColor: "bg-gray-500", description: "Completed" },
  { key: "issues", label: "ISSUES", color: "bg-red-50 border-red-200 dark:bg-red-950/20", headerColor: "bg-red-600", description: "Alerts & delays" },
];

const TABLE_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  empty: { label: "Empty", color: "bg-gray-50 border-gray-200 text-gray-600", dot: "bg-gray-300" },
  ordering: { label: "Ordering", color: "bg-yellow-50 border-yellow-200 text-yellow-700", dot: "bg-yellow-400" },
  in_kitchen: { label: "In Kitchen", color: "bg-orange-50 border-orange-200 text-orange-700", dot: "bg-orange-400" },
  ready: { label: "Ready", color: "bg-green-50 border-green-200 text-green-700", dot: "bg-green-500" },
  bill_requested: { label: "Bill Req.", color: "bg-red-50 border-red-200 text-red-700", dot: "bg-red-500" },
  reserved: { label: "Reserved", color: "bg-purple-50 border-purple-200 text-purple-700", dot: "bg-purple-400" },
};

function getPeakHour(hour: number): { label: string; color: string; emoji: string } {
  if ((hour >= 11 && hour <= 13) || (hour >= 18 && hour <= 21)) {
    return { label: "Peak Hour", color: "text-red-600", emoji: "🔴" };
  }
  if ((hour >= 10 && hour <= 14) || (hour >= 17 && hour <= 22)) {
    return { label: "Busy", color: "text-amber-600", emoji: "🟡" };
  }
  return { label: "Off-Peak", color: "text-green-600", emoji: "🟢" };
}

export default function ServiceHubPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<CoordinationOrder | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [msgPanelOpen, setMsgPanelOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [kpisExpanded, setKpisExpanded] = useState(true);
  const [alertBanner, setAlertBanner] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<DashboardData>({
    queryKey: ["/api/coordination/dashboard"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/coordination/dashboard");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // PR-001: Stable per-orderId idempotency keys for KOT sends — prevent duplicate KOTs from double-tap
  const kotIdemKeys = useRef<Record<string, string>>({});
  const actionMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const opts: { idempotencyKey?: string } = {};
      if (status === "sent_to_kitchen") {
        if (!kotIdemKeys.current[orderId]) kotIdemKeys.current[orderId] = crypto.randomUUID();
        opts.idempotencyKey = kotIdemKeys.current[orderId];
      }
      const res = await apiRequest("PATCH", `/api/orders/${orderId}/coordination-status`, { status }, opts);
      if (status === "sent_to_kitchen") delete kotIdemKeys.current[orderId];
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coordination/dashboard"] });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleAction = useCallback((action: string, orderId: string) => {
    if (action === "confirm") actionMutation.mutate({ orderId, status: "sent_to_kitchen" });
    else if (action === "serve") actionMutation.mutate({ orderId, status: "served" });
  }, [actionMutation]);

  const handleCardClick = useCallback((order: CoordinationOrder) => {
    setSelectedOrder(order);
    setDetailOpen(true);
  }, []);

  const invalidateDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/coordination/dashboard"] });
  }, [queryClient]);

  useRealtimeEvent("coordination:order_updated", invalidateDashboard);
  useRealtimeEvent("order:updated", invalidateDashboard);
  useRealtimeEvent("coordination:item_ready", invalidateDashboard);
  useRealtimeEvent("coordination:alert", (payload: any) => {
    if (payload?.message) setAlertBanner(payload.message);
    setTimeout(() => setAlertBanner(null), 10000);
  });
  useRealtimeEvent("coordination:message", () => {
    if (!msgPanelOpen) setUnreadMessages(c => c + 1);
  });

  const now = new Date();
  const dayName = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const peakInfo = data ? getPeakHour(data.summary.hour) : getPeakHour(now.getHours());

  const summary = data?.summary;
  const kpis = data?.kpis;
  const waitColor = summary && summary.avgWaitMin > summary.targetWaitMin ? "text-red-600" : "text-green-600";

  return (
    <div className="space-y-4" data-testid="service-hub-page">
      {alertBanner && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl font-medium text-sm"
          data-testid="alert-banner"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {alertBanner}
          <button className="ml-auto" onClick={() => setAlertBanner(null)}>✕</button>
        </motion.div>
      )}

      <div className="rounded-xl border bg-gradient-to-r from-primary/5 to-primary/10 p-4 space-y-2" data-testid="summary-bar">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-heading font-bold flex items-center gap-2">
              <Workflow className="h-5 w-5 text-primary" />
              Service Coordination
              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs">Live</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">{dayName}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-sm font-medium">{timeStr}</div>
            <Badge className={`${peakInfo.color} bg-transparent border text-xs`} data-testid="peak-indicator">
              {peakInfo.emoji} {peakInfo.label}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 h-8" data-testid="btn-refresh">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 relative"
              onClick={() => { setMsgPanelOpen(true); }}
              data-testid="btn-open-messages"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Messages
              {unreadMessages > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold" data-testid="unread-messages-badge">
                  {unreadMessages > 9 ? "9+" : unreadMessages}
                </span>
              )}
            </Button>
          </div>
        </div>

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="flex items-center gap-2 text-sm" data-testid="stat-avg-wait">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>Avg wait: <span className={`font-semibold ${waitColor}`}>{summary.avgWaitMin}min</span>
                <span className="text-muted-foreground"> (target {summary.targetWaitMin}min)</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm" data-testid="stat-tables">
              <Utensils className="h-4 w-4 text-muted-foreground" />
              <span>Tables: <span className="font-semibold">{summary.tablesOccupied}/{summary.tablesTotal}</span></span>
            </div>
            <div className="flex items-center gap-2 text-sm" data-testid="stat-delivery">
              <span>🚗 Delivery: <span className="font-semibold">{summary.deliveryPending} pending</span> | {summary.deliveryOut} out</span>
            </div>
            {summary.alerts > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600 font-semibold" data-testid="stat-alerts">
                <AlertTriangle className="h-4 w-4" />
                {summary.alerts} alert{summary.alerts > 1 ? "s" : ""}
              </div>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue="kanban" className="space-y-4">
        <TabsList data-testid="hub-tabs">
          <TabsTrigger value="kanban" data-testid="tab-kanban">Kanban Board</TabsTrigger>
          <TabsTrigger value="floor" data-testid="tab-floor">Floor View</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center h-64" data-testid="kanban-error-state">
              <div className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-red-200 bg-red-50 dark:bg-red-950/20 max-w-md text-center">
                <AlertTriangle className="h-8 w-8 text-red-600" />
                <div>
                  <p className="font-semibold text-red-700">Could not load orders</p>
                  <p className="text-sm text-red-600 mt-1">{(error as Error)?.message ?? "An unexpected error occurred."}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100" data-testid="btn-retry-kanban">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto pb-2" data-testid="kanban-scroll-container">
              <div className="flex gap-4 pb-4 min-w-max" data-testid="kanban-board">
                {COLUMN_CONFIG.map(col => {
                  const orders = data?.columns[col.key as keyof typeof data.columns] ?? [];
                  return (
                    <div
                      key={col.key}
                      className={`flex flex-col w-72 rounded-xl border-2 ${col.color}`}
                      data-testid={`kanban-column-${col.key}`}
                    >
                      <div className={`${col.headerColor} rounded-t-lg px-3 py-2 flex items-center justify-between`}>
                        <div>
                          <span className="text-white font-bold text-sm tracking-wide">{col.label}</span>
                          <p className="text-white/70 text-xs">{col.description}</p>
                        </div>
                        <Badge className="bg-white/20 text-white border-0 font-bold" data-testid={`col-count-${col.key}`}>
                          {orders.length}
                        </Badge>
                      </div>
                      <ScrollArea className="flex-1 max-h-[calc(100vh-380px)]">
                        <div className="p-2 space-y-2 min-h-[200px]">
                          <AnimatePresence>
                            {orders.length === 0 ? (
                              <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                                No orders
                              </div>
                            ) : (
                              orders.map(order => (
                                <OrderCard
                                  key={order.id}
                                  order={order}
                                  columnKey={col.key}
                                  onClick={() => handleCardClick(order)}
                                  onAction={handleAction}
                                />
                              ))
                            )}
                          </AnimatePresence>
                        </div>
                      </ScrollArea>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {kpis && (
            <Card className="mt-4" data-testid="kpis-panel">
              <CardHeader className="p-3 pb-0">
                <button
                  className="flex items-center justify-between w-full text-sm font-semibold"
                  onClick={() => setKpisExpanded(v => !v)}
                  data-testid="btn-toggle-kpis"
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Live KPIs
                  </div>
                  {kpisExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </CardHeader>
              {kpisExpanded && (
                <CardContent className="p-3 pt-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center p-2 rounded-lg bg-muted/30" data-testid="kpi-avg-wait">
                      <p className="text-xs text-muted-foreground">Avg Wait</p>
                      <p className={`text-xl font-bold ${kpis.avgWaitMin > kpis.targetWaitMin ? "text-red-600" : "text-green-600"}`}>
                        {kpis.avgWaitMin}m
                      </p>
                      <p className="text-xs text-muted-foreground">target {kpis.targetWaitMin}m</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30" data-testid="kpi-total-orders">
                      <p className="text-xs text-muted-foreground">Active Orders</p>
                      <p className="text-xl font-bold">{kpis.totalOrders}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30" data-testid="kpi-on-time">
                      <p className="text-xs text-muted-foreground">On Time</p>
                      <p className="text-xl font-bold text-green-600">{kpis.onTimeOrders}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30" data-testid="kpi-late">
                      <p className="text-xs text-muted-foreground">Late</p>
                      <p className={`text-xl font-bold ${kpis.lateOrders > 0 ? "text-red-600" : "text-green-600"}`}>
                        {kpis.lateOrders}
                      </p>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="floor" className="mt-0">
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap text-xs" data-testid="floor-legend">
              {Object.entries(TABLE_STATUS_CONFIG).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                  <span className="text-muted-foreground">{cfg.label}</span>
                </div>
              ))}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : isError ? (
              <div className="flex items-center justify-center h-64" data-testid="floor-error-state">
                <div className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-red-200 bg-red-50 dark:bg-red-950/20 max-w-md text-center">
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                  <div>
                    <p className="font-semibold text-red-700">Could not load floor data</p>
                    <p className="text-sm text-red-600 mt-1">{(error as Error)?.message ?? "An unexpected error occurred."}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100" data-testid="btn-retry-floor">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3" data-testid="floor-grid">
                {(data?.tables ?? []).map(table => {
                  const statusCfg = TABLE_STATUS_CONFIG[table.orderStatus] || TABLE_STATUS_CONFIG.empty;
                  const orderForTable = Object.values(data?.columns ?? {}).flat().find((o: any) => o.id === table.orderId);
                  return (
                    <motion.button
                      key={table.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-3 gap-1 transition-all ${statusCfg.color} aspect-square`}
                      onClick={() => {
                        if (orderForTable) {
                          handleCardClick(orderForTable as CoordinationOrder);
                        }
                      }}
                      data-testid={`floor-table-${table.number}`}
                    >
                      <div className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${statusCfg.dot}`} />
                      <Utensils className="h-4 w-4 opacity-60" />
                      <span className="font-bold text-sm">{table.number}</span>
                      {table.partySize && (
                        <span className="text-[10px] opacity-70">{table.partySize}p</span>
                      )}
                      {table.waiterName && (
                        <span className="text-[9px] opacity-60 truncate w-full text-center">{table.waiterName.split(" ")[0]}</span>
                      )}
                      {table.seatedAt && (
                        <span className="text-[9px] opacity-60">
                          {Math.floor((Date.now() - new Date(table.seatedAt).getTime()) / 60000)}m
                        </span>
                      )}
                    </motion.button>
                  );
                })}
                {(!data?.tables || data.tables.length === 0) && (
                  <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
                    No tables configured
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <OrderDetailPanel
        order={selectedOrder}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedOrder(null); }}
      />

      <ServiceMessagePanel
        open={msgPanelOpen}
        onClose={() => setMsgPanelOpen(false)}
        unreadCount={unreadMessages}
        onMarkRead={() => setUnreadMessages(0)}
      />
    </div>
  );
}
