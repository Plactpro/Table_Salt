import { PageTitle } from "@/lib/accessibility";
import { useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLocation, useSearchParams } from "wouter";
import SupervisorApprovalDialog from "@/components/supervisor-approval-dialog";
import { ConfirmLeaveDialog } from "@/components/confirm-leave-dialog";
import { formatCurrency } from "@shared/currency";
import { convertUnits } from "@shared/units";
import type { InventoryItem, MenuItem, Recipe, RecipeIngredient } from "@shared/schema";
import { selectPageData, type PaginatedResponse } from "@/lib/api-types";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, Plus, Search, AlertTriangle, Edit, Trash2, ArrowUpDown,
  Warehouse, BoxIcon, TrendingDown, ChefHat, ClipboardList, DollarSign,
  BookOpen, X, Percent, Activity, ChevronLeft, ChevronRight, FileDown, ChevronDown, ChevronUp,
  ArrowDownCircle, ArrowUpCircle, RotateCcw, ShoppingCart, ExternalLink,
} from "lucide-react";
import { TableSkeleton } from "@/components/ui/skeletons";
import { useDirtyFormGuard, scrollToFirstError } from "@/lib/form-utils";
import { CharCountTextarea } from "@/components/ui/character-count-input";
import { exportToPdf } from "@/lib/pdf-export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { StatCard } from "@/components/widgets/stat-card";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "react-i18next";

const ITEM_CATEGORIES = ["INGREDIENT", "CROCKERY", "CUTLERY", "GLASSWARE"] as const;
type ItemCategory = typeof ITEM_CATEGORIES[number];

function isPieceCategory(cat: string) {
  return cat === "CROCKERY" || cat === "CUTLERY" || cat === "GLASSWARE";
}

function formatStock(stock: number, unit: string | null) {
  if (unit === "pcs" || isPieceCategory(unit || "")) {
    return Math.round(stock).toString() + " pcs";
  }
  return stock.toFixed(1) + " " + (unit || "");
}

function StockBar({ current, reorder }: { current: number; reorder: number }) {
  const max = Math.max(current, reorder * 2, 1);
  const pct = Math.min((current / max) * 100, 100);
  const isLow = current <= reorder;
  return (
    <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`h-full rounded-full ${isLow ? "bg-red-500" : pct > 60 ? "bg-green-500" : "bg-yellow-500"}`}
      />
    </div>
  );
}

interface ParCheckItem {
  itemId: string;
  itemName: string;
  category: string;
  currentStock: number;
  parLevelPerShift: number;
  reorderPieces: number;
  status: "OK" | "BELOW_PAR" | "BELOW_REORDER";
}

function ParLevelStatusPanel({ outletId }: { outletId?: string }) {
  const [open, setOpen] = useState(true);
  const { user } = useAuth();
  const { t } = useTranslation("modules");

  const id = outletId || user?.outletId || "";
  const { data: parItems = [], isLoading, isError } = useQuery<ParCheckItem[]>({
    queryKey: ["/api/inventory/par-check", id],
    queryFn: async () => {
      const url = id ? `/api/inventory/par-check/${id}` : "/api/inventory/par-check";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("No par-check endpoint");
      const rows = await res.json();
      return (rows ?? []).map((r: any) => ({
        itemId: r.id,
        itemName: r.name,
        category: r.item_category,
        currentStock: r.currentStock,
        parLevelPerShift: r.parLevelPerShift,
        reorderPieces: r.reorderPieces,
        status: r.isBelowPar ? "BELOW_PAR" : r.isBelowReorder ? "BELOW_REORDER" : "OK",
      }));
    },
    retry: false,
  });

  if (isError || (parItems.length === 0 && !isLoading)) return null;

  return (
    <Card data-testid="section-par-status">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpen(p => !p)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Par Level Status — Crockery &amp; Glassware
          </CardTitle>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-2">Loading par levels...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Par/Shift</TableHead>
                  <TableHead>{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(parItems ?? []).map(item => (
                  <TableRow key={item.itemId} data-testid={`row-par-${item.itemId}`}>
                    <TableCell className="font-medium">{item.itemName}</TableCell>
                    <TableCell className="text-right">{Math.round(item.currentStock)} pcs</TableCell>
                    <TableCell className="text-right">{Math.round(item.parLevelPerShift)} pcs</TableCell>
                    <TableCell>
                      {item.status === "OK" ? (
                        <Badge variant="secondary" className="text-green-700 bg-green-100" data-testid={`badge-par-status-${item.itemId}`}>✅ OK</Badge>
                      ) : item.status === "BELOW_PAR" ? (
                        <Badge variant="destructive" data-testid={`badge-par-status-${item.itemId}`}>🔴 Below par</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-300" data-testid={`badge-par-status-${item.itemId}`}>🟡 Below par</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      )}
    </Card>
  );
}

type ExtendedInventoryItem = InventoryItem & {
  itemCategory?: string | null;
  unitType?: string | null;
  parLevelPerShift?: string | null;
  reorderPieces?: string | null;
  costPerPiece?: string | null;
};

type ExtendedFormData = {
  name: string;
  sku: string;
  category: string;
  unit: string;
  currentStock: string;
  reorderLevel: string;
  costPrice: string;
  supplier: string;
  // FIX: declare fields that were present in resetForm/openEditDialog but missing from the type
  expiryDate: string;
  expiryAlertDays: string;
  receivedDate: string;
  itemCategory: ItemCategory;
  parLevelPerShift: string;
  reorderPieces: string;
  costPerPiece: string;
};

type InventoryItemPayload = Omit<ExtendedFormData, "parLevelPerShift" | "reorderPieces" | "expiryAlertDays"> & {
  parLevelPerShift: number | null;
  reorderPieces: number | null;
  expiryAlertDays: number | null;
};

const CATEGORY_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "INGREDIENT", label: "Food" },
  { value: "CROCKERY", label: "Crockery" },
  { value: "CUTLERY", label: "Cutlery" },
  { value: "GLASSWARE", label: "Glassware" },
];

const TEST_IDS: Record<string, string> = {
  ALL: "tab-filter-all",
  INGREDIENT: "tab-filter-food",
  CROCKERY: "tab-filter-crockery",
  CUTLERY: "tab-filter-cutlery",
  GLASSWARE: "tab-filter-glassware",
};

function InventoryTab() {
  const { t } = useTranslation("inventory");
  const { t: tc } = useTranslation("common");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemFormDirty, setItemFormDirty] = useState(false);
  useDirtyFormGuard(itemFormDirty);
  const [itemConfirmLeave, setItemConfirmLeave] = useState(false);
  const [inventoryFormErrors, setInventoryFormErrors] = useState<{ name?: string }>({});
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustFormDirty, setAdjustFormDirty] = useState(false);
  const [adjustConfirmLeave, setAdjustConfirmLeave] = useState(false);
  const [editingItem, setEditingItem] = useState<ExtendedInventoryItem | null>(null);
  const [adjustingItem, setAdjustingItem] = useState<ExtendedInventoryItem | null>(null);
  const [formData, setFormData] = useState<ExtendedFormData>({
    name: "", sku: "", category: "", unit: "pcs", currentStock: "0", reorderLevel: "10",
    costPrice: "0", supplier: "", expiryDate: "", expiryAlertDays: "7", receivedDate: "",
    itemCategory: "INGREDIENT", parLevelPerShift: "", reorderPieces: "", costPerPiece: "",
  });
  const [adjustData, setAdjustData] = useState({ type: "in" as "in" | "out", quantity: "", reason: "" });
  const [supervisorDialog, setSupervisorDialog] = useState<{
    open: boolean; action: string; actionLabel: string;
    pendingData: { id: string; data: { type: string; quantity: string; reason: string } } | null;
  } | null>(null);
  const [inventoryPage, setInventoryPage] = useState(0);
  const INVENTORY_LIMIT = 50;

  const fmt = (v: number) => {
    const tenant = user?.tenant;
    return formatCurrency(v, tenant?.currency || "AED", { position: (tenant?.currencyPosition as "before" | "after") || "before", decimals: tenant?.currencyDecimals ?? 2 });
  };

  const { data: expiringItems = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory/expiring"],
    queryFn: async () => {
      const res = await fetch("/api/inventory/expiring?days=7", { credentials: "include" });
      if (!res.ok) return [];
      const json = await res.json();
      // FIX: guard against non-array response before returning
      return Array.isArray(json) ? json : [];
    },
    refetchInterval: 60000,
  });

  const { data: inventoryRes, isLoading } = useQuery<{ data: ExtendedInventoryItem[]; total: number }>({
    queryKey: ["/api/inventory", inventoryPage, categoryFilter],
    queryFn: async ({ queryKey }) => {
      const [, page, category] = queryKey as [string, number, string];
      const params = new URLSearchParams({ limit: String(INVENTORY_LIMIT), offset: String(Number(page) * INVENTORY_LIMIT) });
      if (category !== "ALL") params.set("itemCategory", String(category));
      const res = await fetch(`/api/inventory?${params}`, { credentials: "include" });
      const json = await res.json();
      // FIX: normalise response so .data is always an array even if the API returns a bare array
      if (Array.isArray(json)) {
        return { data: json, total: json.length };
      }
      return {
        data: Array.isArray(json?.data) ? json.data : [],
        total: typeof json?.total === "number" ? json.total : 0,
      };
    },
  });
  // FIX: always fall back to [] / 0 so downstream .filter/.map never receive undefined
  const inventory: ExtendedInventoryItem[] = inventoryRes?.data ?? [];
  const inventoryTotal: number = inventoryRes?.total ?? 0;

  const createMutation = useMutation({
    mutationFn: async (data: InventoryItemPayload) => { const res = await apiRequest("POST", "/api/inventory", data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setItemDialogOpen(false); resetForm(); toast({ title: t("itemAdded") }); },
    onError: (err: Error) => { toast({ title: tc("error"), description: err.message, variant: "destructive" }); },
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InventoryItemPayload }) => { const res = await apiRequest("PATCH", `/api/inventory/${id}`, data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setItemDialogOpen(false); setEditingItem(null); resetForm(); toast({ title: t("itemUpdated") }); },
    onError: (err: Error) => { toast({ title: tc("error"), description: err.message, variant: "destructive" }); },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/inventory/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: tc("delete") }); },
    onError: (err: Error) => {
      const cleanMsg = err.message.replace(/^\d+:\s*/, "");
      const isInUse = cleanMsg.toLowerCase().includes("cannot delete") || cleanMsg.toLowerCase().includes("in use");
      toast({ title: isInUse ? t("cannotDeleteItem") : tc("error"), description: cleanMsg, variant: "destructive" });
    },
  });
  const pendingAdjustRef = { current: null as { id: string; data: { type: string; quantity: string; reason: string } } | null };

  const adjustMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { type: string; quantity: string; reason: string; supervisorOverride?: { username: string; password: string; otpApprovalToken?: string } } }) => {
      pendingAdjustRef.current = { id, data: { type: data.type, quantity: data.quantity, reason: data.reason } };
      const res = await apiRequest("POST", `/api/inventory/${id}/adjust`, data);
      if (res.status === 403) {
        const errData = await res.json();
        if (errData.requiresSupervisor) {
          throw new Error("__SUPERVISOR_REQUIRED__:" + (errData.action || "large_stock_adjustment"));
        }
        throw new Error(errData.message || "Permission denied");
      }
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      pendingAdjustRef.current = null;
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setAdjustDialogOpen(false); setAdjustingItem(null); setAdjustData({ type: "in", quantity: "", reason: "" }); toast({ title: t("stockAdjusted") }); },
    onError: (err: Error) => {
      if (err.message.startsWith("__SUPERVISOR_REQUIRED__:") && pendingAdjustRef.current) {
        const action = err.message.split(":")[1];
        setSupervisorDialog({ open: true, action: action || "large_stock_adjustment", actionLabel: "Large Stock Adjustment", pendingData: pendingAdjustRef.current });
        return;
      }
      toast({ title: tc("error"), description: err.message, variant: "destructive" });
    },
  });

  const handleInventorySupervisorApproved = useCallback((_supervisorId: string, credentials: { username: string; password: string; otpApprovalToken?: string }) => {
    if (supervisorDialog?.pendingData) {
      const { id, data } = supervisorDialog.pendingData;
      adjustMutation.mutate({ id, data: { ...data, supervisorOverride: credentials } });
    }
    setSupervisorDialog(null);
  }, [supervisorDialog, adjustMutation]);

  function resetForm() {
    setFormData({ name: "", sku: "", category: "", unit: "pcs", currentStock: "0", reorderLevel: "10", costPrice: "0", supplier: "", expiryDate: "", expiryAlertDays: "7", receivedDate: "", itemCategory: "INGREDIENT", parLevelPerShift: "", reorderPieces: "", costPerPiece: "" });
  }

  function openEditDialog(item: ExtendedInventoryItem) {
    setEditingItem(item);
    const cat = (item.itemCategory || "INGREDIENT") as ItemCategory;
    setFormData({
      name: item.name, sku: item.sku || "", category: item.category || "",
      unit: item.unit || "pcs", currentStock: item.currentStock?.toString() || "0",
      reorderLevel: item.reorderLevel?.toString() || "10", costPrice: item.costPrice?.toString() || "0",
      supplier: item.supplier || "",
      itemCategory: cat,
      parLevelPerShift: item.parLevelPerShift?.toString() || "",
      reorderPieces: item.reorderPieces?.toString() || "",
      costPerPiece: item.costPerPiece?.toString() || "",
      expiryDate: (item as any).expiryDate || "",
      expiryAlertDays: (item as any).expiryAlertDays?.toString() || "7",
      receivedDate: (item as any).receivedDate || "",
    });
    setItemFormDirty(false);
    setInventoryFormErrors({});
    setItemDialogOpen(true);
  }

  function handleCategoryChange(cat: ItemCategory) {
    setFormData(f => ({
      ...f,
      itemCategory: cat,
      unit: isPieceCategory(cat) ? "pcs" : f.unit,
    }));
  }

  // FIX: guard inventory with ?? [] before chaining .filter — prevents crash when API returns null/undefined
  const filtered = (inventory ?? []).filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.sku && item.sku.toLowerCase().includes(search.toLowerCase())) ||
    (item.category && item.category.toLowerCase().includes(search.toLowerCase()))
  );
  const lowStockItems = (inventory ?? []).filter((item) => Number(item.currentStock) <= Number(item.reorderLevel));
  const totalValue = (inventory ?? []).reduce((sum, item) => sum + Number(item.currentStock) * Number(item.costPrice), 0);
  const canEdit = user?.role === "owner" || user?.role === "manager";
  const isCrockeryTab = categoryFilter === "CROCKERY" || categoryFilter === "CUTLERY" || categoryFilter === "GLASSWARE";
  const useVirtualRows = filtered.length > 100;
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 52,
    overscan: 10,
    enabled: useVirtualRows,
  });

  function getRowHighlight(item: ExtendedInventoryItem) {
    if (!isPieceCategory(item.itemCategory || "")) {
      return Number(item.currentStock) <= Number(item.reorderLevel) ? "bg-red-50 dark:bg-red-950/20" : "";
    }
    const stock = Number(item.currentStock);
    const par = Number(item.parLevelPerShift || 0);
    const reorder = Number(item.reorderPieces || item.reorderLevel || 0);
    if (par > 0 && stock < par) return "bg-red-50 dark:bg-red-950/20";
    if (reorder > 0 && stock < reorder) return "bg-amber-50 dark:bg-amber-950/20";
    return "";
  }

  const isBelowPar = (item: ExtendedInventoryItem) => {
    if (!isPieceCategory(item.itemCategory || "")) return false;
    const par = Number(item.parLevelPerShift || 0);
    return par > 0 && Number(item.currentStock) < par;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Items" value={inventory.length} icon={BoxIcon} iconColor="text-teal-600" iconBg="bg-teal-100" testId="stat-total-items" />
        <StatCard title="Low Stock" value={lowStockItems.length} icon={TrendingDown} iconColor="text-red-600" iconBg="bg-red-100" testId="stat-low-stock" />
        <StatCard title="Stock Value" value={fmt(totalValue)} icon={Package} iconColor="text-green-600" iconBg="bg-green-100" testId="stat-stock-value" />
        <StatCard title="At Risk" value={lowStockItems.reduce((s, i) => s + Number(i.currentStock) * Number(i.costPrice), 0) > 0 ? fmt(lowStockItems.reduce((s, i) => s + Number(i.currentStock) * Number(i.costPrice), 0)) : fmt(0)} icon={AlertTriangle} iconColor="text-orange-600" iconBg="bg-orange-100" testId="stat-at-risk" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" />Inventory Items</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-inventory" />
              </div>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-download-pdf-inventory"
                onClick={() => {
                  const tenantName = user?.tenant?.name || "Restaurant";
                  void exportToPdf({
                    title: "Inventory Stock Valuation",
                    restaurantName: tenantName,
                    logoUrl: user?.tenant?.logo ?? null,
                    dateRange: new Date().toLocaleDateString("en-GB"),
                    subtitle: `Total Stock Value: ${fmt(totalValue)} | Items: ${inventory.length} | Low Stock: ${lowStockItems.length}`,
                    columns: ["Item", "SKU", "Category", "Stock", "Unit", "Reorder Level", "Cost Price", "Stock Value", "Status"],
                    rows: filtered.map(item => [
                      item.name,
                      item.sku || "—",
                      item.category || "—",
                      isPieceCategory(item.itemCategory || "") ? Math.round(Number(item.currentStock)).toString() : Number(item.currentStock).toFixed(2),
                      item.unit || "pcs",
                      Number(item.reorderLevel).toFixed(0),
                      fmt(Number(item.costPrice)),
                      fmt(Number(item.currentStock) * Number(item.costPrice)),
                      Number(item.currentStock) <= Number(item.reorderLevel) ? "LOW STOCK" : "OK",
                    ]),
                    filename: `inventory-valuation-${new Date().toISOString().split("T")[0]}.pdf`,
                    footerNote: `Total value: ${fmt(totalValue)}`,
                  });
                }}
              >
                <FileDown className="h-3.5 w-3.5 mr-1.5" /> Download PDF
              </Button>
              {canEdit && <Button onClick={() => { setEditingItem(null); resetForm(); setItemFormDirty(false); setInventoryFormErrors({}); setItemDialogOpen(true); }} data-testid="button-add-inventory"><Plus className="h-4 w-4 mr-2" />Add Item</Button>}
            </div>
          </div>

          {/* Category filter tabs */}
          <div className="flex gap-1 mt-3 flex-wrap">
            {CATEGORY_FILTERS.map(f => (
              <Button
                key={f.value}
                variant={categoryFilter === f.value ? "default" : "outline"}
                size="sm"
                data-testid={TEST_IDS[f.value]}
                onClick={() => { setCategoryFilter(f.value); setInventoryPage(0); }}
                className="h-7 text-xs px-3"
              >
                {f.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {/* FIX: guard expiringItems with ?? [] before .filter calls */}
          {(expiringItems ?? []).length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-3" data-testid="banner-expiring-items">
              <span className="text-2xl flex-shrink-0">⚠️</span>
              <div>
                <p className="font-semibold text-amber-800">{(expiringItems ?? []).filter((i: any) => i.expiry_status === "expired").length} expired · {(expiringItems ?? []).filter((i: any) => i.expiry_status === "expiring_soon").length} expiring within 7 days</p>
                <p className="text-sm text-amber-700 mt-0.5">Review and remove expired stock — HACCP compliance</p>
              </div>
            </div>
          )}
          {isLoading ? (
            <Table>
              <TableSkeleton rows={8} cols={7} />
            </Table>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4" data-testid="text-no-inventory">
              <Package className="w-12 h-12 text-muted-foreground" />
              <p className="text-muted-foreground text-center">
                {search ? "No items match your search." : "No inventory items yet. Add your first ingredient to get started."}
              </p>
              {!search && canEdit && (
                <Button onClick={() => { setEditingItem(null); resetForm(); setItemFormDirty(false); setInventoryFormErrors({}); setItemDialogOpen(true); }} data-testid="button-add-first-ingredient">
                  <Plus className="w-4 h-4 mr-2" />Add Ingredient
                </Button>
              )}
            </div>
          ) : (
            <div ref={tableContainerRef} className={useVirtualRows ? "overflow-auto max-h-[600px]" : undefined}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("category")}</TableHead>
                  <TableHead>Current Stock</TableHead>
                  {isCrockeryTab && <TableHead className="text-right">Par/Shift</TableHead>}
                  {!isCrockeryTab && <><TableHead>Stock Level</TableHead><TableHead>Reorder</TableHead><TableHead>Unit</TableHead></>}
                  <TableHead>Cost</TableHead>
                  {!isCrockeryTab && <TableHead>Supplier</TableHead>}
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="text-right">{t("actions")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody style={useVirtualRows ? { height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" } : undefined}>
                {(useVirtualRows ? rowVirtualizer.getVirtualItems().map(vRow => ({ item: filtered[vRow.index], index: vRow.index, virtualRow: vRow })) : filtered.map((item, index) => ({ item, index, virtualRow: null }))).map(({ item, index, virtualRow }) => {
                  const isLowStock = Number(item.currentStock) <= Number(item.reorderLevel);
                  const belowPar = isBelowPar(item);
                  const rowClass = getRowHighlight(item);
                  const isPiece = isPieceCategory(item.itemCategory || "");
                  const displayStock = isPiece
                    ? Math.round(Number(item.currentStock)).toString()
                    : Number(item.currentStock).toFixed(1);

                  return (
                    <motion.tr key={item.id} initial={virtualRow ? false : { opacity: 0 }} animate={virtualRow ? false : { opacity: 1 }} transition={virtualRow ? undefined : { delay: index * 0.02 }} className={`border-b transition-colors hover:bg-muted/50 ${rowClass}`} data-testid={`row-inventory-${item.id}`} style={virtualRow ? { position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` } : undefined}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {(isLowStock || belowPar) && <AlertTriangle className="h-4 w-4 text-red-500" />}
                          {item.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {item.itemCategory || item.category || "INGREDIENT"}
                        </Badge>
                      </TableCell>
                      <TableCell className={(isLowStock || belowPar) ? "text-red-600 font-semibold" : ""} data-testid={`text-stock-${item.id}`}>
                        <div className="flex items-center gap-1">
                          {displayStock} {isPiece ? "pcs" : (item.unit || "")}
                          {belowPar && <span data-testid={`badge-below-par-${item.id}`} className="text-red-600">🔴</span>}
                        </div>
                      </TableCell>
                      {isCrockeryTab && (
                        <TableCell className="text-right">
                          {item.parLevelPerShift ? `${Math.round(Number(item.parLevelPerShift))} pcs` : "—"}
                        </TableCell>
                      )}
                      {!isCrockeryTab && (
                        <>
                          <TableCell><StockBar current={Number(item.currentStock)} reorder={Number(item.reorderLevel)} /></TableCell>
                          <TableCell>{Number(item.reorderLevel).toFixed(0)}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                        </>
                      )}
                      <TableCell>
                        {isPiece && item.costPerPiece
                          ? fmt(Number(item.costPerPiece))
                          : fmt(Number(item.costPrice))}
                      </TableCell>
                      {!isCrockeryTab && <TableCell>{item.supplier || "—"}</TableCell>}
                      <TableCell>
                        {isLowStock || belowPar
                          ? <>
                              <Badge variant="destructive">{belowPar ? "Below Par" : "Low Stock"}</Badge>
                              {(() => {
                                const ed = (item as any).expiryDate;
                                if (!ed) return null;
                                const diff = Math.round((new Date(ed).getTime() - Date.now()) / 86400000);
                                const ad = Number((item as any).expiryAlertDays) || 7;
                                if (diff < 0) return <Badge className="bg-red-100 text-red-700 ml-1 text-xs border-0" data-testid={"badge-expiry-" + item.id}>Exp {Math.abs(diff)}d ago</Badge>;
                                if (diff <= ad) return <Badge className="bg-amber-100 text-amber-700 ml-1 text-xs border-0" data-testid={"badge-expiry-" + item.id}>Exp {diff}d</Badge>;
                                return null;
                              })()}
                            </>
                          : <Badge variant="secondary">In Stock</Badge>}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => { setAdjustingItem(item); setAdjustData({ type: "in", quantity: "", reason: "" }); setAdjustFormDirty(false); setAdjustDialogOpen(true); }} data-testid={`button-adjust-${item.id}`}><ArrowUpDown className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(item)} data-testid={`button-edit-${item.id}`}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(item.id)} data-testid={`button-delete-${item.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </motion.tr>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
          {inventoryTotal > INVENTORY_LIMIT && (
            <div className="flex items-center justify-between px-4 py-3 border-t" data-testid="pagination-controls-inventory">
              <p className="text-sm text-muted-foreground">
                Showing {inventoryPage * INVENTORY_LIMIT + 1}–{Math.min((inventoryPage + 1) * INVENTORY_LIMIT, inventoryTotal)} of {inventoryTotal} items
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setInventoryPage((p) => Math.max(0, p - 1))} disabled={inventoryPage === 0} data-testid="button-prev-page-inventory">
                  <ChevronLeft className="h-4 w-4" />Prev
                </Button>
                <span className="text-sm font-medium px-2" data-testid="text-page-inventory">Page {inventoryPage + 1}</span>
                <Button variant="outline" size="sm" onClick={() => setInventoryPage((p) => p + 1)} disabled={(inventoryPage + 1) * INVENTORY_LIMIT >= inventoryTotal} data-testid="button-next-page-inventory">
                  Next<ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Par Level Status Panel — shown for crockery tabs */}
      <AnimatePresence>
        {isCrockeryTab && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <ParLevelStatusPanel />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add/Edit Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={(open) => {
        if (!open) {
          if (itemFormDirty) { setItemConfirmLeave(true); } else { setItemDialogOpen(false); }
        } else { setItemDialogOpen(true); }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Inventory Item" : "Add Inventory Item"}</DialogTitle>
            <DialogDescription>{editingItem ? "Update the details." : "Add a new item."}</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1"><span className="text-red-500">*</span> Required field</p>
          <div className="grid gap-4 py-2" onChange={() => setItemFormDirty(true)}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name <span className="text-red-500 ml-0.5">*</span></Label>
                <Input
                  value={formData.name}
                  onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setItemFormDirty(true); setInventoryFormErrors(prev => ({ ...prev, name: undefined })); }}
                  onBlur={(e) => { if (!e.target.value.trim()) setInventoryFormErrors(prev => ({ ...prev, name: "Name is required" })); }}
                  className={inventoryFormErrors.name ? "border-red-500" : ""}
                  data-testid="input-inventory-name"
                />
                {inventoryFormErrors.name && <p className="text-red-500 text-xs mt-1">{inventoryFormErrors.name}</p>}
              </div>
              <div className="space-y-2"><Label>SKU</Label><Input value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} data-testid="input-inventory-sku" /></div>
            </div>

            {/* Item Category */}
            <div className="space-y-2">
              <Label>Item Category</Label>
              <Select value={formData.itemCategory} onValueChange={(v) => handleCategoryChange(v as ItemCategory)}>
                <SelectTrigger data-testid="select-item-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INGREDIENT">Ingredient (food/beverage)</SelectItem>
                  <SelectItem value="CROCKERY">Crockery</SelectItem>
                  <SelectItem value="CUTLERY">Cutlery</SelectItem>
                  <SelectItem value="GLASSWARE">Glassware</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Category / Tag</Label><Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} data-testid="input-inventory-category" /></div>
              <div className="space-y-2">
                <Label>Unit Type</Label>
                {isPieceCategory(formData.itemCategory) ? (
                  <Input value="Piece (pcs)" readOnly className="bg-muted text-muted-foreground" />
                ) : (
                  <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                    <SelectTrigger data-testid="select-inventory-unit"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pcs">Pieces</SelectItem><SelectItem value="kg">Kilograms</SelectItem><SelectItem value="g">Grams</SelectItem>
                      <SelectItem value="ltr">Litres</SelectItem><SelectItem value="ml">Millilitres</SelectItem>
                      <SelectItem value="box">Boxes</SelectItem><SelectItem value="pack">Packs</SelectItem><SelectItem value="bottles">Bottles</SelectItem><SelectItem value="bunches">Bunches</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Current Stock</Label>
                <Input
                  type="number"
                  step={isPieceCategory(formData.itemCategory) ? "1" : "0.01"}
                  value={formData.currentStock}
                  onChange={(e) => setFormData({ ...formData, currentStock: e.target.value })}
                  data-testid="input-inventory-stock"
                />
              </div>
              {isPieceCategory(formData.itemCategory) ? (
                <div className="space-y-2">
                  <Label>Cost Per Piece</Label>
                  <Input type="number" step="0.01" value={formData.costPerPiece} onChange={(e) => setFormData({ ...formData, costPerPiece: e.target.value })} data-testid="input-cost-per-piece" />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Cost Price</Label>
                  <Input type="number" step="0.01" value={formData.costPrice} onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })} data-testid="input-inventory-cost" />
                </div>
              )}
            </div>

            {isPieceCategory(formData.itemCategory) ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Par Level / Shift (pcs)</Label>
                  <Input type="number" step="1" value={formData.parLevelPerShift} onChange={(e) => setFormData({ ...formData, parLevelPerShift: e.target.value })} placeholder="e.g. 80" data-testid="input-par-level-shift" />
                </div>
                <div className="space-y-2">
                  <Label>Reorder Alert At (pcs)</Label>
                  <Input type="number" step="1" value={formData.reorderPieces} onChange={(e) => setFormData({ ...formData, reorderPieces: e.target.value })} placeholder="e.g. 60" data-testid="input-reorder-pieces" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Reorder Level</Label><Input type="number" value={formData.reorderLevel} onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })} data-testid="input-inventory-reorder" /></div>
                <div className="space-y-2"><Label>Supplier</Label><Input value={formData.supplier} onChange={(e) => setFormData({ ...formData, supplier: e.target.value })} data-testid="input-inventory-supplier" /></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <div className="space-y-2"><Label>Expiry Date</Label><Input type="date" value={formData.expiryDate || ""} onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })} data-testid="input-inventory-expiry-date" /></div>
            <div className="space-y-2"><Label>Expiry Alert Days</Label><Input type="number" min="1" value={formData.expiryAlertDays || "7"} onChange={(e) => setFormData({ ...formData, expiryAlertDays: e.target.value })} placeholder="7" data-testid="input-inventory-expiry-alert" /></div>
            <div className="space-y-2"><Label>Received Date</Label><Input type="date" value={formData.receivedDate || ""} onChange={(e) => setFormData({ ...formData, receivedDate: e.target.value })} data-testid="input-inventory-received-date" /></div>
            <Button variant="outline" onClick={() => { if (itemFormDirty) { setItemConfirmLeave(true); } else { setItemDialogOpen(false); } }}>Cancel</Button>
            <Button
              onClick={() => {
                if (!formData.name.trim()) {
                  setInventoryFormErrors({ name: "Name is required" });
                  setTimeout(scrollToFirstError, 0);
                  return;
                }
                setInventoryFormErrors({});
                const coerceInt = (v: string): number | null => (v === "") ? null : parseInt(v, 10);
                const apiPayload: InventoryItemPayload = {
                  ...formData,
                  unit: isPieceCategory(formData.itemCategory) ? "pcs" : formData.unit,
                  costPrice: isPieceCategory(formData.itemCategory) ? formData.costPerPiece : formData.costPrice,
                  parLevelPerShift: coerceInt(formData.parLevelPerShift),
                  reorderPieces: coerceInt(formData.reorderPieces),
                  expiryAlertDays: coerceInt(formData.expiryAlertDays),
                };
                editingItem ? updateMutation.mutate({ id: editingItem.id, data: apiPayload }) : createMutation.mutate(apiPayload);
              }}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-inventory"
            >
              {editingItem ? "Update" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmLeaveDialog
        open={itemConfirmLeave}
        onStay={() => setItemConfirmLeave(false)}
        onLeave={() => { setItemConfirmLeave(false); setItemFormDirty(false); setItemDialogOpen(false); resetForm(); }}
      />

      <Dialog open={adjustDialogOpen} onOpenChange={(open) => {
        if (!open) {
          if (adjustFormDirty) { setAdjustConfirmLeave(true); } else { setAdjustDialogOpen(false); }
        } else { setAdjustDialogOpen(true); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock — {adjustingItem?.name}</DialogTitle>
            <DialogDescription>
              Current: {adjustingItem ? (isPieceCategory(adjustingItem.itemCategory || "") ? Math.round(Number(adjustingItem.currentStock)) + " pcs" : Number(adjustingItem.currentStock).toFixed(1) + " " + (adjustingItem.unit || "")) : 0}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2" onChange={() => setAdjustFormDirty(true)}>
            <Select value={adjustData.type} onValueChange={(v) => { setAdjustData({ ...adjustData, type: v as "in" | "out" }); setAdjustFormDirty(true); }}>
              <SelectTrigger data-testid="select-adjust-type"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="in">Stock In (Add)</SelectItem><SelectItem value="out">Stock Out (Remove)</SelectItem></SelectContent>
            </Select>
            <Input
              type="number"
              min="0"
              step={adjustingItem && isPieceCategory(adjustingItem.itemCategory || "") ? "1" : "0.01"}
              value={adjustData.quantity}
              onChange={(e) => setAdjustData({ ...adjustData, quantity: e.target.value })}
              placeholder="Quantity"
              data-testid="input-adjust-quantity"
            />
            {Number(adjustData.quantity) > 100 && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50" data-testid="warning-large-quantity">
                <svg className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                <div className="text-sm text-amber-700">
                  <p className="font-medium">Unusually large quantity ({adjustData.quantity})</p>
                  <p className="text-xs mt-0.5">Please verify this amount before confirming.</p>
                </div>
              </div>
            )}
            <Input value={adjustData.reason} onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })} placeholder="Reason" data-testid="input-adjust-reason" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (adjustFormDirty) { setAdjustConfirmLeave(true); } else { setAdjustDialogOpen(false); } }}>Cancel</Button>
            <Button
              onClick={() => { if (adjustingItem && adjustData.quantity) adjustMutation.mutate({ id: adjustingItem.id, data: adjustData }); }}
              disabled={adjustMutation.isPending}
              data-testid="button-confirm-adjust"
            >
              Confirm Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmLeaveDialog
        open={adjustConfirmLeave}
        onStay={() => setAdjustConfirmLeave(false)}
        onLeave={() => { setAdjustConfirmLeave(false); setAdjustFormDirty(false); setAdjustDialogOpen(false); }}
      />

      {supervisorDialog?.open && (
        <SupervisorApprovalDialog
          open={supervisorDialog.open}
          action={supervisorDialog.action}
          actionLabel={supervisorDialog.actionLabel}
          onApproved={handleInventorySupervisorApproved}
          onCancel={() => setSupervisorDialog(null)}
        />
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <div className="p-6">
      <PageTitle title="Inventory" />
      <InventoryTab />
    </div>
  );
}
