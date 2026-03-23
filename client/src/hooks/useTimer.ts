import { useState, useEffect, useRef, useCallback } from "react";

export function useTimer(startAt: string | null | undefined, intervalMs = 1000): number {
  const [elapsed, setElapsed] = useState(() =>
    startAt ? Math.floor((Date.now() - new Date(startAt).getTime()) / 1000) : 0
  );

  useEffect(() => {
    if (!startAt) return;
    setElapsed(Math.floor((Date.now() - new Date(startAt).getTime()) / 1000));
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(startAt).getTime()) / 1000));
    }, intervalMs);
    return () => clearInterval(iv);
  }, [startAt, intervalMs]);

  return elapsed;
}

export function useCountdown(targetAt: string | null | undefined, intervalMs = 1000): number {
  const [remaining, setRemaining] = useState(() =>
    targetAt ? Math.max(0, Math.floor((new Date(targetAt).getTime() - Date.now()) / 1000)) : 0
  );

  useEffect(() => {
    if (!targetAt) return;
    setRemaining(Math.max(0, Math.floor((new Date(targetAt).getTime() - Date.now()) / 1000)));
    const iv = setInterval(() => {
      setRemaining(Math.max(0, Math.floor((new Date(targetAt).getTime() - Date.now()) / 1000)));
    }, intervalMs);
    return () => clearInterval(iv);
  }, [targetAt, intervalMs]);

  return remaining;
}

export function formatMMSS(totalSeconds: number): string {
  const mins = Math.floor(Math.abs(totalSeconds) / 60);
  const secs = Math.abs(totalSeconds) % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function getTimingStatus(
  elapsedSec: number,
  estimatedSec: number
): "fast" | "approaching" | "over" | "very_late" {
  if (estimatedSec <= 0) return "fast";
  const pct = elapsedSec / estimatedSec;
  if (pct <= 0.8) return "fast";
  if (pct <= 1.0) return "approaching";
  if (pct <= 1.2) return "over";
  return "very_late";
}

export function useOrderAgeTimer(createdAt: string | null | undefined): number {
  const [elapsed, setElapsed] = useState(() =>
    createdAt ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000) : 0
  );

  useEffect(() => {
    if (!createdAt) return;
    setElapsed(Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [createdAt]);

  return elapsed;
}
