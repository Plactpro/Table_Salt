import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChefHat, Flame, CheckCircle2, Utensils, Clock, LogIn, LogOut, CheckCircle, AlertCircle,
  Maximize2, Minimize2, RotateCcw, Coffee, IceCream, Beef, CookingPot, Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo, useCallback } from "react";

interface KDSOrderItem {
  id: string;
  name: string;
  quantity: number | null;
  notes: string | null;
  status: string | null;
  station: string | null;
  course: string | null;
  startedAt: string | null;
  readyAt: string | null;
}

interface KDSTicket {
  id: string;
  tableId: string | null;
  status: string;
  createdAt: string | null;
  orderType: string | null;
  tableNumber?: number;
  items: KDSOrderItem[];
}

interface KitchenStation {
  id: string;
  name: string;
  displayName: string;
  color: string;
  sortOrder: number;
  active: boolean;
}

const STATION_ICONS: Record<string, any> = {
  grill: Beef,
  main: CookingPot,
  fryer: Flame,
  cold: IceCream,
  pastry: Coffee,
  bar: Coffee,
};

const COURSE_ORDER: Record<string, number> = {
  starter: 1, main: 2, dessert: 3, beverage: 4,
};

function useElapsedMinutes(createdAt: string | null): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!createdAt) return;
    const iv = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(iv);
  }, [createdAt]);
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatElapsed(mins: number): string {
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function getTimeColor(mins: number): string {
  if (mins < 5) return "text-green-600 dark:text-green-400";
  if (mins < 10) return "text-orange-500 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function getTimeBorder(mins: number): string {
  if (mins < 5) return "border-l-green-500";
  if (mins < 10) return "border-l-orange-500";
  return "border-l-red-500";
}

function getTimeBg(mins: number): string {
  if (mins >= 10) return "bg-red-50 dark:bg-red-950/30";
  if (mins >= 5) return "bg-orange-50 dark:bg-orange-950/20";
  return "";
}

function KitchenClockCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [elapsed, setElapsed] = useState("");

  const { data: attendanceStatus, isLoading } = useQuery<any>({
    queryKey: ["/api/attendance/status"],
    refetchInterval: 30000,
  });

  const isClockedIn = attendanceStatus && !attendanceStatus.clockOut;
  const isClockedOut = attendanceStatus && attendanceStatus.clockOut;

  useEffect(() => {
    if (!isClockedIn) { setElapsed(""); return; }
    const update = () => {
      const diff = Date.now() - new Date(attendanceStatus.clockIn).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setElapsed(`${h}h ${m}m`);
    };
    update();
    const iv = setInterval(update, 60000);
    return () => clearInterval(iv);
  }, [isClockedIn, attendanceStatus?.clockIn]);

  const clockInMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/attendance/clock-in", {}); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] }); toast({ title: "Clocked In" }); },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/attendance/clock-out", {}); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] }); toast({ title: "Clocked Out" }); },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  if (isLoading) return null;

  return (
    <div data-testid="card-clock-in-out" className={`flex items-center gap-3 px-4 py-2 rounded-lg border ${isClockedIn ? "border-green-300 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" : "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20"}`}>
      {isClockedIn ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-orange-600" />}
      <span className="text-sm font-medium" data-testid="text-attendance-status">
        {isClockedIn ? "Clocked In" : isClockedOut ? "Shift Complete" : "Not Clocked In"}
      </span>
      {isClockedIn && elapsed && <span className="text-xs text-muted-foreground">({elapsed})</span>}
      {isClockedIn && attendanceStatus.status === "late" && <Badge className="bg-amber-100 text-amber-700 text-xs"><AlertCircle className="h-3 w-3 mr-1" />Late</Badge>}
      {!isClockedIn && !isClockedOut && (
        <Button size="sm" onClick={() => clockInMutation.mutate()} disabled={clockInMutation.isPending} className="bg-green-600 hover:bg-green-700 gap-1 h-7 text-xs" data-testid="button-clock-in">
          <LogIn className="h-3 w-3" /> Clock In
        </Button>
      )}
      {isClockedIn && (
        <Button size="sm" variant="outline" onClick={() => clockOutMutation.mutate()} disabled={clockOutMutation.isPending} className="border-red-300 text-red-600 gap-1 h-7 text-xs" data-testid="button-clock-out">
          <LogOut className="h-3 w-3" /> Clock Out
        </Button>
      )}
    </div>
  );
}

function KDSTicketCard({ ticket, stationFilter, onItemStatus, onBulkStatus }: {
  ticket: KDSTicket;
  stationFilter: string | null;
  onItemStatus: (itemId: string, status: string) => void;
  onBulkStatus: (orderId: string, status: string, station?: string) => void;
}) {
  const mins = useElapsedMinutes(ticket.createdAt);
  const timeColor = getTimeColor(mins);
  const timeBorder = getTimeBorder(mins);
  const timeBg = getTimeBg(mins);
  const isNew = ticket.status === "new" || ticket.status === "sent_to_kitchen";
  const isLate = mins >= 10;

  const filteredItems = stationFilter
    ? ticket.items.filter(i => i.station === stationFilter)
    : ticket.items;

  if (filteredItems.length === 0) return null;

  const groupedByCourse = useMemo(() => {
    const groups: Record<string, KDSOrderItem[]> = {};
    for (const item of filteredItems) {
      const course = item.course || "other";
      if (!groups[course]) groups[course] = [];
      groups[course].push(item);
    }
    return Object.entries(groups).sort((a, b) => (COURSE_ORDER[a[0]] || 99) - (COURSE_ORDER[b[0]] || 99));
  }, [filteredItems]);

  const allPending = filteredItems.every(i => !i.status || i.status === "pending");
  const allCooking = filteredItems.every(i => i.status === "cooking");
  const allReady = filteredItems.every(i => i.status === "ready");
  const someReady = filteredItems.some(i => i.status === "ready");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -8 }}
      transition={{ duration: 0.2 }}
      layout
    >
      <Card
        className={`overflow-hidden border-l-4 ${timeBorder} ${timeBg} transition-all duration-200 ${isLate && !allReady ? "animate-pulse ring-2 ring-red-400/50" : ""} ${isNew ? "ring-1 ring-primary/30" : ""}`}
        data-testid={`kds-ticket-${ticket.id.slice(-4)}`}
      >
        <CardHeader className="p-3 pb-1.5 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs font-mono gap-1">
              #{ticket.id.slice(-4)}
            </Badge>
            {ticket.tableNumber && (
              <Badge variant="outline" className="text-xs font-semibold">
                T{ticket.tableNumber}
              </Badge>
            )}
            {ticket.orderType && ticket.orderType !== "dine_in" && (
              <Badge className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                {ticket.orderType.replace("_", " ")}
              </Badge>
            )}
          </div>
          <div className={`flex items-center gap-1 text-xs font-mono tabular-nums font-semibold ${timeColor}`}>
            <Clock className="h-3 w-3" />
            {formatElapsed(mins)}
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2">
          {groupedByCourse.map(([course, courseItems]) => (
            <div key={course} className="space-y-1">
              {groupedByCourse.length > 1 && (
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-dashed pb-0.5 mb-1">
                  {course}
                </div>
              )}
              {courseItems.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className={`font-medium ${item.status === "ready" ? "line-through text-muted-foreground" : ""}`}>
                      {item.quantity}× {item.name}
                    </span>
                    {item.notes && <span className="text-xs text-muted-foreground italic truncate">({item.notes})</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(!item.status || item.status === "pending") && (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs hover:bg-orange-100" onClick={() => onItemStatus(item.id, "cooking")} data-testid={`btn-start-${item.id.slice(-4)}`}>
                        <Flame className="h-3 w-3 text-orange-500" />
                      </Button>
                    )}
                    {item.status === "cooking" && (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs hover:bg-green-100" onClick={() => onItemStatus(item.id, "ready")} data-testid={`btn-ready-${item.id.slice(-4)}`}>
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                      </Button>
                    )}
                    {item.status === "ready" && (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs hover:bg-yellow-100" onClick={() => onItemStatus(item.id, "recalled")} data-testid={`btn-recall-${item.id.slice(-4)}`}>
                        <RotateCcw className="h-3 w-3 text-yellow-600" />
                      </Button>
                    )}
                    <StatusDot status={item.status} />
                  </div>
                </div>
              ))}
            </div>
          ))}

          <div className="flex items-center justify-end gap-1.5 pt-1 border-t">
            {allPending && (
              <Button size="sm" className="h-7 text-xs gap-1 bg-orange-500 hover:bg-orange-600" onClick={() => onBulkStatus(ticket.id, "cooking", stationFilter || undefined)} data-testid={`btn-start-all-${ticket.id.slice(-4)}`}>
                <Flame className="h-3 w-3" /> Start All
              </Button>
            )}
            {allCooking && (
              <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => onBulkStatus(ticket.id, "ready", stationFilter || undefined)} data-testid={`btn-ready-all-${ticket.id.slice(-4)}`}>
                <CheckCircle2 className="h-3 w-3" /> All Ready
              </Button>
            )}
            {someReady && !allReady && !allCooking && !allPending && (
              <Badge variant="outline" className="text-xs text-orange-600">Partial</Badge>
            )}
            {allReady && (
              <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function StatusDot({ status }: { status: string | null }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-300",
    cooking: "bg-orange-500 animate-pulse",
    ready: "bg-green-500",
    served: "bg-blue-500",
  };
  return <div className={`w-2 h-2 rounded-full ${colors[status || "pending"] || "bg-gray-300"}`} />;
}

export default function KitchenDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { data: tickets = [], isLoading } = useQuery<KDSTicket[]>({
    queryKey: ["/api/kds/tickets"],
    refetchInterval: 5000,
  });

  const { data: stations = [] } = useQuery<KitchenStation[]>({
    queryKey: ["/api/kitchen-stations"],
  });

  const itemStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      await apiRequest("PATCH", `/api/kds/order-items/${itemId}/status`, { status });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/kds/tickets"] }); },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, station }: { orderId: string; status: string; station?: string }) => {
      await apiRequest("PATCH", `/api/kds/orders/${orderId}/items-status`, { status, station });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const handleItemStatus = useCallback((itemId: string, status: string) => {
    itemStatusMutation.mutate({ itemId, status });
  }, [itemStatusMutation]);

  const handleBulkStatus = useCallback((orderId: string, status: string, station?: string) => {
    bulkStatusMutation.mutate({ orderId, status, station });
  }, [bulkStatusMutation]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const filteredTickets = useMemo(() => {
    if (!selectedStation) return tickets;
    return tickets.filter(t => t.items.some(i => i.station === selectedStation));
  }, [tickets, selectedStation]);

  const newTickets = filteredTickets.filter(t => t.status === "new" || t.status === "sent_to_kitchen");
  const inProgressTickets = filteredTickets.filter(t => t.status === "in_progress");
  const readyTickets = filteredTickets.filter(t => t.status === "ready");

  const stationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tickets) {
      if (t.status === "ready") continue;
      for (const i of t.items) {
        if (i.station && i.status !== "ready" && i.status !== "served") {
          counts[i.station] = (counts[i.station] || 0) + 1;
        }
      }
    }
    return counts;
  }, [tickets]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const columns = [
    { key: "new", title: "NEW", tickets: newTickets, icon: Utensils, color: "teal" },
    { key: "cooking", title: "COOKING", tickets: inProgressTickets, icon: Flame, color: "orange" },
    { key: "ready", title: "READY", tickets: readyTickets, icon: CheckCircle2, color: "green" },
  ];

  return (
    <div className="space-y-3" data-testid="dashboard-kitchen">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10">
            <ChefHat className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-heading font-bold" data-testid="text-dashboard-title">Kitchen Display System</h1>
            <p className="text-muted-foreground text-sm">
              {filteredTickets.length} active ticket{filteredTickets.length !== 1 ? "s" : ""}
              {selectedStation && ` · ${stations.find(s => s.name === selectedStation)?.displayName || selectedStation}`}
            </p>
          </div>
        </motion.div>

        <div className="flex items-center gap-2">
          <KitchenClockCard />
          <Button size="sm" variant="outline" onClick={toggleFullscreen} className="h-8 gap-1" data-testid="button-fullscreen">
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {isFullscreen ? "Exit" : "Full"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Button
          size="sm"
          variant={selectedStation === null ? "default" : "outline"}
          className="h-8 text-xs shrink-0 gap-1"
          onClick={() => setSelectedStation(null)}
          data-testid="btn-station-all"
        >
          <Filter className="h-3 w-3" />
          All Stations
          <Badge variant="secondary" className="ml-1 text-[10px] h-4 min-w-4 px-1">{tickets.filter(t => t.status !== "ready").length}</Badge>
        </Button>
        {stations.filter(s => s.active).map(station => {
          const StationIcon = STATION_ICONS[station.name] || CookingPot;
          const count = stationCounts[station.name] || 0;
          return (
            <Button
              key={station.id}
              size="sm"
              variant={selectedStation === station.name ? "default" : "outline"}
              className="h-8 text-xs shrink-0 gap-1"
              onClick={() => setSelectedStation(station.name === selectedStation ? null : station.name)}
              data-testid={`btn-station-${station.name}`}
              style={selectedStation === station.name ? { backgroundColor: station.color, borderColor: station.color } : {}}
            >
              <StationIcon className="h-3 w-3" />
              {station.displayName}
              {count > 0 && <Badge variant="secondary" className="ml-1 text-[10px] h-4 min-w-4 px-1">{count}</Badge>}
            </Button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map((col, colIdx) => {
          const ColIcon = col.icon;
          const colorMap: Record<string, { border: string; headerBg: string; headerText: string; badge: string }> = {
            teal: { border: "border-t-teal-600", headerBg: "bg-teal-50 dark:bg-teal-950/40", headerText: "text-teal-700 dark:text-teal-300", badge: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300" },
            orange: { border: "border-t-orange-500", headerBg: "bg-orange-50 dark:bg-orange-950/40", headerText: "text-orange-700 dark:text-orange-300", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
            green: { border: "border-t-green-500", headerBg: "bg-green-50 dark:bg-green-950/40", headerText: "text-green-700 dark:text-green-300", badge: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
          };
          const cm = colorMap[col.color];
          return (
            <motion.div
              key={col.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: colIdx * 0.08 }}
              className={`space-y-3 border-t-4 ${cm.border} pt-0 rounded-xl overflow-hidden`}
            >
              <div className={`flex items-center justify-between p-3 ${cm.headerBg} rounded-b-lg`}>
                <div className="flex items-center gap-2">
                  <ColIcon className={`h-4 w-4 ${cm.headerText}`} />
                  <h2 className={`font-heading font-semibold text-sm uppercase tracking-wide ${cm.headerText}`}>
                    {col.title}
                  </h2>
                </div>
                <Badge className={`${cm.badge} font-mono text-xs`}>
                  {col.tickets.length}
                </Badge>
              </div>
              <div className="space-y-3 px-1 pb-2 max-h-[calc(100vh-220px)] overflow-y-auto">
                <AnimatePresence mode="popLayout">
                  {col.tickets.length === 0 ? (
                    <motion.p
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-muted-foreground text-center py-8"
                    >
                      No tickets
                    </motion.p>
                  ) : (
                    col.tickets.map(ticket => (
                      <KDSTicketCard
                        key={ticket.id}
                        ticket={ticket}
                        stationFilter={selectedStation}
                        onItemStatus={handleItemStatus}
                        onBulkStatus={handleBulkStatus}
                      />
                    ))
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
