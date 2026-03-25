import { useState, useCallback } from "react";
import { PageTitle } from "@/lib/accessibility";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { TableSaltLogo } from "@/components/brand/table-salt-logo";
import { timezones } from "@/lib/timezones";
import { currencyMap, formatCurrency } from "@shared/currency";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Building2,
  MapPin,
  DollarSign,
  Store,
  Phone,
  UtensilsCrossed,
  Globe,
  Percent,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const BUSINESS_TYPES = [
  { value: "casual_dining", label: "Casual Dining" },
  { value: "fast_food", label: "Fast Food" },
  { value: "cafe", label: "Café" },
  { value: "fine_dining", label: "Fine Dining" },
  { value: "food_truck", label: "Food Truck" },
  { value: "cloud_kitchen", label: "Cloud Kitchen" },
  { value: "bar", label: "Bar" },
  { value: "bakery", label: "Bakery" },
  { value: "other", label: "Other" },
];

const STEPS = [
  { id: 1, label: "Restaurant", icon: Building2 },
  { id: 2, label: "Location", icon: MapPin },
  { id: 3, label: "Settings", icon: DollarSign },
  { id: 4, label: "Outlet", icon: Store },
];

interface ProfileData {
  businessType: string;
  cuisineStyle: string;
  phone: string;
}

interface LocationData {
  address: string;
  country: string;
  timezone: string;
}

interface ConfigData {
  currency: string;
  taxRate: string;
  serviceCharge: string;
}

interface OutletData {
  name: string;
  address: string;
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const isComplete = currentStep > step.id;
        const isActive = currentStep === step.id;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <motion.div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                  isComplete
                    ? "bg-primary border-primary text-white"
                    : isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted-foreground/30 bg-background text-muted-foreground/50"
                }`}
                initial={false}
                animate={{ scale: isActive ? 1.1 : 1 }}
                transition={{ duration: 0.2 }}
                data-testid={`step-indicator-${step.id}`}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </motion.div>
              <span
                className={`text-xs mt-1 font-medium ${
                  isActive ? "text-primary" : isComplete ? "text-primary/70" : "text-muted-foreground/50"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`w-12 h-0.5 mb-5 mx-1 transition-colors ${
                  currentStep > step.id ? "bg-primary" : "bg-muted-foreground/20"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Step1Profile({
  data,
  onChange,
  onNext,
  onSkip,
  loading,
}: {
  data: ProfileData;
  onChange: (d: ProfileData) => void;
  onNext: () => void;
  onSkip: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="businessType">
          Business Type <span className="text-destructive">*</span>
        </Label>
        <Select
          value={data.businessType}
          onValueChange={(v) => onChange({ ...data, businessType: v })}
        >
          <SelectTrigger id="businessType" data-testid="select-business-type">
            <SelectValue placeholder="Select business type" />
          </SelectTrigger>
          <SelectContent>
            {BUSINESS_TYPES.map((bt) => (
              <SelectItem
                key={bt.value}
                value={bt.value}
                data-testid={`option-business-type-${bt.value}`}
              >
                {bt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cuisineStyle">
          Cuisine Style{" "}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <div className="relative">
          <UtensilsCrossed className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="cuisineStyle"
            data-testid="input-cuisine-style"
            placeholder="e.g. Italian, Asian Fusion, Mediterranean"
            className="pl-10"
            value={data.cuisineStyle}
            onChange={(e) => onChange({ ...data, cuisineStyle: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">
          Phone Number{" "}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="phone"
            data-testid="input-phone"
            placeholder="+1 (555) 000-0000"
            className="pl-10"
            type="tel"
            value={data.phone}
            onChange={(e) => onChange({ ...data, phone: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={onSkip}
          data-testid="button-skip-onboarding"
        >
          Skip setup for now
        </button>
        <Button
          onClick={onNext}
          className="gap-2"
          data-testid="button-next-step1"
          disabled={loading}
        >
          Continue
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Step2Location({
  data,
  onChange,
  onNext,
  onBack,
  loading,
}: {
  data: LocationData;
  onChange: (d: LocationData) => void;
  onNext: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  const [tzSearch, setTzSearch] = useState("");

  const filteredTimezones = tzSearch
    ? timezones.filter(
        (tz) =>
          tz.label.toLowerCase().includes(tzSearch.toLowerCase()) ||
          tz.iana.toLowerCase().includes(tzSearch.toLowerCase()) ||
          tz.region.toLowerCase().includes(tzSearch.toLowerCase())
      )
    : timezones;

  const selectedTz = timezones.find((tz) => tz.iana === data.timezone);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="address">Restaurant Address</Label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="address"
            data-testid="input-address"
            placeholder="123 Main Street"
            className="pl-10"
            value={data.address}
            onChange={(e) => onChange({ ...data, address: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="country">City / Country</Label>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="country"
            data-testid="input-country"
            placeholder="e.g. New York, USA"
            className="pl-10"
            value={data.country}
            onChange={(e) => onChange({ ...data, country: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>
          Timezone <span className="text-destructive">*</span>
        </Label>
        <Select
          value={data.timezone}
          onValueChange={(v) => onChange({ ...data, timezone: v })}
        >
          <SelectTrigger data-testid="select-timezone">
            <SelectValue>
              {selectedTz
                ? `${selectedTz.flag} ${selectedTz.label} (${selectedTz.offset})`
                : data.timezone}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <div className="p-2">
              <Input
                placeholder="Search timezone..."
                value={tzSearch}
                onChange={(e) => setTzSearch(e.target.value)}
                className="h-8 text-sm"
                data-testid="input-timezone-search"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredTimezones.map((tz) => (
                <SelectItem
                  key={tz.iana}
                  value={tz.iana}
                  data-testid={`option-timezone-${tz.iana}`}
                >
                  {tz.flag} {tz.label} ({tz.offset})
                </SelectItem>
              ))}
            </div>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={onBack}
          className="gap-2"
          data-testid="button-back-step2"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          className="gap-2"
          disabled={loading || !data.timezone}
          data-testid="button-next-step2"
        >
          Continue
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Step3Config({
  data,
  onChange,
  onNext,
  onBack,
  loading,
}: {
  data: ConfigData;
  onChange: (d: ConfigData) => void;
  onNext: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  const sampleAmount = 100;
  const tax = (sampleAmount * parseFloat(data.taxRate || "0")) / 100;
  const sc = (sampleAmount * parseFloat(data.serviceCharge || "0")) / 100;
  const total = sampleAmount + tax + sc;
  const currencies = Object.values(currencyMap);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>
          Currency <span className="text-destructive">*</span>
        </Label>
        <Select
          value={data.currency}
          onValueChange={(v) => onChange({ ...data, currency: v })}
        >
          <SelectTrigger data-testid="select-currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <div className="max-h-56 overflow-y-auto">
              {currencies.map((c) => (
                <SelectItem
                  key={c.code}
                  value={c.code}
                  data-testid={`option-currency-${c.code}`}
                >
                  {c.symbol} — {c.name} ({c.code})
                </SelectItem>
              ))}
            </div>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="taxRate">Tax Rate (%)</Label>
          <div className="relative">
            <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="taxRate"
              data-testid="input-tax-rate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              placeholder="0"
              className="pl-10"
              value={data.taxRate}
              onChange={(e) => onChange({ ...data, taxRate: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="serviceCharge">Service Charge (%)</Label>
          <div className="relative">
            <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="serviceCharge"
              data-testid="input-service-charge"
              type="number"
              min="0"
              max="100"
              step="0.1"
              placeholder="0"
              className="pl-10"
              value={data.serviceCharge}
              onChange={(e) =>
                onChange({ ...data, serviceCharge: e.target.value })
              }
            />
          </div>
        </div>
      </div>

      <div
        className="rounded-lg border bg-muted/30 p-4 space-y-2"
        data-testid="price-preview"
      >
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Live Preview
        </p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(sampleAmount, data.currency)}</span>
          </div>
          {parseFloat(data.taxRate) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax ({data.taxRate}%)</span>
              <span>{formatCurrency(tax, data.currency)}</span>
            </div>
          )}
          {parseFloat(data.serviceCharge) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Service ({data.serviceCharge}%)
              </span>
              <span>{formatCurrency(sc, data.currency)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t pt-1 mt-1">
            <span>Total</span>
            <span className="text-primary">{formatCurrency(total, data.currency)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={onBack}
          className="gap-2"
          data-testid="button-back-step3"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          className="gap-2"
          disabled={loading}
          data-testid="button-next-step3"
        >
          Continue
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Step4Outlet({
  data,
  onChange,
  onNext,
  onBack,
  onSkip,
  loading,
}: {
  data: OutletData;
  onChange: (d: OutletData) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="outletName">
          Outlet Name <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="outletName"
            data-testid="input-outlet-name"
            placeholder="e.g. Main Branch"
            className="pl-10"
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="outletAddress">
          Outlet Address{" "}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="outletAddress"
            data-testid="input-outlet-address"
            placeholder="123 Main Street, City"
            className="pl-10"
            value={data.address}
            onChange={(e) => onChange({ ...data, address: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={onBack}
          className="gap-2"
          data-testid="button-back-step4"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={onSkip}
            data-testid="button-skip-outlet"
          >
            Skip
          </button>
          <Button
            onClick={onNext}
            className="gap-2"
            disabled={loading || !data.name.trim()}
            data-testid="button-finish-setup"
          >
            {loading ? (
              <motion.div
                className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            ) : (
              <>
                Finish Setup
                <Check className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction < 0 ? 60 : -60, opacity: 0 }),
};

export default function OnboardingPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { tenant } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);

  const [profileData, setProfileData] = useState<ProfileData>({
    businessType: tenant?.businessType || "casual_dining",
    cuisineStyle: tenant?.cuisineStyle || "",
    phone: tenant?.phone || "",
  });

  const [locationData, setLocationData] = useState<LocationData>({
    address: tenant?.address || "",
    country: tenant?.country || "",
    timezone: tenant?.timezone || "UTC",
  });

  const [configData, setConfigData] = useState<ConfigData>({
    currency: tenant?.currency || "USD",
    taxRate: tenant?.taxRate || "0",
    serviceCharge: tenant?.serviceCharge || "0",
  });

  const [outletData, setOutletData] = useState<OutletData>({
    name: "Main Branch",
    address: "",
  });

  const goNext = useCallback(() => {
    setDirection(1);
    setStep((s) => s + 1);
  }, []);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep((s) => s - 1);
  }, []);

  const invalidateTenant = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  }, [queryClient]);

  const handleSkip = useCallback(async () => {
    setLoading(true);
    try {
      await apiRequest("POST", "/api/onboarding/complete", {});
      invalidateTenant();
      try { if (tenant?.id) localStorage.setItem(`welcome_pending_${tenant.id}`, "true"); } catch {}
      navigate("/");
    } catch {
      navigate("/");
    } finally {
      setLoading(false);
    }
  }, [navigate, invalidateTenant, tenant]);

  const handleStep1Next = useCallback(async () => {
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/onboarding/profile", {
        businessType: profileData.businessType,
        cuisineStyle: profileData.cuisineStyle,
        phone: profileData.phone,
      });
      goNext();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setLoading(false);
    }
  }, [profileData, goNext, toast]);

  const handleStep2Next = useCallback(async () => {
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/onboarding/location", {
        address: locationData.address,
        country: locationData.country,
        timezone: locationData.timezone,
      });
      goNext();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setLoading(false);
    }
  }, [locationData, goNext, toast]);

  const handleStep3Next = useCallback(async () => {
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/onboarding/config", {
        currency: configData.currency,
        taxRate: configData.taxRate,
        serviceCharge: configData.serviceCharge,
      });
      goNext();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setLoading(false);
    }
  }, [configData, goNext, toast]);

  const handleStep4Next = useCallback(async () => {
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/onboarding/outlet", {
        name: outletData.name,
        address: outletData.address,
      });
      await apiRequest("POST", "/api/onboarding/complete", {});
      invalidateTenant();
      try { if (tenant?.id) localStorage.setItem(`welcome_pending_${tenant.id}`, "true"); } catch {}
      toast({
        title: "Welcome to Table Salt!",
        description: "Your restaurant is ready.",
      });
      navigate("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to complete setup";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setLoading(false);
    }
  }, [outletData, navigate, invalidateTenant, toast]);

  const stepTitles: Record<number, { title: string; subtitle: string }> = {
    1: { title: "Tell us about your restaurant", subtitle: "Help us personalise your experience" },
    2: { title: "Where are you located?", subtitle: "Set your address and timezone" },
    3: { title: "Regional settings", subtitle: "Configure currency and pricing" },
    4: { title: "Your first outlet", subtitle: "Every great restaurant starts somewhere" },
  };

  const current = stepTitles[step];

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="onboarding-page">
      <PageTitle title="Welcome" />
      <header className="flex items-center justify-between px-6 py-4 border-b">
        <TableSaltLogo variant="full" iconSize={28} />
        <div className="text-sm text-muted-foreground">
          Step {step} of {STEPS.length}
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-lg">
          <StepIndicator currentStep={step} />

          <motion.div
            className="rounded-xl border bg-card shadow-sm p-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="mb-6">
              <h1
                className="text-xl font-heading font-bold"
                data-testid={`text-step-${step}-title`}
              >
                {current.title}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{current.subtitle}</p>
            </div>

            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: "easeInOut" }}
              >
                {step === 1 && (
                  <Step1Profile
                    data={profileData}
                    onChange={setProfileData}
                    onNext={handleStep1Next}
                    onSkip={handleSkip}
                    loading={loading}
                  />
                )}
                {step === 2 && (
                  <Step2Location
                    data={locationData}
                    onChange={setLocationData}
                    onNext={handleStep2Next}
                    onBack={goBack}
                    loading={loading}
                  />
                )}
                {step === 3 && (
                  <Step3Config
                    data={configData}
                    onChange={setConfigData}
                    onNext={handleStep3Next}
                    onBack={goBack}
                    loading={loading}
                  />
                )}
                {step === 4 && (
                  <Step4Outlet
                    data={outletData}
                    onChange={setOutletData}
                    onNext={handleStep4Next}
                    onBack={goBack}
                    onSkip={handleSkip}
                    loading={loading}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            You can update these settings anytime from{" "}
            <span className="font-medium">Settings → Restaurant Profile</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
