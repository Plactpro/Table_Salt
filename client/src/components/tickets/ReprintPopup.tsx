import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Printer, FileText, ChefHat, DollarSign, MessageCircle, Mail, Check, Loader2 } from "lucide-react";

type ReprintAction = "receipt" | "kot" | "bill" | "whatsapp" | "email";

interface ReprintAction_ {
  id: ReprintAction;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
  requiresBillAccess?: boolean;
}

interface ReprintPopupProps {
  orderId: string;
  orderNumber?: string;
  canReprintBill?: boolean;
  children: React.ReactNode;
}

export default function ReprintPopup({ orderId, orderNumber, canReprintBill = false, children }: ReprintPopupProps) {
  const { toast } = useToast();
  const [loadingAction, setLoadingAction] = useState<ReprintAction | null>(null);
  const [doneActions, setDoneActions] = useState<Set<ReprintAction>>(new Set<ReprintAction>());
  const [open, setOpen] = useState(false);

  const handleReprint = async (action: ReprintAction) => {
    setLoadingAction(action);
    try {
      if (action === "whatsapp" || action === "email") {
        await apiRequest("POST", `/api/tickets/${orderId}/send-${action}`, {});
        toast({ title: "✅ Queued", description: `${action === "whatsapp" ? "WhatsApp" : "Email"} send queued.` });
      } else {
        await apiRequest("POST", `/api/tickets/${orderId}/reprint/${action}`, {});
        toast({ title: "✅ Sent to printer", description: `${action === "receipt" ? "Receipt" : action === "kot" ? "KOT" : "Bill"} sent to printer.` });
      }
      setDoneActions(prev => { const next = new Set(prev); next.add(action); return next; });
    } catch {
      toast({ title: "Failed", description: "Could not complete reprint action.", variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  };

  const allActions: ReprintAction_[] = [
    { id: "receipt", label: "Customer Receipt", icon: FileText },
    { id: "kot", label: "Kitchen KOT", icon: ChefHat },
    { id: "bill", label: "Bill / Invoice", icon: DollarSign, requiresBillAccess: true },
    { id: "whatsapp", label: "Send via WhatsApp", icon: MessageCircle, comingSoon: true },
    { id: "email", label: "Send via Email", icon: Mail, comingSoon: true },
  ];

  const visibleActions = allActions.filter(a => !a.requiresBillAccess || canReprintBill);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" data-testid="popup-reprint">
        <div className="space-y-1">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Printer className="h-4 w-4 text-primary" />
            REPRINT {orderNumber ? `— Order #${orderNumber}` : ""}
          </p>
          {visibleActions.map(({ id, label, icon: Icon, comingSoon }) => {
            const isLoading = loadingAction === id;
            const isDone = doneActions.has(id);
            return (
              <Button
                key={id}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm gap-2"
                data-testid={id === "whatsapp" ? "button-send-whatsapp" : id === "email" ? "button-send-email" : `button-reprint-${id}`}
                disabled={isLoading}
                onClick={() => handleReprint(id)}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isDone ? <Check className="h-4 w-4 text-green-600" /> : <Icon className="h-4 w-4" />}
                {label}
                {comingSoon && (
                  <span className="ml-auto text-[10px] bg-muted rounded px-1 py-0.5 text-muted-foreground">soon</span>
                )}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
