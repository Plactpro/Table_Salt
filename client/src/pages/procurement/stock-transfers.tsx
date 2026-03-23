import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableRow, TableHead, TableHeader } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, X, Truck, ArrowRight, AlertTriangle } from "lucide-react";

interface InventoryItem { id: string; name: string; unit: string | null; currentStock: string | null; }
interface Outlet { id: string; name: string; }

interface TransferItemShape {
  id: string; inventoryItemId: string; requestedQty: string; actualQty: string | null; notes: string | null;
}
interface StockTransfer {
  id: string; transferNumber: string; fromOutletId: string | null; toOutletId: string | null;
  status: string | null; driverName: string | null; vehicleNumber: string | null;
  estimatedArrival: string | null; dispatchedAt: string | null; createdAt: string;
  items: TransferItemShape[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  in_transit: "bg-blue-100 text-blue-700",
  received: "bg-green-100 text-green-800",
  partially_received: "bg-orange-100 text-orange-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_TRANSITIONS: Record<string, string> = {
  pending: "approved",
  approved: "in_transit",
  in_transit: "received",
};

interface TransferItemForm { inventoryItemId: string; requestedQty: string; }

export default function StockTransfersTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [selected, setSelected] = useState<StockTransfer | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const [form, setForm] = useState({ fromOutletId: "", toOutletId: "", driverName: "", vehicleNumber: "", estimatedArrival: "" });
  const [formItems, setFormItems] = useState<TransferItemForm[]>([]);
  const [receiveLines, setReceiveLines] = useState<Array<{ inventoryItemId: string; actualQty: string }>>([]);

  const { data: inventoryRes } = useQuery<{ data: InventoryItem[]; total: number }>({ queryKey: ["/api/inventory"] });
  const inventoryItems = inventoryRes?.data ?? [];
  const invMap = new Map(inventoryItems.map(i => [i.id, i]));

  const { data: outletsRes } = useQuery<{ data: Outlet[] } | Outlet[]>({ queryKey: ["/api/outlets"] });
  const outlets: Outlet[] = Array.isArray(outletsRes) ? outletsRes : ((outletsRes as { data: Outlet[] } | undefined)?.data ?? []);
  const outletMap = new Map(outlets.map(o => [o.id, o]));

  const { data: transfers = [], isLoading } = useQuery<StockTransfer[]>({ queryKey: ["/api/stock-transfers"] });

  const onErr = (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/stock-transfers"] });

  const createMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/stock-transfers", d).then(r => r.json()),
    onSuccess: () => { invalidate(); setCreateOpen(false); toast({ title: "Transfer created" }); },
    onError: onErr,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/stock-transfers/${id}`, d).then(r => r.json()),
    onSuccess: () => { invalidate(); setReceiveOpen(false); toast({ title: "Transfer updated" }); },
    onError: onErr,
  });

  const addItem = () => setFormItems(prev => [...prev, { inventoryItemId: "", requestedQty: "1" }]);
  const removeItem = (idx: number) => setFormItems(prev => prev.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: keyof TransferItemForm, value: string) =>
    setFormItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));

  const handleCreate = () => {
    if (!form.fromOutletId || !form.toOutletId) {
      toast({ title: "Error", description: "Select both source and destination outlets", variant: "destructive" });
      return;
    }
    if (form.fromOutletId === form.toOutletId) {
      toast({ title: "Error", description: "Source and destination must be different outlets", variant: "destructive" });
      return;
    }
    if (formItems.length === 0) {
      toast({ title: "Error", description: "Add at least one item", variant: "destructive" });
      return;
    }
    createMut.mutate({ ...form, items: formItems });
  };

  const advanceStatus = (tr: StockTransfer) => {
    const next = STATUS_TRANSITIONS[tr.status || "pending"];
    if (!next) return;
    if (next === "received") {
      setSelected(tr);
      setReceiveLines(tr.items.map(i => ({ inventoryItemId: i.inventoryItemId, actualQty: i.requestedQty })));
      setReceiveOpen(true);
      return;
    }
    updateMut.mutate({ id: tr.id, d: { status: next } });
  };

  const confirmReceipt = () => {
    if (!selected) return;
    const hasVariance = receiveLines.some((rl, idx) => {
      const orig = selected.items[idx];
      return parseFloat(rl.actualQty) !== parseFloat(orig?.requestedQty || "0");
    });
    const status = hasVariance ? "partially_received" : "received";
    updateMut.mutate({ id: selected.id, d: { status, receiveLines } });
  };

  const filtered = transfers.filter(t => filterStatus === "all" || t.status === filterStatus);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44" data-testid="select-filter-transfer-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.keys(STATUS_COLORS).map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          onClick={() => {
            setForm({ fromOutletId: "", toOutletId: "", driverName: "", vehicleNumber: "", estimatedArrival: "" });
            setFormItems([]);
            setCreateOpen(true);
          }}
          data-testid="button-new-transfer"
        >
          <Plus className="h-4 w-4 mr-2" />New Transfer
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No stock transfers found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transfer #</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(t => (
                  <TableRow key={t.id} data-testid={`row-transfer-${t.id}`}>
                    <TableCell className="font-medium" data-testid={`text-transfer-number-${t.id}`}>
                      <div className="flex items-center gap-1">
                        <Truck className="h-3 w-3 text-muted-foreground" />
                        {t.transferNumber}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        {outletMap.get(t.fromOutletId || "")?.name || t.fromOutletId || "—"}
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        {outletMap.get(t.toOutletId || "")?.name || t.toOutletId || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[t.status || "pending"] || ""} data-testid={`badge-transfer-status-${t.id}`}>
                        {(t.status || "pending").replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{t.items.length}</TableCell>
                    <TableCell>{t.driverName || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {STATUS_TRANSITIONS[t.status || "pending"] && (
                        <Button size="sm" variant="outline" onClick={() => advanceStatus(t)} disabled={updateMut.isPending} data-testid={`button-advance-transfer-${t.id}`}>
                          {updateMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : (STATUS_TRANSITIONS[t.status || ""] === "in_transit" ? <Truck className="h-3 w-3 mr-1" /> : null)}
                          Mark {STATUS_TRANSITIONS[t.status || ""].replace(/_/g, " ")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Transfer Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Stock Transfer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From Outlet *</Label>
                <Select value={form.fromOutletId} onValueChange={v => setForm(f => ({ ...f, fromOutletId: v }))}>
                  <SelectTrigger data-testid="select-from-outlet"><SelectValue placeholder="Source outlet" /></SelectTrigger>
                  <SelectContent>{outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>To Outlet *</Label>
                <Select value={form.toOutletId} onValueChange={v => setForm(f => ({ ...f, toOutletId: v }))}>
                  <SelectTrigger data-testid="select-to-outlet"><SelectValue placeholder="Destination outlet" /></SelectTrigger>
                  <SelectContent>{outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Driver Name</Label>
                <Input value={form.driverName} onChange={e => setForm(f => ({ ...f, driverName: e.target.value }))} placeholder="Driver name" data-testid="input-driver-name" />
              </div>
              <div>
                <Label>Vehicle Number</Label>
                <Input value={form.vehicleNumber} onChange={e => setForm(f => ({ ...f, vehicleNumber: e.target.value }))} placeholder="Vehicle no." data-testid="input-vehicle-number" />
              </div>
              <div>
                <Label>Estimated Arrival</Label>
                <Input type="date" value={form.estimatedArrival} onChange={e => setForm(f => ({ ...f, estimatedArrival: e.target.value }))} data-testid="input-estimated-arrival" />
              </div>
            </div>

            <Separator />
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="font-semibold">Items to Transfer</Label>
                <Button size="sm" onClick={addItem} data-testid="button-add-transfer-item">
                  <Plus className="h-3 w-3 mr-1" />Add Item
                </Button>
              </div>
              {formItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-2 mb-2 p-2 border rounded" data-testid={`transfer-item-${idx}`}>
                  <div className="col-span-3">
                    <Select value={item.inventoryItemId} onValueChange={v => updateItem(idx, "inventoryItemId", v)}>
                      <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                      <SelectContent>
                        {inventoryItems.map(i => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name} {i.currentStock ? `(${i.currentStock} ${i.unit})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number"
                    value={item.requestedQty}
                    onChange={e => updateItem(idx, "requestedQty", e.target.value)}
                    placeholder="Qty"
                    data-testid={`input-transfer-qty-${idx}`}
                  />
                  <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} data-testid={`button-remove-transfer-item-${idx}`}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {formItems.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No items added</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!form.fromOutletId || !form.toOutletId || formItems.length === 0 || createMut.isPending}
              data-testid="button-submit-transfer"
            >
              {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive / Variance Dialog */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Confirm Receipt — {selected?.transferNumber}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Record actual quantities received. Discrepancies will be noted as variance.</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Dispatched</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receiveLines.map((rl, idx) => {
                  const origItem = selected?.items[idx];
                  const dispatched = parseFloat(origItem?.requestedQty || "0");
                  const received = parseFloat(rl.actualQty || "0");
                  const variance = received - dispatched;
                  return (
                    <TableRow key={idx} data-testid={`receive-line-${idx}`}>
                      <TableCell>{invMap.get(rl.inventoryItemId)?.name || rl.inventoryItemId}</TableCell>
                      <TableCell className="text-right">{dispatched}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          className="w-20 ml-auto text-right"
                          value={rl.actualQty}
                          onChange={e => setReceiveLines(prev => prev.map((l, i) => i === idx ? { ...l, actualQty: e.target.value } : l))}
                          data-testid={`input-received-qty-${idx}`}
                        />
                      </TableCell>
                      <TableCell className={`text-right font-medium ${variance < 0 ? "text-red-600" : variance > 0 ? "text-amber-600" : "text-green-600"}`}>
                        {variance > 0 ? "+" : ""}{variance.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {receiveLines.some((rl, idx) => {
              const orig = selected?.items[idx];
              return parseFloat(rl.actualQty) !== parseFloat(orig?.requestedQty || "0");
            }) && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Variance detected. This will be recorded as partially received.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)}>Cancel</Button>
            <Button onClick={confirmReceipt} disabled={updateMut.isPending} data-testid="button-confirm-receipt">
              {updateMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
