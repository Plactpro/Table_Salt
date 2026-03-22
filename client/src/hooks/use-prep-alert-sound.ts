import { useCallback, useRef } from "react";

export type SoundType = "chime" | "beep" | "silent";

interface NotifPref {
  enabled: boolean;
  sound: SoundType;
}

interface NotifPrefs {
  [key: string]: NotifPref;
}

const DEFAULT_SOUND_MAP: Record<string, SoundType> = {
  task_assigned: "chime",
  task_completed: "chime",
  task_overdue: "beep",
  task_issue: "beep",
  task_help: "beep",
  readiness_summary: "silent",
  all_complete: "chime",
};

function loadPrefsForUser(userId?: string | null): NotifPrefs {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(`prep_notif_prefs_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function playChime(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
  osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.5);
}

function playBeep(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(660, ctx.currentTime);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
}

function playUrgent(ctx: AudioContext) {
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(880, ctx.currentTime + i * 0.2);
    gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.15);
    osc.start(ctx.currentTime + i * 0.2);
    osc.stop(ctx.currentTime + i * 0.2 + 0.15);
  }
}

export function usePrepAlertSound(userId?: string | null) {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback((): AudioContext | null => {
    try {
      if (!ctxRef.current) {
        ctxRef.current = new AudioContext();
      }
      if (ctxRef.current.state === "suspended") {
        ctxRef.current.resume();
      }
      return ctxRef.current;
    } catch {
      return null;
    }
  }, []);

  const play = useCallback((priority: "HIGH" | "MEDIUM" | "LOW", eventType?: string) => {
    const prefs = loadPrefsForUser(userId);
    const key = eventType ?? (priority === "HIGH" ? "task_overdue" : "task_completed");
    const pref: NotifPref | undefined = prefs[key];

    if (pref && !pref.enabled) return;

    const soundType: SoundType = pref?.sound ?? DEFAULT_SOUND_MAP[key] ?? (priority === "HIGH" ? "beep" : "chime");
    if (soundType === "silent") return;

    const ctx = getCtx();
    if (!ctx) return;

    try {
      if (priority === "HIGH" && !pref) {
        playUrgent(ctx);
      } else if (soundType === "chime") {
        playChime(ctx);
      } else if (soundType === "beep") {
        if (priority === "HIGH") {
          playUrgent(ctx);
        } else {
          playBeep(ctx);
        }
      }
    } catch {}
  }, [getCtx, userId]);

  return { play };
}
