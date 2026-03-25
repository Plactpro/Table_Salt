import { PageTitle } from "@/lib/accessibility";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Shield, Download, Trash2, FileText, Database, Lock } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";

interface ConsentStatus {
  tos: { version: string; acceptedAt: string } | null;
  privacy_policy: { version: string; acceptedAt: string } | null;
  platform: { tosVersion: string; privacyVersion: string };
}

interface RetentionPolicy {
  dataRetentionMonths: number;
  autoDeleteAnonymized: boolean;
  auditLogRetentionMonths: number;
}

const RESTRICTION_REASON_LABELS: Record<string, string> = {
  accuracy_contested: "I am disputing the accuracy of my data",
  unlawful_processing: "Processing is unlawful but I don't want deletion",
  legal_claim: "I need my data preserved for a legal claim",
  objection_pending: "I have objected to processing (pending review)",
};

interface RestrictionStatus {
  restricted: boolean;
  requestedAt: string | null;
  reason: string | null;
  liftedAt: string | null;
}

function RestrictProcessingDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/gdpr/restrict-processing", { reason });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Restriction requested", description: "Processing restriction has been applied." });
      onClose();
      setTimeout(() => window.location.reload(), 1500);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  if (!confirmed) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Right to Restrict Processing</DialogTitle>
            <DialogDescription>Choose the reason for your restriction request (GDPR Art. 18)</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {Object.entries(RESTRICTION_REASON_LABELS).map(([value, label]) => (
              <label
                key={value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${reason === value ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                data-testid={`radio-restriction-reason-${value}`}
              >
                <input
                  type="radio"
                  name="restriction-reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                  className="mt-0.5"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => setConfirmed(true)}
              disabled={!reason}
              data-testid="button-next-confirm-restriction"
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Restriction Request</DialogTitle>
          <DialogDescription>
            This will pause all write operations on your account.
            You will still be able to log in and view your data.
            This cannot be self-reversed — contact your admin to lift it.
          </DialogDescription>
        </DialogHeader>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          ⚠️ Reason: <strong>{RESTRICTION_REASON_LABELS[reason]}</strong>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setConfirmed(false)}>Back</Button>
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            data-testid="button-confirm-restriction"
          >
            {mutation.isPending ? "Requesting..." : "Yes, Request Restriction"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/gdpr/delete-account", { password });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Account deletion requested", description: "Your data has been anonymized." });
      onClose();
      setTimeout(() => { window.location.href = "/login"; }, 2000);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">Request Account Deletion</DialogTitle>
          <DialogDescription>
            This will permanently anonymize your personal data. Operational records are kept for legal compliance.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            ⚠️ Your account will be anonymized immediately. You will be logged out.
          </div>
          <div className="space-y-1.5">
            <Label>Confirm your password</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your current password"
              data-testid="input-delete-password"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !password}
              data-testid="button-confirm-delete"
            >
              {mutation.isPending ? "Processing..." : "Delete My Account"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function GdprRightsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRestrictDialog, setShowRestrictDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { data: restrictionStatus, refetch: refetchRestriction } = useQuery<RestrictionStatus>({
    queryKey: ["/api/gdpr/restriction-status"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/gdpr/restriction-status");
      if (!r.ok) return { restricted: false, requestedAt: null, reason: null, liftedAt: null };
      return r.json();
    },
  });

  const { data: consentStatus } = useQuery<ConsentStatus>({
    queryKey: ["/api/consent/status"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/consent/status");
      return r.json();
    },
  });

  const { data: retention } = useQuery<RetentionPolicy>({
    queryKey: ["/api/gdpr/retention-policy"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/gdpr/retention-policy");
      if (!r.ok) return null;
      return r.json();
    },
  });

  const handleExportJSON = async () => {
    setIsExporting(true);
    try {
      const r = await apiRequest("POST", "/api/gdpr/export", {});
      if (!r.ok) throw new Error("Failed to request export");
      const { downloadUrl } = await r.json();
      const dl = await fetch(downloadUrl);
      if (!dl.ok) throw new Error("Download failed");
      const blob = new Blob([await dl.text()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-data-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded", description: "Your data export has been downloaded." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Export failed", description: e.message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const r = await apiRequest("POST", "/api/gdpr/export", {});
      if (!r.ok) throw new Error("Failed to request export");
      const { downloadUrl } = await r.json();
      const dl = await fetch(`${downloadUrl}&format=csv`);
      if (!dl.ok) throw new Error("Download failed");
      const blob = new Blob([await dl.text()], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-data-export-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded", description: "Your data export (CSV) has been downloaded." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Export failed", description: e.message });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="gdpr-rights-page">
      <PageTitle title="Privacy & GDPR" />
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold">Your Privacy Rights</h2>
          <p className="text-sm text-muted-foreground">GDPR Article 20 — Data Portability and Right to Erasure</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            Right to Access Your Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Download everything Table Salt holds about you, including your profile, order history, activity log, and consent records.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleExportJSON}
              disabled={isExporting}
              data-testid="button-export-json"
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? "Preparing..." : "Download as JSON"}
            </Button>
            <Button
              variant="outline"
              onClick={handleExportCSV}
              disabled={isExporting}
              data-testid="button-export-csv"
            >
              <FileText className="h-4 w-4 mr-2" />
              Download as CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className={restrictionStatus?.restricted ? "border-amber-300" : ""} data-testid="card-restriction-status">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-600" />
            Right to Restrict Processing
            <span className="text-xs font-normal text-muted-foreground ml-1">Article 18, GDPR</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {restrictionStatus?.restricted ? (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg" data-testid="status-restriction-active">
              <p className="text-sm font-medium text-amber-800">
                ⚠️ RESTRICTION ACTIVE
                {restrictionStatus.requestedAt && (
                  <span className="font-normal"> since {format(new Date(restrictionStatus.requestedAt), "d MMM yyyy")}</span>
                )}
              </p>
              {restrictionStatus.reason && (
                <p className="text-sm text-amber-700 mt-1">
                  Reason: {RESTRICTION_REASON_LABELS[restrictionStatus.reason] ?? restrictionStatus.reason}
                </p>
              )}
              <p className="text-sm text-amber-700 mt-1">
                Write operations on your account are currently paused. Contact your administrator to lift the restriction.
              </p>
            </div>
          ) : (
            <div className="mb-4 p-3 bg-green-50 border border-green-100 rounded-lg" data-testid="status-restriction-inactive">
              <p className="text-sm text-green-700">✅ Not restricted — all processing normal</p>
            </div>
          )}
          <div className="mb-4 space-y-1.5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground text-xs uppercase tracking-wide mb-2">When should you request restriction?</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>You believe your data is inaccurate and want it frozen while you contest it</li>
              <li>Processing is unlawful but you prefer restriction over deletion</li>
              <li>You need your data preserved for a legal claim</li>
              <li>You have objected to processing (Art. 21) and want processing paused while we verify</li>
            </ul>
          </div>
          {!restrictionStatus?.restricted && (
            <>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => setShowRestrictDialog(true)}
                data-testid="button-request-restriction"
              >
                <Lock className="h-3.5 w-3.5 mr-1.5" />
                Request Processing Restriction
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Restriction is honoured within 1 business day. We will contact you at your email to confirm.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-red-100">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-red-700">
            <Trash2 className="h-4 w-4" />
            Right to Be Forgotten
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-1">
            Permanently remove your personal data from the system.
          </p>
          <p className="text-sm text-amber-700 mb-3">
            ⚠️ This cannot be undone. Your account will be anonymized. Operational records are kept for legal compliance.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            data-testid="button-request-deletion"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Request Account Deletion
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Consent History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {consentStatus ? (
            <div className="space-y-2">
              {consentStatus.tos ? (
                <div className="flex justify-between text-sm" data-testid="text-tos-consent">
                  <span className="text-muted-foreground">Terms of Service v{consentStatus.tos.version}</span>
                  <span className="text-green-600 font-medium">
                    ✅ Accepted {format(new Date(consentStatus.tos.acceptedAt), "d MMM yyyy HH:mm")}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Terms of Service v{consentStatus.platform?.tosVersion}</span>
                  <span className="text-amber-600">⚠ Not recorded</span>
                </div>
              )}
              {consentStatus.privacy_policy ? (
                <div className="flex justify-between text-sm" data-testid="text-privacy-consent">
                  <span className="text-muted-foreground">Privacy Policy v{consentStatus.privacy_policy.version}</span>
                  <span className="text-green-600 font-medium">
                    ✅ Accepted {format(new Date(consentStatus.privacy_policy.acceptedAt), "d MMM yyyy HH:mm")}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Privacy Policy v{consentStatus.platform?.privacyVersion}</span>
                  <span className="text-amber-600">⚠ Not recorded</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading consent records...</p>
          )}
        </CardContent>
      </Card>

      {retention && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Data Retention Policy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Your data is retained for</span>
                <span className="font-medium" data-testid="text-retention-months">{retention.dataRetentionMonths} months</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Auto-delete after retention</span>
                <span className={retention.autoDeleteAnonymized ? "text-green-600" : "text-muted-foreground"}>
                  {retention.autoDeleteAnonymized ? "✅ Enabled" : "Not enabled"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Configurable by account owner in Compliance settings.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {showDeleteDialog && <DeleteAccountDialog onClose={() => setShowDeleteDialog(false)} />}
      {showRestrictDialog && (
        <RestrictProcessingDialog onClose={() => { setShowRestrictDialog(false); refetchRestriction(); }} />
      )}
    </div>
  );
}
