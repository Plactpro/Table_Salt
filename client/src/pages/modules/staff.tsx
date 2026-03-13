import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
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
  const [activeTab, setActiveTab] = useState<"roster" | "schedule">("roster");
  const [showAddShift, setShowAddShift] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [shiftForm, setShiftForm] = useState({
    userId: "", date: "", startTime: "09:00", endTime: "17:00", role: "",
  });

  const { data: staffList = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: ["/api/users"],
  });

  const { data: schedules = [] } = useQuery<ScheduleEntry[]>({
    queryKey: ["/api/staff-schedules"],
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

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const getShiftsForDayAndUser = (date: Date, userId: string) => {
    const dateStr = date.toISOString().split("T")[0];
    return schedules.filter((s) => {
      const sDate = new Date(s.date).toISOString().split("T")[0];
      return sDate === dateStr && s.userId === userId;
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
              setShiftForm({ userId: activeStaff[0]?.id || "", date: new Date().toISOString().split("T")[0], startTime: "09:00", endTime: "17:00", role: "" });
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
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(attendanceConfig).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1">
                  <span className={`px-1.5 py-0.5 rounded ${cfg.color}`}>{cfg.label}</span>
                </div>
              ))}
            </div>
          </div>

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
