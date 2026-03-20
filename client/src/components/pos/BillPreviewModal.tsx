import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Receipt, CreditCard, Banknote, Smartphone, Gift, Plus, Minus, Printer,
  Share2, ArrowLeft, CheckCircle2, X, AlertTriangle,
} from "lucide-react";

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  isCombo?: boolean;
  modifiers?: { name: string; price: number }[];
}

interface BillPreviewProps {
  open: boolean;
  onClose: () => void;
  cart: CartItem[];
  subtotal: number;
  discountAmount: number;
  serviceChargeAmount: number;
  taxAmount: number;
  total: number;
  orderType: string;
  tableId?: string;
  tableNumber?: string | number;
  orderId?: string;
  posSessionId?: string;
  onPaymentComplete: () => void;
}

type PaymentStep = "preview" | "payment" | "receipt";
type PaymentMethodType = "CASH" | "CARD" | "UPI" | "LOYALTY" | "WALLET";

interface SplitPaymentRow {
  id: string;
  method: PaymentMethodType;
  amount: string;
  referenceNo: string;
}

const VOID_REASONS = [
  "Customer Cancelled",
  "Incorrect Order",
  "System Error",
  "Manager Override",
  "Other",
];

function numWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (n === 0) return "Zero";
  function convert(num: number): string {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
    return ones[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + convert(num % 100) : "");
  }
  const cents = Math.round((n % 1) * 100);
  const whole = Math.floor(n);
  let r = convert(whole);
  if (cents > 0) r += ` & ${cents} Paise`;
  return r;
}

export default function BillPreviewModal({
  open, onClose, cart, subtotal, discountAmount, serviceChargeAmount, taxAmount, total,
  orderType, tableId, tableNumber, orderId, posSessionId, onPaymentComplete,
}: BillPreviewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const currency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const currencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const currencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, currency, { position: currencyPosition, decimals: currencyDecimals });

  const [step, setStep] = useState<PaymentStep>("preview");
  const [activeMethod, setActiveMethod] = useState<PaymentMethodType>("CASH");
  const [cashTendered, setCashTendered] = useState("");
  const [cardRef, setCardRef] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [tipPct, setTipPct] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [splitRows, setSplitRows] = useState<SplitPaymentRow[]>([]);
  const [isSplit, setIsSplit] = useState(false);
  const [createdBill, setCreatedBill] = useState<any>(null);
  const [billNumber, setBillNumber] = useState("");

  const tipAmount = customTip ? parseFloat(customTip) || 0 : total * (tipPct / 100);
  const grandTotal = total + tipAmount;

  const splitPaidTotal = splitRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const splitRemaining = grandTotal - splitPaidTotal;

  const taxRate = Number(user?.tenant?.taxRate || "5");
  const tenantName = user?.tenant?.name || "Restaurant";
  const tenantAddress = user?.tenant?.address || "";

  const createBillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/restaurant-bills", {
        orderId,
        tableId: tableId || null,
        subtotal: subtotal.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        serviceCharge: serviceChargeAmount.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        taxBreakdown: taxRate > 0 ? { [`Tax (${taxRate}%)`]: taxAmount.toFixed(2) } : null,
        tips: "0",
        totalAmount: total.toFixed(2),
        posSessionId: posSessionId || null,
      });
      return res.json();
    },
    onSuccess: (bill) => {
      setCreatedBill(bill);
      setBillNumber(bill.billNumber);
      setStep("payment");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const payBillMutation = useMutation({
    mutationFn: async () => {
      if (!createdBill) throw new Error("No bill created");
      const payments: { paymentMethod: string; amount: number; referenceNo?: string }[] = [];
      if (isSplit) {
        for (const row of splitRows) {
          if (parseFloat(row.amount) > 0) {
            payments.push({ paymentMethod: row.method, amount: parseFloat(row.amount), referenceNo: row.referenceNo || undefined });
          }
        }
      } else {
        const payAmount = grandTotal;
        const refNo = activeMethod === "CARD" ? `${cardLast4}/${cardRef}`.replace(/^\//, "") : undefined;
        payments.push({ paymentMethod: activeMethod, amount: payAmount, referenceNo: refNo });
      }
      const res = await apiRequest("POST", `/api/restaurant-bills/${createdBill.id}/payments`, { payments, tips: tipAmount || undefined });
      if (!res.ok) throw new Error((await res.json()).message || "Payment failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant-bills"] });
      setStep("receipt");
    },
    onError: (err: Error) => toast({ title: "Payment failed", description: err.message, variant: "destructive" }),
  });

  const handleProceedToPayment = () => {
    if (!orderId) {
      toast({ title: "Order not placed yet", description: "Please place the order first", variant: "destructive" });
      return;
    }
    createBillMutation.mutate();
  };

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = () => {
    const text = `*${tenantName}*\nBill No: ${billNumber}\nTable: ${tableNumber || "Takeaway"}\nTotal: ${fmt(grandTotal)}\nThank you!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const addSplitRow = () => {
    setSplitRows(prev => [...prev, { id: Date.now().toString(), method: "CASH", amount: "", referenceNo: "" }]);
  };

  const removeSplitRow = (id: string) => setSplitRows(prev => prev.filter(r => r.id !== id));
  const updateSplitRow = (id: string, field: keyof SplitPaymentRow, val: string) => {
    setSplitRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  };

  const handleClose = () => {
    if (step === "receipt") {
      onPaymentComplete();
    }
    setStep("preview");
    setCreatedBill(null);
    setCashTendered("");
    setCardRef("");
    setCardLast4("");
    setTipPct(0);
    setCustomTip("");
    setSplitRows([]);
    setIsSplit(false);
    onClose();
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <style>{`
        @media print {
          body > * { display: none !important; }
          .bill-print-root { display: block !important; position: fixed; top: 0; left: 0; width: 80mm; }
          .no-print { display: none !important; }
        }
        .bill-print-root { display: none; }
      `}</style>

      <div className="bill-print-root" ref={printRef}>
        <div style={{ width: "80mm", fontFamily: "monospace", fontSize: "11px", padding: "8px" }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: "bold", fontSize: 14 }}>{tenantName}</div>
            {tenantAddress && <div style={{ fontSize: 10 }}>{tenantAddress}</div>}
            <div style={{ fontSize: 10, marginTop: 4 }}>
              Bill No: {billNumber || "PREVIEW"} | {dateStr} {timeStr}
            </div>
            {tableNumber && <div>Table: {tableNumber}</div>}
            <div>Waiter: {user?.name || user?.username}</div>
          </div>
          <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Item</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Rate</th>
                <th style={{ textAlign: "right" }}>Amt</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item, i) => (
                <tr key={i}>
                  <td>{item.name}</td>
                  <td style={{ textAlign: "right" }}>{item.quantity}</td>
                  <td style={{ textAlign: "right" }}>{fmt(item.price)}</td>
                  <td style={{ textAlign: "right" }}>{fmt(item.price * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
          {discountAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Discount</span><span>-{fmt(discountAmount)}</span></div>}
          {serviceChargeAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Service Charge</span><span>{fmt(serviceChargeAmount)}</span></div>}
          {taxAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Tax ({taxRate}%)</span><span>{fmt(taxAmount)}</span></div>}
          {tipAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Tips</span><span>{fmt(tipAmount)}</span></div>}
          <div style={{ borderTop: "1px solid #000", margin: "4px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: 13 }}>
            <span>TOTAL</span><span>{fmt(grandTotal)}</span>
          </div>
          <div style={{ fontSize: 9, marginTop: 4, fontStyle: "italic" }}>{numWords(grandTotal)}</div>
          <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
          <div style={{ textAlign: "center", fontSize: 10 }}>Thank you for dining with us!</div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {step !== "preview" && (
                <Button variant="ghost" size="icon" className="h-7 w-7 no-print" onClick={() => step === "payment" ? setStep("preview") : setStep("payment")}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Receipt className="h-5 w-5 text-primary" />
              {step === "preview" ? "Bill Preview" : step === "payment" ? "Payment" : "Receipt"}
            </DialogTitle>
          </DialogHeader>

          {step === "preview" && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 text-center border">
                <h3 className="font-bold text-lg">{tenantName}</h3>
                {tenantAddress && <p className="text-xs text-muted-foreground">{tenantAddress}</p>}
                <p className="text-xs text-muted-foreground mt-1">{dateStr} · {timeStr}</p>
                {tableNumber && <p className="text-sm mt-1">Table: <strong>{tableNumber}</strong></p>}
                <p className="text-sm">Waiter: <strong>{user?.name || user?.username}</strong></p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground font-medium px-1">
                  <span>ITEM</span>
                  <div className="flex gap-8"><span>QTY</span><span>AMOUNT</span></div>
                </div>
                <Separator />
                {cart.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm py-0.5">
                    <div className="flex-1">
                      <span>{item.name}</span>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="text-xs text-muted-foreground pl-2">
                          {item.modifiers.map(m => `+ ${m.name}`).join(", ")}
                        </div>
                      )}
                      {item.notes && <div className="text-xs text-muted-foreground italic pl-2">{item.notes}</div>}
                    </div>
                    <div className="flex gap-8 text-right">
                      <span className="w-8 text-center">{item.quantity}</span>
                      <span className="w-20">{fmt(item.price * item.quantity)}</span>
                    </div>
                  </div>
                ))}
                <Separator />
                <div className="space-y-1 text-sm pt-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(subtotal)}</span></div>
                  {discountAmount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>−{fmt(discountAmount)}</span></div>}
                  {serviceChargeAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Service Charge</span><span>{fmt(serviceChargeAmount)}</span></div>}
                  {taxAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax ({taxRate}%)</span><span>{fmt(taxAmount)}</span></div>}
                  <Separator />
                  <div className="flex justify-between font-bold text-base"><span>TOTAL</span><span>{fmt(total)}</span></div>
                  <p className="text-xs text-muted-foreground italic">{numWords(total)}</p>
                </div>
              </div>

              <div className="flex gap-2 no-print">
                <Button variant="outline" size="sm" onClick={handlePrint} className="flex-1">
                  <Printer className="h-4 w-4 mr-1" /> Print Preview
                </Button>
                <Button onClick={handleProceedToPayment} disabled={createBillMutation.isPending} className="flex-1" data-testid="button-proceed-payment">
                  {createBillMutation.isPending ? "Creating bill..." : "Proceed to Payment →"}
                </Button>
              </div>
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-4">
              <div className="text-center bg-primary/5 rounded-lg p-3 border border-primary/20">
                <p className="text-sm text-muted-foreground">Amount Due</p>
                <p className="text-3xl font-bold text-primary" data-testid="text-amount-due">{fmt(grandTotal)}</p>
                {billNumber && <Badge variant="outline" className="mt-1 text-xs">{billNumber}</Badge>}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tips</p>
                <div className="flex gap-1.5">
                  {[0, 5, 10, 15].map(pct => (
                    <Button key={pct} size="sm" variant={tipPct === pct && !customTip ? "default" : "outline"}
                      className="flex-1 text-xs" onClick={() => { setTipPct(pct); setCustomTip(""); }}>
                      {pct === 0 ? "None" : `${pct}%`}
                    </Button>
                  ))}
                  <Input placeholder="Custom" type="number" value={customTip} onChange={e => { setCustomTip(e.target.value); setTipPct(0); }}
                    className="w-24 text-xs h-8" min="0" step="0.01" />
                </div>
                {tipAmount > 0 && <p className="text-xs text-muted-foreground">Tips: {fmt(tipAmount)} · Grand total: {fmt(grandTotal)}</p>}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Payment Method</p>
                <Button variant={isSplit ? "default" : "outline"} size="sm" className="text-xs" onClick={() => { setIsSplit(!isSplit); if (!isSplit && splitRows.length === 0) { setSplitRows([{ id: "1", method: "CASH", amount: "", referenceNo: "" }, { id: "2", method: "CARD", amount: "", referenceNo: "" }]); } }}>
                  <Plus className="h-3 w-3 mr-1" /> Split Payment
                </Button>
              </div>

              {!isSplit ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["CASH", "CARD", "UPI", "LOYALTY"] as PaymentMethodType[]).map(method => {
                      const Icon = method === "CASH" ? Banknote : method === "CARD" ? CreditCard : method === "UPI" ? Smartphone : Gift;
                      return (
                        <Button key={method} variant={activeMethod === method ? "default" : "outline"}
                          className="flex-col h-14 gap-0.5 text-xs" onClick={() => setActiveMethod(method)}>
                          <Icon className="h-4 w-4" />{method}
                        </Button>
                      );
                    })}
                  </div>

                  {activeMethod === "CASH" && (
                    <div className="space-y-2">
                      <Input data-testid="input-cash-tendered" placeholder={`Amount tendered (${fmt(Math.ceil(grandTotal))} suggested)`}
                        type="number" value={cashTendered} onChange={e => setCashTendered(e.target.value)} min="0" step="0.01" />
                      {cashTendered && parseFloat(cashTendered) >= grandTotal && (
                        <div className="flex justify-between bg-green-50 dark:bg-green-950/30 rounded p-2 text-sm">
                          <span className="text-green-700 dark:text-green-300 font-medium">Change due:</span>
                          <span className="text-green-700 dark:text-green-300 font-bold" data-testid="text-change-due">
                            {fmt(parseFloat(cashTendered) - grandTotal)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {activeMethod === "CARD" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Last 4 digits" maxLength={4} value={cardLast4} onChange={e => setCardLast4(e.target.value)} />
                      <Input placeholder="Reference / Approval code" value={cardRef} onChange={e => setCardRef(e.target.value)} />
                    </div>
                  )}
                  {activeMethod === "UPI" && (
                    <div className="text-center p-4 bg-muted/50 rounded-lg border">
                      <Smartphone className="h-8 w-8 mx-auto mb-2 text-primary" />
                      <p className="text-sm font-medium">UPI Payment — {fmt(grandTotal)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Show QR or share payment link, then click "Mark as Paid"</p>
                    </div>
                  )}
                  {activeMethod === "LOYALTY" && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                      <p className="text-sm text-amber-700 dark:text-amber-300">Loyalty points redemption</p>
                      <p className="text-xs text-muted-foreground mt-1">Customer must be linked to order to redeem points.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {splitRows.map((row, i) => (
                    <div key={row.id} className="flex gap-1.5 items-center">
                      <Select value={row.method} onValueChange={v => updateSplitRow(row.id, "method", v)}>
                        <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["CASH", "CARD", "UPI", "LOYALTY"].map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input placeholder="Amount" type="number" value={row.amount}
                        onChange={e => updateSplitRow(row.id, "amount", e.target.value)} className="h-8 text-xs" min="0" step="0.01" />
                      {row.method === "CARD" && (
                        <Input placeholder="Ref" value={row.referenceNo}
                          onChange={e => updateSplitRow(row.id, "referenceNo", e.target.value)} className="h-8 text-xs w-20" />
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeSplitRow(row.id)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full text-xs" onClick={addSplitRow}>
                    <Plus className="h-3 w-3 mr-1" /> Add Payment Method
                  </Button>
                  <div className={`flex justify-between text-sm font-medium ${splitRemaining > 0.01 ? "text-amber-600" : "text-green-600"}`}>
                    <span>{splitRemaining > 0.01 ? "Remaining:" : "Balance:"}</span>
                    <span>{fmt(Math.abs(splitRemaining))}{splitRemaining > 0.01 ? "" : " ✓"}</span>
                  </div>
                </div>
              )}

              <Button className="w-full" size="lg" data-testid="button-confirm-payment"
                disabled={payBillMutation.isPending || (isSplit && splitRemaining > 0.01) || (!isSplit && activeMethod === "CASH" && cashTendered !== "" && parseFloat(cashTendered) < grandTotal)}
                onClick={() => payBillMutation.mutate()}>
                {payBillMutation.isPending ? "Processing..." : `Confirm Payment · ${fmt(grandTotal)}`}
              </Button>
            </div>
          )}

          {step === "receipt" && (
            <div className="space-y-4">
              <div className="text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <h3 className="font-bold text-lg">Payment Successful!</h3>
                <p className="text-muted-foreground text-sm">{billNumber}</p>
                <p className="font-bold text-xl text-primary mt-1">{fmt(grandTotal)}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 no-print">
                <Button variant="outline" onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" /> Print Receipt
                </Button>
                <Button variant="outline" onClick={handleWhatsApp}>
                  <Share2 className="h-4 w-4 mr-2" /> WhatsApp
                </Button>
              </div>
              <Button className="w-full" size="lg" onClick={handleClose} data-testid="button-new-order">
                New Order
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
