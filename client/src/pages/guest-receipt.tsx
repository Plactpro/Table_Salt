import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { Loader2, CheckCircle2, Clock, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface PublicReceiptData {
  id: string;
  billNumber: string;
  invoiceNumber?: string | null;
  totalAmount: string;
  paymentStatus: string;
  paidAt?: string | null;
  createdAt: string;
  subtotal: string;
  discountAmount?: string | null;
  serviceCharge?: string | null;
  taxAmount?: string | null;
  tips?: string | null;
  orderType?: string | null;
  tableId?: string | null;
  restaurantName: string;
  currency: string;
  payments: { paymentMethod: string; amount: string; isRefund?: boolean }[];
  items: { name: string; quantity: number; price: string }[];
}

export default function GuestReceiptPage() {
  const { id } = useParams<{ id: string }>();

  const { data: receipt, isLoading, isError } = useQuery<PublicReceiptData>({
    queryKey: ["/api/public/receipt", id],
    queryFn: async () => {
      const res = await fetch(`/api/public/receipt/${id}`);
      if (!res.ok) throw new Error("Receipt not found");
      return res.json();
    },
    enabled: !!id,
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" data-testid="loading-receipt">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !receipt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-sm w-full text-center" data-testid="receipt-not-found">
          <CardContent className="py-12 space-y-3">
            <Receipt className="h-10 w-10 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">Receipt Not Found</h2>
            <p className="text-sm text-muted-foreground">This receipt link may be invalid or expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currency = receipt.currency?.toUpperCase() || "USD";
  const fmt = (val: string | number) => sharedFormatCurrency(val, currency);
  const isPaid = receipt.paymentStatus === "paid";
  const paymentDate = receipt.paidAt || receipt.createdAt;
  const formattedDate = paymentDate
    ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(paymentDate))
    : "—";

  const primaryPayment = receipt.payments.find(p => !p.isRefund);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-8 px-4" data-testid="guest-receipt-page">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold font-heading" data-testid="text-restaurant-name">{receipt.restaurantName}</h1>
          <p className="text-sm text-muted-foreground">Digital Receipt</p>
        </div>

        <Card data-testid="receipt-card">
          <CardHeader className="pb-3 text-center">
            <div className="flex justify-center mb-2">
              {isPaid ? (
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
              )}
            </div>
            <CardTitle className="text-base" data-testid="text-payment-status">
              {isPaid ? "Payment Confirmed" : "Pending Payment"}
            </CardTitle>
            <p className="text-xs text-muted-foreground" data-testid="text-bill-number">
              Bill #{receipt.billNumber}
              {receipt.invoiceNumber ? ` · Invoice ${receipt.invoiceNumber}` : ""}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="text-bill-date">{formattedDate}</p>
            <Badge variant={isPaid ? "default" : "secondary"} className="mx-auto mt-1" data-testid="badge-status">
              {receipt.paymentStatus.replace(/_/g, " ")}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-1">
              {receipt.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm" data-testid={`row-item-${i}`}>
                  <span className="text-muted-foreground">
                    {item.name} <span className="font-medium text-foreground">×{item.quantity}</span>
                  </span>
                  <span data-testid={`text-item-amount-${i}`}>{fmt(Number(item.price) * item.quantity)}</span>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span data-testid="text-subtotal">{fmt(Number(receipt.subtotal))}</span>
              </div>
              {Number(receipt.discountAmount) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span data-testid="text-discount">-{fmt(Number(receipt.discountAmount))}</span>
                </div>
              )}
              {Number(receipt.serviceCharge) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Service Charge</span>
                  <span data-testid="text-service-charge">{fmt(Number(receipt.serviceCharge))}</span>
                </div>
              )}
              {Number(receipt.taxAmount) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span data-testid="text-tax">{fmt(Number(receipt.taxAmount))}</span>
                </div>
              )}
              {Number(receipt.tips) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tips</span>
                  <span data-testid="text-tips">{fmt(Number(receipt.tips))}</span>
                </div>
              )}
            </div>

            <Separator />

            <div className="flex justify-between font-bold text-base" data-testid="row-total">
              <span>Total</span>
              <span data-testid="text-total">{fmt(Number(receipt.totalAmount))}</span>
            </div>

            {primaryPayment && (
              <p className="text-xs text-center text-muted-foreground" data-testid="text-paid-via">
                Paid via {primaryPayment.paymentMethod}
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">Thank you for dining with us!</p>
      </div>
    </div>
  );
}
