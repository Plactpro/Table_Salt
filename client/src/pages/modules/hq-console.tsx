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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, MapPin, TrendingUp, DollarSign, BarChart3, Receipt, Plus, FileText, Calculator, Store, Crown, ChevronRight } from "lucide-react";

interface Region { id: string; tenantId: string; name: string; description: string | null; sortOrder: number; active: boolean; }
interface Outlet { id: string; tenantId: string; regionId: string | null; name: string; address: string | null; openingHours: string | null; isFranchise: boolean | null; franchiseeName: string | null; royaltyRate: string | null; minimumGuarantee: string | null; active: boolean | null; }
interface OutletKPI { outletId: string; outletName: string; isFranchise: boolean; regionId: string | null; totalOrders: number; totalRevenue: string; totalTax: string; totalDiscount: string; avgCheck: string; }
interface FranchiseInvoice { id: string; tenantId: string; outletId: string; periodStart: string; periodEnd: string; netSales: string; royaltyRate: string; calculatedRoyalty: string; minimumGuarantee: string; finalAmount: string; status: string; notes: string | null; createdAt: string; }
interface MenuItem { id: string; name: string; price: string; categoryId: string; }
interface OutletMenuOverride { id: string; tenantId: string; outletId: string; menuItemId: string; overridePrice: string | null; available: boolean; }

export default function HQConsolePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [regionFilter, setRegionFilter] = useState("all");
  const [selectedOutlet, setSelectedOutlet] = useState("all");
  const [franchiseOutletId, setFranchiseOutletId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [calcResult, setCalcResult] = useState<Record<string, string> | null>(null);
  const [regionDialog, setRegionDialog] = useState(false);
  const [regionForm, setRegionForm] = useState({ name: "", description: "" });
  const [overrideDialog, setOverrideDialog] = useState(false);
  const [overrideOutlet, setOverrideOutlet] = useState("");
  const [overrideMenuItem, setOverrideMenuItem] = useState("");
  const [overridePrice, setOverridePrice] = useState("");
  const [invoiceDialog, setInvoiceDialog] = useState(false);

  const fmt = (amount: string | number) => {
    if (!user) return String(amount);
    const u = user as Record<string, unknown>;
    const tenant = (u.tenant || {}) as Record<string, unknown>;
    return sharedFormatCurrency(amount, String(tenant.currency || "USD"), { position: String(tenant.currencyPosition || "before"), decimals: parseInt(String(tenant.currencyDecimals ?? "2")) });
  };

  const { data: regions = [] } = useQuery<Region[]>({ queryKey: ["/api/regions"] });
  const { data: outlets = [] } = useQuery<Outlet[]>({ queryKey: ["/api/outlets"] });
  const { data: kpis = [] } = useQuery<OutletKPI[]>({ queryKey: ["/api/hq/outlet-kpis"] });
  const { data: invoices = [] } = useQuery<FranchiseInvoice[]>({ queryKey: ["/api/franchise-invoices"] });
  const { data: menuItems = [] } = useQuery<MenuItem[]>({ queryKey: ["/api/menu-items"] });
  const { data: overrides = [] } = useQuery<OutletMenuOverride[]>({
    queryKey: ["/api/outlet-menu-overrides", overrideOutlet],
    enabled: !!overrideOutlet,
    queryFn: () => apiRequest("GET", `/api/outlet-menu-overrides/${overrideOutlet}`).then(r => r.json()),
  });

  const regionMap = useMemo(() => new Map(regions.map(r => [r.id, r])), [regions]);
  const outletMap = useMemo(() => new Map(outlets.map(o => [o.id, o])), [outlets]);
  const menuMap = useMemo(() => new Map(menuItems.map(m => [m.id, m])), [menuItems]);

  const filteredOutlets = useMemo(() => {
    let list = outlets;
    if (regionFilter !== "all") list = list.filter(o => o.regionId === regionFilter);
    if (selectedOutlet !== "all") list = list.filter(o => o.id === selectedOutlet);
    return list;
  }, [outlets, regionFilter, selectedOutlet]);

  const filteredKPIs = useMemo(() => {
    const outletIds = new Set(filteredOutlets.map(o => o.id));
    return kpis.filter(k => outletIds.has(k.outletId));
  }, [kpis, filteredOutlets]);

  const franchiseOutlets = useMemo(() => outlets.filter(o => o.isFranchise), [outlets]);

  const totals = useMemo(() => {
    let totalRevenue = 0, totalOrders = 0, totalTax = 0;
    for (const k of filteredKPIs) {
      totalRevenue += parseFloat(k.totalRevenue || "0");
      totalOrders += Number(k.totalOrders || 0);
      totalTax += parseFloat(k.totalTax || "0");
    }
    const avgCheck = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    return { totalRevenue, totalOrders, totalTax, avgCheck };
  }, [filteredKPIs]);

  const onMutError = (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" });

  const createRegionMut = useMutation({
    mutationFn: (data: { name: string; description: string }) => apiRequest("POST", "/api/regions", data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/regions"] }); setRegionDialog(false); setRegionForm({ name: "", description: "" }); toast({ title: "Region created" }); },
    onError: onMutError,
  });

  const calculateRoyalty = useMutation({
    mutationFn: (data: { outletId: string; periodStart: string; periodEnd: string }) => apiRequest("POST", "/api/franchise-invoices/calculate", data).then(r => r.json()),
    onSuccess: (data: Record<string, string>) => setCalcResult(data),
    onError: onMutError,
  });

  const createInvoice = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/franchise-invoices", data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/franchise-invoices"] }); setInvoiceDialog(false); setCalcResult(null); toast({ title: "Invoice created" }); },
    onError: onMutError,
  });

  const createOverrideMut = useMutation({
    mutationFn: (data: { outletId: string; menuItemId: string; overridePrice: string }) => apiRequest("POST", "/api/outlet-menu-overrides", data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/outlet-menu-overrides", overrideOutlet] }); setOverrideDialog(false); setOverrideMenuItem(""); setOverridePrice(""); toast({ title: "Price override saved" }); },
    onError: onMutError,
  });

  const deleteOverrideMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/outlet-menu-overrides/${id}`).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/outlet-menu-overrides", overrideOutlet] }); toast({ title: "Override removed" }); },
    onError: onMutError,
  });

  const sortedKPIs = useMemo(() => {
    return [...filteredKPIs].sort((a, b) => parseFloat(b.totalRevenue || "0") - parseFloat(a.totalRevenue || "0"));
  }, [filteredKPIs]);

  return (
    <div className="p-6 space-y-6" data-testid="hq-console-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Building2 className="h-6 w-6 text-primary" /> HQ Console
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Multi-outlet performance & franchise management</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-region-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedOutlet} onValueChange={setSelectedOutlet}>
            <SelectTrigger className="w-[200px]" data-testid="select-outlet-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Outlets</SelectItem>
              {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="comparison" data-testid="tab-comparison">Outlet Comparison</TabsTrigger>
          <TabsTrigger value="franchise" data-testid="tab-franchise">Franchise</TabsTrigger>
          <TabsTrigger value="menu-overrides" data-testid="tab-menu-overrides">Menu Overrides</TabsTrigger>
          <TabsTrigger value="regions" data-testid="tab-regions">Regions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg"><Store className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Outlets</p>
                  <p className="text-2xl font-bold" data-testid="text-active-outlets">{filteredOutlets.filter(o => o.active).length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg"><DollarSign className="h-5 w-5 text-green-600" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold" data-testid="text-total-revenue">{fmt(totals.totalRevenue.toFixed(2))}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg"><Receipt className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Orders</p>
                  <p className="text-2xl font-bold" data-testid="text-total-orders">{totals.totalOrders}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg"><TrendingUp className="h-5 w-5 text-purple-600" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg Check</p>
                  <p className="text-2xl font-bold" data-testid="text-avg-check">{fmt(totals.avgCheck.toFixed(2))}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Outlet Rankings</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sortedKPIs.map((k, idx) => {
                    const maxRev = sortedKPIs[0] ? parseFloat(sortedKPIs[0].totalRevenue || "1") : 1;
                    const pct = (parseFloat(k.totalRevenue || "0") / maxRev) * 100;
                    const outlet = outletMap.get(k.outletId);
                    return (
                      <div key={k.outletId} className="flex items-center gap-3" data-testid={`outlet-rank-${idx}`}>
                        <span className="text-sm font-bold text-muted-foreground w-6">#{idx + 1}</span>
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium flex items-center gap-1">
                              {k.outletName}
                              {outlet?.isFranchise && <Crown className="h-3 w-3 text-amber-500" />}
                            </span>
                            <span className="text-sm font-semibold">{fmt(k.totalRevenue)}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {sortedKPIs.length === 0 && <p className="text-sm text-muted-foreground">No data yet</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MapPin className="h-5 w-5" /> Outlets by Region</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {regions.map(region => {
                    const regionOutlets = outlets.filter(o => o.regionId === region.id);
                    return (
                      <div key={region.id}>
                        <h4 className="font-medium text-sm mb-2">{region.name}</h4>
                        <div className="space-y-1 pl-4">
                          {regionOutlets.map(o => (
                            <div key={o.id} className="flex items-center justify-between text-sm">
                              <span className="flex items-center gap-1">
                                {o.name}
                                {o.isFranchise && <Badge variant="outline" className="text-xs">Franchise</Badge>}
                              </span>
                              <Badge variant={o.active ? "default" : "secondary"}>{o.active ? "Active" : "Inactive"}</Badge>
                            </div>
                          ))}
                          {regionOutlets.length === 0 && <p className="text-xs text-muted-foreground">No outlets</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Outlet Performance Comparison</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Avg Check</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedKPIs.map(k => {
                    const outlet = outletMap.get(k.outletId);
                    const region = outlet?.regionId ? regionMap.get(outlet.regionId) : null;
                    return (
                      <TableRow key={k.outletId} data-testid={`comparison-row-${k.outletId}`}>
                        <TableCell className="font-medium">{k.outletName}</TableCell>
                        <TableCell>{region?.name || "—"}</TableCell>
                        <TableCell>
                          {outlet?.isFranchise
                            ? <Badge variant="outline" className="text-amber-600 border-amber-300">Franchise</Badge>
                            : <Badge variant="outline" className="text-primary">Company</Badge>}
                        </TableCell>
                        <TableCell className="text-right">{k.totalOrders}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(k.totalRevenue)}</TableCell>
                        <TableCell className="text-right">{fmt(k.avgCheck)}</TableCell>
                        <TableCell className="text-right">{fmt(k.totalTax)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {sortedKPIs.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No data available</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="franchise" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Royalty Calculator</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Franchise Outlet</Label>
                  <Select value={franchiseOutletId} onValueChange={setFranchiseOutletId}>
                    <SelectTrigger data-testid="select-franchise-outlet">
                      <SelectValue placeholder="Select franchise..." />
                    </SelectTrigger>
                    <SelectContent>
                      {franchiseOutlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name} ({o.franchiseeName})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Period Start</Label>
                    <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} data-testid="input-period-start" />
                  </div>
                  <div>
                    <Label>Period End</Label>
                    <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} data-testid="input-period-end" />
                  </div>
                </div>
                <Button onClick={() => { if (franchiseOutletId && periodStart && periodEnd) calculateRoyalty.mutate({ outletId: franchiseOutletId, periodStart, periodEnd }); }} disabled={!franchiseOutletId || !periodStart || !periodEnd} data-testid="button-calculate-royalty">
                  Calculate Royalty
                </Button>
                {calcResult && (
                  <div className="mt-4 p-4 bg-muted rounded-lg space-y-2" data-testid="royalty-result">
                    <div className="flex justify-between"><span className="text-sm">Net Sales:</span><span className="font-semibold">{fmt(calcResult.netSales)}</span></div>
                    <div className="flex justify-between"><span className="text-sm">Royalty Rate:</span><span>{calcResult.royaltyRate}%</span></div>
                    <div className="flex justify-between"><span className="text-sm">Calculated Royalty:</span><span>{fmt(calcResult.calculatedRoyalty)}</span></div>
                    <div className="flex justify-between"><span className="text-sm">Minimum Guarantee:</span><span>{fmt(calcResult.minimumGuarantee)}</span></div>
                    <div className="flex justify-between border-t pt-2"><span className="font-semibold">Final Amount:</span><span className="font-bold text-lg">{fmt(calcResult.finalAmount)}</span></div>
                    <Button className="w-full mt-2" onClick={() => {
                      createInvoice.mutate({
                        outletId: calcResult.outletId || franchiseOutletId,
                        periodStart: calcResult.periodStart || periodStart,
                        periodEnd: calcResult.periodEnd || periodEnd,
                        netSales: calcResult.netSales,
                        royaltyRate: calcResult.royaltyRate,
                        calculatedRoyalty: calcResult.calculatedRoyalty,
                        minimumGuarantee: calcResult.minimumGuarantee,
                        finalAmount: calcResult.finalAmount,
                        status: "draft",
                      });
                    }} data-testid="button-create-invoice">
                      <FileText className="h-4 w-4 mr-2" /> Generate Invoice
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5" /> Franchise Outlets</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {franchiseOutlets.map(o => {
                    const region = o.regionId ? regionMap.get(o.regionId) : null;
                    return (
                      <div key={o.id} className="p-3 border rounded-lg" data-testid={`franchise-card-${o.id}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{o.name}</p>
                            <p className="text-xs text-muted-foreground">{o.franchiseeName}</p>
                          </div>
                          <Badge variant="outline">{region?.name || "No Region"}</Badge>
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                          <span>Royalty: {o.royaltyRate}%</span>
                          <span>Min Guarantee: {fmt(o.minimumGuarantee || "0")}</span>
                        </div>
                      </div>
                    );
                  })}
                  {franchiseOutlets.length === 0 && <p className="text-sm text-muted-foreground">No franchise outlets configured</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Franchise Invoices</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Net Sales</TableHead>
                    <TableHead className="text-right">Royalty</TableHead>
                    <TableHead className="text-right">Final Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map(inv => {
                    const outlet = outletMap.get(inv.outletId);
                    return (
                      <TableRow key={inv.id} data-testid={`invoice-row-${inv.id}`}>
                        <TableCell className="font-medium">{outlet?.name || "—"}</TableCell>
                        <TableCell className="text-sm">{new Date(inv.periodStart).toLocaleDateString()} — {new Date(inv.periodEnd).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">{fmt(inv.netSales)}</TableCell>
                        <TableCell className="text-right">{fmt(inv.calculatedRoyalty)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(inv.finalAmount)}</TableCell>
                        <TableCell>
                          <Badge variant={inv.status === "paid" ? "default" : inv.status === "sent" ? "secondary" : "outline"}>
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{new Date(inv.createdAt).toLocaleDateString()}</TableCell>
                      </TableRow>
                    );
                  })}
                  {invoices.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No invoices yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="menu-overrides" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Per-Outlet Menu Price Overrides</CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={overrideOutlet} onValueChange={setOverrideOutlet}>
                    <SelectTrigger className="w-[200px]" data-testid="select-override-outlet">
                      <SelectValue placeholder="Select outlet..." />
                    </SelectTrigger>
                    <SelectContent>
                      {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {overrideOutlet && (
                    <Dialog open={overrideDialog} onOpenChange={setOverrideDialog}>
                      <DialogTrigger asChild>
                        <Button size="sm" data-testid="button-add-override"><Plus className="h-4 w-4 mr-1" /> Add Override</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Add Price Override</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Menu Item</Label>
                            <Select value={overrideMenuItem} onValueChange={setOverrideMenuItem}>
                              <SelectTrigger data-testid="select-override-item"><SelectValue placeholder="Select item..." /></SelectTrigger>
                              <SelectContent>
                                {menuItems.map(m => <SelectItem key={m.id} value={m.id}>{m.name} (Base: {fmt(m.price)})</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Override Price</Label>
                            <Input type="number" step="0.01" value={overridePrice} onChange={e => setOverridePrice(e.target.value)} placeholder="e.g. 29.99" data-testid="input-override-price" />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={() => { if (overrideOutlet && overrideMenuItem && overridePrice) createOverrideMut.mutate({ outletId: overrideOutlet, menuItemId: overrideMenuItem, overridePrice }); }} disabled={!overrideMenuItem || !overridePrice} data-testid="button-save-override">Save Override</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!overrideOutlet ? (
                <p className="text-sm text-muted-foreground text-center py-8">Select an outlet to view and manage price overrides</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Menu Item</TableHead>
                      <TableHead className="text-right">Base Price</TableHead>
                      <TableHead className="text-right">Override Price</TableHead>
                      <TableHead className="text-right">Difference</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overrides.map(ov => {
                      const mi = menuMap.get(ov.menuItemId);
                      const base = parseFloat(mi?.price || "0");
                      const over = parseFloat(ov.overridePrice || "0");
                      const diff = over - base;
                      return (
                        <TableRow key={ov.id} data-testid={`override-row-${ov.id}`}>
                          <TableCell className="font-medium">{mi?.name || "Unknown"}</TableCell>
                          <TableCell className="text-right">{fmt(mi?.price || "0")}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(ov.overridePrice || "0")}</TableCell>
                          <TableCell className={`text-right ${diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : ""}`}>
                            {diff > 0 ? "+" : ""}{fmt(diff.toFixed(2))}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => deleteOverrideMut.mutate(ov.id)} data-testid={`button-delete-override-${ov.id}`}>Remove</Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {overrides.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No price overrides for this outlet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Region Management</CardTitle>
                <Dialog open={regionDialog} onOpenChange={setRegionDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-add-region"><Plus className="h-4 w-4 mr-1" /> Add Region</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add Region</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Name</Label>
                        <Input value={regionForm.name} onChange={e => setRegionForm(f => ({ ...f, name: e.target.value }))} data-testid="input-region-name" />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input value={regionForm.description} onChange={e => setRegionForm(f => ({ ...f, description: e.target.value }))} data-testid="input-region-description" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => createRegionMut.mutate(regionForm)} disabled={!regionForm.name} data-testid="button-save-region">Save</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {regions.map(region => {
                  const regionOutlets = outlets.filter(o => o.regionId === region.id);
                  return (
                    <div key={region.id} className="p-4 border rounded-lg" data-testid={`region-card-${region.id}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-medium">{region.name}</h4>
                          {region.description && <p className="text-xs text-muted-foreground">{region.description}</p>}
                        </div>
                        <Badge>{regionOutlets.length} outlet{regionOutlets.length !== 1 ? "s" : ""}</Badge>
                      </div>
                      <div className="space-y-1">
                        {regionOutlets.map(o => (
                          <div key={o.id} className="flex items-center gap-2 text-sm pl-2">
                            <ChevronRight className="h-3 w-3" />
                            <span>{o.name}</span>
                            {o.isFranchise && <Badge variant="outline" className="text-xs">Franchise</Badge>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {regions.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No regions configured</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
