import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Table as UITable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useKotAutoDispatch } from "@/hooks/use-kot-auto-dispatch";
import {
  Globe, Monitor, Bike, Car, UtensilsCrossed, Search, Eye, Clock, CheckCircle2,
  XCircle, ChefHat, Send, Package, Zap, Plus, Settings, RefreshCw, ShoppingBag,
  Truck, MapPin, Phone, User, ArrowRight, Filter, Hash, DollarSign,
} from "lucide-react";
import type { Order, OrderItem, Outlet, MenuItem } from "@shared/schema";

interface OrderChannel {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  icon: string | null;
  active: boolean | null;
  commissionPct: string | null;
}

interface ChannelConfig {
  id: string;
  tenantId: string;
  channelId: string;
  outletId: string;
  enabled: boolean | null;
  prepTimeMinutes: number | null;
  packagingFee: string | null;
  autoAccept: boolean | null;
}

interface OnlineMenuMapping {
  id: string;
  tenantId: string;
  menuItemId: string;
  channelId: string;
  externalItemId: string | null;
  externalPrice: string | null;
  available: boolean | null;
}

type OrderWithItems = Order & { items?: OrderItem[] };

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  pos: Monitor, swiggy: Bike, zomato: UtensilsCrossed, ubereats: Car, website: Globe,
};

const CHANNEL_COLORS: Record<string, string> = {
  pos: "bg-blue-100 text-blue-700 border-blue-300",
  swiggy: "bg-orange-100 text-orange-700 border-orange-300",
  zomato: "bg-red-100 text-red-700 border-red-300",
  ubereats: "bg-green-100 text-green-700 border-green-300",
  website: "bg-purple-100 text-purple-700 border-purple-300",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  new: Zap, sent_to_kitchen: Send, in_progress: ChefHat, ready: CheckCircle2,
  served: Package, paid: DollarSign, cancelled: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700", sent_to_kitchen: "bg-indigo-100 text-indigo-700",
  in_progress: "bg-amber-100 text-amber-700", ready: "bg-green-100 text-green-700",
  served: "bg-teal-100 text-teal-700", paid: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700", voided: "bg-gray-100 text-gray-700",
};

export default function OrdersHub() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { dispatchKotForOrder } = useKotAutoDispatch();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("live-orders");
  const [channelFilter, setChannelFilter] = useState("all");
  const [outletFilter, setOutletFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [mappingDialog, setMappingDialog] = useState(false);
  const [mappingForm, setMappingForm] = useState({ menuItemId: "", channelId: "", externalItemId: "", externalPrice: "" });
  const [configDialog, setConfigDialog] = useState(false);
  const [configForm, setConfigForm] = useState({ channelId: "", outletId: "", prepTimeMinutes: "20", packagingFee: "0", autoAccept: false });

  const formatCurrency = (amount: string | number) => {
    if (!user) return String(amount);
    const u = user as Record<string, unknown>;
    const tenant = (u.tenant || {}) as Record<string, unknown>;
    const currency = String(tenant.currency || u.currency || "USD");
    const position = String(tenant.currencyPosition || u.currencyPosition || "before");
    const decimals = parseInt(String(tenant.currencyDecimals ?? u.currencyDecimals ?? "2"));
    return sharedFormatCurrency(amount, currency, { position, decimals });
  };

  const { data: ordersRes } = useQuery<{ data: OrderWithItems[]; total: number }>({ queryKey: ["/api/orders"] });
  const orders = ordersRes?.data ?? [];
  const { data: channels = [] } = useQuery<OrderChannel[]>({ queryKey: ["/api/order-channels"] });
  const { data: configs = [] } = useQuery<ChannelConfig[]>({ queryKey: ["/api/channel-configs"] });
  const { data: mappings = [] } = useQuery<OnlineMenuMapping[]>({ queryKey: ["/api/online-menu-mappings"] });
  const { data: menuItems = [] } = useQuery<MenuItem[]>({ queryKey: ["/api/menu-items"] });
  const { data: outlets = [] } = useQuery<Outlet[]>({ queryKey: ["/api/outlets"] });

  const simulateOrder = useMutation({
    mutationFn: async (platform: string) => {
      const res = await apiRequest("POST", `/api/aggregator/simulate/${platform}`);
      return res.json();
    },
    onSuccess: (data: { order: Order }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Order Received", description: `New order from ${data.order.channel || "unknown"} channel` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createMapping = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/online-menu-mappings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-menu-mappings"] });
      setMappingDialog(false);
      toast({ title: "Mapping created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMapping = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/online-menu-mappings/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-menu-mappings"] });
      toast({ title: "Mapping removed" });
    },
  });

  const createConfig = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/channel-configs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channel-configs"] });
      setConfigDialog(false);
      toast({ title: "Channel config saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateConfig = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/channel-configs/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channel-configs"] });
      toast({ title: "Config updated" });
    },
  });

  const updateOrderStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/orders/${id}`, { status });
      return res.json();
    },
    onSuccess: (data: any, variables: { id: string; status: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setSelectedOrder(null);
      if (variables.status === "sent_to_kitchen") {
        dispatchKotForOrder(variables.id, user?.tenant?.name || "Kitchen");
      }
    },
  });

  const channelMap = useMemo(() => new Map(channels.map(c => [c.slug, c])), [channels]);
  const menuItemMap = useMemo(() => new Map(menuItems.map(m => [m.id, m])), [menuItems]);

  const liveStatuses = ["new", "sent_to_kitchen", "in_progress", "ready", "served"];
  const liveOrders = useMemo(() => {
    let filtered = orders.filter(o => liveStatuses.includes(o.status || ""));
    if (channelFilter !== "all") filtered = filtered.filter(o => (o.channel || "pos") === channelFilter);
    if (outletFilter !== "all") filtered = filtered.filter(o => o.outletId === outletFilter);
    if (statusFilter !== "all") filtered = filtered.filter(o => o.status === statusFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(o => o.id.toLowerCase().includes(q) || (o.channelOrderId || "").toLowerCase().includes(q) || (o.notes || "").toLowerCase().includes(q));
    }
    return filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [orders, channelFilter, outletFilter, statusFilter, searchQuery]);

  const channelStats = useMemo(() => {
    const stats: Record<string, { total: number; active: number; revenue: number }> = {};
    for (const ch of channels) {
      stats[ch.slug] = { total: 0, active: 0, revenue: 0 };
    }
    stats["pos"] = stats["pos"] || { total: 0, active: 0, revenue: 0 };
    for (const o of orders) {
      const ch = o.channel || "pos";
      if (!stats[ch]) stats[ch] = { total: 0, active: 0, revenue: 0 };
      stats[ch].total++;
      if (liveStatuses.includes(o.status || "")) stats[ch].active++;
      if (o.status === "paid" || o.status === "served") stats[ch].revenue += parseFloat(o.total || "0");
    }
    return stats;
  }, [orders, channels]);

  const getTimeAgo = (date: string | Date | null) => {
    if (!date) return "";
    const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m ago`;
  };

  return (
    <div className="p-6 space-y-6" data-testid="orders-hub-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <ShoppingBag className="h-6 w-6 text-primary" /> Online Orders
          </h1>
          <p className="text-muted-foreground text-sm mt-1">All channels, one dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          {["swiggy", "zomato", "ubereats"].map(p => (
            <Button key={p} variant="outline" size="sm" onClick={() => simulateOrder.mutate(p)} disabled={simulateOrder.isPending} data-testid={`button-simulate-${p}`}>
              <Plus className="h-3 w-3 mr-1" />
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {channels.map(ch => {
          const stats = channelStats[ch.slug] || { total: 0, active: 0, revenue: 0 };
          const Icon = CHANNEL_ICONS[ch.slug] || Globe;
          const colorCls = CHANNEL_COLORS[ch.slug] || "bg-gray-100 text-gray-700 border-gray-300";
          return (
            <motion.div key={ch.id} whileHover={{ scale: 1.02 }} className="cursor-pointer" onClick={() => { setChannelFilter(channelFilter === ch.slug ? "all" : ch.slug); setActiveTab("live-orders"); }}>
              <Card className={`border ${channelFilter === ch.slug ? "ring-2 ring-primary" : ""}`} data-testid={`card-channel-${ch.slug}`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className={colorCls}><Icon className="h-3 w-3 mr-1" />{ch.name}</Badge>
                    {ch.active ? <span className="h-2 w-2 rounded-full bg-green-500" /> : <span className="h-2 w-2 rounded-full bg-gray-300" />}
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div><span className="text-muted-foreground">Active:</span> <span className="font-semibold">{stats.active}</span></div>
                    <div><span className="text-muted-foreground">Total:</span> <span className="font-semibold">{stats.total}</span></div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="live-orders" data-testid="tab-live-orders">Live Orders ({liveOrders.length})</TabsTrigger>
          <TabsTrigger value="channel-settings" data-testid="tab-channel-settings">Channel Settings</TabsTrigger>
          <TabsTrigger value="menu-mapping" data-testid="tab-menu-mapping">Online Menu Mapping</TabsTrigger>
        </TabsList>

        <TabsContent value="live-orders" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search orders..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" data-testid="input-search-orders" />
            </div>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-channel-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                {channels.map(ch => <SelectItem key={ch.id} value={ch.slug}>{ch.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={outletFilter} onValueChange={setOutletFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-outlet-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outlets</SelectItem>
                {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="sent_to_kitchen">Sent to Kitchen</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="served">Served</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {liveOrders.map(order => {
                const ch = order.channel || "pos";
                const Icon = CHANNEL_ICONS[ch] || Globe;
                const colorCls = CHANNEL_COLORS[ch] || "bg-gray-100 text-gray-700";
                const StatusIcon = STATUS_ICONS[order.status || "new"] || Zap;
                const statusColor = STATUS_COLORS[order.status || "new"] || "bg-gray-100 text-gray-700";
                const channelData = order.channelData as Record<string, string> | null;
                return (
                  <motion.div key={order.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} layout>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedOrder(order)} data-testid={`card-order-${order.id.slice(-4)}`}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={colorCls}><Icon className="h-3 w-3 mr-1" />{ch.toUpperCase()}</Badge>
                            {order.channelOrderId && <span className="text-xs text-muted-foreground font-mono">#{order.channelOrderId}</span>}
                          </div>
                          <Badge className={statusColor}><StatusIcon className="h-3 w-3 mr-1" />{(order.status || "new").replace(/_/g, " ")}</Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" /> {getTimeAgo(order.createdAt)}
                          </div>
                          <span className="font-bold text-lg">{formatCurrency(order.total || "0")}</span>
                        </div>
                        {channelData?.customerName && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" /> {channelData.customerName}
                            {channelData.customerAddress && <><MapPin className="h-3 w-3 ml-2" /> {channelData.customerAddress.substring(0, 30)}...</>}
                          </div>
                        )}
                        {order.items && order.items.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {order.items.slice(0, 3).map(i => `${i.quantity}x ${i.name}`).join(", ")}
                            {order.items.length > 3 && ` +${order.items.length - 3} more`}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          {liveOrders.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No live orders matching your filters</p>
              <p className="text-sm mt-1">Simulate an order from an aggregator above</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="channel-settings" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Channel Configuration</h3>
            <Button size="sm" onClick={() => { setConfigForm({ channelId: "", outletId: outlets[0]?.id || "", prepTimeMinutes: "20", packagingFee: "0", autoAccept: false }); setConfigDialog(true); }} data-testid="button-add-config">
              <Plus className="h-4 w-4 mr-1" /> Add Config
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {channels.filter(ch => ch.slug !== "pos").map(ch => {
              const chConfigs = configs.filter(c => c.channelId === ch.id);
              const Icon = CHANNEL_ICONS[ch.slug] || Globe;
              const colorCls = CHANNEL_COLORS[ch.slug] || "bg-gray-100 text-gray-700 border-gray-300";
              return (
                <Card key={ch.id} data-testid={`card-channel-config-${ch.slug}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge variant="outline" className={colorCls}><Icon className="h-3 w-3 mr-1" />{ch.name}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{ch.commissionPct}% commission</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {chConfigs.length === 0 && <p className="text-xs text-muted-foreground">No outlet configs yet</p>}
                    {chConfigs.map(cfg => {
                      const outlet = outlets.find(o => o.id === cfg.outletId);
                      return (
                        <div key={cfg.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
                          <div>
                            <span className="font-medium">{outlet?.name || "Unknown"}</span>
                            <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                              <span><Clock className="h-3 w-3 inline mr-0.5" />{cfg.prepTimeMinutes}min</span>
                              <span><Package className="h-3 w-3 inline mr-0.5" />{formatCurrency(cfg.packagingFee || "0")}</span>
                              <span>{cfg.autoAccept ? "Auto-accept" : "Manual"}</span>
                            </div>
                          </div>
                          <Switch checked={cfg.enabled ?? false} onCheckedChange={(checked) => updateConfig.mutate({ id: cfg.id, data: { enabled: checked } })} data-testid={`switch-config-${cfg.id.slice(-4)}`} />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="menu-mapping" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Online Menu Mapping</h3>
            <Button size="sm" onClick={() => { setMappingForm({ menuItemId: "", channelId: "", externalItemId: "", externalPrice: "" }); setMappingDialog(true); }} data-testid="button-add-mapping">
              <Plus className="h-4 w-4 mr-1" /> Add Mapping
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <UITable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Menu Item</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>External ID</TableHead>
                    <TableHead>External Price</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map(m => {
                    const mi = menuItemMap.get(m.menuItemId);
                    const ch = channels.find(c => c.id === m.channelId);
                    return (
                      <TableRow key={m.id} data-testid={`row-mapping-${m.id.slice(-4)}`}>
                        <TableCell className="font-medium">{mi?.name || "Unknown"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={CHANNEL_COLORS[ch?.slug || ""] || ""}>{ch?.name || "?"}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{m.externalItemId}</TableCell>
                        <TableCell>{m.externalPrice ? formatCurrency(m.externalPrice) : "-"}</TableCell>
                        <TableCell>{m.available ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => deleteMapping.mutate(m.id)} data-testid={`button-delete-mapping-${m.id.slice(-4)}`}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {mappings.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No menu mappings configured</TableCell></TableRow>
                  )}
                </TableBody>
              </UITable>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Order Details
              {selectedOrder?.channel && (
                <Badge variant="outline" className={CHANNEL_COLORS[selectedOrder.channel] || ""}>
                  {selectedOrder.channel.toUpperCase()}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Order ID:</span> <span className="font-mono">{selectedOrder.id.slice(-8)}</span></div>
                {selectedOrder.channelOrderId && <div><span className="text-muted-foreground">Channel ID:</span> <span className="font-mono">{selectedOrder.channelOrderId}</span></div>}
                <div><span className="text-muted-foreground">Status:</span> <Badge className={STATUS_COLORS[selectedOrder.status || "new"]}>{(selectedOrder.status || "new").replace(/_/g, " ")}</Badge></div>
                <div><span className="text-muted-foreground">Type:</span> {selectedOrder.orderType}</div>
              </div>
              {(selectedOrder.channelData as Record<string, string> | null) && (
                <div className="p-3 rounded bg-muted/30 space-y-1 text-sm">
                  {(selectedOrder.channelData as Record<string, string>).customerName && <div className="flex items-center gap-1"><User className="h-3 w-3" /> {(selectedOrder.channelData as Record<string, string>).customerName}</div>}
                  {(selectedOrder.channelData as Record<string, string>).customerPhone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {(selectedOrder.channelData as Record<string, string>).customerPhone}</div>}
                  {(selectedOrder.channelData as Record<string, string>).customerAddress && <div className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {(selectedOrder.channelData as Record<string, string>).customerAddress}</div>}
                </div>
              )}
              <Separator />
              <div className="space-y-1">
                {selectedOrder.items?.map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{item.quantity}x {item.name}</span>
                    <span>{formatCurrency(parseFloat(item.price) * (item.quantity || 1))}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(selectedOrder.subtotal || "0")}</span></div>
                <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(selectedOrder.tax || "0")}</span></div>
                <div className="flex justify-between font-bold text-base"><span>Total</span><span>{formatCurrency(selectedOrder.total || "0")}</span></div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {selectedOrder.status === "new" && <Button size="sm" onClick={() => updateOrderStatus.mutate({ id: selectedOrder.id, status: "sent_to_kitchen" })} data-testid="button-send-kitchen"><Send className="h-3 w-3 mr-1" /> Send to Kitchen</Button>}
                {selectedOrder.status === "ready" && <Button size="sm" onClick={() => updateOrderStatus.mutate({ id: selectedOrder.id, status: "served" })} data-testid="button-mark-served"><Package className="h-3 w-3 mr-1" /> Mark Served</Button>}
                {selectedOrder.status === "served" && <Button size="sm" onClick={() => updateOrderStatus.mutate({ id: selectedOrder.id, status: "paid" })} data-testid="button-mark-paid"><DollarSign className="h-3 w-3 mr-1" /> Mark Paid</Button>}
                {["new", "sent_to_kitchen"].includes(selectedOrder.status || "") && <Button size="sm" variant="destructive" onClick={() => updateOrderStatus.mutate({ id: selectedOrder.id, status: "cancelled" })} data-testid="button-cancel-order"><XCircle className="h-3 w-3 mr-1" /> Cancel</Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={mappingDialog} onOpenChange={setMappingDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Menu Mapping</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Menu Item</Label>
              <Select value={mappingForm.menuItemId || "none"} onValueChange={v => setMappingForm({ ...mappingForm, menuItemId: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="select-mapping-menu-item"><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select item</SelectItem>
                  {menuItems.map(mi => <SelectItem key={mi.id} value={mi.id}>{mi.name} ({formatCurrency(mi.price)})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Channel</Label>
              <Select value={mappingForm.channelId || "none"} onValueChange={v => setMappingForm({ ...mappingForm, channelId: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="select-mapping-channel"><SelectValue placeholder="Select channel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select channel</SelectItem>
                  {channels.filter(c => c.slug !== "pos").map(ch => <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>External Item ID</Label>
              <Input value={mappingForm.externalItemId} onChange={e => setMappingForm({ ...mappingForm, externalItemId: e.target.value })} placeholder="e.g. SWG-001" data-testid="input-mapping-external-id" />
            </div>
            <div>
              <Label>External Price</Label>
              <Input type="number" step="0.01" value={mappingForm.externalPrice} onChange={e => setMappingForm({ ...mappingForm, externalPrice: e.target.value })} placeholder="0.00" data-testid="input-mapping-price" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMappingDialog(false)}>Cancel</Button>
            <Button onClick={() => createMapping.mutate({ menuItemId: mappingForm.menuItemId, channelId: mappingForm.channelId, externalItemId: mappingForm.externalItemId || null, externalPrice: mappingForm.externalPrice || null, available: true })} disabled={!mappingForm.menuItemId || !mappingForm.channelId} data-testid="button-save-mapping">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={configDialog} onOpenChange={setConfigDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Channel Config</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Channel</Label>
              <Select value={configForm.channelId || "none"} onValueChange={v => setConfigForm({ ...configForm, channelId: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="select-config-channel"><SelectValue placeholder="Select channel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select channel</SelectItem>
                  {channels.filter(c => c.slug !== "pos").map(ch => <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Outlet</Label>
              <Select value={configForm.outletId || "none"} onValueChange={v => setConfigForm({ ...configForm, outletId: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="select-config-outlet"><SelectValue placeholder="Select outlet" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select outlet</SelectItem>
                  {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Prep Time (minutes)</Label>
                <Input type="number" value={configForm.prepTimeMinutes} onChange={e => setConfigForm({ ...configForm, prepTimeMinutes: e.target.value })} data-testid="input-config-prep-time" />
              </div>
              <div>
                <Label>Packaging Fee</Label>
                <Input type="number" step="0.01" value={configForm.packagingFee} onChange={e => setConfigForm({ ...configForm, packagingFee: e.target.value })} data-testid="input-config-packaging-fee" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={configForm.autoAccept} onCheckedChange={checked => setConfigForm({ ...configForm, autoAccept: checked })} data-testid="switch-config-auto-accept" />
              <Label>Auto-accept orders</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialog(false)}>Cancel</Button>
            <Button onClick={() => createConfig.mutate({ channelId: configForm.channelId, outletId: configForm.outletId, prepTimeMinutes: parseInt(configForm.prepTimeMinutes) || 20, packagingFee: configForm.packagingFee || "0", autoAccept: configForm.autoAccept, enabled: true })} disabled={!configForm.channelId || !configForm.outletId} data-testid="button-save-config">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
