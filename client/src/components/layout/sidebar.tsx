import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, useEffect } from "react";
import { useAuth, Role } from "@/lib/auth";
import { useSubscription } from "@/lib/auth";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
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
  ShoppingBag,
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
  Phone,
  Workflow,
  Trash2,
  Printer,
  Tag,
  History,
  Banknote,
  DollarSign,
  Megaphone,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { FeatureKey, getMinimumTierForFeature, tierPricing, businessConfig } from "@/lib/subscription";

type GroupKey =
  | "none"
  | "operations"
  | "menu"
  | "customers"
  | "kitchen"
  | "team"
  | "delivery"
  | "reports"
  | "admin";

interface NavItem {
  id: string;
  name: string;
  icon: LucideIcon;
  path: string;
  roles: Role[];
  featureKey?: FeatureKey;
  group: GroupKey;
}

interface NavGroup {
  key: GroupKey;
  label: string;
  defaultOpen: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  { key: "none",       label: "",                defaultOpen: true  },
  { key: "operations", label: "Operations",      defaultOpen: true  },
  { key: "menu",       label: "Menu & Sales",    defaultOpen: true  },
  { key: "customers",  label: "Customers",       defaultOpen: true  },
  { key: "kitchen",    label: "Kitchen & Stock", defaultOpen: true  },
  { key: "team",       label: "Team",            defaultOpen: true  },
  { key: "delivery",   label: "Delivery",        defaultOpen: true  },
  { key: "reports",    label: "Reports",         defaultOpen: true  },
  { key: "admin",      label: "Admin",           defaultOpen: false },
];

const navItems: NavItem[] = [
  { id: "m-1",  name: "Dashboard",           icon: LayoutDashboard,  path: "/",                  group: "none",       roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "accountant", "auditor"] },
  { id: "m-2",  name: "My Shift",            icon: Clock,            path: "/",                  group: "none",       roles: ["waiter", "cashier"] },
  { id: "m-3",  name: "KDS",                 icon: ChefHat,          path: "/",                  group: "none",       roles: ["kitchen"] },
  { id: "m-41", name: "Log Wastage",         icon: Trash2,           path: "/wastage-log",       group: "none",       roles: ["kitchen"] },
  { id: "m-51", name: "Dashboard",           icon: LayoutDashboard,  path: "/",                  group: "none",       roles: ["delivery_agent"] },
  { id: "m-52", name: "My Deliveries",       icon: Truck,            path: "/",                  group: "none",       roles: ["delivery_agent"] },
  { id: "m-53", name: "Delivery History",    icon: History,          path: "/",                  group: "none",       roles: ["delivery_agent"] },

  { id: "m-4",  name: "POS",                 icon: MonitorSmartphone, path: "/pos",              group: "operations", roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor", "cashier", "waiter"], featureKey: "pos" },
  { id: "m-6",  name: "Tables",              icon: Utensils,         path: "/tables",            group: "operations", roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor", "cashier", "waiter"], featureKey: "tables" },
  { id: "m-33", name: "Live Requests",       icon: Bell,             path: "/live-requests",     group: "operations", roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor", "cashier", "waiter"], featureKey: "tables" },
  { id: "m-35", name: "Kitchen Board",       icon: LayoutGrid,       path: "/kitchen-board",     group: "operations", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "orders" },
  { id: "m-5",  name: "Online Orders",       icon: Receipt,          path: "/orders",            group: "operations", roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor", "cashier", "waiter", "kitchen"], featureKey: "orders" },
  { id: "m-38", name: "Phone Orders",        icon: Phone,            path: "/phone-order",       group: "operations", roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor", "cashier", "waiter"], featureKey: "orders" },
  { id: "m-47", name: "Cash Machine",        icon: Banknote,         path: "/cash",              group: "operations", roles: ["owner", "franchise_owner", "manager", "outlet_manager", "cashier"], featureKey: "pos" },
  { id: "m-49", name: "Parking",             icon: BarChart3,        path: "/parking",           group: "operations", roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor", "cashier", "waiter"] },

  { id: "m-7",  name: "Menu",                icon: MenuSquare,       path: "/menu",              group: "menu",       roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor"], featureKey: "menu" },
  { id: "m-40", name: "Menu Pricing",        icon: Tag,              path: "/menu-pricing",      group: "menu",       roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "menu" },
  { id: "m-12", name: "Promotions",          icon: Zap,              path: "/promotions",        group: "menu",       roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "offers" },
  { id: "m-32", name: "Events & Special Days", icon: CalendarDays,   path: "/events",            group: "menu",       roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor", "cashier", "waiter", "kitchen", "accountant", "auditor"], featureKey: "staff" },
  { id: "m-30", name: "Kiosk",               icon: MonitorSmartphone, path: "/kiosk-management", group: "menu",      roles: ["owner", "manager"] },
  { id: "m-50", name: "Advertisements",      icon: Megaphone,        path: "/advertisements",    group: "menu",       roles: ["owner", "franchise_owner", "hq_admin", "manager"], featureKey: "advertisement_management" as FeatureKey },

  { id: "m-13", name: "CRM",                 icon: Heart,            path: "/crm",               group: "customers",  roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "crm" },
  { id: "m-31", name: "Omnichannel",         icon: Layers,           path: "/omnichannel",       group: "customers",  roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "reports" },
  { id: "m-45", name: "Ticket History",      icon: History,          path: "/tickets",           group: "customers",  roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor", "cashier", "waiter", "accountant", "auditor"], featureKey: "orders" },

  { id: "m-36", name: "Kitchen Settings",    icon: ChefHat,          path: "/kitchen-settings",  group: "kitchen",    roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "orders" },
  { id: "m-8",  name: "Inventory",           icon: Package2,         path: "/inventory",         group: "kitchen",    roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor"], featureKey: "inventory" },
  { id: "m-37", name: "Stock Capacity",      icon: ClipboardList,    path: "/stock-reports",     group: "kitchen",    roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "inventory" },
  { id: "m-44", name: "Procurement",         icon: ShoppingBag,      path: "/procurement",       group: "kitchen",    roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "inventory" },
  { id: "m-43", name: "Wastage Control",     icon: Trash2,           path: "/wastage",           group: "kitchen",    roles: ["owner", "franchise_owner", "manager", "outlet_manager"] },
  { id: "m-19", name: "Cleaning",            icon: ClipboardCheck,   path: "/cleaning",          group: "kitchen",    roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor"], featureKey: "cleaning" },

  { id: "m-9",  name: "Staff & Workforce",   icon: Users,            path: "/staff",             group: "team",       roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "staff" },
  { id: "m-20", name: "Internal Audits",     icon: ShieldCheck,      path: "/audits",            group: "team",       roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "auditor"], featureKey: "internal_audits" },

  { id: "m-15", name: "Delivery & Online",   icon: Truck,            path: "/delivery",          group: "delivery",   roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "delivery_management" },
  { id: "m-39", name: "Service Hub",         icon: Workflow,         path: "/service-hub",       group: "delivery",   roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor"], featureKey: "orders" },

  { id: "m-10", name: "Reports & Analytics", icon: BarChart3,        path: "/reports",           group: "reports",    roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "accountant", "auditor"], featureKey: "reports" },
  { id: "m-48", name: "Tip Report",          icon: DollarSign,       path: "/tips/report",       group: "reports",    roles: ["manager", "owner"] },

  { id: "m-11", name: "Locations",           icon: Store,            path: "/outlets",           group: "admin",      roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "outlets" },
  { id: "m-16", name: "Integrations",        icon: Puzzle,           path: "/integrations",      group: "admin",      roles: ["owner", "franchise_owner", "hq_admin", "manager"], featureKey: "integrations" },
  { id: "m-17", name: "Billing",             icon: CreditCard,       path: "/billing",           group: "admin",      roles: ["owner", "franchise_owner", "hq_admin"], featureKey: "billing" },
  { id: "m-18", name: "Settings",            icon: Settings,         path: "/settings",          group: "admin",      roles: ["owner", "franchise_owner", "hq_admin"], featureKey: "settings" },
  { id: "m-34", name: "QR Settings",         icon: ScanQrCode,       path: "/qr-settings",       group: "admin",      roles: ["manager", "outlet_manager"], featureKey: "tables" },
  { id: "m-42", name: "Printer Setup",       icon: Printer,          path: "/settings/printers", group: "admin",      roles: ["owner", "franchise_owner", "manager", "outlet_manager"] },
  { id: "m-46", name: "Alert Sounds",        icon: Bell,             path: "/settings/alerts",   group: "admin",      roles: ["owner", "franchise_owner", "manager", "outlet_manager"] },
  { id: "m-51", name: "Recycle Bin",         icon: Trash2,           path: "/recycle-bin",        group: "admin",      roles: ["owner", "manager"] },
];

const STORAGE_KEY = "sidebar_group_state_v2";

function loadGroupState(defaults: Record<string, boolean>): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...defaults, ...JSON.parse(stored) };
  } catch {}
  return defaults;
}

function saveGroupState(state: Record<string, boolean>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function EmberGlow() {
  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none overflow-hidden" style={{ height: "55%" }}>
      <div style={{
        position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "180%", height: "100%",
        background: "radial-gradient(ellipse at 50% 100%, rgba(45,106,79,0.22) 0%, rgba(27,67,50,0.12) 40%, transparent 72%)",
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: "10%",
        width: "55%", height: "65%",
        background: "radial-gradient(ellipse at 40% 100%, rgba(45,106,79,0.10) 0%, transparent 60%)",
      }} />
      <div style={{
        position: "absolute", bottom: 0, right: "5%",
        width: "50%", height: "50%",
        background: "radial-gradient(ellipse at 60% 100%, rgba(45,106,79,0.07) 0%, transparent 55%)",
      }} />
      <motion.div
        style={{
          position: "absolute", bottom: "14%", left: "18%",
          width: "5px", height: "5px", borderRadius: "50%",
          background: "#81B89A",
          boxShadow: "0 0 8px 3px rgba(129,184,154,0.35)",
        }}
        animate={{ opacity: [0.6, 1, 0.6], y: [0, -3, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        style={{
          position: "absolute", bottom: "22%", left: "74%",
          width: "3px", height: "3px", borderRadius: "50%",
          background: "#81B89A",
          boxShadow: "0 0 6px 2px rgba(129,184,154,0.25)",
        }}
        animate={{ opacity: [0.4, 0.85, 0.4], y: [0, -4, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
      />
      <motion.div
        style={{
          position: "absolute", bottom: "8%", left: "52%",
          width: "2px", height: "2px", borderRadius: "50%",
          background: "#A8D5B5",
          boxShadow: "0 0 5px 2px rgba(168,213,181,0.20)",
        }}
        animate={{ opacity: [0.3, 0.7, 0.3], y: [0, -2, 0] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
      />
    </div>
  );
}

function SlateShimmer() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 48px, rgba(255,255,255,0.012) 48px, rgba(255,255,255,0.012) 49px)",
      }} />
      <motion.div
        style={{
          position: "absolute", top: 0, left: "-100%",
          width: "60%", height: "100%",
          background: "linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.028) 50%, transparent 100%)",
        }}
        animate={{ left: ["-60%", "120%"] }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear", repeatDelay: 6 }}
      />
    </div>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
  const { tier, badges, hasFeatureAccess, businessType } = useSubscription();
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();

  const role = user?.role ?? "owner";

  const defaultGroupState = Object.fromEntries(
    NAV_GROUPS.map((g) => [g.key, g.defaultOpen])
  );
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(() =>
    loadGroupState(defaultGroupState)
  );

  const toggleGroup = useCallback((key: string) => {
    setGroupOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveGroupState(next);
      return next;
    });
  }, []);

  const { data: outletsForSidebar = [] } = useQuery<any[]>({
    queryKey: ["/api/outlets"],
    staleTime: 120000,
    enabled: !!user && !user.outletId,
  });
  const outletIdForParking = user?.outletId || outletsForSidebar[0]?.id;
  const { data: parkingConfigData } = useQuery<{ valetEnabled?: boolean; parkingEnabled?: boolean }>({
    queryKey: ["/api/parking/config/sidebar", outletIdForParking],
    queryFn: async () => {
      if (!outletIdForParking) return {};
      const res = await fetch(`/api/parking/config/${outletIdForParking}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 120000,
    enabled: !!user && !!outletIdForParking,
  });
  const parkingEnabled = outletIdForParking
    ? (parkingConfigData?.valetEnabled ?? parkingConfigData?.parkingEnabled ?? false)
    : false;

  const btConfig = businessConfig[businessType];
  const filteredItems = navItems.filter((item) => {
    if (!item.roles.includes(role)) return false;
    if (btConfig?.excludedFeatureKeys && item.featureKey && btConfig.excludedFeatureKeys.includes(item.featureKey)) return false;
    if (btConfig?.excludedPaths && btConfig.excludedPaths.includes(item.path)) return false;
    if (item.id === "m-49" && !parkingEnabled && !["owner", "manager", "franchise_owner", "outlet_manager", "hq_admin"].includes(role)) return false;
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

  const itemsByGroup = NAV_GROUPS.reduce<Record<string, NavItem[]>>((acc, g) => {
    acc[g.key] = filteredItems.filter((item) => item.group === g.key);
    return acc;
  }, {});

  const activeGroupKey = filteredItems.find((item) => location === item.path)?.group ?? null;

  useEffect(() => {
    if (activeGroupKey && activeGroupKey !== "none" && !groupOpen[activeGroupKey]) {
      setGroupOpen((prev) => {
        const next = { ...prev, [activeGroupKey]: true };
        saveGroupState(next);
        return next;
      });
    }
  }, [activeGroupKey, location]);

  function renderNavItem(item: NavItem, index: number) {
    const isActive = location === item.path;
    const Icon = item.icon;
    const isLocked = item.featureKey ? !hasFeatureAccess(item.featureKey) : false;
    const requiredTier = isLocked && item.featureKey ? getMinimumTierForFeature(item.featureKey) : null;
    const upgradeTierLabel = requiredTier ? tierPricing[requiredTier]?.label : null;

    return (
      <motion.li
        key={item.id}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.02, duration: 0.18 }}
        style={{ willChange: "opacity, transform" }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => !isLocked && navigate(item.path)}
              aria-label={item.name}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-[15px] font-medium transition-all duration-200",
                isLocked
                  ? "opacity-40 cursor-not-allowed"
                  : isActive
                    ? "font-semibold"
                    : ""
              )}
              style={{
                color: isLocked
                  ? "hsl(220 10% 52%)"
                  : isActive
                    ? "#FFFFFF"
                    : "#F5F0E8",
              }}
            >
              {isActive && !isLocked && (
                <motion.div
                  layoutId="sidebar-active-bg"
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: "#2D6A4F",
                    border: "1px solid rgba(129,184,154,0.30)",
                    boxShadow: "0 2px 14px rgba(0,0,0,0.40), inset 0 1px 1px rgba(245,240,232,0.08)",
                  }}
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              {isActive && !isLocked && (
                <motion.div
                  layoutId="sidebar-active-indicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                  style={{
                    background: "#F5F0E8",
                    boxShadow: "0 0 8px 3px rgba(245,240,232,0.45)",
                  }}
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              {!isActive && !isLocked && (
                <div
                  className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{
                    background: "#245741",
                    border: "1px solid rgba(245,240,232,0.08)",
                  }}
                />
              )}
              <motion.div
                whileHover={isLocked ? {} : { scale: 1.15 }}
                whileTap={isLocked ? {} : { scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                className="relative z-10 shrink-0"
              >
                <Icon
                  aria-hidden="true"
                  className="h-[18px] w-[18px] transition-colors duration-200"
                  style={{
                    color: isLocked
                      ? "hsl(220 10% 42%)"
                      : isActive
                        ? "#F5F0E8"
                        : "rgba(245,240,232,0.70)",
                  }}
                />
              </motion.div>
              <span className="relative z-10 flex-1 text-left leading-tight">{item.name}</span>
              {item.id === "m-33" && pendingRequests > 0 && (
                <span
                  className="relative z-10 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white"
                  style={{ background: "hsl(0, 72%, 51%)" }}
                  data-testid="badge-live-requests"
                  aria-label={`${pendingRequests} pending requests`}
                >
                  {pendingRequests > 99 ? "99+" : pendingRequests}
                </span>
              )}
              {item.id === "m-18" && unreadAlerts > 0 && (
                <span
                  className="relative z-10 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white"
                  style={{ background: "hsl(0, 72%, 51%)" }}
                  data-testid="badge-security-alerts"
                  aria-label={`${unreadAlerts} security alerts`}
                >
                  {unreadAlerts > 99 ? "99+" : unreadAlerts}
                </span>
              )}
              {isLocked && (
                <Lock
                  aria-hidden="true"
                  className="relative z-10 h-3.5 w-3.5 shrink-0"
                  style={{ color: "hsl(220 10% 42%)" }}
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
  }

  let itemIndex = 0;

  return (
    <aside
      className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 overflow-hidden z-30"
      style={{
        background: "#1B4332",
      }}
      data-testid="sidebar"
    >
      <SlateShimmer />

      <div
        className="relative flex items-center justify-center px-6 py-5 overflow-hidden shrink-0"
        style={{ borderBottom: "1px solid #2D6A4F" }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)",
          }}
        />
        <span
          className="relative font-heading text-[32px] font-semibold text-center"
          style={{ color: "#F5F0E8", textShadow: "0 1px 2px rgba(0,0,0,0.35)", WebkitFontSmoothing: "antialiased" }}
          data-testid="logo-table-salt"
        >
          Table Salt
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3 relative z-10 space-y-0.5" aria-label="Main navigation">
        <TooltipProvider delayDuration={300}>
          {NAV_GROUPS.map((group) => {
            const groupItems = itemsByGroup[group.key] ?? [];
            if (groupItems.length === 0) return null;

            const isOpen = groupOpen[group.key] ?? group.defaultOpen;
            const hasActive = groupItems.some((item) => location === item.path);

            if (group.key === "none") {
              return (
                <ul key="none" className="space-y-0.5 mb-1" role="list">
                  {groupItems.map((item) => {
                    const el = renderNavItem(item, itemIndex);
                    itemIndex++;
                    return el;
                  })}
                </ul>
              );
            }

            return (
              <div key={group.key} className="mb-0.5">
                <button
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={isOpen}
                  aria-controls={`nav-group-${group.key}`}
                  data-testid={`nav-group-toggle-${group.key}`}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-widest transition-all duration-150 select-none"
                  style={{
                    color: hasActive
                      ? "#F5F0E8"
                      : "#81B89A",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,240,232,0.07)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  {isOpen
                    ? <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0 opacity-60" />
                    : <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 opacity-60" />
                  }
                  <span className="flex-1 text-left">{group.label}</span>
                  {!isOpen && hasActive && (
                    <span
                      className="inline-flex h-1.5 w-1.5 rounded-full shrink-0"
                      style={{
                        background: "#81B89A",
                        boxShadow: "0 0 5px 2px rgba(129,184,154,0.5)",
                      }}
                      aria-label="Contains active page"
                    />
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.ul
                      id={`nav-group-${group.key}`}
                      key={`list-${group.key}`}
                      role="list"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden space-y-0.5 pl-1"
                    >
                      {groupItems.map((item) => {
                        const el = renderNavItem(item, itemIndex);
                        itemIndex++;
                        return el;
                      })}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </TooltipProvider>
      </nav>
    </aside>
  );
}
