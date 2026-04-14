import { PageTitle } from "@/lib/accessibility";
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { useRequestSounds } from "@/hooks/use-request-sounds";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  Bell, Check, Clock, AlertTriangle, User, Filter,
  Volume2, VolumeX, RefreshCw, ChevronDown, ChevronUp, X,
  Loader2, Phone, Receipt, Droplets, Sparkles,
  Utensils, MessageSquare, Star, Zap, QrCode, HelpCircle,
  ScanLine, CheckCircle2, Info,
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
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { ResourceAvailabilityWidget } from "@/components/resources/ResourceAvailabilityWidget";
import { useTranslation } from "react-i18next";

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
  acknowledged: { label: "In Progress", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  completed: { label: "Completed", badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  cancelled: { label: "Cancelled", badge: "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500" },
};

const SLA_MINUTES: Record<string, number> = { high: 2, medium: 5, low: 10 };

function useElapsedTimer() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

function elapsedMs(dateStr: string) {
  return Date.now() - new Date(dateStr).getTime();
}

function elapsed(dateStr: string) {
  const diff = elapsedMs(dateStr);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function elapsedColor(req: TableRequest): string {
  if (req.status === "completed" || req.status === "cancelled") return "text-muted-foreground";
  const mins = elapsedMs(req.createdAt) / 60000;
  const sla = SLA_MINUTES[req.priority] ?? 5;
  if (mins < sla * 0.5) return "text-green-600 dark:text-green-400";
  if (mins < sla) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function isOverdue(req: TableRequest) {
  if (req.status !== "pending" && req.status !== "acknowledged") return false;
  const diff = elapsedMs(req.createdAt);
  return diff > (SLA_MINUTES[req.priority] ?? 5) * 60000;
}

function isExpired(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() > 2 * 60 * 60 * 1000;
}

function StatusStepper({ status }: { status: string }) {
  const steps = [
    { key: "pending", label: "Pending" },
    { key: "acknowledged", label: "In Progress" },
    { key: "completed", label: "Done" },
  ];
  const activeIdx = status === "completed" ? 2 : status === "acknowledged" ? 1 : 0;

  return (
    <div className="flex items-center gap-0 pt-2" data-testid="status-stepper">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center flex-1">
          <div className="flex flex-col items-center">
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
              i < activeIdx
                ? "bg-green-500 border-green-500"
                : i === activeIdx
                ? "bg-primary border-primary"
                : "bg-background border-muted-foreground/30"
            }`}>
              {i < activeIdx && <Check className="h-2.5 w-2.5 text-white" />}
              {i === activeIdx && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
            <span className={`text-[9px] mt-0.5 font-medium leading-tight ${
              i === activeIdx ? "text-primary" : i < activeIdx ? "text-green-600 dark:text-green-400" : "text-muted-foreground/50"
            }`}>{step.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-0.5 mt-[-10px] rounded-full ${
              i < activeIdx ? "bg-green-500" : "bg-muted-foreground/20"
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

function HowItWorksPanel({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4"
      data-testid="how-it-works-panel"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-primary">How this works</h3>
        </div>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          onClick={onDismiss} data-testid="btn-dismiss-howto">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="flex items-start gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 shrink-0">
            <QrCode className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-semibold">1. Guest Scans QR</p>
            <p className="text-xs text-muted-foreground leading-snug">Guest scans the QR code at their table to open the request menu</p>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 shrink-0">
            <Bell className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-semibold">2. Request Appears Here</p>
            <p className="text-xs text-muted-foreground leading-snug">Their request shows up instantly on this page with an alert sound</p>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-semibold">3. Staff Responds</p>
            <p className="text-xs text-muted-foreground leading-snug">Tap Acknowledge to confirm you're on it, then Complete when done</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border/50 pt-2.5">
        <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span>High-priority requests (red) require response within 2 minutes. Medium = 5 min. Low = 10 min.</span>
      </div>
    </motion.div>
  );
}

function EnhancedEmptyState({ hasFilter }: { hasFilter: boolean }) {
  if (hasFilter) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3" data-testid="empty-requests">
        <Filter className="h-10 w-10 opacity-30" />
        <p className="text-sm">No requests match your current filters</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-6" data-testid="empty-requests">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-blue-600">
            <QrCode className="h-6 w-6" />
          </span>
          <span className="text-xs text-muted-foreground">QR Scan</span>
        </div>
        <div className="flex items-center gap-1 pb-5">
          <div className="w-4 h-0.5 bg-muted-foreground/30 rounded-full" />
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
          <div className="w-4 h-0.5 bg-muted-foreground/30 rounded-full" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 text-amber-600">
            <Bell className="h-6 w-6" />
          </span>
          <span className="text-xs text-muted-foreground">Alert</span>
        </div>
        <div className="flex items-center gap-1 pb-5">
          <div className="w-4 h-0.5 bg-muted-foreground/30 rounded-full" />
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
          <div className="w-4 h-0.5 bg-muted-foreground/30 rounded-full" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-green-100 dark:bg-green-900/30 text-green-600">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <span className="text-xs text-muted-foreground">Resolved</span>
        </div>
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-foreground">Waiting for guest requests from your tables</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Guests scan the QR code at their table to call for help, request the bill, water, or more.
        </p>
      </div>

      <Link href="/tables">
        <Button size="sm" variant="outline" className="text-xs gap-1.5" data-testid="link-view-qr-codes">
          <QrCode className="h-3.5 w-3.5" />
          View Table QR Codes
        </Button>
      </Link>
    </div>
  );
}

function SlaGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="col-span-2 sm:col-span-4 border-t border-border/50 pt-2">
      <button
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen(v => !v)}
        data-testid="btn-sla-guide-toggle"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span>Response time targets</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-3 pt-2" data-testid="sla-guide">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-xs"><span className="font-medium">High</span> — respond within 2 min</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-xs"><span className="font-medium">Medium</span> — respond within 5 min</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
                <span className="text-xs"><span className="font-medium">Low</span> — respond within 10 min</span>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="text-green-600 font-medium">Green</span> = on time ·
                <span className="text-amber-600 font-medium ml-1">Amber</span> = approaching ·
                <span className="text-red-600 font-medium ml-1">Red</span> = overdue
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
  const timeColor = elapsedColor(req);

  const borderClass = overdue && req.priority === "high"
    ? "border-l-4 border-l-red-500 animate-pulse-border"
    : "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`rounded-xl border-2 p-4 space-y-3 ${priorityConf.bg} ${priorityConf.border} ${borderClass}`}
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
              isExpired(req.createdAt)
                ? <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">Expired</span>
                : <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
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
        <span className={`text-xs flex items-center gap-1 font-medium ${timeColor}`} data-testid={`elapsed-${req.id}`}>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700"
                  onClick={() => onAcknowledge(req.id)} data-testid={`btn-ack-${req.id}`}>
                  <Check className="h-3 w-3 mr-1" />Acknowledge
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Tap to tell the guest help is coming</TooltipContent>
            </Tooltip>
          )}
          {req.status === "acknowledged" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" className="h-7 text-xs px-3 bg-green-600 hover:bg-green-700"
                  onClick={() => onComplete(req.id)} data-testid={`btn-complete-${req.id}`}>
                  <Check className="h-3 w-3 mr-1" />Complete
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Tap when the request is fully resolved</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <StatusStepper status={req.status} />
    </motion.div>
  );
}

const HOWTO_KEY = "live_requests_howto_dismissed";

export default function LiveRequestsPage() {
  const { t } = useTranslation("modules");
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

  const [howtoVisible, setHowtoVisible] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HOWTO_KEY) !== "1";
    } catch {
      return true;
    }
  });

  function dismissHowto() {
    try { localStorage.setItem(HOWTO_KEY, "1"); } catch {}
    setHowtoVisible(false);
  }

  function showHowto() {
    setHowtoVisible(true);
  }

  const { data: requests = [], isLoading } = useQuery<TableRequest[]>({
    queryKey: ["/api/table-requests/live"],
    refetchInterval: 30000,
  });

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isManager,
  });

  const { data: outlets = [] } = useQuery<any[]>({
    queryKey: ["/api/outlets"],
  });
  const firstOutletId = outlets[0]?.id as string | undefined;

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

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCompleted = requests.filter(r =>
    r.status === "completed" && r.completedAt && new Date(r.completedAt) >= todayStart
  ).length;

  const hasActiveFilter = filterStatus !== "active" || filterType !== "all" || filterTable !== "all" || filterStaff !== "all";

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
    <TooltipProvider delayDuration={400}>
      <div className="space-y-6 p-1" data-testid="live-requests-page">
        <PageTitle title={t("liveRequests")} />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6 text-primary" />Live Requests
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Real-time customer service requests</p>
          </div>
          <div className="flex items-center gap-2">
            {!howtoVisible && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={showHowto}
                    className="text-muted-foreground" data-testid="btn-show-howto">
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Show how this works</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={toggleMute} data-testid="btn-toggle-mute"
                  className={muted ? "text-muted-foreground" : ""}>
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  <span className="ml-1.5 hidden sm:inline">{muted ? "Unmute" : "Mute"}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Alert sounds play when new requests arrive. High-priority requests use a louder tone.</TooltipContent>
            </Tooltip>
            <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/table-requests/live"] })}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Link href="/tables">
              <Button size="sm" variant="outline" className="text-xs gap-1.5" data-testid="link-header-qr-codes">
                <QrCode className="h-3.5 w-3.5" /> Table QR Codes
              </Button>
            </Link>
          </div>
        </div>

        <AnimatePresence>
          {howtoVisible && <HowItWorksPanel onDismiss={dismissHowto} />}
        </AnimatePresence>

        {firstOutletId && (
          <ResourceAvailabilityWidget outletId={firstOutletId} compact />
        )}

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
            <div className="col-span-2 sm:col-span-4">
              <SlaGuide />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center text-muted-foreground cursor-help">
                <HelpCircle className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px]">
              <p className="font-medium mb-1">Filters</p>
              <p><strong>Status:</strong> Show only requests at that stage</p>
              <p><strong>Type:</strong> Filter by what the guest needs</p>
              <p><strong>Table:</strong> Show only a specific table's requests</p>
              <p><strong>Staff:</strong> Show requests assigned to one person</p>
            </TooltipContent>
          </Tooltip>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44 h-8 text-xs" data-testid="filter-status">
              <Filter className="h-3 w-3 mr-1" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active (Pending + In Progress)</SelectItem>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="acknowledged">In Progress</SelectItem>
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

          <span
            className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded-full font-medium shrink-0"
            data-testid="chip-today-completed"
          >
            Today's Completed: {todayCompleted}
          </span>

          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} request{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <EnhancedEmptyState hasFilter={hasActiveFilter} />
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
    </TooltipProvider>
  );
}
