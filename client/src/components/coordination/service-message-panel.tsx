import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { MessageSquare, Send, Clock } from "lucide-react";

const QUICK_TEMPLATES = [
  { id: "t1", text: "Table {X} is ready for seating", label: "Table Ready for Seating" },
  { id: "t2", text: "Order #{X} delayed by {N} minutes", label: "Order Delayed" },
  { id: "t3", text: "Customer at Table {X} has allergy — check kitchen", label: "Allergy Alert" },
  { id: "t4", text: "VIP arriving in 10 minutes — Table {X}", label: "VIP Arriving" },
  { id: "t5", text: "Kitchen overloaded — pause online orders temporarily", label: "Kitchen Overloaded" },
];

const RECIPIENT_ROLES = [
  { value: "all", label: "Everyone" },
  { value: "kitchen", label: "Kitchen" },
  { value: "waiter", label: "Waiters" },
  { value: "manager", label: "Manager" },
  { value: "owner", label: "Owner" },
];

interface Message {
  id: string;
  senderName: string;
  senderRole: string;
  recipientRole: string;
  message: string;
  orderId?: string;
  createdAt: string;
}

interface ServiceMessagePanelProps {
  open: boolean;
  onClose: () => void;
  unreadCount: number;
  onMarkRead: () => void;
}

export function ServiceMessagePanel({ open, onClose, unreadCount, onMarkRead }: ServiceMessagePanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [recipientRole, setRecipientRole] = useState("all");
  const [messageText, setMessageText] = useState("");
  const [orderId, setOrderId] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useRealtimeEvent("coordination:message", (payload: any) => {
    if (payload && payload.id) {
      setMessages(prev => [payload, ...prev].slice(0, 50));
    }
  });

  useEffect(() => {
    if (open) {
      onMarkRead();
    }
  }, [open]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coordination/messages", {
        recipientRole,
        message: messageText,
        orderId: orderId || null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.message) {
        setMessages(prev => [data.message, ...prev].slice(0, 50));
      }
      setMessageText("");
      setOrderId("");
      toast({ title: "Message Sent", description: "Your message has been sent" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleTemplateSelect = (template: typeof QUICK_TEMPLATES[0]) => {
    setMessageText(template.text);
  };

  const roleLabel: Record<string, string> = {
    owner: "Owner", franchise_owner: "Franchise Owner", manager: "Manager",
    outlet_manager: "Outlet Manager", supervisor: "Supervisor", waiter: "Waiter",
    kitchen: "Kitchen", cashier: "Cashier", all: "All",
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md flex flex-col" data-testid="service-message-panel">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Team Messages
            {unreadCount > 0 && (
              <Badge className="bg-red-500 text-white ml-1" data-testid="unread-count-badge">
                {unreadCount}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>Send quick messages to your team</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col flex-1 gap-4 overflow-hidden mt-4">
          <div className="space-y-3 shrink-0">
            <div className="flex gap-2">
              <Select value={recipientRole} onValueChange={setRecipientRole}>
                <SelectTrigger className="flex-1" data-testid="select-recipient">
                  <SelectValue placeholder="Send to..." />
                </SelectTrigger>
                <SelectContent>
                  {RECIPIENT_ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Order ID (optional)"
                value={orderId}
                onChange={e => setOrderId(e.target.value)}
                className="w-32"
                data-testid="input-order-id"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Quick Templates</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplateSelect(t)}
                    className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 border transition-colors"
                    data-testid={`template-${t.id}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Textarea
                placeholder="Type your message..."
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                className="resize-none"
                rows={2}
                data-testid="textarea-message"
              />
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={!messageText.trim() || sendMutation.isPending}
                className="self-end"
                data-testid="btn-send-message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <p className="text-xs text-muted-foreground font-medium mb-2">Recent Messages</p>
            <ScrollArea className="h-full">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No messages yet
                </div>
              ) : (
                <div className="space-y-2 pr-2">
                  {messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`rounded-lg border p-3 space-y-1 ${
                        msg.senderName === user?.name
                          ? "bg-primary/5 border-primary/20 ml-6"
                          : "bg-muted/30 mr-6"
                      }`}
                      data-testid={`message-${msg.id.slice(-4)}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold">{msg.senderName}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {roleLabel[msg.senderRole] || msg.senderRole}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">→</span>
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            {roleLabel[msg.recipientRole] || msg.recipientRole}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-sm">{msg.message}</p>
                      {msg.orderId && (
                        <p className="text-xs text-muted-foreground">Order: #{msg.orderId.slice(-6)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
