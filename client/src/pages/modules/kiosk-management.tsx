import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Monitor, Plus, Trash2, Copy, Settings, Zap, ArrowRight, Eye, EyeOff,
} from "lucide-react";
import type { Outlet, MenuItem, MenuCategory } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface KioskDevice {
  id: string;
  tenantId: string;
  outletId: string | null;
  name: string;
  deviceToken: string;
  active: boolean;
  settings: Record<string, unknown> | null;
  createdAt: string;
}

interface UpsellRule {
  id: string;
  tenantId: string;
  triggerItemId: string | null;
  triggerCategoryId: string | null;
  suggestItemId: string | null;
  label: string;
  priority: number;
  active: boolean;
  createdAt: string;
}

export default function KioskManagementPage() {
  return (
    <div className="space-y-6 p-6" data-testid="kiosk-management-page">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Monitor className="h-6 w-6 text-primary" /> Kiosk Management
        </h1>
        <p className="text-muted-foreground">Manage self-ordering kiosk devices and upsell rules</p>
      </div>

      <Tabs defaultValue="devices">
        <TabsList>
          <TabsTrigger value="devices" data-testid="tab-devices">
            <Monitor className="h-4 w-4 mr-1" /> Devices
          </TabsTrigger>
          <TabsTrigger value="upsell" data-testid="tab-upsell">
            <Zap className="h-4 w-4 mr-1" /> Upsell Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="devices">
          <DevicesTab />
        </TabsContent>
        <TabsContent value="upsell">
          <UpsellTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DevicesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOutletId, setNewOutletId] = useState<string>("none");
  const [showTokenId, setShowTokenId] = useState<string | null>(null);

  const { data: devices = [] } = useQuery<KioskDevice[]>({
    queryKey: ["/api/kiosk-devices"],
  });

  const { data: outlets = [] } = useQuery<Outlet[]>({
    queryKey: ["/api/outlets"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; outletId?: string }) => {
      const res = await apiRequest("POST", "/api/kiosk-devices", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kiosk-devices"] });
      setAddDialogOpen(false);
      setNewName("");
      setNewOutletId("none");
      toast({ title: "Device created" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/kiosk-devices/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kiosk-devices"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/kiosk-devices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kiosk-devices"] });
      toast({ title: "Device deleted" });
    },
  });

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast({ title: "Token copied to clipboard" });
  };

  const getKioskUrl = (token: string) => {
    return `${window.location.origin}/kiosk?token=${token}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{devices.length} device(s) registered</p>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-device">
              <Plus className="h-4 w-4 mr-1" /> Add Device
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register New Kiosk Device</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Device Name</label>
                <Input
                  data-testid="input-device-name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Front Entrance Kiosk"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Outlet</label>
                <Select value={newOutletId} onValueChange={setNewOutletId}>
                  <SelectTrigger data-testid="select-device-outlet">
                    <SelectValue placeholder="Select outlet..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No outlet assigned</SelectItem>
                    {outlets.map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                data-testid="button-create-device"
                onClick={() => createMutation.mutate({ name: newName, outletId: newOutletId === "none" ? undefined : newOutletId })}
                disabled={!newName.trim() || createMutation.isPending}
                className="w-full"
              >
                Create Device
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {devices.map(device => {
          const outlet = outlets.find(o => o.id === device.outletId);
          return (
            <Card key={device.id} data-testid={`card-device-${device.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Monitor className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{device.name}</h3>
                      <Badge variant={device.active ? "default" : "secondary"}>
                        {device.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {outlet ? outlet.name : "No outlet assigned"}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                        {showTokenId === device.id ? device.deviceToken : `${device.deviceToken.slice(0, 12)}...`}
                      </code>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowTokenId(showTokenId === device.id ? null : device.id)} data-testid={`button-toggle-token-${device.id}`}>
                        {showTokenId === device.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToken(device.deviceToken)} data-testid={`button-copy-token-${device.id}`}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => { navigator.clipboard.writeText(getKioskUrl(device.deviceToken)); toast({ title: "Kiosk URL copied" }); }} data-testid={`button-copy-url-${device.id}`}>
                        Copy Kiosk URL
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={device.active}
                      onCheckedChange={active => toggleMutation.mutate({ id: device.id, active })}
                      data-testid={`switch-device-active-${device.id}`}
                    />
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(device.id)} data-testid={`button-delete-device-${device.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {devices.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Monitor className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No kiosk devices registered yet</p>
            <p className="text-sm">Click "Add Device" to register a new kiosk</p>
          </div>
        )}
      </div>
    </div>
  );
}

function UpsellTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newTriggerCategoryId, setNewTriggerCategoryId] = useState("none");
  const [newSuggestItemId, setNewSuggestItemId] = useState("none");
  const [newPriority, setNewPriority] = useState("5");

  const { data: rules = [] } = useQuery<UpsellRule[]>({
    queryKey: ["/api/upsell-rules"],
  });

  const { data: categories = [] } = useQuery<MenuCategory[]>({
    queryKey: ["/api/menu-categories"],
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/upsell-rules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/upsell-rules"] });
      setAddDialogOpen(false);
      setNewLabel("");
      setNewTriggerCategoryId("none");
      setNewSuggestItemId("none");
      setNewPriority("5");
      toast({ title: "Upsell rule created" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/upsell-rules/${id}`, { active });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/upsell-rules"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/upsell-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/upsell-rules"] });
      toast({ title: "Upsell rule deleted" });
    },
  });

  const getCategoryName = (id: string | null) => {
    if (!id) return "Any";
    return categories.find(c => c.id === id)?.name || "Unknown";
  };

  const getItemName = (id: string | null) => {
    if (!id) return "None";
    return menuItems.find(m => m.id === id)?.name || "Unknown";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{rules.length} upsell rule(s)</p>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-upsell">
              <Plus className="h-4 w-4 mr-1" /> Add Upsell Rule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Upsell Rule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">When customer orders from category</label>
                <Select value={newTriggerCategoryId} onValueChange={setNewTriggerCategoryId}>
                  <SelectTrigger data-testid="select-trigger-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select category...</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Suggest this item</label>
                <Select value={newSuggestItemId} onValueChange={setNewSuggestItemId}>
                  <SelectTrigger data-testid="select-suggest-item">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select item...</SelectItem>
                    {menuItems.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Display Label</label>
                <Input
                  data-testid="input-upsell-label"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="e.g. Add a dessert to complete your meal!"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Priority (higher = shown first)</label>
                <Input
                  data-testid="input-upsell-priority"
                  type="number"
                  value={newPriority}
                  onChange={e => setNewPriority(e.target.value)}
                />
              </div>
              <Button
                data-testid="button-create-upsell"
                onClick={() => createMutation.mutate({
                  triggerCategoryId: newTriggerCategoryId === "none" ? null : newTriggerCategoryId,
                  suggestItemId: newSuggestItemId === "none" ? null : newSuggestItemId,
                  label: newLabel,
                  priority: parseInt(newPriority) || 5,
                  active: true,
                })}
                disabled={!newLabel.trim() || newSuggestItemId === "none" || createMutation.isPending}
                className="w-full"
              >
                Create Rule
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {rules.map(rule => (
          <Card key={rule.id} data-testid={`card-upsell-rule-${rule.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Zap className="h-5 w-5 text-amber-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-sm">{rule.label}</h3>
                    <Badge variant={rule.active ? "default" : "secondary"} className="text-xs">
                      {rule.active ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">P{rule.priority}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {getCategoryName(rule.triggerCategoryId)}
                    <ArrowRight className="h-3 w-3" />
                    Suggest: {getItemName(rule.suggestItemId)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={rule.active}
                    onCheckedChange={active => toggleMutation.mutate({ id: rule.id, active })}
                    data-testid={`switch-upsell-active-${rule.id}`}
                  />
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(rule.id)} data-testid={`button-delete-upsell-${rule.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {rules.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No upsell rules configured yet</p>
            <p className="text-sm">Create rules to suggest items during kiosk ordering</p>
          </div>
        )}
      </div>
    </div>
  );
}
