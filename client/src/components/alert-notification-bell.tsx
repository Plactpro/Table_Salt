import { useState } from "react";
import { Bell, BellRing, VolumeX, Volume2, CheckCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveAlerts, ActiveAlert } from "@/lib/active-alerts-context";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function urgencyStyle(urgency: ActiveAlert["urgency"]) {
  switch (urgency) {
    case "critical":
      return "bg-red-50 dark:bg-red-950/60 border-l-4 border-red-500";
    case "high":
      return "bg-amber-50 dark:bg-amber-950/60 border-l-4 border-amber-500";
    default:
      return "bg-blue-50/30 dark:bg-blue-950/20 border-l-4 border-blue-300 dark:border-blue-700";
  }
}

function urgencyIcon(urgency: ActiveAlert["urgency"]) {
  switch (urgency) {
    case "critical": return "⚠️";
    case "high": return "🔴";
    default: return "🔔";
  }
}

interface AlertRowProps {
  alert: ActiveAlert;
  onAck: (eventId: string) => void;
  onToggleMute: (alertCode: string) => void;
  isMuted: (alertCode: string) => boolean;
}

function AlertRow({ alert, onAck, onToggleMute, isMuted }: AlertRowProps) {
  const muted = isMuted(alert.alertCode);
  const isAllergy = alert.alertCode === "ALERT-03";

  return (
    <div
      className={cn("px-3 py-2.5 flex flex-col gap-1.5", urgencyStyle(alert.urgency))}
      data-testid={`row-alert-${alert.eventId}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="text-base leading-none shrink-0">{urgencyIcon(alert.urgency)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground break-words">{alert.alertName}</p>
            <p className="text-[11px] text-muted-foreground line-clamp-4 mt-0.5" title={alert.message}>{alert.message}</p>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap mt-0.5">
          {timeAgo(alert.receivedAt)}
        </span>
      </div>

      <div className="flex items-center gap-2 pl-6">
        {alert.requiresAcknowledge && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] border-green-500 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
            onClick={() => onAck(alert.eventId)}
            data-testid={`button-ack-alert-${alert.eventId}`}
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            ACK
          </Button>
        )}

        {!isAllergy && (
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-6 px-2 text-[11px]",
              muted ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
            )}
            onClick={() => onToggleMute(alert.alertCode)}
            data-testid={`button-mute-alert-${alert.alertCode}`}
          >
            {muted ? (
              <>
                <VolumeX className="h-3 w-3 mr-1" />
                <span data-testid={`badge-muted-${alert.alertCode}`}>🔇 Muted</span>
              </>
            ) : (
              <>
                <Volume2 className="h-3 w-3 mr-1" />
                Mute
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

type TabType = "critical" | "info";

export default function AlertNotificationBell() {
  const { activeAlerts, removeAlert } = useActiveAlerts();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("critical");
  const [, forceRender] = useState(0);
  const [clearingAll, setClearingAll] = useState(false);

  const isMuted = (alertCode: string) =>
    localStorage.getItem(`alert_mute_${alertCode}`) === "true";

  const toggleMute = (alertCode: string) => {
    const current = isMuted(alertCode);
    if (current) {
      localStorage.removeItem(`alert_mute_${alertCode}`);
    } else {
      localStorage.setItem(`alert_mute_${alertCode}`, "true");
    }
    forceRender(n => n + 1);
  };

  const handleAck = async (eventId: string) => {
    try {
      await apiRequest("POST", `/api/alerts/events/${eventId}/acknowledge`, {});
    } catch (_) {}
    removeAlert(eventId);
  };

  // Split alerts into Critical and Info tabs
  const criticalAlerts = activeAlerts.filter(
    a => (a.urgency === "critical" || a.urgency === "high")
  );
  const infoAlerts = activeAlerts.filter(
    a => a.urgency !== "critical" && a.urgency !== "high"
  );

  const handleClearAllAcknowledged = async () => {
    setClearingAll(true);
    try {
      await apiRequest("POST", "/api/notifications/clear-acknowledged", {});
      infoAlerts.forEach(a => removeAlert(a.eventId));
      toast({ title: "Notifications cleared" });
    } catch (err: any) {
      toast({ title: "Failed to clear", description: err.message, variant: "destructive" });
    }
    setClearingAll(false);
  };

  const criticalCount = criticalAlerts.length;
  const infoCount = infoAlerts.length;
  const hasCritical = criticalCount > 0;

  const infoCountLabel = infoCount > 99 ? "99+" : String(infoCount);

  const visibleAlerts = activeTab === "critical"
    ? criticalAlerts.slice(0, 10)
    : infoAlerts.slice(0, 10);

  return (
    <div className="relative">
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-9 w-9",
            hasCritical
              ? "text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setOpen(v => !v)}
          data-testid="button-alert-bell"
          aria-label={hasCritical ? "Security alerts — critical alerts present" : "Security alerts"}
        >
          {hasCritical ? (
            <BellRing className="h-4 w-4 animate-bounce" aria-hidden="true" />
          ) : (
            <Bell className="h-4 w-4" aria-hidden="true" />
          )}

          {/* Badge: show critical (red) and info (grey) counts */}
          {(criticalCount > 0 || infoCount > 0) && (
            <span
              className="absolute -top-0.5 -right-0.5 flex items-center gap-0.5"
              data-testid="badge-alert-count"
            >
              {criticalCount > 0 && (
                <span
                  className="min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-1 ring-card"
                  data-testid="badge-critical-count"
                >
                  {criticalCount > 9 ? "9+" : criticalCount}
                </span>
              )}
              {infoCount > 0 && (
                <span
                  className="min-w-[16px] h-4 px-0.5 rounded-full bg-muted-foreground/60 text-white text-[10px] font-bold flex items-center justify-center ring-1 ring-card"
                  data-testid="badge-info-count"
                >
                  {infoCountLabel}
                </span>
              )}
            </span>
          )}
        </Button>
      </motion.div>

      <AnimatePresence>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-11 z-50 w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
              data-testid="panel-active-alerts"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Alerts</span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-border">
                <button
                  className={cn(
                    "flex-1 px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors",
                    activeTab === "critical"
                      ? "border-b-2 border-red-500 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/30"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setActiveTab("critical")}
                  data-testid="tab-critical"
                >
                  Critical
                  {criticalCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center">
                      {criticalCount}
                    </span>
                  )}
                </button>
                <button
                  className={cn(
                    "flex-1 px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors",
                    activeTab === "info"
                      ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setActiveTab("info")}
                  data-testid="tab-info"
                >
                  Info
                  {infoCount > 0 && (
                    <span className="bg-muted-foreground/60 text-white text-[10px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center">
                      {infoCountLabel}
                    </span>
                  )}
                </button>
              </div>

              {/* Clear all acknowledged button — Info tab only */}
              {activeTab === "info" && (
                <div className="px-3 py-1.5 border-b border-border/50 bg-muted/20 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                    onClick={handleClearAllAcknowledged}
                    disabled={clearingAll}
                    data-testid="button-clear-acknowledged"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear all acknowledged
                  </Button>
                </div>
              )}

              {/* Alert list */}
              <div className="overflow-y-auto max-h-96 divide-y divide-border/50">
                {visibleAlerts.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    {activeTab === "critical" ? "No critical alerts" : "No info alerts"}
                  </div>
                ) : (
                  visibleAlerts.map(alert => (
                    <AlertRow
                      key={alert.eventId}
                      alert={alert}
                      onAck={handleAck}
                      onToggleMute={toggleMute}
                      isMuted={isMuted}
                    />
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
