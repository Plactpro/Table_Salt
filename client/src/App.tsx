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
import OutletsPage from "@/pages/modules/outlets";
import BillingPage from "@/pages/modules/billing";
import IntegrationsPage from "@/pages/modules/integrations";
import OffersPage from "@/pages/modules/offers";
import CrmPage from "@/pages/modules/crm";
import PerformancePage from "@/pages/modules/performance";
import DeliveryPage from "@/pages/modules/delivery";
import OwnerDashboard from "@/pages/dashboards/owner";
import ManagerDashboard from "@/pages/dashboards/manager";
import WaiterDashboard from "@/pages/dashboards/waiter";
import KitchenDashboard from "@/pages/dashboards/kitchen";
import AccountantDashboard from "@/pages/dashboards/accountant";
import { ReactNode } from "react";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

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

  return <>{children}</>;
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

function ProtectedPages() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={RoleDashboard} />
        <Route path="/pos" component={PosPage} />
        <Route path="/orders" component={OrdersPage} />
        <Route path="/tables" component={TablesPage} />
        <Route path="/menu" component={MenuPage} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/outlets" component={OutletsPage} />
        <Route path="/billing" component={BillingPage} />
        <Route path="/offers" component={OffersPage} />
        <Route path="/crm" component={CrmPage} />
        <Route path="/performance" component={PerformancePage} />
        <Route path="/delivery" component={DeliveryPage} />
        <Route path="/integrations" component={IntegrationsPage} />
        <Route path="/staff" component={StaffPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  const [location] = useLocation();

  if (location === "/login") {
    return (
      <PublicOnly>
        <LoginPage />
      </PublicOnly>
    );
  }

  if (location === "/register") {
    return (
      <PublicOnly>
        <RegisterPage />
      </PublicOnly>
    );
  }

  return (
    <ProtectedRoute>
      <ProtectedPages />
    </ProtectedRoute>
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
