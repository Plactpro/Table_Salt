import { ReactNode, useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useImpersonation } from "@/lib/impersonation-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Building2,
  Users,
  ScrollText,
  ShieldCheck,
  LogOut,
  Settings,
  Menu,
  BarChart2,
  Shield,
  MessageCircle,
  Megaphone,
  ShieldAlert,
  Lock,
  Pencil,
  X,
  AlertTriangle,
  Activity,
  Building,
  ClipboardList,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import UnlockEditDialog from "@/components/admin/unlock-edit-dialog";
import { useToast } from "@/hooks/use-toast";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/admin" },
  { id: "analytics", label: "Analytics", icon: BarChart2, path: "/admin/analytics" },
  { id: "tenants", label: "Tenants", icon: Building2, path: "/admin/tenants" },
  { id: "users", label: "Users", icon: Users, path: "/admin/users" },
  { id: "support", label: "Support", icon: MessageCircle, path: "/admin/support" },
  { id: "audit", label: "Audit Log", icon: ScrollText, path: "/admin/audit" },
  { id: "security", label: "Security", icon: Shield, path: "/admin/security" },
  { id: "breach-incidents", label: "Breach Incidents", icon: AlertTriangle, path: "/admin/breach-incidents" },
  { id: "vendor-risks", label: "Vendor Risks", icon: Building, path: "/admin/vendor-risks" },
  { id: "incident-playbook", label: "Incident Playbook", icon: ClipboardList, path: "/admin/incident-playbook" },
  { id: "system-health", label: "System Health", icon: Activity, path: "/admin/system-health" },
  { id: "admins", label: "Admins", icon: ShieldCheck, path: "/admin/admins" },
  { id: "settings", label: "Settings", icon: Settings, path: "/admin/settings" },
  { id: "ad-approvals", label: "Ad Approvals", icon: Megaphone, path: "/admin/ad-approvals" },
];

function NavLink({ item, unreadCount, onNavigate }: { item: NavItem; unreadCount?: number; onNavigate?: () => void }) {
  const [location, navigate] = useLocation();
  const isActive =
    item.path === "/admin"
      ? location === "/admin"
      : location.startsWith(item.path);
  const Icon = item.icon;

  return (
    <button
      data-testid={`nav-admin-${item.id}`}
      onClick={() => {
        navigate(item.path);
        onNavigate?.();
      }}
      className={cn(
        "flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-white/10 text-white"
          : "text-slate-400 hover:text-white hover:bg-white/5"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
      {unreadCount && unreadCount > 0 ? (
        <span
          className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white"
          data-testid={item.id === "support" ? "badge-admin-support-count" : "badge-admin-security-alerts"}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : isActive ? (
        <div className="ml-auto w-1 h-4 rounded-full bg-emerald-400" />
      ) : null}
    </button>
  );
}

function SidebarContent({ onNavigate, user, onLogout }: {
  onNavigate?: () => void;
  user: { name?: string; username?: string } | null;
  onLogout: () => void;
}) {
  const { data: alertCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/security-alerts-count"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/security-alerts?acknowledged=false&limit=500");
      const rows = await r.json();
      return { count: Array.isArray(rows) ? rows.length : 0 };
    },
    refetchInterval: 60000,
  });
  const unreadAlerts = alertCountData?.count ?? 0;

  const { data: supportStats } = useQuery<{ open: number; awaiting_support: number }>({
    queryKey: ["/api/admin/support/stats"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/support/stats");
      return r.json();
    },
    refetchInterval: 60000,
  });
  const openTickets = (supportStats?.open ?? 0) + (supportStats?.awaiting_support ?? 0);

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <div className="px-4 py-5 border-b border-white/10">
        <p className="font-heading text-white text-xl font-semibold leading-tight" data-testid="admin-logo">
          Table Salt
        </p>
        <p className="text-slate-400 text-xs mt-0.5 font-medium tracking-wide uppercase" data-testid="admin-platform-label">
          Platform Admin
        </p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            item={item}
            onNavigate={onNavigate}
            unreadCount={item.id === "security" ? unreadAlerts : item.id === "support" ? openTickets : undefined}
          />
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-white/10 space-y-2">
        <div className="px-3 py-2">
          <p className="text-xs text-slate-400 truncate" data-testid="admin-user-name">{user?.name}</p>
          <p className="text-xs text-slate-500 truncate">{user?.username}</p>
        </div>
        <button
          data-testid="button-admin-logout"
          onClick={onLogout}
          className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

function AdminImpersonationBanner() {
  const {
    isImpersonating,
    tenantName,
    originalAdmin,
    accessMode,
    reason,
    ticketId,
    startedAt,
    timeoutMinutes,
    endImpersonation,
    returnToReadOnly,
  } = useImpersonation();
  const { toast } = useToast();
  const [timeLeft, setTimeLeft] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);

  useEffect(() => {
    if (!startedAt || !timeoutMinutes) return;
    const expiresAt = startedAt + timeoutMinutes * 60 * 1000;
    const tick = () => {
      const diff = expiresAt - Date.now();
      if (diff <= 0) { setTimeLeft("00:00"); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, timeoutMinutes]);

  const unlockRef = useRef<(() => void) | null>(null);
  unlockRef.current = () => setShowUnlock(true);
  useEffect(() => {
    const handler = () => {
      toast({
        title: "Read-Only Session",
        description: "You're in a read-only support session.",
        action: (
          <ToastAction altText="Unlock Edit Mode" onClick={() => unlockRef.current?.()}>
            Unlock Edit
          </ToastAction>
        ),
      });
    };
    window.addEventListener("read-only-session-blocked", handler);
    return () => window.removeEventListener("read-only-session-blocked", handler);
  }, [toast]);

  if (!isImpersonating) return null;

  const isEdit = accessMode === "EDIT";
  const bannerBg = isEdit ? "bg-orange-600" : "bg-amber-500";
  const bannerText = isEdit ? "text-white" : "text-amber-950";

  return (
    <>
      <div className={`w-full ${bannerBg} ${bannerText} px-4 py-2 z-50 shrink-0`} data-testid="impersonation-banner">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{isEdit ? "SUPPORT SESSION — EDIT ENABLED" : "SUPPORT SESSION"}</span>
            {tenantName && <><span className="opacity-60">·</span><span>Tenant: <strong>{tenantName}</strong></span></>}
            {originalAdmin && <><span className="opacity-60">·</span><span>Admin: {originalAdmin.userName}</span></>}
            {!isEdit && <><span className="opacity-60">·</span><span className="flex items-center gap-1"><Lock className="h-3 w-3" /> READ ONLY</span></>}
            {timeLeft && !isEdit && <><span className="opacity-60">·</span><span>⏱ {timeLeft} left</span></>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {reason && <span className="opacity-75 hidden sm:inline">Reason: {reason}</span>}
            {ticketId && <span className="opacity-75 hidden sm:inline">· {ticketId}</span>}
            {!isEdit && (
              <Button size="sm" variant="outline" className="border-current text-current bg-transparent hover:bg-black/10 h-7 text-xs font-semibold" onClick={() => setShowUnlock(true)} data-testid="button-unlock-edit-admin">
                <Pencil className="h-3 w-3 mr-1" /> Unlock Edit
              </Button>
            )}
            {isEdit && (
              <Button size="sm" variant="outline" className="border-current text-current bg-transparent hover:bg-black/10 h-7 text-xs font-semibold" onClick={returnToReadOnly} data-testid="button-return-readonly-admin">
                <Lock className="h-3 w-3 mr-1" /> Return to Read Only
              </Button>
            )}
            <Button size="sm" variant="outline" className="border-current text-current bg-transparent hover:bg-black/10 h-7 text-xs font-semibold" onClick={endImpersonation} data-testid="button-end-impersonation">
              <X className="h-3 w-3 mr-1" /> End Session
            </Button>
          </div>
        </div>
      </div>
      <UnlockEditDialog open={showUnlock} onOpenChange={setShowUnlock} />
    </>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col" data-testid="admin-layout">
      <AdminImpersonationBanner />

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center gap-3 bg-slate-900 px-4 py-3 shrink-0">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-white hover:bg-white/10 h-9 w-9"
              data-testid="button-admin-mobile-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-56 bg-slate-900 border-slate-700">
            <SidebarContent
              onNavigate={() => setMobileOpen(false)}
              user={user}
              onLogout={handleLogout}
            />
          </SheetContent>
        </Sheet>
        <span className="text-white font-semibold text-sm">Table Salt Admin</span>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <aside
          className="hidden md:flex w-56 shrink-0 flex-col bg-slate-900 h-screen sticky top-0"
          data-testid="admin-sidebar"
        >
          <SidebarContent user={user} onLogout={handleLogout} />
        </aside>

        <main className="flex-1 min-w-0 overflow-auto bg-slate-50" data-testid="admin-main">
          {children}
        </main>
      </div>
    </div>
  );
}
