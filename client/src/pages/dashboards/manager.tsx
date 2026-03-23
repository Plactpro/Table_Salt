import { useState, useCallback, Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { StatCard } from "@/components/widgets/stat-card";
import { DollarSign, ShoppingCart, Armchair, AlertTriangle, Monitor, LayoutGrid, Package, ClipboardList, ArrowRight, CheckCircle2, XCircle, Loader2, Banknote, ChevronRight, AlertCircle } from "lucide-react";
import { ResourceAvailabilityWidget } from "@/components/resources/ResourceAvailabilityWidget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { formatCurrency, currencyMap } from "@shared/currency";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { VoidRequest } from "@/components/tickets/TicketDetailDrawer";
import { TrialBanner } from "@/components/layout/TrialBanner";

class PageErrorBoundary extends Component<{ children: ReactNode; label: string }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; label: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] page error:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <AlertCircle className="h-10 w-10 text-destructive opacity-60" />
          <p className="text-sm">Something went wrong loading <strong>{this.props.label}</strong>.</p>
          <button className="text-xs underline" onClick={() => this.setState({ hasError: false })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

const quickActions = [
  { label: "Open POS", path: "/pos", icon: Monitor, color: "from-teal-500/15 to-teal-600/5", iconColor: "text-teal-600", border: "ring-teal-200 dark:ring-teal-800" },
  { label: "View Tables", path: "/tables", icon: LayoutGrid, color: "from-purple-500/15 to-purple-600/5", iconColor: "text-purple-600", border: "ring-purple-200 dark:ring-purple-800" },
  { label: "Check Inventory", path: "/inventory", icon: Package, color: "from-orange-500/15 to-orange-600/5", iconColor: "text-orange-600", border: "ring-orange-200 dark:ring-orange-800" },
  { label: "All Orders", path: "/orders", icon: ClipboardList, color: "from-green-500/15 to-green-600/5", iconColor: "text-green-600", border: "ring-green-200 dark:ring-green-800" },
];

export default function ManagerDashboard() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [voidNotification, setVoidNotification] = useState<VoidRequest | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/dashboard"],
  });

  const { data: outlets = [] } = useQuery<any[]>({
    queryKey: ["/api/outlets"],
  });
  const firstOutletId = outlets[0]?.id as string | undefined;

  const { data: pendingVoidData } = useQuery<{ count: number }>({
    queryKey: ["/api/tickets/void-requests/pending-count"],
    refetchInterval: 30000,
  });
  const pendingVoidCount = pendingVoidData?.count || 0;

  const { data: tipReportData } = useQuery<{
    totalTips: number;
    tipsCount: number;
    pendingPayouts: number;
    topWaiter?: { name: string; amount: number };
  } | null>({
    queryKey: ["/api/tips/report", "today"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/tips/report?dateFrom=${today}&dateTo=${today}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/tickets/void-requests/${id}/approve`, {}),
    onSuccess: () => {
      toast({ title: "✅ Void approved" });
      setVoidNotification(null);
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/void-requests/pending-count"] });
    },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("PUT", `/api/tickets/void-requests/${id}/reject`, { reason }),
    onSuccess: () => {
      toast({ title: "❌ Void rejected" });
      setVoidNotification(null);
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/void-requests/pending-count"] });
    },
    onError: () => toast({ title: "Failed to reject", variant: "destructive" }),
  });

  const handleVoidRequestNew = useCallback((payload: unknown) => {
    const vr = payload as VoidRequest;
    setVoidNotification(vr);
    queryClient.invalidateQueries({ queryKey: ["/api/tickets/void-requests/pending-count"] });
  }, [queryClient]);

  useRealtimeEvent("void_request:new", handleVoidRequestNew);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: string | number | null) => formatCurrency(val ?? 0, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });
  const symbol = currencyMap[tenantCurrency as keyof typeof currencyMap]?.symbol || tenantCurrency;

  const tableStats = stats?.tableStats || [];
  const totalTables = tableStats.reduce((sum: number, t: any) => sum + Number(t.count), 0);
  const occupiedTables = tableStats.find((t: any) => t.status === "occupied")?.count || 0;
  const occupancyPct = totalTables > 0 ? Math.round((Number(occupiedTables) / totalTables) * 100) : 0;

  const inProgressOrders = (stats?.recentOrders || []).filter(
    (o: any) => o.status === "in_progress" || o.status === "new" || o.status === "sent_to_kitchen"
  ).length;

  return (
    <PageErrorBoundary label="Manager Dashboard"><motion.div
      className="space-y-6"
      data-testid="dashboard-manager"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <TrialBanner />
      {/* Persistent void-request notification for manager/owner */}
      {voidNotification && (
        <div className="fixed top-4 right-4 z-50 w-96 bg-background border-2 border-amber-300 rounded-xl shadow-xl p-4 space-y-3" data-testid="notification-void-request">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-sm">🔔 VOID REQUEST</p>
              {voidNotification.requestedByName && (
                <p className="text-sm">From: {voidNotification.requestedByName}</p>
              )}
              <p className="text-sm">
                Order #{voidNotification.orderNumber}
                {voidNotification.tableNumber ? ` | Table ${voidNotification.tableNumber}` : ""}
              </p>
              {voidNotification.itemName && (
                <p className="text-sm">
                  Item: {voidNotification.quantity}x {voidNotification.itemName}
                  {voidNotification.itemPrice ? ` (${fmt(voidNotification.itemPrice)})` : ""}
                </p>
              )}
              {voidNotification.reason && (
                <p className="text-sm text-muted-foreground">Reason: {voidNotification.reason}</p>
              )}
            </div>
          </div>
          <Input
            placeholder="Reject reason (optional)"
            value={rejectReason[voidNotification.id] || ""}
            onChange={e => setRejectReason(prev => ({ ...prev, [voidNotification.id]: e.target.value }))}
            data-testid={`input-reject-reason-${voidNotification.id}`}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => navigate(`/tickets?order=${voidNotification.orderId}`)}
            >
              VIEW ORDER
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => approveMutation.mutate(voidNotification.id)}
              disabled={approveMutation.isPending}
              data-testid={`button-approve-void-${voidNotification.id}`}
            >
              {approveMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><CheckCircle2 className="h-4 w-4 mr-1" /> APPROVE</>}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={() => rejectMutation.mutate({ id: voidNotification.id, reason: rejectReason[voidNotification.id] || "" })}
              disabled={rejectMutation.isPending}
              data-testid={`button-reject-void-${voidNotification.id}`}
            >
              {rejectMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><XCircle className="h-4 w-4 mr-1" /> REJECT</>}
            </Button>
          </div>
        </div>
      )}

      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-heading font-bold" data-testid="text-dashboard-title">Manager Dashboard</h1>
        <p className="text-muted-foreground">Today's operations at a glance</p>
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Today's Sales"
          value={fmt(stats?.todayRevenue || 0)}
          subtitle={`${stats?.todayOrders || 0} orders today`}
          icon={DollarSign}
          iconColor="text-green-600"
          iconBg="bg-green-100"
          testId="stat-today-sales"
          index={0}
        />
        <StatCard
          title="Orders In Progress"
          value={inProgressOrders}
          icon={ShoppingCart}
          iconColor="text-orange-600"
          iconBg="bg-orange-100"
          testId="stat-in-progress"
          index={1}
        />
        <StatCard
          title="Table Occupancy"
          value={`${occupancyPct}%`}
          subtitle={`${occupiedTables} of ${totalTables} tables`}
          icon={Armchair}
          iconColor="text-cyan-600"
          iconBg="bg-cyan-100"
          testId="stat-occupancy"
          index={2}
        />
        <motion.div
          className={`rounded-xl p-4 ring-1 cursor-pointer transition-all ${pendingVoidCount > 0 ? "bg-amber-50 dark:bg-amber-950/30 ring-amber-300" : "bg-muted/30 ring-border"}`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate("/tickets?filter=void-requests")}
          data-testid="card-pending-void-requests"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pending Void Requests</p>
              <p className={`text-3xl font-bold mt-1 ${pendingVoidCount > 0 ? "text-amber-600" : "text-foreground"}`}>{pendingVoidCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Click to review</p>
            </div>
            <div className={`p-2 rounded-lg ${pendingVoidCount > 0 ? "bg-amber-100" : "bg-muted"}`}>
              <AlertTriangle className={`h-5 w-5 ${pendingVoidCount > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
            </div>
          </div>
        </motion.div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card data-testid="card-quick-actions">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-primary" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {quickActions.map((action, i) => {
                const ActionIcon = action.icon;
                return (
                  <motion.button
                    key={action.path}
                    onClick={() => navigate(action.path)}
                    className={`group relative flex flex-col items-center gap-3 p-5 rounded-xl bg-gradient-to-br ${action.color} ring-1 ${action.border} transition-all duration-200 cursor-pointer`}
                    data-testid={`btn-goto-${action.path.replace("/", "")}`}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 + i * 0.06 }}
                  >
                    <motion.div
                      whileHover={{ rotate: 8, scale: 1.1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                    >
                      <ActionIcon className={`h-7 w-7 ${action.iconColor}`} />
                    </motion.div>
                    <span className="text-sm font-medium">{action.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <CashDrawerStatusCard navigate={navigate} fmt={fmt} symbol={symbol} />
      </motion.div>

      {firstOutletId && (
        <motion.div variants={fadeUp}>
          <ResourceAvailabilityWidget outletId={firstOutletId} />
        </motion.div>
      )}

      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card data-testid="card-top-menu" className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                Top 5 Menu Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(stats?.topItems || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet</p>
              ) : (
                (stats?.topItems || []).map((item: any, i: number) => (
                  <motion.div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    data-testid={`top-menu-item-${i}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.35 + i * 0.05 }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    <Badge variant="secondary">{item.totalQty} sold</Badge>
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          <Card data-testid="card-low-stock-alerts" className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <motion.div
                  animate={{ scale: (stats?.lowStockItems || []).length > 0 ? [1, 1.15, 1] : 1 }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <AlertTriangle className={`h-4 w-4 ${(stats?.lowStockItems || []).length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                </motion.div>
                Low Stock Alerts
                {(stats?.lowStockItems || []).length > 0 && (
                  <Badge variant="destructive" className="ml-auto text-xs">{(stats?.lowStockItems || []).length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(stats?.lowStockItems || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">All stock levels are good</p>
              ) : (
                (stats?.lowStockItems || []).map((item: any, i: number) => (
                  <motion.div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-destructive/5 transition-colors"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.4 + i * 0.05 }}
                  >
                    <span className="text-sm">{item.name}</span>
                    <span className="text-sm text-destructive font-medium">{item.currentStock} {item.unit}</span>
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        {tipReportData && tipReportData.tipsCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <Card className="border-amber-200 dark:border-amber-800 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20" data-testid="card-tip-summary">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-amber-600" />
                  Today's Tip Summary
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 text-xs"
                    onClick={() => navigate("/tips/report")}
                    data-testid="link-tip-report"
                  >
                    Full Report <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Total Tips</p>
                    <p className="text-2xl font-bold text-amber-600" data-testid="text-manager-tips-total">{fmt(tipReportData.totalTips)}</p>
                    <p className="text-xs text-muted-foreground">{tipReportData.tipsCount} transactions</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Pending Payouts</p>
                    <p className="text-2xl font-bold" data-testid="text-manager-tips-pending">{fmt(tipReportData.pendingPayouts)}</p>
                    {tipReportData.topWaiter && (
                      <p className="text-xs text-muted-foreground">Top: {tipReportData.topWaiter.name}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </motion.div></PageErrorBoundary>
  );
}

function CashDrawerStatusCard({ navigate, fmt, symbol }: { navigate: (path: string) => void; fmt: (v: any) => string; symbol: string }) {
  const { data: sessions = [] } = useQuery<any[]>({
    queryKey: ["/api/cash-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/cash-sessions?status=open", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });

  return (
    <Card data-testid="card-cash-status-manager">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Banknote className="h-4 w-4 text-emerald-600" />
          Cash Drawer Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <div className="flex items-center justify-between py-2">
            <p className="text-sm text-muted-foreground">No active cash sessions</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/cash")}>Manage Cash</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.slice(0, 5).map((session: any) => (
              <div key={session.id} className="flex items-center justify-between p-2 rounded-lg border bg-muted/30">
                <div>
                  <p className="text-sm font-medium">{session.cashierName || "Cashier"}</p>
                  <p className="text-xs text-muted-foreground">{session.sessionNumber || session.shiftName || "Active Session"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-700">{fmt(session.runningBalance ?? session.openingFloat ?? 0)}</p>
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Active</Badge>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => navigate("/cash")}>
              View Cash Dashboard →
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
