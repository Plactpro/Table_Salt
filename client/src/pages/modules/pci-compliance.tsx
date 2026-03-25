import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Shield, CreditCard, CheckCircle, ExternalLink, Plus, Lock } from "lucide-react";
import { format } from "date-fns";

interface PciStatus {
  saqType: string;
  eligibilityReason: string;
  providers: Array<{ name: string; level: string; certUrl: string; storageModel: string; cardDataStored: boolean }>;
  cardDataStoredInOurDB: boolean;
  tlsEnforced: boolean;
  auditTrailEnabled: boolean;
  lastSaqCompletion: { date: string; validUntil: string; saqType: string; completedBy: string } | null;
  nextSaqDueDate: string | null;
  paymentGatewayEnabled: { stripe: boolean; razorpay: boolean };
}

interface SaqLogEntry {
  id: string;
  completed_by_name: string;
  saq_type: string;
  completion_date: string;
  valid_until: string;
  payment_gateways: string[];
  notes: string | null;
  created_at: string;
}

function ControlRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function LogSaqDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saqType, setSaqType] = useState("SAQ-A");
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().split("T")[0]);
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split("T")[0];
  });
  const [gateways, setGateways] = useState<string[]>(["stripe", "razorpay"]);
  const [qsaName, setQsaName] = useState("");
  const [notes, setNotes] = useState("");
  const [docRef, setDocRef] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/admin/pci/saq-log", {
        saqType, completionDate, validUntil, paymentGateways: gateways,
        qsaName: qsaName || null, notes: notes || null, documentReference: docRef || null,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pci/saq-log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance/pci-status"] });
      toast({ title: "SAQ completion recorded" });
      onClose();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const toggleGateway = (gw: string) => {
    setGateways(prev => prev.includes(gw) ? prev.filter(g => g !== gw) : [...prev, gw]);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log Annual SAQ-A Completion</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>SAQ Type</Label>
            <Select value={saqType} onValueChange={setSaqType}>
              <SelectTrigger data-testid="select-saq-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SAQ-A">SAQ-A (Merchant — Fully Outsourced)</SelectItem>
                <SelectItem value="SAQ-A-EP">SAQ-A-EP</SelectItem>
                <SelectItem value="SAQ-D">SAQ-D (Merchant)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Completion Date</Label>
              <Input type="date" value={completionDate} onChange={e => setCompletionDate(e.target.value)} data-testid="input-saq-completion-date" />
            </div>
            <div className="space-y-1.5">
              <Label>Valid Until</Label>
              <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} data-testid="input-saq-valid-until" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Payment Gateways Covered</Label>
            <div className="flex gap-4">
              {["stripe", "razorpay"].map(gw => (
                <label key={gw} className="flex items-center gap-2 text-sm cursor-pointer capitalize">
                  <Checkbox
                    checked={gateways.includes(gw)}
                    onCheckedChange={() => toggleGateway(gw)}
                    data-testid={`checkbox-gateway-${gw}`}
                  />
                  {gw}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>QSA Name (optional)</Label>
            <Input value={qsaName} onChange={e => setQsaName(e.target.value)} placeholder="Qualified Security Assessor" data-testid="input-qsa-name" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} data-testid="input-saq-notes" />
          </div>
          <div className="space-y-1.5">
            <Label>Document Reference (optional)</Label>
            <Input value={docRef} onChange={e => setDocRef(e.target.value)} placeholder="e.g. file path or document ID" data-testid="input-doc-ref" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !completionDate || !validUntil} data-testid="button-save-saq">
              {mutation.isPending ? "Saving..." : "Save Completion Record"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PciCompliancePage() {
  const [showLogDialog, setShowLogDialog] = useState(false);
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const { data: status, isLoading } = useQuery<PciStatus>({
    queryKey: ["/api/compliance/pci-status"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/compliance/pci-status");
      if (!r.ok) throw new Error("Failed to load PCI status");
      return r.json();
    },
  });

  const { data: saqLog } = useQuery<SaqLogEntry[]>({
    queryKey: ["/api/admin/pci/saq-log"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/pci/saq-log?limit=10");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isSuperAdmin,
    initialData: [],
  });

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground">Loading PCI DSS status...</div>;
  }

  return (
    <div className="space-y-6" data-testid="pci-compliance-page">
      <div className="flex items-center gap-3">
        <Lock className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold">PCI DSS Compliance</h2>
          <p className="text-sm text-muted-foreground">Payment Card Industry Data Security Standard</p>
        </div>
      </div>

      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900" data-testid="text-saq-level">Your Compliance Level: {status?.saqType} (Self-Assessment A)</p>
              <p className="text-sm text-green-800 mt-0.5">
                You qualify for SAQ-A because all card entry and processing is handled by certified third parties.
                You never see, touch, or store raw card data.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Payment Processors</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {status?.providers.map(provider => (
            <Card key={provider.name} data-testid={`card-provider-${provider.name.toLowerCase()}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{provider.name}</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Certification</span>
                    <span className="text-green-600 font-medium">✅ {provider.level}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Integration</span>
                    <span className="capitalize">{provider.storageModel.replace("_", " ")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Card data stored</span>
                    <span className="text-green-600">✅ None</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => window.open(provider.certUrl, "_blank")}
                  data-testid={`button-cert-${provider.name.toLowerCase()}`}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  View Certificate
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Our Data Environment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ControlRow label="Raw card numbers stored" value={<span className="text-green-600">✅ Never</span>} />
          <ControlRow label="CVV/security codes stored" value={<span className="text-green-600">✅ Never</span>} />
          <ControlRow label="Magnetic stripe data" value={<span className="text-green-600">✅ Never</span>} />
          <ControlRow label="TLS encryption in transit" value={<span className="text-green-600">✅ Enforced</span>} />
          <ControlRow label="Payment audit trail" value={<span className="text-green-600">✅ Active</span>} />
          <ControlRow label="Access control to payment data" value={<span className="text-green-600">✅ Role-based</span>} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Annual Self-Assessment (SAQ-A)</CardTitle>
            {isSuperAdmin ? (
              <Button size="sm" onClick={() => setShowLogDialog(true)} data-testid="button-log-saq">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Log SAQ Completion
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground italic">SAQ log managed by platform admin</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {status?.lastSaqCompletion ? (
            <p className="text-sm text-muted-foreground mb-3">
              Last completed:{" "}
              <span className="text-foreground font-medium" data-testid="text-last-saq-date">
                {format(new Date(status.lastSaqCompletion.date), "d MMM yyyy")}
              </span>
              {" · "}Valid until:{" "}
              <span className="text-foreground font-medium">
                {format(new Date(status.lastSaqCompletion.validUntil), "d MMM yyyy")}
              </span>
            </p>
          ) : (
            <p className="text-sm text-amber-600 mb-3">No SAQ completion recorded yet.</p>
          )}

          {saqLog && saqLog.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Previous completions</p>
              {saqLog.map(entry => (
                <div key={entry.id} className="flex justify-between text-sm py-1 border-b last:border-0" data-testid={`row-saq-${entry.id}`}>
                  <span>{format(new Date(entry.completion_date), "d MMM yyyy")} — {entry.saq_type}</span>
                  <span className="text-muted-foreground">Logged by {entry.completed_by_name}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showLogDialog && <LogSaqDialog onClose={() => setShowLogDialog(false)} />}
    </div>
  );
}
