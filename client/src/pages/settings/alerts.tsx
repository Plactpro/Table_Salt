import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { SoundPlayer } from "@/lib/sound-player";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Lock, Volume2, Play, RotateCcw, CheckCircle2 } from "lucide-react";

interface AlertDefinition {
  alertCode: string;
  alertName: string;
  soundKey: string;
  defaultVolume: number;
  defaultEnabled: boolean;
  locked?: boolean;
  lockedEnabled?: boolean;
  minVolume?: number;
}

const ALERT_DEFINITIONS: AlertDefinition[] = [
  { alertCode: "ALERT-01", alertName: "New Order", soundKey: "new_order", defaultVolume: 80, defaultEnabled: true },
  { alertCode: "ALERT-02", alertName: "Rush / VIP Order", soundKey: "rush_order", defaultVolume: 80, defaultEnabled: true },
  { alertCode: "ALERT-03", alertName: "Allergy Alert", soundKey: "allergy_alarm", defaultVolume: 100, defaultEnabled: true, locked: true, lockedEnabled: true, minVolume: 80 },
  { alertCode: "ALERT-04", alertName: "Order Ready", soundKey: "order_ready", defaultVolume: 80, defaultEnabled: true },
  { alertCode: "ALERT-05", alertName: "Item Overdue", soundKey: "overdue_warning", defaultVolume: 80, defaultEnabled: true },
  { alertCode: "ALERT-06", alertName: "Waiter Called (QR)", soundKey: "waiter_call", defaultVolume: 80, defaultEnabled: true },
  { alertCode: "ALERT-07", alertName: "Kitchen Printer Offline", soundKey: "printer_error", defaultVolume: 80, defaultEnabled: true },
  { alertCode: "ALERT-08", alertName: "Cashier Printer Offline", soundKey: "printer_error", defaultVolume: 80, defaultEnabled: true },
  { alertCode: "ALERT-09", alertName: "Void Request Pending", soundKey: "attention_chime", defaultVolume: 80, defaultEnabled: true },
  { alertCode: "ALERT-10", alertName: "Out of Stock", soundKey: "stock_alert", defaultVolume: 80, defaultEnabled: true },
  { alertCode: "ALERT-11", alertName: "Delivery At Risk", soundKey: "urgent_tone", defaultVolume: 80, defaultEnabled: true },
  { alertCode: "ALERT-12", alertName: "Staff Not Clocked In", soundKey: "reminder_chime", defaultVolume: 80, defaultEnabled: true },
];

interface AlertSetting {
  alertCode: string;
  enabled: boolean;
  volume: number;
}

type SettingsMap = Record<string, AlertSetting>;

const soundPlayer = new SoundPlayer();

function buildDefaults(): SettingsMap {
  const map: SettingsMap = {};
  for (const def of ALERT_DEFINITIONS) {
    map[def.alertCode] = {
      alertCode: def.alertCode,
      enabled: def.lockedEnabled ?? def.defaultEnabled,
      volume: def.defaultVolume,
    };
  }
  return map;
}

export default function AlertSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<SettingsMap>(buildDefaults());
  const [testingCode, setTestingCode] = useState<string | null>(null);

  const outletId = (user as any)?.outletId || "default";

  const { data: savedConfig, isLoading } = useQuery({
    queryKey: [`/api/alerts/outlet-configs/${outletId}`],
    queryFn: async () => {
      const res = await fetch(`/api/alerts/outlet-configs/${outletId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json() as Promise<{ alertSettings: AlertSetting[] }>;
    },
  });

  useEffect(() => {
    if (savedConfig?.alertSettings) {
      const map = buildDefaults();
      for (const s of savedConfig.alertSettings) {
        if (map[s.alertCode]) {
          const def = ALERT_DEFINITIONS.find(d => d.alertCode === s.alertCode);
          map[s.alertCode] = {
            ...s,
            enabled: def?.locked ? (def.lockedEnabled ?? true) : s.enabled,
            volume: def?.minVolume ? Math.max(s.volume, def.minVolume) : s.volume,
          };
        }
      }
      setSettings(map);
    }
  }, [savedConfig]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/alerts/outlet-configs/${outletId}`, {
        alertSettings: Object.values(settings),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/alerts/outlet-configs/${outletId}`] });
      toast({ title: "Alert settings saved", description: "Your alert preferences have been updated." });
    },
    onError: () => {
      toast({ title: "Failed to save", description: "Could not save alert settings. Please try again.", variant: "destructive" });
    },
  });

  const handleToggle = (alertCode: string, enabled: boolean) => {
    setSettings(prev => ({
      ...prev,
      [alertCode]: { ...prev[alertCode], enabled },
    }));
  };

  const handleVolume = (alertCode: string, volume: number) => {
    const def = ALERT_DEFINITIONS.find(d => d.alertCode === alertCode);
    const min = def?.minVolume ?? 0;
    setSettings(prev => ({
      ...prev,
      [alertCode]: { ...prev[alertCode], volume: Math.max(volume, min) },
    }));
  };

  const handleEnableAll = () => {
    setSettings(prev => {
      const next = { ...prev };
      for (const def of ALERT_DEFINITIONS) {
        next[def.alertCode] = { ...next[def.alertCode], enabled: true };
      }
      return next;
    });
  };

  const handleResetDefaults = () => {
    setSettings(buildDefaults());
  };

  const handleTestSound = (def: AlertDefinition) => {
    const vol = settings[def.alertCode]?.volume ?? def.defaultVolume;
    setTestingCode(def.alertCode);
    soundPlayer.play(def.soundKey, vol);
    setTimeout(() => setTestingCode(null), 1500);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4" data-testid="page-alert-settings">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Alert Sound Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure which audible alerts are active and at what volume for this outlet.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <Button variant="outline" size="sm" onClick={handleEnableAll} data-testid="button-enable-all-alerts">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Enable All
        </Button>
        <Button variant="outline" size="sm" onClick={handleResetDefaults} data-testid="button-reset-defaults-alerts">
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-[1fr_100px_160px_110px] gap-0 border-b border-border bg-muted/50 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <span>Alert</span>
          <span className="text-center">Enabled</span>
          <span className="text-center">Volume</span>
          <span className="text-center">Test Sound</span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading settings...</div>
        ) : (
          ALERT_DEFINITIONS.map((def, idx) => {
            const setting = settings[def.alertCode];
            const isLocked = def.locked;
            const isLast = idx === ALERT_DEFINITIONS.length - 1;

            return (
              <div
                key={def.alertCode}
                className={`grid grid-cols-[1fr_100px_160px_110px] gap-0 items-center px-4 py-4 ${!isLast ? "border-b border-border" : ""} ${isLocked ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}
              >
                <div className="flex items-center gap-2">
                  {isLocked && <Lock className="h-4 w-4 text-amber-600 shrink-0" />}
                  <div>
                    <p className="text-sm font-medium text-foreground">{def.alertName}</p>
                    {isLocked && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Cannot be disabled</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-center">
                  {isLocked ? (
                    <div className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">LOCKED</span>
                    </div>
                  ) : (
                    <Switch
                      checked={setting?.enabled ?? def.defaultEnabled}
                      onCheckedChange={(v) => handleToggle(def.alertCode, v)}
                      data-testid={`toggle-alert-${def.alertCode}`}
                    />
                  )}
                </div>

                <div className="flex flex-col items-center gap-1 px-3">
                  <div className="flex items-center gap-2 w-full">
                    <Volume2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Slider
                      min={def.minVolume ?? 0}
                      max={100}
                      step={5}
                      value={[setting?.volume ?? def.defaultVolume]}
                      onValueChange={([v]) => handleVolume(def.alertCode, v)}
                      disabled={isLocked && !def.minVolume}
                      className="w-full"
                      data-testid={`slider-volume-${def.alertCode}`}
                    />
                    <span className="text-xs text-muted-foreground w-8 text-right shrink-0">
                      {setting?.volume ?? def.defaultVolume}%
                    </span>
                  </div>
                  {def.minVolume && (
                    <p className="text-[10px] text-amber-600 text-center">min {def.minVolume}%</p>
                  )}
                </div>

                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs gap-1.5"
                    onClick={() => handleTestSound(def)}
                    disabled={testingCode === def.alertCode}
                    data-testid={`button-test-sound-${def.alertCode}`}
                  >
                    <Play className="h-3 w-3" />
                    {testingCode === def.alertCode ? "Playing..." : "Test"}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="px-8"
          data-testid="button-save-alert-settings"
        >
          {saveMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
