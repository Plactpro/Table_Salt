import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Truck, Plus, Star, Package, Phone, Mail, MapPin, Pencil, Trash2, BookOpen } from "lucide-react";

interface Supplier { id: string; tenantId: string; name: string; contactName: string | null; email: string | null; phone: string | null; address: string | null; paymentTerms: string | null; leadTimeDays: number | null; rating: string | null; notes: string | null; active: boolean | null; createdAt: string; }
interface CatalogItem { id: string; tenantId: string; supplierId: string; inventoryItemId: string; supplierSku: string | null; packSize: string | null; packUnit: string | null; packCost: string; contractedPrice: string | null; lastPurchasePrice: string | null; preferred: boolean | null; }
interface InventoryItem { id: string; name: string; sku: string | null; unit: string | null; }

const emptySupplier = { name: "", contactName: "", email: "", phone: "", address: "", paymentTerms: "Net 30", leadTimeDays: 3, rating: "0", notes: "" };
const emptyCatalog = { inventoryItemId: "", supplierSku: "", packSize: "1", packUnit: "kg", packCost: "", contractedPrice: "", preferred: false };

export default function SuppliersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [supplierDialog, setSupplierDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptySupplier);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [catalogDialog, setCatalogDialog] = useState(false);
  const [catalogForm, setCatalogForm] = useState(emptyCatalog);

  const { data: suppliersList = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: inventoryRes } = useQuery<{ data: InventoryItem[]; total: number }>({ queryKey: ["/api/inventory"] });
  const inventoryItems = inventoryRes?.data ?? [];
  const { data: catalog = [] } = useQuery<CatalogItem[]>({
    queryKey: ["/api/suppliers", selectedSupplier, "catalog"],
    queryFn: () => selectedSupplier ? apiRequest("GET", `/api/suppliers/${selectedSupplier}/catalog`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!selectedSupplier,
  });

  const onErr = (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" });
  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });

  const createMut = useMutation({ mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/suppliers", data).then(r => r.json()), onSuccess: () => { inv(); setSupplierDialog(false); toast({ title: "Supplier created" }); }, onError: onErr });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiRequest("PATCH", `/api/suppliers/${id}`, data).then(r => r.json()), onSuccess: () => { inv(); setSupplierDialog(false); toast({ title: "Supplier updated" }); }, onError: onErr });
  const deleteMut = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/suppliers/${id}`).then(r => r.json()), onSuccess: () => { inv(); toast({ title: "Supplier deleted" }); }, onError: onErr });

  const createCatalogMut = useMutation({ mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/supplier-catalog-items", data).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedSupplier, "catalog"] }); setCatalogDialog(false); toast({ title: "Catalog item added" }); }, onError: onErr });
  const deleteCatalogMut = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/supplier-catalog-items/${id}`).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/suppliers", selectedSupplier, "catalog"] }); toast({ title: "Catalog item removed" }); }, onError: onErr });

  const openEdit = (s: Supplier) => {
    setEditId(s.id);
    setForm({ name: s.name, contactName: s.contactName || "", email: s.email || "", phone: s.phone || "", address: s.address || "", paymentTerms: s.paymentTerms || "Net 30", leadTimeDays: s.leadTimeDays || 3, rating: s.rating || "0", notes: s.notes || "" });
    setSupplierDialog(true);
  };
  const openCreate = () => { setEditId(null); setForm(emptySupplier); setSupplierDialog(true); };
  const handleSave = () => {
    const data = { ...form, leadTimeDays: Number(form.leadTimeDays) };
    if (editId) updateMut.mutate({ id: editId, data });
    else createMut.mutate(data);
  };

  const invMap = new Map(inventoryItems.map(i => [i.id, i]));
  const selected = suppliersList.find(s => s.id === selectedSupplier);

  return (
    <div className="p-6 space-y-6" data-testid="suppliers-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Truck className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Suppliers</h1>
            <p className="text-sm text-muted-foreground">Manage suppliers and their product catalogs</p>
          </div>
        </div>
        <Button onClick={openCreate} data-testid="button-add-supplier"><Plus className="h-4 w-4 mr-2" />Add Supplier</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Supplier List</h3>
          {suppliersList.map(s => (
            <Card key={s.id} className={`cursor-pointer transition-colors ${selectedSupplier === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`} onClick={() => setSelectedSupplier(s.id)} data-testid={`supplier-card-${s.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.contactName || "No contact"}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {parseFloat(s.rating || "0") > 0 && <Badge variant="outline" className="text-xs"><Star className="h-3 w-3 mr-1 text-yellow-500" />{s.rating}</Badge>}
                    {!s.active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                  </div>
                </div>
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  {s.paymentTerms && <span>{s.paymentTerms}</span>}
                  {s.leadTimeDays && <span>{s.leadTimeDays}d lead</span>}
                </div>
              </CardContent>
            </Card>
          ))}
          {suppliersList.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No suppliers yet. Add one to get started.</p>}
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{selected.name}</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(selected)} data-testid="button-edit-supplier"><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                    <Button variant="outline" size="sm" className="text-red-500" onClick={() => { deleteMut.mutate(selected.id); setSelectedSupplier(null); }} data-testid="button-delete-supplier"><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="details">
                  <TabsList>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="catalog" data-testid="tab-catalog">Catalog</TabsTrigger>
                  </TabsList>
                  <TabsContent value="details" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span>{selected.phone || "—"}</span></div>
                      <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><span>{selected.email || "—"}</span></div>
                      <div className="flex items-center gap-2 col-span-2"><MapPin className="h-4 w-4 text-muted-foreground" /><span>{selected.address || "—"}</span></div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground">Payment Terms</p>
                        <p className="font-semibold">{selected.paymentTerms || "—"}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground">Lead Time</p>
                        <p className="font-semibold">{selected.leadTimeDays || "—"} days</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground">Rating</p>
                        <p className="font-semibold flex items-center gap-1"><Star className="h-4 w-4 text-yellow-500" />{selected.rating || "0"}/5</p>
                      </div>
                    </div>
                    {selected.notes && <div className="p-3 bg-muted/30 rounded-lg"><p className="text-xs text-muted-foreground mb-1">Notes</p><p className="text-sm">{selected.notes}</p></div>}
                  </TabsContent>
                  <TabsContent value="catalog" className="mt-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold flex items-center gap-2"><BookOpen className="h-4 w-4" />Product Catalog</h4>
                      <Button size="sm" onClick={() => { setCatalogForm(emptyCatalog); setCatalogDialog(true); }} data-testid="button-add-catalog"><Plus className="h-3 w-3 mr-1" />Add Item</Button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-right">Pack Size</TableHead>
                          <TableHead className="text-right">Pack Cost</TableHead>
                          <TableHead className="text-right">Contracted</TableHead>
                          <TableHead>Preferred</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {catalog.map(c => {
                          const inv = invMap.get(c.inventoryItemId);
                          return (
                            <TableRow key={c.id} data-testid={`catalog-row-${c.id}`}>
                              <TableCell className="font-medium">{inv?.name || "—"}</TableCell>
                              <TableCell>{c.supplierSku || "—"}</TableCell>
                              <TableCell className="text-right">{c.packSize} {c.packUnit}</TableCell>
                              <TableCell className="text-right font-semibold">{c.packCost}</TableCell>
                              <TableCell className="text-right">{c.contractedPrice || "—"}</TableCell>
                              <TableCell>{c.preferred ? <Badge className="bg-green-100 text-green-800">Yes</Badge> : "—"}</TableCell>
                              <TableCell><Button variant="ghost" size="sm" className="text-red-500" onClick={() => deleteCatalogMut.mutate(c.id)} data-testid={`button-delete-catalog-${c.id}`}><Trash2 className="h-3 w-3" /></Button></TableCell>
                            </TableRow>
                          );
                        })}
                        {catalog.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No catalog items</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Select a supplier to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={supplierDialog} onOpenChange={setSupplierDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} Supplier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="input-supplier-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Name</Label><Input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} data-testid="input-contact-name" /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} data-testid="input-phone" /></div>
            </div>
            <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} data-testid="input-email" /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} data-testid="input-address" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Payment Terms</Label><Input value={form.paymentTerms} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} data-testid="input-payment-terms" /></div>
              <div><Label>Lead Time (days)</Label><Input type="number" value={form.leadTimeDays} onChange={e => setForm({ ...form, leadTimeDays: parseInt(e.target.value) || 0 })} data-testid="input-lead-time" /></div>
              <div><Label>Rating (0-5)</Label><Input type="number" step="0.1" min="0" max="5" value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })} data-testid="input-rating" /></div>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} data-testid="input-notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name} data-testid="button-save-supplier">{editId ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={catalogDialog} onOpenChange={setCatalogDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Catalog Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Inventory Item *</Label>
              <Select value={catalogForm.inventoryItemId} onValueChange={v => setCatalogForm({ ...catalogForm, inventoryItemId: v })}>
                <SelectTrigger data-testid="select-inventory-item"><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>{inventoryItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({i.sku || "no SKU"})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Supplier SKU</Label><Input value={catalogForm.supplierSku} onChange={e => setCatalogForm({ ...catalogForm, supplierSku: e.target.value })} data-testid="input-supplier-sku" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Pack Size</Label><Input type="number" value={catalogForm.packSize} onChange={e => setCatalogForm({ ...catalogForm, packSize: e.target.value })} data-testid="input-pack-size" /></div>
              <div><Label>Pack Unit</Label><Input value={catalogForm.packUnit} onChange={e => setCatalogForm({ ...catalogForm, packUnit: e.target.value })} data-testid="input-pack-unit" /></div>
              <div><Label>Pack Cost *</Label><Input type="number" step="0.01" value={catalogForm.packCost} onChange={e => setCatalogForm({ ...catalogForm, packCost: e.target.value })} data-testid="input-pack-cost" /></div>
            </div>
            <div><Label>Contracted Price</Label><Input type="number" step="0.01" value={catalogForm.contractedPrice} onChange={e => setCatalogForm({ ...catalogForm, contractedPrice: e.target.value })} data-testid="input-contracted-price" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatalogDialog(false)}>Cancel</Button>
            <Button onClick={() => createCatalogMut.mutate({ ...catalogForm, supplierId: selectedSupplier })} disabled={!catalogForm.inventoryItemId || !catalogForm.packCost} data-testid="button-save-catalog">Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
