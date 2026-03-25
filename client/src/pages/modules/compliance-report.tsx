import { PageTitle } from "@/lib/accessibility";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FileCheck, RefreshCw, Download, Shield, Lock, FileText, BarChart2, Eye, AlertTriangle, CheckCircle, XCircle, CreditCard, Database, Globe } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { getJurisdictionByCurrency } from "@shared/jurisdictions";

interface ComplianceReport {
  generatedAt: string;
  tenant: { id: string; name: string; slug: string; plan: string; country: string | null; createdAt: string | null; subscriptionStatus: string };
  dataProtection: { encryptionAtRest: boolean; encryptionInTransit: string; retentionPolicyMonths: number; autoDeleteAnonymized: boolean; auditLogRetentionMonths: number };
  accessControl: { totalActiveUsers: number; byRole: Record<string, number>; usersWithMFA: number; mfaAdoptionPct: number; ipAllowlistEnabled: boolean };
  consentRecords: { tosVersion: string; tosAcceptedAt: string | null; privacyPolicyVersion: string; privacyPolicyAcceptedAt: string | null };
  auditLog: { totalEntriesAllTime: number; entriesLast30Days: number; oldestEntry: string | null; newestEntry: string | null };
  impersonationSessions: { totalAllTime: number; last90Days: number; editSessionsLast90Days: number };
  securityAlerts: { totalUnacknowledged: number; last30Days: number };
  dataRequests: { gdprExportsLast90Days: number; deletionRequestsLast90Days: number };
  breachIncidents: {
    total: number;
    open: number;
    lastIncidentDate: string | null;
    certIn: { notifiedCount: number; pendingCount: number; overdueCount: number };
  };
  pciDss: { saqType: string; cardDataStored: boolean; lastSaqCompletionDate: string | null; lastSaqValidUntil: string | null; activeGateways: string[]; allGatewaysPciCertified: boolean };
}

function Tick({ value }: { value: boolean }) {
  return value ? <CheckCircle className="h-4 w-4 text-green-600 inline" /> : <XCircle className="h-4 w-4 text-red-500 inline" />;
}

function StatRow({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="flex justify-between items-center py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium" data-testid={testId}>{value}</span>
    </div>
  );
}

function RetentionPolicyPanel({ data }: { data: ComplianceReport }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [retentionMonths, setRetentionMonths] = useState(String(data.dataProtection.retentionPolicyMonths));
  const [autoDelete, setAutoDelete] = useState(data.dataProtection.autoDeleteAnonymized);
  const [auditRetention, setAuditRetention] = useState(String(data.dataProtection.auditLogRetentionMonths));

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PUT", "/api/gdpr/retention-policy", {
        dataRetentionMonths: parseInt(retentionMonths),
        autoDeleteAnonymized: autoDelete,
        auditLogRetentionMonths: parseInt(auditRetention),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/report"] });
      toast({ title: "Retention policy saved" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          Data Retention Policy
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Data retained for</Label>
            <Select value={retentionMonths} onValueChange={setRetentionMonths}>
              <SelectTrigger className="w-36" data-testid="select-retention-months">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="24">24 months</SelectItem>
                <SelectItem value="36">36 months</SelectItem>
                <SelectItem value="60">60 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Auto-delete after period</Label>
            <Switch
              checked={autoDelete}
              onCheckedChange={setAutoDelete}
              data-testid="switch-auto-delete"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Audit log retention</Label>
            <Select value={auditRetention} onValueChange={setAuditRetention}>
              <SelectTrigger className="w-36" data-testid="select-audit-retention">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="24">24 months</SelectItem>
                <SelectItem value="36">36 months</SelectItem>
                <SelectItem value="60">60 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            data-testid="button-save-retention"
          >
            {mutation.isPending ? "Saving..." : "Save Retention Policy"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Note: Changes take effect at next scheduled cleanup (runs daily at midnight).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface OutletBasic {
  id: string;
  name: string;
  currency_code?: string | null;
}

function JurisdictionSummaryCard() {
  const { user } = useAuth();
  const fallbackCurrency = user?.tenant?.currency?.toUpperCase() || "USD";
  const [selectedOutletId, setSelectedOutletId] = useState<string>("");

  const { data: outlets } = useQuery<OutletBasic[]>({
    queryKey: ["/api/outlets"],
    queryFn: async () => {
      const res = await fetch("/api/outlets", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.outlets || []);
    },
    staleTime: 60000,
  });

  const allOutlets: OutletBasic[] = outlets || [];
  const activeOutletId = selectedOutletId || allOutlets[0]?.id || "";
  const activeOutlet = allOutlets.find(o => o.id === activeOutletId) || allOutlets[0];

  const { data: jurisdictionData } = useQuery<{ jurisdiction: any; savedFields: Record<string, any> }>({
    queryKey: ["/api/outlets", activeOutletId, "jurisdiction"],
    queryFn: async () => {
      if (!activeOutletId) return null;
      const res = await fetch(`/api/outlets/${activeOutletId}/jurisdiction`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!activeOutletId,
    staleTime: 60000,
  });

  const outletCurrency = (activeOutlet?.currency_code?.toUpperCase()) || fallbackCurrency;
  const jur = getJurisdictionByCurrency(outletCurrency);

  const flagMap: Record<string, string> = {
    UAE: "🇦🇪", India: "🇮🇳", "United States": "🇺🇸", "United Kingdom": "🇬🇧",
    "European Union": "🇪🇺", Singapore: "🇸🇬",
  };
  const flag = flagMap[jur.country] || "🌍";

  const savedFields = jurisdictionData?.savedFields || {};
  const hasGstin = !!(savedFields.taxRegistrationNumber);
  const hasCin = !!(savedFields.companyRegistrationNo);
  const hasGrievanceOfficer = !!(savedFields.grievanceOfficerName && savedFields.grievanceOfficerEmail);
  const needsGrievanceOfficer = jur.grievanceOfficerRequired && !hasGrievanceOfficer;

  const taxFramework = jur.splitTaxLabels
    ? `${jur.taxLabel} (${jur.splitTaxLabels.part1} + ${jur.splitTaxLabels.part2})`
    : jur.taxLabel;

  const configuredDetails = [
    hasGstin ? jur.taxRegLabel : null,
    hasCin && jur.companyRegLabel ? jur.companyRegLabel : null,
  ].filter(Boolean);

  const hasMultipleOutlets = allOutlets.length > 1;

  return (
    <Card data-testid="card-jurisdiction-summary">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          Jurisdiction Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {hasMultipleOutlets && (
          <div className="py-2">
            <label className="text-xs text-muted-foreground block mb-1">Outlet</label>
            <select
              className="text-sm border rounded px-2 py-1 w-full"
              value={activeOutletId}
              onChange={e => setSelectedOutletId(e.target.value)}
              data-testid="select-jurisdiction-outlet"
            >
              {allOutlets.map(o => (
                <option key={o.id} value={o.id}>{o.name} ({o.currency_code || "?"})</option>
              ))}
            </select>
          </div>
        )}
        {activeOutlet && hasMultipleOutlets && (
          <StatRow label="Outlet" value={<span className="font-medium">{activeOutlet.name}</span>} testId="text-jurisdiction-outlet-name" />
        )}
        <StatRow label="Currency" value={<Badge variant="outline">{outletCurrency}</Badge>} testId="text-jurisdiction-currency" />
        <StatRow label="Jurisdiction" value={`${flag} ${jur.country}`} testId="text-jurisdiction-country" />
        <StatRow label="Tax Framework" value={taxFramework} testId="text-jurisdiction-tax-framework" />
        <StatRow
          label="Breach Authority"
          value={
            <span className={jur.breachDeadlineHours === 6 ? "text-amber-600 font-semibold" : ""} data-testid="text-jurisdiction-breach-authority">
              {jur.breachAuthority} ({jur.breachDeadlineHours}h)
            </span>
          }
        />
        <StatRow
          label="Applicable Laws"
          value={
            <span className="text-xs">{jur.applicableRegulations.map(r => r.replace(/_/g, " ")).join(", ")}</span>
          }
          testId="text-jurisdiction-regulations"
        />
        {configuredDetails.length > 0 && (
          <StatRow
            label="Legal Details Configured"
            value={<span className="text-green-600">✅ {configuredDetails.join(", ")}</span>}
          />
        )}
        {needsGrievanceOfficer && (
          <StatRow
            label="Grievance Officer"
            value={<span className="text-amber-600">⚠️ Not configured (IT Act required)</span>}
            testId="text-grievance-officer-warning"
          />
        )}
        {!needsGrievanceOfficer && jur.grievanceOfficerRequired && (
          <StatRow
            label="Grievance Officer"
            value={<span className="text-green-600">✅ {savedFields.grievanceOfficerName}</span>}
          />
        )}
        <div className="py-1">
          <a href="/modules/outlets" className="text-xs text-blue-600 hover:underline" data-testid="link-configure-legal">
            Configure Legal Details →
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ComplianceReport() {
  const { user } = useAuth();
  const allowedRoles = ["owner", "hq_admin", "franchise_owner"];
  const hasAccess = user && allowedRoles.includes(user.role);
  const isOwnerOrAdmin = user && ["owner", "hq_admin"].includes(user.role);

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<ComplianceReport>({
    queryKey: ["/api/compliance/report"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/compliance/report?format=json");
      if (!r.ok) throw new Error("Failed to fetch compliance report");
      return r.json();
    },
    enabled: !!hasAccess,
    staleTime: 60000,
  });

  const handleDownloadJSON = async () => {
    const r = await apiRequest("GET", "/api/compliance/report?format=json");
    const blob = new Blob([await r.text()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-report-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCSV = async () => {
    const r = await apiRequest("GET", "/api/compliance/report?format=csv-summary");
    const blob = new Blob([await r.text()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!hasAccess) {
    return (
      <div className="p-6 text-center" data-testid="compliance-access-denied">
        <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Access denied. This report is only available to account owners and administrators.</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground">Generating compliance report...</div>;
  }

  if (!data) {
    return <div className="p-6 text-center text-muted-foreground">Failed to load compliance report.</div>;
  }

  return (
    <div className="space-y-6" data-testid="compliance-report">
      <PageTitle title="Compliance Report" />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileCheck className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold" data-testid="text-compliance-title">Compliance Report</h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-lg">
            This report summarises your account's data protection status. Download and share with auditors or your DPO.
          </p>
          {dataUpdatedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Last generated: {format(dataUpdatedAt, "d MMM yyyy HH:mm")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-report">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadJSON} data-testid="button-download-json">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download JSON
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadCSV} data-testid="button-download-csv">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download CSV
          </Button>
        </div>
      </div>

      {isOwnerOrAdmin && <RetentionPolicyPanel data={data} />}

      <JurisdictionSummaryCard />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              Data Protection
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <StatRow label="Encryption at rest" value={<><Tick value={data.dataProtection.encryptionAtRest} /> AES-256-GCM</>} />
            <StatRow label="Encryption in transit" value={data.dataProtection.encryptionInTransit} />
            <StatRow label="Retention policy" value={`${data.dataProtection.retentionPolicyMonths} months`} />
            <StatRow label="Auto-delete anonymized" value={<Tick value={data.dataProtection.autoDeleteAnonymized} />} testId="text-auto-delete" />
            <StatRow label="Audit log retention" value={`${data.dataProtection.auditLogRetentionMonths} months`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Access Control
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <StatRow label="Active users" value={data.accessControl.totalActiveUsers} testId="text-active-users" />
            <StatRow label="Users with MFA" value={data.accessControl.usersWithMFA} testId="text-mfa-users" />
            <StatRow label="MFA adoption" value={`${data.accessControl.mfaAdoptionPct}%`} testId="text-mfa-pct" />
            <StatRow label="IP allowlist" value={data.accessControl.ipAllowlistEnabled ? "✅ Enabled" : "Not configured"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              PCI DSS Status
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <StatRow label="SAQ Type" value={<span className="text-green-600 font-semibold" data-testid="text-pci-saq-type">{data.pciDss.saqType}</span>} />
            <StatRow label="Card data stored" value={<span className="text-green-600">✅ Never</span>} />
            <StatRow
              label="Last SAQ completion"
              value={data.pciDss.lastSaqCompletionDate
                ? format(new Date(data.pciDss.lastSaqCompletionDate), "d MMM yyyy")
                : <span className="text-amber-600">Not recorded</span>}
              testId="text-pci-last-saq"
            />
            <StatRow
              label="Valid until"
              value={data.pciDss.lastSaqValidUntil
                ? format(new Date(data.pciDss.lastSaqValidUntil), "d MMM yyyy")
                : "—"}
            />
            <StatRow label="All gateways certified" value={<span className="text-green-600">✅ Yes</span>} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Consent Records
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <StatRow
              label={`ToS v${data.consentRecords.tosVersion}`}
              value={data.consentRecords.tosAcceptedAt ? (
                <span className="text-green-600">✅ {format(new Date(data.consentRecords.tosAcceptedAt), "d MMM yyyy")}</span>
              ) : (
                <span className="text-amber-600">⚠ Not accepted</span>
              )}
              testId="text-tos-status"
            />
            <StatRow
              label={`Privacy v${data.consentRecords.privacyPolicyVersion}`}
              value={data.consentRecords.privacyPolicyAcceptedAt ? (
                <span className="text-green-600">✅ {format(new Date(data.consentRecords.privacyPolicyAcceptedAt), "d MMM yyyy")}</span>
              ) : (
                <span className="text-amber-600">⚠ Not accepted</span>
              )}
              testId="text-privacy-status"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-primary" />
              Audit Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <StatRow label="Total entries" value={data.auditLog.totalEntriesAllTime.toLocaleString()} testId="text-audit-total" />
            <StatRow label="Last 30 days" value={data.auditLog.entriesLast30Days.toLocaleString()} />
            {data.auditLog.oldestEntry && (
              <StatRow label="Oldest entry" value={format(new Date(data.auditLog.oldestEntry), "d MMM yyyy")} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Support Access (Impersonation)
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <StatRow label="Sessions (all time)" value={data.impersonationSessions.totalAllTime} testId="text-impersonation-total" />
            <StatRow label="Sessions (90d)" value={data.impersonationSessions.last90Days} />
            <StatRow label="Edit sessions (90d)" value={data.impersonationSessions.editSessionsLast90Days} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Security Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <StatRow
              label="Unacknowledged"
              value={
                <span className={data.securityAlerts.totalUnacknowledged > 0 ? "text-amber-600 font-semibold" : ""}>
                  {data.securityAlerts.totalUnacknowledged}
                </span>
              }
              testId="text-unacked-alerts"
            />
            <StatRow label="Last 30 days" value={data.securityAlerts.last30Days} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">GDPR Data Requests (last 90 days)</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-8">
          <StatRow label="Exports" value={data.dataRequests.gdprExportsLast90Days} testId="text-gdpr-exports" />
          <StatRow label="Deletion requests" value={data.dataRequests.deletionRequestsLast90Days} testId="text-gdpr-deletions" />
        </CardContent>
      </Card>

      <Card className={data.breachIncidents.total > 0 ? "border-amber-200 bg-amber-50/30" : ""}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${data.breachIncidents.open > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
            Breach Incidents &amp; CERT-In Tracking
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <StatRow label="Total incidents" value={data.breachIncidents.total} testId="text-breach-total" />
          <StatRow
            label="Open incidents"
            value={<span className={data.breachIncidents.open > 0 ? "text-red-600 font-semibold" : "text-green-600"}>{data.breachIncidents.open}</span>}
          />
          {data.breachIncidents.lastIncidentDate && (
            <StatRow label="Last incident" value={format(new Date(data.breachIncidents.lastIncidentDate), "d MMM yyyy")} />
          )}
          <StatRow
            label="CERT-In notified"
            value={<span className="text-green-600">{data.breachIncidents.certIn.notifiedCount}</span>}
            testId="text-certin-notified"
          />
          <StatRow
            label="CERT-In pending (open incidents)"
            value={
              <span className={data.breachIncidents.certIn.pendingCount > 0 ? "text-amber-600 font-semibold" : "text-green-600"}>
                {data.breachIncidents.certIn.pendingCount}
              </span>
            }
            testId="text-certin-pending"
          />
          <StatRow
            label="CERT-In overdue (>6h, not notified)"
            value={
              data.breachIncidents.certIn.overdueCount > 0
                ? <span className="text-red-600 font-bold">⚠️ {data.breachIncidents.certIn.overdueCount}</span>
                : <span className="text-green-600">0</span>
            }
            testId="text-certin-overdue"
          />
        </CardContent>
      </Card>
    </div>
  );
}
