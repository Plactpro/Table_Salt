import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import {
  Trash2, DollarSign, TrendingDown, AlertTriangle, ShieldCheck,
  Download, ChevronUp, ChevronDown, ArrowUpDown, RefreshCw,
  Eye, X, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

const CATEGORY_COLORS: Record<string, string> = {
  cooking_error: "#f97316",
  plate_return: "#3b82f6",
  trim_waste: "#8b5cf6",
  storage_damage: "#10b981",
  overproduction: "#ec4899",
  spoilage: "#f59e0b",
  expired: "#ef4444",
  dropped: "#84cc16",
  cross_contamination: "#06b6d4",
  portion_error: "#a855f7",
  transfer_loss: "#64748b",
  quality_rejection: "#e11d48",
  other: "#94a3b8",
};

const CATEGORY_LABELS: Record<string, string> = {
  spoilage: "Spoilage",
  overproduction: "Over-Production",
  plate_return: "Plate Return",
  trim_waste: "Prep Trim",
  cooking_error: "Cooking Error",
  expired: "Expired",
  dropped: "Dropped",
  cross_contamination: "Cross Contamination",
  portion_error: "Portion Error",
  transfer_loss: "Transfer Loss",
  quality_rejection: "Quality Rejection",
  storage_damage: "Storage Damage",
  other: "Other",
};

function KpiCard({
  title, value, sub, icon: Icon, color, testId,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: any;
  color: string;
  testId: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card data-testid={testId}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-2xl font-bold font-heading mt-1" data-testid={`${testId}-value`}>{value}</p>
              {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            </div>
            <div className={`p-3 rounded-xl ${color}`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function TargetGauge({ current, target, status }: { current: number; target: number; status: string }) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const barColor = status === "exceeded" ? "bg-red-500" : status === "warning" ? "bg-amber-500" : "bg-green-500";
  const textColor = status === "exceeded" ? "text-red-600" : status === "warning" ? "text-amber-600" : "text-green-600";

  return (
    <div className="space-y-2" data-testid="target-gauge">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Daily Wastage Budget</span>
        <span className={`font-semibold ${textColor}`}>{pct.toFixed(0)}%</span>
      </div>
      <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
          data-testid="gauge-fill"
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>₹{current.toFixed(2)} used</span>
        <span>Target: ₹{target.toFixed(2)}</span>
      </div>
    </div>
  );
}

type SortDir = "asc" | "desc";

function SortHeader({ col, currentCol, dir, onClick, children }: {
  col: string; currentCol: string; dir: SortDir; onClick: (c: string) => void; children: React.ReactNode;
}) {
  const active = col === currentCol;
  return (
    <button
      className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-foreground transition-colors"
      onClick={() => onClick(col)}
    >
      {children}
      {active ? (
        dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

function EntryDetailPanel({ entry, onClose }: { entry: any; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [recoveryType, setRecoveryType] = useState("");
  const [recoveryValue, setRecoveryValue] = useState("");

  const totalCost = Number(entry.total_cost ?? 0);
  const recoveryAmount = recoveryValue ? Math.min(parseFloat(recoveryValue), totalCost) : 0;
  const netLoss = totalCost - recoveryAmount;

  const voidMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/wastage/${entry.id}`).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Entry voided" });
      queryClient.invalidateQueries({ queryKey: ["/api/wastage"] });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md" data-testid="entry-detail-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4 text-destructive" />
            Entry Detail
          </DialogTitle>
          <DialogDescription>{entry.wastage_number ?? entry.id?.slice?.(0, 8) ?? "—"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Item</p>
              <p className="font-medium">{entry.ingredient_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Category</p>
              <Badge
                variant="outline"
                style={{ borderColor: CATEGORY_COLORS[entry.wastage_category], color: CATEGORY_COLORS[entry.wastage_category] }}
              >
                {CATEGORY_LABELS[entry.wastage_category] ?? entry.wastage_category}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Quantity</p>
              <p>{entry.quantity} {entry.unit}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unit Cost</p>
              <p>₹{Number(entry.unit_cost ?? 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Cost</p>
              <p className="font-semibold text-destructive">₹{totalCost.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Preventable</p>
              <p>{entry.is_preventable ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Chef</p>
              <p>{entry.chef_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Counter</p>
              <p>{entry.counter_name ?? "—"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Reason</p>
              <p>{entry.reason ?? "—"}</p>
            </div>
            {entry.notes && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p>{entry.notes}</p>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2" data-testid="recovery-tracking">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Recovery Tracking
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Recovery Type</Label>
              <Select value={recoveryType} onValueChange={setRecoveryType}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-recovery-type">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Recovery</SelectItem>
                  <SelectItem value="repurposed">Repurposed</SelectItem>
                  <SelectItem value="staff_meal">Staff Meal</SelectItem>
                  <SelectItem value="composted">Composted</SelectItem>
                  <SelectItem value="donated">Donated</SelectItem>
                  <SelectItem value="sold_discount">Sold at Discount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {recoveryType && recoveryType !== "none" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Recovery Value (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  max={totalCost}
                  step="0.01"
                  className="h-8 text-sm"
                  value={recoveryValue}
                  onChange={(e) => setRecoveryValue(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-recovery-value"
                />
              </div>
            )}
            {recoveryAmount > 0 && (
              <div className="flex items-center justify-between text-xs px-3 py-2 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200">
                <span className="text-green-700 dark:text-green-300">Net Loss after Recovery</span>
                <span className="font-semibold text-green-800 dark:text-green-200" data-testid="net-loss-value">
                  ₹{netLoss.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 gap-1"
              onClick={() => voidMutation.mutate()}
              disabled={voidMutation.isPending || entry.is_voided}
              data-testid="btn-void-entry"
            >
              <X className="h-3.5 w-3.5" />
              {entry.is_voided ? "Voided" : "Void Entry"}
            </Button>
            <Button variant="outline" size="sm" onClick={onClose} data-testid="btn-close-detail">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function WastageDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [chefFilter, setChefFilter] = useState("all");
  const [counterFilter, setCounterFilter] = useState("all");
  const [preventableOnly, setPreventableOnly] = useState(false);
  const [minCost, setMinCost] = useState("");
  const [sortCol, setSortCol] = useState("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const PAGE_SIZE = 20;

  const logParams = new URLSearchParams({
    from: dateFrom,
    to: dateTo,
    ...(categoryFilter !== "all" && { category: categoryFilter }),
    ...(chefFilter !== "all" && { chefId: chefFilter }),
    ...(counterFilter !== "all" && { counterId: counterFilter }),
    ...(preventableOnly && { preventable: "true" }),
    ...(minCost && { minCost }),
    page: String(page),
    limit: String(PAGE_SIZE),
  }).toString();

  const chefQueryParams = new URLSearchParams({ from: dateFrom, to: dateTo }).toString();
  const itemQueryParams = new URLSearchParams({ from: dateFrom, to: dateTo }).toString();

  const { data: dashData, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/wastage/dashboard"],
    queryFn: () => apiRequest("GET", "/api/wastage/dashboard").then((r) => r.json()),
  });

  const { data: trendsData } = useQuery<any>({
    queryKey: ["/api/wastage/trends"],
    queryFn: () => apiRequest("GET", "/api/wastage/trends").then((r) => r.json()),
  });

  const { data: chefData } = useQuery<any[]>({
    queryKey: ["/api/wastage/by-chef", chefQueryParams],
    queryFn: () => apiRequest("GET", `/api/wastage/by-chef?${chefQueryParams}`).then((r) => r.json()),
  });

  const { data: itemData } = useQuery<any[]>({
    queryKey: ["/api/wastage/by-item", itemQueryParams],
    queryFn: () => apiRequest("GET", `/api/wastage/by-item?${itemQueryParams}`).then((r) => r.json()),
  });

  const { data: revenueData } = useQuery<any[]>({
    queryKey: ["/api/wastage/vs-revenue"],
    queryFn: () => apiRequest("GET", "/api/wastage/vs-revenue").then((r) => r.json()),
  });

  const { data: logData } = useQuery<any>({
    queryKey: ["/api/wastage", logParams],
    queryFn: () => apiRequest("GET", `/api/wastage?${logParams}`).then((r) => r.json()),
  });

  const handleSort = useCallback((col: string) => {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
    setPage(1);
  }, [sortCol]);

  useRealtimeEvent("wastage:threshold_alert", useCallback((payload: any) => {
    toast({
      title: "⚠️ Wastage Threshold Alert",
      description: payload?.message ?? "Wastage threshold exceeded.",
      variant: "destructive",
    });
  }, [toast]));

  useRealtimeEvent("wastage:target_exceeded", useCallback((payload: any) => {
    toast({
      title: "🚨 Wastage Target Exceeded",
      description: payload?.message ?? "Daily target has been exceeded.",
      variant: "destructive",
    });
  }, [toast]));

  useRealtimeEvent("wastage:high_entry", useCallback((payload: any) => {
    toast({
      title: "⚠️ High Wastage Entry",
      description: payload?.message ?? "A high-value wastage entry was logged.",
    });
    queryClient.invalidateQueries({ queryKey: ["/api/wastage"] });
  }, [toast, queryClient]));

  const today = dashData?.today ?? {};
  const week = dashData?.week ?? {};
  const target = dashData?.target ?? null;
  const categoryBreakdown: any[] = dashData?.categoryBreakdown ?? [];
  const chefBreakdown: any[] = Array.isArray(chefData) ? chefData : [];
  const itemBreakdown: any[] = Array.isArray(itemData) ? itemData : [];
  const sevenDayTrend: any[] = trendsData?.sevenDay ?? [];
  const revenueComparison: any[] = Array.isArray(revenueData) ? revenueData : [];
  const entries: any[] = logData?.data ?? [];
  const totalEntries: number = logData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));

  const uniqueChefs = chefBreakdown.filter((c) => c.chefId);
  const uniqueCounters = Array.from(
    new Map(entries.filter((e) => e.counter_id).map((e) => [e.counter_id, { id: e.counter_id, name: e.counter_name }])).values()
  );

  const handleExport = async () => {
    try {
      const exportParams = new URLSearchParams({
        from: dateFrom,
        to: dateTo,
        ...(categoryFilter !== "all" && { category: categoryFilter }),
        ...(chefFilter !== "all" && { chefId: chefFilter }),
        ...(counterFilter !== "all" && { counterId: counterFilter }),
        ...(preventableOnly && { preventable: "true" }),
        ...(minCost && { minCost }),
      }).toString();
      const res = await apiRequest("GET", `/api/wastage/export/csv?${exportParams}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wastage-export-${dateFrom}-to-${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", description: "Could not download CSV.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6" data-testid="page-wastage-dashboard">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Trash2 className="h-6 w-6 text-destructive" />
            Wastage Control
          </h1>
          <p className="text-muted-foreground text-sm">Monitor, analyse, and reduce food waste</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="btn-refresh" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="btn-export-csv" className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                className="h-8 w-36 text-sm"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                data-testid="filter-date-from"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                className="h-8 w-36 text-sm"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                data-testid="filter-date-to"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-40 text-sm" data-testid="filter-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Chef</Label>
              <Select value={chefFilter} onValueChange={(v) => { setChefFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-36 text-sm" data-testid="filter-chef">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Chefs</SelectItem>
                  {uniqueChefs.map((c: any) => (
                    <SelectItem key={c.chefId} value={c.chefId}>{c.chefName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Counter</Label>
              <Select value={counterFilter} onValueChange={(v) => { setCounterFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-36 text-sm" data-testid="filter-counter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Counters</SelectItem>
                  {uniqueCounters.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Min Cost (₹)</Label>
              <Input
                type="number"
                className="h-8 w-24 text-sm"
                value={minCost}
                onChange={(e) => { setMinCost(e.target.value); setPage(1); }}
                placeholder="0"
                data-testid="filter-min-cost"
              />
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Switch
                checked={preventableOnly}
                onCheckedChange={(v) => { setPreventableOnly(v); setPage(1); }}
                data-testid="filter-preventable-only"
              />
              <Label className="text-xs cursor-pointer" onClick={() => setPreventableOnly((v) => !v)}>
                Preventable Only
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              testId="kpi-today-cost"
              title="Today's Waste Cost"
              value={`₹${Number(today.totalCost ?? 0).toFixed(2)}`}
              sub={`${today.entries ?? 0} entries`}
              icon={DollarSign}
              color="bg-red-500"
            />
            <KpiCard
              testId="kpi-week-vs-target"
              title="This Week"
              value={`₹${Number(week.totalCost ?? 0).toFixed(2)}`}
              sub={`${week.entries ?? 0} entries`}
              icon={TrendingDown}
              color="bg-amber-500"
            />
            <KpiCard
              testId="kpi-pct-revenue"
              title="% of Revenue"
              value={today.revenueWastagePct != null ? `${today.revenueWastagePct}%` : "N/A"}
              sub="Ideal < 3%"
              icon={AlertTriangle}
              color="bg-orange-500"
            />
            <KpiCard
              testId="kpi-preventable"
              title="Preventable %"
              value={`${today.preventablePct ?? 0}%`}
              sub={`₹${Number(today.preventableCost ?? 0).toFixed(2)} preventable`}
              icon={ShieldCheck}
              color="bg-blue-500"
            />
          </div>

          {target && (
            <Card>
              <CardContent className="p-5">
                <TargetGauge
                  current={target.current ?? 0}
                  target={target.amount ?? 0}
                  status={target.status ?? "ok"}
                />
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Today's Category Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {categoryBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No data for today</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={categoryBreakdown} barSize={28}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="category"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => CATEGORY_LABELS[v] ?? v}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        labelFormatter={(v) => CATEGORY_LABELS[v as string] ?? v}
                        formatter={(v: any) => [`₹${Number(v).toFixed(2)}`, "Cost"]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="cost" radius={[4, 4, 0, 0]} fill="#f97316" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">7-Day Wastage Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {sevenDayTrend.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No trend data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={sevenDayTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v: any) => [`₹${Number(v).toFixed(2)}`, "Cost"]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="totalCost"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#ef4444" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="log">
            <TabsList data-testid="wastage-tabs" className="flex-wrap h-auto">
              <TabsTrigger value="log" data-testid="tab-log">Wastage Log</TabsTrigger>
              <TabsTrigger value="chefs" data-testid="tab-chefs">Chef Accountability</TabsTrigger>
              <TabsTrigger value="most-wasted" data-testid="tab-most-wasted">Most Wasted Items</TabsTrigger>
              <TabsTrigger value="revenue" data-testid="tab-revenue">Wastage vs Revenue</TabsTrigger>
            </TabsList>

            <TabsContent value="log" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="wastage-log-table">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-4 py-3 text-left">
                            <SortHeader col="time" currentCol={sortCol} dir={sortDir} onClick={handleSort}>Date</SortHeader>
                          </th>
                          <th className="px-4 py-3 text-left">
                            <SortHeader col="item" currentCol={sortCol} dir={sortDir} onClick={handleSort}>Item</SortHeader>
                          </th>
                          <th className="px-4 py-3 text-left">Category</th>
                          <th className="px-4 py-3 text-right">
                            <SortHeader col="qty" currentCol={sortCol} dir={sortDir} onClick={handleSort}>Qty</SortHeader>
                          </th>
                          <th className="px-4 py-3 text-right">
                            <SortHeader col="cost" currentCol={sortCol} dir={sortDir} onClick={handleSort}>Cost</SortHeader>
                          </th>
                          <th className="px-4 py-3 text-left">Chef</th>
                          <th className="px-4 py-3 text-left">Counter</th>
                          <th className="px-4 py-3 text-center">Preventable</th>
                          <th className="px-4 py-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {entries.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                              No entries found
                            </td>
                          </tr>
                        ) : entries.map((entry: any) => (
                          <tr
                            key={entry.id}
                            className="hover:bg-muted/30 transition-colors"
                            data-testid={`log-row-${entry.id}`}
                          >
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {entry.wastage_date ?? "—"}
                            </td>
                            <td className="px-4 py-3 font-medium max-w-[140px] truncate">
                              {entry.ingredient_name ?? "—"}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                style={{
                                  borderColor: CATEGORY_COLORS[entry.wastage_category] ?? "#94a3b8",
                                  color: CATEGORY_COLORS[entry.wastage_category] ?? "#94a3b8",
                                }}
                              >
                                {CATEGORY_LABELS[entry.wastage_category] ?? entry.wastage_category ?? "—"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {entry.quantity} {entry.unit}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {entry.total_cost ? `₹${Number(entry.total_cost).toFixed(2)}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{entry.chef_name ?? "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{entry.counter_name ?? "—"}</td>
                            <td className="px-4 py-3 text-center">
                              {entry.is_preventable ? (
                                <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">Yes</Badge>
                              ) : (
                                <Badge variant="secondary">No</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => setSelectedEntry(entry)}
                                data-testid={`btn-view-entry-${entry.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t" data-testid="log-pagination">
                      <p className="text-sm text-muted-foreground">
                        Page {page} of {totalPages} · {totalEntries} entries
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => p - 1)}
                          data-testid="btn-prev-page"
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => p + 1)}
                          data-testid="btn-next-page"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="chefs" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-sm" data-testid="chef-accountability-table">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left">Chef</th>
                        <th className="px-4 py-3 text-right">Entries</th>
                        <th className="px-4 py-3 text-right">Total Cost</th>
                        <th className="px-4 py-3 text-right">Preventable %</th>
                        <th className="px-4 py-3 text-right">Avg / Shift</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {chefBreakdown.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                            No chef data for selected period
                          </td>
                        </tr>
                      ) : [...chefBreakdown].sort((a, b) => b.totalCost - a.totalCost).map((chef: any) => (
                        <tr
                          key={chef.chefId}
                          className="hover:bg-muted/30"
                          data-testid={`chef-row-${chef.chefId}`}
                        >
                          <td className="px-4 py-3 font-medium">{chef.chefName ?? "Unknown"}</td>
                          <td className="px-4 py-3 text-right">{chef.entries}</td>
                          <td className="px-4 py-3 text-right font-mono">₹{Number(chef.totalCost).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right">
                            <Badge variant={chef.preventablePct > 60 ? "destructive" : "secondary"}>
                              {chef.preventablePct}%
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            ₹{Number(chef.avgPerEntry).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="most-wasted" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-sm" data-testid="most-wasted-table">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left">#</th>
                        <th className="px-4 py-3 text-left">Item</th>
                        <th className="px-4 py-3 text-left">Unit</th>
                        <th className="px-4 py-3 text-right">Entries</th>
                        <th className="px-4 py-3 text-right">Total Qty</th>
                        <th className="px-4 py-3 text-right">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {itemBreakdown.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                            No item data for selected period
                          </td>
                        </tr>
                      ) : itemBreakdown.map((item: any, i: number) => (
                        <tr
                          key={item.ingredientId ?? i}
                          className="hover:bg-muted/30"
                          data-testid={`wasted-item-row-${item.ingredientId ?? i}`}
                        >
                          <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3 font-medium">{item.ingredientName ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{item.unit ?? "—"}</td>
                          <td className="px-4 py-3 text-right">{item.entries}</td>
                          <td className="px-4 py-3 text-right">{Number(item.totalQty).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-mono">₹{Number(item.totalCost).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="revenue" className="mt-4">
              <Card>
                <CardContent className="p-4 space-y-4">
                  {revenueComparison.length > 0 && (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={revenueComparison}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(v: any, name: string) => [
                            `₹${Number(v).toFixed(2)}`,
                            name === "wastageCost" ? "Wastage" : "Revenue",
                          ]}
                          contentStyle={{ fontSize: 12 }}
                        />
                        <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={false} name="Revenue" />
                        <Line type="monotone" dataKey="wastageCost" stroke="#ef4444" strokeWidth={2} dot={false} name="Wastage" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="revenue-wastage-table">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-4 py-3 text-left">Date</th>
                          <th className="px-4 py-3 text-right">Revenue</th>
                          <th className="px-4 py-3 text-right">Wastage</th>
                          <th className="px-4 py-3 text-right">Ratio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {revenueComparison.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                              No revenue comparison data
                            </td>
                          </tr>
                        ) : revenueComparison.map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-muted/30" data-testid={`rev-row-${i}`}>
                            <td className="px-4 py-3">{String(row.date).slice(0, 10)}</td>
                            <td className="px-4 py-3 text-right font-mono">₹{Number(row.revenue).toFixed(2)}</td>
                            <td className="px-4 py-3 text-right font-mono">₹{Number(row.wastageCost).toFixed(2)}</td>
                            <td className="px-4 py-3 text-right">
                              {row.ratio != null ? (
                                <Badge variant={row.ratio > 5 ? "destructive" : "secondary"}>{row.ratio}%</Badge>
                              ) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {selectedEntry && (
        <EntryDetailPanel entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  );
}
