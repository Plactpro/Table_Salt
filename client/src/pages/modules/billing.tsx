import { PageTitle } from "@/lib/accessibility";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { motion } from "framer-motion";
import {
  CreditCard, Receipt, Search, DollarSign, TrendingUp, FileText,
  LayoutGrid, Table2, CalendarDays, User, Mail,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Order, OrderItem, Table as TableType, Customer } from "@shared/schema";
import { useOutletTimezone, formatLocal, formatLocalDate } from "@/hooks/use-outlet-timezone";

type OrderWithItems = Order & { items?: OrderItem[] };

type InvoiceView = "list" | "by_table" | "by_day" | "by_customer";

export default function BillingPage() {
  const { user } = useAuth();
  const outletTimezone = useOutletTimezone();
  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: string | number | null) => {
    if (val == null) return sharedFormatCurrency(0, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });
    return sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });
  };

  const { data: tenant } = useQuery<{ id: string; name: string }>({ queryKey: ["/api/tenant"] });
  const { data: ordersRes } = useQuery<{ data: Order[]; total: number }>({ queryKey: ["/api/orders"] });
  const orders = ordersRes?.data ?? [];
  const { data: tables = [] } = useQuery<TableType[]>({ queryKey: ["/api/tables"] });
  const { data: customersRes } = useQuery<{ data: Customer[]; total: number }>({ queryKey: ["/api/customers"] });
  const customers = customersRes?.data ?? [];
  const { data: billsData = [] } = useQuery<{ id: string; orderId: string; invoiceNumber: string | null }[]>({
    queryKey: ["/api/restaurant-bills?limit=1000"],
  });

  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceDateFrom, setInvoiceDateFrom] = useState("");
  const [invoiceDateTo, setInvoiceDateTo] = useState("");
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState("all");
  const [invoiceView, setInvoiceView] = useState<InvoiceView>("list");
  const [selectedInvoice, setSelectedInvoice] = useState<OrderWithItems | null>(null);

  const [emailReceiptOpen, setEmailReceiptOpen] = useState(false);
  const [emailReceiptBillId, setEmailReceiptBillId] = useState<string | null>(null);
  const [emailReceiptAddress, setEmailReceiptAddress] = useState("");
  const [emailReceiptSending, setEmailReceiptSending] = useState(false);
  const [emailReceiptStatus, setEmailReceiptStatus] = useState<"idle" | "success" | "error">("idle");

  const tableMap = useMemo(() => {
    const map: Record<string, string> = {};
    tables.forEach((t) => { map[t.id] = `Table ${t.number}`; });
    return map;
  }, [tables]);

  const invoiceNumberMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    billsData.forEach((b) => { map[b.orderId] = b.invoiceNumber ?? null; });
    return map;
  }, [billsData]);

  const customerMap = useMemo(() => {
    const map: Record<string, string> = {};
    customers.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [customers]);

  const paidOrders = useMemo(() => orders.filter((o) => o.status === "paid"), [orders]);

  const filteredInvoices = useMemo(() => {
    let result = [...paidOrders];
    if (invoiceSearch.trim()) {
      const q = invoiceSearch.toLowerCase();
      result = result.filter((o) => o.id.toLowerCase().includes(q) || (o.notes && o.notes.toLowerCase().includes(q)) || (o.tableId && tableMap[o.tableId]?.toLowerCase().includes(q)));
    }
    if (invoiceTypeFilter !== "all") result = result.filter((o) => o.orderType === invoiceTypeFilter);
    if (invoiceDateFrom) {
      const from = new Date(invoiceDateFrom);
      result = result.filter((o) => o.createdAt && new Date(o.createdAt) >= from);
    }
    if (invoiceDateTo) {
      const to = new Date(invoiceDateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((o) => o.createdAt && new Date(o.createdAt) <= to);
    }
    result.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return result;
  }, [paidOrders, invoiceSearch, invoiceTypeFilter, invoiceDateFrom, invoiceDateTo, tableMap]);

  const invoiceStats = useMemo(() => {
    const totalRevenue = filteredInvoices.reduce((sum, o) => sum + Number(o.total), 0);
    const totalTax = filteredInvoices.reduce((sum, o) => sum + Number(o.tax), 0);
    const totalDiscount = filteredInvoices.reduce((sum, o) => sum + Number(o.discount), 0);
    const avgOrderValue = filteredInvoices.length > 0 ? totalRevenue / filteredInvoices.length : 0;
    return { totalRevenue, totalTax, totalDiscount, avgOrderValue, count: filteredInvoices.length };
  }, [filteredInvoices]);

  const byTableData = useMemo(() => {
    const groups: Record<string, { label: string; orders: Order[]; revenue: number }> = {};
    filteredInvoices.forEach((o) => {
      const key = o.tableId || "no_table";
      const label = o.tableId ? (tableMap[o.tableId] || "Unknown Table") : "Takeaway / Delivery";
      if (!groups[key]) groups[key] = { label, orders: [], revenue: 0 };
      groups[key].orders.push(o);
      groups[key].revenue += Number(o.total);
    });
    return Object.entries(groups).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [filteredInvoices, tableMap]);

  const byCustomerData = useMemo(() => {
    const groups: Record<string, { label: string; orders: Order[]; revenue: number }> = {};
    filteredInvoices.forEach((o) => {
      const key = o.customerId || "walk_in";
      const label = o.customerId ? (customerMap[o.customerId] || "Unknown Customer") : "Walk-in";
      if (!groups[key]) groups[key] = { label, orders: [], revenue: 0 };
      groups[key].orders.push(o);
      groups[key].revenue += Number(o.total);
    });
    return Object.entries(groups).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [filteredInvoices, customerMap]);

  const byDayData = useMemo(() => {
    const groups: Record<string, { label: string; orders: Order[]; revenue: number }> = {};
    filteredInvoices.forEach((o) => {
      if (!o.createdAt) return;
      const d = new Date(o.createdAt);
      let key: string;
      let label: string;
      try {
        key = new Intl.DateTimeFormat("en-US", { timeZone: outletTimezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
        label = new Intl.DateTimeFormat("en-US", { timeZone: outletTimezone, month: "short", day: "numeric", year: "numeric" }).format(d);
      } catch {
        key = d.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
        label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      }
      if (!groups[key]) groups[key] = { label, orders: [], revenue: 0 };
      groups[key].orders.push(o);
      groups[key].revenue += Number(o.total);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredInvoices, outletTimezone]);

  const handleViewInvoice = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const order: OrderWithItems = await res.json();
      setSelectedInvoice(order);
    } catch {
      setSelectedInvoice(null);
    }
  };

  const handleOpenEmailReceipt = async (orderId: string, prefillEmail?: string) => {
    try {
      const res = await fetch(`/api/restaurant-bills/by-order/${orderId}`, { credentials: "include" });
      if (res.ok) {
        const bill = await res.json();
        setEmailReceiptBillId(bill.id);
        setEmailReceiptAddress(prefillEmail || "");
        setEmailReceiptStatus("idle");
        setEmailReceiptOpen(true);
      }
    } catch {
      // silently skip if bill not found
    }
  };

  const handleSendReceipt = async () => {
    if (!emailReceiptBillId || !emailReceiptAddress) return;
    setEmailReceiptSending(true);
    setEmailReceiptStatus("idle");
    try {
      const res = await fetch(`/api/bills/${emailReceiptBillId}/send-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerEmail: emailReceiptAddress }),
      });
      if (res.ok) {
        setEmailReceiptStatus("success");
      } else {
        setEmailReceiptStatus("error");
      }
    } catch {
      setEmailReceiptStatus("error");
    } finally {
      setEmailReceiptSending(false);
    }
  };

  const typeLabels: Record<string, string> = {
    dine_in: "Dine In",
    takeaway: "Takeaway",
    delivery: "Delivery",
  };

  const getInvoiceLabel = (orderId: string) => {
    const invNum = invoiceNumberMap[orderId];
    return invNum ?? `#${orderId.slice(-6).toUpperCase()}`;
  };

  const renderInvoiceTable = (invoices: Order[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Invoice #</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Table</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead className="w-[80px]">View</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((order) => (
            <TableRow key={order.id} className="hover:bg-muted/50" data-testid={`row-invoice-${order.id}`}>
              <TableCell className="text-sm">{formatLocalDate(order.createdAt, outletTimezone)}</TableCell>
              <TableCell className="font-mono text-xs" data-testid={`text-invoice-number-${order.id}`}>{getInvoiceLabel(order.id)}</TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{typeLabels[order.orderType || "dine_in"]}</Badge></TableCell>
              <TableCell className="text-sm">{order.tableId ? tableMap[order.tableId] || "—" : "—"}</TableCell>
              <TableCell className="font-medium">{fmt(order.total)}</TableCell>
              <TableCell className="text-sm capitalize">{order.paymentMethod || "—"}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => handleViewInvoice(order.id)} data-testid={`button-view-invoice-${order.id}`}>
                  <FileText className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const renderGroupedInvoices = (
    data: [string, { label: string; orders: Order[]; revenue: number }][],
    icon: typeof Table2,
    revenueTestPrefix: string,
    showTableCol = false
  ) => {
    const Icon = icon;
    if (data.length === 0) return <Card><CardContent className="p-8 text-center text-muted-foreground">No invoices found.</CardContent></Card>;
    return data.map(([key, group]) => (
      <Card key={key} data-testid={`${revenueTestPrefix}-group-${key}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Icon className="h-4 w-4 text-primary" />
              {group.label}
            </CardTitle>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{group.orders.length} orders</span>
              <span className="font-bold" data-testid={`text-${revenueTestPrefix}-revenue-${key}`}>{fmt(group.revenue)}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  {showTableCol && <TableHead>Table</TableHead>}
                  <TableHead>Payment</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="w-[80px]">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.orders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-muted/50" data-testid={`row-invoice-${order.id}`}>
                    <TableCell className="font-mono text-xs" data-testid={`text-invoice-number-${order.id}`}>{getInvoiceLabel(order.id)}</TableCell>
                    <TableCell className="text-sm">{formatLocalDate(order.createdAt, outletTimezone)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{typeLabels[order.orderType || "dine_in"]}</Badge></TableCell>
                    {showTableCol && <TableCell className="text-sm">{order.tableId ? tableMap[order.tableId] || "—" : "—"}</TableCell>}
                    <TableCell className="text-sm capitalize">{order.paymentMethod || "—"}</TableCell>
                    <TableCell className="font-medium">{fmt(order.total)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleViewInvoice(order.id)} data-testid={`button-view-invoice-${order.id}`}>
                        <FileText className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    ));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6" data-testid="page-billing">
      <PageTitle title="Billing" />
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <CreditCard className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-heading" data-testid="text-billing-title">Billing</h1>
          <p className="text-muted-foreground">View and manage your invoice history</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: fmt(invoiceStats.totalRevenue), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
          { label: "Invoices", value: String(invoiceStats.count), icon: FileText, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" },
          { label: "Avg Order", value: fmt(invoiceStats.avgOrderValue), icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30" },
          { label: "Total Tax", value: fmt(invoiceStats.totalTax), icon: Receipt, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30" },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card className="transition-all duration-200 hover:shadow-md">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`rounded-lg p-2.5 ${stat.bg}`}><stat.icon className={`h-5 w-5 ${stat.color}`} /></div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold" data-testid={`text-invoice-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2"><Search className="h-4 w-4" /> Invoice Filters</CardTitle>
            <div className="flex gap-1">
              <Button variant={invoiceView === "list" ? "default" : "outline"} size="sm" onClick={() => setInvoiceView("list")} data-testid="button-view-list">
                <LayoutGrid className="h-3.5 w-3.5 mr-1" /> List
              </Button>
              <Button variant={invoiceView === "by_table" ? "default" : "outline"} size="sm" onClick={() => setInvoiceView("by_table")} data-testid="button-view-by-table">
                <Table2 className="h-3.5 w-3.5 mr-1" /> By Table
              </Button>
              <Button variant={invoiceView === "by_customer" ? "default" : "outline"} size="sm" onClick={() => setInvoiceView("by_customer")} data-testid="button-view-by-customer">
                <User className="h-3.5 w-3.5 mr-1" /> By Customer
              </Button>
              <Button variant={invoiceView === "by_day" ? "default" : "outline"} size="sm" onClick={() => setInvoiceView("by_day")} data-testid="button-view-by-day">
                <CalendarDays className="h-3.5 w-3.5 mr-1" /> By Day
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input data-testid="input-search-invoices" placeholder="Search invoices..." className="pl-9" value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} />
            </div>
            <Select value={invoiceTypeFilter} onValueChange={setInvoiceTypeFilter}>
              <SelectTrigger data-testid="select-invoice-type"><SelectValue placeholder="Order Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="dine_in">Dine In</SelectItem>
                <SelectItem value="takeaway">Takeaway</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" placeholder="From" value={invoiceDateFrom} onChange={(e) => setInvoiceDateFrom(e.target.value)} data-testid="input-date-from" />
            <Input type="date" placeholder="To" value={invoiceDateTo} onChange={(e) => setInvoiceDateTo(e.target.value)} data-testid="input-date-to" />
          </div>
        </CardContent>
      </Card>

      {invoiceView === "list" && (
        <Card>
          <CardContent className="p-0">
            {filteredInvoices.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No invoices found.</div>
            ) : renderInvoiceTable(filteredInvoices)}
          </CardContent>
        </Card>
      )}

      {invoiceView === "by_table" && (
        <div className="space-y-4" data-testid="view-by-table">
          {renderGroupedInvoices(byTableData, Table2, "table")}
        </div>
      )}

      {invoiceView === "by_customer" && (
        <div className="space-y-4" data-testid="view-by-customer">
          {renderGroupedInvoices(byCustomerData, User, "customer", true)}
        </div>
      )}

      {invoiceView === "by_day" && (
        <div className="space-y-4" data-testid="view-by-day">
          {renderGroupedInvoices(byDayData, CalendarDays, "day", true)}
        </div>
      )}

      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="max-w-md" data-testid="dialog-invoice-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {selectedInvoice ? getInvoiceLabel(selectedInvoice.id) : "Invoice"}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="text-center border-b pb-3">
                <h3 className="font-heading font-bold text-lg">{tenant?.name || "Restaurant"}</h3>
                <p className="text-xs text-muted-foreground">{formatLocal(selectedInvoice.createdAt, outletTimezone)}</p>
                <div className="flex items-center justify-center gap-2 mt-1">
                  {selectedInvoice.tableId && <Badge variant="outline">{tableMap[selectedInvoice.tableId]}</Badge>}
                  {selectedInvoice.paymentMethod && <Badge variant="outline" className="capitalize">{selectedInvoice.paymentMethod}</Badge>}
                </div>
              </div>

              <div className="space-y-2">
                {selectedInvoice.items?.map((item, idx) => (
                  <div key={item.id} className="flex justify-between text-sm" data-testid={`invoice-item-${idx}`}>
                    <div className="flex-1">
                      <span>{item.name}</span>
                      <span className="text-muted-foreground ml-1">x{item.quantity}</span>
                    </div>
                    <span className="font-medium">{fmt(Number(item.price) * (item.quantity || 1))}</span>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{fmt(selectedInvoice.subtotal)}</span>
                </div>
                {Number(selectedInvoice.discount) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{fmt(selectedInvoice.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{fmt(selectedInvoice.tax)}</span>
                </div>
                {(selectedInvoice.orderType === "takeaway" || selectedInvoice.orderType === "delivery") && Number(selectedInvoice.packingCharge) > 0 && (
                  <div className="flex justify-between" data-testid="text-billing-packing-charge">
                    <span className="text-muted-foreground">📦 Packing Charge</span>
                    <span>{fmt(selectedInvoice.packingCharge)}</span>
                  </div>
                )}
                {selectedInvoice.orderType === "dine_in" && selectedInvoice.notes && selectedInvoice.notes.includes("Service charge") && (() => {
                  const scNote = selectedInvoice.notes!.split(" | ").find((n: string) => n.includes("Service charge"));
                  const scMatch = scNote?.match(/Service charge\s*\((\d+(?:\.\d+)?)%\)/);
                  const scPercent = scMatch ? scMatch[1] : null;
                  const subtotalNum = Number(selectedInvoice.subtotal) || 0;
                  const discountNum = Number(selectedInvoice.discount) || 0;
                  const taxNum = Number(selectedInvoice.tax) || 0;
                  const totalNum = Number(selectedInvoice.total) || 0;
                  const scAmount = totalNum - (subtotalNum - discountNum + taxNum);
                  return (
                    <div className="flex justify-between" data-testid="invoice-service-charge">
                      <span className="text-muted-foreground">Service Charge{scPercent ? ` (${scPercent}%)` : ""}</span>
                      <span>{fmt(scAmount > 0 ? scAmount : 0)}</span>
                    </div>
                  );
                })()}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span data-testid="text-billing-total-with-packing">{fmt(selectedInvoice.total)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground border-t">
                <Badge className="bg-emerald-100 text-emerald-800">Paid</Badge>
                <span>Invoice #{selectedInvoice.id.slice(-6).toUpperCase()}</span>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                data-testid="button-email-receipt"
                onClick={() => {
                  const customerId = selectedInvoice.customerId;
                  const prefill = customerId ? customers.find((c) => c.id === customerId)?.email ?? "" : "";
                  handleOpenEmailReceipt(selectedInvoice.id, prefill || undefined);
                }}
              >
                <Mail className="h-4 w-4 mr-2" />
                Email Receipt
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={emailReceiptOpen} onOpenChange={(open) => { setEmailReceiptOpen(open); if (!open) setEmailReceiptStatus("idle"); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-email-receipt">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Email Receipt
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter the customer's email address to send the receipt.</p>
            <Input
              type="email"
              placeholder="customer@example.com"
              value={emailReceiptAddress}
              onChange={(e) => setEmailReceiptAddress(e.target.value)}
              data-testid="input-customer-email"
            />
            {emailReceiptStatus === "success" && (
              <p className="text-sm text-emerald-600 font-medium" data-testid="status-receipt-sent">Receipt sent successfully!</p>
            )}
            {emailReceiptStatus === "error" && (
              <p className="text-sm text-red-600 font-medium" data-testid="status-receipt-error">Failed to send receipt. Please try again.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailReceiptOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSendReceipt}
              disabled={emailReceiptSending || !emailReceiptAddress}
              data-testid="button-send-receipt"
            >
              {emailReceiptSending ? "Sending..." : "Send Receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
