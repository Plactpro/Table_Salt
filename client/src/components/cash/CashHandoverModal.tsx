import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { currencyMap } from "@shared/currency";

interface Props {
  open: boolean;
  onClose: () => void;
  sessionNumber?: string;
  physicalTotal: number;
  denominationBreakdown?: Record<string, number>;
  onConfirm: (handoverData: { amount: number; recipient: string; notes: string }) => void;
  isLoading?: boolean;
}

export default function CashHandoverModal({
  open,
  onClose,
  sessionNumber,
  physicalTotal,
  denominationBreakdown = {},
  onConfirm,
  isLoading = false,
}: Props) {
  const { user } = useAuth();
  const currencyCode = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const symbol = currencyMap[currencyCode as keyof typeof currencyMap]?.symbol || currencyCode;

  const [amount, setAmount] = useState(String(physicalTotal.toFixed(2)));
  const [recipient, setRecipient] = useState("");
  const [notes, setNotes] = useState("");

  const amountNum = parseFloat(amount) || 0;
  const canSubmit = amountNum > 0 && recipient.trim().length > 0;

  const denomSummary = Object.entries(denominationBreakdown)
    .filter(([, qty]) => qty > 0)
    .map(([denom, qty]) => `${symbol}${denom} × ${qty}`)
    .join(" | ");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="modal-cash-handover">
        <DialogHeader>
          <DialogTitle>🤝 Cash Handover</DialogTitle>
          {sessionNumber && <p className="text-sm text-muted-foreground">Session {sessionNumber}</p>}
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Amount Handed Over</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{symbol}</span>
              <Input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="pl-7"
                data-testid="input-handover-amount"
              />
            </div>
          </div>

          <div>
            <Label>Handed To <span className="text-red-500">*</span></Label>
            <Input
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              className="mt-1"
              placeholder="Manager name / role"
              data-testid="input-handover-recipient"
            />
          </div>

          <div>
            <Label>Notes (Optional)</Label>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="mt-1"
              placeholder="e.g. End of morning shift"
              data-testid="input-handover-notes"
            />
          </div>

          {denomSummary && (
            <div className="rounded-lg bg-muted/40 border p-3">
              <p className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wide">Denomination Summary</p>
              <p className="text-sm">{denomSummary}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Back</Button>
            <Button
              className="flex-1"
              disabled={!canSubmit || isLoading}
              onClick={() => onConfirm({ amount: amountNum, recipient: recipient.trim(), notes: notes.trim() })}
              data-testid="button-confirm-handover"
            >
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Closing...</>
              ) : "✅ Confirm Handover & Close Session"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
