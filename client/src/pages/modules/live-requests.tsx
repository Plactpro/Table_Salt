import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { useRequestSounds } from "@/hooks/use-request-sounds";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Check, Clock, AlertTriangle, User, Filter,
  Volume2, VolumeX, RefreshCw, ChevronDown, X,
  Loader2, Phone, Receipt, Droplets, Sparkles,
  Utensils, MessageSquare, Star, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface TableRequest {
  id: string;
  tenantId: string;
  outletId: string | null;
  tableId: string;
  tableNumber: number | null;
  tableZone: string | null;
  requestType: string;
  priority: string;
  status: string;
  guestNote: string | null;
  details: Record<string, unknown> | null;
  assignedTo: string | null;
  assignedToName: string | null;
  staffNote: string | null;
  escalatedAt: string | null;
  acknowledgedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  role: string;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  call_server: { label: "Call Waiter", icon: Bell, color: "text-blue-600" },
  request_bill: { label: "Request Bill", icon: Receipt, color: "text-purple-600" },
  water_refill: { label: "Water Refill", icon: Droplets, color: "text-cyan-600" },
  cleaning: { label: "Cleaning", icon: Sparkles, color: "text-green-600" },
  order_food: { label: "Order Food", icon: Utensils, color: "text-orange-600" },
  feedback: { label: "Feedback", icon: Star, color: "text-yellow-600" },
  other: { label: "Other", icon: MessageSquare, color: "text-gray-600" },
};

const PRIORITY_CONFIG: Record<string, { label: string; bg: string; border: string; dot: string }> = {
  high: { label: "High", bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-300 dark:border-red-700", dot: "bg-red-500" },
  medium: { label: "Medium", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-300 dark:border-amber-700", dot: "bg-amber-500" },
  low: { label: "Low", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-300 dark:border-blue-700", dot: "bg-blue-400" },
};

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  pending: { label: "Pending", badge: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  acknowledged: { label: "Acknowledged", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  completed: { label: "Completed", badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  cancelled: { label: "Cancelled", badge: "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500" },
};

function useElapsedTimer() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

function elapsed(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function isOverdue(req: TableRequest) {
  if (req.status !== "pending" && req.status !== "acknowledged") return false;
  const diff = Date.now() - new Date(req.createdAt).getTime();
  const thresholds: Record<string, number> = { high: 2, medium: 5, low: 10 };
  return diff > (thresholds[req.priority] ?? 5) * 60000;
}

function RequestCard({ req, onAcknowledge, onComplete, onAssign, isManager }: {
  req: TableRequest;
  onAcknowledge: (id: string) => void;
  onComplete: (id: string) => void;
  onAssign: (req: TableRequest) => void;
  isManager: boolean;
}) {
  useElapsedTimer();
  const overdue = isOverdue(req);
  const typeConf = TYPE_CONFIG[req.requestType] ?? TYPE_CONFIG.other;
  const Icon = typeConf.icon;
  const priorityConf = PRIORITY_CONFIG[req.priority] ?? PRIORITY_CONFIG.medium;
  const statusConf = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.pending;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`rounded-xl border-2 p-4 space-y-3 ${priorityConf.bg} ${priorityConf.border} ${overdue ? "animate-pulse-slow" : ""}`}
      data-testid={`request-card-${req.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white dark:bg-gray-800 shadow-sm ${typeConf.color}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" data-testid={`request-type-${req.id}`}>{typeConf.label}</p>
            <p className="text-xs text-muted-foreground">
              Table {req.tableNumber ?? "?"}{req.tableZone ? ` · ${req.tableZone}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {overdue && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
              <AlertTriangle className="h-3 w-3" />Overdue
            </span>
          )}
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusConf.badge}`}>
            {statusConf.label}
          </span>
        </div>
      </div>

      {req.guestNote && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-current/20 pl-2">"{req.guestNote}"</p>
      )}

      {req.assignedToName && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <User className="h-3 w-3" />Assigned to <strong>{req.assignedToName}</strong>
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />{elapsed(req.createdAt)} ago
        </span>
        <div className="flex gap-2 flex-wrap justify-end">
          {isManager && req.status !== "completed" && req.status !== "cancelled" && (
            <Button size="sm" variant="outline" className="h-7 text-xs px-2.5"
              onClick={() => onAssign(req)} data-testid={`btn-assign-${req.id}`}>
              <User className="h-3 w-3 mr-1" />Assign
            </Button>
          )}
          {req.status === "pending" && (
            <Button size="sm" className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700"
              onClick={() => onAcknowledge(req.id)} data-testid={`btn-ack-${req.id}`}>
              <Check className="h-3 w-3 mr-1" />Acknowledge
            </Button>
          )}
          {req.status === "acknowledged" && (
            <Button size="sm" className="h-7 text-xs px-3 bg-green-600 hover:bg-green-700"
              onClick={() => onComplete(req.id)} data-testid={`btn-complete-${req.id}`}>
              <Check className="h-3 w-3 mr-1" />Complete
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function LiveRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { muted, toggleMute, playAlert } = useRequestSounds();
  const isManager = ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor"].includes(user?.role ?? "");

  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTable, setFilterTable] = useState<string>("all");
  const [filterStaff, setFilterStaff] = useState<string>("all");
  const [assignModalReq, setAssignModalReq] = useState<TableRequest | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");

  const { data: requests = [], isLoading } = useQuery<TableRequest[]>({
    queryKey: ["/api/table-requests/live"],
    refetchInterval: 30000,
  });

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isManager,
  });

  const ackMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/table-requests/${id}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/table-requests/live"] });
      toast({ title: "Request acknowledged" });
    },
    onError: () => toast({ title: "Failed to acknowledge", variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/table-requests/${id}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/table-requests/live"] });
      toast({ title: "Request completed" });
    },
    onError: () => toast({ title: "Failed to complete", variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, staffId, staffName }: { id: string; staffId: string; staffName: string }) =>
      apiRequest("PUT", `/api/table-requests/${id}/assign`, { assignedTo: staffId, assignedToName: staffName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/table-requests/live"] });
      setAssignModalReq(null);
      toast({ title: "Request assigned" });
    },
    onError: () => toast({ title: "Failed to assign", variant: "destructive" }),
  });

  const knownIds = useRef<Set<string>>(new Set());

  useRealtimeEvent("table-request:new", useCallback((payload: unknown) => {
    const p = payload as { request?: TableRequest } | null;
    if (!p?.request) return;
    queryClient.setQueryData(["/api/table-requests/live"], (old: TableRequest[] | undefined) => {
      const list = old ?? [];
      if (list.find(r => r.id === p.request!.id)) return list;
      return [p.request!, ...list];
    });
    if (!knownIds.current.has(p.request.id)) {
      knownIds.current.add(p.request.id);
      playAlert(p.request.priority as "high" | "medium" | "low");
    }
  }, [queryClient, playAlert]));

  useRealtimeEvent("table-request:updated", useCallback((payload: unknown) => {
    const p = payload as { request?: TableRequest } | null;
    if (!p?.request) return;
    queryClient.setQueryData(["/api/table-requests/live"], (old: TableRequest[] | undefined) => {
      if (!old) return old;
      return old.map(r => r.id === p.request!.id ? { ...r, ...p.request } : r);
    });
  }, [queryClient]));

  useRealtimeEvent("table-request:escalated", useCallback((payload: unknown) => {
    const p = payload as { request?: TableRequest } | null;
    if (!p?.request) return;
    queryClient.setQueryData(["/api/table-requests/live"], (old: TableRequest[] | undefined) => {
      if (!old) return old;
      return old.map(r => r.id === p.request!.id ? { ...r, ...p.request } : r);
    });
    playAlert("high");
  }, [queryClient, playAlert]));

  const tableNumbers = Array.from(new Set(requests.map(r => r.tableNumber).filter(Boolean) as number[])).sort((a, b) => a - b);
  const staffList = allUsers.filter(u => ["owner", "manager", "supervisor", "waiter", "cashier"].includes(u.role));

  const filtered = requests.filter(r => {
    if (filterStatus === "active" && (r.status === "completed" || r.status === "cancelled")) return false;
    if (filterStatus !== "active" && filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterType !== "all" && r.requestType !== filterType) return false;
    if (filterTable !== "all" && String(r.tableNumber) !== filterTable) return false;
    if (filterStaff !== "all" && r.assignedTo !== filterStaff) return false;
    return true;
  }).sort((a, b) => {
    const pOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const pDiff = (pOrder[a.priority] ?? 1) - (pOrder[b.priority] ?? 1);
    if (pDiff !== 0) return pDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const pending = requests.filter(r => r.status === "pending").length;
  const acknowledged = requests.filter(r => r.status === "acknowledged").length;
  const overdue = requests.filter(r => isOverdue(r)).length;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const avgResponseTodayMs = (() => {
    const completed = requests.filter(r =>
      r.status === "completed" && r.acknowledgedAt && r.createdAt &&
      new Date(r.createdAt) >= todayStart
    );
    if (!completed.length) return null;
    const avg = completed.reduce((s, r) => s + (new Date(r.acknowledgedAt!).getTime() - new Date(r.createdAt).getTime()), 0) / completed.length;
    return Math.round(avg / 60000);
  })();

  const mostRequestedType = (() => {
    const counts: Record<string, number> = {};
    requests.forEach(r => { counts[r.requestType] = (counts[r.requestType] ?? 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? (TYPE_CONFIG[top[0]]?.label ?? top[0]) : null;
  })();

  return (
    <div className="space-y-6 p-1" data-testid="live-requests-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />Live Requests
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time customer service requests</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={toggleMute} data-testid="btn-toggle-mute"
            className={muted ? "text-muted-foreground" : ""}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">{muted ? "Unmute" : "Mute"}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/table-requests/live"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isManager && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card data-testid="stat-pending">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-amber-600">{pending}</p>
            </CardContent>
          </Card>
          <Card data-testid="stat-acknowledged">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">In Progress</p>
              <p className="text-2xl font-bold text-blue-600">{acknowledged}</p>
            </CardContent>
          </Card>
          <Card data-testid="stat-overdue">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-2xl font-bold text-red-600">{overdue}</p>
            </CardContent>
          </Card>
          <Card data-testid="stat-avg-response">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Avg Response Today</p>
              <p className="text-2xl font-bold text-green-600">
                {avgResponseTodayMs !== null ? `${avgResponseTodayMs}m` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card data-testid="stat-most-requested" className="col-span-2 sm:col-span-4">
            <CardContent className="pt-3 pb-2 flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-500 shrink-0" />
              <span className="text-xs text-muted-foreground">Most Requested Type:</span>
              <span className="text-sm font-semibold text-orange-600">{mostRequestedType ?? "—"}</span>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-xs" data-testid="filter-status">
            <Filter className="h-3 w-3 mr-1" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36 h-8 text-xs" data-testid="filter-type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isManager && (
          <Select value={filterTable} onValueChange={setFilterTable}>
            <SelectTrigger className="w-32 h-8 text-xs" data-testid="filter-table">
              <SelectValue placeholder="All tables" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tables</SelectItem>
              {tableNumbers.map(n => (
                <SelectItem key={n} value={String(n)}>Table {n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {isManager && staffList.length > 0 && (
          <Select value={filterStaff} onValueChange={setFilterStaff}>
            <SelectTrigger className="w-36 h-8 text-xs" data-testid="filter-staff">
              <User className="h-3 w-3 mr-1" /><SelectValue placeholder="All Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {staffList.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} request{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3"
          data-testid="empty-requests">
          <Bell className="h-10 w-10 opacity-30" />
          <p className="text-sm">No requests {filterStatus === "active" ? "at the moment" : "match filters"}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map(req => (
              <RequestCard
                key={req.id}
                req={req}
                onAcknowledge={id => ackMutation.mutate(id)}
                onComplete={id => completeMutation.mutate(id)}
                onAssign={setAssignModalReq}
                isManager={isManager}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <Dialog open={!!assignModalReq} onOpenChange={open => !open && setAssignModalReq(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Table {assignModalReq?.tableNumber} · {TYPE_CONFIG[assignModalReq?.requestType ?? ""] ? TYPE_CONFIG[assignModalReq!.requestType].label : assignModalReq?.requestType}
            </p>
            <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
              <SelectTrigger data-testid="select-staff">
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {staffList.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignModalReq(null)}>Cancel</Button>
            <Button
              disabled={!selectedStaffId || assignMutation.isPending}
              onClick={() => {
                if (!assignModalReq || !selectedStaffId) return;
                const staff = staffList.find(s => s.id === selectedStaffId);
                assignMutation.mutate({
                  id: assignModalReq.id,
                  staffId: selectedStaffId,
                  staffName: staff?.name ?? selectedStaffId,
                });
              }}
              data-testid="btn-confirm-assign"
            >
              {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
