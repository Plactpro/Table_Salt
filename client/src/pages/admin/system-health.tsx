import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Database, Cpu, RefreshCw } from "lucide-react";
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

const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e",
  degraded: "#eab308",
  down: "#ef4444",
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

export default function SystemHealthPage() {
  const { data, isLoading, dataUpdatedAt, refetch } = useQuery<SystemHealthData>({
    queryKey: ["/api/admin/system-health"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/system-health");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const current = data?.current;
  const last24h = data?.last24h;
  const last30d = data?.last30d;
  const recent = data?.recent || [];

  const chartData = recent.map((c, i) => ({
    name: format(new Date(c.checked_at), "HH:mm"),
    ms: c.db_response_ms || 0,
    status: c.status,
  }));

  return (
    <div className="p-6 space-y-6" data-testid="system-health-page">
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
          {current && <StatusIndicator status={current.status} />}
          <button
            onClick={() => refetch()}
            className="p-2 rounded-md hover:bg-muted transition-colors"
            data-testid="button-refresh-health"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading health data...</div>
      ) : (
        <>
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
                  <p className="font-semibold">{formatUptime(current?.uptimeSeconds ?? null)}</p>
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
    </div>
  );
}
