import { useState, useEffect } from "react";
import { syncManager, type SyncStatus } from "@/lib/sync-manager";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Loader2, RefreshCw } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

const statusConfig: Record<SyncStatus, { label: string; color: string; icon: typeof Wifi }> = {
  online: { label: "Connected", color: "text-green-500", icon: Wifi },
  offline: { label: "Offline", color: "text-red-500", icon: WifiOff },
  syncing: { label: "Syncing...", color: "text-amber-500", icon: RefreshCw },
};

export default function SyncStatusIndicator({ className }: { className?: string }) {
  const [status, setStatus] = useState<SyncStatus>("online");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    syncManager.init();
    const unsub = syncManager.subscribe((s, p) => {
      setStatus(s);
      setPending(p);
    });
    return unsub;
  }, []);

  const cfg = statusConfig[status];
  const Icon = cfg.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn("flex items-center gap-1.5 cursor-default", className)}
          data-testid="sync-status-indicator"
        >
          {status === "syncing" ? (
            <Loader2 className={cn("h-4 w-4 animate-spin", cfg.color)} />
          ) : (
            <Icon className={cn("h-4 w-4", cfg.color)} />
          )}
          {status === "offline" && pending > 0 && (
            <span className="text-xs font-medium text-red-500" data-testid="text-pending-count">
              {pending} pending
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <p className="font-medium">{cfg.label}</p>
          {pending > 0 && (
            <p className="text-muted-foreground">
              {pending} order{pending !== 1 ? "s" : ""} waiting to sync
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface OfflineBannerProps {
  onViewQueue?: () => void;
}

export function OfflineBanner({ onViewQueue }: OfflineBannerProps) {
  const [status, setStatus] = useState<SyncStatus>("online");
  const [pending, setPending] = useState(0);
  const [synced, setSynced] = useState(0);
  const [showSyncedMsg, setShowSyncedMsg] = useState(false);

  useEffect(() => {
    syncManager.init();
    const unsub = syncManager.subscribe((s, p) => {
      setStatus(s);
      setPending(p);
    });
    const unsubComplete = syncManager.onSyncComplete((count) => {
      setSynced(count);
      setShowSyncedMsg(true);
      setTimeout(() => setShowSyncedMsg(false), 5000);
    });
    return () => { unsub(); unsubComplete(); };
  }, []);

  if (status === "online" && !showSyncedMsg) return null;

  if (showSyncedMsg && status === "online") {
    return (
      <div
        className="w-full bg-green-600 text-white px-4 py-2 text-sm flex items-center justify-center gap-2 shrink-0"
        data-testid="banner-sync-complete"
      >
        <Wifi className="h-4 w-4" />
        <span>All orders synced ✓ ({synced} order{synced !== 1 ? "s" : ""})</span>
      </div>
    );
  }

  if (status === "syncing") {
    return (
      <div
        className="w-full bg-blue-600 text-white px-4 py-2 text-sm flex items-center justify-center gap-2 shrink-0"
        data-testid="banner-syncing"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Syncing {pending} order{pending !== 1 ? "s" : ""}...</span>
      </div>
    );
  }

  if (status === "offline") {
    return (
      <div
        className="w-full bg-amber-500 text-amber-950 px-4 py-2 text-sm flex items-center justify-center gap-2 shrink-0"
        data-testid="banner-offline"
      >
        <WifiOff className="h-4 w-4" />
        <span className="font-medium">
          Working offline{pending > 0 ? ` — ${pending} order${pending !== 1 ? "s" : ""} queued` : ""}
        </span>
        {onViewQueue && pending > 0 && (
          <button
            className="underline font-semibold hover:no-underline ml-1"
            onClick={onViewQueue}
            data-testid="button-view-queued-orders"
          >
            Tap to view
          </button>
        )}
      </div>
    );
  }

  return null;
}
