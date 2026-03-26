import { useState, useEffect, useCallback } from "react";
import { syncManager, type SyncQueueItem } from "@/lib/sync-manager";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncErrorPanelProps {
  className?: string;
}

export default function SyncErrorPanel({ className }: SyncErrorPanelProps) {
  const [failedItems, setFailedItems] = useState<SyncQueueItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const items = await syncManager.getFailedQueueItems();
    setFailedItems(items);
  }, []);

  useEffect(() => {
    syncManager.init().then(() => refresh());
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleRetry = async (id: string) => {
    setRetrying(prev => new Set(prev).add(id));
    try {
      await syncManager.requeueFailedItem(id);
      await refresh();
    } finally {
      setRetrying(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleDiscard = async (id: string) => {
    await syncManager.discardQueueItem(id);
    await refresh();
    if (expandedId === id) setExpandedId(null);
  };

  if (failedItems.length === 0) return null;

  return (
    <div
      className={cn("rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2", className)}
      data-testid="sync-error-panel"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <p className="text-sm font-semibold text-destructive">
          {failedItems.length} order{failedItems.length !== 1 ? "s" : ""} failed to sync
        </p>
      </div>
      <div className="space-y-2">
        {failedItems.map((item) => {
          const isExpanded = expandedId === item.id;
          const orderType = (item.payload.orderType as string) || "order";
          const total = item.payload.total as string | undefined;
          const createdAt = new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

          return (
            <div key={item.id} className="rounded-md border border-destructive/20 bg-background p-2.5 space-y-2" data-testid={`sync-error-item-${item.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium capitalize">{orderType.replace("_", " ")} · {createdAt}</p>
                  {total && <p className="text-xs text-muted-foreground">Total: {total}</p>}
                  {item.error && (
                    <p className="text-xs text-destructive mt-0.5 truncate" title={item.error}>
                      {item.error}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => handleRetry(item.id)}
                    disabled={retrying.has(item.id)}
                    data-testid={`button-retry-sync-${item.id}`}
                  >
                    <RotateCcw className={cn("h-3 w-3 mr-1", retrying.has(item.id) && "animate-spin")} />
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDiscard(item.id)}
                    data-testid={`button-discard-sync-${item.id}`}
                    title="Discard this order"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    data-testid={`button-expand-sync-${item.id}`}
                    title="View details"
                  >
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
              {isExpanded && (
                <div className="rounded-sm bg-muted/50 p-2 text-xs font-mono text-muted-foreground overflow-auto max-h-32" data-testid={`sync-error-details-${item.id}`}>
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify({
                      id: item.id,
                      error: item.error,
                      retryCount: item.retryCount,
                      orderType: item.payload.orderType,
                      total: item.payload.total,
                      items: item.payload.items,
                    }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
