import { useRealtimeConnectionStatus, useRealtimeReconnectCount } from "@/hooks/use-realtime";
import { WifiOff, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const GRACE_PERIOD_MS = 6000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function RealtimeStatusBanner() {
  const connected = useRealtimeConnectionStatus();
  const reconnectCount = useRealtimeReconnectCount();
  const [everConnected, setEverConnected] = useState(false);
  const [visible, setVisible] = useState(false);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const maxAttemptsReached = reconnectCount >= MAX_RECONNECT_ATTEMPTS;

  useEffect(() => {
    if (connected) {
      if (graceTimer.current) {
        clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
      setEverConnected(true);
      setVisible(false);
    } else if (everConnected) {
      graceTimer.current = setTimeout(() => {
        setVisible(true);
      }, GRACE_PERIOD_MS);
    }

    return () => {
      if (graceTimer.current) {
        clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
    };
  }, [connected, everConnected]);

  if (maxAttemptsReached) {
    return (
      <div
        data-testid="banner-realtime-lost"
        className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-3 bg-red-600 text-white text-sm font-medium py-2 px-4 shadow-md"
      >
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>Connection lost — please reload the page.</span>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-3 text-xs"
          onClick={() => window.location.reload()}
          data-testid="button-reload-page"
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          Reload
        </Button>
      </div>
    );
  }

  if (!visible) return null;

  return (
    <div
      data-testid="banner-realtime-disconnected"
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-yellow-500 text-yellow-950 text-sm font-medium py-2 px-4 shadow-md"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Connection lost — reconnecting...</span>
    </div>
  );
}
