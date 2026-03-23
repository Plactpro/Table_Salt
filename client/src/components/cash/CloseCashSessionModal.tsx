import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { currencyMap } from "@shared/currency";
import CashHandoverModal from "./CashHandoverModal";

interface Denomination {
  value: number;
  label: string;
}

const DENOMINATIONS_BY_CURRENCY: Record<string, { notes: Denomination[]; coins: Denomination[] }> = {
  INR: {
    notes: [
      { value: 500, label: "₹500" },
      { value: 200, label: "₹200" },
      { value: 100, label: "₹100" },
      { value: 50, label: "₹50" },
      { value: 20, label: "₹20" },
      { value: 10, label: "₹10" },
    ],
    coins: [
      { value: 5, label: "₹5" },
      { value: 2, label: "₹2" },
      { value: 1, label: "₹1" },
    ],
  },
  USD: {
    notes: [
      { value: 100, label: "$100" },
      { value: 50, label: "$50" },
      { value: 20, label: "$20" },
      { value: 10, label: "$10" },
      { value: 5, label: "$5" },
      { value: 1, label: "$1" },
    ],
    coins: [
      { value: 0.25, label: "25¢" },
      { value: 0.10, label: "10¢" },
      { value: 0.05, label: "5¢" },
    ],
  },
};

function getDefaultDenominations(currencyCode: string) {
  if (DENOMINATIONS_BY_CURRENCY[currencyCode]) return DENOMINATIONS_BY_CURRENCY[currencyCode];
  const symbol = currencyMap[currencyCode as keyof typeof currencyMap]?.symbol || currencyCode;
  return {
    notes: [
      { value: 100, label: `${symbol}100` },
      { value: 50, label: `${symbol}50` },
      { value: 20, label: `${symbol}20` },
      { value: 10, label: `${symbol}10` },
    ],
    coins: [
      { value: 1, label: `${symbol}1` },
      { value: 0.50, label: `${symbol}0.50` },
    ],
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  sessionNumber?: string;
  cashierName?: string;
  expectedCash: number;
  onSessionClosed: () => void;
}

export default function CloseCashSessionModal({
  open,
  onClose,
  sessionId,
  sessionNumber,
  cashierName,
  expectedCash,
  onSessionClosed,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currencyCode = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const symbol = currencyMap[currencyCode as keyof typeof currencyMap]?.symbol || currencyCode;

  const denoms = getDefaultDenominations(currencyCode);
  const allDenoms = [...denoms.notes, ...denoms.coins];

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [varianceReason, setVarianceReason] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [showHandover, setShowHandover] = useState(false);

  const physicalTotal = useMemo(() => {
    return allDenoms.reduce((sum, d) => {
      const q = parseInt(quantities[String(d.value)] || "0") || 0;
      return sum + q * d.value;
    }, 0);
  }, [quantities, allDenoms]);

  const variance = physicalTotal - expectedCash;
  const varianceAbs = Math.abs(variance);
  const requiresReason = varianceAbs > 50;
  const canClose = !requiresReason || varianceReason.trim().length > 0;

  const breakdown: Record<string, number> = {};
  for (const d of allDenoms) {
    const q = parseInt(quantities[String(d.value)] || "0") || 0;
    if (q > 0) breakdown[String(d.value)] = q;
  }

  const closeSessionMutation = useMutation({
    mutationFn: async (handoverData?: { amount: number; recipient: string; notes: string }) => {
      const res = await apiRequest("POST", `/api/cash-sessions/${sessionId}/close`, {
        closingCashCount: physicalTotal,
        closingFloatBreakdown: breakdown,
        varianceReason: varianceReason.trim() || undefined,
        notes: sessionNotes.trim() || undefined,
        handover: handoverData || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Cash session closed", description: `Variance: ${symbol}${variance.toFixed(2)}` });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-sessions/active"] });
      setShowHandover(false);
      onSessionClosed();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to close session", description: err.message, variant: "destructive" });
    },
  });

  return (
    <>
      <Dialog open={open && !showHandover} onOpenChange={onClose}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="modal-close-session">
          <DialogHeader>
            <DialogTitle>🔒 Close Cash Session</DialogTitle>
            <div className="flex gap-2 text-sm text-muted-foreground">
              {sessionNumber && <span>{sessionNumber}</span>}
              {cashierName && <span>| {cashierName}</span>}
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-blue-50 p-3 flex items-center justify-between">
              <span className="text-sm font-medium text-blue-800">System Expected:</span>
              <span className="text-lg font-bold text-blue-900" data-testid="text-expected-cash">
                {symbol}{expectedCash.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Count Physical Cash in Drawer:</p>

              {denoms.notes.length > 0 && (
                <>
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Notes</p>
                  <div className="space-y-2 mb-4">
                    {denoms.notes.map((d) => {
                      const qty = parseInt(quantities[String(d.value)] || "0") || 0;
                      const subtotal = qty * d.value;
                      return (
                        <div key={d.value} className="grid grid-cols-3 items-center gap-2">
                          <span className="text-sm font-medium text-right">{d.label}</span>
                          <Input
                            type="number"
                            min="0"
                            value={quantities[String(d.value)] || ""}
                            onChange={e => setQuantities(prev => ({ ...prev, [String(d.value)]: e.target.value }))}
                            className="text-center h-8"
                            placeholder="0"
                            data-testid={`input-denom-close-${d.value}`}
                          />
                          <span className="text-sm text-muted-foreground">
                            = {symbol}{subtotal.toFixed(subtotal % 1 === 0 ? 0 : 2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {denoms.coins.length > 0 && (
                <>
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Coins</p>
                  <div className="space-y-2">
                    {denoms.coins.map((d) => {
                      const qty = parseInt(quantities[String(d.value)] || "0") || 0;
                      const subtotal = qty * d.value;
                      return (
                        <div key={`coin-${d.value}`} className="grid grid-cols-3 items-center gap-2">
                          <span className="text-sm font-medium text-right">{d.label}</span>
                          <Input
                            type="number"
                            min="0"
                            value={quantities[String(d.value)] || ""}
                            onChange={e => setQuantities(prev => ({ ...prev, [String(d.value)]: e.target.value }))}
                            className="text-center h-8"
                            placeholder="0"
                            data-testid={`input-denom-close-${d.value}`}
                          />
                          <span className="text-sm text-muted-foreground">
                            = {symbol}{subtotal.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between bg-muted/40 rounded-lg p-3">
              <span className="font-semibold">Physical Total:</span>
              <span className="text-xl font-bold" data-testid="text-physical-total">
                {symbol}{physicalTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Variance:</span>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${variance === 0 ? "text-green-700" : variance > 0 ? "text-blue-700" : "text-red-600"}`} data-testid="text-variance">
                    {variance >= 0 ? "+" : ""}{symbol}{variance.toFixed(2)}
                  </span>
                  <Badge
                    variant={variance === 0 ? "default" : "destructive"}
                    className={variance === 0 ? "bg-green-100 text-green-800 border-green-200" : ""}
                    data-testid="badge-variance-status"
                  >
                    {variance === 0 ? "✅ Balanced" : variance > 0 ? "⚠️ Over" : "⚠️ Short"}
                  </Badge>
                </div>
              </div>
              {requiresReason && (
                <div>
                  <Label className="text-xs text-red-600">Reason required for variance <span className="text-red-500">*</span></Label>
                  <Input
                    value={varianceReason}
                    onChange={e => setVarianceReason(e.target.value)}
                    className="mt-1 border-red-300"
                    placeholder="Explain the variance..."
                    data-testid="input-variance-reason"
                  />
                </div>
              )}
            </div>

            <div>
              <Label>Session Notes (Optional)</Label>
              <Input
                value={sessionNotes}
                onChange={e => setSessionNotes(e.target.value)}
                className="mt-1"
                placeholder="Any notes for this session..."
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={!canClose || closeSessionMutation.isPending}
                onClick={() => closeSessionMutation.mutate(undefined)}
                data-testid="button-close-session"
              >
                {closeSessionMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Closing...</>
                ) : "🔒 Close Session"}
              </Button>
              <Button
                className="flex-1"
                disabled={!canClose || closeSessionMutation.isPending}
                onClick={() => setShowHandover(true)}
                data-testid="button-cash-handover"
              >
                Cash Handover
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CashHandoverModal
        open={showHandover}
        onClose={() => setShowHandover(false)}
        sessionNumber={sessionNumber}
        physicalTotal={physicalTotal}
        denominationBreakdown={breakdown}
        isLoading={closeSessionMutation.isPending}
        onConfirm={(handoverData) => closeSessionMutation.mutate(handoverData)}
      />
    </>
  );
}
