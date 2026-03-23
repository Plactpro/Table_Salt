import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, History } from "lucide-react";
import BillPreviewModal from "@/components/pos/BillPreviewModal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import type { Order, OrderItem, Table } from "@shared/schema";

type OrderWithItems = Order & { items?: OrderItem[] };

export default function BillViewPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const serviceChargeRate = Number(user?.tenant?.serviceCharge || 0) / 100;

  const { data: order, isLoading, error } = useQuery<OrderWithItems>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Order not found");
      return res.json();
    },
    enabled: !!orderId,
  });

  const { data: tables = [] } = useQuery<Table[]>({ queryKey: ["/api/tables"] });
  const tableMap = Object.fromEntries(tables.map((t) => [t.id, t.number]));

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-bill-view">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="error-bill-view">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Order not found</p>
          <button className="text-primary underline text-sm" onClick={() => navigate("/orders")}>
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  const cartItems = (order.items ?? []).map((item) => ({
    menuItemId: item.menuItemId || item.id,
    name: item.name || "",
    price: Number(item.price || 0),
    quantity: item.quantity || 1,
    notes: item.notes || "",
  }));

  const subtotal = Number(order.subtotal ?? 0);
  const discountAmount = Number(order.discount ?? 0);
  const taxAmount = Number(order.tax ?? 0);
  const orderTotal = Number(order.total ?? 0);
  const serviceChargeAmount = Math.max(0, orderTotal - (subtotal - discountAmount + taxAmount));
  const total = orderTotal;
  const tableNumber = order.tableId ? tableMap[order.tableId] : undefined;

  return (
    <div data-testid="page-bill-view" className="min-h-screen bg-muted/20">
      <div className="flex items-center justify-end p-2 bg-background border-b">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/tickets")}
          data-testid="button-past-bills"
        >
          <History className="h-4 w-4 mr-1.5" />
          Past Bills
        </Button>
      </div>
      <BillPreviewModal
        open={true}
        onClose={() => navigate("/orders")}
        cart={cartItems}
        subtotal={subtotal}
        discountAmount={discountAmount}
        serviceChargeAmount={serviceChargeAmount}
        taxAmount={taxAmount}
        total={total}
        orderType={order.orderType || "dine_in"}
        tableId={order.tableId ?? undefined}
        tableNumber={tableNumber}
        orderId={order.id}
        posSessionId={undefined}
        onPaymentComplete={() => navigate("/orders")}
        fullPage={true}
      />
    </div>
  );
}
