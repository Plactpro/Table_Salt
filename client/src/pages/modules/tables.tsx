import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Edit2, Trash2, Users, MapPin, Clock, CalendarDays,
  Filter, ChevronDown, ChevronLeft, ChevronRight,
  CircleCheck, CircleX, Timer, Sparkles, ShieldBan, Armchair,
  Phone, UserCheck, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type TableStatus = "free" | "occupied" | "reserved" | "cleaning" | "blocked";
type ReservationStatus = "requested" | "confirmed" | "seated" | "completed" | "no_show";

interface TableData {
  id: string;
  tenantId: string;
  outletId: string | null;
  number: number;
  capacity: number | null;
  zone: string | null;
  status: TableStatus | null;
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
}

interface CustomerData {
  id: string;
  name: string;
  phone: string | null;
}

const statusConfig: Record<TableStatus, { color: string; bg: string; label: string }> = {
  free: { color: "text-green-700 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700", label: "Free" },
  occupied: { color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700", label: "Occupied" },
  reserved: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700", label: "Reserved" },
  cleaning: { color: "text-stone-700 dark:text-stone-400", bg: "bg-stone-100 dark:bg-stone-900/40 border-stone-300 dark:border-stone-700", label: "Cleaning" },
  blocked: { color: "text-gray-700 dark:text-gray-400", bg: "bg-gray-100 dark:bg-gray-900/40 border-gray-300 dark:border-gray-700", label: "Blocked" },
};

const statusDotColor: Record<TableStatus, string> = {
  free: "bg-green-500",
  occupied: "bg-red-500",
  reserved: "bg-yellow-500",
  cleaning: "bg-stone-500",
  blocked: "bg-gray-500",
};

const statusIcon: Record<TableStatus, React.ElementType> = {
  free: CircleCheck,
  occupied: CircleX,
  reserved: Timer,
  cleaning: Sparkles,
  blocked: ShieldBan,
};

const reservationStatusConfig: Record<ReservationStatus, { label: string; color: string; nextStatus: ReservationStatus | null }> = {
  requested: { label: "Requested", color: "bg-gray-100 text-gray-700", nextStatus: "confirmed" },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-700", nextStatus: "seated" },
  seated: { label: "Seated", color: "bg-green-100 text-green-700", nextStatus: "completed" },
  completed: { label: "Completed", color: "bg-purple-100 text-purple-700", nextStatus: null },
  no_show: { label: "No Show", color: "bg-red-100 text-red-700", nextStatus: null },
};

export default function TablesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showAddReservation, setShowAddReservation] = useState(false);
  const [showReservationDetail, setShowReservationDetail] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ReservationData | null>(null);
  const [filterZone, setFilterZone] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [reservationDateFilter, setReservationDateFilter] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [activeTab, setActiveTab] = useState<"floor" | "reservations">("floor");
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [formData, setFormData] = useState({
    number: "", capacity: "4", zone: "Main", status: "free" as TableStatus,
  });

  const [resFormData, setResFormData] = useState({
    customerName: "", customerPhone: "", tableId: "", guests: "2",
    dateTime: "", notes: "", customerId: "",
  });

  const { data: tables = [], isLoading: tablesLoading } = useQuery<TableData[]>({
    queryKey: ["/api/tables"],
  });

  const { data: reservations = [], isLoading: reservationsLoading } = useQuery<ReservationData[]>({
    queryKey: ["/api/reservations"],
  });

  const { data: customers = [] } = useQuery<CustomerData[]>({
    queryKey: ["/api/customers"],
  });

  const createTableMutation = useMutation({
    mutationFn: async (data: { number: number; capacity: number; zone: string; status: string }) => {
      const res = await apiRequest("POST", "/api/tables", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      setShowAddDialog(false);
      resetForm();
      toast({ title: "Table added successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add table", description: err.message, variant: "destructive" });
    },
  });

  const updateTableMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; number?: number; capacity?: number; zone?: string; status?: string }) => {
      const res = await apiRequest("PATCH", `/api/tables/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      setShowEditDialog(false);
      setShowDetailDialog(false);
      setSelectedTable(null);
      resetForm();
      toast({ title: "Table updated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update table", description: err.message, variant: "destructive" });
    },
  });

  const deleteTableMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/tables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      setShowEditDialog(false);
      setSelectedTable(null);
      toast({ title: "Table deleted successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete table", description: err.message, variant: "destructive" });
    },
  });

  const createReservationMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/reservations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      if (resFormData.tableId && resFormData.tableId !== "none") {
        updateTableMutation.mutate({ id: resFormData.tableId, status: "reserved" });
      }
      setShowAddReservation(false);
      toast({ title: "Reservation created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateReservationMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/reservations/${id}`, data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      const newStatus = variables.data.status as ReservationStatus;
      if (selectedReservation?.tableId) {
        if (newStatus === "seated") {
          updateTableMutation.mutate({ id: selectedReservation.tableId, status: "occupied" });
        } else if (newStatus === "completed" || newStatus === "no_show") {
          updateTableMutation.mutate({ id: selectedReservation.tableId, status: "free" });
        }
      }
      toast({ title: "Reservation updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ number: "", capacity: "4", zone: "Main", status: "free" });
  };

  const zones = Array.from(new Set(tables.map((t) => t.zone || "Main")));

  const filteredTables = tables.filter((t) => {
    if (filterZone !== "all" && (t.zone || "Main") !== filterZone) return false;
    if (filterStatus !== "all" && (t.status || "free") !== filterStatus) return false;
    return true;
  });

  const groupedByZone = filteredTables.reduce<Record<string, TableData[]>>((acc, table) => {
    const zone = table.zone || "Main";
    if (!acc[zone]) acc[zone] = [];
    acc[zone].push(table);
    return acc;
  }, {});

  const filteredReservations = reservations.filter((r) => {
    if (!reservationDateFilter) return true;
    const rDate = new Date(r.dateTime).toISOString().split("T")[0];
    return rDate === reservationDateFilter;
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(calendarWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const getReservationsForDate = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    return reservations.filter((r) => new Date(r.dateTime).toISOString().split("T")[0] === dateStr);
  };

  const handleTableClick = (table: TableData) => {
    setSelectedTable(table);
    setShowDetailDialog(true);
  };

  const handleEditTable = (table: TableData) => {
    setSelectedTable(table);
    setFormData({
      number: String(table.number),
      capacity: String(table.capacity ?? 4),
      zone: table.zone || "Main",
      status: (table.status as TableStatus) || "free",
    });
    setShowEditDialog(true);
  };

  const handleStatusChange = (table: TableData, newStatus: TableStatus) => {
    updateTableMutation.mutate({ id: table.id, status: newStatus });
  };

  const handleAddSubmit = () => {
    createTableMutation.mutate({
      number: parseInt(formData.number),
      capacity: parseInt(formData.capacity),
      zone: formData.zone,
      status: formData.status,
    });
  };

  const handleEditSubmit = () => {
    if (!selectedTable) return;
    updateTableMutation.mutate({
      id: selectedTable.id,
      number: parseInt(formData.number),
      capacity: parseInt(formData.capacity),
      zone: formData.zone,
      status: formData.status,
    });
  };

  const handleAddReservation = () => {
    const customer = customers.find((c) => c.id === resFormData.customerId);
    createReservationMutation.mutate({
      customerName: customer ? customer.name : resFormData.customerName,
      customerPhone: customer ? customer.phone : resFormData.customerPhone || null,
      customerId: resFormData.customerId && resFormData.customerId !== "none" ? resFormData.customerId : null,
      tableId: resFormData.tableId && resFormData.tableId !== "none" ? resFormData.tableId : null,
      guests: parseInt(resFormData.guests) || 2,
      dateTime: new Date(resFormData.dateTime).toISOString(),
      notes: resFormData.notes || null,
      status: "requested",
    });
  };

  const statusCounts = tables.reduce<Record<string, number>>((acc, t) => {
    const s = t.status || "free";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Armchair className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Tables & Floor Plan</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage your restaurant tables and reservations</p>
          </div>
        </div>
        <div className="flex gap-2">
          {activeTab === "reservations" && (
            <Button variant="outline" data-testid="button-add-reservation" onClick={() => {
              setResFormData({ customerName: "", customerPhone: "", tableId: "", guests: "2", dateTime: "", notes: "", customerId: "" });
              setShowAddReservation(true);
            }}>
              <CalendarDays className="w-4 h-4 mr-2" /> New Reservation
            </Button>
          )}
          <Button data-testid="button-add-table" onClick={() => { resetForm(); setShowAddDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Add Table
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button data-testid="button-tab-floor" variant={activeTab === "floor" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("floor")}>
          <MapPin className="w-4 h-4 mr-1" /> Floor Plan
        </Button>
        <Button data-testid="button-tab-reservations" variant={activeTab === "reservations" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("reservations")}>
          <CalendarDays className="w-4 h-4 mr-1" /> Reservations
        </Button>
      </div>

      {activeTab === "floor" && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            {Object.entries(statusConfig).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                <span className={`w-3 h-3 rounded-full ${statusDotColor[key as TableStatus]}`} />
                <span className="text-muted-foreground">{cfg.label} ({statusCounts[key] || 0})</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3 items-center" data-testid="filters-bar">
            <Select value={filterZone} onValueChange={setFilterZone}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-zone">
                <Filter className="w-3 h-3 mr-1" /><SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Zones</SelectItem>
                {zones.map((z) => (<SelectItem key={z} value={z}>{z}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
                <ChevronDown className="w-3 h-3 mr-1" /><SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(statusConfig).map(([key, cfg]) => (<SelectItem key={key} value={key}>{cfg.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {tablesLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (<div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />))}
            </div>
          ) : Object.keys(groupedByZone).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground" data-testid="text-no-tables">No tables found. Add your first table to get started.</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(groupedByZone).map(([zone, zoneTables]) => (
              <motion.div key={zone} className="space-y-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2" data-testid={`text-zone-${zone}`}>
                  <MapPin className="h-4 w-4" /> {zone} ({zoneTables.length} tables)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <AnimatePresence>
                    {zoneTables.sort((a, b) => a.number - b.number).map((table) => {
                      const st = (table.status as TableStatus) || "free";
                      const cfg = statusConfig[st];
                      const StIcon = statusIcon[st];
                      return (
                        <motion.div key={table.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2 }}>
                          <Card data-testid={`card-table-${table.id}`} className={`cursor-pointer border-2 transition-all duration-200 hover:shadow-lg hover:scale-[1.03] ${cfg.bg}`} onClick={() => handleTableClick(table)}>
                            <CardContent className="p-4 text-center space-y-2">
                              <motion.div key={st} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300 }} className="flex justify-center">
                                <StIcon className={`h-6 w-6 ${cfg.color}`} />
                              </motion.div>
                              <div className="text-2xl font-bold" data-testid={`text-table-number-${table.id}`}>T{table.number}</div>
                              <Badge variant="outline" className={`${cfg.color} text-xs`} data-testid={`badge-table-status-${table.id}`}>{cfg.label}</Badge>
                              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                                <Users className="w-3 h-3" />
                                <span data-testid={`text-table-capacity-${table.id}`}>{table.capacity ?? 4}</span>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))
          )}
        </>
      )}

      {activeTab === "reservations" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => {
                const d = new Date(calendarWeekStart);
                d.setDate(d.getDate() - 7);
                setCalendarWeekStart(d);
              }} data-testid="button-prev-week">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium">
                {calendarWeekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} —{" "}
                {new Date(calendarWeekStart.getTime() + 6 * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <Button variant="outline" size="sm" onClick={() => {
                const d = new Date(calendarWeekStart);
                d.setDate(d.getDate() + 7);
                setCalendarWeekStart(d);
              }} data-testid="button-next-week">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Label>Jump to</Label>
              <Input
                type="date"
                value={reservationDateFilter}
                onChange={(e) => {
                  setReservationDateFilter(e.target.value);
                  const d = new Date(e.target.value);
                  d.setDate(d.getDate() - d.getDay());
                  setCalendarWeekStart(d);
                }}
                className="w-[180px]"
                data-testid="input-reservation-date"
              />
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const dayStr = day.toISOString().split("T")[0];
              const isToday = dayStr === new Date().toISOString().split("T")[0];
              const dayReservations = getReservationsForDate(day);
              return (
                <div
                  key={dayStr}
                  className={`border rounded-lg p-2 min-h-[120px] ${isToday ? "border-primary bg-primary/5" : "border-border"}`}
                  data-testid={`calendar-day-${dayStr}`}
                >
                  <div className="text-center mb-2">
                    <p className="text-xs text-muted-foreground">{day.toLocaleDateString(undefined, { weekday: "short" })}</p>
                    <p className={`text-sm font-bold ${isToday ? "text-primary" : ""}`}>{day.getDate()}</p>
                  </div>
                  <div className="space-y-1">
                    {dayReservations.slice(0, 3).map((r) => {
                      const rStatus = (r.status || "requested") as ReservationStatus;
                      const rCfg = reservationStatusConfig[rStatus];
                      return (
                        <button
                          key={r.id}
                          className={`w-full text-left text-xs p-1 rounded ${rCfg.color} truncate cursor-pointer hover:opacity-80`}
                          onClick={() => { setSelectedReservation(r); setShowReservationDetail(true); }}
                          data-testid={`calendar-reservation-${r.id}`}
                        >
                          {new Date(r.dateTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {r.customerName}
                        </button>
                      );
                    })}
                    {dayReservations.length > 3 && (
                      <p className="text-xs text-muted-foreground text-center">+{dayReservations.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="text-sm font-semibold mt-4">
            Reservations for {new Date(reservationDateFilter).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </h3>

          {reservationsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />))}
            </div>
          ) : filteredReservations.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <CalendarDays className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm" data-testid="text-no-reservations">No reservations for this date.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredReservations.map((res) => {
                const table = tables.find((t) => t.id === res.tableId);
                const dt = new Date(res.dateTime);
                const rStatus = (res.status || "requested") as ReservationStatus;
                const rCfg = reservationStatusConfig[rStatus];
                return (
                  <motion.div key={res.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <Card
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => { setSelectedReservation(res); setShowReservationDetail(true); }}
                      data-testid={`card-reservation-${res.id}`}
                    >
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <CalendarDays className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium" data-testid={`text-reservation-name-${res.id}`}>{res.customerName}</p>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {res.guests ?? 2} guests</span>
                              {table && (<span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Table {table.number}</span>)}
                              {res.customerPhone && (<span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {res.customerPhone}</span>)}
                            </div>
                          </div>
                        </div>
                        <Badge className={rCfg.color} data-testid={`badge-reservation-status-${res.id}`}>{rCfg.label}</Badge>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Table {selectedTable?.number} Details</DialogTitle></DialogHeader>
          {selectedTable && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Status</Label>
                  <div className="mt-1">
                    <Badge variant="outline" className={statusConfig[(selectedTable.status as TableStatus) || "free"].color} data-testid="badge-detail-status">
                      {statusConfig[(selectedTable.status as TableStatus) || "free"].label}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Capacity</Label>
                  <p className="mt-1 font-medium" data-testid="text-detail-capacity">{selectedTable.capacity ?? 4} seats</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Zone</Label>
                  <p className="mt-1 font-medium" data-testid="text-detail-zone">{selectedTable.zone || "Main"}</p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Change Status</Label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(statusConfig) as TableStatus[]).map((s) => (
                    <Button key={s} size="sm" variant={selectedTable.status === s ? "default" : "outline"} onClick={() => handleStatusChange(selectedTable, s)} disabled={updateTableMutation.isPending} data-testid={`button-status-${s}`}>
                      <span className={`w-2 h-2 rounded-full mr-1.5 ${statusDotColor[s]}`} /> {statusConfig[s].label}
                    </Button>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowDetailDialog(false); handleEditTable(selectedTable); }} data-testid="button-edit-from-detail">
                  <Edit2 className="w-4 h-4 mr-1" /> Edit Table
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Table</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Table Number</Label>
              <Input type="number" value={formData.number} onChange={(e) => setFormData({ ...formData, number: e.target.value })} data-testid="input-add-number" />
            </div>
            <div>
              <Label>Capacity</Label>
              <Input type="number" value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} data-testid="input-add-capacity" />
            </div>
            <div>
              <Label>Zone</Label>
              <Input value={formData.zone} onChange={(e) => setFormData({ ...formData, zone: e.target.value })} data-testid="input-add-zone" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as TableStatus })}>
                <SelectTrigger data-testid="select-add-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(statusConfig).map(([key, cfg]) => (<SelectItem key={key} value={key}>{cfg.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} data-testid="button-cancel-add">Cancel</Button>
            <Button onClick={handleAddSubmit} disabled={!formData.number || createTableMutation.isPending} data-testid="button-submit-add">
              {createTableMutation.isPending ? "Adding..." : "Add Table"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Table {selectedTable?.number}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Table Number</Label>
              <Input type="number" value={formData.number} onChange={(e) => setFormData({ ...formData, number: e.target.value })} data-testid="input-edit-number" />
            </div>
            <div>
              <Label>Capacity</Label>
              <Input type="number" value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} data-testid="input-edit-capacity" />
            </div>
            <div>
              <Label>Zone</Label>
              <Input value={formData.zone} onChange={(e) => setFormData({ ...formData, zone: e.target.value })} data-testid="input-edit-zone" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as TableStatus })}>
                <SelectTrigger data-testid="select-edit-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(statusConfig).map(([key, cfg]) => (<SelectItem key={key} value={key}>{cfg.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            <Button variant="destructive" onClick={() => selectedTable && deleteTableMutation.mutate(selectedTable.id)} disabled={deleteTableMutation.isPending} data-testid="button-delete-table">
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
              <Button onClick={handleEditSubmit} disabled={updateTableMutation.isPending} data-testid="button-submit-edit">Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddReservation} onOpenChange={setShowAddReservation}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Reservation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Link to Customer (optional)</Label>
              <Select value={resFormData.customerId} onValueChange={(v) => {
                const c = customers.find((c) => c.id === v);
                setResFormData({
                  ...resFormData,
                  customerId: v,
                  customerName: c?.name || resFormData.customerName,
                  customerPhone: c?.phone || resFormData.customerPhone,
                });
              }}>
                <SelectTrigger data-testid="select-res-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Walk-in (no link)</SelectItem>
                  {customers.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Customer Name *</Label>
                <Input value={resFormData.customerName} onChange={(e) => setResFormData({ ...resFormData, customerName: e.target.value })} data-testid="input-res-name" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={resFormData.customerPhone} onChange={(e) => setResFormData({ ...resFormData, customerPhone: e.target.value })} data-testid="input-res-phone" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Table</Label>
                <Select value={resFormData.tableId} onValueChange={(v) => setResFormData({ ...resFormData, tableId: v })}>
                  <SelectTrigger data-testid="select-res-table"><SelectValue placeholder="Select table" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No table yet</SelectItem>
                    {tables.filter((t) => t.status === "free" || t.status === "reserved").map((t) => (
                      <SelectItem key={t.id} value={t.id}>Table {t.number} ({t.capacity} seats, {t.zone})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Guests</Label>
                <Input type="number" value={resFormData.guests} onChange={(e) => setResFormData({ ...resFormData, guests: e.target.value })} data-testid="input-res-guests" />
              </div>
            </div>
            <div>
              <Label>Date & Time *</Label>
              <Input type="datetime-local" value={resFormData.dateTime} onChange={(e) => setResFormData({ ...resFormData, dateTime: e.target.value })} data-testid="input-res-datetime" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={resFormData.notes} onChange={(e) => setResFormData({ ...resFormData, notes: e.target.value })} data-testid="input-res-notes" />
            </div>
            <Button className="w-full" onClick={handleAddReservation} disabled={!resFormData.customerName || !resFormData.dateTime || createReservationMutation.isPending} data-testid="button-submit-reservation">
              Create Reservation
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showReservationDetail} onOpenChange={setShowReservationDetail}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reservation Details</DialogTitle></DialogHeader>
          {selectedReservation && (() => {
            const rStatus = (selectedReservation.status || "requested") as ReservationStatus;
            const rCfg = reservationStatusConfig[rStatus];
            const table = tables.find((t) => t.id === selectedReservation.tableId);
            const dt = new Date(selectedReservation.dateTime);
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Badge className={`${rCfg.color} text-sm`}>{rCfg.label}</Badge>
                  {selectedReservation.customerId && (
                    <Badge variant="outline" className="text-xs">
                      <UserCheck className="w-3 h-3 mr-1" /> Linked Customer
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p className="font-medium">{selectedReservation.customerName}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedReservation.customerPhone || "—"}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Date & Time</p>
                    <p className="font-medium">{dt.toLocaleDateString()} {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Guests</p>
                    <p className="font-medium">{selectedReservation.guests ?? 2}</p>
                  </div>
                </div>
                {table && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Table</p>
                    <p className="font-medium">Table {table.number} — {table.zone} ({table.capacity} seats)</p>
                  </div>
                )}
                {selectedReservation.notes && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm">{selectedReservation.notes}</p>
                  </div>
                )}

                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Update Status</Label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(reservationStatusConfig) as ReservationStatus[]).map((s) => {
                      const sCfg = reservationStatusConfig[s];
                      return (
                        <Button
                          key={s}
                          size="sm"
                          variant={rStatus === s ? "default" : "outline"}
                          onClick={() => {
                            updateReservationMutation.mutate({ id: selectedReservation.id, data: { status: s } });
                            setSelectedReservation({ ...selectedReservation, status: s });
                          }}
                          disabled={updateReservationMutation.isPending}
                          data-testid={`button-res-status-${s}`}
                        >
                          {sCfg.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
