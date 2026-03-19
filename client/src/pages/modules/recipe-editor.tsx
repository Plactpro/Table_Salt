import { useState, useEffect, useCallback } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatCurrency } from "@shared/currency";
import { convertUnits } from "@shared/units";
import type { InventoryItem, MenuItem, Recipe, RecipeIngredient } from "@shared/schema";
import {
  ChefHat, Plus, Trash2, ArrowLeft, Save, Link2, Loader2, X,
  DollarSign, TrendingUp, Clock, Package, AlertTriangle, Copy, Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

type RecipeWithIngredients = Recipe & { ingredients: RecipeIngredient[] };

interface IngredientRow {
  inventoryItemId: string;
  quantity: string;
  unit: string;
  wastePct: string;
  notes: string;
}

const UNITS = ["kg", "g", "ltr", "ml", "pcs", "bottles", "bunches", "cups", "tbsp", "tsp"];

export default function RecipeEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isNew = !id || id === "new";
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const preselectedMenuItemId = searchParams.get("menuItemId") || "none";
  const prefilledName = searchParams.get("menuItemName") || "";

  const fmt = useCallback((v: number) => {
    const tenant = user?.tenant;
    return formatCurrency(v, tenant?.currency || "AED", { position: (tenant?.currencyPosition as "before" | "after") || "before", decimals: tenant?.currencyDecimals ?? 2 });
  }, [user]);

  const { data: existingRecipe, isLoading: loadingRecipe } = useQuery<RecipeWithIngredients>({
    queryKey: [`/api/recipes/${id}`],
    enabled: !isNew,
    retry: false,
  });

  const { data: inventory = [] } = useQuery<InventoryItem[]>({ queryKey: ["/api/inventory"] });
  const { data: menuItems = [] } = useQuery<MenuItem[]>({ queryKey: ["/api/menu-items"] });

  const invMap = new Map(inventory.map(i => [i.id, i]));
  const menuMap = new Map(menuItems.map(m => [m.id, m]));

  const [name, setName] = useState("");
  const [menuItemId, setMenuItemId] = useState(isNew ? preselectedMenuItemId : "none");
  const [yieldQty, setYieldQty] = useState("1");
  const [yieldUnit, setYieldUnit] = useState("portion");
  const [prepTime, setPrepTime] = useState("");
  const [wastePct, setWastePct] = useState("0");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [ingSearch, setIngSearch] = useState("");

  // Browser-level navigation guard (external tab close / refresh)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // In-app navigation guard (intercept wouter pushState-based navigation + browser back button)
  useEffect(() => {
    if (!isDirty) return;

    const originalPushState = window.history.pushState.bind(window.history);
    window.history.pushState = function (...args: Parameters<typeof window.history.pushState>) {
      if (!window.confirm("You have unsaved changes. Leave without saving?")) return;
      setIsDirty(false);
      originalPushState(...args);
    };

    const handlePopState = () => {
      if (!window.confirm("You have unsaved changes. Leave without saving?")) {
        // Cancel back navigation by going forward again
        window.history.go(1);
      } else {
        setIsDirty(false);
      }
    };
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.history.pushState = originalPushState;
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isDirty]);

  useEffect(() => {
    if (existingRecipe && !initialized) {
      setName(existingRecipe.name);
      setMenuItemId(existingRecipe.menuItemId || "none");
      setYieldQty(existingRecipe.yield?.toString() || "1");
      setYieldUnit(existingRecipe.yieldUnit || "portion");
      setPrepTime(existingRecipe.prepTimeMinutes?.toString() || "");
      setWastePct(existingRecipe.wastePct?.toString() || "0");
      setNotes(existingRecipe.notes || "");
      setRows(existingRecipe.ingredients.map(ing => ({
        inventoryItemId: ing.inventoryItemId,
        quantity: ing.quantity?.toString() || "0",
        unit: ing.unit || "kg",
        wastePct: ing.wastePct?.toString() || "0",
        notes: ing.notes || "",
      })));
      setInitialized(true);
      setIsDirty(false);
    } else if (isNew && !initialized) {
      if (prefilledName) setName(prefilledName);
      setInitialized(true);
    }
  }, [existingRecipe, isNew, initialized, prefilledName]);

  function markDirty() { setIsDirty(true); }

  function calcLineCost(row: IngredientRow): number {
    const item = invMap.get(row.inventoryItemId);
    if (!item) return 0;
    const qty = Number(row.quantity) || 0;
    const waste = Number(row.wastePct || 0) / 100;
    const effectiveQty = waste >= 1 ? qty : qty / (1 - waste);
    const converted = convertUnits(effectiveQty, row.unit || item.unit || "kg", item.unit || "kg");
    return converted * Number(item.costPrice || 0);
  }

  const totalCost = rows.reduce((sum, row) => sum + calcLineCost(row), 0);
  const linkedItem = menuItemId !== "none" ? menuMap.get(menuItemId) : null;
  const sellingPrice = Number(linkedItem?.price || 0);
  const yieldQtyNum = Math.max(Number(yieldQty) || 1, 1);
  const costPerPortion = totalCost / yieldQtyNum;
  const margin = sellingPrice > 0 ? sellingPrice - costPerPortion : 0;
  const foodCostPct = sellingPrice > 0 ? (costPerPortion / sellingPrice) * 100 : 0;
  const suggestedSellingPrice = costPerPortion > 0 ? costPerPortion / 0.30 : 0;

  function addRow() {
    setRows(prev => [...prev, { inventoryItemId: "", quantity: "1", unit: "kg", wastePct: "0", notes: "" }]);
    markDirty();
  }

  function duplicateRow(idx: number) {
    setRows(prev => {
      const next = [...prev];
      next.splice(idx + 1, 0, { ...next[idx] });
      return next;
    });
    markDirty();
  }

  function updateRow(idx: number, field: keyof IngredientRow, value: string) {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === "inventoryItemId") {
        const item = invMap.get(value);
        if (item) next[idx].unit = item.unit || "kg";
        setIngSearch("");
      }
      return next;
    });
    markDirty();
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  }

  const createMutation = useMutation({
    mutationFn: async (data: object) => {
      const res = await apiRequest("POST", "/api/recipes", data);
      return res.json();
    },
    onSuccess: (recipe: RecipeWithIngredients) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      toast({ title: "Recipe created" });
      setIsDirty(false);
      navigate(`/recipes/${recipe.id}`);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: object) => {
      const res = await apiRequest("PATCH", `/api/recipes/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      queryClient.invalidateQueries({ queryKey: [`/api/recipes/${id}`] });
      toast({ title: "Recipe saved" });
      setIsDirty(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleSave() {
    if (!name.trim()) {
      toast({ title: "Recipe name is required", variant: "destructive" });
      return;
    }
    const validRows = rows.filter(r => r.inventoryItemId && Number(r.quantity) > 0);
    const payload = {
      name: name.trim(),
      menuItemId: menuItemId === "none" ? null : menuItemId,
      yield: yieldQty || "1",
      yieldUnit: yieldUnit || "portion",
      prepTimeMinutes: prepTime ? Number(prepTime) : null,
      wastePct: wastePct || "0",
      notes: notes || null,
      ingredients: validRows.map((r, i) => ({ ...r, sortOrder: i })),
    };
    if (isNew) {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate(payload);
    }
  }

  function handleBack() {
    if (isDirty && !confirm("You have unsaved changes. Leave without saving?")) return;
    navigate("/inventory");
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const canEdit = can(user?.role || "", "edit_recipe");

  const filteredInventory = ingSearch.trim()
    ? inventory.filter(i => i.name.toLowerCase().includes(ingSearch.toLowerCase()))
    : inventory;

  if (!isNew && loadingRecipe) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10" data-testid="recipe-editor-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBack} data-testid="button-back-recipes">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold" data-testid="text-recipe-editor-title">
              {isNew ? "New Recipe" : (name || "Edit Recipe")}
            </h1>
            {isDirty && <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs">Unsaved</Badge>}
          </div>
        </div>
        {canEdit && (
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-recipe">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {isNew ? "Create Recipe" : "Save Changes"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recipe Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="recipe-name">Recipe Name *</Label>
                <Input
                  id="recipe-name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); markDirty(); }}
                  placeholder="e.g. Grilled Salmon Fillet"
                  disabled={!canEdit}
                  data-testid="input-recipe-name"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Linked Menu Item</Label>
                <Select value={menuItemId} onValueChange={(v) => { setMenuItemId(v); markDirty(); }} disabled={!canEdit}>
                  <SelectTrigger data-testid="select-recipe-menu-item">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {menuItems.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({fmt(Number(m.price))})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {linkedItem && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Link2 className="h-3 w-3" /> Linked to: {linkedItem.name}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="yield-qty">Yield</Label>
                  <Input
                    id="yield-qty"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={yieldQty}
                    onChange={(e) => { setYieldQty(e.target.value); markDirty(); }}
                    disabled={!canEdit}
                    data-testid="input-recipe-yield"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="yield-unit">Unit</Label>
                  <Input
                    id="yield-unit"
                    value={yieldUnit}
                    onChange={(e) => { setYieldUnit(e.target.value); markDirty(); }}
                    placeholder="portion"
                    disabled={!canEdit}
                    data-testid="input-recipe-yield-unit"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="prep-time" className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Prep Time (min)
                  </Label>
                  <Input
                    id="prep-time"
                    type="number"
                    min="0"
                    value={prepTime}
                    onChange={(e) => { setPrepTime(e.target.value); markDirty(); }}
                    placeholder="e.g. 15"
                    disabled={!canEdit}
                    data-testid="input-recipe-prep-time"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="waste-pct" className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">%</span> Recipe Waste %
                  </Label>
                  <Input
                    id="waste-pct"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={wastePct}
                    onChange={(e) => { setWastePct(e.target.value); markDirty(); }}
                    placeholder="0"
                    disabled={!canEdit}
                    data-testid="input-recipe-waste-pct"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); markDirty(); }}
                  placeholder="Preparation notes, techniques..."
                  rows={3}
                  disabled={!canEdit}
                  data-testid="input-recipe-notes"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" /> Cost Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Recipe Cost</span>
                <span className="font-semibold" data-testid="text-total-cost">{fmt(totalCost)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Cost per {yieldUnit || "portion"}</span>
                <span className="font-semibold text-primary" data-testid="text-cost-per-portion">{fmt(costPerPortion)}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Selling Price</span>
                <span className="font-semibold" data-testid="text-selling-price">{sellingPrice > 0 ? fmt(sellingPrice) : "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Food Cost %</span>
                <Badge
                  variant={foodCostPct > 40 ? "destructive" : foodCostPct > 30 ? "default" : "secondary"}
                  data-testid="badge-food-cost-pct"
                >
                  {sellingPrice > 0 ? `${foodCostPct.toFixed(1)}%` : "—"}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Gross Margin</span>
                <span className={`font-semibold ${margin >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-margin">
                  {sellingPrice > 0 ? fmt(margin) : "—"}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Suggested Price <span className="text-xs opacity-70">(30% target)</span>
                </span>
                <span className="font-semibold text-blue-600" data-testid="text-suggested-price">
                  {suggestedSellingPrice > 0 ? fmt(suggestedSellingPrice) : "—"}
                </span>
              </div>
              {sellingPrice === 0 && rows.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Link a menu item above to calculate food cost % vs actual selling price</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" /> Ingredients
                  <Badge variant="secondary">{rows.filter(r => r.inventoryItemId).length}</Badge>
                </CardTitle>
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={addRow} data-testid="button-add-ingredient">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Ingredient
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground" data-testid="text-no-ingredients">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No ingredients yet. Add your first ingredient.</p>
                  {canEdit && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={addRow} data-testid="button-add-ingredient-empty">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Ingredient
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">
                          <div className="flex items-center gap-1.5">Ingredient
                            {canEdit && (
                              <div className="relative ml-1">
                                <Search className="h-3 w-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                <Input
                                  placeholder="Search..."
                                  value={ingSearch}
                                  onChange={(e) => setIngSearch(e.target.value)}
                                  className="h-6 pl-6 w-28 text-xs"
                                  data-testid="input-ingredient-search"
                                />
                              </div>
                            )}
                          </div>
                        </TableHead>
                        <TableHead className="w-24">Quantity</TableHead>
                        <TableHead className="w-28">Unit</TableHead>
                        <TableHead className="w-24">Waste %</TableHead>
                        <TableHead className="min-w-[140px]">Notes</TableHead>
                        <TableHead className="w-28 text-right">Line Cost</TableHead>
                        {canEdit && <TableHead className="w-16" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, idx) => {
                        const lineCost = calcLineCost(row);
                        const item = invMap.get(row.inventoryItemId);
                        return (
                          <TableRow key={idx} data-testid={`ingredient-row-${idx}`}>
                            <TableCell>
                              <Select
                                value={row.inventoryItemId || "none"}
                                onValueChange={(v) => updateRow(idx, "inventoryItemId", v === "none" ? "" : v)}
                                disabled={!canEdit}
                              >
                                <SelectTrigger className="h-8" data-testid={`select-ingredient-${idx}`}>
                                  <SelectValue placeholder="Select item..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">— Select —</SelectItem>
                                  {filteredInventory.map(i => (
                                    <SelectItem key={i.id} value={i.id}>
                                      {i.name} ({i.unit}) · {fmt(Number(i.costPrice || 0))}/{i.unit}
                                    </SelectItem>
                                  ))}
                                  {filteredInventory.length === 0 && (
                                    <SelectItem value="_none" disabled>No matches</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                className="h-8 w-20"
                                value={row.quantity}
                                onChange={(e) => updateRow(idx, "quantity", e.target.value)}
                                disabled={!canEdit}
                                data-testid={`input-ingredient-qty-${idx}`}
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={row.unit}
                                onValueChange={(v) => updateRow(idx, "unit", v)}
                                disabled={!canEdit}
                              >
                                <SelectTrigger className="h-8" data-testid={`select-ingredient-unit-${idx}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                  {item && !UNITS.includes(item.unit || "") && item.unit && (
                                    <SelectItem value={item.unit}>{item.unit}</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                max="99"
                                step="0.5"
                                className="h-8 w-20"
                                value={row.wastePct}
                                onChange={(e) => updateRow(idx, "wastePct", e.target.value)}
                                disabled={!canEdit}
                                data-testid={`input-ingredient-waste-${idx}`}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="h-8"
                                value={row.notes}
                                onChange={(e) => updateRow(idx, "notes", e.target.value)}
                                placeholder="e.g. pre-sliced"
                                disabled={!canEdit}
                                data-testid={`input-ingredient-notes-${idx}`}
                              />
                            </TableCell>
                            <TableCell className="text-right font-medium text-sm" data-testid={`text-line-cost-${idx}`}>
                              {row.inventoryItemId ? fmt(lineCost) : "—"}
                            </TableCell>
                            {canEdit && (
                              <TableCell>
                                <div className="flex items-center gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => duplicateRow(idx)}
                                    title="Duplicate row"
                                    data-testid={`button-duplicate-ingredient-${idx}`}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => removeRow(idx)}
                                    data-testid={`button-remove-ingredient-${idx}`}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                      {rows.some(r => r.inventoryItemId) && (
                        <TableRow className="bg-muted/30 font-semibold">
                          <TableCell colSpan={5} className="text-right text-sm">Total Recipe Cost</TableCell>
                          <TableCell className="text-right text-primary" data-testid="text-footer-total">{fmt(totalCost)}</TableCell>
                          {canEdit && <TableCell />}
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {rows.some(r => r.inventoryItemId) && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Recipe Cost", value: fmt(totalCost), color: "text-foreground", testId: "stat-recipe-cost" },
                { label: `Cost / ${yieldUnit || "portion"}`, value: fmt(costPerPortion), color: "text-primary", testId: "stat-cost-per-portion" },
                { label: "Selling Price", value: sellingPrice > 0 ? fmt(sellingPrice) : "—", color: "text-foreground", testId: "stat-selling-price" },
                { label: "Food Cost %", value: sellingPrice > 0 ? `${foodCostPct.toFixed(1)}%` : "—", color: foodCostPct > 40 ? "text-red-600" : foodCostPct > 30 ? "text-amber-600" : "text-green-600", testId: "stat-food-cost-pct" },
                { label: "Suggested (30%)", value: suggestedSellingPrice > 0 ? fmt(suggestedSellingPrice) : "—", color: "text-blue-600", testId: "stat-suggested-price" },
              ].map(stat => (
                <Card key={stat.label} className="text-center p-3">
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                  <div className={`text-base font-bold mt-1 ${stat.color}`} data-testid={stat.testId}>{stat.value}</div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
