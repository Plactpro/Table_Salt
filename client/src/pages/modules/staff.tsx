import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  Plus, UserCog, Search, Edit, ChevronLeft, ChevronRight,
  Crown, ShieldCheck, ConciergeBell, ChefHat, Calculator, Users,
  Calendar, Clock, CheckCircle, XCircle, AlertCircle, Trash2,
  LayoutGrid, CalendarDays, ClipboardCheck, LogIn, LogOut, Timer,
} from "lucide-react";

const ROLES = ["owner", "manager", "waiter", "kitchen", "accountant"] as const;

const roleBadgeColors: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  manager: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  waiter: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  kitchen: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  accountant: "bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-200",
  customer: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const roleIcons: Record<string, React.ElementType> = {
  owner: Crown,
  manager: ShieldCheck,
  waiter: ConciergeBell,
  kitchen: ChefHat,
  accountant: Calculator,
  customer: Users,
};

interface StaffMember {
  id: string;
  name: string;
  username: string;
  role: string;
  email: string | null;
  phone: string | null;
  active: boolean | null;
}

interface ScheduleEntry {
  id: string;
  tenantId: string;
  userId: string;
  outletId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  role: string | null;
  attendance: string | null;
}

interface Outlet {
  id: string;
  name: string;
}

const attendanceConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  scheduled: { label: "Scheduled", color: "bg-gray-100 text-gray-700", icon: Clock },
  present: { label: "Present", color: "bg-green-100 text-green-700", icon: CheckCircle },
  absent: { label: "Absent", color: "bg-red-100 text-red-700", icon: XCircle },
  late: { label: "Late", color: "bg-amber-100 text-amber-700", icon: AlertCircle },
};

export default function StaffPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffMember | null>(null);
  const [activeTab, setActiveTab] = useState<"roster" | "schedule" | "attendance">("roster");
  const [scheduleView, setScheduleView] = useState<"weekly" | "monthly">("weekly");
  const [showAddShift, setShowAddShift] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [monthDate, setMonthDate] = useState(() => new Date());

  const [shiftForm, setShiftForm] = useState({
    userId: "", date: "", startTime: "09:00", endTime: "17:00", role: "", outletId: "",
  });

  const { data: staffList = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: ["/api/users"],
  });

  const { data: schedules = [] } = useQuery<ScheduleEntry[]>({
    queryKey: ["/api/staff-schedules"],
  });

  const { data: outlets = [] } = useQuery<Outlet[]>({
    queryKey: ["/api/outlets"],
  });

  const [attendanceDateFrom, setAttendanceDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0];
  });
  const [attendanceDateTo, setAttendanceDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: attendanceLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/attendance", attendanceDateFrom, attendanceDateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (attendanceDateFrom) params.set("from", attendanceDateFrom);
      if (attendanceDateTo) { const to = new Date(attendanceDateTo); to.setDate(to.getDate() + 1); params.set("to", to.toISOString().split("T")[0]); }
      const res = await fetch(`/api/attendance?${params}`, { credentials: "include" });
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: activeTab === "attendance",
  });

  const { data: attendanceSummary = [] } = useQuery<any[]>({
    queryKey: ["/api/attendance/summary", attendanceDateFrom, attendanceDateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (attendanceDateFrom) params.set("from", attendanceDateFrom);
      if (attendanceDateTo) { const to = new Date(attendanceDateTo); to.setDate(to.getDate() + 1); params.set("to", to.toISOString().split("T")[0]); }
      const res = await fetch(`/api/attendance/summary?${params}`, { credentials: "include" });
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: activeTab === "attendance",
  });

  const { data: attendanceSettings } = useQuery<{ lateThresholdMinutes: number }>({
    queryKey: ["/api/attendance/settings"],
    enabled: activeTab === "attendance",
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Staff member added" });
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Staff member updated" });
      setDialogOpen(false);
      setEditingUser(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const createShiftMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/staff-schedules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-schedules"] });
      toast({ title: "Shift added" });
      setShowAddShift(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateShiftMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/staff-schedules/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-schedules"] });
      toast({ title: "Shift updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/staff-schedules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-schedules"] });
      toast({ title: "Shift deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filteredStaff = staffList.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.username.toLowerCase().includes(search.toLowerCase()) ||
    s.role.toLowerCase().includes(search.toLowerCase())
  );

  const activeStaff = staffList.filter((s) => s.active !== false);
  const outletMap = new Map(outlets.map((o) => [o.id, o.name]));

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const monthDays = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }, [monthDate]);

  const getShiftsForDayAndUser = (date: Date, userId: string) => {
    const dateStr = date.toISOString().split("T")[0];
    return schedules.filter((s) => {
      const sDate = new Date(s.date).toISOString().split("T")[0];
      return sDate === dateStr && s.userId === userId;
    });
  };

  const getShiftsForDay = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    return schedules.filter((s) => {
      const sDate = new Date(s.date).toISOString().split("T")[0];
      return sDate === dateStr;
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {
      name: formData.get("name") as string,
      username: formData.get("username") as string,
      role: formData.get("role") as string,
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
    };

    if (editingUser) {
      const pw = formData.get("password") as string;
      if (pw) data.password = pw;
      updateMutation.mutate({ id: editingUser.id, data });
    } else {
      data.password = (formData.get("password") as string) || "demo123";
      createMutation.mutate(data);
    }
  };

  const handleAddShift = () => {
    createShiftMutation.mutate({
      userId: shiftForm.userId,
      date: new Date(shiftForm.date).toISOString(),
      startTime: shiftForm.startTime,
      endTime: shiftForm.endTime,
      role: shiftForm.role || null,
      outletId: shiftForm.outletId || null,
      attendance: "scheduled",
    });
  };

  const openEdit = (staff: StaffMember) => {
    setEditingUser(staff);
    setDialogOpen(true);
  };

  const openAdd = () => {
    setEditingUser(null);
    setDialogOpen(true);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <UserCog className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-staff-title">Staff Management</h1>
            <p className="text-muted-foreground">Manage your team members, schedules, and attendance</p>
          </div>
        </div>
        <div className="flex gap-2">
          {activeTab === "schedule" && (
            <Button variant="outline" onClick={() => {
              setShiftForm({ userId: activeStaff[0]?.id || "", date: new Date().toISOString().split("T")[0], startTime: "09:00", endTime: "17:00", role: "", outletId: "" });
              setShowAddShift(true);
            }} data-testid="button-add-shift">
              <Calendar className="h-4 w-4 mr-2" /> Add Shift
            </Button>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-staff" onClick={openAdd}>
                <Plus className="h-4 w-4 mr-2" /> Add Staff
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingUser ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input name="name" defaultValue={editingUser?.name || ""} required data-testid="input-staff-name" />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input name="username" defaultValue={editingUser?.username || ""} required disabled={!!editingUser} data-testid="input-staff-username" />
                </div>
                <div className="space-y-2">
                  <Label>{editingUser ? "New Password (leave blank to keep)" : "Password"}</Label>
                  <Input name="password" type="password" required={!editingUser} data-testid="input-staff-password" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select name="role" defaultValue={editingUser?.role || "waiter"}>
                    <SelectTrigger data-testid="select-staff-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => {
                        const RoleIcon = roleIcons[r] || Users;
                        return (
                          <SelectItem key={r} value={r}>
                            <span className="flex items-center gap-2"><RoleIcon className="h-3.5 w-3.5" /> {r.charAt(0).toUpperCase() + r.slice(1)}</span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input name="email" type="email" defaultValue={editingUser?.email || ""} data-testid="input-staff-email" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input name="phone" defaultValue={editingUser?.phone || ""} data-testid="input-staff-phone" />
                </div>
                <Button type="submit" className="w-full" data-testid="button-submit-staff">
                  {editingUser ? "Update" : "Add"} Staff Member
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-2">
        <Button data-testid="button-tab-roster" variant={activeTab === "roster" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("roster")}>
          <Users className="w-4 h-4 mr-1" /> Roster
        </Button>
        <Button data-testid="button-tab-schedule" variant={activeTab === "schedule" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("schedule")}>
          <Calendar className="w-4 h-4 mr-1" /> Schedule
        </Button>
        <Button data-testid="button-tab-attendance" variant={activeTab === "attendance" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("attendance")}>
          <ClipboardCheck className="w-4 h-4 mr-1" /> Attendance
        </Button>
      </div>

      {activeTab === "roster" && (
        <>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" data-testid="input-search-staff" />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                    </TableRow>
                  ) : filteredStaff.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No staff found</TableCell>
                    </TableRow>
                  ) : (
                    filteredStaff.map((staff, index) => {
                      const RoleIcon = roleIcons[staff.role] || Users;
                      return (
                        <motion.tr
                          key={staff.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className="border-b transition-colors hover:bg-muted/50"
                          data-testid={`row-staff-${staff.id}`}
                        >
                          <TableCell className="font-medium" data-testid={`text-staff-name-${staff.id}`}>
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${roleBadgeColors[staff.role] || "bg-gray-100"}`}>
                                <RoleIcon className="h-4 w-4" />
                              </div>
                              {staff.name}
                            </div>
                          </TableCell>
                          <TableCell data-testid={`text-staff-username-${staff.id}`}>{staff.username}</TableCell>
                          <TableCell>
                            <Badge className={`${roleBadgeColors[staff.role] || ""} gap-1`} data-testid={`badge-staff-role-${staff.id}`}>
                              <RoleIcon className="h-3 w-3" /> {staff.role}
                            </Badge>
                          </TableCell>
                          <TableCell>{staff.email || "—"}</TableCell>
                          <TableCell>{staff.phone || "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${staff.active !== false ? "bg-green-500" : "bg-gray-400"}`} />
                              <Badge variant={staff.active !== false ? "default" : "secondary"} data-testid={`badge-staff-status-${staff.id}`}>
                                {staff.active !== false ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(staff)} data-testid={`button-edit-staff-${staff.id}`} className="hover:scale-110 transition-transform">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </motion.tr>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === "schedule" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex gap-1 border rounded-lg p-0.5">
                <Button variant={scheduleView === "weekly" ? "default" : "ghost"} size="sm" onClick={() => setScheduleView("weekly")} data-testid="button-view-weekly">
                  <LayoutGrid className="w-3.5 h-3.5 mr-1" /> Week
                </Button>
                <Button variant={scheduleView === "monthly" ? "default" : "ghost"} size="sm" onClick={() => setScheduleView("monthly")} data-testid="button-view-monthly">
                  <CalendarDays className="w-3.5 h-3.5 mr-1" /> Month
                </Button>
              </div>
              {scheduleView === "weekly" ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => {
                    const d = new Date(weekStart);
                    d.setDate(d.getDate() - 7);
                    setWeekStart(d);
                  }} data-testid="button-prev-week">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium">
                    {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} —{" "}
                    {new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => {
                    const d = new Date(weekStart);
                    d.setDate(d.getDate() + 7);
                    setWeekStart(d);
                  }} data-testid="button-next-week">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => {
                    const d = new Date(monthDate);
                    d.setMonth(d.getMonth() - 1);
                    setMonthDate(d);
                  }} data-testid="button-prev-month">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium">
                    {monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => {
                    const d = new Date(monthDate);
                    d.setMonth(d.getMonth() + 1);
                    setMonthDate(d);
                  }} data-testid="button-next-month">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(attendanceConfig).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1">
                  <span className={`px-1.5 py-0.5 rounded ${cfg.color}`}>{cfg.label}</span>
                </div>
              ))}
            </div>
          </div>

          {scheduleView === "weekly" && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2 text-left text-sm font-medium bg-muted/50 w-40">Staff</th>
                    {weekDays.map((day) => {
                      const isToday = day.toISOString().split("T")[0] === new Date().toISOString().split("T")[0];
                      return (
                        <th key={day.toISOString()} className={`border p-2 text-center text-xs font-medium ${isToday ? "bg-primary/10" : "bg-muted/50"}`}>
                          <div>{day.toLocaleDateString(undefined, { weekday: "short" })}</div>
                          <div className={`text-base font-bold ${isToday ? "text-primary" : ""}`}>{day.getDate()}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {activeStaff.map((member) => (
                    <tr key={member.id}>
                      <td className="border p-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${roleBadgeColors[member.role] || "bg-gray-100"}`}>
                            {member.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium truncate max-w-[100px]">{member.name}</p>
                            <p className="text-xs text-muted-foreground">{member.role}</p>
                          </div>
                        </div>
                      </td>
                      {weekDays.map((day) => {
                        const shifts = getShiftsForDayAndUser(day, member.id);
                        return (
                          <td key={day.toISOString()} className="border p-1 align-top min-w-[100px]">
                            {shifts.length === 0 ? (
                              <div className="text-xs text-muted-foreground text-center py-2">—</div>
                            ) : (
                              shifts.map((shift) => {
                                const att = (shift.attendance || "scheduled") as keyof typeof attendanceConfig;
                                const attCfg = attendanceConfig[att] || attendanceConfig.scheduled;
                                return (
                                  <div key={shift.id} className={`text-xs p-1.5 rounded mb-1 ${attCfg.color} group relative`} data-testid={`shift-${shift.id}`}>
                                    <div className="font-medium">{shift.startTime}–{shift.endTime}</div>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <Badge variant="outline" className="text-[10px] px-1 py-0">{attCfg.label}</Badge>
                                      {shift.outletId && outletMap.get(shift.outletId) && (
                                        <span className="text-[10px] text-muted-foreground truncate">{outletMap.get(shift.outletId)}</span>
                                      )}
                                    </div>
                                    <div className="hidden group-hover:flex absolute top-0 right-0 gap-0.5 p-0.5">
                                      {Object.entries(attendanceConfig).filter(([k]) => k !== att).map(([k, v]) => (
                                        <button
                                          key={k}
                                          className={`text-[10px] px-1 rounded ${v.color}`}
                                          onClick={() => updateShiftMutation.mutate({ id: shift.id, data: { attendance: k } })}
                                          data-testid={`button-attendance-${shift.id}-${k}`}
                                        >
                                          {v.label.charAt(0)}
                                        </button>
                                      ))}
                                      <button
                                        className="text-[10px] px-1 rounded bg-red-100 text-red-700"
                                        onClick={() => deleteShiftMutation.mutate(shift.id)}
                                        data-testid={`button-delete-shift-${shift.id}`}
                                      >
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {scheduleView === "monthly" && (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden" data-testid="monthly-calendar">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="p-2 text-center text-xs font-medium bg-muted/50">{day}</div>
                ))}
                {monthDays.map((day, idx) => {
                  if (!day) return <div key={`pad-${idx}`} className="bg-background p-1 min-h-[80px]" />;
                  const isToday = day.toISOString().split("T")[0] === new Date().toISOString().split("T")[0];
                  const dayShifts = getShiftsForDay(day);
                  return (
                    <div
                      key={day.toISOString()}
                      className={`bg-background p-1 min-h-[80px] ${isToday ? "ring-2 ring-primary/30 ring-inset" : ""}`}
                      data-testid={`month-day-${day.getDate()}`}
                    >
                      <div className={`text-xs font-medium mb-0.5 ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {dayShifts.slice(0, 3).map((shift) => {
                          const member = activeStaff.find((s) => s.id === shift.userId);
                          const att = (shift.attendance || "scheduled") as keyof typeof attendanceConfig;
                          const attCfg = attendanceConfig[att] || attendanceConfig.scheduled;
                          return (
                            <div key={shift.id} className={`text-[10px] px-1 py-0.5 rounded truncate ${attCfg.color}`} title={`${member?.name || "?"} ${shift.startTime}-${shift.endTime}`}>
                              {member?.name?.split(" ")[0] || "?"} {shift.startTime}
                            </div>
                          );
                        })}
                        {dayShifts.length > 3 && (
                          <div className="text-[10px] text-muted-foreground px-1">+{dayShifts.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "attendance" && (
        <div className="space-y-6">
          {(() => {
            const today = new Date().toISOString().split("T")[0];
            const todayLogs = attendanceLogs.filter((l: any) => l.date && l.date.startsWith(today));
            const clockedIn = todayLogs.filter((l: any) => l.clockIn && !l.clockOut).length;
            const completed = todayLogs.filter((l: any) => l.clockOut).length;
            const late = todayLogs.filter((l: any) => l.status === "late").length;
            const totalHours = todayLogs.reduce((sum: number, l: any) => sum + (parseFloat(l.hoursWorked) || 0), 0);

            const staffMap = new Map<string, string>();
            activeStaff.forEach((s) => staffMap.set(s.id, s.name));

            return (
              <>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">From</Label>
                      <Input type="date" value={attendanceDateFrom} onChange={(e) => setAttendanceDateFrom(e.target.value)} className="w-40" data-testid="input-attendance-from" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">To</Label>
                      <Input type="date" value={attendanceDateTo} onChange={(e) => setAttendanceDateTo(e.target.value)} className="w-40" data-testid="input-attendance-to" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Late Threshold</Label>
                    <Input
                      type="number"
                      min={1}
                      max={120}
                      className="w-20"
                      defaultValue={attendanceSettings?.lateThresholdMinutes || 15}
                      data-testid="input-late-threshold"
                      onBlur={async (e) => {
                        const val = parseInt(e.target.value);
                        if (val > 0) {
                          await apiRequest("PUT", "/api/attendance/settings", { lateThresholdMinutes: val });
                          queryClient.invalidateQueries({ queryKey: ["/api/attendance/settings"] });
                          toast({ title: "Updated", description: `Late threshold set to ${val} minutes` });
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30"><LogIn className="h-5 w-5 text-green-600" /></div>
                      <div>
                        <p className="text-xs text-muted-foreground">Clocked In Now</p>
                        <p className="text-2xl font-bold" data-testid="text-clocked-in-count">{clockedIn}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><CheckCircle className="h-5 w-5 text-blue-600" /></div>
                      <div>
                        <p className="text-xs text-muted-foreground">Completed Today</p>
                        <p className="text-2xl font-bold" data-testid="text-completed-count">{completed}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30"><AlertCircle className="h-5 w-5 text-amber-600" /></div>
                      <div>
                        <p className="text-xs text-muted-foreground">Late Today</p>
                        <p className="text-2xl font-bold" data-testid="text-late-count">{late}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30"><Timer className="h-5 w-5 text-purple-600" /></div>
                      <div>
                        <p className="text-xs text-muted-foreground">Hours Today</p>
                        <p className="text-2xl font-bold" data-testid="text-total-hours">{totalHours.toFixed(1)}h</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {attendanceSummary.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5" /> Employee Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {attendanceSummary.map((s: any) => (
                          <Card key={s.userId} className="border" data-testid={`card-employee-summary-${s.userId}`}>
                            <CardContent className="p-4">
                              <p className="font-semibold text-sm mb-2">{staffMap.get(s.userId) || "Unknown"}</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div><span className="text-muted-foreground">Days Present</span><p className="font-medium">{s.totalDays}</p></div>
                                <div><span className="text-muted-foreground">Late Days</span><p className="font-medium text-amber-600">{s.lateDays}</p></div>
                                <div><span className="text-muted-foreground">Total Hours</span><p className="font-medium">{s.totalHours}h</p></div>
                                <div><span className="text-muted-foreground">Avg Hours/Day</span><p className="font-medium">{s.avgHours}h</p></div>
                              </div>
                              <div className="mt-2">
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">Attendance Rate</span>
                                  <span className="font-medium">{s.attendanceRate}%</span>
                                </div>
                                <div className="w-full bg-muted rounded-full h-1.5">
                                  <div className={`h-1.5 rounded-full ${s.attendanceRate >= 90 ? "bg-green-500" : s.attendanceRate >= 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, s.attendanceRate)}%` }} />
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Attendance Log</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Staff Member</TableHead>
                          <TableHead>Clock In</TableHead>
                          <TableHead>Clock Out</TableHead>
                          <TableHead>Hours</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {attendanceLogs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                              No attendance records found for selected date range
                            </TableCell>
                          </TableRow>
                        ) : (
                          attendanceLogs.map((log: any) => (
                            <TableRow key={log.id} data-testid={`row-attendance-${log.id}`}>
                              <TableCell>{log.date ? new Date(log.date).toLocaleDateString() : "—"}</TableCell>
                              <TableCell className="font-medium">{staffMap.get(log.userId) || "Unknown"}</TableCell>
                              <TableCell>{new Date(log.clockIn).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                              <TableCell>{log.clockOut ? new Date(log.clockOut).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : <Badge variant="secondary" className="bg-green-100 text-green-700"><Clock className="h-3 w-3 mr-1" />Active</Badge>}</TableCell>
                              <TableCell>{log.hoursWorked ? `${parseFloat(log.hoursWorked).toFixed(1)}h` : "—"}</TableCell>
                              <TableCell>
                                <Badge className={log.status === "late" ? "bg-amber-100 text-amber-700" : log.status === "on_time" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"} data-testid={`badge-attendance-status-${log.id}`}>
                                  {log.status === "late" && <AlertCircle className="h-3 w-3 mr-1" />}
                                  {log.status === "on_time" && <CheckCircle className="h-3 w-3 mr-1" />}
                                  {log.status === "late" ? `Late (${log.lateMinutes}m)` : log.status === "on_time" ? "On Time" : log.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </div>
      )}

      <Dialog open={showAddShift} onOpenChange={setShowAddShift}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Shift</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Staff Member</Label>
              <Select value={shiftForm.userId} onValueChange={(v) => setShiftForm({ ...shiftForm, userId: v })}>
                <SelectTrigger data-testid="select-shift-staff"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {activeStaff.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            {outlets.length > 0 && (
              <div>
                <Label>Outlet</Label>
                <Select value={shiftForm.outletId || "none"} onValueChange={(v) => setShiftForm({ ...shiftForm, outletId: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="select-shift-outlet"><SelectValue placeholder="Select outlet (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific outlet</SelectItem>
                    {outlets.map((o) => (<SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Date</Label>
              <Input type="date" value={shiftForm.date} onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })} data-testid="input-shift-date" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Time</Label>
                <Input type="time" value={shiftForm.startTime} onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })} data-testid="input-shift-start" />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="time" value={shiftForm.endTime} onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })} data-testid="input-shift-end" />
              </div>
            </div>
            <div>
              <Label>Role Override (optional)</Label>
              <Input value={shiftForm.role} onChange={(e) => setShiftForm({ ...shiftForm, role: e.target.value })} placeholder="e.g. Floor Manager" data-testid="input-shift-role" />
            </div>
            <Button className="w-full" onClick={handleAddShift} disabled={!shiftForm.userId || !shiftForm.date || createShiftMutation.isPending} data-testid="button-submit-shift">
              Add Shift
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
