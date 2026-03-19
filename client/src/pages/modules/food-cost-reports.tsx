import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@shared/currency";
import { Loader2, TrendingUp, DollarSign, AlertTriangle, CheckCircle, BarChart3, Activity, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MenuCategory } from "@shared/schema";

interface FoodCostRecipe {
  recipeId: string;
  recipeName: string;
  menuItemName: string | null;
  menuItemId: string | null;
  categoryId: string | null;
  sellingPrice: number;
  plateCost: number;
  margin: number;
  foodCostPct: number;
  soldQty: number;
  totalIdealCost: number;
}

interface VarianceRow {
  itemId: string;
  itemName: string;
  unit: string;
  idealUsage: number;
  actualUsage: number;
  varianceQty: number;
  currentStock: number;
  costPrice: number;
  idealCost: number;
  actualCost: number;
  varianceCost: number;
}

interface FoodCostReport {
  recipes: FoodCostRecipe[];
  summary: {
    totalCost: number;
    totalRevenue: number;
    avgFoodCostPct: number;
    totalSalesCost: number;
    totalSalesRevenue: number;
    salesWeightedFoodCostPct: number;
  };
  varianceByIngredient: VarianceRow[];
  topMovers: Array<{ itemId: string; itemName: string; usage: number; unit: string }>;
  reorderSuggestions: Array<{ itemId: string; itemName: string; currentStock: number; reorderLevel: number; parLevel: number; leadTimeDays: number; suggestedOrder: number; unit: string }>;
}

function foodCostBadge(pct: number) {
  if (pct <= 0) return <span className="text-muted-foreground text-xs">—</span>;
  if (pct > 50) return <Badge variant="destructive" className="text-xs">{pct.toFixed(1)}%</Badge>;
  if (pct > 35) return <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-xs">{pct.toFixed(1)}%</Badge>;
  return <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">{pct.toFixed(1)}%</Badge>;
}

function variancePct(row: VarianceRow): number {
  return row.idealUsage > 0 ? ((row.varianceQty / row.idealUsage) * 100) : 0;
}

function varianceColorClass(absPct: number): string {
  if (absPct > 15) return "text-red-600";
  if (absPct > 5) return "text-amber-600";
  return "text-green-600";
}

function varianceRowBg(absPct: number): string {
  if (absPct > 15) return "bg-red-50";
  if (absPct > 5) return "bg-amber-50/60";
  return "";
}

export default function FoodCostReports() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("profitability");
  const [sortBy, setSortBy] = useState<"foodCostPct" | "soldQty" | "margin" | "plateCost" | "sellingPrice">("foodCostPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const today = new Date();
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30);
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo.toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(today.toISOString().split("T")[0]);
  const [outletFilter, setOutletFilter] = useState("all");

  const fmt = (v: number) => {
    const tenant = user?.tenant;
    return formatCurrency(v, tenant?.currency || "AED", { position: (tenant?.currencyPosition as "before" | "after") || "before", decimals: tenant?.currencyDecimals ?? 2 });
  };

  const { data: report, isLoading } = useQuery<FoodCostReport>({
    queryKey: ["/api/food-cost-report", dateFrom, dateTo, outletFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (outletFilter !== "all") params.set("outletId", outletFilter);
      const res = await fetch(`/api/food-cost-report?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load food cost report");
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery<MenuCategory[]>({ queryKey: ["/api/menu-categories"] });
  const { data: outlets = [] } = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/outlets"] });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!report) return null;

  const { recipes, summary, varianceByIngredient, topMovers } = report;

  const filteredRecipes = recipes
    .filter(r => {
      if (searchTerm && !r.recipeName.toLowerCase().includes(searchTerm.toLowerCase()) && !(r.menuItemName || "").toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (categoryFilter !== "all" && r.categoryId !== categoryFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const valA = a[sortBy] ?? 0;
      const valB = b[sortBy] ?? 0;
      return sortDir === "desc" ? (valB as number) - (valA as number) : (valA as number) - (valB as number);
    });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const negVar = varianceByIngredient.filter(v => v.varianceQty > 0);
  const totalVarianceCost = varianceByIngredient.reduce((s, v) => s + v.varianceCost, 0);

  return (
    <div className="space-y-6" data-testid="food-cost-reports">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Avg Food Cost %", value: `${summary.avgFoodCostPct.toFixed(1)}%`, sub: "per recipe (unweighted)", icon: DollarSign, color: "text-amber-600" },
          { label: "Sales-Weighted Cost %", value: `${summary.salesWeightedFoodCostPct.toFixed(1)}%`, sub: "weighted by sold qty", icon: TrendingUp, color: "text-primary" },
          { label: "Total Ideal COGS", value: fmt(summary.totalSalesCost), sub: `vs ${fmt(summary.totalSalesRevenue)} revenue`, icon: BarChart3, color: "text-blue-600" },
          { label: "Usage Variance Cost", value: fmt(Math.abs(totalVarianceCost)), sub: totalVarianceCost > 0 ? "over-use detected" : "under budget", icon: totalVarianceCost > 0 ? AlertTriangle : CheckCircle, color: totalVarianceCost > 0 ? "text-red-600" : "text-green-600" },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className={`text-xl font-bold mt-0.5 ${stat.color}`} data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.sub}</p>
                </div>
                <stat.icon className={`h-5 w-5 mt-0.5 ${stat.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="food-cost-tabs">
          <TabsTrigger value="profitability" data-testid="tab-profitability">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Food Cost & Profitability
          </TabsTrigger>
          <TabsTrigger value="usage" data-testid="tab-theoretical-usage">
            <Activity className="h-3.5 w-3.5 mr-1.5" /> Theoretical Usage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profitability" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Search</Label>
              <Input
                placeholder="Recipe or menu item..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-48"
                data-testid="input-search-recipes"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-44" data-testid="select-category-filter">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Sort by</Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-44" data-testid="select-sort-recipes">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="foodCostPct">Food Cost %</SelectItem>
                  <SelectItem value="soldQty">Qty Sold</SelectItem>
                  <SelectItem value="margin">Margin</SelectItem>
                  <SelectItem value="plateCost">Plate Cost</SelectItem>
                  <SelectItem value="sellingPrice">Selling Price</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Direction</Label>
              <Select value={sortDir} onValueChange={(v) => setSortDir(v as "asc" | "desc")}>
                <SelectTrigger className="w-32" data-testid="select-sort-dir">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">High → Low</SelectItem>
                  <SelectItem value="asc">Low → High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground ml-auto self-end flex items-center gap-2 pb-1">
              <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" />{">"} 50%
              <span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-300 ml-1" />{"> 35%"}
              <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300 ml-1" /> OK
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {filteredRecipes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="text-no-recipes-report">
                  <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No recipes found. Add recipes in the Inventory → Recipes tab.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipe</TableHead>
                      <TableHead>Menu Item</TableHead>
                      <TableHead className="cursor-pointer hover:text-foreground" onClick={() => toggleSort("plateCost")}>
                        Plate Cost {sortBy === "plateCost" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                      </TableHead>
                      <TableHead className="cursor-pointer hover:text-foreground" onClick={() => toggleSort("sellingPrice")}>
                        Selling Price {sortBy === "sellingPrice" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                      </TableHead>
                      <TableHead className="cursor-pointer hover:text-foreground" onClick={() => toggleSort("foodCostPct")}>
                        Food Cost % {sortBy === "foodCostPct" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                      </TableHead>
                      <TableHead className="cursor-pointer hover:text-foreground" onClick={() => toggleSort("margin")}>
                        Margin {sortBy === "margin" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                      </TableHead>
                      <TableHead className="cursor-pointer hover:text-foreground" onClick={() => toggleSort("soldQty")}>
                        Sold {sortBy === "soldQty" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                      </TableHead>
                      <TableHead>Total Ideal COGS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecipes.map(r => {
                      const rowBg = r.foodCostPct > 50 ? "bg-red-50" : r.foodCostPct > 35 ? "bg-amber-50" : r.menuItemId ? "bg-green-50/30" : "";
                      return (
                        <TableRow key={r.recipeId} className={rowBg} data-testid={`row-report-${r.recipeId}`}>
                          <TableCell className="font-medium">{r.recipeName}</TableCell>
                          <TableCell>{r.menuItemName || <span className="text-muted-foreground text-xs">Not linked</span>}</TableCell>
                          <TableCell className="font-medium">{fmt(r.plateCost)}</TableCell>
                          <TableCell>{r.sellingPrice > 0 ? fmt(r.sellingPrice) : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                          <TableCell>{foodCostBadge(r.foodCostPct)}</TableCell>
                          <TableCell>
                            {r.sellingPrice > 0 ? (
                              <span className={r.margin >= 0 ? "text-green-700 font-medium" : "text-red-600 font-medium"}>{fmt(r.margin)}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>{r.soldQty > 0 ? <Badge variant="outline">{r.soldQty}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                          <TableCell>{r.soldQty > 0 ? fmt(r.totalIdealCost) : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" data-testid="input-date-from" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" data-testid="input-date-to" />
            </div>
            {outlets.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Outlet</Label>
                <Select value={outletFilter} onValueChange={setOutletFilter}>
                  <SelectTrigger className="w-44" data-testid="select-outlet-filter">
                    <SelectValue placeholder="All outlets" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Outlets</SelectItem>
                    {outlets.map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="text-xs text-muted-foreground ml-auto self-end pb-1 flex items-center gap-2">
              <Filter className="h-3 w-3" />
              <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" />{">"} 15% variance
              <span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-300 ml-1" />{">"} 5% variance
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Top Ingredient Movers</CardTitle>
                <CardDescription className="text-xs">Highest theoretical usage based on sales</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {topMovers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No data yet — place orders to generate theoretical usage</p>
                ) : topMovers.slice(0, 8).map((m, i) => (
                  <div key={m.itemId} className="flex items-center justify-between text-sm" data-testid={`top-mover-${m.itemId}`}>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      {m.itemName}
                    </span>
                    <span className="font-medium">{m.usage.toFixed(2)} {m.unit}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">High Variance Items</CardTitle>
                <CardDescription className="text-xs">Actual usage exceeds theoretical by most cost</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {negVar.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-green-600">No over-usage detected</p>
                ) : negVar.sort((a, b) => b.varianceCost - a.varianceCost).slice(0, 8).map(v => {
                  const pct = variancePct(v);
                  return (
                    <div key={v.itemId} className="flex items-center justify-between text-sm" data-testid={`variance-${v.itemId}`}>
                      <span>{v.itemName}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-xs ${pct > 15 ? "text-red-600 border-red-200 bg-red-50" : "text-amber-600 border-amber-200 bg-amber-50"}`}>
                          +{v.varianceQty.toFixed(2)} {v.unit} ({pct.toFixed(0)}%)
                        </Badge>
                        <span className="text-xs text-red-600 font-medium">{fmt(v.varianceCost)}</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ingredient Usage: Ideal vs. Actual</CardTitle>
              <CardDescription>
                Ideal usage calculated from recipes × sold quantities. Actual usage from stock movements.
                Rows highlighted red (&gt;15% variance) or amber (&gt;5% variance).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {varianceByIngredient.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground p-6" data-testid="text-no-variance">
                  <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No usage data yet. Theoretical usage populates after orders are placed.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ingredient</TableHead>
                      <TableHead className="text-right">Ideal Usage</TableHead>
                      <TableHead className="text-right">Actual Usage</TableHead>
                      <TableHead className="text-right">Variance (Qty)</TableHead>
                      <TableHead className="text-right">Variance %</TableHead>
                      <TableHead className="text-right">Variance (Cost)</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {varianceByIngredient.map(v => {
                      const isOver = v.varianceQty > 0;
                      const pct = variancePct(v);
                      const absPct = Math.abs(pct);
                      const colorCls = varianceColorClass(absPct);
                      const rowBg = varianceRowBg(absPct);
                      return (
                        <TableRow key={v.itemId} className={rowBg} data-testid={`variance-row-${v.itemId}`}>
                          <TableCell className="font-medium">{v.itemName}</TableCell>
                          <TableCell className="text-right">{v.idealUsage.toFixed(2)} {v.unit}</TableCell>
                          <TableCell className="text-right">{v.actualUsage.toFixed(2)} {v.unit}</TableCell>
                          <TableCell className={`text-right font-medium ${colorCls}`}>
                            {isOver ? "+" : ""}{v.varianceQty.toFixed(2)} {v.unit}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${colorCls}`}>
                            {isOver ? "+" : ""}{pct.toFixed(1)}%
                          </TableCell>
                          <TableCell className={`text-right font-medium ${colorCls}`}>
                            {isOver ? "+" : ""}{fmt(v.varianceCost)}
                          </TableCell>
                          <TableCell className="text-right">{v.currentStock.toFixed(2)} {v.unit}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
