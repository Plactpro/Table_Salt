import { useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { formatCurrency } from "@shared/currency";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  ChevronDown, ChevronUp, Printer, AlertTriangle, Flame, Loader2, CheckCircle2, XCircle,
} from "lucide-react";
import VoidRequestModal from "./VoidRequestModal";
import RefireModal from "./RefireModal";
import ReprintPopup from "./ReprintPopup";

export interface TicketItem {
  id: string;
  name: string;
  quantity: number;
  price: string | number;
  total?: string | number;
  notes?: string | null;
  is_voided?: boolean;
  voided_reason?: string | null;
  voided_at?: string | null;
  is_refire?: boolean;
  original_item_id?: string | null;
  modifications?: string[];
  assignedChefName?: string | null;
  prepTimeMinutes?: number | null;
}

export interface TicketDetail {
  id: string;
  orderNumber?: string;
  tableNumber?: string | number;
  createdAt?: string | null;
  channel?: string | null;
  covers?: number | null;
  waiterName?: string | null;
  status: string;
  orderType?: string | null;
  items: TicketItem[];
  subtotal?: string | number;
  discountAmount?: string | number;
  serviceChargeAmount?: string | number;
  taxAmount?: string | number;
  totalAmount?: string | number;
  paymentMethod?: string | null;
  paidAt?: string | null;
  isPaid?: boolean;
  hasVoidedItems?: boolean;
}

export interface TimelineEvent {
  id?: string;
  action: string;
  description?: string;
  performerName?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface VoidRequest {
  id: string;
  orderId: string;
  orderNumber?: string;
  tableNumber?: string | number;
  itemId?: string;
  itemName?: string;
  quantity?: number;
  itemPrice?: number | string;
  reason?: string;
  requestedByName?: string;
  status: string;
  createdAt?: string;
}

interface TicketDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  orderId: string | null;
  onRefresh?: () => void;
}

const EVENT_ICONS: Record<string, string> = {
  created: "📝",
  kot_sent: "🖨️",
  cooking: "👨‍🍳",
  ready: "✅",
  served: "🍽️",
  paid: "💰",
  closed: "🔒",
  void_requested: "🔴",
  void_approved: "🔴",
  void_rejected: "🔴",
  refire: "🔥",
  viewed: "👁️",
  reprinted: "🖨️",
  receipt_reprinted: "🖨️",
  kot_reprinted: "🖨️",
  bill_reprinted: "🖨️",
};

function getEventIcon(action: string) {
  const key = action.toLowerCase().replace(/[^a-z_]/g, "_");
  return EVENT_ICONS[key] || "📌";
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    paid: { label: "✅ Paid", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
    void: { label: "🔴 Void", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
    voided: { label: "🔴 Voided", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
    active: { label: "🟡 Active", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
    in_progress: { label: "🟡 Active", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
    new: { label: "🟡 Active", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
    sent_to_kitchen: { label: "🟡 Active", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
    closed: { label: "🔒 Closed", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  };
  const s = cfg[status.toLowerCase()] || { label: status, className: "bg-muted text-muted-foreground" };
  return <Badge className={`${s.className} border-0 text-sm px-3 py-1`}>{s.label}</Badge>;
}

export default function TicketDetailDrawer({ open, onClose, orderId, onRefresh }: TicketDetailDrawerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showTimeline, setShowTimeline] = useState(true);
  const [showPrintHistory, setShowPrintHistory] = useState(false);
  const [showFullTimeline, setShowFullTimeline] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showRefireModal, setShowRefireModal] = useState(false);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const role = user?.role ?? "waiter";
  const currency = (user?.tenant?.currency?.toUpperCase() || "INR") as string;
  const currencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const fmt = (val: string | number | null | undefined) =>
    formatCurrency(Number(val ?? 0), currency, { position: currencyPosition });

  const { data: ticket, isLoading: ticketLoading } = useQuery<TicketDetail>({
    queryKey: [`/api/tickets/${orderId}`],
    enabled: !!orderId && open,
  });

  const { data: timeline, isLoading: timelineLoading } = useQuery<TimelineEvent[]>({
    queryKey: [`/api/tickets/${orderId}/timeline`],
    enabled: !!orderId && open && showTimeline,
  });

  const { data: voidRequests } = useQuery<VoidRequest[]>({
    queryKey: [`/api/tickets/${orderId}/void-requests`],
    enabled: !!orderId && open && (role === "manager" || role === "owner"),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/tickets/void-requests/${id}/approve`, {}),
    onSuccess: () => {
      toast({ title: "✅ Void approved" });
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${orderId}/void-requests`] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/void-requests/pending-count"] });
      refreshTicket();
    },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("PUT", `/api/tickets/void-requests/${id}/reject`, { reason }),
    onSuccess: () => {
      toast({ title: "❌ Void rejected" });
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${orderId}/void-requests`] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/void-requests/pending-count"] });
    },
    onError: () => toast({ title: "Failed to reject", variant: "destructive" }),
  });

  const refreshTicket = useCallback(() => {
    if (!orderId) return;
    queryClient.invalidateQueries({ queryKey: [`/api/tickets/${orderId}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/tickets/${orderId}/timeline`] });
    onRefresh?.();
  }, [orderId, queryClient, onRefresh]);

  useRealtimeEvent("void_request:approved", (payload: unknown) => {
    const p = payload as { orderId?: string; newTotal?: number };
    if (p?.orderId === orderId) {
      refreshTicket();
      const updatedBill = p?.newTotal ? ` Bill updated to ${fmt(p.newTotal)}` : "";
      toast({ title: "✅ Void approved", description: `Item voided successfully.${updatedBill}` });
    }
  });

  useRealtimeEvent("void_request:rejected", (payload: unknown) => {
    const p = payload as { orderId?: string; reason?: string };
    if (p?.orderId === orderId) {
      const reason = p?.reason ? ` Reason: ${p.reason}` : "";
      toast({ title: "❌ Void rejected", description: `Your void request was rejected.${reason}`, variant: "destructive" });
    }
  });

  useRealtimeEvent("kds:refire_ticket", (payload: unknown) => {
    const p = payload as { orderId?: string };
    if (p?.orderId === orderId) {
      toast({ title: "🔥 Refire sent!", description: "Item has been sent to kitchen as a refire." });
    }
  });

  const isActive = ticket && ["new", "in_progress", "sent_to_kitchen", "active"].includes(ticket.status.toLowerCase());
  const isVoided = ticket?.status.toLowerCase() === "void" || ticket?.status.toLowerCase() === "voided";

  const canVoidItem = role !== "kitchen" && ticket && !isVoided;
  const canRefireItem = role !== "kitchen" && isActive;
  const canReprintBill = role === "manager" || role === "owner" || role === "franchise_owner" || role === "outlet_manager";
  const canReprintReceiptKot = role !== "kitchen";
  const isManagerOrOwner = role === "manager" || role === "owner" || role === "franchise_owner" || role === "outlet_manager";

  const pendingVoids = (voidRequests || []).filter((v: VoidRequest) => v.status === "pending");

  const displayedTimeline = showFullTimeline ? (timeline || []) : (timeline || []).slice(0, 10);

  if (!open) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="w-full md:w-[80%] max-w-3xl overflow-y-auto p-0"
        data-testid="drawer-ticket-detail"
      >
        {ticketLoading || !ticket ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="px-6 py-4 border-b bg-background sticky top-0 z-10">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <SheetTitle className="text-xl font-bold" data-testid="text-order-number">
                    Order #{ticket.orderNumber || ticket.id.slice(-6).toUpperCase()}
                  </SheetTitle>
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {ticket.createdAt && (
                      <span>{format(new Date(ticket.createdAt), "MMM d, yyyy h:mm a")}</span>
                    )}
                    {ticket.tableNumber && (
                      <span data-testid="text-order-table">Table {ticket.tableNumber}</span>
                    )}
                    {ticket.channel && <span>{ticket.channel}</span>}
                    {ticket.covers && <span>{ticket.covers} covers</span>}
                  </div>
                  {ticket.waiterName && (
                    <p className="text-sm text-muted-foreground" data-testid="text-order-waiter">
                      Served by: <span className="font-medium text-foreground">{ticket.waiterName}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div data-testid="text-order-status">
                    <StatusBadge status={ticket.status} />
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto">
              {/* Pending Void Requests section for manager/owner */}
              {isManagerOrOwner && pendingVoids.length > 0 && (
                <div className="mx-6 mt-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    {pendingVoids.length} Pending Void Request{pendingVoids.length > 1 ? "s" : ""}
                  </div>
                  {pendingVoids.map((vr: VoidRequest) => (
                    <div key={vr.id} className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 rounded-lg space-y-2">
                      <div className="text-sm">
                        {vr.requestedByName && <p className="font-medium">From: {vr.requestedByName}</p>}
                        {vr.itemName && <p>{vr.quantity}x {vr.itemName} {vr.itemPrice ? `(${fmt(vr.itemPrice)})` : ""}</p>}
                        {vr.reason && <p className="text-muted-foreground">Reason: {vr.reason}</p>}
                      </div>
                      <input
                        type="text"
                        placeholder="Reject reason (optional)"
                        value={rejectReasons[vr.id] || ""}
                        onChange={e => setRejectReasons(prev => ({ ...prev, [vr.id]: e.target.value }))}
                        data-testid={`input-reject-reason-${vr.id}`}
                        className="w-full text-sm border rounded px-2 py-1 bg-background"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => approveMutation.mutate(vr.id)}
                          disabled={approveMutation.isPending}
                          data-testid={`button-approve-void-${vr.id}`}
                        >
                          {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> APPROVE</>}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1"
                          onClick={() => rejectMutation.mutate({ id: vr.id, reason: rejectReasons[vr.id] || "" })}
                          disabled={rejectMutation.isPending}
                          data-testid={`button-reject-void-${vr.id}`}
                        >
                          {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4 mr-1" /> REJECT</>}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Items */}
              <div className="px-6 py-4">
                <h3 className="font-semibold text-base mb-3">Order Items</h3>
                <ul className="space-y-3" data-testid="list-order-items">
                  {(ticket.items || []).map(item => (
                    <li
                      key={item.id}
                      className={`p-3 rounded-lg border ${item.is_voided ? "bg-red-50 dark:bg-red-950/20 border-red-200" : item.is_refire ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200" : "bg-muted/30"}`}
                      data-testid={`row-item-${item.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <span className={`font-medium ${item.is_voided ? "line-through text-muted-foreground" : ""}`}>
                            {item.quantity}x {item.name}
                          </span>
                          {item.is_voided && (
                            <span
                              className="ml-2 inline-flex items-center text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 px-1.5 py-0.5 rounded font-medium cursor-help"
                              data-testid={`chip-voided-${item.id}`}
                              title={item.voided_reason
                                ? `${item.voided_reason}${item.voided_at ? ` — ${format(new Date(item.voided_at), "h:mm a")}` : ""}`
                                : "Voided"}
                            >
                              🔴 VOIDED
                            </span>
                          )}
                          {item.is_refire && (
                            <span
                              className="ml-2 inline-flex items-center text-xs bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 px-1.5 py-0.5 rounded font-medium"
                              data-testid={`chip-refire-${item.id}`}
                            >
                              🔥 REFIRE
                            </span>
                          )}
                        </div>
                        <span className={`text-sm font-medium ${item.is_voided ? "line-through text-muted-foreground" : ""}`}>
                          {fmt(Number(item.price) * item.quantity)}
                        </span>
                      </div>
                      {(item.modifications && item.modifications.length > 0) && (
                        <div className="mt-1 flex flex-wrap gap-1" data-testid={`text-item-mods-${item.id}`}>
                          {item.modifications.map((mod, i) => (
                            <span key={i} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{mod}</span>
                          ))}
                        </div>
                      )}
                      {(item.assignedChefName || item.prepTimeMinutes) && (
                        <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-item-timing-${item.id}`}>
                          {item.assignedChefName && `Chef: ${item.assignedChefName}`}
                          {item.prepTimeMinutes && ` | ⏱️ ${item.prepTimeMinutes} min`}
                        </p>
                      )}
                      {item.notes && (
                        <p className="mt-1 text-xs text-muted-foreground italic">{item.notes}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <Separator />

              {/* Bill Summary */}
              <div className="px-6 py-4">
                <h3 className="font-semibold text-base mb-3">Bill Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{fmt(ticket.subtotal)}</span>
                  </div>
                  {Number(ticket.discountAmount || 0) > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span>-{fmt(ticket.discountAmount)}</span>
                    </div>
                  )}
                  {Number(ticket.serviceChargeAmount || 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Service Charge</span>
                      <span>{fmt(ticket.serviceChargeAmount)}</span>
                    </div>
                  )}
                  {Number(ticket.taxAmount || 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST / Tax</span>
                      <span>{fmt(ticket.taxAmount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span>{fmt(ticket.totalAmount)}</span>
                  </div>
                  {ticket.paymentMethod && (
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-muted-foreground">Payment</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{ticket.paymentMethod}</Badge>
                        {ticket.paidAt && (
                          <span className="text-xs text-muted-foreground">{format(new Date(ticket.paidAt), "h:mm a")}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Timeline */}
              <div className="px-6 py-4" data-testid="section-timeline">
                <button
                  className="flex items-center gap-2 font-semibold text-base w-full text-left"
                  onClick={() => setShowTimeline(v => !v)}
                >
                  Order Timeline
                  {showTimeline ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
                </button>
                {showTimeline && (
                  <div className="mt-3">
                    {timelineLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading timeline...
                      </div>
                    ) : !timeline || timeline.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No timeline events available.</p>
                    ) : (
                      <ol className="space-y-2">
                        {displayedTimeline.map((event, index) => (
                          <li key={event.id || index} className="flex items-start gap-3 text-sm" data-testid={`timeline-event-${index}`}>
                            <span className="text-base mt-0.5">{getEventIcon(event.action)}</span>
                            <div className="flex-1">
                              <span className="font-medium">{event.description || event.action}</span>
                              {event.performerName && (
                                <span className="text-muted-foreground"> — {event.performerName}</span>
                              )}
                              {event.createdAt && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {format(new Date(event.createdAt), "h:mm a")}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                    {timeline && timeline.length > 10 && !showFullTimeline && (
                      <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setShowFullTimeline(true)}>
                        Load full timeline ({timeline.length} events)
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Print History */}
              <div className="px-6 py-4">
                <button
                  className="flex items-center gap-2 font-semibold text-base w-full text-left"
                  onClick={() => setShowPrintHistory(v => !v)}
                >
                  Print History
                  {showPrintHistory ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
                </button>
                {showPrintHistory && (
                  <div className="mt-3 text-sm text-muted-foreground">
                    {(timeline || [])
                      .filter(e => ["receipt_reprinted", "kot_reprinted", "bill_reprinted", "reprinted"].includes(e.action.toLowerCase()))
                      .length === 0 ? (
                      <p>No reprints recorded.</p>
                    ) : (
                      <div className="space-y-1">
                        {(timeline || [])
                          .filter(e => ["receipt_reprinted", "kot_reprinted", "bill_reprinted", "reprinted"].includes(e.action.toLowerCase()))
                          .map((e, i) => (
                            <p key={i}>{e.action.replace(/_/g, " ")}: {e.createdAt ? format(new Date(e.createdAt), "h:mm a") : ""}</p>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-6 py-4 border-t bg-background sticky bottom-0 flex flex-wrap gap-2">
              {canReprintReceiptKot && (
                <ReprintPopup
                  orderId={ticket.id}
                  orderNumber={ticket.orderNumber}
                  canReprintBill={canReprintBill}
                >
                  <Button variant="outline" size="sm" data-testid="button-reprint">
                    <Printer className="h-4 w-4 mr-1.5" />
                    REPRINT
                  </Button>
                </ReprintPopup>
              )}
              {canVoidItem && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => setShowVoidModal(true)}
                  data-testid="button-void-item"
                >
                  🔴 VOID ITEM
                </Button>
              )}
              {canRefireItem && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-orange-300 text-orange-600 hover:bg-orange-50"
                  onClick={() => setShowRefireModal(true)}
                  data-testid="button-refire-item"
                >
                  <Flame className="h-4 w-4 mr-1.5" />
                  REFIRE ITEM
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>

      {ticket && (
        <>
          <VoidRequestModal
            open={showVoidModal}
            onClose={() => setShowVoidModal(false)}
            orderId={ticket.id}
            orderNumber={ticket.orderNumber}
            tableNumber={ticket.tableNumber}
            items={ticket.items}
            onSuccess={refreshTicket}
          />
          <RefireModal
            open={showRefireModal}
            onClose={() => setShowRefireModal(false)}
            orderId={ticket.id}
            orderNumber={ticket.orderNumber}
            tableNumber={ticket.tableNumber}
            items={ticket.items}
            onSuccess={refreshTicket}
          />
        </>
      )}
    </Sheet>
  );
}
