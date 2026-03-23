import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, useSubscription } from "@/lib/auth";
import { ImpersonationProvider } from "@/lib/impersonation-context";
import { FeatureKey } from "@/lib/subscription";
import AppLayout from "@/components/layout/app-layout";
import AdminLayout from "@/components/admin/admin-layout";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import MenuPage from "@/pages/modules/menu";
import OrdersPage from "@/pages/modules/orders";
import RecipeEditorPage from "@/pages/modules/recipe-editor";
import TablesPage from "@/pages/modules/tables";
import PosPage from "@/pages/modules/pos";
import BillViewPage from "@/pages/pos/bill-view";
import CrmPage from "@/pages/modules/crm";
import CleaningPage from "@/pages/modules/cleaning";
import AuditsPage from "@/pages/modules/audits";
import BillingPage from "@/pages/modules/billing";
import IntegrationsPage from "@/pages/modules/integrations";
import KioskPage from "@/pages/kiosk";
import GuestPage from "@/pages/guest";
import KioskManagementPage from "@/pages/modules/kiosk-management";
import OmnichannelPage from "@/pages/modules/omnichannel";
import EventsPage from "@/pages/modules/events";
import PromotionsHub from "@/pages/modules/promotions-hub";
import InventoryHub from "@/pages/modules/inventory-hub";
import StaffHub from "@/pages/modules/staff-hub";
import ReportsHub from "@/pages/modules/reports-hub";
import StockMovementLog from "@/pages/modules/stock-movement-log";
import ChefReport from "@/pages/modules/chef-report";
import ShiftsManagement from "@/pages/modules/shifts-management";
import ShiftReconciliation from "@/pages/modules/shift-reconciliation";
import DeliveryHub from "@/pages/modules/delivery-hub";
import LocationsHub from "@/pages/modules/locations-hub";
import SettingsHub from "@/pages/modules/settings-hub";
import OwnerDashboard from "@/pages/dashboards/owner";
import ManagerDashboard from "@/pages/dashboards/manager";
import WaiterDashboard from "@/pages/dashboards/waiter";
import KitchenDashboard from "@/pages/dashboards/kitchen";
import AccountantDashboard from "@/pages/dashboards/accountant";
import KdsWallScreen from "@/pages/dashboards/kds-wall";
import TableQrPage from "@/pages/table-qr";
import LiveRequestsPage from "@/pages/modules/live-requests";
import QrRequestSettings from "@/pages/modules/qr-request-settings";
import KitchenSettingsPage from "@/pages/dashboards/kitchen-settings";
import KitchenBoardPage from "@/pages/dashboards/kitchen-board";
import CoordinatorPage from "@/pages/kds/coordinator";
import StockReportsPage from "@/pages/modules/stock-reports";
import PhoneOrderPage from "@/pages/modules/phone-order";
import ServiceHubPage from "@/pages/dashboards/service-hub";
import WastageDashboard from "@/pages/dashboards/wastage-dashboard";
import WastageLogPage from "@/pages/modules/wastage-log";
import WastageShiftPage from "@/pages/modules/wastage-shift";
import PrinterSettingsPage from "@/pages/settings/printer-settings";
import MenuPricingPage from "@/pages/menu/menu-pricing";

import OnboardingPage from "@/pages/onboarding";
import AdminDashboard from "@/pages/admin/dashboard";
import TenantsPage from "@/pages/admin/tenants";
import TenantDetailPage from "@/pages/admin/tenant-detail";
import UsersPage from "@/pages/admin/users";
import AuditLogPage from "@/pages/admin/audit-log";
import AdminsPage from "@/pages/admin/admins";
import AdminSettingsPage from "@/pages/admin/settings";
import AnalyticsPage from "@/pages/admin/analytics";
import SecurityConsolePage from "@/pages/admin/security";

import { ReactNode } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { UserRole } from "@shared/permissions-config";

interface RouteGuardConfig {
  roles: UserRole[];
  featureKey?: FeatureKey;
}

const routeAccessMap: Record<string, RouteGuardConfig> = {
  "/pos": { roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor", "cashier", "waiter"], featureKey: "pos" },
  "/orders": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor", "cashier", "waiter", "kitchen"], featureKey: "orders" },
  "/tables": { roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor", "cashier", "waiter"], featureKey: "tables" },
  "/menu": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor"], featureKey: "menu" },
  "/inventory": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor"], featureKey: "inventory" },
  "/outlets": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "outlets" },
  "/promotions": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "offers" },
  "/crm": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "crm" },
  "/delivery": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "delivery_management" },
  "/cleaning": { roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor"], featureKey: "cleaning" },
  "/audits": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "auditor"], featureKey: "internal_audits" },
  "/integrations": { roles: ["owner", "franchise_owner", "hq_admin", "manager"], featureKey: "integrations" },
  "/staff": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "staff" },
  "/reports": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "accountant", "auditor"], featureKey: "reports" },
  "/billing": { roles: ["owner", "franchise_owner", "hq_admin"], featureKey: "billing" },
  "/settings": { roles: ["owner", "franchise_owner", "hq_admin"], featureKey: "settings" },
  "/kiosk-management": { roles: ["owner", "manager"] },
  "/omnichannel": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "reports" },
  "/channels": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "reports" },
  "/events": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor", "cashier", "waiter", "kitchen", "accountant", "auditor"], featureKey: "staff" },
  "/live-requests": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor", "cashier", "waiter"], featureKey: "tables" },
  "/qr-settings": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "tables" },
  "/kitchen-settings": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "orders" },
  "/kitchen-board": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "orders" },
  "/kds/coordinator": { roles: ["owner", "manager"], featureKey: "orders" },
  "/stock-reports": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "inventory" },
  "/phone-order": { roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor", "cashier", "waiter"], featureKey: "orders" },
  "/service-hub": { roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor"], featureKey: "orders" },
  "/wastage": { roles: ["owner", "franchise_owner", "manager", "outlet_manager"] },
  "/wastage-log": { roles: ["owner", "franchise_owner", "manager", "outlet_manager", "kitchen"] },
  "/wastage-shift": { roles: ["owner", "franchise_owner", "manager", "outlet_manager"] },
  "/settings/printers": { roles: ["owner", "franchise_owner", "manager", "outlet_manager"] },
  "/menu-pricing": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "menu" },
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

  const userRole = user?.role as UserRole;
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
  const { user, tenant, isLoading } = useAuth();

  if (!isLoading && tenant && tenant.onboardingCompleted === false) {
    return <Redirect to="/onboarding" />;
  }

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

function OnboardingRoute() {
  const { user, tenant, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;
  if ((user.role as string) === "super_admin") return <Redirect to="/admin" />;
  if (tenant?.onboardingCompleted) return <Redirect to="/" />;

  return <OnboardingPage />;
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
    return <Redirect to={(user.role as string) === "super_admin" ? "/admin" : "/"} />;
  }

  return <>{children}</>;
}

function AdminShell() {
  return (
    <AdminLayout>
      <Switch>
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/analytics" component={AnalyticsPage} />
        <Route path="/admin/tenants/:id" component={TenantDetailPage} />
        <Route path="/admin/tenants" component={TenantsPage} />
        <Route path="/admin/users" component={UsersPage} />
        <Route path="/admin/audit" component={AuditLogPage} />
        <Route path="/admin/security" component={SecurityConsolePage} />
        <Route path="/admin/admins" component={AdminsPage} />
        <Route path="/admin/settings" component={AdminSettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </AdminLayout>
  );
}

function AdminRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;
  if ((user.role as string) !== "super_admin") return <Redirect to="/" />;

  return <AdminShell />;
}

function ProtectedPages() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={RoleDashboard} />
        <Route path="/pos/bill/:orderId">{() => <GuardedRoute path="/pos" component={BillViewPage} />}</Route>
        <Route path="/pos">{() => <GuardedRoute path="/pos" component={PosPage} />}</Route>
        <Route path="/orders">{() => <GuardedRoute path="/orders" component={OrdersPage} />}</Route>
        <Route path="/tables">{() => <GuardedRoute path="/tables" component={TablesPage} />}</Route>
        <Route path="/menu">{() => <GuardedRoute path="/menu" component={MenuPage} />}</Route>
        <Route path="/inventory">{() => <GuardedRoute path="/inventory" component={InventoryHub} />}</Route>
        {/* Recipe editor routes — canonical path is /recipes/* (no /app/ prefix, consistent with all other module routes in this app).
            /app/recipes/* aliases are provided below for compatibility with any external references. */}
        <Route path="/recipes/new">{() => <GuardedRoute path="/inventory" component={RecipeEditorPage} />}</Route>
        <Route path="/recipes/:id">{() => <GuardedRoute path="/inventory" component={RecipeEditorPage} />}</Route>
        <Route path="/app/recipes/new">{() => <Redirect to="/recipes/new" />}</Route>
        <Route path="/app/recipes/:id">{({ id }: { id: string }) => <Redirect to={`/recipes/${id}`} />}</Route>
        <Route path="/outlets">{() => <GuardedRoute path="/outlets" component={LocationsHub} />}</Route>
        <Route path="/promotions">{() => <GuardedRoute path="/promotions" component={PromotionsHub} />}</Route>
        <Route path="/crm">{() => <GuardedRoute path="/crm" component={CrmPage} />}</Route>
        <Route path="/delivery">{() => <GuardedRoute path="/delivery" component={DeliveryHub} />}</Route>
        <Route path="/cleaning">{() => <GuardedRoute path="/cleaning" component={CleaningPage} />}</Route>
        <Route path="/audits">{() => <GuardedRoute path="/audits" component={AuditsPage} />}</Route>
        <Route path="/integrations">{() => <GuardedRoute path="/integrations" component={IntegrationsPage} />}</Route>
        <Route path="/staff">{() => <GuardedRoute path="/staff" component={StaffHub} />}</Route>
        <Route path="/live-requests">{() => <GuardedRoute path="/live-requests" component={LiveRequestsPage} />}</Route>
        <Route path="/qr-settings">{() => <GuardedRoute path="/qr-settings" component={QrRequestSettings} />}</Route>
        <Route path="/kitchen-settings">{() => <GuardedRoute path="/kitchen-settings" component={KitchenSettingsPage} />}</Route>
        <Route path="/kitchen-board">{() => <GuardedRoute path="/kitchen-board" component={KitchenBoardPage} />}</Route>
        <Route path="/kds/coordinator">{() => <GuardedRoute path="/kds/coordinator" component={CoordinatorPage} />}</Route>
        <Route path="/stock-reports">{() => <GuardedRoute path="/stock-reports" component={StockReportsPage} />}</Route>
        <Route path="/phone-order">{() => <GuardedRoute path="/phone-order" component={PhoneOrderPage} />}</Route>
        <Route path="/service-hub">{() => <GuardedRoute path="/service-hub" component={ServiceHubPage} />}</Route>
        <Route path="/wastage">{() => <GuardedRoute path="/wastage" component={WastageDashboard} />}</Route>
        <Route path="/wastage-log">{() => <GuardedRoute path="/wastage-log" component={WastageLogPage} />}</Route>
        <Route path="/wastage-shift">{() => <GuardedRoute path="/wastage-shift" component={WastageShiftPage} />}</Route>
        <Route path="/settings/printers">{() => <GuardedRoute path="/settings/printers" component={PrinterSettingsPage} />}</Route>
        <Route path="/menu-pricing">{() => <GuardedRoute path="/menu-pricing" component={MenuPricingPage} />}</Route>
        <Route path="/reports">{() => <GuardedRoute path="/reports" component={ReportsHub} />}</Route>
        <Route path="/stock-movements">{() => <GuardedRoute path="/inventory" component={StockMovementLog} />}</Route>
        <Route path="/chef-report">{() => <GuardedRoute path="/reports" component={ChefReport} />}</Route>
        <Route path="/shifts">{() => <GuardedRoute path="/settings" component={ShiftsManagement} />}</Route>
        <Route path="/shift-reconciliation">{() => <GuardedRoute path="/reports" component={ShiftReconciliation} />}</Route>
        <Route path="/kiosk-management">{() => <GuardedRoute path="/kiosk-management" component={KioskManagementPage} />}</Route>
        <Route path="/omnichannel">{() => <GuardedRoute path="/omnichannel" component={OmnichannelPage} />}</Route>
        <Route path="/channels">{() => <GuardedRoute path="/channels" component={OmnichannelPage} />}</Route>
        <Route path="/events">{() => <GuardedRoute path="/events" component={EventsPage} />}</Route>
        <Route path="/billing">{() => <GuardedRoute path="/billing" component={BillingPage} />}</Route>
        <Route path="/settings">{() => <GuardedRoute path="/settings" component={SettingsHub} />}</Route>
        <Route path="/offers">{() => <Redirect to="/promotions" />}</Route>
        <Route path="/suppliers">{() => <Redirect to="/inventory" />}</Route>
        <Route path="/procurement">{() => <Redirect to="/inventory" />}</Route>
        <Route path="/workforce">{() => <Redirect to="/staff" />}</Route>
        <Route path="/performance">{() => <Redirect to="/staff" />}</Route>
        <Route path="/bi-dashboard">{() => <Redirect to="/reports" />}</Route>
        <Route path="/audit-log">{() => <Redirect to="/reports" />}</Route>
        <Route path="/orders-hub">{() => <Redirect to="/delivery" />}</Route>
        <Route path="/hq-console">{() => <Redirect to="/outlets" />}</Route>
        <Route path="/security">{() => <Redirect to="/settings" />}</Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  const [location] = useLocation();

  if (location === "/kiosk") {
    return <KioskPage />;
  }

  if (location.startsWith("/guest/")) {
    return (
      <Switch>
        <Route path="/guest/o/:outletId/t/:tableToken" component={GuestPage} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (location.startsWith("/table/") || location === "/table") {
    return (
      <Switch>
        <Route path="/table/:tenantSlug/:outletId/:tableId" component={TableQrPage} />
        <Route path="/table" component={TableQrPage} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (location.startsWith("/admin")) {
    return <AdminRoute />;
  }

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

  if (location === "/onboarding") {
    return <OnboardingRoute />;
  }

  if (location.startsWith("/kds/wall")) {
    return <KdsWallScreen />;
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
          <ImpersonationProvider>
            <Toaster />
            <Router />
          </ImpersonationProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
