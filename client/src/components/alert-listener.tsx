import { useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { SoundPlayer } from "@/lib/sound-player";
import { useActiveAlerts, ActiveAlert } from "@/lib/active-alerts-context";
import AllergyAckModal from "@/components/allergy-ack-modal";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface PrinterDevice {
  id: string;
  name: string;
  type: string;
  status: "online" | "offline" | "error" | "unknown";
  ipAddress?: string;
  port?: number;
}

interface AlertPayload {
  eventId: string;
  alertCode: string;
  alertName: string;
  soundKey: string;
  volume: number;
  urgency: "critical" | "high" | "normal";
  requiresAcknowledge: boolean;
  targetRoles: string[];
  message: string;
  outletId?: string;
  metadata?: Record<string, unknown>;
}

const AlertListener: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const soundPlayerRef = useRef(new SoundPlayer());
  const { addAlert, removeAlert } = useActiveAlerts();
  const prevPrinterErrorIds = useRef<Set<string>>(new Set());

  const isManagerOrOwner = user?.role === "owner" || user?.role === "manager" ||
    user?.role === "franchise_owner" || user?.role === "outlet_manager";

  const { data: printers = [] } = useQuery<PrinterDevice[]>({
    queryKey: ["/api/printers"],
    queryFn: () => fetch("/api/printers", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 60000,
    enabled: !!isManagerOrOwner,
  });

  useEffect(() => {
    if (!isManagerOrOwner) return;
    const errorPrinters = printers.filter(p => p.status === "error" || p.status === "offline");
    const newErrors = errorPrinters.filter(p => !prevPrinterErrorIds.current.has(p.id));
    newErrors.forEach(p => {
      const printerUrl = p.ipAddress ? `http://${p.ipAddress}:${p.port || 9100}` : null;
      toast({
        title: "Printer Error",
        description: printerUrl
          ? `${p.name}: Cannot reach printer at ${printerUrl}. Check network connection or update printer settings.`
          : `${p.name}: Printer is ${p.status}. Check network connection or printer settings.`,
        variant: "destructive",
        duration: 8000,
      });
    });
    prevPrinterErrorIds.current = new Set(errorPrinters.map(p => p.id));
  }, [printers, isManagerOrOwner, toast]);

  const handleAlertTrigger = useCallback((payload: unknown) => {
    if (!user) return;
    const p = payload as AlertPayload;

    const userRole = user.role.toLowerCase();
    if (p.targetRoles.length > 0 && !p.targetRoles.map(r => r.toLowerCase()).includes(userRole)) return;

    const muted = localStorage.getItem(`alert_mute_${p.alertCode}`) === "true";
    if (!muted) {
      soundPlayerRef.current.play(p.soundKey, p.volume);
    }

    const alert: ActiveAlert = {
      ...p,
      receivedAt: Date.now(),
    };
    addAlert(alert);
  }, [user, addAlert]);

  const handleAlertAcknowledged = useCallback((payload: unknown) => {
    const { eventId } = payload as { eventId: string };
    removeAlert(eventId);
  }, [removeAlert]);

  useRealtimeEvent("alert:trigger", handleAlertTrigger);
  useRealtimeEvent("alert:acknowledged", handleAlertAcknowledged);

  return (
    <div data-testid="alert-listener-root">
      <AllergyAckModal />
    </div>
  );
};

export default AlertListener;
