import { useState, useEffect } from "react";
import { syncManager, type SyncStatus } from "@/lib/sync-manager";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Loader2, CloudOff, RefreshCw } from "lucide-react";
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
