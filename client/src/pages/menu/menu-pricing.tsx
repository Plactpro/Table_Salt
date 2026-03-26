import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Tag, Plus, Pencil, Trash2, Download, Upload, Copy, Settings2, AlertTriangle,
  CheckCircle2, TrendingUp, TrendingDown, Loader2, X, Eye,
} from "lucide-react";

interface Outlet { id: string; name: string; active: boolean; }
interface MenuItem { id: string; name: string; price: string; categoryId: string | null; }
interface MenuCategory { id: string; name: string; }
interface OutletMenuOverride { id: string; outletId: string; menuItemId: string; overridePrice: string | null; available: boolean; }
interface PriceRule {
  id: string;
  name: string;
  outlet_id: string | null;
  rule_type: string;
  condition_value: Record<string, unknown> | null;
  adjustment_type: string;
  adjustment_value: string;
  apply_to: string;
  apply_to_ref: string | null;
  priority: number;
  valid_from: string | null;
  valid_to: string | null;
  active: boolean;
}

const RULE_TYPES = [
  { value: "OUTLET_BASE", label: "Outlet Base Price" },
  { value: "ORDER_TYPE", label: "Order Type" },
  { value: "TIME_SLOT", label: "Time Slot" },
  { value: "DAY_BASED", label: "Day of Week" },
  { value: "CUSTOMER_SEGMENT", label: "Customer Segment" },
  { value: "EVENT", label: "Event" },
];

const ADJUSTMENT_TYPES = [
  { value: "fixed", label: "Fixed Price (₹)" },
  { value: "increase_pct", label: "Increase by %" },
  { value: "decrease_pct", label: "Decrease by %" },
  { value: "increase_fixed", label: "Increase by ₹" },
  { value: "decrease_fixed", label: "Decrease by ₹" },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getPriorityBadge(priority: number) {
  if (priority >= 8) return { label: `${priority}`, color: "bg-red-100 text-red-700 border-red-200" };
  if (priority >= 5) return { label: `${priority}`, color: "bg-orange-100 text-orange-700 border-orange-200" };
  if (priority >= 3) return { label: `${priority}`, color: "bg-yellow-100 text-yellow-700 border-yellow-200" };
  return { label: `${priority}`, color: "bg-green-100 text-green-700 border-green-200" };
}

function formatAdjustment(rule: PriceRule, fmt: (val: number | string) => string): string {
  const v = Number(rule.adjustment_value);
  switch (rule.adjustment_type) {
    case "fixed": return `= ${fmt(v)}`;
    case "increase_pct": return `+${v}%`;
    case "decrease_pct": return `-${v}%`;
    case "increase_fixed": return `+${fmt(v)}`;
    case "decrease_fixed": return `-${fmt(v)}`;
    default: return `${v}`;
  }
}

function formatCondition(rule: PriceRule): string {
  if (rule.rule_type === "ORDER_TYPE") {
    const cv = rule.condition_value as { orderType?: string } | null;
    return cv?.orderType ? `Order: ${cv.orderType.replace("_", "-")}` : "All order types";
  }
  if (rule.rule_type === "TIME_SLOT") {
    const cv = rule.condition_value as { startTime?: string; endTime?: string } | null;
    if (cv?.startTime && cv?.endTime) return `${cv.startTime}–${cv.endTime}`;
    return "Any time";
  }
  if (rule.rule_type === "DAY_BASED") {
    const cv = rule.condition_value as { days?: number[] } | null;
    if (cv?.days?.length) return cv.days.map(d => DAY_LABELS[d]).join(", ");
    return "All days";
  }
  if (rule.rule_type === "CUSTOMER_SEGMENT") {
    const cv = rule.condition_value as { segment?: string } | null;
    return cv?.segment || "Any segment";
  }
  return "—";
}

export default function MenuPricingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });

  const [tab, setTab] = useState("dish");
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>("");
  const [selectedOutletId, setSelectedOutletId] = useState<string>("");
  const [ruleSheetOpen, setRuleSheetOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PriceRule | null>(null);
  const [copyDialog, setCopyDialog] = useState(false);
  const [globalAdjDialog, setGlobalAdjDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [bulkEdits, setBulkEdits] = useState<Record<string, Record<string, string>>>({});
  const [csvData, setCsvData] = useState<{ menuItemId: string; menuItemName: string; price: string }[]>([]);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const { data: outlets = [] } = useQuery<Outlet[]>({
    queryKey: ["/api/pricing/outlets"],
    queryFn: async () => (await apiRequest("GET", "/api/pricing/outlets")).json(),
    staleTime: 60_000,
  });
  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items"],
    staleTime: 60_000,
  });
  const { data: categories = [] } = useQuery<MenuCategory[]>({
    queryKey: ["/api/menu-categories"],
    staleTime: 60_000,
  });

  const { data: dishView, isLoading: dishLoading } = useQuery<{
    menuItem: MenuItem;
    outlets: { outletId: string; outletName: string; basePrice: number; overridePrice: number | null; effectivePrice: number; rulesCount: number; ruleSummary: string | null }[];
  }>({
    queryKey: ["/api/pricing/dish-view", selectedMenuItemId],
    queryFn: async () => (await apiRequest("GET", `/api/pricing/dish-view/${selectedMenuItemId}`)).json(),
    enabled: !!selectedMenuItemId,
    staleTime: 10_000,
  });

  const { data: outletOverrides = [] } = useQuery<OutletMenuOverride[]>({
    queryKey: ["/api/pricing/overrides", selectedOutletId],
    queryFn: async () => (await apiRequest("GET", `/api/pricing/overrides?outletId=${selectedOutletId}`)).json(),
    enabled: !!selectedOutletId,
    staleTime: 10_000,
  });

  const { data: priceRules = [], isLoading: rulesLoading } = useQuery<PriceRule[]>({
    queryKey: ["/api/pricing/rules", selectedOutletId],
    queryFn: async () => (await apiRequest("GET", `/api/pricing/rules?outletId=${selectedOutletId}`)).json(),
    enabled: !!selectedOutletId,
    staleTime: 10_000,
  });

  const overrideMap = useMemo(() => {
    const map = new Map<string, OutletMenuOverride>();
    for (const o of outletOverrides) map.set(o.menuItemId, o);
    return map;
  }, [outletOverrides]);

  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c.name])), [categories]);

  const saveRuleMutation = useMutation({
    mutationFn: async (data: Partial<PriceRule> & { outletId?: string }) => {
      if (editingRule) {
        return (await apiRequest("PATCH", `/api/pricing/rules/${editingRule.id}`, data)).json();
      }
      return (await apiRequest("POST", "/api/pricing/rules", data)).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pricing/rules"] });
      setRuleSheetOpen(false);
      setEditingRule(null);
      toast({ title: "Rule saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/pricing/rules/${id}`)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pricing/rules"] });
      toast({ title: "Rule deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkSaveMutation = useMutation({
    mutationFn: async ({ outletId, updates }: { outletId: string; updates: { menuItemId: string; overridePrice: string }[] }) =>
      (await apiRequest("POST", "/api/pricing/overrides/bulk", { outletId, updates })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pricing/overrides"] });
      setBulkEdits({});
      toast({ title: "Prices saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const pendingEdits = Object.keys(bulkEdits).reduce((acc, itemId) => {
    const outletEdits = bulkEdits[itemId];
    return acc + Object.keys(outletEdits).length;
  }, 0);

  const handleCellEdit = (menuItemId: string, field: string, value: string) => {
    setBulkEdits(prev => ({
      ...prev,
      [menuItemId]: { ...(prev[menuItemId] || {}), [field]: value },
    }));
  };

  const handleBulkSave = () => {
    if (!selectedOutletId) return;
    const updates: { menuItemId: string; overridePrice: string }[] = [];
    for (const [menuItemId, edits] of Object.entries(bulkEdits)) {
      if (edits.price !== undefined) {
        updates.push({ menuItemId, overridePrice: edits.price });
      }
    }
    bulkSaveMutation.mutate({ outletId: selectedOutletId, updates });
  };

  const exportCsv = () => {
    if (!selectedOutletId) return;
    const outlet = outlets.find(o => o.id === selectedOutletId);
    const rows = [["Item Name", "Item ID", "Base Price", "Override Price"]];
    for (const item of menuItems) {
      const override = overrideMap.get(item.id);
      rows.push([item.name, item.id, item.price, override?.overridePrice || ""]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pricing-${outlet?.name || "outlet"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCsv = (content: string) => {
    const lines = content.trim().split("\n").slice(1);
    const parsed: { menuItemId: string; menuItemName: string; price: string }[] = [];
    for (const line of lines) {
      const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
      if (cols[1] && cols[3]) {
        parsed.push({ menuItemId: cols[1], menuItemName: cols[0], price: cols[3] });
      }
    }
    return parsed;
  };

  return (
    <div className="space-y-6 p-6" data-testid="menu-pricing-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tag className="h-6 w-6 text-teal-600" />
            Menu Pricing
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage outlet-specific prices, time-based rules, and bulk pricing tools
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} data-testid="pricing-tabs">
        <TabsList className="h-auto">
          <TabsTrigger value="dish" data-testid="tab-dish-view">Dish View</TabsTrigger>
          <TabsTrigger value="outlet" data-testid="tab-outlet-view">Outlet View</TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules-view">Rules View</TabsTrigger>
        </TabsList>

        <TabsContent value="dish" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Dish View — Per-Outlet Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs">
                <Label>Select Menu Item</Label>
                <Select value={selectedMenuItemId} onValueChange={setSelectedMenuItemId}>
                  <SelectTrigger data-testid="select-dish-item">
                    <SelectValue placeholder="Choose a menu item..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-80 overflow-y-auto z-50">
                    {menuItems.map(item => (
                      <SelectItem key={item.id} value={item.id} data-testid={`option-item-${item.id}`}>
                        {item.name} — {fmt(item.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedMenuItemId && dishLoading && (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading pricing data...</span>
                </div>
              )}

              {dishView && !dishLoading && (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm" data-testid="dish-outlet-table">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Outlet</th>
                        <th className="text-right px-4 py-2 font-medium">Base Price</th>
                        <th className="text-right px-4 py-2 font-medium">Override</th>
                        <th className="text-right px-4 py-2 font-medium">Effective</th>
                        <th className="text-left px-4 py-2 font-medium">Rules</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {dishView.outlets.map(row => (
                        <tr key={row.outletId} className="hover:bg-muted/30" data-testid={`dish-row-${row.outletId}`}>
                          <td className="px-4 py-2 font-medium">{row.outletName}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{fmt(row.basePrice)}</td>
                          <td className="px-4 py-2 text-right">
                            {row.overridePrice != null ? (
                              <span className="text-orange-600 font-medium">{fmt(row.overridePrice)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold">{fmt(row.effectivePrice)}</td>
                          <td className="px-4 py-2">
                            {row.rulesCount > 0 ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-teal-700 border-teal-300 bg-teal-50 cursor-help">
                                      {row.rulesCount} rule{row.rulesCount !== 1 ? "s" : ""}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>{row.ruleSummary || "Active rules"}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-muted-foreground text-xs">No rules</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!selectedMenuItemId && (
                <div className="text-center py-12 text-muted-foreground">
                  <Tag className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Select a menu item to see pricing across all outlets</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outlet" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="max-w-xs">
              <Label>Select Outlet</Label>
              <Select value={selectedOutletId} onValueChange={v => { setSelectedOutletId(v); setBulkEdits({}); }}>
                <SelectTrigger data-testid="select-outlet-view">
                  <SelectValue placeholder="Choose an outlet..." />
                </SelectTrigger>
                <SelectContent>
                  {outlets.map(o => (
                    <SelectItem key={o.id} value={o.id} data-testid={`option-outlet-${o.id}`}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedOutletId && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setCopyDialog(true)} data-testid="button-copy-outlet">
                  <Copy className="h-4 w-4 mr-1.5" />Copy from Outlet
                </Button>
                <Button variant="outline" size="sm" onClick={() => setImportDialog(true)} data-testid="button-import-csv">
                  <Upload className="h-4 w-4 mr-1.5" />Import CSV
                </Button>
                <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-csv">
                  <Download className="h-4 w-4 mr-1.5" />Export CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => setGlobalAdjDialog(true)} data-testid="button-global-adjustment">
                  <Settings2 className="h-4 w-4 mr-1.5" />Global Adjustment
                </Button>
                {pendingEdits > 0 && (
                  <Button size="sm" onClick={handleBulkSave} disabled={bulkSaveMutation.isPending} data-testid="button-save-all">
                    {bulkSaveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                    Save {pendingEdits} Change{pendingEdits !== 1 ? "s" : ""}
                  </Button>
                )}
              </div>
            )}
          </div>

          {selectedOutletId && (
            <Card>
              <CardContent className="p-0">
                <div className="rounded-lg border overflow-auto" data-testid="outlet-pricing-grid">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Item Name</th>
                        <th className="text-left px-4 py-2 font-medium">Category</th>
                        <th className="text-right px-4 py-2 font-medium">Base</th>
                        <th className="text-right px-4 py-2 font-medium w-32">Override Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {menuItems.map(item => {
                        const override = overrideMap.get(item.id);
                        const editVal = bulkEdits[item.id]?.price;
                        const displayVal = editVal !== undefined ? editVal : (override?.overridePrice || "");
                        return (
                          <tr key={item.id} className="hover:bg-muted/20" data-testid={`pricing-row-${item.id}`}>
                            <td className="px-4 py-1.5 font-medium">{item.name}</td>
                            <td className="px-4 py-1.5 text-muted-foreground text-xs">
                              {item.categoryId ? categoryMap.get(item.categoryId) || "—" : "—"}
                            </td>
                            <td className="px-4 py-1.5 text-right text-muted-foreground">{fmt(item.price)}</td>
                            <td className="px-4 py-1.5 text-right">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={displayVal}
                                onChange={e => handleCellEdit(item.id, "price", e.target.value)}
                                placeholder={item.price}
                                className="h-7 text-right text-sm w-28 ml-auto"
                                data-testid={`input-price-${item.id}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {!selectedOutletId && (
            <div className="text-center py-16 text-muted-foreground">
              <Settings2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Select an outlet to manage its pricing</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="rules" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="max-w-xs">
              <Label>Select Outlet</Label>
              <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
                <SelectTrigger data-testid="select-outlet-rules">
                  <SelectValue placeholder="Choose an outlet..." />
                </SelectTrigger>
                <SelectContent>
                  {outlets.map(o => (
                    <SelectItem key={o.id} value={o.id} data-testid={`option-outlet-rules-${o.id}`}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedOutletId && (
              <Button size="sm" onClick={() => { setEditingRule(null); setRuleSheetOpen(true); }} data-testid="button-add-rule">
                <Plus className="h-4 w-4 mr-1.5" />Add Price Rule
              </Button>
            )}
          </div>

          {selectedOutletId && rulesLoading && (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading rules...</span>
            </div>
          )}

          {selectedOutletId && !rulesLoading && (
            <Card>
              <CardContent className="p-0">
                {priceRules.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No price rules for this outlet yet.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => { setEditingRule(null); setRuleSheetOpen(true); }}>
                      <Plus className="h-4 w-4 mr-1.5" />Add First Rule
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-sm min-w-[800px]" data-testid="rules-table">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">Priority</th>
                          <th className="text-left px-4 py-2 font-medium">Name</th>
                          <th className="text-left px-4 py-2 font-medium">Type</th>
                          <th className="text-left px-4 py-2 font-medium">Condition</th>
                          <th className="text-right px-4 py-2 font-medium">Adjustment</th>
                          <th className="text-left px-4 py-2 font-medium">Applies To</th>
                          <th className="text-left px-4 py-2 font-medium">Valid Until</th>
                          <th className="text-left px-4 py-2 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {priceRules.sort((a, b) => b.priority - a.priority).map(rule => {
                          const badge = getPriorityBadge(rule.priority);
                          return (
                            <tr key={rule.id} className={`hover:bg-muted/20 ${!rule.active ? "opacity-50" : ""}`} data-testid={`rule-row-${rule.id}`}>
                              <td className="px-4 py-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${badge.color}`}>
                                  {rule.priority >= 8 ? "🔴" : rule.priority >= 5 ? "🟠" : rule.priority >= 3 ? "🟡" : "🟢"} {badge.label}
                                </span>
                              </td>
                              <td className="px-4 py-2 font-medium">{rule.name}</td>
                              <td className="px-4 py-2">
                                <span className="text-xs text-muted-foreground">
                                  {RULE_TYPES.find(t => t.value === rule.rule_type)?.label || rule.rule_type}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm text-muted-foreground">{formatCondition(rule)}</td>
                              <td className="px-4 py-2 text-right font-semibold text-teal-700">{formatAdjustment(rule, fmt)}</td>
                              <td className="px-4 py-2 text-xs text-muted-foreground capitalize">
                                {rule.apply_to === "all" ? "All items" : rule.apply_to === "category" ? `Category` : rule.apply_to === "specific_item" ? "Specific item" : rule.apply_to}
                              </td>
                              <td className="px-4 py-2 text-xs text-muted-foreground">
                                {rule.valid_to ? new Date(rule.valid_to).toLocaleDateString() : "No expiry"}
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingRule(rule); setRuleSheetOpen(true); }} data-testid={`button-edit-rule-${rule.id}`}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRuleMutation.mutate(rule.id)} data-testid={`button-delete-rule-${rule.id}`}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!selectedOutletId && (
            <div className="text-center py-16 text-muted-foreground">
              <Tag className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Select an outlet to view and manage price rules</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AddEditRuleSheet
        open={ruleSheetOpen}
        onOpenChange={v => { setRuleSheetOpen(v); if (!v) setEditingRule(null); }}
        editingRule={editingRule}
        outletId={selectedOutletId}
        menuItems={menuItems}
        categories={categories}
        onSave={(data) => saveRuleMutation.mutate({ ...data, outletId: selectedOutletId })}
        isSaving={saveRuleMutation.isPending}
        fmt={fmt}
      />

      <CopyOutletDialog
        open={copyDialog}
        onOpenChange={setCopyDialog}
        outlets={outlets}
        targetOutletId={selectedOutletId}
        onCopied={() => qc.invalidateQueries({ queryKey: ["/api/pricing/overrides"] })}
      />

      <GlobalAdjDialog
        open={globalAdjDialog}
        onOpenChange={setGlobalAdjDialog}
        outletId={selectedOutletId}
        categories={categories}
        menuItems={menuItems}
        onAdjusted={() => qc.invalidateQueries({ queryKey: ["/api/pricing/overrides"] })}
      />

      <ImportCsvDialog
        open={importDialog}
        onOpenChange={setImportDialog}
        outletId={selectedOutletId}
        onImported={() => qc.invalidateQueries({ queryKey: ["/api/pricing/overrides"] })}
        menuItems={menuItems}
      />
    </div>
  );
}

function AddEditRuleSheet({
  open, onOpenChange, editingRule, outletId, menuItems, categories, onSave, isSaving, fmt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingRule: PriceRule | null;
  outletId: string;
  menuItems: MenuItem[];
  categories: MenuCategory[];
  onSave: (data: any) => void;
  isSaving: boolean;
  fmt: (v: number | string) => string;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState("OUTLET_BASE");
  const [adjustmentType, setAdjustmentType] = useState("fixed");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [applyTo, setApplyTo] = useState("all");
  const [applyToRef, setApplyToRef] = useState("");
  const [priority, setPriority] = useState("5");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [condStartTime, setCondStartTime] = useState("12:00");
  const [condEndTime, setCondEndTime] = useState("15:00");
  const [condDays, setCondDays] = useState<number[]>([]);
  const [condOrderType, setCondOrderType] = useState("dine_in");
  const [condSegment, setCondSegment] = useState("regular");
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [impactPreview, setImpactPreview] = useState<{ name: string; before: number; after: number }[]>([]);

  useMemo(() => {
    if (!open) return;
    if (editingRule) {
      setName(editingRule.name);
      setRuleType(editingRule.rule_type);
      setAdjustmentType(editingRule.adjustment_type);
      setAdjustmentValue(editingRule.adjustment_value);
      setApplyTo(editingRule.apply_to);
      setApplyToRef(editingRule.apply_to_ref || "");
      setPriority(String(editingRule.priority));
      setValidFrom(editingRule.valid_from ? editingRule.valid_from.slice(0, 10) : "");
      setValidTo(editingRule.valid_to ? editingRule.valid_to.slice(0, 10) : "");
      const cv = editingRule.condition_value as any;
      if (cv?.startTime) setCondStartTime(cv.startTime);
      if (cv?.endTime) setCondEndTime(cv.endTime);
      if (cv?.days) setCondDays(cv.days);
      if (cv?.orderType) setCondOrderType(cv.orderType);
      if (cv?.segment) setCondSegment(cv.segment);
    } else {
      setName(""); setRuleType("OUTLET_BASE"); setAdjustmentType("fixed"); setAdjustmentValue("");
      setApplyTo("all"); setApplyToRef(""); setPriority("5"); setValidFrom(""); setValidTo("");
      setCondStartTime("12:00"); setCondEndTime("15:00"); setCondDays([]); setCondOrderType("dine_in"); setCondSegment("regular");
    }
    setConflictWarning(null);
    setImpactPreview([]);
  }, [open, editingRule]);

  const buildConditionValue = () => {
    if (ruleType === "TIME_SLOT") return { startTime: condStartTime, endTime: condEndTime };
    if (ruleType === "DAY_BASED") return { days: condDays };
    if (ruleType === "ORDER_TYPE") return { orderType: condOrderType };
    if (ruleType === "CUSTOMER_SEGMENT") return { segment: condSegment };
    return null;
  };

  const checkConflict = useCallback(async () => {
    if (!outletId || !ruleType) return;
    try {
      const res = await apiRequest("POST", "/api/pricing/conflict-check", {
        outletId, ruleType, conditionValue: buildConditionValue(), applyTo, applyToRef,
        excludeRuleId: editingRule?.id,
      });
      const data = await res.json();
      if (data.hasConflicts) {
        setConflictWarning(`Conflicts with: ${data.conflicts.map((c: any) => c.name).join(", ")}`);
      } else {
        setConflictWarning(null);
      }
    } catch {}
  }, [outletId, ruleType, applyTo, applyToRef, editingRule?.id]);

  const computePreview = useCallback(() => {
    if (!adjustmentValue || !menuItems.length) return;
    const sampleItems = menuItems
      .filter(m => {
        if (applyTo === "specific_item") return m.id === applyToRef;
        if (applyTo === "category") return m.categoryId === applyToRef;
        return true;
      })
      .slice(0, 4);
    const adjV = Number(adjustmentValue);
    const preview = sampleItems.map(item => {
      const before = Number(item.price);
      let after = before;
      if (adjustmentType === "fixed") after = adjV;
      else if (adjustmentType === "increase_pct") after = before * (1 + adjV / 100);
      else if (adjustmentType === "decrease_pct") after = before * (1 - adjV / 100);
      else if (adjustmentType === "increase_fixed") after = before + adjV;
      else if (adjustmentType === "decrease_fixed") after = before - adjV;
      return { name: item.name, before, after: Math.max(0, Math.round(after * 100) / 100) };
    });
    setImpactPreview(preview);
  }, [adjustmentValue, adjustmentType, applyTo, applyToRef, menuItems]);

  const handleSave = () => {
    if (!name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (!adjustmentValue) { toast({ title: "Adjustment value is required", variant: "destructive" }); return; }
    onSave({
      name,
      ruleType,
      adjustmentType,
      adjustmentValue: Number(adjustmentValue),
      applyTo,
      applyToRef: applyToRef || null,
      priority: Number(priority),
      validFrom: validFrom || null,
      validTo: validTo || null,
      conditionValue: buildConditionValue(),
      active: true,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col h-full overflow-hidden" data-testid="rule-sheet">
        <SheetHeader className="shrink-0">
          <SheetTitle>{editingRule ? "Edit Price Rule" : "Add Price Rule"}</SheetTitle>
          <SheetDescription>Configure how this rule adjusts prices for the selected outlet</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
          <div>
            <Label>Rule Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Lunch Special" data-testid="input-rule-name" />
          </div>
          <div>
            <Label>Apply To</Label>
            <Select value={applyTo} onValueChange={v => { setApplyTo(v); setApplyToRef(""); }}>
              <SelectTrigger data-testid="select-apply-to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                <SelectItem value="category">Category</SelectItem>
                <SelectItem value="specific_item">Specific Item</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {applyTo === "category" && (
            <div>
              <Label>Category</Label>
              <Select value={applyToRef} onValueChange={setApplyToRef}>
                <SelectTrigger data-testid="select-category-ref">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {applyTo === "specific_item" && (
            <div>
              <Label>Menu Item</Label>
              <Select value={applyToRef} onValueChange={setApplyToRef}>
                <SelectTrigger data-testid="select-item-ref">
                  <SelectValue placeholder="Select item..." />
                </SelectTrigger>
                <SelectContent>
                  {menuItems.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Rule Type</Label>
            <Select value={ruleType} onValueChange={v => { setRuleType(v); setConflictWarning(null); }}>
              <SelectTrigger data-testid="select-rule-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RULE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {ruleType === "TIME_SLOT" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Time</Label>
                <Input type="time" value={condStartTime} onChange={e => setCondStartTime(e.target.value)} data-testid="input-start-time" />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="time" value={condEndTime} onChange={e => setCondEndTime(e.target.value)} data-testid="input-end-time" />
              </div>
            </div>
          )}
          {ruleType === "DAY_BASED" && (
            <div>
              <Label>Days of Week</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DAY_LABELS.map((d, i) => (
                  <label key={i} className={`flex items-center gap-1 px-3 py-1 rounded-full border text-sm cursor-pointer transition-colors ${condDays.includes(i) ? "bg-teal-600 text-white border-teal-600" : "border-gray-200 text-muted-foreground"}`}>
                    <input type="checkbox" className="sr-only" checked={condDays.includes(i)} onChange={() => setCondDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])} data-testid={`checkbox-day-${i}`} />
                    {d}
                  </label>
                ))}
              </div>
            </div>
          )}
          {ruleType === "ORDER_TYPE" && (
            <div>
              <Label>Order Type</Label>
              <Select value={condOrderType} onValueChange={setCondOrderType}>
                <SelectTrigger data-testid="select-order-type-cond">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dine_in">Dine In</SelectItem>
                  <SelectItem value="takeaway">Takeaway</SelectItem>
                  <SelectItem value="delivery">Delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {ruleType === "CUSTOMER_SEGMENT" && (
            <div>
              <Label>Customer Segment</Label>
              <Select value={condSegment} onValueChange={setCondSegment}>
                <SelectTrigger data-testid="select-segment-cond">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="platinum">Platinum</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Price Adjustment *</Label>
            <div className="space-y-2 mt-1">
              <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                <SelectTrigger data-testid="select-adjustment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="number" min="0" step="0.01"
                value={adjustmentValue}
                onChange={e => setAdjustmentValue(e.target.value)}
                onBlur={() => { checkConflict(); computePreview(); }}
                placeholder="e.g., 50 or 10"
                data-testid="input-adjustment-value"
              />
            </div>
          </div>

          {conflictWarning && (
            <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm" data-testid="conflict-warning">
              <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
              <span className="text-orange-700">{conflictWarning}</span>
            </div>
          )}

          {impactPreview.length > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-2" data-testid="impact-preview">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Impact Preview</p>
              {impactPreview.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate mr-2 text-muted-foreground">{p.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="line-through text-muted-foreground">{fmt(p.before)}</span>
                    <span>→</span>
                    <span className={`font-medium ${p.after < p.before ? "text-green-700" : p.after > p.before ? "text-orange-700" : ""}`}>{fmt(p.after)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valid From</Label>
              <Input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} data-testid="input-valid-from" />
            </div>
            <div>
              <Label>Valid To (optional)</Label>
              <Input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} data-testid="input-valid-to" />
            </div>
          </div>
          <div>
            <Label>Priority (0 = lowest)</Label>
            <Input type="number" min="0" max="10" value={priority} onChange={e => setPriority(e.target.value)} data-testid="input-priority" />
          </div>
        </div>
        <SheetFooter className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-rule">Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-rule">
            {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            {editingRule ? "Update Rule" : "Add Rule"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CopyOutletDialog({ open, onOpenChange, outlets, targetOutletId, onCopied }: {
  open: boolean; onOpenChange: (v: boolean) => void; outlets: Outlet[]; targetOutletId: string; onCopied: () => void;
}) {
  const { toast } = useToast();
  const [sourceOutletId, setSourceOutletId] = useState("");
  const [adjustmentPct, setAdjustmentPct] = useState("0");
  const [preview, setPreview] = useState<{ menuItemId: string; menuItemName: string; sourcePrice: number; newPrice: number }[]>([]);
  const [isCopying, setIsCopying] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const fetchPreview = async () => {
    if (!sourceOutletId || !targetOutletId) return;
    setIsPreviewing(true);
    try {
      const res = await apiRequest("GET", `/api/pricing/copy-outlet?sourceOutletId=${sourceOutletId}&targetOutletId=${targetOutletId}&adjustmentPct=${adjustmentPct}`);
      const data = await res.json();
      setPreview(data.preview || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsPreviewing(false);
    }
  };

  const doCopy = async () => {
    if (!sourceOutletId || !targetOutletId) return;
    setIsCopying(true);
    try {
      const res = await apiRequest("POST", "/api/pricing/copy-outlet", { sourceOutletId, targetOutletId, adjustmentPct: Number(adjustmentPct) });
      const data = await res.json();
      toast({ title: `Copied ${data.copied} item overrides` });
      onCopied();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="copy-outlet-dialog">
        <DialogHeader>
          <DialogTitle>Copy Pricing from Outlet</DialogTitle>
          <DialogDescription>Copy price overrides from another outlet to the selected outlet</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Source Outlet</Label>
            <Select value={sourceOutletId} onValueChange={setSourceOutletId}>
              <SelectTrigger data-testid="select-source-outlet">
                <SelectValue placeholder="Select source..." />
              </SelectTrigger>
              <SelectContent>
                {outlets.filter(o => o.id !== targetOutletId).map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Price Adjustment (%)</Label>
            <Input type="number" value={adjustmentPct} onChange={e => setAdjustmentPct(e.target.value)} placeholder="0 = no adjustment, 10 = +10%" data-testid="input-copy-adjustment" />
          </div>
          <Button variant="outline" size="sm" onClick={fetchPreview} disabled={!sourceOutletId || isPreviewing} data-testid="button-preview-copy">
            {isPreviewing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Eye className="h-4 w-4 mr-1.5" />}
            Preview
          </Button>
          {preview.length > 0 && (
            <div className="rounded border overflow-auto max-h-48">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-1.5">Item</th>
                    <th className="text-right px-3 py-1.5">Source</th>
                    <th className="text-right px-3 py-1.5">New Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.map(p => (
                    <tr key={p.menuItemId}>
                      <td className="px-3 py-1">{p.menuItemName}</td>
                      <td className="px-3 py-1 text-right">₹{p.sourcePrice}</td>
                      <td className="px-3 py-1 text-right font-medium">₹{p.newPrice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={doCopy} disabled={!sourceOutletId || isCopying} data-testid="button-confirm-copy">
            {isCopying ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Copy Pricing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GlobalAdjDialog({ open, onOpenChange, outletId, categories, menuItems, onAdjusted }: {
  open: boolean; onOpenChange: (v: boolean) => void; outletId: string;
  categories: MenuCategory[]; menuItems: MenuItem[]; onAdjusted: () => void;
}) {
  const { toast } = useToast();
  const [adjustmentType, setAdjustmentType] = useState("increase_pct");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [roundTo, setRoundTo] = useState("1");
  const [scope, setScope] = useState("all");
  const [categoryId, setCategoryId] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  const previewCount = scope === "all" ? menuItems.length : scope === "category" ? menuItems.filter(m => m.categoryId === categoryId).length : 0;

  const doApply = async () => {
    if (!adjustmentValue) return;
    setIsApplying(true);
    try {
      const body: any = { outletId, adjustmentType, adjustmentValue: Number(adjustmentValue), roundTo: Number(roundTo) };
      if (scope === "category" && categoryId) body.categoryId = categoryId;
      const res = await apiRequest("POST", "/api/pricing/global-adjustment", body);
      const data = await res.json();
      toast({ title: `Adjusted ${data.adjusted} prices` });
      onAdjusted();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="global-adj-dialog">
        <DialogHeader>
          <DialogTitle>Global Price Adjustment</DialogTitle>
          <DialogDescription>Apply a bulk price change across items</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger data-testid="select-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items in Outlet</SelectItem>
                <SelectItem value="category">By Category</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "category" && (
            <div>
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger data-testid="select-adj-category">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Adjustment Type</Label>
            <Select value={adjustmentType} onValueChange={setAdjustmentType}>
              <SelectTrigger data-testid="select-adj-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="increase_pct">Increase by %</SelectItem>
                <SelectItem value="decrease_pct">Decrease by %</SelectItem>
                <SelectItem value="increase_fixed">Increase by Fixed Amount</SelectItem>
                <SelectItem value="decrease_fixed">Decrease by Fixed Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Value</Label>
            <Input type="number" min="0" value={adjustmentValue} onChange={e => setAdjustmentValue(e.target.value)} placeholder="e.g., 10" data-testid="input-adj-value" />
          </div>
          <div>
            <Label>Round to nearest</Label>
            <Select value={roundTo} onValueChange={setRoundTo}>
              <SelectTrigger data-testid="select-round-to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">₹1</SelectItem>
                <SelectItem value="5">₹5</SelectItem>
                <SelectItem value="10">₹10</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {adjustmentValue && (
            <p className="text-sm text-muted-foreground" data-testid="preview-count">
              Will adjust prices for <strong>{previewCount}</strong> item{previewCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={doApply} disabled={!adjustmentValue || isApplying} data-testid="button-apply-adjustment">
            {isApplying ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Apply Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportCsvDialog({ open, onOpenChange, outletId, onImported, menuItems }: {
  open: boolean; onOpenChange: (v: boolean) => void; outletId: string;
  onImported: () => void; menuItems: MenuItem[];
}) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<{ menuItemId: string; menuItemName: string; price: string; valid: boolean }[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuMap = useMemo(() => new Map(menuItems.map(m => [m.id, m])), [menuItems]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const lines = content.trim().split("\n").slice(1);
      const parsed = lines.map(line => {
        const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
        const menuItemId = cols[1];
        const price = cols[3];
        const item = menuMap.get(menuItemId);
        return {
          menuItemId,
          menuItemName: cols[0] || item?.name || "Unknown",
          price,
          valid: !!item && !!price && !isNaN(Number(price)),
        };
      });
      setPreview(parsed);
    };
    reader.readAsText(file);
  };

  const doImport = async () => {
    const validItems = preview.filter(p => p.valid);
    if (!validItems.length) return;
    setIsImporting(true);
    try {
      const updates = validItems.map(p => ({ menuItemId: p.menuItemId, overridePrice: p.price }));
      await apiRequest("POST", "/api/pricing/overrides/bulk", { outletId, updates });
      toast({ title: `Imported ${validItems.length} price overrides` });
      onImported();
      onOpenChange(false);
      setPreview([]);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="import-csv-dialog">
        <DialogHeader>
          <DialogTitle>Import Prices from CSV</DialogTitle>
          <DialogDescription>Upload a CSV with columns: Item Name, Item ID, Base Price, Override Price</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" data-testid="input-csv-file" />
            <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="button-choose-csv">
              <Upload className="h-4 w-4 mr-1.5" />Choose CSV File
            </Button>
          </div>
          {preview.length > 0 && (
            <div className="rounded border overflow-auto max-h-56">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-1.5">Item</th>
                    <th className="text-right px-3 py-1.5">New Price</th>
                    <th className="text-center px-3 py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.map((p, i) => (
                    <tr key={i} className={!p.valid ? "bg-red-50" : ""} data-testid={`csv-row-${i}`}>
                      <td className="px-3 py-1">{p.menuItemName}</td>
                      <td className="px-3 py-1 text-right">{p.price || "—"}</td>
                      <td className="px-3 py-1 text-center">
                        {p.valid
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mx-auto" />
                          : <X className="h-3.5 w-3.5 text-red-500 mx-auto" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {preview.filter(p => p.valid).length} valid / {preview.filter(p => !p.valid).length} invalid rows
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={doImport} disabled={!preview.some(p => p.valid) || isImporting} data-testid="button-confirm-import">
            {isImporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Confirm Import ({preview.filter(p => p.valid).length} rows)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
