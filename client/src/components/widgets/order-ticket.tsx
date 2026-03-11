import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, ChefHat, Flame, CheckCircle2, XCircle, CreditCard, Utensils } from "lucide-react";
import { useEffect, useState } from "react";

interface OrderTicketItem {
  name: string;
  quantity: number | null;
  notes?: string | null;
  status?: string | null;
}

interface OrderTicketProps {
  orderId: string;
  tableNumber?: number | null;
  items: OrderTicketItem[];
  status: string;
  createdAt: string | Date | null;
  onStatusChange?: (newStatus: string) => void;
  testId?: string;
}

function useElapsedTime(createdAt: string | Date | null): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!createdAt) return;
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, [createdAt]);

  if (!createdAt) return "—";
  const diff = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const statusConfig: Record<string, { color: string; border: string; icon: any; label: string }> = {
  new: { color: "bg-teal-600", border: "border-l-teal-600", icon: Utensils, label: "New" },
  sent_to_kitchen: { color: "bg-cyan-500", border: "border-l-cyan-500", icon: ChefHat, label: "Sent" },
  in_progress: { color: "bg-orange-500", border: "border-l-orange-500", icon: Flame, label: "Cooking" },
  ready: { color: "bg-green-500", border: "border-l-green-500", icon: CheckCircle2, label: "Ready" },
  served: { color: "bg-gray-500", border: "border-l-gray-400", icon: Utensils, label: "Served" },
  paid: { color: "bg-emerald-600", border: "border-l-emerald-600", icon: CreditCard, label: "Paid" },
  cancelled: { color: "bg-red-500", border: "border-l-red-500", icon: XCircle, label: "Cancelled" },
};

export function OrderTicket({ orderId, tableNumber, items, status, createdAt, onStatusChange, testId }: OrderTicketProps) {
  const elapsed = useElapsedTime(createdAt);
  const config = statusConfig[status] || { color: "bg-gray-400", border: "border-l-gray-400", icon: Utensils, label: status };
  const StatusIcon = config.icon;
  const isNew = status === "new" || status === "sent_to_kitchen";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -12 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      layout
    >
      <Card
        className={`overflow-hidden border-l-4 ${config.border} transition-shadow duration-200 hover:shadow-md ${isNew ? "animate-[ticket-pulse_2s_ease-in-out_1]" : ""}`}
        data-testid={testId}
      >
        <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs font-mono gap-1">
              <StatusIcon className="h-3 w-3" />
              #{orderId.slice(-4)}
            </Badge>
            {tableNumber && (
              <Badge variant="outline" className="text-xs">
                Table {tableNumber}
              </Badge>
            )}
          </div>
          <motion.div
            className="flex items-center gap-1 text-xs text-muted-foreground"
            animate={isNew ? { color: ["hsl(var(--muted-foreground))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))"] } : {}}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
          >
            <Clock className="h-3 w-3" />
            <span className="font-mono tabular-nums">{elapsed}</span>
          </motion.div>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          <div className="space-y-1">
            <AnimatePresence>
              {items.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.05 }}
                  className="flex items-start justify-between text-sm"
                >
                  <div>
                    <span className="font-medium">{item.quantity}× {item.name}</span>
                    {item.notes && <p className="text-xs text-muted-foreground italic">{item.notes}</p>}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-1.5">
              <motion.div
                className={`w-2 h-2 rounded-full ${config.color}`}
                animate={isNew ? { scale: [1, 1.4, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="text-xs text-muted-foreground font-medium">{config.label}</span>
            </div>
            <div className="flex gap-1">
              {status === "new" || status === "sent_to_kitchen" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs gap-1"
                  onClick={() => onStatusChange?.("in_progress")}
                  data-testid={testId ? `${testId}-btn-progress` : undefined}
                >
                  <Flame className="h-3 w-3" />
                  Start
                </Button>
              ) : null}
              {status === "in_progress" ? (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => onStatusChange?.("ready")}
                  data-testid={testId ? `${testId}-btn-ready` : undefined}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Ready
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
