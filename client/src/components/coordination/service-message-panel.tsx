import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation("common");
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [recipientRole, setRecipientRole] = useState("all");
  const [messageText, setMessageText] = useState("");
  const [orderId, setOrderId] = useState("");

  const QUICK_TEMPLATES = [
    { id: "t1", text: t("templateTableReadyText"), label: t("templateTableReady") },
    { id: "t2", text: t("templateOrderDelayedText"), label: t("templateOrderDelayed") },
    { id: "t3", text: t("templateAllergyAlertText"), label: t("templateAllergyAlert") },
    { id: "t4", text: t("templateVipArrivingText"), label: t("templateVipArriving") },
    { id: "t5", text: t("templateKitchenOverloadedText"), label: t("templateKitchenOverloaded") },
  ];

  const RECIPIENT_ROLES = [
    { value: "all", label: t("everyone") },
    { value: "kitchen", label: t("kitchen") },
    { value: "waiter", label: t("waiters") },
    { value: "manager", label: t("manager") },
    { value: "owner", label: t("owner") },
  ];

  const roleLabel: Record<string, string> = {
    owner: t("roles.owner"),
    franchise_owner: t("roles.franchise_owner"),
    manager: t("roles.manager"),
    outlet_manager: t("roles.outlet_manager"),
    supervisor: t("roles.supervisor"),
    waiter: t("roles.waiter"),
    kitchen: t("roles.kitchen"),
    cashier: t("roles.cashier"),
    all: t("all"),
  };

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
      toast({ title: t("messageSent"), description: t("messageHasBeenSent") });
    },
    onError: (e: Error) => {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    },
  });

  const handleTemplateSelect = (template: typeof QUICK_TEMPLATES[0]) => {
    setMessageText(template.text);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md flex flex-col" data-testid="service-message-panel">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            {t("teamMessages")}
            {unreadCount > 0 && (
              <Badge className="bg-red-500 text-white ml-1" data-testid="unread-count-badge">
                {unreadCount}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>{t("sendQuickMessages")}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col flex-1 gap-4 overflow-hidden mt-4">
          <div className="space-y-3 shrink-0">
            <div className="flex gap-2">
              <Select value={recipientRole} onValueChange={setRecipientRole}>
                <SelectTrigger className="flex-1" data-testid="select-recipient">
                  <SelectValue placeholder={t("sendTo")} />
                </SelectTrigger>
                <SelectContent>
                  {RECIPIENT_ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder={t("orderIdOptional")}
                value={orderId}
                onChange={e => setOrderId(e.target.value)}
                className="w-32"
                data-testid="input-order-id"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">{t("quickTemplates")}</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TEMPLATES.map(tmpl => (
                  <button
                    key={tmpl.id}
                    onClick={() => handleTemplateSelect(tmpl)}
                    className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 border transition-colors"
                    data-testid={`template-${tmpl.id}`}
                  >
                    {tmpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Textarea
                placeholder={t("typeYourMessage")}
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
            <p className="text-xs text-muted-foreground font-medium mb-2">{t("recentMessages")}</p>
            <ScrollArea className="h-full">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {t("noMessagesYet")}
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
                        <span dir="ltr" className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(msg.createdAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-sm">{msg.message}</p>
                      {msg.orderId && (
                        <p className="text-xs text-muted-foreground">{t("orderRef", { id: msg.orderId.slice(-6) })}</p>
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
