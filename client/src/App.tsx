/**
 * i18n usage guide — for any component in this app:
 *   import { useTranslation } from 'react-i18next';
 *
 *   const { t } = useTranslation('common');      // shared strings (buttons, labels, nav)
 *   const { t } = useTranslation('kitchen');     // kitchen / KDS strings
 *   const { t } = useTranslation('pos');         // POS strings
 *   const { t } = useTranslation('orders');      // orders page strings
 *   const { t } = useTranslation('settings');    // settings page strings
 *   const { t } = useTranslation('staff');       // staff / shift strings
 *   const { t } = useTranslation('inventory');   // inventory strings
 *   const { t } = useTranslation('reports');     // reports strings
 *   const { t } = useTranslation('billing');     // billing strings
 *   const { t } = useTranslation('account');     // account / profile strings
 *   const { t } = useTranslation('layout');      // layout / nav chrome strings
 *
 * Locale files live at: client/src/i18n/locales/{en,es,ar,fr}/{namespace}.json
 * Language preference is persisted per-user (preferred_language DB column) and
 * per-tenant (default_language). Detected order: localStorage → DB preference (on login).
 * RTL is applied automatically when the active language is Arabic ('ar').
 */
import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, useSubscription } from "@/lib/auth";
import { ImpersonationProvider } from "@/lib/impersonation-context";
import { useIdleTimer } from "@/hooks/use-idle-timer";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n/index";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FeatureKey } from "@/lib/subscription";
import AppLayout from "@/components/layout/app-layout";
import AdminLayout from "@/components/admin/admin-layout";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import PosPage from "@/pages/modules/pos";
import AccountPage from "@/pages/account";
import KioskPage from "@/pages/kiosk";
import GuestPage from "@/pages/guest";
import KitchenDashboard from "@/pages/dashboards/kitchen";
import KdsWallScreen from "@/pages/dashboards/kds-wall";
import TableQrPage from "@/pages/table-qr";

import PageLoader from "@/components/PageLoader";
import { lazy, Suspense } from "react";

const MenuPage = lazy(() => import("@/pages/modules/menu"));
const OrdersPage = lazy(() => import("@/pages/modules/orders"));
const RecipeEditorPage = lazy(() => import("@/pages/modules/recipe-editor"));
const TablesPage = lazy(() => import("@/pages/modules/tables"));
const BillViewPage = lazy(() => import("@/pages/pos/bill-view"));
const CrmPage = lazy(() => import("@/pages/modules/crm"));
const CleaningPage = lazy(() => import("@/pages/modules/cleaning"));
const AuditsPage = lazy(() => import("@/pages/modules/audits"));
const BillingPage = lazy(() => import("@/pages/modules/billing"));
const IntegrationsPage = lazy(() => import("@/pages/modules/integrations"));
const KioskManagementPage = lazy(() => import("@/pages/modules/kiosk-management"));
const OmnichannelPage = lazy(() => import("@/pages/modules/omnichannel"));
const EventsPage = lazy(() => import("@/pages/modules/events"));
const PromotionsHub = lazy(() => import("@/pages/modules/promotions-hub"));
const InventoryHub = lazy(() => import("@/pages/modules/inventory-hub"));
const StaffHub = lazy(() => import("@/pages/modules/staff-hub"));
const ReportsHub = lazy(() => import("@/pages/modules/reports-hub"));
const StockMovementLog = lazy(() => import("@/pages/modules/stock-movement-log"));
const ChefReport = lazy(() => import("@/pages/modules/chef-report"));
const ShiftsManagement = lazy(() => import("@/pages/modules/shifts-management"));
const ShiftReconciliation = lazy(() => import("@/pages/modules/shift-reconciliation"));
const DeliveryHub = lazy(() => import("@/pages/modules/delivery-hub"));
const LocationsHub = lazy(() => import("@/pages/modules/locations-hub"));
const SettingsHub = lazy(() => import("@/pages/modules/settings-hub"));
const OwnerDashboard = lazy(() => import("@/pages/dashboards/owner"));
const ManagerDashboard = lazy(() => import("@/pages/dashboards/manager"));
const WaiterDashboard = lazy(() => import("@/pages/dashboards/waiter"));
const AccountantDashboard = lazy(() => import("@/pages/dashboards/accountant"));
const DeliveryAgentDashboard = lazy(() => import("@/pages/dashboards/delivery-agent"));
const KitchenBoardPage = lazy(() => import("@/pages/dashboards/kitchen-board"));
const KitchenSettingsPage = lazy(() => import("@/pages/dashboards/kitchen-settings"));
const ServiceHubPage = lazy(() => import("@/pages/dashboards/service-hub"));
const WastageDashboard = lazy(() => import("@/pages/dashboards/wastage-dashboard"));
const LiveRequestsPage = lazy(() => import("@/pages/modules/live-requests"));
const QrRequestSettings = lazy(() => import("@/pages/modules/qr-request-settings"));
const CoordinatorPage = lazy(() => import("@/pages/kds/coordinator"));
const StockReportsPage = lazy(() => import("@/pages/modules/stock-reports"));
const PhoneOrderPage = lazy(() => import("@/pages/modules/phone-order"));
const WastageLogPage = lazy(() => import("@/pages/modules/wastage-log"));
const WastageShiftPage = lazy(() => import("@/pages/modules/wastage-shift"));
const PrinterSettingsPage = lazy(() => import("@/pages/settings/printer-settings"));
const AlertSettingsPage = lazy(() => import("@/pages/settings/alerts"));
const MenuPricingPage = lazy(() => import("@/pages/menu/menu-pricing"));
const ProcurementHubPage = lazy(() => import("@/pages/procurement/index"));
const TicketHistoryPage = lazy(() => import("@/pages/tickets/index"));
const CashDashboardPage = lazy(() => import("@/pages/cash/index"));
const TipReportPage = lazy(() => import("@/pages/tips/report"));
const RecycleBinPage = lazy(() => import("@/pages/recycle-bin"));
const ParkingPage = lazy(() => import("@/pages/modules/parking"));
const AdvertisementsModule = lazy(() => import("@/pages/modules/advertisements"));
const AdsEnterpriseGateLazy = lazy(() =>
  import("@/pages/modules/advertisements").then((m) => ({ default: m.AdsEnterpriseGate }))
);
const OnboardingPage = lazy(() => import("@/pages/onboarding"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const TenantsPage = lazy(() => import("@/pages/admin/tenants"));
const TenantDetailPage = lazy(() => import("@/pages/admin/tenant-detail"));
const UsersPage = lazy(() => import("@/pages/admin/users"));
const AuditLogPage = lazy(() => import("@/pages/admin/audit-log"));
const AdminsPage = lazy(() => import("@/pages/admin/admins"));
const AdminSettingsPage = lazy(() => import("@/pages/admin/settings"));
const AnalyticsPage = lazy(() => import("@/pages/admin/analytics"));
const SecurityConsolePage = lazy(() => import("@/pages/admin/security"));
const AdminSupportPage = lazy(() => import("@/pages/admin/support"));
const AdminSupportTicketPage = lazy(() => import("@/pages/admin/support-ticket"));
const AdminAdApprovalsPage = lazy(() => import("@/pages/admin/ad-approvals"));
const BreachIncidentsPage = lazy(() => import("@/pages/admin/breach-incidents"));
const VendorRisksPage = lazy(() => import("@/pages/admin/vendor-risks"));
const IncidentPlaybookPage = lazy(() => import("@/pages/admin/incident-playbook"));
const SystemHealthPage = lazy(() => import("@/pages/admin/system-health"));

import GuestReceiptPage from "@/pages/guest-receipt";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import SupportWidget from "@/components/support/SupportWidget";
import AlertListener from "@/components/alert-listener";
import { ActiveAlertsProvider } from "@/lib/active-alerts-context";
import { ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";

import type { UserRole } from "@shared/permissions-config";

interface RouteGuardConfig {
  roles: UserRole[];
  featureKey?: FeatureKey;
  subscriptionFallback?: React.ElementType;
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
  "/integrations": { roles: ["owner", "franchise_owner", "hq_admin"], featureKey: "integrations" },
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
  "/settings/alerts": { roles: ["owner", "franchise_owner", "manager", "outlet_manager"] },
  "/menu-pricing": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "menu" },
  "/procurement": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"], featureKey: "inventory" },
  "/tickets": { roles: ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor", "cashier", "waiter", "accountant", "auditor"], featureKey: "orders" },
  "/cash": { roles: ["owner", "franchise_owner", "manager", "outlet_manager", "cashier"], featureKey: "pos" },
  "/tips/report": { roles: ["manager", "owner"] },
  "/recycle-bin": { roles: ["owner", "manager"] },
  "/parking": { roles: ["owner", "franchise_owner", "manager", "outlet_manager", "supervisor", "cashier", "waiter"] },
  "/advertisements": { roles: ["owner", "franchise_owner", "hq_admin", "manager"], featureKey: "advertisement_management", subscriptionFallback: AdsEnterpriseGateLazy },
};

function AccessDenied({ reason }: { reason: "role" | "subscription" }) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center justify-center min-h-[60vh]" data-testid="access-denied">
      <Card className="max-w-md w-full">
        <CardContent className="py-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold">{t("accessRestricted")}</h2>
          <p className="text-muted-foreground text-sm">
            {reason === "role" ? t("roleAccessDenied") : t("subscriptionAccessDenied")}
          </p>
          <Button variant="outline" onClick={() => window.history.back()} data-testid="button-go-back">
            {t("goBack")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function GuardedRoute({ path, component: Component }: { path: string; component: React.ComponentType }) {
  const { user } = useAuth();
  const { hasFeatureAccess, businessType } = useSubscription();
  const config = routeAccessMap[path];

  if (!config) return <Component />;

  const userRole = user?.role as UserRole;
  if (!config.roles.includes(userRole)) {
    return <AccessDenied reason="role" />;
  }

  // Business-type path exclusion
    const btConfig = businessType ? businessConfig[businessType] : null;
    if (btConfig?.excludedPaths?.includes(path)) {
      return <AccessDenied reason="business_type" />;
    }
    if (btConfig?.excludedFeatureKeys && config.featureKey && btConfig.excludedFeatureKeys.includes(config.featureKey)) {
      return <AccessDenied reason="business_type" />;
    }

    if (config.featureKey && !hasFeatureAccess(config.featureKey)) {
    const Fallback = config.subscriptionFallback;
    if (Fallback) {
      return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
          <Fallback />
        </Suspense>
      );
    }
    return <AccessDenied reason="subscription" />;
  }

  return <Component />;
}

function IdleLogoutDialog() {
  const { user, logout } = useAuth();
  const { t } = useTranslation("common");
  const [location] = useLocation();

  const isPublicOrKiosk = location === "/login" || location === "/register" || location === "/kiosk" || location.startsWith("/guest/") || location.startsWith("/table/") || location.startsWith("/kds/wall") || location.startsWith("/admin");

  const outletId = user?.outletId;

  const { data: outletTimeout } = useQuery<{ idleTimeoutMinutes: number }>({
    queryKey: ["/api/outlets", outletId, "idle-timeout"],
    queryFn: () => fetch(`/api/outlets/${outletId}/idle-timeout`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
    enabled: !!user && !isPublicOrKiosk && !!outletId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: securitySettings } = useQuery<{ idleTimeoutMinutes: number }>({
    queryKey: ["/api/security/settings"],
    queryFn: () => fetch("/api/security/settings", { credentials: "include" }).then(r => r.ok ? r.json() : { idleTimeoutMinutes: 30 }),
    enabled: !!user && !isPublicOrKiosk && !outletId,
    staleTime: 5 * 60 * 1000,
  });

  const timeoutMinutes = outletTimeout?.idleTimeoutMinutes ?? securitySettings?.idleTimeoutMinutes ?? 30;
  const enabled = !!user && !isPublicOrKiosk && timeoutMinutes > 0;

  const handleTimeout = async () => {
    try {
      const pendingOrderIds = Object.keys(sessionStorage).filter(k => k.startsWith("order_draft_"));
      if (pendingOrderIds.length > 0) {
        sessionStorage.setItem("pending_order_ids", JSON.stringify(pendingOrderIds));
      }
    } catch {}
    await logout();
  };

  const { warningVisible, secondsLeft, resetTimer } = useIdleTimer({
    timeoutMinutes,
    enabled,
    onTimeout: handleTimeout,
    warningWindowSeconds: 60,
  });

  if (!warningVisible) return null;

  return (
    <AlertDialog open={warningVisible} data-testid="dialog-idle-logout">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("youreAboutToBeLoggedOut")}</AlertDialogTitle>
          <AlertDialogDescription data-testid="text-idle-countdown">
            {t("idleWarning", { seconds: secondsLeft, plural: secondsLeft !== 1 ? "s" : "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={resetTimer} data-testid="button-stay-logged-in">
            {t("stayLoggedIn")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleTimeout} data-testid="button-logout-now">
            {t("logoutNow")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PendingOrdersNotice() {
  const [, navigate] = useLocation();
  const { t } = useTranslation("common");
  const [pendingCount, setPendingCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pending_order_ids");
      if (!raw) return;
      const ids: string[] = JSON.parse(raw);
      sessionStorage.removeItem("pending_order_ids");
      if (ids.length > 0) {
        setPendingCount(ids.length);
        setOpen(true);
      }
    } catch {}
  }, []);

  if (!open) return null;

  return (
    <AlertDialog open={open} data-testid="dialog-pending-orders">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("sessionTimedOut")}</AlertDialogTitle>
          <AlertDialogDescription data-testid="text-pending-orders-count">
            {t("pendingOrders", { count: pendingCount, plural: pendingCount !== 1 ? "s" : "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setOpen(false)} data-testid="button-pending-orders-dismiss">
            {t("dismiss")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { setOpen(false); navigate("/orders"); }}
            data-testid="button-review-orders"
          >
            {t("reviewOpenOrders")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
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

  return (
    <ActiveAlertsProvider>
      <AlertListener />
      <PendingOrdersNotice />
      {children}
    </ActiveAlertsProvider>
  );
}

function WelcomeModal({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const { t } = useTranslation("common");
  const pendingKey = `welcome_pending_${tenantId}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(pendingKey) === "true";
    } catch {
      return false;
    }
  });

  const handleClose = () => {
    try {
      localStorage.removeItem(pendingKey);
    } catch {}
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md" data-testid="modal-welcome">
        <div className="text-center space-y-4 py-2">
          <div className="text-5xl">🎊</div>
          <div>
            <h2 className="text-xl font-bold font-heading">{t("welcomeToTableSalt")}</h2>
            <p className="text-muted-foreground text-sm mt-1">{tenantName}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("restaurantSetup")}
          </p>
          <div className="text-left space-y-2 bg-muted/40 rounded-lg p-4">
            {[t("addMenuItems"), t("setupTables"), t("addStaff"), t("takeFirstOrder")].map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
          <Button className="w-full gap-2" onClick={handleClose} data-testid="button-lets-go">
            {t("letsGo")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoleDashboard() {
  const { user, tenant, isLoading } = useAuth();
  const showWelcome = !isLoading && tenant?.onboardingCompleted && user?.role === "owner" &&
    (() => { try { return localStorage.getItem(`welcome_pending_${user?.tenantId}`) === "true"; } catch { return false; } })();

  if (!isLoading && tenant && tenant.onboardingCompleted === false) {
    return <Redirect to="/onboarding" />;
  }

  const dashboard = (() => {
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
      case "delivery_agent":
        return <DeliveryAgentDashboard />;
      default:
        return <OwnerDashboard />;
    }
  })();

  return (
    <>
      {showWelcome && user && tenant && (
        <WelcomeModal tenantId={user.tenantId} tenantName={tenant.name} />
      )}
      {dashboard}
    </>
  );
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

  return (
    <Suspense fallback={<PageLoader />}>
      <OnboardingPage />
    </Suspense>
  );
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
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/analytics" component={AnalyticsPage} />
          <Route path="/admin/tenants/:id" component={TenantDetailPage} />
          <Route path="/admin/tenants" component={TenantsPage} />
          <Route path="/admin/users" component={UsersPage} />
          <Route path="/admin/support/:ticketId" component={AdminSupportTicketPage} />
          <Route path="/admin/support" component={AdminSupportPage} />
          <Route path="/admin/audit" component={AuditLogPage} />
          <Route path="/admin/security" component={SecurityConsolePage} />
          <Route path="/admin/breach-incidents" component={BreachIncidentsPage} />
          <Route path="/admin/vendor-risks" component={VendorRisksPage} />
          <Route path="/admin/incident-playbook" component={IncidentPlaybookPage} />
          <Route path="/admin/system-health" component={SystemHealthPage} />
          <Route path="/admin/admins" component={AdminsPage} />
          <Route path="/admin/settings" component={AdminSettingsPage} />
          <Route path="/admin/ad-approvals" component={AdminAdApprovalsPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
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
  const { user } = useAuth();
  return (
    <AppLayout>
      {(user?.role === "owner" || user?.role === "manager") && <SupportWidget />}
      <Suspense fallback={<PageLoader />}>
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
        <Route path="/settings/alerts">{() => <GuardedRoute path="/settings/alerts" component={AlertSettingsPage} />}</Route>
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
        <Route path="/suppliers">{() => <Redirect to="/procurement" />}</Route>
        <Route path="/procurement">{() => <GuardedRoute path="/procurement" component={ProcurementHubPage} />}</Route>
        <Route path="/tickets">{() => <GuardedRoute path="/tickets" component={TicketHistoryPage} />}</Route>
        <Route path="/cash">{() => <GuardedRoute path="/cash" component={CashDashboardPage} />}</Route>
        <Route path="/tips/report">{() => <GuardedRoute path="/tips/report" component={TipReportPage} />}</Route>
        <Route path="/recycle-bin">{() => <GuardedRoute path="/recycle-bin" component={RecycleBinPage} />}</Route>
        <Route path="/parking">{() => <GuardedRoute path="/parking" component={ParkingPage} />}</Route>
        <Route path="/advertisements">{() => <GuardedRoute path="/advertisements" component={AdvertisementsModule} />}</Route>
        <Route path="/account" component={AccountPage} />
        <Route path="/workforce">{() => <Redirect to="/staff" />}</Route>
        <Route path="/performance">{() => <Redirect to="/staff" />}</Route>
        <Route path="/bi-dashboard">{() => <Redirect to="/reports" />}</Route>
        <Route path="/audit-log">{() => <Redirect to="/reports" />}</Route>
        <Route path="/orders-hub">{() => <Redirect to="/delivery" />}</Route>
        <Route path="/hq-console">{() => <Redirect to="/outlets" />}</Route>
        <Route path="/security">{() => <Redirect to="/settings" />}</Route>
        <Route path="/dashboard">{() => <Redirect to="/" />}</Route>
        <Route component={NotFound} />
      </Switch>
      </Suspense>
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

  if (location === "/forgot-password") {
    return (
      <PublicOnly>
        <ForgotPasswordPage />
      </PublicOnly>
    );
  }

  if (location === "/reset-password") {
    return <ResetPasswordPage />;
  }

  if (location === "/onboarding") {
    return <OnboardingRoute />;
  }

  if (location.startsWith("/kds/wall")) {
    return <KdsWallScreen />;
  }

  // O8: Public receipt route — no auth required so customers can view via QR scan
  if (location.startsWith("/receipt/")) {
    return (
      <Switch>
        <Route path="/receipt/:id" component={GuestReceiptPage} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  return (
    <ProtectedRoute>
      <ProtectedPages />
    </ProtectedRoute>
  );
}

function SkipToMainContent() {
  const { t } = useTranslation("common");
  return (
    <a href="#main-content" className="skip-link">
      {t("skipToMainContent")}
    </a>
  );
}

function App() {
  return (
    <I18nextProvider i18n={i18n}>
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <ImpersonationProvider>
              <SkipToMainContent />
              <div
                id="aria-announcer"
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
              />
              <Toaster />
              <CookieConsentBanner />
              <IdleLogoutDialog />
              <Router />
            </ImpersonationProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
    </I18nextProvider>
  );
}

export default App;
