import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChefHat, Zap, RefreshCw, Clock, CheckCircle2, AlertTriangle,
  Pause, LayoutGrid,
} from "lucide-react";

interface CoordItem {
  id: string;
  name: string;
  quantity: number;
  cookingStatus: string;
  station: string | null;
  estimatedReadyAt: string | null;
  startedAt: string | null;
  course: number | null;
}

interface CoordOrder {
  id: string;
  tableNumber: number | null;
  orderType: string | null;
  channel: string | null;
  status: string;
  createdAt: string | null;
  items: CoordItem[];
  readyCount: number;
  totalCount: number;
  etaMinutes: number | null;
}

interface CoordData {
  orders: CoordOrder[];
  stations: string[];
  settings: {
    cooking_control_mode: string;
    allow_rush_override: boolean;
    rush_requires_manager_pin: boolean;
  };
}

interface RawTicketItem {
  id: string;
  name: string;
  quantity?: number | null;
  status?: string | null;
  cookingStatus?: string | null;
  station?: string | null;
  estimatedReadyAt?: string | null;
  startedAt?: string | null;
  course?: number | null;
}

interface RawTicket {
  id: string;
  tableNumber?: number | null;
  orderType?: string | null;
  channel?: string | null;
  status: string;
  createdAt?: string | null;
  items?: RawTicketItem[];
}

function getCookingStatusInfo(status: string): { label: string; color: string; bgColor: string; dotColor: string } {
  switch (status) {
    case "queued": return { label: "Queued", color: "text-gray-600", bgColor: "bg-gray-100", dotColor: "bg-gray-400" };
    case "hold": return { label: "On Hold", color: "text-purple-700", bgColor: "bg-purple-100", dotColor: "bg-purple-500" };
    case "ready_to_start": return { label: "START NOW", color: "text-amber-700", bgColor: "bg-amber-100", dotColor: "bg-amber-500" };
    case "started": return { label: "Cooking", color: "text-blue-700", bgColor: "bg-blue-100", dotColor: "bg-blue-500" };
    case "almost_ready": return { label: "Almost Ready", color: "text-teal-700", bgColor: "bg-teal-100", dotColor: "bg-teal-500" };
    case "ready": return { label: "Ready ✓", color: "text-green-700", bgColor: "bg-green-100", dotColor: "bg-green-500" };
    case "held_warm": return { label: "Kept Warm", color: "text-orange-700", bgColor: "bg-orange-100", dotColor: "bg-orange-500" };
    case "served": return { label: "Served", color: "text-gray-500", bgColor: "bg-gray-50", dotColor: "bg-gray-300" };
    default: {
      const legacyMap: Record<string, ReturnType<typeof getCookingStatusInfo>> = {
        pending: { label: "Queued", color: "text-gray-600", bgColor: "bg-gray-100", dotColor: "bg-gray-400" },
        cooking: { label: "Cooking", color: "text-blue-700", bgColor: "bg-blue-100", dotColor: "bg-blue-500" },
        done: { label: "Ready ✓", color: "text-green-700", bgColor: "bg-green-100", dotColor: "bg-green-500" },
      };
      return legacyMap[status] ?? { label: status, color: "text-gray-600", bgColor: "bg-gray-100", dotColor: "bg-gray-400" };
    }
  }
}

function CountdownTimer({ estimatedReadyAt }: { estimatedReadyAt: string }) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(estimatedReadyAt).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    const iv = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor((new Date(estimatedReadyAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(iv);
  }, [estimatedReadyAt]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const isOverdue = secondsLeft === 0;

  return (
    <span className={`text-xs font-mono tabular-nums ${isOverdue ? "text-red-600 font-bold" : "text-blue-600"}`}>
      {isOverdue ? "overdue" : `${mins}:${secs.toString().padStart(2, "0")}`}
    </span>
  );
}

function CellContent({ item }: { item: CoordItem }) {
  const info = getCookingStatusInfo(item.cookingStatus);
  return (
    <div className={`rounded p-1.5 text-xs ${info.bgColor} border border-opacity-50`} style={{ borderColor: info.dotColor }}>
      <div className="font-medium truncate">{item.quantity > 1 ? `${item.quantity}× ` : ""}{item.name}</div>
      <div className={`flex items-center gap-1 mt-0.5 ${info.color}`}>
        <div className={`h-1.5 w-1.5 rounded-full ${info.dotColor}`} />
        <span>{info.label}</span>
        {item.cookingStatus === "started" && item.estimatedReadyAt && (
          <CountdownTimer estimatedReadyAt={item.estimatedReadyAt} />
        )}
      </div>
    </div>
  );
}

function useCoordinatorData() {
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<CoordData>({
    queryKey: ["/api/kds/coordinator/live"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/kds/coordinator/live");
        if (res.ok) return res.json();
      } catch (_) {}
      const ticketsRes = await apiRequest("GET", "/api/kds/tickets");
      if (!ticketsRes.ok) return { orders: [], stations: [], settings: { cooking_control_mode: "auto_start", allow_rush_override: true, rush_requires_manager_pin: false } };
      const tickets = await ticketsRes.json();
      const stationsSet = new Set<string>();
      const rawTickets = tickets as RawTicket[];
      const orders: CoordOrder[] = rawTickets.map((t: RawTicket) => {
        const items: CoordItem[] = (t.items ?? []).map((i: RawTicketItem) => {
          if (i.station) stationsSet.add(i.station);
          const cs = mapLegacyStatus(i.status ?? "pending");
          return { id: i.id, name: i.name, quantity: i.quantity ?? 1, cookingStatus: cs, station: i.station ?? null, estimatedReadyAt: i.estimatedReadyAt ?? null, startedAt: i.startedAt ?? null, course: i.course ?? null };
        });
        const readyCount = items.filter(i => i.cookingStatus === "ready" || i.cookingStatus === "served").length;
        return {
          id: t.id, tableNumber: t.tableNumber ?? null, orderType: t.orderType ?? null,
          channel: t.channel ?? null, status: t.status, createdAt: t.createdAt ?? null,
          items, readyCount, totalCount: items.length, etaMinutes: null,
        };
      });
      return { orders, stations: Array.from(stationsSet), settings: { cooking_control_mode: "auto_start", allow_rush_override: true, rush_requires_manager_pin: false } };
    },
    refetchInterval: 15000,
  });

  useRealtimeEvent("order:new", () => qc.invalidateQueries({ queryKey: ["/api/kds/coordinator/live"] }));
  useRealtimeEvent("order:updated", () => qc.invalidateQueries({ queryKey: ["/api/kds/coordinator/live"] }));
  useRealtimeEvent("order:item_updated", () => qc.invalidateQueries({ queryKey: ["/api/kds/coordinator/live"] }));
  useRealtimeEvent("kds:item_started", () => qc.invalidateQueries({ queryKey: ["/api/kds/coordinator/live"] }));
  useRealtimeEvent("kds:item_ready", () => qc.invalidateQueries({ queryKey: ["/api/kds/coordinator/live"] }));
  useRealtimeEvent("kds:order_rushed", () => qc.invalidateQueries({ queryKey: ["/api/kds/coordinator/live"] }));

  return { data, isLoading, refetch };
}

function mapLegacyStatus(s: string): string {
  if (s === "pending") return "queued";
  if (s === "cooking") return "started";
  if (s === "done" || s === "ready") return "ready";
  if (s === "served") return "served";
  return s;
}

interface ManagerAlert {
  id: string;
  message: string;
  receivedAt: number;
}

export default function CoordinatorPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, isLoading, refetch } = useCoordinatorData();

  const [rushDialog, setRushDialog] = useState<{ orderId: string; tableNumber: number | null } | null>(null);
  const [rushPin, setRushPin] = useState("");
  const [managerAlerts, setManagerAlerts] = useState<ManagerAlert[]>([]);

  useRealtimeEvent("kds:manager_alert", (rawPayload: unknown) => {
    const payload = rawPayload as { message?: string } | undefined;
    const msg = payload?.message ?? "Kitchen manager alert";
    setManagerAlerts(prev => [
      { id: `alert-${Date.now()}`, message: msg, receivedAt: Date.now() },
      ...prev.slice(0, 4),
    ]);
  });

  const rushMut = useMutation({
    mutationFn: async ({ orderId, pin }: { orderId: string; pin?: string }) => {
      try {
        const res = await apiRequest("PUT", `/api/kds/orders/${orderId}/rush`, { managerPin: pin });
        if (res.ok) return res.json();
      } catch (_) {}
      const items = data?.orders.find(o => o.id === orderId)?.items ?? [];
      for (const item of items) {
        if (item.cookingStatus !== "ready" && item.cookingStatus !== "served") {
          try { await apiRequest("PATCH", `/api/kds/order-items/${item.id}/status`, { status: "cooking" }); } catch (_) {}
        }
      }
      return { success: true };
    },
    onSuccess: () => {
      setRushDialog(null);
      setRushPin("");
      refetch();
      toast({ title: "Order rushed — all items started" });
    },
  });

  const orders = data?.orders ?? [];
  const stations = data?.stations ?? [];
  const settings = data?.settings;

  const totalOrders = orders.length;
  const overdueOrders = orders.filter(o => o.etaMinutes !== null && o.etaMinutes < 0).length;
  const readyOrders = orders.filter(o => o.readyCount === o.totalCount && o.totalCount > 0).length;

  return (
    <div className="p-4 lg:p-6 max-w-[1800px] mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <LayoutGrid className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="heading-coordinator">Coordinator View</h1>
            <p className="text-xs text-muted-foreground">Cross-station expeditor dashboard</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-coordinator">
          <RefreshCw className="h-4 w-4 mr-1" />Refresh
        </Button>
      </div>

      {managerAlerts.length > 0 && (
        <div className="space-y-2" data-testid="manager-alerts-banner">
          {managerAlerts.map(alert => (
            <div key={alert.id} className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700" data-testid={`alert-manager-${alert.id}`}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="font-medium">{alert.message}</span>
              </div>
              <button
                className="ml-4 text-red-400 hover:text-red-600"
                onClick={() => setManagerAlerts(prev => prev.filter(a => a.id !== alert.id))}
                data-testid={`dismiss-alert-${alert.id}`}
                aria-label="Dismiss alert"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active Orders", value: totalOrders, icon: Clock, color: "text-blue-600" },
          { label: "Ready", value: readyOrders, icon: CheckCircle2, color: "text-green-600" },
          { label: "Overdue", value: overdueOrders, icon: AlertTriangle, color: overdueOrders > 0 ? "text-red-600" : "text-muted-foreground" },
        ].map(s => (
          <Card key={s.label} className="p-4" data-testid={`coord-stat-${s.label.toLowerCase().replace(" ", "-")}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </div>
              <s.icon className={`h-6 w-6 ${s.color} opacity-60`} />
            </div>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <ChefHat className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No active orders</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-semibold text-muted-foreground w-32">Order</th>
                {stations.length > 0 ? (
                  stations.map(s => (
                    <th key={s} className="text-left p-2 font-semibold text-muted-foreground capitalize">{s}</th>
                  ))
                ) : (
                  <th className="text-left p-2 font-semibold text-muted-foreground">Items</th>
                )}
                <th className="text-left p-2 font-semibold text-muted-foreground w-36">Progress</th>
                {settings?.allow_rush_override && <th className="p-2 w-24" />}
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const label = order.tableNumber ? `Table ${order.tableNumber}` : order.orderType === "takeaway" ? "Takeaway" : `#${order.id.slice(-4).toUpperCase()}`;
                const isComplete = order.readyCount === order.totalCount && order.totalCount > 0;
                const hasOverdue = order.items.some(i => i.cookingStatus === "ready_to_start");

                return (
                  <tr
                    key={order.id}
                    className={`border-b transition-colors ${isComplete ? "bg-green-50" : hasOverdue ? "bg-amber-50/60" : "hover:bg-muted/30"}`}
                    data-testid={`coord-row-${order.id}`}
                  >
                    <td className="p-2">
                      <div className="font-bold">{label}</div>
                      {order.channel && <div className="text-xs text-muted-foreground capitalize">{order.channel}</div>}
                    </td>
                    {stations.length > 0 ? (
                      stations.map(st => {
                        const stationItems = order.items.filter(i => i.station === st);
                        return (
                          <td key={st} className="p-2 align-top">
                            <div className="space-y-1">
                              {stationItems.length === 0 ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                stationItems.map(item => (
                                  <CellContent key={item.id} item={item} />
                                ))
                              )}
                            </div>
                          </td>
                        );
                      })
                    ) : (
                      <td className="p-2 align-top">
                        <div className="flex flex-wrap gap-1">
                          {order.items.map(item => (
                            <CellContent key={item.id} item={item} />
                          ))}
                        </div>
                      </td>
                    )}
                    <td className="p-2">
                      <div className="text-xs font-medium mb-1">
                        {order.readyCount}/{order.totalCount} ready
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2" data-testid={`progress-order-${order.id}`}>
                        <div
                          className={`h-2 rounded-full transition-all ${isComplete ? "bg-green-500" : "bg-blue-500"}`}
                          style={{ width: order.totalCount > 0 ? `${(order.readyCount / order.totalCount) * 100}%` : "0%" }}
                        />
                      </div>
                      {isComplete && (
                        <div className="text-xs text-green-600 font-semibold mt-1">ORDER COMPLETE</div>
                      )}
                      {order.etaMinutes !== null && !isComplete && (
                        <div className="text-xs text-muted-foreground mt-1">
                          ETA: {order.etaMinutes >= 0 ? `${order.etaMinutes}m` : "overdue"}
                        </div>
                      )}
                    </td>
                    {settings?.allow_rush_override && (
                      <td className="p-2 text-center">
                        {!isComplete && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs px-2"
                            onClick={() => setRushDialog({ orderId: order.id, tableNumber: order.tableNumber })}
                            data-testid={`button-rush-${order.id}`}
                          >
                            <Zap className="h-3 w-3 mr-1" />Rush
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!rushDialog} onOpenChange={v => !v && setRushDialog(null)}>
        <DialogContent data-testid="dialog-rush">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-destructive" />
              ⚡ RUSH ORDER
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will immediately start all remaining items on{" "}
              <strong>{rushDialog?.tableNumber ? `Table ${rushDialog.tableNumber}` : "this order"}</strong>.
              All timing suggestions will be ignored.
            </p>
            {settings?.rush_requires_manager_pin && (
              <div>
                <Label>Manager PIN</Label>
                <Input
                  type="password"
                  value={rushPin}
                  onChange={e => setRushPin(e.target.value)}
                  placeholder="Enter PIN"
                  data-testid="input-rush-pin"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRushDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rushDialog && rushMut.mutate({ orderId: rushDialog.orderId, pin: rushPin || undefined })}
              disabled={rushMut.isPending || (settings?.rush_requires_manager_pin ? !rushPin : false)}
              data-testid="button-confirm-rush"
            >
              <Zap className="h-4 w-4 mr-1" />RUSH ALL ITEMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
