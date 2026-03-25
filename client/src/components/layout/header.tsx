import { useAuth, Role } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import SyncStatusIndicator from "@/components/sync-status-indicator";
import AlertNotificationBell from "@/components/alert-notification-bell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LogOut,
  ChevronDown,
  User,
  Bell,
  Crown,
  Briefcase,
  Coffee,
  ChefHat,
  Calculator,
  UserCircle,
  Headset,
  PackageOpen,
  PartyPopper,
  type LucideIcon,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { usePrepNotifications } from "@/hooks/use-prep-notifications";
import { usePrepAlertSound } from "@/hooks/use-prep-alert-sound";
import PrepNotificationDrawer from "@/components/notifications/prep-notification-drawer";

interface HeaderProps {
  onOpenSupport?: () => void;
}

const roleLabels: Partial<Record<Role, string>> = {
  owner: "Owner",
  manager: "Manager",
  waiter: "Waiter",
  kitchen: "Kitchen",
  accountant: "Accountant",
  customer: "Customer",
  cashier: "Cashier",
  supervisor: "Supervisor",
  outlet_manager: "Outlet Manager",
  hq_admin: "HQ Admin",
  franchise_owner: "Franchise Owner",
  auditor: "Auditor",
  super_admin: "Super Admin",
};

const roleBadgeColors: Partial<Record<Role, string>> = {
  owner: "bg-amber-100 text-amber-800 border-amber-200",
  manager: "bg-teal-100 text-teal-800 border-teal-200",
  waiter: "bg-green-100 text-green-800 border-green-200",
  kitchen: "bg-orange-100 text-orange-800 border-orange-200",
  accountant: "bg-gray-100 text-gray-800 border-gray-200",
  customer: "bg-stone-100 text-stone-800 border-stone-200",
  cashier: "bg-blue-100 text-blue-800 border-blue-200",
  supervisor: "bg-violet-100 text-violet-800 border-violet-200",
  outlet_manager: "bg-cyan-100 text-cyan-800 border-cyan-200",
  hq_admin: "bg-rose-100 text-rose-800 border-rose-200",
  franchise_owner: "bg-orange-100 text-orange-800 border-orange-200",
  auditor: "bg-slate-100 text-slate-800 border-slate-200",
  super_admin: "bg-red-100 text-red-800 border-red-200",
};

const roleIcons: Partial<Record<Role, LucideIcon>> = {
  owner: Crown,
  manager: Briefcase,
  waiter: Coffee,
  kitchen: ChefHat,
  accountant: Calculator,
  customer: UserCircle,
  cashier: Calculator,
  supervisor: Briefcase,
  outlet_manager: Briefcase,
  hq_admin: Crown,
  franchise_owner: Crown,
  auditor: User,
  super_admin: Crown,
};

interface InventoryAlert {
  id: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const PREP_NOTIF_ROLES: Role[] = ["kitchen", "owner", "manager", "outlet_manager", "franchise_owner", "hq_admin", "supervisor"];

export default function Header({ onOpenSupport }: HeaderProps) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { play: playSound } = usePrepAlertSound(user?.id?.toString());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const canSeeInventoryAlerts = user && ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"].includes(user.role);
  const canSeePrepNotif = user && PREP_NOTIF_ROLES.includes(user.role as Role);

  const {
    notifications: prepNotifications,
    unreadCount: prepUnread,
    markRead: markPrepRead,
    markAllRead: markAllPrepRead,
  } = usePrepNotifications();

  const { data: alertCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/inventory-alerts/count"],
    queryFn: async () => {
      const res = await fetch("/api/inventory-alerts/count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: !!canSeeInventoryAlerts,
    refetchInterval: 30000,
  });

  const { data: alerts = [] } = useQuery<InventoryAlert[]>({
    queryKey: ["/api/inventory-alerts"],
    queryFn: async () => {
      const res = await fetch("/api/inventory-alerts", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!canSeeInventoryAlerts,
    refetchInterval: 30000,
  });

  const acknowledgeAll = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/inventory-alerts/acknowledge-all", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-alerts/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-alerts"] });
    },
  });

  const acknowledgeOne = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/inventory-alerts/${id}/acknowledge`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-alerts/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-alerts"] });
    },
  });

  useRealtimeEvent("low_stock_alert", useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/inventory-alerts/count"] });
    queryClient.invalidateQueries({ queryKey: ["/api/inventory-alerts"] });
  }, [queryClient]));

  const showPrepToast = useCallback((title: string, description: string | undefined, priority: "HIGH" | "MEDIUM" | "LOW") => {
    const muted = localStorage.getItem("prepToastsMuted") === "true";
    if (muted) return;
    toast({
      title,
      description,
      duration: priority === "HIGH" ? 7000 : 4000,
      variant: priority === "HIGH" ? "destructive" : "default",
    });
  }, [toast]);

  useRealtimeEvent("prep:notification", useCallback((n: any) => {
    if (!canSeePrepNotif) return;
    playSound(n.priority ?? "LOW", n.type);
    showPrepToast(n.title, n.body ?? undefined, n.priority ?? "LOW");
  }, [canSeePrepNotif, playSound, showPrepToast]));

  useRealtimeEvent("prep:task_overdue", useCallback((data: any) => {
    if (!canSeePrepNotif) return;
    playSound("HIGH", "task_overdue");
    showPrepToast(`🔴 OVERDUE: ${data.taskName ?? "Task"}`, "This task has passed its deadline", "HIGH");
  }, [canSeePrepNotif, playSound, showPrepToast]));

  useRealtimeEvent("prep:task_help", useCallback((data: any) => {
    if (!canSeePrepNotif) return;
    playSound("HIGH", "task_help");
    showPrepToast(`🆘 ${data.chefName ?? "Chef"} needs help`, data.taskName ?? undefined, "HIGH");
  }, [canSeePrepNotif, playSound, showPrepToast]));

  useRealtimeEvent("prep:task_issue", useCallback((data: any) => {
    if (!canSeePrepNotif) return;
    playSound("HIGH", "task_issue");
    showPrepToast(`⚠️ Issue reported`, data.taskName ?? undefined, "HIGH");
  }, [canSeePrepNotif, playSound, showPrepToast]));

  useRealtimeEvent("prep:all_complete", useCallback((_data: any) => {
    if (!canSeePrepNotif) return;
    playSound("LOW", "all_complete");
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), 4000);
  }, [canSeePrepNotif, playSound]));

  useRealtimeEvent("prep:task_progress", useCallback((data: any) => {
    if (!canSeePrepNotif) return;
    playSound("LOW", "task_progress");
    showPrepToast(
      `⏳ ${data.assignedToName ?? "Chef"} is halfway: ${data.taskName ?? "Task"}`,
      `${data.completedQty}${data.unit ?? ""} done of ${data.totalQty}${data.unit ?? ""}`,
      "LOW"
    );
  }, [canSeePrepNotif, playSound, showPrepToast]));

  useRealtimeEvent("prep:low_readiness_alert", useCallback((data: any) => {
    if (!canSeePrepNotif) return;
    playSound("HIGH", "low_readiness_alert");
    showPrepToast(
      `🚨 LOW PREP READINESS — ${data.readinessPct}% complete`,
      `${data.hoursToShift}hrs to shift — ${data.unassignedCount} tasks unassigned`,
      "HIGH"
    );
  }, [canSeePrepNotif, playSound, showPrepToast]));

  const invUnreadCount = alertCountData?.count || 0;

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const RoleIcon = roleIcons[user.role] ?? User;
  const badgeColor = roleBadgeColors[user.role] ?? "bg-slate-100 text-slate-800 border-slate-200";
  const roleLabel = roleLabels[user.role] ?? user.role.replace(/_/g, " ");

  return (
    <>
      <AnimatePresence>
        {celebrate && (
          <motion.div
            key="celebrate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
            data-testid="overlay-all-complete"
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.1, opacity: 0 }}
              className="bg-green-500 text-white rounded-2xl px-10 py-8 shadow-2xl flex flex-col items-center gap-3"
            >
              <PartyPopper className="h-12 w-12" />
              <p className="text-2xl font-bold">All Prep Complete!</p>
              <p className="text-sm opacity-80">Outstanding work today 🎉</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PrepNotificationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        notifications={prepNotifications}
        unreadCount={prepUnread}
        onMarkRead={markPrepRead}
        onMarkAllRead={markAllPrepRead}
      />

      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-10" data-testid="header" role="banner">
        <div className="flex items-center gap-3">
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badgeColor}`}
            data-testid="badge-role"
          >
            <RoleIcon className="h-3.5 w-3.5" />
            {roleLabel}
          </motion.span>
        </div>

        <div className="flex items-center gap-2">
          <SyncStatusIndicator />
          <AlertNotificationBell />
          {onOpenSupport && (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-950"
                onClick={onOpenSupport}
                title="Need help? Contact Support"
                aria-label="Contact Support"
                data-testid="button-contact-support-header"
              >
                <Headset className="h-[18px] w-[18px]" aria-hidden="true" />
              </Button>
            </motion.div>
          )}

          {canSeePrepNotif && (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={() => setDrawerOpen(true)}
                title="Kitchen prep notifications"
                aria-label={prepUnread > 0 ? `Kitchen prep notifications — ${prepUnread} unread` : "Kitchen prep notifications"}
                data-testid="button-prep-notifications"
              >
                <ChefHat className="h-4 w-4" aria-hidden="true" />
                {prepUnread > 0 && (
                  <span
                    className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-card"
                    data-testid="badge-prep-unread"
                    aria-hidden="true"
                  >
                    {prepUnread > 9 ? "9+" : prepUnread}
                  </span>
                )}
              </Button>
            </motion.div>
          )}

          {canSeeInventoryAlerts && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
                    data-testid="button-notifications"
                    aria-label={invUnreadCount > 0 ? `Low stock alerts — ${invUnreadCount} unread` : "Low stock alerts"}
                  >
                    <Bell className="h-4 w-4" aria-hidden="true" />
                    {invUnreadCount > 0 && (
                      <span
                        className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-card"
                        data-testid="badge-inventory-alerts"
                        aria-hidden="true"
                      >
                        {invUnreadCount > 9 ? "9+" : invUnreadCount}
                      </span>
                    )}
                  </Button>
                </motion.div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PackageOpen className="h-4 w-4 text-amber-600" />
                    <span>Low Stock Alerts</span>
                    {invUnreadCount > 0 && (
                      <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{invUnreadCount}</span>
                    )}
                  </div>
                  {invUnreadCount > 0 && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                      onClick={() => acknowledgeAll.mutate()}
                      data-testid="button-acknowledge-all-alerts"
                    >
                      Clear all
                    </button>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {alerts.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No unacknowledged low-stock alerts
                  </div>
                ) : (
                  alerts.slice(0, 8).map(alert => {
                    const itemId = (alert.metadata?.itemId as string | undefined) || "";
                    const href = itemId
                      ? `/inventory?tab=movements&ingredientId=${encodeURIComponent(itemId)}`
                      : "/inventory?tab=movements";
                    return (
                      <DropdownMenuItem
                        key={alert.id}
                        className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
                        onClick={() => {
                          acknowledgeOne.mutate(alert.id);
                          navigate(href);
                        }}
                        data-testid={`alert-item-${alert.id.slice(-4)}`}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <PackageOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="font-medium text-sm truncate">{alert.title}</span>
                        </div>
                        {alert.description && (
                          <span className="text-xs text-muted-foreground pl-5 line-clamp-2">{alert.description}</span>
                        )}
                        <span className="text-[10px] text-primary pl-5">View in Stock Movements →</span>
                      </DropdownMenuItem>
                    );
                  })
                )}
                {alerts.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate("/inventory?tab=movements")} className="text-xs text-center justify-center text-primary">
                      View all in Stock Movements →
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2" data-testid="button-user-menu">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium hidden sm:inline" data-testid="text-user-name">{user.name}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{user.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">@{user.username}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid="menu-item-profile">
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} data-testid="menu-item-logout">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
