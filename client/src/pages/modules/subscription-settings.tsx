import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Check, CreditCard, Zap, Star, Building2, Clock, AlertTriangle, ExternalLink, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { tierPricing } from "@/lib/subscription";

interface BillingStatus {
  plan: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  stripeCustomerId: string | null;
  stripeConfigured: boolean;
}

const PLAN_FEATURES: Record<string, { label: string; description: string; features: string[]; icon: React.ReactNode; color: string }> = {
  starter: {
    label: "Starter",
    description: "30-day free trial with Standard features",
    icon: <Zap className="h-5 w-5" />,
    color: "text-slate-600",
    features: [
      "Orders & menu management",
      "Basic table management",
      "POS & outlets",
      "Staff management",
      "Inventory tracking",
      "Cleaning checklists",
      "Reservations",
    ],
  },
  basic: {
    label: "Basic",
    description: "Core features for a single outlet",
    icon: <Zap className="h-5 w-5" />,
    color: "text-blue-600",
    features: [
      "Orders & menu management",
      "Table management",
      "Point of Sale (POS)",
      "Up to 3 outlets",
      "Staff & inventory",
      "Cleaning checklists",
    ],
  },
  standard: {
    label: "Standard",
    description: "Full operations for growing restaurants",
    icon: <Star className="h-5 w-5" />,
    color: "text-teal-600",
    features: [
      "Everything in Basic",
      "Invoice history & billing",
      "Advanced reports",
      "CRM & loyalty program",
      "Delivery management",
      "Audit tools",
      "Reservation system",
      "Offers & promotions",
    ],
  },
  premium: {
    label: "Premium",
    description: "Enterprise-grade for restaurant groups",
    icon: <Building2 className="h-5 w-5" />,
    color: "text-purple-600",
    features: [
      "Everything in Standard",
      "Advanced analytics & BI",
      "Multi-location management",
      "Third-party integrations",
      "Custom branding",
      "API access",
      "Priority support",
    ],
  },
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  trialing: { label: "Free Trial", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  past_due: { label: "Payment Failed", variant: "destructive" },
  canceled: { label: "Canceled", variant: "outline" },
  paused: { label: "Paused", variant: "outline" },
  trial_expired: { label: "Trial Ended", variant: "destructive" },
};

export default function SubscriptionSettings() {
  const { tenant } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);

  const { data: billing, isLoading, refetch } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
    staleTime: 10000,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "1") {
      toast({ title: "Subscription activated!", description: "Your plan has been upgraded successfully." });
      refetch();
    }
  }, []);

  const handleUpgrade = async (plan: string) => {
    if (!billing?.stripeConfigured) {
      toast({
        variant: "destructive",
        title: "Stripe not configured",
        description: "The payment system is not yet set up. Please contact the administrator.",
      });
      return;
    }
    setLoadingPlan(plan);
    try {
      const res = await apiRequest("POST", "/api/billing/create-checkout-session", { plan });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start checkout";
      toast({ variant: "destructive", title: "Checkout error", description: msg });
      setLoadingPlan(null);
    }
  };

  const handleManageBilling = async () => {
    if (!billing?.stripeConfigured) {
      toast({ variant: "destructive", title: "Stripe not configured", description: "Contact admin." });
      return;
    }
    setLoadingPortal(true);
    try {
      const res = await apiRequest("POST", "/api/billing/portal", {});
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to open billing portal";
      toast({ variant: "destructive", title: "Portal error", description: msg });
      setLoadingPortal(false);
    }
  };

  const currentPlan = billing?.plan ?? tenant?.plan ?? "basic";
  const status = billing?.subscriptionStatus ?? tenant?.subscriptionStatus ?? "trialing";
  const statusInfo = STATUS_LABELS[status] ?? { label: status, variant: "outline" as const };
  const isTrialing = status === "trialing";
  const isActive = status === "active";
  const isPastDue = status === "past_due";
  const isTrialExpired = status === "trial_expired";

  const planOrder = ["basic", "standard", "premium"];
  const displayPlans = isTrialing ? ["starter", "basic", "standard", "premium"] : ["basic", "standard", "premium"];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 bg-muted rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-72 bg-muted rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (isTrialExpired) {
    return (
      <div className="space-y-6" data-testid="subscription-settings">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Subscription & Billing</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your plan and payment method</p>
        </div>

        <Card className="border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800" data-testid="banner-trial-expired">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/40 shrink-0">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-red-800 dark:text-red-200">Your free trial has ended</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  Your 30-day trial has expired. Upgrade to a paid plan to continue using all features and keep your data.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["basic", "standard", "premium"].map((plan) => (
                    <Button
                      key={plan}
                      size="sm"
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                      onClick={() => handleUpgrade(plan)}
                      disabled={!!loadingPlan}
                      data-testid={`button-upgrade-${plan}`}
                    >
                      <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                      {loadingPlan === plan ? "Redirecting..." : `Upgrade to ${PLAN_FEATURES[plan]?.label} — $${tierPricing[plan as keyof typeof tierPricing]?.price ?? "?"}/mo`}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Choose a Plan</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {["basic", "standard", "premium"].map((planKey) => {
              const plan = PLAN_FEATURES[planKey];
              if (!plan) return null;
              const pricing = tierPricing[planKey as keyof typeof tierPricing];
              return (
                <motion.div
                  key={planKey}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: ["basic", "standard", "premium"].indexOf(planKey) * 0.05 }}
                >
                  <Card className="h-full flex flex-col hover:shadow-md transition-all" data-testid={`plan-card-${planKey}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`p-1.5 rounded-lg bg-muted ${plan.color}`}>{plan.icon}</div>
                      </div>
                      <div className="mt-2">
                        <CardTitle className="text-base">{plan.label}</CardTitle>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-bold text-foreground">${pricing?.price ?? "—"}</span>
                          <span className="text-sm text-muted-foreground">/mo</span>
                        </div>
                        <CardDescription className="mt-1 text-xs">{plan.description}</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col">
                      <ul className="space-y-1.5 flex-1">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Check className="h-3.5 w-3.5 text-teal-500 shrink-0 mt-0.5" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4">
                        <Button
                          size="sm"
                          className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                          onClick={() => handleUpgrade(planKey)}
                          disabled={!!loadingPlan}
                          data-testid={`button-upgrade-${planKey}`}
                        >
                          <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                          {loadingPlan === planKey ? "Redirecting..." : "Upgrade"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="subscription-settings">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Subscription & Billing</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your plan and payment method</p>
      </div>

      <Card data-testid="current-plan-card">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Current Plan</CardTitle>
              <CardDescription className="mt-1">
                {isTrialing
                  ? `Free trial — ${billing?.trialDaysLeft ?? 0} days remaining`
                  : isActive
                  ? "Subscription active"
                  : statusInfo.label}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusInfo.variant} data-testid="status-badge">
                {statusInfo.label}
              </Badge>
              <Badge variant="outline" className="capitalize" data-testid="plan-badge">
                {PLAN_FEATURES[currentPlan]?.label ?? currentPlan}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isTrialing && billing?.trialEndsAt && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-teal-50 border border-teal-200 dark:bg-teal-950/20 dark:border-teal-800">
              <Clock className="h-4 w-4 text-teal-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-teal-800 dark:text-teal-200">
                  1-month free trial — {billing.trialDaysLeft} day{billing.trialDaysLeft !== 1 ? "s" : ""} left
                </p>
                <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">
                  Trial ends {new Date(billing.trialEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
                <div className="mt-2 h-1.5 bg-teal-200 dark:bg-teal-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.round(((30 - (billing.trialDaysLeft ?? 0)) / 30) * 100))}%` }}
                    data-testid="subscription-progress-bar"
                  />
                </div>
              </div>
            </div>
          )}
          {isPastDue && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">Payment failed — action required</p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
                  Your last payment failed. Update your payment method immediately to restore full access.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleManageBilling}
                  disabled={loadingPortal}
                  className="mt-2"
                  data-testid="button-fix-payment"
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  {loadingPortal ? "Opening..." : "Fix Payment"}
                </Button>
              </div>
            </div>
          )}
          {isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleManageBilling}
              disabled={loadingPortal}
              className="mt-2"
              data-testid="button-manage-billing"
            >
              <ExternalLink className="h-4 w-4 mr-1.5" />
              {loadingPortal ? "Opening..." : "Manage Billing"}
            </Button>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Choose a Plan</h3>
        <div className={`grid grid-cols-1 gap-4 ${displayPlans.length === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
          {displayPlans.map((planKey) => {
            const plan = PLAN_FEATURES[planKey];
            if (!plan) return null;
            const pricing = tierPricing[planKey as keyof typeof tierPricing];
            const isCurrent = isTrialing && planKey === "starter"
              ? true
              : !isTrialing && currentPlan === planKey;
            const isUpgrade = planKey !== "starter" && planOrder.indexOf(planKey) > planOrder.indexOf(currentPlan);
            const isDowngrade = planKey !== "starter" && planOrder.indexOf(planKey) < planOrder.indexOf(currentPlan);

            return (
              <motion.div
                key={planKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: displayPlans.indexOf(planKey) * 0.05 }}
              >
                <Card
                  className={`h-full flex flex-col transition-all ${isCurrent ? "border-teal-500 ring-1 ring-teal-500 shadow-md" : "hover:shadow-md"}`}
                  data-testid={`plan-card-${planKey}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`p-1.5 rounded-lg bg-muted ${plan.color}`}>
                        {plan.icon}
                      </div>
                      {isCurrent && (
                        <Badge className="bg-teal-500 text-white border-0 text-xs" data-testid={`badge-current-${planKey}`}>
                          {planKey === "starter" ? "Trial Plan" : "Current Plan"}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2">
                      <CardTitle className="text-base">
                        {plan.label}
                        {planKey === "starter" && (
                          <Badge variant="secondary" className="ml-2 text-xs align-middle">Trial</Badge>
                        )}
                      </CardTitle>
                      <div className="flex items-baseline gap-1 mt-1">
                        {planKey === "starter" ? (
                          <span className="text-xl font-bold text-foreground">Free Trial</span>
                        ) : pricing ? (
                          <>
                            <span className="text-2xl font-bold text-foreground">${pricing.price}</span>
                            <span className="text-sm text-muted-foreground">/mo</span>
                          </>
                        ) : null}
                      </div>
                      <CardDescription className="mt-1 text-xs">{plan.description}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <ul className="space-y-1.5 flex-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Check className="h-3.5 w-3.5 text-teal-500 shrink-0 mt-0.5" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4">
                      {isCurrent ? (
                        <Button variant="outline" size="sm" className="w-full" disabled data-testid={`button-current-${planKey}`}>
                          {planKey === "starter" ? "Trial Plan" : "Current Plan"}
                        </Button>
                      ) : planKey === "starter" ? (
                        <Button variant="outline" size="sm" className="w-full" disabled>
                          Trial Plan
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className={`w-full ${isUpgrade ? "bg-teal-600 hover:bg-teal-700 text-white" : "bg-slate-600 hover:bg-slate-700 text-white"}`}
                          onClick={() => handleUpgrade(planKey)}
                          disabled={!!loadingPlan}
                          data-testid={`button-upgrade-${planKey}`}
                        >
                          <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                          {loadingPlan === planKey ? "Redirecting..." : isUpgrade ? "Upgrade" : isDowngrade ? "Downgrade" : "Switch"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {!billing?.stripeConfigured && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Payment processing unavailable</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  The Stripe payment integration is not connected. Contact the platform administrator to enable subscription upgrades.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
