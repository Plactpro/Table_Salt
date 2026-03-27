import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation("pos");
  const { user } = useAuth();
  const { toast } = useToast();
  const [openingFloat, setOpeningFloat] = useState("0");

  const currency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const currencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const currencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, currency, { position: currencyPosition, decimals: currencyDecimals });

  const now = new Date();
  const hour = now.getHours();
  const autoShift = hour < 12 ? t("shiftMorning") : hour < 17 ? t("shiftAfternoon") : hour < 21 ? t("shiftEvening") : t("shiftNight");

  const openMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pos/session/open", {
        openingFloat: parseFloat(openingFloat) || 0,
        shiftName: autoShift,
      });
      if (!res.ok) throw new Error((await res.json()).message || t("failedToOpenSession"));
      return res.json();
    },
    onSuccess: (session) => {
      toast({ title: `${autoShift} ${t("shiftStarted")}` });
      onSessionStarted(session.id);
    },
    onError: (err: Error) => toast({ title: t("error"), description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" /> {t("startYourShift")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-primary/5 rounded-lg p-3 text-center border border-primary/20">
            <p className="text-sm text-muted-foreground">{t("currentShift")}</p>
            <p className="font-bold text-lg">{autoShift} {t("shift")}</p>
            <p className="text-xs text-muted-foreground">{now.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t("openingCashFloat")}</label>
            <Input
              type="number"
              placeholder="0.00"
              value={openingFloat}
              onChange={e => setOpeningFloat(e.target.value)}
              min="0"
              step="0.01"
              data-testid="input-opening-float"
            />
            <p className="text-xs text-muted-foreground">{t("openingFloatHint")}</p>
          </div>
          <Button className="w-full" size="lg" onClick={() => openMutation.mutate()} disabled={openMutation.isPending} data-testid="button-open-shift">
            {openMutation.isPending ? t("openingShift") : t("openShift")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SupervisorCredentials { username: string; password: string; otpApprovalToken?: string; }

export function CloseShiftDialog({ open, onClose, sessionId, onClosed }: CloseShiftDialogProps) {
  const { t, i18n } = useTranslation("pos");
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
      if (!res.ok) throw new Error((await res.json()).message || t("failedToCloseSession"));
      return res.json();
    },
    onSuccess: (data) => {
      setReportData(data.report ?? data);
      toast({ title: t("shiftClosedSuccess") });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/session"] });
      onClosed();
    },
    onError: (err: Error) => toast({ title: t("error"), description: err.message, variant: "destructive" }),
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
    win.document.write(`<!DOCTYPE html><html><head><title>${t("shiftReport")}</title>
      <style>body{font-family:sans-serif;padding:2rem;max-width:480px;margin:auto}h1{font-size:1.2rem;margin-bottom:.5rem}table{width:100%;border-collapse:collapse;margin-bottom:1rem}td{padding:.3rem .5rem;border-bottom:1px solid #eee}td:last-child{text-align:right}.var-neg{color:red}.var-pos{color:green}.summary{display:flex;gap:2rem;margin-bottom:1rem}.stat{text-align:center}.stat-val{font-size:1.8rem;font-weight:bold}.stat-lbl{font-size:.75rem;color:#666}</style>
    </head><body>
      <h1>${t("shiftReport")} — ${source.session ? (source.session as {shiftName?: string}).shiftName ?? t("shift") : t("shift")}</h1>
      <p style="color:#666;font-size:.85rem">${t("printed")}: ${new Date().toLocaleString(i18n.language)}</p>
      <div class="summary">
        <div class="stat"><div class="stat-val">${source.billCount ?? 0}</div><div class="stat-lbl">${t("orders")}</div></div>
        <div class="stat"><div class="stat-val">${fmt(source.totalRevenue ?? 0)}</div><div class="stat-lbl">${t("revenue")}</div></div>
      </div>
      <h2 style="font-size:.9rem">${t("revenueByMethod")}</h2>
      <table>${methodRows}</table>
      <h2 style="font-size:.9rem">${t("cashReconciliation")}</h2>
      <table>
        <tr><td>${t("openingFloat")}</td><td>${fmt(source.session?.openingFloat ?? 0)}</td></tr>
        <tr><td>${t("cashSales")}</td><td>${fmt(source.revenueByMethod?.CASH ?? 0)}</td></tr>
        <tr><td><strong>${t("expectedCash")}</strong></td><td><strong>${fmt(expCash)}</strong></td></tr>
        ${cashCount ? `<tr><td>${t("countedCash")}</td><td>${fmt(actCash)}</td></tr>
        <tr><td><strong>${t("variance")}</strong></td><td class="${varianceVal! < 0 ? "var-neg" : "var-pos"}"><strong>${varianceVal! >= 0 ? "+" : ""}${fmt(varianceVal!)}</strong></td></tr>` : ""}
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
              <LogOut className="h-5 w-5 text-primary" /> {t("closeShift")}
            </DialogTitle>
          </DialogHeader>
          {report && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center border">
                  <ShoppingBag className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <p className="text-2xl font-bold">{report.billCount}</p>
                  <p className="text-xs text-muted-foreground">{t("orders")}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center border">
                  <TrendingUp className="h-5 w-5 mx-auto mb-1 text-green-600" />
                  <p className="text-2xl font-bold text-green-600">{fmt(report.totalRevenue)}</p>
                  <p className="text-xs text-muted-foreground">{t("revenue")}</p>
                </div>
              </div>

              {Object.entries(report.revenueByMethod || {}).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("revenueByMethod")}</p>
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
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("cashReconciliation")}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("openingFloat")}</span>
                  <span>{fmt(report.session?.openingFloat ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("cashSales")}</span>
                  <span>{fmt(report.revenueByMethod?.CASH ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>{t("expectedCash")}</span>
                  <span>{fmt(expectedCash)}</span>
                </div>
                <Input
                  type="number"
                  placeholder={t("enterActualCashCount")}
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
                      {t("variance")}
                    </span>
                    <span>{variance >= 0 ? "+" : ""}{fmt(variance)}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrintReport} className="flex-1">
                  <Printer className="h-4 w-4 mr-1" /> {t("printReport")}
                </Button>
                <Button size="sm" className="flex-1" onClick={handleCloseShift} disabled={closeMutation.isPending} data-testid="button-close-shift">
                  {closeMutation.isPending ? t("closing") : t("closeShift")}
                </Button>
              </div>
            </div>
          )}
          {!report && (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              {t("loadingSessionData")}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {showSupervisor && (
        <SupervisorApprovalDialog
          open={showSupervisor}
          onOpenChange={(o) => { if (!o) setShowSupervisor(false); }}
          action="close_shift"
          actionLabel={t("closeShift")}
          onApproved={(_supervisorId, credentials) => { setShowSupervisor(false); closeMutation.mutate(credentials); }}
        />
      )}
    </>
  );
}
