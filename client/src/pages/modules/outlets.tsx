import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Outlet } from "@shared/schema";
import { motion } from "framer-motion";
import {
  MapPin, Plus, Search, Edit, Trash2, Building2, Truck, Cloud, Store,
  Navigation, Globe, Clock, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { StatCard } from "@/components/widgets/stat-card";

function getBusinessTypeView(businessType: string | undefined) {
  switch (businessType) {
    case "food_truck":
      return {
        icon: Truck,
        label: "Food Truck Locations",
        description: "Manage GPS locations and routes for your food trucks",
        extraFields: ["GPS Coordinates", "Route Schedule"],
        emptyMessage: "No food truck locations configured. Add your first route!",
        cardLabel: "Route",
      };
    case "cloud_kitchen":
      return {
        icon: Cloud,
        label: "Delivery Zones",
        description: "Manage delivery zones and virtual kitchen locations",
        extraFields: ["Delivery Radius", "Zone Coverage"],
        emptyMessage: "No delivery zones configured. Set up your first zone!",
        cardLabel: "Zone",
      };
    case "enterprise":
      return {
        icon: Building2,
        label: "Centralized Outlets",
        description: "Enterprise-wide outlet management across all locations",
        extraFields: ["Region", "District Manager"],
        emptyMessage: "No outlets configured. Add your first enterprise location!",
        cardLabel: "Branch",
      };
    default:
      return {
        icon: Store,
        label: "Outlet Locations",
        description: "Manage your restaurant outlet locations",
        extraFields: [],
        emptyMessage: "No outlets yet. Add your first location!",
        cardLabel: "Outlet",
      };
  }
}

export default function OutletsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    openingHours: "",
    regionId: "",
    isFranchise: false,
    franchiseeName: "",
    royaltyRate: "",
    minimumGuarantee: "",
  });

  const { data: tenant } = useQuery<any>({
    queryKey: ["/api/tenant"],
  });

  const { data: outlets = [], isLoading } = useQuery<Outlet[]>({
    queryKey: ["/api/outlets"],
  });

  const { data: regions = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/regions"],
  });

  const businessType = tenant?.businessType || "casual_dining";
  const view = getBusinessTypeView(businessType);
  const ViewIcon = view.icon;

  function cleanFormData(data: typeof formData) {
    return {
      ...data,
      regionId: data.regionId || null,
      franchiseeName: data.isFranchise ? data.franchiseeName : null,
      royaltyRate: data.isFranchise ? data.royaltyRate : null,
      minimumGuarantee: data.isFranchise ? data.minimumGuarantee : null,
    };
  }

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/outlets", cleanFormData(data));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outlets"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: `${view.cardLabel} added`, description: `${view.cardLabel} created successfully.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await apiRequest("PATCH", `/api/outlets/${id}`, cleanFormData(data));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outlets"] });
      setDialogOpen(false);
      setEditingOutlet(null);
      resetForm();
      toast({ title: `${view.cardLabel} updated` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/outlets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outlets"] });
      toast({ title: "Deleted", description: `${view.cardLabel} removed.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setFormData({ name: "", address: "", openingHours: "", regionId: "", isFranchise: false, franchiseeName: "", royaltyRate: "", minimumGuarantee: "" });
  }

  function openAddDialog() {
    setEditingOutlet(null);
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(outlet: Outlet) {
    setEditingOutlet(outlet);
    setFormData({
      name: outlet.name,
      address: outlet.address || "",
      openingHours: outlet.openingHours || "",
      regionId: outlet.regionId || "",
      isFranchise: outlet.isFranchise || false,
      franchiseeName: outlet.franchiseeName || "",
      royaltyRate: outlet.royaltyRate || "",
      minimumGuarantee: outlet.minimumGuarantee || "",
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!formData.name.trim()) return;
    if (editingOutlet) {
      updateMutation.mutate({ id: editingOutlet.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  const filtered = outlets.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    (o.address && o.address.toLowerCase().includes(search.toLowerCase()))
  );

  const activeOutlets = outlets.filter((o) => o.active);
  const canEdit = user?.role === "owner" || user?.role === "manager";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
      data-testid="page-outlets"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <ViewIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-outlets-title">{view.label}</h1>
            <p className="text-muted-foreground">{view.description}</p>
          </div>
        </div>
        {canEdit && (
          <Button onClick={openAddDialog} data-testid="button-add-outlet">
            <Plus className="h-4 w-4 mr-2" />
            Add {view.cardLabel}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <StatCard
            title={`Total ${view.cardLabel}s`}
            value={outlets.length}
            icon={ViewIcon}
            iconColor="text-teal-600"
            iconBg="bg-teal-100"
            testId="stat-total-outlets"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <StatCard
            title="Active"
            value={activeOutlets.length}
            icon={CheckCircle2}
            iconColor="text-green-600"
            iconBg="bg-green-100"
            testId="stat-active-outlets"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <StatCard
            title="Business Type"
            value={businessType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            icon={Globe}
            iconColor="text-coral-600"
            iconBg="bg-orange-100"
            testId="stat-business-type"
          />
        </motion.div>
      </div>

      {businessType === "food_truck" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-dashed border-teal-300 bg-teal-50/50 dark:bg-teal-950/20 dark:border-teal-800">
            <CardContent className="p-4 flex items-center gap-3">
              <Navigation className="h-5 w-5 text-teal-600" />
              <div>
                <p className="font-medium text-teal-800 dark:text-teal-300" data-testid="text-food-truck-info">GPS Route Tracking</p>
                <p className="text-sm text-teal-600 dark:text-teal-400">Track real-time locations and manage daily routes for your food trucks</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {businessType === "cloud_kitchen" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-dashed border-purple-300 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800">
            <CardContent className="p-4 flex items-center gap-3">
              <Cloud className="h-5 w-5 text-purple-600" />
              <div>
                <p className="font-medium text-purple-800 dark:text-purple-300" data-testid="text-cloud-kitchen-info">Delivery Zone Management</p>
                <p className="text-sm text-purple-600 dark:text-purple-400">Configure delivery zones, radius coverage, and partner integrations</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {businessType === "enterprise" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="p-4 flex items-center gap-3">
              <Building2 className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300" data-testid="text-enterprise-info">Centralized Management</p>
                <p className="text-sm text-amber-600 dark:text-amber-400">Manage all locations from a single dashboard with regional grouping</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`Search ${view.cardLabel.toLowerCase()}s...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-outlets"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading outlets...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <ViewIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground" data-testid="text-no-outlets">{view.emptyMessage}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((outlet, index) => (
            <motion.div
              key={outlet.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="hover-lift transition-shadow-smooth" data-testid={`card-outlet-${outlet.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-teal-100 dark:bg-teal-900">
                        <MapPin className="h-4 w-4 text-teal-700 dark:text-teal-300" />
                      </div>
                      <div>
                        <CardTitle className="text-base" data-testid={`text-outlet-name-${outlet.id}`}>{outlet.name}</CardTitle>
                        {outlet.address && (
                          <CardDescription className="text-xs mt-0.5">{outlet.address}</CardDescription>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={outlet.active ? "default" : "secondary"}
                      className={outlet.active ? "bg-teal-600 hover:bg-teal-700" : ""}
                      data-testid={`badge-outlet-status-${outlet.id}`}
                    >
                      {outlet.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {outlet.openingHours && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{outlet.openingHours}</span>
                    </div>
                  )}
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(outlet)}
                        data-testid={`button-edit-outlet-${outlet.id}`}
                        className="flex-1"
                      >
                        <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteMutation.mutate(outlet.id)}
                        data-testid={`button-delete-outlet-${outlet.id}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOutlet ? `Edit ${view.cardLabel}` : `Add ${view.cardLabel}`}</DialogTitle>
            <DialogDescription>
              {editingOutlet ? `Update the details of this ${view.cardLabel.toLowerCase()}.` : `Add a new ${view.cardLabel.toLowerCase()} to your business.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="outlet-name">Name *</Label>
              <Input
                id="outlet-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={`e.g. ${businessType === "food_truck" ? "Downtown Route" : "Main Branch"}`}
                data-testid="input-outlet-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outlet-address">
                {businessType === "food_truck" ? "GPS Coordinates / Location" : businessType === "cloud_kitchen" ? "Delivery Zone Address" : "Address"}
              </Label>
              <Input
                id="outlet-address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder={businessType === "food_truck" ? "e.g. 40.7128, -74.0060" : "e.g. 123 Main St"}
                data-testid="input-outlet-address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outlet-hours">
                {businessType === "food_truck" ? "Route Schedule" : "Opening Hours"}
              </Label>
              <Input
                id="outlet-hours"
                value={formData.openingHours}
                onChange={(e) => setFormData({ ...formData, openingHours: e.target.value })}
                placeholder="e.g. 9:00 AM - 10:00 PM"
                data-testid="input-outlet-hours"
              />
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <Select value={formData.regionId || "none"} onValueChange={(v) => setFormData({ ...formData, regionId: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="select-outlet-region"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Region</SelectItem>
                  {regions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="outlet-franchise" checked={formData.isFranchise} onChange={(e) => setFormData({ ...formData, isFranchise: e.target.checked })} data-testid="checkbox-franchise" />
              <Label htmlFor="outlet-franchise">Franchise Outlet</Label>
            </div>
            {formData.isFranchise && (
              <div className="space-y-3 pl-4 border-l-2 border-amber-300">
                <div className="space-y-2">
                  <Label>Franchisee Name</Label>
                  <Input value={formData.franchiseeName} onChange={(e) => setFormData({ ...formData, franchiseeName: e.target.value })} placeholder="e.g. Gulf Dining Group LLC" data-testid="input-franchisee-name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Royalty Rate (%)</Label>
                    <Input type="number" step="0.1" value={formData.royaltyRate} onChange={(e) => setFormData({ ...formData, royaltyRate: e.target.value })} placeholder="e.g. 8" data-testid="input-royalty-rate" />
                  </div>
                  <div className="space-y-2">
                    <Label>Min Guarantee</Label>
                    <Input type="number" step="100" value={formData.minimumGuarantee} onChange={(e) => setFormData({ ...formData, minimumGuarantee: e.target.value })} placeholder="e.g. 5000" data-testid="input-min-guarantee" />
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-outlet">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-outlet"
            >
              {editingOutlet ? "Update" : `Add ${view.cardLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}