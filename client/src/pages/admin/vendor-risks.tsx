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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Edit, Check, RefreshCw, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { PageTitle, announceToScreenReader } from "@/lib/accessibility";

interface VendorRisk {
  id: string;
  vendor_name: string;
  vendor_category: string;
  website: string | null;
  service_description: string | null;
  data_processed: string[];
  risk_level: string;
  compliance_certs: string[];
  dpa_in_place: boolean;
  dpa_signed_date: string | null;
  last_reviewed_at: string | null;
  next_review_due: string | null;
  notes: string | null;
  is_active: boolean;
  created_by_name: string | null;
  created_at: string;
}

const RISK_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200",
};

const RISK_ICONS: Record<string, string> = {
  critical: "🔴",
  high: "🟡",
  medium: "🟠",
  low: "🟢",
};

const CATEGORIES = [
  { value: "payment_processor", label: "Payment Processor" },
  { value: "hosting", label: "Hosting" },
  { value: "email", label: "Email" },
  { value: "cdn", label: "CDN" },
  { value: "analytics", label: "Analytics" },
  { value: "communication", label: "Communication" },
  { value: "authentication", label: "Authentication" },
  { value: "storage", label: "Storage" },
  { value: "other", label: "Other" },
];

const CERT_OPTIONS = [
  "PCI DSS Level 1", "SOC 2 Type 2", "ISO 27001", "GDPR Compliant",
  "HIPAA", "RBI Licensed PA", "Other",
];

function VendorDialog({
  vendor,
  onClose,
}: {
  vendor: VendorRisk | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [vendorName, setVendorName] = useState(vendor?.vendor_name || "");
  const [category, setCategory] = useState(vendor?.vendor_category || "other");
  const [website, setWebsite] = useState(vendor?.website || "");
  const [serviceDesc, setServiceDesc] = useState(vendor?.service_description || "");
  const [dataProcessed, setDataProcessed] = useState(vendor?.data_processed?.join(", ") || "");
  const [riskLevel, setRiskLevel] = useState(vendor?.risk_level || "medium");
  const [certs, setCerts] = useState<string[]>(vendor?.compliance_certs || []);
  const [dpaInPlace, setDpaInPlace] = useState(vendor?.dpa_in_place || false);
  const [dpaSignedDate, setDpaSignedDate] = useState(vendor?.dpa_signed_date?.split("T")[0] || "");
  const [lastReviewed, setLastReviewed] = useState(vendor?.last_reviewed_at?.split("T")[0] || "");
  const [nextReview, setNextReview] = useState(vendor?.next_review_due?.split("T")[0] || "");
  const [notes, setNotes] = useState(vendor?.notes || "");

  const toggleCert = (cert: string) => {
    setCerts(prev => prev.includes(cert) ? prev.filter(c => c !== cert) : [...prev, cert]);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        vendorName, vendorCategory: category,
        website: website || null, serviceDescription: serviceDesc || null,
        dataProcessed: dataProcessed.split(",").map(s => s.trim()).filter(Boolean),
        riskLevel, complianceCerts: certs, dpaInPlace,
        dpaSignedDate: dpaSignedDate || null,
        lastReviewedAt: lastReviewed || null,
        nextReviewDue: nextReview || null,
        notes: notes || null,
      };
      const r = vendor
        ? await apiRequest("PATCH", `/api/admin/vendor-risks/${vendor.id}`, body)
        : await apiRequest("POST", "/api/admin/vendor-risks", body);
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendor-risks"] });
      announceToScreenReader(vendor ? "Vendor updated successfully." : "Vendor added successfully.");
      toast({ title: vendor ? "Vendor updated" : "Vendor added" });
      onClose();
    },
    onError: (e: any) => { announceToScreenReader("Error: " + e.message); toast({ variant: "destructive", title: "Error", description: e.message }); },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vendor ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vendor Name</Label>
              <Input value={vendorName} onChange={e => setVendorName(e.target.value)} data-testid="input-vendor-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-vendor-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="stripe.com" data-testid="input-vendor-website" />
          </div>
          <div className="space-y-1.5">
            <Label>Service Description</Label>
            <Textarea value={serviceDesc} onChange={e => setServiceDesc(e.target.value)} rows={2} data-testid="input-vendor-description" />
          </div>
          <div className="space-y-1.5">
            <Label>Data Processed (comma-separated)</Label>
            <Input value={dataProcessed} onChange={e => setDataProcessed(e.target.value)} placeholder="email, payment amounts" data-testid="input-data-processed" />
          </div>
          <div className="space-y-1.5">
            <Label>Risk Level</Label>
            <Select value={riskLevel} onValueChange={setRiskLevel}>
              <SelectTrigger data-testid="select-risk-level">
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
          <div className="space-y-2">
            <Label>Compliance Certifications</Label>
            <div className="flex flex-wrap gap-2">
              {CERT_OPTIONS.map(cert => (
                <label key={cert} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={certs.includes(cert)}
                    onCheckedChange={() => toggleCert(cert)}
                    data-testid={`checkbox-cert-${cert.replace(/\s/g, "-").toLowerCase()}`}
                  />
                  {cert}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>DPA In Place</Label>
            <Switch checked={dpaInPlace} onCheckedChange={setDpaInPlace} data-testid="switch-dpa" />
          </div>
          {dpaInPlace && (
            <div className="space-y-1.5">
              <Label>DPA Signed Date</Label>
              <Input type="date" value={dpaSignedDate} onChange={e => setDpaSignedDate(e.target.value)} data-testid="input-dpa-date" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Last Reviewed</Label>
              <Input type="date" value={lastReviewed} onChange={e => setLastReviewed(e.target.value)} data-testid="input-last-reviewed" />
            </div>
            <div className="space-y-1.5">
              <Label>Next Review Due</Label>
              <Input type="date" value={nextReview} onChange={e => setNextReview(e.target.value)} data-testid="input-next-review" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} data-testid="input-vendor-notes" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !vendorName} data-testid="button-save-vendor">
              {mutation.isPending ? "Saving..." : "Save Vendor"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function VendorRisksPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [editVendor, setEditVendor] = useState<VendorRisk | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: vendors = [], isLoading, refetch } = useQuery<VendorRisk[]>({
    queryKey: ["/api/admin/vendor-risks", categoryFilter, riskFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (riskFilter !== "all") params.set("riskLevel", riskFilter);
      const r = await apiRequest("GET", `/api/admin/vendor-risks?${params}`);
      return r.json();
    },
  });

  const markReviewedMutation = useMutation({
    mutationFn: async (id: string) => {
      const today = new Date().toISOString().split("T")[0];
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      const r = await apiRequest("PATCH", `/api/admin/vendor-risks/${id}`, {
        lastReviewedAt: today,
        nextReviewDue: nextYear.toISOString().split("T")[0],
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendor-risks"] });
      announceToScreenReader("Vendor marked as reviewed.");
      toast({ title: "Marked as reviewed" });
    },
    onError: (e: any) => { announceToScreenReader("Error: " + e.message); toast({ variant: "destructive", title: "Error", description: e.message }); },
  });

  return (
    <div className="p-6 space-y-6" data-testid="vendor-risks-page">
      <PageTitle title="Vendor Risks" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-vendor-risks-title">Vendor Risk Assessment</h1>
            <p className="text-sm text-muted-foreground">Track compliance certifications and risk levels for third-party vendors</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-vendors">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => { setEditVendor(null); setShowDialog(true); }} data-testid="button-add-vendor">
            <Plus className="h-4 w-4 mr-1" />
            Add Vendor
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44" data-testid="select-category-filter">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-40" data-testid="select-risk-filter">
            <SelectValue placeholder="All Risk Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Levels</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading vendors...</div>
      ) : vendors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No vendors found.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {vendors.map(vendor => (
            <Card key={vendor.id} data-testid={`card-vendor-${vendor.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-base">{RISK_ICONS[vendor.risk_level] || "⚪"}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase border ${RISK_COLORS[vendor.risk_level] || "bg-gray-100 text-gray-700"}`}>
                        {vendor.risk_level}
                      </span>
                      <span className="font-semibold">{vendor.vendor_name}</span>
                      <span className="text-muted-foreground text-sm capitalize">
                        ({CATEGORIES.find(c => c.value === vendor.vendor_category)?.label || vendor.vendor_category})
                      </span>
                    </div>
                    {vendor.service_description && (
                      <p className="text-sm text-muted-foreground mb-1">{vendor.service_description}</p>
                    )}
                    {vendor.data_processed?.length > 0 && (
                      <p className="text-xs text-muted-foreground mb-1">
                        Data: {vendor.data_processed.join(", ")}
                      </p>
                    )}
                    <div className="flex items-center gap-3 flex-wrap text-xs mt-1">
                      {vendor.compliance_certs?.map(cert => (
                        <span key={cert} className="text-green-700">✅ {cert}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>
                        DPA:{" "}
                        {vendor.dpa_in_place
                          ? <span className="text-green-600">✅ Signed</span>
                          : <span className="text-red-600">❌ Not signed</span>
                        }
                      </span>
                      {vendor.last_reviewed_at && (
                        <span>Last review: {format(new Date(vendor.last_reviewed_at), "d MMM yyyy")}</span>
                      )}
                      {vendor.next_review_due && (
                        <span>Next due: {format(new Date(vendor.next_review_due), "d MMM yyyy")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setEditVendor(vendor); setShowDialog(true); }}
                      data-testid={`button-edit-vendor-${vendor.id}`}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markReviewedMutation.mutate(vendor.id)}
                      disabled={markReviewedMutation.isPending}
                      data-testid={`button-review-vendor-${vendor.id}`}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Mark Reviewed
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showDialog && (
        <VendorDialog
          vendor={editVendor}
          onClose={() => { setShowDialog(false); setEditVendor(null); }}
        />
      )}
    </div>
  );
}
