import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { formatCurrency, currencyMap } from "@shared/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LockOpen, DollarSign, BarChart2, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import OpenCashSessionModal from "@/components/cash/OpenCashSessionModal";
import CashPayoutModal from "@/components/cash/CashPayoutModal";
import CloseCashSessionModal from "@/components/cash/CloseCashSessionModal";

const EVENT_TYPE_COLORS: Record<string, { label: string; color: string; className: string }> = {
  OPENING: { label: "Opening", color: "blue", className: "bg-blue-100 text-blue-800" },
  SALE: { label: "Sale", color: "green", className: "bg-green-100 text-green-800" },
  REFUND: { label: "Refund", color: "orange", className: "bg-orange-100 text-orange-800" },
  PAYOUT: { label: "Payout", color: "red", className: "bg-red-100 text-red-800" },
  MANUAL_OPEN: { label: "Manual Open", color: "gray", className: "bg-gray-100 text-gray-700" },
  CLOSING: { label: "Closing", color: "purple", className: "bg-purple-100 text-purple-800" },
};

function formatTime12h(dateStr: string) {
  const d = new Date(dateStr);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

interface DrawerEvent {
  id: string;
  eventType: string;
  reference?: string;
  amount: number;
  changeGiven?: number;
  runningBalance: number;
  createdAt: string;
  notes?: string;
}

interface CashSession {
  id: string;
  sessionNumber?: string;
  shiftName?: string;
  openingFloat: number | string;
  status: "open" | "closed";
  openedAt?: string;
  cashierName?: string;
  runningBalance?: number;
  totalCashSales?: number;
  totalCashRefunds?: number;
  totalPayouts?: number;
  expectedCash?: number;
  transactionCount?: number;
}

function ManualOpenDrawerModal({
  open,
  onClose,
  sessionId,
  onOpened,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  onOpened: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleOpen() {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await apiRequest("POST", `/api/cash-sessions/${sessionId}/manual-open`, { reason: reason.trim() });
      toast({ title: "Drawer opened", description: reason });
      onOpened();
      onClose();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" data-testid="modal-manual-open">
        <DialogHeader>
          <DialogTitle>🔓 Manual Drawer Open</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Reason for opening drawer</Label>
            <select
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reason}
              onChange={e => setReason(e.target.value)}
              data-testid="input-manual-open-reason"
            >
              <option value="">Select a reason...</option>
              <option value="Security check">Security check</option>
              <option value="Till count">Till count</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button
              className="flex-1"
              disabled={!reason || loading}
              onClick={handleOpen}
              data-testid="button-open-drawer"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open Drawer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CashDashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const currencyCode = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const currencyPos = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const currencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const symbol = currencyMap[currencyCode as keyof typeof currencyMap]?.symbol || currencyCode;
  const fmt = (val: number | string) => formatCurrency(val, currencyCode, { position: currencyPos, decimals: currencyDecimals });

  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showManualOpen, setShowManualOpen] = useState(false);
  const [showEvents, setShowEvents] = useState(false);

  const { data: activeSession, isLoading, refetch: refetchSession } = useQuery<CashSession | null>({
    queryKey: ["/api/cash-sessions/active"],
    queryFn: async () => {
      const res = await fetch("/api/cash-sessions/active", { credentials: "include" });
      if (res.status === 404 || res.status === 204) return null;
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  const { data: events = [], refetch: refetchEvents } = useQuery<DrawerEvent[]>({
    queryKey: ["/api/cash-sessions", activeSession?.id, "events"],
    queryFn: async () => {
      if (!activeSession?.id) return [];
      const res = await fetch(`/api/cash-sessions/${activeSession.id}/events`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeSession?.id && showEvents,
  });

  const handleSessionOpened = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/cash-sessions/active"] });
  }, [queryClient]);

  const handleSessionClosed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/cash-sessions/active"] });
  }, [queryClient]);

  const handlePayoutRecorded = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/cash-sessions/active"] });
    if (activeSession?.id) {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-sessions", activeSession.id, "events"] });
    }
  }, [queryClient, activeSession?.id]);

  const handlePaymentEvent = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/cash-sessions/active"] });
    if (activeSession?.id) {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-sessions", activeSession.id, "events"] });
    }
  }, [queryClient, activeSession?.id]);

  const handleSessionClosed_ws = useCallback((payload: any) => {
    const cashier = payload?.cashierName || "The cashier";
    const variance = payload?.variance ?? 0;
    toast({
      title: `${cashier} has closed session`,
      description: `Variance: ${symbol}${Math.abs(variance).toFixed(2)}`,
    });
    queryClient.invalidateQueries({ queryKey: ["/api/cash-sessions/active"] });
  }, [queryClient, symbol, toast]);

  useRealtimeEvent("cash_session:payment", handlePaymentEvent);
  useRealtimeEvent("cash_session:closed", handleSessionClosed_ws);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="page-cash-dashboard">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const runningBalance = Number(activeSession?.runningBalance ?? activeSession?.openingFloat ?? 0);
  const cashSales = Number(activeSession?.totalCashSales ?? 0);
  const cashRefunds = Number(activeSession?.totalCashRefunds ?? 0);
  const cashPayouts = Number(activeSession?.totalPayouts ?? 0);
  const openingFloat = Number(activeSession?.openingFloat ?? 0);
  const expectedCash = Number(activeSession?.expectedCash ?? (openingFloat + cashSales - cashRefunds - cashPayouts));
  const txCount = Number(activeSession?.transactionCount ?? 0);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6" data-testid="page-cash-dashboard">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">💰 Cash Drawer</h1>
        {activeSession && (
          <Badge variant="outline" className="bg-green-50 text-green-800 border-green-300 text-sm px-3 py-1">
            Session Active
          </Badge>
        )}
      </div>

      {!activeSession ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <div className="text-6xl mb-4">💰</div>
              <h2 className="text-xl font-semibold">No Active Cash Session</h2>
              <p className="text-muted-foreground text-sm">Start a session to begin tracking cash payments.</p>
              <Button size="lg" onClick={() => setShowOpenModal(true)} data-testid="button-open-session">
                💰 Open Cash Session
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>💰 Cash Drawer — {activeSession.shiftName || "Active Session"}</span>
              </CardTitle>
              <div className="text-sm text-muted-foreground space-y-0.5">
                {activeSession.openedAt && (
                  <p>Opened: {formatTime12h(activeSession.openedAt)}</p>
                )}
                {activeSession.cashierName && <p>Cashier: {activeSession.cashierName}</p>}
                {activeSession.sessionNumber && <p>Session: {activeSession.sessionNumber}</p>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">Cash in Drawer (Running Balance)</p>
                <p className="text-4xl font-bold text-green-700" data-testid="text-running-balance">
                  {fmt(runningBalance)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Opening Float:</span>
                  <span className="font-medium">{fmt(openingFloat)}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Cash Sales:</span>
                  <span className="font-medium text-green-700" data-testid="text-cash-sales">
                    + {fmt(cashSales)} {txCount > 0 && <span className="text-muted-foreground text-xs">({txCount} txns)</span>}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Cash Refunds:</span>
                  <span className="font-medium text-orange-600">- {fmt(cashRefunds)}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Cash Payouts:</span>
                  <span className="font-medium text-red-600" data-testid="text-cash-payouts">- {fmt(cashPayouts)}</span>
                </div>
              </div>

              <Separator />

              <div className="flex justify-between items-center font-semibold">
                <span>Expected:</span>
                <span>{fmt(expectedCash)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowManualOpen(true)}
                  data-testid="button-manual-open"
                >
                  <LockOpen className="h-4 w-4" /> Manual Open
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowPayoutModal(true)}
                  data-testid="button-cash-payout"
                >
                  <DollarSign className="h-4 w-4" /> Cash Payout
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => { setShowEvents(v => !v); if (!showEvents) refetchEvents(); }}
                  data-testid="button-view-events"
                >
                  <BarChart2 className="h-4 w-4" /> {showEvents ? "Hide" : "View"} Events
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowCloseModal(true)}
                  data-testid="button-close-session"
                >
                  <Lock className="h-4 w-4" /> Close Session
                </Button>
              </div>
            </CardContent>
          </Card>

          {showEvents && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Drawer Events — {activeSession.sessionNumber || "Current Session"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-drawer-events">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-3">Time</th>
                        <th className="pb-2 pr-3">Type</th>
                        <th className="pb-2 pr-3">Reference</th>
                        <th className="pb-2 pr-3 text-right">Amount</th>
                        <th className="pb-2 pr-3 text-right">Change</th>
                        <th className="pb-2 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {events.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-muted-foreground">No events yet</td>
                        </tr>
                      ) : (
                        events.map((event) => {
                          const typeInfo = EVENT_TYPE_COLORS[event.eventType] || { label: event.eventType, className: "bg-gray-100 text-gray-700" };
                          const isPositive = event.amount >= 0;
                          return (
                            <tr key={event.id} className="py-2" data-testid={`row-event-${event.id}`}>
                              <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                                {formatTime12h(event.createdAt)}
                              </td>
                              <td className="py-2 pr-3">
                                <Badge className={typeInfo.className} variant="outline" data-testid={`badge-event-type-${event.eventType}`}>
                                  {typeInfo.label}
                                </Badge>
                              </td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {event.reference || "—"}
                              </td>
                              <td className={`py-2 pr-3 text-right font-medium ${isPositive ? "text-green-700" : "text-red-600"}`}>
                                {isPositive ? "+" : ""}{fmt(event.amount)}
                              </td>
                              <td className="py-2 pr-3 text-right text-muted-foreground">
                                {event.changeGiven ? fmt(event.changeGiven) : "—"}
                              </td>
                              <td className="py-2 text-right font-medium">
                                {fmt(event.runningBalance)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      <OpenCashSessionModal
        open={showOpenModal}
        onClose={() => setShowOpenModal(false)}
        onSessionOpened={handleSessionOpened}
        existingSession={activeSession}
      />

      {activeSession && (
        <>
          <CashPayoutModal
            open={showPayoutModal}
            onClose={() => setShowPayoutModal(false)}
            sessionId={activeSession.id}
            sessionNumber={activeSession.sessionNumber}
            runningBalance={runningBalance}
            onPayoutRecorded={handlePayoutRecorded}
          />

          <CloseCashSessionModal
            open={showCloseModal}
            onClose={() => setShowCloseModal(false)}
            sessionId={activeSession.id}
            sessionNumber={activeSession.sessionNumber}
            cashierName={activeSession.cashierName || user?.name || user?.username}
            expectedCash={expectedCash}
            onSessionClosed={handleSessionClosed}
          />

          <ManualOpenDrawerModal
            open={showManualOpen}
            onClose={() => setShowManualOpen(false)}
            sessionId={activeSession.id}
            onOpened={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/cash-sessions", activeSession.id, "events"] });
            }}
          />
        </>
      )}
    </div>
  );
}

