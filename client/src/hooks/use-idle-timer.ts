import { useState, useEffect, useRef, useCallback } from "react";

interface UseIdleTimerOptions {
  timeoutMinutes: number;
  onTimeout: () => void;
  onWarning?: (secondsLeft: number) => void;
  enabled?: boolean;
  warningWindowSeconds?: number;
}

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];

export function useIdleTimer({
  timeoutMinutes,
  onTimeout,
  onWarning,
  enabled = true,
  warningWindowSeconds = 60,
}: UseIdleTimerOptions) {
  const [warningVisible, setWarningVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(warningWindowSeconds);

  const lastActivityRef = useRef(Date.now());
  const warningIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Use a ref for warning state to avoid stale closures in interval callbacks
  const warningActiveRef = useRef(false);

  const onTimeoutRef = useRef(onTimeout);
  const onWarningRef = useRef(onWarning);
  onTimeoutRef.current = onTimeout;
  onWarningRef.current = onWarning;

  const timeoutMs = timeoutMinutes > 0 ? timeoutMinutes * 60 * 1000 : 0;
  const warningThresholdMs = timeoutMs > 0 ? timeoutMs * 0.8 : 0;

  const stopCountdown = useCallback(() => {
    if (warningIntervalRef.current) {
      clearInterval(warningIntervalRef.current);
      warningIntervalRef.current = null;
    }
    warningActiveRef.current = false;
    setWarningVisible(false);
    setSecondsLeft(warningWindowSeconds);
  }, [warningWindowSeconds]);

  const startCountdown = useCallback(() => {
    if (warningActiveRef.current) return;
    warningActiveRef.current = true;
    setWarningVisible(true);

    let remaining = warningWindowSeconds;
    setSecondsLeft(remaining);
    onWarningRef.current?.(remaining);

    warningIntervalRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        if (warningIntervalRef.current) {
          clearInterval(warningIntervalRef.current);
          warningIntervalRef.current = null;
        }
        warningActiveRef.current = false;
        setWarningVisible(false);
        onTimeoutRef.current();
      }
    }, 1000);
  }, [warningWindowSeconds]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (warningActiveRef.current) {
      stopCountdown();
    }
  }, [stopCountdown]);

  // Main idle-check interval — stable, never torn down until unmount or enabled changes
  useEffect(() => {
    if (!enabled || timeoutMs <= 0) {
      stopCountdown();
      if (mainIntervalRef.current) {
        clearInterval(mainIntervalRef.current);
        mainIntervalRef.current = null;
      }
      return;
    }

    lastActivityRef.current = Date.now();

    const handleActivity = () => {
      // Only reset clock while not in warning phase (avoid resetting on mouse move during dialog)
      if (!warningActiveRef.current) {
        lastActivityRef.current = Date.now();
      }
    };

    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, handleActivity, { passive: true }));

    mainIntervalRef.current = setInterval(() => {
      if (warningActiveRef.current) return; // countdown already running
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= warningThresholdMs) {
        startCountdown();
      }
    }, 5000);

    return () => {
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, handleActivity));
      if (mainIntervalRef.current) {
        clearInterval(mainIntervalRef.current);
        mainIntervalRef.current = null;
      }
      if (warningIntervalRef.current) {
        clearInterval(warningIntervalRef.current);
        warningIntervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, timeoutMs, warningThresholdMs]);

  return { warningVisible, secondsLeft, resetTimer };
}
