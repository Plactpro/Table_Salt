import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@shared/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/widgets/stat-card";
import {
  ArrowDownCircle, ArrowUpCircle, RotateCcw, Package, Trash2,
  Filter, ChefHat, AlertTriangle, TrendingDown, Users,
  ChevronDown, ChevronUp,
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

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; badgeClass: string }> = {
  RECIPE_CONSUMPTION: { label: "Consumed", icon: <ArrowDownCircle className="h-3.5 w-3.5" />, badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  WASTAGE: { label: "Wastage", icon: <Trash2 className="h-3.5 w-3.5" />, badgeClass: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  STOCK_IN: { label: "Stock In", icon: <ArrowUpCircle className="h-3.5 w-3.5" />, badgeClass: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  ADJUSTMENT: { label: "Adjustment", icon: <Package className="h-3.5 w-3.5" />, badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  TRANSFER: { label: "Transfer", icon: <Package className="h-3.5 w-3.5" />, badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  RECIPE_REVERSAL: { label: "Reversal", icon: <RotateCcw className="h-3.5 w-3.5" />, badgeClass: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] || { label: type, icon: null, badgeClass: "bg-gray-100 text-gray-700" };
  return (
    <Badge variant="outline" className={`gap-1 text-xs font-medium ${cfg.badgeClass}`}>
      {cfg.icon}{cfg.label}
    </Badge>
  );
}

export default function StockMovementLog({ initialIngredientId }: { initialIngredientId?: string } = {}) {
  const { user } = useAuth();
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState({
    from: "", to: "", chefId: "", station: "", type: "", ingredientId: initialIngredientId || "",
  });
  const [applied, setApplied] = useState<typeof filters>({ from: "", to: "", chefId: "", station: "", type: "", ingredientId: initialIngredientId || "" });

  const fmt = (v: number) => {
    const tenant = user?.tenant;
    return formatCurrency(v, tenant?.currency || "AED", { position: (tenant?.currencyPosition as "before" | "after") || "before", decimals: tenant?.currencyDecimals ?? 2 });
  };

  const buildUrl = (f: typeof applied) => {
    const params = new URLSearchParams();
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    if (f.chefId) params.set("chefId", f.chefId);
    if (f.station) params.set("station", f.station);
    if (f.type && f.type !== "all") params.set("type", f.type);
    if (f.ingredientId) params.set("ingredientId", f.ingredientId);
    params.set("limit", "200");
    return `/api/stock-movements?${params}`;
  };

  const { data: movementsRaw, isLoading } = useQuery({
    queryKey: ["/api/stock-movements", applied],
    queryFn: () => apiRequest("GET", buildUrl(applied)).then(r => r.json()),
  });
  const movements: StockMovement[] = useMemo(() => {
    if (!movementsRaw) return [];
    if (Array.isArray(movementsRaw)) return movementsRaw as StockMovement[];
    const d = (movementsRaw as any)?.data;
    return Array.isArray(d) ? d : [];
  }, [movementsRaw]);

  const { data: inventoryRes } = useQuery<{ data: { id: string; name: string; currentStock: string | null; reorderLevel: string | null }[] }>({
    queryKey: ["/api/inventory", "lowstock"],
    queryFn: () => apiRequest("GET", "/api/inventory?limit=200").then(r => r.json()),
  });
  const inventory = inventoryRes?.data ?? [];

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const todayMovements = movements.filter(m => m.createdAt && new Date(m.createdAt) >= todayStart);
  const totalConsumedToday = todayMovements
    .filter(m => m.type === "RECIPE_CONSUMPTION")
    .reduce((sum, m) => sum + Math.abs(Number(m.quantity)) * Number(m.ingredientCostPrice || 0), 0);

  const totalWastageToday = todayMovements
    .filter(m => m.type === "WASTAGE")
    .reduce((sum, m) => sum + Math.abs(Number(m.quantity)) * Number(m.ingredientCostPrice || 0), 0);

  const lowStockCount = inventory.filter(i => Number(i.currentStock || 0) <= Number(i.reorderLevel || 0)).length;

  const chefActivityToday = useMemo(() => {
    const counts: Record<string, { name: string; count: number }> = {};
    for (const m of todayMovements) {
      if (!m.chefId || !m.chefName) continue;
      if (!counts[m.chefId]) counts[m.chefId] = { name: m.chefName, count: 0 };
      counts[m.chefId].count++;
    }
    return Object.values(counts).sort((a, b) => b.count - a.count)[0];
  }, [todayMovements]);

  const uniqueChefs = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of movements) {
      if (m.chefId && m.chefName) map[m.chefId] = m.chefName;
    }
    return Object.entries(map).map(([id, name]) => ({ id, name }));
  }, [movements]);

  const uniqueStations = useMemo(() => {
    const s = new Set<string>();
    for (const m of movements) { if (m.station) s.add(m.station); }
    return Array.from(s);
  }, [movements]);

  return (
    <div className="space-y-6" data-testid="stock-movement-log">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Consumed Today" value={fmt(totalConsumedToday)} icon={ArrowDownCircle} iconColor="text-orange-600" iconBg="bg-orange-100" testId="stat-consumed-today" />
        <StatCard title="Wastage Today" value={fmt(totalWastageToday)} icon={Trash2} iconColor="text-red-600" iconBg="bg-red-100" testId="stat-wastage-today" />
        <StatCard title="Low Stock Alerts" value={lowStockCount} icon={AlertTriangle} iconColor="text-amber-600" iconBg="bg-amber-100" testId="stat-low-stock" />
        <StatCard title="Most Active Chef" value={chefActivityToday?.name || "—"} icon={ChefHat} iconColor="text-primary" iconBg="bg-primary/10" testId="stat-active-chef" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" /> Filters
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowFilters(f => !f)} data-testid="button-toggle-filters">
              {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        {showFilters && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} className="h-8 text-xs" data-testid="filter-from" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} className="h-8 text-xs" data-testid="filter-to" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Chef</Label>
                <Select value={filters.chefId || "all"} onValueChange={v => setFilters(f => ({ ...f, chefId: v === "all" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="filter-chef">
                    <SelectValue placeholder="All chefs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All chefs</SelectItem>
                    {uniqueChefs.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Station</Label>
                <Select value={filters.station || "all"} onValueChange={v => setFilters(f => ({ ...f, station: v === "all" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="filter-station">
                    <SelectValue placeholder="All stations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stations</SelectItem>
                    {uniqueStations.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={filters.type || "all"} onValueChange={v => setFilters(f => ({ ...f, type: v === "all" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="filter-type">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ingredient</Label>
                <Select value={filters.ingredientId || "all"} onValueChange={v => setFilters(f => ({ ...f, ingredientId: v === "all" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="filter-ingredient">
                    <SelectValue placeholder="All ingredients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ingredients</SelectItem>
                    {inventory.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => setApplied(filters)} className="h-8" data-testid="button-apply-filters">
                Apply Filters
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => {
                const empty = { from: "", to: "", chefId: "", station: "", type: "", ingredientId: "" };
                setFilters(empty);
                setApplied(empty);
              }} data-testid="button-clear-filters">
                Clear
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              Stock Movements
            </span>
            <Badge variant="secondary" className="text-xs font-mono">{movements.length} records</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : movements.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-movements">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No movements found for the selected filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Time</TableHead>
                    <TableHead>Ingredient</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Chef</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map(m => {
                    const qty = Number(m.quantity);
                    return (
                      <TableRow key={m.id} data-testid={`row-movement-${m.id}`}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {m.createdAt ? new Date(m.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {m.ingredientName ?? m.itemId.slice(0, 8)}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-semibold tabular-nums ${qty < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                          {qty > 0 ? "+" : ""}{qty}{m.ingredientUnit ?? ""}
                        </TableCell>
                        <TableCell><TypeBadge type={m.type} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.orderNumber || (m.orderId ? `#${m.orderId.slice(-4)}` : "—")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {m.chefName ? (
                            <div className="flex items-center gap-1.5">
                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                {m.chefName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                              </div>
                              <span className="text-xs">{m.chefName}</span>
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          {m.station ? (
                            <Badge variant="outline" className="text-xs">{m.station}</Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={m.reason || ""}>
                          {m.reason || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
