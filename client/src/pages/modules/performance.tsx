import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, TrendingUp, Clock, Star, Award, Users,
  Plus, Edit, Trash2, Filter, ChevronRight,
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

export default function PerformancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedStaffId, setSelectedStaffId] = useState("all");
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

  const filteredLogs = selectedStaffId === "all"
    ? logs
    : logs.filter((l) => l.userId === selectedStaffId);

  const staffSummaries = activeStaff.map((s) => {
    const staffLogs = logs.filter((l) => l.userId === s.id);
    const metrics: Record<string, number> = {};
    staffLogs.forEach((l) => {
      if (!metrics[l.metricType]) metrics[l.metricType] = 0;
      metrics[l.metricType] += Number(l.metricValue);
    });
    return { staff: s, logCount: staffLogs.length, metrics };
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

  const totalLogs = logs.length;
  const uniqueStaffTracked = new Set(logs.map((l) => l.userId)).size;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-performance-title">
              Employee Performance
            </h1>
            <p className="text-muted-foreground text-sm">Track and manage staff performance metrics</p>
          </div>
        </div>
        <Button data-testid="button-add-log" onClick={() => {
          setFormData({ userId: activeStaff[0]?.id || "", metricType: "orders_served", metricValue: "", period: "", notes: "" });
          setShowAddDialog(true);
        }}>
          <Plus className="w-4 h-4 mr-2" /> Log Performance
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/40">
              <BarChart3 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Logs</p>
              <p className="text-2xl font-bold" data-testid="text-total-logs">{totalLogs}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/40">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Staff Tracked</p>
              <p className="text-2xl font-bold" data-testid="text-staff-tracked">{uniqueStaffTracked}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/40">
              <Award className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Staff</p>
              <p className="text-2xl font-bold" data-testid="text-active-staff">{activeStaff.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-lg font-semibold">Staff Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {staffSummaries.map(({ staff: s, logCount, metrics }) => (
          <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card
              className={`cursor-pointer hover:shadow-md transition-shadow ${selectedStaffId === s.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedStaffId(selectedStaffId === s.id ? "all" : s.id)}
              data-testid={`card-staff-summary-${s.id}`}
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
                  <span className="text-sm text-muted-foreground">{logCount} logs</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(metrics).slice(0, 4).map(([type, value]) => {
                    const cfg = metricConfig[type] || { label: type, icon: BarChart3, color: "text-gray-600 bg-gray-100" };
                    const Icon = cfg.icon;
                    return (
                      <div key={type} className="flex items-center gap-1.5 text-xs">
                        <div className={`w-5 h-5 rounded flex items-center justify-center ${cfg.color}`}>
                          <Icon className="w-3 h-3" />
                        </div>
                        <span className="truncate">{cfg.label}: <strong>{Number(value).toFixed(1)}</strong></span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Performance Logs {selectedStaffId !== "all" && staffMap.get(selectedStaffId) ? `— ${staffMap.get(selectedStaffId)!.name}` : ""}
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
