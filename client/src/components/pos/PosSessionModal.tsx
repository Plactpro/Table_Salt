import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Clock, DollarSign, LogOut, TrendingUp, ShoppingBag, AlertTriangle, Printer } from "lucide-react";
import SupervisorApprovalDialog from "@/components/supervisor-approval-dialog";

interface PosSessionModalProps {
  open: boolean;
  onSessionStarted: (sessionId: string) => void;
}

interface CloseShiftDialogProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  onClosed: () => void;
}

export function StartShiftModal({ open, onSessionStarted }: PosSessionModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [openingFloat, setOpeningFloat] = useState("0");

  const currency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const currencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const currencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, currency, { position: currencyPosition, decimals: currencyDecimals });

  const now = new Date();
  const hour = now.getHours();
  const autoShift = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : hour < 21 ? "Evening" : "Night";

  const openMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pos/session/open", {
        openingFloat: parseFloat(openingFloat) || 0,
        shiftName: autoShift,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to open session");
      return res.json();
    },
    onSuccess: (session) => {
      toast({ title: `${autoShift} shift started!` });
      onSessionStarted(session.id);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" /> Start Your Shift
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-primary/5 rounded-lg p-3 text-center border border-primary/20">
            <p className="text-sm text-muted-foreground">Current shift</p>
            <p className="font-bold text-lg">{autoShift} Shift</p>
            <p className="text-xs text-muted-foreground">{now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Opening Cash Float</label>
            <Input
              type="number"
              placeholder="0.00"
              value={openingFloat}
              onChange={e => setOpeningFloat(e.target.value)}
              min="0"
              step="0.01"
              data-testid="input-opening-float"
            />
            <p className="text-xs text-muted-foreground">Enter the cash amount in the drawer at shift start</p>
          </div>
          <Button className="w-full" size="lg" onClick={() => openMutation.mutate()} disabled={openMutation.isPending} data-testid="button-open-shift">
            {openMutation.isPending ? "Opening shift..." : "Open Shift"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SupervisorCredentials { username: string; password: string; otpApprovalToken?: string; }

export function CloseShiftDialog({ open, onClose, sessionId, onClosed }: CloseShiftDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cashCount, setCashCount] = useState("");
  const [showSupervisor, setShowSupervisor] = useState(false);
  const [reportData, setReportData] = useState<{ session: { openingFloat?: number; shiftName?: string | null }; revenueByMethod?: Record<string, number>; billCount?: number; totalRevenue?: number } | null>(null);

  const currency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const currencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const currencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, currency, { position: currencyPosition, decimals: currencyDecimals });

  const { data: report } = useQuery({
    queryKey: ["/api/pos/session/report", sessionId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/pos/session/report?sessionId=${sessionId}`);
      return res.json();
    },
    enabled: open && !!sessionId,
  });

  const closeMutation = useMutation({
    mutationFn: async (supervisorOverride: SupervisorCredentials | null) => {
      const body: Record<string, unknown> = { closingCashCount: cashCount ? parseFloat(cashCount) : null };
      if (supervisorOverride) body.supervisorOverride = supervisorOverride;
      const res = await apiRequest("POST", "/api/pos/session/close", body);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to close session");
      return res.json();
    },
    onSuccess: (data) => {
      setReportData(data.report ?? data);
      toast({ title: "Shift closed successfully!" });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/session"] });
      onClosed();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const isManagerOrOwner = user?.role === "owner" || user?.role === "manager";

  const expectedCash = report ? (Number(report.session?.openingFloat ?? 0) + (report.revenueByMethod?.CASH ?? 0)) : 0;
  const actualCash = parseFloat(cashCount) || 0;
  const variance = cashCount ? actualCash - expectedCash : null;

  const handlePrintReport = () => {
    const source = report || reportData;
    if (!source) return;
    const expCash = Number(source.session?.openingFloat ?? 0) + (source.revenueByMethod?.CASH ?? 0);
    const actCash = parseFloat(cashCount) || 0;
    const varianceVal = cashCount ? actCash - expCash : null;
    const methodRows = Object.entries(source.revenueByMethod || {}).map(([m, amt]: [string, number]) =>
      `<tr><td>${m}</td><td style="text-align:right">${fmt(amt)}</td></tr>`
    ).join("");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Shift Report</title>
      <style>body{font-family:sans-serif;padding:2rem;max-width:480px;margin:auto}h1{font-size:1.2rem;margin-bottom:.5rem}table{width:100%;border-collapse:collapse;margin-bottom:1rem}td{padding:.3rem .5rem;border-bottom:1px solid #eee}td:last-child{text-align:right}.var-neg{color:red}.var-pos{color:green}.summary{display:flex;gap:2rem;margin-bottom:1rem}.stat{text-align:center}.stat-val{font-size:1.8rem;font-weight:bold}.stat-lbl{font-size:.75rem;color:#666}</style>
    </head><body>
      <h1>Shift Report — ${source.session ? (source.session as {shiftName?: string}).shiftName ?? "Shift" : "Shift"}</h1>
      <p style="color:#666;font-size:.85rem">Printed: ${new Date().toLocaleString()}</p>
      <div class="summary">
        <div class="stat"><div class="stat-val">${source.billCount ?? 0}</div><div class="stat-lbl">Orders</div></div>
        <div class="stat"><div class="stat-val">${fmt(source.totalRevenue ?? 0)}</div><div class="stat-lbl">Revenue</div></div>
      </div>
      <h2 style="font-size:.9rem">Revenue by Method</h2>
      <table>${methodRows}</table>
      <h2 style="font-size:.9rem">Cash Reconciliation</h2>
      <table>
        <tr><td>Opening Float</td><td>${fmt(source.session?.openingFloat ?? 0)}</td></tr>
        <tr><td>Cash Sales</td><td>${fmt(source.revenueByMethod?.CASH ?? 0)}</td></tr>
        <tr><td><strong>Expected Cash</strong></td><td><strong>${fmt(expCash)}</strong></td></tr>
        ${cashCount ? `<tr><td>Counted Cash</td><td>${fmt(actCash)}</td></tr>
        <tr><td><strong>Variance</strong></td><td class="${varianceVal! < 0 ? "var-neg" : "var-pos"}"><strong>${varianceVal! >= 0 ? "+" : ""}${fmt(varianceVal!)}</strong></td></tr>` : ""}
      </table>
    </body></html>`);
    win.document.close();
    win.print();
  };

  const handleCloseShift = () => {
    if (isManagerOrOwner) {
      closeMutation.mutate(null);
    } else {
      setShowSupervisor(true);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-primary" /> Close Shift
            </DialogTitle>
          </DialogHeader>
          {report && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center border">
                  <ShoppingBag className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <p className="text-2xl font-bold">{report.billCount}</p>
                  <p className="text-xs text-muted-foreground">Orders</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center border">
                  <TrendingUp className="h-5 w-5 mx-auto mb-1 text-green-600" />
                  <p className="text-2xl font-bold text-green-600">{fmt(report.totalRevenue)}</p>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                </div>
              </div>

              {Object.entries(report.revenueByMethod || {}).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue by Method</p>
                  {Object.entries(report.revenueByMethod || {}).map(([method, amount]: [string, any]) => (
                    <div key={method} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{method}</span>
                      <span className="font-medium">{fmt(amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cash Reconciliation</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Opening Float</span>
                  <span>{fmt(report.session?.openingFloat ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cash Sales</span>
                  <span>{fmt(report.revenueByMethod?.CASH ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>Expected Cash</span>
                  <span>{fmt(expectedCash)}</span>
                </div>
                <Input
                  type="number"
                  placeholder="Enter actual cash count"
                  value={cashCount}
                  onChange={e => setCashCount(e.target.value)}
                  min="0"
                  step="0.01"
                  data-testid="input-cash-count"
                />
                {variance !== null && (
                  <div className={`flex justify-between text-sm font-medium rounded p-2 ${Math.abs(variance) < 0.01 ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300" : variance < 0 ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300" : "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"}`}>
                    <span className="flex items-center gap-1">
                      {Math.abs(variance) > 0.01 && <AlertTriangle className="h-3.5 w-3.5" />}
                      Variance
                    </span>
                    <span>{variance >= 0 ? "+" : ""}{fmt(variance)}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrintReport} className="flex-1">
                  <Printer className="h-4 w-4 mr-1" /> Print Report
                </Button>
                <Button size="sm" className="flex-1" onClick={handleCloseShift} disabled={closeMutation.isPending} data-testid="button-close-shift">
                  {closeMutation.isPending ? "Closing..." : "Close Shift"}
                </Button>
              </div>
            </div>
          )}
          {!report && (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Loading session data...
            </div>
          )}
        </DialogContent>
      </Dialog>
      {showSupervisor && (
        <SupervisorApprovalDialog
          open={showSupervisor}
          onOpenChange={(o) => { if (!o) setShowSupervisor(false); }}
          action="close_shift"
          actionLabel="Close Shift"
          onApproved={(_supervisorId, credentials) => { setShowSupervisor(false); closeMutation.mutate(credentials); }}
        />
      )}
    </>
  );
}
