import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Delete } from "lucide-react";
import { currencyMap } from "@shared/currency";

interface ChangeBreakdownItem {
  denomination: number;
  quantity: number;
  amount: number;
}

interface CalculateChangeResult {
  rounded: number;
  change: number;
  breakdown: ChangeBreakdownItem[];
}

function generateQuickTender(rounded: number): number[] {
  const options = new Set<number>();
  options.add(rounded);

  const denominations = [1, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  for (const d of denominations) {
    if (d > rounded) {
      options.add(d);
      if (options.size >= 4) break;
    }
    const multiple = Math.ceil(rounded / d) * d;
    if (multiple > rounded) options.add(multiple);
    if (options.size >= 5) break;
  }

  return Array.from(options).sort((a, b) => a - b).slice(0, 4);
}

function calcChangeLocally(tendered: number, rounded: number): CalculateChangeResult {
  const change = Math.max(0, tendered - rounded);
  const denominations = [2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
  const breakdown: ChangeBreakdownItem[] = [];
  let remaining = Math.round(change);
  for (const d of denominations) {
    const qty = Math.floor(remaining / d);
    if (qty > 0) {
      breakdown.push({ denomination: d, quantity: qty, amount: qty * d });
      remaining -= qty * d;
    }
  }
  return { rounded, change, breakdown };
}

interface Props {
  open: boolean;
  onClose: () => void;
  amountDue: number;
  billId: string;
  billNumber?: string;
  tableNumber?: string | number;
  posSessionId?: string;
  onPaymentComplete: (tenderedAmount: number, changeGiven: number) => void;
  hasActiveSession?: boolean;
}

export default function CashPaymentModal({
  open,
  onClose,
  amountDue,
  billId,
  billNumber,
  tableNumber,
  posSessionId,
  onPaymentComplete,
  hasActiveSession = true,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  // PR-001: Stable idempotency key — generated once per open dialog, reused on retry, reset on success
  const paymentIdemKeyRef = useRef<string | null>(null);

  const currencyCode = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const currencyInfo = currencyMap[currencyCode as keyof typeof currencyMap];
  const symbol = currencyInfo?.symbol || currencyCode;

  const [tendered, setTendered] = useState("");
  const [changeResult, setChangeResult] = useState<CalculateChangeResult | null>(null);

  const roundedAmount = useMemo(() => {
    return Math.ceil(amountDue);
  }, [amountDue]);

  const quickTenderAmounts = useMemo(() => generateQuickTender(roundedAmount), [roundedAmount]);

  const tenderedNum = parseFloat(tendered) || 0;
  const isInsufficient = tenderedNum < roundedAmount;

  useEffect(() => {
    if (tenderedNum > 0) {
      const result = calcChangeLocally(tenderedNum, roundedAmount);
      setChangeResult(result);
    } else {
      setChangeResult(null);
    }
  }, [tenderedNum, roundedAmount]);

  const handleNumpadKey = useCallback((key: string) => {
    setTendered(prev => {
      if (key === "backspace") return prev.slice(0, -1);
      if (key === "00") return prev === "" ? "" : prev + "00";
      if (key === "000") return prev === "" ? "" : prev + "000";
      if (key === ".") {
        if (prev.includes(".")) return prev;
        return prev === "" ? "0." : prev + ".";
      }
      if (prev === "0" && key !== ".") return key;
      return prev + key;
    });
  }, []);

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!paymentIdemKeyRef.current) {
        paymentIdemKeyRef.current = `pay-${billId}-${crypto.randomUUID()}`;
      }
      const res = await apiRequest("POST", `/api/restaurant-bills/${billId}/payments`, {
        payments: [{
          paymentMethod: "CASH",
          amount: roundedAmount,
          tenderedAmount: tenderedNum,
          changeGiven: changeResult?.change || 0,
        }],
        cashSessionId: posSessionId || undefined,
      }, { idempotencyKey: paymentIdemKeyRef.current });
      return res.json();
    },
    onSuccess: () => {
      paymentIdemKeyRef.current = null; // reset so a fresh key is used for the next payment
      const change = changeResult?.change || 0;
      toast({
        title: "✅ Payment received",
        description: `Change: ${symbol}${change.toFixed(2)}`,
      });
      onPaymentComplete(tenderedNum, change);
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Payment failed", description: err.message, variant: "destructive" });
    },
  });

  const numpadKeys = [
    ["7", "8", "9", "backspace"],
    ["4", "5", "6", "00"],
    ["1", "2", "3", "000"],
    [".", "0", "", "confirm"],
  ];

  if (!hasActiveSession) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm" data-testid="modal-cash-payment">
          <DialogHeader>
            <DialogTitle>💵 Cash Payment</DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center space-y-4">
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
              <p className="text-yellow-800 font-medium">⚠️ No active cash session</p>
              <p className="text-yellow-700 text-sm mt-1">Open a cash session before accepting cash payments.</p>
            </div>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { onClose(); window.location.href = "/cash"; }}>Open Cash Drawer</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="modal-cash-payment">
        <DialogHeader>
          <DialogTitle>💵 Cash Payment</DialogTitle>
          {billNumber && <p className="text-sm text-muted-foreground">Bill #{billNumber}{tableNumber ? ` | Table ${tableNumber}` : ""}</p>}
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-center space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Amount Due</p>
            <p className="text-3xl font-bold" data-testid="text-amount-due">{symbol}{amountDue.toFixed(2)}</p>
            {Math.abs(roundedAmount - amountDue) > 0.001 && (
              <p className="text-sm text-muted-foreground" data-testid="text-amount-rounded">
                After rounding: {symbol}{roundedAmount.toFixed(2)}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">Quick Tender</p>
            <div className="grid grid-cols-4 gap-2">
              {quickTenderAmounts.map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  onClick={() => setTendered(String(amt))}
                  data-testid={`button-quick-tender-${amt}`}
                  className={tenderedNum === amt ? "border-primary bg-primary/10" : ""}
                >
                  {symbol}{amt.toLocaleString()}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">Amount Tendered</p>
            <div className="rounded-lg border bg-background px-4 py-3 text-2xl font-bold flex items-center justify-between min-h-[56px]" data-testid="input-tendered">
              <span>{symbol}</span>
              <span className="flex-1 text-right">{tendered || "0"}</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {numpadKeys.flat().map((key, idx) => {
              if (key === "confirm") {
                return (
                  <Button
                    key="confirm"
                    size="sm"
                    className="h-12 bg-green-600 hover:bg-green-700 text-white text-xs font-bold"
                    disabled={isInsufficient || payMutation.isPending}
                    onClick={() => payMutation.mutate()}
                    data-testid="numpad-key-confirm"
                  >
                    {payMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "✓ OK"}
                  </Button>
                );
              }
              if (key === "backspace") {
                return (
                  <Button
                    key="backspace"
                    variant="outline"
                    size="sm"
                    className="h-12"
                    onClick={() => handleNumpadKey("backspace")}
                    data-testid="numpad-key-backspace"
                  >
                    <Delete className="h-4 w-4" />
                  </Button>
                );
              }
              if (key === "") {
                return <div key={`empty-${idx}`} />;
              }
              return (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  className="h-12 text-base font-semibold"
                  onClick={() => handleNumpadKey(key)}
                  data-testid={`numpad-key-${key}`}
                >
                  {key}
                </Button>
              );
            })}
          </div>

          {tenderedNum > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Change to Return:</span>
                <span
                  className={`text-xl font-bold ${isInsufficient ? "text-red-600" : "text-green-700"}`}
                  data-testid="text-change-amount"
                >
                  {isInsufficient ? "Insufficient" : `${symbol}${(changeResult?.change || 0).toFixed(2)}`}
                </span>
              </div>
              {!isInsufficient && changeResult && changeResult.breakdown.length > 0 && (
                <ul className="space-y-1" data-testid="list-change-breakdown">
                  {changeResult.breakdown.map((item) => (
                    <li key={item.denomination} className="flex justify-between text-sm text-muted-foreground">
                      <span>{symbol}{item.denomination} × {item.quantity}</span>
                      <span>= {symbol}{item.amount}</span>
                    </li>
                  ))}
                </ul>
              )}
              {isInsufficient && (
                <p className="text-xs text-red-600">Amount tendered is less than the amount due</p>
              )}
            </div>
          )}

          <Separator />

          <Button
            className="w-full"
            size="lg"
            disabled={isInsufficient || !tendered || payMutation.isPending}
            onClick={() => payMutation.mutate()}
            data-testid="button-confirm-payment"
          >
            {payMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
            ) : (
              "✅ Confirm Payment & Open Drawer"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
