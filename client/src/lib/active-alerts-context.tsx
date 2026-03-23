import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/lib/auth";

export interface ActiveAlert {
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
  receivedAt: number;
}

interface PendingAlertEvent {
  id: string;
  alert_code: string;
  urgency: string;
  message: string;
  target_roles: unknown;
  outlet_id: string | null;
  created_at: string | null;
}

interface PendingAlertsResponse {
  count: number;
  events: PendingAlertEvent[];
}

interface AlertMeta {
  alertName: string;
  soundKey: string;
  volume: number;
  requiresAcknowledge: boolean;
}

const ALERT_META: Record<string, AlertMeta> = {
  "ALERT-01": { alertName: "New Order", soundKey: "new_order", volume: 80, requiresAcknowledge: false },
  "ALERT-02": { alertName: "Rush / VIP Order", soundKey: "rush_order", volume: 80, requiresAcknowledge: false },
  "ALERT-03": { alertName: "Allergy Alert", soundKey: "allergy_alarm", volume: 100, requiresAcknowledge: true },
  "ALERT-04": { alertName: "Order Ready", soundKey: "order_ready", volume: 80, requiresAcknowledge: false },
  "ALERT-05": { alertName: "Item Overdue", soundKey: "overdue_warning", volume: 80, requiresAcknowledge: false },
  "ALERT-06": { alertName: "Waiter Called (QR)", soundKey: "waiter_call", volume: 80, requiresAcknowledge: false },
  "ALERT-07": { alertName: "Kitchen Printer Offline", soundKey: "printer_error", volume: 80, requiresAcknowledge: false },
  "ALERT-08": { alertName: "Cashier Printer Offline", soundKey: "printer_error", volume: 80, requiresAcknowledge: false },
  "ALERT-09": { alertName: "Void Request Pending", soundKey: "attention_chime", volume: 80, requiresAcknowledge: true },
  "ALERT-10": { alertName: "Out of Stock", soundKey: "stock_alert", volume: 80, requiresAcknowledge: false },
  "ALERT-11": { alertName: "Delivery At Risk", soundKey: "urgent_tone", volume: 80, requiresAcknowledge: false },
  "ALERT-12": { alertName: "Staff Not Clocked In", soundKey: "reminder_chime", volume: 80, requiresAcknowledge: false },
};

const DEFAULT_META: AlertMeta = { alertName: "", soundKey: "attention_chime", volume: 80, requiresAcknowledge: false };

function normalizeUrgency(raw: string): ActiveAlert["urgency"] {
  if (raw === "critical" || raw === "high" || raw === "normal") return raw;
  return "normal";
}

function parseTargetRoles(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((r): r is string => typeof r === "string");
  return [];
}

function hydrateEvent(e: PendingAlertEvent, userRole: string): ActiveAlert | null {
  const roles = parseTargetRoles(e.target_roles);
  if (roles.length > 0 && !roles.map(r => r.toLowerCase()).includes(userRole)) return null;
  const meta = ALERT_META[e.alert_code] ?? { ...DEFAULT_META, alertName: e.alert_code };
  return {
    eventId: e.id,
    alertCode: e.alert_code,
    alertName: meta.alertName,
    soundKey: meta.soundKey,
    volume: meta.volume,
    urgency: normalizeUrgency(e.urgency ?? "normal"),
    requiresAcknowledge: meta.requiresAcknowledge,
    targetRoles: roles,
    message: e.message ?? "",
    outletId: e.outlet_id ?? undefined,
    receivedAt: e.created_at ? new Date(e.created_at).getTime() : Date.now(),
  };
}

interface ActiveAlertsContextValue {
  activeAlerts: ActiveAlert[];
  addAlert: (alert: ActiveAlert) => void;
  removeAlert: (eventId: string) => void;
  clearAll: () => void;
}

const ActiveAlertsContext = createContext<ActiveAlertsContextValue>({
  activeAlerts: [],
  addAlert: () => {},
  removeAlert: () => {},
  clearAll: () => {},
});

export function ActiveAlertsProvider({ children }: { children: ReactNode }) {
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function loadPending() {
      try {
        const res = await fetch("/api/alerts/pending", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as PendingAlertsResponse;
        if (!Array.isArray(data.events) || data.events.length === 0) return;
        const userRole = user!.role.toLowerCase();
        const hydrated = data.events
          .map(e => hydrateEvent(e, userRole))
          .filter((a): a is ActiveAlert => a !== null);
        if (!cancelled && hydrated.length > 0) {
          setActiveAlerts(prev => {
            const existingIds = new Set(prev.map(a => a.eventId));
            const newAlerts = hydrated.filter(a => !existingIds.has(a.eventId));
            return newAlerts.length > 0 ? [...prev, ...newAlerts] : prev;
          });
        }
      } catch (_) {}
    }
    loadPending();
    return () => { cancelled = true; };
  }, [user?.id]);

  const addAlert = (alert: ActiveAlert) => {
    setActiveAlerts(prev => {
      if (prev.some(a => a.eventId === alert.eventId)) return prev;
      return [...prev, alert];
    });
  };

  const removeAlert = (eventId: string) => {
    setActiveAlerts(prev => prev.filter(a => a.eventId !== eventId));
  };

  const clearAll = () => setActiveAlerts([]);

  return (
    <ActiveAlertsContext.Provider value={{ activeAlerts, addAlert, removeAlert, clearAll }}>
      {children}
    </ActiveAlertsContext.Provider>
  );
}

export function useActiveAlerts() {
  return useContext(ActiveAlertsContext);
}
