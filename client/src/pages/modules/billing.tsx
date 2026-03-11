import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CreditCard, Check, Crown, Zap, Star, Shield, ArrowRight,
  Building2, Users, BarChart3, Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const plans = [
  {
    id: "basic",
    name: "Basic",
    price: 0,
    icon: Zap,
    color: "text-teal-600",
    bg: "bg-teal-100 dark:bg-teal-900",
    borderColor: "border-teal-200 dark:border-teal-800",
    features: [
      "1 outlet",
      "Order management",
      "Basic menu management",
      "Up to 3 staff accounts",
    ],
    limitations: [
      "No POS or tables",
      "No analytics",
      "No integrations",
    ],
  },
  {
    id: "standard",
    name: "Standard",
    price: 29,
    icon: Star,
    color: "text-amber-600",
    bg: "bg-amber-100 dark:bg-amber-900",
    borderColor: "border-amber-200 dark:border-amber-800",
    popular: true,
    features: [
      "Up to 3 outlets",
      "Everything in Basic",
      "POS & table management",
      "Inventory management",
      "Staff scheduling",
      "Reservations",
      "Up to 15 staff accounts",
    ],
    limitations: [
      "No advanced analytics",
      "No integrations",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: 79,
    icon: Crown,
    color: "text-orange-600",
    bg: "bg-orange-100 dark:bg-orange-900",
    borderColor: "border-orange-200 dark:border-orange-800",
    features: [
      "Up to 10 outlets",
      "Everything in Standard",
      "Advanced analytics & reports",
      "Billing management",
      "Delivery & loyalty programs",
      "CRM",
      "Up to 50 staff accounts",
    ],
    limitations: [
      "No third-party integrations",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 199,
    icon: Shield,
    color: "text-purple-600",
    bg: "bg-purple-100 dark:bg-purple-900",
    borderColor: "border-purple-200 dark:border-purple-800",
    features: [
      "Unlimited outlets",
      "Everything in Premium",
      "All integrations",
      "API access",
      "Custom branding",
      "Dedicated account manager",
      "SLA guarantee",
      "Unlimited staff accounts",
    ],
    limitations: [],
  },
];

function getPlanIndex(planId: string) {
  return plans.findIndex((p) => p.id === planId);
}

export default function BillingPage() {
  const { data: tenant } = useQuery<any>({
    queryKey: ["/api/tenant"],
  });

  const currentPlan = tenant?.plan || "basic";
  const currentPlanIndex = getPlanIndex(currentPlan);
  const currentPlanInfo = plans[currentPlanIndex] || plans[0];
  const CurrentPlanIcon = currentPlanInfo.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
      data-testid="page-billing"
    >
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <CreditCard className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-heading" data-testid="text-billing-title">Billing & Subscription</h1>
          <p className="text-muted-foreground">Manage your subscription plan and billing details</p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-2 border-teal-200 dark:border-teal-800 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-950/40 dark:to-cyan-950/40">
          <CardContent className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${currentPlanInfo.bg}`}>
                  <CurrentPlanIcon className={`h-8 w-8 ${currentPlanInfo.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Plan</p>
                  <h2 className="text-2xl font-bold font-heading" data-testid="text-current-plan">{currentPlanInfo.name}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {currentPlanInfo.price === 0 ? "Free" : `$${currentPlanInfo.price}/month`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1" data-testid="badge-plan-status">
                  Active
                </Badge>
                {tenant?.businessType && (
                  <Badge variant="outline" className="px-3 py-1" data-testid="badge-business-type">
                    {tenant.businessType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-white/60 dark:bg-white/5">
                <Building2 className="h-4 w-4 text-teal-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Outlets</p>
                  <p className="font-semibold text-sm" data-testid="text-outlet-limit">
                    {currentPlan === "enterprise" ? "Unlimited" : currentPlan === "premium" ? "Up to 10" : currentPlan === "standard" ? "Up to 3" : "1"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-white/60 dark:bg-white/5">
                <Users className="h-4 w-4 text-amber-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Staff</p>
                  <p className="font-semibold text-sm" data-testid="text-staff-limit">
                    {currentPlan === "enterprise" ? "Unlimited" : currentPlan === "premium" ? "Up to 50" : currentPlan === "standard" ? "Up to 15" : "Up to 5"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-white/60 dark:bg-white/5">
                <BarChart3 className="h-4 w-4 text-orange-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Analytics</p>
                  <p className="font-semibold text-sm" data-testid="text-analytics-level">
                    {currentPlan === "premium" || currentPlan === "enterprise" ? "Advanced" : "None"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-white/60 dark:bg-white/5">
                <Globe className="h-4 w-4 text-purple-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Integrations</p>
                  <p className="font-semibold text-sm" data-testid="text-integration-level">
                    {currentPlan === "enterprise" ? "All" : "None"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div>
        <h2 className="text-lg font-semibold font-heading mb-4" data-testid="text-plans-heading">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan, index) => {
            const PlanIcon = plan.icon;
            const isCurrent = plan.id === currentPlan;
            const isUpgrade = getPlanIndex(plan.id) > currentPlanIndex;
            const isDowngrade = getPlanIndex(plan.id) < currentPlanIndex;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.1 }}
              >
                <Card
                  className={`relative h-full flex flex-col ${
                    isCurrent ? `border-2 ${plan.borderColor}` : ""
                  } ${plan.popular ? "ring-2 ring-amber-300 dark:ring-amber-700" : ""}`}
                  data-testid={`card-plan-${plan.id}`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-amber-500 hover:bg-amber-600 text-white shadow-md" data-testid="badge-popular">
                        Most Popular
                      </Badge>
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute -top-3 right-4">
                      <Badge className="bg-teal-600 hover:bg-teal-700 text-white shadow-md" data-testid={`badge-current-${plan.id}`}>
                        Current
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${plan.bg}`}>
                        <PlanIcon className={`h-5 w-5 ${plan.color}`} />
                      </div>
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                    </div>
                    <div className="mt-2">
                      {plan.price === 0 ? (
                        <p className="text-3xl font-bold font-heading" data-testid={`text-price-${plan.id}`}>Free</p>
                      ) : (
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold font-heading" data-testid={`text-price-${plan.id}`}>${plan.price}</span>
                          <span className="text-sm text-muted-foreground">/month</span>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <ul className="space-y-2 flex-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                      {plan.limitations.map((limitation) => (
                        <li key={limitation} className="flex items-start gap-2 text-sm text-muted-foreground line-through">
                          <span className="w-4 shrink-0" />
                          <span>{limitation}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4">
                      {isCurrent ? (
                        <Button variant="outline" className="w-full" disabled data-testid={`button-plan-${plan.id}`}>
                          Current Plan
                        </Button>
                      ) : isUpgrade ? (
                        <Button className="w-full bg-teal-600 hover:bg-teal-700" data-testid={`button-plan-${plan.id}`}>
                          Upgrade <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      ) : (
                        <Button variant="outline" className="w-full" data-testid={`button-plan-${plan.id}`}>
                          {isDowngrade ? "Downgrade" : "Select"}
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

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border-orange-200 dark:border-orange-800">
          <CardContent className="p-6 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-semibold font-heading text-lg" data-testid="text-enterprise-cta">Need a custom solution?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Contact our sales team for Enterprise pricing, custom integrations, and dedicated support.
              </p>
            </div>
            <Button variant="outline" className="border-orange-300 dark:border-orange-700" data-testid="button-contact-sales">
              Contact Sales <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}