import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import {
  ChevronDown,
  ChevronRight,
  ScrollText,
  AlertCircle,
  Filter,
  Download,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AuditEvent {
  id: string;
  tenantId: string | null;
  userId: string | null;
  userName: string;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  tenantName: string | null;
}

interface Tenant {
  id: string;
  name: string;
}

const COMMON_ACTIONS = [
  "login",
  "logout",
  "user_created",
  "user_deactivated",
  "user_reactivated",
  "tenant_created",
  "tenant_suspended",
  "tenant_reactivated",
  "impersonation_start",
  "impersonation_end",
  "plan_changed",
  "password_reset",
];

function JsonViewer({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return <span className="text-slate-400 italic text-xs">null</span>;
  return (
    <pre className="text-xs bg-slate-900 text-emerald-300 rounded p-3 overflow-x-auto max-h-40 font-mono">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function EventRow({ event }: { event: AuditEvent }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = event.before || event.after || event.metadata;

  return (
    <div data-testid={`row-audit-${event.id}`}>
      <button
        className="w-full grid grid-cols-[auto_1.5fr_1fr_1.5fr_1.5fr_1fr_1fr] gap-3 items-center px-4 py-3 hover:bg-slate-50 transition-colors text-left"
        onClick={() => hasDetails && setExpanded((p) => !p)}
        data-testid={`button-expand-audit-${event.id}`}
        disabled={!hasDetails}
      >
        <div className="w-4">
          {hasDetails ? (
            expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <span className="w-4" />
          )}
        </div>
        <span className="text-xs text-slate-500 truncate">
          {new Date(event.createdAt).toLocaleString()}
        </span>
        <span className="text-xs text-slate-600 truncate">
          {event.tenantName ?? <span className="text-slate-400">Platform</span>}
        </span>
        <span className="text-xs text-slate-700 truncate">
          {event.userName}
          {event.userEmail && <span className="text-slate-400 ml-1">({event.userEmail})</span>}
        </span>
        <Badge variant="outline" className="text-xs font-mono w-fit">
          {event.action}
        </Badge>
        <span className="text-xs text-slate-500 truncate" data-testid={`audit-entity-${event.id}`}>
          <span className="font-medium text-slate-600">{event.entityType}</span>
          {event.entityName && <span className="text-slate-400"> / {event.entityName}</span>}
        </span>
        <span className="text-xs text-slate-400 truncate">
          {event.ipAddress ?? "—"}
        </span>
      </button>

      {expanded && hasDetails && (
        <div className="px-10 pb-4 space-y-2" data-testid={`expanded-audit-${event.id}`}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">Entity</p>
              <p className="text-xs text-slate-700">{event.entityType} / {event.entityName || event.entityId || "—"}</p>
            </div>
            {event.ipAddress && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1.5">IP Address</p>
                <p className="text-xs text-slate-700 font-mono">{event.ipAddress}</p>
              </div>
            )}
          </div>
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">Metadata</p>
              <JsonViewer data={event.metadata} />
            </div>
          )}
          {(event.before || event.after) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1.5">Before</p>
                <JsonViewer data={event.before} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1.5">After</p>
                <JsonViewer data={event.after} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

function applyPreset(days: number, setFromDate: (v: string) => void, setToDate: (v: string) => void) {
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  setFromDate(toDateStr(from));
  setToDate(toDateStr(now));
}

export default function AuditLogPage() {
  const searchStr = useSearch();
  const urlParams = new URLSearchParams(searchStr);
  const [tenantFilter, setTenantFilter] = useState(urlParams.get("tenantId") ?? "all");
  const [actionFilter, setActionFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [limit, setLimit] = useState(50);
  const [exporting, setExporting] = useState(false);

  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (tenantFilter !== "all") params.set("tenantId", tenantFilter);
  if (actionFilter) params.set("action", actionFilter);
  if (fromDate) params.set("from", fromDate);
  if (toDate) params.set("to", toDate);

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportParams = new URLSearchParams();
      if (tenantFilter !== "all") exportParams.set("tenantId", tenantFilter);
      if (actionFilter) exportParams.set("action", actionFilter);
      if (fromDate) exportParams.set("from", fromDate);
      if (toDate) exportParams.set("to", toDate);
      const r = await apiRequest("GET", `/api/admin/audit-log/export?${exportParams.toString()}`);
      if (!r.ok) throw new Error("Export failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${toDateStr(new Date())}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const { data: eventsRes, isLoading, error } = useQuery<{ data: AuditEvent[]; total: number }>({
    queryKey: ["/api/admin/audit-log", tenantFilter, actionFilter, fromDate, toDate, limit],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/audit-log?${params.toString()}`);
      return r.json();
    },
  });
  const events = eventsRes?.data;

  const { data: tenantsRes } = useQuery<{ data: Tenant[]; total: number }>({
    queryKey: ["/api/admin/tenants", "all"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/tenants?limit=200");
      return r.json();
    },
  });
  const tenants = tenantsRes?.data;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4" data-testid="admin-audit-log-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900" data-testid="page-title-audit-log">
            Audit Log
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Cross-tenant audit trail</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
          data-testid="button-export-audit-log"
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          {exporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Failed to load audit log. Please refresh.</span>
        </div>
      )}

      {/* Filters */}
      <Card data-testid="card-audit-filters">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
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
                onClick={() => applyPreset(1, setFromDate, setToDate)}
                data-testid="button-preset-24h"
              >
                Last 24h
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => applyPreset(7, setFromDate, setToDate)}
                data-testid="button-preset-7d"
              >
                Last 7 days
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => applyPreset(30, setFromDate, setToDate)}
                data-testid="button-preset-30d"
              >
                Last 30 days
              </Button>
              {(fromDate || toDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2 text-slate-400"
                  onClick={() => { setFromDate(""); setToDate(""); }}
                  data-testid="button-clear-dates"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tenant</Label>
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger data-testid="select-audit-tenant">
                  <SelectValue placeholder="All tenants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tenants</SelectItem>
                  {(tenants ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Action</Label>
              <Select value={actionFilter || "all"} onValueChange={(v) => setActionFilter(v === "all" ? "" : v)}>
                <SelectTrigger data-testid="select-audit-action">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {COMMON_ACTIONS.map((a) => (
                    <SelectItem key={a} value={a} className="font-mono text-xs">{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                data-testid="input-audit-from-date"
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                data-testid="input-audit-to-date"
                className="text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-audit-table">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !events || events.length === 0 ? (
            <div className="py-12 text-center">
              <ScrollText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No audit events found</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[auto_1.5fr_1fr_1.5fr_1.5fr_1fr_1fr] gap-3 px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide bg-slate-50 rounded-t-lg">
                <span className="w-4" />
                <span>Timestamp</span>
                <span>Tenant</span>
                <span>User</span>
                <span>Action</span>
                <span>Entity</span>
                <span>IP</span>
              </div>
              <div className="divide-y divide-slate-100">
                {events.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </div>
              {events.length >= limit && (
                <div className="p-4 text-center border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLimit((l) => l + 50)}
                    data-testid="button-load-more-audit"
                  >
                    Load More ({limit} shown)
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
