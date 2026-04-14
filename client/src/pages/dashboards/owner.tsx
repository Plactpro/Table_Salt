import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useBackgroundReport } from "@/hooks/use-background-report";
import { StatCard } from "@/components/widgets/stat-card";
import { ChartWidget } from "@/components/widgets/chart-widget";
import { DataTable } from "@/components/widgets/data-table";
import {
  DollarSign, ShoppingCart, TrendingUp, Users, AlertTriangle, BarChart3, Star,
  CalendarDays, Sparkles, Clock, Utensils, Truck, Coffee, Building2, Zap,
  Cloud, UtensilsCrossed, Lock, Wine,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useAuth, useSubscription } from "@/lib/auth";
import { BusinessType, tierPricing, businessConfig } from "@/lib/subscription";
import { formatCurrency } from "@shared/currency";
import { TrialBanner } from "@/components/layout/TrialBanner";
import { GettingStartedChecklist } from "@/components/onboarding/GettingStartedChecklist";
import { PageLoader } from "@/components/PageLoader";

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const businessTypeIcons: Record<BusinessType, typeof Utensils> = {
  enterprise: Building2,
  qsr: Zap,
  food_truck: Truck,
  cafe: Coffee,
  fine_dining: Wine,
  casual_dining: UtensilsCrossed,
  cloud_kitchen: Cloud,
};

function getBusinessSpecificKPIs(businessType: BusinessType, stats: any, fmt: (v: string | number | null) => string) {
  const avgOrderValue = stats?.totalOrders > 0
    ? (stats.totalRevenue / stats.totalOrders)
    : 0;

  const baseKPIs = [
    {
      title: "Total Revenue",
      value: fmt(stats?.totalRevenue || 0),
      subtitle: `Today: ${fmt(stats?.todayRevenue || 0)}`,
      icon: DollarSign,
      iconColor: "text-teal-600",
      iconBg: "bg-teal-100",
      testId: "stat-revenue",
    },
    {
      title: "Total Orders",
      value: stats?.totalOrders || 0,
      subtitle: `Today: ${stats?.todayOrders || 0}`,
      icon: ShoppingCart,
      iconColor: "text-orange-500",
      iconBg: "bg-orange-100",
      testId: "stat-orders",
    },
  ];

  const typeSpecificKPIs: Record<BusinessType, Array<{ title: string; value: string | number; subtitle?: string; icon: any; iconColor: string; iconBg: string; testId: string }>> = {
    qsr: [
      {
        title: "Avg Order Value",
        value: fmt(avgOrderValue),
        icon: Clock,
        iconColor: "text-amber-600",
        iconBg: "bg-amber-100",
        testId: "stat-avg-order",
      },
      // TODO: wire to real data — drive-thru order count not yet tracked separately
    ],
    fine_dining: [
      {
        title: "Avg Order Value",
        value: fmt(avgOrderValue),
        subtitle: "Per order",
        icon: Wine,
        iconColor: "text-amber-600",
        iconBg: "bg-amber-100",
        testId: "stat-avg-check",
      },
      // TODO: wire to real data — table turnover not yet tracked
    ],
    cloud_kitchen: [
      {
        title: "Avg Order Value",
        value: fmt(avgOrderValue),
        icon: Truck,
        iconColor: "text-amber-600",
        iconBg: "bg-amber-100",
        testId: "stat-avg-order",
      },
      // TODO: wire to real data — delivery rate and active brand count not yet tracked
    ],
    cafe: [
      {
        title: "Avg Order Value",
        value: fmt(avgOrderValue),
        icon: Coffee,
        iconColor: "text-amber-600",
        iconBg: "bg-amber-100",
        testId: "stat-avg-order",
      },
      // TODO: wire to real data — loyalty member count not yet available from API
    ],
    food_truck: [
      {
        title: "Avg Order Value",
        value: fmt(avgOrderValue),
        icon: TrendingUp,
        iconColor: "text-amber-600",
        iconBg: "bg-amber-100",
        testId: "stat-avg-order",
      },
      // TODO: wire to real data — active locations not yet tracked per-day
    ],
    enterprise: [
      {
        title: "Avg Order Value",
        value: fmt(avgOrderValue),
        icon: TrendingUp,
        iconColor: "text-amber-600",
        iconBg: "bg-amber-100",
        testId: "stat-avg-order",
      },
      // TODO: wire to real data — active outlet count not yet available from API
    ],
    casual_dining: [
      {
        title: "Avg Order Value",
        value: fmt(avgOrderValue),
        icon: TrendingUp,
        iconColor: "text-amber-600",
        iconBg: "bg-amber-100",
        testId: "stat-avg-order",
      },
      {
        title: "Staff Count",
        value: stats?.staffCount || 0,
        icon: Users,
        iconColor: "text-orange-600",
        iconBg: "bg-orange-100",
        testId: "stat-staff",
      },
    ],
  };

  return [...baseKPIs, ...(typeSpecificKPIs[businessType] || typeSpecificKPIs.casual_dining)];
}

export default function OwnerDashboard() {
  const { i18n } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const { tier, businessType, hasFeatureAccess, isLoading: subLoading } = useSubscription();

  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/dashboard"],
  });

  const { data: salesReport } = useBackgroundReport<any>(["/api/reports/sales"], "/api/reports/sales");

  // Guard: wait for auth and subscription data before rendering
  if (authLoading || subLoading || !user) {
    return <PageLoader />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const chartData = (salesReport?.salesByDay || []).map((d: any) => ({
    date: new Date(d.date).toLocaleDateString(i18n.language, { weekday: "short" }),
    revenue: Number(d.revenue || 0),
    orders: Number(d.orderCount || 0),
  }));

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString(i18n.language, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const resolvedBusinessType: BusinessType = businessType ?? "casual_dining";
  const resolvedTier = tier ?? "basic";

  const BusinessIcon = businessTypeIcons[resolvedBusinessType] ?? UtensilsCrossed;
  const config = businessConfig[resolvedBusinessType];
  const tierInfo = tierPricing[resolvedTier];
  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() ?? "AED") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition ?? "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: string | number | null) => formatCurrency(val ?? 0, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });
  const kpis = getBusinessSpecificKPIs(resolvedBusinessType, stats, fmt);
  const canAccessAnalytics = hasFeatureAccess("advanced_analytics");
  const canAccessReports = hasFeatureAccess("reports");

  return (
    <motion.div
      className="space-y-6"
      data-testid="dashboard-owner"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <TrialBanner />
      <GettingStartedChecklist />
      <motion.div variants={fadeUp}>
        <Card className="overflow-hidden border-0 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <motion.div
                  className="p-3 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10"
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="h-6 w-6 text-primary" />
                </motion.div>
                <div>
                  <h1 className="text-2xl font-heading font-bold" data-testid="text-dashboard-title">
                    {greeting}, {user?.name?.split(" ")[0] || "Owner"}
                  </h1>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <p className="text-sm">{dateStr}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  data-testid="badge-business-type"
                  variant="outline"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800"
                >
                  <BusinessIcon className="h-3.5 w-3.5" />
                  {config?.label || "Restaurant"}
                </Badge>
                <Badge
                  data-testid="badge-subscription-tier"
                  className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 hover:from-amber-600 hover:to-orange-600"
                >
                  {tierInfo?.label || resolvedTier}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">
            {config?.label || "Business"} Metrics
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <StatCard
              key={kpi.testId}
              title={kpi.title}
              value={kpi.value}
              subtitle={kpi.subtitle}
              icon={kpi.icon}
              iconColor={kpi.iconColor}
              iconBg={kpi.iconBg}
              testId={kpi.testId}
              index={i}
            />
          ))}
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">Sales Analytics</h2>
        </div>
        {canAccessReports ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ChartWidget
                title="Sales (Last 7 Days)"
                data={chartData}
                dataKey="revenue"
                xKey="date"
                type="bar"
                testId="chart-sales"
              />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <Card data-testid="card-top-items" className="h-full">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    Top Selling Items
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(stats?.topItems || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data yet</p>
                  ) : (
                    (stats?.topItems || []).map((item: any, i: number) => (
                      <motion.div
                        key={i}
                        className="flex items-center justify-between"
                        data-testid={`top-item-${i}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.4 + i * 0.06 }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                          <span className="text-sm font-medium">{item.name}</span>
                        </div>
                        <Badge variant="secondary">{item.totalQty} sold</Badge>
                      </motion.div>
                    ))
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        ) : (
          <Card data-testid="card-upgrade-analytics" className="border-dashed border-2 border-muted-foreground/20">
            <CardContent className="p-8 flex flex-col items-center justify-center text-center">
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                <Lock className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-heading font-semibold mb-2">Sales Analytics</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Upgrade to Standard or higher to unlock sales charts, top items, and detailed reporting.
              </p>
              <Button variant="default" className="bg-gradient-to-r from-teal-600 to-teal-500" data-testid="button-upgrade-analytics">
                Upgrade to Standard
              </Button>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {canAccessAnalytics && (
        <motion.div variants={fadeUp}>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">Advanced Analytics</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartWidget
              title="Orders Trend"
              data={chartData}
              dataKey="orders"
              xKey="date"
              type="line"
              testId="chart-orders-trend"
            />
            {/* TODO: wire to real data — Enterprise Insights (revenue growth, customer satisfaction, peak hours) not yet computed from API */}
          </div>
        </motion.div>
      )}

      {!canAccessAnalytics && canAccessReports && (
        <motion.div variants={fadeUp}>
          <Card data-testid="card-upgrade-premium" className="border-dashed border-2 border-amber-300/40 bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/20">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/30">
                  <BarChart3 className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-heading font-semibold">Unlock Advanced Analytics</h3>
                  <p className="text-sm text-muted-foreground">
                    Upgrade to Premium for deeper insights, trend analysis, and {config?.label?.toLowerCase()} specific reports.
                  </p>
                </div>
              </div>
              <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" data-testid="button-upgrade-premium">
                Upgrade to Premium
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-2 mb-3">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">Orders & Alerts</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DataTable
            title="Recent Orders"
            columns={[
              { key: "id", label: "Order", render: (v: string) => `#${v.slice(-4)}` },
              { key: "orderType", label: "Type", render: (v: string) => <Badge variant="outline">{v?.replace("_", " ")}</Badge> },
              {
                key: "status",
                label: "Status",
                render: (v: string) => {
                  const colors: Record<string, string> = {
                    new: "bg-teal-100 text-teal-800",
                    in_progress: "bg-orange-100 text-orange-700",
                    ready: "bg-green-100 text-green-700",
                    paid: "bg-emerald-100 text-emerald-700",
                    cancelled: "bg-red-100 text-red-700",
                  };
                  return <Badge className={colors[v] || ""}>{v?.replace("_", " ")}</Badge>;
                },
              },
              { key: "total", label: "Total", render: (v: string) => fmt(Number(v || 0)) },
            ]}
            data={stats?.recentOrders || []}
            testId="table-recent-orders"
          />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <Card data-testid="card-low-stock" className="h-full">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <motion.div
                    animate={{ scale: (stats?.lowStockItems || []).length > 0 ? [1, 1.15, 1] : 1 }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <AlertTriangle className={`h-4 w-4 ${(stats?.lowStockItems || []).length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                  </motion.div>
                  Low Stock Alerts
                  {(stats?.lowStockItems || []).length > 0 && (
                    <Badge variant="destructive" className="ml-auto text-xs">{(stats?.lowStockItems || []).length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(stats?.lowStockItems || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">All stock levels are good</p>
                ) : (
                  (stats?.lowStockItems || []).map((item: any, i: number) => (
                    <motion.div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-destructive/5 transition-colors"
                      data-testid={`low-stock-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.4 + i * 0.06 }}
                    >
                      <span className="text-sm">{item.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-destructive font-medium">{item.currentStock} {item.unit}</span>
                        <span className="text-xs text-muted-foreground">(min: {item.reorderLevel})</span>
                      </div>
                    </motion.div>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
