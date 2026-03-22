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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import type { PrepNotification } from "@/hooks/use-prep-notifications";

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

interface NotificationCardProps {
  notification: PrepNotification;
  onMarkRead: (id: string) => void;
}

function NotificationCard({ notification: n, onMarkRead }: NotificationCardProps) {
  const [, navigate] = useLocation();
  const cfg = typeConfig[n.type] ?? { icon: <Circle className="h-4 w-4" />, color: "text-slate-500", group: "info" };
  const isUnread = !n.readAt;

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
        {(n.actionUrl || n.action2Url) && (
          <div className="flex items-center gap-2 mt-2">
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
  const { action, info, complete } = groupNotifications(notifications);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] p-0 flex flex-col">
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
      </SheetContent>
    </Sheet>
  );
}
