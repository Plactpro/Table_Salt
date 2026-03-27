import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@shared/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, ChevronRight, CheckCircle, Send, Package, AlertTriangle, FileText, X, ClipboardCheck } from "lucide-react";
import { selectPageData, type PaginatedResponse } from "@/lib/api-types";
import { useTranslation } from "react-i18next";

interface Supplier { id: string; name: string; }
interface InventoryItem {
  id: string;
  name: string;
  unit: string | null;
  costPrice: string | null;
  currentStock: string | null;
}
interface LowStockItem extends InventoryItem { suggestedQty: string; }
interface PurchaseOrder {
  id: string;
  tenantId: string;
  outletId: string | null;
  supplierId: string;
  poNumber: string;
  status: string | null;
  totalAmount: string | null;
  notes: string | null;
  expectedDelivery: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}
interface POItem {
  id: string;
  purchaseOrderId: string;
  inventoryItemId: string;
  catalogItemId: string | null;
  quantity: string;
  unitCost: string;
  totalCost: string;
  receivedQty: string | null;
}
interface GRN {
  id: string;
  tenantId: string;
  purchaseOrderId: string;
  grnNumber: string;
  receivedBy: string | null;
  notes: string | null;
  createdAt: string;
}
interface PODetail extends PurchaseOrder {
  items: POItem[];
  grns: GRN[];
  approvals: Array<{ action: string; performedBy: string; performedAt: string; notes: string | null }>;
}
interface GRNLineItem {
  purchaseOrderItemId: string;
  quantityReceived: string;
  actualUnitCost: string;
  acceptedQty: string;
  rejectedQty: string;
  rejectionReason: string;
  batchNumber: string;
  expiryDate: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_approval: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  sent: "bg-blue-100 text-blue-700",
  partially_received: "bg-orange-100 text-orange-700",
  closed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
};

export default function PurchaseOrdersTab() {
  const { t } = useTranslation("modules");
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filterStatus, setFilterStatus] = useState("all");
  const [detailPO, setDetailPO] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [grnOpen, setGrnOpen] = useState(false);
  const [poForm, setPoForm] = useState({ supplierId: "", notes: "", expectedDelivery: "" });
  const [poItems, setPoItems] = useState<Array<{ inventoryItemId: string; quantity: string; unitCost: string }>>([]);
  const [grnLines, setGrnLines] = useState<GRNLineItem[]>([]);
  const [grnNotes, setGrnNotes] = useState("");

  const fmt = (v: string | number) => {
    const tenant = (user as Record<string, unknown>)?.tenant as Record<string, unknown> | undefined;
    return formatCurrency(v, String(tenant?.currency || "AED"), {
      position: (tenant?.currencyPosition as "before" | "after") || "before",
      decimals: (tenant?.currencyDecimals as number) ?? 2,
    });
  };

  const { data: suppliers = [] } = useQuery<PaginatedResponse<Supplier>, Error, Supplier[]>({ queryKey: ["/api/suppliers"], select: selectPageData });
  const { data: inventoryRes } = useQuery<{ data: InventoryItem[]; total: number }>({
    queryKey: ["/api/inventory", "all"],
    queryFn: () => apiRequest("GET", "/api/inventory?limit=200").then(r => r.json()),
  });
  const inventoryItems = inventoryRes?.data ?? [];
  const [poLimit, setPoLimit] = useState(50);
  const { data: poPage, isLoading: loadingPOs } = useQuery<PaginatedResponse<PurchaseOrder>>({
    queryKey: ["/api/purchase-orders", poLimit],
    queryFn: () => fetch(`/api/purchase-orders?limit=${poLimit}`, { credentials: "include" }).then(r => r.json()),
  });
  const purchaseOrders: PurchaseOrder[] = poPage?.data ?? [];
  const poHasMore = poPage?.hasMore ?? false;
  const { data: lowStock = [] } = useQuery<LowStockItem[]>({ queryKey: ["/api/procurement/low-stock"] });
  const { data: poDetail, isLoading: loadingDetail } = useQuery<PODetail>({
    queryKey: ["/api/purchase-orders", detailPO],
    queryFn: () =>
      detailPO
        ? apiRequest("GET", `/api/purchase-orders/${detailPO}`).then(r => r.json())
        : Promise.resolve(null),
    enabled: !!detailPO,
  });

  const invMap = new Map(inventoryItems.map(i => [i.id, i]));
  const supplierMap = new Map(suppliers.map(s => [s.id, s]));

  const onErr = (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" });
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
    qc.invalidateQueries({ queryKey: ["/api/procurement/analytics"] });
  };
  const invalidateDetail = () => {
    invalidateAll();
    if (detailPO) qc.invalidateQueries({ queryKey: ["/api/purchase-orders", detailPO] });
  };

  const createPOMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/purchase-orders", d).then(r => r.json()),
    onSuccess: () => { invalidateAll(); setCreateOpen(false); toast({ title: "Purchase Order created" }); },
    onError: onErr,
  });
  const approveMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/purchase-orders/${id}/approve`).then(r => r.json()),
    onSuccess: () => { invalidateDetail(); toast({ title: "PO approved" }); },
    onError: onErr,
  });
  const sendMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/purchase-orders/${id}/send`).then(r => r.json()),
    onSuccess: () => { invalidateDetail(); toast({ title: "PO sent to supplier" }); },
    onError: onErr,
  });
  const createGRNMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/grns", d).then(r => r.json()),
    onSuccess: () => {
      invalidateDetail();
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/procurement/low-stock"] });
      setGrnOpen(false);
      toast({ title: "Goods received and inventory updated" });
    },
    onError: onErr,
  });

  // Check for PO prefill data from quotation comparison view
  useEffect(() => {
    const prefillStr = localStorage.getItem("procurement_po_prefill");
    if (prefillStr) {
      try {
        const prefill = JSON.parse(prefillStr) as {
          supplierId: string; rfqId: string; expectedDelivery: string; paymentTerms: string;
          items: Array<{ inventoryItemId: string; quantity: string; unit: string; unitPrice: string; totalPrice: string }>;
        };
        localStorage.removeItem("procurement_po_prefill");
        setPoForm({ supplierId: prefill.supplierId, notes: `From RFQ`, expectedDelivery: prefill.expectedDelivery });
        setPoItems((prefill.items || []).map(i => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity, unitCost: i.unitPrice })));
        setCreateOpen(true);
      } catch (_) {
        // ignore malformed prefill
      }
    }
  }, []);

  const addPoItem = () =>
    setPoItems(prev => [...prev, { inventoryItemId: "", quantity: "1", unitCost: "0" }]);

  const updatePoItem = (idx: number, field: "inventoryItemId" | "quantity" | "unitCost", val: string) => {
    setPoItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  };

  const removePoItem = (idx: number) =>
    setPoItems(prev => prev.filter((_, i) => i !== idx));

  const updateGrnLine = (idx: number, field: keyof GRNLineItem, val: string) => {
    setGrnLines(prev => prev.map((line, i) => i === idx ? { ...line, [field]: val } : line));
  };

  const poTotal = useMemo(
    () => poItems.reduce((s, i) => s + parseFloat(i.quantity || "0") * parseFloat(i.unitCost || "0"), 0),
    [poItems]
  );

  const openCreateFromLowStock = () => {
    setPoItems(lowStock.map(ls => ({
      inventoryItemId: ls.id,
      quantity: ls.suggestedQty,
      unitCost: ls.costPrice || "0",
    })));
    setPoForm({ supplierId: "", notes: "Auto-generated from low stock alerts", expectedDelivery: "" });
    setCreateOpen(true);
  };

  const openGRN = () => {
    if (!poDetail) return;
    setGrnLines(poDetail.items.map(pi => ({
      purchaseOrderItemId: pi.id,
      quantityReceived: (parseFloat(pi.quantity) - parseFloat(pi.receivedQty || "0")).toFixed(2),
      actualUnitCost: pi.unitCost,
      acceptedQty: (parseFloat(pi.quantity) - parseFloat(pi.receivedQty || "0")).toFixed(2),
      rejectedQty: "0",
      rejectionReason: "",
      batchNumber: "",
      expiryDate: "",
    })));
    setGrnNotes("");
    setGrnOpen(true);
  };

  const filtered = purchaseOrders.filter(po => filterStatus === "all" || po.status === filterStatus);

  const grnPayloadItems = grnLines.map(gl => ({
    purchaseOrderItemId: gl.purchaseOrderItemId,
    quantityReceived: gl.acceptedQty || gl.quantityReceived,
    actualUnitCost: gl.actualUnitCost,
  }));

  return (
    <div className="space-y-4">
      {detailPO && poDetail ? (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setDetailPO(null)} data-testid="button-back-to-list">
            ← Back to list
          </Button>
          {loadingDetail && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loadingDetail && (
            <Card data-testid="po-detail-card">
              <CardHeader>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />{poDetail.poNumber}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Supplier: {supplierMap.get(poDetail.supplierId)?.name || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={STATUS_COLORS[poDetail.status || "draft"] || ""} data-testid="badge-po-status">
                      {(poDetail.status || "draft").replace(/_/g, " ")}
                    </Badge>
                    {poDetail.status === "draft" && (
                      <Button size="sm" onClick={() => approveMut.mutate(poDetail.id)} disabled={approveMut.isPending} data-testid="button-approve-po">
                        {approveMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                        Approve
                      </Button>
                    )}
                    {poDetail.status === "approved" && (
                      <Button size="sm" variant="outline" onClick={() => sendMut.mutate(poDetail.id)} disabled={sendMut.isPending} data-testid="button-send-po">
                        {sendMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                        Send to Supplier
                      </Button>
                    )}
                    {(poDetail.status === "sent" || poDetail.status === "partially_received") && (
                      <Button size="sm" onClick={openGRN} data-testid="button-receive-goods">
                        <Package className="h-4 w-4 mr-1" />Create GRN
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Total:</span> <span className="font-semibold">{fmt(poDetail.totalAmount || "0")}</span></div>
                  <div><span className="text-muted-foreground">Expected:</span> {poDetail.expectedDelivery ? new Date(poDetail.expectedDelivery).toLocaleDateString() : "—"}</div>
                  <div><span className="text-muted-foreground">Created:</span> {new Date(poDetail.createdAt).toLocaleDateString()}</div>
                  {poDetail.approvedAt && (
                    <div><span className="text-muted-foreground">Approved:</span> {new Date(poDetail.approvedAt).toLocaleDateString()}</div>
                  )}
                </div>
                {poDetail.notes && <p className="text-sm bg-muted/30 p-2 rounded">{poDetail.notes}</p>}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {poDetail.items.map(pi => {
                      const inv = invMap.get(pi.inventoryItemId);
                      const receivedRatio = parseFloat(pi.receivedQty || "0") / parseFloat(pi.quantity);
                      return (
                        <TableRow key={pi.id} data-testid={`po-item-${pi.id}`}>
                          <TableCell className="font-medium">{inv?.name || "—"}</TableCell>
                          <TableCell className="text-right">{pi.quantity} {inv?.unit}</TableCell>
                          <TableCell className="text-right">{fmt(pi.unitCost)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(pi.totalCost)}</TableCell>
                          <TableCell className="text-right">
                            {receivedRatio >= 1
                              ? <Badge className="bg-green-100 text-green-700">Complete</Badge>
                              : (
                                <span className={parseFloat(pi.receivedQty || "0") > 0 ? "text-orange-600 font-medium" : ""}>
                                  {pi.receivedQty || "0"} / {pi.quantity}
                                </span>
                              )
                            }
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {poDetail.approvals.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><ClipboardCheck className="h-4 w-4" />Approval History</h4>
                    <div className="space-y-1">
                      {poDetail.approvals.map((a, i) => (
                        <div key={i} className="text-xs flex items-center gap-2 text-muted-foreground">
                          <Badge variant="outline">{a.action}</Badge>
                          <span>{new Date(a.performedAt).toLocaleString()}</span>
                          {a.notes && <span>— {a.notes}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {poDetail.grns.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><Package className="h-4 w-4" />Goods Received Notes</h4>
                    <div className="space-y-1">
                      {poDetail.grns.map(g => (
                        <div key={g.id} className="text-xs flex items-center gap-2 text-muted-foreground">
                          <Badge variant="outline">{g.grnNumber}</Badge>
                          <span>{new Date(g.createdAt).toLocaleString()}</span>
                          {g.notes && <span>— {g.notes}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48" data-testid="select-filter-po-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.keys(STATUS_COLORS).map(s => (
                  <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              {lowStock.length > 0 && (
                <Button variant="outline" onClick={openCreateFromLowStock} data-testid="button-from-lowstock">
                  <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />{lowStock.length} Low Stock
                </Button>
              )}
              <Button onClick={() => { setPoForm({ supplierId: "", notes: "", expectedDelivery: "" }); setPoItems([]); setCreateOpen(true); }} data-testid="button-new-po">
                <Plus className="h-4 w-4 mr-2" />New PO
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingPOs ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO #</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>{t("status")}</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Expected Delivery</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>{t("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(po => (
                      <TableRow key={po.id} data-testid={`row-po-${po.id}`}>
                        <TableCell className="font-semibold" data-testid={`text-po-number-${po.id}`}>{po.poNumber}</TableCell>
                        <TableCell>{supplierMap.get(po.supplierId)?.name || "—"}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[po.status || "draft"] || ""} data-testid={`badge-po-status-${po.id}`}>
                            {(po.status || "draft").replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{fmt(po.totalAmount || "0")}</TableCell>
                        <TableCell>{po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(po.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => setDetailPO(po.id)} data-testid={`button-view-po-${po.id}`}>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                          No purchase orders found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
              {poHasMore && (
                <div className="p-4 border-t">
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setPoLimit(l => l + 50)} data-testid="button-load-more-pos">
                    Load more ({(poPage?.total ?? 0) - purchaseOrders.length} remaining)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Create PO Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier *</Label>
                <Select value={poForm.supplierId} onValueChange={v => setPoForm(f => ({ ...f, supplierId: v }))}>
                  <SelectTrigger data-testid="select-po-supplier"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expected Delivery</Label>
                <Input
                  type="date"
                  value={poForm.expectedDelivery}
                  onChange={e => setPoForm(f => ({ ...f, expectedDelivery: e.target.value }))}
                  data-testid="input-po-expected-delivery"
                />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Input
                  value={poForm.notes}
                  onChange={e => setPoForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Purchase order notes"
                  data-testid="input-po-notes"
                />
              </div>
            </div>

            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-semibold">Line Items</Label>
                <Button size="sm" variant="outline" onClick={addPoItem} data-testid="button-add-po-item">
                  <Plus className="h-3 w-3 mr-1" />Add Item
                </Button>
              </div>
              {poItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end mb-2" data-testid={`po-line-${idx}`}>
                  <div className="col-span-5">
                    <Select
                      value={item.inventoryItemId}
                      onValueChange={v => {
                        updatePoItem(idx, "inventoryItemId", v);
                        const inv = inventoryItems.find(i => i.id === v);
                        if (inv?.costPrice) updatePoItem(idx, "unitCost", inv.costPrice);
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                      <SelectContent>{inventoryItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={e => updatePoItem(idx, "quantity", e.target.value)}
                      data-testid={`input-po-qty-${idx}`}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Cost"
                      value={item.unitCost}
                      onChange={e => updatePoItem(idx, "unitCost", e.target.value)}
                      data-testid={`input-po-cost-${idx}`}
                    />
                  </div>
                  <div className="col-span-2 text-sm font-semibold text-right pt-2">
                    {fmt((parseFloat(item.quantity || "0") * parseFloat(item.unitCost || "0")).toFixed(2))}
                  </div>
                  <div className="col-span-1">
                    <Button variant="ghost" size="sm" onClick={() => removePoItem(idx)} data-testid={`button-remove-po-item-${idx}`}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {poItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Add items to the purchase order</p>
              )}
              {poItems.length > 0 && (
                <div className="text-right font-semibold text-sm mt-2">Total: {fmt(poTotal.toFixed(2))}</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createPOMut.mutate({ ...poForm, items: poItems })}
              disabled={!poForm.supplierId || poItems.length === 0 || createPOMut.isPending}
              data-testid="button-save-po"
            >
              {createPOMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GRN Dialog */}
      <Dialog open={grnOpen} onOpenChange={setGrnOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Goods Receipt Note — {poDetail?.poNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>GRN Notes</Label>
              <Input
                value={grnNotes}
                onChange={e => setGrnNotes(e.target.value)}
                placeholder="Delivery notes, condition remarks, etc."
                data-testid="input-grn-notes"
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead>Batch / Expiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poDetail?.items.map((pi, idx) => {
                  const inv = invMap.get(pi.inventoryItemId);
                  const line = grnLines[idx];
                  if (!line) return null;
                  return (
                    <TableRow key={pi.id} data-testid={`grn-item-${pi.id}`}>
                      <TableCell className="font-medium">
                        {inv?.name || "—"}
                        <span className="text-xs text-muted-foreground ml-1">{inv?.unit}</span>
                      </TableCell>
                      <TableCell className="text-right">{pi.quantity}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          className="w-20 ml-auto text-right"
                          value={line.quantityReceived}
                          onChange={e => {
                            const val = e.target.value;
                            updateGrnLine(idx, "quantityReceived", val);
                            updateGrnLine(idx, "acceptedQty", val);
                          }}
                          data-testid={`input-grn-qty-${pi.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          className="w-20 ml-auto text-right"
                          value={line.acceptedQty}
                          onChange={e => updateGrnLine(idx, "acceptedQty", e.target.value)}
                          data-testid={`input-grn-accepted-${pi.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          className="w-20 ml-auto text-right"
                          value={line.rejectedQty}
                          onChange={e => updateGrnLine(idx, "rejectedQty", e.target.value)}
                          data-testid={`input-grn-rejected-${pi.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          className="w-24 ml-auto text-right"
                          value={line.actualUnitCost}
                          onChange={e => updateGrnLine(idx, "actualUnitCost", e.target.value)}
                          data-testid={`input-grn-cost-${pi.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Input
                            value={line.batchNumber}
                            onChange={e => updateGrnLine(idx, "batchNumber", e.target.value)}
                            placeholder="Batch#"
                            className="w-24"
                            data-testid={`input-grn-batch-${pi.id}`}
                          />
                          <Input
                            type="date"
                            value={line.expiryDate}
                            onChange={e => updateGrnLine(idx, "expiryDate", e.target.value)}
                            className="w-32"
                            data-testid={`input-grn-expiry-${pi.id}`}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Variance warning */}
            {grnLines.some(l => parseFloat(l.rejectedQty) > 0) && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Some items have been rejected. Consider creating a purchase return for rejected items.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrnOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createGRNMut.mutate({ purchaseOrderId: detailPO, notes: grnNotes, items: grnPayloadItems })}
              disabled={createGRNMut.isPending}
              data-testid="button-confirm-grn"
            >
              {createGRNMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Receipt &amp; Update Inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
