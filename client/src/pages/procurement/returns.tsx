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
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, X, ChevronRight } from "lucide-react";
import { selectPageData, type PaginatedResponse } from "@/lib/api-types";

interface Supplier { id: string; name: string; }
interface InventoryItem { id: string; name: string; unit: string | null; costPrice: string | null; }
interface PurchaseReturnItemShape {
  id: string; inventoryItemId: string; returnQty: string; unitPrice: string; reason: string | null; condition: string | null;
}
interface PurchaseReturn {
  id: string; returnNumber: string; supplierId: string; returnType: string;
  recoveryOption: string; status: string | null; totalValue: string | null;
  debitNote: string | null; createdAt: string; items: PurchaseReturnItemShape[];
}

const RETURN_TYPES = ["QUALITY_ISSUE", "WRONG_ITEM", "EXCESS_QUANTITY", "DAMAGED_IN_TRANSIT", "EXPIRED", "PRICE_DISPUTE"];
const RECOVERY_OPTIONS = ["Credit Note", "Replacement Goods", "Cash Refund"];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  approved: "bg-green-100 text-green-700",
  dispatched: "bg-blue-100 text-blue-700",
  acknowledged: "bg-purple-100 text-purple-700",
  closed: "bg-gray-100 text-gray-500",
};

const STATUS_TRANSITIONS: Record<string, string> = {
  draft: "approved",
  approved: "dispatched",
  dispatched: "acknowledged",
  acknowledged: "closed",
};

const EMPTY_FORM = { supplierId: "", returnType: "QUALITY_ISSUE", recoveryOption: "Credit Note" };

interface ReturnItemForm { inventoryItemId: string; returnQty: string; unitPrice: string; reason: string; condition: string; }

const EMPTY_ITEM: ReturnItemForm = { inventoryItemId: "", returnQty: "1", unitPrice: "", reason: "", condition: "damaged" };

export default function ReturnsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [detailReturn, setDetailReturn] = useState<PurchaseReturn | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formItems, setFormItems] = useState<ReturnItemForm[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");

  const fmt = (v: string | number) => {
    const tenant = (user as Record<string, unknown>)?.tenant as Record<string, unknown> | undefined;
    return formatCurrency(v, String(tenant?.currency || "AED"), {
      position: (tenant?.currencyPosition as "before" | "after") || "before",
      decimals: (tenant?.currencyDecimals as number) ?? 2,
    });
  };

  const { data: suppliers = [] } = useQuery<PaginatedResponse<Supplier>, Error, Supplier[]>({ queryKey: ["/api/suppliers"], select: selectPageData });
  const { data: inventoryRes } = useQuery<{ data: InventoryItem[]; total: number }>({ queryKey: ["/api/inventory"] });
  const { data: returns = [], isLoading } = useQuery<PurchaseReturn[]>({ queryKey: ["/api/purchase-returns"] });
  const inventoryItems = inventoryRes?.data ?? [];
  const invMap = new Map(inventoryItems.map(i => [i.id, i]));
  const supMap = new Map(suppliers.map(s => [s.id, s]));

  const onErr = (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/purchase-returns"] });

  const createMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/purchase-returns", d).then(r => r.json()),
    onSuccess: () => { invalidate(); setCreateOpen(false); toast({ title: "Purchase return created" }); },
    onError: onErr,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/purchase-returns/${id}`, d).then(r => r.json()),
    onSuccess: updated => {
      invalidate();
      if (detailReturn?.id === updated.id) setDetailReturn(prev => prev ? { ...prev, ...updated } : null);
      toast({ title: `Return ${updated.status}` });
    },
    onError: onErr,
  });

  const addItem = () => setFormItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx: number) => setFormItems(prev => prev.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: keyof ReturnItemForm, value: string) =>
    setFormItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));

  const totalValue = formItems.reduce(
    (sum, i) => sum + (parseFloat(i.returnQty) || 0) * (parseFloat(i.unitPrice) || 0),
    0
  );

  const handleCreate = () => {
    if (!form.supplierId || formItems.length === 0) return;
    createMut.mutate({ ...form, items: formItems });
  };

  const advanceStatus = (ret: PurchaseReturn) => {
    const next = STATUS_TRANSITIONS[ret.status || "draft"];
    if (!next) return;
    updateMut.mutate({ id: ret.id, d: { status: next } });
  };

  const filtered = returns.filter(r => filterStatus === "all" || r.status === filterStatus);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40" data-testid="select-filter-return-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.keys(STATUS_COLORS).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          onClick={() => { setForm(EMPTY_FORM); setFormItems([]); setCreateOpen(true); }}
          data-testid="button-new-return"
        >
          <Plus className="h-4 w-4 mr-2" />New Return
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No purchase returns found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Debit Note</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id} data-testid={`row-return-${r.id}`}>
                    <TableCell className="font-medium" data-testid={`text-return-number-${r.id}`}>{r.returnNumber}</TableCell>
                    <TableCell>{supMap.get(r.supplierId)?.name || "—"}</TableCell>
                    <TableCell>{r.returnType.replace(/_/g, " ")}</TableCell>
                    <TableCell>{fmt(r.totalValue || "0")}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[r.status || "draft"] || ""} data-testid={`badge-return-status-${r.id}`}>{r.status || "draft"}</Badge>
                    </TableCell>
                    <TableCell>{r.debitNote || "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setDetailReturn(r)} data-testid={`button-view-return-${r.id}`}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Return Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Purchase Return</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier *</Label>
                <Select value={form.supplierId} onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}>
                  <SelectTrigger data-testid="select-return-supplier"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Return Type</Label>
                <Select value={form.returnType} onValueChange={v => setForm(f => ({ ...f, returnType: v }))}>
                  <SelectTrigger data-testid="select-return-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RETURN_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g," ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Recovery Option</Label>
                <Select value={form.recoveryOption} onValueChange={v => setForm(f => ({ ...f, recoveryOption: v }))}>
                  <SelectTrigger data-testid="select-recovery-option"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECOVERY_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="font-semibold">Return Items</Label>
                <Button size="sm" onClick={addItem} data-testid="button-add-return-item">
                  <Plus className="h-3 w-3 mr-1" />Add Item
                </Button>
              </div>
              {formItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-2 mb-2 p-2 border rounded" data-testid={`return-item-${idx}`}>
                  <div className="col-span-2">
                    <Select
                      value={item.inventoryItemId}
                      onValueChange={v => {
                        const inv = invMap.get(v);
                        updateItem(idx, "inventoryItemId", v);
                        if (inv?.costPrice) updateItem(idx, "unitPrice", inv.costPrice);
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Item" /></SelectTrigger>
                      <SelectContent>
                        {inventoryItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number"
                    value={item.returnQty}
                    onChange={e => updateItem(idx, "returnQty", e.target.value)}
                    placeholder="Qty"
                    data-testid={`input-return-qty-${idx}`}
                  />
                  <Input
                    type="number"
                    value={item.unitPrice}
                    onChange={e => updateItem(idx, "unitPrice", e.target.value)}
                    placeholder="Price"
                    data-testid={`input-return-price-${idx}`}
                  />
                  <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} data-testid={`button-remove-return-item-${idx}`}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {formItems.length > 0 && (
                <div className="text-right font-semibold text-sm mt-2">Total: {fmt(totalValue)}</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!form.supplierId || formItems.length === 0 || createMut.isPending}
              data-testid="button-submit-return"
            >
              {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Detail Dialog */}
      <Dialog open={!!detailReturn} onOpenChange={open => { if (!open) setDetailReturn(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Return Detail — {detailReturn?.returnNumber}</DialogTitle>
          </DialogHeader>
          {detailReturn && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Supplier:</span> {supMap.get(detailReturn.supplierId)?.name}</div>
                <div><span className="text-muted-foreground">Type:</span> {detailReturn.returnType.replace(/_/g, " ")}</div>
                <div><span className="text-muted-foreground">Recovery:</span> {detailReturn.recoveryOption}</div>
                <div><span className="text-muted-foreground">Total Value:</span> {fmt(detailReturn.totalValue || "0")}</div>
                {detailReturn.debitNote && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Debit Note: </span>
                    <span className="font-semibold">{detailReturn.debitNote}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge className={STATUS_COLORS[detailReturn.status || "draft"] || ""} data-testid="badge-detail-return-status">
                  {detailReturn.status || "draft"}
                </Badge>
                {STATUS_TRANSITIONS[detailReturn.status || "draft"] && (
                  <Button
                    size="sm"
                    onClick={() => advanceStatus(detailReturn)}
                    disabled={updateMut.isPending}
                    data-testid="button-advance-return-status"
                  >
                    {updateMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Mark as {STATUS_TRANSITIONS[detailReturn.status || "draft"]}
                  </Button>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailReturn.items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{invMap.get(item.inventoryItemId)?.name || item.inventoryItemId}</TableCell>
                      <TableCell>{item.returnQty}</TableCell>
                      <TableCell>{fmt(item.unitPrice)}</TableCell>
                      <TableCell>{fmt((parseFloat(item.returnQty) * parseFloat(item.unitPrice)).toFixed(2))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailReturn(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
