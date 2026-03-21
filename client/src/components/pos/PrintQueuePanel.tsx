import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Printer, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useState, useCallback } from "react";
import { renderKotHtml } from "@/lib/print-utils";

interface PrintJob {
  id: string;
  type: string;
  referenceId: string;
  station: string | null;
  status: string;
  payload: Record<string, any>;
  createdAt: string;
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
    refetchInterval: 10000,
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

  const handlePrintJob = useCallback((job: PrintJob) => {
    const html = renderKotHtml({
      restaurantName,
      kotNumber: job.referenceId.slice(-6).toUpperCase(),
      orderId: job.payload?.orderId || job.referenceId,
      orderType: job.payload?.orderType,
      tableNumber: job.payload?.tableNumber,
      station: job.payload?.station,
      sentAt: job.payload?.sentAt || job.createdAt,
      items: job.payload?.items || [],
    });
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) {
      toast({ title: "Popup blocked", description: "Allow popups to print KOT", variant: "destructive" });
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
      updateStatusMutation.mutate({ id: job.id, status: "printed" });
    }, 300);
  }, [restaurantName, updateStatusMutation, toast]);

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
          <div className="text-center text-muted-foreground py-6 text-sm">Loading print jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="text-center text-muted-foreground py-6 text-sm" data-testid="text-no-print-jobs">
            No print jobs{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const payload = job.payload || {};
              return (
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
                      {job.type === "kot" ? (
                        <>
                          {payload.orderType === "dine_in" && payload.tableNumber
                            ? `Table #${payload.tableNumber}`
                            : payload.orderType === "takeaway"
                            ? "Takeaway"
                            : payload.orderType === "delivery"
                            ? "Delivery"
                            : "Order"}
                          {" — "}
                          {(payload.items || []).length} item(s)
                        </>
                      ) : (
                        `Ref: ${job.referenceId.slice(-6).toUpperCase()}`
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatTime(job.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    {job.type === "kot" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handlePrintJob(job)}
                        data-testid={`button-print-job-${job.id}`}
                      >
                        <Printer className="h-3 w-3 mr-1" />
                        Print
                      </Button>
                    )}
                    {job.status === "queued" && (
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
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
