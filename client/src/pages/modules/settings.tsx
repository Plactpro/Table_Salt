import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  Save, Building2, Receipt, Settings, CheckCircle2, Crown, Store,
  Clock, Globe, DollarSign, Search, Eye, RotateCcw,
  CreditCard, Printer, Zap, Phone,
} from "lucide-react";
import PrintQueuePanel from "@/components/pos/PrintQueuePanel";
import {
  SubscriptionTier,
  BusinessType,
  businessConfig,
  tierPricing,
} from "@/lib/subscription";
import { timezones, getTimezoneByIana, formatTimeInZone, formatDateInZone } from "@/lib/timezones";
import { currencyMap, formatCurrency as sharedFormatCurrency, type CurrencyCode } from "@shared/currency";

interface TenantData {
  id: string;
  name: string;
  plan: string;
  businessType?: string;
  currency?: string;
  currencyPosition?: string;
  currencyDecimals?: number;
}

function getDaysRemaining(trialEndsAt: string | null | undefined): number {
  if (!trialEndsAt) return 0;
  const end = new Date(trialEndsAt);
  const now = new Date();
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function SubscriptionPlanCard() {
  const { tenant } = useAuth();
  const [, navigate] = useLocation();

  if (!tenant) return null;

  const status = tenant.subscriptionStatus ?? "trialing";
  const days = getDaysRemaining(tenant.trialEndsAt);
  const isTrialing = status === "trialing";
  const isActive = status === "active";

  let statusLabel = "Trial";
  let statusColor = "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200";
  if (isActive) {
    statusLabel = "Active";
    statusColor = "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200";
  } else if (status === "canceled") {
    statusLabel = "Canceled";
    statusColor = "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200";
  } else if (status === "past_due") {
    statusLabel = "Past Due";
    statusColor = "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200";
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}>
      <Card data-testid="card-current-plan" className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent max-w-4xl">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Crown className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Plan</span>
                  <Badge className={`text-xs px-2 py-0 ${statusColor}`} data-testid="text-plan-name">
                    {statusLabel}
                  </Badge>
                </div>
                {isTrialing ? (
                  <div>
                    <p className="text-sm font-medium">Free trial</p>
                    <p className="text-xs text-muted-foreground" data-testid="text-trial-days">
                      {days > 0 ? `${days} ${days === 1 ? "day" : "days"} remaining — ₹0/month during trial` : "Trial ended"}
                    </p>
                  </div>
                ) : isActive && tenant.stripeSubscriptionId ? (
                  <div>
                    <p className="text-sm font-medium capitalize">{tenant.plan} Plan</p>
                    <p className="text-xs text-muted-foreground">Subscription active</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium capitalize">{tenant.plan} Plan</p>
                    <p className="text-xs text-muted-foreground capitalize">{status.replace("_", " ")}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {isTrialing ? (
                <>
                  <p className="text-xs text-muted-foreground hidden sm:block">Full access to all features</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => navigate("/billing")}
                      data-testid="button-upgrade-plan"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Upgrade to Pro — ₹2,999/mo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate("/billing")}
                      data-testid="button-contact-sales"
                    >
                      <Phone className="h-3.5 w-3.5 mr-1" />
                      Contact sales
                    </Button>
                  </div>
                </>
              ) : isActive && tenant.stripeSubscriptionId ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/billing")}
                  data-testid="button-upgrade-plan"
                >
                  Manage subscription
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => navigate("/billing")}
                  data-testid="button-upgrade-plan"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Upgrade Plan
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [savedSection, setSavedSection] = useState<string | null>(null);

  const { data: tenant, isLoading } = useQuery<TenantData>({
    queryKey: ["/api/tenant"],
  });

  const { data: kitchenStations = [] } = useQuery<Array<{ id: string; name: string; printerUrl: string | null }>>({
    queryKey: ["/api/kitchen-stations"],
  });
  const [stationPrinterUrls, setStationPrinterUrls] = useState<Record<string, string>>({});
  const updateStationPrinterMutation = useMutation({
    mutationFn: async ({ id, printerUrl }: { id: string; printerUrl: string }) => {
      const res = await apiRequest("PATCH", `/api/kitchen-stations/${id}`, { printerUrl: printerUrl || null });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen-stations"] });
      setSavedSection("kitchen-printers");
      setTimeout(() => setSavedSection(null), 2000);
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [currencyPosition, setCurrencyPosition] = useState("before");
  const [currencyDecimals, setCurrencyDecimals] = useState(2);
  const [timezone, setTimezone] = useState("UTC");
  const [timeFormat, setTimeFormat] = useState("12hr");
  const [taxRate, setTaxRate] = useState("0");
  const [taxType, setTaxType] = useState("vat");
  const [compoundTax, setCompoundTax] = useState(false);
  const [serviceCharge, setServiceCharge] = useState("0");
  const [businessType, setBusinessType] = useState<BusinessType>("casual_dining");
  const [plan, setPlan] = useState<SubscriptionTier>("basic");
  const [gstin, setGstin] = useState("");
  const [cgstRate, setCgstRate] = useState("9");
  const [sgstRate, setSgstRate] = useState("9");
  const [invoicePrefix, setInvoicePrefix] = useState("INV");
  const [razorpayEnabled, setRazorpayEnabled] = useState(false);
  const [razorpayKeyId, setRazorpayKeyId] = useState("");
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("");
  const [tzSearch, setTzSearch] = useState("");
  const [currencySearch, setCurrencySearch] = useState("");
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    if (tenant) {
      setName(tenant.name || "");
      setAddress((tenant as any).address || "");
      setCurrency(tenant.currency || "USD");
      setCurrencyPosition(tenant.currencyPosition || "before");
      setCurrencyDecimals(tenant.currencyDecimals ?? 2);
      setTimezone((tenant as any).timezone || "UTC");
      setTimeFormat((tenant as any).timeFormat || "12hr");
      setTaxRate((tenant as any).taxRate || "0");
      setTaxType((tenant as any).taxType || "vat");
      setCompoundTax((tenant as any).compoundTax ?? false);
      setServiceCharge((tenant as any).serviceCharge || "0");
      setBusinessType(((tenant as any).businessType as BusinessType) || "casual_dining");
      setPlan((tenant.plan as SubscriptionTier) || "basic");
      setGstin((tenant as any).gstin || "");
      setCgstRate((tenant as any).cgstRate || "9");
      setSgstRate((tenant as any).sgstRate || "9");
      setInvoicePrefix((tenant as any).invoicePrefix || "INV");
      setRazorpayEnabled(!!(tenant as any).razorpayEnabled);
      setRazorpayKeyId((tenant as any).razorpayKeyId || "");
    }
  }, [tenant]);

  useEffect(() => {
    const interval = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const showSaveAnimation = (section: string) => {
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2000);
  };

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", "/api/tenant", data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      const sectionKeys: Record<string, string[]> = {
        profile: ["name", "address"],
        timezone: ["timezone", "timeFormat"],
        tax: ["taxRate", "taxType", "compoundTax", "serviceCharge", "gstin", "cgstRate", "sgstRate", "invoicePrefix"],
        currency: ["currency", "currencyPosition", "currencyDecimals"],
        business: ["businessType", "plan"],
        razorpay: ["razorpayEnabled", "razorpayKeyId", "razorpayKeySecret"],
      };
      const matchedSections = Object.entries(sectionKeys).filter(([, keys]) =>
        keys.some((k) => variables[k] !== undefined)
      );
      if (matchedSections.length > 1) {
        toast({ title: "All settings saved" });
        matchedSections.forEach(([section]) => showSaveAnimation(section));
      } else if (matchedSections.length === 1) {
        const [section] = matchedSections[0];
        toast({ title: `${section.charAt(0).toUpperCase() + section.slice(1)} settings saved` });
        showSaveAnimation(section);
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ name, address });
  };

  const handleTimezoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ timezone, timeFormat });
  };

  const handleTaxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ taxRate, taxType, compoundTax, serviceCharge, gstin, cgstRate, sgstRate, invoicePrefix });
  };

  const handleCurrencySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ currency, currencyPosition, currencyDecimals });
  };

  const handleRazorpaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, any> = { razorpayEnabled, razorpayKeyId: razorpayKeyId.trim() || null };
    if (razorpayKeySecret.trim()) {
      payload.razorpayKeySecret = razorpayKeySecret.trim();
    }
    updateMutation.mutate(payload);
    setRazorpayKeySecret("");
  };

  const handleBusinessConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ businessType, plan });
  };

  const handleSaveAll = () => {
    updateMutation.mutate({
      name, address, timezone, timeFormat,
      taxRate, taxType, compoundTax, serviceCharge,
      currency, currencyPosition, currencyDecimals,
      businessType, plan,
    });
  };

  const filteredTimezones = useMemo(() => {
    if (!tzSearch.trim()) return timezones;
    const q = tzSearch.toLowerCase();
    return timezones.filter(
      (tz) =>
        tz.label.toLowerCase().includes(q) ||
        tz.iana.toLowerCase().includes(q) ||
        tz.region.toLowerCase().includes(q) ||
        tz.offset.toLowerCase().includes(q)
    );
  }, [tzSearch]);

  const currencyList = useMemo(() => {
    const all = Object.values(currencyMap);
    if (!currencySearch.trim()) return all;
    const q = currencySearch.toLowerCase();
    return all.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q)
    );
  }, [currencySearch]);

  const selectedTz = getTimezoneByIana(timezone);
  const currentTime = formatTimeInZone(timezone, timeFormat as "12hr" | "24hr");
  const currentDate = formatDateInZone(timezone);

  const previewAmount = 1234.56;
  const previewFormatted = sharedFormatCurrency(previewAmount, currency, {
    position: currencyPosition as "before" | "after",
    decimals: currencyDecimals,
  });

  const sampleSubtotal = 45.00;
  const sampleTaxPct = taxType === "none" ? 0 : (parseFloat(taxRate) || 0);
  const sampleServicePct = parseFloat(serviceCharge) || 0;
  const sampleService = sampleSubtotal * (sampleServicePct / 100);
  const sampleTaxBase = compoundTax ? sampleSubtotal + sampleService : sampleSubtotal;
  const sampleTax = sampleTaxBase * (sampleTaxPct / 100);
  const sampleTotal = sampleSubtotal + sampleTax + sampleService;
  const fmtPreview = (val: number) =>
    sharedFormatCurrency(val, currency, {
      position: currencyPosition as "before" | "after",
      decimals: currencyDecimals,
    });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  const businessTypes: { value: BusinessType; label: string; description: string }[] = Object.entries(businessConfig).map(
    ([key, config]) => ({
      value: key as BusinessType,
      label: config.label,
      description: config.description,
    })
  );

  const plansList: { value: SubscriptionTier; label: string; price: number; description: string }[] = Object.entries(tierPricing).map(
    ([key, config]) => ({
      value: key as SubscriptionTier,
      label: config.label,
      price: config.price,
      description: config.description,
    })
  );

  const taxTypeLabels: Record<string, string> = {
    vat: "VAT (Value Added Tax)",
    gst: "GST (Goods & Services Tax)",
    sales_tax: "Sales Tax",
    service_tax: "Service Tax",
    custom: "Custom Tax",
    none: "No Tax",
  };

  const SaveOverlay = ({ section }: { section: string }) => (
    <AnimatePresence>
      {savedSection === section && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg"
        >
          <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} className="flex flex-col items-center gap-2">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <span className="text-sm font-medium text-green-600">Saved!</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6" data-testid="page-settings">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-heading" data-testid="text-settings-title">Settings</h1>
          <p className="text-muted-foreground">Manage your restaurant configuration</p>
        </div>
      </div>

      <SubscriptionPlanCard />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-4xl">
        <div className="lg:col-span-2 space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card className="relative overflow-hidden">
              <SaveOverlay section="business" />
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900">
                    <Store className="h-5 w-5 text-purple-700 dark:text-purple-300" />
                  </div>
                  <CardTitle>Business Configuration</CardTitle>
                </div>
                <CardDescription>Set your business type and subscription plan</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleBusinessConfigSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Business Type</Label>
                    <Select value={businessType} onValueChange={(val) => setBusinessType(val as BusinessType)}>
                      <SelectTrigger data-testid="select-business-type"><SelectValue placeholder="Select business type" /></SelectTrigger>
                      <SelectContent>
                        {businessTypes.map((bt) => (
                          <SelectItem key={bt.value} value={bt.value} data-testid={`option-business-type-${bt.value}`}>
                            <div className="flex flex-col">
                              <span>{bt.label}</span>
                              <span className="text-xs text-muted-foreground">{bt.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {businessType && businessConfig[businessType] && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {businessConfig[businessType].badges.map((badge) => (
                          <Badge key={badge} variant="secondary" className="bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">{badge}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Subscription Plan</Label>
                    <Select value={plan} onValueChange={(val) => setPlan(val as SubscriptionTier)}>
                      <SelectTrigger data-testid="select-plan"><SelectValue placeholder="Select plan" /></SelectTrigger>
                      <SelectContent>
                        {plansList.map((p) => (
                          <SelectItem key={p.value} value={p.value} data-testid={`option-plan-${p.value}`}>
                            <div className="flex items-center gap-2">
                              <span>{p.label}</span>
                              <span className="text-xs text-muted-foreground">${p.price}/mo</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {plan && tierPricing[plan] && (
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-300">
                          <Crown className="h-3 w-3 mr-1" />
                          {tierPricing[plan].label} — ${tierPricing[plan].price}/mo
                        </Badge>
                        <span className="text-xs text-muted-foreground">{tierPricing[plan].description}</span>
                      </div>
                    )}
                  </div>
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-business-config" className="transition-all duration-200 hover:scale-[1.02]">
                    <Save className="h-4 w-4 mr-2" /> Save Business Config
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="relative overflow-hidden">
              <SaveOverlay section="profile" />
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-teal-100 dark:bg-teal-900">
                    <Building2 className="h-5 w-5 text-teal-700 dark:text-teal-300" />
                  </div>
                  <CardTitle>Restaurant Profile</CardTitle>
                </div>
                <CardDescription>Update your restaurant's basic information</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Restaurant Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} required data-testid="input-settings-name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} data-testid="input-settings-address" />
                  </div>
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-profile" className="transition-all duration-200 hover:scale-[1.02]">
                    <Save className="h-4 w-4 mr-2" /> Save Profile
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="relative overflow-hidden">
              <SaveOverlay section="timezone" />
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900">
                    <Globe className="h-5 w-5 text-blue-700 dark:text-blue-300" />
                  </div>
                  <CardTitle>Time Zone & Format</CardTitle>
                </div>
                <CardDescription>Configure your restaurant's local time zone and clock format</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleTimezoneSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Time Zone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger data-testid="select-timezone">
                        <SelectValue placeholder="Select timezone">
                          {selectedTz ? `${selectedTz.flag} ${selectedTz.label} (${selectedTz.offset})` : timezone}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 pb-2 sticky top-0 bg-popover z-10">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Search timezones..."
                              value={tzSearch}
                              onChange={(e) => setTzSearch(e.target.value)}
                              className="pl-8 h-8 text-sm"
                              data-testid="input-search-timezone"
                            />
                          </div>
                        </div>
                        {filteredTimezones.map((tz) => (
                          <SelectItem key={tz.iana} value={tz.iana} data-testid={`option-tz-${tz.iana}`}>
                            <span className="flex items-center gap-2">
                              <span>{tz.flag}</span>
                              <span>{tz.label}</span>
                              <span className="text-xs text-muted-foreground ml-auto">{tz.offset}</span>
                            </span>
                          </SelectItem>
                        ))}
                        {filteredTimezones.length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No timezones found</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Time Format</Label>
                    <Select value={timeFormat} onValueChange={setTimeFormat}>
                      <SelectTrigger data-testid="select-time-format"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12hr" data-testid="option-time-12hr">12-hour (2:30 PM)</SelectItem>
                        <SelectItem value="24hr" data-testid="option-time-24hr">24-hour (14:30)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Current Time</span>
                    </div>
                    <p className="text-2xl font-bold font-heading text-blue-800 dark:text-blue-200" data-testid="text-live-clock">{currentTime}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400" data-testid="text-live-date">{currentDate}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-timezone" className="transition-all duration-200 hover:scale-[1.02]">
                      <Save className="h-4 w-4 mr-2" /> Save Time Zone
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      data-testid="button-reset-timezone-browser"
                      onClick={() => {
                        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                        setTimezone(browserTz);
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" /> Reset to Browser
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="relative overflow-hidden">
              <SaveOverlay section="tax" />
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-900">
                    <Receipt className="h-5 w-5 text-orange-600 dark:text-orange-300" />
                  </div>
                  <CardTitle>Tax Configuration</CardTitle>
                </div>
                <CardDescription>Set tax type, rate, and service charge</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleTaxSubmit} className="space-y-4">
                  {currency === "INR" && (
                    <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 p-3 space-y-3">
                      <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide">GST (India)</p>
                      <div className="space-y-2">
                        <Label>GSTIN (Restaurant)</Label>
                        <Input
                          placeholder="22AAAAA0000A1Z5"
                          value={gstin}
                          onChange={(e) => setGstin(e.target.value.toUpperCase())}
                          maxLength={15}
                          data-testid="input-settings-gstin"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <Label>CGST Rate (%)</Label>
                          <Input type="number" step="0.5" min="0" max="50" value={cgstRate} onChange={(e) => setCgstRate(e.target.value)} data-testid="input-settings-cgst-rate" />
                        </div>
                        <div className="space-y-2">
                          <Label>SGST Rate (%)</Label>
                          <Input type="number" step="0.5" min="0" max="50" value={sgstRate} onChange={(e) => setSgstRate(e.target.value)} data-testid="input-settings-sgst-rate" />
                        </div>
                        <div className="space-y-2">
                          <Label>Invoice Prefix</Label>
                          <Input placeholder="INV" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())} maxLength={10} data-testid="input-settings-invoice-prefix" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">Combined GST = CGST + SGST. Invoice numbers will be {invoicePrefix || "INV"}/2025-26/0001.</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Tax Type</Label>
                    <Select value={taxType} onValueChange={setTaxType}>
                      <SelectTrigger data-testid="select-tax-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(taxTypeLabels).map(([val, label]) => (
                          <SelectItem key={val} value={val} data-testid={`option-tax-type-${val}`}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tax Rate (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={taxRate}
                        onChange={(e) => setTaxRate(e.target.value)}
                        data-testid="input-settings-tax-rate"
                        disabled={taxType === "none"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Service Charge (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={serviceCharge}
                        onChange={(e) => setServiceCharge(e.target.value)}
                        data-testid="input-settings-service-charge"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <Label className="text-sm font-medium">Compound Tax</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Apply tax on top of service charge</p>
                    </div>
                    <Switch
                      checked={compoundTax}
                      onCheckedChange={setCompoundTax}
                      disabled={taxType === "none"}
                      data-testid="switch-compound-tax"
                    />
                  </div>
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-tax" className="transition-all duration-200 hover:scale-[1.02]">
                    <Save className="h-4 w-4 mr-2" /> Save Tax Settings
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card className="relative overflow-hidden">
              <SaveOverlay section="currency" />
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900">
                    <DollarSign className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                  </div>
                  <CardTitle>Currency Configuration</CardTitle>
                </div>
                <CardDescription>Set your currency, symbol position, and decimal places</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCurrencySubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger data-testid="select-currency">
                        <SelectValue>
                          {currencyMap[currency as CurrencyCode]
                            ? `${currencyMap[currency as CurrencyCode].symbol} ${currencyMap[currency as CurrencyCode].name} (${currency})`
                            : currency}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 pb-2 sticky top-0 bg-popover z-10">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Search currencies..."
                              value={currencySearch}
                              onChange={(e) => setCurrencySearch(e.target.value)}
                              className="pl-8 h-8 text-sm"
                              data-testid="input-search-currency"
                            />
                          </div>
                        </div>
                        {currencyList.map((c) => (
                          <SelectItem key={c.code} value={c.code} data-testid={`option-currency-${c.code}`}>
                            <span className="flex items-center gap-2">
                              <span className="font-medium">{c.symbol}</span>
                              <span>{c.name}</span>
                              <span className="text-xs text-muted-foreground">({c.code})</span>
                            </span>
                          </SelectItem>
                        ))}
                        {currencyList.length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No currencies found</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Symbol Position</Label>
                      <Select value={currencyPosition} onValueChange={setCurrencyPosition}>
                        <SelectTrigger data-testid="select-currency-position"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="before" data-testid="option-position-before">Before amount ($100)</SelectItem>
                          <SelectItem value="after" data-testid="option-position-after">After amount (100$)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Decimal Places</Label>
                      <Select value={String(currencyDecimals)} onValueChange={(v) => setCurrencyDecimals(Number(v))}>
                        <SelectTrigger data-testid="select-currency-decimals"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0" data-testid="option-decimals-0">0 (100)</SelectItem>
                          <SelectItem value="1" data-testid="option-decimals-1">1 (100.0)</SelectItem>
                          <SelectItem value="2" data-testid="option-decimals-2">2 (100.00)</SelectItem>
                          <SelectItem value="3" data-testid="option-decimals-3">3 (100.000)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-2 mb-1">
                      <Eye className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Preview</span>
                    </div>
                    <p className="text-lg font-bold font-heading text-emerald-800 dark:text-emerald-200" data-testid="text-currency-preview">
                      {previewFormatted}
                    </p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">Sample: 1,234.56</p>
                  </div>
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-currency" className="transition-all duration-200 hover:scale-[1.02]">
                    <Save className="h-4 w-4 mr-2" /> Save Currency Settings
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="relative overflow-hidden">
              <SaveOverlay section="razorpay" />
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900">
                    <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                  </div>
                  <CardTitle>Payment Gateway</CardTitle>
                </div>
                <CardDescription>Enable Razorpay to verify card and UPI payments at POS</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRazorpaySubmit} className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <Label className="text-sm font-medium">Enable Razorpay Gateway</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Require gateway verification for card and UPI payments</p>
                    </div>
                    <Switch
                      checked={razorpayEnabled}
                      onCheckedChange={setRazorpayEnabled}
                      data-testid="switch-razorpay-enabled"
                    />
                  </div>
                  {razorpayEnabled && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Razorpay Key ID</Label>
                        <Input
                          placeholder="rzp_live_xxxxxxxxxxxx"
                          value={razorpayKeyId}
                          onChange={(e) => setRazorpayKeyId(e.target.value.trim())}
                          data-testid="input-razorpay-key-id"
                        />
                        <p className="text-xs text-muted-foreground">Your Razorpay publishable key ID.</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Razorpay Key Secret</Label>
                        <Input
                          type="password"
                          placeholder="Enter new secret to update (leave blank to keep current)"
                          value={razorpayKeySecret}
                          onChange={(e) => setRazorpayKeySecret(e.target.value)}
                          autoComplete="new-password"
                          data-testid="input-razorpay-key-secret"
                        />
                        <p className="text-xs text-muted-foreground">Your Razorpay API secret. Stored securely server-side — never shown after saving.</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                        <p className="font-semibold">How it works</p>
                        <p>When enabled, the POS will generate a Razorpay payment link for card/UPI payments. The customer scans the QR or opens the link to pay. Payment is verified automatically.</p>
                        <p className="mt-1">For the webhook, register <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">/api/webhooks/razorpay</code> in your Razorpay dashboard with secret stored as <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">RAZORPAY_WEBHOOK_SECRET</code>.</p>
                      </div>
                    </div>
                  )}
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-razorpay" className="transition-all duration-200 hover:scale-[1.02]">
                    <Save className="h-4 w-4 mr-2" /> Save Gateway Settings
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <Button
              size="lg"
              className="w-full transition-all duration-200 hover:scale-[1.01]"
              onClick={handleSaveAll}
              disabled={updateMutation.isPending}
              data-testid="button-save-all"
            >
              <Save className="h-4 w-4 mr-2" /> Save All Changes
            </Button>
          </motion.div>
        </div>

        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="sticky top-6 border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Live Preview</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="h-3.5 w-3.5 text-blue-600" />
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Clock</span>
                  </div>
                  <p className="text-xl font-bold font-heading" data-testid="text-preview-clock">{currentTime}</p>
                  <p className="text-xs text-muted-foreground">{selectedTz?.flag} {selectedTz?.label || timezone}</p>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Receipt className="h-3.5 w-3.5 text-orange-600" />
                    <span className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wider">Sample Receipt</span>
                  </div>
                  <div className="rounded-lg border bg-card p-3 space-y-2 text-sm">
                    <div className="text-center font-bold text-base" data-testid="text-preview-restaurant-name">{name || "Your Restaurant"}</div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Grilled Salmon</span>
                      <span>{fmtPreview(18.50)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Caesar Salad</span>
                      <span>{fmtPreview(12.00)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sparkling Water</span>
                      <span>{fmtPreview(4.50)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tiramisu</span>
                      <span>{fmtPreview(10.00)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-medium">
                      <span>Subtotal</span>
                      <span data-testid="text-preview-subtotal">{fmtPreview(sampleSubtotal)}</span>
                    </div>
                    {taxType !== "none" && sampleTaxPct > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>{taxTypeLabels[taxType]?.split(" (")[0] || "Tax"} ({sampleTaxPct}%)</span>
                        <span data-testid="text-preview-tax">{fmtPreview(sampleTax)}</span>
                      </div>
                    )}
                    {sampleServicePct > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Service Charge ({sampleServicePct}%)</span>
                        <span data-testid="text-preview-service">{fmtPreview(sampleService)}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between font-bold text-base">
                      <span>Total</span>
                      <span data-testid="text-preview-total">{fmtPreview(sampleTotal)}</span>
                    </div>
                    <div className="text-center text-xs text-muted-foreground mt-2">
                      {currentDate} {currentTime}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {kitchenStations.length > 0 && (
        <div className="mt-8">
          <Card className="relative overflow-hidden" data-testid="card-kitchen-printers">
            {savedSection === "kitchen-printers" && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <span className="text-sm font-medium text-green-600">Saved!</span>
                </div>
              </div>
            )}
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Kitchen Station Printers
              </CardTitle>
              <CardDescription>
                Configure network printer URLs for each kitchen station. KOT tickets will be sent automatically when orders start cooking.
                Leave blank to use browser print dialog as fallback.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {kitchenStations.map((station) => (
                <div key={station.id} className="flex items-center gap-3" data-testid={`station-printer-row-${station.id}`}>
                  <Label className="w-28 shrink-0 font-medium capitalize">{station.name}</Label>
                  <Input
                    placeholder="http://192.168.1.100:9100 (optional)"
                    value={stationPrinterUrls[station.id] ?? (station.printerUrl || "")}
                    onChange={(e) => setStationPrinterUrls(prev => ({ ...prev, [station.id]: e.target.value }))}
                    className="flex-1"
                    data-testid={`input-printer-url-${station.id}`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStationPrinterMutation.mutate({
                      id: station.id,
                      printerUrl: stationPrinterUrls[station.id] ?? (station.printerUrl || ""),
                    })}
                    disabled={updateStationPrinterMutation.isPending}
                    data-testid={`button-save-printer-${station.id}`}
                  >
                    <Save className="h-3 w-3 mr-1" /> Save
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mt-8">
        <PrintQueuePanel restaurantName={tenant?.name || "Restaurant"} />
      </div>
    </motion.div>
  );
}
