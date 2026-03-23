import { ReactNode, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useImpersonation } from "@/lib/impersonation-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Building2,
  Users,
  ScrollText,
  ShieldCheck,
  LogOut,
  ArrowLeft,
  AlertTriangle,
  Settings,
  Menu,
  BarChart2,
  Shield,
  MessageCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

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
  { id: "admins", label: "Admins", icon: ShieldCheck, path: "/admin/admins" },
  { id: "settings", label: "Settings", icon: Settings, path: "/admin/settings" },
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

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { isImpersonating, originalAdmin, tenantName, endImpersonation } = useImpersonation();
  const [, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col" data-testid="admin-layout">
      {isImpersonating && (
        <div
          className="w-full bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between z-50 shrink-0"
          data-testid="impersonation-banner"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Impersonating: {tenantName ?? "Tenant"}
              {originalAdmin ? ` (as ${originalAdmin.userName})` : ""}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-700 text-amber-900 bg-amber-100 hover:bg-amber-200 h-7 text-xs font-semibold"
            onClick={endImpersonation}
            data-testid="button-end-impersonation"
          >
            <ArrowLeft className="h-3 w-3 mr-1" />
            Return to Admin
          </Button>
        </div>
      )}

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
