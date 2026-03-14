import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, useSubscription } from "@/lib/auth";
import { FeatureKey } from "@/lib/subscription";
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
import ChefMascot from "@/components/widgets/chef-mascot";
import { ReactNode } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Role = "owner" | "manager" | "waiter" | "kitchen" | "accountant";

interface RouteGuardConfig {
  roles: Role[];
  featureKey?: FeatureKey;
}

const routeAccessMap: Record<string, RouteGuardConfig> = {
  "/pos": { roles: ["owner", "manager", "waiter"], featureKey: "pos" },
  "/orders": { roles: ["owner", "manager", "waiter", "kitchen"], featureKey: "orders" },
  "/tables": { roles: ["owner", "manager", "waiter"], featureKey: "tables" },
  "/menu": { roles: ["owner", "manager"], featureKey: "menu" },
  "/inventory": { roles: ["owner", "manager"], featureKey: "inventory" },
  "/outlets": { roles: ["owner", "manager"], featureKey: "outlets" },
  "/billing": { roles: ["owner"], featureKey: "billing" },
  "/offers": { roles: ["owner", "manager"], featureKey: "offers" },
  "/crm": { roles: ["owner", "manager"], featureKey: "crm" },
  "/performance": { roles: ["owner", "manager"], featureKey: "staff" },
  "/delivery": { roles: ["owner", "manager"], featureKey: "delivery_management" },
  "/integrations": { roles: ["owner", "manager"], featureKey: "integrations" },
  "/staff": { roles: ["owner", "manager"], featureKey: "staff" },
  "/reports": { roles: ["owner", "manager", "accountant"], featureKey: "reports" },
  "/settings": { roles: ["owner"], featureKey: "settings" },
};

function AccessDenied({ reason }: { reason: "role" | "subscription" }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]" data-testid="access-denied">
      <Card className="max-w-md w-full">
        <CardContent className="py-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold">Access Restricted</h2>
          <p className="text-muted-foreground text-sm">
            {reason === "role"
              ? "You don't have the required role to access this page. Please contact your administrator."
              : "This feature is not available on your current subscription plan. Please upgrade to access this module."}
          </p>
          <Button variant="outline" onClick={() => window.history.back()} data-testid="button-go-back">
            Go Back
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function GuardedRoute({ path, component: Component }: { path: string; component: React.ComponentType }) {
  const { user } = useAuth();
  const { hasFeatureAccess } = useSubscription();
  const config = routeAccessMap[path];

  if (!config) return <Component />;

  const userRole = user?.role as Role;
  if (!config.roles.includes(userRole)) {
    return <AccessDenied reason="role" />;
  }

  if (config.featureKey && !hasFeatureAccess(config.featureKey)) {
    return <AccessDenied reason="subscription" />;
  }

  return <Component />;
}

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
        <Route path="/pos">{() => <GuardedRoute path="/pos" component={PosPage} />}</Route>
        <Route path="/orders">{() => <GuardedRoute path="/orders" component={OrdersPage} />}</Route>
        <Route path="/tables">{() => <GuardedRoute path="/tables" component={TablesPage} />}</Route>
        <Route path="/menu">{() => <GuardedRoute path="/menu" component={MenuPage} />}</Route>
        <Route path="/inventory">{() => <GuardedRoute path="/inventory" component={InventoryPage} />}</Route>
        <Route path="/outlets">{() => <GuardedRoute path="/outlets" component={OutletsPage} />}</Route>
        <Route path="/billing">{() => <GuardedRoute path="/billing" component={BillingPage} />}</Route>
        <Route path="/offers">{() => <GuardedRoute path="/offers" component={OffersPage} />}</Route>
        <Route path="/crm">{() => <GuardedRoute path="/crm" component={CrmPage} />}</Route>
        <Route path="/performance">{() => <GuardedRoute path="/performance" component={PerformancePage} />}</Route>
        <Route path="/delivery">{() => <GuardedRoute path="/delivery" component={DeliveryPage} />}</Route>
        <Route path="/integrations">{() => <GuardedRoute path="/integrations" component={IntegrationsPage} />}</Route>
        <Route path="/staff">{() => <GuardedRoute path="/staff" component={StaffPage} />}</Route>
        <Route path="/reports">{() => <GuardedRoute path="/reports" component={ReportsPage} />}</Route>
        <Route path="/settings">{() => <GuardedRoute path="/settings" component={SettingsPage} />}</Route>
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
          <ChefMascot />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
