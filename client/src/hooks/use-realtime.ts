import { useEffect, useRef } from "react";

type Handler = (payload: unknown) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Handler>>();
  private delay = 1000;
  private maxDelay = 30000;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;

  start() {
    if (this.active) return;
    this.active = true;
    this._connect();
  }

  stop() {
    this.active = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
  }

  on(event: string, handler: Handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: Handler) {
    this.listeners.get(event)?.delete(handler);
  }

  private _connect() {
    if (!this.active) return;
    try {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      this.ws = new WebSocket(`${proto}//${window.location.host}/ws`);

      this.ws.onopen = () => {
        this.delay = 1000;
      };

      this.ws.onmessage = (evt: MessageEvent) => {
        try {
          const { event, payload } = JSON.parse(evt.data as string) as { event: string; payload: unknown };
          const handlers = this.listeners.get(event);
          if (handlers) handlers.forEach(h => { try { h(payload); } catch (_) {} });
        } catch (_) {}
      };

      this.ws.onclose = () => {
        this.ws = null;
        if (!this.active) return;
        this.timer = setTimeout(() => {
          this.delay = Math.min(this.delay * 2, this.maxDelay);
          this._connect();
        }, this.delay);
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch (_) {}
  }
}

const realtimeClient = new RealtimeClient();

export function useRealtimeEvent(event: string, handler: Handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    realtimeClient.start();

    const stable: Handler = (payload) => handlerRef.current(payload);
    realtimeClient.on(event, stable);
    return () => {
      realtimeClient.off(event, stable);
    };
  }, [event]);
}
