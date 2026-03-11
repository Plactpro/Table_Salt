import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { InventoryItem } from "@shared/schema";
import { motion } from "framer-motion";
import {
  Package, Plus, Search, AlertTriangle, Edit, Trash2, ArrowUpDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

export default function InventoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    category: "",
    unit: "pcs",
    currentStock: "0",
    reorderLevel: "10",
    costPrice: "0",
    supplier: "",
  });

  const [adjustData, setAdjustData] = useState({
    type: "in" as "in" | "out",
    quantity: "",
    reason: "",
  });

  const { data: inventory = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/inventory", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setItemDialogOpen(false);
      resetForm();
      toast({ title: "Item added", description: "Inventory item created successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await apiRequest("PATCH", `/api/inventory/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setItemDialogOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Item updated", description: "Inventory item updated successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/inventory/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Deleted", description: "Inventory item removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof adjustData }) => {
      const res = await apiRequest("POST", `/api/inventory/${id}/adjust`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setAdjustDialogOpen(false);
      setAdjustingItem(null);
      setAdjustData({ type: "in", quantity: "", reason: "" });
      toast({ title: "Stock adjusted", description: "Stock level updated successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setFormData({ name: "", sku: "", category: "", unit: "pcs", currentStock: "0", reorderLevel: "10", costPrice: "0", supplier: "" });
  }

  function openAddDialog() {
    setEditingItem(null);
    resetForm();
    setItemDialogOpen(true);
  }

  function openEditDialog(item: InventoryItem) {
    setEditingItem(item);
    setFormData({
      name: item.name,
      sku: item.sku || "",
      category: item.category || "",
      unit: item.unit || "pcs",
      currentStock: item.currentStock?.toString() || "0",
      reorderLevel: item.reorderLevel?.toString() || "10",
      costPrice: item.costPrice?.toString() || "0",
      supplier: item.supplier || "",
    });
    setItemDialogOpen(true);
  }

  function openAdjustDialog(item: InventoryItem) {
    setAdjustingItem(item);
    setAdjustData({ type: "in", quantity: "", reason: "" });
    setAdjustDialogOpen(true);
  }

  function handleSaveItem() {
    if (!formData.name.trim()) return;
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  function handleAdjust() {
    if (!adjustingItem || !adjustData.quantity) return;
    adjustMutation.mutate({ id: adjustingItem.id, data: adjustData });
  }

  const filtered = inventory.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.sku && item.sku.toLowerCase().includes(search.toLowerCase())) ||
    (item.category && item.category.toLowerCase().includes(search.toLowerCase()))
  );

  const lowStockItems = inventory.filter(
    (item) => Number(item.currentStock) <= Number(item.reorderLevel)
  );

  const totalValue = inventory.reduce(
    (sum, item) => sum + Number(item.currentStock) * Number(item.costPrice),
    0
  );

  const isLowStock = (item: InventoryItem) =>
    Number(item.currentStock) <= Number(item.reorderLevel);

  const canEdit = user?.role === "owner" || user?.role === "manager";

  return (
    <div className="p-6 space-y-6" data-testid="page-inventory">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading" data-testid="text-inventory-title">Inventory</h1>
          <p className="text-muted-foreground">Track stock levels and manage inventory items</p>
        </div>
        {canEdit && (
          <Button onClick={openAddDialog} data-testid="button-add-inventory">
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Items"
          value={inventory.length}
          icon={Package}
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
          testId="stat-total-items"
        />
        <StatCard
          title="Low Stock Items"
          value={lowStockItems.length}
          icon={AlertTriangle}
          iconColor="text-red-600"
          iconBg="bg-red-100"
          testId="stat-low-stock"
        />
        <StatCard
          title="Total Stock Value"
          value={`$${totalValue.toFixed(2)}`}
          icon={Package}
          iconColor="text-green-600"
          iconBg="bg-green-100"
          testId="stat-stock-value"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Inventory Items</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-inventory"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading inventory...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-inventory">
              {search ? "No items match your search" : "No inventory items yet. Add your first item!"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Current Stock</TableHead>
                  <TableHead>Reorder Level</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Cost Price</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`border-b transition-colors hover:bg-muted/50 ${
                      isLowStock(item) ? "bg-red-50 dark:bg-red-950/20" : ""
                    }`}
                    data-testid={`row-inventory-${item.id}`}
                  >
                    <TableCell className="font-medium" data-testid={`text-name-${item.id}`}>
                      {item.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.sku || "—"}</TableCell>
                    <TableCell>{item.category || "—"}</TableCell>
                    <TableCell
                      className={isLowStock(item) ? "text-red-600 font-semibold" : ""}
                      data-testid={`text-stock-${item.id}`}
                    >
                      {Number(item.currentStock).toFixed(0)}
                    </TableCell>
                    <TableCell>{Number(item.reorderLevel).toFixed(0)}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>${Number(item.costPrice).toFixed(2)}</TableCell>
                    <TableCell>{item.supplier || "—"}</TableCell>
                    <TableCell>
                      {isLowStock(item) ? (
                        <Badge variant="destructive" data-testid={`badge-low-stock-${item.id}`}>
                          Low Stock
                        </Badge>
                      ) : (
                        <Badge variant="secondary" data-testid={`badge-in-stock-${item.id}`}>
                          In Stock
                        </Badge>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openAdjustDialog(item)}
                            data-testid={`button-adjust-${item.id}`}
                          >
                            <ArrowUpDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(item)}
                            data-testid={`button-edit-${item.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteMutation.mutate(item.id)}
                            data-testid={`button-delete-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Inventory Item" : "Add Inventory Item"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update the details of this inventory item." : "Add a new item to your inventory."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inv-name">Name *</Label>
                <Input
                  id="inv-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Tomatoes"
                  data-testid="input-inventory-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-sku">SKU</Label>
                <Input
                  id="inv-sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="e.g. TOM-001"
                  data-testid="input-inventory-sku"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inv-category">Category</Label>
                <Input
                  id="inv-category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g. Vegetables"
                  data-testid="input-inventory-category"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-unit">Unit</Label>
                <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                  <SelectTrigger data-testid="select-inventory-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">Pieces</SelectItem>
                    <SelectItem value="kg">Kilograms</SelectItem>
                    <SelectItem value="ltr">Litres</SelectItem>
                    <SelectItem value="g">Grams</SelectItem>
                    <SelectItem value="ml">Millilitres</SelectItem>
                    <SelectItem value="box">Boxes</SelectItem>
                    <SelectItem value="pack">Packs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inv-stock">Current Stock</Label>
                <Input
                  id="inv-stock"
                  type="number"
                  value={formData.currentStock}
                  onChange={(e) => setFormData({ ...formData, currentStock: e.target.value })}
                  data-testid="input-inventory-stock"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-reorder">Reorder Level</Label>
                <Input
                  id="inv-reorder"
                  type="number"
                  value={formData.reorderLevel}
                  onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })}
                  data-testid="input-inventory-reorder"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-cost">Cost Price ($)</Label>
                <Input
                  id="inv-cost"
                  type="number"
                  step="0.01"
                  value={formData.costPrice}
                  onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                  data-testid="input-inventory-cost"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-supplier">Supplier</Label>
              <Input
                id="inv-supplier"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                placeholder="e.g. Fresh Foods Co."
                data-testid="input-inventory-supplier"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)} data-testid="button-cancel-inventory">
              Cancel
            </Button>
            <Button
              onClick={handleSaveItem}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-inventory"
            >
              {editingItem ? "Update" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock — {adjustingItem?.name}</DialogTitle>
            <DialogDescription>
              Current stock: {adjustingItem ? Number(adjustingItem.currentStock).toFixed(0) : 0} {adjustingItem?.unit}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Adjustment Type</Label>
              <Select value={adjustData.type} onValueChange={(v) => setAdjustData({ ...adjustData, type: v as "in" | "out" })}>
                <SelectTrigger data-testid="select-adjust-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Stock In (Add)</SelectItem>
                  <SelectItem value="out">Stock Out (Remove)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-qty">Quantity</Label>
              <Input
                id="adj-qty"
                type="number"
                min="0"
                value={adjustData.quantity}
                onChange={(e) => setAdjustData({ ...adjustData, quantity: e.target.value })}
                placeholder="Enter quantity"
                data-testid="input-adjust-quantity"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-reason">Reason</Label>
              <Input
                id="adj-reason"
                value={adjustData.reason}
                onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                placeholder="e.g. New delivery, Spoilage, Usage"
                data-testid="input-adjust-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)} data-testid="button-cancel-adjust">
              Cancel
            </Button>
            <Button
              onClick={handleAdjust}
              disabled={adjustMutation.isPending || !adjustData.quantity}
              data-testid="button-confirm-adjust"
            >
              Confirm Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
