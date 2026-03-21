import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, QrCode, Save, Settings, Bell, Utensils, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

interface QrRequestSettings {
  enabledRequestTypes: string[];
  escalationMinutes: { high: number; medium: number; low: number };
  enableStatusFeedback: boolean;
  enableFoodOrdering: boolean;
  requireWaiterConfirmation: boolean;
  welcomeMessage: string;
  soundEnabled: boolean;
  soundTone: "chime" | "beep" | "bell";
}

interface Outlet {
  id: string;
  name: string;
}

const ALL_REQUEST_TYPES = [
  { key: "call_server", label: "Call Waiter" },
  { key: "request_bill", label: "Request Bill" },
  { key: "water_refill", label: "Water Refill" },
  { key: "cleaning", label: "Cleaning" },
  { key: "order_food", label: "Order Food" },
  { key: "feedback", label: "Feedback" },
  { key: "other", label: "Other / Special Request" },
];

const DEFAULT_SETTINGS: QrRequestSettings = {
  enabledRequestTypes: ["call_server", "request_bill", "water_refill", "cleaning", "order_food", "feedback", "other"],
  escalationMinutes: { high: 2, medium: 5, low: 10 },
  enableStatusFeedback: true,
  enableFoodOrdering: true,
  requireWaiterConfirmation: false,
  welcomeMessage: "Welcome! How can we help you today?",
  soundEnabled: true,
  soundTone: "beep",
};

export default function QrRequestSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOutletId, setSelectedOutletId] = useState<string>("");
  const [settings, setSettings] = useState<QrRequestSettings>(DEFAULT_SETTINGS);

  const { data: outlets = [] } = useQuery<Outlet[]>({
    queryKey: ["/api/outlets"],
  });

  const { data: outletData, isLoading } = useQuery<{ qrRequestSettings?: QrRequestSettings }>({
    queryKey: ["/api/outlets", selectedOutletId, "qr-settings"],
    queryFn: async () => {
      const res = await fetch(`/api/outlets/${selectedOutletId}/qr-settings`);
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    enabled: !!selectedOutletId,
  });

  useEffect(() => {
    if (outletData?.qrRequestSettings) {
      setSettings({ ...DEFAULT_SETTINGS, ...outletData.qrRequestSettings });
    } else if (selectedOutletId) {
      setSettings(DEFAULT_SETTINGS);
    }
  }, [outletData, selectedOutletId]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/outlets/${selectedOutletId}/qr-settings`, { settings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outlets", selectedOutletId, "qr-settings"] });
      toast({ title: "QR settings saved successfully" });
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  const toggleType = (key: string) => {
    setSettings(prev => ({
      ...prev,
      enabledRequestTypes: prev.enabledRequestTypes.includes(key)
        ? prev.enabledRequestTypes.filter(t => t !== key)
        : [...prev.enabledRequestTypes, key],
    }));
  };

  return (
    <div className="space-y-6" data-testid="qr-request-settings">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />QR Request Settings
          </h2>
          <p className="text-sm text-muted-foreground">Configure customer request options per outlet</p>
        </div>
        <Button
          disabled={!selectedOutletId || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          data-testid="btn-save-qr-settings"
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>
      </div>

      <div className="max-w-xs">
        <Label className="text-xs">Select Outlet</Label>
        <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
          <SelectTrigger className="mt-1" data-testid="select-outlet">
            <SelectValue placeholder="Choose an outlet..." />
          </SelectTrigger>
          <SelectContent>
            {outlets.map(o => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedOutletId ? (
        <div className="text-center py-12 text-muted-foreground">
          <Settings className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Select an outlet to configure settings</p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card data-testid="card-request-types">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />Enabled Request Types
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ALL_REQUEST_TYPES.map(t => (
                <div key={t.key} className="flex items-center justify-between">
                  <Label className="text-sm font-normal cursor-pointer" htmlFor={`type-${t.key}`}>
                    {t.label}
                  </Label>
                  <Switch
                    id={`type-${t.key}`}
                    checked={settings.enabledRequestTypes.includes(t.key)}
                    onCheckedChange={() => toggleType(t.key)}
                    data-testid={`switch-type-${t.key}`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card data-testid="card-escalation">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Escalation Timers (minutes)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(["high", "medium", "low"] as const).map(p => (
                  <div key={p} className="flex items-center gap-3">
                    <Label className="text-sm w-20 capitalize font-normal">{p} priority</Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={settings.escalationMinutes[p]}
                      onChange={e => setSettings(prev => ({
                        ...prev,
                        escalationMinutes: { ...prev.escalationMinutes, [p]: parseInt(e.target.value) || 5 },
                      }))}
                      className="w-20 h-8 text-sm"
                      data-testid={`escalation-${p}`}
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card data-testid="card-features">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Utensils className="h-4 w-4" />Feature Toggles
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: "enableStatusFeedback", label: "Show status tracker to customers" },
                  { key: "enableFoodOrdering", label: "Enable food ordering via QR" },
                  { key: "requireWaiterConfirmation", label: "Require waiter confirmation before sending to kitchen" },
                ] .map(f => (
                  <div key={f.key} className="flex items-start justify-between gap-3">
                    <Label className="text-sm font-normal leading-tight cursor-pointer" htmlFor={`feat-${f.key}`}>
                      {f.label}
                    </Label>
                    <Switch
                      id={`feat-${f.key}`}
                      checked={!!settings[f.key as keyof QrRequestSettings]}
                      onCheckedChange={v => setSettings(prev => ({ ...prev, [f.key]: v }))}
                      data-testid={`switch-${f.key}`}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card data-testid="card-notifications">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bell className="h-4 w-4" />Notification Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-normal">Sound alerts enabled</Label>
                  <Switch
                    checked={settings.soundEnabled}
                    onCheckedChange={v => setSettings(prev => ({ ...prev, soundEnabled: v }))}
                    data-testid="switch-sound-enabled"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-normal w-24">Alert tone</Label>
                  <Select
                    value={settings.soundTone}
                    onValueChange={v => setSettings(prev => ({ ...prev, soundTone: v as QrRequestSettings["soundTone"] }))}
                    disabled={!settings.soundEnabled}
                  >
                    <SelectTrigger className="flex-1 h-8 text-sm" data-testid="select-sound-tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chime">Chime</SelectItem>
                      <SelectItem value="beep">Beep</SelectItem>
                      <SelectItem value="bell">Bell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="lg:col-span-2" data-testid="card-welcome-message">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Customer Welcome Message</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.welcomeMessage}
                onChange={e => setSettings(prev => ({ ...prev, welcomeMessage: e.target.value }))}
                placeholder="Welcome! How can we help you today?"
                rows={2}
                className="text-sm"
                data-testid="input-welcome-message"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Shown at the top of the customer QR landing page.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
