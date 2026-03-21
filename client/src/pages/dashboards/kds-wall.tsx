import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Utensils, Flame, CheckCircle2, Clock, ChefHat, User, LayoutGrid } from "lucide-react";
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
  assignedChefName?: string | null;
  counterName?: string | null;
  counterId?: string | null;
  assignmentStatus?: string | null;
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

  const isUnassigned = !ticket.assignedChefName || ticket.assignmentStatus === "unassigned";

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

      {ticket.assignedChefName && !isUnassigned ? (
        <div className="flex items-center gap-1.5" data-testid={`wall-chef-${ticket.id.slice(-4)}`}>
          <User className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-semibold text-primary">{ticket.assignedChefName}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5" data-testid={`wall-unassigned-${ticket.id.slice(-4)}`}>
          <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs text-amber-400 font-medium">Unassigned</span>
        </div>
      )}

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

function buildWsUrl(qp: URLSearchParams): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}/ws`;
  const token = qp.get("token");
  const tenantId = qp.get("tenantId");
  if (token) return `${base}?token=${encodeURIComponent(token)}`;
  if (tenantId) return `${base}?tenantId=${encodeURIComponent(tenantId)}`;
  return "";
}

function buildApiUrl(qp: URLSearchParams): string {
  const token = qp.get("token");
  const tenantId = qp.get("tenantId");
  if (token) return `/api/kds/wall-tickets?token=${encodeURIComponent(token)}`;
  if (tenantId) return `/api/kds/wall-tickets?tenantId=${encodeURIComponent(tenantId)}`;
  return "";
}

const REFRESH_EVENTS = new Set([
  "order:new", "order:updated", "order:completed", "order:item_updated",
  "chef-assignment:updated", "chef-assignment:rebalanced", "counter:updated",
]);

function useWallWebSocket(wsUrl: string, onEvent: () => void, onConnected: (v: boolean) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  useEffect(() => {
    if (!wsUrl) return;
    let ws: WebSocket | null = null;
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          delay = 1000;
          onConnectedRef.current(true);
        };

        ws.onmessage = (evt) => {
          try {
            const { event } = JSON.parse(evt.data as string) as { event: string };
            if (REFRESH_EVENTS.has(event)) onEventRef.current();
          } catch (_) {}
        };

        ws.onclose = () => {
          ws = null;
          onConnectedRef.current(false);
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
  }, [wsUrl]);
}

function groupByCounter(tickets: KDSWallTicket[]): { counterId: string | null; counterName: string; tickets: KDSWallTicket[] }[] {
  const map = new Map<string, { counterId: string | null; counterName: string; tickets: KDSWallTicket[] }>();
  for (const t of tickets) {
    const key = t.counterId ?? "__unassigned__";
    if (!map.has(key)) {
      map.set(key, { counterId: t.counterId ?? null, counterName: t.counterName ?? "Unassigned", tickets: [] });
    }
    map.get(key)!.tickets.push(t);
  }
  const result = Array.from(map.values());
  result.sort((a, b) => {
    if (!a.counterId) return 1;
    if (!b.counterId) return -1;
    return a.counterName.localeCompare(b.counterName);
  });
  return result;
}

export default function KdsWallScreen() {
  const [location] = useLocation();
  const qsRaw = location.includes("?") ? location.split("?")[1] : window.location.search.slice(1);
  const qp = new URLSearchParams(qsRaw);
  const hasAccess = !!(qp.get("token") || qp.get("tenantId"));
  const apiUrl = buildApiUrl(qp);
  const wsUrl = buildWsUrl(qp);
  const showCounters = qp.get("counters") === "1";

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
    if (!apiUrl) return;
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) return;
      const data: KDSWallTicket[] = await res.json();
      if (!Array.isArray(data)) return;

      const newIds = new Set(data.map(t => t.id));
      const hasNewTicket = data.some(t => !prevIdsRef.current.has(t.id));
      if (hasNewTicket && prevIdsRef.current.size > 0) playChime();
      prevIdsRef.current = newIds;
      setTickets(data);
    } catch (_) {}
  }, [apiUrl, playChime]);

  useWallWebSocket(wsUrl, fetchTickets, setWsConnected);

  useEffect(() => {
    fetchTickets();
    const interval = setInterval(fetchTickets, 8000);
    return () => clearInterval(interval);
  }, [fetchTickets]);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  const newTickets = tickets.filter(t => t.status === "new" || t.status === "sent_to_kitchen");
  const cookingTickets = tickets.filter(t => t.status === "in_progress");
  const readyTickets = tickets.filter(t => t.status === "ready");

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white text-2xl" data-testid="kds-wall-screen">
        Missing tenantId parameter
      </div>
    );
  }

  const statusColumns = [
    { key: "new", title: "NEW", tickets: newTickets, icon: Utensils, headerColor: "text-teal-400", borderColor: "border-t-teal-500", badgeClass: "bg-teal-900 text-teal-300" },
    { key: "cooking", title: "COOKING", tickets: cookingTickets, icon: Flame, headerColor: "text-orange-400", borderColor: "border-t-orange-500", badgeClass: "bg-orange-900 text-orange-300" },
    { key: "ready", title: "READY", tickets: readyTickets, icon: CheckCircle2, headerColor: "text-green-400", borderColor: "border-t-green-500", badgeClass: "bg-green-900 text-green-300" },
  ];

  const counterGroups = showCounters ? groupByCounter(tickets.filter(t => t.status !== "ready")) : [];
  const colCount = showCounters ? Math.max(counterGroups.length, 1) : 3;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col" data-testid="kds-wall-screen">
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/20">
            <ChefHat className="h-7 w-7 text-primary" />
          </div>
          <span className="text-2xl font-black tracking-tight">Kitchen Display</span>
          {showCounters && (
            <Badge className="bg-primary/20 text-primary border-primary/40 text-xs">
              <LayoutGrid className="h-3 w-3 mr-1" />Counter Mode
            </Badge>
          )}
          <span
            className={`ml-3 text-xs px-2 py-0.5 rounded-full font-medium ${wsConnected ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-400"}`}
            data-testid="ws-status"
            title={wsConnected ? "Live WebSocket" : "Polling every 8s"}
          >
            {wsConnected ? "LIVE" : "POLLING"}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span data-testid="wall-total-count"><span className="text-white font-bold text-lg">{tickets.length}</span> tickets</span>
            <span>|</span>
            <span data-testid="wall-unassigned-count">
              <span className="text-amber-400 font-bold">{tickets.filter(t => !t.assignedChefName || t.assignmentStatus === "unassigned").length}</span> unassigned
            </span>
          </div>
          <div className="text-right">
            <div className="text-3xl font-mono font-bold text-white tabular-nums" data-testid="wall-clock">
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="text-gray-400 text-sm">{now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</div>
          </div>
        </div>
      </div>

      {showCounters ? (
        <div
          className="flex-1 overflow-x-auto"
          style={{ display: "grid", gridTemplateColumns: `repeat(${colCount}, minmax(280px, 1fr))` }}
          data-testid="wall-counters-grid"
        >
          {counterGroups.length === 0 ? (
            <div className="col-span-full flex items-center justify-center text-gray-600 text-xl py-24">
              No active tickets
            </div>
          ) : (
            counterGroups.map((grp) => (
              <div key={grp.counterId ?? "unassigned"} className="flex flex-col border-r border-gray-800 last:border-r-0 border-t-4 border-t-primary" data-testid={`wall-counter-col-${grp.counterId ?? "unassigned"}`}>
                <div className="px-5 py-3 bg-gray-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ChefHat className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-black text-primary uppercase tracking-wide">{grp.counterName}</h2>
                  </div>
                  <span className="text-lg font-bold px-2.5 py-0.5 rounded-full bg-primary/20 text-primary">
                    {grp.tickets.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <AnimatePresence mode="popLayout">
                    {grp.tickets.length === 0 ? (
                      <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-gray-600 text-base py-10">
                        No tickets
                      </motion.div>
                    ) : (
                      grp.tickets.map(ticket => (
                        <WallTicketCard key={ticket.id} ticket={ticket} />
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-3 gap-0 divide-x divide-gray-800">
          {statusColumns.map((col) => {
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
      )}
    </div>
  );
}
