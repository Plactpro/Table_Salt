import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@shared/currency";
import { useAuth } from "@/lib/auth";
import type { TicketItem } from "./TicketDetailDrawer";

interface VoidRequestModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber?: string;
  tableNumber?: string | number;
  items: TicketItem[];
  onSuccess?: () => void;
}

const VOID_REASONS = [
  { id: "wrong_item", label: "Wrong item ordered" },
  { id: "customer_cancelled", label: "Customer cancelled" },
  { id: "kitchen_error", label: "Kitchen error" },
  { id: "duplicate_entry", label: "Duplicate entry" },
  { id: "quality_issue", label: "Quality issue" },
  { id: "manager_void", label: "Manager void" },
  { id: "other", label: "Other" },
];

export default function VoidRequestModal({ open, onClose, orderId, orderNumber, tableNumber, items, onSuccess }: VoidRequestModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [otherReason, setOtherReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const currency = (user?.tenant?.currency?.toUpperCase() || "INR") as string;
  const currencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";

  const activeItems = items.filter(i => !i.is_voided);

  const handleSubmit = async () => {
    if (!selectedItemId || !selectedReason) {
      toast({ title: "Missing fields", description: "Please select an item and a reason.", variant: "destructive" });
      return;
    }
    const reason = selectedReason === "other" ? otherReason.trim() : VOID_REASONS.find(r => r.id === selectedReason)?.label || selectedReason;
    if (selectedReason === "other" && !reason) {
      toast({ title: "Missing reason", description: "Please describe the void reason.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest("POST", `/api/tickets/${orderId}/void-request`, {
        orderItemId: selectedItemId,
        voidReason: reason,
        voidType: "full",
      });
      setSubmitted(true);
      onSuccess?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not submit void request.";
      toast({ title: "Failed", description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedItemId("");
    setSelectedReason("");
    setOtherReason("");
    setSubmitted(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" data-testid="modal-void-request">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            🔴 VOID ITEM
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Order #{orderNumber} {tableNumber ? `| Table ${tableNumber}` : ""}
          </p>
        </DialogHeader>

        {submitted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <p className="font-semibold text-green-700">Void request sent — awaiting manager approval</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <Label className="text-sm font-semibold mb-2 block">Select item to void:</Label>
              <RadioGroup value={selectedItemId} onValueChange={setSelectedItemId} className="space-y-2">
                {activeItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg border hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value={item.id} id={`item-${item.id}`} data-testid={`radio-item-${item.id}`} />
                    <Label htmlFor={`item-${item.id}`} className="flex-1 flex justify-between cursor-pointer">
                      <span>{item.quantity}x {item.name}</span>
                      <span className="text-muted-foreground text-sm">
                        {formatCurrency(Number(item.price) * item.quantity, currency, { position: currencyPosition })}
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div>
              <Label className="text-sm font-semibold mb-2 block">Void Reason:</Label>
              <RadioGroup value={selectedReason} onValueChange={setSelectedReason} className="space-y-1.5">
                {VOID_REASONS.map(reason => (
                  <div key={reason.id} className="flex items-center gap-3">
                    <RadioGroupItem value={reason.id} id={`reason-${reason.id}`} data-testid={`radio-reason-${reason.id}`} />
                    <Label htmlFor={`reason-${reason.id}`} className="cursor-pointer">{reason.label}</Label>
                  </div>
                ))}
              </RadioGroup>
              {selectedReason === "other" && (
                <Input
                  className="mt-2"
                  placeholder="Describe the reason..."
                  value={otherReason}
                  onChange={e => setOtherReason(e.target.value)}
                  data-testid="input-void-other-reason"
                />
              )}
            </div>

            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">Requires Manager approval</p>
            </div>

            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedItemId || !selectedReason}
              data-testid="button-submit-void"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              SUBMIT VOID REQUEST
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
