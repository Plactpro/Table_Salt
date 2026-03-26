import { PageTitle } from "@/lib/accessibility";
import { CardGridSkeleton, ChartSkeleton } from "@/components/ui/skeletons";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/widgets/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from "recharts";
import { DollarSign, ShoppingCart, TrendingUp, Percent, Download, BarChart3, FileText, FileDown, RotateCcw, Clock, ChevronDown, ChevronUp, AlertTriangle, Star, Timer } from "lucide-react";
import { exportToPdf } from "@/lib/pdf-export";
import { format, subDays } from "date-fns";

const WATERFALL_COLORS = ["#3b82f6", "#14b8a6", "#f97316", "#ef4444", "#a855f7", "#22c55e"];
const WATERFALL_KEYS = ["waiterResponse", "kitchenPickup", "idleWait", "cooking", "passWait", "service"];
const WATERFALL_LABELS = ["Waiter Response", "Kitchen Pickup", "Idle Wait", "Cooking", "Pass Wait", "Service"];

function starRating(onTimePct: number): number {
  if (onTimePct >= 94) return 5;
  if (onTimePct >= 88) return 4;
  if (onTimePct >= 80) return 3;
  if (onTimePct >= 74) return 2;
  return 1;
}

function Stars({ count }: { count: number }) {
  return (
    <span className="text-amber-500">
      {"★".repeat(count)}{"☆".repeat(5 - count)}
    </span>
  );
}

function KitchenTimeTab() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [dateMode, setDateMode] = useState<"today" | "7d" | "30d" | "custom">("today");
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(today);
  const [outletId, setOutletId] = useState<string>("");
  const [selectedDish, setSelectedDish] = useState<any>(null);
  const [shiftOpen, setShiftOpen] = useState(false);

  const { data: outlets = [] } = useQuery<any[]>({ queryKey: ["/api/outlets"] });

  const dateParam = dateMode === "today" ? `date=${today}`
    : dateMode === "7d" ? `dateRange=7d`
    : dateMode === "30d" ? `dateRange=30d`
    : `from=${customFrom}&to=${customTo}`;
  const outletParam = outletId ? `&outletId=${outletId}` : "";
  const qp = `${dateParam}${outletParam}`;

  const { data: dashboard } = useQuery<any>({
    queryKey: ["/api/time-performance/dashboard", qp],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/time-performance/dashboard?${qp}`);
        if (res.ok) return res.json();
      } catch (_) {}
      return null;
    },
  });

  const { data: byHour = [] } = useQuery<any[]>({
    queryKey: ["/api/time-performance/by-hour", qp],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/time-performance/by-hour?${qp}`);
        if (res.ok) return res.json();
      } catch (_) {}
      return [];
    },
  });

  const { data: byDish = [] } = useQuery<any[]>({
    queryKey: ["/api/time-performance/by-dish", qp],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/time-performance/by-dish?${qp}`);
        if (res.ok) return res.json();
      } catch (_) {}
      return [];
    },
  });

  const { data: byChef = [] } = useQuery<any[]>({
    queryKey: ["/api/time-performance/by-chef", qp],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/time-performance/by-chef?${qp}`);
        if (res.ok) return res.json();
      } catch (_) {}
      return [];
    },
  });

  const { data: bottlenecks = [] } = useQuery<any[]>({
    queryKey: ["/api/time-performance/bottlenecks", qp],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/time-performance/bottlenecks?${qp}`);
        if (res.ok) return res.json();
      } catch (_) {}
      return [];
    },
  });

  const { data: shiftReport } = useQuery<any>({
    queryKey: ["/api/time-performance/shift-report", qp],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/time-performance/shift-report?${qp}`);
        if (res.ok) return res.json();
      } catch (_) {}
      return null;
    },
    enabled: shiftOpen,
  });

  const kpis = dashboard?.kpis ?? {};
  const waterfall = dashboard?.waterfall ?? null;

  const waterfallChartData = waterfall ? [{
    name: "Avg",
    waiterResponse: waterfall.waiterResponseSec ? +(waterfall.waiterResponseSec / 60).toFixed(1) : 0,
    kitchenPickup: waterfall.kitchenPickupSec ? +(waterfall.kitchenPickupSec / 60).toFixed(1) : 0,
    idleWait: waterfall.idleWaitSec ? +(waterfall.idleWaitSec / 60).toFixed(1) : 0,
    cooking: waterfall.cookingSec ? +(waterfall.cookingSec / 60).toFixed(1) : 0,
    passWait: waterfall.passWaitSec ? +(waterfall.passWaitSec / 60).toFixed(1) : 0,
    service: waterfall.serviceSec ? +(waterfall.serviceSec / 60).toFixed(1) : 0,
  }] : [];

  function handleExportCsv() {
    window.open(`/api/time-performance/export/csv?${qp}`, "_blank");
  }

  function handleExportPdf() {
    window.print();
  }

  const hourStatusBadge = (pct: number) => {
    if (pct >= 90) return <span className="text-green-600">🟢</span>;
    if (pct >= 75) return <span className="text-amber-600">🟡</span>;
    return <span className="text-red-600">🔴</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Date Range</Label>
          <Select value={dateMode} onValueChange={(v) => setDateMode(v as any)} data-testid="select-date-range">
            <SelectTrigger className="w-40 h-8 text-sm" data-testid="select-date-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {dateMode === "custom" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-8 text-sm w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-8 text-sm w-36" />
            </div>
          </>
        )}
        {outlets.length > 1 && (
          <div className="space-y-1">
            <Label className="text-xs">Outlet</Label>
            <Select value={outletId || "all"} onValueChange={v => setOutletId(v === "all" ? "" : v)} data-testid="select-outlet-filter">
              <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-outlet-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outlets</SelectItem>
                {outlets.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            id: "kpi-avg-kitchen-time",
            title: "Avg Kitchen Time",
            value: kpis.avgKitchenMin != null ? `${Number(kpis.avgKitchenMin).toFixed(1)} min` : "—",
            target: kpis.targetKitchenMin ?? 15,
            actual: kpis.avgKitchenMin,
            lowerBetter: true,
          },
          {
            id: "kpi-avg-cycle-time",
            title: "Avg Cycle Time",
            value: kpis.avgCycleMin != null ? `${Number(kpis.avgCycleMin).toFixed(1)} min` : "—",
            target: kpis.targetCycleMin ?? 25,
            actual: kpis.avgCycleMin,
            lowerBetter: true,
          },
          {
            id: "kpi-on-time-rate",
            title: "On-Time Rate",
            value: kpis.onTimePct != null ? `${Math.round(kpis.onTimePct)}%` : "—",
            target: kpis.targetOnTimePct ?? 90,
            actual: kpis.onTimePct,
            lowerBetter: false,
            suffix: kpis.onTimePct >= (kpis.targetOnTimePct ?? 90) ? " ✅" : "",
          },
          {
            id: "kpi-fastest-order",
            title: "Fastest Order",
            value: kpis.fastestMin != null ? `${Number(kpis.fastestMin).toFixed(1)} min` : "—",
            target: null,
            actual: null,
            extra: kpis.fastestLabel,
          },
        ].map(kpi => {
          const isGood = kpi.actual == null ? null
            : kpi.lowerBetter ? kpi.actual <= kpi.target
            : kpi.actual >= kpi.target;
          const colorCls = isGood === null ? "text-muted-foreground"
            : isGood ? "text-green-600" : kpi.lowerBetter
              ? kpi.actual <= kpi.target * 1.1 ? "text-amber-600" : "text-red-600"
              : "text-red-600";
          return (
            <Card key={kpi.id} data-testid={kpi.id}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">{kpi.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${colorCls}`}>{kpi.value}{kpi.suffix}</div>
                {kpi.target != null && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Target: {kpi.lowerBetter ? kpi.target : `${kpi.target}%`}
                    {" "}{isGood === true ? "🟢" : isGood === false ? "🔴" : ""}
                  </div>
                )}
                {kpi.extra && <div className="text-xs text-muted-foreground mt-0.5">{kpi.extra}</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card data-testid="chart-time-waterfall">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Time Breakdown (Waterfall)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {waterfallChartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={waterfallChartData} layout="vertical" margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" fontSize={11} unit=" min" />
                  <YAxis type="category" dataKey="name" hide />
                  <Tooltip formatter={(v: any, name: string) => [`${v} min`, WATERFALL_LABELS[WATERFALL_KEYS.indexOf(name)] ?? name]} />
                  {WATERFALL_KEYS.map((key, i) => (
                    <Bar key={key} dataKey={key} stackId="a" fill={WATERFALL_COLORS[i]} radius={i === WATERFALL_KEYS.length - 1 ? [0, 4, 4, 0] : undefined}>
                      <Cell key={`cell-${key}`} fill={WATERFALL_COLORS[i]} />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-3">
                {WATERFALL_KEYS.map((key, i) => (
                  <div key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <div className="h-2.5 w-2.5 rounded-sm" style={{ background: WATERFALL_COLORS[i] }} />
                    {WATERFALL_LABELS[i]}
                  </div>
                ))}
              </div>
              {waterfall && (
                <div className="mt-3 text-sm font-medium text-muted-foreground border-t pt-2">
                  TOTAL: {waterfall.totalMin != null ? `${Number(waterfall.totalMin).toFixed(1)} min` : "—"}
                  {kpis.targetCycleMin && ` (Target: ${kpis.targetCycleMin} min)`}
                </div>
              )}
            </>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
              No data available for selected period
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Hourly Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table data-testid="table-hourly-performance">
            <TableHeader>
              <TableRow>
                <TableHead>Hour</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Avg Time</TableHead>
                <TableHead className="text-right">On-Time %</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byHour.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No data for selected period</TableCell>
                </TableRow>
              ) : byHour.map((row: any) => {
                const hour = Number(row.hour);
                const label = `${hour.toString().padStart(2, "0")}:00–${(hour + 1).toString().padStart(2, "0")}:00`;
                const onTimePct = row.onTimePct ?? 0;
                const isPeak = row.isPeak;
                return (
                  <TableRow
                    key={row.hour}
                    className={isPeak ? "bg-amber-50/50" : ""}
                    data-testid={`row-hour-${row.hour}`}
                  >
                    <TableCell className="font-medium text-sm">{label}{isPeak && <Badge variant="outline" className="ml-2 text-xs text-amber-700 border-amber-300">Peak</Badge>}</TableCell>
                    <TableCell className="text-right">{row.orderCount ?? 0}</TableCell>
                    <TableCell className="text-right">{row.avgTimeMin != null ? `${Number(row.avgTimeMin).toFixed(1)} min` : "—"}</TableCell>
                    <TableCell className="text-right">{onTimePct != null ? `${Math.round(onTimePct)}%` : "—"}</TableCell>
                    <TableCell>{hourStatusBadge(onTimePct)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Timer className="h-4 w-4 text-muted-foreground" />
            Per-Dish Time Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table data-testid="table-dish-performance">
            <TableHeader>
              <TableRow>
                <TableHead>Dish</TableHead>
                <TableHead className="text-right">Est.</TableHead>
                <TableHead className="text-right">Actual Avg</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead>Flag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byDish.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No data for selected period</TableCell>
                </TableRow>
              ) : byDish.map((row: any) => {
                const variance = row.variancePct != null ? Number(row.variancePct) : null;
                const flag = row.flag ?? (variance == null ? "ON TIME" : variance > 20 ? "ACTION" : variance > 10 ? "REVIEW" : "ON TIME");
                const flagConfig: Record<string, { label: string; cls: string }> = {
                  ON_TIME: { label: "🟢 ON TIME", cls: "text-green-600" },
                  ON_TIME_: { label: "🟢 ON TIME", cls: "text-green-600" },
                  REVIEW: { label: "🔴 REVIEW", cls: "text-red-600" },
                  ACTION: { label: "🚨 ACTION", cls: "text-red-700 font-bold" },
                };
                const fc = flagConfig[flag] ?? flagConfig["ON_TIME"];
                return (
                  <TableRow
                    key={row.menuItemId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedDish(row)}
                    data-testid={`row-dish-${row.menuItemId}`}
                  >
                    <TableCell className="font-medium">{row.menuItemName ?? row.menuItemId}</TableCell>
                    <TableCell className="text-right">{row.estimatedMin != null ? `${row.estimatedMin} min` : "—"}</TableCell>
                    <TableCell className="text-right">{row.actualAvgMin != null ? `${Number(row.actualAvgMin).toFixed(1)} min` : "—"}</TableCell>
                    <TableCell className="text-right">
                      {variance != null ? (
                        <span className={variance > 0 ? "text-red-600" : "text-green-600"}>
                          {variance > 0 ? "+" : ""}{variance.toFixed(0)}%
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{row.count ?? 0}</TableCell>
                    <TableCell className={`text-xs ${fc.cls}`}>{fc.label}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Star className="h-4 w-4 text-muted-foreground" />
            Chef Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table data-testid="table-chef-performance">
            <TableHeader>
              <TableRow>
                <TableHead>Chef</TableHead>
                <TableHead className="text-right">Dishes</TableHead>
                <TableHead className="text-right">Avg Time</TableHead>
                <TableHead className="text-right">vs Estimate</TableHead>
                <TableHead className="text-right">On-Time</TableHead>
                <TableHead>Rating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byChef.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No data for selected period</TableCell>
                </TableRow>
              ) : byChef.map((row: any) => {
                const onTimePct = row.onTimePct ?? 0;
                const stars = starRating(onTimePct);
                const variance = row.vsEstimatePct != null ? Number(row.vsEstimatePct) : null;
                return (
                  <TableRow key={row.chefId} data-testid={`row-chef-${row.chefId}`}>
                    <TableCell className="font-medium">{row.chefName ?? row.chefId}</TableCell>
                    <TableCell className="text-right">{row.dishCount ?? 0}</TableCell>
                    <TableCell className="text-right">{row.avgTimeMin != null ? `${Number(row.avgTimeMin).toFixed(1)} min` : "—"}</TableCell>
                    <TableCell className="text-right">
                      {variance != null ? (
                        <span className={variance > 0 ? "text-red-600" : "text-green-600"}>
                          {variance > 0 ? "+" : ""}{variance.toFixed(0)}%
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{onTimePct != null ? `${Math.round(onTimePct)}%` : "—"}</TableCell>
                    <TableCell><Stars count={stars} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {bottlenecks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Bottleneck Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2" data-testid="list-bottlenecks">
            {bottlenecks.map((b: any, i: number) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  b.severity === "high" ? "border-red-200 bg-red-50/50" :
                  b.severity === "medium" ? "border-amber-200 bg-amber-50/50" :
                  "border-border"
                }`}
                data-testid={`card-bottleneck-${i}`}
              >
                <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${b.severity === "high" ? "text-red-500" : "text-amber-500"}`} />
                <div>
                  <div className="text-sm font-medium">{b.description ?? b.message ?? "Bottleneck detected"}</div>
                  {b.detail && <div className="text-xs text-muted-foreground mt-0.5">{b.detail}</div>}
                </div>
                {b.severity && (
                  <Badge variant="outline" className={`ml-auto shrink-0 text-xs ${b.severity === "high" ? "border-red-300 text-red-700" : "border-amber-300 text-amber-700"}`}>
                    {b.severity}
                  </Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card data-testid="section-shift-report">
        <CardHeader>
          <CardTitle
            className="text-sm flex items-center justify-between cursor-pointer"
            onClick={() => setShiftOpen(o => !o)}
          >
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Shift Report
            </span>
            {shiftOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {shiftOpen && (
          <CardContent className="space-y-4">
            {shiftReport ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div><div className="text-muted-foreground text-xs">Total Orders</div><div className="font-bold text-lg">{shiftReport.totalOrders ?? 0}</div></div>
                  <div><div className="text-muted-foreground text-xs">On-Time</div><div className="font-bold text-lg text-green-600">{shiftReport.onTimeCount ?? 0}</div></div>
                  <div><div className="text-muted-foreground text-xs">Delayed</div><div className="font-bold text-lg text-red-600">{shiftReport.delayedCount ?? 0}</div></div>
                  <div><div className="text-muted-foreground text-xs">Avg Kitchen Time</div><div className="font-bold text-lg">{shiftReport.avgKitchenMin != null ? `${Number(shiftReport.avgKitchenMin).toFixed(1)} min` : "—"}</div></div>
                  <div><div className="text-muted-foreground text-xs">Avg Cycle Time</div><div className="font-bold text-lg">{shiftReport.avgCycleMin != null ? `${Number(shiftReport.avgCycleMin).toFixed(1)} min` : "—"}</div></div>
                  <div><div className="text-muted-foreground text-xs">Fastest Order</div><div className="font-bold text-lg">{shiftReport.fastestMin != null ? `${Number(shiftReport.fastestMin).toFixed(1)} min` : "—"}</div></div>
                  <div><div className="text-muted-foreground text-xs">Slowest Order</div><div className="font-bold text-lg">{shiftReport.slowestMin != null ? `${Number(shiftReport.slowestMin).toFixed(1)} min` : "—"}</div></div>
                </div>
                {shiftReport.topPerformers?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Top 3 Performers</div>
                    {shiftReport.topPerformers.slice(0, 3).map((c: any, i: number) => (
                      <div key={i} className="text-sm flex items-center gap-2">
                        <Stars count={starRating(c.onTimePct ?? 100)} />
                        <span>{c.chefName ?? c.chefId}</span>
                        <span className="text-muted-foreground">— {Math.round(c.onTimePct ?? 0)}% on-time</span>
                      </div>
                    ))}
                  </div>
                )}
                {shiftReport.needsAttention?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Needs Attention</div>
                    {shiftReport.needsAttention.map((c: any, i: number) => (
                      <div key={i} className="text-sm text-red-600 flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{c.chefName ?? c.chefId}</span>
                        <span className="text-muted-foreground">— {Math.round(c.onTimePct ?? 0)}% on-time</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 border-t pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExportCsv}
                    data-testid="button-export-csv"
                  >
                    <Download className="h-4 w-4 mr-1" />Export CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExportPdf}
                    data-testid="button-export-pdf"
                  >
                    <FileDown className="h-4 w-4 mr-1" />Export PDF
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-6 text-muted-foreground">Loading shift report...</div>
            )}
          </CardContent>
        )}
      </Card>

      <Dialog open={!!selectedDish} onOpenChange={v => !v && setSelectedDish(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedDish?.menuItemName ?? "Dish"} — Time Analysis</DialogTitle>
          </DialogHeader>
          {selectedDish && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-muted-foreground text-xs">Estimated</div><div className="font-bold">{selectedDish.estimatedMin} min</div></div>
                <div><div className="text-muted-foreground text-xs">Actual Avg</div><div className="font-bold">{selectedDish.actualAvgMin != null ? `${Number(selectedDish.actualAvgMin).toFixed(1)} min` : "—"}</div></div>
                <div><div className="text-muted-foreground text-xs">Total Orders</div><div className="font-bold">{selectedDish.count ?? 0}</div></div>
                <div><div className="text-muted-foreground text-xs">Variance</div><div className={`font-bold ${(selectedDish.variancePct ?? 0) > 0 ? "text-red-600" : "text-green-600"}`}>{selectedDish.variancePct != null ? `${(selectedDish.variancePct > 0 ? "+" : "")}${Number(selectedDish.variancePct).toFixed(0)}%` : "—"}</div></div>
              </div>
              {selectedDish.distribution && selectedDish.distribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={selectedDish.distribution}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="bucket" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">No distribution data available</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isExporting, setIsExporting] = useState(false);

  const { data: report, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/sales", fromDate, toDate],
    queryFn: async () => {
      const res = await fetch(`/api/reports/sales?from=${fromDate}&to=${toDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load report");
      return res.json();
    },
  });

  const { data: dashboardStats } = useQuery<any>({
    queryKey: ["/api/dashboard"],
  });

  const totals = report?.totals || {};
  const salesByDay = report?.salesByDay || [];
  const topItems = dashboardStats?.topItems || [];

  const chartData = useMemo(() =>
    salesByDay.map((d: any) => ({
      date: d.date ? format(new Date(d.date), "MMM dd") : "",
      revenue: Number(d.revenue || 0),
      orders: Number(d.orderCount || 0),
      refund: Number(d.refund || 0),
      netRevenue: Number(d.netRevenue ?? d.revenue ?? 0),
    })),
    [salesByDay]
  );

  const avgOrderValue = totals.orderCount && Number(totals.orderCount) > 0
    ? (Number(totals.revenue || 0) / Number(totals.orderCount)).toFixed(2)
    : "0.00";

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      const headers = ["Date", "Revenue", "Orders"];
      const rows = chartData.map((d: any) => [d.date, d.revenue.toFixed(2), d.orders]);
      const csv = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales-report-${fromDate}-to-${toDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
    }, 500);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
    >
      <div className="flex items-center justify-between">
        <PageTitle title="Sales Reports" />
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-reports-title">Reports</h1>
            <p className="text-muted-foreground">Sales analytics and performance insights</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              onClick={handleExport}
              data-testid="button-export-report"
              disabled={isExporting}
            >
              <motion.div
                animate={isExporting ? { y: [0, 4, 0] } : {}}
                transition={{ repeat: isExporting ? Infinity : 0, duration: 0.6 }}
              >
                <Download className="h-4 w-4 mr-2" />
              </motion.div>
              {isExporting ? "Exporting..." : "Export CSV"}
            </Button>
          </motion.div>
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              data-testid="button-download-pdf-sales"
              onClick={() => {
                const tenantName = user?.tenant?.name || "Restaurant";
                void exportToPdf({
                  title: "Sales Summary Report",
                  restaurantName: tenantName,
                  logoUrl: user?.tenant?.logo ?? null,
                  dateRange: `${fromDate} to ${toDate}`,
                  subtitle: `Total Revenue: ${fmt(Number(totals.revenue || 0))} | Orders: ${Number(totals.orderCount || 0)} | Avg Order: ${fmt(Number(avgOrderValue))}`,
                  columns: ["Date", "Revenue", "Orders"],
                  rows: chartData.map((d: { date: string; revenue: number; orders: number }) => [
                    d.date,
                    fmt(d.revenue),
                    d.orders,
                  ]),
                  filename: `sales-report-${fromDate}-to-${toDate}.pdf`,
                  footerNote: `Tax collected: ${fmt(Number(totals.tax || 0))} | Discounts: ${fmt(Number(totals.discount || 0))}`,
                });
              }}
            >
              <FileDown className="h-4 w-4 mr-2" /> Download PDF
            </Button>
          </motion.div>
        </div>
      </div>

      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList>
          <TabsTrigger value="sales" data-testid="tab-sales">
            <BarChart3 className="h-4 w-4 mr-2" />Sales
          </TabsTrigger>
          <TabsTrigger value="kitchen-time" data-testid="tab-kitchen-time">
            <Clock className="h-4 w-4 mr-2" />Kitchen Time
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kitchen-time">
          <KitchenTimeTab />
        </TabsContent>

        <TabsContent value="sales" className="space-y-6">

      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label>From</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            data-testid="input-report-from"
          />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            data-testid="input-report-to"
          />
        </div>
      </div>

      {isLoading ? (
        <CardGridSkeleton count={4} />
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Gross Revenue", value: fmt(Number(totals.revenue || 0)), icon: DollarSign, color: "text-green-600", bg: "bg-green-100", testId: "stat-total-revenue", delay: 0 },
          { title: "Total Orders", value: Number(totals.orderCount || 0), icon: ShoppingCart, color: "text-orange-500", bg: "bg-orange-100", testId: "stat-total-orders", delay: 0.1 },
          { title: "Avg Order Value", value: fmt(Number(avgOrderValue)), icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-100", testId: "stat-avg-order", delay: 0.2 },
          { title: "Tax Collected", value: fmt(Number(totals.tax || 0)), icon: Percent, color: "text-orange-600", bg: "bg-orange-100", testId: "stat-tax-collected", delay: 0.3 },
        ].map((stat) => (
          <motion.div
            key={stat.testId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: stat.delay }}
          >
            <StatCard
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              iconColor={stat.color}
              iconBg={stat.bg}
              testId={stat.testId}
            />
          </motion.div>
        ))}
      </div>
      )}

      {!isLoading && (report?.totalRefunded > 0 || report?.netRevenue !== undefined) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <StatCard
              title="Total Refunded"
              value={fmt(Number(report?.totalRefunded || 0))}
              icon={RotateCcw}
              iconColor="text-red-600"
              iconBg="bg-red-100"
              testId="stat-total-refunded"
            />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            <StatCard
              title="Refund Count"
              value={Number(report?.refundCount || 0)}
              icon={RotateCcw}
              iconColor="text-amber-600"
              iconBg="bg-amber-100"
              testId="stat-refund-count"
            />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <StatCard
              title="Net Revenue"
              value={fmt(Number(report?.netRevenue || 0))}
              icon={DollarSign}
              iconColor="text-teal-600"
              iconBg="bg-teal-100"
              testId="stat-net-revenue"
            />
          </motion.div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Revenue Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ChartSkeleton />
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(174, 65%, 32%)" stopOpacity={1} />
                        <stop offset="100%" stopColor="hsl(174, 65%, 32%)" stopOpacity={0.6} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      }}
                    />
                    <Bar
                      dataKey="revenue"
                      fill="url(#revenueGradient)"
                      radius={[4, 4, 0, 0]}
                      animationDuration={1200}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground" data-testid="text-no-chart-data">
                  No data for selected period
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Orders Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <ChartSkeleton />
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="orders"
                      stroke="hsl(12, 75%, 58%)"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "hsl(12, 75%, 58%)" }}
                      activeDot={{ r: 6 }}
                      animationDuration={1500}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data for selected period
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                Top Selling Items
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty Sold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">No data available</TableCell>
                    </TableRow>
                  ) : (
                    topItems.map((item: any, idx: number) => (
                      <TableRow key={idx} data-testid={`row-top-item-${idx}`} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="font-medium">{idx + 1}</TableCell>
                        <TableCell data-testid={`text-top-item-name-${idx}`}>{item.name}</TableCell>
                        <TableCell className="text-right" data-testid={`text-top-item-qty-${idx}`}>{Number(item.totalQty || 0)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Daily Sales Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Gross Revenue</TableHead>
                    <TableHead className="text-right text-red-600">Refunds</TableHead>
                    <TableHead className="text-right text-teal-700">Net Revenue</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                        <div className="flex justify-center gap-2 animate-pulse">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-4 bg-muted rounded w-16" />
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : chartData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                        No data for selected period
                      </TableCell>
                    </TableRow>
                  ) : (
                    chartData.map((day: any, idx: number) => (
                      <TableRow key={idx} data-testid={`row-daily-sales-${idx}`} className="hover:bg-muted/50 transition-colors">
                        <TableCell>{day.date}</TableCell>
                        <TableCell className="text-right">{fmt(day.revenue)}</TableCell>
                        <TableCell className="text-right text-red-600" data-testid={`text-day-refund-${idx}`}>
                          {day.refund > 0 ? `-${fmt(day.refund)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right text-teal-700 font-medium" data-testid={`text-day-net-${idx}`}>
                          {fmt(day.netRevenue ?? day.revenue)}
                        </TableCell>
                        <TableCell className="text-right">{day.orders}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900">
                  <Percent className="h-5 w-5 text-orange-600 dark:text-orange-300" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Discounts Given</p>
                  <p className="text-xl font-bold" data-testid="text-discounts-total">{fmt(Number(totals.discount || 0))}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
