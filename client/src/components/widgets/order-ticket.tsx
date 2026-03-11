import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";

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

function getElapsedTime(createdAt: string | Date | null): string {
  if (!createdAt) return "—";
  const diff = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-500",
  sent_to_kitchen: "bg-yellow-500",
  in_progress: "bg-orange-500",
  ready: "bg-green-500",
  served: "bg-gray-500",
  paid: "bg-emerald-600",
  cancelled: "bg-red-500",
};

export function OrderTicket({ orderId, tableNumber, items, status, createdAt, onStatusChange, testId }: OrderTicketProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      layout
    >
      <Card className="overflow-hidden" data-testid={testId}>
        <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs font-mono">
              #{orderId.slice(-4)}
            </Badge>
            {tableNumber && (
              <Badge variant="outline" className="text-xs">
                Table {tableNumber}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {getElapsedTime(createdAt)}
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          <div className="space-y-1">
            {items.map((item, i) => (
              <div key={i} className="flex items-start justify-between text-sm">
                <div>
                  <span className="font-medium">{item.quantity}× {item.name}</span>
                  {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <div className={`w-2 h-2 rounded-full ${statusColors[status] || "bg-gray-400"}`} />
            <div className="flex gap-1">
              {status === "new" || status === "sent_to_kitchen" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={() => onStatusChange?.("in_progress")}
                  data-testid={testId ? `${testId}-btn-progress` : undefined}
                >
                  Start
                </Button>
              ) : null}
              {status === "in_progress" ? (
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onStatusChange?.("ready")}
                  data-testid={testId ? `${testId}-btn-ready` : undefined}
                >
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
