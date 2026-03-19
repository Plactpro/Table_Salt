import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  AlertTriangle,
  Info,
  CheckCircle2,
  Filter,
  Building2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

function applySecurityPreset(
  days: number,
  setFrom: (v: string) => void,
  setTo: (v: string) => void
) {
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  setFrom(toDateStr(from));
  setTo(toDateStr(now));
}

interface SecurityAlert {
  id: string;
  tenantId: string | null;
  userId: string | null;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  acknowledged: boolean | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  tenantName: string | null;
}

interface Tenant {
  id: string;
  name: string;
}

const SEVERITY_CONFIG = {
  critical: { label: "Critical", className: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle },
  warning: { label: "Warning", className: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertTriangle },
  info: { label: "Info", className: "bg-blue-50 text-blue-700 border-blue-200", icon: Info },
};

const ALERT_TYPES = [
  "failed_login",
  "new_ip_login",
  "password_changed",
  "2fa_disabled",
  "role_escalation",
  "data_export",
  "bulk_export",
];

function SeverityBadge({ severity }: { severity: "info" | "warning" | "critical" }) {
  const config = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.info;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${config.className}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

export default function SecurityConsolePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [acknowledgedFilter, setAcknowledgedFilter] = useState("unacknowledged");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const params = new URLSearchParams();
  if (severityFilter !== "all") params.set("severity", severityFilter);
  if (typeFilter !== "all") params.set("type", typeFilter);
  if (tenantFilter !== "all") params.set("tenantId", tenantFilter);
  if (acknowledgedFilter !== "all") params.set("acknowledged", acknowledgedFilter === "acknowledged" ? "true" : "false");
  if (fromDate) params.set("from", fromDate);
  if (toDate) params.set("to", toDate);

  const { data: alertsRes, isLoading, error } = useQuery<{ data: SecurityAlert[]; total: number }>({
    queryKey: ["/api/admin/security-alerts", severityFilter, typeFilter, tenantFilter, acknowledgedFilter, fromDate, toDate],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/security-alerts?${params.toString()}`);
      return r.json();
    },
  });
  const alerts = alertsRes?.data;

  const { data: tenantsRes } = useQuery<{ data: Tenant[]; total: number }>({
    queryKey: ["/api/admin/tenants"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/tenants");
      return r.json();
    },
  });
  const tenants = tenantsRes?.data;

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/admin/security-alerts/${id}/acknowledge`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security-alerts"] });
      toast({ title: "Alert acknowledged" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unacknowledgedCount = (alerts ?? []).filter(a => !a.acknowledged).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4" data-testid="admin-security-console-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2" data-testid="page-title-security">
            <Shield className="h-5 w-5 text-slate-700" />
            Security Console
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Cross-tenant security alerts and threat monitoring</p>
        </div>
        {unacknowledgedCount > 0 && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200" data-testid="text-unacknowledged-count">
            {unacknowledgedCount} unacknowledged
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Failed to load security alerts. Please refresh.</span>
        </div>
      )}

      {/* Filters */}
      <Card data-testid="card-security-filters">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Filters</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs text-slate-400 mr-1">Quick:</span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => applySecurityPreset(1, setFromDate, setToDate)}
                data-testid="button-security-preset-24h"
              >
                Last 24h
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => applySecurityPreset(7, setFromDate, setToDate)}
                data-testid="button-security-preset-7d"
              >
                Last 7 days
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => applySecurityPreset(30, setFromDate, setToDate)}
                data-testid="button-security-preset-30d"
              >
                Last 30 days
              </Button>
              {(fromDate || toDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2 text-slate-400"
                  onClick={() => { setFromDate(""); setToDate(""); }}
                  data-testid="button-security-clear-dates"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tenant</Label>
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger data-testid="select-security-tenant">
                  <Building2 className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                  <SelectValue placeholder="All tenants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tenants</SelectItem>
                  {(tenants ?? []).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Severity</Label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger data-testid="select-security-severity">
                  <SelectValue placeholder="All severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger data-testid="select-security-type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {ALERT_TYPES.map(t => (
                    <SelectItem key={t} value={t} className="font-mono text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={acknowledgedFilter} onValueChange={setAcknowledgedFilter}>
                <SelectTrigger data-testid="select-security-acknowledged">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All alerts</SelectItem>
                  <SelectItem value="unacknowledged">Unacknowledged</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="text-sm"
                data-testid="input-security-from-date"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="text-sm"
                data-testid="input-security-to-date"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts Table */}
      <Card data-testid="card-security-alerts-table">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : !alerts || alerts.length === 0 ? (
            <div className="py-12 text-center">
              <Shield className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No security alerts found</p>
              {acknowledgedFilter === "unacknowledged" && (
                <p className="text-xs text-slate-400 mt-1">All alerts have been acknowledged</p>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_1.2fr_1.5fr_1fr_1fr_auto] gap-3 px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide bg-slate-50 rounded-t-lg">
                <span>Severity / Type</span>
                <span>Tenant</span>
                <span>Title</span>
                <span>IP Address</span>
                <span>Time</span>
                <span></span>
              </div>
              <div className="divide-y divide-slate-100">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`grid grid-cols-[1fr_1.2fr_1.5fr_1fr_1fr_auto] gap-3 items-center px-4 py-3 transition-colors ${
                      alert.acknowledged ? "opacity-60" : "hover:bg-slate-50"
                    }`}
                    data-testid={`row-security-alert-${alert.id}`}
                  >
                    <div className="space-y-1">
                      <SeverityBadge severity={alert.severity} />
                      <p className="text-xs text-slate-400 font-mono">{alert.type}</p>
                    </div>
                    <span className="text-xs text-slate-600 truncate">
                      {alert.tenantName ?? <span className="text-slate-400 italic">Platform</span>}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{alert.title}</p>
                      {alert.description && (
                        <p className="text-xs text-slate-400 truncate">{alert.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 font-mono">{alert.ipAddress ?? "—"}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(alert.createdAt).toLocaleString()}
                    </span>
                    <div>
                      {alert.acknowledged ? (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50 gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Ack'd
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => acknowledgeMutation.mutate(alert.id)}
                          disabled={acknowledgeMutation.isPending}
                          data-testid={`button-acknowledge-alert-${alert.id}`}
                        >
                          Acknowledge
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
