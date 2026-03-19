import { useState, useCallback } from "react";
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

interface StepProps {
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  loading: boolean;
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
  onNext,
  onSkip,
  loading,
  initialData,
}: StepProps & { initialData: { businessType: string; cuisineStyle: string; phone: string } }) {
  const [businessType, setBusinessType] = useState(initialData.businessType || "casual_dining");
  const [cuisineStyle, setCuisineStyle] = useState(initialData.cuisineStyle || "");
  const [phone, setPhone] = useState(initialData.phone || "");

  const handleNext = () => {
    onNext();
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="businessType">Business Type <span className="text-destructive">*</span></Label>
        <Select value={businessType} onValueChange={setBusinessType}>
          <SelectTrigger id="businessType" data-testid="select-business-type">
            <SelectValue placeholder="Select business type" />
          </SelectTrigger>
          <SelectContent>
            {BUSINESS_TYPES.map((bt) => (
              <SelectItem key={bt.value} value={bt.value} data-testid={`option-business-type-${bt.value}`}>
                {bt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cuisineStyle">
          Cuisine Style <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <div className="relative">
          <UtensilsCrossed className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="cuisineStyle"
            data-testid="input-cuisine-style"
            placeholder="e.g. Italian, Asian Fusion, Mediterranean"
            className="pl-10"
            value={cuisineStyle}
            onChange={(e) => setCuisineStyle(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">
          Phone Number <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="phone"
            data-testid="input-phone"
            placeholder="+1 (555) 000-0000"
            className="pl-10"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
          onClick={() => {
            (window as any).__onboardingStep1 = { businessType, cuisineStyle, phone };
            handleNext();
          }}
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
  onNext,
  onBack,
  loading,
  initialData,
}: StepProps & { initialData: { address: string; country: string; timezone: string } }) {
  const [address, setAddress] = useState(initialData.address || "");
  const [country, setCountry] = useState(initialData.country || "");
  const [timezone, setTimezone] = useState(initialData.timezone || "UTC");
  const [tzSearch, setTzSearch] = useState("");

  const filteredTimezones = tzSearch
    ? timezones.filter(
        (tz) =>
          tz.label.toLowerCase().includes(tzSearch.toLowerCase()) ||
          tz.iana.toLowerCase().includes(tzSearch.toLowerCase()) ||
          tz.region.toLowerCase().includes(tzSearch.toLowerCase())
      )
    : timezones;

  const selectedTz = timezones.find((tz) => tz.iana === timezone);

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
            value={address}
            onChange={(e) => setAddress(e.target.value)}
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
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Timezone <span className="text-destructive">*</span></Label>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger data-testid="select-timezone">
            <SelectValue>
              {selectedTz ? `${selectedTz.flag} ${selectedTz.label} (${selectedTz.offset})` : timezone}
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
                <SelectItem key={tz.iana} value={tz.iana} data-testid={`option-timezone-${tz.iana}`}>
                  {tz.flag} {tz.label} ({tz.offset})
                </SelectItem>
              ))}
            </div>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2" data-testid="button-back-step2">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={() => {
            (window as any).__onboardingStep2 = { address, country, timezone };
            onNext();
          }}
          className="gap-2"
          disabled={loading || !timezone}
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
  onNext,
  onBack,
  loading,
  initialData,
}: StepProps & { initialData: { currency: string; taxRate: string; serviceCharge: string } }) {
  const [currency, setCurrency] = useState(initialData.currency || "USD");
  const [taxRate, setTaxRate] = useState(initialData.taxRate || "0");
  const [serviceCharge, setServiceCharge] = useState(initialData.serviceCharge || "0");

  const sampleAmount = 100;
  const tax = (sampleAmount * parseFloat(taxRate || "0")) / 100;
  const sc = (sampleAmount * parseFloat(serviceCharge || "0")) / 100;
  const total = sampleAmount + tax + sc;

  const currencies = Object.values(currencyMap);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Currency <span className="text-destructive">*</span></Label>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger data-testid="select-currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <div className="max-h-56 overflow-y-auto">
              {currencies.map((c) => (
                <SelectItem key={c.code} value={c.code} data-testid={`option-currency-${c.code}`}>
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
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
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
              value={serviceCharge}
              onChange={(e) => setServiceCharge(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-2" data-testid="price-preview">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Live Preview</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(sampleAmount, currency)}</span>
          </div>
          {parseFloat(taxRate) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax ({taxRate}%)</span>
              <span>{formatCurrency(tax, currency)}</span>
            </div>
          )}
          {parseFloat(serviceCharge) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service ({serviceCharge}%)</span>
              <span>{formatCurrency(sc, currency)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t pt-1 mt-1">
            <span>Total</span>
            <span className="text-primary">{formatCurrency(total, currency)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2" data-testid="button-back-step3">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={() => {
            (window as any).__onboardingStep3 = { currency, taxRate, serviceCharge };
            onNext();
          }}
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
  onNext,
  onBack,
  onSkip,
  loading,
}: StepProps) {
  const [outletName, setOutletName] = useState("Main Branch");
  const [outletAddress, setOutletAddress] = useState("");

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="outletName">Outlet Name <span className="text-destructive">*</span></Label>
        <div className="relative">
          <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="outletName"
            data-testid="input-outlet-name"
            placeholder="e.g. Main Branch"
            className="pl-10"
            value={outletName}
            onChange={(e) => setOutletName(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="outletAddress">
          Outlet Address <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="outletAddress"
            data-testid="input-outlet-address"
            placeholder="123 Main Street, City"
            className="pl-10"
            value={outletAddress}
            onChange={(e) => setOutletAddress(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2" data-testid="button-back-step4">
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
            onClick={() => {
              (window as any).__onboardingStep4 = { name: outletName, address: outletAddress };
              onNext();
            }}
            className="gap-2"
            disabled={loading || !outletName.trim()}
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
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 60 : -60,
    opacity: 0,
  }),
};

export default function OnboardingPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { tenant } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);

  const goNext = useCallback(() => {
    setDirection(1);
    setStep((s) => s + 1);
  }, []);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep((s) => s - 1);
  }, []);

  const handleSkip = useCallback(async () => {
    setLoading(true);
    try {
      await apiRequest("POST", "/api/onboarding/complete", {});
      queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/");
    } catch {
      navigate("/");
    } finally {
      setLoading(false);
    }
  }, [navigate, queryClient]);

  const handleStep1Next = useCallback(async () => {
    const data = (window as any).__onboardingStep1 || {};
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/onboarding/profile", {
        businessType: data.businessType || "casual_dining",
        cuisineStyle: data.cuisineStyle || "",
        phone: data.phone || "",
      });
      goNext();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "Failed to save" });
    } finally {
      setLoading(false);
    }
  }, [goNext, toast]);

  const handleStep2Next = useCallback(async () => {
    const data = (window as any).__onboardingStep2 || {};
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/onboarding/location", {
        address: data.address || "",
        country: data.country || "",
        timezone: data.timezone || "UTC",
      });
      goNext();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "Failed to save" });
    } finally {
      setLoading(false);
    }
  }, [goNext, toast]);

  const handleStep3Next = useCallback(async () => {
    const data = (window as any).__onboardingStep3 || {};
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/onboarding/config", {
        currency: data.currency || "USD",
        taxRate: data.taxRate || "0",
        serviceCharge: data.serviceCharge || "0",
      });
      goNext();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "Failed to save" });
    } finally {
      setLoading(false);
    }
  }, [goNext, toast]);

  const handleStep4Next = useCallback(async () => {
    const data = (window as any).__onboardingStep4 || {};
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/onboarding/outlet", {
        name: data.name || "Main Branch",
        address: data.address || "",
      });
      await apiRequest("POST", "/api/onboarding/complete", {});
      queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Welcome to Table Salt!",
        description: "Your restaurant is ready. Let's get started!",
      });
      navigate("/");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "Failed to complete setup" });
    } finally {
      setLoading(false);
    }
  }, [navigate, queryClient, toast]);

  const stepTitles: Record<number, { title: string; subtitle: string }> = {
    1: { title: "Tell us about your restaurant", subtitle: "Help us personalise your experience" },
    2: { title: "Where are you located?", subtitle: "Set your address and timezone" },
    3: { title: "Regional settings", subtitle: "Configure currency and pricing" },
    4: { title: "Your first outlet", subtitle: "Every great restaurant starts somewhere" },
  };

  const current = stepTitles[step];

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="onboarding-page">
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
              <h1 className="text-xl font-heading font-bold" data-testid={`text-step-${step}-title`}>
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
                    onNext={handleStep1Next}
                    onSkip={handleSkip}
                    loading={loading}
                    initialData={{
                      businessType: tenant?.businessType || "casual_dining",
                      cuisineStyle: tenant?.cuisineStyle || "",
                      phone: tenant?.phone || "",
                    }}
                  />
                )}
                {step === 2 && (
                  <Step2Location
                    onNext={handleStep2Next}
                    onBack={goBack}
                    loading={loading}
                    initialData={{
                      address: tenant?.address || "",
                      country: tenant?.country || "",
                      timezone: tenant?.timezone || "UTC",
                    }}
                  />
                )}
                {step === 3 && (
                  <Step3Config
                    onNext={handleStep3Next}
                    onBack={goBack}
                    loading={loading}
                    initialData={{
                      currency: tenant?.currency || "USD",
                      taxRate: tenant?.taxRate || "0",
                      serviceCharge: tenant?.serviceCharge || "0",
                    }}
                  />
                )}
                {step === 4 && (
                  <Step4Outlet
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
