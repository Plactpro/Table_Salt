import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { renderBillHtml, dispatchPrint } from "@/lib/print-utils";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogPageContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Receipt, CreditCard, Banknote, Smartphone, Gift, Plus, Minus, Printer,
  Share2, ArrowLeft, CheckCircle2, X, AlertTriangle, Mail, RotateCcw, FileDown,
  Loader2, ExternalLink, QrCode, User, Cake, Heart, Star, StickyNote,
} from "lucide-react";
import QRCode from "qrcode";

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  isCombo?: boolean;
  modifiers?: { name: string; price: number }[];
  hsnCode?: string | null;
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
  fullPage?: boolean;
}

type PaymentStep = "preview" | "payment" | "receipt" | "void" | "refund";
type PaymentMethodType = "CASH" | "CARD" | "UPI" | "LOYALTY" | "WALLET";

interface SplitPaymentRow {
  id: string;
  method: PaymentMethodType;
  amount: string;
  referenceNo: string;
}

interface CreatedBill {
  id: string;
  billNumber: string;
  tenantId: string;
  orderId: string;
  totalAmount: string;
  paymentStatus: string;
  alreadyExists?: boolean;
  invoiceNumber?: string | null;
  cgstAmount?: string | null;
  sgstAmount?: string | null;
  customerGstin?: string | null;
}

const VOID_REASONS = [
  "Customer Cancelled",
  "Incorrect Order",
  "System Error",
  "Manager Override",
  "Other",
];

const REFUND_REASONS = [
  "Overcharge",
  "Wrong Item Served",
  "Customer Dissatisfied",
  "Duplicate Payment",
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
  orderType, tableId, tableNumber, orderId, posSessionId, onPaymentComplete, fullPage = false,
}: BillPreviewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const currency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const currencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const currencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, currency, { position: currencyPosition, decimals: currencyDecimals });
  const isGSTTenant = currency === "INR" && user?.tenant?.taxType === "gst";

  const [step, setStep] = useState<PaymentStep>("preview");
  const [activeMethod, setActiveMethod] = useState<PaymentMethodType>("CASH");
  const [cashTendered, setCashTendered] = useState("");
  const [cardRef, setCardRef] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [tipPct, setTipPct] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [splitRows, setSplitRows] = useState<SplitPaymentRow[]>([]);
  const [isSplit, setIsSplit] = useState(false);
  const [createdBill, setCreatedBill] = useState<CreatedBill | null>(null);
  const [billNumber, setBillNumber] = useState("");
  const [billVoided, setBillVoided] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidNotes, setVoidNotes] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [upiMarkedPaid, setUpiMarkedPaid] = useState(false);
  const [loyaltySearchPhone, setLoyaltySearchPhone] = useState("");
  const [lookedUpCustomer, setLookedUpCustomer] = useState<{
    id: string; name: string; loyaltyPoints: number; gstin?: string | null;
    birthday?: string | null; anniversary?: string | null;
    totalSpent?: string | null; visitCount?: number | null;
    lastVisitAt?: string | null; loyaltyTier?: string | null;
    notes?: string | null; tags?: string[] | null;
    phone?: string | null;
    activeOffers?: { id: string; name: string; type: string; value: string; maxDiscount?: string | null }[] | null;
  } | null>(null);
  const [loyaltySearching, setLoyaltySearching] = useState(false);

  const [crmPhone, setCrmPhone] = useState("");
  const [crmSearching, setCrmSearching] = useState(false);
  const [crmQuickNote, setCrmQuickNote] = useState("");
  const [crmNoteSaving, setCrmNoteSaving] = useState(false);
  const [tierDiscountAmount, setTierDiscountAmount] = useState(0);
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);
  const [customerGstinInput, setCustomerGstinInput] = useState("");
  const [rzpLinkId, setRzpLinkId] = useState<string | null>(null);
  const [rzpShortUrl, setRzpShortUrl] = useState<string | null>(null);
  const [rzpQrDataUrl, setRzpQrDataUrl] = useState<string | null>(null);
  const [rzpPolling, setRzpPolling] = useState(false);
  const [rzpInitiating, setRzpInitiating] = useState(false);
  const [rzpPaid, setRzpPaid] = useState(false);
  // Tracks whether at least one Razorpay link was attempted (enables manual fallback)
  const [rzpAttempted, setRzpAttempted] = useState(false);

  const { data: tenantOffers = [] } = useQuery<{ id: string; name: string; type: string; value: string; maxDiscount?: string | null }[]>({
    queryKey: ["/api/offers", "active"],
    queryFn: async () => {
      const res = await fetch("/api/offers?active=true&limit=200", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.data ?? []);
    },
    enabled: open,
    staleTime: 60000,
  });

  const birthdayOffer = tenantOffers.find(o =>
    /birthday/i.test(o.name) && (o.type === "percentage" || o.type === "fixed_amount")
  ) ?? null;
  const anniversaryOffer = tenantOffers.find(o =>
    /anniversary/i.test(o.name) && (o.type === "percentage" || o.type === "fixed_amount")
  ) ?? null;

  const { data: existingBillData, status: existingBillStatus } = useQuery({
    queryKey: ["/api/restaurant-bills/by-order", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/restaurant-bills/by-order/${orderId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!orderId,
    retry: false,
  });

  useEffect(() => {
    if (existingBillData && !createdBill) {
      setCreatedBill(existingBillData);
      setBillNumber(existingBillData.billNumber || "");
      if (existingBillData.paymentStatus === "paid") {
        setStep("receipt");
      } else if (existingBillData.paymentStatus === "partially_paid") {
        setStep("payment");
      }
    }
  }, [existingBillData]);

  useEffect(() => {
    if (fullPage && orderId && existingBillStatus === "success" && !existingBillData && !createdBill && !createBillMutation.isPending) {
      createBillMutation.mutate();
    }
  }, [fullPage, orderId, existingBillStatus, existingBillData, createdBill]);

  useEffect(() => {
    if (rzpShortUrl) {
      QRCode.toDataURL(rzpShortUrl, { width: 200, margin: 2, color: { dark: "#000000", light: "#ffffff" } })
        .then((url: string) => setRzpQrDataUrl(url))
        .catch(() => setRzpQrDataUrl(null));
    } else {
      setRzpQrDataUrl(null);
    }
  }, [rzpShortUrl]);

  useEffect(() => {
    if (!rzpPolling || !createdBill || rzpPaid) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/restaurant-bills/${createdBill.id}/payment-status`,
          { credentials: "include" }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "paid") {
          setRzpPaid(true);
          setRzpPolling(false);
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
          queryClient.invalidateQueries({ queryKey: ["/api/restaurant-bills"] });
          queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
          setStep("receipt");
        } else if (data.status === "cancelled") {
          setRzpPolling(false);
          toast({ title: "Payment cancelled", description: "The payment link expired or was cancelled", variant: "destructive" });
        }
      } catch (_) {}
    }, 3000);
    return () => clearInterval(interval);
  }, [rzpPolling, createdBill, rzpPaid, activeMethod]);

  const handleInitiateRazorpay = async () => {
    if (!createdBill) return;
    setRzpInitiating(true);
    setRzpAttempted(true); // mark gateway as attempted — enables manual fallback if this link later fails
    try {
      const res = await apiRequest("POST", `/api/restaurant-bills/${createdBill.id}/payment-request`, {
        method: activeMethod,
        tips: tipAmount || 0,
      });
      const data = await res.json();
      setRzpLinkId(data.paymentLinkId);
      setRzpShortUrl(data.shortUrl);
      setRzpPolling(true);
    } catch (err: any) {
      toast({ title: "Could not initiate payment", description: err.message, variant: "destructive" });
    } finally {
      setRzpInitiating(false);
    }
  };

  const tipAmount = customTip ? parseFloat(customTip) || 0 : total * (tipPct / 100);
  const loyaltyRedemptionValue = loyaltyPointsToRedeem * 0.01;
  const grandTotal = Math.max(0, total - tierDiscountAmount + tipAmount - loyaltyRedemptionValue);

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
        customerId: lookedUpCustomer?.id || null,
        subtotal: subtotal.toFixed(2),
        discountAmount: (discountAmount + tierDiscountAmount).toFixed(2),
        serviceCharge: serviceChargeAmount.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        taxBreakdown: taxRate > 0 ? { [`Tax (${taxRate}%)`]: taxAmount.toFixed(2) } : null,
        tips: "0",
        totalAmount: (total - tierDiscountAmount).toFixed(2),
        posSessionId: posSessionId || null,
        customerGstin: isGSTTenant && customerGstinInput ? customerGstinInput : undefined,
      });
      return res.json();
    },
    onSuccess: (bill) => {
      setCreatedBill(bill);
      setBillNumber(bill.billNumber);
      if (bill.alreadyExists && bill.paymentStatus === "paid") {
        setStep("receipt");
      } else {
        setStep("payment");
      }
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
      } else if (activeMethod === "LOYALTY") {
        if (loyaltyRedemptionValue > 0) {
          payments.push({ paymentMethod: "LOYALTY", amount: loyaltyRedemptionValue });
        }
      } else {
        const refNo = activeMethod === "CARD" ? `${cardLast4}/${cardRef}`.replace(/^\//, "") : undefined;
        payments.push({ paymentMethod: activeMethod, amount: grandTotal, referenceNo: refNo });
        if (loyaltyPointsToRedeem > 0 && loyaltyRedemptionValue > 0) {
          payments.push({ paymentMethod: "LOYALTY", amount: loyaltyRedemptionValue });
        }
      }
      const res = await apiRequest("POST", `/api/restaurant-bills/${createdBill.id}/payments`, {
        payments,
        tips: tipAmount || undefined,
        loyaltyPointsRedeemed: loyaltyPointsToRedeem || undefined,
        loyaltyCustomerId: lookedUpCustomer?.id || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant-bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setStep("receipt");
    },
    onError: (err: Error) => toast({ title: "Payment failed", description: err.message, variant: "destructive" }),
  });

  const voidBillMutation = useMutation({
    mutationFn: async () => {
      if (!createdBill) throw new Error("No bill to void");
      if (!voidReason) throw new Error("Void reason is required");
      const res = await apiRequest("PUT", `/api/restaurant-bills/${createdBill.id}/void`, {
        reason: voidNotes ? `${voidReason} — ${voidNotes}` : voidReason,
      });
      return res.json();
    },
    onSuccess: () => {
      setBillVoided(true);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant-bills"] });
      toast({ title: "Bill voided", description: "Stock reversals have been applied" });
      handleClose();
    },
    onError: (err: Error) => toast({ title: "Void failed", description: err.message, variant: "destructive" }),
  });

  const refundBillMutation = useMutation({
    mutationFn: async () => {
      if (!createdBill) throw new Error("No bill to refund");
      if (!refundAmount || !refundReason) throw new Error("Amount and reason required");
      const res = await apiRequest("POST", `/api/restaurant-bills/${createdBill.id}/refund`, {
        amount: parseFloat(refundAmount),
        reason: refundReason,
        paymentMethod: "CASH",
      });
      return res.json();
    },
    onSuccess: () => {
      setStep("receipt");
      setRefundAmount("");
      setRefundReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant-bills"] });
      toast({ title: "Refund recorded", description: `${fmt(parseFloat(refundAmount))} refunded` });
    },
    onError: (err: Error) => toast({ title: "Refund failed", description: err.message, variant: "destructive" }),
  });

  const handleProceedToPayment = () => {
    if (!orderId) {
      toast({ title: "Order not placed yet", description: "Please place the order first", variant: "destructive" });
      return;
    }
    createBillMutation.mutate();
  };

  const handlePrint = useCallback(async () => {
    const loyaltyEarned = Math.floor(grandTotal / 10);
    const isGST = isGSTTenant;
    const cgst = isGST ? taxAmount / 2 : 0;
    const sgst = isGST ? taxAmount / 2 : 0;
    const billPayload = {
      billNumber: billNumber || createdBill?.billNumber || "",
      invoiceNumber: createdBill?.invoiceNumber,
      orderId,
      orderType,
      tableNumber,
      items: cart.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        notes: item.notes || null,
        hsnCode: item.hsnCode || null,
      })),
      subtotal,
      discountAmount: discountAmount + tierDiscountAmount,
      serviceCharge: serviceChargeAmount,
      taxAmount,
      taxType: user?.tenant?.taxType || "none",
      taxRate,
      cgstAmount: cgst,
      sgstAmount: sgst,
      tips: tipAmount,
      totalAmount: grandTotal,
      paymentMethod: activeMethod,
      customerName: lookedUpCustomer?.name || null,
      customerGstin: (createdBill?.customerGstin || customerGstinInput) || null,
      loyaltyPointsEarned: lookedUpCustomer ? loyaltyEarned : undefined,
    };

    const html = renderBillHtml({
      restaurantName: tenantName,
      restaurantAddress: tenantAddress || undefined,
      restaurantGstin: (user?.tenant as any)?.gstin || undefined,
      billNumber: billPayload.billNumber,
      invoiceNumber: billPayload.invoiceNumber,
      orderId: billPayload.orderId || "",
      orderType: billPayload.orderType,
      tableNumber: typeof billPayload.tableNumber === "number" ? billPayload.tableNumber : undefined,
      items: billPayload.items,
      subtotal: billPayload.subtotal,
      discountAmount: billPayload.discountAmount,
      serviceCharge: billPayload.serviceCharge,
      taxAmount: billPayload.taxAmount,
      taxType: billPayload.taxType,
      taxRate: billPayload.taxRate,
      cgstAmount: billPayload.cgstAmount,
      sgstAmount: billPayload.sgstAmount,
      tips: billPayload.tips,
      totalAmount: billPayload.totalAmount,
      paymentMethod: billPayload.paymentMethod,
      customerName: billPayload.customerName,
      customerGstin: billPayload.customerGstin,
      loyaltyPointsEarned: billPayload.loyaltyPointsEarned,
    });

    const refId = createdBill?.id || orderId || "";
    let jobId: string | undefined;
    if (refId) {
      try {
        const res = await apiRequest("POST", "/api/print-jobs", {
          type: "bill",
          referenceId: refId,
          station: null,
          payload: billPayload,
        });
        const job = await res.json();
        jobId = job?.id;
      } catch (_) {}
    }

    const networkSuccess = await dispatchPrint(html, null, () => {
      if (jobId) apiRequest("PATCH", `/api/print-jobs/${jobId}/status`, { status: "printed" }).catch(() => {});
    });
    if (!networkSuccess && jobId) {
      apiRequest("PATCH", `/api/print-jobs/${jobId}/status`, { status: "printed" }).catch(() => {});
    }
  }, [
    billNumber, createdBill, orderId, orderType, tableNumber, cart,
    subtotal, discountAmount, tierDiscountAmount, serviceChargeAmount,
    taxAmount, taxRate, grandTotal, tipAmount, activeMethod,
    lookedUpCustomer, customerGstinInput, isGSTTenant,
    tenantName, tenantAddress, user,
  ]);

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
    if (step === "receipt" || billVoided) {
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
    setBillVoided(false);
    setVoidReason("");
    setVoidNotes("");
    setRefundAmount("");
    setRefundReason("");
    setUpiMarkedPaid(false);
    setLoyaltySearchPhone("");
    setLookedUpCustomer(null);
    setLoyaltySearching(false);
    setCrmPhone("");
    setCrmSearching(false);
    setCrmQuickNote("");
    setCrmNoteSaving(false);
    setTierDiscountAmount(0);
    // Reset Razorpay gateway state so it doesn't bleed into the next bill session
    setRzpLinkId(null);
    setRzpShortUrl(null);
    setRzpQrDataUrl(null);
    setRzpPolling(false);
    setRzpInitiating(false);
    setRzpPaid(false);
    setRzpAttempted(false);
    onClose();
  };

  const isManagerOrOwner = user?.role === "manager" || user?.role === "owner";

  interface CrmActiveOffer {
    id: string;
    name: string;
    type: string;
    value: string;
    maxDiscount?: string | null;
  }
  interface CrmCustomerMatch {
    id: string;
    name: string;
    loyaltyPoints: number;
    gstin?: string | null;
    birthday?: string | null;
    anniversary?: string | null;
    totalSpent?: string | null;
    visitCount?: number | null;
    lastVisitAt?: string | null;
    loyaltyTier?: string | null;
    notes?: string | null;
    tags?: string[] | null;
    phone?: string | null;
    activeOffers?: CrmActiveOffer[] | null;
  }

  const setCustomerFromMatch = useCallback((match: CrmCustomerMatch) => {
    setLookedUpCustomer({
      id: match.id,
      name: match.name,
      loyaltyPoints: match.loyaltyPoints ?? 0,
      gstin: match.gstin ?? null,
      birthday: match.birthday ?? null,
      anniversary: match.anniversary ?? null,
      totalSpent: match.totalSpent ?? null,
      visitCount: match.visitCount ?? null,
      lastVisitAt: match.lastVisitAt ?? null,
      loyaltyTier: match.loyaltyTier ?? null,
      notes: match.notes ?? null,
      tags: match.tags ?? null,
      phone: match.phone ?? null,
      activeOffers: match.activeOffers ?? null,
    });
    if (isGSTTenant && match.gstin) setCustomerGstinInput(match.gstin);
    setCrmQuickNote("");
  }, [isGSTTenant]);

  const handleLoyaltySearch = useCallback(async () => {
    if (!loyaltySearchPhone.trim()) return;
    setLoyaltySearching(true);
    try {
      const res = await apiRequest("GET", `/api/customers?phone=${encodeURIComponent(loyaltySearchPhone.trim())}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.data ?? data.customers ?? []);
      const match: CrmCustomerMatch | null = list[0] ?? null;
      if (match) {
        setCustomerFromMatch(match);
      } else {
        toast({ title: "Customer not found", description: "No customer with that phone number", variant: "destructive" });
      }
    } catch {
      toast({ title: "Lookup failed", description: "Could not search customers", variant: "destructive" });
    } finally {
      setLoyaltySearching(false);
    }
  }, [loyaltySearchPhone, toast, setCustomerFromMatch]);

  const handleCrmSearch = useCallback(async () => {
    if (!crmPhone.trim()) return;
    setCrmSearching(true);
    try {
      const res = await apiRequest("GET", `/api/customers/lookup?phone=${encodeURIComponent(crmPhone.trim())}`);
      if (!res.ok) {
        toast({ title: "Customer not found", description: "No CRM profile for that number", variant: "destructive" });
        return;
      }
      const match: CrmCustomerMatch = await res.json();
      setCustomerFromMatch(match);
      setLoyaltySearchPhone(crmPhone.trim());
      setTierDiscountAmount(0);
    } catch {
      toast({ title: "Lookup failed", description: "Could not search customers", variant: "destructive" });
    } finally {
      setCrmSearching(false);
    }
  }, [crmPhone, toast, setCustomerFromMatch]);

  const handleCrmSaveNote = useCallback(async () => {
    if (!lookedUpCustomer || !crmQuickNote.trim()) return;
    setCrmNoteSaving(true);
    try {
      const updated = await apiRequest("PATCH", `/api/customers/${lookedUpCustomer.id}`, { appendNote: crmQuickNote.trim() });
      const updatedCustomer = await updated.json();
      setLookedUpCustomer(prev => prev ? { ...prev, notes: updatedCustomer.notes } : prev);
      setCrmQuickNote("");
      toast({ title: "Note saved", description: "Visit note appended to customer record" });
    } catch {
      toast({ title: "Save failed", description: "Could not save note", variant: "destructive" });
    } finally {
      setCrmNoteSaving(false);
    }
  }, [lookedUpCustomer, crmQuickNote, toast]);
  const handleEmailReceipt = () => {
    const subject = encodeURIComponent(`Receipt from ${tenantName} — ${billNumber}`);
    const body = encodeURIComponent(
      `${tenantName}\nBill No: ${billNumber}\nTable: ${tableNumber || "Takeaway"}\nDate: ${dateStr} ${timeStr}\n\nTotal: ${fmt(grandTotal)}\n\nThank you for dining with us!`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const BillWrapper = fullPage ? DialogPageContent : DialogContent;
  const billWrapperClass = fullPage
    ? "min-h-screen flex flex-col"
    : "max-w-lg max-h-[90vh] overflow-y-auto";
  const stepLabel = step === "preview" ? "Bill Preview" : step === "payment" ? "Payment" : step === "void" ? "Void Bill" : step === "refund" ? "Issue Refund" : "Receipt";
  const goBack = () => {
    if (step === "payment") setStep("preview");
    else if (step === "void" || step === "refund") setStep("receipt");
    else setStep("payment");
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .bill-print-root, .bill-print-root * { visibility: visible; }
          .bill-print-root { position: fixed; top: 0; left: 0; width: 80mm; }
        }
        .bill-print-root { display: none; }
        @media print { .bill-print-root { display: block; } }
      `}</style>

      <div className="bill-print-root" ref={printRef}>
        <div style={{ width: "80mm", fontFamily: "monospace", fontSize: "11px", padding: "8px" }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: "bold", fontSize: 14 }}>{tenantName}</div>
            {tenantAddress && <div style={{ fontSize: 10 }}>{tenantAddress}</div>}
            {isGSTTenant && user?.tenant?.gstin && (
              <div style={{ fontSize: 10 }}>GSTIN: {user.tenant.gstin}</div>
            )}
            <div style={{ fontSize: 10, marginTop: 4 }}>
              {isGSTTenant && createdBill?.invoiceNumber
                ? <>Invoice: {createdBill.invoiceNumber} | {dateStr} {timeStr}</>
                : <>Bill No: {billNumber || "PREVIEW"} | {dateStr} {timeStr}</>
              }
            </div>
            {tableNumber && <div>Table: {tableNumber}</div>}
            <div>Waiter: {user?.name || user?.username}</div>
            {isGSTTenant && createdBill?.customerGstin && (
              <div style={{ fontSize: 10 }}>Cust. GSTIN: {createdBill.customerGstin}</div>
            )}
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
                  <td>
                    <div>{item.name}</div>
                    {isGSTTenant && item.hsnCode && (
                      <div style={{ fontSize: 9, color: "#666" }}>HSN: {item.hsnCode}</div>
                    )}
                  </td>
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
          {taxAmount > 0 && isGSTTenant && createdBill ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>CGST ({Number(user?.tenant?.cgstRate ?? 9)}%)</span>
                <span>{fmt(Number(createdBill.cgstAmount ?? taxAmount / 2))}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>SGST ({Number(user?.tenant?.sgstRate ?? 9)}%)</span>
                <span>{fmt(Number(createdBill.sgstAmount ?? taxAmount / 2))}</span>
              </div>
            </>
          ) : (
            taxAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Tax ({taxRate}%)</span><span>{fmt(taxAmount)}</span></div>
          )}
          {tipAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Tips</span><span>{fmt(tipAmount)}</span></div>}
          <div style={{ borderTop: "1px solid #000", margin: "4px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: 13 }}>
            <span>TOTAL</span><span>{fmt(grandTotal)}</span>
          </div>
          <div style={{ fontSize: 9, marginTop: 4, fontStyle: "italic" }}>{numWords(grandTotal)}</div>
          <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
          <div style={{ textAlign: "center", fontSize: 10 }}>Thank you for dining with us!</div>
          {isGSTTenant && (
            <div style={{ textAlign: "center", fontSize: 9, marginTop: 4 }}>This is a computer-generated tax invoice.</div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <BillWrapper className={billWrapperClass}>
          {fullPage ? (
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b px-4 py-3 flex items-center gap-2 no-print">
              {step !== "preview" && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Receipt className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">{stepLabel}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={handleClose} data-testid="button-close-bill-page">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {step !== "preview" && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 no-print" onClick={goBack}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <Receipt className="h-5 w-5 text-primary" />
                {stepLabel}
              </DialogTitle>
            </DialogHeader>
          )}
          <div className={fullPage ? "max-w-2xl mx-auto w-full py-6 px-4 space-y-4 flex-1" : ""}>

          {step === "preview" && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 text-center border">
                <h3 className="font-bold text-lg">{tenantName}</h3>
                {tenantAddress && <p className="text-xs text-muted-foreground">{tenantAddress}</p>}
                <p className="text-xs text-muted-foreground mt-1">{dateStr} · {timeStr}</p>
                <Badge variant="outline" className="mt-1.5 text-xs font-mono tracking-wide" data-testid="text-invoice-preview-number">
                  {billNumber || "PENDING"}
                </Badge>
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
                  {tierDiscountAmount > 0 && <div className="flex justify-between text-green-600 text-xs" data-testid="preview-tier-discount-row"><span>Loyalty Tier Discount</span><span>−{fmt(tierDiscountAmount)}</span></div>}
                  {serviceChargeAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Service Charge</span><span>{fmt(serviceChargeAmount)}</span></div>}
                  {taxAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax ({taxRate}%)</span><span>{fmt(taxAmount)}</span></div>}
                  <Separator />
                  <div className="flex justify-between font-bold text-base"><span>TOTAL</span><span>{fmt(Math.max(0, total - tierDiscountAmount))}</span></div>
                  <p className="text-xs text-muted-foreground italic">{numWords(total)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2 border" data-testid="preview-qr-section">
                <div className="w-14 h-14 shrink-0 rounded bg-white dark:bg-gray-100 border-2 border-dashed border-primary/40 flex flex-col items-center justify-center gap-0.5" data-testid="upi-qr-placeholder-preview">
                  <div className="grid grid-cols-3 gap-0.5 opacity-30">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className={`w-3 h-3 rounded-sm ${[0,2,6,8].includes(i) ? "bg-primary" : i === 4 ? "bg-primary/50" : "bg-gray-400"}`} />
                    ))}
                  </div>
                  <p className="text-[8px] text-muted-foreground">QR</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Quick Pay via UPI</p>
                  <p>Customer can scan QR on payment step</p>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-3 space-y-2 no-print" data-testid="crm-customer-section">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <User className="h-3.5 w-3.5" />
                  Customer Profile (CRM)
                </div>
                {lookedUpCustomer ? (
                  <div className="space-y-2">
                    {(() => {
                      const now = new Date();
                      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                      function daysUntil(dateStr: string | null | undefined): number | null {
                        if (!dateStr) return null;
                        const parts = dateStr.split("-");
                        if (parts.length < 3) return null;
                        const mm = parseInt(parts[1], 10);
                        const dd = parseInt(parts[2], 10);
                        if (isNaN(mm) || isNaN(dd)) return null;
                        const thisYear = new Date(todayMidnight.getFullYear(), mm - 1, dd);
                        const nextYear = new Date(todayMidnight.getFullYear() + 1, mm - 1, dd);
                        const target = thisYear.getTime() >= todayMidnight.getTime() ? thisYear : nextYear;
                        return Math.round((target.getTime() - todayMidnight.getTime()) / 86400000);
                      }
                      const bdDays = daysUntil(lookedUpCustomer.birthday);
                      const annDays = daysUntil(lookedUpCustomer.anniversary);
                      const isBirthday = bdDays !== null && bdDays <= 3;
                      const isAnniversary = annDays !== null && annDays <= 3;
                      if (!isBirthday && !isAnniversary) return null;
                      const icon = isBirthday ? <Cake className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : <Heart className="h-3.5 w-3.5 shrink-0 text-rose-500" />;
                      const label = isBirthday
                        ? bdDays === 0 ? "Today is this customer's birthday!" : `Birthday in ${bdDays} day${bdDays > 1 ? "s" : ""}!`
                        : annDays === 0 ? "Today is this customer's anniversary!" : `Anniversary in ${annDays! > 1 ? `${annDays} days` : "1 day"}!`;
                      const activeOffers = lookedUpCustomer.activeOffers ?? [];
                      const birthdayActiveOffer = activeOffers.find(o => /birthday/i.test(o.name)) ?? birthdayOffer;
                      const anniversaryActiveOffer = activeOffers.find(o => /anniversary/i.test(o.name)) ?? anniversaryOffer;
                      const applicableOffer = isBirthday ? birthdayActiveOffer : anniversaryActiveOffer;
                      const offerDiscount = applicableOffer
                        ? applicableOffer.type === "percentage"
                          ? Math.min(subtotal * (Number(applicableOffer.value) / 100), applicableOffer.maxDiscount ? Number(applicableOffer.maxDiscount) : Infinity)
                          : Number(applicableOffer.value)
                        : 0;
                      const occasionOfferApplied = tierDiscountAmount > 0 && applicableOffer !== null && Math.abs(tierDiscountAmount - offerDiscount) < 0.01;
                      return (
                        <div className="rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 font-medium space-y-1.5" data-testid="crm-occasion-banner">
                          <div className="flex items-center gap-2">
                            {icon}
                            <span>{label}</span>
                          </div>
                          {applicableOffer ? (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-amber-700 dark:text-amber-400 truncate">
                                Offer: {applicableOffer.name} ({applicableOffer.type === "percentage" ? `${applicableOffer.value}% off` : fmt(Number(applicableOffer.value))} off)
                              </span>
                              <Button
                                size="sm"
                                variant={occasionOfferApplied ? "secondary" : "default"}
                                className="h-5 text-[10px] px-2 shrink-0 bg-amber-500 hover:bg-amber-600 text-white border-0"
                                onClick={() => {
                                  setTierDiscountAmount(occasionOfferApplied ? 0 : offerDiscount);
                                  toast({ title: occasionOfferApplied ? "Offer removed" : isBirthday ? "Birthday offer applied" : "Anniversary offer applied", description: occasionOfferApplied ? "Discount removed" : `"${applicableOffer.name}" applied to this bill` });
                                }}
                                data-testid="button-crm-apply-occasion-offer"
                              >
                                {occasionOfferApplied ? "Remove" : "Apply Offer"}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-amber-600 dark:text-amber-500">No birthday/anniversary offer configured — consider applying a manual discount</span>
                          )}
                        </div>
                      );
                    })()}
                    <div className="flex items-start justify-between gap-2 bg-muted/40 rounded-lg p-2.5 border" data-testid="crm-profile-card">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="text-sm font-semibold leading-tight truncate" data-testid="crm-customer-name">{lookedUpCustomer.name}</p>
                        {lookedUpCustomer.phone && <p className="text-xs text-muted-foreground" data-testid="crm-customer-phone">{lookedUpCustomer.phone}</p>}
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          {lookedUpCustomer.loyaltyTier && (
                            <Badge variant="outline" className="text-[10px] capitalize px-1.5 py-0" data-testid="crm-loyalty-tier">
                              <Star className="h-2.5 w-2.5 mr-0.5" />{lookedUpCustomer.loyaltyTier}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground" data-testid="crm-visit-count">
                            {(() => {
                              const n = (lookedUpCustomer.visitCount ?? 0) + 1;
                              const sfx = n === 11 || n === 12 || n === 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
                              return `${n}${sfx} visit`;
                            })()}
                          </span>
                          <span className="text-[10px] text-muted-foreground" data-testid="crm-total-spent">
                            {fmt(parseFloat(lookedUpCustomer.totalSpent ?? "0"))} lifetime
                          </span>
                        </div>
                        {lookedUpCustomer.loyaltyTier && (() => {
                          const tierDiscounts: Record<string, number> = {
                            bronze: 0,
                            silver: 5,
                            gold: 10,
                            platinum: 15,
                          };
                          const pct = tierDiscounts[lookedUpCustomer.loyaltyTier!.toLowerCase()] ?? 0;
                          if (pct === 0) return null;
                          const tierLabel = lookedUpCustomer.loyaltyTier!.charAt(0).toUpperCase() + lookedUpCustomer.loyaltyTier!.slice(1);
                          const discountValue = Math.min(subtotal * (pct / 100), subtotal);
                          const alreadyApplied = tierDiscountAmount > 0;
                          return (
                            <div className="flex items-center gap-2 mt-0.5" data-testid="crm-tier-benefit-row">
                              <p className="text-[10px] text-primary/70 flex-1" data-testid="crm-tier-benefit">
                                {tierLabel} — {pct}% loyalty discount applicable ({fmt(discountValue)} off)
                              </p>
                              <Button
                                size="sm"
                                variant={alreadyApplied ? "secondary" : "outline"}
                                className="h-5 text-[10px] px-2 shrink-0"
                                onClick={() => {
                                  setTierDiscountAmount(alreadyApplied ? 0 : discountValue);
                                  toast({ title: alreadyApplied ? "Tier discount removed" : "Tier discount applied", description: alreadyApplied ? "Discount removed from bill" : `${pct}% ${tierLabel} discount applied` });
                                }}
                                data-testid="button-crm-apply-tier-offer"
                              >
                                {alreadyApplied ? "Remove" : "Apply Offer"}
                              </Button>
                            </div>
                          );
                        })()}
                        {lookedUpCustomer.tags && lookedUpCustomer.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap mt-1">
                            {lookedUpCustomer.tags.map(tag => (
                              <span key={tag} className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5" data-testid={`crm-tag-${tag}`}>{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 text-xs shrink-0" onClick={() => { setLookedUpCustomer(null); setCrmPhone(""); setCrmQuickNote(""); setTierDiscountAmount(0); }}>
                        Change
                      </Button>
                    </div>
                    {lookedUpCustomer.notes && (
                      <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5 border font-mono whitespace-pre-wrap" data-testid="crm-existing-notes">
                        {lookedUpCustomer.notes}
                      </div>
                    )}
                    <div className="space-y-1" data-testid="crm-quick-note-section">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <StickyNote className="h-3 w-3" /> Add Visit Note
                      </p>
                      <div className="flex gap-1.5">
                        <Textarea
                          placeholder="Note about this visit (appended with timestamp)..."
                          value={crmQuickNote}
                          onChange={e => setCrmQuickNote(e.target.value)}
                          rows={2}
                          className="text-xs flex-1 min-h-0 resize-none"
                          data-testid="input-crm-quick-note"
                        />
                        <Button size="sm" variant="outline" className="text-xs h-auto self-stretch px-2" onClick={handleCrmSaveNote} disabled={crmNoteSaving || !crmQuickNote.trim()} data-testid="button-crm-save-note">
                          {crmNoteSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1.5" data-testid="crm-search-area">
                    <Input
                      placeholder="Phone number to link customer"
                      value={crmPhone}
                      onChange={e => setCrmPhone(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleCrmSearch()}
                      className="h-8 text-xs flex-1"
                      data-testid="input-crm-phone"
                    />
                    <Button size="sm" className="h-8 text-xs" onClick={handleCrmSearch} disabled={crmSearching} data-testid="button-crm-search">
                      {crmSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : "Find"}
                    </Button>
                  </div>
                )}
              </div>

              {isGSTTenant && (
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-950/20 p-3 no-print">
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-2">Customer GSTIN (B2B Invoice)</p>
                  <Input
                    placeholder="22AAAAA0000A1Z5 (optional)"
                    value={customerGstinInput}
                    onChange={(e) => setCustomerGstinInput(e.target.value.toUpperCase())}
                    maxLength={15}
                    className="font-mono text-sm"
                    data-testid="input-bill-customer-gstin"
                  />
                </div>
              )}

              <div className="flex gap-2 no-print">
                <Button variant="outline" size="sm" onClick={handlePrint} className="flex-1">
                  <Printer className="h-4 w-4 mr-1" /> Print Preview
                </Button>
                <Button onClick={handleProceedToPayment} disabled={createBillMutation.isPending} className="flex-1" data-testid="button-proceed-payment">
                  {createBillMutation.isPending ? "Creating bill..." : "Proceed to Payment →"}
                </Button>
              </div>
              {isManagerOrOwner && createdBill && (
                <Button variant="outline" size="sm" className="w-full text-xs text-destructive border-destructive/40 hover:bg-destructive/10 no-print"
                  onClick={() => setStep("void")} data-testid="button-void-bill-preview">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Void Bill
                </Button>
              )}
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
                    <div className="space-y-2">
                      {user?.tenant?.razorpayEnabled && (
                        <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 p-3 space-y-3" data-testid="razorpay-card-section">
                          {!rzpLinkId ? (
                            <div className="text-center space-y-2">
                              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Gateway Payment — {fmt(grandTotal)}</p>
                              <p className="text-xs text-muted-foreground">Create a Razorpay payment link for the customer to pay online</p>
                              <Button
                                size="sm"
                                className="text-xs"
                                onClick={handleInitiateRazorpay}
                                disabled={rzpInitiating}
                                data-testid="button-razorpay-initiate-card"
                              >
                                {rzpInitiating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <QrCode className="h-3 w-3 mr-1" />}
                                {rzpInitiating ? "Generating…" : "Generate Payment Link"}
                              </Button>
                            </div>
                          ) : (
                            <div className="text-center space-y-2">
                              {rzpQrDataUrl ? (
                                <img src={rzpQrDataUrl} alt="Payment QR Code" className="w-28 h-28 mx-auto rounded border" data-testid="razorpay-qr-image" />
                              ) : (
                                <div className="w-28 h-28 mx-auto flex items-center justify-center bg-muted rounded border">
                                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex items-center justify-center gap-1.5">
                                <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Waiting for payment…</p>
                              </div>
                              <a href={rzpShortUrl!} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline flex items-center justify-center gap-1" data-testid="razorpay-payment-link">
                                <ExternalLink className="h-3 w-3" /> Open payment link
                              </a>
                              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => { setRzpLinkId(null); setRzpShortUrl(null); setRzpPolling(false); }}>
                                Cancel link
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      {(!user?.tenant?.razorpayEnabled || (rzpAttempted && !rzpLinkId)) && (
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Last 4 digits" maxLength={4} value={cardLast4} onChange={e => setCardLast4(e.target.value)} data-testid="input-card-last4" />
                          <Input placeholder="Reference / Approval code" value={cardRef} onChange={e => setCardRef(e.target.value)} data-testid="input-card-ref" />
                        </div>
                      )}
                    </div>
                  )}
                  {activeMethod === "UPI" && (
                    <div className="text-center p-4 bg-muted/50 rounded-lg border space-y-3">
                      {user?.tenant?.razorpayEnabled ? (
                        <>
                          {!rzpLinkId ? (
                            <>
                              <div className="w-28 h-28 mx-auto rounded-lg bg-white dark:bg-gray-100 border-2 border-dashed border-primary/40 flex flex-col items-center justify-center gap-1" data-testid="upi-qr-placeholder">
                                <QrCode className="h-8 w-8 text-primary/40" />
                                <p className="text-[9px] text-muted-foreground mt-0.5">QR Code</p>
                              </div>
                              <p className="text-sm font-medium">UPI Payment — {fmt(grandTotal)}</p>
                              <Button
                                size="sm"
                                className="text-xs"
                                onClick={handleInitiateRazorpay}
                                disabled={rzpInitiating}
                                data-testid="button-razorpay-initiate-upi"
                              >
                                {rzpInitiating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <QrCode className="h-3 w-3 mr-1" />}
                                {rzpInitiating ? "Generating QR…" : "Generate UPI QR"}
                              </Button>
                            </>
                          ) : (
                            <>
                              {rzpQrDataUrl ? (
                                <img src={rzpQrDataUrl} alt="UPI QR Code" className="w-36 h-36 mx-auto rounded border shadow" data-testid="razorpay-upi-qr-image" />
                              ) : (
                                <div className="w-36 h-36 mx-auto flex items-center justify-center bg-muted rounded border">
                                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                              )}
                              <p className="text-sm font-medium">UPI Payment — {fmt(grandTotal)}</p>
                              <div className="flex items-center justify-center gap-1.5">
                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                <p className="text-xs text-primary font-medium">Waiting for payment…</p>
                              </div>
                              <a href={rzpShortUrl!} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline flex items-center justify-center gap-1" data-testid="razorpay-upi-link">
                                <ExternalLink className="h-3 w-3" /> Open payment link
                              </a>
                              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => { setRzpLinkId(null); setRzpShortUrl(null); setRzpPolling(false); }}>
                                Cancel link
                              </Button>
                            </>
                          )}
                          {rzpAttempted && !rzpLinkId && (
                            <div className="pt-1 border-t">
                              <p className="text-xs text-muted-foreground mb-2">Gateway link cancelled — fallback:</p>
                              <div className="flex gap-2 justify-center">
                                <Button size="sm" variant={upiMarkedPaid ? "secondary" : "outline"} className="text-xs" onClick={() => setUpiMarkedPaid(!upiMarkedPaid)} data-testid="button-upi-mark-paid">
                                  {upiMarkedPaid ? "✓ UPI Received" : "Mark as Paid"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="w-28 h-28 mx-auto rounded-lg bg-white dark:bg-gray-100 border-2 border-dashed border-primary/40 flex flex-col items-center justify-center gap-1" data-testid="upi-qr-placeholder">
                            <div className="grid grid-cols-3 gap-0.5 opacity-30">
                              {Array.from({ length: 9 }).map((_, i) => (
                                <div key={i} className={`w-4 h-4 rounded-sm ${[0,2,6,8].includes(i) ? "bg-primary" : i === 4 ? "bg-primary/50" : "bg-gray-400"}`} />
                              ))}
                            </div>
                            <p className="text-[9px] text-muted-foreground mt-0.5">QR Code</p>
                          </div>
                          <Smartphone className="h-5 w-5 mx-auto text-primary" />
                          <p className="text-sm font-medium">UPI Payment — {fmt(grandTotal)}</p>
                          <p className="text-xs text-muted-foreground">Show the QR code above or share payment link with the customer, then confirm once received.</p>
                          <div className="flex gap-2 justify-center">
                            <Button size="sm" variant={upiMarkedPaid ? "secondary" : "default"} className="text-xs" onClick={() => setUpiMarkedPaid(true)} data-testid="button-upi-mark-paid">
                              {upiMarkedPaid ? "✓ UPI Received" : "Mark as Paid"}
                            </Button>
                            {upiMarkedPaid && (
                              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setUpiMarkedPaid(false)}>Undo</Button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {activeMethod === "LOYALTY" && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 space-y-3">
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-amber-600" />
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Customer Loyalty Lookup</p>
                      </div>
                      {lookedUpCustomer ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between bg-white dark:bg-amber-900/40 rounded p-2 border border-amber-200 dark:border-amber-700">
                            <div>
                              <p className="text-sm font-semibold">{lookedUpCustomer.name}</p>
                              <p className="text-xs text-muted-foreground">{lookedUpCustomer.loyaltyPoints} pts available · {fmt(lookedUpCustomer.loyaltyPoints * 0.01)} max redeemable</p>
                            </div>
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setLookedUpCustomer(null); setLoyaltyPointsToRedeem(0); }}>Change</Button>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium">Points to Redeem (100 pts = 1 {currency})</p>
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                min={0}
                                max={Math.min(lookedUpCustomer.loyaltyPoints, Math.floor(Math.max(0, total - tierDiscountAmount + tipAmount) * 100))}
                                step={100}
                                value={loyaltyPointsToRedeem}
                                onChange={e => setLoyaltyPointsToRedeem(Math.max(0, Math.min(parseInt(e.target.value) || 0, lookedUpCustomer.loyaltyPoints, Math.floor(Math.max(0, total - tierDiscountAmount + tipAmount) * 100))))}
                                className="h-8 text-xs flex-1"
                                data-testid="input-loyalty-points-redeem"
                              />
                              <Button size="sm" variant="outline" className="text-xs h-8 whitespace-nowrap"
                                onClick={() => setLoyaltyPointsToRedeem(Math.min(lookedUpCustomer.loyaltyPoints, Math.floor(Math.max(0, total - tierDiscountAmount + tipAmount) * 100)))}>
                                Use All
                              </Button>
                              <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => setLoyaltyPointsToRedeem(0)}>Clear</Button>
                            </div>
                            {loyaltyPointsToRedeem > 0 && (
                              <p className="text-xs text-green-700 dark:text-green-400 font-medium">
                                -{fmt(loyaltyRedemptionValue)} discount applied · New total: {fmt(grandTotal)}
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-amber-600 dark:text-amber-400">Points earned this visit: +{Math.floor((total + tipAmount) / 10)} pts (1 pt per 10 {currency} spent).</p>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <Input
                            placeholder="Customer phone number"
                            value={loyaltySearchPhone}
                            onChange={e => setLoyaltySearchPhone(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleLoyaltySearch()}
                            className="h-8 text-xs flex-1"
                            data-testid="input-loyalty-phone"
                          />
                          <Button size="sm" className="h-8 text-xs" onClick={handleLoyaltySearch} disabled={loyaltySearching} data-testid="button-loyalty-search">
                            {loyaltySearching ? "..." : "Find"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {activeMethod === "LOYALTY" && !lookedUpCustomer && (
                    <div className="flex items-center gap-1.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:text-amber-400" data-testid="loyalty-no-customer-warning">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Search and link a customer above before confirming a Loyalty payment.
                    </div>
                  )}
                  {activeMethod === "LOYALTY" && !!lookedUpCustomer && loyaltyPointsToRedeem === 0 && grandTotal > 0.01 && (
                    <div className="flex items-center gap-1.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:text-amber-400" data-testid="loyalty-points-not-set-warning">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Set the number of points to redeem above, or use Split payment for mixed methods.
                    </div>
                  )}
                  {activeMethod === "LOYALTY" && !!lookedUpCustomer && loyaltyPointsToRedeem > 0 && grandTotal > 0.01 && (
                    <div className="flex items-center gap-1.5 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 px-3 py-2 text-xs text-red-700 dark:text-red-400" data-testid="loyalty-insufficient-points-warning">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Loyalty covers {fmt(loyaltyRedemptionValue)} ({loyaltyPointsToRedeem} pts) but cannot fully cover the remaining {fmt(grandTotal)}. Use Split payment for mixed-method settlement.
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

              {isSplit && splitRows.some(r => r.method === "LOYALTY") && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 space-y-2" data-testid="split-loyalty-customer-section">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-amber-600" />
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Loyalty Customer</p>
                  </div>
                  {lookedUpCustomer ? (
                    <div className="flex items-center justify-between bg-white dark:bg-amber-900/40 rounded p-2 border border-amber-200 dark:border-amber-700">
                      <div>
                        <p className="text-sm font-semibold">{lookedUpCustomer.name}</p>
                        <p className="text-xs text-muted-foreground">{lookedUpCustomer.loyaltyPoints} pts available · {fmt(lookedUpCustomer.loyaltyPoints * 0.01)} max</p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setLookedUpCustomer(null); setLoyaltyPointsToRedeem(0); }}>Change</Button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex gap-1.5">
                        <Input
                          placeholder="Customer phone number"
                          value={loyaltySearchPhone}
                          onChange={e => setLoyaltySearchPhone(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleLoyaltySearch()}
                          className="h-8 text-xs flex-1"
                          data-testid="input-split-loyalty-phone"
                        />
                        <Button size="sm" className="h-8 text-xs" onClick={handleLoyaltySearch} disabled={loyaltySearching} data-testid="button-split-loyalty-search">
                          {loyaltySearching ? "..." : "Find"}
                        </Button>
                      </div>
                      <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="split-loyalty-no-customer-warning">
                        Link a customer to process the Loyalty payment row.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {billVoided ? (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-center text-sm text-destructive font-medium">
                  <AlertTriangle className="h-4 w-4 inline mr-1" /> Bill has been voided
                </div>
              ) : (
                <div className="space-y-2">
                  <Button className="w-full" size="lg" data-testid="button-confirm-payment"
                    disabled={
                      payBillMutation.isPending ||
                      (isSplit && splitRemaining > 0.01) ||
                      (isSplit && splitRows.some(r => r.method === "LOYALTY") && !lookedUpCustomer) ||
                      (!isSplit && activeMethod === "CASH" && cashTendered !== "" && parseFloat(cashTendered) < grandTotal) ||
                      // CARD + Razorpay enabled: must attempt gateway first; blocked while link is polling
                      (!isSplit && activeMethod === "CARD" && !!user?.tenant?.razorpayEnabled && !rzpPaid &&
                        (!rzpAttempted || (!!rzpLinkId && rzpPolling))) ||
                      // UPI + Razorpay enabled: must attempt gateway first; manual mark only available after attempt
                      (!isSplit && activeMethod === "UPI" && !!user?.tenant?.razorpayEnabled && !rzpPaid &&
                        (!rzpAttempted || (!!rzpLinkId && rzpPolling) || !upiMarkedPaid)) ||
                      // UPI + Razorpay disabled: must manually mark as paid
                      (!isSplit && activeMethod === "UPI" && !user?.tenant?.razorpayEnabled && !upiMarkedPaid) ||
                      (!isSplit && activeMethod === "LOYALTY" && !lookedUpCustomer) ||
                      (!isSplit && activeMethod === "LOYALTY" && !!lookedUpCustomer && grandTotal > 0.01)
                    }
                    onClick={() => payBillMutation.mutate()}>
                    {payBillMutation.isPending
                      ? "Processing..."
                      : rzpPolling
                      ? "Awaiting payment verification…"
                      : !isSplit && (activeMethod === "CARD" || activeMethod === "UPI") && !!user?.tenant?.razorpayEnabled && !rzpAttempted
                      ? "Initiate Gateway Payment First"
                      : `Confirm Payment · ${fmt(grandTotal)}`}
                  </Button>
                  {isManagerOrOwner && createdBill && (
                    <Button variant="outline" size="sm" className="w-full text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => setStep("void")} data-testid="button-void-bill">
                      <AlertTriangle className="h-3 w-3 mr-1" /> Void Bill
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {step === "receipt" && (
            <div className="space-y-4">
              <div className="text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <h3 className="font-bold text-lg">Payment Successful!</h3>
                <p className="text-muted-foreground text-sm">{billNumber}</p>
                {isGSTTenant && createdBill?.invoiceNumber && (
                  <p className="text-xs font-mono text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 rounded px-2 py-0.5 inline-block mt-1">
                    🧾 {createdBill.invoiceNumber}
                  </p>
                )}
                <p className="font-bold text-xl text-primary mt-1">{fmt(grandTotal)}</p>
              </div>

              {lookedUpCustomer && (
                <div className="rounded-lg border bg-green-50/40 dark:bg-green-950/20 border-green-200 dark:border-green-800 p-3 space-y-1" data-testid="crm-receipt-summary">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-green-600" />
                    <p className="text-sm font-semibold text-green-700 dark:text-green-300">{lookedUpCustomer.name}</p>
                    {lookedUpCustomer.loyaltyTier && (
                      <Badge variant="outline" className="text-[10px] capitalize ml-auto" data-testid="crm-receipt-tier">
                        <Star className="h-2.5 w-2.5 mr-0.5" />{lookedUpCustomer.loyaltyTier}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="crm-receipt-points-earned">
                    +{Math.floor(grandTotal / 10)} loyalty points earned this visit
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid="crm-receipt-visit">
                    Visit #{(lookedUpCustomer.visitCount ?? 0) + 1} · Lifetime: {fmt(parseFloat(lookedUpCustomer.totalSpent ?? "0") + grandTotal)}
                  </p>
                </div>
              )}

              {isGSTTenant && createdBill && taxAmount > 0 && (
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-950/20 p-3 text-sm space-y-1">
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide mb-2">Tax Summary</p>
                  {user?.tenant?.gstin && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Restaurant GSTIN</span><span className="font-mono">{user.tenant.gstin}</span>
                    </div>
                  )}
                  {createdBill.customerGstin && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Customer GSTIN</span><span className="font-mono">{createdBill.customerGstin}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CGST ({Number(user?.tenant?.cgstRate ?? 9)}%)</span>
                    <span>{fmt(Number(createdBill.cgstAmount ?? taxAmount / 2))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SGST ({Number(user?.tenant?.sgstRate ?? 9)}%)</span>
                    <span>{fmt(Number(createdBill.sgstAmount ?? taxAmount / 2))}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 no-print">
                <Button variant="outline" onClick={handlePrint} data-testid="button-print-receipt">
                  <Printer className="h-4 w-4 mr-2" /> Print
                </Button>
                <Button variant="outline" onClick={() => { document.title = `Receipt-${billNumber}`; handlePrint(); }} data-testid="button-download-pdf">
                  <FileDown className="h-4 w-4 mr-2" /> Download PDF
                </Button>
                <Button variant="outline" onClick={handleWhatsApp} data-testid="button-whatsapp-receipt">
                  <Share2 className="h-4 w-4 mr-2" /> WhatsApp
                </Button>
                <Button variant="outline" onClick={handleEmailReceipt} data-testid="button-email-receipt">
                  <Mail className="h-4 w-4 mr-2" /> Email
                </Button>
                {isManagerOrOwner && createdBill && (
                  <Button variant="outline" onClick={() => setStep("refund")}
                    className="text-orange-600 border-orange-300 hover:bg-orange-50 col-span-2" data-testid="button-refund">
                    <RotateCcw className="h-4 w-4 mr-2" /> Issue Refund
                  </Button>
                )}
              </div>
              {isManagerOrOwner && createdBill && (
                <Button variant="outline" size="sm" className="w-full text-xs text-destructive border-destructive/40 hover:bg-destructive/10 no-print"
                  onClick={() => setStep("void")} data-testid="button-void-paid-bill">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Void Paid Bill
                </Button>
              )}
              <Button className="w-full" size="lg" onClick={handleClose} data-testid="button-new-order">
                New Order
              </Button>
            </div>
          )}

          {step === "void" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Warning — Irreversible Action
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  This will void bill <strong>{billNumber}</strong>, reverse any stock deductions, and free the table.
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium">Reason <span className="text-destructive">*</span></p>
                <Select value={voidReason} onValueChange={setVoidReason}>
                  <SelectTrigger data-testid="select-void-reason">
                    <SelectValue placeholder="Select a reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {VOID_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium">Additional notes (optional)</p>
                <Textarea
                  placeholder="Describe what happened..."
                  value={voidNotes}
                  onChange={e => setVoidNotes(e.target.value)}
                  rows={2}
                  data-testid="input-void-notes"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(createdBill?.paymentStatus === "paid" ? "receipt" : "payment")}>
                  Cancel
                </Button>
                <Button variant="destructive" className="flex-1" disabled={!voidReason || voidBillMutation.isPending}
                  onClick={() => voidBillMutation.mutate()} data-testid="button-confirm-void">
                  {voidBillMutation.isPending ? "Voiding..." : "Confirm Void"}
                </Button>
              </div>
            </div>
          )}

          {step === "refund" && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                Refund for bill <strong>{billNumber}</strong> · Total paid: {fmt(grandTotal)}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium">Refund Amount <span className="text-destructive">*</span></p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={refundAmount}
                    onChange={e => setRefundAmount(e.target.value)}
                    min="0.01"
                    step="0.01"
                    max={grandTotal}
                    data-testid="input-refund-amount"
                    className="flex-1"
                  />
                  <Button size="sm" variant="outline" className="text-xs whitespace-nowrap"
                    onClick={() => setRefundAmount(grandTotal.toFixed(2))}>
                    Full ({fmt(grandTotal)})
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium">Reason <span className="text-destructive">*</span></p>
                <Select value={refundReason} onValueChange={setRefundReason}>
                  <SelectTrigger data-testid="select-refund-reason">
                    <SelectValue placeholder="Select a reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {REFUND_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("receipt")}>Cancel</Button>
                <Button className="flex-1 bg-orange-600 hover:bg-orange-700"
                  disabled={!refundAmount || !refundReason || refundBillMutation.isPending}
                  onClick={() => refundBillMutation.mutate()} data-testid="button-confirm-refund">
                  {refundBillMutation.isPending ? "Refunding..." : `Refund ${refundAmount ? fmt(parseFloat(refundAmount)) : ""}`}
                </Button>
              </div>
            </div>
          )}
          </div>
        </BillWrapper>
      </Dialog>
    </>
  );
}
