import { PageTitle } from "@/lib/accessibility";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@shared/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChefHat, Utensils, TrendingDown, Trash2, Clock,
  AlertTriangle, CheckCircle, Package,
} from "lucide-react";

interface StockMovement {
  id: string;
  itemId: string;
  ingredientName: string | null;
  ingredientUnit: string | null;
  ingredientCostPrice: string | null;
  type: string;
  quantity: string;
  reason: string | null;
  orderId: string | null;
  orderNumber: string | null;
  menuItemId: string | null;
  chefId: string | null;
  chefName: string | null;
  station: string | null;
  shiftId: string | null;
  createdAt: string | null;
}

interface ChefSummary {
  chefId: string;
  chefName: string;
  station: string | null;
  dishCount: number;
  consumedValue: number;
  wastageValue: number;
  movements: StockMovement[];
  ingredientBreakdown: IngredientBreakdown[];
}

interface IngredientBreakdown {
  itemId: string;
  name: string;
  unit: string;
  used: number;
  usedValue: number;
}

export default function ChefReport() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<"today" | "week" | "month">("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expandedChef, setExpandedChef] = useState<string | null>(null);

  const fmt = (v: number) => {
    const tenant = user?.tenant;
    return formatCurrency(v, tenant?.currency || "AED", { position: (tenant?.currencyPosition as "before" | "after") || "before", decimals: tenant?.currencyDecimals ?? 2 });
  };

  const getDateParams = () => {
    if (from && to) return { from, to };
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    if (dateRange === "today") return { from: todayStr, to: todayStr };
    if (dateRange === "week") {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      return { from: d.toISOString().split("T")[0], to: todayStr };
    }
    const d = new Date(now); d.setDate(d.getDate() - 30);
    return { from: d.toISOString().split("T")[0], to: todayStr };
  };

  const params = getDateParams();
  const url = `/api/stock-movements?from=${params.from}&to=${params.to}&limit=500`;

  const { data: movementsRaw, isLoading } = useQuery({
    queryKey: ["/api/stock-movements/chef-report", params],
    queryFn: () => apiRequest("GET", url).then(r => r.json()),
  });
  const movements: StockMovement[] = useMemo(() => {
    if (!movementsRaw) return [];
    if (Array.isArray(movementsRaw)) return movementsRaw as StockMovement[];
    const d = (movementsRaw as any)?.data;
    return Array.isArray(d) ? d : [];
  }, [movementsRaw]);

  const chefSummaries = useMemo<ChefSummary[]>(() => {
    const byChef: Record<string, { name: string; station: string | null; movements: StockMovement[] }> = {};
    for (const m of movements) {
      if (!m.chefId || !m.chefName) continue;
      if (!byChef[m.chefId]) byChef[m.chefId] = { name: m.chefName, station: m.station, movements: [] };
      byChef[m.chefId].movements.push(m);
    }

    return Object.entries(byChef).map(([chefId, data]) => {
      const consumptions = data.movements.filter(m => m.type === "RECIPE_CONSUMPTION");
      const wastages = data.movements.filter(m => m.type === "WASTAGE");

      const dishCount = new Set(consumptions.map(m => m.orderId).filter(Boolean)).size;

      const consumedValue = consumptions.reduce((s, m) =>
        s + Math.abs(Number(m.quantity)) * Number(m.ingredientCostPrice || 0), 0);

      const wastageValue = wastages.reduce((s, m) =>
        s + Math.abs(Number(m.quantity)) * Number(m.ingredientCostPrice || 0), 0);

      const ingMap: Record<string, IngredientBreakdown> = {};
      for (const m of consumptions) {
        if (!m.itemId) continue;
        const name = m.ingredientName ?? m.itemId;
        const unit = m.ingredientUnit ?? "pcs";
        const costPrice = Number(m.ingredientCostPrice || 0);
        if (!ingMap[m.itemId]) ingMap[m.itemId] = { itemId: m.itemId, name, unit, used: 0, usedValue: 0 };
        ingMap[m.itemId].used += Math.abs(Number(m.quantity));
        ingMap[m.itemId].usedValue += Math.abs(Number(m.quantity)) * costPrice;
      }

      return {
        chefId, chefName: data.name, station: data.station,
        dishCount, consumedValue, wastageValue,
        movements: data.movements,
        ingredientBreakdown: Object.values(ingMap).sort((a, b) => b.usedValue - a.usedValue),
      };
    }).sort((a, b) => b.consumedValue - a.consumedValue);
  }, [movements]);

  return (
    <div className="space-y-6" data-testid="chef-report">
      <PageTitle title="Chef Report" />
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 rounded-lg border p-1 bg-muted/30">
          {(["today", "week", "month"] as const).map(r => (
            <Button
              key={r}
              size="sm"
              variant={dateRange === r ? "default" : "ghost"}
              className="h-7 text-xs capitalize"
              onClick={() => { setDateRange(r); setFrom(""); setTo(""); }}
              data-testid={`btn-range-${r}`}
            >
              {r === "today" ? "Today" : r === "week" ? "This Week" : "This Month"}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="space-y-0.5">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-xs w-32" data-testid="input-from-date" />
          </div>
          <div className="space-y-0.5">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 text-xs w-32" data-testid="input-to-date" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : chefSummaries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground" data-testid="text-no-chef-data">
          <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No chef activity found for this period.</p>
          <p className="text-xs mt-1 opacity-60">Chef data is recorded when items are started via the KDS.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {chefSummaries.map(chef => (
            <Card key={chef.chefId} data-testid={`card-chef-${chef.chefId}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                      {chef.chefName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold" data-testid={`text-chef-name-${chef.chefId}`}>{chef.chefName}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {chef.station && <Badge variant="outline" className="text-xs">{chef.station}</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-lg font-bold font-mono tabular-nums" data-testid={`text-dish-count-${chef.chefId}`}>{chef.dishCount}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Utensils className="h-3 w-3" />Orders</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-orange-600" data-testid={`text-consumed-${chef.chefId}`}>{fmt(chef.consumedValue)}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" />Consumed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-600" data-testid={`text-wastage-${chef.chefId}`}>{fmt(chef.wastageValue)}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Trash2 className="h-3 w-3" />Wastage</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedChef(expandedChef === chef.chefId ? null : chef.chefId)}
                      className="h-8 text-xs"
                      data-testid={`button-expand-chef-${chef.chefId}`}
                    >
                      {expandedChef === chef.chefId ? "Hide Details" : "View Details"}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expandedChef === chef.chefId && (
                <CardContent className="pt-0">
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      Ingredient Consumption Breakdown
                    </h4>
                    {chef.ingredientBreakdown.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No consumption data for this period.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="text-xs">
                            <TableHead>Ingredient</TableHead>
                            <TableHead className="text-right">Used</TableHead>
                            <TableHead className="text-right">Cost Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {chef.ingredientBreakdown.map(ing => (
                            <TableRow key={ing.itemId} data-testid={`row-ing-${ing.itemId}-${chef.chefId}`}>
                              <TableCell className="font-medium text-sm">{ing.name}</TableCell>
                              <TableCell className="text-right font-mono text-sm tabular-nums">
                                {ing.used.toFixed(2)}{ing.unit}
                              </TableCell>
                              <TableCell className="text-right font-medium text-sm">
                                {fmt(ing.usedValue)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}

                    <div className="mt-4">
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        Activity Timeline
                      </h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {chef.movements.slice(0, 20).map(m => {
                          const qty = Number(m.quantity);
                          return (
                            <div key={m.id} className="flex items-center gap-3 text-xs py-1 border-b border-dashed last:border-0">
                              <span className="text-muted-foreground whitespace-nowrap w-16 shrink-0">
                                {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                              </span>
                              <span className={`font-medium ${qty < 0 ? "text-red-600" : "text-green-600"}`}>
                                {qty > 0 ? "+" : ""}{qty}{m.ingredientUnit || ""}
                              </span>
                              <span className="flex-1 text-muted-foreground truncate">{m.ingredientName ?? "—"}</span>
                              {m.orderNumber && <Badge variant="outline" className="text-[10px] shrink-0">#{m.orderNumber}</Badge>}
                              {m.type === "WASTAGE" && <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 shrink-0"><Trash2 className="h-2.5 w-2.5 mr-0.5" />Waste</Badge>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
