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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, Star, Pencil, BookOpen, X } from "lucide-react";
import { selectPageData, type PaginatedResponse } from "@/lib/api-types";

interface Supplier {
  id: string;
  tenantId: string;
  name: string;
  supplierCode: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  paymentTerms: string | null;
  creditLimit: string | null;
  currency: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  leadTimeDays: number | null;
  rating: string | null;
  isPreferred: boolean | null;
  notes: string | null;
  active: boolean | null;
  createdAt: string;
}

interface CatalogItem {
  id: string;
  tenantId: string;
  supplierId: string;
  inventoryItemId: string;
  supplierSku: string | null;
  packSize: string | null;
  packUnit: string | null;
  packCost: string;
  contractedPrice: string | null;
  lastPurchasePrice: string | null;
  preferred: boolean | null;
}

interface InventoryItem { id: string; name: string; sku: string | null; unit: string | null; }

const PAYMENT_TERMS = ["IMMEDIATE", "NET_7", "NET_15", "NET_30", "NET_60"];

const EMPTY_FORM = {
  name: "", supplierCode: "", contactName: "", phone: "", email: "",
  city: "", state: "", country: "", notes: "",
  paymentTerms: "NET_30", creditLimit: "", currency: "AED", gstNumber: "", panNumber: "",
  bankName: "", bankAccount: "", bankIfsc: "",
  rating: "0", isPreferred: false, active: true,
};

const EMPTY_CATALOG = {
  inventoryItemId: "", supplierSku: "", packSize: "1", packUnit: "kg", packCost: "", preferred: false,
};

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <Star
          key={n}
          className={`h-5 w-5 transition-colors ${onChange ? "cursor-pointer" : ""} ${n <= value ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
          onClick={() => onChange?.(n)}
          data-testid={`star-rating-${n}`}
        />
      ))}
    </div>
  );
}

export default function SuppliersTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [catalogSupplierId, setCatalogSupplierId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogForm, setCatalogForm] = useState(EMPTY_CATALOG);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPreferred, setFilterPreferred] = useState(false);

  const fmt = (v: number) => {
    const tenant = (user as Record<string, unknown>)?.tenant as Record<string, unknown> | undefined;
    return formatCurrency(v, String(tenant?.currency || "AED"), {
      position: (tenant?.currencyPosition as "before" | "after") || "before",
      decimals: (tenant?.currencyDecimals as number) ?? 2,
    });
  };

  const { data: suppliers = [], isLoading } = useQuery<PaginatedResponse<Supplier>, Error, Supplier[]>({ queryKey: ["/api/suppliers"], select: selectPageData });
  const { data: inventoryRes } = useQuery<{ data: InventoryItem[]; total: number }>({ queryKey: ["/api/inventory"] });
  const inventoryItems = inventoryRes?.data ?? [];
  const { data: catalog = [] } = useQuery<CatalogItem[]>({
    queryKey: ["/api/suppliers", catalogSupplierId, "catalog"],
    queryFn: () =>
      catalogSupplierId
        ? apiRequest("GET", `/api/suppliers/${catalogSupplierId}/catalog`).then(r => r.json())
        : Promise.resolve([]),
    enabled: !!catalogSupplierId,
  });

  const invMap = new Map(inventoryItems.map(i => [i.id, i]));

  const onErr = (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/suppliers"] });

  const createMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/suppliers", d).then(r => r.json()),
    onSuccess: () => { invalidate(); setDrawerOpen(false); toast({ title: "Supplier created" }); },
    onError: onErr,
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/suppliers/${id}`, d).then(r => r.json()),
    onSuccess: () => { invalidate(); setDrawerOpen(false); toast({ title: "Supplier updated" }); },
    onError: onErr,
  });
  const addCatalogMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => apiRequest("POST", "/api/supplier-catalog-items", d).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/suppliers", catalogSupplierId, "catalog"] });
      setCatalogForm(EMPTY_CATALOG);
      toast({ title: "Catalog item added" });
    },
    onError: onErr,
  });
  const removeCatalogMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/supplier-catalog-items/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/suppliers", catalogSupplierId, "catalog"] });
      toast({ title: "Removed" });
    },
    onError: onErr,
  });

  const openCreate = () => {
    const n = suppliers.length + 1;
    setEditId(null);
    setForm({ ...EMPTY_FORM, supplierCode: `SUP-${String(n).padStart(4, "0")}` });
    setDrawerOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditId(s.id);
    setForm({
      name: s.name,
      supplierCode: s.supplierCode || "",
      contactName: s.contactName || "",
      email: s.email || "",
      phone: s.phone || "",
      city: s.city || "",
      state: s.state || "",
      country: s.country || "",
      notes: s.notes || "",
      paymentTerms: s.paymentTerms || "NET_30",
      creditLimit: s.creditLimit || "",
      currency: s.currency || "AED",
      gstNumber: s.gstNumber || "",
      panNumber: s.panNumber || "",
      bankName: s.bankName || "",
      bankAccount: s.bankAccount || "",
      bankIfsc: s.bankIfsc || "",
      rating: String(s.rating ?? 0),
      isPreferred: s.isPreferred ?? false,
      active: s.active !== false,
    });
    setDrawerOpen(true);
  };

  const handleSave = () => {
    const payload: Record<string, unknown> = {
      ...form,
      leadTimeDays: 7,
      rating: String(parseFloat(form.rating) || 0),
      creditLimit: form.creditLimit ? String(parseFloat(form.creditLimit)) : null,
      isPreferred: form.isPreferred,
      active: form.active,
    };
    if (editId) updateMut.mutate({ id: editId, d: payload });
    else createMut.mutate(payload);
  };

  const handleAddCatalog = () => {
    if (!catalogSupplierId || !catalogForm.inventoryItemId || !catalogForm.packCost) return;
    addCatalogMut.mutate({
      supplierId: catalogSupplierId,
      inventoryItemId: catalogForm.inventoryItemId,
      supplierSku: catalogForm.supplierSku,
      packSize: parseFloat(catalogForm.packSize) || 1,
      packUnit: catalogForm.packUnit,
      packCost: parseFloat(catalogForm.packCost),
      preferred: catalogForm.preferred,
    });
  };

  const openCatalog = (id: string) => { setCatalogSupplierId(id); setCatalogOpen(true); };

  const filteredSuppliers = suppliers.filter(s => {
    if (filterStatus === "active" && !s.active) return false;
    if (filterStatus === "inactive" && s.active !== false) return false;
    if (filterPreferred && !s.isPreferred) return false;
    return true;
  });

  const isSaving = createMut.isPending || updateMut.isPending;

  const f = (field: keyof typeof form, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36" data-testid="select-filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={filterPreferred ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterPreferred(p => !p)}
            data-testid="button-filter-preferred"
          >
            <Star className={`h-4 w-4 mr-1 ${filterPreferred ? "fill-white" : ""}`} />
            Preferred
          </Button>
        </div>
        <Button onClick={openCreate} data-testid="button-add-supplier">
          <Plus className="h-4 w-4 mr-2" />Add Supplier
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No suppliers found. Add your first supplier.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Payment Terms</TableHead>
                  <TableHead>GST/Tax</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map(s => (
                  <TableRow key={s.id} data-testid={`row-supplier-${s.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-medium" data-testid={`text-supplier-name-${s.id}`}>{s.name}</span>
                        {s.isPreferred && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" data-testid={`icon-preferred-${s.id}`} />}
                      </div>
                      {s.supplierCode && <div className="text-xs text-muted-foreground" data-testid={`text-supplier-code-${s.id}`}>{s.supplierCode}</div>}
                    </TableCell>
                    <TableCell>
                      {s.contactName && <div className="text-sm">{s.contactName}</div>}
                      {s.email && <div className="text-xs text-muted-foreground">{s.email}</div>}
                      {s.phone && <div className="text-xs text-muted-foreground">{s.phone}</div>}
                    </TableCell>
                    <TableCell data-testid={`text-city-${s.id}`}>
                      {[s.city, s.state, s.country].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell data-testid={`text-payment-terms-${s.id}`}>{s.paymentTerms || "—"}</TableCell>
                    <TableCell data-testid={`text-gst-${s.id}`}>
                      {s.gstNumber ? <span className="text-xs font-mono">{s.gstNumber}</span> : "—"}
                    </TableCell>
                    <TableCell>
                      <StarRating value={Math.round(parseFloat(s.rating || "0"))} />
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={s.active !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}
                        data-testid={`badge-status-${s.id}`}
                      >
                        {s.active !== false ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(s)} data-testid={`button-edit-supplier-${s.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openCatalog(s.id)} data-testid={`button-view-catalog-${s.id}`}>
                          <BookOpen className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Supplier Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editId ? "Edit Supplier" : "Add Supplier"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 py-4">
            {/* Section 1 — Basic */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Basic Information</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Supplier Name *</Label>
                  <Input
                    value={form.name}
                    onChange={e => f("name", e.target.value)}
                    placeholder="e.g. Fresh Foods Ltd"
                    data-testid="input-supplier-name"
                  />
                </div>
                <div>
                  <Label>Supplier Code</Label>
                  <Input value={form.supplierCode} onChange={e => f("supplierCode", e.target.value)} placeholder="SUP-0001" data-testid="input-supplier-code" />
                </div>
                <div>
                  <Label>Contact Person</Label>
                  <Input value={form.contactName} onChange={e => f("contactName", e.target.value)} placeholder="Contact name" data-testid="input-contact-name" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={e => f("phone", e.target.value)} placeholder="+971 50 000 0000" data-testid="input-phone" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={form.email} onChange={e => f("email", e.target.value)} placeholder="supplier@email.com" data-testid="input-email" />
                </div>
                <div>
                  <Label>City</Label>
                  <Input value={form.city} onChange={e => f("city", e.target.value)} placeholder="Dubai" data-testid="input-city" />
                </div>
                <div>
                  <Label>State</Label>
                  <Input value={form.state} onChange={e => f("state", e.target.value)} placeholder="Dubai" data-testid="input-state" />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input value={form.country} onChange={e => f("country", e.target.value)} placeholder="UAE" data-testid="input-country" />
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Input value={form.notes} onChange={e => f("notes", e.target.value)} placeholder="Notes about this supplier" data-testid="input-notes" />
                </div>
              </div>
            </div>

            <Separator />
            {/* Section 2 — Financial */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Financial</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Payment Terms</Label>
                  <Select value={form.paymentTerms} onValueChange={v => f("paymentTerms", v)}>
                    <SelectTrigger data-testid="select-payment-terms"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Credit Limit</Label>
                  <Input type="number" value={form.creditLimit} onChange={e => f("creditLimit", e.target.value)} placeholder="0.00" data-testid="input-credit-limit" />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Input value={form.currency} onChange={e => f("currency", e.target.value)} placeholder="AED" data-testid="input-currency" />
                </div>
                <div>
                  <Label>GST Number</Label>
                  <Input value={form.gstNumber} onChange={e => f("gstNumber", e.target.value)} placeholder="GST number" data-testid="input-gst-number" />
                </div>
                <div>
                  <Label>PAN Number</Label>
                  <Input value={form.panNumber} onChange={e => f("panNumber", e.target.value)} placeholder="PAN number" data-testid="input-pan-number" />
                </div>
              </div>
            </div>

            <Separator />
            {/* Section 3 — Bank */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Bank Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Bank Name</Label>
                  <Input value={form.bankName} onChange={e => f("bankName", e.target.value)} placeholder="Emirates NBD" data-testid="input-bank-name" />
                </div>
                <div>
                  <Label>Account Number</Label>
                  <Input value={form.bankAccount} onChange={e => f("bankAccount", e.target.value)} placeholder="Account number" data-testid="input-bank-account" />
                </div>
                <div>
                  <Label>IFSC / IBAN</Label>
                  <Input value={form.bankIfsc} onChange={e => f("bankIfsc", e.target.value)} placeholder="IFSC or IBAN" data-testid="input-bank-ifsc" />
                </div>
              </div>
            </div>

            <Separator />
            {/* Section 4 — Settings */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Settings</h3>
              <div className="space-y-3">
                <div>
                  <Label className="mb-1 block">Rating</Label>
                  <StarRating
                    value={Math.round(parseFloat(form.rating))}
                    onChange={v => f("rating", String(v))}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.isPreferred}
                    onCheckedChange={v => f("isPreferred", v)}
                    id="preferred-toggle"
                    data-testid="switch-preferred"
                  />
                  <Label htmlFor="preferred-toggle">Preferred Supplier</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.active}
                    onCheckedChange={v => f("active", v)}
                    id="active-toggle"
                    data-testid="switch-active"
                  />
                  <Label htmlFor="active-toggle">Active</Label>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSave}
                disabled={isSaving || !form.name}
                data-testid="button-save-supplier"
                className="flex-1"
              >
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editId ? "Update" : "Create"} Supplier
              </Button>
              <Button variant="outline" onClick={() => setDrawerOpen(false)} data-testid="button-cancel-supplier">
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Catalogue Panel */}
      <Dialog open={catalogOpen} onOpenChange={open => { setCatalogOpen(open); if (!open) setCatalogSupplierId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Supplier Catalogue — {suppliers.find(s => s.id === catalogSupplierId)?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-muted/20">
              <div>
                <Label className="text-xs">Inventory Item</Label>
                <Select value={catalogForm.inventoryItemId} onValueChange={v => setCatalogForm(c => ({ ...c, inventoryItemId: v }))}>
                  <SelectTrigger data-testid="select-catalog-item"><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    {inventoryItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Supplier SKU</Label>
                <Input
                  value={catalogForm.supplierSku}
                  onChange={e => setCatalogForm(c => ({ ...c, supplierSku: e.target.value }))}
                  placeholder="SKU"
                  data-testid="input-catalog-sku"
                />
              </div>
              <div>
                <Label className="text-xs">Pack Size</Label>
                <Input
                  type="number"
                  value={catalogForm.packSize}
                  onChange={e => setCatalogForm(c => ({ ...c, packSize: e.target.value }))}
                  data-testid="input-catalog-pack-size"
                />
              </div>
              <div>
                <Label className="text-xs">Pack Unit</Label>
                <Input
                  value={catalogForm.packUnit}
                  onChange={e => setCatalogForm(c => ({ ...c, packUnit: e.target.value }))}
                  placeholder="kg, pcs, box"
                  data-testid="input-catalog-pack-unit"
                />
              </div>
              <div>
                <Label className="text-xs">Pack Cost</Label>
                <Input
                  type="number"
                  value={catalogForm.packCost}
                  onChange={e => setCatalogForm(c => ({ ...c, packCost: e.target.value }))}
                  placeholder="0.00"
                  data-testid="input-catalog-pack-cost"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleAddCatalog}
                  disabled={addCatalogMut.isPending || !catalogForm.inventoryItemId || !catalogForm.packCost}
                  data-testid="button-add-catalog-item"
                  size="sm"
                >
                  {addCatalogMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  <Plus className="h-4 w-4 mr-1" />Add Item
                </Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Pack</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalog.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No catalogue items yet</TableCell>
                  </TableRow>
                ) : catalog.map(c => (
                  <TableRow key={c.id} data-testid={`row-catalog-${c.id}`}>
                    <TableCell>{invMap.get(c.inventoryItemId)?.name || c.inventoryItemId}</TableCell>
                    <TableCell>{c.supplierSku || "—"}</TableCell>
                    <TableCell>{c.packSize} {c.packUnit}</TableCell>
                    <TableCell>{fmt(parseFloat(c.packCost))}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeCatalogMut.mutate(c.id)}
                        disabled={removeCatalogMut.isPending}
                        data-testid={`button-remove-catalog-${c.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatalogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
