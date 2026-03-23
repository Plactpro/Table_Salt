import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessageCircle, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  tenant_id: string;
  tenant_name: string;
  created_by_name: string;
  assigned_to?: string;
  assigned_to_name?: string;
  reply_count: number;
  created_at: string;
  last_replied_at?: string;
}

interface Stats {
  open: number;
  in_progress: number;
  replied: number;
  resolved: number;
  closed: number;
  awaiting_support: number;
  avgResponseTime: number | null;
  byCategory: Record<string, number>;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "bg-slate-100 text-slate-700" },
  normal: { label: "Normal", color: "bg-green-100 text-green-800" },
  high: { label: "High", color: "bg-amber-100 text-amber-800" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-800" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "bg-emerald-100 text-emerald-800" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-800" },
  replied: { label: "Replied", color: "bg-purple-100 text-purple-800" },
  awaiting_support: { label: "Awaiting Support", color: "bg-amber-100 text-amber-800" },
  resolved: { label: "Resolved", color: "bg-slate-100 text-slate-600" },
  closed: { label: "Closed", color: "bg-slate-100 text-slate-500" },
};

export default function AdminSupportPage() {
  const [, navigate] = useLocation();
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  if (filterStatus) params.set("status", filterStatus);
  if (filterPriority) params.set("priority", filterPriority);
  if (filterCategory) params.set("category", filterCategory);
  const queryString = params.toString();

  const { data: tickets = [] } = useQuery<Ticket[]>({
    queryKey: ["/api/admin/support/tickets", queryString],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/support/tickets${queryString ? `?${queryString}` : ""}`);
      return r.json();
    },
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/admin/support/stats"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/support/stats");
      return r.json();
    },
    refetchInterval: 30000,
  });

  const filtered = tickets.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.subject?.toLowerCase().includes(q) ||
      t.tenant_name?.toLowerCase().includes(q) ||
      t.created_by_name?.toLowerCase().includes(q)
    );
  });

  const getPriorityConfig = (p: string) => PRIORITY_CONFIG[p] ?? PRIORITY_CONFIG.normal;
  const getStatusConfig = (s: string) => STATUS_CONFIG[s] ?? STATUS_CONFIG.open;

  return (
    <div className="p-6" data-testid="page-admin-support">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Support Tickets</h1>
            <p className="text-sm text-slate-500">Manage and respond to tenant support requests</p>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className="bg-white rounded-lg border p-3 text-center" data-testid="stat-tickets-open">
              <p className="text-2xl font-bold text-emerald-600">{stats.open + stats.awaiting_support}</p>
              <p className="text-xs text-slate-500">Open</p>
            </div>
            <div className="bg-white rounded-lg border p-3 text-center" data-testid="stat-tickets-replied">
              <p className="text-2xl font-bold text-purple-600">{stats.replied}</p>
              <p className="text-xs text-slate-500">Replied</p>
            </div>
            <div className="bg-white rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.in_progress}</p>
              <p className="text-xs text-slate-500">In Progress</p>
            </div>
            <div className="bg-white rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-slate-600">{stats.resolved + stats.closed}</p>
              <p className="text-xs text-slate-500">Resolved</p>
            </div>
            <div className="bg-white rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-indigo-600">
                {stats.avgResponseTime != null ? `${Math.round(stats.avgResponseTime)}m` : "—"}
              </p>
              <p className="text-xs text-slate-500">Avg Response</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search tickets, tenants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-sm"
            />
          </div>
          <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
            <SelectTrigger data-testid="select-filter-status" className="w-36 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="awaiting_support">Awaiting Support</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="replied">Replied</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPriority || "all"} onValueChange={(v) => setFilterPriority(v === "all" ? "" : v)}>
            <SelectTrigger data-testid="select-filter-priority" className="w-32 text-sm">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory || "all"} onValueChange={(v) => setFilterCategory(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36 text-sm">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="billing">Billing</SelectItem>
              <SelectItem value="technical">Technical</SelectItem>
              <SelectItem value="feature">Feature</SelectItem>
              <SelectItem value="training">Training</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white rounded-lg border" data-testid="list-admin-tickets">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <MessageCircle className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No tickets found</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((t) => {
              const priorityCfg = getPriorityConfig(t.priority);
              const statusCfg = getStatusConfig(t.status);
              return (
                <div
                  key={t.id}
                  data-testid={`row-admin-ticket-${t.id}`}
                  className="px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-sm text-slate-900">{t.subject}</span>
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", priorityCfg.color)}>
                          {priorityCfg.label.toUpperCase()}
                        </span>
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", statusCfg.color)}>
                          {statusCfg.label.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        <span className="font-medium">{t.tenant_name || "Unknown Tenant"}</span>
                        {t.created_by_name ? ` · ${t.created_by_name}` : ""}
                        {" · "}
                        {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{t.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded capitalize">{t.category}</span>
                        {t.reply_count > 0 && (
                          <span className="text-xs text-slate-400">{t.reply_count} {t.reply_count === 1 ? "reply" : "replies"}</span>
                        )}
                        {t.assigned_to_name && (
                          <span className="text-xs text-slate-400">Assigned: {t.assigned_to_name}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      data-testid={`button-view-ticket-${t.id}`}
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/admin/support/${t.id}`)}
                      className="shrink-0 text-xs"
                    >
                      View
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
