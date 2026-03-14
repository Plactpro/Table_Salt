import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Tag, Percent, DollarSign, Gift, ShoppingBag,
  Calendar, Clock, CheckCircle2, XCircle, Zap, AlertCircle,
} from "lucide-react";
import type { Offer } from "@shared/schema";

const offerTypeLabels: Record<string, string> = {
  percentage: "Percentage Off",
  fixed_amount: "Fixed Amount Off",
  buy_one_get_one: "Buy One Get One",
  combo_deal: "Combo Deal",
  free_item: "Free Item",
  happy_hour: "Happy Hour",
};

const offerTypeIcons: Record<string, React.ElementType> = {
  percentage: Percent,
  fixed_amount: DollarSign,
  buy_one_get_one: Gift,
  combo_deal: ShoppingBag,
  free_item: Zap,
  happy_hour: Clock,
};

const offerScopeLabels: Record<string, string> = {
  all_items: "All Items",
  category: "Category",
  specific_items: "Specific Items",
  order_total: "Order Total",
};

function isOfferActive(offer: Offer): boolean {
  if (!offer.active) return false;
  const now = new Date();
  if (offer.startDate && new Date(offer.startDate) > now) return false;
  if (offer.endDate && new Date(offer.endDate) < now) return false;
  if (offer.usageLimit && (offer.usageCount ?? 0) >= offer.usageLimit) return false;
  return true;
}

function isOfferExpired(offer: Offer): boolean {
  if (offer.endDate && new Date(offer.endDate) < new Date()) return true;
  if (offer.usageLimit && (offer.usageCount ?? 0) >= offer.usageLimit) return true;
  return false;
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

interface OfferForm {
  name: string;
  description: string;
  type: string;
  value: string;
  scope: string;
  scopeRef: string;
  minOrderAmount: string;
  maxDiscount: string;
  startDate: string;
  endDate: string;
  active: boolean;
  usageLimit: string;
}

const emptyForm: OfferForm = {
  name: "",
  description: "",
  type: "percentage",
  value: "",
  scope: "all_items",
  scopeRef: "",
  minOrderAmount: "",
  maxDiscount: "",
  startDate: "",
  endDate: "",
  active: true,
  usageLimit: "",
};

export default function OffersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: string | number) => sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [form, setForm] = useState<OfferForm>(emptyForm);
  type FilterStatus = "all" | "active" | "expired";
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const { data: offers = [] } = useQuery<Offer[]>({
    queryKey: ["/api/offers"],
  });

  const filteredOffers = offers.filter((offer) => {
    if (filterStatus === "active") return isOfferActive(offer);
    if (filterStatus === "expired") return isOfferExpired(offer);
    return true;
  });

  const createOffer = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/offers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      toast({ title: "Offer created" });
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateOffer = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/offers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      toast({ title: "Offer updated" });
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteOffer = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/offers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      toast({ title: "Offer deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function openAdd() {
    setEditingOffer(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(offer: Offer) {
    setEditingOffer(offer);
    setForm({
      name: offer.name,
      description: offer.description || "",
      type: offer.type || "percentage",
      value: String(offer.value),
      scope: offer.scope || "all_items",
      scopeRef: offer.scopeRef || "",
      minOrderAmount: offer.minOrderAmount ? String(offer.minOrderAmount) : "",
      maxDiscount: offer.maxDiscount ? String(offer.maxDiscount) : "",
      startDate: offer.startDate ? new Date(offer.startDate).toISOString().split("T")[0] : "",
      endDate: offer.endDate ? new Date(offer.endDate).toISOString().split("T")[0] : "",
      active: offer.active ?? true,
      usageLimit: offer.usageLimit ? String(offer.usageLimit) : "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim() || !form.value) return;
    const payload: Record<string, unknown> = {
      name: form.name,
      description: form.description || null,
      type: form.type,
      value: form.value,
      scope: form.scope,
      scopeRef: form.scopeRef || null,
      minOrderAmount: form.minOrderAmount || null,
      maxDiscount: form.maxDiscount || null,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
      endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
      active: form.active,
      usageLimit: form.usageLimit ? parseInt(form.usageLimit) : null,
    };
    if (editingOffer) {
      updateOffer.mutate({ id: editingOffer.id, data: payload });
    } else {
      createOffer.mutate(payload);
    }
  }

  function formatOfferValue(offer: Offer) {
    if (offer.type === "percentage" || offer.type === "happy_hour") return `${offer.value}%`;
    if (offer.type === "fixed_amount") return fmt(Number(offer.value));
    if (offer.type === "buy_one_get_one") return "BOGO";
    return String(offer.value);
  }

  const activeCount = offers.filter(isOfferActive).length;
  const expiredCount = offers.filter(isOfferExpired).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6 max-w-7xl mx-auto"
      data-testid="offers-page"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Tag className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold" data-testid="text-offers-title">
              Offers & Discounts
            </h1>
            <p className="text-muted-foreground text-sm">Create and manage promotions for your restaurant</p>
          </div>
        </div>
        <Button onClick={openAdd} data-testid="button-add-offer">
          <Plus className="h-4 w-4 mr-1" /> Create Offer
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {([
          { key: "all" as FilterStatus, label: "Total Offers", value: offers.length, icon: Tag, color: "text-primary", bg: "bg-primary/10" },
          { key: "active" as FilterStatus, label: "Active", value: activeCount, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100" },
          { key: "expired" as FilterStatus, label: "Expired", value: expiredCount, icon: XCircle, color: "text-red-600", bg: "bg-red-100" },
        ]).map((stat, i) => (
          <motion.div
            key={stat.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Card
              className={`cursor-pointer transition-all duration-200 hover:shadow-md ${filterStatus === stat.key ? "ring-2 ring-primary" : ""}`}
              onClick={() => setFilterStatus(stat.key)}
              data-testid={`stat-${stat.key}-offers`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`rounded-lg p-2.5 ${stat.bg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold" data-testid={`text-${stat.key}-count`}>{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {filteredOffers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground" data-testid="text-no-offers">
          <Tag className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">No offers found. Create your first promotion!</p>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          <AnimatePresence>
            {filteredOffers.map((offer) => {
              const active = isOfferActive(offer);
              const expired = isOfferExpired(offer);
              const TypeIcon = offerTypeIcons[offer.type || "percentage"] || Tag;
              return (
                <motion.div key={offer.id} variants={itemVariants} layout>
                  <Card
                    className={`group relative transition-all duration-200 hover:shadow-lg ${
                      expired ? "opacity-60" : ""
                    }`}
                    data-testid={`card-offer-${offer.id}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${active ? "bg-primary/10" : "bg-muted"}`}>
                            <TypeIcon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div>
                            <CardTitle className="text-sm" data-testid={`text-offer-name-${offer.id}`}>
                              {offer.name}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">
                              {offerTypeLabels[offer.type || "percentage"]}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={active ? "default" : expired ? "destructive" : "secondary"}
                          className="text-xs"
                          data-testid={`badge-offer-status-${offer.id}`}
                        >
                          {active ? "Active" : expired ? "Expired" : "Inactive"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-2xl font-bold" data-testid={`text-offer-value-${offer.id}`}>
                        {formatOfferValue(offer)}
                        <span className="text-xs font-normal text-muted-foreground ml-1">off</span>
                      </div>

                      {offer.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-offer-desc-${offer.id}`}>
                          {offer.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          {offerScopeLabels[offer.scope || "all_items"]}
                        </Badge>
                        {offer.minOrderAmount && Number(offer.minOrderAmount) > 0 && (
                          <Badge variant="outline" className="text-xs">
                            Min: {fmt(Number(offer.minOrderAmount))}
                          </Badge>
                        )}
                        {offer.usageLimit && (
                          <Badge variant="outline" className="text-xs">
                            {offer.usageCount ?? 0}/{offer.usageLimit} used
                          </Badge>
                        )}
                      </div>

                      {(offer.startDate || offer.endDate) && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {offer.startDate && (
                            <span>{new Date(offer.startDate).toLocaleDateString()}</span>
                          )}
                          {offer.startDate && offer.endDate && <span>–</span>}
                          {offer.endDate && (
                            <span>{new Date(offer.endDate).toLocaleDateString()}</span>
                          )}
                        </div>
                      )}

                      {["combo_deal", "buy_one_get_one", "free_item"].includes(offer.type || "") && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1" data-testid={`badge-pos-na-${offer.id}`}>
                          <AlertCircle className="h-3 w-3" />
                          <span>Not applicable at POS — manual application only</span>
                        </div>
                      )}

                      <Separator />

                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(offer)}
                          data-testid={`button-edit-offer-${offer.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("Delete this offer?")) deleteOffer.mutate(offer.id);
                          }}
                          data-testid={`button-delete-offer-${offer.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-offer">
          <DialogHeader>
            <DialogTitle>{editingOffer ? "Edit Offer" : "Create Offer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="offer-name">Name</Label>
              <Input
                id="offer-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Happy Hour 20% Off"
                data-testid="input-offer-name"
              />
            </div>
            <div>
              <Label htmlFor="offer-desc">Description</Label>
              <Textarea
                id="offer-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Offer details..."
                rows={2}
                data-testid="input-offer-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger data-testid="select-offer-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(offerTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="offer-value">
                  {form.type === "percentage" ? "Percentage (%)" : "Value ($)"}
                </Label>
                <Input
                  id="offer-value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder={form.type === "percentage" ? "e.g. 20" : "e.g. 5.00"}
                  data-testid="input-offer-value"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Scope</Label>
                <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
                  <SelectTrigger data-testid="select-offer-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(offerScopeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(form.scope === "category" || form.scope === "specific_items") && (
                <div>
                  <Label htmlFor="offer-scope-ref">Scope Reference</Label>
                  <Input
                    id="offer-scope-ref"
                    value={form.scopeRef}
                    onChange={(e) => setForm({ ...form, scopeRef: e.target.value })}
                    placeholder="Category or item ID"
                    data-testid="input-offer-scope-ref"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="offer-min">Min Order ($)</Label>
                <Input
                  id="offer-min"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.minOrderAmount}
                  onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
                  placeholder="No minimum"
                  data-testid="input-offer-min"
                />
              </div>
              <div>
                <Label htmlFor="offer-max">Max Discount ($)</Label>
                <Input
                  id="offer-max"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.maxDiscount}
                  onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                  placeholder="No max"
                  data-testid="input-offer-max"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="offer-start">Start Date</Label>
                <Input
                  id="offer-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  data-testid="input-offer-start"
                />
              </div>
              <div>
                <Label htmlFor="offer-end">End Date</Label>
                <Input
                  id="offer-end"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  data-testid="input-offer-end"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="offer-limit">Usage Limit</Label>
                <Input
                  id="offer-limit"
                  type="number"
                  min="0"
                  value={form.usageLimit}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                  placeholder="Unlimited"
                  data-testid="input-offer-limit"
                />
              </div>
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.active}
                    onCheckedChange={(checked) => setForm({ ...form, active: checked })}
                    data-testid="switch-offer-active"
                  />
                  <Label>Active</Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-offer">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createOffer.isPending || updateOffer.isPending}
              data-testid="button-save-offer"
            >
              {editingOffer ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
