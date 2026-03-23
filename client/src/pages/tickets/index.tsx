import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@shared/currency";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Eye, Clock, CheckCircle2, XCircle } from "lucide-react";
import TicketDetailDrawer from "@/components/tickets/TicketDetailDrawer";
import type { VoidRequest } from "@/components/tickets/TicketDetailDrawer";

interface TicketRow {
  id: string;
  orderNumber?: string;
  tableNumber?: string | number;
  createdAt?: string | null;
  itemCount?: number;
  totalAmount?: string | number;
  status: string;
  hasRefire?: boolean;
  waiterName?: string;
  orderType?: string;
}

interface TicketListResponse {
  tickets: TicketRow[];
  total: number;
  page: number;
  pageSize: number;
}

function StatusBadge({ ticket }: { ticket: TicketRow }) {
  const statusMap: Record<string, { label: string; className: string }> = {
    paid: { label: "✅ Paid", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-0" },
    void: { label: "🔴 Void", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-0" },
    voided: { label: "🔴 Void", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-0" },
    active: { label: "🟡 Active", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-0" },
    in_progress: { label: "🟡 Active", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-0" },
    new: { label: "🟡 Active", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-0" },
    sent_to_kitchen: { label: "🟡 Active", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-0" },
    closed: { label: "🔒 Closed", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-0" },
  };
  const s = statusMap[ticket.status.toLowerCase()] || { label: ticket.status, className: "bg-muted text-muted-foreground border-0" };
  return (
    <div className="flex items-center gap-1 flex-wrap" data-testid={`badge-status-${ticket.id}`}>
      <Badge className={s.className}>{s.label}</Badge>
      {ticket.hasRefire && <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 border-0">🔥 Refire</Badge>}
    </div>
  );
}

export default function TicketHistoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();

  const urlParams = new URLSearchParams(location.includes("?") ? location.split("?")[1] : "");
  const initialFilter = urlParams.get("filter") || "";
  const initialOrder = urlParams.get("order") || null;

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("today");
  const [statusFilter, setStatusFilter] = useState(
    initialFilter === "void-requests" ? "void_requests" : "all"
  );
  const [typeFilter, setTypeFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrder);
  const [voidNotification, setVoidNotification] = useState<VoidRequest | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const currency = (user?.tenant?.currency?.toUpperCase() || "INR") as string;
  const currencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const fmt = (val: string | number | null | undefined) =>
    formatCurrency(Number(val ?? 0), currency, { position: currencyPosition });

  const role = user?.role ?? "waiter";
  const isManagerOrOwner = ["manager", "owner", "franchise_owner", "outlet_manager"].includes(role);
  const PAGE_SIZE = 20;

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("date", dateFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (staffFilter !== "all") params.set("staff", staffFilter);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    return params.toString();
  };

  const { data, isLoading } = useQuery<TicketListResponse>({
    queryKey: [`/api/tickets/history?${buildQueryString()}`],
  });

  const { data: pendingVoidData } = useQuery<{ count: number }>({
    queryKey: ["/api/tickets/void-requests/pending-count"],
    enabled: isManagerOrOwner,
    refetchInterval: 30000,
  });
  const pendingVoidCount = pendingVoidData?.count || 0;

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/tickets/void-requests/${id}/approve`, {}),
    onSuccess: () => {
      toast({ title: "✅ Void approved" });
      setVoidNotification(null);
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/void-requests/pending-count"] });
    },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("PUT", `/api/tickets/void-requests/${id}/reject`, { reason }),
    onSuccess: () => {
      toast({ title: "❌ Void rejected" });
      setVoidNotification(null);
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/void-requests/pending-count"] });
    },
    onError: () => toast({ title: "Failed to reject", variant: "destructive" }),
  });

  const handleVoidRequestEvent = useCallback((payload: unknown) => {
    if (isManagerOrOwner) {
      const vr = payload as VoidRequest;
      setVoidNotification(vr);
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/void-requests/pending-count"] });
    }
  }, [isManagerOrOwner, queryClient]);

  const handleVoidRequestResolved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/tickets/void-requests/pending-count"] });
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/tickets/history") });
  }, [queryClient]);

  const handleRefireEvent = useCallback(() => {
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/tickets/history") });
  }, [queryClient]);

  useRealtimeEvent("void_request:new", handleVoidRequestEvent);
  useRealtimeEvent("void_request:approved", handleVoidRequestResolved);
  useRealtimeEvent("void_request:rejected", handleVoidRequestResolved);
  useRealtimeEvent("kds:refire_ticket", handleRefireEvent);

  const tickets = data?.tickets || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startNum = total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const endNum = Math.min(page * PAGE_SIZE, total);

  const handleChipFilter = (chip: string) => {
    if (chip === "today") { setDateFilter("today"); setStatusFilter("all"); }
    else if (chip === "yesterday") { setDateFilter("yesterday"); setStatusFilter("all"); }
    else if (chip === "week") { setDateFilter("week"); setStatusFilter("all"); }
    else if (chip === "refire") setStatusFilter("refire");
    else if (chip === "high_value") setStatusFilter("high_value");
    setPage(1);
  };

  const isChipActive = (chip: string) => {
    if (chip === "today") return dateFilter === "today" && statusFilter === "all";
    if (chip === "yesterday") return dateFilter === "yesterday";
    if (chip === "week") return dateFilter === "week";
    if (chip === "refire") return statusFilter === "refire";
    if (chip === "high_value") return statusFilter === "high_value";
    return false;
  };

  return (
    <div className="space-y-4 p-1" data-testid="page-ticket-history">
      {/* Void request persistent notification for manager/owner */}
      {voidNotification && isManagerOrOwner && (
        <div className="fixed top-4 right-4 z-50 w-96 bg-background border-2 border-amber-300 rounded-xl shadow-xl p-4 space-y-3" data-testid="notification-void-request">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-sm">🔔 VOID REQUEST</p>
              {voidNotification.requestedByName && (
                <p className="text-sm">From: {voidNotification.requestedByName}</p>
              )}
              <p className="text-sm">
                Order #{voidNotification.orderNumber}
                {voidNotification.tableNumber ? ` | Table ${voidNotification.tableNumber}` : ""}
              </p>
              {voidNotification.itemName && (
                <p className="text-sm">
                  Item: {voidNotification.quantity}x {voidNotification.itemName}
                  {voidNotification.itemPrice ? ` (${fmt(voidNotification.itemPrice)})` : ""}
                </p>
              )}
              {voidNotification.reason && (
                <p className="text-sm text-muted-foreground">Reason: {voidNotification.reason}</p>
              )}
            </div>
          </div>
          <Input
            placeholder="Reject reason (optional)"
            value={rejectReason[voidNotification.id] || ""}
            onChange={e => setRejectReason(prev => ({ ...prev, [voidNotification.id!]: e.target.value }))}
            data-testid={`input-reject-reason-${voidNotification.id}`}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                if (voidNotification.orderId) setSelectedOrderId(voidNotification.orderId);
              }}
            >
              VIEW ORDER
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => approveMutation.mutate(voidNotification.id)}
              disabled={approveMutation.isPending}
              data-testid={`button-approve-void-${voidNotification.id}`}
            >
              {approveMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><CheckCircle2 className="h-4 w-4 mr-1" /> APPROVE</>}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={() => rejectMutation.mutate({ id: voidNotification.id, reason: rejectReason[voidNotification.id] || "" })}
              disabled={rejectMutation.isPending}
              data-testid={`button-reject-void-${voidNotification.id}`}
            >
              {rejectMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><XCircle className="h-4 w-4 mr-1" /> REJECT</>}
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            🕐 Ticket History
          </h1>
          <p className="text-sm text-muted-foreground" data-testid="text-role-scope">
            Showing: {staffFilter === "me" ? "your orders" : "all staff"} | {dateFilter === "today" ? "today" : dateFilter === "yesterday" ? "yesterday" : dateFilter === "week" ? "this week" : dateFilter === "month" ? "this month" : "all time"}
          </p>
        </div>
        {isManagerOrOwner && pendingVoidCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="border-amber-300 text-amber-700 hover:bg-amber-50"
            onClick={() => { setStatusFilter("void_requests"); setPage(1); }}
          >
            <AlertTriangle className="h-4 w-4 mr-1.5" />
            {pendingVoidCount} Pending Void Request{pendingVoidCount > 1 ? "s" : ""}
          </Button>
        )}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by order #, table, customer, amount..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            data-testid="input-ticket-search"
          />
        </div>
        <Select value={dateFilter} onValueChange={v => { setDateFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36" data-testid="select-date-filter">
            <SelectValue placeholder="Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="void">Void</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="refire">With Refire</SelectItem>
            {isManagerOrOwner && <SelectItem value="void_requests">Void Requests</SelectItem>}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36" data-testid="select-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="dine_in">Dine-In</SelectItem>
            <SelectItem value="takeaway">Takeaway</SelectItem>
            <SelectItem value="delivery">Delivery</SelectItem>
          </SelectContent>
        </Select>
        <Select value={staffFilter} onValueChange={v => { setStaffFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32" data-testid="select-staff-filter">
            <SelectValue placeholder="Staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            <SelectItem value="me">My Orders</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quick filter chips */}
      <div className="flex flex-wrap gap-2">
        {([
          { id: "today", label: "Today", testId: "chip-filter-today" },
          { id: "yesterday", label: "Yesterday", testId: "chip-filter-yesterday" },
          { id: "week", label: "This Week", testId: "chip-filter-week" },
          { id: "refire", label: "With Refire 🔥", testId: "chip-filter-refire" },
          { id: "high_value", label: "High Value 💰", testId: "chip-filter-high-value" },
        ] as const).map(chip => (
          <button
            key={chip.id}
            data-testid={chip.testId}
            onClick={() => handleChipFilter(chip.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              isChipActive(chip.id)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Results table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Clock className="h-10 w-10" />
              <p className="text-base font-medium">No tickets found</p>
              <p className="text-sm">Try adjusting your filters or search terms</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table data-testid="table-ticket-history">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">#</TableHead>
                      <TableHead>Table / Type</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tickets.map(ticket => (
                      <TableRow
                        key={ticket.id}
                        data-testid={`row-ticket-${ticket.id}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedOrderId(ticket.id)}
                      >
                        <TableCell className="font-mono font-medium text-sm">
                          #{ticket.orderNumber || ticket.id.slice(-6).toUpperCase()}
                        </TableCell>
                        <TableCell>
                          {ticket.tableNumber
                            ? `Table ${ticket.tableNumber}`
                            : ticket.orderType
                              ? ticket.orderType.replace(/_/g, "-")
                              : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {ticket.createdAt ? format(new Date(ticket.createdAt), "h:mm a") : "—"}
                        </TableCell>
                        <TableCell>{ticket.itemCount ?? "—"}</TableCell>
                        <TableCell className="font-medium" data-testid={`text-total-${ticket.id}`}>
                          {fmt(ticket.totalAmount)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge ticket={ticket} />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            data-testid={`button-view-${ticket.id}`}
                            onClick={e => { e.stopPropagation(); setSelectedOrderId(ticket.id); }}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                <span>
                  {total > 0 ? `Showing ${startNum}–${endNum} of ${total} tickets` : "No tickets"}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    data-testid="pagination-prev"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span>Page {page} of {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    data-testid="pagination-next"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <TicketDetailDrawer
        open={!!selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        orderId={selectedOrderId}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: [`/api/tickets/history?${buildQueryString()}`] })}
      />
    </div>
  );
}
