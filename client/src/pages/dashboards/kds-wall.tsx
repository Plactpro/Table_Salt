import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Utensils, Flame, CheckCircle2, Clock, ChefHat } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface KDSWallItem {
  id: string;
  name: string;
  quantity: number | null;
  status: string | null;
  station: string | null;
}

interface KDSWallTicket {
  id: string;
  tableId: string | null;
  tableNumber?: number;
  status: string;
  createdAt: string | null;
  orderType: string | null;
  channel: string | null;
  items: KDSWallItem[];
}

function useElapsedMinutes(createdAt: string | null): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!createdAt) return;
    const iv = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(iv);
  }, [createdAt]);
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function getTimeColor(mins: number) {
  if (mins < 5) return "text-green-400";
  if (mins < 15) return "text-amber-400";
  return "text-red-400";
}

function getTimeBg(mins: number) {
  if (mins >= 15) return "bg-red-950/40 border-red-700";
  if (mins >= 5) return "bg-amber-950/30 border-amber-700";
  return "bg-gray-800/60 border-gray-600";
}

function formatElapsed(mins: number) {
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function WallTicketCard({ ticket }: { ticket: KDSWallTicket }) {
  const mins = useElapsedMinutes(ticket.createdAt);
  const timeColor = getTimeColor(mins);
  const cardBg = getTimeBg(mins);
  const label = ticket.tableNumber
    ? `Table ${ticket.tableNumber}`
    : ticket.orderType === "takeaway"
    ? "Takeaway"
    : `#${ticket.id.slice(-4).toUpperCase()}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.25 }}
      className={`rounded-2xl border-2 p-4 space-y-3 ${cardBg}`}
      data-testid={`wall-ticket-${ticket.id.slice(-4)}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-4xl font-black text-white tracking-tight" data-testid={`wall-table-${ticket.id.slice(-4)}`}>
          {label}
        </span>
        <div className={`flex items-center gap-1.5 ${timeColor}`}>
          <Clock className="h-5 w-5" />
          <span className="text-2xl font-bold tabular-nums">{formatElapsed(mins)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {ticket.items.filter(i => i.status !== "served").map(item => (
          <div key={item.id} className="flex items-center gap-2 text-gray-200">
            <span className="text-lg font-semibold text-white">{item.quantity ?? 1}×</span>
            <span className="text-lg">{item.name}</span>
            {item.station && (
              <Badge variant="outline" className="text-xs border-gray-500 text-gray-400 ml-auto shrink-0">
                {item.station}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function useWallWebSocket(tenantId: string | null, onEvent: () => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!tenantId) return;

    let ws: WebSocket | null = null;
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    const ORDER_EVENTS = new Set(["order:new", "order:updated", "order:completed", "order:item_updated"]);

    function connect() {
      if (unmounted) return;
      try {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${proto}//${window.location.host}/ws?tenantId=${encodeURIComponent(tenantId)}`);

        ws.onopen = () => { delay = 1000; };

        ws.onmessage = (evt) => {
          try {
            const { event } = JSON.parse(evt.data as string) as { event: string; payload: unknown };
            if (ORDER_EVENTS.has(event)) onEventRef.current();
          } catch (_) {}
        };

        ws.onclose = () => {
          ws = null;
          if (unmounted) return;
          timer = setTimeout(() => {
            delay = Math.min(delay * 2, 30000);
            connect();
          }, delay);
        };

        ws.onerror = () => ws?.close();
      } catch (_) {}
    }

    connect();

    return () => {
      unmounted = true;
      if (timer) clearTimeout(timer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [tenantId]);
}

export default function KdsWallScreen() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const tenantId = params.get("tenantId") || new URLSearchParams(window.location.search).get("tenantId");

  const [tickets, setTickets] = useState<KDSWallTicket[]>([]);
  const [now, setNow] = useState(new Date());
  const [wsConnected, setWsConnected] = useState(false);
  const prevIdsRef = useRef<Set<string>>(new Set());

  const playChime = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.35, ctx.currentTime + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.4);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.45);
      });
    } catch (_) {}
  }, []);

  const fetchTickets = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/kds/wall-tickets?tenantId=${encodeURIComponent(tenantId)}`);
      if (!res.ok) return;
      const data: KDSWallTicket[] = await res.json();
      if (!Array.isArray(data)) return;

      const newIds = new Set(data.map(t => t.id));
      const hasNewTicket = data.some(t => !prevIdsRef.current.has(t.id));
      if (hasNewTicket && prevIdsRef.current.size > 0) playChime();
      prevIdsRef.current = newIds;
      setTickets(data);
    } catch (_) {}
  }, [tenantId, playChime]);

  useWallWebSocket(tenantId, fetchTickets);

  useEffect(() => {
    fetchTickets();
    const interval = setInterval(fetchTickets, 8000);
    return () => clearInterval(interval);
  }, [fetchTickets]);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const probe = new WebSocket(`${proto}//${window.location.host}/ws?tenantId=${encodeURIComponent(tenantId)}`);
    probe.onopen = () => { setWsConnected(true); probe.close(); };
    probe.onerror = () => setWsConnected(false);
    probe.onclose = () => {};
    return () => { try { probe.close(); } catch (_) {} };
  }, [tenantId]);

  const newTickets = tickets.filter(t => t.status === "new" || t.status === "sent_to_kitchen");
  const cookingTickets = tickets.filter(t => t.status === "in_progress");
  const readyTickets = tickets.filter(t => t.status === "ready");

  if (!tenantId) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white text-2xl" data-testid="kds-wall-screen">
        Missing tenantId parameter
      </div>
    );
  }

  const columns = [
    { key: "new", title: "NEW", tickets: newTickets, icon: Utensils, headerColor: "text-teal-400", borderColor: "border-t-teal-500", badgeClass: "bg-teal-900 text-teal-300" },
    { key: "cooking", title: "COOKING", tickets: cookingTickets, icon: Flame, headerColor: "text-orange-400", borderColor: "border-t-orange-500", badgeClass: "bg-orange-900 text-orange-300" },
    { key: "ready", title: "READY", tickets: readyTickets, icon: CheckCircle2, headerColor: "text-green-400", borderColor: "border-t-green-500", badgeClass: "bg-green-900 text-green-300" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col" data-testid="kds-wall-screen">
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/20">
            <ChefHat className="h-7 w-7 text-primary" />
          </div>
          <span className="text-2xl font-black tracking-tight">Kitchen Display</span>
          <span
            className={`ml-3 text-xs px-2 py-0.5 rounded-full font-medium ${wsConnected ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-400"}`}
            data-testid="ws-status"
            title={wsConnected ? "Live WebSocket" : "Polling mode"}
          >
            {wsConnected ? "LIVE" : "POLLING"}
          </span>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono font-bold text-white tabular-nums" data-testid="wall-clock">
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="text-gray-400 text-sm">{now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-0 divide-x divide-gray-800">
        {columns.map((col) => {
          const ColIcon = col.icon;
          return (
            <div key={col.key} className={`flex flex-col border-t-4 ${col.borderColor}`} data-testid={`wall-col-${col.key}`}>
              <div className="px-6 py-4 bg-gray-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ColIcon className={`h-6 w-6 ${col.headerColor}`} />
                  <h2 className={`text-xl font-black uppercase tracking-widest ${col.headerColor}`}>
                    {col.title}
                  </h2>
                </div>
                <span className={`text-xl font-bold px-3 py-1 rounded-full ${col.badgeClass}`} data-testid={`wall-count-${col.key}`}>
                  {col.tickets.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <AnimatePresence mode="popLayout">
                  {col.tickets.length === 0 ? (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center text-gray-600 text-lg py-16"
                    >
                      No tickets
                    </motion.div>
                  ) : (
                    col.tickets.map(ticket => (
                      <WallTicketCard key={ticket.id} ticket={ticket} />
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
