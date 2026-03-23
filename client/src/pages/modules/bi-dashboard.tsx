import { useState, useMemo, Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3, TrendingUp, DollarSign, Users, PieChart as PieIcon,
  Activity, Clock, ShoppingBag, Target, Star, Award, Percent,
  ArrowUpRight, ArrowDownRight, CalendarDays, Package, AlertCircle,
} from "lucide-react";

class TabErrorBoundary extends Component<{ children: ReactNode; label: string }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; label: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] tab error:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <AlertCircle className="h-10 w-10 text-destructive opacity-60" />
          <p className="text-sm">Something went wrong loading <strong>{this.props.label}</strong>.</p>
          <button className="text-xs underline" onClick={() => this.setState({ hasError: false })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface HourlySalesItem { hour: number; revenue: number; count: number }
interface ChannelMixItem { channel: string; revenue: number; count: number }
interface HeatmapItem { day: string; hour: number; value: number }
interface TopItemEntry { name: string; quantity: number; revenue: number }
interface OperationsData {
  hourlySales: HourlySalesItem[];
  channelMix: ChannelMixItem[];
  topItems: TopItemEntry[];
  heatmapData: HeatmapItem[];
  avgOrderValue: number;
  totalOrders: number;
  totalRevenue: number;
  avgTurnMinutes: number;
  totalCovers: number;
}
interface DailyFinanceEntry { date: string; netSales: number; tax: number; discount: number; gross: number }
interface FinanceData {
  netSales: number; totalTax: number; totalDiscount: number;
  voidCount: number; voidAmount: number; foodCostPct: number;
  labourPct: number; grossMargin: number; grossMarginPct: number;
  dailyFinance: DailyFinanceEntry[];
  totalLabourCost: number; totalFoodCost: number;
}
interface CampaignEntry {
  name: string; type: string; usageCount: number;
  usageLimit: number | null; value: number; active: boolean;
  uptakeRate: number | null;
}
interface MarketingData {
  totalCustomers: number; loyaltyEnrolled: number; enrollmentRate: number;
  tierBreakdown: Record<string, number>; totalPointsOutstanding: number;
  totalRedemptions: number; campaigns: CampaignEntry[];
  avgCustomerSpend: number; avgRating: number; feedbackCount: number;
}
interface ForecastDay { day: string; forecastRevenue: number; forecastOrders: number; weeksOfData: number }
interface ProductionSuggestion { name: string; avgWeeklyQty: number; suggestedQty: number; unitPrice: number }
interface IngredientSuggestion {
  inventoryItemId: string; name: string; unit: string;
  avgWeeklyNeed: number; suggestedOrder: number;
  costPerUnit: number; estimatedWeeklyCost: number;
}
interface ForecastData {
  forecast: ForecastDay[]; totalForecastRevenue: number;
  totalForecastOrders: number; weeksAnalyzed: number;
  productionSuggestions: ProductionSuggestion[];
  ingredientSuggestions: IngredientSuggestion[];
  outletId: string | null;
}
interface OutletEntry { id: string; name: string }
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend, Area, AreaChart,
  ScatterChart, Scatter, ZAxis,
} from "recharts";

const COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];
const tooltipStyle = {
  background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
  borderRadius: "10px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", padding: "8px 12px",
};

function formatCur(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function StatCard({ label, value, sub, icon: Icon, color = "text-primary", testId }: {
  label: string; value: string | number; sub?: string; icon: LucideIcon; color?: string; testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function HeatmapChart({ data }: { data: { day: string; hour: number; value: number }[] }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const lookup = new Map(data.map(d => [`${d.day}-${d.hour}`, d.value]));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="flex gap-0.5 mb-1 ml-10">
          {hours.filter(h => h % 2 === 0).map(h => (
            <div key={h} className="text-[9px] text-muted-foreground" style={{ width: "24px", textAlign: "center" }}>
              {h}:00
            </div>
          ))}
        </div>
        {days.map(day => (
          <div key={day} className="flex items-center gap-0.5 mb-0.5">
            <span className="text-[10px] text-muted-foreground w-8 text-right mr-1">{day}</span>
            {hours.map(h => {
              const val = lookup.get(`${day}-${h}`) || 0;
              const intensity = maxVal > 0 ? val / maxVal : 0;
              return (
                <div
                  key={h}
                  className="w-3 h-3 rounded-sm transition-colors"
                  style={{
                    backgroundColor: intensity > 0 ? `rgba(16, 185, 129, ${Math.max(0.1, intensity)})` : "hsl(var(--muted))",
                  }}
                  title={`${day} ${h}:00 — ${formatCur(val)}`}
                />
              );
            })}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2 ml-10">
          <span className="text-[9px] text-muted-foreground">Low</span>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map(i => (
            <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgba(16, 185, 129, ${i})` }} />
          ))}
          <span className="text-[9px] text-muted-foreground">High</span>
        </div>
      </div>
    </div>
  );
}

export default function BIDashboard() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });
  const [activeTab, setActiveTab] = useState("operations");
  const [forecastOutlet, setForecastOutlet] = useState("all");

  const queryParams = `?from=${dateRange.from}&to=${dateRange.to}`;
  const { data: ops } = useQuery<OperationsData>({ queryKey: ["/api/reports/operations", dateRange], queryFn: () => fetch(`/api/reports/operations${queryParams}`, { credentials: "include" }).then(r => r.json()) });
  const { data: fin } = useQuery<FinanceData>({ queryKey: ["/api/reports/finance", dateRange], queryFn: () => fetch(`/api/reports/finance${queryParams}`, { credentials: "include" }).then(r => r.json()) });
  const { data: mkt } = useQuery<MarketingData>({ queryKey: ["/api/reports/marketing"], queryFn: () => fetch("/api/reports/marketing", { credentials: "include" }).then(r => r.json()) });
  const forecastParams = forecastOutlet !== "all" ? `?outletId=${forecastOutlet}` : "";
  const { data: forecast } = useQuery<ForecastData>({ queryKey: ["/api/reports/forecast", forecastOutlet], queryFn: () => fetch(`/api/reports/forecast${forecastParams}`, { credentials: "include" }).then(r => r.json()) });
  const { data: outlets } = useQuery<OutletEntry[]>({ queryKey: ["/api/outlets"], queryFn: () => fetch("/api/outlets", { credentials: "include" }).then(r => r.json()) });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">BI Dashboards & Forecasting</h1>
          <p className="text-muted-foreground mt-1">Analytics, insights, and demand forecasting</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs">From</Label>
            <Input type="date" value={dateRange.from} onChange={e => setDateRange(r => ({ ...r, from: e.target.value }))} className="w-36 h-8 text-xs" data-testid="input-date-from" />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">To</Label>
            <Input type="date" value={dateRange.to} onChange={e => setDateRange(r => ({ ...r, to: e.target.value }))} className="w-36 h-8 text-xs" data-testid="input-date-to" />
          </div>
        </div>
      </div>

      <TabErrorBoundary label="BI Dashboard"><Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="operations" data-testid="tab-operations"><Activity className="w-4 h-4 mr-1.5" />Operations</TabsTrigger>
          <TabsTrigger value="finance" data-testid="tab-finance"><DollarSign className="w-4 h-4 mr-1.5" />Finance</TabsTrigger>
          <TabsTrigger value="marketing" data-testid="tab-marketing"><Target className="w-4 h-4 mr-1.5" />Marketing</TabsTrigger>
          <TabsTrigger value="forecasting" data-testid="tab-forecasting"><TrendingUp className="w-4 h-4 mr-1.5" />Forecasting</TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="space-y-6 mt-4">
          {ops && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Total Revenue" value={formatCur(ops.totalRevenue)} icon={DollarSign} color="text-green-600" testId="card-ops-revenue" />
                <StatCard label="Total Orders" value={ops.totalOrders} icon={ShoppingBag} color="text-blue-600" testId="card-ops-orders" />
                <StatCard label="Avg Order Value" value={formatCur(ops.avgOrderValue)} icon={BarChart3} color="text-purple-600" testId="card-ops-aov" />
                <StatCard label="Total Covers" value={ops.totalCovers || 0} sub="seated guests" icon={Users} color="text-teal-600" testId="card-ops-covers" />
                <StatCard label="Avg Turn Time" value={`${ops.avgTurnMinutes}m`} sub="current dining" icon={Clock} color="text-amber-600" testId="card-ops-turn" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <Card data-testid="chart-hourly-sales">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Hourly Sales Distribution</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={ops.hourlySales}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                          <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatCur(v), "Revenue"]} labelFormatter={h => `${h}:00`} />
                          <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Card data-testid="chart-channel-mix">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Channel Mix</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie data={ops.channelMix} dataKey="revenue" nameKey="channel" cx="50%" cy="50%" outerRadius={100} label={({ channel, percent }: { channel: string; percent: number }) => `${channel} ${(percent * 100).toFixed(0)}%`}>
                            {ops.channelMix.map((_: ChannelMixItem, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCur(v)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <Card data-testid="chart-heatmap">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Sales Heatmap (Day × Hour)</CardTitle></CardHeader>
                  <CardContent>
                    <HeatmapChart data={ops.heatmapData || []} />
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <Card data-testid="card-top-items">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Best-Selling Dishes</CardTitle></CardHeader>
                  <CardContent>
                    {ops.topItems?.length > 0 ? (
                      <div className="space-y-2">
                        {ops.topItems.map((item: TopItemEntry, i: number) => {
                          const maxQty = ops.topItems[0]?.quantity || 1;
                          const pct = (item.quantity / maxQty) * 100;
                          return (
                            <div key={i} className="flex items-center gap-3" data-testid={`row-top-item-${i}`}>
                              <span className="w-6 text-sm font-bold text-muted-foreground text-right">#{i + 1}</span>
                              <div className="flex-1">
                                <div className="flex justify-between text-sm mb-0.5">
                                  <span className="font-medium">{item.name}</span>
                                  <span className="text-muted-foreground">{item.quantity} sold · {formatCur(item.revenue)}</span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : <p className="text-sm text-muted-foreground">No item data available</p>}
                  </CardContent>
                </Card>
              </motion.div>
            </>
          )}
        </TabsContent>

        <TabsContent value="finance" className="space-y-6 mt-4">
          {fin && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Net Sales" value={formatCur(fin.netSales)} icon={DollarSign} color="text-green-600" testId="card-fin-net-sales" />
                <StatCard label="Gross Margin" value={`${fin.grossMarginPct}%`} sub={formatCur(fin.grossMargin)} icon={TrendingUp} color="text-blue-600" testId="card-fin-margin" />
                <StatCard label="Food Cost %" value={`${fin.foodCostPct}%`} sub={formatCur(fin.totalFoodCost)} icon={Package} color="text-amber-600" testId="card-fin-food-cost" />
                <StatCard label="Labour Cost %" value={`${fin.labourPct}%`} sub={formatCur(fin.totalLabourCost)} icon={Users} color="text-purple-600" testId="card-fin-labour" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Tax" value={formatCur(fin.totalTax)} icon={Percent} color="text-red-500" testId="card-fin-tax" />
                <StatCard label="Total Discounts" value={formatCur(fin.totalDiscount)} icon={ArrowDownRight} color="text-orange-500" testId="card-fin-discount" />
                <StatCard label="Void Orders" value={fin.voidCount} sub={formatCur(fin.voidAmount)} icon={ArrowDownRight} color="text-red-600" testId="card-fin-voids" />
                <StatCard label="Gross Sales" value={formatCur(fin.netSales + fin.totalTax)} icon={ArrowUpRight} color="text-green-500" testId="card-fin-gross" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <Card data-testid="chart-daily-finance">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Daily Revenue Breakdown</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={fin.dailyFinance}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="netSales" name="Net Sales" fill="#10b981" radius={[2, 2, 0, 0]} stackId="a" />
                          <Bar dataKey="tax" name="Tax" fill="#ef4444" radius={[2, 2, 0, 0]} stackId="a" />
                          <Bar dataKey="discount" name="Discounts" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                          <Legend />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Card data-testid="chart-cost-breakdown">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Cost Breakdown</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Food Cost", value: fin.totalFoodCost },
                              { name: "Labour Cost", value: fin.totalLabourCost },
                              { name: "Gross Margin", value: Math.max(0, fin.grossMargin) },
                            ]}
                            dataKey="value" cx="50%" cy="50%" outerRadius={100} innerRadius={50}
                            label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            <Cell fill="#f59e0b" />
                            <Cell fill="#8b5cf6" />
                            <Cell fill="#10b981" />
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCur(v)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="marketing" className="space-y-6 mt-4">
          {mkt && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Total Customers" value={mkt.totalCustomers} icon={Users} color="text-blue-600" testId="card-mkt-customers" />
                <StatCard label="Loyalty Enrolled" value={mkt.loyaltyEnrolled} sub={`${mkt.enrollmentRate}% enrollment`} icon={Award} color="text-purple-600" testId="card-mkt-loyalty" />
                <StatCard label="Redemptions" value={mkt.totalRedemptions || 0} sub="offer uses" icon={Percent} color="text-rose-500" testId="card-mkt-redemptions" />
                <StatCard label="Avg Rating" value={mkt.avgRating} sub={`${mkt.feedbackCount} reviews`} icon={Star} color="text-amber-500" testId="card-mkt-rating" />
                <StatCard label="Avg Spend" value={formatCur(mkt.avgCustomerSpend)} icon={DollarSign} color="text-green-600" testId="card-mkt-avg-spend" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <Card data-testid="chart-loyalty-tiers">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Loyalty Tier Distribution</CardTitle></CardHeader>
                    <CardContent>
                      {Object.keys(mkt.tierBreakdown).length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <PieChart>
                            <Pie
                              data={Object.entries(mkt.tierBreakdown).map(([tier, count]) => ({ name: tier === "none" ? "No Tier" : tier, value: count as number }))}
                              dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                              label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                              {Object.keys(mkt.tierBreakdown).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : <p className="text-sm text-muted-foreground text-center py-8">No loyalty tier data</p>}
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Card data-testid="card-campaigns">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Campaign Performance</CardTitle></CardHeader>
                    <CardContent>
                      {mkt.campaigns?.length > 0 ? (
                        <div className="space-y-3">
                          {mkt.campaigns.map((c: CampaignEntry, i: number) => (
                            <div key={i} className="flex items-center justify-between border-b pb-2 last:border-0" data-testid={`row-campaign-${i}`}>
                              <div>
                                <div className="font-medium text-sm">{c.name}</div>
                                <div className="text-xs text-muted-foreground">{c.type} · Value: {c.value}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold">{c.usageCount} used</div>
                                {c.usageLimit && <div className="text-xs text-muted-foreground">of {c.usageLimit} limit</div>}
                                <div className="flex items-center gap-1 justify-end mt-0.5">
                                  <Badge variant={c.active ? "default" : "secondary"} className="text-[10px]">{c.active ? "Active" : "Inactive"}</Badge>
                                  {c.uptakeRate !== null && c.uptakeRate !== undefined && (
                                    <Badge variant="outline" className="text-[10px]">{c.uptakeRate}% uptake</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-sm text-muted-foreground text-center py-8">No campaigns found</p>}
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <Card data-testid="card-points-summary">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Loyalty Points Summary</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">{mkt.totalPointsOutstanding?.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">Outstanding Points</div>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{mkt.enrollmentRate}%</div>
                        <div className="text-xs text-muted-foreground">Enrollment Rate</div>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">{mkt.feedbackCount}</div>
                        <div className="text-xs text-muted-foreground">Total Reviews</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </>
          )}
        </TabsContent>

        <TabsContent value="forecasting" className="space-y-6 mt-4">
          {forecast && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <Label className="text-xs whitespace-nowrap">Outlet</Label>
                <Select value={forecastOutlet} onValueChange={setForecastOutlet}>
                  <SelectTrigger className="w-48 h-8 text-xs" data-testid="select-forecast-outlet">
                    <SelectValue placeholder="All outlets" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Outlets</SelectItem>
                    {outlets?.map((o: OutletEntry) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {forecast.outletId && <Badge variant="outline" className="text-xs">Filtered</Badge>}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Forecast Revenue" value={formatCur(forecast.totalForecastRevenue)} sub="next week" icon={TrendingUp} color="text-green-600" testId="card-fc-revenue" />
                <StatCard label="Forecast Orders" value={forecast.totalForecastOrders} sub="next week" icon={ShoppingBag} color="text-blue-600" testId="card-fc-orders" />
                <StatCard label="Weeks Analyzed" value={forecast.weeksAnalyzed} icon={CalendarDays} color="text-purple-600" testId="card-fc-weeks" />
                <StatCard label="Items Tracked" value={forecast.productionSuggestions?.length || 0} icon={Package} color="text-amber-600" testId="card-fc-items" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <Card data-testid="chart-forecast-revenue">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue Forecast by Day</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={forecast.forecast}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                          <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatCur(v), "Revenue"]} />
                          <Bar dataKey="forecastRevenue" name="Forecast Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Card data-testid="chart-forecast-orders">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Order Forecast by Day</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={forecast.forecast}>
                          <defs>
                            <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                          <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Area type="monotone" dataKey="forecastOrders" name="Orders" stroke="#6366f1" fill="url(#fcGrad)" strokeWidth={2} dot={{ r: 4, fill: "#6366f1" }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <Card data-testid="card-production-suggestions">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Suggested Production / Inventory Quantities</CardTitle>
                    <p className="text-xs text-muted-foreground">Based on moving average consumption with 10% safety buffer</p>
                  </CardHeader>
                  <CardContent>
                    {forecast.productionSuggestions?.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 font-medium text-muted-foreground">Item</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">Avg Weekly</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">Suggested</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">Unit Price</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">Est. Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {forecast.productionSuggestions.map((item: ProductionSuggestion, i: number) => (
                              <tr key={i} className="border-b last:border-0" data-testid={`row-production-${i}`}>
                                <td className="py-2 font-medium">{item.name}</td>
                                <td className="py-2 text-right">{item.avgWeeklyQty}</td>
                                <td className="py-2 text-right font-bold text-primary">{item.suggestedQty}</td>
                                <td className="py-2 text-right text-muted-foreground">{formatCur(item.unitPrice)}</td>
                                <td className="py-2 text-right">{formatCur(item.suggestedQty * item.unitPrice)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 font-bold">
                              <td className="py-2">Total</td>
                              <td className="py-2 text-right">{forecast.productionSuggestions.reduce((s: number, p: ProductionSuggestion) => s + p.avgWeeklyQty, 0)}</td>
                              <td className="py-2 text-right text-primary">{forecast.productionSuggestions.reduce((s: number, p: ProductionSuggestion) => s + p.suggestedQty, 0)}</td>
                              <td></td>
                              <td className="py-2 text-right">{formatCur(forecast.productionSuggestions.reduce((s: number, p: ProductionSuggestion) => s + p.suggestedQty * p.unitPrice, 0))}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : <p className="text-sm text-muted-foreground text-center py-8">No consumption data available for forecasting</p>}
                  </CardContent>
                </Card>
              </motion.div>

              {forecast.ingredientSuggestions?.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                  <Card data-testid="card-ingredient-suggestions">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Ingredient-Level Procurement Forecast</CardTitle>
                      <p className="text-xs text-muted-foreground">Based on recipe consumption × forecasted menu demand (10% safety buffer)</p>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 font-medium text-muted-foreground">Ingredient</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">Unit</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">Avg Weekly</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">Order Qty</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">Cost/Unit</th>
                              <th className="text-right py-2 font-medium text-muted-foreground">Est. Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {forecast.ingredientSuggestions.map((item: IngredientSuggestion, i: number) => (
                              <tr key={i} className="border-b last:border-0" data-testid={`row-ingredient-${i}`}>
                                <td className="py-2 font-medium">{item.name}</td>
                                <td className="py-2 text-right text-muted-foreground">{item.unit}</td>
                                <td className="py-2 text-right">{item.avgWeeklyNeed}</td>
                                <td className="py-2 text-right font-bold text-primary">{item.suggestedOrder}</td>
                                <td className="py-2 text-right text-muted-foreground">{formatCur(item.costPerUnit)}</td>
                                <td className="py-2 text-right">{formatCur(item.estimatedWeeklyCost)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 font-bold">
                              <td className="py-2" colSpan={5}>Total Estimated Ingredient Cost</td>
                              <td className="py-2 text-right">{formatCur(forecast.ingredientSuggestions.reduce((s: number, ig: IngredientSuggestion) => s + ig.estimatedWeeklyCost, 0))}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs></TabErrorBoundary>
    </div>
  );
}
