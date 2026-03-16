import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart, Plus, FileText, Package, CheckCircle, Send, TrendingUp, AlertTriangle, BarChart3, DollarSign, ClipboardCheck } from "lucide-react";

interface Supplier { id: string; name: string; }
interface InventoryItem { id: string; name: string; sku: string | null; unit: string | null; currentStock: string | null; reorderLevel: string | null; parLevel: string | null; costPrice: string | null; }
interface PurchaseOrder { id: string; tenantId: string; outletId: string | null; supplierId: string; poNumber: string; status: string | null; totalAmount: string | null; notes: string | null; expectedDelivery: string | null; createdBy: string | null; approvedBy: string | null; approvedAt: string | null; createdAt: string; }
interface POItem { id: string; purchaseOrderId: string; inventoryItemId: string; catalogItemId: string | null; quantity: string; unitCost: string; totalCost: string; receivedQty: string | null; }
interface GRN { id: string; tenantId: string; purchaseOrderId: string; grnNumber: string; receivedBy: string | null; notes: string | null; createdAt: string; }
interface LowStockItem extends InventoryItem { suggestedQty: string; }
interface Analytics { totalSpend: string; totalPOs: number; closedPOs: number; activePOs: number; supplierCount: number; spendBySupplier: Array<{ name: string; total: number; count: number }>; spendByItem: Array<{ name: string; total: number; count: number }>; topVariances: Array<{ itemName: string; expected: number; actual: number; variance: number }>; }
interface PODetail extends PurchaseOrder { items: POItem[]; grns: GRN[]; approvals: Array<{ action: string; performedBy: string; performedAt: string; notes: string | null }>; }

export default function ProcurementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("orders");
  const [poDialog, setPoDialog] = useState(false);
  const [grnDialog, setGrnDialog] = useState(false);
  const [detailPO, setDetailPO] = useState<string | null>(null);
  const [poForm, setPoForm] = useState({ supplierId: "", notes: "", expectedDelivery: "" });
  const [poItems, setPoItems] = useState<Array<{ inventoryItemId: string; quantity: string; unitCost: string }>>([]);

  const fmt = (amount: string | number) => {
    if (!user) return String(amount);
    const u = user as unknown as Record<string, unknown>;
    const tenant = (u.tenant || {}) as Record<string, unknown>;
    const pos = String(tenant.currencyPosition || "before");
    return sharedFormatCurrency(amount, String(tenant.currency || "USD"), { position: pos as "before" | "after", decimals: parseInt(String(tenant.currencyDecimals ?? "2")) });
  };

  const { data: suppliersList = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({ queryKey: ["/api/inventory"] });
  const { data: purchaseOrders = [] } = useQuery<PurchaseOrder[]>({ queryKey: ["/api/purchase-orders"] });
  const { data: lowStock = [] } = useQuery<LowStockItem[]>({ queryKey: ["/api/procurement/low-stock"] });
  const { data: analytics } = useQuery<Analytics>({ queryKey: ["/api/procurement/analytics"] });
  const { data: poDetail } = useQuery<PODetail>({
    queryKey: ["/api/purchase-orders", detailPO],
    queryFn: () => detailPO ? apiRequest("GET", `/api/purchase-orders/${detailPO}`).then(r => r.json()) : Promise.resolve(null),
    enabled: !!detailPO,
  });

  const onErr = (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" });
  const invAll = () => { queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] }); queryClient.invalidateQueries({ queryKey: ["/api/procurement/analytics"] }); };

  const createPOMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/purchase-orders", data).then(r => r.json()),
    onSuccess: () => { invAll(); setPoDialog(false); toast({ title: "Purchase Order created" }); },
    onError: onErr,
  });
  const approveMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/purchase-orders/${id}/approve`).then(r => r.json()),
    onSuccess: () => { invAll(); queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", detailPO] }); toast({ title: "PO approved" }); },
    onError: onErr,
  });
  const sendMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/purchase-orders/${id}/send`).then(r => r.json()),
    onSuccess: () => { invAll(); queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", detailPO] }); toast({ title: "PO sent to supplier" }); },
    onError: onErr,
  });

  const [grnItems, setGrnItems] = useState<Array<{ purchaseOrderItemId: string; quantityReceived: string; actualUnitCost: string }>>([]);
  const [grnNotes, setGrnNotes] = useState("");
  const createGRNMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/grns", data).then(r => r.json()),
    onSuccess: () => {
      invAll();
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", detailPO] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/procurement/low-stock"] });
      setGrnDialog(false);
      toast({ title: "Goods received and inventory updated" });
    },
    onError: onErr,
  });

  const invMap = new Map(inventoryItems.map(i => [i.id, i]));
  const supplierMap = new Map(suppliersList.map(s => [s.id, s]));

  const statusColor = (s: string | null) => {
    switch (s) {
      case "draft": return "bg-gray-100 text-gray-700";
      case "approved": return "bg-blue-100 text-blue-700";
      case "sent": return "bg-yellow-100 text-yellow-700";
      case "partially_received": return "bg-orange-100 text-orange-700";
      case "closed": return "bg-green-100 text-green-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const addPoItem = () => setPoItems([...poItems, { inventoryItemId: "", quantity: "1", unitCost: "0" }]);
  const updatePoItem = (idx: number, field: string, value: string) => {
    const items = [...poItems];
    (items[idx] as Record<string, string>)[field] = value;
    setPoItems(items);
  };
  const removePoItem = (idx: number) => setPoItems(poItems.filter((_, i) => i !== idx));

  const openCreateFromLowStock = () => {
    const items = lowStock.map(ls => ({
      inventoryItemId: ls.id,
      quantity: ls.suggestedQty,
      unitCost: ls.costPrice || "0",
    }));
    setPoItems(items);
    setPoForm({ supplierId: "", notes: "Auto-generated from low stock alerts", expectedDelivery: "" });
    setPoDialog(true);
  };

  const openGRN = () => {
    if (!poDetail) return;
    setGrnItems(poDetail.items.map(pi => ({
      purchaseOrderItemId: pi.id,
      quantityReceived: (parseFloat(pi.quantity) - parseFloat(pi.receivedQty || "0")).toFixed(2),
      actualUnitCost: pi.unitCost,
    })));
    setGrnNotes("");
    setGrnDialog(true);
  };

  const poTotal = useMemo(() => poItems.reduce((sum, i) => sum + parseFloat(i.quantity || "0") * parseFloat(i.unitCost || "0"), 0), [poItems]);

  return (
    <div className="p-6 space-y-6" data-testid="procurement-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Procurement</h1>
            <p className="text-sm text-muted-foreground">Purchase orders, goods received, and analytics</p>
          </div>
        </div>
        <div className="flex gap-2">
          {lowStock.length > 0 && (
            <Button variant="outline" onClick={openCreateFromLowStock} data-testid="button-create-from-lowstock">
              <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />{lowStock.length} Low Stock
            </Button>
          )}
          <Button onClick={() => { setPoForm({ supplierId: "", notes: "", expectedDelivery: "" }); setPoItems([]); setPoDialog(true); }} data-testid="button-create-po"><Plus className="h-4 w-4 mr-2" />New PO</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="orders" data-testid="tab-orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="grns" data-testid="tab-grns">Goods Received</TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4 mt-4">
          {detailPO && poDetail ? (
            <Card data-testid="po-detail">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5" />{poDetail.poNumber}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">Supplier: {supplierMap.get(poDetail.supplierId)?.name || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColor(poDetail.status)}>{(poDetail.status || "draft").replace("_", " ")}</Badge>
                    {poDetail.status === "draft" && (
                      <Button size="sm" onClick={() => approveMut.mutate(poDetail.id)} data-testid="button-approve-po"><CheckCircle className="h-4 w-4 mr-1" />Approve</Button>
                    )}
                    {poDetail.status === "approved" && (
                      <Button size="sm" variant="outline" onClick={() => sendMut.mutate(poDetail.id)} data-testid="button-send-po"><Send className="h-4 w-4 mr-1" />Send</Button>
                    )}
                    {poDetail.status === "sent" || poDetail.status === "partially_received" ? (
                      <Button size="sm" onClick={openGRN} data-testid="button-receive-goods"><Package className="h-4 w-4 mr-1" />Receive Goods</Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => setDetailPO(null)}>Back</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Total:</span> <span className="font-semibold">{fmt(poDetail.totalAmount || "0")}</span></div>
                  <div><span className="text-muted-foreground">Expected:</span> {poDetail.expectedDelivery ? new Date(poDetail.expectedDelivery).toLocaleDateString() : "—"}</div>
                  <div><span className="text-muted-foreground">Created:</span> {new Date(poDetail.createdAt).toLocaleDateString()}</div>
                </div>
                {poDetail.notes && <p className="text-sm bg-muted/30 p-2 rounded">{poDetail.notes}</p>}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {poDetail.items.map(pi => {
                      const inv = invMap.get(pi.inventoryItemId);
                      const fullyReceived = parseFloat(pi.receivedQty || "0") >= parseFloat(pi.quantity);
                      return (
                        <TableRow key={pi.id} data-testid={`po-item-${pi.id}`}>
                          <TableCell className="font-medium">{inv?.name || "—"}</TableCell>
                          <TableCell className="text-right">{pi.quantity}</TableCell>
                          <TableCell className="text-right">{fmt(pi.unitCost)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(pi.totalCost)}</TableCell>
                          <TableCell className="text-right">{fullyReceived ? <Badge className="bg-green-100 text-green-700">Complete</Badge> : `${pi.receivedQty || "0"} / ${pi.quantity}`}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {poDetail.approvals.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><ClipboardCheck className="h-4 w-4" />Approval Log</h4>
                    <div className="space-y-1">
                      {poDetail.approvals.map((a, i) => (
                        <div key={i} className="text-xs flex items-center gap-2 text-muted-foreground">
                          <Badge variant="outline" className="text-xs">{a.action}</Badge>
                          <span>{new Date(a.performedAt).toLocaleString()}</span>
                          {a.notes && <span>— {a.notes}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {poDetail.grns.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><Package className="h-4 w-4" />GRN History</h4>
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.map(po => (
                  <TableRow key={po.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailPO(po.id)} data-testid={`po-row-${po.id}`}>
                    <TableCell className="font-semibold">{po.poNumber}</TableCell>
                    <TableCell>{supplierMap.get(po.supplierId)?.name || "—"}</TableCell>
                    <TableCell><Badge className={statusColor(po.status)}>{(po.status || "draft").replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">{fmt(po.totalAmount || "0")}</TableCell>
                    <TableCell>{po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(po.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {purchaseOrders.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No purchase orders yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="grns" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Package className="h-5 w-5" />Low Stock Alerts</CardTitle></CardHeader>
            <CardContent>
              {lowStock.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Reorder Level</TableHead>
                      <TableHead className="text-right">Par Level</TableHead>
                      <TableHead className="text-right">Suggested Order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStock.map(ls => (
                      <TableRow key={ls.id} data-testid={`lowstock-row-${ls.id}`}>
                        <TableCell className="font-medium">{ls.name}</TableCell>
                        <TableCell className="text-right"><span className="text-red-500 font-semibold">{ls.currentStock}</span> {ls.unit}</TableCell>
                        <TableCell className="text-right">{ls.reorderLevel} {ls.unit}</TableCell>
                        <TableCell className="text-right">{ls.parLevel || "—"} {ls.unit}</TableCell>
                        <TableCell className="text-right font-semibold">{ls.suggestedQty} {ls.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-4">All items are above reorder levels</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6 mt-4">
          {analytics && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Spend</p><p className="text-xl font-bold" data-testid="text-total-spend">{fmt(analytics.totalSpend)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total POs</p><p className="text-xl font-bold" data-testid="text-total-pos">{analytics.totalPOs}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active POs</p><p className="text-xl font-bold" data-testid="text-active-pos">{analytics.activePOs}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Suppliers</p><p className="text-xl font-bold" data-testid="text-supplier-count">{analytics.supplierCount}</p></CardContent></Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><DollarSign className="h-5 w-5" />Spend by Supplier</CardTitle></CardHeader>
                  <CardContent>
                    {analytics.spendBySupplier.length > 0 ? (
                      <div className="space-y-3">
                        {analytics.spendBySupplier.map((s, i) => {
                          const max = analytics.spendBySupplier[0]?.total || 1;
                          return (
                            <div key={i} data-testid={`spend-supplier-${i}`}>
                              <div className="flex justify-between text-sm mb-1"><span>{s.name}</span><span className="font-semibold">{fmt(s.total.toFixed(2))}</span></div>
                              <div className="w-full bg-muted rounded-full h-2"><div className="bg-primary rounded-full h-2" style={{ width: `${(s.total / max) * 100}%` }} /></div>
                            </div>
                          );
                        })}
                      </div>
                    ) : <p className="text-center text-muted-foreground py-4">No spend data yet</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5" />Top Items by Spend</CardTitle></CardHeader>
                  <CardContent>
                    {analytics.spendByItem.length > 0 ? (
                      <div className="space-y-3">
                        {analytics.spendByItem.slice(0, 10).map((s, i) => {
                          const max = analytics.spendByItem[0]?.total || 1;
                          return (
                            <div key={i} data-testid={`spend-item-${i}`}>
                              <div className="flex justify-between text-sm mb-1"><span>{s.name}</span><span className="font-semibold">{fmt(s.total.toFixed(2))}</span></div>
                              <div className="w-full bg-muted rounded-full h-2"><div className="bg-blue-500 rounded-full h-2" style={{ width: `${(s.total / max) * 100}%` }} /></div>
                            </div>
                          );
                        })}
                      </div>
                    ) : <p className="text-center text-muted-foreground py-4">No item data yet</p>}
                  </CardContent>
                </Card>
              </div>

              {analytics.topVariances.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5" />Price Variances</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Expected</TableHead>
                          <TableHead className="text-right">Actual</TableHead>
                          <TableHead className="text-right">Variance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.topVariances.map((v, i) => (
                          <TableRow key={i} data-testid={`variance-row-${i}`}>
                            <TableCell className="font-medium">{v.itemName}</TableCell>
                            <TableCell className="text-right">{fmt(v.expected.toFixed(2))}</TableCell>
                            <TableCell className="text-right">{fmt(v.actual.toFixed(2))}</TableCell>
                            <TableCell className={`text-right font-semibold ${v.variance > 0 ? "text-red-500" : "text-green-500"}`}>{v.variance > 0 ? "+" : ""}{fmt(v.variance.toFixed(2))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={poDialog} onOpenChange={setPoDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier *</Label>
                <Select value={poForm.supplierId} onValueChange={v => setPoForm({ ...poForm, supplierId: v })}>
                  <SelectTrigger data-testid="select-po-supplier"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliersList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Expected Delivery</Label><Input type="date" value={poForm.expectedDelivery} onChange={e => setPoForm({ ...poForm, expectedDelivery: e.target.value })} data-testid="input-expected-delivery" /></div>
            </div>
            <div><Label>Notes</Label><Input value={poForm.notes} onChange={e => setPoForm({ ...poForm, notes: e.target.value })} data-testid="input-po-notes" /></div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Line Items</Label>
                <Button type="button" size="sm" variant="outline" onClick={addPoItem} data-testid="button-add-po-item"><Plus className="h-3 w-3 mr-1" />Add Item</Button>
              </div>
              <div className="space-y-2">
                {poItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end" data-testid={`po-line-${idx}`}>
                    <div className="col-span-5">
                      <Select value={item.inventoryItemId} onValueChange={v => {
                        updatePoItem(idx, "inventoryItemId", v);
                        const inv = inventoryItems.find(i => i.id === v);
                        if (inv?.costPrice) updatePoItem(idx, "unitCost", inv.costPrice);
                      }}>
                        <SelectTrigger><SelectValue placeholder="Item" /></SelectTrigger>
                        <SelectContent>{inventoryItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2"><Input type="number" placeholder="Qty" value={item.quantity} onChange={e => updatePoItem(idx, "quantity", e.target.value)} /></div>
                    <div className="col-span-2"><Input type="number" step="0.01" placeholder="Cost" value={item.unitCost} onChange={e => updatePoItem(idx, "unitCost", e.target.value)} /></div>
                    <div className="col-span-2 text-sm font-semibold text-right pt-2">{fmt((parseFloat(item.quantity || "0") * parseFloat(item.unitCost || "0")).toFixed(2))}</div>
                    <div className="col-span-1"><Button variant="ghost" size="sm" className="text-red-500" onClick={() => removePoItem(idx)}>×</Button></div>
                  </div>
                ))}
              </div>
              {poItems.length > 0 && (
                <div className="text-right mt-2 font-semibold">Total: {fmt(poTotal.toFixed(2))}</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPoDialog(false)}>Cancel</Button>
            <Button onClick={() => createPOMut.mutate({ ...poForm, items: poItems })} disabled={!poForm.supplierId || poItems.length === 0} data-testid="button-save-po">Create PO</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={grnDialog} onOpenChange={setGrnDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Receive Goods — {poDetail?.poNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Notes</Label><Input value={grnNotes} onChange={e => setGrnNotes(e.target.value)} data-testid="input-grn-notes" /></div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Already Received</TableHead>
                  <TableHead className="text-right">Receiving Now</TableHead>
                  <TableHead className="text-right">Actual Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poDetail?.items.map((pi, idx) => {
                  const inv = invMap.get(pi.inventoryItemId);
                  const gi = grnItems[idx];
                  return (
                    <TableRow key={pi.id}>
                      <TableCell className="font-medium">{inv?.name || "—"}</TableCell>
                      <TableCell className="text-right">{pi.quantity}</TableCell>
                      <TableCell className="text-right">{pi.receivedQty || "0"}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" step="0.01" className="w-24 ml-auto" value={gi?.quantityReceived || "0"} onChange={e => {
                          const items = [...grnItems]; items[idx] = { ...items[idx], quantityReceived: e.target.value }; setGrnItems(items);
                        }} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" step="0.01" className="w-24 ml-auto" value={gi?.actualUnitCost || "0"} onChange={e => {
                          const items = [...grnItems]; items[idx] = { ...items[idx], actualUnitCost: e.target.value }; setGrnItems(items);
                        }} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrnDialog(false)}>Cancel</Button>
            <Button onClick={() => createGRNMut.mutate({ purchaseOrderId: detailPO, notes: grnNotes, items: grnItems })} data-testid="button-save-grn">Receive & Update Inventory</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
