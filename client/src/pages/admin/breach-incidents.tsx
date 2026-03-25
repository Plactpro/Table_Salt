import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Plus, Eye, RefreshCw, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface BreachIncident {
  id: string;
  tenant_id: string | null;
  tenant_name?: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  detected_at: string;
  contained_at: string | null;
  notified_at: string | null;
  resolved_at: string | null;
  affected_records: number;
  affected_data_types: string[];
  root_cause: string | null;
  remediation: string | null;
  reported_by_name: string | null;
  notification_deadline: string;
  tenant_notified: boolean;
  authority_notified: boolean;
  hours_remaining: number | null;
}

interface Tenant {
  id: string;
  name: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const STATUS_COLORS: Record<string, string> = {
  detected: "bg-red-100 text-red-800",
  investigating: "bg-orange-100 text-orange-800",
  contained: "bg-yellow-100 text-yellow-800",
  notified: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
};

const DATA_TYPES = ["name", "email", "phone", "financial", "payment", "health", "other"];
const STATUSES = ["detected", "investigating", "contained", "notified", "resolved"];

function HoursCountdown({ hours }: { hours: number | null }) {
  if (hours === null || hours < 0) return null;
  const isUrgent = hours < 24;
  const color = isUrgent ? "text-red-600" : "text-amber-600";
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${color}`} data-testid="badge-hours-remaining">
      <Clock className="h-3 w-3" />
      {h}h {m}m until GDPR deadline
    </span>
  );
}

function LogIncidentDialog({ onClose, tenants }: { onClose: () => void; tenants: Tenant[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [tenantId, setTenantId] = useState("platform-wide");
  const [affectedRecords, setAffectedRecords] = useState("0");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [rootCause, setRootCause] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/admin/breach-incidents", {
        title, description, severity,
        tenantId: tenantId === "platform-wide" ? null : tenantId,
        affectedRecords: parseInt(affectedRecords) || 0,
        affectedDataTypes: selectedTypes,
        rootCause: rootCause || null,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breach-incidents"] });
      toast({ title: "Incident logged", description: "The breach incident has been recorded." });
      onClose();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const toggleType = (type: string) => {
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log New Breach Incident</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input data-testid="input-incident-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief incident title" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea data-testid="input-incident-description" value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What happened?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger data-testid="select-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Affected Tenant</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger data-testid="select-tenant">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform-wide">Platform-wide</SelectItem>
                  {tenants.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Affected Records</Label>
            <Input data-testid="input-affected-records" type="number" value={affectedRecords} onChange={e => setAffectedRecords(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Affected Data Types</Label>
            <div className="flex flex-wrap gap-2">
              {DATA_TYPES.map(type => (
                <label key={type} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedTypes.includes(type)}
                    onCheckedChange={() => toggleType(type)}
                    data-testid={`checkbox-type-${type}`}
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Root Cause (optional)</Label>
            <Textarea value={rootCause} onChange={e => setRootCause(e.target.value)} rows={2} placeholder="Known root cause..." />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !title || !description}
              data-testid="button-submit-incident"
            >
              {mutation.isPending ? "Saving..." : "Log Incident"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UpdateStatusDialog({ incident, onClose }: { incident: BreachIncident; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(incident.status);
  const [rootCause, setRootCause] = useState(incident.root_cause || "");
  const [remediation, setRemediation] = useState(incident.remediation || "");
  const [tenantNotified, setTenantNotified] = useState(incident.tenant_notified);
  const [authorityNotified, setAuthorityNotified] = useState(incident.authority_notified);

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PATCH", `/api/admin/breach-incidents/${incident.id}`, {
        status, rootCause: rootCause || null, remediation: remediation || null,
        tenantNotified, authorityNotified,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breach-incidents"] });
      toast({ title: "Incident updated" });
      onClose();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Incident Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="select-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Root Cause</Label>
            <Textarea value={rootCause} onChange={e => setRootCause(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Remediation Steps</Label>
            <Textarea value={remediation} onChange={e => setRemediation(e.target.value)} rows={2} />
          </div>
          {status === "notified" && (
            <div className="space-y-2 p-3 border rounded-lg bg-blue-50">
              <p className="text-sm font-medium text-blue-900">Notification Confirmation</p>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={tenantNotified}
                  onCheckedChange={c => setTenantNotified(c === true)}
                  data-testid="checkbox-tenant-notified"
                />
                Tenant has been notified
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={authorityNotified}
                  onCheckedChange={c => setAuthorityNotified(c === true)}
                  data-testid="checkbox-authority-notified"
                />
                Authority (DPA) has been notified
              </label>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-submit-status">
              {mutation.isPending ? "Saving..." : "Update Status"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BreachIncidentsPage() {
  const [showLog, setShowLog] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<BreachIncident | null>(null);
  const [viewIncident, setViewIncident] = useState<BreachIncident | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  const { data, isLoading, refetch } = useQuery<{ data: BreachIncident[]; total: number }>({
    queryKey: ["/api/admin/breach-incidents", statusFilter, severityFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      const r = await apiRequest("GET", `/api/admin/breach-incidents?${params}`);
      return r.json();
    },
    refetchInterval: 60000,
  });

  const { data: tenantsData } = useQuery<{ data: Tenant[] }>({
    queryKey: ["/api/admin/tenants"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/tenants?limit=200");
      return r.json();
    },
  });

  const tenants = (tenantsData as any)?.tenants || (tenantsData as any)?.data || [];
  const incidents = data?.data || [];

  return (
    <div className="p-6 space-y-6" data-testid="breach-incidents-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-red-600" />
          <h1 className="text-2xl font-bold" data-testid="text-breach-title">Data Breach Incidents</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-incidents">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowLog(true)} data-testid="button-log-incident">
            <Plus className="h-4 w-4 mr-1" />
            Log New Incident
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-40" data-testid="select-filter-severity">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading incidents...</div>
      ) : incidents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No breach incidents found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {incidents.map(incident => (
            <Card key={incident.id} data-testid={`card-incident-${incident.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase ${SEVERITY_COLORS[incident.severity] || "bg-gray-100 text-gray-700"}`}>
                        {incident.severity}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLORS[incident.status] || "bg-gray-100 text-gray-700"}`}>
                        {incident.status}
                      </span>
                    </div>
                    <p className="font-semibold text-sm mb-1">{incident.title}</p>
                    <p className="text-xs text-muted-foreground mb-1">
                      {incident.tenant_name ? `Tenant: ${incident.tenant_name}` : "Platform-wide"}
                      {" · "}
                      Detected: {format(new Date(incident.detected_at), "d MMM yyyy HH:mm")}
                      {incident.affected_records > 0 && ` · Records: ${incident.affected_records.toLocaleString()}`}
                    </p>
                    {(incident.status === "detected" || incident.status === "investigating") && incident.hours_remaining !== null && (
                      <HoursCountdown hours={incident.hours_remaining} />
                    )}
                    {incident.resolved_at && (
                      <p className="text-xs text-green-600">Resolved: {format(new Date(incident.resolved_at), "d MMM yyyy")}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setViewIncident(incident)}
                      data-testid={`button-view-incident-${incident.id}`}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
                    {incident.status !== "resolved" && (
                      <Button
                        size="sm"
                        onClick={() => setSelectedIncident(incident)}
                        data-testid={`button-update-incident-${incident.id}`}
                      >
                        Update Status
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showLog && (
        <LogIncidentDialog
          onClose={() => setShowLog(false)}
          tenants={Array.isArray(tenants) ? tenants : []}
        />
      )}
      {selectedIncident && (
        <UpdateStatusDialog
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
        />
      )}
      {viewIncident && (
        <Dialog open onOpenChange={() => setViewIncident(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{viewIncident.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex gap-2 flex-wrap">
                <Badge className={SEVERITY_COLORS[viewIncident.severity]}>{viewIncident.severity}</Badge>
                <Badge className={STATUS_COLORS[viewIncident.status]}>{viewIncident.status}</Badge>
              </div>
              <p className="text-muted-foreground">{viewIncident.description}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Detected:</span> {format(new Date(viewIncident.detected_at), "d MMM yyyy HH:mm")}</div>
                <div><span className="text-muted-foreground">Deadline:</span> {format(new Date(viewIncident.notification_deadline), "d MMM yyyy HH:mm")}</div>
                <div><span className="text-muted-foreground">Tenant:</span> {viewIncident.tenant_name || "Platform-wide"}</div>
                <div><span className="text-muted-foreground">Records:</span> {viewIncident.affected_records.toLocaleString()}</div>
                {viewIncident.contained_at && <div><span className="text-muted-foreground">Contained:</span> {format(new Date(viewIncident.contained_at), "d MMM yyyy")}</div>}
                {viewIncident.notified_at && <div><span className="text-muted-foreground">Notified:</span> {format(new Date(viewIncident.notified_at), "d MMM yyyy")}</div>}
                {viewIncident.resolved_at && <div><span className="text-muted-foreground">Resolved:</span> {format(new Date(viewIncident.resolved_at), "d MMM yyyy")}</div>}
              </div>
              {viewIncident.affected_data_types?.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs">Data types: </span>
                  <span className="text-xs">{viewIncident.affected_data_types.join(", ")}</span>
                </div>
              )}
              {viewIncident.root_cause && <div><span className="text-muted-foreground text-xs">Root cause: </span><span className="text-xs">{viewIncident.root_cause}</span></div>}
              {viewIncident.remediation && <div><span className="text-muted-foreground text-xs">Remediation: </span><span className="text-xs">{viewIncident.remediation}</span></div>}
              <div className="flex gap-4 text-xs">
                <span className={viewIncident.tenant_notified ? "text-green-600" : "text-muted-foreground"}>
                  {viewIncident.tenant_notified ? "✓" : "○"} Tenant notified
                </span>
                <span className={viewIncident.authority_notified ? "text-green-600" : "text-muted-foreground"}>
                  {viewIncident.authority_notified ? "✓" : "○"} Authority notified
                </span>
              </div>
              {viewIncident.reported_by_name && (
                <p className="text-xs text-muted-foreground">Reported by: {viewIncident.reported_by_name}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
