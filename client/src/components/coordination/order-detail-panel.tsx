import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Clock, User, Utensils, Star, X, CheckCircle2, Timer,
  ChefHat, Package, Truck, ArrowRight, AlertTriangle,
} from "lucide-react";
import type { CoordinationOrder } from "./order-card";
import { formatDistanceToNow } from "date-fns";

const ITEM_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-700", icon: Timer },
  sent_to_kitchen: { label: "Sent to Kitchen", color: "bg-blue-100 text-blue-700", icon: ChefHat },
  in_preparation: { label: "In Preparation", color: "bg-orange-100 text-orange-700", icon: ChefHat },
  ready: { label: "Ready", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  served: { label: "Served", color: "bg-gray-100 text-gray-500", icon: CheckCircle2 },
};

const ORDER_STATUS_OPTIONS = [
  { value: "new", label: "New (Received)" },
  { value: "sent_to_kitchen", label: "Sent to Kitchen" },
  { value: "in_progress", label: "In Progress" },
  { value: "ready", label: "Ready" },
  { value: "served", label: "Served" },
];

interface OrderDetailPanelProps {
  order: CoordinationOrder | null;
  open: boolean;
  onClose: () => void;
}

export function OrderDetailPanel({ order, open, onClose }: OrderDetailPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newStatus, setNewStatus] = useState("");

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/orders/${order?.id}/coordination-status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coordination/dashboard"] });
      toast({ title: "Status Updated", description: "Order status has been updated" });
      setNewStatus("");
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  if (!order) return null;

  const elapsedMin = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-hidden flex flex-col" data-testid="order-detail-panel">
        <SheetHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              Order #{order.orderNumber}
              {order.isVip && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-300 gap-1" data-testid="panel-vip-badge">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> VIP
                </Badge>
              )}
            </SheetTitle>
          </div>
          <SheetDescription>
            Full order details and timeline
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 mt-4">
          <div className="space-y-5 pr-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Order Type</p>
                <p className="font-medium capitalize">{order.orderType?.replace("_", " ")}</p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge className="capitalize">{order.status?.replace(/_/g, " ")}</Badge>
              </div>
              {order.tableNumber && (
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Table</p>
                  <p className="font-medium">Table {order.tableNumber}{order.tableZone ? ` · ${order.tableZone}` : ""}</p>
                </div>
              )}
              {order.covers && (
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Covers</p>
                  <p className="font-medium">{order.covers} guests</p>
                </div>
              )}
              {order.customerName && (
                <div className="rounded-lg border p-3 space-y-1 col-span-2">
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{order.customerName}</p>
                </div>
              )}
              {order.waiterName && (
                <div className="rounded-lg border p-3 space-y-1 col-span-2">
                  <p className="text-xs text-muted-foreground">Waiter</p>
                  <p className="font-medium flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    {order.waiterName}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Time Tracking</h3>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Received
                  </span>
                  <span>{new Date(order.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5" /> Time Elapsed
                  </span>
                  <span className={elapsedMin >= 20 ? "text-red-600 font-semibold" : elapsedMin >= 10 ? "text-amber-600 font-semibold" : "text-green-600"}>
                    {elapsedMin} minutes
                    {elapsedMin >= 20 && <AlertTriangle className="h-3.5 w-3.5 inline ml-1" />}
                  </span>
                </div>
              </div>
            </div>

            {order.notes && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Notes</h3>
                <div className="rounded-lg border p-3 text-sm text-muted-foreground">{order.notes}</div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Items ({order.items?.length ?? 0})</h3>
              <div className="space-y-2">
                {(order.items ?? []).map((item) => {
                  const statusCfg = ITEM_STATUS_CONFIG[item.status] || ITEM_STATUS_CONFIG.pending;
                  const StatusIcon = statusCfg.icon;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      data-testid={`item-row-${item.id.slice(-4)}`}
                    >
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <Badge className={`${statusCfg.color} gap-1 text-xs`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusCfg.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Quick Actions</h3>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger className="flex-1" data-testid="select-new-status">
                      <SelectValue placeholder="Change status..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_STATUS_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => newStatus && statusMutation.mutate(newStatus)}
                    disabled={!newStatus || statusMutation.isPending}
                    className="shrink-0"
                    data-testid="btn-update-status"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
