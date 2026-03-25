import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Shield,
  Lock,
  Pencil,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Bell,
} from "lucide-react";

interface AccessSession {
  id: string;
  super_admin_name: string;
  impersonated_user_name: string;
  impersonated_user_role: string | null;
  access_mode: string;
  status: string;
  access_reason: string;
  support_ticket_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  ip_address: string | null;
  edit_unlocked: boolean;
  edit_unlock_reason: string | null;
  pages_visited: string[];
  changes_made: boolean;
}

interface AccessLogResponse {
  data: AccessSession[];
  total: number;
  limit: number;
  offset: number;
  monthlyStats: {
    total_sessions: number;
    sessions_with_changes: number;
  };
}

interface AccessPreferences {
  tenantId: string;
  showAccessLog: boolean;
  notifyOnAccess: boolean;
  notifyEmail: string | null;
  allowEditMode: boolean;
}

type DateRange = "month" | "3months" | "all";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateShort(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SessionCard({ session }: { session: AccessSession }) {
  const [open, setOpen] = useState(false);
  const isEdit = session.access_mode === "EDIT" || session.edit_unlocked;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border" data-testid={`card-access-session-${session.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">
                  {formatDateShort(session.started_at)}
                  {session.ended_at && (
                    <>
                      {" "}&mdash;{" "}
                      {new Date(session.ended_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </>
                  )}
                  {session.duration_minutes != null && (
                    <span className="text-slate-500 text-xs ml-1">({session.duration_minutes} min)</span>
                  )}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                <span className="font-medium">{session.super_admin_name}</span>
                <span className="text-slate-400"> · Table Salt Support</span>
              </p>
              <p className="text-sm text-slate-600">Reason: {session.access_reason}</p>
              {session.support_ticket_id && (
                <p className="text-sm text-slate-500">Ticket: {session.support_ticket_id}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-1">
                <span className="flex items-center gap-1 text-xs">
                  {isEdit ? (
                    <><Pencil className="h-3 w-3 text-orange-500" /><span className="text-orange-700">Edit Mode</span></>
                  ) : (
                    <><Lock className="h-3 w-3 text-emerald-600" /><span className="text-emerald-700">Read Only</span></>
                  )}
                </span>
                <span className="text-xs text-slate-500">
                  Changes: {session.changes_made ? <span className="text-orange-600 font-medium">Yes</span> : "None"}
                </span>
                {session.ip_address && (
                  <span className="text-xs text-slate-400">IP: {session.ip_address}</span>
                )}
              </div>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs shrink-0" data-testid={`button-expand-session-${session.id}`}>
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {open ? "Hide Details" : "View Details"}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardContent>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4 border-t">
            <div className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Started</p>
                  <p>{formatDate(session.started_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Ended</p>
                  <p>{session.ended_at ? formatDate(session.ended_at) : <span className="text-slate-400">—</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Status</p>
                  <Badge
                    variant="outline"
                    className={`text-xs capitalize ${
                      session.status === "ended" ? "text-slate-600" :
                      session.status === "expired" ? "text-orange-600 border-orange-200 bg-orange-50" :
                      "text-green-600 border-green-200 bg-green-50"
                    }`}
                  >
                    {session.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Accessed as</p>
                  <p>{session.impersonated_user_name} ({session.impersonated_user_role ?? "?"})</p>
                </div>
              </div>

              {session.edit_unlock_reason && (
                <div>
                  <p className="text-xs text-slate-400">Edit unlock reason</p>
                  <p className="text-sm text-orange-700">{session.edit_unlock_reason}</p>
                </div>
              )}

              {session.pages_visited && session.pages_visited.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Pages visited</p>
                  <div className="space-y-0.5">
                    {(session.pages_visited as string[]).map((p, i) => (
                      <p key={i} className="text-xs font-mono text-slate-600 bg-slate-50 px-2 py-0.5 rounded">
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function AccessLogPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [notifyEmail, setNotifyEmail] = useState("");

  const getDateFilter = () => {
    const now = new Date();
    if (dateRange === "month") {
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    }
    if (dateRange === "3months") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return d.toISOString().split("T")[0];
    }
    return "";
  };

  const startDate = getDateFilter();

  const { data: logData, isLoading: logLoading, error: logError } = useQuery<AccessLogResponse>({
    queryKey: ["/api/tenant/access-log", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (startDate) params.set("startDate", startDate);
      const r = await apiRequest("GET", `/api/tenant/access-log?${params}`);
      return r.json();
    },
    staleTime: 30000,
  });

  const { data: prefs, isLoading: prefsLoading } = useQuery<AccessPreferences>({
    queryKey: ["/api/tenant/access-preferences"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/tenant/access-preferences");
      return r.json();
    },
    staleTime: 60000,
  });

  const prefsMutation = useMutation({
    mutationFn: async (data: Partial<AccessPreferences>) => {
      const r = await apiRequest("PATCH", "/api/tenant/access-preferences", data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/access-preferences"] });
      toast({ title: "Preferences saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sessions = logData?.data ?? [];
  const monthlyStats = logData?.monthlyStats;

  return (
    <div className="space-y-6" data-testid="access-log-page">
      {/* Header */}
      <Card data-testid="card-access-log-header">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Shield className="h-6 w-6 text-slate-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Account Access Log</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                When Table Salt support accesses your account it is recorded here.
              </p>
              {monthlyStats && (
                <div className="flex gap-4 mt-3 text-sm">
                  <span>
                    Total this month:{" "}
                    <strong data-testid="stat-total-sessions">{monthlyStats.total_sessions}</strong>
                  </span>
                  <span className="text-slate-400">|</span>
                  <span>
                    Sessions with changes:{" "}
                    <strong data-testid="stat-sessions-changes">{monthlyStats.sessions_with_changes}</strong>
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Label className="text-sm text-slate-600 shrink-0">Date range:</Label>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-48" data-testid="select-date-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="3months">Last 3 Months</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Session list */}
      {logLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : logError ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Failed to load access log.</span>
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No support access sessions in this period.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}

      {/* Notification Preferences */}
      <Card data-testid="card-access-preferences">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {prefsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 p-3 border rounded-lg">
                <div>
                  <p className="text-sm font-medium">Email me when support accesses my account</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Email delivery coming soon
                  </p>
                  {prefs?.notifyOnAccess && (
                    <div className="mt-2 space-y-1">
                      <Label className="text-xs">Notify email:</Label>
                      <Input
                        value={notifyEmail || (prefs?.notifyEmail ?? "")}
                        onChange={(e) => setNotifyEmail(e.target.value)}
                        placeholder="owner@restaurant.com"
                        className="h-8 text-sm w-64"
                        data-testid="input-notify-email"
                      />
                    </div>
                  )}
                </div>
                <Switch
                  checked={prefs?.notifyOnAccess ?? false}
                  onCheckedChange={(checked) =>
                    prefsMutation.mutate({
                      ...prefs,
                      notifyOnAccess: checked,
                      notifyEmail: notifyEmail || prefs?.notifyEmail || null,
                    })
                  }
                  data-testid="switch-notify-on-access"
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <p className="text-sm">Show access log in account settings</p>
                <Switch
                  checked={prefs?.showAccessLog ?? true}
                  onCheckedChange={(checked) =>
                    prefsMutation.mutate({ ...prefs, showAccessLog: checked })
                  }
                  data-testid="switch-show-access-log"
                />
              </div>

              <Button
                onClick={() =>
                  prefsMutation.mutate({
                    ...prefs,
                    notifyEmail: notifyEmail || prefs?.notifyEmail || null,
                  })
                }
                disabled={prefsMutation.isPending}
                size="sm"
                data-testid="button-save-preferences"
              >
                {prefsMutation.isPending ? "Saving..." : "Save Preferences"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
