import { useQuery } from "@tanstack/react-query";
import { PageTitle } from "@/lib/accessibility";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Database, Cpu, RefreshCw, Wifi, Shield, AlertTriangle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface HealthCheck {
  status: string;
  db_response_ms: number | null;
  memory_used_mb: number | null;
  process_uptime_seconds: number | null;
  checked_at: string;
}

interface SystemHealthData {
  current: {
    status: string;
    dbResponseMs: number | null;
    memoryUsedMb: number | null;
    uptimeSeconds: number | null;
    checkedAt: string;
  } | null;
  last24h: {
    uptime_pct: number;
    avg_db_ms: number;
    min_db_ms: number;
    max_db_ms: number;
    incidents: number;
  };
  last30d: {
    uptime_pct: number;
    total_checks: number;
    ok_checks: number;
    degraded_checks: number;
    down_checks: number;
  };
  recent: HealthCheck[];
}

interface LiveHealthData {
  status: "ok" | "degraded" | "down";
  db_response_ms: number | null;
  db_pool_used: number | null;
  db_pool_max: number;
  active_websockets: number;
  memory_used_mb: number;
  uptime_seconds: number;
  tenant_count: number;
  circuit_breakers: Record<string, string>;
  timestamp: string;
}

interface SystemEvent {
  id: number;
  event_type: string;
  name: string;
  message: string;
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e",
  degraded: "#eab308",
  down: "#ef4444",
};

const CIRCUIT_STATE_COLOR: Record<string, string> = {
  CLOSED: "#22c55e",
  HALF_OPEN: "#eab308",
  OPEN: "#ef4444",
};

const EVENT_TYPE_COLOR: Record<string, string> = {
  CIRCUIT_OPEN: "#ef4444",
  CIRCUIT_CLOSED: "#22c55e",
  GATEWAY_FAILURE: "#f97316",
};

function StatusSquare({ check }: { check: HealthCheck }) {
  const color = STATUS_COLOR[check.status] || "#94a3b8";
  return (
    <div
      className="w-4 h-4 rounded-sm cursor-pointer transition-transform hover:scale-125 shrink-0"
      style={{ backgroundColor: color }}
      title={`${format(new Date(check.checked_at), "d MMM HH:mm")} · ${check.status} · ${check.db_response_ms != null ? check.db_response_ms + "ms" : "N/A"}`}
      data-testid={`status-square-${check.checked_at}`}
    />
  );
}

function StatusIndicator({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; label: string }> = {
    ok: { bg: "bg-green-100", text: "text-green-800", label: "Operational" },
    degraded: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Degraded" },
    down: { bg: "bg-red-100", text: "text-red-800", label: "Down" },
  };
  const config = colors[status] || colors.ok;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold ${config.bg} ${config.text}`}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] || "#94a3b8" }} />
      {config.label}
    </span>
  );
}

function formatUptime(seconds: number | null): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function CircuitBreakerBadge({ name, state }: { name: string; state: string }) {
  const color = CIRCUIT_STATE_COLOR[state] || "#94a3b8";
  const bgClass = state === "OPEN" ? "bg-red-100 text-red-800" : state === "HALF_OPEN" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800";
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-md ${bgClass}`} data-testid={`circuit-breaker-${name}`}>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium capitalize">{name.replace(/-/g, " ")}</span>
      </div>
      <span className="text-xs font-semibold">{state}</span>
    </div>
  );
}

export default function SystemHealthPage() {
  const { data, isLoading, dataUpdatedAt, refetch } = useQuery<SystemHealthData>({
    queryKey: ["/api/admin/system-health"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/system-health");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const { data: liveHealth, refetch: refetchLive } = useQuery<LiveHealthData>({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const r = await fetch("/api/health");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const { data: systemEventsData } = useQuery<{ data: SystemEvent[]; total: number }>({
    queryKey: ["/api/admin/system-events"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/system-events?limit=20");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const current = data?.current;
  const last24h = data?.last24h;
  const last30d = data?.last30d;
  const recent = data?.recent || [];
  const systemEvents = systemEventsData?.data || [];
  const circuitBreakers = liveHealth?.circuit_breakers || {};
  const hasOpenCircuit = Object.values(circuitBreakers).some(s => s === "OPEN");

  const chartData = recent.map((c) => ({
    name: format(new Date(c.checked_at), "HH:mm"),
    ms: c.db_response_ms || 0,
    status: c.status,
  }));

  const poolUsedPct = liveHealth?.db_pool_used != null && liveHealth?.db_pool_max
    ? Math.round((liveHealth.db_pool_used / liveHealth.db_pool_max) * 100)
    : null;

  const handleRefreshAll = () => {
    refetch();
    refetchLive();
  };

  return (
    <div className="p-6 space-y-6" data-testid="system-health-page">
      <PageTitle title="Admin — System Health" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-green-600" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-health-title">System Health</h1>
            {dataUpdatedAt && (
              <p className="text-xs text-muted-foreground">
                Last checked: {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {liveHealth && <StatusIndicator status={liveHealth.status} />}
          {!liveHealth && current && <StatusIndicator status={current.status} />}
          {hasOpenCircuit && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800" data-testid="badge-circuit-open">
              <AlertTriangle className="h-3.5 w-3.5" />
              Circuit Open
            </span>
          )}
          <button
            onClick={handleRefreshAll}
            className="p-2 rounded-md hover:bg-muted transition-colors"
            data-testid="button-refresh-health"
            aria-label="Refresh system health data"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Live health metrics from /api/health */}
      {liveHealth && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Database className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">DB Response</p>
              </div>
              <p className={`text-lg font-semibold ${(liveHealth.db_response_ms ?? 0) > 500 ? "text-red-600" : "text-foreground"}`} data-testid="text-db-response-ms">
                {liveHealth.db_response_ms != null ? `${liveHealth.db_response_ms}ms` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Database className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">DB Pool</p>
              </div>
              <p className={`text-lg font-semibold ${(poolUsedPct ?? 0) > 80 ? "text-red-600" : "text-foreground"}`} data-testid="text-db-pool">
                {liveHealth.db_pool_used ?? "—"} / {liveHealth.db_pool_max}
              </p>
              {poolUsedPct != null && (
                <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${poolUsedPct > 80 ? "bg-red-500" : poolUsedPct > 60 ? "bg-yellow-500" : "bg-green-500"}`}
                    style={{ width: `${poolUsedPct}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">WebSocket Connections</p>
              </div>
              <p className="text-lg font-semibold" data-testid="text-websocket-count">
                {liveHealth.active_websockets}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Memory</p>
              </div>
              <p className="text-lg font-semibold" data-testid="text-memory">
                {liveHealth.memory_used_mb != null ? `${liveHealth.memory_used_mb}MB` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Uptime</p>
              <p className="text-lg font-semibold" data-testid="text-uptime-live">
                {formatUptime(liveHealth.uptime_seconds)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Tenants</p>
              <p className="text-lg font-semibold" data-testid="text-tenant-count">
                {liveHealth.tenant_count}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Current Status</p>
              <p className="text-lg font-semibold capitalize" data-testid="text-current-status">
                {liveHealth.status}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Uptime (30 days)</p>
              <p className="text-lg font-semibold" data-testid="text-uptime-30d">
                {last30d?.uptime_pct != null ? `${last30d.uptime_pct}%` : "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Historical metrics (only when live data not available) */}
      {!liveHealth && !isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Current Status</p>
              <p className="text-lg font-semibold capitalize" data-testid="text-current-status">
                {current?.status || "No data"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Uptime (30 days)</p>
              <p className="text-lg font-semibold" data-testid="text-uptime-30d">
                {last30d?.uptime_pct != null ? `${last30d.uptime_pct}%` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Database className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">DB Response (24h avg)</p>
              </div>
              <p className="text-lg font-semibold" data-testid="text-avg-db-ms">
                {last24h?.avg_db_ms != null ? `${last24h.avg_db_ms}ms` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Memory</p>
              </div>
              <p className="text-lg font-semibold" data-testid="text-memory">
                {current?.memoryUsedMb != null ? `${current.memoryUsedMb}MB` : "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Circuit Breakers Panel */}
      {Object.keys(circuitBreakers).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Circuit Breakers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2" data-testid="circuit-breakers-panel">
              {Object.entries(circuitBreakers).map(([name, state]) => (
                <CircuitBreakerBadge key={name} name={name} state={state} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              CLOSED = healthy · HALF_OPEN = testing recovery · OPEN = blocking requests (503)
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading health data...</div>
      ) : (
        <>
          {recent.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Status Timeline — last {recent.length} checks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1" data-testid="status-timeline">
                  {recent.map((check, i) => (
                    <StatusSquare key={i} check={check} />
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Operational</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-400 inline-block" /> Degraded</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Down</span>
                </div>
              </CardContent>
            </Card>
          )}

          {chartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">DB Response Time (ms) — last 48 checks</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={Math.floor(chartData.length / 8)} />
                    <YAxis tick={{ fontSize: 10 }} width={40} />
                    <Tooltip formatter={(v: any) => [`${v}ms`, "DB Response"]} />
                    <Bar dataKey="ms" radius={[2, 2, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={STATUS_COLOR[entry.status] || "#94a3b8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Uptime Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Last 24h</p>
                  <p className="font-semibold" data-testid="text-uptime-24h">{last24h?.uptime_pct != null ? `${last24h.uptime_pct}%` : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Last 30 days</p>
                  <p className="font-semibold">{last30d?.uptime_pct != null ? `${last30d.uptime_pct}%` : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Process Uptime</p>
                  <p className="font-semibold">{formatUptime(liveHealth?.uptime_seconds ?? current?.uptimeSeconds ?? null)}</p>
                </div>
              </div>
              {last30d && last30d.total_checks > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                  <div>Total checks: <span className="text-foreground font-medium">{last30d.total_checks}</span></div>
                  <div>OK: <span className="text-green-600 font-medium">{last30d.ok_checks}</span></div>
                  <div>Issues: <span className="text-red-600 font-medium">{last30d.degraded_checks + last30d.down_checks}</span></div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Recent System Events */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Recent System Events
            {systemEventsData?.total != null && systemEventsData.total > 0 && (
              <span className="text-xs text-muted-foreground font-normal">({systemEventsData.total} total)</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {systemEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-system-events">
              No system events recorded — circuit breakers healthy, no gateway failures.
            </p>
          ) : (
            <div className="space-y-2" data-testid="system-events-list">
              {systemEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 py-2 border-b last:border-0"
                  data-testid={`system-event-${event.id}`}
                >
                  <span
                    className="mt-1 w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: EVENT_TYPE_COLOR[event.event_type] || "#94a3b8" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold" style={{ color: EVENT_TYPE_COLOR[event.event_type] || "#64748b" }}>
                        {event.event_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">{event.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{event.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                    {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
