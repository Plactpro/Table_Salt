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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Plus, AlertTriangle, ClipboardCheck, Upload } from "lucide-react";

interface InventoryItem {
  id: string;
  name: string;
  unit: string | null;
  currentStock: string | null;
  itemCategory?: string | null;
  parLevelPerShift?: string | null;
  costPerPiece?: string | null;
  costPrice?: string | null;
}
interface Outlet { id: string; name: string; }

interface StockCountItemShape {
  id: string; inventoryItemId: string; systemQty: string; physicalQty: string | null;
  counted: boolean | null; notes: string | null; varianceReason?: string | null;
}
interface StockCountSession {
  id: string; countNumber: string; countType: string; outletId: string | null;
  status: string | null; scheduledDate: string; startedAt: string | null;
  completedAt: string | null; approvedAt: string | null; reason: string | null;
  createdAt: string; countScope?: string | null;
  items: StockCountItemShape[];
}

interface DamagedInventory {
  id: string; damageNumber: string; inventoryItemId: string; damagedQty: string;
  unitCost: string; totalValue: string; damageType: string; damageCause: string | null;
  damageDate: string; damageLocation: string | null; disposalMethod: string;
  status: string | null; createdAt: string; itemCategory?: string | null;
  causedByName?: string | null; photoUrl?: string | null;
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

const FOOD_DAMAGE_TYPES = ["SPOILAGE", "BREAKAGE", "CONTAMINATION", "EXPIRY", "THEFT", "PEST_DAMAGE", "WATER_DAMAGE", "FIRE_DAMAGE", "OTHER"];
const CROCKERY_DAMAGE_TYPES = [
  { value: "BREAKAGE_SERVICE", label: "Breakage during service" },
  { value: "BREAKAGE_WASHING", label: "Breakage during washing" },
  { value: "BREAKAGE_STORAGE", label: "Breakage during storage" },
  { value: "CHIPPED_RETIRE", label: "Chipped — retire from use" },
  { value: "CRACKED_RETIRE", label: "Cracked — retire immediately" },
  { value: "LOST_MISSING", label: "Lost / missing" },
];
const DISPOSAL_METHODS = ["DISCARDED", "RETURNED_TO_SUPPLIER", "DONATED", "COMPOSTED", "INCINERATED", "SENT_FOR_REPAIR", "INSURANCE_CLAIM"];
const COUNT_TYPES = ["Full", "Partial", "Spot", "Cycle"];

const VARIANCE_REASON_OPTIONS = [
  { value: "BREAKAGE_SERVICE", label: "Breakage during service" },
  { value: "BREAKAGE_WASHING", label: "Breakage during washing" },
  { value: "BREAKAGE_STORAGE", label: "Breakage during storage" },
  { value: "LOST_MISSING", label: "Lost / missing" },
  { value: "SENT_FOR_REPAIR", label: "Sent for repair" },
  { value: "UNKNOWN", label: "Unknown — investigate" },
];

const ITEM_TYPE_OPTIONS = [
  { value: "FOOD", label: "Food" },
  { value: "CROCKERY", label: "Crockery" },
  { value: "CUTLERY", label: "Cutlery" },
  { value: "GLASSWARE", label: "Glassware" },
];

function isPieceCategory(cat: string | null | undefined) {
  return cat === "CROCKERY" || cat === "CUTLERY" || cat === "GLASSWARE";
}

export default function StockCountTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState("counts");
  const [createCountOpen, setCreateCountOpen] = useState(false);
  const [countingOpen, setCountingOpen] = useState(false);
  const [createDamageOpen, setCreateDamageOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<StockCountSession | null>(null);
  const [damageCategoryFilter, setDamageCategoryFilter] = useState("ALL");
  const [damageDateFilter, setDamageDateFilter] = useState("this_month");

  const [countScope, setCountScope] = useState("food");
  const [countForm, setCountForm] = useState({ countType: "Full", scheduledDate: new Date().toISOString().slice(0, 10), outletId: "", reason: "" });

  const [damageItemType, setDamageItemType] = useState("FOOD");
  const [damageForm, setDamageForm] = useState({
    inventoryItemId: "", damagedQty: "", unitCost: "", damageType: "SPOILAGE",
    damageCause: "", damageDate: new Date().toISOString().slice(0, 10),
    damageLocation: "", disposalMethod: "DISCARDED", notes: "",
    insuranceClaimNo: "", insuranceAmount: "",
    causedByName: "", photoUrl: "",
  });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const fmt = (v: string | number) => {
    const tenant = (user as Record<string, unknown>)?.tenant as Record<string, unknown> | undefined;
    return formatCurrency(v, String(tenant?.currency || "AED"), {
      position: (tenant?.currencyPosition as "before" | "after") || "before",
      decimals: (tenant?.currencyDecimals as number) ?? 2,
    });
  };

  const { data: inventoryRes } = useQuery<{ data: InventoryItem[]; total: number }>({ queryKey: ["/api/inventory"] });
  const allInventoryItems = inventoryRes?.data ?? [];

  const { data: filteredInventoryRes } = useQuery<{ data: InventoryItem[]; total: number }>({
    queryKey: ["/api/inventory", "damage-filter", damageItemType],
    queryFn: async () => {
      const params = damageItemType !== "FOOD"
        ? `/api/inventory?itemCategory=${damageItemType}&limit=200`
        : `/api/inventory?limit=200`;
      const res = await fetch(params, { credentials: "include" });
      return res.json();
    },
    enabled: createDamageOpen,
  });
  const damageInventoryItems = filteredInventoryRes?.data ?? allInventoryItems;
  const filteredDamageItems = damageInventoryItems.filter(i => {
    if (damageItemType === "FOOD") return !isPieceCategory(i.itemCategory);
    return i.itemCategory === damageItemType;
  });

  const invMap = new Map(allInventoryItems.map(i => [i.id, i]));
  const { data: outletsRes } = useQuery<{ data: Outlet[] } | Outlet[]>({ queryKey: ["/api/outlets"] });
  const outlets: Outlet[] = Array.isArray(outletsRes) ? outletsRes : ((outletsRes as { data: Outlet[] } | undefined)?.data ?? []);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<StockCountSession[]>({ queryKey: ["/api/stock-counts"] });

  function getDamageDateRange(filter: string): { from?: string; to?: string } {
    const now = new Date();
    if (filter === "this_month") {
      const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      return { from, to };
    }
    if (filter === "last_month") {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const to = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      return { from, to };
    }
    if (filter === "this_year") {
      const from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
      return { from };
    }
    // all_time — no date filter
    return {}; 
  }

  const damageQueryParams = new URLSearchParams();
  if (damageCategoryFilter !== "ALL" && damageCategoryFilter !== "FOOD") {
    damageQueryParams.set("itemCategory", damageCategoryFilter);
  }
  const { from: dateFrom, to: dateTo } = getDamageDateRange(damageDateFilter);
  if (dateFrom) damageQueryParams.set("from", dateFrom);
  if (dateTo) damageQueryParams.set("to", dateTo);

  const { data: allDamaged = [], isLoading: damagedLoading } = useQuery<DamagedInventory[]>({
    queryKey: ["/api/damaged-inventory", damageCategoryFilter, damageDateFilter],
    queryFn: async () => {
      const qs = damageQueryParams.toString();
      const res = await fetch(`/api/damaged-inventory${qs ? "?" + qs : ""}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const damaged = damageCategoryFilter === "FOOD"
    ? allDamaged.filter(d => !isPieceCategory(invMap.get(d.inventoryItemId)?.itemCategory))
    : allDamaged;

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
        return { ...prev, items: prev.items.map(i => i.id === updatedItem.id ? { ...i, ...updatedItem } : i) };
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
    onSuccess: async (newDamage: DamagedInventory) => {
      qc.invalidateQueries({ queryKey: ["/api/damaged-inventory"] });
      qc.invalidateQueries({ queryKey: ["/api/inventory"] });
      setCreateDamageOpen(false);
      toast({ title: "Damage recorded & inventory deducted" });

      if (isPieceCategory(damageItemType)) {
        try {
          const parRes = await fetch("/api/inventory/par-check", { credentials: "include" });
          if (parRes.ok) {
            const parItems: Array<{ itemId: string; itemName: string; currentStock: number; parLevelPerShift: number; status: string }> = await parRes.json();
            const affected = parItems.find(p => p.itemId === newDamage.inventoryItemId);
            if (affected && (affected.status === "BELOW_PAR" || affected.status === "BELOW_REORDER")) {
              toast({
                title: "⚠️ Below Par Level",
                description: `${affected.itemName} is now below par level (${Math.round(affected.currentStock)}/${Math.round(affected.parLevelPerShift)} pcs)`,
                variant: "destructive",
              });
            }
          }
        } catch {
          // par-check not available yet (backend Task #116 not merged)
        }
      }
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

  const updateItemLocation = (item: StockCountItemShape, notes: string) => {
    if (!selectedSession) return;
    updateCountItemMut.mutate({ sessionId: selectedSession.id, itemId: item.id, d: { notes } });
  };

  const updateVarianceReason = (item: StockCountItemShape, varianceReason: string) => {
    if (!selectedSession) return;
    updateCountItemMut.mutate({ sessionId: selectedSession.id, itemId: item.id, d: { varianceReason } });
  };

  const completeCount = () => {
    if (!selectedSession) return;
    updateCountMut.mutate({ id: selectedSession.id, d: { status: "completed", completedAt: new Date().toISOString() } });
  };

  const totalDamageValue = (parseFloat(damageForm.damagedQty || "0") * parseFloat(damageForm.unitCost || "0"));

  const countedItems = selectedSession?.items.filter(i => i.counted).length ?? 0;
  const totalItems = selectedSession?.items.length ?? 0;
  const variance = selectedSession?.items.filter(i => i.counted && i.physicalQty !== null && Math.abs(parseFloat(i.physicalQty) - parseFloat(i.systemQty)) > 0.001).length ?? 0;

  const rawSessionItems = selectedSession?.items ?? [];
  const sessionScope = selectedSession?.countScope ?? "food";
  const sessionItems = sessionScope === "crockery"
    ? rawSessionItems.filter(i => isPieceCategory(invMap.get(i.inventoryItemId)?.itemCategory))
    : rawSessionItems;
  const foodItems = sessionScope === "crockery" ? [] : sessionItems.filter(i => !isPieceCategory(invMap.get(i.inventoryItemId)?.itemCategory));
  const crockeryItems = sessionItems.filter(i => invMap.get(i.inventoryItemId)?.itemCategory === "CROCKERY");
  const cutleryItems = sessionItems.filter(i => invMap.get(i.inventoryItemId)?.itemCategory === "CUTLERY");
  const glasswareItems = sessionItems.filter(i => invMap.get(i.inventoryItemId)?.itemCategory === "GLASSWARE");
  const hasNonFoodItems = crockeryItems.length > 0 || cutleryItems.length > 0 || glasswareItems.length > 0;

  const crockeryVarianceItems = sessionItems.filter(i => {
    const inv = invMap.get(i.inventoryItemId);
    if (!isPieceCategory(inv?.itemCategory)) return false;
    if (!i.counted || i.physicalQty === null) return false;
    return Math.abs(parseFloat(i.physicalQty) - parseFloat(i.systemQty)) > 0.001;
  });
  const crockeryTotalVariancePcs = crockeryVarianceItems.reduce((s, i) => s + (parseFloat(i.physicalQty || "0") - parseFloat(i.systemQty)), 0);
  const crockeryTotalVarianceValue = crockeryVarianceItems.reduce((s, i) => {
    const inv = invMap.get(i.inventoryItemId);
    const costPerPc = Number(inv?.costPerPiece || inv?.costPrice || 0);
    return s + (parseFloat(i.physicalQty || "0") - parseFloat(i.systemQty)) * costPerPc;
  }, 0);
  const crockeryCountedCount = sessionItems.filter(i => isPieceCategory(invMap.get(i.inventoryItemId)?.itemCategory) && i.counted).length;
  const crockeryTotalCount = sessionItems.filter(i => isPieceCategory(invMap.get(i.inventoryItemId)?.itemCategory)).length;

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPhotoPreview(dataUrl);
      setDamageForm(f => ({ ...f, photoUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  }

  function renderCountSection(items: StockCountItemShape[], title: string, bgColor: string, testId: string, showPar = false) {
    if (items.length === 0) return null;
    return (
      <div data-testid={testId}>
        <div className={`px-3 py-1.5 rounded text-sm font-bold uppercase tracking-wide mt-4 mb-2 ${bgColor}`}>
          {title}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">Done</TableHead>
              <TableHead>Item</TableHead>
              {showPar && <TableHead className="text-right">Par</TableHead>}
              <TableHead className="text-right">System Qty</TableHead>
              <TableHead className="text-right">Physical Count</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Variance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const inv = invMap.get(item.inventoryItemId);
              const isPiece = isPieceCategory(inv?.itemCategory);
              const sys = parseFloat(item.systemQty);
              const phy = item.physicalQty !== null ? parseFloat(item.physicalQty) : null;
              const vr = phy !== null ? phy - sys : null;
              return (
                <TableRow key={item.id} className={item.counted ? "bg-green-50/50" : ""}>
                  <TableCell><Checkbox checked={!!item.counted} readOnly /></TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{inv?.name || item.inventoryItemId}</div>
                    <div className="text-xs text-muted-foreground">{isPiece ? "pcs" : (inv?.unit || "")}</div>
                  </TableCell>
                  {showPar && (
                    <TableCell className="text-right text-sm">
                      {inv?.parLevelPerShift ? Math.round(Number(inv.parLevelPerShift)) + " pcs" : "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-right font-mono">{isPiece ? Math.round(sys) : sys.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step={isPiece ? "1" : "0.01"}
                      min="0"
                      className="w-24 ml-auto text-right h-7 text-sm"
                      defaultValue={item.physicalQty ?? ""}
                      onBlur={e => {
                        const v = e.target.value;
                        if (v !== "" && v !== item.physicalQty) updateItem(item, v);
                      }}
                      placeholder="Enter qty"
                      data-testid={`input-count-${item.inventoryItemId}`}
                      disabled={selectedSession?.status === "approved"}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="w-32 h-7 text-sm"
                      defaultValue={item.notes ?? ""}
                      onBlur={e => {
                        const v = e.target.value;
                        if (v !== item.notes) updateItemLocation(item, v);
                      }}
                      placeholder="Location..."
                      data-testid={`input-location-${item.inventoryItemId}`}
                      disabled={selectedSession?.status === "approved"}
                    />
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm ${vr === null ? "" : vr < 0 ? "text-red-600" : vr > 0 ? "text-amber-600" : "text-green-600"}`}>
                    {vr !== null ? (vr > 0 ? "+" : "") + (isPiece ? Math.round(vr) : vr.toFixed(2)) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="counts" data-testid="tab-stock-counts">Stock Count ({sessions.length})</TabsTrigger>
          <TabsTrigger value="damaged" data-testid="tab-damaged">Damaged Goods ({allDamaged.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="counts" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setCountScope("food"); setCountForm({ countType: "Full", scheduledDate: new Date().toISOString().slice(0, 10), outletId: "", reason: "" }); setCreateCountOpen(true); }} data-testid="button-new-count">
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
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-sm">Filter:</Label>
              <Select value={damageCategoryFilter} onValueChange={setDamageCategoryFilter}>
                <SelectTrigger className="w-44" data-testid="select-damage-category-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="FOOD">Food</SelectItem>
                  <SelectItem value="CROCKERY">Crockery</SelectItem>
                  <SelectItem value="CUTLERY">Cutlery</SelectItem>
                  <SelectItem value="GLASSWARE">Glassware</SelectItem>
                </SelectContent>
              </Select>
              <Select value={damageDateFilter} onValueChange={setDamageDateFilter}>
                <SelectTrigger className="w-40" data-testid="select-damage-date-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="this_year">This Year</SelectItem>
                  <SelectItem value="all_time">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => {
              setDamageItemType("FOOD");
              setPhotoPreview(null);
              setDamageForm({ inventoryItemId: "", damagedQty: "", unitCost: "", damageType: "SPOILAGE", damageCause: "", damageDate: new Date().toISOString().slice(0, 10), damageLocation: "", disposalMethod: "DISCARDED", notes: "", insuranceClaimNo: "", insuranceAmount: "", causedByName: "", photoUrl: "" });
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

            {/* Count Scope */}
            <div>
              <Label className="mb-2 block">Count Scope</Label>
              <RadioGroup value={countScope} onValueChange={setCountScope} className="space-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="scope-all" data-testid="radio-scope-all" />
                  <label htmlFor="scope-all" className="text-sm cursor-pointer">All (food + crockery + cutlery + glassware)</label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="food" id="scope-food" data-testid="radio-scope-food" />
                  <label htmlFor="scope-food" className="text-sm cursor-pointer">Food items only</label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="crockery" id="scope-crockery" data-testid="radio-scope-crockery" />
                  <label htmlFor="scope-crockery" className="text-sm cursor-pointer">Crockery &amp; Cutlery only</label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="specific" id="scope-specific" data-testid="radio-scope-specific" />
                  <label htmlFor="scope-specific" className="text-sm cursor-pointer">Specific items</label>
                </div>
              </RadioGroup>
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
              onClick={() => createCountMut.mutate({ ...countForm, countScope, outletId: countForm.outletId || null })}
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
              <div className="max-h-[55vh] overflow-y-auto space-y-2">
                {/* Food Items Section */}
                {foodItems.length > 0 && (
                  <div>
                    {hasNonFoodItems && (
                      <div className="px-3 py-1.5 rounded text-sm font-bold uppercase tracking-wide mb-2 bg-blue-100 text-blue-800">
                        Food Ingredients
                      </div>
                    )}
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
                        {foodItems.map((item, idx) => {
                          const inv = invMap.get(item.inventoryItemId);
                          const sys = parseFloat(item.systemQty);
                          const phy = item.physicalQty !== null ? parseFloat(item.physicalQty) : null;
                          const vr = phy !== null ? phy - sys : null;
                          return (
                            <TableRow key={item.id} className={item.counted ? "bg-green-50/50" : ""} data-testid={`count-item-row-${idx}`}>
                              <TableCell><Checkbox checked={!!item.counted} readOnly /></TableCell>
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
                )}

                {/* Crockery / Cutlery / Glassware sections */}
                {renderCountSection(crockeryItems, "Crockery", "bg-orange-100 text-orange-800", "section-crockery-items", true)}
                {renderCountSection(cutleryItems, "Cutlery", "bg-purple-100 text-purple-800", "section-cutlery-items", true)}
                {renderCountSection(glasswareItems, "Glassware", "bg-teal-100 text-teal-800", "section-glassware-items", true)}
              </div>

              {/* Crockery Variance Section */}
              {crockeryVarianceItems.length > 0 && selectedSession.status !== "approved" && (
                <div data-testid="section-crockery-variance" className="border rounded-lg p-3 space-y-2">
                  <div className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Crockery / Cutlery / Glassware Variance</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">System</TableHead>
                        <TableHead className="text-right">Physical</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {crockeryVarianceItems.map(item => {
                        const inv = invMap.get(item.inventoryItemId);
                        const costPerPc = Number(inv?.costPerPiece || inv?.costPrice || 0);
                        const sys = Math.round(parseFloat(item.systemQty));
                        const phy = Math.round(parseFloat(item.physicalQty || "0"));
                        const vr = phy - sys;
                        const val = vr * costPerPc;
                        return (
                          <TableRow key={item.id} data-testid={`row-variance-${item.inventoryItemId}`}>
                            <TableCell className="font-medium text-sm">{inv?.name || item.inventoryItemId}</TableCell>
                            <TableCell className="text-right">{sys}</TableCell>
                            <TableCell className="text-right">{phy}</TableCell>
                            <TableCell className={`text-right font-medium ${vr < 0 ? "text-red-600" : "text-amber-600"}`}>
                              {vr > 0 ? "+" : ""}{vr} pcs
                            </TableCell>
                            <TableCell className={`text-right text-sm ${val < 0 ? "text-red-600" : "text-amber-600"}`}>
                              {val !== 0 ? (val < 0 ? "-" : "+") + fmt(Math.abs(val)) : "—"}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={item.varianceReason || ""}
                                onValueChange={v => updateVarianceReason(item, v)}
                              >
                                <SelectTrigger className="h-7 text-xs w-44" data-testid={`select-variance-reason-${item.inventoryItemId}`}>
                                  <SelectValue placeholder="Select reason..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {VARIANCE_REASON_OPTIONS.map(o => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <div className="text-sm font-medium text-muted-foreground pt-1" data-testid="text-crockery-total-variance">
                    Total crockery variance: {crockeryTotalVariancePcs > 0 ? "+" : ""}{crockeryTotalVariancePcs} pcs | {crockeryTotalVarianceValue < 0 ? "-" : ""}{fmt(Math.abs(crockeryTotalVarianceValue))}
                    {" "}· Items matched: {crockeryCountedCount}/{crockeryTotalCount} ({crockeryTotalCount > 0 ? Math.round(crockeryCountedCount / crockeryTotalCount * 100) : 0}%)
                  </div>
                </div>
              )}

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
                Approve &amp; Adjust Inventory
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
            {/* Item Type Selector */}
            <div>
              <Label>Item Type</Label>
              <Select value={damageItemType} onValueChange={v => {
                setDamageItemType(v);
                setDamageForm(f => ({
                  ...f, inventoryItemId: "", unitCost: "",
                  damageType: isPieceCategory(v) ? "BREAKAGE_SERVICE" : "SPOILAGE",
                }));
              }}>
                <SelectTrigger data-testid="select-damage-item-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ITEM_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Inventory Item *</Label>
                <Select value={damageForm.inventoryItemId} onValueChange={v => {
                  const item = allInventoryItems.find(i => i.id === v) || filteredDamageItems.find(i => i.id === v);
                  const autoCost = isPieceCategory(damageItemType)
                    ? (item?.costPerPiece || item?.costPrice || "")
                    : (item?.costPrice || "");
                  setDamageForm(f => ({ ...f, inventoryItemId: v, unitCost: autoCost ? String(autoCost) : f.unitCost }));
                }}>
                  <SelectTrigger data-testid="select-damage-item"><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    {filteredDamageItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name} (stock: {i.currentStock})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Damaged Qty *</Label>
                <Input
                  type="number"
                  step={isPieceCategory(damageItemType) ? "1" : "0.01"}
                  value={damageForm.damagedQty}
                  onChange={e => setDamageForm(f => ({ ...f, damagedQty: e.target.value }))}
                  placeholder={isPieceCategory(damageItemType) ? "pcs" : "0.00"}
                  data-testid="input-damage-quantity"
                />
              </div>
              <div>
                <Label>{isPieceCategory(damageItemType) ? "Cost/Piece" : "Unit Cost *"}</Label>
                <Input
                  type="number"
                  value={damageForm.unitCost}
                  onChange={e => setDamageForm(f => ({ ...f, unitCost: e.target.value }))}
                  placeholder="0.00"
                  data-testid="text-damage-cost-per-piece"
                  readOnly={isPieceCategory(damageItemType) && !!damageForm.inventoryItemId}
                  className={isPieceCategory(damageItemType) && !!damageForm.inventoryItemId ? "bg-muted" : ""}
                />
              </div>

              {/* Damage Type */}
              <div className="col-span-2">
                <Label>Damage Type</Label>
                {isPieceCategory(damageItemType) ? (
                  <RadioGroup value={damageForm.damageType} onValueChange={v => setDamageForm(f => ({ ...f, damageType: v }))} className="grid grid-cols-2 gap-1 mt-1">
                    {CROCKERY_DAMAGE_TYPES.map(t => (
                      <div key={t.value} className="flex items-center gap-2">
                        <RadioGroupItem value={t.value} id={`damage-type-${t.value}`} data-testid={`radio-damage-type-${t.value}`} />
                        <label htmlFor={`damage-type-${t.value}`} className="text-sm cursor-pointer">{t.label}</label>
                      </div>
                    ))}
                  </RadioGroup>
                ) : (
                  <Select value={damageForm.damageType} onValueChange={v => setDamageForm(f => ({ ...f, damageType: v }))}>
                    <SelectTrigger data-testid="select-damage-type"><SelectValue /></SelectTrigger>
                    <SelectContent>{FOOD_DAMAGE_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <Label>Damage Date</Label>
                <Input type="date" value={damageForm.damageDate} onChange={e => setDamageForm(f => ({ ...f, damageDate: e.target.value }))} data-testid="input-damage-date" />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={damageForm.damageLocation} onChange={e => setDamageForm(f => ({ ...f, damageLocation: e.target.value }))} placeholder="Dining area / Bar / Kitchen" data-testid="input-location" />
              </div>

              {isPieceCategory(damageItemType) && (
                <div className="col-span-2">
                  <Label>Caused by (Staff name or Unknown)</Label>
                  <Input value={damageForm.causedByName} onChange={e => setDamageForm(f => ({ ...f, causedByName: e.target.value }))} placeholder="Staff name or Unknown" data-testid="input-caused-by" />
                </div>
              )}

              {!isPieceCategory(damageItemType) && (
                <div>
                  <Label>Damage Cause</Label>
                  <Input value={damageForm.damageCause} onChange={e => setDamageForm(f => ({ ...f, damageCause: e.target.value }))} placeholder="Root cause..." data-testid="input-damage-cause" />
                </div>
              )}

              <div className={isPieceCategory(damageItemType) ? "col-span-2" : "col-span-1"}>
                <Label>Disposal Method</Label>
                {isPieceCategory(damageItemType) ? (
                  <RadioGroup
                    value={damageForm.disposalMethod}
                    onValueChange={v => setDamageForm(f => ({ ...f, disposalMethod: v }))}
                    className="flex flex-col gap-2 mt-2"
                    data-testid="radio-group-disposal-method"
                  >
                    {[
                      { value: "DISCARDED", label: "Discard" },
                      { value: "SENT_FOR_REPAIR", label: "Send to repair" },
                      { value: "INSURANCE_CLAIM", label: "Insurance claim" },
                    ].map(opt => (
                      <div key={opt.value} className="flex items-center gap-2">
                        <RadioGroupItem value={opt.value} id={`disposal-${opt.value}`} data-testid={`radio-disposal-${opt.value}`} />
                        <Label htmlFor={`disposal-${opt.value}`} className="font-normal cursor-pointer">{opt.label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                ) : (
                  <Select value={damageForm.disposalMethod} onValueChange={v => setDamageForm(f => ({ ...f, disposalMethod: v }))}>
                    <SelectTrigger data-testid="select-disposal-method"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DISPOSAL_METHODS.map(m => (
                        <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {isPieceCategory(damageItemType) && (
                <div className="col-span-2">
                  <Label>Photo Evidence</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-sm border rounded px-3 py-1.5 hover:bg-muted">
                      <Upload className="h-4 w-4" />
                      Upload photo
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} data-testid="input-photo-upload" />
                    </label>
                    {photoPreview && (
                      <img src={photoPreview} alt="Preview" className="h-12 w-12 object-cover rounded border" />
                    )}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {!isPieceCategory(damageItemType) && (
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
            )}

            {damageForm.damagedQty && damageForm.unitCost && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm">
                <AlertTriangle className="h-4 w-4 text-red-500 inline mr-2" />
                <span className="font-semibold" data-testid="text-damage-total-value">Total Loss: {fmt(totalDamageValue)}</span>
                {" — "}This will immediately deduct <strong>{damageForm.damagedQty}</strong> {isPieceCategory(damageItemType) ? "pcs" : "units"} from inventory.
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
                causedByName: damageForm.causedByName || null,
                photoUrl: damageForm.photoUrl || null,
                itemCategory: damageItemType !== "FOOD" ? damageItemType : null,
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
