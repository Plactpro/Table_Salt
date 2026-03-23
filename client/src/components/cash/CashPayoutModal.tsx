import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { currencyMap } from "@shared/currency";

const PAYOUT_TYPES = [
  { value: "petty_cash", label: "Petty Cash" },
  { value: "supplier_payment", label: "Supplier Payment" },
  { value: "staff_advance", label: "Staff Advance" },
  { value: "expense", label: "Expense" },
  { value: "other", label: "Other" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  sessionNumber?: string;
  runningBalance: number;
  onPayoutRecorded: () => void;
}

export default function CashPayoutModal({ open, onClose, sessionId, sessionNumber, runningBalance, onPayoutRecorded }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currencyCode = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const symbol = currencyMap[currencyCode as keyof typeof currencyMap]?.symbol || currencyCode;

  const [payoutType, setPayoutType] = useState("petty_cash");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [reason, setReason] = useState("");

  const amountNum = parseFloat(amount) || 0;
  const isInvalid = amountNum <= 0 || amountNum > runningBalance || !reason.trim();

  const payoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/cash-sessions/${sessionId}/payouts`, {
        payoutType,
        amount: amountNum,
        recipient: recipient.trim() || undefined,
        reason: reason.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Payout recorded", description: `${symbol}${amountNum.toFixed(2)} paid out` });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-sessions/active"] });
      queryClient.invalidateQueries({ queryKey: [`/api/cash-sessions/${sessionId}/events`] });
      setAmount("");
      setRecipient("");
      setReason("");
      setPayoutType("petty_cash");
      onPayoutRecorded();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Payout failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="modal-cash-payout">
        <DialogHeader>
          <DialogTitle>💸 Cash Payout</DialogTitle>
          {sessionNumber && <p className="text-sm text-muted-foreground">Session {sessionNumber}</p>}
          <p className="text-sm text-muted-foreground">Available: {symbol}{runningBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Payout Type</Label>
            <div className="mt-2 space-y-2">
              {PAYOUT_TYPES.map((type) => (
                <label key={type.value} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="payoutType"
                    value={type.value}
                    checked={payoutType === type.value}
                    onChange={() => setPayoutType(type.value)}
                    data-testid={`radio-payout-type-${type.value}`}
                    className="accent-primary"
                  />
                  <span className="text-sm">{type.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Amount ({currencyCode})</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{symbol}</span>
              <Input
                type="number"
                min="0"
                max={runningBalance}
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="pl-7"
                placeholder="0.00"
                data-testid="input-payout-amount"
              />
            </div>
            {amountNum > runningBalance && (
              <p className="text-xs text-red-600 mt-1">Amount exceeds available balance</p>
            )}
          </div>

          <div>
            <Label>Recipient (Optional)</Label>
            <Input
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              className="mt-1"
              placeholder="Name / Company"
              data-testid="input-payout-recipient"
            />
          </div>

          <div>
            <Label>Reason <span className="text-red-500">*</span></Label>
            <Input
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="mt-1"
              placeholder="e.g. Cleaning supplies"
              data-testid="input-payout-reason"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button
              className="flex-1"
              disabled={isInvalid || payoutMutation.isPending}
              onClick={() => payoutMutation.mutate()}
              data-testid="button-submit-payout"
            >
              {payoutMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>
              ) : "Submit Payout"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
