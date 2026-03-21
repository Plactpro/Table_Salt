import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Printer, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useState, useCallback } from "react";
import { renderKotHtml, renderBillHtml, dispatchPrint } from "@/lib/print-utils";

interface PrintJob {
  id: string;
  type: string;
  referenceId: string;
  station: string | null;
  status: string;
  payload: Record<string, any>;
  createdAt: string;
}

interface KitchenStation {
  id: string;
  name: string;
  displayName: string;
  printerUrl?: string | null;
}

interface PrintQueuePanelProps {
  restaurantName?: string;
}

export default function PrintQueuePanel({ restaurantName = "Restaurant" }: PrintQueuePanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: jobs = [], isLoading, refetch } = useQuery<PrintJob[]>({
    queryKey: ["/api/print-jobs", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "100");
      const res = await apiRequest("GET", `/api/print-jobs?${params}`);
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: stations = [] } = useQuery<KitchenStation[]>({
    queryKey: ["/api/kitchen-stations"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/print-jobs/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-jobs"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const getStationPrinterUrl = useCallback(
    (stationName: string | null) => {
      if (!stationName) return null;
      return stations.find(s => s.name === stationName)?.printerUrl ?? null;
    },
    [stations]
  );

  const handlePrintJob = useCallback(
    async (job: PrintJob) => {
      let html: string;

      if (job.type === "kot") {
        html = renderKotHtml({
          restaurantName,
          kotNumber: job.referenceId.slice(-6).toUpperCase(),
          orderId: job.payload?.orderId || job.referenceId,
          orderType: job.payload?.orderType,
          tableNumber: job.payload?.tableNumber,
          station: job.payload?.station,
          sentAt: job.payload?.sentAt || job.createdAt,
          items: job.payload?.items || [],
        });
      } else if (job.type === "bill" || job.type === "receipt") {
        const p = job.payload || {};
        html = renderBillHtml({
          restaurantName,
          billNumber: p.billNumber || job.referenceId.slice(-6).toUpperCase(),
          invoiceNumber: p.invoiceNumber,
          orderId: p.orderId || job.referenceId,
          orderType: p.orderType,
          tableNumber: p.tableNumber,
          items: p.items || [],
          subtotal: Number(p.subtotal) || 0,
          discountAmount: Number(p.discountAmount) || 0,
          discountReason: p.discountReason,
          serviceCharge: Number(p.serviceCharge) || 0,
          taxAmount: Number(p.taxAmount) || 0,
          taxType: p.taxType,
          taxRate: p.taxRate,
          cgstAmount: Number(p.cgstAmount) || 0,
          sgstAmount: Number(p.sgstAmount) || 0,
          tips: Number(p.tips) || 0,
          totalAmount: Number(p.totalAmount) || 0,
          paymentMethod: p.paymentMethod,
          customerName: p.customerName,
          customerGstin: p.customerGstin,
          loyaltyPointsEarned: p.loyaltyPointsEarned,
        });
      } else {
        toast({ title: "Unknown print type", description: `Cannot print type: ${job.type}`, variant: "destructive" });
        return;
      }

      const printerUrl = getStationPrinterUrl(job.station);
      const networkSuccess = await dispatchPrint(html, printerUrl, () => {
        updateStatusMutation.mutate({ id: job.id, status: "printed" });
      });
      if (!networkSuccess) {
        updateStatusMutation.mutate({ id: job.id, status: "printed" });
      }
    },
    [restaurantName, getStationPrinterUrl, updateStatusMutation, toast]
  );

  const statusColor: Record<string, string> = {
    queued: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    printed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "printed") return <CheckCircle2 className="h-3 w-3" />;
    if (status === "failed") return <XCircle className="h-3 w-3" />;
    return <Clock className="h-3 w-3" />;
  };

  const formatTime = (dt: string) =>
    new Date(dt).toLocaleString("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
    });

  const getJobLabel = (job: PrintJob) => {
    const p = job.payload || {};
    if (job.type === "kot") {
      if (p.orderType === "dine_in" && p.tableNumber) return `Table #${p.tableNumber}`;
      if (p.orderType === "takeaway") return "Takeaway";
      if (p.orderType === "delivery") return "Delivery";
      return "Kitchen Order";
    }
    if (job.type === "bill" || job.type === "receipt") {
      const bn = p.billNumber || job.referenceId.slice(-6).toUpperCase();
      return `Bill #${bn}`;
    }
    return `Ref: ${job.referenceId.slice(-6).toUpperCase()}`;
  };

  return (
    <Card data-testid="print-queue-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-violet-100 dark:bg-violet-900">
              <Printer className="h-5 w-5 text-violet-700 dark:text-violet-300" />
            </div>
            <div>
              <CardTitle>Print Queue</CardTitle>
              <CardDescription>KOT and bill print jobs</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] h-8 text-sm" data-testid="select-print-queue-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="printed">Printed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              data-testid="button-refresh-print-queue"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center text-muted-foreground py-6 text-sm">Loading print jobs…</div>
        ) : jobs.length === 0 ? (
          <div className="text-center text-muted-foreground py-6 text-sm" data-testid="text-no-print-jobs">
            No print jobs{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                data-testid={`print-job-row-${job.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-xs px-1.5 py-0 gap-1 ${statusColor[job.status] || ""}`}>
                      <StatusIcon status={job.status} />
                      <span className="capitalize">{job.status}</span>
                    </Badge>
                    <span className="text-xs font-medium uppercase text-muted-foreground">{job.type}</span>
                    {job.station && (
                      <span className="text-xs text-muted-foreground">· {job.station}</span>
                    )}
                  </div>
                  <div className="text-sm font-medium mt-0.5 truncate">
                    {getJobLabel(job)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{formatTime(job.createdAt)}</div>
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => handlePrintJob(job)}
                    data-testid={`button-print-job-${job.id}`}
                  >
                    <Printer className="h-3 w-3 mr-1" />
                    Print
                  </Button>
                  {job.status !== "printed" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => updateStatusMutation.mutate({ id: job.id, status: "failed" })}
                      data-testid={`button-skip-job-${job.id}`}
                    >
                      Skip
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
