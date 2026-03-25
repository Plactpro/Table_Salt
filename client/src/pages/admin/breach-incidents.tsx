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
import { AlertTriangle, Plus, Eye, RefreshCw, Clock, Search, TrendingUp, X } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { getJurisdictionByCurrency } from "@shared/jurisdictions";
import { PageTitle, announceToScreenReader } from "@/lib/accessibility";

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
  certin_notified: boolean;
  certin_notified_at: string | null;
  certin_reference_no: string | null;
  requires_dpa_notification: boolean;
  notification_rationale: string | null;
  hours_remaining: number | null;
}

interface Tenant {
  id: string;
  name: string;
  currency?: string | null;
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

interface DetectionAlert {
  id: string;
  tenant_id: string | null;
  tenant_name?: string;
  user_id: string | null;
  type: string;
  severity: string;
  title: string;
  description: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  acknowledged: boolean;
  created_at: string;
}

const DISMISS_REASON_TYPES = [
  { value: "legitimate", label: "Legitimate — authorized admin running scheduled backup" },
  { value: "false_positive", label: "False positive — known IP and expected behavior" },
  { value: "pentest", label: "Test — this was a planned penetration test" },
  { value: "other", label: "Other" },
];

function DismissAlertDialog({
  alert,
  onClose,
  onDismissed,
}: {
  alert: DetectionAlert;
  onClose: () => void;
  onDismissed: () => void;
}) {
  const { toast } = useToast();
  const [reasonType, setReasonType] = useState("");
  const [otherReason, setOtherReason] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const reason = reasonType === "other" ? otherReason : DISMISS_REASON_TYPES.find(r => r.value === reasonType)?.label || reasonType;
      const r = await apiRequest("PATCH", `/api/admin/detection-alerts/${alert.id}/dismiss`, { reason, reasonType });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      announceToScreenReader("Alert dismissed successfully.");
      toast({ title: "Alert dismissed", description: "The detection alert has been dismissed." });
      onDismissed();
      onClose();
    },
    onError: (e: any) => { announceToScreenReader("Error: " + e.message); toast({ variant: "destructive", title: "Error", description: e.message }); },
  });

  const canSubmit = reasonType && (reasonType !== "other" || otherReason.trim().length > 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dismiss Detection Alert</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
            <p className="font-medium text-amber-800">{alert.title}</p>
            <p className="text-amber-700 mt-1 text-xs">{alert.description}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Dismissal Reason</Label>
            {DISMISS_REASON_TYPES.map(r => (
              <label key={r.value} className="flex items-start gap-2 text-sm cursor-pointer" data-testid={`radio-dismiss-${r.value}`}>
                <input
                  type="radio"
                  name="dismissReason"
                  value={r.value}
                  checked={reasonType === r.value}
                  onChange={() => setReasonType(r.value)}
                  className="mt-0.5"
                />
                {r.label}
              </label>
            ))}
            {reasonType === "other" && (
              <Textarea
                placeholder="Describe the reason..."
                value={otherReason}
                onChange={e => setOtherReason(e.target.value)}
                rows={2}
                data-testid="input-dismiss-other-reason"
              />
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-dismiss">Cancel</Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !canSubmit}
              data-testid="button-confirm-dismiss"
            >
              {mutation.isPending ? "Dismissing..." : "Dismiss Alert"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetectionAlertsTab({
  onEscalate,
}: {
  onEscalate: (alert: DetectionAlert) => void;
}) {
  const queryClient = useQueryClient();
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [dismissTarget, setDismissTarget] = useState<DetectionAlert | null>(null);

  const { data, isLoading, refetch } = useQuery<{ data: DetectionAlert[]; total: number }>({
    queryKey: ["/api/admin/detection-alerts", showAcknowledged],
    queryFn: async () => {
      const params = new URLSearchParams({ acknowledged: String(showAcknowledged), limit: "50" });
      const r = await apiRequest("GET", `/api/admin/detection-alerts?${params}`);
      return r.json();
    },
    refetchInterval: 30000,
  });

  const alerts = data?.data || [];
  const total = data?.total || 0;

  const severityIcon = (sev: string) => {
    if (sev === "critical") return "🔴";
    if (sev === "high") return "🟠";
    if (sev === "warning") return "🟡";
    return "🔵";
  };

  return (
    <div className="space-y-4" data-testid="detection-alerts-tab">
      <div className="flex items-center justify-between">
        <div className="p-4 border border-blue-200 bg-blue-50 dark:bg-blue-950/30 rounded-lg flex-1 mr-4">
          <div className="flex items-center gap-2 mb-1">
            <Search className="h-4 w-4 text-blue-600" />
            <span className="font-semibold text-blue-800 dark:text-blue-300 text-sm">Automated Detection Alerts</span>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-400">
            These are suspicious patterns detected automatically. They are <strong>NOT</strong> formal breach incidents.
            Investigate each one and either escalate to a formal incident or dismiss as a false positive.
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-detection-alerts">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={showAcknowledged}
              onChange={e => setShowAcknowledged(e.target.checked)}
              data-testid="checkbox-show-dismissed"
            />
            Show dismissed
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="detection-alerts-loading">Loading detection alerts...</div>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground" data-testid="detection-alerts-empty">
            {showAcknowledged ? "No dismissed alerts found." : "No active detection alerts. The system is monitoring for suspicious patterns."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <Card key={alert.id} data-testid={`card-detection-alert-${alert.id}`} className={alert.acknowledged ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-base">{severityIcon(alert.severity)}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase ${SEVERITY_COLORS[alert.severity] || "bg-gray-100 text-gray-700"}`}
                        data-testid={`badge-alert-severity-${alert.id}`}>
                        {alert.severity}
                      </span>
                      {alert.acknowledged && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
                          Dismissed
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-sm mb-1" data-testid={`text-alert-title-${alert.id}`}>{alert.title}</p>
                    <p className="text-xs text-muted-foreground mb-1">
                      {format(new Date(alert.created_at), "d MMM yyyy HH:mm")}
                      {alert.tenant_name && ` · Tenant: ${alert.tenant_name}`}
                    </p>
                    {alert.description && (
                      <p className="text-xs text-muted-foreground" data-testid={`text-alert-desc-${alert.id}`}>{alert.description}</p>
                    )}
                    {alert.metadata && (alert.metadata as any).dismissedReasonType && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        Dismissed: {(alert.metadata as any).dismissedReason}
                      </p>
                    )}
                  </div>
                  {!alert.acknowledged && (
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEscalate(alert)}
                        data-testid={`button-escalate-alert-${alert.id}`}
                      >
                        <TrendingUp className="h-3.5 w-3.5 mr-1" />
                        Escalate to Breach
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDismissTarget(alert)}
                        data-testid={`button-dismiss-alert-${alert.id}`}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dismissTarget && (
        <DismissAlertDialog
          alert={dismissTarget}
          onClose={() => setDismissTarget(null)}
          onDismissed={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/detection-alerts"] });
            setDismissTarget(null);
          }}
        />
      )}
    </div>
  );
}

function CountdownTimer({ detectedAt, hours, label, colorClass }: {
  detectedAt: string;
  hours: number;
  label: string;
  colorClass: string;
}) {
  const totalHours = hours;
  const detectedMs = new Date(detectedAt).getTime();
  const deadlineMs = detectedMs + totalHours * 60 * 60 * 1000;
  const remainingMs = deadlineMs - Date.now();
  const remainingHours = remainingMs / (1000 * 60 * 60);
  const pctRemaining = Math.max(0, (remainingMs / (totalHours * 60 * 60 * 1000)) * 100);

  let color = "text-green-600";
  if (pctRemaining < 25) color = "text-red-600";
  else if (pctRemaining < 50) color = "text-yellow-600";

  if (remainingMs <= 0) {
    return (
      <span className={`flex items-center gap-1 text-xs font-semibold text-red-600`} data-testid={`countdown-${label.toLowerCase().replace(/\s/g, "-")}`}>
        <Clock className="h-3 w-3" />
        {label}: OVERDUE
      </span>
    );
  }

  const h = Math.floor(remainingHours);
  const m = Math.floor((remainingHours - h) * 60);
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${color}`} data-testid={`countdown-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <Clock className="h-3 w-3" />
      {h}h {m}m until {label} deadline
    </span>
  );
}

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

interface TenantOutlet {
  id: string;
  name: string;
  currency_code?: string | null;
}

function LogIncidentDialog({ onClose, tenants, prefill }: { onClose: () => void; tenants: Tenant[]; prefill?: { title: string; description: string; severity: string; detectedAt?: string } }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(prefill?.title || "");
  const [description, setDescription] = useState(prefill?.description || "");
  const [severity, setSeverity] = useState(prefill?.severity || "medium");
  const [detectedAt, setDetectedAt] = useState(prefill?.detectedAt ? new Date(prefill.detectedAt).toISOString().slice(0, 16) : "");
  const [tenantId, setTenantId] = useState("platform-wide");
  const [selectedOutletId, setSelectedOutletId] = useState<string>("");
  const [affectedRecords, setAffectedRecords] = useState("0");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [rootCause, setRootCause] = useState("");
  const [requiresDpa, setRequiresDpa] = useState(false);
  const [rationale, setRationale] = useState("");

  const { data: tenantDetail } = useQuery<{ outlets?: TenantOutlet[] }>({
    queryKey: ["/api/admin/tenants", tenantId],
    queryFn: async () => {
      if (tenantId === "platform-wide") return { outlets: [] };
      const r = await apiRequest("GET", `/api/admin/tenants/${tenantId}`);
      return r.json();
    },
    enabled: tenantId !== "platform-wide",
    staleTime: 60_000,
  });

  const tenantOutlets: TenantOutlet[] = tenantDetail?.outlets || [];
  const hasMultipleOutletCurrencies = new Set(tenantOutlets.map(o => o.currency_code?.toUpperCase() || "").filter(Boolean)).size > 1;

  const selectedOutlet = tenantOutlets.find(o => o.id === selectedOutletId);
  const selectedTenant = tenants.find(t => t.id === tenantId);

  const jurisdictionCurrency = (
    selectedOutlet?.currency_code?.toUpperCase() ||
    selectedTenant?.currency?.toUpperCase() ||
    "USD"
  );
  const incidentJurisdiction = getJurisdictionByCurrency(jurisdictionCurrency);

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/admin/breach-incidents", {
        title, description, severity,
        tenantId: tenantId === "platform-wide" ? null : tenantId,
        affectedRecords: parseInt(affectedRecords) || 0,
        affectedDataTypes: selectedTypes,
        rootCause: rootCause || null,
        requiresDpaNotification: requiresDpa,
        notificationRationale: rationale || null,
        ...(detectedAt ? { detectedAt } : {}),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breach-incidents"] });
      announceToScreenReader("Breach incident logged successfully.");
      toast({ title: "Incident logged", description: "The breach incident has been recorded." });
      onClose();
    },
    onError: (e: any) => { announceToScreenReader("Error: " + e.message); toast({ variant: "destructive", title: "Error", description: e.message }); },
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
          {prefill && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-800" data-testid="banner-escalated-from-alert">
              <strong>Escalated from detection alert.</strong> Review and complete the details below before submitting.
            </div>
          )}
          {prefill?.detectedAt && (
            <div className="space-y-1.5">
              <Label className="text-xs">Detection Time (from alert — adjustable)</Label>
              <Input
                type="datetime-local"
                value={detectedAt}
                onChange={e => setDetectedAt(e.target.value)}
                data-testid="input-escalate-detected-at"
              />
              <p className="text-xs text-muted-foreground">This sets the formal breach detected_at timestamp, which determines your GDPR 72h notification deadline.</p>
            </div>
          )}
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
              <Select value={tenantId} onValueChange={v => { setTenantId(v); setSelectedOutletId(""); }} data-testid="select-tenant-wrapper">
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
          {hasMultipleOutletCurrencies && (
            <div className="space-y-1.5">
              <Label>Affected Outlet (currencies differ — select for correct jurisdiction)</Label>
              <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
                <SelectTrigger data-testid="select-breach-outlet">
                  <SelectValue placeholder="All outlets (tenant currency)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All outlets</SelectItem>
                  {tenantOutlets.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name} ({o.currency_code || "?"})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 space-y-2">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Jurisdiction (auto-detected{hasMultipleOutletCurrencies && selectedOutlet ? " from outlet" : " from tenant"} currency)</p>
            <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="text-jurisdiction-authority">
              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono text-xs">{jurisdictionCurrency}</span>
              <span className="text-green-700 font-medium">
                {(selectedTenant || selectedOutlet) ? `${incidentJurisdiction.country} — ` : "Platform-wide — "}
                Notify: <strong>{incidentJurisdiction.breachAuthority}</strong>
              </span>
            </div>
            <p className="text-xs" data-testid="text-jurisdiction-deadline">
              Deadline: {incidentJurisdiction.breachDeadlineHours === 6 ? (
                <span className="text-amber-700 font-semibold">⚠️ {incidentJurisdiction.breachDeadlineHours} hours ({incidentJurisdiction.breachAuthority} requirement)</span>
              ) : (
                <span>{incidentJurisdiction.breachDeadlineHours} hours</span>
              )}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input data-testid="input-incident-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief incident title" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea data-testid="input-incident-description" value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What happened?" />
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
          <div className="p-3 border rounded-lg space-y-2 bg-orange-50">
            <p className="text-sm font-medium text-orange-900">DPA Notification Required?</p>
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={requiresDpa}
                  onChange={() => setRequiresDpa(true)}
                  data-testid="radio-dpa-yes"
                />
                Yes — likely to risk rights and freedoms
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={!requiresDpa}
                  onChange={() => setRequiresDpa(false)}
                  data-testid="radio-dpa-no"
                />
                No — low risk (document rationale below)
              </label>
            </div>
            {!requiresDpa && (
              <Textarea
                value={rationale}
                onChange={e => setRationale(e.target.value)}
                rows={2}
                placeholder="Document why DPA notification is not required..."
                data-testid="input-rationale"
              />
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !title || !description || (!requiresDpa && !rationale)}
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
  const [certinNotified, setCertinNotified] = useState(incident.certin_notified || false);
  const [certinNotifiedAt, setCertinNotifiedAt] = useState(
    incident.certin_notified_at ? new Date(incident.certin_notified_at).toISOString().slice(0, 16) : ""
  );
  const [certinRefNo, setCertinRefNo] = useState(incident.certin_reference_no || "");
  const [requiresDpa, setRequiresDpa] = useState(incident.requires_dpa_notification || false);
  const [rationale, setRationale] = useState(incident.notification_rationale || "");

  const certinDeadlineHours = 6;
  const detectedAt = new Date(incident.detected_at);
  const certinDeadline = new Date(detectedAt.getTime() + certinDeadlineHours * 60 * 60 * 1000);
  const certinRemaining = certinDeadline.getTime() - Date.now();
  const certinRemainingH = Math.max(0, certinRemaining / (1000 * 60 * 60));
  const certinRemainingM = Math.floor((certinRemainingH - Math.floor(certinRemainingH)) * 60);

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PATCH", `/api/admin/breach-incidents/${incident.id}`, {
        status, rootCause: rootCause || null, remediation: remediation || null,
        tenantNotified, authorityNotified,
        certinNotified, certinNotifiedAt: certinNotifiedAt ? new Date(certinNotifiedAt).toISOString() : null,
        certinReferenceNo: certinRefNo || null,
        requiresDpaNotification: requiresDpa,
        notificationRationale: rationale || null,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breach-incidents"] });
      announceToScreenReader("Incident updated successfully.");
      toast({ title: "Incident updated" });
      onClose();
    },
    onError: (e: any) => { announceToScreenReader("Error: " + e.message); toast({ variant: "destructive", title: "Error", description: e.message }); },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

          <div className="p-3 border rounded-lg bg-orange-50 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-orange-900">CERT-In Notification (India)</p>
              <span className="text-xs text-orange-700">Deadline: 6 hours from detection</span>
            </div>
            {certinRemaining > 0 && !incident.certin_notified && (
              <div className="flex items-center gap-1 text-xs font-semibold text-orange-700" data-testid="certin-countdown">
                <Clock className="h-3 w-3" />
                {Math.floor(certinRemainingH)}h {certinRemainingM}m remaining until CERT-In deadline
              </div>
            )}
            {certinRemaining <= 0 && !incident.certin_notified && (
              <p className="text-xs font-semibold text-red-600">⚠️ CERT-In 6-hour deadline has passed</p>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={certinNotified}
                onCheckedChange={c => setCertinNotified(c === true)}
                data-testid="checkbox-certin-notified"
              />
              CERT-In has been notified
            </label>
            {certinNotified && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Notified at</Label>
                  <Input
                    type="datetime-local"
                    value={certinNotifiedAt}
                    onChange={e => setCertinNotifiedAt(e.target.value)}
                    data-testid="input-certin-notified-at"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CERT-In Reference Number</Label>
                  <Input
                    value={certinRefNo}
                    onChange={e => setCertinRefNo(e.target.value)}
                    placeholder="CERT-IN-2026-XXXXX"
                    data-testid="input-certin-ref"
                  />
                </div>
              </>
            )}
          </div>

          <div className="p-3 border rounded-lg space-y-2">
            <p className="text-sm font-medium">DPA Notification Required?</p>
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={requiresDpa}
                  onChange={() => setRequiresDpa(true)}
                  data-testid="radio-requires-dpa-yes"
                />
                Yes — likely to risk rights and freedoms
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={!requiresDpa}
                  onChange={() => setRequiresDpa(false)}
                  data-testid="radio-requires-dpa-no"
                />
                No — low risk (document rationale below)
              </label>
            </div>
            <Textarea
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              rows={2}
              placeholder="e.g. Exposed data was hashed/encrypted"
              data-testid="input-notification-rationale"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || (!requiresDpa && !rationale)} data-testid="button-submit-status">
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
  const [activeTab, setActiveTab] = useState<"incidents" | "detection">("incidents");
  const [escalateFromAlert, setEscalateFromAlert] = useState<DetectionAlert | null>(null);

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

  const { data: detectionData } = useQuery<{ data: DetectionAlert[]; total: number }>({
    queryKey: ["/api/admin/detection-alerts", false],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/detection-alerts?acknowledged=false&limit=50");
      return r.json();
    },
    refetchInterval: 30000,
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
  const unacknowledgedDetectionCount = detectionData?.total || 0;

  const isOpen = (incident: BreachIncident) => !["resolved"].includes(incident.status);

  return (
    <div className="p-6 space-y-6" data-testid="breach-incidents-page">
      <PageTitle title="Breach Incidents" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-red-600" />
          <h1 className="text-2xl font-bold" data-testid="text-breach-title">Data Breach Incidents</h1>
        </div>
        {activeTab === "incidents" && (
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
        )}
      </div>

      <div className="flex border-b" data-testid="breach-page-tabs">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "incidents" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("incidents")}
          data-testid="tab-formal-incidents"
        >
          Formal Incidents ({incidents.length})
        </button>
        <button
          className={`relative px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "detection" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("detection")}
          data-testid="tab-detection-alerts"
        >
          Detection Alerts
          {unacknowledgedDetectionCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full" data-testid="badge-detection-count">
              {unacknowledgedDetectionCount} NEW
            </span>
          )}
        </button>
      </div>

      {activeTab === "detection" && (
        <DetectionAlertsTab
          onEscalate={(alert) => {
            setEscalateFromAlert(alert);
            setShowLog(true);
            setActiveTab("incidents");
          }}
        />
      )}

      {activeTab === "incidents" && (
        <>
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
                      {incident.certin_notified && (
                        <span className="text-xs text-green-600">✅ CERT-In notified</span>
                      )}
                    </div>
                    <p className="font-semibold text-sm mb-1">{incident.title}</p>
                    <p className="text-xs text-muted-foreground mb-1">
                      {incident.tenant_name ? `Tenant: ${incident.tenant_name}` : "Platform-wide"}
                      {" · "}
                      Detected: {format(new Date(incident.detected_at), "d MMM yyyy HH:mm")}
                      {incident.affected_records > 0 && ` · Records: ${incident.affected_records.toLocaleString()}`}
                    </p>
                    {isOpen(incident) && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        <CountdownTimer
                          detectedAt={incident.detected_at}
                          hours={72}
                          label="GDPR 72h"
                          colorClass="text-amber-600"
                        />
                        {!incident.certin_notified && (
                          <CountdownTimer
                            detectedAt={incident.detected_at}
                            hours={6}
                            label="CERT-In 6h"
                            colorClass="text-orange-600"
                          />
                        )}
                      </div>
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
          onClose={() => { setShowLog(false); setEscalateFromAlert(null); }}
          tenants={Array.isArray(tenants) ? tenants : []}
          prefill={escalateFromAlert ? {
            title: escalateFromAlert.title,
            description: escalateFromAlert.description || "",
            severity: escalateFromAlert.severity === "critical" ? "critical" : escalateFromAlert.severity === "high" ? "high" : "medium",
            detectedAt: escalateFromAlert.created_at,
          } : undefined}
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
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{viewIncident.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex gap-2 flex-wrap">
                <Badge className={SEVERITY_COLORS[viewIncident.severity]}>{viewIncident.severity}</Badge>
                <Badge className={STATUS_COLORS[viewIncident.status]}>{viewIncident.status}</Badge>
                {viewIncident.certin_notified && <Badge className="bg-green-100 text-green-800">CERT-In Notified</Badge>}
              </div>
              <p className="text-muted-foreground">{viewIncident.description}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Detected:</span> {format(new Date(viewIncident.detected_at), "d MMM yyyy HH:mm")}</div>
                <div><span className="text-muted-foreground">GDPR Deadline:</span> {format(new Date(viewIncident.notification_deadline), "d MMM yyyy HH:mm")}</div>
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
              <div className="flex gap-4 text-xs flex-wrap">
                <span className={viewIncident.tenant_notified ? "text-green-600" : "text-muted-foreground"}>
                  {viewIncident.tenant_notified ? "✓" : "○"} Tenant notified
                </span>
                <span className={viewIncident.authority_notified ? "text-green-600" : "text-muted-foreground"}>
                  {viewIncident.authority_notified ? "✓" : "○"} Authority notified
                </span>
                <span className={viewIncident.certin_notified ? "text-green-600" : "text-muted-foreground"}>
                  {viewIncident.certin_notified ? "✓" : "○"} CERT-In notified
                  {viewIncident.certin_reference_no && ` (${viewIncident.certin_reference_no})`}
                </span>
              </div>
              {viewIncident.notification_rationale && (
                <div><span className="text-muted-foreground text-xs">DPA rationale: </span><span className="text-xs">{viewIncident.notification_rationale}</span></div>
              )}
              {viewIncident.reported_by_name && (
                <p className="text-xs text-muted-foreground">Reported by: {viewIncident.reported_by_name}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
        </>
      )}
    </div>
  );
}
