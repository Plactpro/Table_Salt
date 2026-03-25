import { PageTitle } from "@/lib/accessibility";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  MonitorSmartphone, ShoppingBag, Smartphone, QrCode,
  TrendingUp, BarChart3, Clock,
  DollarSign, ShoppingCart, Layers,
  CheckCircle, AlertCircle, Circle,
} from "lucide-react";
import type { Order, OrderItem } from "@shared/schema";

const CHANNEL_META: Record<string, { label: string; icon: typeof MonitorSmartphone; color: string; bgColor: string }> = {
  pos: { label: "POS (In-store)", icon: MonitorSmartphone, color: "text-blue-600", bgColor: "bg-blue-50" },
  kiosk: { label: "Self-Service Kiosk", icon: Smartphone, color: "text-purple-600", bgColor: "bg-purple-50" },
  qr_dinein: { label: "QR Table Order", icon: QrCode, color: "text-teal-600", bgColor: "bg-teal-50" },
  online: { label: "Online / Delivery", icon: ShoppingBag, color: "text-orange-600", bgColor: "bg-orange-50" },
  aggregator: { label: "Aggregators", icon: Layers, color: "text-pink-600", bgColor: "bg-pink-50" },
};

function getChannelMeta(channel: string) {
  return CHANNEL_META[channel] || { label: channel, icon: ShoppingCart, color: "text-gray-600", bgColor: "bg-gray-50" };
}

interface ChannelStats {
  channel: string;
  orderCount: number;
  revenue: number;
  avgOrderValue: number;
  topItems: { name: string; quantity: number }[];
  avgPrepTime: number | null;
  hourlyBreakdown: { hour: number; count: number; revenue: number }[];
}

function computeChannelStats(
  orders: Order[],
  orderItems: { orderId: string | null; name: string | null; quantity: number | null }[]
): ChannelStats[] {
  const channelMap = new Map<string, {
    orders: Order[];
    items: Map<string, number>;
    hourly: Map<number, { count: number; revenue: number }>;
  }>();

  for (const o of orders) {
    if (o.status === "voided" || o.status === "cancelled") continue;
    const ch = o.channel || "pos";
    if (!channelMap.has(ch)) {
      channelMap.set(ch, { orders: [], items: new Map(), hourly: new Map() });
    }
    const entry = channelMap.get(ch)!;
    entry.orders.push(o);

    if (o.createdAt) {
      const hour = new Date(o.createdAt).getHours();
      const h = entry.hourly.get(hour) || { count: 0, revenue: 0 };
      h.count++;
      h.revenue += Number(o.total) || 0;
      entry.hourly.set(hour, h);
    }
  }

  const orderIdToChannel = new Map(orders.map(o => [o.id, o.channel || "pos"]));
  for (const oi of orderItems) {
    if (!oi.orderId) continue;
    const ch = orderIdToChannel.get(oi.orderId);
    if (!ch || !channelMap.has(ch)) continue;
    const entry = channelMap.get(ch)!;
    const name = oi.name || "Unknown";
    entry.items.set(name, (entry.items.get(name) || 0) + (oi.quantity || 1));
  }

  const results: ChannelStats[] = [];
  for (const [channel, data] of channelMap) {
    const revenue = data.orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const orderCount = data.orders.length;
    const topItems = [...data.items.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, quantity]) => ({ name, quantity }));
    const hourlyBreakdown = [...data.hourly.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, stats]) => ({ hour, ...stats }));

    results.push({
      channel,
      orderCount,
      revenue: Math.round(revenue * 100) / 100,
      avgOrderValue: orderCount > 0 ? Math.round((revenue / orderCount) * 100) / 100 : 0,
      topItems,
      avgPrepTime: null,
      hourlyBreakdown,
    });
  }

  return results.sort((a, b) => b.revenue - a.revenue);
}

function getPeakHour(hourly: { hour: number; count: number }[]): string {
  if (hourly.length === 0) return "N/A";
  const peak = hourly.reduce((a, b) => a.count > b.count ? a : b);
  const h = peak.hour;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}${ampm}`;
}

export default function OmnichannelPage() {
  const { user } = useAuth();

  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });

  const { data: allOrdersRes } = useQuery<{ data: Order[]; total: number }>({ queryKey: ["/api/orders"] });
  const allOrders = allOrdersRes?.data ?? [];
  const { data: allOrderItems = [] } = useQuery<OrderItem[]>({ queryKey: ["/api/order-items"] });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const todayOrders = useMemo(() => allOrders.filter(o => o.createdAt && new Date(o.createdAt) >= todayStart), [allOrders]);
  const weekOrders = useMemo(() => allOrders.filter(o => o.createdAt && new Date(o.createdAt) >= weekStart), [allOrders]);

  const todayStats = useMemo(() => computeChannelStats(todayOrders, allOrderItems), [todayOrders, allOrderItems]);
  const weekStats = useMemo(() => computeChannelStats(weekOrders, allOrderItems), [weekOrders, allOrderItems]);
  const allTimeStats = useMemo(() => computeChannelStats(allOrders, allOrderItems), [allOrders, allOrderItems]);

  const totalRevenueToday = todayStats.reduce((s, c) => s + c.revenue, 0);
  const totalOrdersToday = todayStats.reduce((s, c) => s + c.orderCount, 0);
  const totalRevenueWeek = weekStats.reduce((s, c) => s + c.revenue, 0);
  const totalOrdersWeek = weekStats.reduce((s, c) => s + c.orderCount, 0);

  const channelCount = allTimeStats.length;

  const channelStatuses = useMemo(() => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const channels = Object.keys(CHANNEL_META);
    return channels.map(ch => {
      const meta = CHANNEL_META[ch];
      const chOrders = allOrders.filter(o => (o as any).channel === ch);
      const recentOrders = chOrders.filter(o => o.createdAt && new Date(o.createdAt) >= oneHourAgo);
      const hasRecent = recentOrders.length > 0;
      const totalOrders = chOrders.length;
      return { channel: ch, ...meta, hasRecent, recentCount: recentOrders.length, totalOrders };
    });
  }, [allOrders]);

  const recentOrdersFeed = useMemo(() => {
    return [...allOrders]
      .sort((a, b) => (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0))
      .slice(0, 20);
  }, [allOrders]);

  return (
    <div className="p-6 space-y-6" data-testid="omnichannel-page">
      <PageTitle title="Omnichannel" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold" data-testid="text-page-title">Omnichannel Dashboard</h1>
          <p className="text-muted-foreground text-sm">Unified view across all ordering channels</p>
        </div>
        <Badge variant="outline" className="gap-1" data-testid="badge-channel-count">
          <Layers className="h-3.5 w-3.5" />
          {channelCount} Active Channel{channelCount !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-today-revenue">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Today's Revenue</p>
                <p className="text-xl font-bold" data-testid="text-today-revenue">{fmt(totalRevenueToday)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-today-orders">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Today's Orders</p>
                <p className="text-xl font-bold" data-testid="text-today-orders">{totalOrdersToday}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-week-revenue">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">7-Day Revenue</p>
                <p className="text-xl font-bold" data-testid="text-week-revenue">{fmt(totalRevenueWeek)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-week-orders">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">7-Day Orders</p>
                <p className="text-xl font-bold" data-testid="text-week-orders">{totalOrdersWeek}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-channel-revenue-mix">
          <CardHeader>
            <CardTitle className="text-base">Revenue by Channel (All Time)</CardTitle>
          </CardHeader>
          <CardContent>
            {allTimeStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No order data yet</p>
            ) : (
              <div className="space-y-3">
                {allTimeStats.map(stat => {
                  const meta = getChannelMeta(stat.channel);
                  const Icon = meta.icon;
                  const totalRevAll = allTimeStats.reduce((s, c) => s + c.revenue, 0);
                  const pct = totalRevAll > 0 ? ((stat.revenue / totalRevAll) * 100) : 0;
                  return (
                    <div key={stat.channel} className="flex items-center gap-3" data-testid={`channel-revenue-${stat.channel}`}>
                      <div className={`p-1.5 rounded-lg ${meta.bgColor}`}>
                        <Icon className={`h-4 w-4 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate">{meta.label}</span>
                          <span className="text-sm font-semibold">{fmt(stat.revenue)}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full transition-all"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{pct.toFixed(1)}% of total</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-channel-order-count">
          <CardHeader>
            <CardTitle className="text-base">Orders by Channel (All Time)</CardTitle>
          </CardHeader>
          <CardContent>
            {allTimeStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No order data yet</p>
            ) : (
              <div className="space-y-3">
                {allTimeStats.map(stat => {
                  const meta = getChannelMeta(stat.channel);
                  const Icon = meta.icon;
                  const totalAllOrders = allTimeStats.reduce((s, c) => s + c.orderCount, 0);
                  const pct = totalAllOrders > 0 ? (stat.orderCount / totalAllOrders) * 100 : 0;
                  return (
                    <div key={stat.channel} className="flex items-center gap-3" data-testid={`channel-orders-${stat.channel}`}>
                      <div className={`p-1.5 rounded-lg ${meta.bgColor}`}>
                        <Icon className={`h-4 w-4 ${meta.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{meta.label}</span>
                          <div className="text-right">
                            <span className="text-sm font-semibold">{stat.orderCount}</span>
                            <span className="text-xs text-muted-foreground ml-1">({pct.toFixed(1)}%)</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full transition-all"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="text-lg font-heading font-semibold pt-2">Channel Breakdown</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {allTimeStats.map(stat => {
          const meta = getChannelMeta(stat.channel);
          const Icon = meta.icon;
          const peakHour = getPeakHour(stat.hourlyBreakdown);

          return (
            <Card key={stat.channel} data-testid={`card-channel-detail-${stat.channel}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${meta.bgColor}`}>
                    <Icon className={`h-5 w-5 ${meta.color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-base">{meta.label}</CardTitle>
                    <p className="text-xs text-muted-foreground">{stat.orderCount} orders total</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-2 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="font-semibold text-sm">{fmt(stat.revenue)}</p>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Avg. Order</p>
                    <p className="font-semibold text-sm">{fmt(stat.avgOrderValue)}</p>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Peak Hour</p>
                    <p className="font-semibold text-sm">{peakHour}</p>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Orders</p>
                    <p className="font-semibold text-sm">{stat.orderCount}</p>
                  </div>
                </div>

                {stat.topItems.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Top Items</p>
                      <div className="space-y-1">
                        {stat.topItems.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="truncate">{item.name}</span>
                            <Badge variant="secondary" className="text-xs shrink-0">{item.quantity} sold</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-channel-status">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Channel Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {channelStatuses.map(cs => {
              const Icon = cs.icon;
              return (
                <div key={cs.channel} className="flex items-center justify-between py-2 border-b last:border-b-0" data-testid={`channel-status-${cs.channel}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md ${cs.bgColor}`}>
                      <Icon className={`h-4 w-4 ${cs.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{cs.label}</p>
                      <p className="text-xs text-muted-foreground">{cs.totalOrders} total orders</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {cs.hasRecent ? (
                      <Badge variant="default" className="gap-1 bg-green-100 text-green-700 hover:bg-green-100">
                        <CheckCircle className="h-3 w-3" />
                        Active ({cs.recentCount}/hr)
                      </Badge>
                    ) : cs.totalOrders > 0 ? (
                      <Badge variant="secondary" className="gap-1">
                        <Circle className="h-3 w-3" />
                        Idle
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-muted-foreground">
                        <AlertCircle className="h-3 w-3" />
                        No Orders
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card data-testid="card-recent-orders-feed">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Orders (All Channels)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrdersFeed.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No orders yet</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {recentOrdersFeed.map(order => {
                  const ch = (order as any).channel || "pos";
                  const meta = CHANNEL_META[ch] || CHANNEL_META.pos;
                  const ChIcon = meta.icon;
                  const statusColor: Record<string, string> = {
                    new: "bg-blue-100 text-blue-700",
                    sent_to_kitchen: "bg-amber-100 text-amber-700",
                    in_progress: "bg-orange-100 text-orange-700",
                    ready: "bg-green-100 text-green-700",
                    served: "bg-teal-100 text-teal-700",
                    paid: "bg-emerald-100 text-emerald-700",
                    cancelled: "bg-red-100 text-red-700",
                    voided: "bg-gray-100 text-gray-700",
                  };
                  return (
                    <div key={order.id} className="flex items-center justify-between py-1.5 border-b last:border-b-0" data-testid={`recent-order-${order.id}`}>
                      <div className="flex items-center gap-2">
                        <ChIcon className={`h-3.5 w-3.5 ${meta.color}`} />
                        <span className="text-sm font-medium">#{order.tokenNumber || order.id.toString().slice(-4)}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${statusColor[order.status] || "bg-gray-100 text-gray-600"}`}>
                          {order.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{fmt(order.total || 0)}</span>
                        <span>{order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {allTimeStats.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Layers className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="font-medium text-lg mb-1">No Channel Data Yet</h3>
            <p className="text-sm text-muted-foreground">
              Orders from POS, Kiosk, QR Table ordering, and delivery aggregators will appear here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
