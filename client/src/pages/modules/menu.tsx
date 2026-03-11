import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
import {
  Plus,
  Pencil,
  Trash2,
  UtensilsCrossed,
  Leaf,
  Drumstick,
} from "lucide-react";
import type { MenuCategory, MenuItem } from "@shared/schema";

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
    name: "",
    description: "",
    price: "",
    categoryId: "",
    isVeg: false,
    available: true,
  });

  const { data: categories = [] } = useQuery<MenuCategory[]>({
    queryKey: ["/api/menu-categories"],
  });

  const { data: allItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items"],
  });

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
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/menu-categories/${id}`);
    },
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
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/menu-items/${id}`);
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
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

  function openAddItem() {
    setEditingItem(null);
    setItemForm({
      name: "",
      description: "",
      price: "",
      categoryId: selectedCategoryId || "",
      isVeg: false,
      available: true,
    });
    setItemDialogOpen(true);
  }

  function openEditItem(item: MenuItem) {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      description: item.description || "",
      price: String(item.price),
      categoryId: item.categoryId || "",
      isVeg: item.isVeg ?? false,
      available: item.available ?? true,
    });
    setItemDialogOpen(true);
  }

  function handleItemSubmit() {
    if (!itemForm.name.trim() || !itemForm.price) return;
    const payload = {
      name: itemForm.name,
      description: itemForm.description || null,
      price: itemForm.price,
      categoryId: itemForm.categoryId || null,
      isVeg: itemForm.isVeg,
      available: itemForm.available,
    };
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: payload });
    } else {
      createItem.mutate(payload);
    }
  }

  const getCategoryName = (catId: string | null) => {
    if (!catId) return "Uncategorized";
    return categories.find((c) => c.id === catId)?.name || "Unknown";
  };

  return (
    <div className="flex h-full gap-6 p-6" data-testid="menu-page">
      <div className="w-72 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-heading font-semibold" data-testid="text-categories-heading">Categories</h2>
          <Button size="sm" variant="outline" onClick={openAddCategory} data-testid="button-add-category">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        <div
          className={`cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
            selectedCategoryId === null
              ? "bg-primary text-primary-foreground"
              : "hover:bg-accent"
          }`}
          onClick={() => setSelectedCategoryId(null)}
          data-testid="button-category-all"
        >
          All Items ({allItems.length})
        </div>

        {categories.map((cat) => {
          const count = allItems.filter((i) => i.categoryId === cat.id).length;
          return (
            <div
              key={cat.id}
              className={`group flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
                selectedCategoryId === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
              onClick={() => setSelectedCategoryId(cat.id)}
              data-testid={`button-category-${cat.id}`}
            >
              <span>
                {cat.name} ({count})
              </span>
              <span className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditCategory(cat);
                  }}
                  className="p-1 rounded hover:bg-background/50"
                  data-testid={`button-edit-category-${cat.id}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this category?")) deleteCategory.mutate(cat.id);
                  }}
                  className="p-1 rounded hover:bg-destructive/20 text-destructive"
                  data-testid={`button-delete-category-${cat.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map((item) => (
              <Card key={item.id} className="relative group" data-testid={`card-menu-item-${item.id}`}>
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
                    <Badge
                      variant="outline"
                      className={`shrink-0 ml-2 ${
                        item.isVeg
                          ? "border-green-500 text-green-600"
                          : "border-red-500 text-red-600"
                      }`}
                      data-testid={`badge-veg-${item.id}`}
                    >
                      {item.isVeg ? <Leaf className="h-3 w-3 mr-1" /> : <Drumstick className="h-3 w-3 mr-1" />}
                      {item.isVeg ? "Veg" : "Non-Veg"}
                    </Badge>
                  </div>

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
                        onCheckedChange={(checked) =>
                          toggleAvailability.mutate({ id: item.id, available: checked })
                        }
                        data-testid={`switch-available-${item.id}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {item.available ? "Available" : "Unavailable"}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditItem(item)}
                        data-testid={`button-edit-item-${item.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("Delete this item?")) deleteItem.mutate(item.id);
                        }}
                        data-testid={`button-delete-item-${item.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
              <Input
                id="cat-name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g. Appetizers"
                data-testid="input-category-name"
              />
            </div>
            <div>
              <Label htmlFor="cat-sort">Sort Order</Label>
              <Input
                id="cat-sort"
                type="number"
                value={categorySortOrder}
                onChange={(e) => setCategorySortOrder(Number(e.target.value))}
                data-testid="input-category-sort"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)} data-testid="button-cancel-category">
              Cancel
            </Button>
            <Button
              onClick={handleCategorySubmit}
              disabled={createCategory.isPending || updateCategory.isPending}
              data-testid="button-save-category"
            >
              {editingCategory ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-item">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Menu Item" : "Add Menu Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="item-name">Name</Label>
              <Input
                id="item-name"
                value={itemForm.name}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                placeholder="e.g. Margherita Pizza"
                data-testid="input-item-name"
              />
            </div>
            <div>
              <Label htmlFor="item-desc">Description</Label>
              <Textarea
                id="item-desc"
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="Brief description..."
                rows={2}
                data-testid="input-item-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="item-price">Price ($)</Label>
                <Input
                  id="item-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={itemForm.price}
                  onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-item-price"
                />
              </div>
              <div>
                <Label htmlFor="item-category">Category</Label>
                <Select
                  value={itemForm.categoryId}
                  onValueChange={(v) => setItemForm({ ...itemForm, categoryId: v })}
                >
                  <SelectTrigger data-testid="select-item-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={itemForm.isVeg}
                  onCheckedChange={(checked) => setItemForm({ ...itemForm, isVeg: checked })}
                  data-testid="switch-item-veg"
                />
                <Label>Vegetarian</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={itemForm.available}
                  onCheckedChange={(checked) => setItemForm({ ...itemForm, available: checked })}
                  data-testid="switch-item-available"
                />
                <Label>Available</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)} data-testid="button-cancel-item">
              Cancel
            </Button>
            <Button
              onClick={handleItemSubmit}
              disabled={createItem.isPending || updateItem.isPending}
              data-testid="button-save-item"
            >
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
