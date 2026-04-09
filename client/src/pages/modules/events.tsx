import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { PageTitle } from "@/lib/accessibility";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { Event as CalEvent, Offer, Outlet } from "@shared/schema";
import { motion } from "framer-motion";
import {
  Calendar as CalendarIcon, Plus, Search, ChevronLeft, ChevronRight,
  Edit, Trash2, List, LayoutGrid, Clock, Copy,
  PartyPopper, Trophy, Building2, Megaphone, Sun, Filter,
  Sparkles, AlertTriangle, Bell,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "react-i18next";

type ViewType = "month" | "week" | "day" | "list";

const typeConfig: Record<string, { label: string; icon: LucideIcon; color: string; emoji: string }> = {
  holiday: { label: "Holiday", icon: Sun, color: "#f97316", emoji: "🌞" },
  festival: { label: "Festival", icon: PartyPopper, color: "#f59e0b", emoji: "🎉" },
  sports: { label: "Sports Event", icon: Trophy, color: "#22c55e", emoji: "🏆" },
  corporate: { label: "Corporate", icon: Building2, color: "#3b82f6", emoji: "🏢" },
  promotion: { label: "Promotion", icon: Megaphone, color: "#8b5cf6", emoji: "📣" },
};

const impactConfig: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "Low", color: "text-gray-600", bg: "bg-gray-100" },
  medium: { label: "Medium", color: "text-yellow-700", bg: "bg-yellow-100" },
  high: { label: "High", color: "text-orange-700", bg: "bg-orange-100" },
  very_high: { label: "Very High", color: "text-red-700", bg: "bg-red-100" },
};

const colorPresets = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

interface EventFormData {
  title: string;
  description: string;
  type: string;
  impact: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  color: string;
  outlets: string[];
  tags: string;
  linkedOfferId: string;
  notes: string;
}

interface EventPayload {
  title: string;
  description: string | null;
  type: string;
  impact: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  color: string;
  outlets: string[] | null;
  tags: string[] | null;
  linkedOfferId: string | null;
  notes: string | null;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function isInRange(date: Date, start: Date, end: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return d >= s && d <= e;
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(d: Date | string) {
  return new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function daysUntil(d: Date | string) {
  const now = new Date();
  const target = new Date(d);
  const diff = Math.ceil((target.getTime() - now.getTime()) / 86400000);
  return diff;
}

function EventTooltipContent({ ev, outletNames }: { ev: CalEvent; outletNames?: Map<string, string> }) {
  const tc = typeConfig[ev.type] || typeConfig.holiday;
  const ic = impactConfig[ev.impact] || impactConfig.medium;
  return (
    <div className="max-w-[220px] space-y-1">
      <div className="font-semibold">{ev.title}</div>
      <div className="text-xs opacity-80">{tc.emoji} {tc.label} · {ic.label} Impact</div>
      <div className="text-xs opacity-80">
        {ev.allDay ? "All Day" : `${formatTime(ev.startDate)} – ${formatTime(ev.endDate)}`}
      </div>
      <div className="text-xs opacity-80">{formatDate(ev.startDate)} – {formatDate(ev.endDate)}</div>
      {ev.outlets && ev.outlets.length > 0 && (
        <div className="text-xs opacity-80">Outlets: {ev.outlets.map((oid) => outletNames?.get(oid) || oid.slice(0, 8)).join(", ")}</div>
      )}
    </div>
  );
}

function EventBar({ ev, onEventClick, outletNames }: { ev: CalEvent; onEventClick: (e: CalEvent) => void; outletNames?: Map<string, string> }) {
  const tc = typeConfig[ev.type] || typeConfig.holiday;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="text-[10px] leading-tight px-1.5 py-0.5 rounded truncate cursor-pointer font-medium"
          style={{ backgroundColor: (ev.color || "#3b82f6") + "20", color: ev.color || "#3b82f6", borderLeft: `3px solid ${ev.color || "#3b82f6"}` }}
          onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
          data-testid={`event-bar-${ev.id}`}
        >
          {tc.emoji} {ev.title}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">
        <EventTooltipContent ev={ev} outletNames={outletNames} />
      </TooltipContent>
    </Tooltip>
  );
}

function CalendarMonthView({ events, currentDate, onDayClick, onEventClick, outletNames }: {
  events: CalEvent[];
  currentDate: Date;
  onDayClick: (date: Date) => void;
  onEventClick: (e: CalEvent) => void;
  outletNames?: Map<string, string>;
}) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  while (weeks.length > 0 && weeks[weeks.length - 1].length < 7) {
    weeks[weeks.length - 1].push(null);
  }

  return (
    <div className="border rounded-lg overflow-hidden" data-testid="calendar-month-view">
      <div className="grid grid-cols-7 bg-muted/50">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2 border-b">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 min-h-[100px]">
          {week.map((day, di) => {
            if (!day) return <div key={di} className="border-b border-r bg-muted/20" />;
            const cellDate = new Date(year, month, day);
            const isToday = isSameDay(cellDate, today);
            const dayEvents = events.filter((ev) =>
              isInRange(cellDate, new Date(ev.startDate), new Date(ev.endDate))
            );
            return (
              <div
                key={di}
                className={`border-b border-r p-1 cursor-pointer hover:bg-accent/30 transition-colors ${isToday ? "bg-primary/5" : ""}`}
                onClick={() => onDayClick(cellDate)}
                data-testid={`calendar-day-${day}`}
              >
                <div className={`text-xs font-medium mb-1 ${isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : "text-muted-foreground"}`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <EventBar key={ev.id} ev={ev} onEventClick={onEventClick} outletNames={outletNames} />
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CalendarWeekView({ events, currentDate, onEventClick, outletNames }: {
  events: CalEvent[];
  currentDate: Date;
  onEventClick: (e: CalEvent) => void;
  outletNames?: Map<string, string>;
}) {
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = new Date();

  return (
    <div className="border rounded-lg overflow-hidden" data-testid="calendar-week-view">
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          const dayEvents = events.filter((ev) =>
            isInRange(d, new Date(ev.startDate), new Date(ev.endDate))
          );
          return (
            <div key={i} className={`border-r min-h-[200px] ${isToday ? "bg-primary/5" : ""}`}>
              <div className={`text-center py-2 border-b ${isToday ? "bg-primary/10" : "bg-muted/50"}`}>
                <div className="text-xs text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>{d.getDate()}</div>
              </div>
              <div className="p-1 space-y-1">
                {dayEvents.map((ev) => (
                  <Tooltip key={ev.id}>
                    <TooltipTrigger asChild>
                      <div
                        className="text-xs p-1.5 rounded cursor-pointer hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: (ev.color || "#3b82f6") + "15", color: ev.color || "#3b82f6", borderLeft: `3px solid ${ev.color || "#3b82f6"}` }}
                        onClick={() => onEventClick(ev)}
                        data-testid={`week-event-${ev.id}`}
                      >
                        <div className="font-medium truncate">{ev.title}</div>
                        {!ev.allDay && <div className="text-[10px] opacity-70">{formatTime(ev.startDate)}</div>}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent><EventTooltipContent ev={ev} outletNames={outletNames} /></TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({ events, currentDate, onEventClick, onAddEvent, outletNames }: {
  events: CalEvent[];
  currentDate: Date;
  onEventClick: (e: CalEvent) => void;
  onAddEvent?: (date: Date) => void;
  outletNames?: Map<string, string>;
}) {
  const dayEvents = events.filter((ev) =>
    isInRange(currentDate, new Date(ev.startDate), new Date(ev.endDate))
  );

  return (
    <div className="border rounded-lg p-4" data-testid="calendar-day-view">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{currentDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h3>
        {/* Main header "New Event" button handles creation; removed duplicate here */}
      </div>
      {dayEvents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-events-day">
          <CalendarIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No events on this day</p>
          {onAddEvent && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => onAddEvent(currentDate)} data-testid="button-add-event-empty-day">
              <Plus className="h-4 w-4 mr-1" />Add Event for This Day
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {dayEvents.map((ev) => {
            const tc = typeConfig[ev.type] || typeConfig.holiday;
            const ic = impactConfig[ev.impact] || impactConfig.medium;
            const Icon = tc.icon;
            return (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow"
                style={{ borderLeftWidth: 4, borderLeftColor: ev.color || "#3b82f6" }}
                onClick={() => onEventClick(ev)}
                data-testid={`day-event-${ev.id}`}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: (ev.color || "#3b82f6") + "20" }}>
                  <Icon className="h-4 w-4" style={{ color: ev.color || "#3b82f6" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{ev.title}</div>
                  {ev.description && <p className="text-xs text-muted-foreground mt-0.5">{ev.description}</p>}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge variant="outline" className="text-xs">{tc.label}</Badge>
                    <Badge className={`text-xs ${ic.bg} ${ic.color}`}>{ic.label} Impact</Badge>
                    {!ev.allDay && <span className="text-xs text-muted-foreground">{formatTime(ev.startDate)} – {formatTime(ev.endDate)}</span>}
                    {ev.allDay && <span className="text-xs text-muted-foreground">All Day</span>}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NotificationBanners({ events }: { events: CalEvent[] }) {
  const now = new Date();

  const categorized = useMemo(() => {
    const today: CalEvent[] = [];
    const in1Day: CalEvent[] = [];
    const in3Days: CalEvent[] = [];
    const in7Days: CalEvent[] = [];

    events.forEach((ev) => {
      if (ev.impact !== "high" && ev.impact !== "very_high") return;
      const d = daysUntil(ev.startDate);
      if (isInRange(now, new Date(ev.startDate), new Date(ev.endDate))) {
        today.push(ev);
      } else if (d === 1) {
        in1Day.push(ev);
      } else if (d > 0 && d <= 3) {
        in3Days.push(ev);
      } else if (d > 3 && d <= 7) {
        in7Days.push(ev);
      }
    });
    return { today, in1Day, in3Days, in7Days };
  }, [events]);

  const banners: { label: string; events: CalEvent[]; variant: string; icon: LucideIcon }[] = [];
  if (categorized.today.length > 0) banners.push({ label: "Happening Now", events: categorized.today, variant: "border-red-500 bg-red-50", icon: AlertTriangle });
  if (categorized.in1Day.length > 0) banners.push({ label: "Tomorrow", events: categorized.in1Day, variant: "border-orange-500 bg-orange-50", icon: Bell });
  if (categorized.in3Days.length > 0) banners.push({ label: "In 3 Days", events: categorized.in3Days, variant: "border-yellow-500 bg-yellow-50", icon: Bell });
  if (categorized.in7Days.length > 0) banners.push({ label: "This Week", events: categorized.in7Days, variant: "border-blue-500 bg-blue-50", icon: CalendarIcon });

  if (banners.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="notification-banners">
      {banners.map((b) => {
        const BIcon = b.icon;
        return (
          <Card key={b.label} className={`border-l-4 ${b.variant}`}>
            <CardContent className="py-2.5 px-4">
              <div className="flex items-center gap-2 flex-wrap">
                <BIcon className="h-4 w-4 shrink-0" />
                <span className="text-sm font-semibold">{b.label}:</span>
                {b.events.map((ev) => (
                  <Badge key={ev.id} variant="outline" className="text-xs" data-testid={`notification-event-${ev.id}`}>
                    {ev.title} ({impactConfig[ev.impact]?.label || ev.impact})
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function EventsPage() {
  const { t } = useTranslation("modules");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = useState<ViewType>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterImpact, setFilterImpact] = useState("all");
  const [filterOutlet, setFilterOutlet] = useState("all");
  type SortField = "title" | "startDate" | "endDate" | "type" | "impact";
  type SortDir = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("startDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const canEdit = ["owner", "franchise_owner", "manager", "outlet_manager", "hq_admin"].includes(user?.role || "");

  const defaultForm: EventFormData = {
    title: "", description: "", type: "holiday", impact: "medium",
    startDate: "", endDate: "", allDay: true, color: "#3b82f6",
    outlets: [], tags: "", linkedOfferId: "none", notes: "",
  };
  const [form, setForm] = useState<EventFormData>(defaultForm);
  const [deleteConfirm, setDeleteConfirm] = useState<CalEvent | null>(null);

  const { data: allEvents = [] } = useQuery<CalEvent[]>({ queryKey: ["/api/events"] });
  const { data: offers = [] } = useQuery<Offer[]>({ queryKey: ["/api/offers"] });
  const { data: outlets = [] } = useQuery<Outlet[]>({ queryKey: ["/api/outlets"] });
  const { data: staffUsers = [] } = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/users"] });

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    staffUsers.forEach((u) => m.set(u.id, u.name));
    return m;
  }, [staffUsers]);

  const outletMap = useMemo(() => {
    const m = new Map<string, string>();
    outlets.forEach((o) => m.set(o.id, o.name));
    return m;
  }, [outlets]);

  const filtered = useMemo(() => {
    let result = allEvents;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.title.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q));
    }
    if (filterType !== "all") result = result.filter((e) => e.type === filterType);
    if (filterImpact !== "all") result = result.filter((e) => e.impact === filterImpact);
    if (filterOutlet !== "all") result = result.filter((e) => !e.outlets || e.outlets.length === 0 || e.outlets.includes(filterOutlet));
    return result;
  }, [allEvents, search, filterType, filterImpact, filterOutlet]);

  const sortedFiltered = useMemo(() => {
    const impactOrder: Record<string, number> = { low: 0, medium: 1, high: 2, very_high: 3 };
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") cmp = a.title.localeCompare(b.title);
      else if (sortField === "startDate") cmp = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      else if (sortField === "endDate") cmp = new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
      else if (sortField === "type") cmp = a.type.localeCompare(b.type);
      else if (sortField === "impact") cmp = (impactOrder[a.impact] ?? 0) - (impactOrder[b.impact] ?? 0);
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [filtered, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return allEvents
      .filter((e) => new Date(e.endDate) >= now)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 5);
  }, [allEvents]);

  const todayEvents = useMemo(() => {
    const today = new Date();
    return allEvents.filter((e) => isInRange(today, new Date(e.startDate), new Date(e.endDate)));
  }, [allEvents]);

  const createMutation = useMutation({
    mutationFn: async (data: EventPayload) => { const res = await apiRequest("POST", "/api/events", data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/events"] }); setDialogOpen(false); toast({ title: "Event created" }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EventPayload }) => { const res = await apiRequest("PATCH", `/api/events/${id}`, data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/events"] }); setDialogOpen(false); setEditingEvent(null); toast({ title: "Event updated" }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/events/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/events"] }); toast({ title: "Event deleted" }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  function openCreate(date?: Date) {
    setEditingEvent(null);
    const d = date || new Date();
    const startStr = d.toISOString().slice(0, 16);
    const endD = new Date(d);
    endD.setHours(23, 59, 0, 0);
    setForm({ ...defaultForm, startDate: startStr, endDate: endD.toISOString().slice(0, 16) });
    setDialogOpen(true);
  }

  function openEdit(ev: CalEvent) {
    setEditingEvent(ev);
    setForm({
      title: ev.title,
      description: ev.description || "",
      type: ev.type,
      impact: ev.impact,
      startDate: new Date(ev.startDate).toISOString().slice(0, 16),
      endDate: new Date(ev.endDate).toISOString().slice(0, 16),
      allDay: ev.allDay ?? true,
      color: ev.color || "#3b82f6",
      outlets: ev.outlets || [],
      tags: (ev.tags || []).join(", "),
      linkedOfferId: ev.linkedOfferId || "none",
      notes: ev.notes || "",
    });
    setDialogOpen(true);
  }

  function duplicateEvent(ev: CalEvent) {
    setEditingEvent(null);
    setForm({
      title: `${ev.title} (Copy)`,
      description: ev.description || "",
      type: ev.type,
      impact: ev.impact,
      startDate: new Date(ev.startDate).toISOString().slice(0, 16),
      endDate: new Date(ev.endDate).toISOString().slice(0, 16),
      allDay: ev.allDay ?? true,
      color: ev.color || "#3b82f6",
      outlets: ev.outlets || [],
      tags: (ev.tags || []).join(", "),
      linkedOfferId: ev.linkedOfferId || "none",
      notes: ev.notes || "",
    });
    setDialogOpen(true);
  }

  function buildPayload(): EventPayload {
    return {
      title: form.title,
      description: form.description || null,
      type: form.type,
      impact: form.impact,
      startDate: form.startDate,
      endDate: form.endDate,
      allDay: form.allDay,
      color: form.color,
      outlets: form.outlets.length > 0 ? form.outlets : null,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : null,
      linkedOfferId: form.linkedOfferId === "none" ? null : form.linkedOfferId,
      notes: form.notes || null,
    };
  }

  function handleSave() {
    if (!form.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    if (!form.startDate || !form.endDate) { toast({ title: "Dates are required", variant: "destructive" }); return; }
    const body = buildPayload();
    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data: body });
    } else {
      createMutation.mutate(body);
    }
  }

  function navigateMonth(dir: number) {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  }

  function navigateWeek(dir: number) {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir * 7);
    setCurrentDate(d);
  }

  function navigateDay(dir: number) {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  }

  function toggleOutlet(outletId: string) {
    setForm((prev) => ({
      ...prev,
      outlets: prev.outlets.includes(outletId) ? prev.outlets.filter((o) => o !== outletId) : [...prev.outlets, outletId],
    }));
  }

  const statsThisMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59);
    return allEvents.filter((e) => {
      const eStart = new Date(e.startDate);
      const eEnd = new Date(e.endDate);
      return eStart <= end && eEnd >= start;
    });
  }, [allEvents, currentDate]);

  const highImpactCount = statsThisMonth.filter((e) => e.impact === "high" || e.impact === "very_high").length;

  return (
    <div className="p-6 space-y-6" data-testid="events-page">
      <PageTitle title={t("events")} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarIcon className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Events & Special Days</h1>
            <p className="text-sm text-muted-foreground">Manage holidays, festivals, sports events, and promotions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button onClick={() => openCreate()} data-testid="button-create-event">
              <Plus className="h-4 w-4 mr-2" />New Event
            </Button>
          )}
        </div>
      </div>

      <NotificationBanners events={allEvents} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Events</p><p className="text-2xl font-bold" data-testid="stat-total-events">{allEvents.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">This Month</p><p className="text-2xl font-bold" data-testid="stat-month-events">{statsThisMonth.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">High Impact</p><p className="text-2xl font-bold text-orange-600" data-testid="stat-high-impact">{highImpactCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Today's Events</p><p className="text-2xl font-bold text-primary" data-testid="stat-today-events">{todayEvents.length}</p></CardContent></Card>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewType)}>
            <TabsList>
              <TabsTrigger value="month" data-testid="tab-month"><LayoutGrid className="h-4 w-4 mr-1" />Month</TabsTrigger>
              <TabsTrigger value="week" data-testid="tab-week"><CalendarIcon className="h-4 w-4 mr-1" />Week</TabsTrigger>
              <TabsTrigger value="day" data-testid="tab-day"><Clock className="h-4 w-4 mr-1" />Day</TabsTrigger>
              <TabsTrigger value="list" data-testid="tab-list"><List className="h-4 w-4 mr-1" />List</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} data-testid="button-today">Today</Button>
          <Button variant="outline" size="icon" onClick={() => view === "month" ? navigateMonth(-1) : view === "week" ? navigateWeek(-1) : navigateDay(-1)} data-testid="button-prev" aria-label="Previous period">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="text-sm font-medium min-w-[180px] text-center" data-testid="text-current-period">
            {view === "month" && currentDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            {view === "week" && (() => {
              const s = new Date(currentDate);
              s.setDate(s.getDate() - s.getDay());
              const e = new Date(s);
              e.setDate(e.getDate() + 6);
              return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
            })()}
            {view === "day" && currentDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            {view === "list" && "All Events"}
          </span>
          <Button variant="outline" size="icon" onClick={() => view === "month" ? navigateMonth(1) : view === "week" ? navigateWeek(1) : navigateDay(1)} data-testid="button-next" aria-label="Next period">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search events..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" data-testid="input-search-events" />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[130px] h-9" data-testid="select-filter-type"><Filter className="h-3.5 w-3.5 mr-1.5" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(typeConfig).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterImpact} onValueChange={setFilterImpact}>
            <SelectTrigger className="w-[130px] h-9" data-testid="select-filter-impact"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Impact</SelectItem>
              {Object.entries(impactConfig).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {outlets.length > 0 && (
            <Select value={filterOutlet} onValueChange={setFilterOutlet}>
              <SelectTrigger className="w-[140px] h-9" data-testid="select-filter-outlet"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outlets</SelectItem>
                {outlets.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="flex gap-3 flex-wrap" data-testid="legend">
        {Object.entries(typeConfig).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5 text-xs">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: v.color }} />
            <span className="text-muted-foreground">{v.emoji} {v.label}</span>
          </div>
        ))}
      </div>

      {view === "month" && (
        <CalendarMonthView
          events={filtered}
          currentDate={currentDate}
          onDayClick={(d) => { setCurrentDate(d); setView("day"); }}
          onEventClick={(ev) => { if (canEdit) openEdit(ev); }}
          outletNames={outletMap}
        />
      )}
      {view === "week" && (
        <CalendarWeekView
          events={filtered}
          currentDate={currentDate}
          onEventClick={(ev) => { if (canEdit) openEdit(ev); }}
          outletNames={outletMap}
        />
      )}
      {view === "day" && (
        <DayView
          events={filtered}
          currentDate={currentDate}
          onEventClick={(ev) => { if (canEdit) openEdit(ev); }}
          onAddEvent={canEdit ? (d) => openCreate(d) : undefined}
          outletNames={outletMap}
        />
      )}

      {view === "list" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><List className="h-4 w-4" />All Events ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-events">No events found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("title")} data-testid="sort-title">Event {sortField === "title" ? (sortDir === "asc" ? "↑" : "↓") : ""}</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("type")} data-testid="sort-type">Type {sortField === "type" ? (sortDir === "asc" ? "↑" : "↓") : ""}</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("impact")} data-testid="sort-impact">Impact {sortField === "impact" ? (sortDir === "asc" ? "↑" : "↓") : ""}</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("startDate")} data-testid="sort-start">Start {sortField === "startDate" ? (sortDir === "asc" ? "↑" : "↓") : ""}</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("endDate")} data-testid="sort-end">End {sortField === "endDate" ? (sortDir === "asc" ? "↑" : "↓") : ""}</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Outlets</TableHead>
                    <TableHead>Created By</TableHead>
                    {canEdit && <TableHead className="text-right">{t("actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedFiltered.map((ev) => {
                    const tc = typeConfig[ev.type] || typeConfig.holiday;
                    const ic = impactConfig[ev.impact] || impactConfig.medium;
                    return (
                      <TableRow key={ev.id} data-testid={`event-row-${ev.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ev.color || "#3b82f6" }} />
                            <div>
                              <div className="font-medium">{ev.title}</div>
                              {ev.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{ev.description}</div>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{tc.emoji} {tc.label}</Badge></TableCell>
                        <TableCell><Badge className={`text-xs ${ic.bg} ${ic.color}`}>{ic.label}</Badge></TableCell>
                        <TableCell className="text-sm">{formatDate(ev.startDate)}</TableCell>
                        <TableCell className="text-sm">{formatDate(ev.endDate)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{ev.allDay ? "All Day" : `${formatTime(ev.startDate)} – ${formatTime(ev.endDate)}`}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {ev.outlets && ev.outlets.length > 0 ? ev.outlets.map((oid) => (
                              <Badge key={oid} variant="secondary" className="text-xs">{outletMap.get(oid) || oid.slice(0, 8)}</Badge>
                            )) : <span className="text-xs text-muted-foreground">All</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{ev.createdBy ? userMap.get(ev.createdBy) || "—" : "—"}</TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => duplicateEvent(ev)} data-testid={`button-duplicate-event-${ev.id}`}><Copy className="h-4 w-4" /></Button>
                              </TooltipTrigger><TooltipContent>Duplicate</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => openEdit(ev)} data-testid={`button-edit-event-${ev.id}`}><Edit className="h-4 w-4" /></Button>
                              </TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(ev)} data-testid={`button-delete-event-${ev.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {upcomingEvents.length > 0 && view !== "list" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" />Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingEvents.map((ev) => {
                const tc = typeConfig[ev.type] || typeConfig.holiday;
                const Icon = tc.icon;
                return (
                  <div key={ev.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer" onClick={() => { if (canEdit) openEdit(ev); }} data-testid={`upcoming-event-${ev.id}`}>
                    <div className="w-2 h-8 rounded-full" style={{ backgroundColor: ev.color || "#3b82f6" }} />
                    <Icon className="h-4 w-4" style={{ color: ev.color || "#3b82f6" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{ev.title}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(ev.startDate)} – {formatDate(ev.endDate)}</div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{tc.label}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-event">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Edit Event" : "Create Event"}</DialogTitle>
            <DialogDescription>{editingEvent ? "Update event details" : "Add a new event or special day"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Diwali Festival" data-testid="input-event-title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Event details..." data-testid="input-event-description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v, color: typeConfig[v]?.color || form.color })}>
                  <SelectTrigger data-testid="select-event-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Impact Level</Label>
                <Select value={form.impact} onValueChange={(v) => setForm({ ...form, impact: v })}>
                  <SelectTrigger data-testid="select-event-impact"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(impactConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.impact === "very_high" && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-red-600 bg-red-50 px-2 py-1 rounded" data-testid="text-very-high-warning">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Very high impact events require extra staffing and inventory preparation
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("startDate")}</Label>
                <Input type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} data-testid="input-event-start" />
              </div>
              <div>
                <Label>{t("endDate")}</Label>
                <Input type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} data-testid="input-event-end" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>All Day Event</Label>
              <Switch checked={form.allDay} onCheckedChange={(v) => setForm({ ...form, allDay: v })} data-testid="switch-all-day" />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex items-center gap-2 mt-1">
                {colorPresets.map((c) => (
                  <button
                    key={c}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setForm({ ...form, color: c })}
                    data-testid={`color-${c.replace("#", "")}`}
                  />
                ))}
                <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-9 h-7 p-0 border-0 cursor-pointer" data-testid="input-event-color" />
              </div>
            </div>
            {outlets.length > 0 && (
              <div>
                <Label>Outlets</Label>
                <div className="mt-1.5 space-y-1.5 max-h-[120px] overflow-y-auto border rounded-md p-2" data-testid="outlet-selector">
                  {outlets.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox checked={form.outlets.includes(o.id)} onCheckedChange={() => toggleOutlet(o.id)} data-testid={`checkbox-outlet-${o.id}`} />
                      {o.name}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Leave empty for all outlets</p>
              </div>
            )}
            <div>
              <Label>Tags (comma-separated)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="e.g. busy, extra-staff, special-menu" data-testid="input-event-tags" />
            </div>
            <div>
              <Label>Linked Offer</Label>
              <Select value={form.linkedOfferId} onValueChange={(v) => setForm({ ...form, linkedOfferId: v })}>
                <SelectTrigger data-testid="select-linked-offer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked offer</SelectItem>
                  {offers.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Internal notes..." data-testid="input-event-notes" />
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            {editingEvent && canEdit ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { setDialogOpen(false); setDeleteConfirm(editingEvent); }}
                data-testid="button-delete-event-dialog"
              >
                <Trash2 className="h-4 w-4 mr-1" />Delete
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-event">
                {editingEvent ? "Update" : "Create"} Event
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteConfirm) { deleteMutation.mutate(deleteConfirm.id); setDeleteConfirm(null); } }}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
