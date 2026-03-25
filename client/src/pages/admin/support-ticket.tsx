import { useState } from "react";
import { PageTitle } from "@/lib/accessibility";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Send, Eye, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface AdminUser {
  id: string;
  name: string;
  username: string;
  role: string;
}

interface Reply {
  id: string;
  author_name: string;
  is_admin: boolean;
  message: string;
  created_at: string;
}

interface TenantContext {
  name: string;
  plan: string;
  createdAt: string;
  outletCount: number;
}

interface TicketDetail {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  tenant_id: string;
  tenant_name: string;
  created_by: string;
  created_by_name: string;
  assigned_to?: string;
  page_context?: string;
  browser_info?: string;
  tenant_plan?: string;
  reply_count: number;
  created_at: string;
  replies: Reply[];
  tenantContext: TenantContext | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "bg-emerald-100 text-emerald-800" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-800" },
  replied: { label: "Replied", color: "bg-purple-100 text-purple-800" },
  awaiting_support: { label: "Awaiting Support", color: "bg-amber-100 text-amber-800" },
  resolved: { label: "Resolved", color: "bg-slate-100 text-slate-600" },
  closed: { label: "Closed", color: "bg-slate-100 text-slate-500" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "bg-slate-100 text-slate-700" },
  normal: { label: "Normal", color: "bg-green-100 text-green-800" },
  high: { label: "High", color: "bg-amber-100 text-amber-800" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-800" },
};

export default function AdminSupportTicketPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/support/:ticketId");
  const ticketId = params?.ticketId ?? "";

  const [replyMsg, setReplyMsg] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: adminUsers = [] } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/support/admins"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/support/admins");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: ticket, isLoading } = useQuery<TicketDetail>({
    queryKey: ["/api/admin/support/tickets", ticketId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/support/tickets/${ticketId}`);
      if (!r.ok) throw new Error("Failed to load ticket");
      return r.json();
    },
    enabled: !!ticketId,
    refetchInterval: 15000,
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/support/tickets/${ticketId}/reply`, { message: replyMsg });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      setReplyMsg("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets"] });
      toast({ title: "Reply sent" });
    },
    onError: (e: Error) => toast({ title: "Failed to send reply", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { status?: string; priority?: string; assignedTo?: string }) => {
      const r = await apiRequest("PATCH", `/api/admin/support/tickets/${ticketId}`, data);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/stats"] });
      toast({ title: "Ticket updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const impersonateMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/impersonate/${ticket!.created_by}`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      window.location.href = "/";
    },
    onError: (e: Error) => toast({ title: "Impersonation failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-48 text-slate-500">Loading ticket...</div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6">
        <p className="text-slate-500">Ticket not found</p>
        <Button variant="outline" onClick={() => navigate("/admin/support")} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Support
        </Button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.open;
  const priorityCfg = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.normal;

  return (
    <div className="p-6" data-testid="page-admin-ticket-detail">
      <PageTitle title="Admin — Support Ticket" />
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/support")} className="text-slate-600">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-slate-900 truncate">{ticket.subject}</h1>
            <span data-testid="text-tenant-name" className="text-slate-500 text-sm">&mdash; {ticket.tenant_name || "Unknown Tenant"}</span>
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", priorityCfg.color)}>{priorityCfg.label.toUpperCase()}</span>
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", statusCfg.color)}>{statusCfg.label.toUpperCase()}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Submitted by: {ticket.created_by_name || "Unknown"} · {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
          </p>
          {ticket.tenantContext && (
            <p className="text-xs text-slate-500" data-testid="text-tenant-plan">
              Plan: <span className="font-medium capitalize">{ticket.tenantContext.plan}</span>
              {" · "}Outlets: {ticket.tenantContext.outletCount}
            </p>
          )}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-amber-800">Tenant Actions:</span>
        <Button
          data-testid="button-view-as-owner"
          size="sm"
          variant="outline"
          className="text-xs border-amber-400 text-amber-800 bg-amber-100 hover:bg-amber-200"
          onClick={() => impersonateMutation.mutate()}
          disabled={impersonateMutation.isPending}
        >
          <Eye className="h-3 w-3 mr-1" />
          View as Owner
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs"
          onClick={() => window.open(`/admin/tenants/${ticket.tenant_id}`, "_blank")}
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          View Tenant
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-700">Conversation</h2>
            </div>
            <div className="p-4 space-y-4 max-h-96 overflow-y-auto" data-testid="list-ticket-replies">
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-slate-100 rounded-lg px-3 py-2 text-sm">
                  <p className="text-xs text-slate-500 mb-1 font-medium">{ticket.created_by_name || "Tenant"}</p>
                  <p className="whitespace-pre-wrap">{ticket.description}</p>
                </div>
              </div>

              {ticket.replies?.map((r) => (
                <div key={r.id} className={cn("flex", r.is_admin ? "justify-start" : "justify-end")}>
                  <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", r.is_admin ? "bg-blue-50 border border-blue-200" : "bg-slate-100")}>
                    <p className="text-xs text-slate-500 mb-1 font-medium">
                      {r.is_admin ? `Support Team (${r.author_name})` : r.author_name}
                      {" · "}
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </p>
                    <p className="whitespace-pre-wrap">{r.message}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t space-y-2">
              <Textarea
                data-testid="textarea-admin-reply"
                placeholder="Type your reply..."
                value={replyMsg}
                onChange={(e) => setReplyMsg(e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
              <div className="flex gap-2">
                <Button
                  data-testid="button-send-admin-reply"
                  onClick={() => replyMutation.mutate()}
                  disabled={!replyMsg.trim() || replyMutation.isPending}
                  size="sm"
                >
                  <Send className="h-3 w-3 mr-1" />
                  Send Reply
                </Button>
                <Button
                  data-testid="button-mark-resolved"
                  variant="outline"
                  size="sm"
                  onClick={() => updateMutation.mutate({ status: "resolved" })}
                  disabled={updateMutation.isPending || ticket.status === "resolved" || ticket.status === "closed"}
                >
                  Mark Resolved
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-700">Ticket Info</h2>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Category</p>
                <p className="capitalize">{ticket.category}</p>
              </div>
              {ticket.page_context && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Page Context</p>
                  <p className="text-xs font-mono bg-slate-50 rounded px-2 py-1 truncate">{ticket.page_context}</p>
                </div>
              )}
              {ticket.browser_info && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Browser</p>
                  <p className="text-xs text-slate-600 line-clamp-2">{ticket.browser_info}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Status</p>
                <Select
                  value={ticket.status}
                  onValueChange={(v) => updateMutation.mutate({ status: v })}
                >
                  <SelectTrigger data-testid="select-ticket-status" className="text-sm h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="replied">Replied</SelectItem>
                    <SelectItem value="awaiting_support">Awaiting Support</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Priority</p>
                <Select
                  value={ticket.priority}
                  onValueChange={(v) => updateMutation.mutate({ priority: v })}
                >
                  <SelectTrigger className="text-sm h-8">
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
                <p className="text-xs font-medium text-slate-500 mb-1">Assign To</p>
                <Select
                  value={ticket.assigned_to ?? "unassigned"}
                  onValueChange={(v) => updateMutation.mutate({ assignedTo: v === "unassigned" ? "" : v })}
                >
                  <SelectTrigger data-testid="select-assign-admin" className="text-sm h-8">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {adminUsers.map((admin) => (
                      <SelectItem key={admin.id} value={admin.id}>{admin.name || admin.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
