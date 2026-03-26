import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessageCircle, X, ArrowLeft, Send, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type TicketStatus = "open" | "in_progress" | "replied" | "awaiting_support" | "resolved" | "closed";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: TicketStatus;
  replyCount: number;
  reply_count: number;
  createdAt: string;
  created_at: string;
  lastRepliedAt?: string;
  last_replied_at?: string;
}

interface Reply {
  id: string;
  authorName: string;
  author_name: string;
  isAdmin: boolean;
  is_admin: boolean;
  message: string;
  createdAt: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "bg-emerald-100 text-emerald-800" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-800" },
  replied: { label: "Replied", color: "bg-purple-100 text-purple-800" },
  awaiting_support: { label: "Awaiting Support", color: "bg-amber-100 text-amber-800" },
  resolved: { label: "Resolved", color: "bg-slate-100 text-slate-700" },
  closed: { label: "Closed", color: "bg-slate-100 text-slate-500" },
};

const UNREAD_LS_KEY = "support_widget_last_opened";

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"tickets" | "new">("tickets");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [replyMsg, setReplyMsg] = useState("");
  const [newTicket, setNewTicket] = useState({ subject: "", description: "", category: "general", priority: "normal" });
  const { toast } = useToast();
  const [location] = useLocation();
  const queryClient = useQueryClient();

  const { data: tickets = [] } = useQuery<Ticket[]>({
    queryKey: ["/api/support/tickets"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/support/tickets");
      return r.json();
    },
    enabled: open,
  });

  const { data: ticketDetail } = useQuery<Ticket & { replies: Reply[] }>({
    queryKey: ["/api/support/tickets", selectedTicketId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/support/tickets/${selectedTicketId}`);
      return r.json();
    },
    enabled: !!selectedTicketId,
    refetchInterval: selectedTicketId ? 15000 : false,
  });

  useRealtimeEvent("support:new_reply", useCallback((payload: any) => {
    setHasUnread(true);
    toast({ title: "Support replied to your ticket", description: payload?.message ?? "" });
    queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
    if (selectedTicketId === payload?.ticketId) {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", selectedTicketId] });
    }
  }, [selectedTicketId, toast, queryClient]));

  useEffect(() => {
    if (!open) return;
    const lastOpened = localStorage.getItem(UNREAD_LS_KEY);
    const lastTs = lastOpened ? Number(lastOpened) : 0;
    const hasAdminReply = tickets.some(t => {
      const repliedAt = t.last_replied_at || t.lastRepliedAt;
      return t.status === "replied" && repliedAt && new Date(repliedAt).getTime() > lastTs;
    });
    setHasUnread(hasAdminReply);
  }, [tickets, open]);

  const handleOpen = () => {
    setOpen(true);
    localStorage.setItem(UNREAD_LS_KEY, String(Date.now()));
    setHasUnread(false);
    queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
  };

  const createTicketMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/support/tickets", {
        ...newTicket,
        pageContext: location,
        browserInfo: navigator.userAgent.substring(0, 200),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      setNewTicket({ subject: "", description: "", category: "general", priority: "normal" });
      setTab("tickets");
      toast({ title: "Ticket submitted!", description: "We'll get back to you shortly." });
    },
    onError: (e: Error) => toast({ title: "Failed to submit ticket", description: e.message, variant: "destructive" }),
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/support/tickets/${selectedTicketId}/reply`, { message: replyMsg });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      setReplyMsg("");
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", selectedTicketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
    },
    onError: (e: Error) => toast({ title: "Failed to send reply", description: e.message, variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PATCH", `/api/support/tickets/${selectedTicketId}/close`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", selectedTicketId] });
      toast({ title: "Ticket closed" });
    },
    onError: (e: Error) => toast({ title: "Failed to close ticket", description: e.message, variant: "destructive" }),
  });

  const getReplyCount = (t: Ticket) => t.reply_count ?? t.replyCount ?? 0;
  const getCreatedAt = (t: Ticket) => t.created_at || t.createdAt;
  const getStatus = (t: Ticket): TicketStatus => (t.status as TicketStatus) || "open";
  const getStatusCfg = (s: string) => STATUS_CONFIG[s] ?? STATUS_CONFIG.open;

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <button
          data-testid="button-support-widget"
          onClick={handleOpen}
          className="relative w-14 h-14 rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center"
          aria-label="Open support"
        >
          <MessageCircle className="h-6 w-6" />
          {hasUnread && (
            <span
              data-testid="badge-unread-replies"
              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
            >
              !
            </span>
          )}
        </button>
      </div>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-96 bg-background rounded-xl shadow-2xl flex flex-col border border-border overflow-hidden" style={{ maxHeight: "600px" }}>
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-white shrink-0">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              <span className="font-semibold text-sm tracking-wide">SUPPORT</span>
            </div>
            <button onClick={() => { setOpen(false); setSelectedTicketId(null); }} className="opacity-80 hover:opacity-100" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          {selectedTicketId && ticketDetail ? (
            <div className="flex flex-col flex-1 min-h-0" data-testid="panel-ticket-detail">
              <div className="px-4 py-2 border-b bg-slate-50 flex items-center gap-2 shrink-0">
                <button
                  data-testid="button-back-tickets"
                  onClick={() => setSelectedTicketId(null)}
                  className="text-slate-500 hover:text-slate-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ticketDetail.subject}</p>
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", getStatusCfg(ticketDetail.status).color)}>
                  {getStatusCfg(ticketDetail.status).label.toUpperCase()}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" data-testid="list-replies">
                <div className="flex justify-end">
                  <div className="max-w-[80%] bg-primary/10 rounded-lg px-3 py-2 text-sm">
                    <p className="text-xs text-slate-500 mb-1">You</p>
                    <p>{ticketDetail.description}</p>
                  </div>
                </div>
                {(ticketDetail.replies || []).map((r) => {
                  const isAdmin = r.is_admin ?? r.isAdmin;
                  const authorName = r.author_name || r.authorName;
                  const createdAt = r.created_at || r.createdAt;
                  return (
                    <div
                      key={r.id}
                      data-testid={`bubble-reply-${r.id}`}
                      className={cn("flex", isAdmin ? "justify-start" : "justify-end")}
                    >
                      <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", isAdmin ? "bg-blue-50 border border-blue-200" : "bg-primary/10")}>
                        <p className="text-xs text-slate-500 mb-1">{isAdmin ? "Support Team" : "You"} · {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}</p>
                        <p className="whitespace-pre-wrap">{r.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {ticketDetail.status !== "closed" && ticketDetail.status !== "resolved" && (
                <div className="px-4 py-3 border-t shrink-0 space-y-2">
                  <Textarea
                    data-testid="textarea-reply-message"
                    placeholder="Your reply..."
                    value={replyMsg}
                    onChange={(e) => setReplyMsg(e.target.value)}
                    rows={2}
                    className="text-sm resize-none"
                  />
                  <div className="flex gap-2">
                    <Button
                      data-testid="button-send-reply"
                      size="sm"
                      className="flex-1"
                      onClick={() => replyMutation.mutate()}
                      disabled={!replyMsg.trim() || replyMutation.isPending}
                    >
                      <Send className="h-3 w-3 mr-1" /> Send Reply
                    </Button>
                    <Button
                      data-testid="button-close-ticket"
                      size="sm"
                      variant="outline"
                      onClick={() => closeMutation.mutate()}
                      disabled={closeMutation.isPending}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex border-b shrink-0">
                <button
                  data-testid="tab-my-tickets"
                  onClick={() => setTab("tickets")}
                  className={cn("flex-1 py-2 text-sm font-medium transition-colors", tab === "tickets" ? "border-b-2 border-primary text-primary" : "text-slate-500 hover:text-slate-800")}
                >
                  My Tickets
                </button>
                <button
                  data-testid="tab-new-ticket"
                  onClick={() => setTab("new")}
                  className={cn("flex-1 py-2 text-sm font-medium transition-colors", tab === "new" ? "border-b-2 border-primary text-primary" : "text-slate-500 hover:text-slate-800")}
                >
                  New Ticket
                </button>
              </div>

              {tab === "tickets" ? (
                <div className="flex-1 overflow-y-auto" data-testid="list-my-tickets">
                  {tickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-slate-400 text-sm">
                      <MessageCircle className="h-8 w-8 mb-2 opacity-40" />
                      No tickets yet
                    </div>
                  ) : (
                    tickets.map((t) => {
                      const cfg = getStatusCfg(getStatus(t));
                      const createdAt = getCreatedAt(t);
                      return (
                        <button
                          key={t.id}
                          data-testid={`row-ticket-${t.id}`}
                          onClick={() => setSelectedTicketId(t.id)}
                          className="w-full text-left px-4 py-3 border-b hover:bg-slate-50 transition-colors flex items-start gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium truncate">{t.subject}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span data-testid={`badge-ticket-status-${t.id}`} className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", cfg.color)}>
                                {cfg.label.toUpperCase()}
                              </span>
                              <span className="text-xs text-slate-400">{formatDistanceToNow(new Date(createdAt), { addSuffix: true })}</span>
                              {getReplyCount(t) > 0 && (
                                <span className="text-xs text-slate-400">{getReplyCount(t)} {getReplyCount(t) === 1 ? "reply" : "replies"}</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        </button>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">Category</label>
                    <Select
                      value={newTicket.category}
                      onValueChange={(v) => setNewTicket(p => ({ ...p, category: v }))}
                    >
                      <SelectTrigger data-testid="select-ticket-category" className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="billing">Billing</SelectItem>
                        <SelectItem value="technical">Technical</SelectItem>
                        <SelectItem value="feature">Feature Request</SelectItem>
                        <SelectItem value="training">Training</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">Priority</label>
                    <Select
                      value={newTicket.priority}
                      onValueChange={(v) => setNewTicket(p => ({ ...p, priority: v }))}
                    >
                      <SelectTrigger data-testid="select-ticket-priority" className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">Subject</label>
                    <Input
                      data-testid="input-ticket-subject"
                      placeholder="Brief summary of your issue"
                      value={newTicket.subject}
                      onChange={(e) => setNewTicket(p => ({ ...p, subject: e.target.value }))}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">Describe your issue</label>
                    <Textarea
                      data-testid="textarea-ticket-description"
                      placeholder="Please describe your issue in detail..."
                      value={newTicket.description}
                      onChange={(e) => setNewTicket(p => ({ ...p, description: e.target.value }))}
                      rows={4}
                      className="text-sm resize-none"
                    />
                  </div>
                  <Button
                    data-testid="button-submit-ticket"
                    className="w-full"
                    onClick={() => createTicketMutation.mutate()}
                    disabled={!newTicket.subject.trim() || !newTicket.description.trim() || createTicketMutation.isPending}
                  >
                    {createTicketMutation.isPending ? "Submitting..." : "Submit Ticket"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
