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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, AlertTriangle, ClipboardCheck } from "lucide-react";

interface InventoryItem { id: string; name: string; unit: string | null; currentStock: string | null; }
interface Outlet { id: string; name: string; }

interface StockCountItemShape {
  id: string; inventoryItemId: string; systemQty: string; physicalQty: string | null; counted: boolean | null;
}
interface StockCountSession {
  id: string; countNumber: string; countType: string; outletId: string | null;
  status: string | null; scheduledDate: string; startedAt: string | null;
  completedAt: string | null; approvedAt: string | null; reason: string | null; createdAt: string;
  items: StockCountItemShape[];
}

interface DamagedInventory {
  id: string; damageNumber: string; inventoryItemId: string; damagedQty: string;
  unitCost: string; totalValue: string; damageType: string; damageCause: string | null;
  damageDate: string; damageLocation: string | null; disposalMethod: string;
  status: string | null; createdAt: string;
}

const COUNT_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700",
};

const DAMAGE_STATUS_COLORS: Record<string, string> = {
  reported: "bg-yellow-100 text-yellow-700",
  under_review: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  disposed: "bg-gray-100 text-gray-600",
  written_off: "bg-red-100 text-red-700",
};

const DAMAGE_TYPES = ["SPOILAGE", "BREAKAGE", "CONTAMINATION", "EXPIRY", "THEFT", "PEST_DAMAGE", "WATER_DAMAGE", "FIRE_DAMAGE", "OTHER"];
const DISPOSAL_METHODS = ["DISCARDED", "RETURNED_TO_SUPPLIER", "DONATED", "COMPOSTED", "INCINERATED"];
const COUNT_TYPES = ["Full", "Partial", "Spot", "Cycle"];

export default function StockCountTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState("counts");
  const [createCountOpen, setCreateCountOpen] = useState(false);
  const [countingOpen, setCountingOpen] = useState(false);
  const [createDamageOpen, setCreateDamageOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<StockCountSession | null>(null);

  const [countForm, setCountForm] = useState({ countType: "Full", scheduledDate: new Date().toISOString().slice(0, 10), outletId: "", reason: "" });
  const [damageForm, setDamageForm] = useState({
    inventoryItemId: "", damagedQty: "", unitCost: "", damageType: "SPOILAGE",
    damageCause: "", damageDate: new Date().toISOString().slice(0, 10),
    damageLocation: "", disposalMethod: "DISCARDED", notes: "",
    insuranceClaimNo: "", insuranceAmount: "",
  });

  const fmt = (v: string | number) => {
    const tenant = (user as Record<string, unknown>)?.tenant as Record<string, unknown> | undefined;
    return formatCurrency(v, String(tenant?.currency || "AED"), {
      position: (tenant?.currencyPosition as "before" | "after") || "before",
      decimals: (tenant?.currencyDecimals as number) ?? 2,
    });
  };

  const { data: inventoryRes } = useQuery<{ data: InventoryItem[]; total: number }>({ queryKey: ["/api/inventory"] });
  const inventoryItems = inventoryRes?.data ?? [];
  const invMap = new Map(inventoryItems.map(i => [i.id, i]));
  const { data: outletsRes } = useQuery<{ data: Outlet[] } | Outlet[]>({ queryKey: ["/api/outlets"] });
  const outlets: Outlet[] = Array.isArray(outletsRes) ? outletsRes : ((outletsRes as { data: Outlet[] } | undefined)?.data ?? []);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<StockCountSession[]>({ queryKey: ["/api/stock-counts"] });
  const { data: damaged = [], isLoading: damagedLoading } = useQuery<DamagedInventory[]>({ queryKey: ["/api/damaged-inventory"] });

  const onErr = (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" });

  const createCountMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/stock-counts", d).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/stock-counts"] }); setCreateCountOpen(false); toast({ title: "Count session created" }); },
    onError: onErr,
  });

  const updateCountMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/stock-counts/${id}`, d).then(r => r.json()),
    onSuccess: (updated: StockCountSession) => {
      qc.invalidateQueries({ queryKey: ["/api/stock-counts"] });
      if (selectedSession?.id === updated.id) setSelectedSession(prev => prev ? { ...prev, ...updated } : null);
    },
    onError: onErr,
  });

  const updateCountItemMut = useMutation({
    mutationFn: ({ sessionId, itemId, d }: { sessionId: string; itemId: string; d: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/stock-counts/${sessionId}/items/${itemId}`, d).then(r => r.json()),
    onSuccess: (updatedItem: StockCountItemShape) => {
      setSelectedSession(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(i => i.id === updatedItem.id ? { ...i, ...updatedItem } : i),
        };
      });
      qc.invalidateQueries({ queryKey: ["/api/stock-counts"] });
    },
    onError: onErr,
  });

  const approveCountMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/stock-counts/${id}/approve`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stock-counts"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      setCountingOpen(false);
      toast({ title: "Stock count approved & inventory adjusted" });
    },
    onError: onErr,
  });

  const createDamageMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/damaged-inventory", d).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/damaged-inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      setCreateDamageOpen(false);
      toast({ title: "Damage recorded & inventory deducted" });
    },
    onError: onErr,
  });

  const openCounting = (s: StockCountSession) => {
    setSelectedSession(s);
    setCountingOpen(true);
    if (s.status === "scheduled") {
      updateCountMut.mutate({ id: s.id, d: { status: "in_progress", startedAt: new Date().toISOString() } });
    }
  };

  const updateItem = (item: StockCountItemShape, physicalQty: string) => {
    if (!selectedSession) return;
    updateCountItemMut.mutate({ sessionId: selectedSession.id, itemId: item.id, d: { physicalQty, counted: true } });
  };

  const completeCount = () => {
    if (!selectedSession) return;
    updateCountMut.mutate({ id: selectedSession.id, d: { status: "completed", completedAt: new Date().toISOString() } });
  };

  const totalDamageValue = (parseFloat(damageForm.damagedQty || "0") * parseFloat(damageForm.unitCost || "0"));

  const countedItems = selectedSession?.items.filter(i => i.counted).length ?? 0;
  const totalItems = selectedSession?.items.length ?? 0;
  const variance = selectedSession?.items.filter(i => i.counted && i.physicalQty !== null && Math.abs(parseFloat(i.physicalQty) - parseFloat(i.systemQty)) > 0.001).length ?? 0;

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="counts" data-testid="tab-stock-counts">Stock Count ({sessions.length})</TabsTrigger>
          <TabsTrigger value="damaged" data-testid="tab-damaged">Damaged Goods ({damaged.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="counts" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setCountForm({ countType: "Full", scheduledDate: new Date().toISOString().slice(0, 10), outletId: "", reason: "" }); setCreateCountOpen(true); }} data-testid="button-new-count">
              <Plus className="h-4 w-4 mr-2" />New Count Session
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {sessionsLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : sessions.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">No stock count sessions yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Count #</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map(s => {
                      const counted = s.items.filter(i => i.counted).length;
                      return (
                        <TableRow key={s.id} data-testid={`row-count-${s.id}`}>
                          <TableCell className="font-medium" data-testid={`text-count-number-${s.id}`}>{s.countNumber}</TableCell>
                          <TableCell>{s.countType}</TableCell>
                          <TableCell>{s.scheduledDate ? new Date(s.scheduledDate).toLocaleDateString() : "—"}</TableCell>
                          <TableCell>
                            <Badge className={COUNT_STATUS_COLORS[s.status || "scheduled"] || ""} data-testid={`badge-count-status-${s.id}`}>
                              {(s.status || "scheduled").replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{counted}/{s.items.length}</span>
                          </TableCell>
                          <TableCell>
                            {s.status !== "approved" && (
                              <Button size="sm" variant="outline" onClick={() => openCounting(s)} data-testid={`button-open-count-${s.id}`}>
                                <ClipboardCheck className="h-3 w-3 mr-1" />
                                {s.status === "completed" ? "Review" : "Count"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="damaged" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => {
              setDamageForm({ inventoryItemId: "", damagedQty: "", unitCost: "", damageType: "SPOILAGE", damageCause: "", damageDate: new Date().toISOString().slice(0, 10), damageLocation: "", disposalMethod: "DISCARDED", notes: "", insuranceClaimNo: "", insuranceAmount: "" });
              setCreateDamageOpen(true);
            }} data-testid="button-report-damage">
              <Plus className="h-4 w-4 mr-2" />Report Damage
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {damagedLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : damaged.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">No damaged goods recorded.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Damage #</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Total Value</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Disposal</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {damaged.map(d => (
                      <TableRow key={d.id} data-testid={`row-damage-${d.id}`}>
                        <TableCell className="font-medium" data-testid={`text-damage-number-${d.id}`}>{d.damageNumber}</TableCell>
                        <TableCell>{invMap.get(d.inventoryItemId)?.name || d.inventoryItemId}</TableCell>
                        <TableCell>{d.damagedQty}</TableCell>
                        <TableCell>{fmt(d.totalValue)}</TableCell>
                        <TableCell>{d.damageType.replace(/_/g, " ")}</TableCell>
                        <TableCell>{d.damageDate ? new Date(d.damageDate).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>{d.disposalMethod}</TableCell>
                        <TableCell>
                          <Badge className={DAMAGE_STATUS_COLORS[d.status || "reported"] || ""} data-testid={`badge-damage-status-${d.id}`}>
                            {(d.status || "reported").replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Stock Count Dialog */}
      <Dialog open={createCountOpen} onOpenChange={setCreateCountOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Stock Count Session</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Count Type</Label>
              <Select value={countForm.countType} onValueChange={v => setCountForm(f => ({ ...f, countType: v }))}>
                <SelectTrigger data-testid="select-count-type"><SelectValue /></SelectTrigger>
                <SelectContent>{COUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Outlet (optional)</Label>
              <Select value={countForm.outletId || "__all"} onValueChange={v => setCountForm(f => ({ ...f, outletId: v === "__all" ? "" : v }))}>
                <SelectTrigger data-testid="select-count-outlet"><SelectValue placeholder="All outlets" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All outlets</SelectItem>
                  {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Scheduled Date</Label>
              <Input type="date" value={countForm.scheduledDate} onChange={e => setCountForm(f => ({ ...f, scheduledDate: e.target.value }))} data-testid="input-count-scheduled-date" />
            </div>
            <div>
              <Label>Reason / Notes</Label>
              <Input value={countForm.reason} onChange={e => setCountForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reason for count..." data-testid="input-count-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCountOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createCountMut.mutate({ ...countForm, outletId: countForm.outletId || null })}
              disabled={!countForm.scheduledDate || createCountMut.isPending}
              data-testid="button-create-count"
            >
              {createCountMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Counting Worksheet Dialog */}
      <Dialog open={countingOpen} onOpenChange={setCountingOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stock Count Worksheet — {selectedSession?.countNumber}</DialogTitle>
          </DialogHeader>
          {selectedSession && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Progress: <span className="font-semibold text-foreground">{countedItems}/{totalItems}</span></span>
                <span>Variances: <span className={`font-semibold ${variance > 0 ? "text-amber-600" : "text-green-600"}`}>{variance}</span></span>
                <Badge className={COUNT_STATUS_COLORS[selectedSession.status || "scheduled"] || ""}>
                  {(selectedSession.status || "scheduled").replace(/_/g, " ")}
                </Badge>
              </div>
              <div className="max-h-[55vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">Done</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">System Qty</TableHead>
                      <TableHead className="text-right">Physical Qty</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSession.items.map((item, idx) => {
                      const inv = invMap.get(item.inventoryItemId);
                      const sys = parseFloat(item.systemQty);
                      const phy = item.physicalQty !== null ? parseFloat(item.physicalQty) : null;
                      const vr = phy !== null ? phy - sys : null;
                      return (
                        <TableRow key={item.id} className={item.counted ? "bg-green-50/50" : ""} data-testid={`count-item-row-${idx}`}>
                          <TableCell>
                            <Checkbox checked={!!item.counted} readOnly />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{inv?.name || item.inventoryItemId}</div>
                            <div className="text-xs text-muted-foreground">{inv?.unit || ""}</div>
                          </TableCell>
                          <TableCell className="text-right font-mono">{sys.toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              className="w-24 ml-auto text-right h-7 text-sm"
                              defaultValue={item.physicalQty ?? ""}
                              onBlur={e => {
                                const v = e.target.value;
                                if (v !== "" && v !== item.physicalQty) updateItem(item, v);
                              }}
                              placeholder="Enter qty"
                              data-testid={`input-physical-qty-${idx}`}
                              disabled={selectedSession.status === "approved"}
                            />
                          </TableCell>
                          <TableCell className={`text-right font-mono text-sm ${vr === null ? "" : vr < 0 ? "text-red-600" : vr > 0 ? "text-amber-600" : "text-green-600"}`}>
                            {vr !== null ? (vr > 0 ? "+" : "") + vr.toFixed(2) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {variance > 0 && selectedSession.status !== "approved" && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  {variance} item(s) have variances. Approving will adjust inventory to match physical counts.
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCountingOpen(false)}>Close</Button>
            {selectedSession?.status === "in_progress" && (
              <Button variant="outline" onClick={completeCount} disabled={countedItems === 0 || updateCountMut.isPending} data-testid="button-complete-count">
                {updateCountMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Mark Complete
              </Button>
            )}
            {(selectedSession?.status === "completed" || selectedSession?.status === "in_progress") && (
              <Button onClick={() => selectedSession && approveCountMut.mutate(selectedSession.id)} disabled={approveCountMut.isPending} data-testid="button-approve-count">
                {approveCountMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Approve & Adjust Inventory
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Damage Dialog */}
      <Dialog open={createDamageOpen} onOpenChange={setCreateDamageOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Report Damaged Inventory</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Inventory Item *</Label>
                <Select value={damageForm.inventoryItemId} onValueChange={v => setDamageForm(f => ({ ...f, inventoryItemId: v }))}>
                  <SelectTrigger data-testid="select-damage-item"><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    {inventoryItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name} (stock: {i.currentStock})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Damaged Qty *</Label>
                <Input type="number" value={damageForm.damagedQty} onChange={e => setDamageForm(f => ({ ...f, damagedQty: e.target.value }))} placeholder="0.00" data-testid="input-damaged-qty" />
              </div>
              <div>
                <Label>Unit Cost *</Label>
                <Input type="number" value={damageForm.unitCost} onChange={e => setDamageForm(f => ({ ...f, unitCost: e.target.value }))} placeholder="0.00" data-testid="input-damage-unit-cost" />
              </div>
              <div>
                <Label>Damage Type</Label>
                <Select value={damageForm.damageType} onValueChange={v => setDamageForm(f => ({ ...f, damageType: v }))}>
                  <SelectTrigger data-testid="select-damage-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{DAMAGE_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Damage Date</Label>
                <Input type="date" value={damageForm.damageDate} onChange={e => setDamageForm(f => ({ ...f, damageDate: e.target.value }))} data-testid="input-damage-date" />
              </div>
              <div>
                <Label>Damage Cause</Label>
                <Input value={damageForm.damageCause} onChange={e => setDamageForm(f => ({ ...f, damageCause: e.target.value }))} placeholder="Root cause..." data-testid="input-damage-cause" />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={damageForm.damageLocation} onChange={e => setDamageForm(f => ({ ...f, damageLocation: e.target.value }))} placeholder="Where?" data-testid="input-damage-location" />
              </div>
              <div>
                <Label>Disposal Method</Label>
                <Select value={damageForm.disposalMethod} onValueChange={v => setDamageForm(f => ({ ...f, disposalMethod: v }))}>
                  <SelectTrigger data-testid="select-disposal-method"><SelectValue /></SelectTrigger>
                  <SelectContent>{DISPOSAL_METHODS.map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Insurance Claim #</Label>
                <Input value={damageForm.insuranceClaimNo} onChange={e => setDamageForm(f => ({ ...f, insuranceClaimNo: e.target.value }))} placeholder="Optional" data-testid="input-insurance-claim" />
              </div>
              <div>
                <Label>Insurance Amount</Label>
                <Input type="number" value={damageForm.insuranceAmount} onChange={e => setDamageForm(f => ({ ...f, insuranceAmount: e.target.value }))} placeholder="0.00" data-testid="input-insurance-amount" />
              </div>
            </div>
            {damageForm.damagedQty && damageForm.unitCost && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm">
                <AlertTriangle className="h-4 w-4 text-red-500 inline mr-2" />
                <span className="font-semibold">Total Loss: {fmt(totalDamageValue)}</span>
                {" — "}This will immediately deduct <strong>{damageForm.damagedQty}</strong> units from inventory.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDamageOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createDamageMut.mutate({
                ...damageForm,
                outletId: null,
                insuranceAmount: damageForm.insuranceAmount ? parseFloat(damageForm.insuranceAmount) : null,
                insuranceClaimNo: damageForm.insuranceClaimNo || null,
              })}
              disabled={!damageForm.inventoryItemId || !damageForm.damagedQty || !damageForm.unitCost || createDamageMut.isPending}
              data-testid="button-submit-damage"
            >
              {createDamageMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Report &amp; Deduct Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
