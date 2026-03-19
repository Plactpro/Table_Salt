import { useState } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Package2, BookOpen, ShoppingCart, ChefHat } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import InventoryPage from "./inventory";
import SuppliersPage from "./suppliers";
import ProcurementPage from "./procurement";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@shared/currency";
import { convertUnits } from "@shared/units";
import type { InventoryItem, MenuItem, Recipe, RecipeIngredient } from "@shared/schema";
import { Plus, Edit, Trash2, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { StatCard } from "@/components/widgets/stat-card";

type RecipeWithIngredients = Recipe & { ingredients: RecipeIngredient[] };

const MANAGEMENT_ROLES = ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"];

function RecipesTab() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const fmt = (v: number) => {
    const tenant = user?.tenant;
    return formatCurrency(v, tenant?.currency || "AED", tenant?.currencyPosition || "before", tenant?.currencyDecimals ?? 2);
  };

  const { data: allRecipes = [] } = useQuery<RecipeWithIngredients[]>({ queryKey: ["/api/recipes"] });
  const { data: inventory = [] } = useQuery<InventoryItem[]>({ queryKey: ["/api/inventory"] });
  const { data: menuItemsList = [] } = useQuery<MenuItem[]>({ queryKey: ["/api/menu-items"] });

  const invMap = new Map(inventory.map(i => [i.id, i]));
  const menuMap = new Map(menuItemsList.map(m => [m.id, m]));

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/recipes/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/recipes"] }); toast({ title: "Recipe deleted" }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  function calcPlateCost(r: RecipeWithIngredients): number {
    return (r.ingredients || []).reduce((sum, ing) => {
      const item = invMap.get(ing.inventoryItemId);
      if (!item) return sum;
      const qty = Number(ing.quantity) || 0;
      const waste = Number(ing.wastePct || 0) / 100;
      const effectiveQty = waste >= 1 ? qty : qty / (1 - waste);
      const ingUnit = ing.unit || item.unit || "pcs";
      const converted = convertUnits(effectiveQty, ingUnit, item.unit || "pcs");
      return sum + converted * Number(item.costPrice || 0);
    }, 0);
  }

  const canEdit = can(user?.role || "", "edit_recipe");

  const linkedCount = allRecipes.filter(r => r.menuItemId).length;
  const avgFoodCostPct = (() => {
    const linked = allRecipes.filter(r => r.menuItemId);
    if (linked.length === 0) return 0;
    const sum = linked.reduce((s, r) => {
      const pc = calcPlateCost(r);
      const sp = Number(menuMap.get(r.menuItemId!)?.price || 0);
      return s + (sp > 0 ? (pc / sp) * 100 : 0);
    }, 0);
    return sum / linked.length;
  })();

  return (
    <div className="space-y-6" data-testid="recipes-tab">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Recipes" value={allRecipes.length} icon={ChefHat} iconColor="text-purple-600" iconBg="bg-purple-100" testId="stat-total-recipes" />
        <StatCard title="Linked to Menu" value={linkedCount} icon={BookOpen} iconColor="text-blue-600" iconBg="bg-blue-100" testId="stat-linked-recipes" />
        <StatCard title="Avg Food Cost %" value={`${avgFoodCostPct.toFixed(1)}%`} icon={Percent} iconColor="text-amber-600" iconBg="bg-amber-100" testId="stat-avg-food-cost" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <ChefHat className="h-4 w-4 text-muted-foreground" /> Recipes
            </CardTitle>
            {canEdit && (
              <Button onClick={() => navigate("/recipes/new")} data-testid="button-add-recipe">
                <Plus className="h-4 w-4 mr-2" /> New Recipe
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {allRecipes.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground" data-testid="text-no-recipes">
              <ChefHat className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No recipes yet.</p>
              {canEdit && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/recipes/new")} data-testid="button-add-recipe-empty">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Create First Recipe
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipe</TableHead>
                  <TableHead>Linked Menu Item</TableHead>
                  <TableHead>Ingredients</TableHead>
                  <TableHead>Plate Cost</TableHead>
                  <TableHead>Selling Price</TableHead>
                  <TableHead>Food Cost %</TableHead>
                  <TableHead>Margin</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {allRecipes.map(recipe => {
                  const pc = calcPlateCost(recipe);
                  const mi = recipe.menuItemId ? menuMap.get(recipe.menuItemId) : null;
                  const sp = Number(mi?.price || 0);
                  const mg = sp - pc;
                  const fcp = sp > 0 ? (pc / sp) * 100 : 0;
                  return (
                    <TableRow key={recipe.id} data-testid={`row-recipe-${recipe.id}`}>
                      <TableCell className="font-medium">{recipe.name}</TableCell>
                      <TableCell>{mi?.name || <span className="text-muted-foreground text-xs">Not linked</span>}</TableCell>
                      <TableCell><Badge variant="secondary">{recipe.ingredients?.length || 0}</Badge></TableCell>
                      <TableCell className="font-medium">{fmt(pc)}</TableCell>
                      <TableCell>{sp > 0 ? fmt(sp) : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                      <TableCell>
                        {sp > 0 ? (
                          <Badge variant={fcp > 40 ? "destructive" : fcp > 30 ? "default" : "secondary"}>
                            {fcp.toFixed(1)}%
                          </Badge>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className={sp > 0 ? (mg >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium") : ""}>
                        {sp > 0 ? fmt(mg) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => navigate(`/recipes/${recipe.id}`)}
                              data-testid={`button-edit-recipe-${recipe.id}`}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => { if (confirm(`Delete recipe "${recipe.name}"?`)) deleteMutation.mutate(recipe.id); }}
                              data-testid={`button-delete-recipe-${recipe.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
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
    </div>
  );
}

export default function InventoryHub() {
  const { user } = useAuth();
  const canManage = MANAGEMENT_ROLES.includes(user?.role || "");
  const [tab, setTab] = useState("stock");

  return (
    <div className="space-y-6" data-testid="inventory-hub">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="inventory-tabs">
          <TabsTrigger value="stock" data-testid="tab-stock">
            <Package2 className="h-4 w-4 mr-1.5" />Stock & Items
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="recipes" data-testid="tab-recipes">
              <ChefHat className="h-4 w-4 mr-1.5" />Recipes
            </TabsTrigger>
          )}
          {canManage && (
            <TabsTrigger value="suppliers" data-testid="tab-suppliers">
              <BookOpen className="h-4 w-4 mr-1.5" />Suppliers
            </TabsTrigger>
          )}
          {canManage && (
            <TabsTrigger value="procurement" data-testid="tab-procurement">
              <ShoppingCart className="h-4 w-4 mr-1.5" />Procurement
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="stock" className="mt-4">
          <InventoryPage />
        </TabsContent>
        {canManage && (
          <TabsContent value="recipes" className="mt-4">
            <RecipesTab />
          </TabsContent>
        )}
        {canManage && (
          <TabsContent value="suppliers" className="mt-4">
            <SuppliersPage />
          </TabsContent>
        )}
        {canManage && (
          <TabsContent value="procurement" className="mt-4">
            <ProcurementPage />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
