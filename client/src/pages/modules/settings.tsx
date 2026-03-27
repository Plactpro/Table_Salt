import { PageTitle } from "@/lib/accessibility";
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
  CreditCard, Printer, Zap, Phone, Sun, Moon, Monitor,
} from "lucide-react";
import { useTheme, type ThemePreference } from "@/hooks/use-theme";
import PrintQueuePanel from "@/components/pos/PrintQueuePanel";
import {
  SubscriptionTier,
  BusinessType,
  businessConfig,
  tierPricing,
} from "@/lib/subscription";
import { timezones, getTimezoneByIana, formatTimeInZone, formatDateInZone } from "@/lib/timezones";
import { currencyMap, formatCurrency as sharedFormatCurrency, type CurrencyCode } from "@shared/currency";
import { SUPPORTED_LANGUAGES } from "@/i18n/index";
import { useTranslation } from "react-i18next";

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

  const { t: ts } = useTranslation("settings");

  let statusLabel = ts("statusTrial");
  let statusColor = "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200";
  if (isActive) {
    statusLabel = ts("statusActive");
    statusColor = "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200";
  } else if (status === "canceled") {
    statusLabel = ts("statusCanceled");
    statusColor = "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200";
  } else if (status === "past_due") {
    statusLabel = ts("statusPastDue");
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
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{ts("yourPlan")}</span>
                  <Badge className={`text-xs px-2 py-0 ${statusColor}`} data-testid="text-plan-name">
                    {statusLabel}
                  </Badge>
                </div>
                {isTrialing ? (
                  <div>
                    <p className="text-sm font-medium">{ts("freeTrial")}</p>
                    <p className="text-xs text-muted-foreground" data-testid="text-trial-days">
                      {days > 0 ? ts("trialDaysRemaining", { count: days }) : ts("trialEnded")}
                    </p>
                  </div>
                ) : isActive && tenant.stripeSubscriptionId ? (
                  <div>
                    <p className="text-sm font-medium capitalize">{ts("planLabel", { plan: tenant.plan })}</p>
                    <p className="text-xs text-muted-foreground">{ts("subscriptionActive")}</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium capitalize">{ts("planLabel", { plan: tenant.plan })}</p>
                    <p className="text-xs text-muted-foreground capitalize">{status.replace(/_/g, " ")}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {isTrialing ? (
                <>
                  <p className="text-xs text-muted-foreground hidden sm:block">{ts("fullAccessAllFeatures")}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => navigate("/billing")}
                      data-testid="button-upgrade-plan"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      {ts("upgradeToPro")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate("/billing")}
                      data-testid="button-contact-sales"
                    >
                      <Phone className="h-3.5 w-3.5 mr-1" />
                      {ts("contactSales")}
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
                  {ts("manageSubscription")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => navigate("/billing")}
                  data-testid="button-upgrade-plan"
                >
                  <Zap className="h-3.5 w-3.5" />
                  {ts("upgradePlan")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ThemeCard() {
  const { user } = useAuth();
  const { setTheme, isUpdating } = useTheme(user?.themePreference ?? "system");
  const current = user?.themePreference ?? "system";
  const { t: ts } = useTranslation("settings");

  const options: { value: ThemePreference; label: string; Icon: React.ElementType }[] = [
    { value: "light", label: ts("themeLight"), Icon: Sun },
    { value: "dark", label: ts("themeDark"), Icon: Moon },
    { value: "system", label: ts("themeSystem"), Icon: Monitor },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
      <Card className="max-w-4xl" data-testid="card-theme-preference">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900">
              <Monitor className="h-5 w-5 text-indigo-700 dark:text-indigo-300" />
            </div>
            <CardTitle>{ts("appearance")}</CardTitle>
          </div>
          <CardDescription>{ts("appearanceDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3" role="group" aria-label={ts("themePreference")}>
            {options.map(({ value, label, Icon }) => (
              <button
                key={value}
                data-testid={`button-theme-${value}`}
                onClick={() => setTheme(value)}
                disabled={isUpdating}
                aria-pressed={current === value}
                className={`flex flex-col items-center gap-2 px-6 py-4 rounded-xl border-2 text-sm font-medium transition-all
                  ${current === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                  }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
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
  const { t, i18n } = useTranslation("settings");
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
    onError: (e: Error) => { toast({ title: t("error"), description: e.message, variant: "destructive" }); },
  });

  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [address, setAddress] = useState("");
  const [profileDirty, setProfileDirty] = useState(false);
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
  const [tenantDefaultLang, setTenantDefaultLang] = useState("en");

  const { data: tenantLangData } = useQuery<{ defaultLanguage: string }>({
    queryKey: ["/api/tenant/default-language"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/tenant/default-language");
      return res.json();
    },
  });
  useEffect(() => {
    if (tenantLangData?.defaultLanguage) setTenantDefaultLang(tenantLangData.defaultLanguage);
  }, [tenantLangData]);

  const updateTenantLangMutation = useMutation({
    mutationFn: async (language: string) => {
      const res = await apiRequest("PUT", "/api/tenant/default-language", { language });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("languageSaved") });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/default-language"] });
    },
    onError: () => {
      toast({ title: t("languageSaveError"), variant: "destructive" });
    },
  });

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

  useEffect(() => {
    if (!profileDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [profileDirty]);

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
        toast({ title: t("saved") });
        matchedSections.forEach(([section]) => showSaveAnimation(section));
      } else if (matchedSections.length === 1) {
        const [section] = matchedSections[0];
        toast({ title: t("saved") });
        showSaveAnimation(section);
      }
    },
    onError: (err: any) => {
      toast({ title: t("saveError"), description: err.message, variant: "destructive" });
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setNameError(t("restaurantNameRequired")); return; }
    setNameError("");
    setProfileDirty(false);
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
  const currentTime = formatTimeInZone(timezone, timeFormat as "12hr" | "24hr", i18n.language);
  const currentDate = formatDateInZone(timezone, i18n.language);

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
        <p className="text-muted-foreground">{t("loadingSettings")}</p>
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
    vat: t("taxVat"),
    gst: t("taxGst"),
    sales_tax: t("taxSales"),
    service_tax: t("taxService"),
    custom: t("taxCustom"),
    none: t("taxNone"),
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
            <span className="text-sm font-medium text-green-600">{t("savedExclamation")}</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6" data-testid="page-settings">
      <PageTitle title={t("generalSettings")} />
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-heading" data-testid="text-settings-title">{t("title")}</h1>
          <p className="text-muted-foreground">{t("manageRestaurantConfig")}</p>
        </div>
      </div>

      <SubscriptionPlanCard />

      <ThemeCard />

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
                  <CardTitle>{t("businessConfig")}</CardTitle>
                </div>
                <CardDescription>{t("businessConfigDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleBusinessConfigSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("businessType")}</Label>
                    <Select value={businessType} onValueChange={(val) => setBusinessType(val as BusinessType)}>
                      <SelectTrigger data-testid="select-business-type"><SelectValue placeholder={t("selectBusinessType")} /></SelectTrigger>
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
                    <Label>{t("subscriptionPlan")}</Label>
                    <Select value={plan} onValueChange={(val) => setPlan(val as SubscriptionTier)}>
                      <SelectTrigger data-testid="select-plan"><SelectValue placeholder={t("selectPlan")} /></SelectTrigger>
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
                    <Save className="h-4 w-4 mr-2" /> {t("saveBusinessConfig")}
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
                  <CardTitle>{t("restaurantProfile")}</CardTitle>
                </div>
                <CardDescription>{t("restaurantProfileDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileSubmit} className="space-y-4" noValidate>
                  <p className="text-xs text-muted-foreground"><span className="text-red-500">*</span> {t("requiredField")}</p>
                  <div className="space-y-2">
                    <Label>{t("restaurantName")} <span className="text-red-500 ml-0.5">*</span></Label>
                    <Input value={name} onChange={(e) => { setName(e.target.value); setProfileDirty(true); if (e.target.value.trim()) setNameError(""); }} onBlur={(e) => { if (!e.target.value.trim()) setNameError(t("restaurantNameRequired")); }} className={nameError ? "border-red-500" : ""} data-testid="input-settings-name" />
                    {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>{t("restaurantAddress")}</Label>
                    <Input value={address} onChange={(e) => { setAddress(e.target.value); setProfileDirty(true); }} data-testid="input-settings-address" />
                  </div>
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-profile" className="transition-all duration-200 hover:scale-[1.02]">
                    <Save className="h-4 w-4 mr-2" /> {t("saveProfile")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900">
                    <Globe className="h-5 w-5 text-purple-700 dark:text-purple-300" />
                  </div>
                  <CardTitle>{t("defaultLanguage")}</CardTitle>
                </div>
                <CardDescription>{t("defaultLanguageDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 max-w-xs">
                  <Select
                    value={tenantDefaultLang}
                    onValueChange={(val) => {
                      setTenantDefaultLang(val);
                      updateTenantLangMutation.mutate(val);
                    }}
                  >
                    <SelectTrigger data-testid="select-default-language">
                      <SelectValue placeholder={t("selectLanguage")} />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code} data-testid={`option-lang-${lang.code}`}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  <CardTitle>{t("timezoneAndFormat")}</CardTitle>
                </div>
                <CardDescription>{t("timezoneDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleTimezoneSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("timezone")}</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger data-testid="select-timezone">
                        <SelectValue placeholder={t("selectTimezone")}>
                          {selectedTz ? `${selectedTz.flag} ${selectedTz.label} (${selectedTz.offset})` : timezone}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 pb-2 sticky top-0 bg-popover z-10">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder={t("searchTimezones")}
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
                          <div className="px-3 py-2 text-sm text-muted-foreground">{t("noTimezonesFound")}</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("timeFormat")}</Label>
                    <Select value={timeFormat} onValueChange={setTimeFormat}>
                      <SelectTrigger data-testid="select-time-format"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12hr" data-testid="option-time-12hr">{t("time12hr")}</SelectItem>
                        <SelectItem value="24hr" data-testid="option-time-24hr">{t("time24hr")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{t("currentTime")}</span>
                    </div>
                    <p className="text-2xl font-bold font-heading text-blue-800 dark:text-blue-200" data-testid="text-live-clock">{currentTime}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400" data-testid="text-live-date">{currentDate}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-timezone" className="transition-all duration-200 hover:scale-[1.02]">
                      <Save className="h-4 w-4 mr-2" /> {t("saveTimezone")}
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
                      <RotateCcw className="h-4 w-4 mr-2" /> {t("resetToBrowser")}
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
                  <CardTitle>{t("taxConfig")}</CardTitle>
                </div>
                <CardDescription>{t("taxConfigDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleTaxSubmit} className="space-y-4">
                  {currency === "INR" && (
                    <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 p-3 space-y-3">
                      <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide">{t("gstIndia")}</p>
                      <div className="space-y-2">
                        <Label>{t("gstinLabel", { name: t("restaurantName") })}</Label>
                        <Input
                          placeholder={t("gstinPlaceholder")}
                          value={gstin}
                          onChange={(e) => setGstin(e.target.value.toUpperCase())}
                          maxLength={15}
                          data-testid="input-settings-gstin"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <Label>{t("cgstRate")}</Label>
                          <Input type="number" step="0.5" min="0" max="50" value={cgstRate} onChange={(e) => setCgstRate(e.target.value)} data-testid="input-settings-cgst-rate" />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("sgstRate")}</Label>
                          <Input type="number" step="0.5" min="0" max="50" value={sgstRate} onChange={(e) => setSgstRate(e.target.value)} data-testid="input-settings-sgst-rate" />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("invoicePrefix")}</Label>
                          <Input placeholder="INV" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())} maxLength={10} data-testid="input-settings-invoice-prefix" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{t("gstCombinedNote", { prefix: invoicePrefix || "INV" })}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>{t("taxType")}</Label>
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
                      <Label>{t("taxRate")}</Label>
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
                      <Label>{t("serviceCharge")}</Label>
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
                      <Label className="text-sm font-medium">{t("compoundTax")}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("compoundTaxDesc")}</p>
                    </div>
                    <Switch
                      checked={compoundTax}
                      onCheckedChange={setCompoundTax}
                      disabled={taxType === "none"}
                      data-testid="switch-compound-tax"
                    />
                  </div>
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-tax" className="transition-all duration-200 hover:scale-[1.02]">
                    <Save className="h-4 w-4 mr-2" /> {t("saveTaxSettings")}
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
                  <CardTitle>{t("currencyConfig")}</CardTitle>
                </div>
                <CardDescription>{t("currencyConfigDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCurrencySubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("currency")}</Label>
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
                              placeholder={t("searchCurrencies")}
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
                          <div className="px-3 py-2 text-sm text-muted-foreground">{t("noCurrenciesFound")}</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("symbolPosition")}</Label>
                      <Select value={currencyPosition} onValueChange={setCurrencyPosition}>
                        <SelectTrigger data-testid="select-currency-position"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="before" data-testid="option-position-before">{t("positionBefore")}</SelectItem>
                          <SelectItem value="after" data-testid="option-position-after">{t("positionAfter")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("decimalPlaces")}</Label>
                      <Select value={String(currencyDecimals)} onValueChange={(v) => setCurrencyDecimals(Number(v))}>
                        <SelectTrigger data-testid="select-currency-decimals"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0" data-testid="option-decimals-0">{t("decimalPlaces0")}</SelectItem>
                          <SelectItem value="1" data-testid="option-decimals-1">{t("decimalPlaces1")}</SelectItem>
                          <SelectItem value="2" data-testid="option-decimals-2">{t("decimalPlaces2")}</SelectItem>
                          <SelectItem value="3" data-testid="option-decimals-3">{t("decimalPlaces3")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-2 mb-1">
                      <Eye className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{t("preview")}</span>
                    </div>
                    <p className="text-lg font-bold font-heading text-emerald-800 dark:text-emerald-200" data-testid="text-currency-preview">
                      {previewFormatted}
                    </p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">{t("sampleAmount")}</p>
                  </div>
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-currency" className="transition-all duration-200 hover:scale-[1.02]">
                    <Save className="h-4 w-4 mr-2" /> {t("saveCurrencySettings")}
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
                  <CardTitle>{t("paymentGateway")}</CardTitle>
                </div>
                <CardDescription>{t("paymentGatewayDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRazorpaySubmit} className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <Label className="text-sm font-medium">{t("enableRazorpay")}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("enableRazorpayDesc")}</p>
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
                        <Label>{t("razorpayKeyId")}</Label>
                        <Input
                          placeholder={t("razorpayKeyIdPlaceholder")}
                          value={razorpayKeyId}
                          onChange={(e) => setRazorpayKeyId(e.target.value.trim())}
                          data-testid="input-razorpay-key-id"
                        />
                        <p className="text-xs text-muted-foreground">{t("razorpayKeyIdHint")}</p>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("razorpayKeySecret")}</Label>
                        <Input
                          type="password"
                          placeholder={t("razorpayKeySecretPlaceholder")}
                          value={razorpayKeySecret}
                          onChange={(e) => setRazorpayKeySecret(e.target.value)}
                          autoComplete="new-password"
                          data-testid="input-razorpay-key-secret"
                        />
                        <p className="text-xs text-muted-foreground">{t("razorpayKeySecretHint")}</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                        <p className="font-semibold">{t("howItWorks")}</p>
                        <p>{t("razorpayHowItWorksDesc")}</p>
                      </div>
                    </div>
                  )}
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-razorpay" className="transition-all duration-200 hover:scale-[1.02]">
                    <Save className="h-4 w-4 mr-2" /> {t("saveGatewaySettings")}
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
              <Save className="h-4 w-4 mr-2" /> {t("saveAllChanges")}
            </Button>
          </motion.div>
        </div>

        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="sticky top-6 border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{t("livePreview")}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="h-3.5 w-3.5 text-blue-600" />
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">{t("clock")}</span>
                  </div>
                  <p className="text-xl font-bold font-heading" data-testid="text-preview-clock">{currentTime}</p>
                  <p className="text-xs text-muted-foreground">{selectedTz?.flag} {selectedTz?.label || timezone}</p>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Receipt className="h-3.5 w-3.5 text-orange-600" />
                    <span className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wider">{t("sampleReceipt")}</span>
                  </div>
                  <div className="rounded-lg border bg-card p-3 space-y-2 text-sm">
                    <div className="text-center font-bold text-base" data-testid="text-preview-restaurant-name">{name || t("yourRestaurant")}</div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("sampleItem1")}</span>
                      <span>{fmtPreview(18.50)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("sampleItem2")}</span>
                      <span>{fmtPreview(12.00)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("sampleItem3")}</span>
                      <span>{fmtPreview(4.50)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("sampleItem4")}</span>
                      <span>{fmtPreview(10.00)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-medium">
                      <span>{t("subtotal")}</span>
                      <span data-testid="text-preview-subtotal">{fmtPreview(sampleSubtotal)}</span>
                    </div>
                    {taxType !== "none" && sampleTaxPct > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>{taxTypeLabels[taxType]?.split(" (")[0] || t("tax")} ({sampleTaxPct}%)</span>
                        <span data-testid="text-preview-tax">{fmtPreview(sampleTax)}</span>
                      </div>
                    )}
                    {sampleServicePct > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t("serviceChargeLabel", { pct: sampleServicePct })}</span>
                        <span data-testid="text-preview-service">{fmtPreview(sampleService)}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between font-bold text-base">
                      <span>{t("total")}</span>
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
                  <span className="text-sm font-medium text-green-600">{t("savedExclamation")}</span>
                </div>
              </div>
            )}
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                {t("kitchenStationPrinters")}
              </CardTitle>
              <CardDescription>
                {t("kitchenStationPrintersDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {kitchenStations.map((station) => (
                <div key={station.id} className="flex items-center gap-3" data-testid={`station-printer-row-${station.id}`}>
                  <Label className="w-28 shrink-0 font-medium capitalize">{station.name}</Label>
                  <Input
                    placeholder={t("printerUrlPlaceholder")}
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
                    <Save className="h-3 w-3 mr-1" /> {t("save")}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mt-8">
        <PrintQueuePanel restaurantName={tenant?.name || t("yourRestaurant")} />
      </div>
    </motion.div>
  );
}
