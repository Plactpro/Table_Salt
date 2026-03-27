import { PageTitle } from "@/lib/accessibility";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sun, Sunset, Moon, Clock, ChevronDown, ChevronRight,
  Users, Package, AlertTriangle, TrendingDown, CheckCircle2,
} from "lucide-react";
import { formatCurrency } from "@shared/currency";
import type { Shift } from "@shared/schema";
import { useTranslation } from "react-i18next";

interface StockMovement {
  id: string;
  createdAt: string | null;
  tenantId: string;
  itemId: string;
  ingredientName: string | null;
  ingredientUnit: string | null;
  ingredientCostPrice: string | null;
  type: string;
  quantity: string;
  reason: string | null;
  orderId: string | null;
  orderNumber: string | null;
  chefId: string | null;
  chefName: string | null;
  station: string | null;
  shiftId: string | null;
  stockBefore: string | null;
  stockAfter: string | null;
}

interface IngredientRecon {
  itemId: string;
  name: string;
  unit: string;
  costPrice: number;
  openingStock: number;
  stockIn: number;
  used: number;
  wasted: number;
  expectedClosing: number;
  actualClosing: number;
  variance: number;
  variancePct: number;
  varianceValue: number;
}

function buildIngredientRecon(movements: StockMovement[]): IngredientRecon[] {
  const byItem = new Map<string, StockMovement[]>();
  for (const m of movements) {
    if (!m.itemId) continue;
    if (!byItem.has(m.itemId)) byItem.set(m.itemId, []);
    byItem.get(m.itemId)!.push(m);
  }

  const result: IngredientRecon[] = [];
  for (const [itemId, rows] of Array.from(byItem.entries())) {
    const sorted = [...rows].sort((a, b) =>
      new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const costPrice = Number(first.ingredientCostPrice ?? 0);

    const openingStock = Number(first.stockBefore ?? 0);
    const actualClosing = Number(last.stockAfter ?? 0);

    let stockIn = 0;
    let used = 0;
    let wasted = 0;

    for (const m of rows) {
      const qty = Number(m.quantity);
      const type = m.type?.toUpperCase();
      if (type === "RECIPE_CONSUMPTION") {
        used += Math.abs(qty);
      } else if (type === "WASTAGE") {
        wasted += Math.abs(qty);
      } else if (qty > 0) {
        stockIn += qty;
      }
    }

    const expectedClosing = openingStock + stockIn - used - wasted;
    const variance = actualClosing - expectedClosing;
    const variancePct = openingStock > 0 ? (variance / openingStock) * 100 : 0;
    const varianceValue = variance * costPrice;

    result.push({
      itemId,
      name: first.ingredientName ?? itemId,
      unit: first.ingredientUnit ?? "",
      costPrice,
      openingStock,
      stockIn,
      used,
      wasted,
      expectedClosing,
      actualClosing,
      variance,
      variancePct,
      varianceValue,
    });
  }

  return result.sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue));
}

function shiftIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("morning") || lower.includes("day")) return <Sun className="h-4 w-4 text-amber-500" />;
  if (lower.includes("evening") || lower.includes("afternoon")) return <Sunset className="h-4 w-4 text-orange-500" />;
  if (lower.includes("night") || lower.includes("graveyard")) return <Moon className="h-4 w-4 text-indigo-500" />;
  return <Clock className="h-4 w-4 text-primary" />;
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

function VarianceBadge({ variance, pct }: { variance: number; pct: number }) {
  if (Math.abs(variance) < 0.001) {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Balanced</Badge>;
  }
  if (variance < 0) {
    return <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />{pct.toFixed(1)}%</Badge>;
  }
  return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 text-xs">+{pct.toFixed(1)}%</Badge>;
}

export default function ShiftReconciliation() {
  const { t } = useTranslation("modules");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedShiftId, setSelectedShiftId] = useState("all");
  const [expandedShift, setExpandedShift] = useState<string | null>(null);

  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ["/api/shifts"],
    queryFn: () => apiRequest("GET", "/api/shifts").then(r => r.json()),
  });

  const params = new URLSearchParams({ from: fromDate, to: toDate, limit: "2000" });
  if (selectedShiftId !== "all") params.set("shiftId", selectedShiftId);

  const { data: movementsRaw, isLoading } = useQuery({
    queryKey: ["/api/stock-movements", fromDate, toDate, selectedShiftId],
    queryFn: () => apiRequest("GET", `/api/stock-movements?${params}`).then(r => r.json()),
  });

  const movements: StockMovement[] = useMemo(() => {
    if (!movementsRaw) return [];
    if (Array.isArray(movementsRaw)) return movementsRaw as StockMovement[];
    const d = (movementsRaw as any)?.data;
    return Array.isArray(d) ? d : [];
  }, [movementsRaw]);

  interface ShiftGroup {
    key: string;
    shift: Shift | null;
    movements: StockMovement[];
    consumedValue: number;
    wastedValue: number;
    chefs: Set<string>;
    recon: IngredientRecon[];
  }

  const shiftGroups = useMemo(() => {
    const map = new Map<string, ShiftGroup>();

    for (const m of movements) {
      const key = m.shiftId ?? "untagged";
      if (!map.has(key)) {
        const matchedShift = shifts.find(s => s.id === m.shiftId) ?? null;
        map.set(key, { key, shift: matchedShift, movements: [], consumedValue: 0, wastedValue: 0, chefs: new Set(), recon: [] });
      }
      const g = map.get(key)!;
      g.movements.push(m);
      const qty = Math.abs(Number(m.quantity));
      const cost = Number(m.ingredientCostPrice ?? 0) * qty;
      const type = m.type?.toUpperCase();
      if (type === "RECIPE_CONSUMPTION") g.consumedValue += cost;
      if (type === "WASTAGE") g.wastedValue += cost;
      if (m.chefId) g.chefs.add(m.chefId);
    }

    for (const g of Array.from(map.values())) {
      g.recon = buildIngredientRecon(g.movements);
    }

    return Array.from(map.values());
  }, [movements, shifts]);

  const totals = useMemo(() => ({
    consumed: shiftGroups.reduce((a, g) => a + g.consumedValue, 0),
    wasted: shiftGroups.reduce((a, g) => a + g.wastedValue, 0),
    movements: movements.length,
    chefs: new Set(movements.filter(m => m.chefId).map(m => m.chefId!)).size,
    variance: shiftGroups.reduce((a, g) => a + g.recon.reduce((b, r) => b + r.varianceValue, 0), 0),
  }), [shiftGroups, movements]);

  const fmt = (n: number, dp = 2) => n.toFixed(dp);

  return (
    <div className="space-y-6" data-testid="shift-reconciliation">
      <PageTitle title={t("shiftReconciliation")} />
      <div>
        <h2 className="text-xl font-semibold">Shift Reconciliation</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Per-ingredient stock balance: Opening → +In → −Used → −Waste → Expected vs Actual
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 text-sm w-36" data-testid="input-recon-from" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 text-sm w-36" data-testid="input-recon-to" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Shift</Label>
          <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
            <SelectTrigger className="h-8 text-sm w-40" data-testid="select-recon-shift">
              <SelectValue placeholder="All shifts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shifts</SelectItem>
              {shifts.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card data-testid="card-total-consumed-value">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Consumed</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(totals.consumed)}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-total-wasted-value">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Wastage</p>
            <p className="text-xl font-bold mt-1 text-red-600">{formatCurrency(totals.wasted)}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-total-movements">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Stock Events</p>
            <p className="text-xl font-bold mt-1">{totals.movements}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-active-chefs">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Active Chefs</p>
            <p className="text-xl font-bold mt-1">{totals.chefs}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-variance-value">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Unaccounted Loss</p>
            <p className={`text-xl font-bold mt-1 ${totals.variance < -0.01 ? "text-red-600" : "text-green-600"}`}>
              {formatCurrency(Math.abs(totals.variance))}
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading data…</div>
      ) : shiftGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No stock movements found for this period.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {shiftGroups.map(g => {
            const isExpanded = expandedShift === g.key;
            const shiftName = g.shift?.name ?? "Untagged Movements";
            const totalVarianceValue = g.recon.reduce((a, r) => a + r.varianceValue, 0);
            const hasIssues = g.recon.some(r => Math.abs(r.variance) > 0.01);

            return (
              <Card key={g.key} data-testid={`card-shift-summary-${g.key}`}>
                <CardHeader
                  className="cursor-pointer select-none py-4"
                  onClick={() => setExpandedShift(isExpanded ? null : g.key)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {g.shift ? shiftIcon(shiftName) : <Clock className="h-4 w-4 text-muted-foreground" />}
                      <div>
                        <CardTitle className="text-base">{shiftName}</CardTitle>
                        {g.shift && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatTime(g.shift.startTime)} – {formatTime(g.shift.endTime)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-muted-foreground">Consumed</p>
                        <p className="font-semibold text-sm">{formatCurrency(g.consumedValue)}</p>
                      </div>
                      {g.wastedValue > 0 && (
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-muted-foreground">Wasted</p>
                          <p className="font-semibold text-sm text-red-600">{formatCurrency(g.wastedValue)}</p>
                        </div>
                      )}
                      {Math.abs(totalVarianceValue) > 0.01 && (
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-muted-foreground">Variance</p>
                          <p className={`font-semibold text-sm ${totalVarianceValue < 0 ? "text-red-600" : "text-blue-600"}`}>
                            {totalVarianceValue < 0 ? "-" : "+"}{formatCurrency(Math.abs(totalVarianceValue))}
                          </p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Badge variant="secondary" className="text-xs">
                          <Package className="h-3 w-3 mr-1" />{g.movements.length}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          <Users className="h-3 w-3 mr-1" />{g.chefs.size}
                        </Badge>
                        {hasIssues && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />Variance
                          </Badge>
                        )}
                      </div>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 border-t">
                    <Tabs defaultValue="recon" className="mt-4">
                      <TabsList className="h-8">
                        <TabsTrigger value="recon" className="text-xs h-7">Stock Reconciliation</TabsTrigger>
                        <TabsTrigger value="movements" className="text-xs h-7">All Movements</TabsTrigger>
                      </TabsList>

                      <TabsContent value="recon" className="mt-3">
                        {g.recon.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-6 text-center">No ingredient data available.</p>
                        ) : (
                          <div className="rounded-md border overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/40">
                                  <TableHead className="text-xs font-semibold whitespace-nowrap">Ingredient</TableHead>
                                  <TableHead className="text-xs font-semibold text-right whitespace-nowrap">Opening</TableHead>
                                  <TableHead className="text-xs font-semibold text-right whitespace-nowrap text-blue-600">+In</TableHead>
                                  <TableHead className="text-xs font-semibold text-right whitespace-nowrap text-orange-600">−Used</TableHead>
                                  <TableHead className="text-xs font-semibold text-right whitespace-nowrap text-red-600">−Waste</TableHead>
                                  <TableHead className="text-xs font-semibold text-right whitespace-nowrap">Expected</TableHead>
                                  <TableHead className="text-xs font-semibold text-right whitespace-nowrap">Actual</TableHead>
                                  <TableHead className="text-xs font-semibold text-right whitespace-nowrap">Variance</TableHead>
                                  <TableHead className="text-xs font-semibold text-right whitespace-nowrap">Value Impact</TableHead>
                                  <TableHead className="text-xs font-semibold whitespace-nowrap">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {g.recon.map(r => {
                                  const isLoss = r.variance < -0.001;
                                  const isGain = r.variance > 0.001;
                                  return (
                                    <TableRow
                                      key={r.itemId}
                                      data-testid={`row-recon-${r.itemId}`}
                                      className={isLoss ? "bg-red-50/50 dark:bg-red-950/10" : isGain ? "bg-blue-50/30 dark:bg-blue-950/10" : ""}
                                    >
                                      <TableCell className="font-medium text-sm whitespace-nowrap">
                                        {r.name}
                                        <span className="text-xs text-muted-foreground ml-1">{r.unit}</span>
                                      </TableCell>
                                      <TableCell className="text-right text-sm tabular-nums">{fmt(r.openingStock)}</TableCell>
                                      <TableCell className="text-right text-sm tabular-nums text-blue-600">
                                        {r.stockIn > 0 ? `+${fmt(r.stockIn)}` : "—"}
                                      </TableCell>
                                      <TableCell className="text-right text-sm tabular-nums text-orange-600">
                                        {r.used > 0 ? `−${fmt(r.used)}` : "—"}
                                      </TableCell>
                                      <TableCell className="text-right text-sm tabular-nums text-red-600">
                                        {r.wasted > 0 ? `−${fmt(r.wasted)}` : "—"}
                                      </TableCell>
                                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{fmt(r.expectedClosing)}</TableCell>
                                      <TableCell className="text-right text-sm tabular-nums font-medium">{fmt(r.actualClosing)}</TableCell>
                                      <TableCell className={`text-right text-sm tabular-nums font-semibold ${isLoss ? "text-red-600" : isGain ? "text-blue-600" : "text-muted-foreground"}`}>
                                        {isLoss ? fmt(r.variance) : isGain ? `+${fmt(r.variance)}` : "0.00"}
                                      </TableCell>
                                      <TableCell className={`text-right text-sm tabular-nums ${isLoss ? "text-red-600" : "text-muted-foreground"}`}>
                                        {Math.abs(r.varianceValue) > 0.01 ? (isLoss ? `-${formatCurrency(Math.abs(r.varianceValue))}` : formatCurrency(r.varianceValue)) : "—"}
                                      </TableCell>
                                      <TableCell>
                                        <VarianceBadge variance={r.variance} pct={Math.abs(r.variancePct)} />
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}

                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-3">
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500/20 inline-block" />Used = Recipe Consumption</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/20 inline-block" />Waste = Reported Wastage</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block dark:bg-red-950/40" />Red row = unaccounted loss</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 inline-block dark:bg-blue-950/40" />Blue row = unaccounted gain</span>
                        </div>
                      </TabsContent>

                      <TabsContent value="movements" className="mt-3">
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Time</TableHead>
                                <TableHead className="text-xs">Ingredient</TableHead>
                                <TableHead className="text-xs">Type</TableHead>
                                <TableHead className="text-xs text-right">Qty</TableHead>
                                <TableHead className="text-xs text-right">Before</TableHead>
                                <TableHead className="text-xs text-right">After</TableHead>
                                <TableHead className="text-xs">Chef</TableHead>
                                <TableHead className="text-xs">Station</TableHead>
                                <TableHead className="text-xs text-right">Value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {g.movements.slice(0, 100).map(m => {
                                const qty = Number(m.quantity);
                                const type = m.type?.toUpperCase();
                                const badgeVariant = type === "WASTAGE" ? "destructive" : type === "RECIPE_CONSUMPTION" ? "secondary" : "outline";
                                const typeLabel = type === "RECIPE_CONSUMPTION" ? "Consumed" : type === "WASTAGE" ? "Waste" : type === "RECIPE_REVERSAL" ? "Reversed" : m.type ?? "—";
                                return (
                                  <TableRow key={m.id} data-testid={`row-movement-${m.id}`}>
                                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                      {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                                    </TableCell>
                                    <TableCell className="font-medium text-sm whitespace-nowrap">{m.ingredientName ?? "—"}</TableCell>
                                    <TableCell>
                                      <Badge variant={badgeVariant} className="text-xs">{typeLabel}</Badge>
                                    </TableCell>
                                    <TableCell className={`text-right text-sm tabular-nums font-medium ${qty < 0 ? "text-red-600" : "text-green-600"}`}>
                                      {qty > 0 ? "+" : ""}{fmt(qty)} {m.ingredientUnit ?? ""}
                                    </TableCell>
                                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                                      {m.stockBefore != null ? fmt(Number(m.stockBefore)) : "—"}
                                    </TableCell>
                                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                                      {m.stockAfter != null ? fmt(Number(m.stockAfter)) : "—"}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{m.chefName ?? "—"}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{m.station ?? "—"}</TableCell>
                                    <TableCell className="text-right text-sm">
                                      {m.ingredientCostPrice ? formatCurrency(Math.abs(Number(m.ingredientCostPrice) * qty)) : "—"}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        {g.movements.length > 100 && (
                          <p className="text-xs text-muted-foreground text-center mt-2">
                            Showing 100 of {g.movements.length} movements
                          </p>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
