import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import AppLayout from "@/components/layout/app-layout";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import MenuPage from "@/pages/modules/menu";
import OrdersPage from "@/pages/modules/orders";
import StaffPage from "@/pages/modules/staff";
import ReportsPage from "@/pages/modules/reports";
import SettingsPage from "@/pages/modules/settings";
import TablesPage from "@/pages/modules/tables";
import PosPage from "@/pages/modules/pos";
import InventoryPage from "@/pages/modules/inventory";
import OwnerDashboard from "@/pages/dashboards/owner";
import ManagerDashboard from "@/pages/dashboards/manager";
import WaiterDashboard from "@/pages/dashboards/waiter";
import KitchenDashboard from "@/pages/dashboards/kitchen";
import AccountantDashboard from "@/pages/dashboards/accountant";
import { ReactNode } from "react";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <AppLayout>{children}</AppLayout>;
}

function RoleDashboard() {
  const { user } = useAuth();
  switch (user?.role) {
    case "owner":
      return <OwnerDashboard />;
    case "manager":
      return <ManagerDashboard />;
    case "waiter":
      return <WaiterDashboard />;
    case "kitchen":
      return <KitchenDashboard />;
    case "accountant":
      return <AccountantDashboard />;
    default:
      return <OwnerDashboard />;
  }
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <PublicOnly>
          <LoginPage />
        </PublicOnly>
      </Route>
      <Route path="/register">
        <PublicOnly>
          <RegisterPage />
        </PublicOnly>
      </Route>
      <Route path="/">
        <ProtectedRoute>
          <RoleDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/pos">
        <ProtectedRoute>
          <PosPage />
        </ProtectedRoute>
      </Route>
      <Route path="/orders">
        <ProtectedRoute>
          <OrdersPage />
        </ProtectedRoute>
      </Route>
      <Route path="/tables">
        <ProtectedRoute>
          <TablesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/menu">
        <ProtectedRoute>
          <MenuPage />
        </ProtectedRoute>
      </Route>
      <Route path="/inventory">
        <ProtectedRoute>
          <InventoryPage />
        </ProtectedRoute>
      </Route>
      <Route path="/staff">
        <ProtectedRoute>
          <StaffPage />
        </ProtectedRoute>
      </Route>
      <Route path="/reports">
        <ProtectedRoute>
          <ReportsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <SettingsPage />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
