import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Outlet } from "@shared/schema";
import { motion } from "framer-motion";
import {
  MapPin, Plus, Search, Edit, Trash2, Building2, Truck, Cloud, Store,
  Navigation, Globe, Clock, CheckCircle2, Banknote, DollarSign, Save, AlertCircle, Package, X,
  Settings, Wrench, Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { StatCard } from "@/components/widgets/stat-card";
import { currencyMap } from "@shared/currency";

const ROUNDING_OPTIONS = [
  { value: "none", label: "None" },
  { value: "1", label: "Round to nearest 1 unit" },
  { value: "5", label: "Round to nearest 5 paise" },
  { value: "25", label: "Round to nearest 25 fils" },
];

function CashCurrencySettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currencyOptions = Object.values(currencyMap);
  const [selectedCurrency, setSelectedCurrency] = useState(user?.tenant?.currency?.toUpperCase() || "USD");
  const [cashRounding, setCashRounding] = useState("1");
  const [currencyPosition, setCurrencyPosition] = useState(user?.tenant?.currencyPosition || "before");
  const [decimalPlaces, setDecimalPlaces] = useState(String(user?.tenant?.currencyDecimals ?? 2));

  const currencyInfo = currencyMap[selectedCurrency as keyof typeof currencyMap];
  const symbol = currencyInfo?.symbol || selectedCurrency;

  const DENOM_MAP: Record<string, { notes: number[]; coins: number[] }> = {
    INR: { notes: [2000, 500, 200, 100, 50, 20, 10], coins: [10, 5, 2, 1] },
    USD: { notes: [100, 50, 20, 10, 5, 1], coins: [0.25, 0.10, 0.05, 0.01] },
    AED: { notes: [1000, 500, 200, 100, 50, 20, 10, 5], coins: [1, 0.50, 0.25] },
    GBP: { notes: [50, 20, 10, 5], coins: [2, 1, 0.50, 0.20, 0.10, 0.05] },
    EUR: { notes: [500, 200, 100, 50, 20, 10, 5], coins: [2, 1, 0.50, 0.20, 0.10, 0.05] },
  };

  const denoms = DENOM_MAP[selectedCurrency] || { notes: [100, 50, 20, 10, 5, 1], coins: [1, 0.50, 0.25] };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/outlets/currency-settings`, {
        currencyCode: selectedCurrency,
        cashRounding,
        currencyPosition,
        decimalPlaces: parseInt(decimalPlaces) || 2,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Currency settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const previewAmount = currencyPosition === "before" ? `${symbol}1,500` : `1,500 ${symbol}`;

  return (
    <Card data-testid="card-cash-currency-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-5 w-5 text-emerald-600" />
          Cash & Currency Settings
        </CardTitle>
        <CardDescription>Configure how currency is displayed and how cash amounts are rounded</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Currency</Label>
            <Select value={selectedCurrency} onValueChange={setSelectedCurrency} data-testid="select-currency-code">
              <SelectTrigger className="mt-1" data-testid="select-currency-code">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map(c => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Currency Symbol (auto-filled)</Label>
            <Input value={symbol} readOnly className="mt-1 bg-muted" />
          </div>

          <div>
            <Label>Symbol Position</Label>
            <Select value={currencyPosition} onValueChange={setCurrencyPosition} data-testid="select-currency-position">
              <SelectTrigger className="mt-1" data-testid="select-currency-position">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="before">Before amount → {symbol}1,500</SelectItem>
                <SelectItem value="after">After amount → 1,500 {symbol}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Decimal Places</Label>
            <Input
              type="number"
              min="0"
              max="4"
              value={decimalPlaces}
              onChange={e => setDecimalPlaces(e.target.value)}
              className="mt-1"
              data-testid="input-decimal-places"
            />
          </div>

          <div>
            <Label>Cash Rounding</Label>
            <Select value={cashRounding} onValueChange={setCashRounding} data-testid="select-cash-rounding">
              <SelectTrigger className="mt-1" data-testid="select-cash-rounding">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROUNDING_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Preview</Label>
            <div className="mt-1 px-3 py-2 rounded-md border bg-muted text-sm font-medium" data-testid="text-denomination-preview">
              {previewAmount}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Denomination Preview</p>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <div className="flex flex-wrap gap-2">
                {denoms.notes.map(d => (
                  <Badge key={d} variant="outline" className="text-sm">
                    {symbol}{d}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Coins</p>
              <div className="flex flex-wrap gap-2">
                {denoms.coins.map(d => (
                  <Badge key={d} variant="secondary" className="text-sm">
                    {symbol}{d}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-currency"
        >
          {saveMutation.isPending ? "Saving..." : "Save Currency Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}

interface TipSettings {
  tipsEnabled: boolean;
  showOnPos: boolean;
  showOnQr: boolean;
  showOnReceipt: boolean;
  promptStyle: "BUTTONS" | "INPUT" | "NONE";
  suggestedPct1: number;
  suggestedPct2: number;
  suggestedPct3: number;
  allowCustom: boolean;
  tipBasis: "SUBTOTAL" | "TOTAL";
  distributionMethod: "INDIVIDUAL" | "POOL" | "SPLIT";
  waiterSharePct: number;
  kitchenSharePct: number;
}

function TipSettingsPanel({ outlet }: { outlet: Outlet }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const defaultSettings: TipSettings = {
    tipsEnabled: false,
    showOnPos: true,
    showOnQr: true,
    showOnReceipt: true,
    promptStyle: "BUTTONS",
    suggestedPct1: 5,
    suggestedPct2: 10,
    suggestedPct3: 15,
    allowCustom: true,
    tipBasis: "SUBTOTAL",
    distributionMethod: "INDIVIDUAL",
    waiterSharePct: 70,
    kitchenSharePct: 30,
  };

  const { data: settings, isLoading } = useQuery<TipSettings>({
    queryKey: ["/api/tips/settings", outlet.id],
    queryFn: async () => {
      const res = await fetch(`/api/tips/settings/${outlet.id}`, { credentials: "include" });
      if (!res.ok) return defaultSettings;
      return res.json();
    },
  });

  const [form, setForm] = useState<TipSettings>(defaultSettings);
  const [initialized, setInitialized] = useState(false);

  if (settings && !initialized) {
    setForm({ ...defaultSettings, ...settings });
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async (data: TipSettings) => {
      const res = await apiRequest("POST", `/api/tips/settings/${outlet.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tips/settings", outlet.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tips/config", outlet.id] });
      toast({ title: "Tip settings saved", description: "Settings updated successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function handleSave() {
    const pcts = [form.suggestedPct1, form.suggestedPct2, form.suggestedPct3];
    const uniq = new Set(pcts);
    if (form.distributionMethod === "SPLIT") {
      const kitchen = 100 - form.waiterSharePct;
      setForm(f => ({ ...f, kitchenSharePct: kitchen }));
    }
    saveMutation.mutate({ ...form, kitchenSharePct: form.distributionMethod === "SPLIT" ? 100 - form.waiterSharePct : form.kitchenSharePct });
  }

  if (isLoading) {
    return <div className="py-6 text-center text-muted-foreground text-sm">Loading tip settings...</div>;
  }

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <DollarSign className="h-5 w-5 text-amber-600 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-sm">Enable Tips for {outlet.name}</p>
          <p className="text-xs text-muted-foreground">Master switch — when off, no tip prompts will appear anywhere</p>
        </div>
        <Switch
          checked={form.tipsEnabled}
          onCheckedChange={v => setForm(f => ({ ...f, tipsEnabled: v }))}
          data-testid="toggle-tips-enabled"
        />
      </div>

      {form.tipsEnabled && (
        <>
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Show Tip Option On</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <Label>POS Payment Screen</Label>
                <Switch checked={form.showOnPos} onCheckedChange={v => setForm(f => ({ ...f, showOnPos: v }))} data-testid="toggle-show-on-pos" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <Label>QR Customer Payment</Label>
                <Switch checked={form.showOnQr} onCheckedChange={v => setForm(f => ({ ...f, showOnQr: v }))} data-testid="toggle-show-on-qr" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <Label>Print on Receipt</Label>
                <Switch checked={form.showOnReceipt} onCheckedChange={v => setForm(f => ({ ...f, showOnReceipt: v }))} data-testid="toggle-show-on-receipt" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tip Prompt Style</p>
            <div className="space-y-2">
              {(["BUTTONS", "INPUT", "NONE"] as const).map(style => (
                <label key={style} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 bg-card">
                  <input
                    type="radio"
                    name="promptStyle"
                    value={style}
                    checked={form.promptStyle === style}
                    onChange={() => setForm(f => ({ ...f, promptStyle: style }))}
                    data-testid={`radio-prompt-style-${style}`}
                  />
                  <span className="text-sm">
                    {style === "BUTTONS" ? "Quick % Buttons (recommended)" : style === "INPUT" ? "Amount input only" : "No prompt (manual entry)"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {form.promptStyle === "BUTTONS" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Suggested Percentages</p>
              <div className="grid grid-cols-3 gap-3">
                {([1, 2, 3] as const).map(n => (
                  <div key={n} className="space-y-1">
                    <Label className="text-xs">Button {n}</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={form[`suggestedPct${n}` as keyof TipSettings] as number}
                        onChange={e => setForm(f => ({ ...f, [`suggestedPct${n}`]: parseInt(e.target.value) || 0 }))}
                        className="text-sm"
                        data-testid={`input-suggested-pct-${n}`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <Label>Allow custom amount</Label>
                <Switch checked={form.allowCustom} onCheckedChange={v => setForm(f => ({ ...f, allowCustom: v }))} data-testid="toggle-allow-custom" />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tip Calculated On</p>
            <div className="space-y-2">
              {(["SUBTOTAL", "TOTAL"] as const).map(basis => (
                <label key={basis} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 bg-card">
                  <input
                    type="radio"
                    name="tipBasis"
                    value={basis}
                    checked={form.tipBasis === basis}
                    onChange={() => setForm(f => ({ ...f, tipBasis: basis }))}
                    data-testid={`radio-tip-basis-${basis}`}
                  />
                  <span className="text-sm">
                    {basis === "SUBTOTAL" ? "Subtotal (before tax)" : "Final total (including tax)"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tip Distribution</p>
            <div className="space-y-2">
              {(["INDIVIDUAL", "POOL", "SPLIT"] as const).map(method => (
                <label key={method} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 bg-card">
                  <input
                    type="radio"
                    name="distributionMethod"
                    value={method}
                    checked={form.distributionMethod === method}
                    onChange={() => setForm(f => ({ ...f, distributionMethod: method }))}
                    data-testid={`radio-distribution-${method}`}
                  />
                  <span className="text-sm">
                    {method === "INDIVIDUAL" ? "Individual — goes to serving waiter" : method === "POOL" ? "Pool — shared equally among all staff" : "Split — % to waiter + % to kitchen"}
                  </span>
                </label>
              ))}
            </div>

            {form.distributionMethod === "SPLIT" && (
              <div className="grid grid-cols-2 gap-3 pl-4 border-l-2 border-amber-300">
                <div className="space-y-1">
                  <Label className="text-xs">Waiter share (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.waiterSharePct}
                    onChange={e => {
                      const v = parseInt(e.target.value) || 0;
                      setForm(f => ({ ...f, waiterSharePct: v, kitchenSharePct: 100 - v }));
                    }}
                    data-testid="input-waiter-share-pct"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kitchen share (%) — auto</Label>
                  <Input
                    type="number"
                    value={100 - form.waiterSharePct}
                    readOnly
                    className="bg-muted"
                    data-testid="input-kitchen-share-pct"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full" data-testid="button-save-tip-settings">
        <Save className="h-4 w-4 mr-2" />
        {saveMutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}

const CHARGE_TYPES = [
  { value: "FIXED_PER_ORDER", label: "Fixed amount per order" },
  { value: "FIXED_PER_ITEM", label: "Fixed amount per item" },
  { value: "PERCENTAGE", label: "Percentage of subtotal" },
  { value: "PER_CATEGORY", label: "Per food category" },
];

function PackingChargeSettings({ outlets }: { outlets: Outlet[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOwner = user?.role === "owner";

  const [selectedOutletId, setSelectedOutletId] = useState<string>(outlets[0]?.id || "");
  const currencyInfo = currencyMap[(user?.tenant?.currency?.toUpperCase() || "USD") as keyof typeof currencyMap];
  const symbol = currencyInfo?.symbol || "$";

  const [form, setForm] = useState({
    takeawayChargeEnabled: false,
    deliveryChargeEnabled: false,
    chargeType: "FIXED_PER_ORDER",
    takeawayChargeAmount: "0",
    deliveryChargeAmount: "0",
    takeawayPerItem: "0",
    deliveryPerItem: "0",
    maxChargePerOrder: "",
    chargeLabel: "Packing Charge",
    packingChargeTaxable: false,
    packingChargeTaxPct: "0",
    showOnReceipt: true,
  });

  const { data: settingsData, isLoading: settingsLoading } = useQuery<any>({
    queryKey: ["/api/packing/settings", selectedOutletId],
    queryFn: async () => {
      if (!selectedOutletId) return null;
      const res = await apiRequest("GET", `/api/packing/settings/${selectedOutletId}`);
      return res.json();
    },
    enabled: !!selectedOutletId,
  });

  useEffect(() => {
    if (settingsData) {
      setForm({
        takeawayChargeEnabled: settingsData.takeawayChargeEnabled ?? false,
        deliveryChargeEnabled: settingsData.deliveryChargeEnabled ?? false,
        chargeType: settingsData.chargeType || "FIXED_PER_ORDER",
        takeawayChargeAmount: String(settingsData.takeawayChargeAmount ?? 0),
        deliveryChargeAmount: String(settingsData.deliveryChargeAmount ?? 0),
        takeawayPerItem: String(settingsData.takeawayPerItem ?? 0),
        deliveryPerItem: String(settingsData.deliveryPerItem ?? 0),
        maxChargePerOrder: settingsData.maxChargePerOrder != null ? String(settingsData.maxChargePerOrder) : "",
        chargeLabel: settingsData.chargeLabel || "Packing Charge",
        packingChargeTaxable: settingsData.packingChargeTaxable ?? false,
        packingChargeTaxPct: String(settingsData.packingChargeTaxPct ?? 0),
        showOnReceipt: settingsData.showOnReceipt !== false,
      });
    }
  }, [settingsData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/packing/settings/${selectedOutletId}`, {
        ...form,
        takeawayChargeAmount: parseFloat(form.takeawayChargeAmount) || 0,
        deliveryChargeAmount: parseFloat(form.deliveryChargeAmount) || 0,
        takeawayPerItem: parseFloat(form.takeawayPerItem) || 0,
        deliveryPerItem: parseFloat(form.deliveryPerItem) || 0,
        maxChargePerOrder: form.maxChargePerOrder !== "" ? parseFloat(form.maxChargePerOrder) : null,
        packingChargeTaxPct: parseFloat(form.packingChargeTaxPct) || 0,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Packing settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/packing/settings", selectedOutletId] });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const { data: categories = [], refetch: refetchCategories } = useQuery<any[]>({
    queryKey: ["/api/packing/categories", selectedOutletId],
    queryFn: async () => {
      if (!selectedOutletId) return [];
      const res = await apiRequest("GET", `/api/packing/categories/${selectedOutletId}`);
      return res.json();
    },
    enabled: !!selectedOutletId && form.chargeType === "PER_CATEGORY",
  });

  const [newCat, setNewCat] = useState({ categoryName: "", takeawayCharge: "", deliveryCharge: "" });
  const [addingCat, setAddingCat] = useState(false);

  const addCatMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/packing/categories/${selectedOutletId}`, {
        categoryName: newCat.categoryName,
        takeawayCharge: parseFloat(newCat.takeawayCharge) || 0,
        deliveryCharge: parseFloat(newCat.deliveryCharge) || 0,
      });
      return res.json();
    },
    onSuccess: () => {
      refetchCategories();
      setNewCat({ categoryName: "", takeawayCharge: "", deliveryCharge: "" });
      setAddingCat(false);
      toast({ title: "Category added" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteCatMutation = useMutation({
    mutationFn: async (catId: string) => {
      await apiRequest("DELETE", `/api/packing/categories/${selectedOutletId}/${catId}`);
    },
    onSuccess: () => { refetchCategories(); toast({ title: "Category deleted" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: exemptions = [], refetch: refetchExemptions } = useQuery<any[]>({
    queryKey: ["/api/packing/exemptions", selectedOutletId],
    queryFn: async () => {
      if (!selectedOutletId) return [];
      const res = await apiRequest("GET", `/api/packing/exemptions/${selectedOutletId}`);
      return res.json();
    },
    enabled: !!selectedOutletId,
  });

  const { data: menuItems = [] } = useQuery<any[]>({ queryKey: ["/api/menu-items"] });
  const { data: menuCategories = [] } = useQuery<any[]>({ queryKey: ["/api/menu-categories"] });

  const [showItemExemptPicker, setShowItemExemptPicker] = useState(false);
  const [showCatExemptPicker, setShowCatExemptPicker] = useState(false);

  const addExemptionMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", `/api/packing/exemptions/${selectedOutletId}`, payload);
      return res.json();
    },
    onSuccess: () => { refetchExemptions(); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteExemptionMutation = useMutation({
    mutationFn: async (exId: string) => {
      await apiRequest("DELETE", `/api/packing/exemptions/${selectedOutletId}/${exId}`);
    },
    onSuccess: () => refetchExemptions(),
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const anyEnabled = form.takeawayChargeEnabled || form.deliveryChargeEnabled;

  return (
    <Card data-testid="tab-packing-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5 text-amber-600" />
          Packing Charge Settings
        </CardTitle>
        <CardDescription>Configure packing charges for takeaway and delivery orders</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {outlets.length > 1 && (
          <div>
            <Label>Select Outlet</Label>
            <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
              <SelectTrigger className="mt-1 w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Enable Packing Charge</p>
          <div className="flex items-center gap-3">
            <Switch
              id="takeaway-toggle"
              checked={form.takeawayChargeEnabled}
              onCheckedChange={(v) => setForm(f => ({ ...f, takeawayChargeEnabled: v }))}
              disabled={!isOwner}
              data-testid="toggle-takeaway-charge-enabled"
            />
            <Label htmlFor="takeaway-toggle">Takeaway orders</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="delivery-toggle"
              checked={form.deliveryChargeEnabled}
              onCheckedChange={(v) => setForm(f => ({ ...f, deliveryChargeEnabled: v }))}
              disabled={!isOwner}
              data-testid="toggle-delivery-charge-enabled"
            />
            <Label htmlFor="delivery-toggle">Delivery orders</Label>
          </div>
        </div>

        {anyEnabled && (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Charge Type</p>
              <RadioGroup
                value={form.chargeType}
                onValueChange={(v) => setForm(f => ({ ...f, chargeType: v }))}
                disabled={!isOwner}
                className="space-y-2"
              >
                {CHARGE_TYPES.map(ct => (
                  <div key={ct.value} className="flex items-center gap-2">
                    <RadioGroupItem value={ct.value} id={`ct-${ct.value}`} data-testid={`radio-charge-type-${ct.value}`} />
                    <Label htmlFor={`ct-${ct.value}`}>{ct.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {form.chargeType === "FIXED_PER_ORDER" && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Rates (per order)</p>
                  {form.takeawayChargeEnabled && (
                    <div className="flex items-center gap-2">
                      <Label className="w-24 shrink-0">Takeaway</Label>
                      <span className="text-muted-foreground text-sm">{symbol}</span>
                      <Input
                        type="number" min="0" step="0.5"
                        value={form.takeawayChargeAmount}
                        onChange={(e) => setForm(f => ({ ...f, takeawayChargeAmount: e.target.value }))}
                        className="w-28"
                        disabled={!isOwner}
                        data-testid="input-takeaway-charge"
                      />
                    </div>
                  )}
                  {form.deliveryChargeEnabled && (
                    <div className="flex items-center gap-2">
                      <Label className="w-24 shrink-0">Delivery</Label>
                      <span className="text-muted-foreground text-sm">{symbol}</span>
                      <Input
                        type="number" min="0" step="0.5"
                        value={form.deliveryChargeAmount}
                        onChange={(e) => setForm(f => ({ ...f, deliveryChargeAmount: e.target.value }))}
                        className="w-28"
                        disabled={!isOwner}
                        data-testid="input-delivery-charge"
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {form.chargeType === "FIXED_PER_ITEM" && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Rates (per item)</p>
                  {form.takeawayChargeEnabled && (
                    <div className="flex items-center gap-2">
                      <Label className="w-24 shrink-0">Takeaway</Label>
                      <span className="text-muted-foreground text-sm">{symbol}</span>
                      <Input
                        type="number" min="0" step="0.5"
                        value={form.takeawayPerItem}
                        onChange={(e) => setForm(f => ({ ...f, takeawayPerItem: e.target.value }))}
                        className="w-28"
                        disabled={!isOwner}
                        data-testid="input-takeaway-per-item"
                      />
                      <span className="text-muted-foreground text-xs">per item</span>
                    </div>
                  )}
                  {form.deliveryChargeEnabled && (
                    <div className="flex items-center gap-2">
                      <Label className="w-24 shrink-0">Delivery</Label>
                      <span className="text-muted-foreground text-sm">{symbol}</span>
                      <Input
                        type="number" min="0" step="0.5"
                        value={form.deliveryPerItem}
                        onChange={(e) => setForm(f => ({ ...f, deliveryPerItem: e.target.value }))}
                        className="w-28"
                        disabled={!isOwner}
                        data-testid="input-delivery-per-item"
                      />
                      <span className="text-muted-foreground text-xs">per item</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {form.chargeType === "PERCENTAGE" && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Rates (% of subtotal)</p>
                  {form.takeawayChargeEnabled && (
                    <div className="flex items-center gap-2">
                      <Label className="w-24 shrink-0">Takeaway</Label>
                      <Input
                        type="number" min="0" step="0.5"
                        value={form.takeawayChargeAmount}
                        onChange={(e) => setForm(f => ({ ...f, takeawayChargeAmount: e.target.value }))}
                        className="w-24"
                        disabled={!isOwner}
                        data-testid="input-takeaway-charge"
                      />
                      <span className="text-muted-foreground text-sm">% of subtotal</span>
                    </div>
                  )}
                  {form.deliveryChargeEnabled && (
                    <div className="flex items-center gap-2">
                      <Label className="w-24 shrink-0">Delivery</Label>
                      <Input
                        type="number" min="0" step="0.5"
                        value={form.deliveryChargeAmount}
                        onChange={(e) => setForm(f => ({ ...f, deliveryChargeAmount: e.target.value }))}
                        className="w-24"
                        disabled={!isOwner}
                        data-testid="input-delivery-charge"
                      />
                      <span className="text-muted-foreground text-sm">% of subtotal</span>
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator />
            <div className="flex items-center gap-2">
              <Label className="w-40 shrink-0">Maximum cap</Label>
              <span className="text-muted-foreground text-sm">{symbol}</span>
              <Input
                type="number" min="0" step="1"
                value={form.maxChargePerOrder}
                onChange={(e) => setForm(f => ({ ...f, maxChargePerOrder: e.target.value }))}
                placeholder="No cap"
                className="w-28"
                disabled={!isOwner}
                data-testid="input-max-charge"
              />
              <span className="text-muted-foreground text-xs">(blank = no cap)</span>
            </div>

            <Separator />
            <div className="space-y-2">
              <Label>Charge label on receipt</Label>
              <Input
                value={form.chargeLabel}
                onChange={(e) => setForm(f => ({ ...f, chargeLabel: e.target.value }))}
                className="max-w-xs"
                disabled={!isOwner}
                data-testid="input-charge-label"
              />
            </div>

            <Separator />
            <div className="space-y-3">
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Tax on Packing Charge</p>
              <div className="flex items-center gap-3">
                <Switch
                  id="taxable-toggle"
                  checked={form.packingChargeTaxable}
                  onCheckedChange={(v) => setForm(f => ({ ...f, packingChargeTaxable: v }))}
                  disabled={!isOwner}
                  data-testid="toggle-packing-taxable"
                />
                <Label htmlFor="taxable-toggle">Is packing charge taxable?</Label>
              </div>
              {form.packingChargeTaxable && (
                <div className="flex items-center gap-2">
                  <Label className="w-16 shrink-0">Tax %</Label>
                  <Input
                    type="number" min="0" step="0.5"
                    value={form.packingChargeTaxPct}
                    onChange={(e) => setForm(f => ({ ...f, packingChargeTaxPct: e.target.value }))}
                    className="w-24"
                    disabled={!isOwner}
                    data-testid="input-packing-tax-pct"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="show-receipt-toggle"
                checked={form.showOnReceipt}
                onCheckedChange={(v) => setForm(f => ({ ...f, showOnReceipt: v }))}
                disabled={!isOwner}
                data-testid="toggle-show-on-receipt"
              />
              <Label htmlFor="show-receipt-toggle">Show on receipt</Label>
            </div>

            {isOwner && (
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !selectedOutletId}
                data-testid="button-save-packing-settings"
              >
                {saveMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            )}

            {form.chargeType === "PER_CATEGORY" && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Per Category Rates</p>
                    {isOwner && (
                      <Button size="sm" variant="outline" onClick={() => setAddingCat(true)} data-testid="button-add-category">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Category
                      </Button>
                    )}
                  </div>
                  <div className="rounded-lg border overflow-hidden" data-testid="table-packing-categories">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Category Name</th>
                          <th className="text-right px-3 py-2 font-medium">Takeaway</th>
                          <th className="text-right px-3 py-2 font-medium">Delivery</th>
                          {isOwner && <th className="px-3 py-2" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {categories.map((cat: any) => (
                          <tr key={cat.id} data-testid={`row-category-${cat.id}`}>
                            <td className="px-3 py-2">{cat.categoryName}</td>
                            <td className="px-3 py-2 text-right">{symbol}{cat.takeawayCharge}</td>
                            <td className="px-3 py-2 text-right">{symbol}{cat.deliveryCharge}</td>
                            {isOwner && (
                              <td className="px-3 py-2 text-right">
                                <Button
                                  size="icon" variant="ghost"
                                  className="h-7 w-7 text-red-500"
                                  onClick={() => { if (confirm("Delete this category rate?")) deleteCatMutation.mutate(cat.id); }}
                                  data-testid={`button-delete-category-${cat.id}`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                        {categories.length === 0 && !addingCat && (
                          <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground text-xs">No category rates added yet</td></tr>
                        )}
                        {addingCat && (
                          <tr>
                            <td className="px-3 py-2">
                              <Input
                                value={newCat.categoryName}
                                onChange={(e) => setNewCat(c => ({ ...c, categoryName: e.target.value }))}
                                placeholder="Category name"
                                className="h-7 text-xs"
                                data-testid="input-category-name-new"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number" min="0" step="0.5"
                                value={newCat.takeawayCharge}
                                onChange={(e) => setNewCat(c => ({ ...c, takeawayCharge: e.target.value }))}
                                placeholder="0"
                                className="h-7 text-xs text-right"
                                data-testid="input-category-takeaway-new"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number" min="0" step="0.5"
                                value={newCat.deliveryCharge}
                                onChange={(e) => setNewCat(c => ({ ...c, deliveryCharge: e.target.value }))}
                                placeholder="0"
                                className="h-7 text-xs text-right"
                                data-testid="input-category-delivery-new"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" className="h-7 text-xs" onClick={() => addCatMutation.mutate()} data-testid="button-save-category">Save</Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingCat(false)}>Cancel</Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            <Separator />
            <div className="space-y-3" data-testid="list-packing-exemptions">
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Exemptions</p>
              <p className="text-xs text-muted-foreground">Items or categories exempt from packing charge</p>
              {exemptions.length > 0 && (
                <div className="space-y-2">
                  {exemptions.filter((e: any) => e.exemptionType === "MENU_ITEM").length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-1">Exempted items:</p>
                      <div className="flex flex-wrap gap-2">
                        {exemptions.filter((e: any) => e.exemptionType === "MENU_ITEM").map((e: any) => (
                          <Badge key={e.id} variant="secondary" className="gap-1" data-testid={`tag-exemption-${e.id}`}>
                            {e.referenceName}
                            {isOwner && (
                              <button onClick={() => deleteExemptionMutation.mutate(e.id)} className="ml-1 hover:text-red-500" data-testid={`button-remove-exemption-${e.id}`}>
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {exemptions.filter((e: any) => e.exemptionType === "CATEGORY").length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-1">Exempted categories:</p>
                      <div className="flex flex-wrap gap-2">
                        {exemptions.filter((e: any) => e.exemptionType === "CATEGORY").map((e: any) => (
                          <Badge key={e.id} variant="secondary" className="gap-1 bg-purple-100 text-purple-800" data-testid={`tag-exemption-${e.id}`}>
                            {e.referenceName}
                            {isOwner && (
                              <button onClick={() => deleteExemptionMutation.mutate(e.id)} className="ml-1 hover:text-red-500" data-testid={`button-remove-exemption-${e.id}`}>
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {isOwner && (
                <div className="flex gap-2 flex-wrap">
                  <div className="relative">
                    <Button size="sm" variant="outline" onClick={() => { setShowItemExemptPicker(v => !v); setShowCatExemptPicker(false); }} data-testid="button-add-item-exemption">
                      + Add Item Exemption
                    </Button>
                    {showItemExemptPicker && (
                      <div className="absolute top-full left-0 mt-1 z-50 bg-background border rounded-lg shadow-lg p-2 w-64 max-h-48 overflow-y-auto">
                        {menuItems.map((item: any) => (
                          <button
                            key={item.id}
                            className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded"
                            onClick={() => {
                              addExemptionMutation.mutate({ exemptionType: "MENU_ITEM", referenceId: item.id, referenceName: item.name });
                              setShowItemExemptPicker(false);
                            }}
                          >
                            {item.name}
                          </button>
                        ))}
                        {menuItems.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No items found</p>}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <Button size="sm" variant="outline" onClick={() => { setShowCatExemptPicker(v => !v); setShowItemExemptPicker(false); }} data-testid="button-add-category-exemption">
                      + Add Category Exemption
                    </Button>
                    {showCatExemptPicker && (
                      <div className="absolute top-full left-0 mt-1 z-50 bg-background border rounded-lg shadow-lg p-2 w-64 max-h-48 overflow-y-auto">
                        {menuCategories.map((cat: any) => (
                          <button
                            key={cat.id}
                            className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded"
                            onClick={() => {
                              addExemptionMutation.mutate({ exemptionType: "CATEGORY", referenceId: cat.id, referenceName: cat.name });
                              setShowCatExemptPicker(false);
                            }}
                          >
                            {cat.name}
                          </button>
                        ))}
                        {menuCategories.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No categories found</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {!anyEnabled && isOwner && (
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !selectedOutletId}
            data-testid="button-save-packing-settings"
          >
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

const RESOURCE_CODES = [
  { code: "HIGH_CHAIR", label: "High Chair", icon: "🪑" },
  { code: "BOOSTER_SEAT", label: "Booster Seat", icon: "🪑" },
  { code: "BABY_COT", label: "Baby Cot", icon: "🛏️" },
  { code: "WHEELCHAIR", label: "Wheelchair", icon: "♿" },
  { code: "PRAYER_MAT", label: "Prayer Mat", icon: "🕌" },
  { code: "WALKING_FRAME", label: "Walking Frame", icon: "🦯" },
  { code: "CUSTOM", label: "Custom", icon: "🪑" },
];

const UNIT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  available: { label: "Available", color: "bg-green-100 text-green-700 border-green-200" },
  in_use: { label: "In Use", color: "bg-blue-100 text-blue-700 border-blue-200" },
  cleaning: { label: "Cleaning", color: "bg-amber-100 text-amber-700 border-amber-200" },
  damaged: { label: "Damaged", color: "bg-red-100 text-red-700 border-red-200" },
};

interface SpecialResource {
  id: string;
  resourceCode: string;
  resourceName: string;
  resourceIcon: string;
  totalUnits: number;
  availableUnits: number;
  isTrackable: boolean;
  requiresSetupTime: number | null;
  notes: string | null;
  isActive: boolean;
}

interface ResourceUnit {
  id: string;
  unitCode: string;
  unitName: string;
  status: string;
  lastCleanedAt: string | null;
}

function SpecialResourceSettings({ outlets }: { outlets: Outlet[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOutletId, setSelectedOutletId] = useState<string>(outlets[0]?.id || "");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showUnitsDialog, setShowUnitsDialog] = useState(false);
  const [editingResource, setEditingResource] = useState<SpecialResource | null>(null);
  const [managingResource, setManagingResource] = useState<SpecialResource | null>(null);
  const [resourceForm, setResourceForm] = useState({
    resourceCode: "HIGH_CHAIR",
    resourceName: "High Chair",
    resourceIcon: "🪑",
    totalUnits: "2",
    isTrackable: true,
    requiresSetupTime: "0",
    notes: "",
  });

  const { data: resources = [], isLoading } = useQuery<SpecialResource[]>({
    queryKey: ["/api/resources", selectedOutletId],
    queryFn: async () => {
      if (!selectedOutletId) return [];
      const res = await fetch(`/api/resources?outletId=${selectedOutletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedOutletId,
  });

  const { data: units = [] } = useQuery<ResourceUnit[]>({
    queryKey: ["/api/resources", managingResource?.id, "units"],
    queryFn: async () => {
      if (!managingResource) return [];
      const res = await fetch(`/api/resources/${managingResource.id}/units`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!managingResource && showUnitsDialog,
  });

  const createMut = useMutation({
    mutationFn: async (data: typeof resourceForm) => {
      const res = await apiRequest("POST", "/api/resources", {
        outletId: selectedOutletId,
        resourceCode: data.resourceCode,
        resourceName: data.resourceName,
        resourceIcon: data.resourceIcon,
        totalUnits: parseInt(data.totalUnits) || 0,
        isTrackable: data.isTrackable,
        requiresSetupTime: parseInt(data.requiresSetupTime) || 0,
        notes: data.notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources", selectedOutletId] });
      setShowAddDialog(false);
      resetForm();
      toast({ title: "Resource created" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof resourceForm }) => {
      const res = await apiRequest("PATCH", `/api/resources/${id}`, {
        resourceCode: data.resourceCode,
        resourceName: data.resourceName,
        resourceIcon: data.resourceIcon,
        totalUnits: parseInt(data.totalUnits) || 0,
        isTrackable: data.isTrackable,
        requiresSetupTime: parseInt(data.requiresSetupTime) || 0,
        notes: data.notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources", selectedOutletId] });
      setShowEditDialog(false);
      toast({ title: "Resource updated" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/resources/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources", selectedOutletId] });
      toast({ title: "Resource removed" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateUnitMut = useMutation({
    mutationFn: async ({ unitId, status }: { unitId: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/resources/units/${unitId}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources", managingResource?.id, "units"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources", selectedOutletId] });
      toast({ title: "Unit status updated" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const addUnitMut = useMutation({
    mutationFn: async () => {
      if (!managingResource) return;
      const prefix = managingResource.resourceCode.split(/[_\s]+/).map((w: string) => w[0] ?? "").join("").toUpperCase().slice(0, 3) || managingResource.resourceCode.slice(0, 2).toUpperCase();
      const nextNum = units.length + 1;
      const unitCode = `${prefix}-${String(nextNum).padStart(2, "0")}`;
      const unitName = `${managingResource.resourceName} ${nextNum}`;
      const res = await apiRequest("POST", `/api/resources/${managingResource.id}/units`, { unitCode, unitName });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources", managingResource?.id, "units"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources", selectedOutletId] });
      toast({ title: "Unit added" });
    },
    onError: (e: Error) => toast({ title: "Failed to add unit", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setResourceForm({ resourceCode: "HIGH_CHAIR", resourceName: "High Chair", resourceIcon: "🪑", totalUnits: "2", isTrackable: true, requiresSetupTime: "0", notes: "" });
  }

  function openEditDialog(resource: SpecialResource) {
    setEditingResource(resource);
    setResourceForm({
      resourceCode: resource.resourceCode,
      resourceName: resource.resourceName,
      resourceIcon: resource.resourceIcon,
      totalUnits: String(resource.totalUnits),
      isTrackable: resource.isTrackable,
      requiresSetupTime: String(resource.requiresSetupTime || 0),
      notes: resource.notes || "",
    });
    setShowEditDialog(true);
  }

  function openUnitsDialog(resource: SpecialResource) {
    setManagingResource(resource);
    setShowUnitsDialog(true);
  }

  function handleCodeChange(code: string) {
    const found = RESOURCE_CODES.find(r => r.code === code);
    setResourceForm(f => ({ ...f, resourceCode: code, resourceName: found?.label || f.resourceName, resourceIcon: found?.icon || f.resourceIcon }));
  }

  if (user?.role !== "owner") return null;
  if (outlets.length === 0) return null;

  return (
    <Card data-testid="section-special-resources">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="text-lg">🪑</span>
              Special Resources
            </CardTitle>
            <CardDescription>Manage high chairs, baby cots, wheelchairs, and other special equipment</CardDescription>
          </div>
          <Button size="sm" onClick={() => { resetForm(); setShowAddDialog(true); }} data-testid="button-add-resource">
            <Plus className="h-4 w-4 mr-1.5" />Add Resource
          </Button>
        </div>
        {outlets.length > 1 && (
          <div className="mt-3">
            <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select outlet" />
              </SelectTrigger>
              <SelectContent>
                {outlets.map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading resources...</p>
        ) : resources.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <span className="text-4xl block mb-3">🪑</span>
            <p className="text-sm">No special resources configured yet.</p>
            <p className="text-xs mt-1">Add high chairs, baby cots, or other equipment.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Icon</th>
                  <th className="text-left py-2 pr-4">Name</th>
                  <th className="text-center py-2 pr-4">Total</th>
                  <th className="text-center py-2 pr-4">Available</th>
                  <th className="text-center py-2 pr-4">In Use</th>
                  <th className="text-right py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {resources.map(resource => (
                  <tr key={resource.id} className="border-b last:border-0 hover:bg-muted/20" data-testid={`row-resource-${resource.id}`}>
                    <td className="py-3 pr-4 text-xl">{resource.resourceIcon}</td>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{resource.resourceName}</div>
                      <div className="text-xs text-muted-foreground">{resource.resourceCode}</div>
                      {!resource.isTrackable && <div className="text-xs text-muted-foreground italic">Unlimited / Not tracked</div>}
                    </td>
                    <td className="py-3 pr-4 text-center font-medium">{resource.isTrackable ? resource.totalUnits : "∞"}</td>
                    <td className="py-3 pr-4 text-center">
                      {resource.isTrackable ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{resource.availableUnits}</Badge>
                      ) : "—"}
                    </td>
                    <td className="py-3 pr-4 text-center">
                      {resource.isTrackable ? (resource.totalUnits - resource.availableUnits) : "—"}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {resource.isTrackable && (
                          <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => openUnitsDialog(resource)} data-testid="button-manage-units">
                            <Wrench className="h-3 w-3 mr-1" />Units
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => openEditDialog(resource)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-destructive hover:text-destructive" onClick={() => { if (confirm("Remove this resource?")) deleteMut.mutate(resource.id); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Add Resource Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-add-resource">
          <DialogHeader>
            <DialogTitle>Add Special Resource</DialogTitle>
            <DialogDescription>Configure a new special resource for this outlet</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Resource Type</Label>
              <Select value={resourceForm.resourceCode} onValueChange={handleCodeChange} data-testid="select-resource-code">
                <SelectTrigger className="mt-1" data-testid="select-resource-code">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_CODES.map(r => (
                    <SelectItem key={r.code} value={r.code}>{r.icon} {r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Display Name</Label>
                <Input className="mt-1" value={resourceForm.resourceName} onChange={e => setResourceForm(f => ({ ...f, resourceName: e.target.value }))} data-testid="input-resource-name" />
              </div>
              <div>
                <Label>Icon (emoji)</Label>
                <Input className="mt-1" value={resourceForm.resourceIcon} onChange={e => setResourceForm(f => ({ ...f, resourceIcon: e.target.value }))} maxLength={4} placeholder="🪑" />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">Trackable</p>
                <p className="text-xs text-muted-foreground">Track individual units (off = unlimited like ramp)</p>
              </div>
              <Switch checked={resourceForm.isTrackable} onCheckedChange={v => setResourceForm(f => ({ ...f, isTrackable: v }))} />
            </div>
            {resourceForm.isTrackable && (
              <div>
                <Label>Total Units</Label>
                <Input className="mt-1" type="number" min="0" value={resourceForm.totalUnits} onChange={e => setResourceForm(f => ({ ...f, totalUnits: e.target.value }))} data-testid="input-resource-units" />
              </div>
            )}
            <div>
              <Label>Setup Time (minutes)</Label>
              <Input className="mt-1" type="number" min="0" value={resourceForm.requiresSetupTime} onChange={e => setResourceForm(f => ({ ...f, requiresSetupTime: e.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1" value={resourceForm.notes} onChange={e => setResourceForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate(resourceForm)} disabled={!resourceForm.resourceName || createMut.isPending} data-testid="button-save-resource">
              {createMut.isPending ? "Saving..." : "Add Resource"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Resource Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Resource</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Resource Type</Label>
              <Select value={resourceForm.resourceCode} onValueChange={handleCodeChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_CODES.map(r => (
                    <SelectItem key={r.code} value={r.code}>{r.icon} {r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Display Name</Label>
                <Input className="mt-1" value={resourceForm.resourceName} onChange={e => setResourceForm(f => ({ ...f, resourceName: e.target.value }))} />
              </div>
              <div>
                <Label>Icon (emoji)</Label>
                <Input className="mt-1" value={resourceForm.resourceIcon} onChange={e => setResourceForm(f => ({ ...f, resourceIcon: e.target.value }))} maxLength={4} />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">Trackable</p>
                <p className="text-xs text-muted-foreground">Track individual units</p>
              </div>
              <Switch checked={resourceForm.isTrackable} onCheckedChange={v => setResourceForm(f => ({ ...f, isTrackable: v }))} />
            </div>
            {resourceForm.isTrackable && (
              <div>
                <Label>Total Units</Label>
                <Input className="mt-1" type="number" min="0" value={resourceForm.totalUnits} onChange={e => setResourceForm(f => ({ ...f, totalUnits: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>Setup Time (minutes)</Label>
              <Input className="mt-1" type="number" min="0" value={resourceForm.requiresSetupTime} onChange={e => setResourceForm(f => ({ ...f, requiresSetupTime: e.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1" value={resourceForm.notes} onChange={e => setResourceForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={() => { if (editingResource) updateMut.mutate({ id: editingResource.id, data: resourceForm }); }} disabled={!resourceForm.resourceName || updateMut.isPending} data-testid="button-save-resource">
              {updateMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Units Dialog */}
      <Dialog open={showUnitsDialog} onOpenChange={setShowUnitsDialog}>
        <DialogContent className="max-w-lg" data-testid="dialog-manage-units">
          <DialogHeader>
            <DialogTitle>Manage Units — {managingResource?.resourceName}</DialogTitle>
            <DialogDescription>Track individual units and their current status</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {units.length === 0 ? (
              <p className="text-sm text-center text-muted-foreground py-4">No units found</p>
            ) : (
              <div className="space-y-2">
                {units.map(unit => (
                  <div key={unit.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{unit.unitCode}</p>
                      {unit.lastCleanedAt && (
                        <p className="text-xs text-muted-foreground">Cleaned: {new Date(unit.lastCleanedAt).toLocaleDateString()}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${UNIT_STATUS_CONFIG[unit.status]?.color || ""}`}>
                        {UNIT_STATUS_CONFIG[unit.status]?.label || unit.status}
                      </Badge>
                      <div className="flex gap-1">
                        {unit.status !== "cleaning" && (
                          <Button variant="outline" size="sm" className="h-6 text-xs px-1.5" onClick={() => updateUnitMut.mutate({ unitId: unit.id, status: "cleaning" })} data-testid={`button-mark-cleaning-${unit.id}`}>
                            🧹
                          </Button>
                        )}
                        {unit.status !== "available" && (
                          <Button variant="outline" size="sm" className="h-6 text-xs px-1.5" onClick={() => updateUnitMut.mutate({ unitId: unit.id, status: "available" })} data-testid={`button-mark-available-${unit.id}`}>
                            ✅
                          </Button>
                        )}
                        {unit.status !== "damaged" && (
                          <Button variant="outline" size="sm" className="h-6 text-xs px-1.5" onClick={() => updateUnitMut.mutate({ unitId: unit.id, status: "damaged" })} data-testid={`button-mark-damaged-${unit.id}`}>
                            ⚠️
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => addUnitMut.mutate()} disabled={addUnitMut.isPending || !managingResource?.isTrackable} data-testid="button-add-unit">
              <Plus className="h-3 w-3 mr-1" />Add Unit
            </Button>
            <Button variant="outline" onClick={() => setShowUnitsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function getBusinessTypeView(businessType: string | undefined) {
  switch (businessType) {
    case "food_truck":
      return {
        icon: Truck,
        label: "Food Truck Locations",
        description: "Manage GPS locations and routes for your food trucks",
        extraFields: ["GPS Coordinates", "Route Schedule"],
        emptyMessage: "No food truck locations configured. Add your first route!",
        cardLabel: "Route",
      };
    case "cloud_kitchen":
      return {
        icon: Cloud,
        label: "Delivery Zones",
        description: "Manage delivery zones and virtual kitchen locations",
        extraFields: ["Delivery Radius", "Zone Coverage"],
        emptyMessage: "No delivery zones configured. Set up your first zone!",
        cardLabel: "Zone",
      };
    case "enterprise":
      return {
        icon: Building2,
        label: "Centralized Outlets",
        description: "Enterprise-wide outlet management across all locations",
        extraFields: ["Region", "District Manager"],
        emptyMessage: "No outlets configured. Add your first enterprise location!",
        cardLabel: "Branch",
      };
    default:
      return {
        icon: Store,
        label: "Outlet Locations",
        description: "Manage your restaurant outlet locations",
        extraFields: [],
        emptyMessage: "No outlets yet. Add your first location!",
        cardLabel: "Outlet",
      };
  }
}

export default function OutletsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    openingHours: "",
    regionId: "",
    isFranchise: false,
    franchiseeName: "",
    royaltyRate: "",
    minimumGuarantee: "",
  });

  const { data: tenant } = useQuery<any>({
    queryKey: ["/api/tenant"],
  });

  const { data: outlets = [], isLoading } = useQuery<Outlet[]>({
    queryKey: ["/api/outlets"],
  });

  const { data: regions = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/regions"],
  });

  const businessType = tenant?.businessType || "casual_dining";
  const view = getBusinessTypeView(businessType);
  const ViewIcon = view.icon;

  function cleanFormData(data: typeof formData) {
    return {
      ...data,
      regionId: data.regionId || null,
      franchiseeName: data.isFranchise ? data.franchiseeName : null,
      royaltyRate: data.isFranchise ? data.royaltyRate : null,
      minimumGuarantee: data.isFranchise ? data.minimumGuarantee : null,
    };
  }

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/outlets", cleanFormData(data));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outlets"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: `${view.cardLabel} added`, description: `${view.cardLabel} created successfully.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await apiRequest("PATCH", `/api/outlets/${id}`, cleanFormData(data));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outlets"] });
      setDialogOpen(false);
      setEditingOutlet(null);
      resetForm();
      toast({ title: `${view.cardLabel} updated` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/outlets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outlets"] });
      toast({ title: "Deleted", description: `${view.cardLabel} removed.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setFormData({ name: "", address: "", openingHours: "", regionId: "", isFranchise: false, franchiseeName: "", royaltyRate: "", minimumGuarantee: "" });
  }

  function openAddDialog() {
    setEditingOutlet(null);
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(outlet: Outlet) {
    setEditingOutlet(outlet);
    setFormData({
      name: outlet.name,
      address: outlet.address || "",
      openingHours: outlet.openingHours || "",
      regionId: outlet.regionId || "",
      isFranchise: outlet.isFranchise || false,
      franchiseeName: outlet.franchiseeName || "",
      royaltyRate: outlet.royaltyRate || "",
      minimumGuarantee: outlet.minimumGuarantee || "",
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!formData.name.trim()) return;
    if (editingOutlet) {
      updateMutation.mutate({ id: editingOutlet.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  const filtered = outlets.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    (o.address && o.address.toLowerCase().includes(search.toLowerCase()))
  );

  const activeOutlets = outlets.filter((o) => o.active);
  const canEdit = user?.role === "owner" || user?.role === "manager";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
      data-testid="page-outlets"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <ViewIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-outlets-title">{view.label}</h1>
            <p className="text-muted-foreground">{view.description}</p>
          </div>
        </div>
        {canEdit && (
          <Button onClick={openAddDialog} data-testid="button-add-outlet">
            <Plus className="h-4 w-4 mr-2" />
            Add {view.cardLabel}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <StatCard
            title={`Total ${view.cardLabel}s`}
            value={outlets.length}
            icon={ViewIcon}
            iconColor="text-teal-600"
            iconBg="bg-teal-100"
            testId="stat-total-outlets"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <StatCard
            title="Active"
            value={activeOutlets.length}
            icon={CheckCircle2}
            iconColor="text-green-600"
            iconBg="bg-green-100"
            testId="stat-active-outlets"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <StatCard
            title="Business Type"
            value={businessType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            icon={Globe}
            iconColor="text-coral-600"
            iconBg="bg-orange-100"
            testId="stat-business-type"
          />
        </motion.div>
      </div>

      {businessType === "food_truck" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-dashed border-teal-300 bg-teal-50/50 dark:bg-teal-950/20 dark:border-teal-800">
            <CardContent className="p-4 flex items-center gap-3">
              <Navigation className="h-5 w-5 text-teal-600" />
              <div>
                <p className="font-medium text-teal-800 dark:text-teal-300" data-testid="text-food-truck-info">GPS Route Tracking</p>
                <p className="text-sm text-teal-600 dark:text-teal-400">Track real-time locations and manage daily routes for your food trucks</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {businessType === "cloud_kitchen" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-dashed border-purple-300 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800">
            <CardContent className="p-4 flex items-center gap-3">
              <Cloud className="h-5 w-5 text-purple-600" />
              <div>
                <p className="font-medium text-purple-800 dark:text-purple-300" data-testid="text-cloud-kitchen-info">Delivery Zone Management</p>
                <p className="text-sm text-purple-600 dark:text-purple-400">Configure delivery zones, radius coverage, and partner integrations</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {businessType === "enterprise" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="p-4 flex items-center gap-3">
              <Building2 className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300" data-testid="text-enterprise-info">Centralized Management</p>
                <p className="text-sm text-amber-600 dark:text-amber-400">Manage all locations from a single dashboard with regional grouping</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`Search ${view.cardLabel.toLowerCase()}s...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-outlets"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading outlets...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <ViewIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground" data-testid="text-no-outlets">{view.emptyMessage}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((outlet, index) => (
            <motion.div
              key={outlet.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="hover-lift transition-shadow-smooth" data-testid={`card-outlet-${outlet.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-teal-100 dark:bg-teal-900">
                        <MapPin className="h-4 w-4 text-teal-700 dark:text-teal-300" />
                      </div>
                      <div>
                        <CardTitle className="text-base" data-testid={`text-outlet-name-${outlet.id}`}>{outlet.name}</CardTitle>
                        {outlet.address && (
                          <CardDescription className="text-xs mt-0.5">{outlet.address}</CardDescription>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={outlet.active ? "default" : "secondary"}
                      className={outlet.active ? "bg-teal-600 hover:bg-teal-700" : ""}
                      data-testid={`badge-outlet-status-${outlet.id}`}
                    >
                      {outlet.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {outlet.openingHours && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{outlet.openingHours}</span>
                    </div>
                  )}
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(outlet)}
                        data-testid={`button-edit-outlet-${outlet.id}`}
                        className="flex-1"
                      >
                        <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteMutation.mutate(outlet.id)}
                        data-testid={`button-delete-outlet-${outlet.id}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOutlet ? `Edit ${view.cardLabel}` : `Add ${view.cardLabel}`}</DialogTitle>
            <DialogDescription>
              {editingOutlet ? `Update the details of this ${view.cardLabel.toLowerCase()}.` : `Add a new ${view.cardLabel.toLowerCase()} to your business.`}
            </DialogDescription>
          </DialogHeader>

          {editingOutlet && user?.role === "owner" ? (
            <Tabs defaultValue="details">
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                <TabsTrigger value="tips" className="flex-1" data-testid="tab-tip-settings">
                  <DollarSign className="h-3.5 w-3.5 mr-1.5" /> Tips
                </TabsTrigger>
              </TabsList>
              <TabsContent value="details">
                <div className="grid gap-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="outlet-name">Name *</Label>
                    <Input id="outlet-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={`e.g. ${businessType === "food_truck" ? "Downtown Route" : "Main Branch"}`} data-testid="input-outlet-name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="outlet-address">{businessType === "food_truck" ? "GPS Coordinates / Location" : businessType === "cloud_kitchen" ? "Delivery Zone Address" : "Address"}</Label>
                    <Input id="outlet-address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder={businessType === "food_truck" ? "e.g. 40.7128, -74.0060" : "e.g. 123 Main St"} data-testid="input-outlet-address" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="outlet-hours">{businessType === "food_truck" ? "Route Schedule" : "Opening Hours"}</Label>
                    <Input id="outlet-hours" value={formData.openingHours} onChange={(e) => setFormData({ ...formData, openingHours: e.target.value })} placeholder="e.g. 9:00 AM - 10:00 PM" data-testid="input-outlet-hours" />
                  </div>
                  <div className="space-y-2">
                    <Label>Region</Label>
                    <Select value={formData.regionId || "none"} onValueChange={(v) => setFormData({ ...formData, regionId: v === "none" ? "" : v })}>
                      <SelectTrigger data-testid="select-outlet-region"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Region</SelectItem>
                        {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="outlet-franchise" checked={formData.isFranchise} onChange={(e) => setFormData({ ...formData, isFranchise: e.target.checked })} data-testid="checkbox-franchise" />
                    <Label htmlFor="outlet-franchise">Franchise Outlet</Label>
                  </div>
                  {formData.isFranchise && (
                    <div className="space-y-3 pl-4 border-l-2 border-amber-300">
                      <div className="space-y-2">
                        <Label>Franchisee Name</Label>
                        <Input value={formData.franchiseeName} onChange={(e) => setFormData({ ...formData, franchiseeName: e.target.value })} placeholder="e.g. Gulf Dining Group LLC" data-testid="input-franchisee-name" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Royalty Rate (%)</Label>
                          <Input type="number" step="0.1" value={formData.royaltyRate} onChange={(e) => setFormData({ ...formData, royaltyRate: e.target.value })} placeholder="e.g. 8" data-testid="input-royalty-rate" />
                        </div>
                        <div className="space-y-2">
                          <Label>Min Guarantee</Label>
                          <Input type="number" step="100" value={formData.minimumGuarantee} onChange={(e) => setFormData({ ...formData, minimumGuarantee: e.target.value })} placeholder="e.g. 5000" data-testid="input-min-guarantee" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter className="pt-4">
                  <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-outlet">Cancel</Button>
                  <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-outlet">
                    {editingOutlet ? "Update" : `Add ${view.cardLabel}`}
                  </Button>
                </DialogFooter>
              </TabsContent>
              <TabsContent value="tips">
                <TipSettingsPanel outlet={editingOutlet} />
              </TabsContent>
            </Tabs>
          ) : (
            <>
              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="outlet-name">Name *</Label>
                  <Input id="outlet-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={`e.g. ${businessType === "food_truck" ? "Downtown Route" : "Main Branch"}`} data-testid="input-outlet-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="outlet-address">{businessType === "food_truck" ? "GPS Coordinates / Location" : businessType === "cloud_kitchen" ? "Delivery Zone Address" : "Address"}</Label>
                  <Input id="outlet-address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder={businessType === "food_truck" ? "e.g. 40.7128, -74.0060" : "e.g. 123 Main St"} data-testid="input-outlet-address" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="outlet-hours">{businessType === "food_truck" ? "Route Schedule" : "Opening Hours"}</Label>
                  <Input id="outlet-hours" value={formData.openingHours} onChange={(e) => setFormData({ ...formData, openingHours: e.target.value })} placeholder="e.g. 9:00 AM - 10:00 PM" data-testid="input-outlet-hours" />
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Select value={formData.regionId || "none"} onValueChange={(v) => setFormData({ ...formData, regionId: v === "none" ? "" : v })}>
                    <SelectTrigger data-testid="select-outlet-region"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Region</SelectItem>
                      {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="outlet-franchise" checked={formData.isFranchise} onChange={(e) => setFormData({ ...formData, isFranchise: e.target.checked })} data-testid="checkbox-franchise" />
                  <Label htmlFor="outlet-franchise">Franchise Outlet</Label>
                </div>
                {formData.isFranchise && (
                  <div className="space-y-3 pl-4 border-l-2 border-amber-300">
                    <div className="space-y-2">
                      <Label>Franchisee Name</Label>
                      <Input value={formData.franchiseeName} onChange={(e) => setFormData({ ...formData, franchiseeName: e.target.value })} placeholder="e.g. Gulf Dining Group LLC" data-testid="input-franchisee-name" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Royalty Rate (%)</Label>
                        <Input type="number" step="0.1" value={formData.royaltyRate} onChange={(e) => setFormData({ ...formData, royaltyRate: e.target.value })} placeholder="e.g. 8" data-testid="input-royalty-rate" />
                      </div>
                      <div className="space-y-2">
                        <Label>Min Guarantee</Label>
                        <Input type="number" step="100" value={formData.minimumGuarantee} onChange={(e) => setFormData({ ...formData, minimumGuarantee: e.target.value })} placeholder="e.g. 5000" data-testid="input-min-guarantee" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-outlet">Cancel</Button>
                <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-outlet">
                  {editingOutlet ? "Update" : `Add ${view.cardLabel}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <CashCurrencySettings />
      </motion.div>

      {outlets.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <PackingChargeSettings outlets={outlets} />
        </motion.div>
      )}

      {user?.role === "owner" && outlets.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <SpecialResourceSettings outlets={outlets} />
        </motion.div>
      )}
    </motion.div>
  );
}