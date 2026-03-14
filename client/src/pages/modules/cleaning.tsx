import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardCheck, Plus, Trash2, CheckCircle2, Clock, AlertTriangle,
  ChefHat, Building, Sparkles, ShieldCheck, Calendar,
} from "lucide-react";

type CleaningArea = "kitchen" | "restaurant_premises" | "deep_cleaning";
type CleaningFrequency = "hourly" | "every_2_hours" | "per_shift" | "daily" | "weekly" | "monthly";

interface CleaningTemplate {
  id: string;
  tenantId: string;
  name: string;
  area: CleaningArea;
  frequency: CleaningFrequency;
  shift: string | null;
  sortOrder: number | null;
  active: boolean | null;
}

interface CleaningTemplateItem {
  id: string;
  templateId: string;
  task: string;
  sortOrder: number | null;
}

interface CleaningLog {
  id: string;
  tenantId: string;
  templateId: string;
  templateItemId: string;
  completedBy: string;
  completedAt: string;
  date: string;
  notes: string | null;
}

const areaConfig: Record<CleaningArea, { label: string; icon: typeof ChefHat; color: string }> = {
  kitchen: { label: "Kitchen", icon: ChefHat, color: "bg-orange-100 text-orange-700" },
  restaurant_premises: { label: "Restaurant Premises", icon: Building, color: "bg-blue-100 text-blue-700" },
  deep_cleaning: { label: "Deep Cleaning", icon: Sparkles, color: "bg-purple-100 text-purple-700" },
};

const frequencyLabels: Record<CleaningFrequency, string> = {
  hourly: "Hourly",
  every_2_hours: "Every 2 Hours",
  per_shift: "Per Shift",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

export default function CleaningPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("kitchen");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);

  const isManager = user?.role === "owner" || user?.role === "manager";

  const { data: templates = [] } = useQuery<CleaningTemplate[]>({
    queryKey: ["/api/cleaning/templates"],
    queryFn: () => fetchJson("/api/cleaning/templates"),
  });

  const { data: logs = [] } = useQuery<CleaningLog[]>({
    queryKey: ["/api/cleaning/logs", selectedDate],
    queryFn: () => fetchJson(`/api/cleaning/logs?date=${selectedDate}`),
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: () => fetchJson("/api/users"),
  });

  const [templateItems, setTemplateItems] = useState<Record<string, CleaningTemplateItem[]>>({});

  const loadTemplateItems = async (templateId: string) => {
    if (templateItems[templateId]) return;
    const items = await fetchJson(`/api/cleaning/templates/${templateId}/items`);
    setTemplateItems(prev => ({ ...prev, [templateId]: items }));
  };

  const completeMutation = useMutation({
    mutationFn: async (data: { templateId: string; templateItemId: string; notes?: string }) => {
      const today = new Date(selectedDate);
      today.setHours(12, 0, 0, 0);
      const res = await fetch("/api/cleaning/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...data, date: today.toISOString() }),
      });
      if (!res.ok) throw new Error("Failed to log");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cleaning/logs"] });
      toast({ title: "Task completed", description: "Cleaning task marked as done" });
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (logId: string) => {
      const res = await fetch(`/api/cleaning/logs/${logId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to undo");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cleaning/logs"] });
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/cleaning/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cleaning/templates"] });
      setNewTemplateOpen(false);
      toast({ title: "Template created" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/cleaning/templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cleaning/templates"] });
      toast({ title: "Template deleted" });
    },
  });

  const getAreaTemplates = (area: CleaningArea) => templates.filter(t => t.area === area && t.active !== false);

  const isTaskCompleted = (templateItemId: string) => {
    return logs.some(l => l.templateItemId === templateItemId);
  };

  const getCompletionLog = (templateItemId: string) => {
    return logs.find(l => l.templateItemId === templateItemId);
  };

  const getTemplateProgress = (templateId: string) => {
    const items = templateItems[templateId] || [];
    if (items.length === 0) return 0;
    const completed = items.filter(item => isTaskCompleted(item.id)).length;
    return Math.round((completed / items.length) * 100);
  };

  const getOverallProgress = (area: CleaningArea) => {
    const areaTemplates = getAreaTemplates(area);
    let totalItems = 0;
    let completedItems = 0;
    for (const template of areaTemplates) {
      const items = templateItems[template.id] || [];
      totalItems += items.length;
      completedItems += items.filter(item => isTaskCompleted(item.id)).length;
    }
    return totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  };

  const getUserName = (userId: string) => {
    const u = users.find((u: any) => u.id === userId);
    return u?.name || "Unknown";
  };

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  const renderTemplateChecklist = (template: CleaningTemplate) => {
    const items = templateItems[template.id] || [];
    const progress = getTemplateProgress(template.id);

    if (!templateItems[template.id]) {
      loadTemplateItems(template.id);
    }

    return (
      <Card key={template.id} className="mb-4" data-testid={`card-template-${template.id}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">{template.name}</CardTitle>
              <Badge variant="outline" className="text-xs">
                {frequencyLabels[template.frequency]}
              </Badge>
              {template.shift && (
                <Badge variant="secondary" className="text-xs">{template.shift}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {progress === 100 ? (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100" data-testid={`badge-complete-${template.id}`}>
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Complete
                </Badge>
              ) : progress > 0 ? (
                <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
                  <Clock className="w-3 h-3 mr-1" /> {progress}%
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Pending
                </Badge>
              )}
              {isManager && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-600"
                  onClick={() => deleteTemplateMutation.mutate(template.id)}
                  data-testid={`button-delete-template-${template.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          <Progress value={progress} className="h-2 mt-2" />
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading tasks...</p>
          ) : (
            <div className="space-y-2">
              {items.map(item => {
                const completed = isTaskCompleted(item.id);
                const log = getCompletionLog(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                      completed ? "bg-green-50" : "hover:bg-muted/50"
                    }`}
                    data-testid={`cleaning-task-${item.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={completed}
                        disabled={!isToday || completeMutation.isPending}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            completeMutation.mutate({ templateId: template.id, templateItemId: item.id });
                          } else if (log) {
                            undoMutation.mutate(log.id);
                          }
                        }}
                        data-testid={`checkbox-task-${item.id}`}
                      />
                      <span className={`text-sm ${completed ? "line-through text-muted-foreground" : ""}`}>
                        {item.task}
                      </span>
                    </div>
                    {completed && log && (
                      <span className="text-xs text-muted-foreground">
                        {getUserName(log.completedBy)} at{" "}
                        {new Date(log.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderAreaTab = (area: CleaningArea) => {
    const areaTemplates = getAreaTemplates(area);
    const config = areaConfig[area];
    const overall = getOverallProgress(area);

    return (
      <div data-testid={`tab-content-${area}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.color}`}>
              <config.icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold">{config.label}</h3>
              <p className="text-sm text-muted-foreground">
                {areaTemplates.length} checklist{areaTemplates.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{overall}% Complete</p>
              <Progress value={overall} className="h-2 w-32" />
            </div>
          </div>
        </div>

        {areaTemplates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No cleaning checklists yet for this area.</p>
              {isManager && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setNewTemplateOpen(true)}
                  data-testid="button-add-first-template"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Checklist
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          areaTemplates.map(renderTemplateChecklist)
        )}
      </div>
    );
  };

  const renderComplianceTab = () => {
    const allAreas: CleaningArea[] = ["kitchen", "restaurant_premises", "deep_cleaning"];
    let totalTasks = 0;
    let completedTasks = 0;

    for (const area of allAreas) {
      for (const template of getAreaTemplates(area)) {
        const items = templateItems[template.id] || [];
        totalTasks += items.length;
        completedTasks += items.filter(item => isTaskCompleted(item.id)).length;
      }
    }

    const overallRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return (
      <div data-testid="tab-content-compliance">
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          {allAreas.map(area => {
            const config = areaConfig[area];
            const progress = getOverallProgress(area);
            return (
              <Card key={area} data-testid={`card-compliance-${area}`}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color}`}>
                      <config.icon className="w-4 h-4" />
                    </div>
                    <h4 className="font-medium">{config.label}</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Completion</span>
                      <span className="font-medium">{progress}%</span>
                    </div>
                    <Progress
                      value={progress}
                      className={`h-3 ${progress === 100 ? "[&>div]:bg-green-500" : progress >= 50 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"}`}
                    />
                    {progress < 100 && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-yellow-500" />
                        {100 - progress}% remaining tasks
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card data-testid="card-overall-compliance">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Overall Compliance Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-4">
              <p className="text-4xl font-bold">{overallRate}%</p>
              <p className="text-muted-foreground">Compliance Rate for {selectedDate}</p>
            </div>
            <Progress
              value={overallRate}
              className={`h-4 ${overallRate === 100 ? "[&>div]:bg-green-500" : overallRate >= 75 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"}`}
            />
            <div className="grid grid-cols-2 gap-4 mt-4 text-center">
              <div>
                <p className="text-2xl font-semibold text-green-600">{completedTasks}</p>
                <p className="text-sm text-muted-foreground">Tasks Completed</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-muted-foreground">{totalTasks - completedTasks}</p>
                <p className="text-sm text-muted-foreground">Tasks Remaining</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {logs.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {logs.slice(0, 10).map(log => {
                  const template = templates.find(t => t.id === log.templateId);
                  return (
                    <div key={log.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-sm">{template?.name || "Unknown"}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {getUserName(log.completedBy)} - {new Date(log.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6" data-testid="cleaning-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <ClipboardCheck className="w-7 h-7" />
            Cleaning & Maintenance
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track daily cleaning checklists and maintain compliance records
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-40"
              data-testid="input-date"
            />
          </div>
          {isManager && (
            <Dialog open={newTemplateOpen} onOpenChange={setNewTemplateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-template">
                  <Plus className="w-4 h-4 mr-2" /> New Checklist
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <NewTemplateForm
                  onSubmit={(data) => createTemplateMutation.mutate(data)}
                  isPending={createTemplateMutation.isPending}
                  defaultArea={activeTab as CleaningArea}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {!isToday && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600" />
            <span className="text-sm text-yellow-700">
              Viewing historical data for {new Date(selectedDate).toLocaleDateString()}. Tasks can only be checked off for today.
            </span>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4" data-testid="cleaning-tabs">
          <TabsTrigger value="kitchen" data-testid="tab-kitchen">
            <ChefHat className="w-4 h-4 mr-2" /> Kitchen
          </TabsTrigger>
          <TabsTrigger value="restaurant_premises" data-testid="tab-restaurant">
            <Building className="w-4 h-4 mr-2" /> Premises
          </TabsTrigger>
          <TabsTrigger value="deep_cleaning" data-testid="tab-deep">
            <Sparkles className="w-4 h-4 mr-2" /> Deep Clean
          </TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">
            <ShieldCheck className="w-4 h-4 mr-2" /> Compliance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kitchen" className="mt-6">
          {renderAreaTab("kitchen")}
        </TabsContent>
        <TabsContent value="restaurant_premises" className="mt-6">
          {renderAreaTab("restaurant_premises")}
        </TabsContent>
        <TabsContent value="deep_cleaning" className="mt-6">
          {renderAreaTab("deep_cleaning")}
        </TabsContent>
        <TabsContent value="compliance" className="mt-6">
          {renderComplianceTab()}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NewTemplateForm({
  onSubmit,
  isPending,
  defaultArea,
}: {
  onSubmit: (data: any) => void;
  isPending: boolean;
  defaultArea: CleaningArea;
}) {
  const [name, setName] = useState("");
  const [area, setArea] = useState<CleaningArea>(
    ["kitchen", "restaurant_premises", "deep_cleaning"].includes(defaultArea)
      ? defaultArea
      : "kitchen"
  );
  const [frequency, setFrequency] = useState<CleaningFrequency>("daily");
  const [shift, setShift] = useState("");
  const [tasksText, setTasksText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const items = tasksText
      .split("\n")
      .map(t => t.trim())
      .filter(Boolean)
      .map(task => ({ task }));
    onSubmit({ name, area, frequency, shift: shift || null, items });
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>New Cleaning Checklist</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div>
          <Label>Checklist Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Morning Kitchen Prep"
            required
            data-testid="input-template-name"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Area</Label>
            <Select value={area} onValueChange={(v) => setArea(v as CleaningArea)}>
              <SelectTrigger data-testid="select-area">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kitchen">Kitchen</SelectItem>
                <SelectItem value="restaurant_premises">Restaurant Premises</SelectItem>
                <SelectItem value="deep_cleaning">Deep Cleaning</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as CleaningFrequency)}>
              <SelectTrigger data-testid="select-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="every_2_hours">Every 2 Hours</SelectItem>
                <SelectItem value="per_shift">Per Shift</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Shift (optional)</Label>
          <Input
            value={shift}
            onChange={(e) => setShift(e.target.value)}
            placeholder="e.g., Morning, Afternoon, Closing"
            data-testid="input-shift"
          />
        </div>
        <div>
          <Label>Tasks (one per line)</Label>
          <Textarea
            value={tasksText}
            onChange={(e) => setTasksText(e.target.value)}
            placeholder={"Sanitize all cutting boards\nClean deep fryer\nMop kitchen floor\nWipe down counters"}
            rows={6}
            required
            data-testid="textarea-tasks"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending || !name || !tasksText.trim()} data-testid="button-submit-template">
          {isPending ? "Creating..." : "Create Checklist"}
        </Button>
      </DialogFooter>
    </form>
  );
}
