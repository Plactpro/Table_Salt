import { useLocation } from "wouter";
import { useAuth, Role } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Clock,
  ChefHat,
  MonitorSmartphone,
  Receipt,
  Utensils,
  MenuSquare,
  Package2,
  Users,
  BarChart3,
  Settings,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  id: string;
  name: string;
  icon: LucideIcon;
  path: string;
  roles: Role[];
}

const navItems: NavItem[] = [
  { id: "m-1", name: "Dashboard", icon: LayoutDashboard, path: "/", roles: ["owner", "manager", "accountant"] },
  { id: "m-2", name: "My Shift", icon: Clock, path: "/", roles: ["waiter"] },
  { id: "m-3", name: "KDS", icon: ChefHat, path: "/", roles: ["kitchen"] },
  { id: "m-4", name: "POS", icon: MonitorSmartphone, path: "/pos", roles: ["owner", "manager", "waiter"] },
  { id: "m-5", name: "Orders", icon: Receipt, path: "/orders", roles: ["owner", "manager", "waiter", "kitchen"] },
  { id: "m-6", name: "Tables", icon: Utensils, path: "/tables", roles: ["owner", "manager", "waiter"] },
  { id: "m-7", name: "Menu", icon: MenuSquare, path: "/menu", roles: ["owner", "manager"] },
  { id: "m-8", name: "Inventory", icon: Package2, path: "/inventory", roles: ["owner", "manager"] },
  { id: "m-9", name: "Staff", icon: Users, path: "/staff", roles: ["owner", "manager"] },
  { id: "m-10", name: "Reports", icon: BarChart3, path: "/reports", roles: ["owner", "manager", "accountant"] },
  { id: "m-11", name: "Settings", icon: Settings, path: "/settings", roles: ["owner"] },
];

export default function Sidebar() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();

  const role = user?.role ?? "owner";
  const filteredItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-sidebar-border bg-sidebar h-screen sticky top-0" data-testid="sidebar">
      <div className="flex items-center gap-2 px-6 py-5 border-b border-sidebar-border">
        <UtensilsCrossed className="h-6 w-6 text-sidebar-primary" />
        <span className="text-lg font-heading font-bold text-sidebar-foreground" data-testid="text-sidebar-brand">
          ServeOS
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {filteredItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.name}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
