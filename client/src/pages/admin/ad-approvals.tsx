import { useState } from "react";
import { PageTitle } from "@/lib/accessibility";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Megaphone, CheckCircle, XCircle, Clock, Building2, Calendar, BarChart2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function AdminAdApprovalsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejectDialog, setRejectDialog] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: campaigns = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/ad-approvals"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/ad-approvals");
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/admin/ad-approvals/${id}/approve`);
      if (!r.ok) throw new Error("Failed to approve");
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ad-approvals"] });
      toast({ title: "Campaign approved and activated" });
    },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const r = await apiRequest("POST", `/api/admin/ad-approvals/${id}/reject`, { reason });
      if (!r.ok) throw new Error("Failed to reject");
    },
    onSuccess: () => {
      refetch();
      setRejectDialog(null);
      setRejectReason("");
      toast({ title: "Campaign rejected" });
    },
    onError: () => toast({ title: "Failed to reject", variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl" data-testid="admin-ad-approvals-page">
      <PageTitle title="Admin — Ad Approvals" />
      <div className="flex items-center gap-3">
        <Megaphone className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Third-Party Ad Approvals</h1>
          <p className="text-sm text-muted-foreground">Review and approve/reject pending advertisement campaigns from tenants</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading pending approvals...</div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500 opacity-60" />
            <p className="font-medium">No pending approvals</p>
            <p className="text-sm text-muted-foreground mt-1">All third-party ad campaigns have been reviewed</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c: any) => (
            <Card key={c.id} data-testid={`ad-approval-card-${c.id}`}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold" data-testid={`text-campaign-name-${c.id}`}>{c.campaignName}</h3>
                      <Badge className="bg-blue-100 text-blue-700">Pending Approval</Badge>
                    </div>
                    <div className="flex gap-4 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" />
                        {c.tenantName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {c.startDate ? new Date(c.startDate).toLocaleDateString() : "—"} → {c.endDate ? new Date(c.endDate).toLocaleDateString() : "—"}
                      </span>
                      {c.submittedForApprovalAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Submitted {new Date(c.submittedForApprovalAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {c.advertiserName && (
                      <div className="text-sm space-y-0.5">
                        <p><span className="font-medium">Advertiser:</span> {c.advertiserName}</p>
                        {c.advertiserEmail && <p><span className="font-medium">Email:</span> {c.advertiserEmail}</p>}
                        {c.advertiserPhone && <p><span className="font-medium">Phone:</span> {c.advertiserPhone}</p>}
                      </div>
                    )}
                    <div className="flex gap-3 text-sm text-muted-foreground">
                      {c.revenueModel && <span><span className="font-medium">Model:</span> {c.revenueModel.replace("_", " ")}</span>}
                      {c.totalContractValue && <span><span className="font-medium">Contract:</span> {parseFloat(c.totalContractValue).toFixed(2)}</span>}
                      {c.displayDurationSec && <span><span className="font-medium">Duration:</span> {c.displayDurationSec}s</span>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(c.displayLocations || []).map((loc: string) => (
                        <Badge key={loc} variant="outline" className="text-xs">{loc}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => { setRejectDialog({ id: c.id, name: c.campaignName }); setRejectReason(""); }}
                      data-testid={`button-reject-${c.id}`}
                    >
                      <XCircle className="w-4 h-4 mr-1" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => approveMutation.mutate(c.id)}
                      disabled={approveMutation.isPending}
                      data-testid={`button-approve-${c.id}`}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" /> Approve
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {rejectDialog && (
        <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
          <DialogContent data-testid="dialog-reject-campaign">
            <DialogHeader>
              <DialogTitle>Reject Campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Rejecting: <strong>{rejectDialog.name}</strong>
              </p>
              <div>
                <Label>Rejection Reason (optional)</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this campaign is being rejected..."
                  data-testid="textarea-rejection-reason"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialog(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => rejectMutation.mutate({ id: rejectDialog.id, reason: rejectReason })}
                disabled={rejectMutation.isPending}
                data-testid="button-confirm-reject"
              >
                {rejectMutation.isPending ? "Rejecting..." : "Reject Campaign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
