import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import SupervisorApprovalDialog from "@/components/supervisor-approval-dialog";
import { formatCurrency } from "@shared/currency";
import { convertUnits } from "@shared/units";
import type { InventoryItem, MenuItem, Recipe, RecipeIngredient } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, Plus, Search, AlertTriangle, Edit, Trash2, ArrowUpDown,
  Warehouse, BoxIcon, TrendingDown, TrendingUp, ChefHat, ClipboardList, DollarSign,
  BookOpen, X, Percent, Activity,
} from "lucide-react";
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

function InventoryTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState({ name: "", sku: "", category: "", unit: "pcs", currentStock: "0", reorderLevel: "10", costPrice: "0", supplier: "" });
  const [adjustData, setAdjustData] = useState({ type: "in" as "in" | "out", quantity: "", reason: "" });
  const [supervisorDialog, setSupervisorDialog] = useState<{
    open: boolean; action: string; actionLabel: string;
    pendingData: { id: string; data: any } | null;
  } | null>(null);

  const fmt = (v: number) => {
    const tenant = user?.tenant;
    return formatCurrency(v, tenant?.currency || "AED", tenant?.currencyPosition || "before", tenant?.currencyDecimals ?? 2);
  };

  const { data: inventory = [], isLoading } = useQuery<InventoryItem[]>({ queryKey: ["/api/inventory"] });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => { const res = await apiRequest("POST", "/api/inventory", data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setItemDialogOpen(false); resetForm(); toast({ title: "Item added" }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => { const res = await apiRequest("PATCH", `/api/inventory/${id}`, data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setItemDialogOpen(false); setEditingItem(null); resetForm(); toast({ title: "Item updated" }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/inventory/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: "Deleted" }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });
  const adjustMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/inventory/${id}/adjust`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(data),
      });
      if (res.status === 403) {
        const errData = await res.json();
        if (errData.requiresSupervisor) {
          const err = new Error(errData.message) as any;
          err.requiresSupervisor = true;
          err.action = errData.action;
          err.pendingData = { id, data };
          throw err;
        }
        throw new Error(errData.message || "Permission denied");
      }
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setAdjustDialogOpen(false); setAdjustingItem(null); setAdjustData({ type: "in", quantity: "", reason: "" }); toast({ title: "Stock adjusted" }); },
    onError: (err: any) => {
      if (err.requiresSupervisor && err.pendingData) {
        setSupervisorDialog({ open: true, action: err.action || "large_stock_adjustment", actionLabel: "Large Stock Adjustment", pendingData: err.pendingData });
        return;
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleInventorySupervisorApproved = useCallback((_supervisorId: string, credentials: { username: string; password: string }) => {
    if (supervisorDialog?.pendingData) {
      const { id, data } = supervisorDialog.pendingData;
      adjustMutation.mutate({ id, data: { ...data, supervisorOverride: credentials } });
    }
    setSupervisorDialog(null);
  }, [supervisorDialog, adjustMutation]);

  function resetForm() { setFormData({ name: "", sku: "", category: "", unit: "pcs", currentStock: "0", reorderLevel: "10", costPrice: "0", supplier: "" }); }
  function openEditDialog(item: InventoryItem) {
    setEditingItem(item);
    setFormData({ name: item.name, sku: item.sku || "", category: item.category || "", unit: item.unit || "pcs", currentStock: item.currentStock?.toString() || "0", reorderLevel: item.reorderLevel?.toString() || "10", costPrice: item.costPrice?.toString() || "0", supplier: item.supplier || "" });
    setItemDialogOpen(true);
  }

  const filtered = inventory.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.sku && item.sku.toLowerCase().includes(search.toLowerCase())) ||
    (item.category && item.category.toLowerCase().includes(search.toLowerCase()))
  );
  const lowStockItems = inventory.filter((item) => Number(item.currentStock) <= Number(item.reorderLevel));
  const totalValue = inventory.reduce((sum, item) => sum + Number(item.currentStock) * Number(item.costPrice), 0);
  const isLowStock = (item: InventoryItem) => Number(item.currentStock) <= Number(item.reorderLevel);
  const canEdit = user?.role === "owner" || user?.role === "manager";

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
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" />Inventory Items</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-inventory" />
              </div>
              {canEdit && <Button onClick={() => { setEditingItem(null); resetForm(); setItemDialogOpen(true); }} data-testid="button-add-inventory"><Plus className="h-4 w-4 mr-2" />Add Item</Button>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="text-center py-8 text-muted-foreground">Loading...</div> : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-inventory">{search ? "No items match" : "No inventory items yet"}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead><TableHead>SKU</TableHead><TableHead>Category</TableHead><TableHead>Stock Level</TableHead><TableHead>Current</TableHead><TableHead>Reorder</TableHead><TableHead>Unit</TableHead><TableHead>Cost</TableHead><TableHead>Supplier</TableHead><TableHead>Status</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item, index) => (
                  <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.02 }} className={`border-b transition-colors hover:bg-muted/50 ${isLowStock(item) ? "bg-red-50 dark:bg-red-950/20" : ""}`} data-testid={`row-inventory-${item.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {isLowStock(item) && <AlertTriangle className="h-4 w-4 text-red-500" />}
                        {item.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.sku || "—"}</TableCell>
                    <TableCell>{item.category || "—"}</TableCell>
                    <TableCell><StockBar current={Number(item.currentStock)} reorder={Number(item.reorderLevel)} /></TableCell>
                    <TableCell className={isLowStock(item) ? "text-red-600 font-semibold" : ""} data-testid={`text-stock-${item.id}`}>{Number(item.currentStock).toFixed(1)}</TableCell>
                    <TableCell>{Number(item.reorderLevel).toFixed(0)}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{fmt(Number(item.costPrice))}</TableCell>
                    <TableCell>{item.supplier || "—"}</TableCell>
                    <TableCell>{isLowStock(item) ? <Badge variant="destructive">Low Stock</Badge> : <Badge variant="secondary">In Stock</Badge>}</TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setAdjustingItem(item); setAdjustData({ type: "in", quantity: "", reason: "" }); setAdjustDialogOpen(true); }} data-testid={`button-adjust-${item.id}`}><ArrowUpDown className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(item)} data-testid={`button-edit-${item.id}`}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(item.id)} data-testid={`button-delete-${item.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    )}
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingItem ? "Edit Inventory Item" : "Add Inventory Item"}</DialogTitle><DialogDescription>{editingItem ? "Update the details." : "Add a new item."}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Name *</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-inventory-name" /></div>
              <div className="space-y-2"><Label>SKU</Label><Input value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} data-testid="input-inventory-sku" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Category</Label><Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} data-testid="input-inventory-category" /></div>
              <div className="space-y-2"><Label>Unit</Label>
                <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                  <SelectTrigger data-testid="select-inventory-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">Pieces</SelectItem><SelectItem value="kg">Kilograms</SelectItem><SelectItem value="g">Grams</SelectItem>
                    <SelectItem value="ltr">Litres</SelectItem><SelectItem value="ml">Millilitres</SelectItem>
                    <SelectItem value="box">Boxes</SelectItem><SelectItem value="pack">Packs</SelectItem><SelectItem value="bottles">Bottles</SelectItem><SelectItem value="bunches">Bunches</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Current Stock</Label><Input type="number" value={formData.currentStock} onChange={(e) => setFormData({ ...formData, currentStock: e.target.value })} data-testid="input-inventory-stock" /></div>
              <div className="space-y-2"><Label>Reorder Level</Label><Input type="number" value={formData.reorderLevel} onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })} data-testid="input-inventory-reorder" /></div>
              <div className="space-y-2"><Label>Cost Price</Label><Input type="number" step="0.01" value={formData.costPrice} onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })} data-testid="input-inventory-cost" /></div>
            </div>
            <div className="space-y-2"><Label>Supplier</Label><Input value={formData.supplier} onChange={(e) => setFormData({ ...formData, supplier: e.target.value })} data-testid="input-inventory-supplier" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (!formData.name.trim()) return; editingItem ? updateMutation.mutate({ id: editingItem.id, data: formData }) : createMutation.mutate(formData); }} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-inventory">{editingItem ? "Update" : "Add Item"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust Stock — {adjustingItem?.name}</DialogTitle><DialogDescription>Current: {adjustingItem ? Number(adjustingItem.currentStock).toFixed(1) : 0} {adjustingItem?.unit}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <Select value={adjustData.type} onValueChange={(v) => setAdjustData({ ...adjustData, type: v as "in" | "out" })}>
              <SelectTrigger data-testid="select-adjust-type"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="in">Stock In (Add)</SelectItem><SelectItem value="out">Stock Out (Remove)</SelectItem></SelectContent>
            </Select>
            <Input type="number" min="0" value={adjustData.quantity} onChange={(e) => setAdjustData({ ...adjustData, quantity: e.target.value })} placeholder="Quantity" data-testid="input-adjust-quantity" />
            <Input value={adjustData.reason} onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })} placeholder="Reason" data-testid="input-adjust-reason" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (adjustingItem && adjustData.quantity) adjustMutation.mutate({ id: adjustingItem.id, data: adjustData }); }} disabled={adjustMutation.isPending || !adjustData.quantity} data-testid="button-confirm-adjust">Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const { data: inventory = [] } = useQuery<InventoryItem[]>({ queryKey: ["/api/inventory"] });
  const { data: menuItemsList = [] } = useQuery<MenuItem[]>({ queryKey: ["/api/menu-items"] });

  const invMap = new Map(inventory.map(i => [i.id, i]));
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

            <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
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
  const { data: inventory = [] } = useQuery<InventoryItem[]>({ queryKey: ["/api/inventory"] });
  const { data: takeDetail } = useQuery<any>({ queryKey: ["/api/stock-takes", selectedTakeId], queryFn: async () => { if (!selectedTakeId) return null; const res = await fetch(`/api/stock-takes/${selectedTakeId}`, { credentials: "include" }); return res.json(); }, enabled: !!selectedTakeId });

  const invMap = new Map(inventory.map(i => [i.id, i]));

  const createMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/stock-takes", {}); return res.json(); },
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ["/api/stock-takes"] }); setSelectedTakeId(data.id); toast({ title: "Stock take started" }); },
  });

  const updateLineMutation = useMutation({
    mutationFn: async ({ takeId, lineId, countedQty }: { takeId: string; lineId: string; countedQty: string }) => { const res = await apiRequest("PATCH", `/api/stock-takes/${takeId}/lines/${lineId}`, { countedQty }); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/stock-takes", selectedTakeId] }); },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => { const res = await apiRequest("PATCH", `/api/stock-takes/${id}/complete`, {}); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/stock-takes"] }); queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setSelectedTakeId(null); toast({ title: "Stock take completed", description: "Inventory levels updated." }); },
  });

  const canEdit = user?.role === "owner" || user?.role === "manager";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Stock Takes</h3>
          <p className="text-sm text-muted-foreground">Count physical inventory and reconcile variance</p>
        </div>
        {canEdit && <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-new-stock-take"><ClipboardList className="h-4 w-4 mr-2" />New Stock Take</Button>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm">History</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
            {takes.length === 0 ? <p className="text-sm text-muted-foreground py-4">No stock takes yet</p> : takes.map((t: any) => (
              <button key={t.id} onClick={() => setSelectedTakeId(t.id)} className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedTakeId === t.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`} data-testid={`button-stock-take-${t.id}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">#{t.id.slice(0, 8)}</span>
                  <Badge variant={t.status === "completed" ? "secondary" : "default"}>{t.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{new Date(t.createdAt).toLocaleDateString()}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                {selectedTakeId ? `Stock Take #${selectedTakeId.slice(0, 8)}` : "Select a stock take"}
              </CardTitle>
              {takeDetail && takeDetail.status === "draft" && canEdit && (
                <Button size="sm" onClick={() => completeMutation.mutate(selectedTakeId!)} disabled={completeMutation.isPending} data-testid="button-complete-stock-take">Complete & Apply</Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!takeDetail ? <p className="text-sm text-muted-foreground py-8 text-center">Select or create a stock take to begin</p> : (
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead><TableHead>Expected</TableHead><TableHead>Counted</TableHead><TableHead>Variance</TableHead><TableHead>Cost Impact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(takeDetail.lines || []).map((line: any) => {
                      const item = invMap.get(line.inventoryItemId);
                      const variance = line.varianceQty !== null ? Number(line.varianceQty) : null;
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="font-medium">{item?.name || "Unknown"}<div className="text-xs text-muted-foreground">{item?.unit}</div></TableCell>
                          <TableCell>{Number(line.expectedQty).toFixed(1)}</TableCell>
                          <TableCell>
                            {takeDetail.status === "draft" ? (
                              <Input type="number" step="0.1" className="w-24" defaultValue={line.countedQty || ""} onBlur={(e) => { if (e.target.value) updateLineMutation.mutate({ takeId: selectedTakeId!, lineId: line.id, countedQty: e.target.value }); }} data-testid={`input-counted-${line.id}`} />
                            ) : <span>{line.countedQty !== null ? Number(line.countedQty).toFixed(1) : "—"}</span>}
                          </TableCell>
                          <TableCell className={variance !== null ? (variance < 0 ? "text-red-600 font-semibold" : variance > 0 ? "text-green-600" : "") : ""}>{variance !== null ? (variance > 0 ? "+" : "") + variance.toFixed(1) : "—"}</TableCell>
                          <TableCell className={line.varianceCost ? (Number(line.varianceCost) < 0 ? "text-red-600" : "text-green-600") : ""}>{line.varianceCost ? fmt(Number(line.varianceCost)) : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {takeDetail.status === "completed" && (
                  <div className="mt-4 p-3 rounded-lg bg-muted/50 text-center">
                    <div className="text-sm text-muted-foreground">Total Variance Cost</div>
                    <div className="text-xl font-bold">{fmt((takeDetail.lines || []).reduce((s: number, l: any) => s + Number(l.varianceCost || 0), 0))}</div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
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

  const { data: report, isLoading } = useQuery<any>({ queryKey: ["/api/food-cost-report"] });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Loading report...</div>;
  if (!report) return <div className="text-center py-8 text-muted-foreground">No data available</div>;

  const topMovers = report.topMovers || [];
  const reorderSuggestions = report.reorderSuggestions || [];
  const varianceData = report.varianceByIngredient || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Avg Food Cost %" value={`${report.summary?.avgFoodCostPct || 0}%`} icon={Percent} iconColor={Number(report.summary?.avgFoodCostPct) > 35 ? "text-red-600" : "text-green-600"} iconBg={Number(report.summary?.avgFoodCostPct) > 35 ? "bg-red-100" : "bg-green-100"} testId="stat-avg-food-cost-report" />
        <StatCard title="Total Plate Cost" value={fmt(report.summary?.totalCost || 0)} icon={DollarSign} iconColor="text-blue-600" iconBg="bg-blue-100" testId="stat-total-plate-cost" />
        <StatCard title="Total Revenue Potential" value={fmt(report.summary?.totalRevenue || 0)} icon={Activity} iconColor="text-emerald-600" iconBg="bg-emerald-100" testId="stat-total-revenue" />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><DollarSign className="h-4 w-4" />Food Cost Analysis</CardTitle></CardHeader>
        <CardContent>
          {(report.recipes || []).length === 0 ? <div className="text-center py-8 text-muted-foreground">No recipes to analyze. Create recipes first.</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipe</TableHead><TableHead>Menu Item</TableHead><TableHead>Plate Cost</TableHead><TableHead>Selling Price</TableHead><TableHead>Food Cost %</TableHead><TableHead>Margin</TableHead><TableHead>Sold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report.recipes || []).map((r: any) => (
                  <TableRow key={r.recipeId} data-testid={`row-food-cost-${r.recipeId}`}>
                    <TableCell className="font-medium">{r.recipeName}</TableCell>
                    <TableCell>{r.menuItemName || "—"}</TableCell>
                    <TableCell>{fmt(r.plateCost)}</TableCell>
                    <TableCell>{r.sellingPrice > 0 ? fmt(r.sellingPrice) : "—"}</TableCell>
                    <TableCell><Badge variant={r.foodCostPct > 35 ? "destructive" : r.foodCostPct > 30 ? "default" : "secondary"}>{r.foodCostPct}%</Badge></TableCell>
                    <TableCell className={r.margin >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>{r.sellingPrice > 0 ? fmt(r.margin) : "—"}</TableCell>
                    <TableCell>{r.soldQty || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-4 w-4" />Top 10 Movers</CardTitle></CardHeader>
          <CardContent>
            {topMovers.length === 0 ? <div className="text-center py-4 text-muted-foreground text-sm">No usage data yet</div> : (
              <Table>
                <TableHeader><TableRow><TableHead>Ingredient</TableHead><TableHead>Usage</TableHead><TableHead>Unit</TableHead></TableRow></TableHeader>
                <TableBody>
                  {topMovers.filter((m: any) => m.usage > 0).map((m: any) => (
                    <TableRow key={m.itemId} data-testid={`row-top-mover-${m.itemId}`}>
                      <TableCell className="font-medium">{m.itemName}</TableCell>
                      <TableCell>{m.usage}</TableCell>
                      <TableCell className="text-muted-foreground">{m.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Reorder Suggestions</CardTitle></CardHeader>
          <CardContent>
            {reorderSuggestions.length === 0 ? <div className="text-center py-4 text-muted-foreground text-sm">All items above par level</div> : (
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Stock</TableHead><TableHead>Par</TableHead><TableHead>Lead</TableHead><TableHead>Suggested Order</TableHead></TableRow></TableHeader>
                <TableBody>
                  {reorderSuggestions.map((s: any) => (
                    <TableRow key={s.itemId} data-testid={`row-reorder-${s.itemId}`}>
                      <TableCell className="font-medium">{s.itemName}</TableCell>
                      <TableCell className="text-red-600">{s.currentStock} {s.unit}</TableCell>
                      <TableCell>{s.parLevel} {s.unit}</TableCell>
                      <TableCell>{s.leadTimeDays}d</TableCell>
                      <TableCell className="font-bold text-primary">{Math.round(s.suggestedOrder * 100) / 100} {s.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {varianceData.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Activity className="h-4 w-4" />Ideal vs Actual Usage Variance</CardTitle></CardHeader>
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
    </div>
  );
}

export default function InventoryPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6" data-testid="page-inventory">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10"><Warehouse className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-bold font-heading" data-testid="text-inventory-title">Inventory & Recipes</h1>
          <p className="text-muted-foreground">Manage stock, recipes, food costing & stock takes</p>
        </div>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="inventory" data-testid="tab-inventory"><Package className="h-4 w-4 mr-2" />Inventory</TabsTrigger>
          <TabsTrigger value="recipes" data-testid="tab-recipes"><ChefHat className="h-4 w-4 mr-2" />Recipes</TabsTrigger>
          <TabsTrigger value="stock-takes" data-testid="tab-stock-takes"><ClipboardList className="h-4 w-4 mr-2" />Stock Takes</TabsTrigger>
          <TabsTrigger value="food-cost" data-testid="tab-food-cost"><DollarSign className="h-4 w-4 mr-2" />Food Cost</TabsTrigger>
        </TabsList>
        <TabsContent value="inventory"><InventoryTab /></TabsContent>
        <TabsContent value="recipes"><RecipesTab /></TabsContent>
        <TabsContent value="stock-takes"><StockTakesTab /></TabsContent>
        <TabsContent value="food-cost"><FoodCostTab /></TabsContent>
      </Tabs>
    </motion.div>
  );
}