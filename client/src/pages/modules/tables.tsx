import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { motion, AnimatePresence } from "framer-motion";
import QRCodeLib from "qrcode";
import {
  Plus, Edit2, Trash2, Users, MapPin, Clock, CalendarDays,
  Filter, ChevronLeft, ChevronRight,
  CircleCheck, CircleX, Timer, Sparkles, ShieldBan, Armchair,
  Phone, X, LayoutGrid, ListOrdered, BarChart3,
  Merge, Unlink, UserPlus, Bell, Check, Search, Palette,
  Square, Circle, RectangleHorizontal, Move, GripVertical, MessageSquare,
  TrendingUp, ArrowRightLeft, QrCode, Download, RefreshCw, Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

type TableStatus = "free" | "occupied" | "reserved" | "cleaning" | "blocked";
type ReservationStatus = "pending" | "requested" | "confirmed" | "seated" | "completed" | "no_show";

interface TableData {
  id: string;
  tenantId: string;
  outletId: string | null;
  number: number;
  capacity: number | null;
  zone: string | null;
  zoneId: string | null;
  posX: number | null;
  posY: number | null;
  shape: string | null;
  mergedWith: string | null;
  seatedAt: string | null;
  partyName: string | null;
  partySize: number | null;
  status: TableStatus | null;
  qrToken: string | null;
  callServerFlag: boolean | null;
  requestBillFlag: boolean | null;
}

interface ZoneData {
  id: string;
  tenantId: string;
  outletId: string | null;
  name: string;
  color: string | null;
  sortOrder: number | null;
  isActive: boolean | null;
}

interface WaitlistData {
  id: string;
  tenantId: string;
  outletId: string | null;
  customerName: string;
  customerPhone: string | null;
  partySize: number;
  preferredZone: string | null;
  status: string | null;
  estimatedWaitMinutes: number | null;
  notificationSent: boolean | null;
  priority: number | null;
  notes: string | null;
  seatedTableId: string | null;
  createdAt: string | null;
  seatedAt: string | null;
}

interface ReservationData {
  id: string;
  tenantId: string;
  tableId: string | null;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  guests: number | null;
  dateTime: string;
  notes: string | null;
  status: ReservationStatus | null;
  resource_requirements?: {resourceId: string; resourceName: string; icon?: string; quantity: number}[] | null;
  resourceRequirements?: {resourceId: string; resourceName: string; icon?: string; quantity: number}[] | null;
}

interface AnalyticsData {
  totalTables: number;
  occupied: number;
  free: number;
  reserved: number;
  cleaning: number;
  blocked: number;
  totalCapacity: number;
  seatedGuests: number;
  occupancyRate: number;
  waitingCount: number;
  avgWaitMinutes: number;
  avgDiningMinutes: number;
  turnsToday: number;
  avgTurnTime: number;
  byZone: Record<string, { total: number; occupied: number }>;
  waitByHour: Record<string, number>;
  waitByDay: Record<string, number>;
}

interface CustomerData {
  id: string;
  name: string;
  phone: string | null;
}

const statusConfig: Record<TableStatus, { color: string; bg: string; label: string; dot: string; fill: string }> = {
  free: { color: "text-green-700 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700", label: "Free", dot: "bg-green-500", fill: "#22c55e" },
  occupied: { color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700", label: "Occupied", dot: "bg-red-500", fill: "#ef4444" },
  reserved: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700", label: "Reserved", dot: "bg-yellow-500", fill: "#eab308" },
  cleaning: { color: "text-stone-700 dark:text-stone-400", bg: "bg-stone-100 dark:bg-stone-900/40 border-stone-300 dark:border-stone-700", label: "Cleaning", dot: "bg-stone-500", fill: "#78716c" },
  blocked: { color: "text-gray-700 dark:text-gray-400", bg: "bg-gray-100 dark:bg-gray-900/40 border-gray-300 dark:border-gray-700", label: "Blocked", dot: "bg-gray-500", fill: "#6b7280" },
};

const statusIcon: Record<TableStatus, React.ElementType> = {
  free: CircleCheck,
  occupied: CircleX,
  reserved: Timer,
  cleaning: Sparkles,
  blocked: ShieldBan,
};

const reservationStatusConfig: Record<ReservationStatus, { label: string; color: string; nextStatus: ReservationStatus | null }> = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-700", nextStatus: "confirmed" },
  requested: { label: "Pending", color: "bg-gray-100 text-gray-700", nextStatus: "confirmed" },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-700", nextStatus: "seated" },
  seated: { label: "Seated", color: "bg-green-100 text-green-700", nextStatus: "completed" },
  completed: { label: "Completed", color: "bg-purple-100 text-purple-700", nextStatus: null },
  no_show: { label: "No Show", color: "bg-red-100 text-red-700", nextStatus: null },
};

function getTimeSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const GRID_SIZE = 20;
const TABLE_W = 100;
const TABLE_H = 80;
const CANVAS_W = 900;
const CANVAS_H = 600;

function snapToGrid(val: number) {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

interface QrToken {
  id: string;
  tenantId: string;
  outletId: string | null;
  tableId: string;
  token: string;
  active: boolean;
  label: string | null;
  tableNumber: number | null;
  tableZone: string | null;
  createdAt: string | null;
}

function QrManagementTab({ tables, toast, queryClient, user }: {
  tables: TableData[];
  toast: ReturnType<typeof import("@/hooks/use-toast").useToast>["toast"];
  queryClient: ReturnType<typeof import("@tanstack/react-query").useQueryClient>;
  user: ReturnType<typeof import("@/lib/auth").useAuth>["user"];
}) {
  const { data: qrTokens = [] } = useQuery<QrToken[]>({
    queryKey: ["/api/qr/tokens"],
  });

  const canManage = ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"].includes(user?.role ?? "");

  const generateMutation = useMutation({
    mutationFn: (tableId: string) => apiRequest("POST", `/api/qr/generate/${tableId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/qr/tokens"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      toast({ title: "QR code generated" });
    },
    onError: () => toast({ title: "Failed to generate QR code", variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/qr/tokens/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/qr/tokens"] });
      toast({ title: "QR code deactivated" });
    },
    onError: () => toast({ title: "Failed to deactivate", variant: "destructive" }),
  });

  const handleDownloadPng = async (token: string, tableNum: number | null) => {
    try {
      const url = `${window.location.origin}/table?qr=${token}`;
      const dataUrl = await QRCodeLib.toDataURL(url, { width: 400, margin: 2 });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `table-${tableNum ?? token}-qr.png`;
      link.click();
    } catch {
      toast({ title: "Failed to generate QR image", variant: "destructive" });
    }
  };

  const handleDownloadPdf = async (token: string, tableNum: number | null) => {
    try {
      const url = `${window.location.origin}/table?qr=${token}`;
      const dataUrl = await QRCodeLib.toDataURL(url, { width: 400, margin: 2 });
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a5" });
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(`Table ${tableNum ?? ""}`, 74, 25, { align: "center" });
      doc.addImage(dataUrl, "PNG", 22, 35, 110, 110);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Scan to order & request service", 74, 155, { align: "center" });
      doc.save(`table-${tableNum ?? token}-qr.pdf`);
    } catch {
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    }
  };

  const handleBulkDownload = () => {
    const link = document.createElement("a");
    link.href = `/api/qr/bulk-download/all`;
    link.download = "qr-codes.zip";
    link.click();
  };

  const tablesWithoutQr = tables.filter(t => !qrTokens.find(q => q.tableId === t.id && q.active));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            {qrTokens.length} active QR code{qrTokens.length !== 1 ? "s" : ""} · {tablesWithoutQr.length} table{tablesWithoutQr.length !== 1 ? "s" : ""} without QR
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canManage && tablesWithoutQr.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => {
              tablesWithoutQr.forEach(t => generateMutation.mutate(t.id));
            }} data-testid="btn-generate-all-qr">
              <QrCode className="h-4 w-4 mr-1.5" />Generate All
            </Button>
          )}
          {qrTokens.length > 0 && (
            <Button size="sm" onClick={handleBulkDownload} data-testid="btn-bulk-download">
              <Archive className="h-4 w-4 mr-1.5" />Bulk Download ZIP
            </Button>
          )}
        </div>
      </div>

      {qrTokens.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <QrCode className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No QR codes yet</p>
          {canManage && tables.length > 0 && (
            <Button size="sm" className="mt-3" onClick={() => tables.forEach(t => generateMutation.mutate(t.id))}>
              Generate for all tables
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {qrTokens.map(qt => (
            <Card key={qt.id} data-testid={`qr-card-${qt.id}`} className="overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">Table {qt.tableNumber ?? "?"}</p>
                    {qt.tableZone && <p className="text-xs text-muted-foreground">{qt.tableZone}</p>}
                  </div>
                  <Badge variant="outline" className="text-xs text-green-700 border-green-300">Active</Badge>
                </div>
                <QrCodeCanvas token={qt.token} />
                <div className="text-xs text-muted-foreground font-mono truncate">/table?qr={qt.token.slice(0, 16)}…</div>
                <div className="flex gap-1.5 flex-wrap">
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2.5"
                    onClick={() => handleDownloadPng(qt.token, qt.tableNumber)}
                    data-testid={`btn-download-png-${qt.id}`}>
                    <Download className="h-3 w-3 mr-1" />PNG
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2.5"
                    onClick={() => handleDownloadPdf(qt.token, qt.tableNumber)}
                    data-testid={`btn-download-pdf-${qt.id}`}>
                    <Download className="h-3 w-3 mr-1" />PDF
                  </Button>
                  {canManage && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2.5"
                        onClick={() => generateMutation.mutate(qt.tableId)}
                        data-testid={`btn-regen-${qt.id}`}>
                        <RefreshCw className="h-3 w-3 mr-1" />Regen
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-destructive hover:text-destructive"
                        onClick={() => deactivateMutation.mutate(qt.id)}
                        data-testid={`btn-deactivate-${qt.id}`}>
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canManage && tablesWithoutQr.length > 0 && qrTokens.length > 0 && (
        <div className="border rounded-lg p-4">
          <p className="text-sm font-medium mb-2">Tables without QR codes ({tablesWithoutQr.length})</p>
          <div className="flex flex-wrap gap-2">
            {tablesWithoutQr.map(t => (
              <Button key={t.id} size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => generateMutation.mutate(t.id)}
                data-testid={`btn-gen-qr-${t.id}`}>
                <QrCode className="h-3 w-3 mr-1" />Table {t.number}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QrCodeCanvas({ token }: { token: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const url = `${window.location.origin}/table?qr=${token}`;
    QRCodeLib.toCanvas(canvasRef.current, url, { width: 140, margin: 1 }).catch(() => {});
  }, [token]);

  return (
    <div className="flex justify-center py-1">
      <canvas ref={canvasRef} className="rounded" data-testid="qr-canvas" />
    </div>
  );
}

export default function TablesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("floor");
  const [viewMode, setViewMode] = useState<"grid" | "floorplan">("grid");
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showSeatDialog, setShowSeatDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [showAddReservation, setShowAddReservation] = useState(false);
  const [showReservationDetail, setShowReservationDetail] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ReservationData | null>(null);
  const [showAddWaitlist, setShowAddWaitlist] = useState(false);
  const [showZoneManager, setShowZoneManager] = useState(false);
  const [filterZone, setFilterZone] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dragTableId, setDragTableId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  useRealtimeEvent("table:updated", useCallback((payload: unknown) => {
    const p = payload as { tableId?: string; status?: string } | null;
    if (!p?.tableId) { queryClient.invalidateQueries({ queryKey: ["/api/tables"] }); return; }
    queryClient.setQueryData(["/api/tables"], (old: TableData[] | undefined) => {
      if (!old) return old;
      return old.map(t => t.id === p.tableId ? { ...t, status: (p.status ?? t.status) as TableStatus | null } : t);
    });
  }, [queryClient]));

  const canvasRef = useRef<HTMLDivElement>(null);
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [formData, setFormData] = useState({
    number: "", capacity: "4", zone: "Main", status: "free" as TableStatus, shape: "square",
    posX: "0", posY: "0",
  });
  const [seatFormData, setSeatFormData] = useState({ partyName: "", partySize: "2" });
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [waitlistForm, setWaitlistForm] = useState({
    customerName: "", customerPhone: "", partySize: "2", preferredZone: "", notes: "", estimatedWaitMinutes: "", priority: "0",
  });
  const [zoneForm, setZoneForm] = useState({ name: "", color: "#6366f1" });
  const [editingZone, setEditingZone] = useState<ZoneData | null>(null);
  const [resFormData, setResFormData] = useState({
    customerName: "", customerPhone: "", tableId: "", guests: "2",
    dateTime: "", notes: "", customerId: "",
  });
  const [resResourceRequirements, setResResourceRequirements] = useState<{resourceId: string; resourceName: string; icon: string; quantity: number}[]>([]);
  const [seatResourceRequirements, setSeatResourceRequirements] = useState<{resourceId: string; quantity: number}[]>([]);
  const [liveAvailabilityCheck, setLiveAvailabilityCheck] = useState<{resourceId: string; resourceName: string; requested: number; available: number; sufficient: boolean}[]>([]);
  const [availabilityCheck, setAvailabilityCheck] = useState<{resourceId: string; available: number; requested: number; resourceName: string; inUseAtTable?: string; sinceTime?: string}[]>([]);
  const [showResourceUnavailableDialog, setShowResourceUnavailableDialog] = useState(false);

  const { data: tables = [], isLoading: tablesLoading } = useQuery<TableData[]>({ queryKey: ["/api/tables"] });
  const { data: zones = [] } = useQuery<ZoneData[]>({ queryKey: ["/api/table-zones"] });
  const { data: waitlist = [] } = useQuery<WaitlistData[]>({ queryKey: ["/api/waitlist"] });
  const { data: reservations = [] } = useQuery<ReservationData[]>({ queryKey: ["/api/reservations"] });
  const { data: analytics } = useQuery<AnalyticsData>({ queryKey: ["/api/table-analytics"] });
  const { data: customersRes } = useQuery<{ data: CustomerData[]; total: number }>({ queryKey: ["/api/customers"] });
  const customers = customersRes?.data ?? [];

  const outletId = (tables.find(t => t.outletId)?.outletId) ?? null;

  useRealtimeEvent("resource:updated", useCallback(() => {
    if (outletId) {
      queryClient.invalidateQueries({ queryKey: ["/api/resources/availability", outletId] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources/assignments/by-outlet", outletId] });
    }
  }, [queryClient, outletId]));

  interface OutletResource { id: string; resourceCode: string; resourceName: string; resourceIcon: string; totalUnits: number; availableUnits: number; isTrackable: boolean; }
  const { data: outletResources = [] } = useQuery<OutletResource[]>({
    queryKey: ["/api/resources", outletId],
    queryFn: async () => {
      if (!outletId) return [];
      const res = await fetch(`/api/resources?outletId=${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
  });

  type ResourceAssignmentsMap = Record<string, {resourceId: string; resourceName: string; resourceIcon: string; resourceCode: string; quantity: number; assignedAt: string | null}[]>;
  const resourceShortName = (code: string): string => {
    const map: Record<string, string> = { HIGH_CHAIR: "HC", BOOSTER_SEAT: "BS", BABY_COT: "Cot", PRAYER_MAT: "PM", WHEELCHAIR: "WC" };
    return map[code] ?? code.slice(0, 3);
  };
  const { data: resourcesByTable = {} } = useQuery<ResourceAssignmentsMap>({
    queryKey: ["/api/resources/assignments/by-outlet", outletId],
    queryFn: async () => {
      if (!outletId) return {};
      const res = await fetch(`/api/resources/assignments/by-outlet?outletId=${outletId}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!outletId,
    refetchInterval: 30000,
  });

  const { data: availabilityData = [] } = useQuery<OutletResource[]>({
    queryKey: ["/api/resources/availability", outletId],
    queryFn: async () => {
      if (!outletId) return [];
      const res = await fetch(`/api/resources/availability?outletId=${outletId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!outletId,
    refetchInterval: 30000,
  });

  useEffect(() => {
    const activeReqs = seatResourceRequirements.filter(r => r.quantity > 0);
    if (!outletId || activeReqs.length === 0) {
      setLiveAvailabilityCheck([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest("POST", "/api/resources/check-availability", {
          outletId,
          resources: activeReqs.map(r => ({ resourceId: r.resourceId, quantity: r.quantity })),
        });
        const data: { available: boolean; conflicts: {resourceId: string; resourceName: string; requested: number; available: number}[] } = await res.json();
        const checks = activeReqs.map(r => {
          const conflict = data.conflicts.find((c) => c.resourceId === r.resourceId);
          const resInfo = outletResources.find((o: OutletResource) => o.id === r.resourceId);
          return {
            resourceId: r.resourceId,
            resourceName: resInfo?.resourceName ?? r.resourceId,
            requested: r.quantity,
            available: conflict ? conflict.available : (resInfo?.availableUnits ?? 0),
            sufficient: !conflict,
          };
        });
        setLiveAvailabilityCheck(checks);
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [seatResourceRequirements, outletId, outletResources]);

  const activeWaitlist = useMemo(() => waitlist.filter(w => w.status === "waiting"), [waitlist]);

  useEffect(() => {
    if (showAddWaitlist && waitlistForm.partySize && !waitlistForm.estimatedWaitMinutes) {
      fetch(`/api/waitlist/estimated-wait?partySize=${waitlistForm.partySize}`, { credentials: "include" })
        .then(r => r.json())
        .then(data => {
          if (data.estimatedMinutes !== undefined) {
            setWaitlistForm(f => ({ ...f, estimatedWaitMinutes: String(data.estimatedMinutes) }));
          }
        })
        .catch(() => {});
    }
  }, [showAddWaitlist, waitlistForm.partySize]);

  const filteredTables = useMemo(() => {
    let result = tables;
    if (filterZone !== "all") result = result.filter(t => t.zone === filterZone);
    if (filterStatus !== "all") result = result.filter(t => t.status === filterStatus);
    if (searchQuery) result = result.filter(t => `Table ${t.number}`.toLowerCase().includes(searchQuery.toLowerCase()) || t.partyName?.toLowerCase().includes(searchQuery.toLowerCase()));
    return result;
  }, [tables, filterZone, filterStatus, searchQuery]);

  const uniqueZones = useMemo(() => {
    const zoneNames = new Set(tables.map(t => t.zone || "Main"));
    return Array.from(zoneNames);
  }, [tables]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
    queryClient.invalidateQueries({ queryKey: ["/api/table-zones"] });
    queryClient.invalidateQueries({ queryKey: ["/api/waitlist"] });
    queryClient.invalidateQueries({ queryKey: ["/api/table-analytics"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
  };

  const createTableMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { const r = await apiRequest("POST", "/api/tables", data); return r.json(); },
    onSuccess: () => { invalidateAll(); setShowAddDialog(false); toast({ title: "Table added" }); },
    onError: (e: Error) => { toast({ title: "Failed", description: e.message, variant: "destructive" }); },
  });
  const updateTableMut = useMutation({
    mutationFn: async ({ id, ...data }: Record<string, unknown>) => { const r = await apiRequest("PATCH", `/api/tables/${id}`, data); return r.json(); },
    onSuccess: () => { invalidateAll(); setShowEditDialog(false); toast({ title: "Table updated" }); },
    onError: (e: Error) => { toast({ title: "Failed", description: e.message, variant: "destructive" }); },
  });
  const deleteTableMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/tables/${id}`); },
    onSuccess: () => { invalidateAll(); setShowDetailDialog(false); toast({ title: "Table deleted" }); },
  });
  const seatTableMut = useMutation({
    mutationFn: async ({ id, ...data }: Record<string, unknown>) => { const r = await apiRequest("PATCH", `/api/tables/${id}/seat`, data); return r.json(); },
    onSuccess: () => { invalidateAll(); setShowSeatDialog(false); setShowDetailDialog(false); toast({ title: "Party seated" }); },
  });
  const clearTableMut = useMutation({
    mutationFn: async (id: string) => { const r = await apiRequest("PATCH", `/api/tables/${id}/clear`, {}); return r.json(); },
    onSuccess: (_, tableId) => {
      invalidateAll();
      setShowDetailDialog(false);
      toast({ title: "Table cleared" });
      if (outletId) {
        apiRequest("POST", "/api/resources/return", { tableId, outletId }).catch(() => {});
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/resources/assignments/by-outlet", outletId] });
          queryClient.invalidateQueries({ queryKey: ["/api/resources/availability", outletId] });
        }, 500);
      }
    },
  });
  const mergeTableMut = useMutation({
    mutationFn: async ({ id, targetTableId }: { id: string; targetTableId: string }) => { const r = await apiRequest("PATCH", `/api/tables/${id}/merge`, { targetTableId }); return r.json(); },
    onSuccess: () => { invalidateAll(); setShowMergeDialog(false); setShowDetailDialog(false); toast({ title: "Tables merged" }); },
  });
  const unmergeTableMut = useMutation({
    mutationFn: async (id: string) => { const r = await apiRequest("PATCH", `/api/tables/${id}/unmerge`, {}); return r.json(); },
    onSuccess: () => { invalidateAll(); setShowDetailDialog(false); toast({ title: "Tables unmerged" }); },
  });
  const quickStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => { const r = await apiRequest("PATCH", `/api/tables/${id}`, { status }); return r.json(); },
    onSuccess: (_updatedTable: TableData, variables: { id: string; status: string }) => {
      invalidateAll();
      if (selectedTable?.id === variables.id) {
        setSelectedTable(prev => prev ? { ...prev, status: variables.status as TableStatus } : prev);
        setFormData(prev => ({ ...prev, status: variables.status as TableStatus }));
      }
    },
  });
  const positionMut = useMutation({
    mutationFn: async ({ id, posX, posY }: { id: string; posX: number; posY: number }) => {
      const r = await apiRequest("PATCH", `/api/tables/${id}`, { posX, posY });
      return r.json();
    },
    onSuccess: () => { invalidateAll(); },
  });

  const createZoneMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { const r = await apiRequest("POST", "/api/table-zones", data); return r.json(); },
    onSuccess: () => { invalidateAll(); setZoneForm({ name: "", color: "#6366f1" }); toast({ title: "Zone created" }); },
  });
  const updateZoneMut = useMutation({
    mutationFn: async ({ id, ...data }: Record<string, unknown>) => { const r = await apiRequest("PATCH", `/api/table-zones/${id}`, data); return r.json(); },
    onSuccess: () => { invalidateAll(); setEditingZone(null); toast({ title: "Zone updated" }); },
  });
  const deleteZoneMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/table-zones/${id}`); },
    onSuccess: () => { invalidateAll(); toast({ title: "Zone deleted" }); },
  });

  const createWaitlistMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { const r = await apiRequest("POST", "/api/waitlist", data); return r.json(); },
    onSuccess: () => { invalidateAll(); setShowAddWaitlist(false); setWaitlistForm({ customerName: "", customerPhone: "", partySize: "2", preferredZone: "", notes: "", estimatedWaitMinutes: "", priority: "0" }); toast({ title: "Added to waitlist" }); },
  });
  const seatWaitlistMut = useMutation({
    mutationFn: async ({ id, tableId }: { id: string; tableId: string }) => { const r = await apiRequest("PATCH", `/api/waitlist/${id}/seat`, { tableId }); return r.json(); },
    onSuccess: () => { invalidateAll(); toast({ title: "Party seated from waitlist" }); },
  });
  const removeWaitlistMut = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/waitlist/${id}`); },
    onSuccess: () => { invalidateAll(); toast({ title: "Removed from waitlist" }); },
  });
  const notifyWaitlistMut = useMutation({
    mutationFn: async (id: string) => { const r = await apiRequest("POST", `/api/waitlist/${id}/notify`, { channel: "sms" }); return r.json(); },
    onSuccess: () => { invalidateAll(); toast({ title: "Notification sent" }); },
  });

  const transferMut = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      const r = await apiRequest("POST", `/api/tables/${sourceId}/transfer`, { targetTableId: targetId });
      return r.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Party transferred" }); },
  });

  const createResMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => { const r = await apiRequest("POST", "/api/reservations", data); return r.json(); },
    onSuccess: () => { invalidateAll(); setShowAddReservation(false); toast({ title: "Reservation created" }); },
    onError: (err: Error) => { toast({ title: "Failed to create reservation", description: err.message, variant: "destructive" }); },
  });
  const updateResMut = useMutation({
    mutationFn: async ({ id, ...data }: Record<string, unknown>) => { const r = await apiRequest("PATCH", `/api/reservations/${id}`, data); return r.json(); },
    onSuccess: () => { invalidateAll(); setShowReservationDetail(false); toast({ title: "Reservation updated" }); },
  });

  const resetForm = () => setFormData({ number: "", capacity: "4", zone: "Main", status: "free", shape: "square", posX: "0", posY: "0" });

  const handleAddTable = () => {
    createTableMut.mutate({ number: parseInt(formData.number), capacity: parseInt(formData.capacity), zone: formData.zone, status: formData.status, shape: formData.shape, posX: parseInt(formData.posX) || 0, posY: parseInt(formData.posY) || 0 });
  };
  const handleEditTable = () => {
    if (!selectedTable) return;
    updateTableMut.mutate({ id: selectedTable.id, number: parseInt(formData.number), capacity: parseInt(formData.capacity), zone: formData.zone, status: formData.status as string, shape: formData.shape, posX: parseInt(formData.posX) || 0, posY: parseInt(formData.posY) || 0 });
  };

  const openEditDialog = (t: TableData) => {
    setSelectedTable(t);
    setFormData({ number: String(t.number), capacity: String(t.capacity || 4), zone: t.zone || "Main", status: t.status || "free", shape: t.shape || "square", posX: String(t.posX || 0), posY: String(t.posY || 0) });
    setShowEditDialog(true);
  };
  const openTableDetail = (t: TableData) => { setSelectedTable(t); setShowDetailDialog(true); };
  const openSeatDialog = (t: TableData) => { setSelectedTable(t); setSeatFormData({ partyName: "", partySize: "2" }); setShowSeatDialog(true); };

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent, tableId: string) => {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const table = tables.find(t => t.id === tableId);
    if (!table) return;
    setDragTableId(tableId);
    setDragOffset({
      x: e.clientX - rect.left - (table.posX || 0),
      y: e.clientY - rect.top - (table.posY || 0),
    });
  }, [tables]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragTableId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const newX = snapToGrid(Math.max(0, Math.min(CANVAS_W - TABLE_W, e.clientX - rect.left - dragOffset.x)));
    const newY = snapToGrid(Math.max(0, Math.min(CANVAS_H - TABLE_H, e.clientY - rect.top - dragOffset.y)));
    const el = document.getElementById(`floor-table-${dragTableId}`);
    if (el) {
      el.style.left = `${newX}px`;
      el.style.top = `${newY}px`;
    }
  }, [dragTableId, dragOffset]);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    if (!dragTableId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const newX = snapToGrid(Math.max(0, Math.min(CANVAS_W - TABLE_W, e.clientX - rect.left - dragOffset.x)));
    const newY = snapToGrid(Math.max(0, Math.min(CANVAS_H - TABLE_H, e.clientY - rect.top - dragOffset.y)));
    const draggedTable = tables.find(t => t.id === dragTableId);
    if (draggedTable?.status === "occupied") {
      const dropTarget = tables.find(t => t.id !== dragTableId && t.status === "free" &&
        Math.abs((t.posX || 0) - newX) < TABLE_W && Math.abs((t.posY || 0) - newY) < TABLE_H);
      if (dropTarget) {
        const el = document.getElementById(`floor-table-${dragTableId}`);
        if (el) { el.style.left = `${draggedTable.posX || 0}px`; el.style.top = `${draggedTable.posY || 0}px`; }
        transferMut.mutate({ sourceId: dragTableId, targetId: dropTarget.id });
        setDragTableId(null);
        return;
      }
    }
    positionMut.mutate({ id: dragTableId, posX: newX, posY: newY });
    setDragTableId(null);
  }, [dragTableId, dragOffset, positionMut, transferMut, tables]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(calendarWeekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [calendarWeekStart]);

  const getReservationsForDay = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    return reservations.filter(r => r.dateTime?.startsWith(dateStr));
  };

  if (tablesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Table & Queue Management</h1>
          <p className="text-muted-foreground mt-1">Floor plan, waitlist, and reservations</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddWaitlist(true)} variant="outline" data-testid="button-add-waitlist">
            <UserPlus className="w-4 h-4 mr-2" />Add to Waitlist
          </Button>
          <Button onClick={() => { resetForm(); setShowAddDialog(true); }} data-testid="button-add-table">
            <Plus className="w-4 h-4 mr-2" />Add Table
          </Button>
        </div>
      </div>

      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Card data-testid="card-stat-occupancy"><CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground font-medium">Occupancy</div>
            <div className="text-2xl font-bold">{analytics.occupancyRate}%</div>
            <div className="text-xs text-muted-foreground">{analytics.seatedGuests}/{analytics.totalCapacity} seats</div>
          </CardContent></Card>
          <Card data-testid="card-stat-free"><CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground font-medium">Available</div>
            <div className="text-2xl font-bold text-green-600">{analytics.free}</div>
            <div className="text-xs text-muted-foreground">of {analytics.totalTables} tables</div>
          </CardContent></Card>
          <Card data-testid="card-stat-occupied"><CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground font-medium">Occupied</div>
            <div className="text-2xl font-bold text-red-600">{analytics.occupied}</div>
            <div className="text-xs text-muted-foreground">{analytics.reserved} reserved</div>
          </CardContent></Card>
          <Card data-testid="card-stat-waitlist"><CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground font-medium">Waitlist</div>
            <div className="text-2xl font-bold text-blue-600">{analytics.waitingCount}</div>
            <div className="text-xs text-muted-foreground">parties waiting</div>
          </CardContent></Card>
          <Card data-testid="card-stat-avg-wait"><CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground font-medium">Avg Wait</div>
            <div className="text-2xl font-bold">{analytics.avgWaitMinutes}m</div>
            <div className="text-xs text-muted-foreground">wait time</div>
          </CardContent></Card>
          <Card data-testid="card-stat-dining"><CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground font-medium">Avg Dining</div>
            <div className="text-2xl font-bold">{analytics.avgDiningMinutes}m</div>
            <div className="text-xs text-muted-foreground">{analytics.turnsToday} turns today</div>
          </CardContent></Card>
          <Card data-testid="card-stat-turn"><CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground font-medium">Turn Time</div>
            <div className="text-2xl font-bold">{analytics.avgTurnTime}m</div>
            <div className="text-xs text-muted-foreground">{analytics.cleaning} cleaning</div>
          </CardContent></Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="floor" data-testid="tab-floor"><LayoutGrid className="w-4 h-4 mr-1.5" />Floor Plan</TabsTrigger>
          <TabsTrigger value="waitlist" data-testid="tab-waitlist"><ListOrdered className="w-4 h-4 mr-1.5" />Waitlist ({activeWaitlist.length})</TabsTrigger>
          <TabsTrigger value="reservations" data-testid="tab-reservations"><CalendarDays className="w-4 h-4 mr-1.5" />Reservations</TabsTrigger>
          <TabsTrigger value="zones" data-testid="tab-zones"><MapPin className="w-4 h-4 mr-1.5" />Zones</TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics"><BarChart3 className="w-4 h-4 mr-1.5" />Analytics</TabsTrigger>
          <TabsTrigger value="qr-management" data-testid="tab-qr-management"><QrCode className="w-4 h-4 mr-1.5" />QR Codes</TabsTrigger>
        </TabsList>

        <TabsContent value="floor" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search tables..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8" data-testid="input-search-tables" />
            </div>
            <Select value={filterZone} onValueChange={setFilterZone}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-zone"><Filter className="w-3.5 h-3.5 mr-1.5" /><SelectValue placeholder="Zone" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Zones</SelectItem>
                {uniqueZones.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {(Object.keys(statusConfig) as TableStatus[]).map(s => <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex border rounded-lg overflow-hidden">
              <Button variant={viewMode === "grid" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setViewMode("grid")} data-testid="button-view-grid">
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button variant={viewMode === "floorplan" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setViewMode("floorplan")} data-testid="button-view-floorplan">
                <Move className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowZoneManager(true)} data-testid="button-manage-zones">
              <Palette className="w-4 h-4 mr-1.5" />Zones
            </Button>
          </div>

          <div className="flex gap-2 mb-2">
            {(Object.keys(statusConfig) as TableStatus[]).map(s => {
              const count = tables.filter(t => t.status === s).length;
              return (
                <div key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className={`w-2.5 h-2.5 rounded-full ${statusConfig[s].dot}`} />
                  <span>{statusConfig[s].label} ({count})</span>
                </div>
              );
            })}
          </div>

          {viewMode === "floorplan" ? (
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                  <GripVertical className="w-3.5 h-3.5" />
                  Drag tables to reposition. Drag an occupied table onto a free table to transfer the party.
                </div>
                <div
                  ref={canvasRef}
                  className="relative border-2 border-dashed rounded-lg bg-muted/30 overflow-hidden select-none"
                  style={{ width: CANVAS_W, height: CANVAS_H }}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  data-testid="floor-plan-canvas"
                >
                  {Array.from({ length: Math.floor(CANVAS_W / GRID_SIZE) + 1 }).map((_, i) => (
                    <div key={`gv-${i}`} className="absolute top-0 bottom-0 border-l border-muted/40" style={{ left: i * GRID_SIZE }} />
                  ))}
                  {Array.from({ length: Math.floor(CANVAS_H / GRID_SIZE) + 1 }).map((_, i) => (
                    <div key={`gh-${i}`} className="absolute left-0 right-0 border-t border-muted/40" style={{ top: i * GRID_SIZE }} />
                  ))}

                  {filteredTables.map(table => {
                    const status = table.status || "free";
                    const cfg = statusConfig[status];
                    const isCircle = table.shape === "circle";
                    const isRect = table.shape === "rectangle";
                    const w = isRect ? TABLE_W * 1.5 : TABLE_W;
                    const h = isCircle ? TABLE_W : TABLE_H;
                    const zoneConfig = zones.find(z => z.name === table.zone);
                    return (
                      <div
                        key={table.id}
                        id={`floor-table-${table.id}`}
                        className={`absolute cursor-grab active:cursor-grabbing border-2 flex flex-col items-center justify-center text-center transition-shadow hover:shadow-lg ${cfg.bg} ${isCircle ? "rounded-full" : "rounded-lg"} ${dragTableId === table.id ? "shadow-xl z-50 opacity-80" : ""}`}
                        style={{
                          left: table.posX || 0,
                          top: table.posY || 0,
                          width: w,
                          height: h,
                          borderColor: zoneConfig?.color || undefined,
                        }}
                        onMouseDown={(e) => handleCanvasMouseDown(e, table.id)}
                        onDoubleClick={() => openTableDetail(table)}
                        data-testid={`floor-table-${table.id}`}
                      >
                        <div className="font-bold text-sm">T{table.number}</div>
                        <div className="text-[10px] flex items-center gap-0.5">
                          <Users className="w-3 h-3" />{table.partySize || 0}/{table.capacity || 4}
                        </div>
                        {table.partyName && <div className="text-[10px] font-medium truncate max-w-[80px]">{table.partyName}</div>}
                        {table.seatedAt && status === "occupied" && (
                          <div className="text-[9px] opacity-70">{getTimeSince(table.seatedAt)}</div>
                        )}
                        {table.mergedWith && (
                          <div className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                            <Merge className="w-2.5 h-2.5" />
                          </div>
                        )}
                        {(resourcesByTable[table.id] || []).length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-0.5" data-testid={`resource-icons-table-${table.id}`}>
                            {(resourcesByTable[table.id] || []).map((r, idx) => (
                              <span key={idx} className="text-[9px]" data-testid={`resource-icon-${r.resourceCode}-${table.id}`}>
                                {r.resourceIcon}{resourceShortName(r.resourceCode)}×{r.quantity}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {uniqueZones.filter(z => filterZone === "all" || z === filterZone).map(zoneName => {
                const zoneTables = filteredTables.filter(t => (t.zone || "Main") === zoneName);
                if (zoneTables.length === 0) return null;
                const zoneConfig = zones.find(z => z.name === zoneName);
                return (
                  <div key={zoneName} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: zoneConfig?.color || "#6366f1" }} />
                      <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">{zoneName}</h3>
                      <Badge variant="outline" className="text-xs">{zoneTables.length} tables</Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                      <AnimatePresence>
                        {zoneTables.map(table => {
                          const status = table.status || "free";
                          const cfg = statusConfig[status];
                          const Icon = statusIcon[status];
                          const isMerged = !!table.mergedWith;
                          const mergedTarget = tables.find(t => t.id === table.mergedWith);
                          return (
                            <motion.div
                              key={table.id}
                              layout
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className={`relative border-2 rounded-xl p-3 cursor-pointer transition-all hover:shadow-md ${cfg.bg} ${table.shape === "circle" ? "rounded-full aspect-square flex flex-col items-center justify-center" : ""}`}
                              onClick={() => openTableDetail(table)}
                              data-testid={`card-table-${table.id}`}
                            >
                              {isMerged && (
                                <div className="absolute -top-2 -right-2 bg-blue-500 text-white rounded-full p-0.5">
                                  <Merge className="w-3 h-3" />
                                </div>
                              )}
                              {table.callServerFlag && (
                                <div className="absolute -top-2 -left-2 bg-amber-500 text-white rounded-full p-0.5 animate-pulse" data-testid={`flag-call-server-${table.id}`}>
                                  <Bell className="w-3 h-3" />
                                </div>
                              )}
                              {table.requestBillFlag && (
                                <div className="absolute -bottom-2 -right-2 bg-blue-500 text-white rounded-full p-0.5 animate-pulse" data-testid={`flag-request-bill-${table.id}`}>
                                  <MessageSquare className="w-3 h-3" />
                                </div>
                              )}
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-sm">T{table.number}</span>
                                <Icon className={`w-4 h-4 ${cfg.color}`} />
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Users className="w-3 h-3" />
                                <span>{table.partySize || 0}/{table.capacity || 4}</span>
                              </div>
                              {table.partyName && <div className="text-xs font-medium mt-1 truncate">{table.partyName}</div>}
                              {table.seatedAt && status === "occupied" && (
                                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />{getTimeSince(table.seatedAt)}
                                </div>
                              )}
                              {isMerged && mergedTarget && <div className="text-xs text-blue-600 mt-0.5">+T{mergedTarget.number}</div>}
                              {(resourcesByTable[table.id] || []).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1" data-testid={`resource-icons-table-${table.id}`}>
                                  {(resourcesByTable[table.id] || []).map((r, idx) => (
                                    <span key={idx} className="text-[10px] bg-blue-50 text-blue-700 rounded px-1" data-testid={`resource-icon-${r.resourceCode}-${table.id}`}>
                                      {r.resourceIcon}{resourceShortName(r.resourceCode)}×{r.quantity}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-1 mt-2">
                                {status === "free" && (
                                  <Button size="sm" variant="ghost" className="h-6 text-xs px-1.5" onClick={e => { e.stopPropagation(); openSeatDialog(table); }} data-testid={`button-seat-${table.id}`}>
                                    <Armchair className="w-3 h-3 mr-1" />Seat
                                  </Button>
                                )}
                                {status === "occupied" && (
                                  <Button size="sm" variant="ghost" className="h-6 text-xs px-1.5" onClick={e => { e.stopPropagation(); clearTableMut.mutate(table.id); }} data-testid={`button-clear-${table.id}`}>
                                    <Sparkles className="w-3 h-3 mr-1" />Clear
                                  </Button>
                                )}
                                {status === "cleaning" && (
                                  <Button size="sm" variant="ghost" className="h-6 text-xs px-1.5" onClick={e => { e.stopPropagation(); quickStatusMut.mutate({ id: table.id, status: "free" }); }} data-testid={`button-mark-free-${table.id}`}>
                                    <Check className="w-3 h-3 mr-1" />Ready
                                  </Button>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </TabsContent>

        <TabsContent value="waitlist" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Active Waitlist</h2>
            <Button onClick={() => setShowAddWaitlist(true)} data-testid="button-add-waitlist-tab">
              <UserPlus className="w-4 h-4 mr-2" />Add Party
            </Button>
          </div>
          {activeWaitlist.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No parties waiting</p>
              <p className="text-sm mt-1">Add walk-in guests to the waitlist when all tables are occupied.</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {activeWaitlist.map((entry, idx) => (
                <motion.div key={entry.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}>
                  <Card data-testid={`card-waitlist-${entry.id}`}>
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {entry.customerName}
                            {entry.priority !== undefined && entry.priority !== null && <Badge variant="outline" className="text-[10px] h-4">P{entry.priority}</Badge>}
                            {entry.notificationSent && <Badge variant="outline" className="text-[10px] h-4"><Bell className="w-2.5 h-2.5 mr-0.5" />Notified</Badge>}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{entry.partySize} guests</span>
                            {entry.customerPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{entry.customerPhone}</span>}
                            {entry.preferredZone && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{entry.preferredZone}</span>}
                            {entry.createdAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Waiting {getTimeSince(entry.createdAt)}</span>}
                          </div>
                          {entry.notes && <div className="text-xs text-muted-foreground mt-1">{entry.notes}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs font-medium text-muted-foreground">~{entry.estimatedWaitMinutes || "?"}min</div>
                        {entry.customerPhone && !entry.notificationSent && (
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => notifyWaitlistMut.mutate(entry.id)} title="Send notification" data-testid={`button-notify-waitlist-${entry.id}`}>
                            <Bell className="w-4 h-4" />
                          </Button>
                        )}
                        <Select onValueChange={(tableId) => seatWaitlistMut.mutate({ id: entry.id, tableId })}>
                          <SelectTrigger className="w-[120px] h-8" data-testid={`select-seat-waitlist-${entry.id}`}>
                            <SelectValue placeholder="Seat at..." />
                          </SelectTrigger>
                          <SelectContent>
                            {tables.filter(t => t.status === "free").map(t => (
                              <SelectItem key={t.id} value={t.id}>T{t.number} ({t.capacity} seats)</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeWaitlistMut.mutate(entry.id)} data-testid={`button-remove-waitlist-${entry.id}`}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reservations" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCalendarWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })} data-testid="button-prev-week">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium min-w-[200px] text-center">
                {calendarWeekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {weekDays[6]?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <Button variant="outline" size="icon" onClick={() => setCalendarWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })} data-testid="button-next-week">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button onClick={() => { setResFormData({ customerName: "", customerPhone: "", tableId: "", guests: "2", dateTime: "", notes: "", customerId: "" }); setShowAddReservation(true); }} data-testid="button-add-reservation">
              <Plus className="w-4 h-4 mr-2" />Reservation
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map(day => {
              const dayReservations = getReservationsForDay(day);
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <div key={day.toISOString()} className={`border rounded-lg p-2 min-h-[120px] ${isToday ? "border-primary bg-primary/5" : ""}`}>
                  <div className={`text-xs font-medium mb-2 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {day.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
                  </div>
                  <div className="space-y-1">
                    {dayReservations.map(r => {
                      const rStatus = r.status || "pending";
                      const rCfg = reservationStatusConfig[rStatus];
                      return (
                        <div key={r.id} className={`text-xs p-1.5 rounded cursor-pointer hover:opacity-80 ${rCfg.color}`} onClick={() => { setSelectedReservation(r); setShowReservationDetail(true); }} data-testid={`card-reservation-${r.id}`}>
                          <div className="font-medium truncate flex items-center gap-1">
                            {r.customerName}
                            {((r.resourceRequirements && r.resourceRequirements.length > 0) || (r.resource_requirements && r.resource_requirements!.length > 0)) && (
                              <span className="text-[10px]" title="Has pre-booked resources">🪑</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] opacity-80">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(r.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            <span className="mx-0.5">·</span>
                            <Users className="w-2.5 h-2.5" />{r.guests}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="zones" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Zone Management</h2>
          </div>
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex gap-2">
                <Input placeholder="Zone name..." value={zoneForm.name} onChange={e => setZoneForm({ ...zoneForm, name: e.target.value })} data-testid="input-zone-name" />
                <Input type="color" value={zoneForm.color} onChange={e => setZoneForm({ ...zoneForm, color: e.target.value })} className="w-14 p-1 h-10" data-testid="input-zone-color" />
                <Button onClick={() => createZoneMut.mutate({ name: zoneForm.name, color: zoneForm.color })} disabled={!zoneForm.name} data-testid="button-create-zone">
                  <Plus className="w-4 h-4 mr-1" />Add
                </Button>
              </div>
              <div className="space-y-2">
                {zones.map(zone => (
                  <div key={zone.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`card-zone-${zone.id}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full border-2" style={{ backgroundColor: zone.color || "#6366f1" }} />
                      {editingZone?.id === zone.id ? (
                        <div className="flex gap-2">
                          <Input value={editingZone.name} onChange={e => setEditingZone({ ...editingZone, name: e.target.value })} className="h-8 w-40" data-testid={`input-edit-zone-name-${zone.id}`} />
                          <Input type="color" value={editingZone.color || "#6366f1"} onChange={e => setEditingZone({ ...editingZone, color: e.target.value })} className="w-10 p-0.5 h-8" />
                          <Button size="sm" onClick={() => updateZoneMut.mutate({ id: editingZone.id, name: editingZone.name, color: editingZone.color })} data-testid={`button-save-zone-${zone.id}`}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingZone(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <>
                          <span className="font-medium">{zone.name}</span>
                          <Badge variant="outline" className="text-xs">{tables.filter(t => t.zone === zone.name).length} tables</Badge>
                        </>
                      )}
                    </div>
                    {editingZone?.id !== zone.id && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingZone(zone)} data-testid={`button-edit-zone-${zone.id}`}><Edit2 className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteZoneMut.mutate(zone.id)} data-testid={`button-delete-zone-${zone.id}`}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    )}
                  </div>
                ))}
                {zones.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No zones defined. Create zones to organize your floor plan.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <h2 className="text-lg font-semibold">Table Analytics</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {analytics && Object.keys(analytics.byZone).length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Zone Occupancy</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(analytics.byZone).map(([zone, data]) => {
                      const pct = data.total > 0 ? Math.round((data.occupied / data.total) * 100) : 0;
                      return (
                        <div key={zone} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{zone}</span>
                            <span className="text-muted-foreground">{data.occupied}/{data.total} ({pct}%)</span>
                          </div>
                          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {analytics && Object.keys(analytics.waitByHour).length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Waitlist by Hour</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(analytics.waitByHour).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([hour, count]) => {
                      const maxCount = Math.max(...Object.values(analytics.waitByHour));
                      const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                      return (
                        <div key={hour} className="flex items-center gap-3 text-sm">
                          <span className="w-12 text-muted-foreground text-right">{hour}</span>
                          <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                            <div className="h-full bg-blue-500 rounded transition-all flex items-center justify-end pr-1" style={{ width: `${pct}%` }}>
                              {pct > 20 && <span className="text-[10px] text-white font-medium">{count}</span>}
                            </div>
                          </div>
                          {pct <= 20 && <span className="text-xs text-muted-foreground">{count}</span>}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {analytics && analytics.waitByDay && Object.keys(analytics.waitByDay).length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Waitlist by Day</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].filter(d => analytics.waitByDay[d]).map(day => {
                      const count = analytics.waitByDay[day] || 0;
                      const maxCount = Math.max(...Object.values(analytics.waitByDay));
                      const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                      return (
                        <div key={day} className="flex items-center gap-3 text-sm">
                          <span className="w-12 text-muted-foreground text-right">{day}</span>
                          <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                            <div className="h-full bg-purple-500 rounded transition-all flex items-center justify-end pr-1" style={{ width: `${pct}%` }}>
                              {pct > 20 && <span className="text-[10px] text-white font-medium">{count}</span>}
                            </div>
                          </div>
                          {pct <= 20 && <span className="text-xs text-muted-foreground">{count}</span>}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-sm">Performance Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm"><TrendingUp className="w-4 h-4 text-primary" />Occupancy Rate</div>
                    <span className="font-bold text-lg">{analytics?.occupancyRate || 0}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm"><Clock className="w-4 h-4 text-orange-500" />Avg Dining Duration</div>
                    <span className="font-bold text-lg">{analytics?.avgDiningMinutes || 0}m</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm"><ArrowRightLeft className="w-4 h-4 text-blue-500" />Table Turns Today</div>
                    <span className="font-bold text-lg">{analytics?.turnsToday || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm"><Timer className="w-4 h-4 text-green-500" />Avg Turn Time</div>
                    <span className="font-bold text-lg">{analytics?.avgTurnTime || 0}m</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm"><Users className="w-4 h-4 text-purple-500" />Avg Wait Time</div>
                    <span className="font-bold text-lg">{analytics?.avgWaitMinutes || 0}m</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Current Status Breakdown</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(Object.keys(statusConfig) as TableStatus[]).map(s => {
                    const statusCountMap: Record<string, number> = analytics ? { free: analytics.free, occupied: analytics.occupied, reserved: analytics.reserved, cleaning: analytics.cleaning, blocked: analytics.blocked } : {};
                    const count = statusCountMap[s] || 0;
                    const total = analytics?.totalTables || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={s} className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${statusConfig[s].dot}`} />
                        <span className="text-sm flex-1">{statusConfig[s].label}</span>
                        <span className="text-sm font-medium">{count}</span>
                        <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: statusConfig[s].fill }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="qr-management" className="space-y-4">
          <QrManagementTab tables={tables} toast={toast} queryClient={queryClient} user={user} />
        </TabsContent>
      </Tabs>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Table</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Table Number</Label><Input type="number" value={formData.number} onChange={e => setFormData({ ...formData, number: e.target.value })} data-testid="input-table-number" /></div>
              <div><Label>Capacity</Label><Input type="number" value={formData.capacity} onChange={e => setFormData({ ...formData, capacity: e.target.value })} data-testid="input-table-capacity" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Zone</Label>
                <Select value={formData.zone} onValueChange={v => setFormData({ ...formData, zone: v })}>
                  <SelectTrigger data-testid="select-table-zone"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {uniqueZones.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                    {zones.filter(z => !uniqueZones.includes(z.name)).map(z => <SelectItem key={z.id} value={z.name}>{z.name}</SelectItem>)}
                    <SelectItem value="Main">Main</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Shape</Label>
                <Select value={formData.shape} onValueChange={v => setFormData({ ...formData, shape: v })}>
                  <SelectTrigger data-testid="select-table-shape"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="square"><div className="flex items-center gap-2"><Square className="w-4 h-4" />Square</div></SelectItem>
                    <SelectItem value="circle"><div className="flex items-center gap-2"><Circle className="w-4 h-4" />Round</div></SelectItem>
                    <SelectItem value="rectangle"><div className="flex items-center gap-2"><RectangleHorizontal className="w-4 h-4" />Rectangle</div></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Status</Label>
                <Select value={formData.status} onValueChange={(v: string) => setFormData({ ...formData, status: v as TableStatus })}>
                  <SelectTrigger data-testid="select-table-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(statusConfig) as TableStatus[]).map(s => <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Position X</Label><Input type="number" value={formData.posX} onChange={e => setFormData({ ...formData, posX: e.target.value })} data-testid="input-table-posx" /></div>
              <div><Label>Position Y</Label><Input type="number" value={formData.posY} onChange={e => setFormData({ ...formData, posY: e.target.value })} data-testid="input-table-posy" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddTable} disabled={!formData.number || createTableMut.isPending} data-testid="button-submit-table">Add Table</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Table {selectedTable?.number}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Table Number</Label><Input type="number" value={formData.number} onChange={e => setFormData({ ...formData, number: e.target.value })} data-testid="input-edit-table-number" /></div>
              <div><Label>Capacity</Label><Input type="number" value={formData.capacity} onChange={e => setFormData({ ...formData, capacity: e.target.value })} data-testid="input-edit-table-capacity" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Zone</Label>
                <Select value={formData.zone} onValueChange={v => setFormData({ ...formData, zone: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {uniqueZones.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                    {zones.filter(z => !uniqueZones.includes(z.name)).map(z => <SelectItem key={z.id} value={z.name}>{z.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Shape</Label>
                <Select value={formData.shape} onValueChange={v => setFormData({ ...formData, shape: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="square"><div className="flex items-center gap-2"><Square className="w-4 h-4" />Square</div></SelectItem>
                    <SelectItem value="circle"><div className="flex items-center gap-2"><Circle className="w-4 h-4" />Round</div></SelectItem>
                    <SelectItem value="rectangle"><div className="flex items-center gap-2"><RectangleHorizontal className="w-4 h-4" />Rectangle</div></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Status</Label>
                <Select value={formData.status} onValueChange={(v: string) => setFormData({ ...formData, status: v as TableStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(statusConfig) as TableStatus[]).map(s => <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Position X</Label><Input type="number" value={formData.posX} onChange={e => setFormData({ ...formData, posX: e.target.value })} data-testid="input-edit-table-posx" /></div>
              <div><Label>Position Y</Label><Input type="number" value={formData.posY} onChange={e => setFormData({ ...formData, posY: e.target.value })} data-testid="input-edit-table-posy" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleEditTable} disabled={updateTableMut.isPending} data-testid="button-save-table">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent>
          {selectedTable && (() => {
            const s = selectedTable.status || "free";
            const cfg = statusConfig[s];
            const Icon = statusIcon[s];
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon className={`w-5 h-5 ${cfg.color}`} />
                    Table {selectedTable.number}
                    <Badge className={cfg.bg + " " + cfg.color}>{cfg.label}</Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Zone:</span> <span className="font-medium">{selectedTable.zone || "Main"}</span></div>
                    <div><span className="text-muted-foreground">Capacity:</span> <span className="font-medium">{selectedTable.capacity || 4}</span></div>
                    <div><span className="text-muted-foreground">Shape:</span> <span className="font-medium capitalize">{selectedTable.shape || "square"}</span></div>
                    <div><span className="text-muted-foreground">Position:</span> <span className="font-medium">({selectedTable.posX || 0}, {selectedTable.posY || 0})</span></div>
                    {selectedTable.partyName && <div><span className="text-muted-foreground">Party:</span> <span className="font-medium">{selectedTable.partyName}</span></div>}
                    {selectedTable.partySize && <div><span className="text-muted-foreground">Guests:</span> <span className="font-medium">{selectedTable.partySize}</span></div>}
                    {selectedTable.seatedAt && <div><span className="text-muted-foreground">Seated:</span> <span className="font-medium">{getTimeSince(selectedTable.seatedAt)} ago</span></div>}
                    {selectedTable.mergedWith && (() => {
                      const mt = tables.find(t => t.id === selectedTable.mergedWith);
                      return mt ? <div><span className="text-muted-foreground">Merged with:</span> <span className="font-medium">T{mt.number}</span></div> : null;
                    })()}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s === "free" && (
                      <Button size="sm" onClick={() => { setShowDetailDialog(false); openSeatDialog(selectedTable); }} data-testid="button-detail-seat">
                        <Armchair className="w-4 h-4 mr-1.5" />Seat Party
                      </Button>
                    )}
                    {s === "occupied" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => clearTableMut.mutate(selectedTable.id)} data-testid="button-detail-clear">
                          <Sparkles className="w-4 h-4 mr-1.5" />Clear Table
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setTransferTargetId(""); setShowTransferDialog(true); }} data-testid="button-detail-transfer">
                          <ArrowRightLeft className="w-4 h-4 mr-1.5" />Transfer Party
                        </Button>
                      </>
                    )}
                    {s === "cleaning" && (
                      <Button size="sm" onClick={() => quickStatusMut.mutate({ id: selectedTable.id, status: "free" })} data-testid="button-detail-ready">
                        <Check className="w-4 h-4 mr-1.5" />Mark Ready
                      </Button>
                    )}
                    {!selectedTable.mergedWith && s !== "blocked" && (
                      <Button size="sm" variant="outline" onClick={() => { setMergeTargetId(""); setShowMergeDialog(true); }} data-testid="button-detail-merge">
                        <Merge className="w-4 h-4 mr-1.5" />Merge
                      </Button>
                    )}
                    {selectedTable.mergedWith && (
                      <Button size="sm" variant="outline" onClick={() => unmergeTableMut.mutate(selectedTable.id)} data-testid="button-detail-unmerge">
                        <Unlink className="w-4 h-4 mr-1.5" />Split / Unmerge
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { setShowDetailDialog(false); openEditDialog(selectedTable); }} data-testid="button-detail-edit">
                      <Edit2 className="w-4 h-4 mr-1.5" />Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { if (confirm("Delete this table?")) deleteTableMut.mutate(selectedTable.id); }} data-testid="button-detail-delete">
                      <Trash2 className="w-4 h-4 mr-1.5" />Delete
                    </Button>
                  </div>
                  {(selectedTable.callServerFlag || selectedTable.requestBillFlag) && (
                    <div className="flex flex-wrap gap-2">
                      {selectedTable.callServerFlag && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-300 animate-pulse" data-testid="badge-call-server">
                          <Bell className="w-3 h-3 mr-1" /> Server Requested
                        </Badge>
                      )}
                      {selectedTable.requestBillFlag && (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-300 animate-pulse" data-testid="badge-request-bill">
                          <MessageSquare className="w-3 h-3 mr-1" /> Bill Requested
                        </Badge>
                      )}
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => {
                        apiRequest("PATCH", `/api/tables/${selectedTable.id}`, { callServerFlag: false, requestBillFlag: false }).then(() => { invalidateAll(); toast({ title: "Flags dismissed" }); });
                      }} data-testid="button-dismiss-flags">
                        <Check className="w-3 h-3 mr-1" />Dismiss Flags
                      </Button>
                    </div>
                  )}
                  <div className="border-t pt-3">
                    <h4 className="text-sm font-medium mb-2">Quick Status</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(statusConfig) as TableStatus[]).map(st => (
                        <Button key={st} size="sm" variant={s === st ? "default" : "outline"} className="text-xs h-7" onClick={() => quickStatusMut.mutate({ id: selectedTable.id, status: st })} data-testid={`button-status-${st}`}>
                          {statusConfig[st].label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {selectedTable.outletId && (
                    <div className="border-t pt-3">
                      <h4 className="text-sm font-medium mb-2">Guest QR Ordering</h4>
                      <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                        {selectedTable.qrToken ? (
                          <>
                            <div className="text-xs text-muted-foreground break-all font-mono" data-testid="text-qr-link">
                              {window.location.origin}/guest/o/{selectedTable.outletId}/t/{selectedTable.qrToken}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs"
                                onClick={() => {
                                  navigator.clipboard.writeText(`${window.location.origin}/guest/o/${selectedTable.outletId}/t/${selectedTable.qrToken}`);
                                  toast({ title: "QR link copied to clipboard" });
                                }}
                                data-testid="button-copy-qr-link"
                              >
                                Copy Link
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs"
                                onClick={() => {
                                  const url = `${window.location.origin}/guest/o/${selectedTable.outletId}/t/${selectedTable.qrToken}`;
                                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
                                  const link = document.createElement("a");
                                  link.href = qrUrl;
                                  link.download = `table-${selectedTable.number}-qr.png`;
                                  link.target = "_blank";
                                  link.click();
                                }}
                                data-testid="button-download-qr"
                              >
                                Download QR
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-muted-foreground"
                                onClick={() => {
                                  apiRequest("POST", `/api/tables/${selectedTable.id}/generate-qr-token`).then(() => {
                                    invalidateAll();
                                    toast({ title: "QR token regenerated" });
                                  });
                                }}
                                data-testid="button-regenerate-qr"
                              >
                                Regenerate
                              </Button>
                            </div>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              apiRequest("POST", `/api/tables/${selectedTable.id}/generate-qr-token`).then(() => {
                                invalidateAll();
                                toast({ title: "QR token generated" });
                              });
                            }}
                            data-testid="button-generate-qr-token"
                          >
                            Generate QR Token
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={showSeatDialog} onOpenChange={open => { setShowSeatDialog(open); if (!open) { setSeatResourceRequirements([]); setLiveAvailabilityCheck([]); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Seat Party at Table {selectedTable?.number}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Party Name</Label><Input value={seatFormData.partyName} onChange={e => setSeatFormData({ ...seatFormData, partyName: e.target.value })} placeholder="Guest name..." data-testid="input-seat-party-name" /></div>
            <div><Label>Party Size</Label><Input type="number" value={seatFormData.partySize} onChange={e => setSeatFormData({ ...seatFormData, partySize: e.target.value })} data-testid="input-seat-party-size" /></div>
            {outletResources.length > 0 && (
              <div data-testid="section-special-requirements">
                <Label className="font-semibold text-sm">Special Requirements</Label>
                <div className="space-y-2 mt-2">
                  {outletResources.map(res => {
                    const qty = seatResourceRequirements.find(r => r.resourceId === res.id)?.quantity ?? 0;
                    const maxQty = res.isTrackable ? res.totalUnits : 1;
                    return (
                      <div key={res.id} className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-1">
                          <span>{res.resourceIcon}</span>
                          <span>{res.resourceName} needed?</span>
                        </span>
                        {res.isTrackable ? (
                          <Select value={String(qty)} onValueChange={v => {
                            const newQty = parseInt(v);
                            setSeatResourceRequirements(prev => {
                              const filtered = prev.filter(r => r.resourceId !== res.id);
                              if (newQty > 0) filtered.push({ resourceId: res.id, quantity: newQty });
                              return filtered;
                            });
                          }}>
                            <SelectTrigger className="w-16 h-7 text-xs" data-testid={`select-resource-qty-walkin-${res.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: maxQty + 1 }, (_, i) => (
                                <SelectItem key={i} value={String(i)}>{i}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <input type="checkbox" className="h-4 w-4 cursor-pointer" checked={qty === 1} data-testid={`select-resource-qty-walkin-${res.id}`} onChange={e => {
                            const newQty = e.target.checked ? 1 : 0;
                            setSeatResourceRequirements(prev => {
                              const filtered = prev.filter(r => r.resourceId !== res.id);
                              if (newQty > 0) filtered.push({ resourceId: res.id, quantity: newQty });
                              return filtered;
                            });
                          }} />
                        )}
                      </div>
                    );
                  })}
                </div>
                {liveAvailabilityCheck.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Availability Check</p>
                    {liveAvailabilityCheck.map(check => (
                      <div key={check.resourceId} className="flex items-center justify-between text-xs" data-testid={`badge-availability-check-${check.resourceId}`}>
                        <span>{check.resourceName}</span>
                        {check.sufficient ? (
                          <span className="text-green-600 font-medium">{check.available} available ✅</span>
                        ) : (
                          <span className="text-red-600 font-medium">{check.available} available ⚠️ {check.available === 0 ? "All in use" : "Not enough"}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSeatDialog(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!selectedTable) return;
              const reqResources = seatResourceRequirements.filter(r => r.quantity > 0);
              if (reqResources.length > 0 && outletId) {
                let checkResult: {available: boolean; conflicts: {resourceId: string; resourceName: string; requested: number; available: number}[]} | null = null;
                try {
                  const checkResp = await apiRequest("POST", "/api/resources/check-availability", {
                    outletId,
                    requirements: reqResources.map(r => ({ resourceId: r.resourceId, quantity: r.quantity })),
                  });
                  checkResult = await checkResp.json();
                } catch {}
                if (checkResult && !checkResult.available && checkResult.conflicts.length > 0) {
                  setAvailabilityCheck(checkResult.conflicts.map(c => {
                    const inUseEntry = Object.entries(resourcesByTable).find(([, assignments]) =>
                      assignments.some(a => a.resourceId === c.resourceId)
                    );
                    const inUseAssignment = inUseEntry ? inUseEntry[1].find(a => a.resourceId === c.resourceId) : null;
                    return {
                      resourceId: c.resourceId,
                      resourceName: c.resourceName,
                      available: c.available,
                      requested: c.requested,
                      inUseAtTable: inUseEntry ? tables.find(t => t.id === inUseEntry[0])?.number?.toString() : undefined,
                      sinceTime: inUseAssignment?.assignedAt ? new Date(inUseAssignment.assignedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : undefined,
                    };
                  }));
                  setShowResourceUnavailableDialog(true);
                  return;
                }
              }
              seatTableMut.mutate({ id: selectedTable.id, partyName: seatFormData.partyName, partySize: parseInt(seatFormData.partySize) }, {
                onSuccess: async () => {
                  if (reqResources.length > 0 && outletId) {
                    try {
                      await apiRequest("POST", "/api/resources/assign", {
                        tableId: selectedTable.id,
                        outletId,
                        resources: reqResources.map(r => ({ resourceId: r.resourceId, quantity: r.quantity })),
                      });
                      queryClient.invalidateQueries({ queryKey: ["/api/resources/assignments/by-outlet", outletId] });
                      queryClient.invalidateQueries({ queryKey: ["/api/resources/availability", outletId] });
                    } catch {
                      toast({ title: "Resource assignment pending", description: "Table seated. Please manually assign requested resources.", variant: "default" });
                    }
                  }
                }
              });
            }} disabled={seatTableMut.isPending} data-testid={seatResourceRequirements.filter(r => r.quantity > 0).length > 0 ? "button-assign-table-resources" : "button-confirm-seat"}>
              {seatResourceRequirements.filter(r => r.quantity > 0).length > 0 ? "Assign Table & Resources" : "Seat Party"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResourceUnavailableDialog} onOpenChange={setShowResourceUnavailableDialog}>
        <DialogContent data-testid="dialog-resource-unavailable">
          <DialogHeader><DialogTitle>⚠️ Resource Unavailable</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {availabilityCheck.map(r => (
              <div key={r.resourceId} className="bg-orange-50 border border-orange-200 rounded p-3 text-sm">
                <div className="font-semibold">{r.resourceName}: {r.available === 0 ? "All" : r.requested - r.available} unit{r.requested > 1 ? "s" : ""} unavailable</div>
                {r.inUseAtTable && (
                  <div className="text-muted-foreground text-xs mt-1">
                    In use at: Table {r.inUseAtTable}{r.sinceTime ? ` since ${r.sinceTime}` : ""}
                  </div>
                )}
              </div>
            ))}
            <p className="text-sm text-muted-foreground">How would you like to proceed?</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={async () => {
              setShowResourceUnavailableDialog(false);
              if (!selectedTable) return;
              const conflictedIds = new Set(availabilityCheck.map(c => c.resourceId));
              const availableResources = seatResourceRequirements.filter(r => r.quantity > 0 && !conflictedIds.has(r.resourceId));
              seatTableMut.mutate({ id: selectedTable.id, partyName: seatFormData.partyName, partySize: parseInt(seatFormData.partySize) }, {
                onSuccess: async () => {
                  if (availableResources.length > 0 && outletId) {
                    try {
                      await apiRequest("POST", "/api/resources/assign", {
                        tableId: selectedTable.id,
                        outletId,
                        resources: availableResources.map(r => ({ resourceId: r.resourceId, quantity: r.quantity })),
                      });
                      queryClient.invalidateQueries({ queryKey: ["/api/resources/assignments/by-outlet", outletId] });
                      queryClient.invalidateQueries({ queryKey: ["/api/resources/availability", outletId] });
                    } catch {}
                  }
                }
              });
            }} data-testid="button-proceed-without-resource">Proceed Without</Button>
            <Button onClick={async () => {
              const resourceNames = availabilityCheck.map(r => r.resourceName).join(", ");
              try {
                await apiRequest("POST", "/api/waitlist", {
                  customerName: seatFormData.partyName || "Guest",
                  partySize: parseInt(seatFormData.partySize) || 1,
                  outletId,
                  notes: `Waiting for resource: ${resourceNames}`,
                  status: "waiting",
                  priority: 1,
                });
                queryClient.invalidateQueries({ queryKey: ["/api/waitlist"] });
              } catch {}
              setShowResourceUnavailableDialog(false);
              setShowSeatDialog(false);
              toast({ title: "Added to waitlist", description: `${seatFormData.partyName || "Customer"} added to waitlist pending ${resourceNames}` });
            }} data-testid="button-wait-notify-customer">Wait & Notify Customer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Merge Table {selectedTable?.number}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Merge with Table</Label>
              <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                <SelectTrigger data-testid="select-merge-target"><SelectValue placeholder="Select table..." /></SelectTrigger>
                <SelectContent>
                  {tables.filter(t => t.id !== selectedTable?.id && !t.mergedWith).map(t => (
                    <SelectItem key={t.id} value={t.id}>T{t.number} - {t.zone} ({t.capacity} seats)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeDialog(false)}>Cancel</Button>
            <Button onClick={() => { if (selectedTable && mergeTargetId) mergeTableMut.mutate({ id: selectedTable.id, targetTableId: mergeTargetId }); }} disabled={!mergeTargetId || mergeTableMut.isPending} data-testid="button-confirm-merge">Merge Tables</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer Party from Table {selectedTable?.number}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Move {selectedTable?.partyName || "the party"} ({selectedTable?.partySize} guests) to another table. You can also drag an occupied table onto a free table in the floor plan.</p>
          <div className="space-y-4">
            <div><Label>Transfer to Table</Label>
              <Select value={transferTargetId} onValueChange={setTransferTargetId}>
                <SelectTrigger data-testid="select-transfer-target"><SelectValue placeholder="Select free table..." /></SelectTrigger>
                <SelectContent>
                  {tables.filter(t => t.id !== selectedTable?.id && t.status === "free").map(t => (
                    <SelectItem key={t.id} value={t.id}>T{t.number} - {t.zone} ({t.capacity} seats)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>Cancel</Button>
            <Button onClick={() => { if (selectedTable && transferTargetId) { transferMut.mutate({ sourceId: selectedTable.id, targetId: transferTargetId }); setShowTransferDialog(false); setShowDetailDialog(false); } }} disabled={!transferTargetId || transferMut.isPending} data-testid="button-confirm-transfer">Transfer Party</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddWaitlist} onOpenChange={setShowAddWaitlist}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add to Waitlist</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Guest Name</Label><Input value={waitlistForm.customerName} onChange={e => setWaitlistForm({ ...waitlistForm, customerName: e.target.value })} placeholder="Name..." data-testid="input-waitlist-name" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Phone</Label><Input value={waitlistForm.customerPhone} onChange={e => setWaitlistForm({ ...waitlistForm, customerPhone: e.target.value })} placeholder="Phone..." data-testid="input-waitlist-phone" /></div>
              <div><Label>Party Size</Label><Input type="number" value={waitlistForm.partySize} onChange={e => setWaitlistForm({ ...waitlistForm, partySize: e.target.value })} data-testid="input-waitlist-party-size" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Preferred Zone</Label>
                <Select value={waitlistForm.preferredZone || "none"} onValueChange={v => setWaitlistForm({ ...waitlistForm, preferredZone: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="select-waitlist-zone"><SelectValue placeholder="Any zone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Any Zone</SelectItem>
                    {uniqueZones.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Est. Wait (min)</Label><Input type="number" value={waitlistForm.estimatedWaitMinutes} onChange={e => setWaitlistForm({ ...waitlistForm, estimatedWaitMinutes: e.target.value })} placeholder="Auto" data-testid="input-waitlist-wait-time" /></div>
            </div>
            <div><Label>Priority (0=highest)</Label><Input type="number" min="0" value={waitlistForm.priority} onChange={e => setWaitlistForm({ ...waitlistForm, priority: e.target.value })} data-testid="input-waitlist-priority" /></div>
            <div><Label>Notes</Label><Textarea value={waitlistForm.notes} onChange={e => setWaitlistForm({ ...waitlistForm, notes: e.target.value })} placeholder="Special requests..." data-testid="input-waitlist-notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddWaitlist(false)}>Cancel</Button>
            <Button onClick={() => createWaitlistMut.mutate({ customerName: waitlistForm.customerName, customerPhone: waitlistForm.customerPhone || undefined, partySize: parseInt(waitlistForm.partySize), preferredZone: waitlistForm.preferredZone || undefined, estimatedWaitMinutes: waitlistForm.estimatedWaitMinutes ? parseInt(waitlistForm.estimatedWaitMinutes) : undefined, priority: parseInt(waitlistForm.priority) || 0, notes: waitlistForm.notes || undefined })} disabled={!waitlistForm.customerName || createWaitlistMut.isPending} data-testid="button-submit-waitlist">Add to Waitlist</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddReservation} onOpenChange={open => { setShowAddReservation(open); if (!open) setResResourceRequirements([]); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Reservation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Customer Name</Label><Input value={resFormData.customerName} onChange={e => setResFormData({ ...resFormData, customerName: e.target.value })} placeholder="Guest name..." data-testid="input-res-name" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Phone</Label><Input value={resFormData.customerPhone} onChange={e => setResFormData({ ...resFormData, customerPhone: e.target.value })} data-testid="input-res-phone" /></div>
              <div><Label>Guests</Label><Input type="number" value={resFormData.guests} onChange={e => setResFormData({ ...resFormData, guests: e.target.value })} data-testid="input-res-guests" /></div>
            </div>
            <div><Label>Date & Time</Label><Input type="datetime-local" value={resFormData.dateTime} onChange={e => setResFormData({ ...resFormData, dateTime: e.target.value })} data-testid="input-res-datetime" /></div>
            <div><Label>Table (Optional)</Label>
              <Select value={resFormData.tableId || "none"} onValueChange={v => setResFormData({ ...resFormData, tableId: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="select-res-table"><SelectValue placeholder="Auto-assign" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Auto-assign</SelectItem>
                  {tables.map(t => <SelectItem key={t.id} value={t.id}>T{t.number} ({t.zone}, {t.capacity} seats)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {outletResources.filter(r => r.isTrackable).length > 0 && (
              <div data-testid="section-reservation-resources">
                <Label className="font-semibold text-sm">Special Resources Needed</Label>
                <div className="space-y-2 mt-2">
                  {outletResources.filter(r => r.isTrackable).map(res => {
                    const existing = resResourceRequirements.find(r => r.resourceId === res.id);
                    const qty = existing?.quantity ?? 0;
                    const maxQty = res.isTrackable ? res.totalUnits : 1;
                    return (
                      <div key={res.id} className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-1">
                          <span>{res.resourceIcon}</span>
                          <span>{res.resourceName}:</span>
                        </span>
                        <Select value={String(qty)} onValueChange={v => {
                          const newQty = parseInt(v);
                          setResResourceRequirements(prev => {
                            const filtered = prev.filter(r => r.resourceId !== res.id);
                            if (newQty > 0) filtered.push({ resourceId: res.id, resourceName: res.resourceName, icon: res.resourceIcon, quantity: newQty });
                            return filtered;
                          });
                        }}>
                          <SelectTrigger className="w-16 h-7 text-xs" data-testid={`select-resource-qty-${res.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: maxQty + 1 }, (_, i) => (
                              <SelectItem key={i} value={String(i)}>{i}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div><Label>Notes</Label><Textarea value={resFormData.notes} onChange={e => setResFormData({ ...resFormData, notes: e.target.value })} data-testid="input-res-notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddReservation(false)}>Cancel</Button>
            <Button onClick={() => {
              const reqResources = resResourceRequirements.filter(r => r.quantity > 0);
              createResMut.mutate({
                customerName: resFormData.customerName,
                customerPhone: resFormData.customerPhone || undefined,
                guests: parseInt(resFormData.guests),
                dateTime: resFormData.dateTime ? new Date(resFormData.dateTime).toISOString() : resFormData.dateTime,
                tableId: resFormData.tableId || undefined,
                notes: resFormData.notes || undefined,
                resource_requirements: reqResources.length > 0 ? reqResources.map(r => ({ resourceId: r.resourceId, resourceName: r.resourceName, quantity: r.quantity })) : undefined,
              });
            }} disabled={!resFormData.customerName || !resFormData.dateTime || createResMut.isPending} data-testid="button-submit-reservation">Create Reservation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReservationDetail} onOpenChange={setShowReservationDetail}>
        <DialogContent>
          {selectedReservation && (() => {
            const rStatus = selectedReservation.status || "pending";
            const rCfg = reservationStatusConfig[rStatus];
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    Reservation - {selectedReservation.customerName}
                    <Badge className={rCfg.color}>{rCfg.label}</Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-muted-foreground">Date & Time:</span><div className="font-medium">{new Date(selectedReservation.dateTime).toLocaleString()}</div></div>
                    <div><span className="text-muted-foreground">Guests:</span><div className="font-medium">{selectedReservation.guests}</div></div>
                    {selectedReservation.customerPhone && <div><span className="text-muted-foreground">Phone:</span><div className="font-medium">{selectedReservation.customerPhone}</div></div>}
                    {selectedReservation.tableId && <div><span className="text-muted-foreground">Table:</span><div className="font-medium">T{tables.find(t => t.id === selectedReservation.tableId)?.number || "?"}</div></div>}
                  </div>
                  {selectedReservation.notes && <div><span className="text-muted-foreground">Notes:</span><div>{selectedReservation.notes}</div></div>}
                  {(() => {
                    const reqs = selectedReservation.resourceRequirements || selectedReservation.resource_requirements;
                    if (!reqs || reqs.length === 0) return null;
                    return (
                      <div>
                        <span className="text-muted-foreground">Pre-booked Resources:</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {reqs.map((r, i) => (
                            <Badge key={i} variant="secondary" className="text-xs" data-testid={`badge-reservation-resource-${r.resourceId}`}>
                              {r.icon || "🪑"} {r.resourceName} × {r.quantity}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex gap-2 pt-2">
                    {rCfg.nextStatus && (
                      <Button size="sm" onClick={() => updateResMut.mutate({ id: selectedReservation.id, status: rCfg.nextStatus })} data-testid="button-advance-reservation">
                        {rCfg.nextStatus === "confirmed" ? "Confirm" : rCfg.nextStatus === "seated" ? "Mark Seated" : "Complete"}
                      </Button>
                    )}
                    {rStatus !== "no_show" && rStatus !== "completed" && (
                      <Button size="sm" variant="destructive" onClick={() => updateResMut.mutate({ id: selectedReservation.id, status: "no_show" })} data-testid="button-no-show">No Show</Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={showZoneManager} onOpenChange={setShowZoneManager}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Manage Zones</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="New zone name..." value={zoneForm.name} onChange={e => setZoneForm({ ...zoneForm, name: e.target.value })} data-testid="input-quick-zone-name" />
              <Input type="color" value={zoneForm.color} onChange={e => setZoneForm({ ...zoneForm, color: e.target.value })} className="w-12 p-1" />
              <Button size="sm" onClick={() => createZoneMut.mutate({ name: zoneForm.name, color: zoneForm.color })} disabled={!zoneForm.name} data-testid="button-quick-create-zone">Add</Button>
            </div>
            {zones.map(zone => (
              <div key={zone.id} className="flex items-center justify-between p-2 border rounded">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: zone.color || "#6366f1" }} />
                  <span className="text-sm font-medium">{zone.name}</span>
                  <span className="text-xs text-muted-foreground">({tables.filter(t => t.zone === zone.name).length})</span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteZoneMut.mutate(zone.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
