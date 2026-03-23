import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Flame, Loader2, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@shared/currency";
import { useAuth } from "@/lib/auth";
import type { TicketItem } from "./TicketDetailDrawer";

interface RefireModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber?: string;
  tableNumber?: string | number;
  items: TicketItem[];
  onSuccess?: () => void;
}

const REFIRE_REASONS = [
  { id: "customer_returned", label: "Customer returned — not satisfied" },
  { id: "wrong_preparation", label: "Wrong preparation" },
  { id: "modification_missed", label: "Modification was missed" },
  { id: "damaged_during_service", label: "Damaged during service" },
  { id: "quality_issue", label: "Quality issue" },
];

export default function RefireModal({ open, onClose, orderId, orderNumber, tableNumber, items, onSuccess }: RefireModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [assignTo, setAssignTo] = useState<string>("any");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ kotNumber?: string } | null>(null);

  const currency = (user?.tenant?.currency?.toUpperCase() || "INR") as string;
  const currencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";

  const activeItems = items.filter(i => !i.is_voided);
  const selectedItem = activeItems.find(i => i.id === selectedItemId);

  const handleSubmit = async () => {
    if (!selectedItemId || !selectedReason) {
      toast({ title: "Missing fields", description: "Please select an item and a reason.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/tickets/${orderId}/refire`, {
        itemId: selectedItemId,
        reason: REFIRE_REASONS.find(r => r.id === selectedReason)?.label || selectedReason,
        assignTo,
      });
      const data = await res.json() as { kotNumber?: string };
      setResult(data);
      onSuccess?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not send refire.";
      toast({ title: "Failed", description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedItemId("");
    setSelectedReason("");
    setAssignTo("any");
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" data-testid="modal-refire">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            🔥 REFIRE ITEM TO KITCHEN
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Order #{orderNumber} {tableNumber ? `| Table ${tableNumber}` : ""}
          </p>
        </DialogHeader>

        {result ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <p className="font-semibold text-green-700">
              Refire sent to kitchen!{result.kotNumber ? ` KOT: ${result.kotNumber}` : ""}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <Label className="text-sm font-semibold mb-2 block">Select item to refire:</Label>
              <RadioGroup value={selectedItemId} onValueChange={setSelectedItemId} className="space-y-2">
                {activeItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg border hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value={item.id} id={`refire-item-${item.id}`} data-testid={`radio-refire-item-${item.id}`} />
                    <Label htmlFor={`refire-item-${item.id}`} className="flex-1 flex justify-between cursor-pointer">
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
              <Label className="text-sm font-semibold mb-2 block">Refire Reason:</Label>
              <RadioGroup value={selectedReason} onValueChange={setSelectedReason} className="space-y-1.5">
                {REFIRE_REASONS.map(reason => (
                  <div key={reason.id} className="flex items-center gap-3">
                    <RadioGroupItem value={reason.id} id={`refire-reason-${reason.id}`} data-testid={`radio-refire-reason-${reason.id}`} />
                    <Label htmlFor={`refire-reason-${reason.id}`} className="cursor-pointer">{reason.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div>
              <Label className="text-sm font-semibold mb-2 block">Assign to:</Label>
              <RadioGroup value={assignTo} onValueChange={setAssignTo} className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="same" id="assign-same" data-testid="radio-assign-same-chef" />
                  <Label htmlFor="assign-same" className="cursor-pointer">
                    Same chef {selectedItem?.assignedChefName ? `(${selectedItem.assignedChefName})` : ""}
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="any" id="assign-any" data-testid="radio-assign-any-chef" />
                  <Label htmlFor="assign-any" className="cursor-pointer">Any available chef</Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="head" id="assign-head" data-testid="radio-assign-head-chef" />
                  <Label htmlFor="assign-head" className="cursor-pointer">Head Chef</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <Flame className="h-4 w-4 text-red-600 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-400 font-medium">
                Priority: 🔴 HIGH (auto-set — customer is waiting)
              </p>
            </div>

            <Button
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedItemId || !selectedReason}
              data-testid="button-send-refire"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Flame className="h-4 w-4 mr-2" />}
              SEND TO KITCHEN
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
