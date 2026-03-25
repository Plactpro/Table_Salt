import { PageTitle } from "@/lib/accessibility";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency, type FormatCurrencyOptions } from "@shared/currency";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, TrendingUp, Clock, Star, Award, Users,
  Plus, Trash2, Filter, Calendar, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface PerformanceLog {
  id: string;
  tenantId: string;
  userId: string;
  metricType: string;
  metricValue: string;
  period: string | null;
  notes: string | null;
  recordedAt: string | null;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  active: boolean | null;
}

interface OrderData {
  id: string;
  waiterId: string | null;
  status: string | null;
  total: string | null;
  orderType: string | null;
  tableId: string | null;
  outletId: string | null;
  createdAt: string | null;
}

interface ScheduleEntry {
  id: string;
  userId: string;
  outletId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  attendance: string | null;
}

interface FeedbackData {
  id: string;
  customerId: string | null;
  orderId: string | null;
  rating: number | null;
}

interface OutletData {
  id: string;
  name: string;
}

interface OrderItemData {
  id: string;
  orderId: string;
  name: string;
  quantity: number | null;
}

const metricTypes = [
  { value: "orders_served", label: "Orders Served", icon: BarChart3, unit: "" },
  { value: "avg_rating", label: "Avg Rating", icon: Star, unit: "/5" },
  { value: "avg_prep_time_minutes", label: "Avg Prep Time", icon: Clock, unit: " min" },
  { value: "revenue_managed", label: "Revenue Managed", icon: TrendingUp, unit: "" },
  { value: "tips_earned", label: "Tips Earned", icon: Award, unit: "" },
  { value: "tables_served", label: "Tables Served", icon: Users, unit: "" },
  { value: "custom", label: "Custom Metric", icon: BarChart3, unit: "" },
];

const metricConfig: Record<string, { label: string; icon: typeof BarChart3; color: string }> = {
  orders_served: { label: "Orders Served", icon: BarChart3, color: "text-blue-600 bg-blue-100" },
  avg_rating: { label: "Avg Rating", icon: Star, color: "text-yellow-600 bg-yellow-100" },
  avg_prep_time_minutes: { label: "Prep Time", icon: Clock, color: "text-orange-600 bg-orange-100" },
  revenue_managed: { label: "Revenue", icon: TrendingUp, color: "text-green-600 bg-green-100" },
  tips_earned: { label: "Tips", icon: Award, color: "text-purple-600 bg-purple-100" },
  tables_served: { label: "Tables", icon: Users, color: "text-teal-600 bg-teal-100" },
};

function parseHoursFromTimeRange(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
}

export default function PerformancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currency = user?.tenant?.currency || "USD";
  const currencyOpts: FormatCurrencyOptions = { position: (user?.tenant?.currencyPosition || "before") as "before" | "after", decimals: user?.tenant?.currencyDecimals ?? 2 };
  const fmt = (val: string | number) => formatCurrency(val, currency, currencyOpts);

  const [selectedStaffId, setSelectedStaffId] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [filterOutlet, setFilterOutlet] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [formData, setFormData] = useState({
    userId: "", metricType: "orders_served", metricValue: "", period: "", notes: "",
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery<PerformanceLog[]>({
    queryKey: ["/api/performance-logs"],
  });

  const { data: staff = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/users"],
  });

  const { data: ordersRes } = useQuery<{ data: OrderData[]; total: number }>({
    queryKey: ["/api/orders"],
  });
  const orders = ordersRes?.data ?? [];

  const { data: schedules = [] } = useQuery<ScheduleEntry[]>({
    queryKey: ["/api/staff-schedules"],
  });

  const { data: feedbackList = [] } = useQuery<FeedbackData[]>({
    queryKey: ["/api/feedback"],
  });

  const { data: outlets = [] } = useQuery<OutletData[]>({
    queryKey: ["/api/outlets"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/performance-logs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/performance-logs"] });
      setShowAddDialog(false);
      toast({ title: "Performance log added" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/performance-logs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/performance-logs"] });
      toast({ title: "Log deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const activeStaff = staff.filter((s) => s.active !== false);
  const staffMap = new Map(staff.map((s) => [s.id, s]));

  const computedKPIs = useMemo(() => {
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(dateTo) : null;

    return activeStaff.map((s) => {
      const staffOrders = orders.filter((o) => {
        if (o.waiterId !== s.id) return false;
        if (filterOutlet !== "all" && o.outletId !== filterOutlet) return false;
        if (!o.createdAt) return true;
        const oDate = new Date(o.createdAt);
        if (fromDate && oDate < fromDate) return false;
        if (toDate && oDate > toDate) return false;
        return true;
      });

      const staffSchedules = schedules.filter((sc) => {
        if (sc.userId !== s.id) return false;
        if (filterOutlet !== "all" && sc.outletId !== filterOutlet) return false;
        if (!sc.date) return true;
        const scDate = new Date(sc.date);
        if (fromDate && scDate < fromDate) return false;
        if (toDate && scDate > toDate) return false;
        return true;
      });

      const paidOrders = staffOrders.filter((o) => o.status === "paid");
      const totalOrders = paidOrders.length;
      const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const uniqueTables = new Set(staffOrders.filter((o) => o.tableId).map((o) => o.tableId)).size;
      const totalShifts = staffSchedules.length;
      const presentShifts = staffSchedules.filter((sc) => sc.attendance === "present" || sc.attendance === "late").length;
      const attendanceRate = totalShifts > 0 ? (presentShifts / totalShifts) * 100 : 0;
      const totalHours = staffSchedules.reduce((sum, sc) => sum + parseHoursFromTimeRange(sc.startTime, sc.endTime), 0);
      const avgRevenuePerShift = totalShifts > 0 ? totalRevenue / totalShifts : 0;

      const staffOrderIds = new Set(paidOrders.map((o) => o.id));
      const staffFeedback = feedbackList.filter((fb) => fb.orderId && staffOrderIds.has(fb.orderId));
      const avgCustomerRating = staffFeedback.length > 0
        ? staffFeedback.reduce((sum, fb) => sum + (fb.rating || 0), 0) / staffFeedback.length : null;

      return {
        staff: s,
        totalOrders,
        totalRevenue,
        avgOrderValue,
        uniqueTables,
        totalShifts,
        presentShifts,
        attendanceRate,
        totalHours,
        avgRevenuePerShift,
        avgCustomerRating,
        feedbackCount: staffFeedback.length,
      };
    });
  }, [activeStaff, orders, schedules, feedbackList, dateFrom, dateTo, filterOutlet]);

  const filteredKPIs = computedKPIs.filter((k) => {
    if (filterRole !== "all" && k.staff.role !== filterRole) return false;
    if (selectedStaffId !== "all" && k.staff.id !== selectedStaffId) return false;
    return true;
  });

  const filteredLogs = logs.filter((l) => {
    if (selectedStaffId !== "all" && l.userId !== selectedStaffId) return false;
    if (filterRole !== "all") {
      const member = staffMap.get(l.userId);
      if (member && member.role !== filterRole) return false;
    }
    return true;
  });

  const handleSubmit = () => {
    createMutation.mutate({
      userId: formData.userId,
      metricType: formData.metricType,
      metricValue: formData.metricValue,
      period: formData.period || null,
      notes: formData.notes || null,
    });
  };

  const totalOrdersAll = computedKPIs.reduce((s, k) => s + k.totalOrders, 0);
  const totalRevenueAll = computedKPIs.reduce((s, k) => s + k.totalRevenue, 0);
  const avgAttendance = computedKPIs.length > 0
    ? computedKPIs.reduce((s, k) => s + k.attendanceRate, 0) / computedKPIs.length : 0;

  const roles = Array.from(new Set(activeStaff.map((s) => s.role)));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageTitle title="Performance" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-performance-title">
              Employee Performance
            </h1>
            <p className="text-muted-foreground text-sm">Computed KPIs from orders, schedules & manual logs</p>
          </div>
        </div>
        <Button data-testid="button-add-log" onClick={() => {
          setFormData({ userId: activeStaff[0]?.id || "", metricType: "orders_served", metricValue: "", period: "", notes: "" });
          setShowAddDialog(true);
        }}>
          <Plus className="w-4 h-4 mr-2" /> Log Performance
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/40">
              <BarChart3 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <p className="text-2xl font-bold" data-testid="text-total-orders">{totalOrdersAll}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/40">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold" data-testid="text-total-revenue">{fmt(totalRevenueAll)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/40">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Attendance</p>
              <p className="text-2xl font-bold" data-testid="text-avg-attendance">{avgAttendance.toFixed(0)}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/40">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Staff</p>
              <p className="text-2xl font-bold" data-testid="text-active-staff">{activeStaff.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Date From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" data-testid="input-date-from" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Date To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" data-testid="input-date-to" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="w-[140px]" data-testid="select-filter-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {outlets.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Outlet</Label>
                <Select value={filterOutlet} onValueChange={setFilterOutlet}>
                  <SelectTrigger className="w-[160px]" data-testid="select-filter-outlet">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Outlets</SelectItem>
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Staff</Label>
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger className="w-[180px]" data-testid="select-filter-staff">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {activeStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(dateFrom || dateTo || filterRole !== "all" || selectedStaffId !== "all" || filterOutlet !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); setFilterRole("all"); setSelectedStaffId("all"); setFilterOutlet("all"); }} data-testid="button-clear-filters">
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold">Staff KPIs (Computed)</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredKPIs.map(({ staff: s, totalOrders, totalRevenue, avgOrderValue, uniqueTables, totalShifts, attendanceRate, totalHours, avgRevenuePerShift, avgCustomerRating, feedbackCount }) => (
          <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card
              className={`cursor-pointer hover:shadow-md transition-shadow ${selectedStaffId === s.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedStaffId(selectedStaffId === s.id ? "all" : s.id)}
              data-testid={`card-staff-kpi-${s.id}`}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {s.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold" data-testid={`text-staff-name-${s.id}`}>{s.name}</p>
                      <Badge variant="outline" className="text-xs">{s.role}</Badge>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded flex items-center justify-center bg-blue-100 text-blue-600"><BarChart3 className="w-3 h-3" /></div>
                    <span>Orders: <strong>{totalOrders}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded flex items-center justify-center bg-green-100 text-green-600"><TrendingUp className="w-3 h-3" /></div>
                    <span>Revenue: <strong>{fmt(totalRevenue)}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded flex items-center justify-center bg-teal-100 text-teal-600"><Users className="w-3 h-3" /></div>
                    <span>Tables: <strong>{uniqueTables}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded flex items-center justify-center bg-amber-100 text-amber-600"><Calendar className="w-3 h-3" /></div>
                    <span>Shifts: <strong>{totalShifts}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded flex items-center justify-center bg-purple-100 text-purple-600"><Clock className="w-3 h-3" /></div>
                    <span>Hours: <strong>{totalHours.toFixed(1)}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded flex items-center justify-center bg-orange-100 text-orange-600"><Award className="w-3 h-3" /></div>
                    <span>Attendance: <strong>{attendanceRate.toFixed(0)}%</strong></span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded flex items-center justify-center bg-indigo-100 text-indigo-600"><TrendingUp className="w-3 h-3" /></div>
                    <span>AOV: <strong>{fmt(avgOrderValue)}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded flex items-center justify-center bg-yellow-100 text-yellow-600"><Star className="w-3 h-3" /></div>
                    <span>Rating: <strong>{avgCustomerRating !== null ? `${avgCustomerRating.toFixed(1)}/5` : "N/A"}</strong></span>
                  </div>
                </div>
                {avgRevenuePerShift > 0 && (
                  <p className="text-xs text-muted-foreground">Avg {fmt(avgRevenuePerShift)}/shift · {feedbackCount} review{feedbackCount !== 1 ? "s" : ""}</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Manual Performance Logs {selectedStaffId !== "all" && staffMap.get(selectedStaffId) ? `— ${staffMap.get(selectedStaffId)!.name}` : ""}
        </h2>
        {selectedStaffId !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedStaffId("all")} data-testid="button-clear-filter">
            Clear filter
          </Button>
        )}
      </div>

      {logsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground" data-testid="text-no-logs">No performance logs found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => {
            const member = staffMap.get(log.userId);
            const cfg = metricConfig[log.metricType] || { label: log.metricType, icon: BarChart3, color: "text-gray-600 bg-gray-100" };
            const Icon = cfg.icon;
            return (
              <motion.div key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card data-testid={`card-log-${log.id}`}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-medium">{member?.name || "Unknown"}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{cfg.label}</span>
                          {log.period && <Badge variant="outline" className="text-xs">{log.period}</Badge>}
                        </div>
                        {log.notes && <p className="text-xs text-muted-foreground mt-0.5">{log.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold" data-testid={`text-metric-value-${log.id}`}>
                        {Number(log.metricValue).toFixed(1)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(log.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-log-${log.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Performance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Staff Member</Label>
              <Select value={formData.userId} onValueChange={(v) => setFormData({ ...formData, userId: v })}>
                <SelectTrigger data-testid="select-log-staff">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {activeStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metric Type</Label>
              <Select value={formData.metricType} onValueChange={(v) => setFormData({ ...formData, metricType: v })}>
                <SelectTrigger data-testid="select-log-metric">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metricTypes.map((mt) => (
                    <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Value</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.metricValue}
                onChange={(e) => setFormData({ ...formData, metricValue: e.target.value })}
                data-testid="input-log-value"
              />
            </div>
            <div>
              <Label>Period (e.g. 2026-03-W1)</Label>
              <Input
                value={formData.period}
                onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                placeholder="2026-03-W1"
                data-testid="input-log-period"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                data-testid="input-log-notes"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={!formData.userId || !formData.metricValue || createMutation.isPending}
              data-testid="button-submit-log"
            >
              Save Performance Log
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
