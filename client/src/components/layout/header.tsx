import { useAuth, Role } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, ChevronDown, User } from "lucide-react";

const roleLabels: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  waiter: "Waiter",
  kitchen: "Kitchen",
  accountant: "Accountant",
  customer: "Customer",
};

const roleBadgeColors: Record<Role, string> = {
  owner: "bg-purple-100 text-purple-800",
  manager: "bg-blue-100 text-blue-800",
  waiter: "bg-green-100 text-green-800",
  kitchen: "bg-orange-100 text-orange-800",
  accountant: "bg-gray-100 text-gray-800",
  customer: "bg-teal-100 text-teal-800",
};

export default function Header() {
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

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-10" data-testid="header">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleBadgeColors[user.role]}`}
          data-testid="badge-role"
        >
          {roleLabels[user.role]}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2" data-testid="button-user-menu">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
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
