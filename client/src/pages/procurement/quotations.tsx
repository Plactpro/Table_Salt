import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@shared/currency";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, X, AlertTriangle, Send, FileText, GitCompare, CheckCircle2 } from "lucide-react";
import { selectPageData, type PaginatedResponse } from "@/lib/api-types";
import { useTranslation } from "react-i18next";

interface Supplier { id: string; name: string; active: boolean | null; }
interface InventoryItem { id: string; name: string; unit: string | null; }
interface LowStockItem extends InventoryItem { suggestedQty: string; currentStock: string | null; }

interface QuotationItemShape {
  id: string;
  inventoryItemId: string;
  unitPrice: string | null;
  taxPct: string | null;
  notAvailable: boolean | null;
  notes: string | null;
}
interface SupplierQuotationShape {
  id: string; rfqId: string; supplierId: string; quotationNumber: string | null;
  validityDate: string | null; paymentTerms: string | null; deliveryDays: number | null;
  items: QuotationItemShape[];
}
interface RFQItemShape { id: string; inventoryItemId: string; quantity: string; unit: string; specifications: string | null; }
interface RFQ {
  id: string; rfqNumber: string; requiredBy: string | null; status: string | null;
  notes: string | null; supplierIds: string[] | null; createdAt: string;
  items: RFQItemShape[];
  quotations: SupplierQuotationShape[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  received: "bg-yellow-100 text-yellow-700",
  comparing: "bg-orange-100 text-orange-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-500",
};

const PAYMENT_TERMS = ["IMMEDIATE", "NET_7", "NET_15", "NET_30", "NET_60"];

export default function QuotationsTab() {
  const { t } = useTranslation("modules");
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [recordQuoteOpen, setRecordQuoteOpen] = useState(false);
  const [selectedRFQ, setSelectedRFQ] = useState<RFQ | null>(null);

  const [rfqForm, setRfqForm] = useState({ requiredBy: "", notes: "", supplierIds: [] as string[] });
  const [rfqItems, setRfqItems] = useState<Array<{ inventoryItemId: string; quantity: string; unit: string; specifications: string }>>([]);
  const [quoteForm, setQuoteForm] = useState({ supplierId: "", quotationNumber: "", validityDate: "", paymentTerms: "NET_30", deliveryDays: "" });
  const [quoteItems, setQuoteItems] = useState<Array<{ inventoryItemId: string; unitPrice: string; notAvailable: boolean }>>([]);

  const fmt = (v: number) => {
    const tenant = (user as Record<string, unknown>)?.tenant as Record<string, unknown> | undefined;
    return formatCurrency(v, String(tenant?.currency || "AED"), {
      position: (tenant?.currencyPosition as "before" | "after") || "before",
      decimals: (tenant?.currencyDecimals as number) ?? 2,
    });
  };

  const { data: suppliers = [] } = useQuery<PaginatedResponse<Supplier>, Error, Supplier[]>({ queryKey: ["/api/suppliers"], select: selectPageData });
  const { data: inventoryRes } = useQuery<{ data: InventoryItem[]; total: number }>({ queryKey: ["/api/inventory"] });
  const { data: lowStock = [] } = useQuery<LowStockItem[]>({ queryKey: ["/api/procurement/low-stock"] });
  const { data: rfqs = [], isLoading } = useQuery<RFQ[]>({ queryKey: ["/api/rfqs"] });

  const inventoryItems = inventoryRes?.data ?? [];
  const invMap = new Map(inventoryItems.map(i => [i.id, i]));
  const supplierMap = new Map(suppliers.map(s => [s.id, s]));
  const activeSuppliers = suppliers.filter(s => s.active !== false);

  const onErr = (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/rfqs"] });

  const createMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/rfqs", d).then(r => r.json()),
    onSuccess: () => { invalidate(); setDrawerOpen(false); toast({ title: "RFQ created" }); },
    onError: onErr,
  });

  const sendMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/rfqs/${id}/send`).then(r => r.json()),
    onSuccess: () => { invalidate(); toast({ title: "RFQ sent to suppliers" }); },
    onError: onErr,
  });

  const recordQuoteMut = useMutation({
    mutationFn: ({ rfqId, d }: { rfqId: string; d: Record<string, unknown> }) =>
      apiRequest("POST", `/api/rfqs/${rfqId}/quotations`, d).then(r => r.json()),
    onSuccess: () => { invalidate(); setRecordQuoteOpen(false); toast({ title: "Quotation recorded" }); },
    onError: onErr,
  });

  const addFromLowStock = () => {
    const newItems = lowStock.map(ls => ({
      inventoryItemId: ls.id,
      quantity: ls.suggestedQty,
      unit: ls.unit || "kg",
      specifications: "",
    }));
    setRfqItems(prev => [...prev, ...newItems]);
  };

  const addRfqItem = () =>
    setRfqItems(prev => [...prev, { inventoryItemId: "", quantity: "1", unit: "kg", specifications: "" }]);

  const removeRfqItem = (idx: number) =>
    setRfqItems(prev => prev.filter((_, i) => i !== idx));

  const openCompare = (rfq: RFQ) => { setSelectedRFQ(rfq); setCompareOpen(true); };

  const openRecordQuote = (rfq: RFQ) => {
    setSelectedRFQ(rfq);
    setQuoteForm({ supplierId: "", quotationNumber: "", validityDate: "", paymentTerms: "NET_30", deliveryDays: "" });
    setQuoteItems(rfq.items.map(i => ({
      inventoryItemId: i.inventoryItemId,
      unitPrice: "",
      notAvailable: false,
    })));
    setRecordQuoteOpen(true);
  };

  const saveQuote = () => {
    if (!selectedRFQ || !quoteForm.supplierId) return;
    recordQuoteMut.mutate({
      rfqId: selectedRFQ.id,
      d: {
        supplierId: quoteForm.supplierId,
        quotationNumber: quoteForm.quotationNumber,
        validityDate: quoteForm.validityDate || null,
        paymentTerms: quoteForm.paymentTerms,
        deliveryDays: parseInt(quoteForm.deliveryDays) || null,
        items: quoteItems.map(qi => ({
          inventoryItemId: qi.inventoryItemId,
          unitPrice: qi.notAvailable ? null : (parseFloat(qi.unitPrice) || null),
          notAvailable: qi.notAvailable,
        })),
      },
    });
  };

  const toggleSupplier = (id: string) => {
    setRfqForm(f => ({
      ...f,
      supplierIds: f.supplierIds.includes(id)
        ? f.supplierIds.filter(s => s !== id)
        : [...f.supplierIds, id],
    }));
  };

  const getBestValue = (rfq: RFQ | null): { supplierId: string; total: number } | null => {
    if (!rfq || rfq.quotations.length === 0) return null;
    let bestTotal = Infinity;
    let bestSupplierId = "";
    for (const q of rfq.quotations) {
      const total = rfq.items.reduce((s, item) => {
        const qi = q.items.find(i => i.inventoryItemId === item.inventoryItemId);
        if (!qi || qi.notAvailable || !qi.unitPrice) return s;
        return s + parseFloat(qi.unitPrice) * parseFloat(item.quantity);
      }, 0);
      if (total > 0 && total < bestTotal) { bestTotal = total; bestSupplierId = q.supplierId; }
    }
    return bestSupplierId ? { supplierId: bestSupplierId, total: bestTotal } : null;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{rfqs.length} request{rfqs.length !== 1 ? "s" : ""} for quotation</p>
        <Button
          onClick={() => { setRfqForm({ requiredBy: "", notes: "", supplierIds: [] }); setRfqItems([]); setDrawerOpen(true); }}
          data-testid="button-new-rfq"
        >
          <Plus className="h-4 w-4 mr-2" />New RFQ
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : rfqs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No RFQs yet. Create your first request for quotation.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RFQ #</TableHead>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>Required By</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>Suppliers</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rfqs.map(rfq => (
                  <TableRow key={rfq.id} data-testid={`row-rfq-${rfq.id}`}>
                    <TableCell className="font-medium" data-testid={`text-rfq-number-${rfq.id}`}>{rfq.rfqNumber}</TableCell>
                    <TableCell>{new Date(rfq.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{rfq.requiredBy ? new Date(rfq.requiredBy).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[rfq.status || "draft"] || "bg-gray-100 text-gray-700"} data-testid={`badge-rfq-status-${rfq.id}`}>
                        {rfq.status || "draft"}
                      </Badge>
                    </TableCell>
                    <TableCell>{rfq.supplierIds?.length ?? 0}</TableCell>
                    <TableCell>{rfq.items.length}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {rfq.status === "draft" && (
                          <Button size="sm" variant="outline" onClick={() => sendMut.mutate(rfq.id)} disabled={sendMut.isPending} data-testid={`button-send-rfq-${rfq.id}`}>
                            {sendMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}Send
                          </Button>
                        )}
                        {(rfq.status === "sent" || rfq.status === "received") && (
                          <Button size="sm" variant="outline" onClick={() => openRecordQuote(rfq)} data-testid={`button-record-quote-${rfq.id}`}>
                            <FileText className="h-3 w-3 mr-1" />Record Quote
                          </Button>
                        )}
                        {rfq.quotations.length > 0 && (
                          <Button size="sm" variant="outline" onClick={() => openCompare(rfq)} data-testid={`button-compare-${rfq.id}`}>
                            <GitCompare className="h-3 w-3 mr-1" />Compare
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create RFQ Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>New Request for Quotation</SheetTitle></SheetHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Required By Date</Label>
                <Input
                  type="date"
                  value={rfqForm.requiredBy}
                  onChange={e => setRfqForm(f => ({ ...f, requiredBy: e.target.value }))}
                  data-testid="input-required-by"
                />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={rfqForm.notes}
                  onChange={e => setRfqForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional notes..."
                  data-testid="input-rfq-notes"
                />
              </div>
            </div>

            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base font-semibold">Items</Label>
                <div className="flex gap-2">
                  {lowStock.length > 0 && (
                    <Button size="sm" variant="outline" onClick={addFromLowStock} data-testid="button-add-low-stock">
                      <AlertTriangle className="h-3 w-3 mr-1 text-amber-500" />Add Low Stock ({lowStock.length})
                    </Button>
                  )}
                  <Button size="sm" onClick={addRfqItem} data-testid="button-add-rfq-item">
                    <Plus className="h-3 w-3 mr-1" />Add Item
                  </Button>
                </div>
              </div>
              {rfqItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-2 mb-2 p-2 border rounded" data-testid={`rfq-item-${idx}`}>
                  <div className="col-span-2">
                    <Select
                      value={item.inventoryItemId}
                      onValueChange={v => setRfqItems(prev => prev.map((it, i) => i === idx ? { ...it, inventoryItemId: v } : it))}
                    >
                      <SelectTrigger data-testid={`select-rfq-item-${idx}`}><SelectValue placeholder="Select item" /></SelectTrigger>
                      <SelectContent>{inventoryItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={e => setRfqItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))}
                    placeholder="Qty"
                    data-testid={`input-rfq-qty-${idx}`}
                  />
                  <Input
                    value={item.unit}
                    onChange={e => setRfqItems(prev => prev.map((it, i) => i === idx ? { ...it, unit: e.target.value } : it))}
                    placeholder="Unit"
                    data-testid={`input-rfq-unit-${idx}`}
                  />
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => removeRfqItem(idx)} data-testid={`button-remove-rfq-item-${idx}`}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {rfqItems.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No items added yet</p>}
            </div>

            <Separator />
            <div>
              <Label className="text-base font-semibold block mb-2">Send To Suppliers</Label>
              <div className="space-y-2">
                {activeSuppliers.map(s => (
                  <div key={s.id} className="flex items-center gap-2" data-testid={`supplier-checkbox-${s.id}`}>
                    <Checkbox
                      checked={rfqForm.supplierIds.includes(s.id)}
                      onCheckedChange={() => toggleSupplier(s.id)}
                      id={`sup-${s.id}`}
                    />
                    <label htmlFor={`sup-${s.id}`} className="text-sm cursor-pointer">{s.name}</label>
                  </div>
                ))}
                {activeSuppliers.length === 0 && (
                  <p className="text-sm text-muted-foreground">No active suppliers. Add suppliers first.</p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => createMut.mutate({ ...rfqForm, items: rfqItems })}
                disabled={rfqItems.length === 0 || createMut.isPending}
                data-testid="button-save-rfq"
                className="flex-1"
              >
                {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Draft
              </Button>
              <Button variant="outline" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Record Quotation Dialog */}
      <Dialog open={recordQuoteOpen} onOpenChange={setRecordQuoteOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Supplier Quotation — {selectedRFQ?.rfqNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier *</Label>
                <Select value={quoteForm.supplierId} onValueChange={v => setQuoteForm(f => ({ ...f, supplierId: v }))}>
                  <SelectTrigger data-testid="select-quote-supplier"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {(selectedRFQ?.supplierIds || []).map(sid => {
                      const s = supplierMap.get(sid);
                      return s ? <SelectItem key={sid} value={sid}>{s.name}</SelectItem> : null;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quotation Number</Label>
                <Input value={quoteForm.quotationNumber} onChange={e => setQuoteForm(f => ({ ...f, quotationNumber: e.target.value }))} placeholder="QUOT-001" data-testid="input-quote-number" />
              </div>
              <div>
                <Label>Validity Date</Label>
                <Input type="date" value={quoteForm.validityDate} onChange={e => setQuoteForm(f => ({ ...f, validityDate: e.target.value }))} data-testid="input-quote-validity" />
              </div>
              <div>
                <Label>Delivery Days</Label>
                <Input type="number" value={quoteForm.deliveryDays} onChange={e => setQuoteForm(f => ({ ...f, deliveryDays: e.target.value }))} data-testid="input-quote-delivery-days" />
              </div>
              <div>
                <Label>Payment Terms</Label>
                <Select value={quoteForm.paymentTerms} onValueChange={v => setQuoteForm(f => ({ ...f, paymentTerms: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <Separator />
            <Label className="font-semibold">Item Prices</Label>
            {quoteItems.map((qi, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-2 p-2 border rounded" data-testid={`quote-item-${idx}`}>
                <div className="col-span-2 font-medium text-sm self-center">
                  {invMap.get(qi.inventoryItemId)?.name || qi.inventoryItemId}
                </div>
                <div>
                  <Label className="text-xs">Unit Price</Label>
                  <Input
                    type="number"
                    value={qi.unitPrice}
                    onChange={e => setQuoteItems(prev => prev.map((q, i) => i === idx ? { ...q, unitPrice: e.target.value } : q))}
                    placeholder="0.00"
                    disabled={qi.notAvailable}
                    data-testid={`input-quote-price-${idx}`}
                  />
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <div className="flex items-center gap-1">
                    <Checkbox
                      checked={qi.notAvailable}
                      onCheckedChange={v => setQuoteItems(prev => prev.map((q, i) => i === idx ? { ...q, notAvailable: !!v } : q))}
                      id={`na-${idx}`}
                    />
                    <label htmlFor={`na-${idx}`} className="text-xs">N/A</label>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordQuoteOpen(false)}>Cancel</Button>
            <Button
              onClick={saveQuote}
              disabled={!quoteForm.supplierId || recordQuoteMut.isPending}
              data-testid="button-save-quotation"
            >
              {recordQuoteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Quotation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comparison Matrix Dialog */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quotation Comparison — {selectedRFQ?.rfqNumber}</DialogTitle>
          </DialogHeader>
          {selectedRFQ && selectedRFQ.quotations.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      {selectedRFQ.quotations.map(q => (
                        <TableHead key={q.id} className="text-center min-w-[140px]">
                          {supplierMap.get(q.supplierId)?.name || q.supplierId}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRFQ.items.map(item => {
                      const prices = selectedRFQ.quotations.map(q => {
                        const qi = q.items.find(i => i.inventoryItemId === item.inventoryItemId);
                        if (!qi || qi.notAvailable || !qi.unitPrice) return null;
                        return parseFloat(qi.unitPrice);
                      });
                      const validPrices = prices.filter((p): p is number => p !== null && p > 0);
                      const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
                      return (
                        <TableRow key={item.id} data-testid={`compare-row-${item.id}`}>
                          <TableCell className="font-medium">
                            <div>{invMap.get(item.inventoryItemId)?.name || item.inventoryItemId}</div>
                            <div className="text-xs text-muted-foreground">Qty: {item.quantity} {item.unit}</div>
                          </TableCell>
                          {selectedRFQ.quotations.map(q => {
                            const qItem = q.items.find(i => i.inventoryItemId === item.inventoryItemId);
                            if (!qItem || qItem.notAvailable) {
                              return <TableCell key={q.id} className="text-center text-muted-foreground text-sm">N/A</TableCell>;
                            }
                            const price = parseFloat(qItem.unitPrice || "0");
                            const total = price * parseFloat(item.quantity);
                            const isBest = minPrice !== null && price === minPrice && price > 0;
                            return (
                              <TableCell key={q.id} className={`text-center ${isBest ? "bg-green-50" : ""}`} data-testid={`compare-price-${item.id}-${q.id}`}>
                                {isBest && <CheckCircle2 className="h-3 w-3 text-green-600 inline mr-1" />}
                                <div className="font-medium">{fmt(price)}</div>
                                <div className="text-xs text-muted-foreground">Total: {fmt(total)}</div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                    {/* Totals row */}
                    <TableRow className="font-semibold bg-muted/30">
                      <TableCell>Total (all items)</TableCell>
                      {selectedRFQ.quotations.map(q => {
                        const total = selectedRFQ.items.reduce((s, item) => {
                          const qi = q.items.find(i => i.inventoryItemId === item.inventoryItemId);
                          if (!qi || qi.notAvailable || !qi.unitPrice) return s;
                          return s + parseFloat(qi.unitPrice) * parseFloat(item.quantity);
                        }, 0);
                        return <TableCell key={q.id} className="text-center">{total > 0 ? fmt(total) : "—"}</TableCell>;
                      })}
                    </TableRow>
                    <TableRow className="bg-muted/20">
                      <TableCell>Delivery Days</TableCell>
                      {selectedRFQ.quotations.map(q => <TableCell key={q.id} className="text-center">{q.deliveryDays ?? "—"}</TableCell>)}
                    </TableRow>
                    <TableRow className="bg-muted/20">
                      <TableCell>Payment Terms</TableCell>
                      {selectedRFQ.quotations.map(q => <TableCell key={q.id} className="text-center">{q.paymentTerms || "—"}</TableCell>)}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Best Value suggestion + Create PO actions */}
              {(() => {
                const best = getBestValue(selectedRFQ);
                if (!best) return null;
                return (
                  <div className="p-3 bg-green-50 border border-green-200 rounded text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600 inline mr-2" />
                    <span className="font-medium">Best Value: </span>
                    {supplierMap.get(best.supplierId)?.name} — {fmt(best.total)} total for all items
                  </div>
                );
              })()}

              {/* Per-supplier Create PO buttons */}
              {selectedRFQ.quotations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-semibold">Create Purchase Orders</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedRFQ.quotations.map(q => {
                      const total = selectedRFQ.items.reduce((s, item) => {
                        const qi = q.items.find(i => i.inventoryItemId === item.inventoryItemId);
                        if (!qi || qi.notAvailable || !qi.unitPrice) return s;
                        return s + parseFloat(qi.unitPrice) * parseFloat(item.quantity);
                      }, 0);
                      const isBest = getBestValue(selectedRFQ)?.supplierId === q.supplierId;
                      return (
                        <Button
                          key={q.id}
                          size="sm"
                          variant={isBest ? "default" : "outline"}
                          onClick={() => {
                            const poItems = selectedRFQ.items
                              .map(item => {
                                const qi = q.items.find(i => i.inventoryItemId === item.inventoryItemId);
                                if (!qi || qi.notAvailable) return null;
                                return { inventoryItemId: item.inventoryItemId, quantity: item.quantity, unit: item.unit, unitPrice: qi.unitPrice || "0", totalPrice: (parseFloat(qi.unitPrice || "0") * parseFloat(item.quantity)).toFixed(2) };
                              })
                              .filter(Boolean);
                            const state = {
                              supplierId: q.supplierId,
                              rfqId: selectedRFQ.id,
                              expectedDelivery: q.deliveryDays ? new Date(Date.now() + q.deliveryDays * 86400000).toISOString().slice(0, 10) : "",
                              paymentTerms: q.paymentTerms || "NET_30",
                              items: poItems,
                            };
                            localStorage.setItem("procurement_po_prefill", JSON.stringify(state));
                            setCompareOpen(false);
                            (document.querySelector('[data-tab-trigger="purchase-orders"]') as HTMLButtonElement | null)?.click();
                            toast({ title: `PO prefilled from ${supplierMap.get(q.supplierId)?.name || "quotation"}`, description: "Switch to Purchase Orders tab to confirm" });
                          }}
                          data-testid={`button-create-po-from-quote-${q.id}`}
                        >
                          {isBest && <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {supplierMap.get(q.supplierId)?.name || "Supplier"} ({fmt(total)})
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No quotations recorded yet</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompareOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
