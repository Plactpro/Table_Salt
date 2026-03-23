import { useRealtimeConnectionStatus } from "@/hooks/use-realtime";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export function RealtimeStatusBanner() {
  const connected = useRealtimeConnectionStatus();
  const [everConnected, setEverConnected] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (connected) {
      setEverConnected(true);
      setVisible(false);
    } else if (everConnected) {
      setVisible(true);
    }
  }, [connected, everConnected]);

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
