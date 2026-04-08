import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@shared/currency";
import { motion } from "framer-motion";
import {
  DollarSign, Download, BarChart3, Users, CheckCircle2, Clock, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip, ResponsiveContainer,
} from "recharts";

export default function TipReportPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const currencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const currencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => formatCurrency(val, currency, { position: currencyPosition, decimals: currencyDecimals });

  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [selectedDistributions, setSelectedDistributions] = useState<string[]>([]);

  const { data: outlets = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/outlets"],
  });

  const reportParams = new URLSearchParams();
  if (selectedDate) reportParams.set("date", selectedDate);
  if (selectedOutletId) reportParams.set("outletId", selectedOutletId);

  const { data: report, isLoading: reportLoading } = useQuery<any>({
    queryKey: ["/api/tips/report", selectedDate, selectedOutletId],
    queryFn: async () => {
      const res = await fetch(`/api/tips/report?${reportParams.toString()}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30000,
  });

  const distParams = new URLSearchParams();
  if (selectedDate) distParams.set("date", selectedDate);
  distParams.set("isPaid", "false");

  const { data: distributions = [], isLoading: distLoading } = useQuery<any[]>({
    queryKey: ["/api/tips/distributions", selectedDate, "unpaid"],
    queryFn: async () => {
      const res = await fetch(`/api/tips/distributions?${distParams.toString()}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30000,
  });

  const markPaidMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => apiRequest("PATCH", `/api/tips/distributions/${id}/pay`, {})));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tips/distributions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tips/report"] });
      setSelectedDistributions([]);
      toast({ title: "Marked as paid", description: "Selected tips marked as paid" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function handleExportCsv() {
    if (!report) return;
    const rows = [
      ["Bill #", "Waiter", "Amount", "Type", "Method", "Time"],
      ...(report.recentTips || []).map((t: any) => [
        t.billId || "",
        t.waiterName || "",
        t.amount || 0,
        t.tipType || "",
        t.paymentMethod || "",
        t.time ? new Date(t.time).toLocaleTimeString() : "",
      ]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tip-report-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleDistribution(id: string) {
    setSelectedDistributions(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  const hourlyData = report?.byHour
    ? (report.byHour as { hour: number; tips: number }[]).map(h => ({
        hour: `${h.hour}:00`,
        total: Number(h.tips),
      })).sort((a, b) => parseInt(a.hour) - parseInt(b.hour))
    : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
      data-testid="page-tip-report"
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/40">
            <DollarSign className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading">Tip Report</h1>
            <p className="text-muted-foreground">View and manage tip distributions</p>
          </div>
        </div>
        <Button variant="outline" onClick={handleExportCsv} disabled={!report} data-testid="button-export-csv">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="h-9 rounded-md border border-input px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring bg-background"
          data-testid="datepicker-tip-report"
        />
        <Select value={selectedOutletId || "all"} onValueChange={v => setSelectedOutletId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48" data-testid="select-outlet-filter">
            <SelectValue placeholder="All Outlets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Outlets</SelectItem>
            {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {reportLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading report...</div>
      ) : !report || !report.totalTips ? (
        <Card>
          <CardContent className="text-center py-12">
            <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">No tip data for the selected period</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Tips</p>
                <p className="text-2xl font-bold text-amber-600" data-testid="text-total-tips">{fmt(report.totalTips || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">{report.totalTransactions || 0} transactions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg per Bill</p>
                <p className="text-2xl font-bold" data-testid="text-avg-tip">{fmt(report.avgTipPerBill || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Highest Tip</p>
                <p className="text-2xl font-bold">{fmt(report.maxTip || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">By Method</p>
                <div className="space-y-0.5 mt-1">
                  {Object.entries(report.byMethod || {}).map(([method, amt]) => (
                    <div key={method} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{method}</span>
                      <span className="font-medium">{fmt(Number(amt))}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Tips by Waiter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto" data-testid="table-tips-by-waiter">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                      <th className="text-left py-2 px-2">Name</th>
                      <th className="text-right py-2 px-2">Tips</th>
                      <th className="text-right py-2 px-2">Count</th>
                      <th className="text-right py-2 px-2">Avg</th>
                      <th className="text-right py-2 px-2">Paid</th>
                      <th className="text-right py-2 px-2">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report.byWaiter || []).map((w: any, i: number) => (
                      <tr key={w.waiterId || i} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-tip-waiter-${w.waiterId || i}`}>
                        <td className="py-2 px-2 font-medium">{w.waiterName || "Unknown"}</td>
                        <td className="py-2 px-2 text-right font-semibold text-amber-600">{fmt(w.totalTips || 0)}</td>
                        <td className="py-2 px-2 text-right">{w.count || 0}</td>
                        <td className="py-2 px-2 text-right">{fmt(w.count ? (w.totalTips / w.count) : 0)}</td>
                        <td className="py-2 px-2 text-right text-green-600">{fmt(w.paid || 0)}</td>
                        <td className="py-2 px-2 text-right text-amber-600">{fmt(w.pending || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {hourlyData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Tips by Hour
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48" data-testid="chart-tips-by-hour">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="hour" className="text-xs fill-muted-foreground" />
                      <YAxis className="text-xs fill-muted-foreground" />
                      <RechartTooltip
                        formatter={(value: number) => [fmt(value), "Tips"]}
                        contentStyle={{ fontSize: "12px" }}
                      />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" /> Recent Tip Transactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto" data-testid="table-tip-transactions">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                      <th className="text-left py-2 px-2">Time</th>
                      <th className="text-left py-2 px-2">Bill #</th>
                      <th className="text-left py-2 px-2">Waiter</th>
                      <th className="text-right py-2 px-2">Amount</th>
                      <th className="text-right py-2 px-2">Type</th>
                      <th className="text-right py-2 px-2">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report.recentTips || []).map((t: any, i: number) => (
                      <tr key={t.id || i} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 px-2 text-muted-foreground text-xs">
                          {t.time ? new Date(t.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td className="py-2 px-2 font-mono text-xs">{t.billId || "—"}</td>
                        <td className="py-2 px-2">{t.waiterName || "—"}</td>
                        <td className="py-2 px-2 text-right font-semibold text-amber-600">{fmt(t.amount || 0)}</td>
                        <td className="py-2 px-2 text-right text-xs">{t.tipType || "—"}</td>
                        <td className="py-2 px-2 text-right text-xs">{t.paymentMethod || "—"}</td>
                      </tr>
                    ))}
                    {(report.recentTips || []).length === 0 && (
                      <tr><td colSpan={6} className="text-center py-4 text-muted-foreground text-sm">No transactions</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Distribution Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedDistributions.length > 0 && (
            <div className="mb-3">
              <Button
                size="sm"
                onClick={() => markPaidMutation.mutate(selectedDistributions)}
                disabled={markPaidMutation.isPending}
                data-testid="button-mark-paid"
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark {selectedDistributions.length} as Paid
              </Button>
            </div>
          )}
          <div className="space-y-2" data-testid="table-distributions">
            {distLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : distributions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending distributions</p>
            ) : (
              distributions.map((d: any) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30"
                  data-testid={`checkbox-distribution-${d.id}`}
                >
                  {!d.isPaid && (
                    <Checkbox
                      checked={selectedDistributions.includes(d.id)}
                      onCheckedChange={() => toggleDistribution(d.id)}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{d.waiterName || "Unknown"}</span>
                      <span className="text-sm font-semibold text-amber-600">{fmt(d.amount || 0)}</span>
                      {d.billNumber && <span className="text-xs text-muted-foreground font-mono">Bill #{d.billNumber}</span>}
                    </div>
                  </div>
                  <Badge
                    className={d.isPaid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}
                    data-testid={`badge-distribution-status-${d.id}`}
                  >
                    {d.isPaid ? "✅ Paid" : "⏳ Pending"}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
