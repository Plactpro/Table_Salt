import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency, type FormatCurrencyOptions } from "@shared/currency";
import { motion } from "framer-motion";
import {
  Truck, Package, MapPin, Phone, Clock, User, Plus,
  ChevronRight, CheckCircle, AlertCircle, XCircle,
  Settings, ToggleLeft, ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface DeliveryOrder {
  id: string;
  tenantId: string;
  orderId: string | null;
  customerId: string | null;
  customerAddress: string;
  customerPhone: string | null;
  deliveryPartner: string | null;
  driverName: string | null;
  driverPhone: string | null;
  status: string | null;
  estimatedTime: number | null;
  actualTime: number | null;
  deliveryFee: string | null;
  trackingNotes: string | null;
  createdAt: string | null;
  deliveredAt: string | null;
}

interface CustomerData {
  id: string;
  name: string;
  phone: string | null;
}

type DeliveryStatus = "pending" | "assigned" | "picked_up" | "in_transit" | "delivered" | "cancelled" | "returned";

const statusConfig: Record<DeliveryStatus, { label: string; color: string; icon: typeof Package }> = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-700", icon: Clock },
  assigned: { label: "Assigned", color: "bg-blue-100 text-blue-700", icon: User },
  picked_up: { label: "Picked Up", color: "bg-indigo-100 text-indigo-700", icon: Package },
  in_transit: { label: "In Transit", color: "bg-amber-100 text-amber-700", icon: Truck },
  delivered: { label: "Delivered", color: "bg-green-100 text-green-700", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", icon: XCircle },
  returned: { label: "Returned", color: "bg-orange-100 text-orange-700", icon: AlertCircle },
};

const statusFlow: DeliveryStatus[] = ["pending", "assigned", "picked_up", "in_transit", "delivered"];

interface TenantConfig {
  moduleConfig?: {
    deliveryEnabled?: boolean;
  };
}

export default function DeliveryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currency = user?.tenant?.currency || "USD";
  const currencyOpts: FormatCurrencyOptions = { position: (user?.tenant?.currencyPosition || "before") as "before" | "after", decimals: user?.tenant?.currencyDecimals ?? 2 };
  const fmt = (val: string | number) => formatCurrency(val, currency, currencyOpts);

  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOrder | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const { data: tenantConfig } = useQuery<TenantConfig>({
    queryKey: ["/api/tenant"],
  });

  const deliveryEnabled = tenantConfig?.moduleConfig?.deliveryEnabled === true;

  const toggleDeliveryMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const currentConfig = (tenantConfig?.moduleConfig || {}) as Record<string, unknown>;
      const res = await apiRequest("PATCH", "/api/tenant", {
        moduleConfig: { ...currentConfig, deliveryEnabled: enabled },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const { data: deliveries = [], isLoading } = useQuery<DeliveryOrder[]>({
    queryKey: ["/api/delivery-orders"],
    enabled: deliveryEnabled,
  });

  const { data: customers = [] } = useQuery<CustomerData[]>({
    queryKey: ["/api/customers"],
    enabled: deliveryEnabled,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/delivery-orders/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
      toast({ title: "Delivery updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const filteredDeliveries = deliveries.filter((d) =>
    filterStatus === "all" || d.status === filterStatus
  );

  const statusCounts = deliveries.reduce<Record<string, number>>((acc, d) => {
    const s = d.status || "pending";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  /* EXTENSION POINT: Integrate with third-party delivery APIs (Uber Eats, DoorDash, etc.)
     to automatically advance status based on webhook callbacks from delivery partners. */
  const advanceStatus = (delivery: DeliveryOrder) => {
    const currentIdx = statusFlow.indexOf(delivery.status as DeliveryStatus);
    if (currentIdx >= 0 && currentIdx < statusFlow.length - 1) {
      const nextStatus = statusFlow[currentIdx + 1];
      const updateData: Record<string, unknown> = { status: nextStatus };
      if (nextStatus === "delivered") {
        updateData.deliveredAt = new Date().toISOString();
      }
      /* EXTENSION POINT: Send delivery notification to customer via SMS/push when status changes */
      updateMutation.mutate({ id: delivery.id, data: updateData });
    }
  };

  const activeDeliveries = deliveries.filter((d) =>
    d.status && !["delivered", "cancelled", "returned"].includes(d.status)
  ).length;

  /* EXTENSION POINT: When delivery module goes live, replace this placeholder with full
     operational view. The deliveryEnabled flag is persisted in tenant.moduleConfig and
     can be extended to include partner API keys, default delivery radius, fee structure, etc. */
  if (!deliveryEnabled) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Truck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-delivery-title">
              Delivery Management
            </h1>
            <p className="text-muted-foreground text-sm">Track and manage delivery orders</p>
          </div>
        </div>

        <Card className="max-w-lg mx-auto">
          <CardContent className="py-12 text-center space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto">
              <Truck className="w-10 h-10 text-amber-600" />
            </div>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200" data-testid="badge-under-review">
              Under Review
            </Badge>
            <div>
              <h2 className="text-xl font-bold font-heading mb-2">Delivery Management</h2>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                This module is currently under review and will be available in a future update.
                Delivery management features including order tracking, driver dispatch, real-time status updates, and third-party delivery partner integrations are being finalized.
              </p>
            </div>
            <div className="text-left max-w-xs mx-auto space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Planned Features</p>
              {[
                "Real-time order tracking & driver dispatch",
                "Delivery partner integrations (Uber Eats, DoorDash)",
                "Automated delivery fee calculation",
                "Driver performance analytics",
                "Customer delivery notifications",
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {feature}
                </div>
              ))}
            </div>
            <div className="border-t pt-4 mt-4">
              {/* EXTENSION POINT: Replace with subscription-gated activation when delivery goes live */}
              <Button
                onClick={() => toggleDeliveryMutation.mutate(true)}
                variant="outline"
                className="gap-2"
                disabled={toggleDeliveryMutation.isPending}
                data-testid="button-enable-delivery"
              >
                <ToggleRight className="w-4 h-4" />
                Enable Delivery Module
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Enable to start managing deliveries
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Truck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-delivery-title">
              Delivery Management
            </h1>
            <p className="text-muted-foreground text-sm">Track and manage delivery orders</p>
          </div>
        </div>
        {/* EXTENSION POINT: Add delivery partner integration controls here */}
        <Button variant="outline" size="sm" onClick={() => toggleDeliveryMutation.mutate(false)} disabled={toggleDeliveryMutation.isPending} data-testid="button-disable-delivery">
          <ToggleLeft className="w-4 h-4 mr-1" /> Disable Module
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold" data-testid="text-total-deliveries">{deliveries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="text-2xl font-bold text-amber-600" data-testid="text-active-deliveries">{activeDeliveries}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Delivered</p>
            <p className="text-2xl font-bold text-green-600" data-testid="text-delivered-count">{statusCounts.delivered || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">Cancelled</p>
            <p className="text-2xl font-bold text-red-600" data-testid="text-cancelled-count">{statusCounts.cancelled || 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={filterStatus === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterStatus("all")}
          data-testid="button-filter-all"
        >
          All ({deliveries.length})
        </Button>
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <Button
            key={key}
            variant={filterStatus === key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus(key)}
            data-testid={`button-filter-${key}`}
          >
            {cfg.label} ({statusCounts[key] || 0})
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredDeliveries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Truck className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground" data-testid="text-no-deliveries">No delivery orders found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredDeliveries.map((delivery, idx) => {
            const status = (delivery.status || "pending") as DeliveryStatus;
            const cfg = statusConfig[status] || statusConfig.pending;
            const StatusIcon = cfg.icon;
            const customer = delivery.customerId ? customerMap.get(delivery.customerId) : null;
            const canAdvance = statusFlow.indexOf(status) >= 0 && statusFlow.indexOf(status) < statusFlow.length - 1;

            return (
              <motion.div
                key={delivery.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <Card
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => { setSelectedDelivery(delivery); setShowDetailDialog(true); }}
                  data-testid={`card-delivery-${delivery.id}`}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg.color}`}>
                        <StatusIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{customer?.name || "Guest"}</p>
                          <Badge className={cfg.color} data-testid={`badge-delivery-status-${delivery.id}`}>
                            {cfg.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {delivery.customerAddress.length > 40
                              ? delivery.customerAddress.substring(0, 40) + "..."
                              : delivery.customerAddress}
                          </span>
                          {delivery.deliveryPartner && (
                            <span className="flex items-center gap-1">
                              <Truck className="w-3 h-3" /> {delivery.deliveryPartner}
                            </span>
                          )}
                          {delivery.estimatedTime && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {delivery.estimatedTime} min
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {delivery.deliveryFee && (
                        <span className="font-medium text-sm">
                          Fee: {fmt(Number(delivery.deliveryFee))}
                        </span>
                      )}
                      {canAdvance && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); advanceStatus(delivery); }}
                          disabled={updateMutation.isPending}
                          data-testid={`button-advance-${delivery.id}`}
                        >
                          Next <ChevronRight className="w-3 h-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delivery Details</DialogTitle>
          </DialogHeader>
          {selectedDelivery && (() => {
            const status = (selectedDelivery.status || "pending") as DeliveryStatus;
            const cfg = statusConfig[status] || statusConfig.pending;
            const customer = selectedDelivery.customerId ? customerMap.get(selectedDelivery.customerId) : null;

            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Badge className={`${cfg.color} text-sm`} data-testid="badge-detail-status">
                    {cfg.label}
                  </Badge>
                  {selectedDelivery.deliveryPartner && (
                    <Badge variant="outline">{selectedDelivery.deliveryPartner}</Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p className="font-medium">{customer?.name || "Guest"}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedDelivery.customerPhone || "—"}</p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Delivery Address</p>
                  <p className="font-medium flex items-start gap-1">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                    {selectedDelivery.customerAddress}
                  </p>
                </div>

                {(selectedDelivery.driverName || selectedDelivery.driverPhone) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Driver</p>
                      <p className="font-medium">{selectedDelivery.driverName || "—"}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Driver Phone</p>
                      <p className="font-medium">{selectedDelivery.driverPhone || "—"}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">Est. Time</p>
                    <p className="font-bold">{selectedDelivery.estimatedTime || "—"} min</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">Actual Time</p>
                    <p className="font-bold">{selectedDelivery.actualTime || "—"} min</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">Fee</p>
                    <p className="font-bold">{fmt(Number(selectedDelivery.deliveryFee || 0))}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Update Status</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {statusFlow.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={selectedDelivery.status === s ? "default" : "outline"}
                        onClick={() => {
                          const updateData: Record<string, unknown> = { status: s };
                          if (s === "delivered") updateData.deliveredAt = new Date().toISOString();
                          updateMutation.mutate({ id: selectedDelivery.id, data: updateData });
                          setSelectedDelivery({ ...selectedDelivery, status: s });
                        }}
                        disabled={updateMutation.isPending}
                        data-testid={`button-set-status-${s}`}
                      >
                        {statusConfig[s].label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
