interface ToneConfig {
  freq: number;
  pattern: number[];
}

const TONE_MAP: Record<string, ToneConfig> = {
  new_order:       { freq: 880,  pattern: [150, 80, 150] },
  rush_order:      { freq: 660,  pattern: [100, 50, 100, 50, 100] },
  allergy_alarm:   { freq: 440,  pattern: [300, 100, 300, 100, 500] },
  order_ready:     { freq: 1047, pattern: [200, 100, 200, 100, 400] },
  overdue_warning: { freq: 523,  pattern: [200, 100, 200] },
  waiter_call:     { freq: 784,  pattern: [150, 100, 150] },
  printer_error:   { freq: 330,  pattern: [500, 200, 500] },
  attention_chime: { freq: 659,  pattern: [200, 150, 200] },
  stock_alert:     { freq: 494,  pattern: [300, 150, 300] },
  urgent_tone:     { freq: 392,  pattern: [100, 50, 100, 50, 300] },
  reminder_chime:  { freq: 698,  pattern: [200, 200, 200] },
};

export class SoundPlayer {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.ctx;
  }

  play(soundKey: string, volumePct: number): void {
    const tone = TONE_MAP[soundKey];
    if (!tone) return;

    const schedulePlayback = (ctx: AudioContext) => {
      const gain = ctx.createGain();
      gain.gain.value = Math.min(Math.max(volumePct, 0), 100) / 100;
      gain.connect(ctx.destination);

      let t = ctx.currentTime;
      for (let i = 0; i < tone.pattern.length; i++) {
        const durationMs = tone.pattern[i];
        if (i % 2 === 0) {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = tone.freq;
          osc.connect(gain);
          osc.start(t);
          osc.stop(t + durationMs / 1000);
        }
        t += durationMs / 1000;
      }
    };

    try {
      const ctx = this.getCtx();
      if (ctx.state === "suspended") {
        ctx.resume().then(() => {
          if (ctx.state === "running") {
            schedulePlayback(ctx);
          }
        }).catch(() => {});
      } else if (ctx.state === "running") {
        schedulePlayback(ctx);
      }
    } catch (_) {}
  }

  destroy(): void {
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

export const SOUND_KEYS = Object.keys(TONE_MAP);
