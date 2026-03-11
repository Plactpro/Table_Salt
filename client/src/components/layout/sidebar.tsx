import { useLocation } from "wouter";
import { useAuth, Role } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
      <div className="relative flex items-center gap-3 px-6 py-5 border-b border-sidebar-border overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-sidebar-primary/10 via-sidebar-primary/5 to-transparent pointer-events-none" />
        <motion.div
          whileHover={{ rotate: 15, scale: 1.1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
          className="relative"
        >
          <div className="p-1.5 rounded-lg bg-sidebar-primary/10">
            <UtensilsCrossed className="h-5 w-5 text-sidebar-primary" />
          </div>
        </motion.div>
        <span className="relative text-lg font-heading font-bold text-sidebar-foreground" data-testid="text-sidebar-brand">
          ServeOS
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <TooltipProvider delayDuration={300}>
          <ul className="space-y-1">
            {filteredItems.map((item, index) => {
              const isActive = location === item.path;
              const Icon = item.icon;
              return (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.3 }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                        onClick={() => navigate(item.path)}
                        className={cn(
                          "group relative flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          isActive
                            ? "text-sidebar-primary"
                            : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                        )}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="sidebar-active-bg"
                            className="absolute inset-0 rounded-lg bg-sidebar-primary/10"
                            transition={{ type: "spring", stiffness: 350, damping: 30 }}
                          />
                        )}
                        {isActive && (
                          <motion.div
                            layoutId="sidebar-active-indicator"
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-primary"
                            transition={{ type: "spring", stiffness: 350, damping: 30 }}
                          />
                        )}
                        <div className="absolute inset-0 rounded-lg bg-sidebar-accent opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ zIndex: 0 }} />
                        <motion.div
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 400, damping: 17 }}
                          className="relative z-10"
                        >
                          <Icon className={cn(
                            "h-4 w-4 transition-colors duration-200",
                            isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
                          )} />
                        </motion.div>
                        <span className="relative z-10">{item.name}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="md:hidden">
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                </motion.li>
              );
            })}
          </ul>
        </TooltipProvider>
      </nav>
    </aside>
  );
}
