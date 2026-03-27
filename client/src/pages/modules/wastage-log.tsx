import { PageTitle } from "@/lib/accessibility";
import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, Trash2, Search, Clock, Leaf, UtensilsCrossed, Package, CheckCircle,
  AlertCircle, HelpCircle, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type WastageType = "ingredient" | "prepared_dish" | "plated_item";
type Preventability = "yes" | "no" | "unsure";

const REASON_TO_CATEGORY: Record<string, string> = {
  burnt: "cooking_error",
  overcooked: "cooking_error",
  spoiled: "spoilage",
  prep_trim: "trim_waste",
  returned: "plate_return",
  over_production: "overproduction",
  other: "other",
};

const REASONS = [
  { id: "burnt", emoji: "🔥", label: "Burnt", category: "cooking_error" },
  { id: "overcooked", emoji: "♨️", label: "Overcooked", category: "cooking_error" },
  { id: "spoiled", emoji: "🦠", label: "Spoiled", category: "spoilage" },
  { id: "prep_trim", emoji: "✂️", label: "Prep Trim", category: "trim_waste" },
  { id: "returned", emoji: "↩️", label: "Returned", category: "plate_return" },
  { id: "over_production", emoji: "📦", label: "Over-Production", category: "overproduction" },
  { id: "other", emoji: "❓", label: "Other", category: "other" },
];

const TYPE_OPTIONS: { value: WastageType; label: string; icon: any }[] = [
  { value: "ingredient", label: "Ingredient", icon: Leaf },
  { value: "prepared_dish", label: "Prepared Dish", icon: UtensilsCrossed },
  { value: "plated_item", label: "Plated Item", icon: Package },
];

const RECENT_ITEMS_KEY = "wastage_recent_items";

function getRecentItems(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) || "[]");
  } catch {
    return [];
  }
}

function addRecentItem(name: string) {
  const items = getRecentItems();
  const updated = [name, ...items.filter((i) => i !== name)].slice(0, 5);
  localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(updated));
}

export default function WastageLogPage() {
  const { t } = useTranslation("modules");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [type, setType] = useState<WastageType>("ingredient");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<{ id: string; name: string; unit: string; unitCost: number | null } | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [reason, setReason] = useState("");
  const [preventability, setPreventability] = useState<Preventability | "">("");
  const [note, setNote] = useState("");

  const recentItems = getRecentItems();

  const { data: inventoryRes } = useQuery<{ data: any[] }>({
    queryKey: ["/api/inventory", "wastage-log"],
    queryFn: () => apiRequest("GET", "/api/inventory?limit=500").then((r) => r.json()),
  });
  const inventoryItems = inventoryRes?.data ?? [];

  const filteredItems = search.trim()
    ? inventoryItems.filter((item: any) =>
        item.name.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const estimatedCost =
    selectedItem?.unitCost && quantity
      ? (parseFloat(quantity) * selectedItem.unitCost).toFixed(2)
      : null;

  const selectedReason = REASONS.find((r) => r.id === reason);
  const wastageCategory = selectedReason?.category ?? "other";

  const wastageMutation = useMutation({
    mutationFn: async () => {
      const ingredientName = selectedItem?.name ?? search.trim();
      const res = await apiRequest("POST", "/api/wastage", {
        wastageCategory,
        ingredientId: selectedItem?.id ?? null,
        ingredientName,
        quantity: parseFloat(quantity),
        unit: unit || selectedItem?.unit || "unit",
        unitCost: selectedItem?.unitCost ?? null,
        reason: reason || null,
        isPreventable: preventability === "yes",
        notes: note || null,
      });
      return res.json();
    },
    onSuccess: () => {
      if (selectedItem) addRecentItem(selectedItem.name);
      toast({ title: "Wastage Logged", description: "Entry recorded successfully." });
      navigate("/");
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const canSubmit =
    (selectedItem || search.trim()) &&
    quantity &&
    parseFloat(quantity) > 0 &&
    reason;

  const handleSelectItem = useCallback(
    (item: any) => {
      setSelectedItem({
        id: item.id,
        name: item.name,
        unit: item.unit,
        unitCost: item.unitCost ?? item.average_cost ?? item.cost_price ?? null,
      });
      setUnit(item.unit || "");
      setSearch(item.name);
    },
    []
  );

  return (
    <motion.div
      className="max-w-lg mx-auto px-4 py-6 space-y-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="page-wastage-log"
    >
      <div className="flex items-center gap-3">
        <PageTitle title={t("wastageLog")} />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/")}
          data-testid="btn-back"
          aria-label="Go back to dashboard"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <div>
          <h1 className="text-xl font-heading font-bold flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Log Wastage
          </h1>
          <p className="text-sm text-muted-foreground">Quick kitchen entry</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <div className="grid grid-cols-3 gap-2">
          {TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              data-testid={`type-btn-${value}`}
              onClick={() => { setType(value); setSelectedItem(null); setSearch(""); }}
              className={cn(
                "flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm font-medium transition-all",
                type === value
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-border hover:border-destructive/40 hover:bg-muted/50"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Search Item</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search ingredient or dish..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedItem(null);
            }}
            data-testid="input-item-search"
          />
        </div>

        {filteredItems.length > 0 && !selectedItem && (
          <div className="border rounded-xl overflow-hidden divide-y max-h-48 overflow-y-auto" data-testid="search-results">
            {filteredItems.slice(0, 8).map((item: any) => (
              <button
                key={item.id}
                className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/50 text-sm text-left"
                onClick={() => handleSelectItem(item)}
                data-testid={`item-result-${item.id}`}
              >
                <span>{item.name}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {selectedItem && (
          <div className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-xl text-sm" data-testid="selected-item">
            <span className="font-medium">{selectedItem.name}</span>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => { setSelectedItem(null); setSearch(""); }}
              data-testid="btn-clear-item"
            >
              ✕
            </button>
          </div>
        )}

        {!search && recentItems.length > 0 && (
          <div className="space-y-1.5" data-testid="recent-items">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Recent
            </p>
            <div className="flex flex-wrap gap-2">
              {recentItems.map((name) => {
                const found = inventoryItems.find((i: any) => i.name === name);
                return (
                  <button
                    key={name}
                    className="px-3 py-1 text-xs rounded-full border hover:bg-muted/50"
                    onClick={() => { if (found) handleSelectItem(found); else setSearch(name); }}
                    data-testid={`recent-item-${name}`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="qty">Quantity</Label>
          <Input
            id="qty"
            type="number"
            min="0"
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 250"
            data-testid="input-quantity"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit">Unit</Label>
          <Input
            id="unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="g, ml, pcs..."
            data-testid="input-unit"
          />
        </div>
      </div>

      {estimatedCost && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-sm" data-testid="cost-preview">
          <span className="text-amber-700 dark:text-amber-300">Estimated Cost</span>
          <span className="font-semibold text-amber-800 dark:text-amber-200">${estimatedCost}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label>Reason</Label>
        <div className="grid grid-cols-4 gap-2">
          {REASONS.map(({ id, emoji, label }) => (
            <button
              key={id}
              data-testid={`reason-btn-${id}`}
              onClick={() => setReason(id)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-xl border-2 text-xs font-medium transition-all",
                reason === id
                  ? "border-destructive bg-destructive/10"
                  : "border-border hover:border-destructive/30 hover:bg-muted/50"
              )}
            >
              <span className="text-lg">{emoji}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Preventable?</Label>
        <div className="flex gap-2">
          {(["yes", "no", "unsure"] as Preventability[]).map((val) => {
            const icons = { yes: CheckCircle, no: AlertCircle, unsure: HelpCircle };
            const colors = { yes: "text-green-600", no: "text-red-500", unsure: "text-amber-500" };
            const Icon = icons[val];
            return (
              <button
                key={val}
                data-testid={`prevent-btn-${val}`}
                onClick={() => setPreventability(val)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border-2 text-sm font-medium capitalize transition-all",
                  preventability === val
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <Icon className={`h-4 w-4 ${colors[val]}`} />
                {val}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Any additional details..."
          rows={2}
          data-testid="input-note"
        />
      </div>

      <Button
        size="lg"
        className="w-full bg-destructive hover:bg-destructive/90 gap-2 text-base font-semibold"
        disabled={!canSubmit || wastageMutation.isPending}
        onClick={() => wastageMutation.mutate()}
        data-testid="btn-log-wastage"
      >
        <Trash2 className="h-5 w-5" />
        {wastageMutation.isPending ? "Logging..." : "LOG WASTAGE"}
      </Button>
    </motion.div>
  );
}
