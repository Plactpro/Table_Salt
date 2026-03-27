import { useState, useEffect, useRef, useCallback } from "react";

export type WakeLockStatus = "active" | "inactive" | "unavailable";

interface WakeLockSentinelExtended extends EventTarget {
  readonly released: boolean;
  readonly type: "screen";
  release(): Promise<void>;
}

interface WakeLockAPI {
  request(type: "screen"): Promise<WakeLockSentinelExtended>;
}

interface NavigatorWithWakeLock extends Navigator {
  wakeLock: WakeLockAPI;
}

function hasWakeLock(nav: Navigator): nav is NavigatorWithWakeLock {
  return "wakeLock" in nav;
}

export function useWakeLock(enabled: boolean = true) {
  const [status, setStatus] = useState<WakeLockStatus>("inactive");
  const wakeLockRef = useRef<WakeLockSentinelExtended | null>(null);

  const requestWakeLock = useCallback(async () => {
    if (!enabled) return;
    if (!hasWakeLock(navigator)) {
      setStatus("unavailable");
      return;
    }
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setStatus("active");
      wakeLockRef.current.addEventListener("release", () => {
        setStatus("inactive");
      });
    } catch {
      setStatus("unavailable");
    }
  }, [enabled]);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {}
      wakeLockRef.current = null;
      setStatus("inactive");
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      releaseWakeLock();
      return;
    }
    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Tab became active — reacquire wake lock
        requestWakeLock();
      } else {
        // Tab hidden/backgrounded — explicitly release per spec
        releaseWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
  }, [enabled, requestWakeLock, releaseWakeLock]);

  return { status };
}
