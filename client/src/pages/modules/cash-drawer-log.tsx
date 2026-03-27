import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, Hand, ShoppingCart, RotateCcw, CreditCard, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface CashDrawerEvent {
  id: string;
  tenant_id: string;
  outlet_id: string | null;
  session_id: string;
  event_type: string;
  order_id: string | null;
  bill_id: string | null;
  reference_number: string | null;
  amount: string | null;
  running_balance: string | null;
  performed_by: string;
  performed_by_name: string | null;
  reason: string | null;
  is_manual: boolean;
  created_at: string;
  outlet_name: string | null;
}

interface CashDrawerLogResponse {
  total: number;
  events: CashDrawerEvent[];
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  SALE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  MANUAL: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  VOID: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  REFUND: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  OTHER: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

const EVENT_ICONS: Record<string, LucideIcon> = {
  SALE: ShoppingCart,
  MANUAL: Hand,
  VOID: AlertTriangle,
  REFUND: RotateCcw,
  OTHER: CreditCard,
};

function formatCurrency(amount: string | null): string {
  if (!amount) return "—";
  const n = parseFloat(amount);
  if (isNaN(n)) return "—";
  return `₹${n.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch {
    return dateStr;
  }
}

const PAGE_SIZE = 20;

export default function CashDrawerLog() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [outletId, setOutletId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading, refetch } = useQuery<CashDrawerLogResponse>({
    queryKey: ["/api/cash-drawer/log", outletId, from, to, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (outletId) params.set("outletId", outletId);
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to + "T23:59:59").toISOString());
      const res = await fetch(`/api/cash-drawer/log?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load cash drawer log");
      return res.json();
    },
    enabled: !!user,
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const manualCount = events.filter(e => e.event_type === "MANUAL").length;
  const saleCount = events.filter(e => e.event_type === "SALE").length;

  return (
    <div className="space-y-4" data-testid="cash-drawer-log">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-600" />
          <h2 className="text-lg font-semibold">Cash Drawer Log</h2>
          <Badge variant="outline" className="ml-1">{total} events</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-cash-log">
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {manualCount > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800" data-testid="alert-manual-opens">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <span className="font-medium">{manualCount} manual drawer open{manualCount !== 1 ? "s" : ""}</span> in current view — review for unassociated transactions.
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1 min-w-[140px]">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={from}
                onChange={e => { setFrom(e.target.value); setPage(0); }}
                className="h-8 text-xs"
                data-testid="input-from-date"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={to}
                onChange={e => { setTo(e.target.value); setPage(0); }}
                className="h-8 text-xs"
                data-testid="input-to-date"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <Label className="text-xs">Outlet ID</Label>
              <Input
                placeholder="Filter by outlet"
                value={outletId}
                onChange={e => { setOutletId(e.target.value); setPage(0); }}
                className="h-8 text-xs"
                data-testid="input-outlet-filter"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFrom(""); setTo(""); setOutletId(""); setPage(0); }}
                className="h-8 text-xs"
                data-testid="button-clear-filters"
              >
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No cash drawer events found.
            </div>
          ) : (
            <div className="divide-y">
              {events.map((event) => {
                const Icon = EVENT_ICONS[event.event_type] ?? DollarSign;
                const colorClass = EVENT_TYPE_COLORS[event.event_type] ?? EVENT_TYPE_COLORS.OTHER;
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                    data-testid={`cash-event-${event.id}`}
                  >
                    <div className="mt-0.5 shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-[10px] px-1.5 py-0 ${colorClass}`} data-testid={`badge-event-type-${event.id}`}>
                          {event.event_type}
                        </Badge>
                        {event.is_manual && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700">
                            Manual
                          </Badge>
                        )}
                        <span className="text-xs font-medium" data-testid={`text-performed-by-${event.id}`}>
                          {event.performed_by_name || "Staff"}
                        </span>
                        {event.outlet_name && (
                          <span className="text-xs text-muted-foreground">@ {event.outlet_name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {event.amount && (
                          <span className="text-xs text-muted-foreground" data-testid={`text-amount-${event.id}`}>
                            {formatCurrency(event.amount)}
                          </span>
                        )}
                        {event.running_balance && (
                          <span className="text-xs text-muted-foreground">Balance: {formatCurrency(event.running_balance)}</span>
                        )}
                        {event.bill_id && (
                          <span className="text-xs text-muted-foreground">Bill: …{event.bill_id.slice(-6).toUpperCase()}</span>
                        )}
                        {event.reason && event.reason !== event.event_type && (
                          <span className="text-xs text-muted-foreground italic">{event.reason}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0 whitespace-nowrap" data-testid={`text-date-${event.id}`}>
                      {formatDate(event.created_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              data-testid="button-next-page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
