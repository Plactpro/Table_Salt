import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sun, Sunset, Moon, Clock, ChevronDown, ChevronRight, Users, Package, AlertTriangle, TrendingDown } from "lucide-react";
import { formatCurrency } from "@shared/currency";
import type { Shift } from "@shared/schema";

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

interface ShiftSummary {
  shift: Shift | null;
  movements: StockMovement[];
  totalConsumed: number;
  totalWasted: number;
  consumedValue: number;
  wastedValue: number;
  chefs: Set<string>;
  ingredientBreakdown: Map<string, { name: string; qty: number; unit: string; value: number }>;
  stationBreakdown: Map<string, number>;
}

export default function ShiftReconciliation() {
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

  const params = new URLSearchParams({ from: fromDate, to: toDate });
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

  const shiftSummaries = useMemo(() => {
    const shiftMap = new Map<string, ShiftSummary>();

    const getOrCreate = (shiftId: string | null, shiftName: string): ShiftSummary => {
      const key = shiftId ?? "untagged";
      if (!shiftMap.has(key)) {
        const matchedShift = shifts.find(s => s.id === shiftId) ?? null;
        shiftMap.set(key, {
          shift: matchedShift,
          movements: [],
          totalConsumed: 0,
          totalWasted: 0,
          consumedValue: 0,
          wastedValue: 0,
          chefs: new Set(),
          ingredientBreakdown: new Map(),
          stationBreakdown: new Map(),
        });
      }
      return shiftMap.get(key)!;
    };

    for (const m of movements) {
      const shiftName = m.shiftId
        ? (shifts.find(s => s.id === m.shiftId)?.name ?? "Unknown Shift")
        : "Untagged";
      const summary = getOrCreate(m.shiftId, shiftName);
      summary.movements.push(m);

      const qty = Number(m.quantity);
      const cost = Number(m.ingredientCostPrice ?? 0) * qty;

      if (m.type === "deduction") {
        summary.totalConsumed += qty;
        summary.consumedValue += cost;
      } else if (m.type === "wastage") {
        summary.totalWasted += qty;
        summary.wastedValue += cost;
      }

      if (m.chefId) summary.chefs.add(m.chefId);

      if (m.itemId) {
        const existing = summary.ingredientBreakdown.get(m.itemId);
        if (existing) {
          existing.qty += qty;
          existing.value += cost;
        } else {
          summary.ingredientBreakdown.set(m.itemId, { name: m.ingredientName ?? m.itemId, qty, unit: m.ingredientUnit ?? "", value: cost });
        }
      }

      if (m.station) {
        summary.stationBreakdown.set(m.station, (summary.stationBreakdown.get(m.station) ?? 0) + qty);
      }
    }

    return Array.from(shiftMap.entries()).map(([key, summary]) => ({ key, ...summary }));
  }, [movements, shifts]);

  const totals = useMemo(() => ({
    consumed: shiftSummaries.reduce((a, s) => a + s.consumedValue, 0),
    wasted: shiftSummaries.reduce((a, s) => a + s.wastedValue, 0),
    movements: movements.length,
    chefs: new Set(movements.filter(m => m.chefId).map(m => m.chefId!)).size,
  }), [shiftSummaries, movements]);

  return (
    <div className="space-y-6" data-testid="shift-reconciliation">
      <div>
        <h2 className="text-xl font-semibold">Shift Reconciliation</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Stock movement summary per shift — consumption vs wastage</p>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-consumed-value">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Consumption</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totals.consumed)}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-total-wasted-value">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Wastage</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{formatCurrency(totals.wasted)}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-total-movements">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Stock Events</p>
            <p className="text-2xl font-bold mt-1">{totals.movements}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-active-chefs">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Active Chefs</p>
            <p className="text-2xl font-bold mt-1">{totals.chefs}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading data…</div>
      ) : shiftSummaries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No stock movements found for this period.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {shiftSummaries.map(summary => {
            const isExpanded = expandedShift === summary.key;
            const shiftName = summary.shift?.name ?? "Untagged Movements";
            const topIngredients = Array.from(summary.ingredientBreakdown.values())
              .sort((a, b) => b.value - a.value)
              .slice(0, 5);
            const topStations = Array.from(summary.stationBreakdown.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3);

            return (
              <Card key={summary.key} data-testid={`card-shift-summary-${summary.key}`}>
                <CardHeader
                  className="cursor-pointer select-none py-4"
                  onClick={() => setExpandedShift(isExpanded ? null : summary.key)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {summary.shift ? shiftIcon(shiftName) : <Clock className="h-4 w-4 text-muted-foreground" />}
                      <div>
                        <CardTitle className="text-base">{shiftName}</CardTitle>
                        {summary.shift && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatTime(summary.shift.startTime)} – {formatTime(summary.shift.endTime)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-muted-foreground">Consumed</p>
                        <p className="font-semibold text-sm">{formatCurrency(summary.consumedValue)}</p>
                      </div>
                      {summary.wastedValue > 0 && (
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-muted-foreground">Wasted</p>
                          <p className="font-semibold text-sm text-red-600">{formatCurrency(summary.wastedValue)}</p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Badge variant="secondary" className="text-xs">
                          <Package className="h-3 w-3 mr-1" />{summary.movements.length}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          <Users className="h-3 w-3 mr-1" />{summary.chefs.size}
                        </Badge>
                        {summary.wastedValue > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />Wastage
                          </Badge>
                        )}
                      </div>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 space-y-4 border-t">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
                      <div className="text-center p-3 bg-muted/30 rounded-lg">
                        <p className="text-xs text-muted-foreground">Consumed</p>
                        <p className="font-bold">{formatCurrency(summary.consumedValue)}</p>
                        <p className="text-xs text-muted-foreground">{summary.totalConsumed.toFixed(2)} units</p>
                      </div>
                      <div className="text-center p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                        <p className="text-xs text-muted-foreground">Wasted</p>
                        <p className="font-bold text-red-600">{formatCurrency(summary.wastedValue)}</p>
                        <p className="text-xs text-muted-foreground">{summary.totalWasted.toFixed(2)} units</p>
                      </div>
                      <div className="text-center p-3 bg-muted/30 rounded-lg">
                        <p className="text-xs text-muted-foreground">Events</p>
                        <p className="font-bold">{summary.movements.length}</p>
                      </div>
                      <div className="text-center p-3 bg-muted/30 rounded-lg">
                        <p className="text-xs text-muted-foreground">Chefs</p>
                        <p className="font-bold">{summary.chefs.size}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {topIngredients.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                            <TrendingDown className="h-3.5 w-3.5" />Top Consumed Ingredients
                          </p>
                          <div className="space-y-1">
                            {topIngredients.map(ing => (
                              <div key={ing.name} className="flex justify-between text-sm py-1 border-b last:border-0">
                                <span className="text-muted-foreground truncate">{ing.name}</span>
                                <span className="font-medium ml-2 shrink-0">
                                  {ing.qty.toFixed(2)} {ing.unit} · {formatCurrency(ing.value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {topStations.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold mb-2">By Station</p>
                          <div className="space-y-1">
                            {topStations.map(([station, qty]) => (
                              <div key={station} className="flex justify-between text-sm py-1 border-b last:border-0">
                                <span className="text-muted-foreground">{station}</span>
                                <Badge variant="secondary" className="text-xs">{qty.toFixed(2)} units</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-semibold mb-2">All Movements</p>
                      <div className="rounded-md border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Time</TableHead>
                              <TableHead>Ingredient</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Qty</TableHead>
                              <TableHead>Chef</TableHead>
                              <TableHead>Station</TableHead>
                              <TableHead>Value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {summary.movements.slice(0, 50).map(m => (
                              <TableRow key={m.id} data-testid={`row-movement-${m.id}`}>
                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                  {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                                </TableCell>
                                <TableCell className="font-medium text-sm">{m.ingredientName ?? "—"}</TableCell>
                                <TableCell>
                                  <Badge variant={m.type === "wastage" ? "destructive" : "secondary"} className="text-xs capitalize">
                                    {m.type}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm">{Number(m.quantity).toFixed(2)} {m.ingredientUnit ?? ""}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{m.chefName ?? "—"}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{m.station ?? "—"}</TableCell>
                                <TableCell className="text-sm">
                                  {m.ingredientCostPrice ? formatCurrency(Number(m.ingredientCostPrice) * Number(m.quantity)) : "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {summary.movements.length > 50 && (
                        <p className="text-xs text-muted-foreground text-center mt-2">Showing 50 of {summary.movements.length} movements</p>
                      )}
                    </div>
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
