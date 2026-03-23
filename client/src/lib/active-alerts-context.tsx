import { createContext, useContext, useState, ReactNode } from "react";

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
