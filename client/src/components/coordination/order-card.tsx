import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Star, AlertTriangle, UtensilsCrossed, Package, Truck, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface CoordinationOrder {
  id: string;
  orderNumber: string;
  status: string;
  orderType: string;
  tableNumber?: number;
  tableZone?: string;
  customerName?: string;
  waiterName?: string;
  covers?: number;
  total?: number | string;
  notes?: string;
  isVip?: boolean;
  createdAt: string;
  updatedAt?: string;
  items?: Array<{
    id: string;
    name: string;
    quantity: number;
    status: string;
  }>;
}

const ORDER_TYPE_ICON: Record<string, { icon: React.ComponentType<any>; label: string; emoji: string }> = {
  dine_in: { icon: UtensilsCrossed, label: "Dine-In", emoji: "🍽️" },
  takeaway: { icon: Package, label: "Takeaway", emoji: "📦" },
  delivery: { icon: Truck, label: "Delivery", emoji: "🚗" },
};

function getElapsedMinutes(since: string): number {
  return Math.floor((Date.now() - new Date(since).getTime()) / 60000);
}

function getTimeColor(minutes: number): string {
  if (minutes < 10) return "text-green-600";
  if (minutes < 20) return "text-amber-600";
  return "text-red-600";
}

function getTimeBg(minutes: number): string {
  if (minutes < 10) return "bg-green-50 border-green-200";
  if (minutes < 20) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

interface OrderCardProps {
  order: CoordinationOrder;
  columnKey: string;
  onClick: () => void;
  onAction?: (action: string, orderId: string) => void;
}

export function OrderCard({ order, columnKey, onClick, onAction }: OrderCardProps) {
  const elapsed = getElapsedMinutes(order.createdAt);
  const typeConfig = ORDER_TYPE_ICON[order.orderType] || ORDER_TYPE_ICON.dine_in;
  const TypeIcon = typeConfig.icon;
  const isPulsing = elapsed >= 20;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ y: -2 }}
      className={`rounded-xl border-2 bg-white dark:bg-card cursor-pointer transition-shadow hover:shadow-md ${
        order.isVip
          ? "border-amber-400 shadow-amber-100 dark:shadow-amber-900/20"
          : "border-border"
      }`}
      onClick={onClick}
      data-testid={`order-card-${order.id.slice(-4)}`}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-bold text-sm" data-testid={`order-number-${order.id.slice(-4)}`}>
              #{order.orderNumber}
            </span>
            <span className="text-base">{typeConfig.emoji}</span>
            {order.isVip && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-300 px-1.5 py-0 text-[10px] gap-0.5" data-testid={`vip-badge-${order.id.slice(-4)}`}>
                <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> VIP
              </Badge>
            )}
          </div>
          <motion.div
            animate={isPulsing ? { scale: [1, 1.08, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${getTimeBg(elapsed)} ${getTimeColor(elapsed)}`}
            data-testid={`elapsed-time-${order.id.slice(-4)}`}
          >
            <Clock className="h-3 w-3" />
            {elapsed}m
          </motion.div>
        </div>

        <div className="space-y-0.5">
          {order.tableNumber ? (
            <p className="text-sm font-medium">Table {order.tableNumber}{order.tableZone ? ` · ${order.tableZone}` : ""}</p>
          ) : order.customerName ? (
            <p className="text-sm font-medium">{order.customerName}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{typeConfig.label}</p>
          )}
          {order.waiterName && (
            <p className="text-xs text-muted-foreground">{order.waiterName}</p>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{order.items?.length ?? 0} items</span>
          {order.total && (
            <span className="font-medium">${Number(order.total).toFixed(2)}</span>
          )}
        </div>

        {elapsed >= 20 && (
          <div className="flex items-center gap-1 text-red-600 text-xs font-medium">
            <AlertTriangle className="h-3 w-3" />
            Delayed — {elapsed} min
          </div>
        )}

        <div className="flex gap-1.5 pt-1">
          {columnKey === "received" && (
            <Button
              size="sm"
              className="h-7 text-xs flex-1 bg-teal-600 hover:bg-teal-700"
              onClick={(e) => { e.stopPropagation(); onAction?.("confirm", order.id); }}
              data-testid={`btn-confirm-${order.id.slice(-4)}`}
            >
              CONFIRM
            </Button>
          )}
          {columnKey === "ready" && (
            <Button
              size="sm"
              className="h-7 text-xs flex-1 bg-green-600 hover:bg-green-700"
              onClick={(e) => { e.stopPropagation(); onAction?.("serve", order.id); }}
              data-testid={`btn-serve-${order.id.slice(-4)}`}
            >
              SERVE
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2"
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            data-testid={`btn-view-${order.id.slice(-4)}`}
          >
            VIEW
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
