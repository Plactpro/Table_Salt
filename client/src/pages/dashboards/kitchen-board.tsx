import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ChefHat, RefreshCw, Users, Clock, AlertTriangle, CheckCircle2,
  LayoutGrid, ArrowRightLeft, UserCheck, Zap, Circle, Timer,
  TrendingUp, BarChart3, X,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface Assignment {
  id: string;
  menuItemName?: string;
  tableNumber?: number;
  counterName?: string;
  counterId?: string;
  chefId?: string;
  chefName?: string;
  status: string;
  assignmentType?: string;
  createdAt: string;
  assignedAt?: string;
  startedAt?: string;
  estimatedTimeMin?: number;
}

interface ChefAvailability {
  chefId: string;
  chefName?: string;
  counterId?: string;
  counterName?: string;
  status: string;
  activeTickets: number;
  shiftDate: string;
}

interface Counter {
  id: string;
  name: string;
  label?: string;
  station?: string;
  maxChefs?: number;
  isActive: boolean;
}

interface BoardData {
  byCounter: Record<string, { counter: Counter | null; assignments: Assignment[]; chefs: ChefAvailability[] }>;
  unassigned: Assignment[];
  totalLive: number;
  avgWaitMin: number;
}

const STATUS_CONFIG = {
  unassigned: { label: "Unassigned", color: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500", icon: AlertTriangle },
  assigned: { label: "Assigned", color: "bg-yellow-100 text-yellow-700 border-yellow-200", dot: "bg-yellow-500", icon: UserCheck },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500", icon: Timer },
  completed: { label: "Done", color: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500", icon: CheckCircle2 },
};

const CHEF_STATUS_COLOR: Record<string, string> = {
  available: "bg-green-500",
  on_break: "bg-yellow-500",
  busy: "bg-blue-500",
  offline: "bg-gray-400",
};

const ASSIGNMENT_TYPE_LABEL: Record<string, string> = {
  AUTO_ROSTER: "Roster",
  AUTO_WORKLOAD: "Workload",
  SELF_ASSIGNED: "Self",
  MANAGER_ASSIGNED: "Manager",
  REASSIGNED: "Reassigned",
  UNASSIGNED: "—",
};

function TicketCard({
  assignment,
  chefs,
  onAction,
}: {
  assignment: Assignment;
  chefs: ChefAvailability[];
  onAction: (action: string, a: Assignment) => void;
}) {
  const sc = STATUS_CONFIG[assignment.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.unassigned;
  const Icon = sc.icon;
  const waitMins = assignment.createdAt
    ? Math.floor((Date.now() - new Date(assignment.createdAt).getTime()) / 60000)
    : 0;

  return (
    <div
      className={`rounded-lg border p-3 ${sc.color} space-y-2 relative`}
      data-testid={`ticket-${assignment.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{assignment.menuItemName ?? "Ticket"}</div>
          {assignment.tableNumber && (
            <div className="text-xs opacity-75">Table {assignment.tableNumber}</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className={`h-2 w-2 rounded-full ${sc.dot}`} />
          <span className="text-xs font-medium">{sc.label}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 opacity-75">
          <Clock className="h-3 w-3" />
          {waitMins}m ago
        </div>
        {assignment.assignmentType && assignment.assignmentType !== "UNASSIGNED" && (
          <Badge variant="outline" className="text-[10px] py-0">
            {ASSIGNMENT_TYPE_LABEL[assignment.assignmentType] ?? assignment.assignmentType}
          </Badge>
        )}
      </div>

      {assignment.chefName && (
        <div className="flex items-center gap-1 text-xs">
          <ChefHat className="h-3 w-3" />
          <span>{assignment.chefName}</span>
        </div>
      )}

      <div className="flex gap-1 flex-wrap">
        {assignment.status === "unassigned" && (
          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => onAction("assign", assignment)} data-testid={`button-assign-${assignment.id}`}>
            Assign
          </Button>
        )}
        {assignment.status === "assigned" && (
          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => onAction("reassign", assignment)} data-testid={`button-reassign-${assignment.id}`}>
            <ArrowRightLeft className="h-3 w-3 mr-1" />Reassign
          </Button>
        )}
        {(assignment.status === "assigned" || assignment.status === "in_progress") && (
          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => onAction("complete", assignment)} data-testid={`button-complete-${assignment.id}`}>
            <CheckCircle2 className="h-3 w-3 mr-1" />Done
          </Button>
        )}
      </div>
    </div>
  );
}

function ChefPill({ chef }: { chef: ChefAvailability }) {
  const dot = CHEF_STATUS_COLOR[chef.status] ?? "bg-gray-400";
  return (
    <div className="flex items-center gap-1.5 bg-white/60 rounded-full px-2.5 py-1 text-xs border" data-testid={`chef-pill-${chef.chefId}`}>
      <div className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="font-medium">{chef.chefName ?? chef.chefId}</span>
      {chef.activeTickets > 0 && <span className="text-muted-foreground">({chef.activeTickets})</span>}
    </div>
  );
}

export default function KitchenBoardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: outlets = [] } = useQuery<any[]>({ queryKey: ["/api/outlets"] });
  const [outletId, setOutletId] = useState<string>("");
  const selectedOutletId = outletId || outlets[0]?.id;

  const [actionDialog, setActionDialog] = useState<{ type: string; assignment: Assignment } | null>(null);
  const [assignChefId, setAssignChefId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [view, setView] = useState<"board" | "analytics">("board");

  const { data: board, isLoading, refetch } = useQuery<BoardData>({
    queryKey: ["/api/assignments/board", selectedOutletId],
    queryFn: () => apiRequest("GET", `/api/assignments/board?outletId=${selectedOutletId}`).then(r => r.json()),
    enabled: !!selectedOutletId,
    refetchInterval: 30000,
  });

  const { data: analytics } = useQuery<any>({
    queryKey: ["/api/assignments/analytics"],
    queryFn: () => apiRequest("GET", "/api/assignments/analytics?range=7d").then(r => r.json()),
    enabled: view === "analytics",
  });

  const { data: liveChefs = [] } = useQuery<ChefAvailability[]>({
    queryKey: ["/api/chef-availability/live", selectedOutletId],
    queryFn: () => apiRequest("GET", `/api/chef-availability/live?outletId=${selectedOutletId}`).then(r => r.json()),
    enabled: !!selectedOutletId,
    refetchInterval: 15000,
  });

  useRealtimeEvent("chef-assignment:updated", () => {
    qc.invalidateQueries({ queryKey: ["/api/assignments/board"] });
    qc.invalidateQueries({ queryKey: ["/api/chef-availability/live"] });
  });
  useRealtimeEvent("chef-availability:changed", () => {
    qc.invalidateQueries({ queryKey: ["/api/chef-availability/live"] });
  });
  useRealtimeEvent("chef-assignment:rebalanced", () => {
    qc.invalidateQueries({ queryKey: ["/api/assignments/board"] });
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/assignments/${id}/complete`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assignments/board"] }); toast({ title: "Ticket marked done" }); },
  });

  const managerAssignMut = useMutation({
    mutationFn: ({ id, chefId, chefName }: { id: string; chefId: string; chefName?: string }) =>
      apiRequest("PUT", `/api/assignments/${id}/manager-assign`, { chefId, chefName }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assignments/board"] }); setActionDialog(null); toast({ title: "Chef assigned" }); },
  });

  const reassignMut = useMutation({
    mutationFn: ({ id, reason, chefId, chefName }: { id: string; reason: string; chefId?: string; chefName?: string }) =>
      apiRequest("PUT", `/api/assignments/${id}/reassign`, { reason, chefId, chefName }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assignments/board"] }); setActionDialog(null); toast({ title: "Ticket reassigned" }); },
  });

  const rebalanceMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/assignments/rebalance", { outletId: selectedOutletId }).then(r => r.json()),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["/api/assignments/board"] }); toast({ title: `Rebalanced — ${d?.moved ?? 0} tickets moved` }); },
  });

  function handleAction(action: string, assignment: Assignment) {
    if (action === "complete") {
      completeMut.mutate(assignment.id);
    } else {
      setAssignChefId("");
      setReassignReason("");
      setActionDialog({ type: action, assignment });
    }
  }

  function submitAction() {
    if (!actionDialog) return;
    const chef = liveChefs.find(c => c.chefId === assignChefId);
    if (actionDialog.type === "assign") {
      if (!assignChefId) return;
      managerAssignMut.mutate({ id: actionDialog.assignment.id, chefId: assignChefId, chefName: chef?.chefName });
    } else {
      if (!reassignReason) return;
      const newChef = liveChefs.find(c => c.chefId === assignChefId);
      reassignMut.mutate({ id: actionDialog.assignment.id, reason: reassignReason, chefId: assignChefId || undefined, chefName: newChef?.chefName });
    }
  }

  const allCounters = board ? Object.values(board.byCounter) : [];
  const unassignedCount = board?.unassigned?.length ?? 0;
  const totalLive = board?.totalLive ?? 0;
  const onlineChefs = liveChefs.filter(c => c.status !== "offline").length;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <LayoutGrid className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="heading-kitchen-board">Kitchen Board</h1>
            <p className="text-xs text-muted-foreground">Live chef assignment view</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {outlets.length > 1 && (
            <Select value={selectedOutletId} onValueChange={setOutletId}>
              <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-outlet-board"><SelectValue /></SelectTrigger>
              <SelectContent>{outlets.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => setView(v => v === "board" ? "analytics" : "board")} data-testid="button-toggle-view">
            {view === "board" ? <><BarChart3 className="h-4 w-4 mr-1" />Analytics</> : <><LayoutGrid className="h-4 w-4 mr-1" />Board</>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => rebalanceMut.mutate()} disabled={rebalanceMut.isPending} data-testid="button-rebalance">
            <Zap className="h-4 w-4 mr-1" />Rebalance
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()} data-testid="button-refresh-board">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Live Tickets", value: totalLive, icon: Timer, color: "text-blue-600" },
          { label: "Unassigned", value: unassignedCount, icon: AlertTriangle, color: unassignedCount > 0 ? "text-red-600" : "text-muted-foreground" },
          { label: "Chefs Online", value: onlineChefs, icon: Users, color: "text-green-600" },
          { label: "Avg Wait", value: `${board?.avgWaitMin ?? 0}m`, icon: Clock, color: "text-primary" },
        ].map(stat => (
          <Card key={stat.label} className="p-4" data-testid={`stat-${stat.label.toLowerCase().replace(" ", "-")}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              </div>
              <stat.icon className={`h-6 w-6 ${stat.color} opacity-60`} />
            </div>
          </Card>
        ))}
      </div>

      {liveChefs.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground font-medium">Chefs on shift:</span>
          {liveChefs.map(chef => <ChefPill key={chef.chefId} chef={chef} />)}
        </div>
      )}

      {view === "analytics" ? (
        <div className="space-y-4">
          {analytics ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Auto-Assign Rate</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-primary">{analytics.efficiency?.autoAssignRate ?? 0}%</div>
                    <div className="text-xs text-muted-foreground mt-1">Of all assigned tickets</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Avg Order→Assign</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600">
                      {analytics.efficiency?.avgOrderToAssignSec != null ? `${Math.round(analytics.efficiency.avgOrderToAssignSec / 60)}m` : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Time to assign ticket</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Avg Assign→Start</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-orange-600">
                      {analytics.efficiency?.avgAssignToStartSec != null ? `${Math.round(analytics.efficiency.avgAssignToStartSec / 60)}m` : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Time to start cooking</div>
                  </CardContent>
                </Card>
              </div>
              {analytics.perChef?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Per Chef</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analytics.perChef.map((c: any) => (
                        <div key={c.chefId} className="flex items-center justify-between py-1 border-b last:border-0" data-testid={`analytics-chef-${c.chefId}`}>
                          <div className="text-sm font-medium">{c.chefName ?? c.chefId}</div>
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span>{c.total} tickets</span>
                            <span>{c.completed} done</span>
                            <span>{c.avgTimeMin ? `${c.avgTimeMin}m avg` : "—"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <TrendingUp className="h-8 w-8 opacity-40" />
            </div>
          )}
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-60 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {unassignedCount > 0 && (
            <Card className="border-red-200 bg-red-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Unassigned Tickets ({unassignedCount})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {board!.unassigned.map(a => (
                    <TicketCard key={a.id} assignment={a} chefs={liveChefs} onAction={handleAction} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {allCounters.map(({ counter, assignments, chefs }) => {
              const name = counter?.name ?? "Unknown Counter";
              const active = assignments.filter(a => a.status !== "completed");
              return (
                <Card key={counter?.id ?? name} data-testid={`counter-column-${counter?.id}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <ChefHat className="h-4 w-4 text-primary" />
                        {name}
                      </span>
                      <Badge variant="outline">{active.length} active</Badge>
                    </CardTitle>
                    {chefs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {chefs.map(c => <ChefPill key={c.chefId} chef={c} />)}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[420px] overflow-y-auto">
                    {active.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-6 w-6 mx-auto mb-2 opacity-40" />
                        All clear
                      </div>
                    ) : (
                      active.map(a => (
                        <TicketCard key={a.id} assignment={a} chefs={liveChefs} onAction={handleAction} />
                      ))
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!actionDialog} onOpenChange={v => !v && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "assign" ? "Assign Chef" : "Reassign Ticket"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-2">
                Ticket: <strong>{actionDialog?.assignment.menuItemName}</strong>
                {actionDialog?.assignment.tableNumber && ` — Table ${actionDialog.assignment.tableNumber}`}
              </div>
            </div>
            <div>
              <Label>Select Chef</Label>
              <Select value={assignChefId} onValueChange={setAssignChefId}>
                <SelectTrigger data-testid="select-assign-chef">
                  <SelectValue placeholder="Choose a chef" />
                </SelectTrigger>
                <SelectContent>
                  {liveChefs.filter(c => c.status !== "offline").map(c => (
                    <SelectItem key={c.chefId} value={c.chefId}>
                      {c.chefName ?? c.chefId} — {c.activeTickets} active
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {actionDialog?.type === "reassign" && (
              <div>
                <Label>Reason *</Label>
                <Input
                  value={reassignReason}
                  onChange={e => setReassignReason(e.target.value)}
                  placeholder="Why is this being reassigned?"
                  data-testid="input-reassign-reason"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              onClick={submitAction}
              disabled={
                (actionDialog?.type === "assign" && !assignChefId) ||
                (actionDialog?.type === "reassign" && !reassignReason) ||
                managerAssignMut.isPending || reassignMut.isPending
              }
              data-testid="button-confirm-action"
            >
              {actionDialog?.type === "assign" ? "Assign" : "Reassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
