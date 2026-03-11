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

function SandDecoration() {
  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none overflow-hidden" style={{ height: "120px" }}>
      <svg viewBox="0 0 260 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="none">
        <path d="M0 40 Q30 25 60 35 Q90 45 130 30 Q170 15 200 28 Q230 40 260 32 L260 120 L0 120Z" fill="hsl(var(--sidebar-sand))" fillOpacity="0.35" />
        <path d="M0 60 Q40 48 80 55 Q120 62 160 50 Q200 38 240 48 Q250 52 260 50 L260 120 L0 120Z" fill="hsl(var(--sidebar-sand))" fillOpacity="0.55" />
        <path d="M0 80 Q50 70 100 76 Q150 82 200 72 Q230 68 260 74 L260 120 L0 120Z" fill="hsl(var(--sidebar-sand))" fillOpacity="0.75" />
        <ellipse cx="45" cy="100" rx="6" ry="3.5" fill="hsl(var(--sidebar-sand))" fillOpacity="0.9" />
        <ellipse cx="180" cy="95" rx="5" ry="3" fill="hsl(var(--sidebar-sand))" fillOpacity="0.85" />
        <circle cx="120" cy="105" r="3" fill="hsl(var(--sidebar-sand))" fillOpacity="0.7" />
        <ellipse cx="210" cy="108" rx="4" ry="2.5" fill="hsl(var(--sidebar-sand))" fillOpacity="0.6" />
      </svg>
    </div>
  );
}

function WaterShimmer() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute top-[15%] left-[10%] w-[80%] h-[1px] rounded-full"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)" }}
        animate={{ x: [-20, 20, -20], opacity: [0.3, 0.7, 0.3] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[35%] left-[5%] w-[90%] h-[1px] rounded-full"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }}
        animate={{ x: [15, -15, 15], opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
      <motion.div
        className="absolute top-[55%] left-[15%] w-[70%] h-[1px] rounded-full"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)" }}
        animate={{ x: [-10, 10, -10], opacity: [0.15, 0.4, 0.15] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
    </div>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();

  const role = user?.role ?? "owner";
  const filteredItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside
      className="hidden md:flex flex-col w-64 h-screen sticky top-0 overflow-hidden"
      style={{
        background: `linear-gradient(180deg, 
          hsl(var(--sidebar-water-start)) 0%, 
          hsl(var(--sidebar-water-mid)) 50%, 
          hsl(var(--sidebar-water-mid)) 70%, 
          hsl(var(--sidebar-sand) / 0.3) 100%)`,
      }}
      data-testid="sidebar"
    >
      <WaterShimmer />
      <SandDecoration />

      <div className="relative flex items-center gap-3 px-6 py-5 overflow-hidden" style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
        <motion.div
          whileHover={{ rotate: 15, scale: 1.1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
          className="relative"
        >
          <div
            className="p-2 rounded-xl"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.08))",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.2)",
              boxShadow: "inset 0 1px 2px rgba(255,255,255,0.15), 0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            <UtensilsCrossed className="h-5 w-5 text-white" />
          </div>
        </motion.div>
        <span className="relative text-lg font-heading font-bold text-white drop-shadow-sm" data-testid="text-sidebar-brand">
          ServeOS
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 relative z-10">
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
                          "group relative flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          isActive
                            ? "text-white font-semibold"
                            : "text-white/75 hover:text-white"
                        )}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="sidebar-active-bg"
                            className="absolute inset-0 rounded-xl"
                            style={{
                              background: "linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08))",
                              backdropFilter: "blur(12px)",
                              border: "1px solid rgba(255,255,255,0.2)",
                              boxShadow: "0 2px 12px rgba(0,0,0,0.08), inset 0 1px 1px rgba(255,255,255,0.1)",
                            }}
                            transition={{ type: "spring", stiffness: 350, damping: 30 }}
                          />
                        )}
                        {isActive && (
                          <motion.div
                            layoutId="sidebar-active-indicator"
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-white"
                            style={{ boxShadow: "0 0 8px rgba(255,255,255,0.4)" }}
                            transition={{ type: "spring", stiffness: 350, damping: 30 }}
                          />
                        )}
                        {!isActive && (
                          <div
                            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                            style={{
                              background: "rgba(255,255,255,0.08)",
                            }}
                          />
                        )}
                        <motion.div
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 400, damping: 17 }}
                          className="relative z-10"
                        >
                          <Icon className={cn(
                            "h-4 w-4 transition-colors duration-200",
                            isActive ? "text-white" : "text-white/55 group-hover:text-white/85"
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
