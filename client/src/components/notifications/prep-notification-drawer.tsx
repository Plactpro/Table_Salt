import { useState } from "react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Clock,
  ChefHat,
  Star,
  HelpCircle,
  PartyPopper,
  BarChart2,
  ChevronRight,
  BellOff,
  Settings,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Bell,
  RefreshCw,
  ShoppingCart,
} from "lucide-react";
import type { PrepNotification } from "@/hooks/use-prep-notifications";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

const typeConfig: Record<
  string,
  { icon: React.ReactNode; color: string; group: "action" | "info" | "complete" }
> = {
  task_assigned: { icon: <ChefHat className="h-4 w-4" />, color: "text-blue-600", group: "action" },
  task_reassigned: { icon: <ChefHat className="h-4 w-4" />, color: "text-indigo-600", group: "action" },
  task_started: { icon: <Clock className="h-4 w-4" />, color: "text-amber-600", group: "info" },
  task_completed: { icon: <CheckCircle2 className="h-4 w-4" />, color: "text-green-600", group: "action" },
  task_verified: { icon: <Star className="h-4 w-4" />, color: "text-yellow-500", group: "complete" },
  task_issue: { icon: <AlertTriangle className="h-4 w-4" />, color: "text-red-600", group: "action" },
  task_help: { icon: <HelpCircle className="h-4 w-4" />, color: "text-red-500", group: "action" },
  task_overdue: { icon: <AlertTriangle className="h-4 w-4" />, color: "text-red-700", group: "action" },
  deadline_warning: { icon: <Clock className="h-4 w-4" />, color: "text-orange-600", group: "action" },
  dish_complete: { icon: <CheckCircle2 className="h-4 w-4" />, color: "text-teal-600", group: "complete" },
  all_complete: { icon: <PartyPopper className="h-4 w-4" />, color: "text-green-700", group: "complete" },
  readiness_summary: { icon: <BarChart2 className="h-4 w-4" />, color: "text-slate-600", group: "info" },
};

const priorityBadge: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
};

function groupNotifications(notifications: PrepNotification[]) {
  const action: PrepNotification[] = [];
  const info: PrepNotification[] = [];
  const complete: PrepNotification[] = [];

  for (const n of notifications) {
    const cfg = typeConfig[n.type];
    if (!cfg) { info.push(n); continue; }
    if (cfg.group === "action") action.push(n);
    else if (cfg.group === "complete") complete.push(n);
    else info.push(n);
  }
  return { action, info, complete };
}

interface ReadinessSummaryCardProps {
  notification: PrepNotification;
  onMarkRead: (id: string) => void;
}

function ReadinessSummaryCard({ notification: n, onMarkRead }: ReadinessSummaryCardProps) {
  const [, navigate] = useLocation();
  const isUnread = !n.readAt;

  const bodyData: Record<string, any> = (() => {
    try { return JSON.parse(n.body ?? "{}"); } catch { return {}; }
  })();

  const verified = bodyData.verified ?? 0;
  const total = bodyData.total ?? 0;
  const inProgress = bodyData.inProgress ?? 0;
  const overdue = bodyData.overdue ?? 0;
  const dishesReady = bodyData.dishesReady ?? 0;
  const dishesAtRisk = bodyData.dishesAtRisk ?? 0;
  const completionPct = total > 0 ? Math.round((verified / total) * 100) : 0;

  return (
    <div
      className={`px-4 py-3 border-l-4 border-blue-400 ${isUnread ? "bg-blue-50/60 dark:bg-blue-950/20" : "bg-slate-50/60 dark:bg-slate-900/20"}`}
      data-testid={`prep-notif-summary-${n.id.slice(-4)}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-foreground">Readiness Summary</span>
          {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
        </span>
      </div>

      {n.title && (
        <p className="text-xs text-muted-foreground mb-2">{n.title}</p>
      )}

      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-2 text-center">
          <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto mb-0.5" />
          <p className="text-lg font-bold text-green-700">{verified}</p>
          <p className="text-[10px] text-green-600">Verified</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 text-center">
          <Clock className="h-4 w-4 text-amber-600 mx-auto mb-0.5" />
          <p className="text-lg font-bold text-amber-700">{inProgress}</p>
          <p className="text-[10px] text-amber-600">In Progress</p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2 text-center">
          <AlertTriangle className="h-4 w-4 text-red-600 mx-auto mb-0.5" />
          <p className="text-lg font-bold text-red-700">{overdue}</p>
          <p className="text-[10px] text-red-600">Overdue</p>
        </div>
      </div>

      {total > 0 && (
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Overall completion</span>
            <span className="font-semibold">{completionPct}% ({verified}/{total})</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
      )}

      {(dishesReady > 0 || dishesAtRisk > 0) && (
        <div className="flex items-center gap-3 mb-2 text-xs">
          {dishesReady > 0 && (
            <span className="flex items-center gap-1 text-green-700">
              <TrendingUp className="h-3 w-3" />{dishesReady} dishes ready
            </span>
          )}
          {dishesAtRisk > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <TrendingDown className="h-3 w-3" />{dishesAtRisk} at risk
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs px-2 py-0"
          onClick={() => { onMarkRead(n.id); navigate("/kitchen-board"); }}
          data-testid={`button-summary-board-${n.id.slice(-4)}`}
        >
          View Full Board <ChevronRight className="h-3 w-3 ml-0.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs px-2 py-0"
          onClick={() => { onMarkRead(n.id); navigate("/kitchen-board?tab=pending"); }}
          data-testid={`button-summary-assign-${n.id.slice(-4)}`}
        >
          Assign Pending
        </Button>
        {isUnread && (
          <button
            className="text-[10px] text-primary underline hover:no-underline ml-auto"
            onClick={() => onMarkRead(n.id)}
            data-testid={`button-mark-read-summary-${n.id.slice(-4)}`}
          >
            Mark read
          </button>
        )}
      </div>
    </div>
  );
}

interface KitchenStaffMember {
  id: number | string;
  name: string | null;
  username: string;
  role: string;
}

interface ReassignPopoverProps {
  taskId: string;
  onSuccess: (newName: string) => void;
}

function ReassignPopover({ taskId, onSuccess }: ReassignPopoverProps) {
  const [open, setOpen] = useState(false);
  const [selectedChefId, setSelectedChefId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { data: kitchenStaff = [] } = useQuery<KitchenStaffMember[]>({
    queryKey: ["/api/kitchen-staff"],
    enabled: open,
  });

  const handleReassign = async () => {
    if (!selectedChefId) return;
    const chef = kitchenStaff.find(u => String(u.id) === selectedChefId);
    const displayName = chef?.name ?? chef?.username ?? selectedChefId;
    setLoading(true);
    try {
      await apiRequest("PATCH", `/api/prep-assignments/${taskId}`, {
        chefId: selectedChefId,
        chefName: displayName,
      });
      toast({ title: `Task reassigned to ${displayName}` });
      onSuccess(displayName);
      setOpen(false);
    } catch {
      toast({ title: "Failed to reassign task", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs px-2 py-0"
          data-testid={`button-reassign-${taskId.slice(-4)}`}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          REASSIGN
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <p className="text-xs font-semibold mb-2">Reassign to:</p>
        <Select value={selectedChefId} onValueChange={setSelectedChefId}>
          <SelectTrigger className="h-7 text-xs mb-2" data-testid={`select-reassign-chef-${taskId.slice(-4)}`}>
            <SelectValue placeholder="Select staff..." />
          </SelectTrigger>
          <SelectContent>
            {kitchenStaff.length === 0 && (
              <SelectItem value="__none__" disabled>No kitchen staff found</SelectItem>
            )}
            {kitchenStaff.map(u => (
              <SelectItem key={u.id} value={String(u.id)}>
                {u.name ?? u.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="w-full h-7 text-xs"
          disabled={!selectedChefId || loading}
          onClick={handleReassign}
          data-testid={`button-confirm-reassign-${taskId.slice(-4)}`}
        >
          {loading ? "Reassigning..." : "Confirm Reassign"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

interface NotificationCardProps {
  notification: PrepNotification;
  onMarkRead: (id: string) => void;
}

function NotificationCard({ notification: n, onMarkRead }: NotificationCardProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [reminding, setReminding] = useState(false);

  if (n.type === "readiness_summary") {
    return <ReadinessSummaryCard notification={n} onMarkRead={onMarkRead} />;
  }

  const cfg = typeConfig[n.type] ?? { icon: <Circle className="h-4 w-4" />, color: "text-slate-500", group: "info" };
  const isUnread = !n.readAt;

  const isDeadlineOrOverdue = n.type === "deadline_warning" || n.type === "task_overdue";
  const isIssue = n.type === "task_issue";
  const taskId = n.relatedTaskId;

  const assigneeName = (() => {
    const match = n.body?.match(/Assigned to:?\s+([^\s|,\n]+)/i)
      ?? n.title?.match(/assigned to:?\s+([^\s|,\n]+)/i);
    return match?.[1] ?? "ASSIGNEE";
  })();

  const handleRemind = async () => {
    if (!taskId) return;
    setReminding(true);
    try {
      await apiRequest("POST", `/api/prep-assignments/${taskId}/remind`, {});
      toast({ title: `Reminder sent to ${assigneeName}` });
    } catch {
      toast({ title: "Failed to send reminder", variant: "destructive" });
    } finally {
      setReminding(false);
    }
  };

  return (
    <div
      className={`relative flex gap-3 py-3 px-4 transition-colors ${isUnread ? "bg-blue-50/60 dark:bg-blue-950/20" : "hover:bg-muted/30"}`}
      data-testid={`prep-notif-card-${n.id.slice(-4)}`}
    >
      {isUnread && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-blue-500" />
      )}
      <span className={`mt-0.5 shrink-0 ${cfg.color}`}>{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-snug ${isUnread ? "font-semibold" : "font-medium"} line-clamp-2`}>
            {n.title}
          </p>
          <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 font-semibold ${priorityBadge[n.priority]}`}>
            {n.priority}
          </Badge>
        </div>
        {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
          </span>
          {isUnread && (
            <button
              className="text-[10px] text-primary underline hover:no-underline"
              onClick={() => onMarkRead(n.id)}
              data-testid={`button-mark-read-${n.id.slice(-4)}`}
            >
              Mark read
            </button>
          )}
        </div>

        {(n.actionUrl || n.action2Url || isDeadlineOrOverdue || isIssue) && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {n.actionUrl && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs px-2 py-0"
                onClick={() => { onMarkRead(n.id); navigate(n.actionUrl!); }}
                data-testid={`button-notif-action-${n.id.slice(-4)}`}
              >
                {n.actionLabel ?? "View"} <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            )}
            {n.action2Url && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs px-2 py-0"
                onClick={() => { onMarkRead(n.id); navigate(n.action2Url!); }}
                data-testid={`button-notif-action2-${n.id.slice(-4)}`}
              >
                {n.action2Label ?? "More"}
              </Button>
            )}

            {isDeadlineOrOverdue && taskId && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs px-2 py-0"
                  onClick={handleRemind}
                  disabled={reminding}
                  data-testid={`button-remind-${n.id.slice(-4)}`}
                >
                  <Bell className="h-3 w-3 mr-1" />
                  {reminding ? "Sending..." : `REMIND ${assigneeName.toUpperCase().replace(/[^A-Z0-9 ]/g, "")}`}
                </Button>
                <ReassignPopover
                  taskId={taskId}
                  onSuccess={() => onMarkRead(n.id)}
                />
              </>
            )}

            {isIssue && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs px-2 py-0"
                onClick={() => { onMarkRead(n.id); navigate("/procurement"); }}
                data-testid={`button-raise-po-${n.id.slice(-4)}`}
              >
                <ShoppingCart className="h-3 w-3 mr-1" />
                RAISE PO
              </Button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

interface GroupSectionProps {
  title: string;
  items: PrepNotification[];
  onMarkRead: (id: string) => void;
}

function GroupSection({ title, items, onMarkRead }: GroupSectionProps) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="px-4 py-1.5 bg-muted/40 border-y">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      </div>
      {items.map(n => (
        <NotificationCard key={n.id} notification={n} onMarkRead={onMarkRead} />
      ))}
    </div>
  );
}

type SoundPref = "chime" | "beep" | "silent";

interface NotifPref {
  enabled: boolean;
  sound: SoundPref;
}

interface NotifPrefs {
  task_assigned: NotifPref;
  task_completed: NotifPref;
  task_overdue: NotifPref;
  task_issue: NotifPref;
  task_help: NotifPref;
  readiness_summary: NotifPref;
  all_complete: NotifPref;
}

const DEFAULT_PREFS: NotifPrefs = {
  task_assigned: { enabled: true, sound: "chime" },
  task_completed: { enabled: true, sound: "chime" },
  task_overdue: { enabled: true, sound: "beep" },
  task_issue: { enabled: true, sound: "beep" },
  task_help: { enabled: true, sound: "beep" },
  readiness_summary: { enabled: true, sound: "silent" },
  all_complete: { enabled: true, sound: "chime" },
};

const PREF_LABELS: Record<keyof NotifPrefs, string> = {
  task_assigned: "Task Assigned",
  task_completed: "Task Completed",
  task_overdue: "Task Overdue",
  task_issue: "Issue Reported",
  task_help: "Help Requested",
  readiness_summary: "Readiness Summary",
  all_complete: "All Prep Complete",
};

function loadPrefs(userId: string): NotifPrefs {
  try {
    const raw = localStorage.getItem(`prep_notif_prefs_${userId}`);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_PREFS };
}

function savePrefs(userId: string, prefs: NotifPrefs) {
  localStorage.setItem(`prep_notif_prefs_${userId}`, JSON.stringify(prefs));
}

interface NotificationPreferencesPanelProps {
  userId: string;
  onBack: () => void;
}

function NotificationPreferencesPanel({ userId, onBack }: NotificationPreferencesPanelProps) {
  const [prefs, setPrefs] = useState<NotifPrefs>(() => loadPrefs(userId));

  const updatePref = (key: keyof NotifPrefs, field: keyof NotifPref, value: boolean | SoundPref) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: { ...prev[key], [field]: value } };
      savePrefs(userId, next);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b flex items-center gap-2 shrink-0">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-prefs-back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-sm font-semibold">Notification Preferences</h2>
      </div>
      <ScrollArea className="flex-1 px-4 py-3">
        <p className="text-xs text-muted-foreground mb-4">
          Choose which events to receive alerts for, and the sound to play for each.
        </p>
        <div className="space-y-1">
          {(Object.keys(prefs) as Array<keyof NotifPrefs>).map(key => (
            <div
              key={key}
              className="flex items-center justify-between py-2.5 border-b last:border-0"
              data-testid={`pref-row-${key}`}
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={prefs[key].enabled}
                  onCheckedChange={v => updatePref(key, "enabled", v)}
                  data-testid={`toggle-pref-${key}`}
                />
                <Label className="text-sm cursor-pointer" htmlFor={`pref-${key}`}>
                  {PREF_LABELS[key]}
                </Label>
              </div>
              <Select
                value={prefs[key].sound}
                onValueChange={v => updatePref(key, "sound", v as SoundPref)}
                disabled={!prefs[key].enabled}
              >
                <SelectTrigger
                  className="h-7 w-[90px] text-xs"
                  data-testid={`select-sound-${key}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chime">Chime</SelectItem>
                  <SelectItem value="beep">Beep</SelectItem>
                  <SelectItem value="silent">Silent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-4">
          Preferences are saved locally on this device.
        </p>
      </ScrollArea>
    </div>
  );
}

interface PrepNotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  notifications: PrepNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export default function PrepNotificationDrawer({
  open,
  onClose,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
}: PrepNotificationDrawerProps) {
  const { user } = useAuth();
  const [showPrefs, setShowPrefs] = useState(false);
  const { action, info, complete } = groupNotifications(notifications);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] p-0 flex flex-col">
        {showPrefs && user ? (
          <NotificationPreferencesPanel
            userId={user.id.toString()}
            onBack={() => setShowPrefs(false)}
          />
        ) : (
          <>
            <SheetHeader className="px-4 pt-4 pb-2 border-b shrink-0">
              <div className="flex items-center justify-between">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <ChefHat className="h-5 w-5 text-orange-500" />
                  Kitchen Notifications
                  {unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full" data-testid="badge-prep-notif-count">
                      {unreadCount}
                    </span>
                  )}
                </SheetTitle>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={onMarkAllRead}
                      data-testid="button-mark-all-read"
                    >
                      Mark all read
                    </Button>
                  )}
                  <button
                    className="text-muted-foreground hover:text-foreground transition-colors p-1"
                    onClick={() => setShowPrefs(true)}
                    title="Notification preferences"
                    data-testid="button-open-notif-prefs"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <BellOff className="h-10 w-10 opacity-30" />
                  <p className="text-sm">No notifications yet</p>
                  <p className="text-xs">You'll see prep task updates here in real time</p>
                </div>
              ) : (
                <div>
                  <GroupSection title="Needs Action" items={action} onMarkRead={onMarkRead} />
                  <GroupSection title="In Progress" items={info} onMarkRead={onMarkRead} />
                  <GroupSection title="Completed" items={complete} onMarkRead={onMarkRead} />
                </div>
              )}
            </ScrollArea>

            <div className="border-t px-4 py-2 text-[11px] text-muted-foreground text-center shrink-0">
              Showing {notifications.length} notification{notifications.length !== 1 ? "s" : ""} · Live updates enabled
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
