import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { currencyMap } from "@shared/currency";

interface Denomination {
  value: number;
  label: string;
}

const DENOMINATION_MAP: Record<string, number[]> = {
    AED: [1000, 500, 200, 100, 50, 20, 10, 5, 1],
    INR: [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1],
    USD: [100, 50, 20, 10, 5, 1],
    GBP: [50, 20, 10, 5, 2, 1],
    EUR: [500, 200, 100, 50, 20, 10, 5, 2, 1],
    SAR: [500, 200, 100, 50, 20, 10, 5, 1],
    QAR: [500, 200, 100, 50, 20, 10, 5, 1],
  };
  
function getDefaultDenominations(currencyCode: string) {
  if (DENOMINATIONS_BY_CURRENCY[currencyCode]) return DENOMINATIONS_BY_CURRENCY[currencyCode];
  const symbol = currencyMap[currencyCode as keyof typeof currencyMap]?.symbol || currencyCode;
  return {
    notes: [
      { value: 100, label: `${symbol}100` },
      { value: 50, label: `${symbol}50` },
      { value: 20, label: `${symbol}20` },
      { value: 10, label: `${symbol}10` },
      { value: 5, label: `${symbol}5` },
    ],
    coins: [
      { value: 1, label: `${symbol}1` },
      { value: 0.50, label: `${symbol}0.50` },
      { value: 0.25, label: `${symbol}0.25` },
    ],
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSessionOpened: (session: any) => void;
  existingSession?: any;
}

export default function OpenCashSessionModal({ open, onClose, onSessionOpened, existingSession }: Props) {
  const { t, i18n } = useTranslation("pos");
  const { user } = useAuth();
    const tenantCurrency = user?.tenant?.currency ?? "AED";
  const denominations = (DENOMINATION_MAP[tenantCurrency] ?? DENOMINATION_MAP["AED"]).map(v => ({ value: v, label: `${tenantCurrency} ${v}` }));
  const { toast } = useToast();

  const currencyCode = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const currencyInfo = currencyMap[currencyCode as keyof typeof currencyMap];
  const symbol = currencyInfo?.symbol || currencyCode;
  const currencyName = currencyInfo?.name || currencyCode;

  const denoms = getDefaultDenominations(currencyCode);
  const allDenoms = [...denoms.notes.map(d => ({ ...d, type: "note" })), ...denoms.coins.map(d => ({ ...d, type: "coin" }))];

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [shiftName, setShiftName] = useState(t("defaultShiftName"));

  const breakdown = useMemo(() => {
    const result: Record<string, number> = {};
    for (const d of allDenoms) {
      const q = parseInt(quantities[String(d.value)] || "0") || 0;
      if (q > 0) result[String(d.value)] = q;
    }
    return result;
  }, [quantities, allDenoms]);

  const total = useMemo(() => {
    return allDenoms.reduce((sum, d) => {
      const q = parseInt(quantities[String(d.value)] || "0") || 0;
      return sum + q * d.value;
    }, 0);
  }, [quantities, allDenoms]);

  const openSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cash-sessions/open", {
        openingFloat: total,
        openingFloatBreakdown: breakdown,
        shiftName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: t("cashSessionOpened"), description: `${t("openingFloat")}: ${symbol}${total.toFixed(2)}` });
      onSessionOpened(data);
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: t("failedToOpenSession"), description: err.message, variant: "destructive" });
    },
  });

  const today = new Date().toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" });
  const outletName = (user as any)?.outlet?.name || t("mainBranch");

  if (existingSession) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md" data-testid="modal-open-session">
          <DialogHeader>
            <DialogTitle>💰 {t("activeCashSession")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
              <p className="text-green-800 font-medium">{t("sessionAlreadyActive")}</p>
              <p className="text-green-600 text-sm mt-1">{t("session")}: {existingSession.sessionNumber || existingSession.id?.slice(0, 8)}</p>
              <p className="text-green-600 text-sm">{t("openingFloat")}: {symbol}{Number(existingSession.openingFloat || 0).toFixed(2)}</p>
            </div>
            <Button className="w-full" onClick={onClose}>{t("resumeExistingSession")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="modal-open-session">
        <DialogHeader>
          <DialogTitle>💰 {t("openCashSession")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{today} | {outletName}</p>
          <p className="text-sm text-muted-foreground">{t("cashier")}: {user?.name || user?.username}</p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">{t("currency")}</p>
            <p className="font-medium" data-testid="text-currency-label">{symbol} {currencyName} ({currencyCode})</p>
          </div>

          <div>
            <label className="text-sm font-medium">{t("shiftName")}</label>
            <Input
              value={shiftName}
              onChange={e => setShiftName(e.target.value)}
              className="mt-1"
              placeholder={t("shiftNamePlaceholder")}
            />
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">{t("countOpeningFloat")}:</p>

            {denoms.notes.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{t("notes")}</p>
                <div className="space-y-2 mb-4">
                  {denoms.notes.map((d) => {
                    const qty = parseInt(quantities[String(d.value)] || "0") || 0;
                    const subtotal = qty * d.value;
                    return (
                      <div key={d.value} className="grid grid-cols-3 items-center gap-2">
                        <span className="text-sm font-medium text-right">{d.label}</span>
                        <Input
                          type="number"
                          min="0"
                          value={quantities[String(d.value)] || ""}
                          onChange={e => setQuantities(prev => ({ ...prev, [String(d.value)]: e.target.value }))}
                          className="text-center h-8"
                          placeholder="0"
                          data-testid={`input-denom-${d.value}`}
                        />
                        <span className="text-sm text-muted-foreground" data-testid={`text-denom-subtotal-${d.value}`}>
                          = {symbol}{subtotal.toFixed(subtotal % 1 === 0 ? 0 : 2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {denoms.coins.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{t("coins")}</p>
                <div className="space-y-2">
                  {denoms.coins.map((d) => {
                    const qty = parseInt(quantities[String(d.value)] || "0") || 0;
                    const subtotal = qty * d.value;
                    return (
                      <div key={`coin-${d.value}`} className="grid grid-cols-3 items-center gap-2">
                        <span className="text-sm font-medium text-right">{d.label}</span>
                        <Input
                          type="number"
                          min="0"
                          value={quantities[`coin-${d.value}`] !== undefined ? quantities[`coin-${d.value}`] : (quantities[String(d.value)] || "")}
                          onChange={e => setQuantities(prev => ({ ...prev, [String(d.value)]: e.target.value }))}
                          className="text-center h-8"
                          placeholder="0"
                          data-testid={`input-denom-${d.value}`}
                        />
                        <span className="text-sm text-muted-foreground" data-testid={`text-denom-subtotal-${d.value}`}>
                          = {symbol}{subtotal.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <Separator />

          <div className="flex items-center justify-between bg-muted/40 rounded-lg p-3">
            <span className="font-semibold">{t("openingFloatTotal")}:</span>
            <span className="text-xl font-bold text-green-700" data-testid="text-opening-total">
              {symbol}{total.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={total === 0 || openSessionMutation.isPending}
            onClick={() => openSessionMutation.mutate()}
            data-testid="button-open-session"
          >
            {openSessionMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("openingSession")}</>
            ) : (
              `✅ ${t("openCashSession")}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
