import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth, Role } from "@/lib/auth";
import { useSubscription } from "@/lib/auth";
import { useRealtimeEvent } from "@/hooks/use-realtime";
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
  Lock,
  Store,
  CreditCard,
  Puzzle,
  Truck,
  Heart,
  ClipboardCheck,
  ClipboardList,
  ShieldCheck,
  Zap,
  Layers,
  CalendarDays,
  Bell,
  ScanQrCode,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { FeatureKey, SubscriptionTier, getMinimumTierForFeature, tierPricing, businessConfig } from "@/lib/subscription";

interface NavItem {
  id: string;
  name: string;
  icon: LucideIcon;
  path: string;
  roles: Role[];
  featureKey?: FeatureKey;
}

const navItems: NavItem[] = [
  { id: "m-1", name: "Dashboard", icon: LayoutDashboard, path: "/", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "accountant", "auditor"] },
  { id: "m-2", name: "My Shift", icon: Clock, path: "/", roles: ["waiter", "cashier"] },
  { id: "m-3", name: "KDS", icon: ChefHat, path: "/", roles: ["kitchen"] },
  { id: "m-4", name: "POS", icon: MonitorSmartphone, path: "/pos", roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor", "cashier", "waiter"], featureKey: "pos" },
  { id: "m-5", name: "Online Orders", icon: Receipt, path: "/orders", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor", "cashier", "waiter", "kitchen"], featureKey: "orders" },
  { id: "m-6", name: "Tables", icon: Utensils, path: "/tables", roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor", "cashier", "waiter"], featureKey: "tables" },
  { id: "m-33", name: "Live Requests", icon: Bell, path: "/live-requests", roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor", "cashier", "waiter"], featureKey: "tables" },
  { id: "m-7", name: "Menu", icon: MenuSquare, path: "/menu", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor"], featureKey: "menu" },
  { id: "m-12", name: "Promotions", icon: Zap, path: "/promotions", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "offers" },
  { id: "m-15", name: "Delivery & Online", icon: Truck, path: "/delivery", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "delivery_management" },
  { id: "m-30", name: "Kiosk", icon: MonitorSmartphone, path: "/kiosk-management", roles: ["owner", "manager"] },
  { id: "m-13", name: "CRM", icon: Heart, path: "/crm", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "crm" },
  { id: "m-31", name: "Omnichannel", icon: Layers, path: "/omnichannel", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "reports" },
  { id: "m-32", name: "Events & Special Days", icon: CalendarDays, path: "/events", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor", "cashier", "waiter", "kitchen", "accountant", "auditor"], featureKey: "staff" },
  { id: "m-8", name: "Inventory", icon: Package2, path: "/inventory", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor"], featureKey: "inventory" },
  { id: "m-19", name: "Cleaning", icon: ClipboardCheck, path: "/cleaning", roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor"], featureKey: "cleaning" },
  { id: "m-9", name: "Staff & Workforce", icon: Users, path: "/staff", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "staff" },
  { id: "m-10", name: "Reports & Analytics", icon: BarChart3, path: "/reports", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "accountant", "auditor"], featureKey: "reports" },
  { id: "m-20", name: "Internal Audits", icon: ShieldCheck, path: "/audits", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "auditor"], featureKey: "internal_audits" },
  { id: "m-11", name: "Locations", icon: Store, path: "/outlets", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "outlets" },
  { id: "m-16", name: "Integrations", icon: Puzzle, path: "/integrations", roles: ["owner", "franchise_owner", "hq_admin", "manager"], featureKey: "integrations" },
  { id: "m-17", name: "Billing", icon: CreditCard, path: "/billing", roles: ["owner", "franchise_owner", "hq_admin"], featureKey: "billing" },
  { id: "m-18", name: "Settings", icon: Settings, path: "/settings", roles: ["owner", "franchise_owner", "hq_admin"], featureKey: "settings" },
  { id: "m-34", name: "QR Settings", icon: ScanQrCode, path: "/qr-settings", roles: ["manager", "outlet_manager"], featureKey: "tables" },
  { id: "m-35", name: "Kitchen Board", icon: LayoutGrid, path: "/kitchen-board", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "orders" },
  { id: "m-36", name: "Kitchen Settings", icon: ChefHat, path: "/kitchen-settings", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "orders" },
  { id: "m-37", name: "Stock Capacity", icon: ClipboardList, path: "/stock-reports", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "inventory" },
];

function SandDecoration() {
  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none overflow-hidden" style={{ height: "75%" }}>
      <svg viewBox="0 0 260 400" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="none">
        <path d="M0 60 Q30 40 70 55 Q110 70 150 45 Q190 20 230 40 Q250 50 260 45 L260 400 L0 400Z" fill="hsl(var(--sidebar-sand))" fillOpacity="0.2" />
        <path d="M0 120 Q40 100 90 115 Q140 130 180 105 Q220 80 250 100 Q256 104 260 100 L260 400 L0 400Z" fill="hsl(var(--sidebar-sand))" fillOpacity="0.35" />
        <path d="M0 190 Q50 170 100 185 Q150 200 200 175 Q235 160 260 172 L260 400 L0 400Z" fill="hsl(var(--sidebar-sand))" fillOpacity="0.5" />
        <path d="M0 260 Q60 245 110 255 Q160 268 210 248 Q240 238 260 245 L260 400 L0 400Z" fill="hsl(var(--sidebar-sand))" fillOpacity="0.65" />
        <path d="M0 320 Q45 308 100 318 Q155 328 200 312 Q230 302 260 310 L260 400 L0 400Z" fill="hsl(var(--sidebar-sand))" fillOpacity="0.8" />
        <ellipse cx="50" cy="360" rx="7" ry="4" fill="hsl(var(--sidebar-sand))" fillOpacity="0.9" />
        <ellipse cx="190" cy="345" rx="5.5" ry="3.5" fill="hsl(var(--sidebar-sand))" fillOpacity="0.85" />
        <circle cx="130" cy="370" r="3.5" fill="hsl(var(--sidebar-sand))" fillOpacity="0.75" />
        <ellipse cx="220" cy="380" rx="4.5" ry="3" fill="hsl(var(--sidebar-sand))" fillOpacity="0.7" />
        <circle cx="80" cy="385" r="2.5" fill="hsl(var(--sidebar-sand))" fillOpacity="0.65" />
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

function BusinessBadges({ badges }: { badges: string[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="relative z-10 px-4 pb-4 pt-2" data-testid="sidebar-business-badges">
      <div className="flex flex-wrap gap-1.5">
        {badges.map((badge, i) => (
          <span
            key={i}
            data-testid={`badge-business-${i}`}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide"
            style={{
              background: "linear-gradient(135deg, rgba(0,128,128,0.25), rgba(0,128,128,0.15))",
              color: "hsl(185, 45%, 12%)",
              border: "1px solid rgba(0,128,128,0.2)",
              backdropFilter: "blur(4px)",
            }}
          >
            {badge}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
  const { tier, badges, hasFeatureAccess, businessType } = useSubscription();
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();

  const role = user?.role ?? "owner";
  const btConfig = businessConfig[businessType];
  const filteredItems = navItems.filter((item) => {
    if (!item.roles.includes(role)) return false;
    if (btConfig?.excludedFeatureKeys && item.featureKey && btConfig.excludedFeatureKeys.includes(item.featureKey)) return false;
    if (btConfig?.excludedPaths && btConfig.excludedPaths.includes(item.path)) return false;
    return true;
  });

  const isSecurityRole = ["owner", "hq_admin", "franchise_owner"].includes(role);
  const canSeeLiveRequests = ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor", "cashier", "waiter"].includes(role);

  const { data: alertCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/security-alerts/unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/security-alerts/unread-count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: isSecurityRole,
    refetchInterval: 30000,
  });
  const unreadAlerts = alertCountData?.count || 0;

  const { data: pendingRequestData } = useQuery<{ count: number }>({
    queryKey: ["/api/table-requests/pending-count"],
    queryFn: async () => {
      const res = await fetch("/api/table-requests/pending-count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: canSeeLiveRequests,
    refetchInterval: 30000,
  });
  const pendingRequests = pendingRequestData?.count || 0;

  const invalidatePendingCount = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/table-requests/pending-count"] });
  }, [queryClient]);

  const invalidateSecurityCount = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/security-alerts/unread-count"] });
  }, [queryClient]);

  useRealtimeEvent("table-request:new", invalidatePendingCount);
  useRealtimeEvent("table-request:updated", invalidatePendingCount);
  useRealtimeEvent("table-request:escalated", invalidatePendingCount);
  useRealtimeEvent("low_stock_alert", invalidateSecurityCount);
  useRealtimeEvent("security_alert", invalidateSecurityCount);

  return (
    <aside
      className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 overflow-hidden z-30"
      style={{
        background: `linear-gradient(180deg, 
          hsl(var(--sidebar-water-start)) 0%, 
          hsl(var(--sidebar-water-mid)) 30%, 
          hsl(var(--sidebar-sand) / 0.6) 65%, 
          hsl(var(--sidebar-sand) / 0.85) 100%)`,
      }}
      data-testid="sidebar"
    >
      <WaterShimmer />
      <SandDecoration />

      <div className="relative flex items-center justify-center px-6 py-5 overflow-hidden" style={{ borderBottom: "1px solid rgba(255,255,255,0.22)" }}>
        <span className="font-heading text-white text-[32px] font-semibold text-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.25)]" data-testid="logo-table-salt">
          Table Salt
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 relative z-10">
        <TooltipProvider delayDuration={300}>
          <ul className="space-y-1">
            {filteredItems.map((item, index) => {
              const isActive = location === item.path;
              const Icon = item.icon;
              const isLocked = item.featureKey ? !hasFeatureAccess(item.featureKey) : false;
              const requiredTier = isLocked && item.featureKey ? getMinimumTierForFeature(item.featureKey) : null;
              const upgradeTierLabel = requiredTier ? tierPricing[requiredTier]?.label : null;

              return (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.3 }}
                  style={{ willChange: "opacity, transform" }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                        onClick={() => !isLocked && navigate(item.path)}
                        className={cn(
                          "group relative flex items-center gap-3 w-full rounded-xl px-3 py-3 text-base font-medium transition-all duration-200",
                          isLocked
                            ? "text-[hsl(185,30%,25%)] opacity-50 cursor-not-allowed"
                            : isActive
                              ? "text-[hsl(185,50%,10%)] font-semibold"
                              : "text-[hsl(185,40%,15%)] hover:text-[hsl(185,50%,8%)]"
                        )}
                      >
                        {isActive && !isLocked && (
                          <motion.div
                            layoutId="sidebar-active-bg"
                            className="absolute inset-0 rounded-xl"
                            style={{
                              background: "linear-gradient(135deg, rgba(255,255,255,0.82), rgba(255,255,255,0.65))",
                              backdropFilter: "blur(6px)",
                              border: "1px solid rgba(255,255,255,0.75)",
                              boxShadow: "0 2px 12px rgba(0,0,0,0.14), inset 0 1px 2px rgba(255,255,255,0.6)",
                            }}
                            transition={{ type: "spring", stiffness: 350, damping: 30 }}
                          />
                        )}
                        {isActive && !isLocked && (
                          <motion.div
                            layoutId="sidebar-active-indicator"
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                            style={{ background: "hsl(176, 60%, 28%)", boxShadow: "0 0 6px rgba(0,128,128,0.3)" }}
                            transition={{ type: "spring", stiffness: 350, damping: 30 }}
                          />
                        )}
                        {!isActive && !isLocked && (
                          <div
                            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                            style={{
                              background: "rgba(255,255,255,0.40)",
                              backdropFilter: "blur(2px)",
                              border: "1px solid rgba(255,255,255,0.35)",
                            }}
                          />
                        )}
                        <motion.div
                          whileHover={isLocked ? {} : { scale: 1.15 }}
                          whileTap={isLocked ? {} : { scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 400, damping: 17 }}
                          className="relative z-10"
                        >
                          <Icon className={cn(
                            "h-5 w-5 transition-colors duration-200",
                            isLocked
                              ? "text-[hsl(185,20%,40%)]"
                              : isActive
                                ? "text-[hsl(176,65%,25%)]"
                                : "text-[hsl(185,35%,22%)] group-hover:text-[hsl(176,60%,18%)]"
                          )} />
                        </motion.div>
                        <span className="relative z-10 flex-1 text-left">{item.name}</span>
                        {item.id === "m-33" && pendingRequests > 0 && (
                          <span
                            className="relative z-10 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white"
                            style={{ background: "hsl(0, 72%, 51%)" }}
                            data-testid="badge-live-requests"
                          >
                            {pendingRequests > 99 ? "99+" : pendingRequests}
                          </span>
                        )}
                        {item.id === "m-18" && unreadAlerts > 0 && (
                          <span
                            className="relative z-10 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white"
                            style={{ background: "hsl(0, 72%, 51%)" }}
                            data-testid="badge-security-alerts"
                          >
                            {unreadAlerts > 99 ? "99+" : unreadAlerts}
                          </span>
                        )}
                        {isLocked && (
                          <Lock
                            className="relative z-10 h-3.5 w-3.5 text-[hsl(185,20%,40%)]"
                            data-testid={`lock-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                          />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {isLocked && upgradeTierLabel
                        ? `Upgrade to ${upgradeTierLabel} to access`
                        : item.name}
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
