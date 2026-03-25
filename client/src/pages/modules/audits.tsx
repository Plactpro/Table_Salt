import { PageTitle } from "@/lib/accessibility";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { StatCard } from "@/components/widgets/stat-card";
import {
  ShieldCheck, Plus, ClipboardList, AlertTriangle, CheckCircle2, Clock,
  BarChart3, Trash2, Edit, Eye, Camera, ChevronRight, Target,
  TrendingUp, XCircle, AlertCircle, CalendarDays, Users, FileText,
} from "lucide-react";
import { format } from "date-fns";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

type AuditTemplate = {
  id: string;
  tenantId: string;
  name: string;
  category: string;
  frequency: string;
  scheduledDay?: string;
  scheduledTime?: string;
  riskLevel: string;
  isActive: boolean;
  items: AuditTemplateItem[];
};

type AuditTemplateItem = {
  id: string;
  templateId: string;
  title: string;
  description?: string;
  category?: string;
  points: number;
  photoRequired: boolean;
  supervisorApproval: boolean;
  sortOrder: number;
};

type AuditSchedule = {
  id: string;
  tenantId: string;
  templateId: string;
  scheduledDate: string;
  status: string;
  assignedTo?: string;
  approvedBy?: string;
  totalScore?: number;
  maxScore?: number;
  completedAt?: string;
  notes?: string;
  template?: AuditTemplate;
  items?: AuditTemplateItem[];
  responses?: AuditResponse[];
};

type AuditResponse = {
  id: string;
  scheduleId: string;
  itemId: string;
  status: string;
  notes?: string;
  photoUrl?: string;
  completedBy?: string;
  completedAt?: string;
};

type AuditIssue = {
  id: string;
  tenantId: string;
  scheduleId?: string;
  itemId?: string;
  title: string;
  description?: string;
  severity: string;
  status: string;
  assignedTo?: string;
  dueDate?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
};

const riskColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const statusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  open: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  escalated: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

const categoryLabels: Record<string, string> = {
  food_safety: "Food Safety",
  financial: "Financial",
  operations: "Operations",
  compliance: "Compliance",
  staff: "Staff & Training",
  facilities: "Facilities",
};

const frequencyLabels: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

const CHART_COLORS = ["#0d9488", "#f59e0b", "#ef4444", "#6366f1", "#22c55e", "#ec4899"];

export default function AuditsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showAuditExecution, setShowAuditExecution] = useState<string | null>(null);
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AuditTemplate | null>(null);

  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState("operations");
  const [tplFrequency, setTplFrequency] = useState("daily");
  const [tplRiskLevel, setTplRiskLevel] = useState("medium");
  const [tplScheduledTime, setTplScheduledTime] = useState("14:00");
  const [tplScheduledDay, setTplScheduledDay] = useState("");
  const [tplItems, setTplItems] = useState<{ title: string; category: string; points: number; photoRequired: boolean }[]>([]);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemPoints, setNewItemPoints] = useState(5);
  const [newItemPhoto, setNewItemPhoto] = useState(false);

  const [schedTemplateId, setSchedTemplateId] = useState("");
  const [schedDate, setSchedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [schedAssignedTo, setSchedAssignedTo] = useState("unassigned");

  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [issueSeverity, setIssueSeverity] = useState("medium");
  const [issueScheduleId, setIssueScheduleId] = useState("");
  const [issueAssignedTo, setIssueAssignedTo] = useState("unassigned");

  const { data: templates = [] } = useQuery<AuditTemplate[]>({
    queryKey: ["/api/audits/templates"],
    queryFn: async () => { const res = await fetch("/api/audits/templates", { credentials: "include" }); return res.json(); },
  });

  const { data: schedules = [] } = useQuery<AuditSchedule[]>({
    queryKey: ["/api/audits/schedules"],
    queryFn: async () => { const res = await fetch("/api/audits/schedules", { credentials: "include" }); return res.json(); },
  });

  const { data: issues = [] } = useQuery<AuditIssue[]>({
    queryKey: ["/api/audits/issues"],
    queryFn: async () => { const res = await fetch("/api/audits/issues", { credentials: "include" }); return res.json(); },
  });

  const { data: analytics } = useQuery<any>({
    queryKey: ["/api/audits/analytics"],
    queryFn: async () => { const res = await fetch("/api/audits/analytics", { credentials: "include" }); return res.json(); },
  });

  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => { const res = await fetch("/api/users", { credentials: "include" }); return res.json(); },
  });

  const { data: activeAudit } = useQuery<AuditSchedule>({
    queryKey: ["/api/audits/schedules", showAuditExecution],
    enabled: !!showAuditExecution,
    queryFn: async () => { const res = await fetch(`/api/audits/schedules/${showAuditExecution}`, { credentials: "include" }); return res.json(); },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/audits/templates"] });
    queryClient.invalidateQueries({ queryKey: ["/api/audits/schedules"] });
    queryClient.invalidateQueries({ queryKey: ["/api/audits/issues"] });
    queryClient.invalidateQueries({ queryKey: ["/api/audits/analytics"] });
  };

  const templateMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingTemplate) {
        const res = await apiRequest("PATCH", `/api/audits/templates/${editingTemplate.id}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/audits/templates", data);
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setShowTemplateDialog(false);
      resetTemplateForm();
      toast({ title: editingTemplate ? "Template updated" : "Template created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const scheduleMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/audits/schedules", data);
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setShowScheduleDialog(false);
      toast({ title: "Audit scheduled" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const responseMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/audits/responses", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audits/schedules", showAuditExecution] });
      invalidateAll();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const completeAuditMutation = useMutation({
    mutationFn: async ({ id, totalScore, maxScore }: { id: string; totalScore: number; maxScore: number }) => {
      const res = await apiRequest("PATCH", `/api/audits/schedules/${id}`, {
        status: "completed", totalScore, maxScore, completedAt: new Date().toISOString(), approvedBy: user?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setShowAuditExecution(null);
      toast({ title: "Audit completed and submitted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const issueMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/audits/issues", data);
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setShowIssueDialog(false);
      setIssueTitle("");
      setIssueDescription("");
      toast({ title: "Issue created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateIssueMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/audits/issues/${id}`, data);
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Issue updated" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/audits/templates/${id}`);
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Template deleted" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resetTemplateForm = () => {
    setTplName(""); setTplCategory("operations"); setTplFrequency("daily");
    setTplRiskLevel("medium"); setTplScheduledTime("14:00"); setTplScheduledDay("");
    setTplItems([]); setEditingTemplate(null);
  };

  const openEditTemplate = (t: AuditTemplate) => {
    setEditingTemplate(t);
    setTplName(t.name); setTplCategory(t.category); setTplFrequency(t.frequency);
    setTplRiskLevel(t.riskLevel); setTplScheduledTime(t.scheduledTime || "14:00");
    setTplScheduledDay(t.scheduledDay || "");
    setTplItems(t.items.map(i => ({ title: i.title, category: i.category || "", points: i.points, photoRequired: i.photoRequired })));
    setShowTemplateDialog(true);
  };

  const addItem = () => {
    if (!newItemTitle.trim()) return;
    setTplItems([...tplItems, { title: newItemTitle.trim(), category: tplCategory, points: newItemPoints, photoRequired: newItemPhoto }]);
    setNewItemTitle(""); setNewItemPoints(5); setNewItemPhoto(false);
  };

  const upcomingAudits = useMemo(() => {
    return schedules.filter(s => s.status === "pending" || s.status === "in_progress").slice(0, 5);
  }, [schedules]);

  const completedThisWeek = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return schedules.filter(s => s.status === "completed" && new Date(s.completedAt || s.scheduledDate) >= weekAgo).length;
  }, [schedules]);

  const openIssuesCount = useMemo(() => issues.filter(i => i.status === "open" || i.status === "in_progress").length, [issues]);
  const criticalCount = useMemo(() => issues.filter(i => i.severity === "critical" && (i.status === "open" || i.status === "in_progress")).length, [issues]);

  const getTemplateName = (templateId: string) => templates.find(t => t.id === templateId)?.name || "Unknown";
  const getStaffName = (userId?: string) => {
    if (!userId) return "Unassigned";
    return staffList.find((s: any) => s.id === userId)?.name || "Unknown";
  };

  if (showAuditExecution && activeAudit) {
    const auditItems = activeAudit.items || [];
    const auditResponses = activeAudit.responses || [];
    const respondedItems = auditResponses.filter(r => r.status !== "pending");
    const passedItems = auditResponses.filter(r => r.status === "pass");
    const failedItems = auditResponses.filter(r => r.status === "fail");
    const totalPoints = auditItems.reduce((s, i) => s + (i.points || 5), 0);
    const earnedPoints = passedItems.reduce((s, r) => {
      const item = auditItems.find(i => i.id === r.itemId);
      return s + (item?.points || 5);
    }, 0);
    const progress = auditItems.length > 0 ? Math.round((respondedItems.length / auditItems.length) * 100) : 0;
    const grouped = auditItems.reduce((acc: Record<string, AuditTemplateItem[]>, item) => {
      const cat = item.category || "General";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" onClick={() => setShowAuditExecution(null)} data-testid="button-back-from-audit" className="mb-2">
              &larr; Back to Audits
            </Button>
            <h2 className="text-2xl font-bold font-heading" data-testid="text-audit-execution-title">
              {activeAudit.template?.name || getTemplateName(activeAudit.templateId)}
            </h2>
            <p className="text-muted-foreground">
              Scheduled: {format(new Date(activeAudit.scheduledDate), "PPP")} &bull; Assigned: {getStaffName(activeAudit.assignedTo)}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold font-heading text-primary" data-testid="text-audit-score">{earnedPoints}/{totalPoints}</div>
            <p className="text-sm text-muted-foreground">{progress}% complete</p>
          </div>
        </div>

        <Progress value={progress} className="h-3" data-testid="progress-audit" />

        <div className="grid gap-4">
          {Object.entries(grouped).map(([category, items]) => (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  {categoryLabels[category] || category}
                  <Badge variant="secondary" className="ml-auto">{items.length} items</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map((item) => {
                  const response = auditResponses.find(r => r.itemId === item.id);
                  const itemStatus = response?.status || "pending";
                  return (
                    <div key={item.id} className={`p-3 rounded-lg border transition-colors ${itemStatus === "pass" ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800" : itemStatus === "fail" ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800" : "bg-card"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm" data-testid={`text-audit-item-${item.id}`}>{item.title}</span>
                            <Badge variant="outline" className="text-xs">{item.points} pts</Badge>
                            {item.photoRequired && <Camera className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                          {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant={itemStatus === "pass" ? "default" : "outline"}
                            className="h-8 px-3"
                            data-testid={`button-pass-${item.id}`}
                            onClick={() => responseMutation.mutate({ scheduleId: activeAudit.id, itemId: item.id, status: "pass" })}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Pass
                          </Button>
                          <Button
                            size="sm"
                            variant={itemStatus === "fail" ? "destructive" : "outline"}
                            className="h-8 px-3"
                            data-testid={`button-fail-${item.id}`}
                            onClick={() => responseMutation.mutate({ scheduleId: activeAudit.id, itemId: item.id, status: "fail" })}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Fail
                          </Button>
                          <Button
                            size="sm"
                            variant={itemStatus === "na" ? "secondary" : "outline"}
                            className="h-8 px-2"
                            data-testid={`button-na-${item.id}`}
                            onClick={() => responseMutation.mutate({ scheduleId: activeAudit.id, itemId: item.id, status: "na" })}
                          >
                            N/A
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-3 justify-end sticky bottom-4">
          <Button
            variant="outline"
            onClick={() => { setIssueScheduleId(activeAudit.id); setShowIssueDialog(true); }}
            data-testid="button-report-issue"
          >
            <AlertTriangle className="h-4 w-4 mr-2" /> Report Issue
          </Button>
          <Button
            size="lg"
            disabled={progress < 100 || completeAuditMutation.isPending}
            onClick={() => completeAuditMutation.mutate({ id: activeAudit.id, totalScore: earnedPoints, maxScore: totalPoints })}
            data-testid="button-submit-audit"
            className="transition-all hover:scale-[1.02]"
          >
            <ShieldCheck className="h-4 w-4 mr-2" /> Submit Audit ({earnedPoints}/{totalPoints} pts)
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageTitle title="Audits" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading flex items-center gap-2" data-testid="text-audits-title">
            <ShieldCheck className="h-7 w-7 text-primary" /> Internal Audits
          </h1>
          <p className="text-muted-foreground">Manage compliance audits, checklists & inspections</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowScheduleDialog(true)} data-testid="button-schedule-audit">
            <CalendarDays className="h-4 w-4 mr-2" /> Schedule Audit
          </Button>
          <Button onClick={() => { resetTemplateForm(); setShowTemplateDialog(true); }} data-testid="button-new-template">
            <Plus className="h-4 w-4 mr-2" /> New Template
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5" data-testid="tabs-audits">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="schedules" data-testid="tab-schedules">Schedules</TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">Templates</TabsTrigger>
          <TabsTrigger value="issues" data-testid="tab-issues">
            Issues {openIssuesCount > 0 && <Badge variant="destructive" className="ml-1.5 h-5 px-1.5 text-xs">{openIssuesCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: "Compliance Score", value: `${analytics?.complianceScore || 0}%`, icon: Target, color: "text-teal-600", testId: "stat-compliance-score", delay: 0 },
              { title: "Completed This Week", value: completedThisWeek, icon: CheckCircle2, color: "text-green-600", testId: "stat-completed-week", delay: 0.1 },
              { title: "Open Issues", value: openIssuesCount, icon: AlertCircle, color: "text-orange-500", testId: "stat-open-issues", delay: 0.2 },
              { title: "Critical Issues", value: criticalCount, icon: AlertTriangle, color: "text-red-600", testId: "stat-critical-issues", delay: 0.3 },
            ].map((stat) => (
              <StatCard key={stat.testId} title={stat.title} value={stat.value} icon={stat.icon} iconColor={stat.color} testId={stat.testId} index={stat.delay * 10} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Upcoming Audits
                </CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingAudits.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No upcoming audits scheduled</p>
                ) : (
                  <div className="space-y-3">
                    {upcomingAudits.map((s) => {
                      const tmpl = templates.find(t => t.id === s.templateId);
                      return (
                        <motion.div key={s.id} whileHover={{ x: 4 }}
                          className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => setShowAuditExecution(s.id)}
                          data-testid={`card-upcoming-${s.id}`}
                        >
                          <div>
                            <p className="font-medium text-sm">{tmpl?.name || "Audit"}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">{frequencyLabels[tmpl?.frequency || ""] || tmpl?.frequency}</Badge>
                              <span className="text-xs text-muted-foreground">{format(new Date(s.scheduledDate), "MMM dd, yyyy")}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={statusColors[s.status]}>{s.status}</Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Recent Issues
                </CardTitle>
              </CardHeader>
              <CardContent>
                {issues.filter(i => i.status !== "resolved").length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No open issues</p>
                ) : (
                  <div className="space-y-3">
                    {issues.filter(i => i.status !== "resolved").slice(0, 5).map((issue) => (
                      <div key={issue.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`card-issue-${issue.id}`}>
                        <div>
                          <p className="font-medium text-sm">{issue.title}</p>
                          <span className="text-xs text-muted-foreground">{format(new Date(issue.createdAt), "MMM dd")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={riskColors[issue.severity]}>{issue.severity}</Badge>
                          <Badge className={statusColors[issue.status]}>{issue.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Scheduled Audits</CardTitle>
                <Button size="sm" onClick={() => setShowScheduleDialog(true)} data-testid="button-schedule-audit-2">
                  <Plus className="h-4 w-4 mr-1" /> Schedule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {schedules.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No audits scheduled yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Audit</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.map((s) => (
                      <TableRow key={s.id} data-testid={`row-schedule-${s.id}`} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{getTemplateName(s.templateId)}</TableCell>
                        <TableCell>{format(new Date(s.scheduledDate), "MMM dd, yyyy")}</TableCell>
                        <TableCell>{getStaffName(s.assignedTo)}</TableCell>
                        <TableCell><Badge className={statusColors[s.status]}>{s.status}</Badge></TableCell>
                        <TableCell>{s.status === "completed" ? `${s.totalScore}/${s.maxScore}` : "—"}</TableCell>
                        <TableCell>
                          {(s.status === "pending" || s.status === "in_progress") && (
                            <Button size="sm" variant="outline" onClick={() => setShowAuditExecution(s.id)} data-testid={`button-start-audit-${s.id}`}>
                              <Eye className="h-3.5 w-3.5 mr-1" /> Start
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2 }}>
                <Card className="h-full" data-testid={`card-template-${t.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{t.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {frequencyLabels[t.frequency]} &bull; {t.scheduledTime || "—"}
                        </CardDescription>
                      </div>
                      <Badge className={riskColors[t.riskLevel]}>{t.riskLevel}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="outline">{categoryLabels[t.category] || t.category}</Badge>
                      <span className="text-xs text-muted-foreground">{t.items.length} items</span>
                      <span className="text-xs text-muted-foreground">{t.items.reduce((s, i) => s + (i.points || 5), 0)} pts</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditTemplate(t)} data-testid={`button-edit-template-${t.id}`}>
                        <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => deleteTemplateMutation.mutate(t.id)} data-testid={`button-delete-template-${t.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
            {templates.length === 0 && (
              <div className="col-span-full text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No audit templates yet. Create one to get started.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="issues" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Issues & Corrective Actions</CardTitle>
                <Button size="sm" onClick={() => { setIssueScheduleId(""); setShowIssueDialog(true); }} data-testid="button-new-issue">
                  <Plus className="h-4 w-4 mr-1" /> New Issue
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {issues.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No issues logged</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issues.map((issue) => (
                      <TableRow key={issue.id} data-testid={`row-issue-${issue.id}`} className="hover:bg-muted/50">
                        <TableCell>
                          <p className="font-medium">{issue.title}</p>
                          {issue.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{issue.description}</p>}
                        </TableCell>
                        <TableCell><Badge className={riskColors[issue.severity]}>{issue.severity}</Badge></TableCell>
                        <TableCell>{getStaffName(issue.assignedTo)}</TableCell>
                        <TableCell><Badge className={statusColors[issue.status]}>{issue.status}</Badge></TableCell>
                        <TableCell className="text-sm">{format(new Date(issue.createdAt), "MMM dd")}</TableCell>
                        <TableCell>
                          {issue.status !== "resolved" && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" data-testid={`button-resolve-issue-${issue.id}`}
                                onClick={() => updateIssueMutation.mutate({ id: issue.id, status: "resolved", resolvedAt: new Date().toISOString(), resolvedBy: user?.id })}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                              {issue.status !== "escalated" && (
                                <Button size="sm" variant="outline" className="text-purple-600" data-testid={`button-escalate-issue-${issue.id}`}
                                  onClick={() => updateIssueMutation.mutate({ id: issue.id, status: "escalated" })}
                                >
                                  <TrendingUp className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: "Total Audits", value: analytics?.totalAudits || 0, icon: ClipboardList, color: "text-blue-600" },
              { title: "Completed", value: analytics?.completedAudits || 0, icon: CheckCircle2, color: "text-green-600" },
              { title: "Pending", value: analytics?.pendingAudits || 0, icon: Clock, color: "text-orange-500" },
            ].map((stat, i) => (
              <StatCard key={i} title={stat.title} value={stat.value} icon={stat.icon} iconColor={stat.color} testId={`stat-analytics-${i}`} index={i} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Score by Category</CardTitle></CardHeader>
              <CardContent>
                {analytics?.categoryScores?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={analytics.categoryScores}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" tick={{ fontSize: 11 }} tickFormatter={(v: string) => categoryLabels[v] || v} />
                      <YAxis domain={[0, 100]} />
                      <RechartsTooltip formatter={(v: number) => `${v}%`} />
                      <Bar dataKey="score" fill="#0d9488" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Issues by Severity</CardTitle></CardHeader>
              <CardContent>
                {issues.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={["critical", "high", "medium", "low"].map(sev => ({
                          name: sev, value: issues.filter(i => i.severity === sev).length,
                        })).filter(d => d.value > 0)}
                        cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}
                      >
                        {["#ef4444", "#f59e0b", "#eab308", "#22c55e"].map((c, i) => (
                          <Cell key={i} fill={c} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No issues data</p>
                )}
              </CardContent>
            </Card>

            {analytics?.recentAudits?.length > 0 && (
              <Card className="col-span-full">
                <CardHeader><CardTitle className="text-base">Recent Audit Scores</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={analytics.recentAudits.map((a: any) => ({ ...a, date: format(new Date(a.date), "MMM dd") }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} />
                      <RechartsTooltip formatter={(v: number) => `${v}%`} />
                      <Line type="monotone" dataKey="percentage" stroke="#0d9488" strokeWidth={2} dot={{ fill: "#0d9488" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Audit Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g., Kitchen Operations Audit" data-testid="input-template-name" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={tplCategory} onValueChange={setTplCategory}>
                  <SelectTrigger data-testid="select-template-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={tplFrequency} onValueChange={setTplFrequency}>
                  <SelectTrigger data-testid="select-template-frequency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(frequencyLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Risk Level</Label>
                <Select value={tplRiskLevel} onValueChange={setTplRiskLevel}>
                  <SelectTrigger data-testid="select-template-risk"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Scheduled Time</Label>
                <Input type="time" value={tplScheduledTime} onChange={(e) => setTplScheduledTime(e.target.value)} data-testid="input-template-time" />
              </div>
              {(tplFrequency === "weekly" || tplFrequency === "monthly") && (
                <div className="space-y-2">
                  <Label>{tplFrequency === "weekly" ? "Day of Week" : "Day of Month"}</Label>
                  <Input value={tplScheduledDay} onChange={(e) => setTplScheduledDay(e.target.value)} placeholder={tplFrequency === "weekly" ? "monday" : "1"} data-testid="input-template-day" />
                </div>
              )}
            </div>

            <Separator />

            <div>
              <Label className="text-base font-semibold">Checklist Items ({tplItems.length})</Label>
              <div className="flex gap-2 mt-2">
                <Input value={newItemTitle} onChange={(e) => setNewItemTitle(e.target.value)} placeholder="Item title..." className="flex-1" data-testid="input-new-item-title"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
                />
                <Input type="number" value={newItemPoints} onChange={(e) => setNewItemPoints(Number(e.target.value))} className="w-20" data-testid="input-new-item-points" />
                <div className="flex items-center gap-1">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  <Switch checked={newItemPhoto} onCheckedChange={setNewItemPhoto} data-testid="switch-new-item-photo" />
                </div>
                <Button type="button" onClick={addItem} data-testid="button-add-item"><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-2 mt-3">
                <AnimatePresence>
                  {tplItems.map((item, idx) => (
                    <motion.div key={idx} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="flex items-center justify-between p-2 rounded border bg-muted/30"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{idx + 1}.</span>
                        <span className="text-sm">{item.title}</span>
                        <Badge variant="outline" className="text-xs">{item.points}pts</Badge>
                        {item.photoRequired && <Camera className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setTplItems(tplItems.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>Cancel</Button>
            <Button onClick={() => templateMutation.mutate({
              name: tplName, category: tplCategory, frequency: tplFrequency,
              riskLevel: tplRiskLevel, scheduledTime: tplScheduledTime, scheduledDay: tplScheduledDay || null,
              items: tplItems.map((item, i) => ({ title: item.title, category: item.category || tplCategory, points: item.points, photoRequired: item.photoRequired, sortOrder: i })),
            })} disabled={!tplName.trim() || tplItems.length === 0 || templateMutation.isPending} data-testid="button-save-template">
              {editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule an Audit</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={schedTemplateId} onValueChange={setSchedTemplateId}>
                <SelectTrigger data-testid="select-schedule-template"><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({frequencyLabels[t.frequency]})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} data-testid="input-schedule-date" />
            </div>
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={schedAssignedTo} onValueChange={setSchedAssignedTo}>
                <SelectTrigger data-testid="select-schedule-assignee"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {staffList.filter((s: any) => s.role === "owner" || s.role === "manager").map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>Cancel</Button>
            <Button onClick={() => scheduleMutation.mutate({
              templateId: schedTemplateId, scheduledDate: schedDate,
              assignedTo: schedAssignedTo === "unassigned" ? null : schedAssignedTo,
            })} disabled={!schedTemplateId || scheduleMutation.isPending} data-testid="button-confirm-schedule">
              Schedule Audit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showIssueDialog} onOpenChange={setShowIssueDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Report Issue</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Issue Title</Label>
              <Input value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} placeholder="Describe the issue..." data-testid="input-issue-title" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} placeholder="Details..." data-testid="input-issue-description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select value={issueSeverity} onValueChange={setIssueSeverity}>
                  <SelectTrigger data-testid="select-issue-severity"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assign To</Label>
                <Select value={issueAssignedTo} onValueChange={setIssueAssignedTo}>
                  <SelectTrigger data-testid="select-issue-assignee"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {staffList.filter((s: any) => s.role === "owner" || s.role === "manager").map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIssueDialog(false)}>Cancel</Button>
            <Button onClick={() => issueMutation.mutate({
              title: issueTitle, description: issueDescription, severity: issueSeverity,
              scheduleId: issueScheduleId || null,
              assignedTo: issueAssignedTo === "unassigned" ? null : issueAssignedTo,
            })} disabled={!issueTitle.trim() || issueMutation.isPending} data-testid="button-submit-issue">
              Submit Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
