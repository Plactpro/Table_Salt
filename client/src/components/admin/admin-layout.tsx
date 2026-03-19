import { ReactNode } from "react";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@/lib/auth";
import { useImpersonation } from "@/lib/impersonation-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Building2,
  Users,
  ScrollText,
  ShieldCheck,
  LogOut,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/admin" },
  { id: "tenants", label: "Tenants", icon: Building2, path: "/admin/tenants" },
  { id: "users", label: "Users", icon: Users, path: "/admin/users" },
  { id: "audit", label: "Audit Log", icon: ScrollText, path: "/admin/audit" },
  { id: "admins", label: "Admins", icon: ShieldCheck, path: "/admin/admins" },
];

function NavLink({ item }: { item: NavItem }) {
  const [location, navigate] = useLocation();
  const isActive =
    item.path === "/admin"
      ? location === "/admin"
      : location.startsWith(item.path);
  const Icon = item.icon;

  return (
    <button
      data-testid={`nav-admin-${item.id}`}
      onClick={() => navigate(item.path)}
      className={cn(
        "flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-white/10 text-white"
          : "text-slate-400 hover:text-white hover:bg-white/5"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
      {isActive && (
        <div className="ml-auto w-1 h-4 rounded-full bg-emerald-400" />
      )}
    </button>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { isImpersonating, originalAdmin, endImpersonation } = useImpersonation();
  const [, navigate] = useLocation();

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
              Impersonating as tenant user
              {originalAdmin ? ` (admin: ${originalAdmin.userName})` : ""}
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

      <div className="flex flex-1 min-h-0">
        <aside
          className="w-56 shrink-0 flex flex-col bg-slate-900 h-screen sticky top-0"
          data-testid="admin-sidebar"
        >
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
              <NavLink key={item.id} item={item} />
            ))}
          </nav>

          <div className="px-3 py-4 border-t border-white/10 space-y-2">
            <div className="px-3 py-2">
              <p className="text-xs text-slate-400 truncate" data-testid="admin-user-name">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.username}</p>
            </div>
            <button
              data-testid="button-admin-logout"
              onClick={handleLogout}
              className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-auto bg-slate-50" data-testid="admin-main">
          {children}
        </main>
      </div>
    </div>
  );
}
