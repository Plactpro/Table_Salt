import { PageTitle } from "@/lib/accessibility";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Package, RotateCcw, Trash2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

interface ShiftItem {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
  preparedQty: string;
  soldQty: string;
  leftover: string;
  recoverable: boolean;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  average_cost?: number;
  cost_price?: number;
}

export default function WastageShiftPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [items, setItems] = useState<ShiftItem[]>([]);
  const [initialized, setInitialized] = useState(false);

  const { data: inventoryRes, isLoading } = useQuery<{ data: InventoryItem[] }>({
    queryKey: ["/api/inventory", "shift"],
    queryFn: () => apiRequest("GET", "/api/inventory?limit=200").then((r) => r.json()),
  });

  useEffect(() => {
    const data = inventoryRes?.data ?? [];
    if (!initialized && data.length > 0) {
      setItems(
        data.slice(0, 30).map((item: InventoryItem) => ({
          id: item.id,
          name: item.name,
          unit: item.unit,
          unitCost: Number(item.average_cost ?? item.cost_price ?? 0),
          preparedQty: "",
          soldQty: "",
          leftover: "",
          recoverable: false,
        }))
      );
      setInitialized(true);
    }
  }, [inventoryRes, initialized]);

  const updateItem = (id: string, field: keyof ShiftItem, value: string | boolean) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const bulkItems = items
        .filter((i) => i.leftover && parseFloat(i.leftover) > 0)
        .map((i) => ({
          ingredientId: i.id,
          ingredientName: i.name,
          quantity: parseFloat(i.leftover),
          unit: i.unit,
          unitCost: i.unitCost,
          wastageCategory: "overproduction",
          isPreventable: false,
          reason: i.recoverable ? "recoverable_leftover" : "end_of_shift_discard",
        }));

      if (bulkItems.length === 0) {
        throw new Error("No leftover quantities entered");
      }

      const res = await apiRequest("POST", "/api/wastage/shift-bulk", { items: bulkItems });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Shift Wastage Submitted",
        description: "End-of-shift bulk entry recorded.",
      });
      navigate("/");
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const filledCount = items.filter((i) => i.leftover && parseFloat(i.leftover) > 0).length;

  return (
    <motion.div
      className="max-w-4xl mx-auto px-4 py-6 space-y-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="page-wastage-shift"
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <PageTitle title="Wastage by Shift" />
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="btn-back" aria-label="Go back to dashboard">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <div>
            <h1 className="text-xl font-heading font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              End of Shift Wastage Log
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter leftover quantities for each item
            </p>
          </div>
        </div>
        {filledCount > 0 && (
          <Badge variant="secondary" data-testid="filled-count">
            {filledCount} item{filledCount > 1 ? "s" : ""} with leftovers
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium text-muted-foreground grid grid-cols-12 gap-3 px-1">
            <span className="col-span-4">Item</span>
            <span className="col-span-2 text-center">Prepared</span>
            <span className="col-span-2 text-center">Sold</span>
            <span className="col-span-2 text-center">Leftover</span>
            <span className="col-span-2 text-center">Recoverable</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="divide-y" data-testid="shift-items-table">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
                  data-testid={`shift-row-${item.id}`}
                >
                  <div className="col-span-4">
                    <p className="font-medium text-sm">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.unit}</p>
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-8 text-center text-sm"
                      value={item.preparedQty}
                      onChange={(e) => updateItem(item.id, "preparedQty", e.target.value)}
                      placeholder="0"
                      data-testid={`input-prepared-${item.id}`}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-8 text-center text-sm"
                      value={item.soldQty}
                      onChange={(e) => updateItem(item.id, "soldQty", e.target.value)}
                      placeholder="0"
                      data-testid={`input-sold-${item.id}`}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`h-8 text-center text-sm ${
                        item.leftover && parseFloat(item.leftover) > 0
                          ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20"
                          : ""
                      }`}
                      value={item.leftover}
                      onChange={(e) => updateItem(item.id, "leftover", e.target.value)}
                      placeholder="0"
                      data-testid={`input-leftover-${item.id}`}
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-center gap-2">
                    <Switch
                      checked={item.recoverable}
                      onCheckedChange={(v) => updateItem(item.id, "recoverable", v)}
                      data-testid={`switch-recoverable-${item.id}`}
                    />
                    {item.recoverable ? (
                      <RotateCcw className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-destructive/50" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate("/")} data-testid="btn-cancel">
          Cancel
        </Button>
        <Button
          className="gap-2"
          disabled={filledCount === 0 || submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
          data-testid="btn-submit-shift-wastage"
        >
          <Send className="h-4 w-4" />
          {submitMutation.isPending ? "Submitting..." : `Submit ${filledCount > 0 ? `(${filledCount} items)` : ""}`}
        </Button>
      </div>
    </motion.div>
  );
}
