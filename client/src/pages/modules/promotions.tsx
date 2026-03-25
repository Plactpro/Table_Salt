import { PageTitle } from "@/lib/accessibility";
import { useState, useMemo } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Zap, Percent, DollarSign, Clock, ShieldCheck,
  Layers, Calendar, CheckCircle2, XCircle, Play, Pause, Crown, Truck,
  Monitor, BarChart3, Settings2, Gift,
} from "lucide-react";
import type { PromotionRule } from "@shared/schema";

const ruleTypeLabels: Record<string, string> = {
  happy_hour: "Happy Hour",
  combo_deal: "Combo Deal",
  bogo: "Buy One Get One",
  free_item: "Free Item",
  channel_surcharge: "Channel Surcharge",
  loyalty_discount: "Loyalty Discount",
  percentage_off: "Percentage Off",
  fixed_discount: "Fixed Discount",
  service_charge: "Service Charge",
  time_based: "Time-Based",
  minimum_order: "Minimum Order",
};

const ruleTypeIcons: Record<string, React.ElementType> = {
  happy_hour: Clock,
  combo_deal: Layers,
  bogo: Gift,
  free_item: Gift,
  service_charge: Percent,
  channel_surcharge: Truck,
  loyalty_discount: Crown,
  percentage_off: Percent,
  fixed_discount: DollarSign,
  time_based: Clock,
  minimum_order: BarChart3,
};

const discountTypeLabels: Record<string, string> = {
  percentage: "Percentage",
  fixed_amount: "Fixed Amount",
  surcharge: "Surcharge (+)",
};

const scopeLabels: Record<string, string> = {
  all_items: "All Items",
  category: "Category",
  specific_items: "Specific Items",
  order_total: "Order Total",
};

const channelOptions = [
  { value: "pos", label: "POS" },
  { value: "online", label: "Online" },
  { value: "delivery", label: "Delivery" },
  { value: "takeaway", label: "Takeaway" },
];

function isRuleActive(rule: PromotionRule): boolean {
  if (!rule.active) return false;
  const now = new Date();
  if (rule.startDate && new Date(rule.startDate) > now) return false;
  if (rule.endDate && new Date(rule.endDate) < now) return false;
  if (rule.usageLimit && (rule.usageCount ?? 0) >= rule.usageLimit) return false;
  return true;
}

function isRuleExpired(rule: PromotionRule): boolean {
  if (rule.endDate && new Date(rule.endDate) < new Date()) return true;
  if (rule.usageLimit && (rule.usageCount ?? 0) >= rule.usageLimit) return true;
  return false;
}

interface RuleForm {
  name: string;
  description: string;
  ruleType: string;
  discountType: string;
  discountValue: string;
  scope: string;
  scopeRef: string;
  channels: string[];
  priority: string;
  stackable: boolean;
  maxDiscount: string;
  minOrderAmount: string;
  startDate: string;
  endDate: string;
  active: boolean;
  usageLimit: string;
  startHour: string;
  endHour: string;
  daysOfWeek: number[];
  loyaltyTier: string;
  outletIds: string;
  customerSegment: string;
  buyQuantity: string;
  getQuantity: string;
  getDiscountPercent: string;
  freeItemName: string;
  freeQuantity: string;
  mutualExclusionGroup: string;
}

const emptyForm: RuleForm = {
  name: "",
  description: "",
  ruleType: "percentage_off",
  discountType: "percentage",
  discountValue: "",
  scope: "all_items",
  scopeRef: "",
  channels: [],
  priority: "0",
  stackable: false,
  maxDiscount: "",
  minOrderAmount: "",
  startDate: "",
  endDate: "",
  active: true,
  usageLimit: "",
  startHour: "",
  endHour: "",
  daysOfWeek: [],
  loyaltyTier: "",
  outletIds: "",
  customerSegment: "",
  buyQuantity: "1",
  getQuantity: "1",
  getDiscountPercent: "100",
  freeItemName: "",
  freeQuantity: "1",
  mutualExclusionGroup: "",
};

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PromotionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: string | number) => sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PromotionRule | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [tab, setTab] = useState("all");

  const { data: rules = [] } = useQuery<PromotionRule[]>({
    queryKey: ["/api/promotion-rules"],
  });

  const filteredRules = useMemo(() => {
    if (tab === "active") return rules.filter(isRuleActive);
    if (tab === "expired") return rules.filter(isRuleExpired);
    if (tab === "inactive") return rules.filter((r) => !r.active && !isRuleExpired(r));
    return rules;
  }, [rules, tab]);

  const activeCount = rules.filter(isRuleActive).length;
  const expiredCount = rules.filter(isRuleExpired).length;

  const createRule = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/promotion-rules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promotion-rules"] });
      toast({ title: "Promotion rule created" });
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateRule = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/promotion-rules/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promotion-rules"] });
      toast({ title: "Promotion rule updated" });
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/promotion-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promotion-rules"] });
      toast({ title: "Promotion rule deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/promotion-rules/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promotion-rules"] });
    },
  });

  function openAdd() {
    setEditingRule(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(rule: PromotionRule) {
    setEditingRule(rule);
    const cond = (rule.conditions || {}) as Record<string, unknown>;
    setForm({
      name: rule.name,
      description: rule.description || "",
      ruleType: rule.ruleType,
      discountType: rule.discountType,
      discountValue: rule.discountValue,
      scope: rule.scope || "all_items",
      scopeRef: rule.scopeRef || "",
      channels: rule.channels || [],
      priority: String(rule.priority ?? 0),
      stackable: rule.stackable ?? false,
      maxDiscount: rule.maxDiscount || "",
      minOrderAmount: rule.minOrderAmount || "",
      startDate: rule.startDate ? new Date(rule.startDate).toISOString().split("T")[0] : "",
      endDate: rule.endDate ? new Date(rule.endDate).toISOString().split("T")[0] : "",
      active: rule.active ?? true,
      usageLimit: rule.usageLimit ? String(rule.usageLimit) : "",
      startHour: cond.startHour !== undefined ? String(cond.startHour) : "",
      endHour: cond.endHour !== undefined ? String(cond.endHour) : "",
      daysOfWeek: Array.isArray(cond.daysOfWeek) ? (cond.daysOfWeek as number[]) : [],
      loyaltyTier: (cond.loyaltyTier as string) || "",
      buyQuantity: cond.buyQuantity ? String(cond.buyQuantity) : "1",
      getQuantity: cond.getQuantity ? String(cond.getQuantity) : "1",
      getDiscountPercent: cond.getDiscountPercent ? String(cond.getDiscountPercent) : "100",
      freeItemName: (cond.freeItemName as string) || "",
      freeQuantity: cond.freeQuantity ? String(cond.freeQuantity) : "1",
      outletIds: Array.isArray(cond.outletIds) ? (cond.outletIds as string[]).join(", ") : "",
      customerSegment: (cond.customerSegment as string) || "",
      mutualExclusionGroup: (cond.mutualExclusionGroup as string) || "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim() || (form.ruleType !== "free_item" && !form.discountValue)) return;

    const conditions: Record<string, unknown> = {};
    if (form.startHour) conditions.startHour = parseInt(form.startHour);
    if (form.endHour) conditions.endHour = parseInt(form.endHour);
    if (form.daysOfWeek.length > 0) conditions.daysOfWeek = form.daysOfWeek;
    if (form.loyaltyTier) conditions.loyaltyTier = form.loyaltyTier;
    if (form.outletIds.trim()) conditions.outletIds = form.outletIds.split(",").map(s => s.trim()).filter(Boolean);
    if (form.customerSegment.trim()) conditions.customerSegment = form.customerSegment;
    if (form.mutualExclusionGroup.trim()) conditions.mutualExclusionGroup = form.mutualExclusionGroup;
    if (form.ruleType === "bogo") {
      conditions.buyQuantity = parseInt(form.buyQuantity) || 1;
      conditions.getQuantity = parseInt(form.getQuantity) || 1;
      conditions.getDiscountPercent = parseInt(form.getDiscountPercent) || 100;
    }
    if (form.ruleType === "free_item") {
      conditions.freeItemName = form.freeItemName;
      conditions.freeQuantity = parseInt(form.freeQuantity) || 1;
    }

    const payload: Record<string, unknown> = {
      name: form.name,
      description: form.description || null,
      ruleType: form.ruleType,
      discountType: form.discountType,
      discountValue: form.discountValue,
      scope: form.scope,
      scopeRef: form.scopeRef || null,
      channels: form.channels.length > 0 ? form.channels : null,
      priority: parseInt(form.priority) || 0,
      stackable: form.stackable,
      maxDiscount: form.maxDiscount || null,
      minOrderAmount: form.minOrderAmount || null,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
      endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
      active: form.active,
      usageLimit: form.usageLimit ? parseInt(form.usageLimit) : null,
      conditions: Object.keys(conditions).length > 0 ? conditions : null,
    };

    if (editingRule) {
      updateRule.mutate({ id: editingRule.id, data: payload });
    } else {
      createRule.mutate(payload);
    }
  }

  function formatRuleValue(rule: PromotionRule) {
    if (rule.discountType === "percentage") return `${rule.discountValue}%`;
    if (rule.discountType === "fixed_amount") return fmt(Number(rule.discountValue));
    if (rule.discountType === "surcharge") return `+${fmt(Number(rule.discountValue))}`;
    return rule.discountValue;
  }

  function toggleDay(day: number) {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [...prev.daysOfWeek, day],
    }));
  }

  function toggleChannel(ch: string) {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(ch)
        ? prev.channels.filter((c) => c !== ch)
        : [...prev.channels, ch],
    }));
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6 max-w-7xl mx-auto"
      data-testid="promotions-page"
    >
      <div className="flex items-center justify-between">
        <PageTitle title="Promotions" />
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold" data-testid="text-promotions-title">
              Promotion Center
            </h1>
            <p className="text-muted-foreground text-sm">Centralized pricing rules engine for all channels</p>
          </div>
        </div>
        <Button onClick={openAdd} data-testid="button-add-rule">
          <Plus className="h-4 w-4 mr-1" /> New Rule
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {([
          { label: "Total Rules", value: rules.length, icon: Settings2, color: "text-primary", bg: "bg-primary/10" },
          { label: "Active", value: activeCount, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100" },
          { label: "Expired", value: expiredCount, icon: XCircle, color: "text-red-600", bg: "bg-red-100" },
          { label: "Stackable", value: rules.filter((r) => r.stackable).length, icon: Layers, color: "text-blue-600", bg: "bg-blue-100" },
        ]).map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`rounded-lg p-2.5 ${stat.bg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="tabs-rules-filter">
          <TabsTrigger value="all">All ({rules.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
          <TabsTrigger value="expired">Expired ({expiredCount})</TabsTrigger>
          <TabsTrigger value="inactive">Inactive</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {filteredRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground" data-testid="text-no-rules">
              <Zap className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">No promotion rules found. Create your first rule!</p>
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            >
              <AnimatePresence>
                {filteredRules.map((rule) => {
                  const active = isRuleActive(rule);
                  const expired = isRuleExpired(rule);
                  const TypeIcon = ruleTypeIcons[rule.ruleType] || Zap;
                  const cond = (rule.conditions || {}) as Record<string, unknown>;
                  return (
                    <motion.div
                      key={rule.id}
                      variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
                      layout
                    >
                      <Card
                        className={`group relative transition-all duration-200 hover:shadow-lg ${expired ? "opacity-60" : ""}`}
                        data-testid={`card-rule-${rule.id}`}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-lg ${active ? "bg-primary/10" : "bg-muted"}`}>
                                <TypeIcon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                              </div>
                              <div>
                                <CardTitle className="text-sm" data-testid={`text-rule-name-${rule.id}`}>
                                  {rule.name}
                                </CardTitle>
                                <p className="text-xs text-muted-foreground">
                                  {ruleTypeLabels[rule.ruleType] || rule.ruleType}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={active ? "default" : expired ? "destructive" : "secondary"}
                                className="text-xs"
                                data-testid={`badge-rule-status-${rule.id}`}
                              >
                                {active ? "Active" : expired ? "Expired" : "Inactive"}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="text-2xl font-bold" data-testid={`text-rule-value-${rule.id}`}>
                            {formatRuleValue(rule)}
                            <span className="text-xs font-normal text-muted-foreground ml-1">
                              {rule.discountType === "surcharge" ? "surcharge" : "off"}
                            </span>
                          </div>

                          {rule.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {rule.description}
                            </p>
                          )}

                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="text-xs">
                              {scopeLabels[rule.scope || "all_items"]}
                            </Badge>
                            {rule.priority !== null && rule.priority !== undefined && rule.priority > 0 && (
                              <Badge variant="outline" className="text-xs">
                                Priority: {rule.priority}
                              </Badge>
                            )}
                            {rule.stackable && (
                              <Badge variant="outline" className="text-xs bg-blue-50">
                                <Layers className="h-3 w-3 mr-0.5" /> Stackable
                              </Badge>
                            )}
                            {rule.channels && rule.channels.length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {rule.channels.join(", ")}
                              </Badge>
                            )}
                            {rule.minOrderAmount && Number(rule.minOrderAmount) > 0 && (
                              <Badge variant="outline" className="text-xs">
                                Min: {fmt(Number(rule.minOrderAmount))}
                              </Badge>
                            )}
                            {cond.loyaltyTier && (
                              <Badge variant="outline" className="text-xs bg-amber-50">
                                <Crown className="h-3 w-3 mr-0.5" /> {String(cond.loyaltyTier)}+
                              </Badge>
                            )}
                          </div>

                          {(cond.startHour !== undefined || (Array.isArray(cond.daysOfWeek) && (cond.daysOfWeek as number[]).length > 0)) && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {cond.startHour !== undefined && cond.endHour !== undefined && (
                                <span>{String(cond.startHour).padStart(2, "0")}:00–{String(cond.endHour).padStart(2, "0")}:00</span>
                              )}
                              {Array.isArray(cond.daysOfWeek) && (cond.daysOfWeek as number[]).length > 0 && (
                                <span>({(cond.daysOfWeek as number[]).map((d) => dayLabels[d]).join(", ")})</span>
                              )}
                            </div>
                          )}

                          {(rule.startDate || rule.endDate) && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {rule.startDate && <span>{new Date(rule.startDate).toLocaleDateString()}</span>}
                              {rule.startDate && rule.endDate && <span>–</span>}
                              {rule.endDate && <span>{new Date(rule.endDate).toLocaleDateString()}</span>}
                            </div>
                          )}

                          <Separator />

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={rule.active ?? false}
                                onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, active: checked })}
                                data-testid={`switch-rule-active-${rule.id}`}
                              />
                              <span className="text-xs text-muted-foreground">
                                {rule.active ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(rule)} data-testid={`button-edit-rule-${rule.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                onClick={() => { if (confirm("Delete this rule?")) deleteRule.mutate(rule.id); }}
                                data-testid={`button-delete-rule-${rule.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-rule">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Promotion Rule" : "Create Promotion Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="rule-name">Name</Label>
                <Input
                  id="rule-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Happy Hour 20% Off"
                  data-testid="input-rule-name"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="rule-desc">Description</Label>
                <Textarea
                  id="rule-desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What does this rule do?"
                  rows={2}
                  data-testid="input-rule-description"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Rule Type</Label>
                <Select value={form.ruleType} onValueChange={(v) => setForm({ ...form, ruleType: v })}>
                  <SelectTrigger data-testid="select-rule-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ruleTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Discount Type</Label>
                <Select value={form.discountType} onValueChange={(v) => setForm({ ...form, discountType: v })}>
                  <SelectTrigger data-testid="select-discount-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(discountTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rule-value">
                  {form.discountType === "percentage" ? "Percentage (%)" : "Amount"}
                </Label>
                <Input
                  id="rule-value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                  placeholder={form.discountType === "percentage" ? "e.g. 20" : "e.g. 5.00"}
                  data-testid="input-rule-value"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Scope</Label>
                <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
                  <SelectTrigger data-testid="select-rule-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(scopeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(form.scope === "category" || form.scope === "specific_items") && (
                <div>
                  <Label htmlFor="rule-scope-ref">Scope Reference</Label>
                  <Input
                    id="rule-scope-ref"
                    value={form.scopeRef}
                    onChange={(e) => setForm({ ...form, scopeRef: e.target.value })}
                    placeholder="Category name or item IDs"
                    data-testid="input-rule-scope-ref"
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="mb-2 block">Channels (leave empty for all)</Label>
              <div className="flex gap-2" data-testid="channel-toggles">
                {channelOptions.map((ch) => (
                  <Button
                    key={ch.value}
                    type="button"
                    size="sm"
                    variant={form.channels.includes(ch.value) ? "default" : "outline"}
                    onClick={() => toggleChannel(ch.value)}
                    data-testid={`button-channel-${ch.value}`}
                  >
                    {ch.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="rule-priority">Priority (higher = first)</Label>
                <Input
                  id="rule-priority"
                  type="number"
                  min="0"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  data-testid="input-rule-priority"
                />
              </div>
              <div>
                <Label htmlFor="rule-max-discount">Max Discount</Label>
                <Input
                  id="rule-max-discount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.maxDiscount}
                  onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                  placeholder="No limit"
                  data-testid="input-rule-max-discount"
                />
              </div>
              <div>
                <Label htmlFor="rule-min-order">Min Order Amount</Label>
                <Input
                  id="rule-min-order"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.minOrderAmount}
                  onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
                  placeholder="No minimum"
                  data-testid="input-rule-min-order"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.stackable}
                onCheckedChange={(checked) => setForm({ ...form, stackable: checked })}
                data-testid="switch-stackable"
              />
              <Label>Stackable (can combine with other rules)</Label>
            </div>

            <Separator />

            <div>
              <Label className="mb-2 block">Time Conditions (optional)</Label>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <Label htmlFor="rule-start-hour" className="text-xs">Start Hour (0-23)</Label>
                  <Input
                    id="rule-start-hour"
                    type="number"
                    min="0"
                    max="23"
                    value={form.startHour}
                    onChange={(e) => setForm({ ...form, startHour: e.target.value })}
                    placeholder="e.g. 16"
                    data-testid="input-start-hour"
                  />
                </div>
                <div>
                  <Label htmlFor="rule-end-hour" className="text-xs">End Hour (0-23)</Label>
                  <Input
                    id="rule-end-hour"
                    type="number"
                    min="0"
                    max="23"
                    value={form.endHour}
                    onChange={(e) => setForm({ ...form, endHour: e.target.value })}
                    placeholder="e.g. 19"
                    data-testid="input-end-hour"
                  />
                </div>
              </div>
              <div className="flex gap-1.5" data-testid="day-toggles">
                {dayLabels.map((label, idx) => (
                  <Button
                    key={idx}
                    type="button"
                    size="sm"
                    variant={form.daysOfWeek.includes(idx) ? "default" : "outline"}
                    className="w-10 h-8 text-xs"
                    onClick={() => toggleDay(idx)}
                    data-testid={`button-day-${idx}`}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {form.ruleType === "bogo" && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">BOGO Configuration</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="bogo-buy" className="text-xs">Buy Qty</Label>
                    <Input id="bogo-buy" type="number" min="1" value={form.buyQuantity} onChange={(e) => setForm({ ...form, buyQuantity: e.target.value })} data-testid="input-bogo-buy" />
                  </div>
                  <div>
                    <Label htmlFor="bogo-get" className="text-xs">Get Qty</Label>
                    <Input id="bogo-get" type="number" min="1" value={form.getQuantity} onChange={(e) => setForm({ ...form, getQuantity: e.target.value })} data-testid="input-bogo-get" />
                  </div>
                  <div>
                    <Label htmlFor="bogo-discount" className="text-xs">Discount %</Label>
                    <Input id="bogo-discount" type="number" min="0" max="100" value={form.getDiscountPercent} onChange={(e) => setForm({ ...form, getDiscountPercent: e.target.value })} data-testid="input-bogo-discount" />
                  </div>
                </div>
              </div>
            )}

            {form.ruleType === "free_item" && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Free Item Configuration</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="free-item-name" className="text-xs">Free Item Name</Label>
                    <Input id="free-item-name" value={form.freeItemName} onChange={(e) => setForm({ ...form, freeItemName: e.target.value })} placeholder="e.g. Complimentary Dessert" data-testid="input-free-item-name" />
                  </div>
                  <div>
                    <Label htmlFor="free-item-qty" className="text-xs">Quantity</Label>
                    <Input id="free-item-qty" type="number" min="1" value={form.freeQuantity} onChange={(e) => setForm({ ...form, freeQuantity: e.target.value })} data-testid="input-free-quantity" />
                  </div>
                </div>
              </div>
            )}

            {(form.ruleType === "loyalty_discount") && (
              <div>
                <Label>Minimum Loyalty Tier</Label>
                <Select value={form.loyaltyTier || "none"} onValueChange={(v) => setForm({ ...form, loyaltyTier: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="select-loyalty-tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Any Tier</SelectItem>
                    <SelectItem value="bronze">Bronze</SelectItem>
                    <SelectItem value="silver">Silver</SelectItem>
                    <SelectItem value="gold">Gold</SelectItem>
                    <SelectItem value="platinum">Platinum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="rule-outlet-ids">Outlet IDs (comma-separated)</Label>
                <Input id="rule-outlet-ids" value={form.outletIds} onChange={(e) => setForm({ ...form, outletIds: e.target.value })} placeholder="Leave empty for all outlets" data-testid="input-outlet-ids" />
              </div>
              <div>
                <Label htmlFor="rule-customer-segment">Customer Segment</Label>
                <Input id="rule-customer-segment" value={form.customerSegment} onChange={(e) => setForm({ ...form, customerSegment: e.target.value })} placeholder="e.g. vip, corporate" data-testid="input-customer-segment" />
              </div>
            </div>

            <div>
              <Label htmlFor="rule-exclusion-group">Mutual Exclusion Group</Label>
              <Input id="rule-exclusion-group" value={form.mutualExclusionGroup} onChange={(e) => setForm({ ...form, mutualExclusionGroup: e.target.value })} placeholder="Rules in the same group cannot stack" data-testid="input-exclusion-group" />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="rule-start-date">Start Date</Label>
                <Input
                  id="rule-start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  data-testid="input-rule-start-date"
                />
              </div>
              <div>
                <Label htmlFor="rule-end-date">End Date</Label>
                <Input
                  id="rule-end-date"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  data-testid="input-rule-end-date"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="rule-usage-limit">Usage Limit</Label>
                <Input
                  id="rule-usage-limit"
                  type="number"
                  min="0"
                  value={form.usageLimit}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                  placeholder="Unlimited"
                  data-testid="input-rule-usage-limit"
                />
              </div>
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.active}
                    onCheckedChange={(checked) => setForm({ ...form, active: checked })}
                    data-testid="switch-rule-active"
                  />
                  <Label>Active</Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-rule">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createRule.isPending || updateRule.isPending}
              data-testid="button-save-rule"
            >
              {editingRule ? "Update Rule" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
