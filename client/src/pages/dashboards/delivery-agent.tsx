import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Package, MapPin, Phone, CheckCircle2, Truck,
  Clock, DollarSign, History, User, Loader2,
} from "lucide-react";

interface DeliveryOrder {
  id: string;
  orderType: string;
  status: string;
  total: string | number;
  notes: string | null;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryFee?: string | number;
  items?: Array<{ name: string; quantity: number; price: string }>;
}

const LIFECYCLE_BUTTONS: Record<string, { label: string; nextStatus: string; icon: React.ElementType; color: string }> = {
  new: { label: "Accept", nextStatus: "confirmed", icon: CheckCircle2, color: "bg-blue-600 hover:bg-blue-700" },
  confirmed: { label: "Picked Up", nextStatus: "in_progress", icon: Package, color: "bg-amber-600 hover:bg-amber-700" },
  in_progress: { label: "Out for Delivery", nextStatus: "ready", icon: Truck, color: "bg-orange-600 hover:bg-orange-700" },
  ready: { label: "Delivered", nextStatus: "completed", icon: CheckCircle2, color: "bg-green-600 hover:bg-green-700" },
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  confirmed: "Accepted",
  in_progress: "Picked Up",
  ready: "Out for Delivery",
  completed: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  confirmed: "bg-amber-100 text-amber-800",
  in_progress: "bg-orange-100 text-orange-800",
  ready: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};


function formatDate(dateStr: string, locale = "en-US") {
  const d = new Date(dateStr);
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function isActive(status: string) {
  return ["new", "confirmed", "in_progress", "ready"].includes(status);
}

function isHistory(status: string) {
  return ["completed", "cancelled"].includes(status);
}

export default function DeliveryAgentDashboard() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const fmt = (val: string | number | undefined) => {
    if (val === undefined || val === null) return "—";
    return sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition });
  };

  const { data: ordersData, isLoading } = useQuery<{ data: DeliveryOrder[] }>({
    queryKey: ["/api/delivery-orders"],
    refetchInterval: 30000,
  });

  const orders = ordersData?.data ?? [];
  const activeOrders = orders.filter(o => isActive(o.status));
  const historyOrders = orders.filter(o => isHistory(o.status)).slice(0, 20);

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/delivery-orders/${id}`, { status }).then(r => r.json()),
    onMutate: ({ id }) => setUpdatingId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
      toast({ title: "Order updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    onSettled: () => setUpdatingId(null),
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const completedOrders = orders.filter(o => o.status === "completed");
  const earningsToday = completedOrders
    .filter(o => new Date(o.createdAt) >= today)
    .reduce((s, o) => s + Number(o.deliveryFee ?? 0), 0);
  const earningsWeek = completedOrders
    .filter(o => new Date(o.createdAt) >= weekAgo)
    .reduce((s, o) => s + Number(o.deliveryFee ?? 0), 0);
  const earningsMonth = completedOrders
    .filter(o => new Date(o.createdAt) >= monthAgo)
    .reduce((s, o) => s + Number(o.deliveryFee ?? 0), 0);

  return (
    <div className="p-6 space-y-6" data-testid="delivery-agent-dashboard">
        <div className="flex items-center gap-3">
          <Truck className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-delivery-title">My Deliveries</h1>
            <p className="text-sm text-muted-foreground">
              Welcome, {user?.name ?? "Delivery Agent"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Today's Earnings</span>
              </div>
              <p className="text-xl font-bold" data-testid="text-earnings-today">{fmt(earningsToday)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">This Week</span>
              </div>
              <p className="text-xl font-bold" data-testid="text-earnings-week">{fmt(earningsWeek)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">This Month</span>
              </div>
              <p className="text-xl font-bold" data-testid="text-earnings-month">{fmt(earningsMonth)}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active" data-testid="tab-active-orders">
              My Assigned Orders
              {activeOrders.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {activeOrders.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-delivery-history">Delivery History</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : activeOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Truck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground font-medium">No active deliveries</p>
                  <p className="text-sm text-muted-foreground mt-1">New orders will appear here when assigned.</p>
                </CardContent>
              </Card>
            ) : (
              activeOrders.map((order) => {
                const lifecycle = LIFECYCLE_BUTTONS[order.status];
                const isUpdating = updatingId === order.id;
                return (
                  <Card key={order.id} data-testid={`card-delivery-${order.id}`} className="border-l-4 border-l-primary">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold">
                          Order #{order.id.slice(-6).toUpperCase()}
                        </CardTitle>
                        <Badge className={STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-800"}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {order.customerName && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span data-testid={`text-customer-name-${order.id}`}>{order.customerName}</span>
                        </div>
                      )}
                      {order.customerPhone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <a href={`tel:${order.customerPhone}`} className="text-primary hover:underline" data-testid={`link-phone-${order.id}`}>
                            {order.customerPhone}
                          </a>
                        </div>
                      )}
                      {order.deliveryAddress && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span data-testid={`text-address-${order.id}`}>{order.deliveryAddress}</span>
                        </div>
                      )}
                      {order.items && order.items.length > 0 && (
                        <div className="text-sm space-y-1 bg-muted/40 rounded-md p-2">
                          {order.items.map((item, i) => (
                            <div key={i} className="flex justify-between">
                              <span>{item.quantity}x {item.name}</span>
                              <span className="text-muted-foreground">{fmt(item.price)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Total: </span>
                          <span className="font-semibold" data-testid={`text-total-${order.id}`}>{fmt(order.total)}</span>
                          {order.deliveryFee && (
                            <span className="text-muted-foreground ml-2">(Fee: {fmt(order.deliveryFee)})</span>
                          )}
                        </div>
                        {lifecycle && (
                          <Button
                            size="sm"
                            className={`gap-2 text-white ${lifecycle.color}`}
                            disabled={isUpdating}
                            data-testid={`button-lifecycle-${order.id}`}
                            onClick={() => updateMutation.mutate({ id: order.id, status: lifecycle.nextStatus })}
                          >
                            {isUpdating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                {lifecycle.label}
                                <lifecycle.icon className="h-4 w-4" />
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Delivery History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {historyOrders.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No delivery history yet.</p>
                ) : (
                  <div className="space-y-2">
                    {historyOrders.map((order) => (
                      <div
                        key={order.id}
                        data-testid={`row-history-${order.id}`}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                      >
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">
                            Order #{order.id.slice(-6).toUpperCase()}
                            {order.customerName && ` — ${order.customerName}`}
                          </p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDate(order.createdAt, i18n.language)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-800"} variant="outline">
                            {STATUS_LABELS[order.status] ?? order.status}
                          </Badge>
                          <span className="text-sm font-semibold">{fmt(order.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </div>
  );
}
