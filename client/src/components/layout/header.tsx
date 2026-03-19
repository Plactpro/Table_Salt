import { useAuth, Role } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import SyncStatusIndicator from "@/components/sync-status-indicator";
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
  type LucideIcon,
} from "lucide-react";

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

export default function Header({ onOpenSupport }: HeaderProps) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

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
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-10" data-testid="header">
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
        {onOpenSupport && (
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9 text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-950"
              onClick={onOpenSupport}
              title="Need help? Contact Support"
              data-testid="button-contact-support-header"
            >
              <Headset className="h-[18px] w-[18px]" />
            </Button>
          </motion.div>
        )}

        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Button variant="ghost" size="icon" className="relative h-9 w-9 text-muted-foreground hover:text-foreground" data-testid="button-notifications">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
          </Button>
        </motion.div>

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
  );
}
