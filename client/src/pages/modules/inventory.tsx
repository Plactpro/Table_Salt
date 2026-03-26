import { PageTitle } from "@/lib/accessibility";
import { useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
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
import { StatCard } from "@/components/widgets/stat-card";
import { Textarea } from "@/components/ui/textarea";

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

  const id = outletId || user?.outletId || "";
  const { data: parItems = [], isLoading, isError } = useQuery<ParCheckItem[]>({
    queryKey: ["/api/inventory/par-check", id],
    queryFn: async () => {
      const url = id ? `/api/inventory/par-check/${id}` : "/api/inventory/par-check";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("No par-check endpoint");
      return res.json();
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
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parItems.map(item => (
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
  itemCategory: ItemCategory;
  parLevelPerShift: string;
  reorderPieces: string;
  costPerPiece: string;
};

type InventoryItemPayload = Omit<ExtendedFormData, "parLevelPerShift" | "reorderPieces"> & {
  parLevelPerShift: number | null;
  reorderPieces: number | null;
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
    costPrice: "0", supplier: "",
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
    return formatCurrency(v, tenant?.currency || "AED", tenant?.currencyPosition || "before", tenant?.currencyDecimals ?? 2);
  };

  const { data: inventoryRes, isLoading } = useQuery<{ data: ExtendedInventoryItem[]; total: number }>({
    queryKey: ["/api/inventory", inventoryPage, categoryFilter],
    queryFn: async ({ queryKey }) => {
      const [, page, category] = queryKey as [string, number, string];
      const params = new URLSearchParams({ limit: String(INVENTORY_LIMIT), offset: String(Number(page) * INVENTORY_LIMIT) });
      if (category !== "ALL") params.set("itemCategory", String(category));
      const res = await fetch(`/api/inventory?${params}`, { credentials: "include" });
      return res.json();
    },
  });
  const inventory = inventoryRes?.data ?? [];
  const inventoryTotal = inventoryRes?.total ?? 0;

  const createMutation = useMutation({
    mutationFn: async (data: InventoryItemPayload) => { const res = await apiRequest("POST", "/api/inventory", data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setItemDialogOpen(false); resetForm(); toast({ title: "Item added" }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InventoryItemPayload }) => { const res = await apiRequest("PATCH", `/api/inventory/${id}`, data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setItemDialogOpen(false); setEditingItem(null); resetForm(); toast({ title: "Item updated" }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/inventory/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: "Deleted" }); },
    onError: (err: Error) => {
      const cleanMsg = err.message.replace(/^\d+:\s*/, "");
      const isInUse = cleanMsg.toLowerCase().includes("cannot delete") || cleanMsg.toLowerCase().includes("in use");
      toast({ title: isInUse ? "Cannot delete item" : "Error", description: cleanMsg, variant: "destructive" });
    },
  });
  const pendingAdjustRef = { current: null as { id: string; data: { type: string; quantity: string; reason: string } } | null };

  const adjustMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { type: string; quantity: string; reason: string; supervisorOverride?: { username: string; password: string; otpApprovalToken?: string } } }) => {
      pendingAdjustRef.current = { id, data: { type: data.type, quantity: data.quantity, reason: data.reason } };
      const res = await fetch(`/api/inventory/${id}/adjust`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(data),
      });
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setAdjustDialogOpen(false); setAdjustingItem(null); setAdjustData({ type: "in", quantity: "", reason: "" }); toast({ title: "Stock adjusted" }); },
    onError: (err: Error) => {
      if (err.message.startsWith("__SUPERVISOR_REQUIRED__:") && pendingAdjustRef.current) {
        const action = err.message.split(":")[1];
        setSupervisorDialog({ open: true, action: action || "large_stock_adjustment", actionLabel: "Large Stock Adjustment", pendingData: pendingAdjustRef.current });
        return;
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
    setFormData({ name: "", sku: "", category: "", unit: "pcs", currentStock: "0", reorderLevel: "10", costPrice: "0", supplier: "", itemCategory: "INGREDIENT", parLevelPerShift: "", reorderPieces: "", costPerPiece: "" });
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

  const filtered = inventory.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.sku && item.sku.toLowerCase().includes(search.toLowerCase())) ||
    (item.category && item.category.toLowerCase().includes(search.toLowerCase()))
  );
  const lowStockItems = inventory.filter((item) => Number(item.currentStock) <= Number(item.reorderLevel));
  const totalValue = inventory.reduce((sum, item) => sum + Number(item.currentStock) * Number(item.costPrice), 0);
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
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Current Stock</TableHead>
                  {isCrockeryTab && <TableHead className="text-right">Par/Shift</TableHead>}
                  {!isCrockeryTab && <><TableHead>Stock Level</TableHead><TableHead>Reorder</TableHead><TableHead>Unit</TableHead></>}
                  <TableHead>Cost</TableHead>
                  {!isCrockeryTab && <TableHead>Supplier</TableHead>}
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
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
                          ? <Badge variant="destructive">{belowPar ? "Below Par" : "Low Stock"}</Badge>
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
            <Button onClick={() => { if (adjustingItem && adjustData.quantity) adjustMutation.mutate({ id: adjustingItem.id, data: adjustData }); }} disabled={adjustMutation.isPending || !adjustData.quantity} data-testid="button-confirm-adjust">Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmLeaveDialog
        open={adjustConfirmLeave}
        onStay={() => setAdjustConfirmLeave(false)}
        onLeave={() => { setAdjustConfirmLeave(false); setAdjustFormDirty(false); setAdjustDialogOpen(false); }}
      />
      {supervisorDialog && (
        <SupervisorApprovalDialog
          open={supervisorDialog.open}
          onOpenChange={(open) => !open && setSupervisorDialog(null)}
          action={supervisorDialog.action}
          actionLabel={supervisorDialog.actionLabel}
          onApproved={handleInventorySupervisorApproved}
        />
      )}
    </div>
  );
}

type RecipeWithIngredients = Recipe & { ingredients: RecipeIngredient[] };

function RecipesTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<RecipeWithIngredients | null>(null);
  const [recipeName, setRecipeName] = useState("");
  const [menuItemId, setMenuItemId] = useState("none");
  const [yieldVal, setYieldVal] = useState("1");
  const [yieldUnit, setYieldUnit] = useState("portion");
  const [prepTime, setPrepTime] = useState("");
  const [notes, setNotes] = useState("");
  const [ingredients, setIngredients] = useState<Array<{ inventoryItemId: string; quantity: string; unit: string; wastePct: string }>>([]);

  const fmt = (v: number) => {
    const tenant = user?.tenant;
    return formatCurrency(v, tenant?.currency || "AED", tenant?.currencyPosition || "before", tenant?.currencyDecimals ?? 2);
  };

  const { data: allRecipes = [] } = useQuery<RecipeWithIngredients[]>({ queryKey: ["/api/recipes"] });
  const { data: inventoryAllRes } = useQuery<{ data: InventoryItem[]; total: number }>({ queryKey: ["/api/inventory", "all"], queryFn: async () => { const res = await fetch("/api/inventory?limit=200&offset=0", { credentials: "include" }); return res.json(); } });
  const { data: menuItemsList = [] } = useQuery<PaginatedResponse<MenuItem>, Error, MenuItem[]>({ queryKey: ["/api/menu-items"], select: selectPageData });

  const invMap = new Map((inventoryAllRes?.data ?? []).map(i => [i.id, i]));
  const inventory = inventoryAllRes?.data ?? [];
  const menuMap = new Map(menuItemsList.map(m => [m.id, m]));

  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/recipes", data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/recipes"] }); setDialogOpen(false); toast({ title: "Recipe created" }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => { const res = await apiRequest("PATCH", `/api/recipes/${id}`, data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/recipes"] }); setDialogOpen(false); setEditingRecipe(null); toast({ title: "Recipe updated" }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/recipes/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/recipes"] }); toast({ title: "Recipe deleted" }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  function calcPlateCost(ings: typeof ingredients) {
    return ings.reduce((sum, ing) => {
      const item = invMap.get(ing.inventoryItemId);
      if (!item) return sum;
      const qty = Number(ing.quantity) || 0;
      const waste = Number(ing.wastePct || 0) / 100;
      const effectiveQty = qty / (1 - waste);
      const ingUnit = ing.unit || item.unit || "pcs";
      const invUnit = item.unit || "pcs";
      const converted = convertUnits(effectiveQty, ingUnit, invUnit);
      return sum + converted * Number(item.costPrice);
    }, 0);
  }

  function openCreateDialog() {
    setEditingRecipe(null);
    setRecipeName(""); setMenuItemId("none"); setYieldVal("1"); setYieldUnit("portion"); setPrepTime(""); setNotes("");
    setIngredients([]);
    setDialogOpen(true);
  }

  function openEditDialog(r: RecipeWithIngredients) {
    setEditingRecipe(r);
    setRecipeName(r.name);
    setMenuItemId(r.menuItemId || "none");
    setYieldVal(r.yield?.toString() || "1");
    setYieldUnit(r.yieldUnit || "portion");
    setPrepTime(r.prepTimeMinutes?.toString() || "");
    setNotes(r.notes || "");
    setIngredients(r.ingredients.map(ing => ({
      inventoryItemId: ing.inventoryItemId,
      quantity: ing.quantity?.toString() || "0",
      unit: ing.unit,
      wastePct: ing.wastePct?.toString() || "0",
    })));
    setDialogOpen(true);
  }

  function handleSave() {
    if (!recipeName.trim()) return;
    const data = {
      name: recipeName,
      menuItemId: menuItemId === "none" ? null : menuItemId,
      yield: yieldVal,
      yieldUnit,
      prepTimeMinutes: prepTime ? Number(prepTime) : null,
      notes: notes || null,
      ingredients: ingredients.filter(i => i.inventoryItemId && Number(i.quantity) > 0),
    };
    if (editingRecipe) {
      updateMutation.mutate({ id: editingRecipe.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const canEdit = user?.role === "owner" || user?.role === "manager";
  const plateCost = calcPlateCost(ingredients);
  const selectedMenuItem = menuItemId !== "none" ? menuMap.get(menuItemId) : null;
  const sellingPrice = Number(selectedMenuItem?.price || 0);
  const margin = sellingPrice - plateCost;
  const foodCostPct = sellingPrice > 0 ? (plateCost / sellingPrice) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Recipes" value={allRecipes.length} icon={BookOpen} iconColor="text-purple-600" iconBg="bg-purple-100" testId="stat-total-recipes" />
        <StatCard title="Linked to Menu" value={allRecipes.filter(r => r.menuItemId).length} icon={ChefHat} iconColor="text-blue-600" iconBg="bg-blue-100" testId="stat-linked-recipes" />
        <StatCard title="Avg Food Cost %" value={`${(allRecipes.length > 0 ? allRecipes.reduce((s, r) => { const pc = calcRecipePlateCost(r); const sp = r.menuItemId ? Number(menuMap.get(r.menuItemId)?.price || 0) : 0; return s + (sp > 0 ? (pc / sp) * 100 : 0); }, 0) / Math.max(allRecipes.filter(r => r.menuItemId).length, 1) : 0).toFixed(1)}%`} icon={Percent} iconColor="text-amber-600" iconBg="bg-amber-100" testId="stat-avg-food-cost" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2"><ChefHat className="h-4 w-4 text-muted-foreground" />Recipes</CardTitle>
            {canEdit && <Button onClick={openCreateDialog} data-testid="button-add-recipe"><Plus className="h-4 w-4 mr-2" />Add Recipe</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {allRecipes.length === 0 ? <div className="text-center py-8 text-muted-foreground" data-testid="text-no-recipes">No recipes yet. Create your first recipe!</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipe</TableHead><TableHead>Menu Item</TableHead><TableHead>Ingredients</TableHead><TableHead>Plate Cost</TableHead><TableHead>Selling Price</TableHead><TableHead>Food Cost %</TableHead><TableHead>Margin</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {allRecipes.map((recipe) => {
                  const pc = calcRecipePlateCost(recipe);
                  const mi = recipe.menuItemId ? menuMap.get(recipe.menuItemId) : null;
                  const sp = Number(mi?.price || 0);
                  const mg = sp - pc;
                  const fcp = sp > 0 ? (pc / sp) * 100 : 0;
                  return (
                    <TableRow key={recipe.id} data-testid={`row-recipe-${recipe.id}`}>
                      <TableCell className="font-medium">{recipe.name}</TableCell>
                      <TableCell>{mi?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell><Badge variant="secondary">{recipe.ingredients?.length || 0}</Badge></TableCell>
                      <TableCell className="font-medium">{fmt(pc)}</TableCell>
                      <TableCell>{sp > 0 ? fmt(sp) : "—"}</TableCell>
                      <TableCell><Badge variant={fcp > 35 ? "destructive" : fcp > 30 ? "default" : "secondary"}>{fcp.toFixed(1)}%</Badge></TableCell>
                      <TableCell className={mg >= 0 ? "text-green-600" : "text-red-600"}>{sp > 0 ? fmt(mg) : "—"}</TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(recipe)} data-testid={`button-edit-recipe-${recipe.id}`}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(recipe.id)} data-testid={`button-delete-recipe-${recipe.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingRecipe ? "Edit Recipe" : "Create Recipe"}</DialogTitle><DialogDescription>Define ingredients and calculate plate cost</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Recipe Name *</Label><Input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} data-testid="input-recipe-name" /></div>
              <div className="space-y-2"><Label>Link to Menu Item</Label>
                <Select value={menuItemId} onValueChange={setMenuItemId}>
                  <SelectTrigger data-testid="select-recipe-menu-item"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {menuItemsList.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({fmt(Number(m.price))})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Yield</Label><Input type="number" value={yieldVal} onChange={(e) => setYieldVal(e.target.value)} /></div>
              <div className="space-y-2"><Label>Yield Unit</Label><Input value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)} /></div>
              <div className="space-y-2"><Label>Prep Time (min)</Label><Input type="number" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} /></div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Ingredients</Label>
                <Button variant="outline" size="sm" onClick={() => setIngredients([...ingredients, { inventoryItemId: "", quantity: "0", unit: "kg", wastePct: "0" }])} data-testid="button-add-ingredient"><Plus className="h-3 w-3 mr-1" />Add</Button>
              </div>
              {ingredients.map((ing, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Label className="text-xs">Item</Label>
                    <Select value={ing.inventoryItemId || "none"} onValueChange={(v) => { const arr = [...ingredients]; arr[idx].inventoryItemId = v === "none" ? "" : v; const item = invMap.get(v); if (item) arr[idx].unit = item.unit || "kg"; setIngredients(arr); }}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{inventory.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Label className="text-xs">Qty</Label><Input type="number" step="0.01" value={ing.quantity} onChange={(e) => { const arr = [...ingredients]; arr[idx].quantity = e.target.value; setIngredients(arr); }} /></div>
                  <div className="col-span-2"><Label className="text-xs">Unit</Label>
                    <Select value={ing.unit} onValueChange={(v) => { const arr = [...ingredients]; arr[idx].unit = v; setIngredients(arr); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem><SelectItem value="g">g</SelectItem><SelectItem value="ltr">L</SelectItem><SelectItem value="ml">mL</SelectItem><SelectItem value="pcs">pcs</SelectItem><SelectItem value="bottles">bottles</SelectItem><SelectItem value="bunches">bunches</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Label className="text-xs">Waste %</Label><Input type="number" step="0.5" value={ing.wastePct} onChange={(e) => { const arr = [...ingredients]; arr[idx].wastePct = e.target.value; setIngredients(arr); }} /></div>
                  <div className="col-span-1"><Label className="text-xs">Cost</Label><div className="text-sm font-medium pt-2">{fmt((() => { const item = invMap.get(ing.inventoryItemId); if (!item) return 0; const q = Number(ing.quantity) || 0; const w = Number(ing.wastePct || 0) / 100; const eff = q / (1 - w); const iu = ing.unit || item.unit || "pcs"; return convertUnits(eff, iu, item.unit || "pcs") * Number(item.costPrice); })())}</div></div>
                  <div className="col-span-1"><Button variant="ghost" size="sm" onClick={() => setIngredients(ingredients.filter((_, i) => i !== idx))}><X className="h-3 w-3" /></Button></div>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-muted/50 p-4 grid grid-cols-4 gap-4 text-center">
              <div><div className="text-xs text-muted-foreground">Plate Cost</div><div className="text-lg font-bold text-primary">{fmt(plateCost)}</div></div>
              <div><div className="text-xs text-muted-foreground">Selling Price</div><div className="text-lg font-bold">{sellingPrice > 0 ? fmt(sellingPrice) : "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Food Cost %</div><div className={`text-lg font-bold ${foodCostPct > 35 ? "text-red-600" : foodCostPct > 30 ? "text-amber-600" : "text-green-600"}`}>{foodCostPct.toFixed(1)}%</div></div>
              <div><div className="text-xs text-muted-foreground">Margin</div><div className={`text-lg font-bold ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>{sellingPrice > 0 ? fmt(margin) : "—"}</div></div>
            </div>

            <div className="space-y-2"><Label>Notes</Label><CharCountTextarea maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-recipe">{editingRecipe ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  function calcRecipePlateCost(r: RecipeWithIngredients) {
    return (r.ingredients || []).reduce((sum, ing) => {
      const item = invMap.get(ing.inventoryItemId);
      if (!item) return sum;
      const qty = Number(ing.quantity) || 0;
      const waste = Number(ing.wastePct || 0) / 100;
      const effectiveQty = qty / (1 - waste);
      const ingUnit = ing.unit || item.unit || "pcs";
      const invUnit = item.unit || "pcs";
      const convertedQty = convertUnits(effectiveQty, ingUnit, invUnit);
      return sum + convertedQty * Number(item.costPrice);
    }, 0);
  }
}

function StockTakesTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);

  const fmt = (v: number) => {
    const tenant = user?.tenant;
    return formatCurrency(v, tenant?.currency || "AED", tenant?.currencyPosition || "before", tenant?.currencyDecimals ?? 2);
  };

  const { data: takes = [] } = useQuery<any[]>({ queryKey: ["/api/stock-takes"] });
  const { data: stockTakeInventoryRes } = useQuery<{ data: InventoryItem[]; total: number }>({ queryKey: ["/api/inventory", "stock-takes-all"], queryFn: async () => { const res = await fetch("/api/inventory?limit=200&offset=0", { credentials: "include" }); return res.json(); } });
  const { data: takeDetail } = useQuery<any>({ queryKey: ["/api/stock-takes", selectedTakeId], queryFn: async () => { if (!selectedTakeId) return null; const res = await fetch(`/api/stock-takes/${selectedTakeId}`, { credentials: "include" }); return res.json(); }, enabled: !!selectedTakeId });

  const invItems = stockTakeInventoryRes?.data ?? [];
  const invMap = new Map(invItems.map(i => [i.id, i]));

  const createTakeMutation = useMutation({
    mutationFn: async () => {
      const items = invItems.map(i => ({ inventoryItemId: i.id, expectedQty: Number(i.currentStock), countedQty: null }));
      const res = await apiRequest("POST", "/api/stock-takes", { items });
      return res.json();
    },
    onSuccess: (data: any) => { queryClient.invalidateQueries({ queryKey: ["/api/stock-takes"] }); setSelectedTakeId(data.id); toast({ title: "Stock take created" }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });
  const updateLineMutation = useMutation({
    mutationFn: async ({ takeId, lineId, countedQty }: { takeId: string; lineId: string; countedQty: number }) => {
      const res = await apiRequest("PATCH", `/api/stock-takes/${takeId}/lines/${lineId}`, { countedQty });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/stock-takes", selectedTakeId] }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });
  const approveMutation = useMutation({
    mutationFn: async (takeId: string) => { const res = await apiRequest("POST", `/api/stock-takes/${takeId}/approve`); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/stock-takes"] }); queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: "Stock take approved. Inventory adjusted." }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const lines = takeDetail?.lines || [];
  const varianceLines = lines.filter((l: any) => l.countedQty !== null && Math.abs(Number(l.countedQty) - Number(l.expectedQty)) > 0.001);
  const totalVarianceValue = varianceLines.reduce((s: number, l: any) => {
    const item = invMap.get(l.inventoryItemId);
    return s + Math.abs(Number(l.countedQty) - Number(l.expectedQty)) * Number(item?.costPrice || 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Stock Takes</h3>
        <Button onClick={() => createTakeMutation.mutate()} disabled={createTakeMutation.isPending} data-testid="button-new-stock-take">
          <Plus className="h-4 w-4 mr-2" />New Stock Take
        </Button>
      </div>

      {takes.length === 0 && <div className="text-center py-8 text-muted-foreground" data-testid="text-no-stock-takes">No stock takes yet.</div>}

      <div className="space-y-3">
        {takes.map((take: any) => (
          <Card key={take.id} data-testid={`card-stock-take-${take.id}`} className={selectedTakeId === take.id ? "ring-2 ring-primary" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Stock Take #{take.id.slice(0, 8)}</CardTitle>
                  <p className="text-xs text-muted-foreground">{new Date(take.createdAt).toLocaleDateString()} · {take.status}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelectedTakeId(take.id === selectedTakeId ? null : take.id)} data-testid={`button-view-take-${take.id}`}>
                    {selectedTakeId === take.id ? "Collapse" : "View"}
                  </Button>
                  {take.status === "draft" && (
                    <Button size="sm" onClick={() => approveMutation.mutate(take.id)} disabled={approveMutation.isPending} data-testid={`button-approve-take-${take.id}`}>
                      Approve
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            {selectedTakeId === take.id && takeDetail && (
              <CardContent>
                {varianceLines.length > 0 && (
                  <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm">
                    <Activity className="h-4 w-4 text-amber-600 inline mr-1" />
                    {varianceLines.length} variance item(s) · Est. loss: {fmt(totalVarianceValue)}
                  </div>
                )}
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Expected</TableHead><TableHead>Counted</TableHead><TableHead>Variance</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {lines.map((line: any) => {
                      const item = invMap.get(line.inventoryItemId);
                      const exp = Number(line.expectedQty);
                      const cnt = line.countedQty !== null ? Number(line.countedQty) : null;
                      const vr = cnt !== null ? cnt - exp : null;
                      return (
                        <TableRow key={line.id} data-testid={`row-take-line-${line.id}`}>
                          <TableCell className="font-medium text-sm">{item?.name || line.inventoryItemId}</TableCell>
                          <TableCell>{exp.toFixed(2)} {item?.unit || ""}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="w-24 h-7 text-sm text-right"
                              defaultValue={line.countedQty ?? ""}
                              onBlur={e => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v)) updateLineMutation.mutate({ takeId: take.id, lineId: line.id, countedQty: v });
                              }}
                              disabled={take.status !== "draft"}
                              data-testid={`input-counted-${line.id}`}
                            />
                          </TableCell>
                          <TableCell className={vr === null ? "" : vr < 0 ? "text-red-600 font-medium" : vr > 0 ? "text-amber-600 font-medium" : "text-green-600"}>
                            {vr !== null ? (vr > 0 ? "+" : "") + vr.toFixed(2) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function FoodCostTab() {
  const { user } = useAuth();
  const fmt = (v: number) => {
    const tenant = user?.tenant;
    return formatCurrency(v, tenant?.currency || "AED", tenant?.currencyPosition || "before", tenant?.currencyDecimals ?? 2);
  };

  const { data: varianceData = [] } = useQuery<any[]>({ queryKey: ["/api/reports/food-cost-variance"] });
  const { data: analyticsData } = useQuery<any>({ queryKey: ["/api/reports/food-cost-analytics"] });

  return (
    <div className="space-y-6">
      {analyticsData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Theoretical Cost" value={fmt(analyticsData.theoreticalCost || 0)} icon={Activity} iconColor="text-blue-600" iconBg="bg-blue-100" testId="stat-theoretical-cost" />
          <StatCard title="Actual Cost" value={fmt(analyticsData.actualCost || 0)} icon={Activity} iconColor="text-red-600" iconBg="bg-red-100" testId="stat-actual-cost" />
          <StatCard title="Variance" value={fmt(Math.abs(analyticsData.variance || 0))} icon={AlertTriangle} iconColor="text-amber-600" iconBg="bg-amber-100" testId="stat-cost-variance" />
        </div>
      )}
      {varianceData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Ingredient Variance</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Ingredient</TableHead><TableHead>Ideal</TableHead><TableHead>Actual</TableHead><TableHead>Variance</TableHead><TableHead>Unit</TableHead><TableHead>Ideal Cost</TableHead><TableHead>Actual Cost</TableHead><TableHead>Variance Cost</TableHead></TableRow></TableHeader>
              <TableBody>
                {varianceData.filter((v: any) => v.idealUsage > 0 || v.actualUsage > 0).map((v: any) => (
                  <TableRow key={v.itemId} data-testid={`row-variance-${v.itemId}`}>
                    <TableCell className="font-medium">{v.itemName}</TableCell>
                    <TableCell>{v.idealUsage}</TableCell>
                    <TableCell>{v.actualUsage}</TableCell>
                    <TableCell className={v.varianceQty > 0 ? "text-red-600 font-medium" : v.varianceQty < 0 ? "text-green-600 font-medium" : ""}>{v.varianceQty > 0 ? "+" : ""}{v.varianceQty}</TableCell>
                    <TableCell className="text-muted-foreground">{v.unit}</TableCell>
                    <TableCell>{fmt(v.idealCost)}</TableCell>
                    <TableCell>{fmt(v.actualCost)}</TableCell>
                    <TableCell className={v.varianceCost > 0 ? "text-red-600 font-medium" : v.varianceCost < 0 ? "text-green-600 font-medium" : ""}>{v.varianceCost > 0 ? "+" : ""}{fmt(v.varianceCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {varianceData.length === 0 && (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-food-cost">
          No food cost data available yet.
        </div>
      )}
    </div>
  );
}

function UpcomingEventsSidebar() {
  const { data: events = [] } = useQuery<{ id: string; title: string; type: string; impact: string; startDate: string; endDate: string; color: string | null }[]>({
    queryKey: ["/api/events"],
  });

  const upcoming = events.filter((ev) => {
    if (ev.impact !== "high" && ev.impact !== "very_high") return false;
    const d = Math.ceil((new Date(ev.startDate).getTime() - Date.now()) / 86400000);
    return d >= 0 && d <= 7;
  }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  if (upcoming.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-orange-400" data-testid="upcoming-events-sidebar">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          Upcoming High-Impact Events (7 days)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {upcoming.map((ev) => {
          const d = Math.ceil((new Date(ev.startDate).getTime() - Date.now()) / 86400000);
          return (
            <div key={ev.id} className="flex items-center gap-2 text-sm" data-testid={`upcoming-event-sidebar-${ev.id}`}>
              <div className="w-2 h-6 rounded-full shrink-0" style={{ backgroundColor: ev.color || "#ef4444" }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{ev.title}</div>
                <div className="text-xs text-muted-foreground">
                  {d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`} · {ev.impact === "very_high" ? "Very High" : "High"} impact
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function StockMovementsTab() {
  const [filters, setFilters] = useState({ from: "", to: "", type: "", ingredientId: "" });
  const [applied, setApplied] = useState({ from: "", to: "", type: "", ingredientId: "" });

  const { data: inventoryRes } = useQuery<{ data: Array<{ id: string; name: string }>; total: number }>({ queryKey: ["/api/inventory"] });
  const ingredientList = inventoryRes?.data ?? [];

  const buildUrl = (f: typeof applied) => {
    const params = new URLSearchParams({ limit: "200" });
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    if (f.type && f.type !== "all") params.set("type", f.type);
    if (f.ingredientId && f.ingredientId !== "all") params.set("ingredientId", f.ingredientId);
    return `/api/stock-movements?${params}`;
  };

  const { data: movements = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/stock-movements", applied],
    queryFn: async () => {
      const res = await fetch(buildUrl(applied), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const TYPE_CONFIG: Record<string, { label: string; badgeClass: string }> = {
    RECIPE_CONSUMPTION: { label: "Consumed", badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
    WASTAGE: { label: "Wastage", badgeClass: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
    STOCK_IN: { label: "Stock In", badgeClass: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
    ADJUSTMENT: { label: "Adjustment", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
    TRANSFER: { label: "Transfer", badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
    RECIPE_REVERSAL: { label: "Reversal", badgeClass: "bg-muted text-muted-foreground" },
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[140px] space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} data-testid="input-movements-from" />
            </div>
            <div className="flex-1 min-w-[140px] space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} data-testid="input-movements-to" />
            </div>
            <div className="flex-1 min-w-[140px] space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={filters.type || "all"} onValueChange={v => setFilters(f => ({ ...f, type: v }))}>
                <SelectTrigger data-testid="select-movements-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px] space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Ingredient</label>
              <Select value={filters.ingredientId || "all"} onValueChange={v => setFilters(f => ({ ...f, ingredientId: v }))}>
                <SelectTrigger data-testid="select-movements-ingredient"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ingredients</SelectItem>
                  {ingredientList.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setApplied({ ...filters })} data-testid="button-apply-movements-filter">Apply</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : movements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-movements">No movements found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Ingredient</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m: any) => {
                  const cfg = TYPE_CONFIG[m.type] || { label: m.type, badgeClass: "bg-muted text-muted-foreground" };
                  return (
                    <TableRow key={m.id} data-testid={`row-movement-${m.id}`}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="font-medium">{m.ingredientName || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${cfg.badgeClass}`}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{Number(m.quantity).toFixed(2)} {m.ingredientUnit || ""}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{m.reason || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WastageTab() {
  const [, navigate] = useLocation();
  const { data: wastageRes } = useQuery<any[]>({
    queryKey: ["/api/stock-movements", "wastage-only"],
    queryFn: async () => {
      const res = await fetch("/api/stock-movements?type=WASTAGE&limit=100", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const movements = wastageRes ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Wastage Log</h3>
        <Button onClick={() => navigate("/wastage-log")} data-testid="button-log-wastage">
          <Plus className="h-4 w-4 mr-2" /> Log Wastage
        </Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          {movements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-wastage">No wastage entries yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Ingredient</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m: any) => (
                  <TableRow key={m.id} data-testid={`row-wastage-${m.id}`}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="font-medium">{m.ingredientName || "—"}</TableCell>
                    <TableCell className="text-right font-medium text-red-600">
                      -{Number(m.quantity).toFixed(2)} {m.ingredientUnit || ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{m.reason || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProcurementTab() {
  const [, navigate] = useLocation();
  const { data: purchaseOrders = [] } = useQuery<PaginatedResponse<Record<string, unknown>>, Error, Record<string, unknown>[]>({ queryKey: ["/api/purchase-orders"], select: selectPageData });

  const statusColor = (s: string | null) => {
    switch (s) {
      case "draft": return "bg-muted text-muted-foreground";
      case "approved": return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
      case "sent": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300";
      case "partially_received": return "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300";
      case "closed": return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Purchase Orders</h3>
        <Button onClick={() => navigate("/procurement")} data-testid="button-go-procurement">
          <ExternalLink className="h-4 w-4 mr-2" /> Full Procurement
        </Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          {purchaseOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-pos">No purchase orders yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.slice(0, 20).map((po: any) => (
                  <TableRow key={po.id} data-testid={`row-po-${po.id}`}>
                    <TableCell className="font-semibold">{po.poNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${statusColor(po.status)}`}>
                        {(po.status || "draft").replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{po.totalAmount || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(po.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CrockeryTab() {
  const { data: inventoryRes } = useQuery<{ data: ExtendedInventoryItem[]; total: number }>({
    queryKey: ["/api/inventory", "crockery-tab"],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "200", offset: "0" });
      const res = await fetch(`/api/inventory?${params}`, { credentials: "include" });
      return res.json();
    },
  });
  const all = inventoryRes?.data ?? [];
  const crockery = all.filter(i => isPieceCategory(i.itemCategory || ""));

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">Non-Food Inventory (Crockery, Cutlery, Glassware)</h3>
      <ParLevelStatusPanel />
      <Card>
        <CardContent className="pt-4">
          {crockery.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-crockery">No crockery items yet. Add items via the Stock List tab.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                  <TableHead className="text-right">Par / Shift</TableHead>
                  <TableHead className="text-right">Reorder At</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crockery.map((item) => {
                  const stock = Number(item.currentStock);
                  const par = Number(item.parLevelPerShift || 0);
                  const reorder = Number(item.reorderPieces || item.reorderLevel || 0);
                  const belowPar = par > 0 && stock < par;
                  const belowReorder = reorder > 0 && stock < reorder;
                  return (
                    <TableRow key={item.id} data-testid={`row-crockery-${item.id}`} className={belowPar ? "bg-red-50 dark:bg-red-950/20" : belowReorder ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{item.itemCategory}</Badge>
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${belowPar ? "text-red-600" : ""}`}>
                        {Math.round(stock)} pcs
                      </TableCell>
                      <TableCell className="text-right">{par > 0 ? `${Math.round(par)} pcs` : "—"}</TableCell>
                      <TableCell className="text-right">{reorder > 0 ? `${Math.round(reorder)} pcs` : "—"}</TableCell>
                      <TableCell>
                        {belowPar
                          ? <Badge variant="destructive">Below Par</Badge>
                          : belowReorder
                            ? <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Below Reorder</Badge>
                            : <Badge variant="secondary">OK</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const INVENTORY_TABS = [
  { value: "stock-list", label: "Stock List", icon: Package },
  { value: "movements", label: "Stock Movements", icon: ArrowUpDown },
  { value: "wastage", label: "Wastage", icon: Trash2 },
  { value: "procurement", label: "Procurement", icon: ShoppingCart },
  { value: "stock-count", label: "Stock Count", icon: ClipboardList },
  { value: "crockery", label: "Crockery", icon: BoxIcon },
] as const;

type InventoryTabValue = typeof INVENTORY_TABS[number]["value"];

export default function InventoryPage() {
  const [location, navigate] = useLocation();

  const getTabFromUrl = (): InventoryTabValue => {
    const searchStr = location.includes("?") ? location.split("?")[1] : "";
    const params = new URLSearchParams(searchStr);
    const tab = params.get("tab");
    if (tab && INVENTORY_TABS.some(t => t.value === tab)) return tab as InventoryTabValue;
    return "stock-list";
  };

  const activeTab = getTabFromUrl();

  const setTab = (tab: string) => {
    navigate(`/inventory?tab=${tab}`);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6" data-testid="page-inventory">
      <PageTitle title="Stock & Inventory" />
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10"><Warehouse className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-bold font-heading" data-testid="text-inventory-title">Inventory</h1>
          <p className="text-muted-foreground">Manage stock, movements, wastage, procurement & more</p>
        </div>
      </div>

      <UpcomingEventsSidebar />

      <Tabs value={activeTab} onValueChange={setTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
          {INVENTORY_TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              data-testid={`tab-${value}`}
              className="flex items-center gap-1.5"
            >
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="stock-list" className="mt-4"><InventoryTab /></TabsContent>
        <TabsContent value="movements" className="mt-4"><StockMovementsTab /></TabsContent>
        <TabsContent value="wastage" className="mt-4"><WastageTab /></TabsContent>
        <TabsContent value="procurement" className="mt-4"><ProcurementTab /></TabsContent>
        <TabsContent value="stock-count" className="mt-4"><StockTakesTab /></TabsContent>
        <TabsContent value="crockery" className="mt-4"><CrockeryTab /></TabsContent>
      </Tabs>
    </motion.div>
  );
}
