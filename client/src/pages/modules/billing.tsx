import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { motion } from "framer-motion";
import {
  CreditCard, Check, Crown, Zap, Star, Shield, ArrowRight,
  Building2, Users, BarChart3, Globe, Receipt, Search, Calendar,
  DollarSign, TrendingUp, FileText, LayoutGrid, Table2, CalendarDays, User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Order, OrderItem, Table as TableType, Customer } from "@shared/schema";

interface TenantData {
  id: string;
  name: string;
  plan: string;
  businessType?: string;
  currency?: string;
}

type OrderWithItems = Order & { items?: OrderItem[] };

const plans = [
  {
    id: "basic", name: "Basic", price: 0, icon: Zap,
    color: "text-teal-600", bg: "bg-teal-100 dark:bg-teal-900", borderColor: "border-teal-200 dark:border-teal-800",
    features: ["1 outlet", "Order management", "Basic menu management", "Up to 3 staff accounts"],
    limitations: ["No POS or tables", "No analytics", "No integrations"],
  },
  {
    id: "standard", name: "Standard", price: 29, icon: Star, popular: true,
    color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900", borderColor: "border-amber-200 dark:border-amber-800",
    features: ["Up to 3 outlets", "Everything in Basic", "POS & table management", "Inventory management", "Staff scheduling", "Reservations", "Up to 15 staff accounts"],
    limitations: ["No advanced analytics", "No integrations"],
  },
  {
    id: "premium", name: "Premium", price: 79, icon: Crown,
    color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-900", borderColor: "border-orange-200 dark:border-orange-800",
    features: ["Up to 10 outlets", "Everything in Standard", "Advanced analytics & reports", "Billing management", "Delivery & loyalty programs", "CRM", "Offers & Discounts", "Up to 50 staff accounts"],
    limitations: ["No third-party integrations"],
  },
  {
    id: "enterprise", name: "Enterprise", price: 199, icon: Shield,
    color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900", borderColor: "border-purple-200 dark:border-purple-800",
    features: ["Unlimited outlets", "Everything in Premium", "All integrations", "API access", "Custom branding", "Dedicated account manager", "SLA guarantee", "Unlimited staff accounts"],
    limitations: [],
  },
];

function getPlanIndex(planId: string) { return plans.findIndex((p) => p.id === planId); }

function formatDate(date: string | Date | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatShortDate(date: string | Date | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getDateKey(date: string | Date | null): string {
  if (!date) return "unknown";
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
}

type InvoiceView = "list" | "by_table" | "by_day" | "by_customer";

export default function BillingPage() {
  const { user } = useAuth();
  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const fmt = (val: string | number | null) => {
    if (val == null) return sharedFormatCurrency(0, tenantCurrency);
    return sharedFormatCurrency(val, tenantCurrency);
  };

  const { data: tenant } = useQuery<TenantData>({ queryKey: ["/api/tenant"] });
  const { data: orders = [] } = useQuery<Order[]>({ queryKey: ["/api/orders"] });
  const { data: tables = [] } = useQuery<TableType[]>({ queryKey: ["/api/tables"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const [activeTab, setActiveTab] = useState<"subscription" | "invoices">("subscription");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceDateFrom, setInvoiceDateFrom] = useState("");
  const [invoiceDateTo, setInvoiceDateTo] = useState("");
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState("all");
  const [invoiceView, setInvoiceView] = useState<InvoiceView>("list");
  const [selectedInvoice, setSelectedInvoice] = useState<OrderWithItems | null>(null);

  const currentPlan = tenant?.plan || "basic";
  const currentPlanIndex = getPlanIndex(currentPlan);
  const currentPlanInfo = plans[currentPlanIndex] || plans[0];
  const CurrentPlanIcon = currentPlanInfo.icon;

  const tableMap = useMemo(() => {
    const map: Record<string, string> = {};
    tables.forEach((t) => { map[t.id] = `Table ${t.number}`; });
    return map;
  }, [tables]);

  const customerMap = useMemo(() => {
    const map: Record<string, string> = {};
    customers.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [customers]);

  const paidOrders = useMemo(() => orders.filter((o) => o.status === "paid"), [orders]);

  const filteredInvoices = useMemo(() => {
    let result = [...paidOrders];
    if (invoiceSearch.trim()) {
      const q = invoiceSearch.toLowerCase();
      result = result.filter((o) => o.id.toLowerCase().includes(q) || (o.notes && o.notes.toLowerCase().includes(q)) || (o.tableId && tableMap[o.tableId]?.toLowerCase().includes(q)));
    }
    if (invoiceTypeFilter !== "all") result = result.filter((o) => o.orderType === invoiceTypeFilter);
    if (invoiceDateFrom) {
      const from = new Date(invoiceDateFrom);
      result = result.filter((o) => o.createdAt && new Date(o.createdAt) >= from);
    }
    if (invoiceDateTo) {
      const to = new Date(invoiceDateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((o) => o.createdAt && new Date(o.createdAt) <= to);
    }
    result.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return result;
  }, [paidOrders, invoiceSearch, invoiceTypeFilter, invoiceDateFrom, invoiceDateTo, tableMap]);

  const invoiceStats = useMemo(() => {
    const totalRevenue = filteredInvoices.reduce((sum, o) => sum + Number(o.total), 0);
    const totalTax = filteredInvoices.reduce((sum, o) => sum + Number(o.tax), 0);
    const totalDiscount = filteredInvoices.reduce((sum, o) => sum + Number(o.discount), 0);
    const avgOrderValue = filteredInvoices.length > 0 ? totalRevenue / filteredInvoices.length : 0;
    return { totalRevenue, totalTax, totalDiscount, avgOrderValue, count: filteredInvoices.length };
  }, [filteredInvoices]);

  const byTableData = useMemo(() => {
    const groups: Record<string, { label: string; orders: Order[]; revenue: number }> = {};
    filteredInvoices.forEach((o) => {
      const key = o.tableId || "no_table";
      const label = o.tableId ? (tableMap[o.tableId] || "Unknown Table") : "Takeaway / Delivery";
      if (!groups[key]) groups[key] = { label, orders: [], revenue: 0 };
      groups[key].orders.push(o);
      groups[key].revenue += Number(o.total);
    });
    return Object.entries(groups).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [filteredInvoices, tableMap]);

  const byCustomerData = useMemo(() => {
    const groups: Record<string, { label: string; orders: Order[]; revenue: number }> = {};
    filteredInvoices.forEach((o) => {
      const key = o.customerId || "walk_in";
      const label = o.customerId ? (customerMap[o.customerId] || "Unknown Customer") : "Walk-in";
      if (!groups[key]) groups[key] = { label, orders: [], revenue: 0 };
      groups[key].orders.push(o);
      groups[key].revenue += Number(o.total);
    });
    return Object.entries(groups).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [filteredInvoices, customerMap]);

  const byDayData = useMemo(() => {
    const groups: Record<string, { label: string; orders: Order[]; revenue: number }> = {};
    filteredInvoices.forEach((o) => {
      const key = getDateKey(o.createdAt);
      const label = formatShortDate(o.createdAt);
      if (!groups[key]) groups[key] = { label, orders: [], revenue: 0 };
      groups[key].orders.push(o);
      groups[key].revenue += Number(o.total);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredInvoices]);

  const handleViewInvoice = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const order: OrderWithItems = await res.json();
      setSelectedInvoice(order);
    } catch {
      /* handled */
    }
  };

  const typeLabels: Record<string, string> = {
    dine_in: "Dine In",
    takeaway: "Takeaway",
    delivery: "Delivery",
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6" data-testid="page-billing">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <CreditCard className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-billing-title">Billing & Subscription</h1>
            <p className="text-muted-foreground">Manage your subscription and view invoice history</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant={activeTab === "subscription" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("subscription")} data-testid="tab-subscription">
            <CreditCard className="h-4 w-4 mr-1" /> Subscription
          </Button>
          <Button variant={activeTab === "invoices" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("invoices")} data-testid="tab-invoices">
            <Receipt className="h-4 w-4 mr-1" /> Invoice History
          </Button>
        </div>
      </div>

      {activeTab === "subscription" && (
        <>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
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
                      <p className="text-sm text-muted-foreground mt-0.5">{currentPlanInfo.price === 0 ? "Free" : `$${currentPlanInfo.price}/month`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1" data-testid="badge-plan-status">Active</Badge>
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
                      <p className="font-semibold text-sm" data-testid="text-outlet-limit">{currentPlan === "enterprise" ? "Unlimited" : currentPlan === "premium" ? "Up to 10" : currentPlan === "standard" ? "Up to 3" : "1"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-white/60 dark:bg-white/5">
                    <Users className="h-4 w-4 text-amber-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Staff</p>
                      <p className="font-semibold text-sm" data-testid="text-staff-limit">{currentPlan === "enterprise" ? "Unlimited" : currentPlan === "premium" ? "Up to 50" : currentPlan === "standard" ? "Up to 15" : "Up to 5"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-white/60 dark:bg-white/5">
                    <BarChart3 className="h-4 w-4 text-orange-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Analytics</p>
                      <p className="font-semibold text-sm" data-testid="text-analytics-level">{currentPlan === "premium" || currentPlan === "enterprise" ? "Advanced" : "None"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-white/60 dark:bg-white/5">
                    <Globe className="h-4 w-4 text-purple-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Integrations</p>
                      <p className="font-semibold text-sm" data-testid="text-integration-level">{currentPlan === "enterprise" ? "All" : "None"}</p>
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
                  <motion.div key={plan.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + index * 0.1 }}>
                    <Card className={`relative h-full flex flex-col ${isCurrent ? `border-2 ${plan.borderColor}` : ""} ${plan.popular ? "ring-2 ring-amber-300 dark:ring-amber-700" : ""}`} data-testid={`card-plan-${plan.id}`}>
                      {plan.popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <Badge className="bg-amber-500 hover:bg-amber-600 text-white shadow-md" data-testid="badge-popular">Most Popular</Badge>
                        </div>
                      )}
                      {isCurrent && (
                        <div className="absolute -top-3 right-4">
                          <Badge className="bg-teal-600 hover:bg-teal-700 text-white shadow-md" data-testid={`badge-current-${plan.id}`}>Current</Badge>
                        </div>
                      )}
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${plan.bg}`}><PlanIcon className={`h-5 w-5 ${plan.color}`} /></div>
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
                              <span className="w-4 shrink-0" /><span>{limitation}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-4">
                          {isCurrent ? (
                            <Button variant="outline" className="w-full" disabled data-testid={`button-plan-${plan.id}`}>Current Plan</Button>
                          ) : isUpgrade ? (
                            <Button className="w-full bg-teal-600 hover:bg-teal-700" data-testid={`button-plan-${plan.id}`}>Upgrade <ArrowRight className="h-4 w-4 ml-1" /></Button>
                          ) : (
                            <Button variant="outline" className="w-full" data-testid={`button-plan-${plan.id}`}>{isDowngrade ? "Downgrade" : "Select"}</Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
            <Card className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border-orange-200 dark:border-orange-800">
              <CardContent className="p-6 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-semibold font-heading text-lg" data-testid="text-enterprise-cta">Need a custom solution?</h3>
                  <p className="text-sm text-muted-foreground mt-1">Contact our sales team for Enterprise pricing, custom integrations, and dedicated support.</p>
                </div>
                <Button variant="outline" className="border-orange-300 dark:border-orange-700" data-testid="button-contact-sales">Contact Sales <ArrowRight className="h-4 w-4 ml-1" /></Button>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}

      {activeTab === "invoices" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Revenue", value: fmt(invoiceStats.totalRevenue), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
              { label: "Invoices", value: String(invoiceStats.count), icon: FileText, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" },
              { label: "Avg Order", value: fmt(invoiceStats.avgOrderValue), icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30" },
              { label: "Total Tax", value: fmt(invoiceStats.totalTax), icon: Receipt, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30" },
            ].map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                <Card className="transition-all duration-200 hover:shadow-md">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`rounded-lg p-2.5 ${stat.bg}`}><stat.icon className={`h-5 w-5 ${stat.color}`} /></div>
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className="text-xl font-bold" data-testid={`text-invoice-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>{stat.value}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg flex items-center gap-2"><Search className="h-4 w-4" /> Invoice Filters</CardTitle>
                <div className="flex gap-1">
                  <Button variant={invoiceView === "list" ? "default" : "outline"} size="sm" onClick={() => setInvoiceView("list")} data-testid="button-view-list">
                    <LayoutGrid className="h-3.5 w-3.5 mr-1" /> List
                  </Button>
                  <Button variant={invoiceView === "by_table" ? "default" : "outline"} size="sm" onClick={() => setInvoiceView("by_table")} data-testid="button-view-by-table">
                    <Table2 className="h-3.5 w-3.5 mr-1" /> By Table
                  </Button>
                  <Button variant={invoiceView === "by_customer" ? "default" : "outline"} size="sm" onClick={() => setInvoiceView("by_customer")} data-testid="button-view-by-customer">
                    <User className="h-3.5 w-3.5 mr-1" /> By Customer
                  </Button>
                  <Button variant={invoiceView === "by_day" ? "default" : "outline"} size="sm" onClick={() => setInvoiceView("by_day")} data-testid="button-view-by-day">
                    <CalendarDays className="h-3.5 w-3.5 mr-1" /> By Day
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input data-testid="input-search-invoices" placeholder="Search invoices..." className="pl-9" value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} />
                </div>
                <Select value={invoiceTypeFilter} onValueChange={setInvoiceTypeFilter}>
                  <SelectTrigger data-testid="select-invoice-type"><SelectValue placeholder="Order Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="dine_in">Dine In</SelectItem>
                    <SelectItem value="takeaway">Takeaway</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                  </SelectContent>
                </Select>
                <Input data-testid="input-invoice-date-from" type="date" value={invoiceDateFrom} onChange={(e) => setInvoiceDateFrom(e.target.value)} />
                <Input data-testid="input-invoice-date-to" type="date" value={invoiceDateTo} onChange={(e) => setInvoiceDateTo(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {invoiceView === "list" && (
            <Card>
              <CardContent className="p-0">
                {filteredInvoices.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground" data-testid="text-no-invoices">
                    <Receipt className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p>No invoices found.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Table</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Subtotal</TableHead>
                          <TableHead>Tax</TableHead>
                          <TableHead>Discount</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead className="w-[80px]">View</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInvoices.map((order, index) => (
                          <motion.tr key={order.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.02 }} className="border-b hover:bg-muted/50" data-testid={`row-invoice-${order.id}`}>
                            <TableCell className="font-mono text-xs" data-testid={`text-invoice-id-${order.id}`}>#{order.id.slice(-6).toUpperCase()}</TableCell>
                            <TableCell className="text-sm">{formatShortDate(order.createdAt)}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{typeLabels[order.orderType || "dine_in"]}</Badge></TableCell>
                            <TableCell className="text-sm">{order.tableId ? tableMap[order.tableId] || "—" : "—"}</TableCell>
                            <TableCell className="text-sm capitalize">{order.paymentMethod || "—"}</TableCell>
                            <TableCell className="text-sm">{fmt(order.subtotal)}</TableCell>
                            <TableCell className="text-sm">{fmt(order.tax)}</TableCell>
                            <TableCell className="text-sm">{Number(order.discount) > 0 ? <span className="text-red-500">-{fmt(order.discount)}</span> : "—"}</TableCell>
                            <TableCell className="font-medium">{fmt(order.total)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => handleViewInvoice(order.id)} data-testid={`button-view-invoice-${order.id}`}>
                                <FileText className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </motion.tr>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {invoiceView === "by_table" && (
            <div className="space-y-4" data-testid="view-by-table">
              {byTableData.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">No invoices found.</CardContent></Card>
              ) : (
                byTableData.map(([key, group]) => (
                  <Card key={key} data-testid={`table-group-${key}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Table2 className="h-4 w-4 text-primary" />
                          {group.label}
                        </CardTitle>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-muted-foreground">{group.orders.length} orders</span>
                          <span className="font-bold" data-testid={`text-table-revenue-${key}`}>{fmt(group.revenue)}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Invoice #</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Payment</TableHead>
                              <TableHead>Total</TableHead>
                              <TableHead className="w-[80px]">View</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.orders.map((order) => (
                              <TableRow key={order.id} className="hover:bg-muted/50" data-testid={`row-invoice-${order.id}`}>
                                <TableCell className="font-mono text-xs">#{order.id.slice(-6).toUpperCase()}</TableCell>
                                <TableCell className="text-sm">{formatShortDate(order.createdAt)}</TableCell>
                                <TableCell><Badge variant="outline" className="text-xs">{typeLabels[order.orderType || "dine_in"]}</Badge></TableCell>
                                <TableCell className="text-sm capitalize">{order.paymentMethod || "—"}</TableCell>
                                <TableCell className="font-medium">{fmt(order.total)}</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="sm" onClick={() => handleViewInvoice(order.id)} data-testid={`button-view-invoice-${order.id}`}>
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {invoiceView === "by_customer" && (
            <div className="space-y-4" data-testid="view-by-customer">
              {byCustomerData.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">No invoices found.</CardContent></Card>
              ) : (
                byCustomerData.map(([key, group]) => (
                  <Card key={key} data-testid={`customer-group-${key}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <User className="h-4 w-4 text-primary" />
                          {group.label}
                        </CardTitle>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-muted-foreground">{group.orders.length} orders</span>
                          <span className="font-bold" data-testid={`text-customer-revenue-${key}`}>{fmt(group.revenue)}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Invoice #</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Table</TableHead>
                              <TableHead>Payment</TableHead>
                              <TableHead>Total</TableHead>
                              <TableHead className="w-[80px]">View</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.orders.map((order) => (
                              <TableRow key={order.id} className="hover:bg-muted/50" data-testid={`row-invoice-${order.id}`}>
                                <TableCell className="font-mono text-xs">#{order.id.slice(-6).toUpperCase()}</TableCell>
                                <TableCell className="text-sm">{formatShortDate(order.createdAt)}</TableCell>
                                <TableCell><Badge variant="outline" className="text-xs">{typeLabels[order.orderType || "dine_in"]}</Badge></TableCell>
                                <TableCell className="text-sm">{order.tableId ? tableMap[order.tableId] || "—" : "—"}</TableCell>
                                <TableCell className="text-sm capitalize">{order.paymentMethod || "—"}</TableCell>
                                <TableCell className="font-medium">{fmt(order.total)}</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="sm" onClick={() => handleViewInvoice(order.id)} data-testid={`button-view-invoice-${order.id}`}>
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {invoiceView === "by_day" && (
            <div className="space-y-4" data-testid="view-by-day">
              {byDayData.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">No invoices found.</CardContent></Card>
              ) : (
                byDayData.map(([key, group]) => (
                  <Card key={key} data-testid={`day-group-${key}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-primary" />
                          {group.label}
                        </CardTitle>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-muted-foreground">{group.orders.length} orders</span>
                          <span className="font-bold" data-testid={`text-day-revenue-${key}`}>{fmt(group.revenue)}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Invoice #</TableHead>
                              <TableHead>Time</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Table</TableHead>
                              <TableHead>Payment</TableHead>
                              <TableHead>Total</TableHead>
                              <TableHead className="w-[80px]">View</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.orders.map((order) => (
                              <TableRow key={order.id} className="hover:bg-muted/50" data-testid={`row-invoice-${order.id}`}>
                                <TableCell className="font-mono text-xs">#{order.id.slice(-6).toUpperCase()}</TableCell>
                                <TableCell className="text-sm">{formatDate(order.createdAt)}</TableCell>
                                <TableCell><Badge variant="outline" className="text-xs">{typeLabels[order.orderType || "dine_in"]}</Badge></TableCell>
                                <TableCell className="text-sm">{order.tableId ? tableMap[order.tableId] || "—" : "—"}</TableCell>
                                <TableCell className="text-sm capitalize">{order.paymentMethod || "—"}</TableCell>
                                <TableCell className="font-medium">{fmt(order.total)}</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="sm" onClick={() => handleViewInvoice(order.id)} data-testid={`button-view-invoice-${order.id}`}>
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="max-w-md" data-testid="dialog-invoice-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Invoice #{selectedInvoice?.id?.slice(-6).toUpperCase()}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="text-center border-b pb-3">
                <h3 className="font-heading font-bold text-lg">{tenant?.name || "Restaurant"}</h3>
                <p className="text-xs text-muted-foreground">{formatDate(selectedInvoice.createdAt)}</p>
                <div className="flex items-center justify-center gap-2 mt-1">
                  {selectedInvoice.tableId && <Badge variant="outline">{tableMap[selectedInvoice.tableId]}</Badge>}
                  {selectedInvoice.paymentMethod && <Badge variant="outline" className="capitalize">{selectedInvoice.paymentMethod}</Badge>}
                </div>
              </div>

              <div className="space-y-2">
                {selectedInvoice.items?.map((item, idx) => (
                  <div key={item.id} className="flex justify-between text-sm" data-testid={`invoice-item-${idx}`}>
                    <div className="flex-1">
                      <span>{item.name}</span>
                      <span className="text-muted-foreground ml-1">x{item.quantity}</span>
                    </div>
                    <span className="font-medium">{fmt(Number(item.price) * (item.quantity || 1))}</span>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{fmt(selectedInvoice.subtotal)}</span>
                </div>
                {Number(selectedInvoice.discount) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{fmt(selectedInvoice.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{fmt(selectedInvoice.tax)}</span>
                </div>
                {selectedInvoice.notes && selectedInvoice.notes.includes("Service charge") && (
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>{selectedInvoice.notes.split(" | ").find((n: string) => n.includes("Service charge"))}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{fmt(selectedInvoice.total)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground border-t">
                <Badge className="bg-emerald-100 text-emerald-800">Paid</Badge>
                <span>Invoice #{selectedInvoice.id.slice(-6).toUpperCase()}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
