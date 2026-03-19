import { useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import SupervisorApprovalDialog from "@/components/supervisor-approval-dialog";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { convertUnits } from "@shared/units";
import type { Recipe, RecipeIngredient, InventoryItem } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DishInfoPanel } from "@/components/widgets/dish-info-panel";
import {
  Plus, Pencil, Trash2, UtensilsCrossed, Leaf, Drumstick, Coffee, Beef,
  IceCream, Wine, Soup, Pizza, Salad, Sandwich, Eye, X, ImageIcon, Flame,
  Package, Copy, Calendar, Clock, Store, TrendingUp, Percent, ChefHat, ExternalLink, Loader2,
} from "lucide-react";
import type { MenuCategory, MenuItem, KitchenStation, ComboOffer } from "@shared/schema";

const categoryIcons: Record<string, React.ElementType> = {
  appetizers: Soup, starters: Soup, mains: Beef, main: Beef,
  desserts: IceCream, dessert: IceCream, drinks: Coffee,
  beverages: Wine, salads: Salad, pizza: Pizza, sandwiches: Sandwich,
};

function getCategoryIcon(name: string) {
  const lower = name.toLowerCase();
  for (const [key, Icon] of Object.entries(categoryIcons)) {
    if (lower.includes(key)) return Icon;
  }
  return UtensilsCrossed;
}

const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

const COMMON_TAGS = ["Spicy", "Vegan", "Gluten-Free", "Dairy-Free", "Nut-Free", "Organic", "Chef's Special", "New", "Popular", "Seasonal"];

interface IngredientItem {
  name: string;
  allergen?: boolean;
}

interface ParsedIngredients {
  items?: IngredientItem[];
  allergens?: string[];
  nutritionalNotes?: string;
  preparationNotes?: string;
  calories?: number;
}

interface ComboItemRef {
  menuItemId: string;
  name: string;
  price: string;
}

type RecipeWithIngredients = Recipe & { ingredients: RecipeIngredient[] };

interface RecipeLinkSectionProps {
  editingItem: MenuItem;
  linkedRecipe: RecipeWithIngredients | undefined;
  unlinkedRecipes: RecipeWithIngredients[];
  plateCost: number | null;
  sp: number;
  foodCostPct: number | null;
  fmt: (v: string | number) => string;
  onNavigate: (path: string) => void;
  queryClient: { invalidateQueries: (opts: { queryKey: string[] }) => void };
  toast: (opts: { title: string; description?: string; variant?: string }) => void;
}

function RecipeLinkSection({ editingItem, linkedRecipe, unlinkedRecipes, plateCost, sp, foodCostPct, fmt, onNavigate, queryClient, toast }: RecipeLinkSectionProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("none");
  const [linking, setLinking] = useState(false);

  const handleLinkRecipe = async () => {
    if (selectedRecipeId === "none") return;
    setLinking(true);
    try {
      const csrfMatch = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
      const csrfHeaders: Record<string, string> = {};
      if (csrfMatch) csrfHeaders["x-csrf-token"] = decodeURIComponent(csrfMatch[1]);
      const res = await fetch(`/api/recipes/${selectedRecipeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        body: JSON.stringify({ menuItemId: editingItem.id }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Link failed"); }
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      toast({ title: "Recipe linked to menu item" });
      setSelectedRecipeId("none");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkRecipe = async () => {
    if (!linkedRecipe) return;
    setLinking(true);
    try {
      const csrfMatch = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
      const csrfHeaders: Record<string, string> = {};
      if (csrfMatch) csrfHeaders["x-csrf-token"] = decodeURIComponent(csrfMatch[1]);
      const res = await fetch(`/api/recipes/${linkedRecipe.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        body: JSON.stringify({ menuItemId: null }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Unlink failed"); }
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      toast({ title: "Recipe unlinked" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/30" data-testid="section-recipe-link">
      <h4 className="font-medium text-sm flex items-center gap-2">
        <ChefHat className="h-4 w-4" />
        Recipe & Food Cost
      </h4>
      {linkedRecipe ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{linkedRecipe.name}</p>
              <p className="text-xs text-muted-foreground">{linkedRecipe.ingredients?.length || 0} ingredients</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onNavigate(`/recipes/${linkedRecipe.id}`)} data-testid="button-view-recipe">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View / Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleUnlinkRecipe} disabled={linking} data-testid="button-unlink-recipe">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-background rounded-md p-2 text-center border">
              <p className="text-xs text-muted-foreground">Plate Cost</p>
              <p className="text-sm font-bold text-foreground mt-0.5" data-testid="text-plate-cost">{fmt(plateCost ?? 0)}</p>
            </div>
            <div className="bg-background rounded-md p-2 text-center border">
              <p className="text-xs text-muted-foreground">Food Cost %</p>
              <p className={`text-sm font-bold mt-0.5 ${foodCostPct !== null && foodCostPct > 40 ? "text-red-600" : foodCostPct !== null && foodCostPct > 30 ? "text-amber-600" : "text-green-600"}`} data-testid="text-food-cost-pct">
                {foodCostPct !== null ? `${foodCostPct.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div className="bg-background rounded-md p-2 text-center border">
              <p className="text-xs text-muted-foreground">Margin</p>
              <p className={`text-sm font-bold mt-0.5 ${plateCost !== null && sp - plateCost >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-margin">
                {plateCost !== null && sp > 0 ? fmt(sp - plateCost) : "—"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">No recipe linked to this menu item.</p>
          {unlinkedRecipes.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={selectedRecipeId} onValueChange={setSelectedRecipeId}>
                <SelectTrigger className="flex-1" data-testid="select-link-recipe">
                  <SelectValue placeholder="Select existing recipe..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select recipe —</SelectItem>
                  {unlinkedRecipes.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name} ({r.ingredients?.length || 0} ingredients)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleLinkRecipe} disabled={selectedRecipeId === "none" || linking} data-testid="button-link-recipe">
                {linking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Link"}
              </Button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => onNavigate(`/recipes/new?menuItemId=${editingItem.id}`)} data-testid="button-create-recipe-for-item">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Create New Recipe for this Item
          </Button>
        </div>
      )}
    </div>
  );
}

export default function MenuPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: string | number) => sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });

  const [activeTab, setActiveTab] = useState<"items" | "combos">("items");

  const [supervisorDialog, setSupervisorDialog] = useState<{
    open: boolean;
    action: string;
    actionLabel: string;
    pendingData: { id: string; data: Record<string, unknown> } | null;
  } | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState(0);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: "", description: "", price: "", categoryId: "",
    isVeg: false, available: true, image: "", spicyLevel: 0,
    tags: [] as string[], customTag: "",
    ingredientsList: "", allergens: "", nutritionalNotes: "", preparationNotes: "", calories: "",
    station: "", course: "",
  });

  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);

  const [comboDialogOpen, setComboDialogOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<ComboOffer | null>(null);
  const [comboForm, setComboForm] = useState({
    name: "",
    description: "",
    comboPrice: "",
    mainItems: [] as ComboItemRef[],
    sideItems: [] as ComboItemRef[],
    addonItems: [] as ComboItemRef[],
    validityStart: "",
    validityEnd: "",
    timeSlots: [] as string[],
    outlets: [] as string[],
    isActive: true,
  });

  const { data: categories = [] } = useQuery<MenuCategory[]>({ queryKey: ["/api/menu-categories"] });
  const { data: allItems = [] } = useQuery<MenuItem[]>({ queryKey: ["/api/menu-items"] });
  const { data: stations = [] } = useQuery<KitchenStation[]>({ queryKey: ["/api/kitchen-stations"] });
  const { data: comboOffers = [] } = useQuery<ComboOffer[]>({ queryKey: ["/api/combo-offers"] });
  const { data: outletsList = [] } = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/outlets"] });
  const { data: allRecipes = [] } = useQuery<RecipeWithIngredients[]>({ queryKey: ["/api/recipes"] });
  const { data: allInventory = [] } = useQuery<InventoryItem[]>({ queryKey: ["/api/inventory"] });
  const invMap = new Map(allInventory.map(i => [i.id, i]));

  const filteredItems = selectedCategoryId
    ? allItems.filter((item) => item.categoryId === selectedCategoryId)
    : allItems;

  const comboIndividualTotal = useMemo(() => {
    const items = [...comboForm.mainItems, ...comboForm.sideItems, ...comboForm.addonItems];
    return items.reduce((sum, item) => sum + Number(item.price), 0);
  }, [comboForm.mainItems, comboForm.sideItems, comboForm.addonItems]);

  const comboSavingsAmount = useMemo(() => {
    const price = parseFloat(comboForm.comboPrice);
    if (isNaN(price) || comboIndividualTotal === 0) return 0;
    return comboIndividualTotal - price;
  }, [comboForm.comboPrice, comboIndividualTotal]);

  const comboSavingsPercent = useMemo(() => {
    if (comboIndividualTotal === 0) return 0;
    const price = parseFloat(comboForm.comboPrice);
    if (isNaN(price)) return 0;
    return ((comboIndividualTotal - price) / comboIndividualTotal) * 100;
  }, [comboForm.comboPrice, comboIndividualTotal]);

  const createCategory = useMutation({
    mutationFn: async (data: { name: string; sortOrder: number }) => {
      const res = await apiRequest("POST", "/api/menu-categories", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-categories"] });
      toast({ title: "Category created" });
      setCategoryDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<MenuCategory> }) => {
      const res = await apiRequest("PATCH", `/api/menu-categories/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-categories"] });
      toast({ title: "Category updated" });
      setCategoryDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/menu-categories/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-categories"] });
      if (selectedCategoryId) setSelectedCategoryId(null);
      toast({ title: "Category deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const createItem = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/menu-items", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
      toast({ title: "Item created" });
      setItemDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const pendingUpdateRef = { current: null as { id: string; data: Record<string, unknown> } | null };

  const updateItem = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      pendingUpdateRef.current = { id, data };
      const res = await fetch(`/api/menu-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (res.status === 403) {
        const errData = await res.json();
        if (errData.requiresSupervisor) {
          throw new Error("__SUPERVISOR_REQUIRED__:" + (errData.action || "change_price"));
        }
        throw new Error(errData.message || "Permission denied");
      }
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      pendingUpdateRef.current = null;
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
      toast({ title: "Item updated" });
      setItemDialogOpen(false);
    },
    onError: (err: Error) => {
      if (err.message.startsWith("__SUPERVISOR_REQUIRED__:") && pendingUpdateRef.current) {
        const action = err.message.split(":")[1];
        setSupervisorDialog({
          open: true,
          action: action || "change_price",
          actionLabel: "Change Menu Price",
          pendingData: pendingUpdateRef.current,
        });
        return;
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleMenuSupervisorApproved = useCallback((_supervisorId: string, credentials: { username: string; password: string; otpApprovalToken?: string }) => {
    if (supervisorDialog?.pendingData) {
      const { id, data } = supervisorDialog.pendingData;
      updateItem.mutate({ id, data: { ...data, supervisorOverride: credentials } });
    }
    setSupervisorDialog(null);
  }, [supervisorDialog, updateItem]);

  const deleteItem = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/menu-items/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
      toast({ title: "Item deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleAvailability = useMutation({
    mutationFn: async ({ id, available }: { id: string; available: boolean }) => {
      const res = await apiRequest("PATCH", `/api/menu-items/${id}`, { available });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] }); },
  });

  const createCombo = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/combo-offers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/combo-offers"] });
      toast({ title: "Combo created" });
      setComboDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateCombo = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/combo-offers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/combo-offers"] });
      toast({ title: "Combo updated" });
      setComboDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteCombo = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/combo-offers/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/combo-offers"] });
      toast({ title: "Combo deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const duplicateCombo = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/combo-offers/${id}/duplicate`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/combo-offers"] });
      toast({ title: "Combo duplicated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function openAddCategory() {
    setEditingCategory(null);
    setCategoryName("");
    setCategorySortOrder(0);
    setCategoryDialogOpen(true);
  }

  function openEditCategory(cat: MenuCategory) {
    setEditingCategory(cat);
    setCategoryName(cat.name);
    setCategorySortOrder(cat.sortOrder ?? 0);
    setCategoryDialogOpen(true);
  }

  function handleCategorySubmit() {
    if (!categoryName.trim()) return;
    if (editingCategory) {
      updateCategory.mutate({ id: editingCategory.id, data: { name: categoryName, sortOrder: categorySortOrder } });
    } else {
      createCategory.mutate({ name: categoryName, sortOrder: categorySortOrder });
    }
  }

  function parseIngredients(item: MenuItem): ParsedIngredients | null {
    if (!item.ingredients) return null;
    if (typeof item.ingredients === "object") return item.ingredients as ParsedIngredients;
    try { return JSON.parse(String(item.ingredients)) as ParsedIngredients; } catch { return null; }
  }

  function openAddItem() {
    setEditingItem(null);
    setItemForm({
      name: "", description: "", price: "", categoryId: selectedCategoryId || "",
      isVeg: false, available: true, image: "", spicyLevel: 0,
      tags: [], customTag: "",
      ingredientsList: "", allergens: "", nutritionalNotes: "", preparationNotes: "", calories: "",
      station: "", course: "",
    });
    setItemDialogOpen(true);
  }

  function openEditItem(item: MenuItem) {
    setEditingItem(item);
    const ing = parseIngredients(item);
    setItemForm({
      name: item.name,
      description: item.description || "",
      price: String(item.price),
      categoryId: item.categoryId || "",
      isVeg: item.isVeg ?? false,
      available: item.available ?? true,
      image: item.image || "",
      spicyLevel: item.spicyLevel ?? 0,
      tags: (item.tags as string[]) || [],
      customTag: "",
      ingredientsList: ing?.items?.map((i) => i.name).join(", ") || "",
      allergens: ing?.allergens?.join(", ") || "",
      nutritionalNotes: ing?.nutritionalNotes || "",
      preparationNotes: ing?.preparationNotes || "",
      calories: ing?.calories ? String(ing.calories) : "",
      station: item.station || "",
      course: item.course || "",
    });
    setItemDialogOpen(true);
  }

  function handleItemSubmit() {
    if (!itemForm.name.trim() || !itemForm.price) return;
    const ingredients: ParsedIngredients = {};
    if (itemForm.ingredientsList.trim()) {
      ingredients.items = itemForm.ingredientsList.split(",").map((s) => {
        const name = s.trim();
        const allergensList = itemForm.allergens.split(",").map((a) => a.trim().toLowerCase());
        const isAllergen = allergensList.some((a) => name.toLowerCase().includes(a));
        return { name, allergen: isAllergen };
      });
    }
    if (itemForm.allergens.trim()) {
      ingredients.allergens = itemForm.allergens.split(",").map((a) => a.trim());
    }
    if (itemForm.nutritionalNotes.trim()) ingredients.nutritionalNotes = itemForm.nutritionalNotes;
    if (itemForm.preparationNotes.trim()) ingredients.preparationNotes = itemForm.preparationNotes;
    if (itemForm.calories) ingredients.calories = parseInt(itemForm.calories);

    const payload: Record<string, unknown> = {
      name: itemForm.name,
      description: itemForm.description || null,
      price: itemForm.price,
      categoryId: itemForm.categoryId || null,
      isVeg: itemForm.isVeg,
      available: itemForm.available,
      image: itemForm.image || null,
      spicyLevel: itemForm.spicyLevel,
      tags: itemForm.tags.length > 0 ? itemForm.tags : null,
      ingredients: Object.keys(ingredients).length > 0 ? ingredients : null,
      station: itemForm.station || null,
      course: itemForm.course || null,
    };
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: payload });
    } else {
      createItem.mutate(payload);
    }
  }

  function toggleTag(tag: string) {
    setItemForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }));
  }

  function addCustomTag() {
    if (itemForm.customTag.trim() && !itemForm.tags.includes(itemForm.customTag.trim())) {
      setItemForm((prev) => ({
        ...prev,
        tags: [...prev.tags, prev.customTag.trim()],
        customTag: "",
      }));
    }
  }

  const getCategoryName = (catId: string | null) => {
    if (!catId) return "Uncategorized";
    return categories.find((c) => c.id === catId)?.name || "Unknown";
  };

  function openAddCombo() {
    setEditingCombo(null);
    setComboForm({
      name: "", description: "", comboPrice: "",
      mainItems: [], sideItems: [], addonItems: [],
      validityStart: "", validityEnd: "",
      timeSlots: [], outlets: [], isActive: true,
    });
    setComboDialogOpen(true);
  }

  function openEditCombo(combo: ComboOffer) {
    setEditingCombo(combo);
    setComboForm({
      name: combo.name,
      description: combo.description || "",
      comboPrice: String(combo.comboPrice),
      mainItems: (combo.mainItems as ComboItemRef[]) || [],
      sideItems: (combo.sideItems as ComboItemRef[]) || [],
      addonItems: (combo.addonItems as ComboItemRef[]) || [],
      validityStart: combo.validityStart ? new Date(combo.validityStart).toISOString().split("T")[0] : "",
      validityEnd: combo.validityEnd ? new Date(combo.validityEnd).toISOString().split("T")[0] : "",
      timeSlots: (combo.timeSlots as string[]) || [],
      outlets: (combo.outlets as string[]) || [],
      isActive: combo.isActive ?? true,
    });
    setComboDialogOpen(true);
  }

  function addComboItem(type: "mainItems" | "sideItems" | "addonItems", menuItemId: string) {
    const item = allItems.find((i) => i.id === menuItemId);
    if (!item) return;
    const ref: ComboItemRef = { menuItemId: item.id, name: item.name, price: String(item.price) };
    if (type === "mainItems" && comboForm.mainItems.length >= 1) {
      toast({ title: "Exactly 1 main item allowed", variant: "destructive" });
      return;
    }
    if (type === "sideItems" && comboForm.sideItems.length >= 3) {
      toast({ title: "Maximum 3 side items", variant: "destructive" });
      return;
    }
    if (type === "addonItems" && comboForm.addonItems.length >= 2) {
      toast({ title: "Maximum 2 add-on items", variant: "destructive" });
      return;
    }
    if (comboForm[type].some((r) => r.menuItemId === menuItemId)) return;
    setComboForm((prev) => ({ ...prev, [type]: [...prev[type], ref] }));
  }

  function removeComboItem(type: "mainItems" | "sideItems" | "addonItems", menuItemId: string) {
    setComboForm((prev) => ({ ...prev, [type]: prev[type].filter((r) => r.menuItemId !== menuItemId) }));
  }

  function handleComboSubmit() {
    if (!comboForm.name.trim() || !comboForm.comboPrice || comboForm.mainItems.length === 0) return;
    const payload: Record<string, unknown> = {
      name: comboForm.name,
      description: comboForm.description || null,
      comboPrice: comboForm.comboPrice,
      individualTotal: comboIndividualTotal.toFixed(2),
      mainItems: comboForm.mainItems,
      sideItems: comboForm.sideItems.length > 0 ? comboForm.sideItems : null,
      addonItems: comboForm.addonItems.length > 0 ? comboForm.addonItems : null,
      validityStart: comboForm.validityStart || null,
      validityEnd: comboForm.validityEnd || null,
      timeSlots: comboForm.timeSlots.length > 0 ? comboForm.timeSlots : null,
      outlets: comboForm.outlets.length > 0 ? comboForm.outlets : null,
      isActive: comboForm.isActive,
    };
    if (editingCombo) {
      updateCombo.mutate({ id: editingCombo.id, data: payload });
    } else {
      createCombo.mutate(payload);
    }
  }

  const TIME_SLOTS = ["breakfast", "lunch", "dinner", "late_night"];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full" data-testid="menu-page">
      <div className="flex items-center gap-2 px-6 pt-4 pb-2 border-b">
        <Button
          variant={activeTab === "items" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("items")}
          data-testid="tab-menu-items"
        >
          <UtensilsCrossed className="h-4 w-4 mr-1" /> Menu Items
        </Button>
        <Button
          variant={activeTab === "combos" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("combos")}
          data-testid="tab-combo-offers"
        >
          <Package className="h-4 w-4 mr-1" /> Combo Offers
          {comboOffers.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-xs">{comboOffers.length}</Badge>
          )}
        </Button>
      </div>

      {activeTab === "items" ? (
        <div className="flex h-full gap-6 p-6 overflow-hidden">
          <div className="w-72 shrink-0 space-y-3 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-semibold" data-testid="text-categories-heading">Categories</h2>
              <Button size="sm" variant="outline" onClick={openAddCategory} data-testid="button-add-category">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            <motion.div
              className={`cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                selectedCategoryId === null ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-accent hover:shadow-sm"
              }`}
              onClick={() => setSelectedCategoryId(null)}
              data-testid="button-category-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="h-4 w-4" />
                All Items ({allItems.length})
              </div>
            </motion.div>

            {categories.map((cat) => {
              const count = allItems.filter((i) => i.categoryId === cat.id).length;
              const CatIcon = getCategoryIcon(cat.name);
              return (
                <motion.div
                  key={cat.id}
                  className={`group flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-medium cursor-pointer transition-all duration-200 ${
                    selectedCategoryId === cat.id ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-accent hover:shadow-sm"
                  }`}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  data-testid={`button-category-${cat.id}`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="flex items-center gap-2">
                    <CatIcon className="h-4 w-4" />
                    {cat.name} ({count})
                  </span>
                  <span className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); openEditCategory(cat); }} className="p-1 rounded hover:bg-background/50" data-testid={`button-edit-category-${cat.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this category?")) deleteCategory.mutate(cat.id); }} className="p-1 rounded hover:bg-destructive/20 text-destructive" data-testid={`button-delete-category-${cat.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </motion.div>
              );
            })}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-semibold" data-testid="text-items-heading">
                {selectedCategoryId ? getCategoryName(selectedCategoryId) : "All Items"}{" "}
                <span className="text-muted-foreground font-normal">({filteredItems.length})</span>
              </h2>
              <Button onClick={openAddItem} data-testid="button-add-item">
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground" data-testid="text-no-items">
                <UtensilsCrossed className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-sm">No menu items yet. Add your first item!</p>
              </div>
            ) : (
              <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" variants={containerVariants} initial="hidden" animate="show">
                <AnimatePresence>
                  {filteredItems.map((item) => (
                    <motion.div key={item.id} variants={itemVariants} layout>
                      <Card className="relative group transition-all duration-200 hover:shadow-lg hover:scale-[1.02]" data-testid={`card-menu-item-${item.id}`}>
                        {item.image ? (
                          <div className="h-32 overflow-hidden rounded-t-lg bg-muted">
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              data-testid={`img-menu-item-${item.id}`}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg class="h-8 w-8 text-muted-foreground/30" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h5l2-3h4l2 3h5v12H3z"/><circle cx="12" cy="13" r="3"/></svg></div>'; }}
                            />
                          </div>
                        ) : (
                          <div className="h-32 overflow-hidden rounded-t-lg bg-muted/50 flex items-center justify-center" data-testid={`placeholder-menu-item-${item.id}`}>
                            <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                          </div>
                        )}
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-sm leading-tight truncate" data-testid={`text-item-name-${item.id}`}>
                                {item.name}
                              </h3>
                              {item.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2" data-testid={`text-item-desc-${item.id}`}>
                                  {item.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <Badge
                                variant="outline"
                                className={`transition-colors duration-200 ${item.isVeg ? "border-green-500 text-green-600" : "border-red-500 text-red-600"}`}
                                data-testid={`badge-veg-${item.id}`}
                              >
                                {item.isVeg ? <Leaf className="h-3 w-3 mr-1" /> : <Drumstick className="h-3 w-3 mr-1" />}
                                {item.isVeg ? "Veg" : "Non-Veg"}
                              </Badge>
                            </div>
                          </div>

                          {item.tags && (item.tags as string[]).length > 0 && (
                            <div className="flex flex-wrap gap-1" data-testid={`tags-${item.id}`}>
                              {(item.tags as string[]).slice(0, 3).map((tag, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {tag}
                                </Badge>
                              ))}
                              {(item.tags as string[]).length > 3 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  +{(item.tags as string[]).length - 3}
                                </Badge>
                              )}
                            </div>
                          )}

                          {(item.spicyLevel ?? 0) > 0 && (
                            <div className="flex items-center gap-0.5" data-testid={`spicy-${item.id}`}>
                              {Array.from({ length: item.spicyLevel ?? 0 }).map((_, i) => (
                                <Flame key={i} className="h-3 w-3 text-orange-500" />
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <span className="text-base font-semibold" data-testid={`text-item-price-${item.id}`}>
                              {fmt(item.price)}
                            </span>
                            <Badge variant={item.categoryId ? "secondary" : "outline"} className="text-xs">
                              {getCategoryName(item.categoryId)}
                            </Badge>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={item.available ?? true}
                                onCheckedChange={(checked) => toggleAvailability.mutate({ id: item.id, available: checked })}
                                data-testid={`switch-available-${item.id}`}
                              />
                              <span className={`text-xs transition-colors duration-200 ${item.available ? "text-green-600" : "text-muted-foreground"}`}>
                                {item.available ? "Available" : "Unavailable"}
                              </span>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <Button size="sm" variant="ghost" onClick={() => setDetailItem(item)} data-testid={`button-view-item-${item.id}`}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openEditItem(item)} data-testid={`button-edit-item-${item.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete this item?")) deleteItem.mutate(item.id); }} data-testid={`button-delete-item-${item.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-heading font-semibold" data-testid="text-combos-heading">
              Combo Offers <span className="text-muted-foreground font-normal">({comboOffers.length})</span>
            </h2>
            <Button onClick={openAddCombo} data-testid="button-add-combo">
              <Plus className="h-4 w-4 mr-1" /> Create Combo
            </Button>
          </div>

          {comboOffers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground" data-testid="text-no-combos">
              <Package className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">No combo offers yet. Create your first combo!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {comboOffers.map((combo) => {
                const mainItems = (combo.mainItems as ComboItemRef[]) || [];
                const sideItems = (combo.sideItems as ComboItemRef[]) || [];
                const addonItems = (combo.addonItems as ComboItemRef[]) || [];
                const allComboItems = [...mainItems, ...sideItems, ...addonItems];
                const isExpired = combo.validityEnd && new Date(combo.validityEnd) < new Date();
                return (
                  <Card key={combo.id} className={`group transition-all duration-200 hover:shadow-lg ${!combo.isActive || isExpired ? "opacity-60" : ""}`} data-testid={`card-combo-${combo.id}`}>
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base truncate" data-testid={`text-combo-name-${combo.id}`}>{combo.name}</h3>
                          {combo.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{combo.description}</p>
                          )}
                        </div>
                        <Badge variant={combo.isActive && !isExpired ? "default" : "secondary"} className="shrink-0 ml-2">
                          {isExpired ? "Expired" : combo.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Components</p>
                        <div className="flex flex-wrap gap-1">
                          {allComboItems.map((item, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{item.name}</Badge>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold text-primary" data-testid={`text-combo-price-${combo.id}`}>{fmt(combo.comboPrice)}</span>
                          <span className="text-sm text-muted-foreground line-through">{fmt(combo.individualTotal)}</span>
                        </div>
                        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" data-testid={`badge-savings-${combo.id}`}>
                          <Percent className="h-3 w-3 mr-0.5" />
                          Save {Number(combo.savingsPercentage).toFixed(0)}%
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {combo.validityStart && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(combo.validityStart).toLocaleDateString()} - {combo.validityEnd ? new Date(combo.validityEnd).toLocaleDateString() : "Ongoing"}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {combo.orderCount ?? 0} orders
                        </span>
                      </div>

                      <div className="flex items-center justify-end gap-1 pt-1 border-t opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" onClick={() => openEditCombo(combo)} data-testid={`button-edit-combo-${combo.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => duplicateCombo.mutate(combo.id)} data-testid={`button-duplicate-combo-${combo.id}`}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete this combo?")) deleteCombo.mutate(combo.id); }} data-testid={`button-delete-combo-${combo.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent data-testid="dialog-category">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="e.g. Appetizers" data-testid="input-category-name" />
            </div>
            <div>
              <Label htmlFor="cat-sort">Sort Order</Label>
              <Input id="cat-sort" type="number" value={categorySortOrder} onChange={(e) => setCategorySortOrder(Number(e.target.value))} data-testid="input-category-sort" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)} data-testid="button-cancel-category">Cancel</Button>
            <Button onClick={handleCategorySubmit} disabled={createCategory.isPending || updateCategory.isPending} data-testid="button-save-category">
              {editingCategory ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-item">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Menu Item" : "Add Menu Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="item-name">Name</Label>
                <Input id="item-name" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="e.g. Margherita Pizza" data-testid="input-item-name" />
              </div>
              <div>
                <Label htmlFor="item-image">Image</Label>
                <div className="flex gap-2 items-center">
                  <Input id="item-image" value={itemForm.image} onChange={(e) => setItemForm({ ...itemForm, image: e.target.value })} placeholder="https://... or upload" className="flex-1" data-testid="input-item-image" />
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent hover:text-accent-foreground shrink-0" data-testid="button-upload-image">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const formData = new FormData();
                      formData.append("image", file);
                      try {
                        const csrfMatch = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
                        const csrfHeaders: Record<string, string> = {};
                        if (csrfMatch) csrfHeaders["x-csrf-token"] = decodeURIComponent(csrfMatch[1]);
                        const res = await fetch("/api/upload/image", { method: "POST", body: formData, credentials: "include", headers: csrfHeaders });
                        if (!res.ok) { const err = await res.json(); alert(err.message || "Upload failed"); return; }
                        const { url } = await res.json();
                        setItemForm({ ...itemForm, image: url });
                      } catch { alert("Upload failed"); }
                      e.target.value = "";
                    }} />
                  </label>
                  {itemForm.image && (
                    <div className="h-9 w-9 rounded border overflow-hidden shrink-0">
                      <img src={itemForm.image} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = ""; }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="item-desc">Description</Label>
              <Textarea id="item-desc" value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} placeholder="Brief description..." rows={2} data-testid="input-item-description" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="item-price">Price ($)</Label>
                <Input id="item-price" type="number" step="0.01" min="0" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} placeholder="0.00" data-testid="input-item-price" />
              </div>
              <div>
                <Label htmlFor="item-category">Category</Label>
                <Select value={itemForm.categoryId} onValueChange={(v) => setItemForm({ ...itemForm, categoryId: v })}>
                  <SelectTrigger data-testid="select-item-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="item-spicy">Spicy Level</Label>
                <Select value={String(itemForm.spicyLevel)} onValueChange={(v) => setItemForm({ ...itemForm, spicyLevel: parseInt(v) })}>
                  <SelectTrigger data-testid="select-item-spicy"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">None</SelectItem>
                    <SelectItem value="1">Mild</SelectItem>
                    <SelectItem value="2">Medium</SelectItem>
                    <SelectItem value="3">Hot</SelectItem>
                    <SelectItem value="4">Extra Hot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {COMMON_TAGS.map((tag) => (
                  <Badge
                    key={tag}
                    variant={itemForm.tags.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleTag(tag)}
                    data-testid={`tag-${tag.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input value={itemForm.customTag} onChange={(e) => setItemForm({ ...itemForm, customTag: e.target.value })} placeholder="Custom tag..." className="flex-1" data-testid="input-custom-tag" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }} />
                <Button size="sm" variant="outline" onClick={addCustomTag} data-testid="button-add-tag">Add</Button>
              </div>
              {itemForm.tags.filter((t) => !COMMON_TAGS.includes(t)).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {itemForm.tags.filter((t) => !COMMON_TAGS.includes(t)).map((tag) => (
                    <Badge key={tag} variant="default" className="cursor-pointer text-xs" onClick={() => toggleTag(tag)}>
                      {tag} <X className="h-2.5 w-2.5 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={itemForm.isVeg} onCheckedChange={(checked) => setItemForm({ ...itemForm, isVeg: checked })} data-testid="switch-item-veg" />
                <Label>Vegetarian</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={itemForm.available} onCheckedChange={(checked) => setItemForm({ ...itemForm, available: checked })} data-testid="switch-item-available" />
                <Label>Available</Label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="item-station">KDS Station</Label>
                <Select value={itemForm.station || "none"} onValueChange={(v) => setItemForm({ ...itemForm, station: v === "none" ? "" : v })}>
                  <SelectTrigger id="item-station" data-testid="select-item-station">
                    <SelectValue placeholder="Select station" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No station</SelectItem>
                    {stations.map(s => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="item-course">Course</Label>
                <Select value={itemForm.course || "none"} onValueChange={(v) => setItemForm({ ...itemForm, course: v === "none" ? "" : v })}>
                  <SelectTrigger id="item-course" data-testid="select-item-course">
                    <SelectValue placeholder="Select course" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No course</SelectItem>
                    <SelectItem value="appetizer">Appetizer</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="main">Main</SelectItem>
                    <SelectItem value="dessert">Dessert</SelectItem>
                    <SelectItem value="beverage">Beverage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <UtensilsCrossed className="h-4 w-4" />
                Ingredients & Nutrition
              </h4>
              <div>
                <Label htmlFor="item-ingredients">Ingredients (comma-separated)</Label>
                <Input id="item-ingredients" value={itemForm.ingredientsList} onChange={(e) => setItemForm({ ...itemForm, ingredientsList: e.target.value })} placeholder="e.g. flour, mozzarella, tomato sauce, basil" data-testid="input-item-ingredients" />
              </div>
              <div>
                <Label htmlFor="item-allergens">Allergens (comma-separated)</Label>
                <Input id="item-allergens" value={itemForm.allergens} onChange={(e) => setItemForm({ ...itemForm, allergens: e.target.value })} placeholder="e.g. gluten, dairy, nuts" data-testid="input-item-allergens" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="item-calories">Calories</Label>
                  <Input id="item-calories" type="number" min="0" value={itemForm.calories} onChange={(e) => setItemForm({ ...itemForm, calories: e.target.value })} placeholder="e.g. 450" data-testid="input-item-calories" />
                </div>
                <div>
                  <Label htmlFor="item-nutrition">Nutritional Notes</Label>
                  <Input id="item-nutrition" value={itemForm.nutritionalNotes} onChange={(e) => setItemForm({ ...itemForm, nutritionalNotes: e.target.value })} placeholder="e.g. High protein" data-testid="input-item-nutrition" />
                </div>
              </div>
              <div>
                <Label htmlFor="item-prep">Preparation Notes</Label>
                <Input id="item-prep" value={itemForm.preparationNotes} onChange={(e) => setItemForm({ ...itemForm, preparationNotes: e.target.value })} placeholder="e.g. Wood-fired, 72-hour dough" data-testid="input-item-preparation" />
              </div>
            </div>
          </div>

          {editingItem && (() => {
            const linkedRecipe = allRecipes.find(r => r.menuItemId === editingItem.id);
            const plateCost = linkedRecipe
              ? (linkedRecipe.ingredients || []).reduce((sum, ing) => {
                  const item = invMap.get(ing.inventoryItemId);
                  if (!item) return sum;
                  const qty = Number(ing.quantity) || 0;
                  const waste = Number(ing.wastePct || 0) / 100;
                  const effectiveQty = waste >= 1 ? qty : qty / (1 - waste);
                  const converted = convertUnits(effectiveQty, ing.unit || item.unit || "pcs", item.unit || "pcs");
                  return sum + converted * Number(item.costPrice || 0);
                }, 0)
              : null;
            const sp = Number(editingItem.price || 0);
            const foodCostPct = plateCost !== null && sp > 0 ? (plateCost / sp) * 100 : null;
            const unlinkedRecipes = allRecipes.filter(r => !r.menuItemId || r.menuItemId === editingItem.id);
            return (
              <RecipeLinkSection
                editingItem={editingItem}
                linkedRecipe={linkedRecipe}
                unlinkedRecipes={unlinkedRecipes}
                plateCost={plateCost}
                sp={sp}
                foodCostPct={foodCostPct}
                fmt={fmt}
                onNavigate={(path) => { setItemDialogOpen(false); navigate(path); }}
                queryClient={queryClient}
                toast={toast}
              />
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)} data-testid="button-cancel-item">Cancel</Button>
            <Button onClick={handleItemSubmit} disabled={createItem.isPending || updateItem.isPending} data-testid="button-save-item">
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={comboDialogOpen} onOpenChange={setComboDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-combo">
          <DialogHeader>
            <DialogTitle>{editingCombo ? "Edit Combo Offer" : "Create Combo Offer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="combo-name">Combo Name</Label>
                <Input id="combo-name" value={comboForm.name} onChange={(e) => setComboForm({ ...comboForm, name: e.target.value })} placeholder="e.g. Burger + Fries + Drink" data-testid="input-combo-name" />
              </div>
              <div>
                <Label htmlFor="combo-price">Combo Price</Label>
                <Input id="combo-price" type="number" step="0.01" min="0" value={comboForm.comboPrice} onChange={(e) => setComboForm({ ...comboForm, comboPrice: e.target.value })} placeholder="0.00" data-testid="input-combo-price" />
              </div>
            </div>
            <div>
              <Label htmlFor="combo-desc">Description</Label>
              <Textarea id="combo-desc" value={comboForm.description} onChange={(e) => setComboForm({ ...comboForm, description: e.target.value })} placeholder="Describe this combo..." rows={2} data-testid="input-combo-description" />
            </div>

            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div>
                <Label>Main Item (required, exactly 1)</Label>
                <Select onValueChange={(v) => addComboItem("mainItems", v)} value="">
                  <SelectTrigger data-testid="select-combo-main"><SelectValue placeholder="Add main item..." /></SelectTrigger>
                  <SelectContent>
                    {allItems.filter((i) => !comboForm.mainItems.some((r) => r.menuItemId === i.id)).map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name} - {fmt(item.price)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {comboForm.mainItems.map((ref) => (
                    <Badge key={ref.menuItemId} variant="default" className="cursor-pointer" onClick={() => removeComboItem("mainItems", ref.menuItemId)} data-testid={`badge-main-${ref.menuItemId}`}>
                      {ref.name} ({fmt(ref.price)}) <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label>Side Items (up to 3)</Label>
                <Select onValueChange={(v) => addComboItem("sideItems", v)} value="">
                  <SelectTrigger data-testid="select-combo-side"><SelectValue placeholder="Add side item..." /></SelectTrigger>
                  <SelectContent>
                    {allItems.filter((i) => !comboForm.sideItems.some((r) => r.menuItemId === i.id)).map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name} - {fmt(item.price)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {comboForm.sideItems.map((ref) => (
                    <Badge key={ref.menuItemId} variant="secondary" className="cursor-pointer" onClick={() => removeComboItem("sideItems", ref.menuItemId)} data-testid={`badge-side-${ref.menuItemId}`}>
                      {ref.name} ({fmt(ref.price)}) <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label>Add-on Items (up to 2)</Label>
                <Select onValueChange={(v) => addComboItem("addonItems", v)} value="">
                  <SelectTrigger data-testid="select-combo-addon"><SelectValue placeholder="Add add-on item..." /></SelectTrigger>
                  <SelectContent>
                    {allItems.filter((i) => !comboForm.addonItems.some((r) => r.menuItemId === i.id)).map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name} - {fmt(item.price)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {comboForm.addonItems.map((ref) => (
                    <Badge key={ref.menuItemId} variant="outline" className="cursor-pointer" onClick={() => removeComboItem("addonItems", ref.menuItemId)} data-testid={`badge-addon-${ref.menuItemId}`}>
                      {ref.name} ({fmt(ref.price)}) <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {comboIndividualTotal > 0 && comboForm.comboPrice && (
              <div className="rounded-lg border p-3 space-y-1 bg-green-50 dark:bg-green-950/30" data-testid="combo-savings-panel">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Individual Total</span>
                  <span className="font-medium">{fmt(comboIndividualTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Combo Price</span>
                  <span className="font-medium">{fmt(parseFloat(comboForm.comboPrice) || 0)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold border-t pt-1">
                  <span className={comboSavingsPercent >= 5 && comboSavingsPercent <= 50 ? "text-green-700 dark:text-green-300" : "text-red-600"}>
                    Savings: {fmt(comboSavingsAmount)} ({comboSavingsPercent.toFixed(1)}%)
                  </span>
                  {comboSavingsPercent < 5 && <span className="text-red-500 text-xs">Min 5% required</span>}
                  {comboSavingsPercent > 50 && <span className="text-red-500 text-xs">Max 50% exceeded</span>}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="combo-start">Validity Start</Label>
                <Input id="combo-start" type="date" value={comboForm.validityStart} onChange={(e) => setComboForm({ ...comboForm, validityStart: e.target.value })} data-testid="input-combo-start" />
              </div>
              <div>
                <Label htmlFor="combo-end">Validity End</Label>
                <Input id="combo-end" type="date" value={comboForm.validityEnd} onChange={(e) => setComboForm({ ...comboForm, validityEnd: e.target.value })} data-testid="input-combo-end" />
              </div>
            </div>

            <div>
              <Label>Time Slots</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {TIME_SLOTS.map((slot) => (
                  <Badge
                    key={slot}
                    variant={comboForm.timeSlots.includes(slot) ? "default" : "outline"}
                    className="cursor-pointer text-xs capitalize"
                    onClick={() => setComboForm((prev) => ({
                      ...prev,
                      timeSlots: prev.timeSlots.includes(slot) ? prev.timeSlots.filter((s) => s !== slot) : [...prev.timeSlots, slot],
                    }))}
                    data-testid={`badge-slot-${slot}`}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    {slot.replace("_", " ")}
                  </Badge>
                ))}
              </div>
            </div>

            {outletsList.length > 1 && (
              <div>
                <Label>Outlets</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {outletsList.map((outlet) => (
                    <Badge
                      key={outlet.id}
                      variant={comboForm.outlets.includes(outlet.id) ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => setComboForm((prev) => ({
                        ...prev,
                        outlets: prev.outlets.includes(outlet.id) ? prev.outlets.filter((o) => o !== outlet.id) : [...prev.outlets, outlet.id],
                      }))}
                      data-testid={`badge-outlet-${outlet.id}`}
                    >
                      <Store className="h-3 w-3 mr-1" />
                      {outlet.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={comboForm.isActive} onCheckedChange={(checked) => setComboForm({ ...comboForm, isActive: checked })} data-testid="switch-combo-active" />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComboDialogOpen(false)} data-testid="button-cancel-combo">Cancel</Button>
            <Button
              onClick={handleComboSubmit}
              disabled={createCombo.isPending || updateCombo.isPending || comboForm.mainItems.length === 0 || !comboForm.name.trim() || !comboForm.comboPrice}
              data-testid="button-save-combo"
            >
              {editingCombo ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-dish-detail">
          <DialogHeader>
            <DialogTitle>Dish Details</DialogTitle>
          </DialogHeader>
          {detailItem && (
            <DishInfoPanel
              name={detailItem.name}
              description={detailItem.description}
              price={detailItem.price}
              image={detailItem.image}
              isVeg={detailItem.isVeg}
              spicyLevel={detailItem.spicyLevel}
              tags={detailItem.tags as string[] | null}
              ingredients={parseIngredients(detailItem)}
              currency={tenantCurrency}
            />
          )}
        </DialogContent>
      </Dialog>
      {supervisorDialog && (
        <SupervisorApprovalDialog
          open={supervisorDialog.open}
          onOpenChange={(open) => !open && setSupervisorDialog(null)}
          action={supervisorDialog.action}
          actionLabel={supervisorDialog.actionLabel}
          onApproved={handleMenuSupervisorApproved}
        />
      )}
    </motion.div>
  );
}
