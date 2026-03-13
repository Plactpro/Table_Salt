import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
} from "lucide-react";
import type { MenuCategory, MenuItem } from "@shared/schema";

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

export default function MenuPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
  });

  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);

  const { data: categories = [] } = useQuery<MenuCategory[]>({ queryKey: ["/api/menu-categories"] });
  const { data: allItems = [] } = useQuery<MenuItem[]>({ queryKey: ["/api/menu-items"] });

  const filteredItems = selectedCategoryId
    ? allItems.filter((item) => item.categoryId === selectedCategoryId)
    : allItems;

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

  const updateItem = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/menu-items/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
      toast({ title: "Item updated" });
      setItemDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

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

  function parseIngredients(item: MenuItem): any {
    if (!item.ingredients) return null;
    if (typeof item.ingredients === "object") return item.ingredients;
    try { return JSON.parse(String(item.ingredients)); } catch { return null; }
  }

  function openAddItem() {
    setEditingItem(null);
    setItemForm({
      name: "", description: "", price: "", categoryId: selectedCategoryId || "",
      isVeg: false, available: true, image: "", spicyLevel: 0,
      tags: [], customTag: "",
      ingredientsList: "", allergens: "", nutritionalNotes: "", preparationNotes: "", calories: "",
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
      ingredientsList: ing?.items?.map((i: any) => i.name).join(", ") || "",
      allergens: ing?.allergens?.join(", ") || "",
      nutritionalNotes: ing?.nutritionalNotes || "",
      preparationNotes: ing?.preparationNotes || "",
      calories: ing?.calories ? String(ing.calories) : "",
    });
    setItemDialogOpen(true);
  }

  function handleItemSubmit() {
    if (!itemForm.name.trim() || !itemForm.price) return;
    const ingredients: any = {};
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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full gap-6 p-6" data-testid="menu-page">
      <div className="w-72 shrink-0 space-y-3">
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

      <div className="flex-1 space-y-4">
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
                    {item.image && (
                      <div className="h-32 overflow-hidden rounded-t-lg bg-muted">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          data-testid={`img-menu-item-${item.id}`}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
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
                          ${Number(item.price).toFixed(2)}
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
                <Label htmlFor="item-image">Image URL</Label>
                <div className="flex gap-2">
                  <Input id="item-image" value={itemForm.image} onChange={(e) => setItemForm({ ...itemForm, image: e.target.value })} placeholder="https://..." data-testid="input-item-image" />
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)} data-testid="button-cancel-item">Cancel</Button>
            <Button onClick={handleItemSubmit} disabled={createItem.isPending || updateItem.isPending} data-testid="button-save-item">
              {editingItem ? "Update" : "Create"}
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
            />
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
