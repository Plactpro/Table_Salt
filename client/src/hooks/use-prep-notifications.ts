import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeEvent } from "./use-realtime";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";

export interface PrepNotification {
  id: string;
  tenantId: string;
  chefId: string | null;
  type: string;
  title: string;
  body?: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
  relatedTaskId?: string | null;
  relatedOrderId?: string | null;
  relatedMenuItem?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  action2Url?: string | null;
  action2Label?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export function usePrepNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<PrepNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await apiRequest("GET", "/api/prep-notifications").then(r => r.json());
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user || fetchedRef.current) return;
    fetchedRef.current = true;
    fetchNotifications();
  }, [user, fetchNotifications]);

  const addOrUpdate = useCallback((notif: PrepNotification) => {
    setNotifications(prev => {
      const idx = prev.findIndex(n => n.id === notif.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = notif;
        return next;
      }
      return [notif, ...prev];
    });
    if (!notif.readAt) {
      setUnreadCount(c => c + 1);
    }
  }, []);

  useRealtimeEvent("prep:notification", (notif: PrepNotification) => {
    addOrUpdate(notif);
  });

  const markRead = useCallback(async (id: string) => {
    try {
      await apiRequest("PATCH", `/api/prep-notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n)
      );
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {}
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/prep-notifications/read-all");
      setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      setUnreadCount(0);
    } catch {}
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    refetch: fetchNotifications,
  };
}
