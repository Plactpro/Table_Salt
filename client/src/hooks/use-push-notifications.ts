import { useState, useEffect, useCallback } from "react";

export interface PushNotificationHook {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission | "unknown";
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/vapid-public-key");
    if (!res.ok) return null;
    const data = await res.json();
    return data.publicKey ?? null;
  } catch {
    return null;
  }
}

async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export function usePushNotifications(): PushNotificationHook {
  const isSupported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  const [permission, setPermission] = useState<NotificationPermission | "unknown">(
    isSupported ? Notification.permission : "unknown"
  );
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (!isSupported) return;

    let cancelled = false;

    async function init() {
      try {
        await navigator.serviceWorker.register("/sw.js");
      } catch {
      }

      const sub = await getCurrentSubscription();
      if (!cancelled) {
        setIsSubscribed(!!sub);
        setPermission(Notification.permission);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      let perm = Notification.permission;
      if (perm === "default") {
        perm = await Notification.requestPermission();
      }
      setPermission(perm);
      if (perm !== "granted") return false;

      const vapidKey = await getVapidPublicKey();
      if (!vapidKey) return false;

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
        credentials: "include",
      });

      if (res.ok) {
        setIsSubscribed(true);
        return true;
      }

      await subscription.unsubscribe();
      return false;
    } catch (err: any) {
      console.warn("[PushNotifications] Subscribe error:", err.message);
      return false;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      const sub = await getCurrentSubscription();
      if (!sub) {
        setIsSubscribed(false);
        return true;
      }

      await fetch("/api/push/unsubscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
        credentials: "include",
      });

      await sub.unsubscribe();
      setIsSubscribed(false);
      return true;
    } catch (err: any) {
      console.warn("[PushNotifications] Unsubscribe error:", err.message);
      return false;
    }
  }, [isSupported]);

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe };
}
