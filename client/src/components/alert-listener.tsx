import { useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { SoundPlayer } from "@/lib/sound-player";
import { useActiveAlerts, ActiveAlert } from "@/lib/active-alerts-context";
import AllergyAckModal from "@/components/allergy-ack-modal";

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
  const soundPlayerRef = useRef(new SoundPlayer());
  const { addAlert, removeAlert } = useActiveAlerts();

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
