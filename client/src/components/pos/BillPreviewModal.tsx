import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import CourseManagementPanel from "@/components/pos/CourseManagementPanel";
import CashPaymentModal from "@/components/cash/CashPaymentModal";
import { renderBillHtml, dispatchPrint } from "@/lib/print-utils";
import i18n from "@/i18n/index";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { getJurisdictionByCurrency, applyJurisdictionRounding } from "@shared/jurisdictions";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogPageContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Receipt, CreditCard, Banknote, Smartphone, Gift, Plus, Minus, Printer,
  Share2, ArrowLeft, CheckCircle2, X, AlertTriangle, Mail, RotateCcw, FileDown,
  Loader2, ExternalLink, QrCode, User, Cake, Heart, Star, StickyNote, Package, ChevronDown, ChevronRight,
} from "lucide-react";
import { PackingBreakdownPopover, type PackingChargeResult } from "@/components/packing/PackingBreakdownPopover";
import { Numeric } from "@/components/ui/numeric";
import QRCode from "qrcode";

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  isCombo?: boolean;
  is_voided?: boolean;
  modifiers?: { name?: string; label?: string; price?: number; priceAdjust?: number }[];
  hsnCode?: string | null;
  foodModification?: import("@/components/modifications/ModificationDrawer").FoodModification;
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

const VOID_REASON_KEYS = [
  "voidReasonCustomerCancelled",
  "voidReasonIncorrectOrder",
  "voidReasonSystemError",
  "voidReasonManagerOverride",
  "voidReasonOther",
] as const;

const REFUND_REASON_KEYS = [
  "refundReasonOvercharge",
  "refundReasonWrongItem",
  "refundReasonCustomerDissatisfied",
  "refundReasonDuplicatePayment",
  "refundReasonManagerOverride",
  "refundReasonOther",
] as const;

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
  if (cents > 0) r += ` & ${cents} Fils`;
  return r;
}

export default function BillPreviewModal({
  open, onClose, cart, subtotal, discountAmount, serviceChargeAmount, taxAmount, total,
  orderType, tableId, tableNumber, orderId, posSessionId, onPaymentComplete, fullPage = false,
}: BillPreviewProps) {
  const { user, tenant } = useAuth();
  const { t: tp } = useTranslation("pos");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  // PR-001: Stable per-bill-session idempotency key — generated once, reused on retry, reset on success
  const paymentIdemKeyRef = useRef<string | null>(null);

  const currency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const currencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const currencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, currency, { position: currencyPosition, decimals: currencyDecimals });

  const { data: gatewayConfig } = useQuery({
    queryKey: ["/api/platform/gateway-config"],
    queryFn: async () => {
      const res = await fetch("/api/platform/gateway-config");
      if (!res.ok) return { activePaymentGateway: "stripe" };
      return res.json();
    },
    staleTime: 60_000,
  });

  const outletId = user?.outletId || user?.tenant?.defaultOutletId || null;

  const { data: outletJurisdiction } = useQuery<{
    jurisdiction: ReturnType<typeof getJurisdictionByCurrency>;
    savedFields: Record<string, any>;
  }>({
    queryKey: ["/api/outlets", outletId, "jurisdiction"],
    queryFn: async () => {
      if (!outletId) return null;
      const res = await fetch(`/api/outlets/${outletId}/jurisdiction`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open && !!outletId,
    staleTime: 300_000,
  });

  const jurisdiction = outletJurisdiction?.jurisdiction ?? getJurisdictionByCurrency(currency);
  const isGSTTenant = !!jurisdiction.splitTaxLabels;
  const outletTaxRegNumber = outletJurisdiction?.savedFields?.taxRegistrationNumber || user?.tenant?.gstin || null;

  const { data: tipConfig } = useQuery<{
    tipsEnabled: boolean;
    showOnPos: boolean;
    showOnReceipt: boolean;
    promptStyle: "BUTTONS" | "INPUT" | "NONE";
    suggestedPercentages: number[];
    allowCustom: boolean;
    tipBasis: "SUBTOTAL" | "TOTAL";
  } | null>({
    queryKey: ["/api/tips/config", outletId],
    queryFn: async () => {
      if (!outletId) return null;
      const res = await fetch(`/api/tips/config/${outletId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open && !!outletId,
    staleTime: 60_000,
  });
  const activeGateway: "stripe" | "razorpay" | "both" = gatewayConfig?.activePaymentGateway ?? "stripe";
  const razorpayAvailableForPOS = (activeGateway === "razorpay" || activeGateway === "both") && !!user?.tenant?.razorpayEnabled;
  const stripeAvailableForPOS = activeGateway === "stripe" || activeGateway === "both";

  const [step, setStep] = useState<PaymentStep>("preview");
  const [activeMethod, setActiveMethod] = useState<PaymentMethodType>("CASH");

  useRealtimeEvent("bill:updated", (payload: any) => {
    if (payload?.orderId === orderId) {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: tp("billUpdated"), description: tp("billUpdatedDesc") });
    }
  });
  const [showCashPaymentModal, setShowCashPaymentModal] = useState(false);
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
  const [refundedItemIds, setRefundedItemIds] = useState<string[]>([]);
  const [refundMode, setRefundMode] = useState<"items" | "manual">("items");
  const [refundStep, setRefundStep] = useState(false);
  const [upiMarkedPaid, setUpiMarkedPaid] = useState(false);
  const [gatewayDown, setGatewayDown] = useState(false); // PR-001: shown when gateway returns 503 GATEWAY_DOWN
  const [gatewayRetryCountdown, setGatewayRetryCountdown] = useState<number | null>(null); // PR-011: retry after 30s
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

  const [packingResult, setPackingResult] = useState<PackingChargeResult | null>(null);
  const [packingLoading, setPackingLoading] = useState(false);

  const [parkingCharge, setParkingCharge] = useState<{
    duration?: string;
    freeMinutes?: number;
    grossCharge?: number;
    validationDiscount?: number;
    finalCharge: number;
    tax?: number;
    total: number;
  } | null>(null);
  const [parkingChargeLoading, setParkingChargeLoading] = useState(false);
  const [parkingChargeExpanded, setParkingChargeExpanded] = useState(false);

  const { data: outletsData = [] } = useQuery<any[]>({
    queryKey: ["/api/outlets"],
    enabled: open,
    staleTime: 60000,
  });
  const packingOutletId = outletId || outletsData[0]?.id || null;
  const isTakeawayOrDelivery = orderType === "takeaway" || orderType === "delivery";

  useEffect(() => {
    if (!open || !orderId) {
      setParkingCharge(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setParkingChargeLoading(true);
      try {
        const ticketRes = await fetch(
          `/api/parking/ticket-by-order/${orderId}`,
          { credentials: "include" }
        );
        if (!cancelled && ticketRes.ok) {
          const ticket = await ticketRes.json();
          const ticketId = ticket?.id;
          const billId = ticket?.bill_id ?? ticket?.billId;
          if (billId) {
            // Try persisted bill charge first
            const chargeRes = await fetch(`/api/parking/bill-charge/${billId}`, {
              credentials: "include",
            });
            if (!cancelled && chargeRes.ok) {
              const charge = await chargeRes.json();
              if (charge) {
                setParkingCharge({
                  duration: charge.durationMinutes != null ? `${Math.floor(charge.durationMinutes / 60)}h ${charge.durationMinutes % 60}m` : undefined,
                  freeMinutes: charge.freeMinutes ?? charge.free_minutes_applied,
                  grossCharge: charge.grossCharge ?? charge.gross_charge,
                  validationDiscount: charge.validationDiscount ?? charge.validation_discount,
                  finalCharge: charge.finalCharge ?? charge.final_charge ?? charge.totalCharge ?? charge.total_charge,
                  tax: charge.taxAmount ?? charge.tax_amount,
                  total: charge.totalCharge ?? charge.total_charge ?? 0,
                });
                return;
              }
            }
          }
          // Fallback: compute a live preview from the ticket directly (pre-payment)
          if (!cancelled && ticketId) {
            const previewRes = await fetch(`/api/parking/charge-preview/${ticketId}`, {
              credentials: "include",
            });
            if (!cancelled && previewRes.ok) {
              const preview = await previewRes.json();
              if (preview && preview.totalCharge != null) {
                setParkingCharge({
                  duration: preview.durationLabel ?? (preview.durationMinutes != null
                    ? `${Math.floor(preview.durationMinutes / 60)}h ${preview.durationMinutes % 60}m`
                    : undefined),
                  freeMinutes: preview.freeMinutes,
                  grossCharge: preview.grossCharge,
                  validationDiscount: preview.validationDiscount,
                  finalCharge: preview.finalCharge,
                  tax: preview.taxAmount,
                  total: preview.totalCharge,
                });
              }
            }
          }
        }
      } catch {
      } finally {
        if (!cancelled) setParkingChargeLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, orderId]);

  useEffect(() => {
    if (!open || !isTakeawayOrDelivery || !packingOutletId || cart.length === 0) {
      setPackingResult(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPackingLoading(true);
      try {
        const res = await apiRequest("POST", "/api/packing/calculate", {
          outletId: packingOutletId,
          orderType,
          items: cart.filter(i => !i.is_voided).map(i => ({
            menuItemId: i.menuItemId,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
          })),
        });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setPackingResult(data);
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setPackingLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, packingOutletId, orderType, isTakeawayOrDelivery, cart]);

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

  const { data: orderItemsData } = useQuery<{ id: string; menuItemId: string | null; name: string | null; quantity: number | null; price: string | null }[]>({
    queryKey: ["/api/orders/items", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.items ?? [];
    },
    enabled: !!orderId && refundStep,
    staleTime: 60000,
  });

  const refundItems = orderItemsData && orderItemsData.length > 0
    ? orderItemsData.map(oi => ({
        id: oi.id,
        menuItemId: oi.menuItemId ?? oi.id,
        name: oi.name ?? "",
        quantity: oi.quantity ?? 1,
        price: Number(oi.price ?? 0),
      }))
    : cart.map(item => ({
        id: item.menuItemId,
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      }));

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
          toast({ title: tp("paymentCancelledTitle"), description: tp("paymentLinkExpired"), variant: "destructive" });
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
      // PR-001: Pass a client-generated idempotency key so duplicate taps/races are safely deduplicated
      const paymentRequestIdemKey = crypto.randomUUID();
      const res = await apiRequest("POST", `/api/restaurant-bills/${createdBill.id}/payment-request`, {
        method: activeMethod,
        tips: tipAmount || 0,
      }, { idempotencyKey: paymentRequestIdemKey });
      const data = await res.json();
      setRzpLinkId(data.paymentLinkId);
      setRzpShortUrl(data.shortUrl);
      setRzpPolling(true);
    } catch (err: any) {
      toast({ title: tp("couldNotInitiatePayment"), description: err.message, variant: "destructive" });
    } finally {
      setRzpInitiating(false);
    }
  };

  const tipBasis = tipConfig?.tipBasis === "TOTAL" ? total : subtotal;
  const tipAmount = customTip ? parseFloat(customTip) || 0 : tipBasis * (tipPct / 100);
  const loyaltyRedemptionValue = loyaltyPointsToRedeem * 0.01;
  const packingTotal = packingResult?.applicable ? (packingResult.total ?? 0) : 0;
  const parkingTotal = parkingCharge?.total ?? 0;
  const grandTotal = Math.max(0, total - tierDiscountAmount + tipAmount - loyaltyRedemptionValue + packingTotal + parkingTotal);

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
    onError: (err: Error) => toast({ title: tp("error"), description: err.message, variant: "destructive" }),
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
      // PR-001: Stable idempotency key — generate once per payment session, reuse on retry
      if (!paymentIdemKeyRef.current) {
        paymentIdemKeyRef.current = `pay-${createdBill.id}-${crypto.randomUUID()}`;
      }
      const res = await apiRequest("POST", `/api/restaurant-bills/${createdBill.id}/payments`, {
        payments,
        tips: tipAmount || undefined,
        loyaltyPointsRedeemed: loyaltyPointsToRedeem || undefined,
        loyaltyCustomerId: lookedUpCustomer?.id || undefined,
      }, { idempotencyKey: paymentIdemKeyRef.current });
      return res.json();
    },
    onSuccess: () => {
      paymentIdemKeyRef.current = null; // reset so a new bill gets a fresh key
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant-bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setStep("receipt");
    },
    onError: (err: Error) => {
      const cause = (err as { cause?: { code?: string; message?: string } }).cause;
      const isGatewayDown = cause?.code === "GATEWAY_DOWN";
      if (isGatewayDown) {
        setGatewayDown(true);
        // PR-011: Start 30-second retry countdown
        setGatewayRetryCountdown(30);
        const countdownInterval = setInterval(() => {
          setGatewayRetryCountdown(prev => {
            if (prev === null || prev <= 1) { clearInterval(countdownInterval); return null; }
            return prev - 1;
          });
        }, 1000);
        toast({
          variant: "destructive",
          title: tp("paymentGatewayUnavailable"),
          description: tp("gatewayUnreachableManual"),
        });
      } else {
        toast({ title: tp("paymentFailed"), description: err.message, variant: "destructive" });
      }
    },
  });

  const recordManualPendingMutation = useMutation({
    mutationFn: async () => {
      if (!createdBill) throw new Error("No bill created");
      const billTotal = Number(createdBill.totalAmount);
      const res = await apiRequest("POST", `/api/restaurant-bills/${createdBill.id}/payments/manual-pending`, {
        amount: billTotal,
        paymentMethod: "manual_pending",
      });
      return res.json();
    },
    onSuccess: () => {
      setGatewayDown(false);
      toast({ title: tp("manualPaymentRecorded"), description: tp("manualPaymentDesc") });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant-bills"] });
      setStep("receipt");
    },
    onError: (err: Error) => toast({ title: tp("failedToRecordManual"), description: err.message, variant: "destructive" }),
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
      toast({ title: tp("billVoided"), description: tp("billVoidedDesc") });
      handleClose();
    },
    onError: (err: Error) => toast({ title: tp("voidFailed"), description: err.message, variant: "destructive" }),
  });

  const refundBillMutation = useMutation({
    mutationFn: async () => {
      if (!createdBill) throw new Error("No bill to refund");
      if (!refundAmount || !refundReason) throw new Error("Amount and reason required");
      const res = await apiRequest("POST", `/api/restaurant-bills/${createdBill.id}/refund`, {
        amount: parseFloat(refundAmount),
        reason: refundReason,
        paymentMethod: "CASH",
        refundedItemIds: refundedItemIds.length > 0 ? refundedItemIds : undefined,
      });
      return res.json();
    },
    onSuccess: (data: { billPaymentStatus?: string; refundPaymentId?: string }) => {
      setStep("receipt");
      if (data?.billPaymentStatus && createdBill) {
        setCreatedBill(prev => prev ? { ...prev, paymentStatus: data.billPaymentStatus! } : prev);
      }
      setRefundAmount("");
      setRefundReason("");
      setRefundedItemIds([]);
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant-bills"] });
      toast({ title: tp("refundRecorded"), description: `${fmt(parseFloat(refundAmount))} ${tp("paidOut")}` });
      if (createdBill?.id) {
        fetch(`/api/print/refund-receipt/${createdBill.id}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refundPaymentId: data?.refundPaymentId }),
        }).catch(() => {});
      }
    },
    onError: (err: Error) => {
      const cause = (err as { cause?: { code?: string } }).cause;
      if (cause?.code === "GATEWAY_DOWN") {
        toast({
          variant: "destructive",
          title: tp("paymentGatewayUnavailable"),
          description: tp("gatewayUnreachableRefund"),
        });
      } else {
        toast({ title: tp("refundFailed"), description: err.message, variant: "destructive" });
      }
    },
  });

  const handleProceedToPayment = () => {
    if (!orderId) {
      toast({ title: tp("orderNotPlacedYet"), description: tp("placeOrderFirst"), variant: "destructive" });
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
      restaurantLogo: user?.tenant?.logo || null,
      digitalReceiptUrl: createdBill?.id
        ? `${window.location.origin}/receipt/${createdBill.id}`
        : null,
    };

    const html = renderBillHtml({
      restaurantName: tenantName,
      restaurantAddress: tenantAddress || undefined,
      restaurantGstin: outletTaxRegNumber || undefined,
      restaurantLogo: user?.tenant?.logo || undefined,
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
      digitalReceiptUrl: billPayload.digitalReceiptUrl,
      language: tenant?.defaultLanguage || i18n.language || "en",
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

    await dispatchPrint(html, null, {
      onNetworkSuccess: () => {
        if (jobId) apiRequest("PATCH", `/api/print-jobs/${jobId}/status`, { status: "printed" }).catch(() => {});
      },
      onPopupPrint: () => {
        if (jobId) apiRequest("PATCH", `/api/print-jobs/${jobId}/status`, { status: "printed" }).catch(() => {});
      },
      onFailure: () => {
        if (jobId) apiRequest("PATCH", `/api/print-jobs/${jobId}/status`, { status: "failed" }).catch(() => {});
      },
    });
  }, [
    billNumber, createdBill, orderId, orderType, tableNumber, cart,
    subtotal, discountAmount, tierDiscountAmount, serviceChargeAmount,
    taxAmount, taxRate, grandTotal, tipAmount, activeMethod,
    lookedUpCustomer, customerGstinInput, isGSTTenant,
    tenantName, tenantAddress, user,
  ]);

  const handleWhatsApp = () => {
    const text = `*${tenantName}*\n${tp("billNo")}: ${billNumber}\n${tp("table")}: ${tableNumber || tp("takeaway")}\n${tp("total")}: ${fmt(grandTotal)}\n${tp("thankYou")}!`;
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
    setRefundedItemIds([]);
    setRefundMode("items");
    setRefundStep(false);
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
    setParkingCharge(null);
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
        toast({ title: tp("customerNotFound"), description: tp("noCustomerWithPhone"), variant: "destructive" });
      }
    } catch {
      toast({ title: tp("lookupFailed"), description: tp("couldNotSearchCustomers"), variant: "destructive" });
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
        toast({ title: tp("customerNotFound"), description: tp("noProfileForPhone"), variant: "destructive" });
        return;
      }
      const match: CrmCustomerMatch = await res.json();
      setCustomerFromMatch(match);
      setLoyaltySearchPhone(crmPhone.trim());
      setTierDiscountAmount(0);
    } catch {
      toast({ title: tp("lookupFailed"), description: tp("couldNotSearchCustomers"), variant: "destructive" });
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
      toast({ title: tp("noteSaved"), description: tp("visitNoteAppended") });
    } catch {
      toast({ title: tp("saveFailed"), description: tp("couldNotSaveNote"), variant: "destructive" });
    } finally {
      setCrmNoteSaving(false);
    }
  }, [lookedUpCustomer, crmQuickNote, toast]);
  const handleEmailReceipt = () => {
    const subject = encodeURIComponent(`${tp("receiptFrom")} ${tenantName} — ${billNumber}`);
    const body = encodeURIComponent(
      `${tenantName}\n${tp("billNo")}: ${billNumber}\n${tp("table")}: ${tableNumber || tp("takeaway")}\n${tp("date")}: ${dateStr} ${timeStr}\n\n${tp("total")}: ${fmt(grandTotal)}\n\n${tp("thankYouForDining")}!`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString(i18n.language, { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });

  const BillWrapper = fullPage ? DialogPageContent : DialogContent;
  const billWrapperClass = fullPage
    ? "min-h-screen flex flex-col"
    : "w-full max-w-lg max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto rounded-none sm:rounded-lg";
  const stepLabel = step === "preview" ? tp("stepBillPreview") : step === "payment" ? tp("stepPayment") : step === "void" ? tp("stepVoidBill") : step === "refund" ? tp("stepIssueRefund") : tp("stepReceipt");
  const goBack = () => {
    if (step === "payment") setStep("preview");
    else if (step === "void" || step === "refund") {
      if (step === "refund") setRefundStep(false);
      setStep("receipt");
    }
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
            <div style={{ fontWeight: "bold", fontSize: 14 }}>{jurisdiction.taxInvoiceLabel}</div>
            <div style={{ fontWeight: "bold", fontSize: 13, marginTop: 2 }}>{tenantName}</div>
            {tenantAddress && <div style={{ fontSize: 10 }}>{tenantAddress}</div>}
            {jurisdiction.requireTaxRegOnInvoice && outletTaxRegNumber && (
              <div style={{ fontSize: 10 }}>{jurisdiction.taxRegLabel}: {outletTaxRegNumber}</div>
            )}
            {outletJurisdiction?.savedFields?.tradeLicenseNumber && (
              <div style={{ fontSize: 9 }}>
                {tp("tradeLic")}: {outletJurisdiction.savedFields.tradeLicenseNumber}
                {outletJurisdiction.savedFields.tradeLicenseAuthority ? ` (${outletJurisdiction.savedFields.tradeLicenseAuthority})` : ""}
              </div>
            )}
            <div style={{ fontSize: 10, marginTop: 4 }}>
              {isGSTTenant && createdBill?.invoiceNumber
                ? <>{tp("invoice")}: {createdBill.invoiceNumber} | {dateStr} {timeStr}</>
                : <>{tp("billNo")}: {billNumber || tp("preview")} | {dateStr} {timeStr}</>
              }
            </div>
            {tableNumber && <div>{tp("table")}: {tableNumber}</div>}
            <div>{tp("waiter")}: {user?.name || user?.username}</div>
            {isGSTTenant && createdBill?.customerGstin && (
              <div style={{ fontSize: 10 }}>{tp("cust")}. {jurisdiction.taxRegLabel}: {createdBill.customerGstin}</div>
            )}
          </div>
          <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>{tp("item")}</th>
                <th style={{ textAlign: "right" }}>{tp("qty")}</th>
                <th style={{ textAlign: "right" }}>{tp("rate")}</th>
                <th style={{ textAlign: "right" }}>{tp("amt")}</th>
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
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>{tp("subtotal")}</span><span>{fmt(subtotal)}</span></div>
          {discountAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>{tp("discount")}</span><span>-{fmt(discountAmount)}</span></div>}
          {serviceChargeAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>{tp("serviceCharge")}</span><span>{fmt(serviceChargeAmount)}</span></div>}
          {taxAmount > 0 && (
            jurisdiction.splitTaxLabels ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{jurisdiction.splitTaxLabels.part1} ({Number(user?.tenant?.cgstRate ?? taxRate / 2)}%)</span>
                  <span>{fmt(Number(createdBill?.cgstAmount ?? taxAmount / 2))}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{jurisdiction.splitTaxLabels.part2} ({Number(user?.tenant?.sgstRate ?? taxRate / 2)}%)</span>
                  <span>{fmt(Number(createdBill?.sgstAmount ?? taxAmount / 2))}</span>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>{jurisdiction.taxLabel} ({taxRate}%)</span><span>{fmt(taxAmount)}</span></div>
            )
          )}
          {tipAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>{tp("tips")}</span><span>{fmt(tipAmount)}</span></div>}
          <div style={{ borderTop: "1px solid #000", margin: "4px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: 13 }}>
            <span>{tp("total").toUpperCase()}</span><span>{fmt(applyJurisdictionRounding(grandTotal, jurisdiction.roundingRule))}</span>
          </div>
          <div style={{ fontSize: 9, marginTop: 4, fontStyle: "italic" }}>{numWords(applyJurisdictionRounding(grandTotal, jurisdiction.roundingRule))}</div>
          <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
          <div style={{ textAlign: "center", fontSize: 10 }}>{tp("thankYouForDining")}!</div>
          {jurisdiction.requireTaxRegOnInvoice && (
            <div style={{ textAlign: "center", fontSize: 9, marginTop: 4 }}>{tp("computerGenerated")} {jurisdiction.taxInvoiceLabel.toLowerCase()}.</div>
          )}
          {jurisdiction.ccpaApplicable && (
            <div style={{ fontSize: 8, textAlign: "center", color: "#666", marginTop: 4 }}>
              {tp("doNotSellInfo")}
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <BillWrapper className={billWrapperClass}>
          {fullPage ? (
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b px-4 py-3 flex items-center gap-2 no-print">
              {step !== "preview" && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack} aria-label="Go back">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
              <Receipt className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="font-semibold text-sm">{stepLabel}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={handleClose} data-testid="button-close-bill-page" aria-label="Close bill preview">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {step !== "preview" && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 no-print" onClick={goBack} aria-label="Go back">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
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
              {orderId && orderType === "dine_in" && (
                <CourseManagementPanel orderId={orderId} tableNumber={tableNumber ? Number(tableNumber) : undefined} items={cart} />
              )}
              <div className="bg-muted/50 rounded-lg p-4 text-center border">
                <h3 className="font-bold text-lg">{tenantName}</h3>
                {tenantAddress && <p className="text-xs text-muted-foreground">{tenantAddress}</p>}
                <p className="text-xs text-muted-foreground mt-1">{dateStr} · {timeStr}</p>
                <Badge variant="outline" className="mt-1.5 text-xs font-mono tracking-wide" data-testid="text-invoice-preview-number">
                  {billNumber || "PENDING"}
                </Badge>
                {tableNumber && <p className="text-sm mt-1">{tp("table")}: <strong>{tableNumber}</strong></p>}
                <p className="text-sm">{tp("waiter")}: <strong>{user?.name || user?.username}</strong></p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground font-medium px-1">
                  <span>{tp("item").toUpperCase()}</span>
                  <div className="flex gap-8"><span>{tp("qty").toUpperCase()}</span><span>{tp("amount").toUpperCase()}</span></div>
                </div>
                <Separator />
                {cart.map((item, i) => {
                  const fm = item.foodModification;
                  const modChips: string[] = [];
                  if (fm) {
                    if (fm.spiceLevel) modChips.push(`🌶 ${fm.spiceLevel}`);
                    if (fm.saltLevel) modChips.push(`🧂 ${fm.saltLevel} salt`);
                    fm.removedIngredients.forEach(r => modChips.push(`no ${r}`));
                    if (fm.specialInstruction?.trim()) modChips.push(`"${fm.specialInstruction.trim()}"`);
                    fm.allergies.forEach(a => modChips.push(`⚠ ${a}`));
                  }
                  const isVoided = !!item.is_voided;
                  return (
                    <div key={i} className={`flex justify-between text-sm py-0.5 ${isVoided ? "opacity-50" : ""}`} data-testid={`bill-item-${i}`}>
                      <div className="flex-1">
                        <span className={isVoided ? "line-through text-muted-foreground" : ""}>{item.name}</span>
                        {isVoided && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0 rounded text-[10px] font-bold bg-red-100 text-red-700" data-testid={`badge-voided-${i}`}>
                            VOIDED
                          </span>
                        )}
                        {!isVoided && item.modifiers && item.modifiers.length > 0 && (
                          <div className="text-xs text-muted-foreground pl-2">
                            {item.modifiers.map(m => `+ ${m.name ?? m.label ?? ""}`).join(", ")}
                          </div>
                        )}
                        {!isVoided && item.notes && <div className="text-xs text-muted-foreground italic pl-2">{item.notes}</div>}
                        {!isVoided && modChips.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5 pl-2" data-testid={`mod-summary-${i}`}>
                            {modChips.map((chip, ci) => (
                              <span
                                key={ci}
                                className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium ${chip.startsWith("⚠") ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}
                              >
                                {chip}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className={`flex gap-8 text-right ${isVoided ? "line-through text-muted-foreground" : ""}`}>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <Numeric className="w-20">{fmt(item.price * item.quantity)}</Numeric>
                      </div>
                    </div>
                  );
                })}
                <Separator />
                <div className="space-y-1 text-sm pt-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">{tp("subtotal")}</span><Numeric>{fmt(subtotal)}</Numeric></div>
                  {discountAmount > 0 && <div className="flex justify-between text-green-600"><span>{tp("discount")}</span><Numeric>−{fmt(discountAmount)}</Numeric></div>}
                  {tierDiscountAmount > 0 && <div className="flex justify-between text-green-600 text-xs" data-testid="preview-tier-discount-row"><span>{tp("loyaltyTierDiscount")}</span><Numeric>−{fmt(tierDiscountAmount)}</Numeric></div>}
                  {serviceChargeAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{tp("serviceCharge")}</span><Numeric>{fmt(serviceChargeAmount)}</Numeric></div>}
                  {taxAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{tp("tax")} (<Numeric>{taxRate}%</Numeric>)</span><Numeric>{fmt(taxAmount)}</Numeric></div>}
                  {packingLoading && isTakeawayOrDelivery && (
                    <div className="flex justify-between text-muted-foreground">
                      <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" /> {tp("packingCharge")}</span>
                      <span className="animate-pulse">—</span>
                    </div>
                  )}
                  {packingResult?.applicable && !packingLoading && (
                    <div className="flex justify-between items-center" data-testid="text-packing-charge">
                      <span className="flex items-center gap-1 text-muted-foreground" data-testid="text-packing-charge-label">
                        <Package className="h-3.5 w-3.5 text-amber-600" />
                        {packingResult.label}
                        {packingResult.breakdown.length > 0 && (
                          <PackingBreakdownPopover result={packingResult} />
                        )}
                      </span>
                      <Numeric>{fmt(packingResult.total)}</Numeric>
                    </div>
                  )}
                  {parkingChargeLoading && (
                    <div className="flex justify-between text-muted-foreground">
                      <span className="flex items-center gap-1">🅿️ {tp("parkingCharge")}</span>
                      <span className="animate-pulse">—</span>
                    </div>
                  )}
                  {parkingCharge && !parkingChargeLoading && (
                    <div className="space-y-1" data-testid="parking-charge-section">
                      <button
                        className="flex items-center justify-between w-full text-sm font-medium mt-1 hover:opacity-80 transition-opacity"
                        onClick={() => setParkingChargeExpanded(e => !e)}
                        data-testid="button-toggle-parking-breakdown"
                      >
                        <span className="flex items-center gap-1">
                          🅿️ {tp("parking")}
                          {parkingChargeExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </span>
                        <Numeric data-testid="parking-total-summary">{fmt(parkingCharge.total)}</Numeric>
                      </button>
                      {parkingChargeExpanded && (
                        <div className="space-y-0.5 pl-2 border-l-2 border-muted ml-1">
                          {parkingCharge.duration && (
                            <div className="flex justify-between text-xs text-muted-foreground" data-testid="parking-duration">
                              <span>{tp("duration")}</span><span>{parkingCharge.duration}</span>
                            </div>
                          )}
                          {parkingCharge.freeMinutes != null && parkingCharge.freeMinutes > 0 && (
                            <div className="flex justify-between text-xs text-green-600" data-testid="parking-free-period">
                              <span>{tp("freePeriod")}</span><span>−{parkingCharge.freeMinutes} min</span>
                            </div>
                          )}
                          {parkingCharge.grossCharge != null && (
                            <div className="flex justify-between text-xs text-muted-foreground" data-testid="parking-gross-charge">
                              <span>{tp("grossCharge")}</span><Numeric>{fmt(parkingCharge.grossCharge)}</Numeric>
                            </div>
                          )}
                          {parkingCharge.validationDiscount != null && parkingCharge.validationDiscount > 0 && (
                            <div className="flex justify-between text-xs text-green-600" data-testid="parking-validation-discount">
                              <span>{tp("validationDiscount")}</span><Numeric>−{fmt(parkingCharge.validationDiscount)}</Numeric>
                            </div>
                          )}
                          {parkingCharge.tax != null && parkingCharge.tax > 0 && (
                            <div className="flex justify-between text-xs text-muted-foreground" data-testid="parking-tax">
                              <span>{tp("tax")}</span><Numeric>{fmt(parkingCharge.tax)}</Numeric>
                            </div>
                          )}
                          <div className="flex justify-between text-xs font-medium" data-testid="parking-final-charge">
                            <span>{tp("parkingTotal")}</span><Numeric>{fmt(parkingCharge.total)}</Numeric>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-base" data-testid="text-grand-total-with-packing">
                    <span>{tp("grandTotal").toUpperCase()}</span>
                    <Numeric>{fmt(grandTotal)}</Numeric>
                  </div>
                  <p className="text-xs text-muted-foreground italic">{numWords(grandTotal)}</p>
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
                  <p className="font-medium text-foreground">{tp("quickPayViaUpi")}</p>
                  <p>{tp("customerScanQr")}</p>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-3 space-y-2 no-print" data-testid="crm-customer-section">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <User className="h-3.5 w-3.5" />
                  {tp("customerProfile")}
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
                        ? bdDays === 0 ? tp("todayBirthday") : tp("birthdayInDays", { count: bdDays })
                        : annDays === 0 ? tp("todayAnniversary") : tp("anniversaryInDays", { count: annDays });
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
                                {tp("offer")}: {applicableOffer.name} ({applicableOffer.type === "percentage" ? `${applicableOffer.value}% ${tp("off")}` : fmt(Number(applicableOffer.value))} {tp("off")})
                              </span>
                              <Button
                                size="sm"
                                variant={occasionOfferApplied ? "secondary" : "default"}
                                className="h-5 text-[10px] px-2 shrink-0 bg-amber-500 hover:bg-amber-600 text-white border-0"
                                onClick={() => {
                                  setTierDiscountAmount(occasionOfferApplied ? 0 : offerDiscount);
                                  toast({ title: occasionOfferApplied ? tp("offerRemoved") : isBirthday ? tp("birthdayOfferApplied") : tp("anniversaryOfferApplied"), description: occasionOfferApplied ? tp("discountRemoved") : `"${applicableOffer.name}" ${tp("appliedToThisBill")}` });
                                }}
                                data-testid="button-crm-apply-occasion-offer"
                              >
                                {occasionOfferApplied ? tp("remove") : tp("applyOffer")}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-amber-600 dark:text-amber-500">{tp("noOccasionOffer")}</span>
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
                            {tp("visitNumber", { n: (lookedUpCustomer.visitCount ?? 0) + 1 })}
                          </span>
                          <span className="text-[10px] text-muted-foreground" data-testid="crm-total-spent">
                            {fmt(parseFloat(lookedUpCustomer.totalSpent ?? "0"))} {tp("lifetime").toLowerCase()}
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
                                {tierLabel} — {pct}% {tp("loyaltyDiscountApplicable")} ({fmt(discountValue)} {tp("off")})
                              </p>
                              <Button
                                size="sm"
                                variant={alreadyApplied ? "secondary" : "outline"}
                                className="h-5 text-[10px] px-2 shrink-0"
                                onClick={() => {
                                  setTierDiscountAmount(alreadyApplied ? 0 : discountValue);
                                  toast({ title: alreadyApplied ? tp("tierDiscountRemoved") : tp("tierDiscountApplied"), description: alreadyApplied ? tp("discountRemoved") : `${pct}% ${tierLabel} ${tp("discountApplied").toLowerCase()}` });
                                }}
                                data-testid="button-crm-apply-tier-offer"
                              >
                                {alreadyApplied ? tp("remove") : tp("applyOffer")}
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
                        {tp("change")}
                      </Button>
                    </div>
                    {lookedUpCustomer.notes && (
                      <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5 border font-mono whitespace-pre-wrap" data-testid="crm-existing-notes">
                        {lookedUpCustomer.notes}
                      </div>
                    )}
                    <div className="space-y-1" data-testid="crm-quick-note-section">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <StickyNote className="h-3 w-3" /> {tp("addVisitNote")}
                      </p>
                      <div className="flex gap-1.5">
                        <Textarea
                          placeholder={tp("visitNotePlaceholder")}
                          value={crmQuickNote}
                          onChange={e => setCrmQuickNote(e.target.value)}
                          rows={2}
                          className="text-xs flex-1 min-h-0 resize-none"
                          data-testid="input-crm-quick-note"
                        />
                        <Button size="sm" variant="outline" className="text-xs h-auto self-stretch px-2" onClick={handleCrmSaveNote} disabled={crmNoteSaving || !crmQuickNote.trim()} data-testid="button-crm-save-note">
                          {crmNoteSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : tp("save")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1.5" data-testid="crm-search-area">
                    <Input
                      placeholder={tp("phoneNumberToLink")}
                      value={crmPhone}
                      onChange={e => setCrmPhone(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleCrmSearch()}
                      className="h-8 text-xs flex-1"
                      data-testid="input-crm-phone"
                    />
                    <Button size="sm" className="h-8 text-xs" onClick={handleCrmSearch} disabled={crmSearching} data-testid="button-crm-search">
                      {crmSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : tp("find")}
                    </Button>
                  </div>
                )}
              </div>

              {isGSTTenant && (
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-950/20 p-3 no-print">
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-2">{tp("customerGstinB2b")}</p>
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
                  <Printer className="h-4 w-4 mr-1" /> {tp("printPreview")}
                </Button>
                <Button onClick={handleProceedToPayment} disabled={createBillMutation.isPending} className="flex-1" data-testid="button-proceed-payment">
                  {createBillMutation.isPending ? tp("creatingBill") : tp("proceedToPayment")}
                </Button>
              </div>
              {isManagerOrOwner && createdBill && (
                <Button variant="outline" size="sm" className="w-full text-xs text-destructive border-destructive/40 hover:bg-destructive/10 no-print"
                  onClick={() => setStep("void")} data-testid="button-void-bill-preview">
                  <AlertTriangle className="h-3 w-3 mr-1" /> {tp("voidBill")}
                </Button>
              )}
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-4">
              <div className="text-center bg-primary/5 rounded-lg p-3 border border-primary/20">
                <p className="text-sm text-muted-foreground">{tp("amountDue")}</p>
                <Numeric className="block text-3xl font-bold text-primary" data-testid="text-amount-due">{fmt(grandTotal)}</Numeric>
                {billNumber && <Badge variant="outline" className="mt-1 text-xs">{billNumber}</Badge>}
              </div>

              {tipConfig && tipConfig.tipsEnabled && tipConfig.showOnPos && tipConfig.promptStyle !== "NONE" && (
                <div className="space-y-2" data-testid="section-tip">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{tp("addTipOptional")}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {tipConfig.promptStyle === "BUTTONS" && (
                      <>
                        <Button
                          key="no-tip"
                          size="sm"
                          variant={tipPct === 0 && !customTip ? "default" : "outline"}
                          className="flex-1 text-xs"
                          onClick={() => { setTipPct(0); setCustomTip(""); }}
                          data-testid="button-no-tip"
                        >
                          {tp("noTip")}
                        </Button>
                        {(tipConfig.suggestedPercentages || [5, 10, 15]).map(pct => (
                          <Button
                            key={pct}
                            size="sm"
                            variant={tipPct === pct && !customTip ? "default" : "outline"}
                            className="flex-1 text-xs"
                            onClick={() => { setTipPct(pct); setCustomTip(""); }}
                            data-testid={`button-tip-pct-${pct}`}
                          >
                            <Numeric>{pct}% +{fmt(tipBasis * pct / 100)}</Numeric>
                          </Button>
                        ))}
                        {tipConfig.allowCustom && (
                          <Button
                            size="sm"
                            variant={customTip ? "default" : "outline"}
                            className="flex-1 text-xs"
                            onClick={() => { setTipPct(0); }}
                            data-testid="button-tip-custom"
                          >
                            {tp("tipCustom")}
                          </Button>
                        )}
                      </>
                    )}
                    {tipConfig.promptStyle === "INPUT" && (
                      <Button
                        key="no-tip-input"
                        size="sm"
                        variant={tipPct === 0 && !customTip ? "default" : "outline"}
                        className="text-xs"
                        onClick={() => { setTipPct(0); setCustomTip(""); }}
                        data-testid="button-no-tip"
                      >
                        {tp("noTip")}
                      </Button>
                    )}
                  </div>
                  {(tipConfig.allowCustom || tipConfig.promptStyle === "INPUT") && (
                    <Input
                      placeholder={tp("tipCustom")}
                      type="number"
                      value={customTip}
                      onChange={e => { setCustomTip(e.target.value); setTipPct(0); }}
                      className="text-xs h-8"
                      min="0"
                      step="0.01"
                      data-testid="input-custom-tip"
                    />
                  )}
                  {tipAmount > 0 && (
                    <p className="text-xs text-muted-foreground" data-testid="text-tip-amount">
                      {tp("tipAmount")} ({tipPct ? `${tipPct}%` : tp("tipCustom").toLowerCase()}): {fmt(tipAmount)} · <span data-testid="text-grand-total-with-tip">{tp("grandTotal")}: {fmt(grandTotal)}</span>
                    </p>
                  )}
                </div>
              )}
              {(!tipConfig || !tipConfig.tipsEnabled || !tipConfig.showOnPos) && false && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tips</p>
                  <div className="flex gap-1.5">
                    {[0, 5, 10, 15].map(pct => (
                      <Button key={pct} size="sm" variant={tipPct === pct && !customTip ? "default" : "outline"}
                        className="flex-1 text-xs" onClick={() => { setTipPct(pct); setCustomTip(""); }}>
                        {pct === 0 ? tp("none") : `${pct}%`}
                      </Button>
                    ))}
                    <Input placeholder={tp("custom")} type="number" value={customTip} onChange={e => { setCustomTip(e.target.value); setTipPct(0); }}
                      className="w-24 text-xs h-8" min="0" step="0.01" />
                  </div>
                  {tipAmount > 0 && <p className="text-xs text-muted-foreground">{tp("tips")}: {fmt(tipAmount)} · {tp("grandTotal")}: {fmt(grandTotal)}</p>}
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{tp("paymentMethod")}</p>
                <Button variant={isSplit ? "default" : "outline"} size="sm" className="text-xs" onClick={() => { setIsSplit(!isSplit); if (!isSplit && splitRows.length === 0) { setSplitRows([{ id: "1", method: "CASH", amount: "", referenceNo: "" }, { id: "2", method: "CARD", amount: "", referenceNo: "" }]); } }}>
                  <Plus className="h-3 w-3 mr-1" /> {tp("splitPayment")}
                </Button>
              </div>

              {!isSplit ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(["CASH", "CARD", "UPI", "LOYALTY"] as PaymentMethodType[]).map(method => {
                      const Icon = method === "CASH" ? Banknote : method === "CARD" ? CreditCard : method === "UPI" ? Smartphone : Gift;
                      return (
                        <Button key={method} variant={activeMethod === method ? "default" : "outline"}
                          className="flex-col h-14 gap-0.5 text-xs" onClick={() => setActiveMethod(method)}
                          data-testid={`button-payment-method-${method.toLowerCase()}`}>
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
                          <span className="text-green-700 dark:text-green-300 font-medium">{tp("changeDue")}</span>
                          <span className="text-green-700 dark:text-green-300 font-bold" data-testid="text-change-due">
                            {fmt(parseFloat(cashTendered) - grandTotal)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {activeMethod === "CARD" && (
                    <div className="space-y-2">
                      {razorpayAvailableForPOS && (
                        <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 p-3 space-y-3" data-testid="razorpay-card-section">
                          {!rzpLinkId ? (
                            <div className="text-center space-y-2">
                              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">{tp("gatewayPayment")} — {fmt(grandTotal)}</p>
                              <p className="text-xs text-muted-foreground">{tp("createGatewayLink")}</p>
                              <Button
                                size="sm"
                                className="text-xs"
                                onClick={handleInitiateRazorpay}
                                disabled={rzpInitiating}
                                data-testid="button-razorpay-initiate-card"
                              >
                                {rzpInitiating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <QrCode className="h-3 w-3 mr-1" />}
                                {rzpInitiating ? tp("generating") : tp("generatePaymentLink")}
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
                                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">{tp("waitingForPayment")}</p>
                              </div>
                              <a href={rzpShortUrl!} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline flex items-center justify-center gap-1" data-testid="razorpay-payment-link">
                                <ExternalLink className="h-3 w-3" /> {tp("openPaymentLink")}
                              </a>
                              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => { setRzpLinkId(null); setRzpShortUrl(null); setRzpPolling(false); }}>
                                {tp("cancelLink")}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      {(!razorpayAvailableForPOS || (rzpAttempted && !rzpLinkId)) && (
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder={tp("last4Digits")} maxLength={4} value={cardLast4} onChange={e => setCardLast4(e.target.value)} data-testid="input-card-last4" />
                          <Input placeholder={tp("referenceApprovalCode")} value={cardRef} onChange={e => setCardRef(e.target.value)} data-testid="input-card-ref" />
                        </div>
                      )}
                    </div>
                  )}
                  {activeMethod === "UPI" && (
                    <div className="text-center p-4 bg-muted/50 rounded-lg border space-y-3">
                      {razorpayAvailableForPOS ? (
                        <>
                          {!rzpLinkId ? (
                            <>
                              <div className="w-28 h-28 mx-auto rounded-lg bg-white dark:bg-gray-100 border-2 border-dashed border-primary/40 flex flex-col items-center justify-center gap-1" data-testid="upi-qr-placeholder">
                                <QrCode className="h-8 w-8 text-primary/40" />
                                <p className="text-[9px] text-muted-foreground mt-0.5">QR Code</p>
                              </div>
                              <p className="text-sm font-medium">{tp("upiPayment")} — {fmt(grandTotal)}</p>
                              <Button
                                size="sm"
                                className="text-xs"
                                onClick={handleInitiateRazorpay}
                                disabled={rzpInitiating}
                                data-testid="button-razorpay-initiate-upi"
                              >
                                {rzpInitiating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <QrCode className="h-3 w-3 mr-1" />}
                                {rzpInitiating ? tp("generatingQr") : tp("generateUpiQr")}
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
                              <p className="text-sm font-medium">{tp("upiPayment")} — {fmt(grandTotal)}</p>
                              <div className="flex items-center justify-center gap-1.5">
                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                <p className="text-xs text-primary font-medium">{tp("waitingForPayment")}</p>
                              </div>
                              <a href={rzpShortUrl!} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline flex items-center justify-center gap-1" data-testid="razorpay-upi-link">
                                <ExternalLink className="h-3 w-3" /> {tp("openPaymentLink")}
                              </a>
                              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => { setRzpLinkId(null); setRzpShortUrl(null); setRzpPolling(false); }}>
                                {tp("cancelLink")}
                              </Button>
                            </>
                          )}
                          {rzpAttempted && !rzpLinkId && (
                            <div className="pt-1 border-t">
                              <p className="text-xs text-muted-foreground mb-2">{tp("gatewayLinkCancelled")}</p>
                              <div className="flex gap-2 justify-center">
                                <Button size="sm" variant={upiMarkedPaid ? "secondary" : "outline"} className="text-xs" onClick={() => setUpiMarkedPaid(!upiMarkedPaid)} data-testid="button-upi-mark-paid">
                                  {upiMarkedPaid ? tp("upiReceived") : tp("markAsPaid")}
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
                          <p className="text-sm font-medium">{tp("upiPayment")} — {fmt(grandTotal)}</p>
                          <p className="text-xs text-muted-foreground">{tp("upiShowQr")}</p>
                          <div className="flex gap-2 justify-center">
                            <Button size="sm" variant={upiMarkedPaid ? "secondary" : "default"} className="text-xs" onClick={() => setUpiMarkedPaid(true)} data-testid="button-upi-mark-paid">
                              {upiMarkedPaid ? tp("upiReceived") : tp("markAsPaid")}
                            </Button>
                            {upiMarkedPaid && (
                              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setUpiMarkedPaid(false)}>{tp("undo")}</Button>
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
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{tp("customerLoyaltyLookup")}</p>
                      </div>
                      {lookedUpCustomer ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between bg-white dark:bg-amber-900/40 rounded p-2 border border-amber-200 dark:border-amber-700">
                            <div>
                              <p className="text-sm font-semibold">{lookedUpCustomer.name}</p>
                              <p className="text-xs text-muted-foreground">{lookedUpCustomer.loyaltyPoints} pts {tp("available")} · {fmt(lookedUpCustomer.loyaltyPoints * 0.01)} max</p>
                            </div>
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setLookedUpCustomer(null); setLoyaltyPointsToRedeem(0); }}>{tp("change")}</Button>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium">{tp("pointsToRedeem", { currency })}</p>
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
                                {tp("useAll")}
                              </Button>
                              <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => setLoyaltyPointsToRedeem(0)}>{tp("clear")}</Button>
                            </div>
                            {loyaltyPointsToRedeem > 0 && (
                              <p className="text-xs text-green-700 dark:text-green-400 font-medium">
                                -{fmt(loyaltyRedemptionValue)} {tp("discountRemoved").toLowerCase()} · {tp("grandTotal")}: {fmt(grandTotal)}
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-amber-600 dark:text-amber-400">{tp("pointsEarned", { pts: Math.floor((total + tipAmount) / 10), currency })}</p>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <Input
                            placeholder={tp("customerPhoneNumber")}
                            value={loyaltySearchPhone}
                            onChange={e => setLoyaltySearchPhone(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleLoyaltySearch()}
                            className="h-8 text-xs flex-1"
                            data-testid="input-loyalty-phone"
                          />
                          <Button size="sm" className="h-8 text-xs" onClick={handleLoyaltySearch} disabled={loyaltySearching} data-testid="button-loyalty-search">
                            {loyaltySearching ? "..." : tp("find")}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {activeMethod === "LOYALTY" && !lookedUpCustomer && (
                    <div className="flex items-center gap-1.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:text-amber-400" data-testid="loyalty-no-customer-warning">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {tp("linkCustomerForLoyalty")}
                    </div>
                  )}
                  {activeMethod === "LOYALTY" && !!lookedUpCustomer && loyaltyPointsToRedeem === 0 && grandTotal > 0.01 && (
                    <div className="flex items-center gap-1.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:text-amber-400" data-testid="loyalty-points-not-set-warning">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {tp("setPointsToRedeem")}
                    </div>
                  )}
                  {activeMethod === "LOYALTY" && !!lookedUpCustomer && loyaltyPointsToRedeem > 0 && grandTotal > 0.01 && (
                    <div className="flex items-center gap-1.5 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 px-3 py-2 text-xs text-red-700 dark:text-red-400" data-testid="loyalty-insufficient-points-warning">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {tp("loyaltyInsufficientCoverage", { value: fmt(loyaltyRedemptionValue), pts: loyaltyPointsToRedeem, remaining: fmt(grandTotal) })}
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
                      <Input placeholder={tp("amount")} type="number" value={row.amount}
                        onChange={e => updateSplitRow(row.id, "amount", e.target.value)} className="h-8 text-xs" min="0" step="0.01" />
                      {row.method === "CARD" && (
                        <Input placeholder={tp("ref")} value={row.referenceNo}
                          onChange={e => updateSplitRow(row.id, "referenceNo", e.target.value)} className="h-8 text-xs w-20" />
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeSplitRow(row.id)} aria-label="Remove payment row">
                        <X className="h-3 w-3" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full text-xs" onClick={addSplitRow}>
                    <Plus className="h-3 w-3 mr-1" /> {tp("addPaymentMethod")}
                  </Button>
                  <div className={`flex justify-between text-sm font-medium ${splitRemaining > 0.01 ? "text-amber-600" : "text-green-600"}`}>
                    <span>{splitRemaining > 0.01 ? tp("remaining") : tp("balance")}:</span>
                    <span>{fmt(Math.abs(splitRemaining))}{splitRemaining > 0.01 ? "" : " ✓"}</span>
                  </div>
                </div>
              )}

              {isSplit && splitRows.some(r => r.method === "LOYALTY") && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 space-y-2" data-testid="split-loyalty-customer-section">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-amber-600" />
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{tp("loyaltyCustomer")}</p>
                  </div>
                  {lookedUpCustomer ? (
                    <div className="flex items-center justify-between bg-white dark:bg-amber-900/40 rounded p-2 border border-amber-200 dark:border-amber-700">
                      <div>
                        <p className="text-sm font-semibold">{lookedUpCustomer.name}</p>
                        <p className="text-xs text-muted-foreground">{lookedUpCustomer.loyaltyPoints} pts {tp("available")} · {fmt(lookedUpCustomer.loyaltyPoints * 0.01)} max</p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setLookedUpCustomer(null); setLoyaltyPointsToRedeem(0); }}>{tp("change")}</Button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex gap-1.5">
                        <Input
                          placeholder={tp("customerPhoneNumber")}
                          value={loyaltySearchPhone}
                          onChange={e => setLoyaltySearchPhone(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleLoyaltySearch()}
                          className="h-8 text-xs flex-1"
                          data-testid="input-split-loyalty-phone"
                        />
                        <Button size="sm" className="h-8 text-xs" onClick={handleLoyaltySearch} disabled={loyaltySearching} data-testid="button-split-loyalty-search">
                          {loyaltySearching ? "..." : tp("find")}
                        </Button>
                      </div>
                      <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="split-loyalty-no-customer-warning">
                        {tp("linkCustomerForLoyalty")}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {billVoided ? (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-center text-sm text-destructive font-medium">
                  <AlertTriangle className="h-4 w-4 inline mr-1" /> {tp("billHasBeenVoided")}
                </div>
              ) : (
                <div className="space-y-2">
                  {/* PR-001/PR-011: Gateway-down fallback — offer manual pending record when payment gateway is unreachable */}
                  {gatewayDown && createdBill && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-2">
                      <p className="font-medium text-amber-800">{tp("paymentSystemUnavailable")}</p>
                      <p className="text-amber-700 text-xs">{tp("recordManualPaymentHint")}</p>
                      <Button size="sm" variant="outline" className="w-full border-amber-400 text-amber-800 hover:bg-amber-100" data-testid="button-record-manual-payment"
                        disabled={recordManualPendingMutation.isPending}
                        onClick={() => recordManualPendingMutation.mutate()}>
                        {recordManualPendingMutation.isPending ? tp("recording") : tp("recordAsManualPayment")}
                      </Button>
                      {gatewayRetryCountdown !== null ? (
                        <Button size="sm" variant="ghost" className="w-full text-xs text-amber-700" disabled data-testid="button-retry-payment-countdown">
                          {tp("retryAvailableIn", { seconds: gatewayRetryCountdown })}
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="w-full text-xs text-amber-700 hover:text-amber-900" data-testid="button-retry-payment"
                          onClick={() => { setGatewayDown(false); payBillMutation.mutate(); }}>
                          {tp("retryPayment")}
                        </Button>
                      )}
                    </div>
                  )}
                  <Button className="w-full" size="lg" data-testid="button-confirm-payment"
                    disabled={
                      payBillMutation.isPending ||
                      (isSplit && splitRemaining > 0.01) ||
                      (isSplit && splitRows.some(r => r.method === "LOYALTY") && !lookedUpCustomer) ||
                      (!isSplit && activeMethod === "CASH" && cashTendered !== "" && parseFloat(cashTendered) < grandTotal) ||
                      // CARD + Razorpay enabled: must attempt gateway first; blocked while link is polling
                      (!isSplit && activeMethod === "CARD" && !!razorpayAvailableForPOS && !rzpPaid &&
                        (!rzpAttempted || (!!rzpLinkId && rzpPolling))) ||
                      // UPI + Razorpay enabled: must attempt gateway first; manual mark only available after attempt
                      (!isSplit && activeMethod === "UPI" && !!razorpayAvailableForPOS && !rzpPaid &&
                        (!rzpAttempted || (!!rzpLinkId && rzpPolling) || !upiMarkedPaid)) ||
                      // UPI + Razorpay disabled: must manually mark as paid
                      (!isSplit && activeMethod === "UPI" && !razorpayAvailableForPOS && !upiMarkedPaid) ||
                      (!isSplit && activeMethod === "LOYALTY" && !lookedUpCustomer) ||
                      (!isSplit && activeMethod === "LOYALTY" && !!lookedUpCustomer && grandTotal > 0.01)
                    }
                    onClick={() => payBillMutation.mutate()}>
                    {payBillMutation.isPending
                      ? tp("processing")
                      : rzpPolling
                      ? tp("awaitingPaymentVerification")
                      : !isSplit && (activeMethod === "CARD" || activeMethod === "UPI") && !!razorpayAvailableForPOS && !rzpAttempted
                      ? tp("initiateGatewayFirst")
                      : `${tp("confirmPayment")} · ${fmt(grandTotal)}`}
                  </Button>
                  {isManagerOrOwner && createdBill && (
                    <Button variant="outline" size="sm" className="w-full text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => setStep("void")} data-testid="button-void-bill">
                      <AlertTriangle className="h-3 w-3 mr-1" /> {tp("voidBill")}
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
                <h3 className="font-bold text-lg">{tp("paymentSuccessful")}</h3>
                <p className="text-muted-foreground text-sm">{billNumber}</p>
                {isGSTTenant && createdBill?.invoiceNumber && (
                  <p className="text-xs font-mono text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 rounded px-2 py-0.5 inline-block mt-1">
                    🧾 {createdBill.invoiceNumber}
                  </p>
                )}
                <p className="font-bold text-xl text-primary mt-1">{fmt(grandTotal)}</p>
                {createdBill?.paymentStatus === "partially_refunded" && (
                  <Badge variant="outline" className="mt-1 text-orange-600 border-orange-400 bg-orange-50 dark:bg-orange-950/30" data-testid="badge-partially-refunded">
                    {tp("partiallyRefunded")}
                  </Badge>
                )}
                {createdBill?.paymentStatus === "refunded" && (
                  <Badge variant="outline" className="mt-1 text-red-600 border-red-400 bg-red-50 dark:bg-red-950/30" data-testid="badge-refunded">
                    {tp("fullyRefunded")}
                  </Badge>
                )}
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
                    +{Math.floor(grandTotal / 10)} {tp("loyaltyPointsEarned")}
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid="crm-receipt-visit">
                    {tp("visitNumber", { n: (lookedUpCustomer.visitCount ?? 0) + 1 })} · {tp("lifetime")}: {fmt(parseFloat(lookedUpCustomer.totalSpent ?? "0") + grandTotal)}
                  </p>
                </div>
              )}

              {isGSTTenant && createdBill && taxAmount > 0 && (
                <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-950/20 p-3 text-sm space-y-1">
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide mb-2">{tp("taxSummary")}</p>
                  {outletTaxRegNumber && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{tp("restaurant")} {jurisdiction.taxRegLabel}</span><span className="font-mono">{outletTaxRegNumber}</span>
                    </div>
                  )}
                  {createdBill.customerGstin && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{tp("customerGstin")}</span><span className="font-mono">{createdBill.customerGstin}</span>
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
                <Button variant="outline" onClick={async () => {
                  if (createdBill?.id) {
                    try {
                      const res = await fetch(`/api/print/receipt/${createdBill.id}`, { method: "POST", credentials: "include" });
                      const data = await res.json();
                      if (data.fallback && data.html) {
                        const w = window.open("", "_blank");
                        if (w) { w.document.write(data.html); w.document.close(); }
                        return;
                      }
                      if (data.success) return;
                    } catch (_) {}
                  }
                  handlePrint();
                }} data-testid="button-print-receipt">
                  <Printer className="h-4 w-4 mr-2" /> {tp("print")}
                </Button>
                <Button variant="outline" onClick={async () => {
                  if (createdBill?.id) {
                    try {
                      const res = await fetch(`/api/print/bill/${createdBill.id}`, { method: "POST", credentials: "include" });
                      const data = await res.json();
                      if (data.fallback && data.html) {
                        const w = window.open("", "_blank");
                        if (w) { w.document.write(data.html); w.document.close(); }
                        return;
                      }
                      if (data.success) return;
                    } catch (_) {}
                  }
                  document.title = `Receipt-${billNumber}`; handlePrint();
                }} data-testid="button-download-pdf">
                  <FileDown className="h-4 w-4 mr-2" /> {tp("downloadPdf")}
                </Button>
                <Button variant="outline" onClick={handleWhatsApp} data-testid="button-whatsapp-receipt">
                  <Share2 className="h-4 w-4 mr-2" /> WhatsApp
                </Button>
                <Button variant="outline" onClick={handleEmailReceipt} data-testid="button-email-receipt">
                  <Mail className="h-4 w-4 mr-2" /> {tp("email")}
                </Button>
                {isManagerOrOwner && createdBill && (
                  <Button variant="outline" onClick={() => { setStep("refund"); setRefundStep(true); }}
                    className="text-orange-600 border-orange-300 hover:bg-orange-50 col-span-2" data-testid="button-refund">
                    <RotateCcw className="h-4 w-4 mr-2" /> {tp("issueRefund")}
                  </Button>
                )}
              </div>
              {isManagerOrOwner && createdBill && (
                <Button variant="outline" size="sm" className="w-full text-xs text-destructive border-destructive/40 hover:bg-destructive/10 no-print"
                  onClick={() => setStep("void")} data-testid="button-void-paid-bill">
                  <AlertTriangle className="h-3 w-3 mr-1" /> {tp("voidPaidBill")}
                </Button>
              )}
              <Button className="w-full" size="lg" onClick={handleClose} data-testid="button-new-order">
                {tp("newOrder")}
              </Button>
            </div>
          )}

          {step === "void" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> {tp("warningIrreversible")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {tp("voidBillWarning", { billNumber })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium">{tp("reason")} <span className="text-destructive">*</span></p>
                <Select value={voidReason} onValueChange={setVoidReason}>
                  <SelectTrigger data-testid="select-void-reason">
                    <SelectValue placeholder={tp("selectReason")} />
                  </SelectTrigger>
                  <SelectContent>
                    {VOID_REASON_KEYS.map(r => <SelectItem key={r} value={r}>{tp(r)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium">{tp("additionalNotes")}</p>
                <Textarea
                  placeholder={tp("describeWhatHappened")}
                  value={voidNotes}
                  onChange={e => setVoidNotes(e.target.value)}
                  rows={2}
                  data-testid="input-void-notes"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(createdBill?.paymentStatus === "paid" ? "receipt" : "payment")}>
                  {tp("cancel")}
                </Button>
                <Button variant="destructive" className="flex-1" disabled={!voidReason || voidBillMutation.isPending}
                  onClick={() => voidBillMutation.mutate()} data-testid="button-confirm-void">
                  {voidBillMutation.isPending ? tp("voiding") : tp("confirmVoid")}
                </Button>
              </div>
            </div>
          )}

          {step === "refund" && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                {tp("refundForBill", { billNumber })} · {tp("totalPaid")}: {fmt(grandTotal)}
              </div>

              {/* Mode toggle */}
              <div className="flex gap-2">
                <Button size="sm" variant={refundMode === "items" ? "default" : "outline"}
                  className="flex-1 text-xs" onClick={() => setRefundMode("items")}
                  data-testid="button-refund-mode-items">
                  {tp("selectItems")}
                </Button>
                <Button size="sm" variant={refundMode === "manual" ? "default" : "outline"}
                  className="flex-1 text-xs" onClick={() => {
                    setRefundMode("manual");
                    setRefundedItemIds([]);
                  }} data-testid="button-refund-mode-manual">
                  {tp("manualAmount")}
                </Button>
              </div>

              {refundMode === "items" && refundItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">{tp("selectItemsToRefund")}</p>
                    <Button size="sm" variant="ghost" className="text-xs h-6 px-2"
                      data-testid="button-refund-select-all"
                      onClick={() => {
                        const allIds = refundItems.map(item => item.id);
                        if (refundedItemIds.length === allIds.length) {
                          setRefundedItemIds([]);
                          setRefundAmount("");
                        } else {
                          setRefundedItemIds(allIds);
                          const total = refundItems.reduce((s, item) => s + (item.price * item.quantity), 0);
                          setRefundAmount(total.toFixed(2));
                        }
                      }}>
                      {refundedItemIds.length === refundItems.length ? tp("deselectAll") : tp("selectAll")}
                    </Button>
                  </div>
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                    {refundItems.map((item, idx) => {
                      const itemId = item.id;
                      const checked = refundedItemIds.includes(itemId);
                      const lineTotal = item.price * item.quantity;
                      return (
                        <div key={itemId} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 cursor-pointer"
                          data-testid={`refund-item-row-${idx}`}
                          onClick={() => {
                            let newIds: string[];
                            if (checked) {
                              newIds = refundedItemIds.filter(id => id !== itemId);
                            } else {
                              newIds = [...refundedItemIds, itemId];
                            }
                            setRefundedItemIds(newIds);
                            const newTotal = refundItems.reduce((s, it) => {
                              return newIds.includes(it.id) ? s + (it.price * it.quantity) : s;
                            }, 0);
                            setRefundAmount(newTotal > 0 ? newTotal.toFixed(2) : "");
                          }}>
                          <Checkbox checked={checked} data-testid={`checkbox-refund-item-${idx}`}
                            onCheckedChange={() => {}} />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm truncate">{item.quantity}× {item.name}</span>
                          </div>
                          <span className="text-sm font-medium shrink-0">{fmt(lineTotal)}</span>
                        </div>
                      );
                    })}
                  </div>
                  {refundedItemIds.length > 0 && (
                    <div className="text-xs text-muted-foreground space-y-0.5" data-testid="text-refund-items-subtotal">
                      <p>
                        {tp("itemsSelected", { count: refundedItemIds.length })} · {tp("subtotal")}: {fmt(parseFloat(refundAmount || "0"))}
                      </p>
                      <p className="italic truncate">
                        {refundItems.filter(item => refundedItemIds.includes(item.id)).map(item => `${item.quantity}× ${item.name}`).join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <p className="text-xs font-medium">{tp("refundAmount")} <span className="text-destructive">*</span></p>
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
                    onClick={() => {
                      setRefundAmount(grandTotal.toFixed(2));
                      setRefundedItemIds(refundItems.map(item => item.id));
                    }}>
                    {tp("full")} ({fmt(grandTotal)})
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium">{tp("reason")} <span className="text-destructive">*</span></p>
                <Select value={refundReason} onValueChange={setRefundReason}>
                  <SelectTrigger data-testid="select-refund-reason">
                    <SelectValue placeholder={tp("selectReason")} />
                  </SelectTrigger>
                  <SelectContent>
                    {REFUND_REASON_KEYS.map(r => <SelectItem key={r} value={r}>{tp(r)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setRefundStep(false); setStep("receipt"); }}>{tp("cancel")}</Button>
                <Button className="flex-1 bg-orange-600 hover:bg-orange-700"
                  disabled={!refundAmount || !refundReason || refundBillMutation.isPending}
                  onClick={() => refundBillMutation.mutate()} data-testid="button-confirm-refund">
                  {refundBillMutation.isPending ? tp("refunding") : `${tp("refund")} ${refundAmount ? fmt(parseFloat(refundAmount)) : ""}`}
                </Button>
              </div>
            </div>
          )}
          </div>
        </BillWrapper>
      </Dialog>

      {showCashPaymentModal && createdBill && (
        <CashPaymentModal
          open={showCashPaymentModal}
          onClose={() => setShowCashPaymentModal(false)}
          amountDue={grandTotal}
          billId={createdBill.id}
          billNumber={createdBill.billNumber}
          tableNumber={tableNumber}
          posSessionId={posSessionId}
          hasActiveSession={true}
          onPaymentComplete={(tendered, change) => {
            queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
            queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
            queryClient.invalidateQueries({ queryKey: ["/api/restaurant-bills"] });
            setCashTendered(String(tendered));
            setStep("receipt");
          }}
        />
      )}
    </>
  );
}
