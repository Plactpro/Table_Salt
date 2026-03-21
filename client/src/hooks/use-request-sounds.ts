import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "qr_requests_muted";

function playTone(freq: number, duration: number, ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function beep(ctx: AudioContext, count: number) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      playTone(880, 0.15, ctx);
    }, i * 220);
  }
}

export function useRequestSounds() {
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem(MUTE_KEY) === "true"; } catch { return false; }
  });
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return ctxRef.current;
  }, []);

  const playAlert = useCallback((priority: "high" | "medium" | "low") => {
    if (muted) return;
    try {
      const ctx = getCtx();
      if (priority === "high") beep(ctx, 3);
      else if (priority === "medium") beep(ctx, 1);
    } catch (_) {}
  }, [muted, getCtx]);

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev;
      try { localStorage.setItem(MUTE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  return { muted, toggleMute, playAlert };
}
