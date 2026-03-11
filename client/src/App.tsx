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
import { AnimatePresence, motion } from "framer-motion";

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

const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease: "easeInOut" as const },
};

function PageWrapper({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={pageTransition.initial}
      animate={pageTransition.animate}
      exit={pageTransition.exit}
      transition={pageTransition.transition}
    >
      {children}
    </motion.div>
  );
}

function Router() {
  const [location] = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Switch location={location} key={location}>
        <Route path="/login">
          <PublicOnly>
            <PageWrapper>
              <LoginPage />
            </PageWrapper>
          </PublicOnly>
        </Route>
        <Route path="/register">
          <PublicOnly>
            <PageWrapper>
              <RegisterPage />
            </PageWrapper>
          </PublicOnly>
        </Route>
        <Route path="/">
          <ProtectedRoute>
            <PageWrapper>
              <RoleDashboard />
            </PageWrapper>
          </ProtectedRoute>
        </Route>
        <Route path="/pos">
          <ProtectedRoute>
            <PageWrapper>
              <PosPage />
            </PageWrapper>
          </ProtectedRoute>
        </Route>
        <Route path="/orders">
          <ProtectedRoute>
            <PageWrapper>
              <OrdersPage />
            </PageWrapper>
          </ProtectedRoute>
        </Route>
        <Route path="/tables">
          <ProtectedRoute>
            <PageWrapper>
              <TablesPage />
            </PageWrapper>
          </ProtectedRoute>
        </Route>
        <Route path="/menu">
          <ProtectedRoute>
            <PageWrapper>
              <MenuPage />
            </PageWrapper>
          </ProtectedRoute>
        </Route>
        <Route path="/inventory">
          <ProtectedRoute>
            <PageWrapper>
              <InventoryPage />
            </PageWrapper>
          </ProtectedRoute>
        </Route>
        <Route path="/staff">
          <ProtectedRoute>
            <PageWrapper>
              <StaffPage />
            </PageWrapper>
          </ProtectedRoute>
        </Route>
        <Route path="/reports">
          <ProtectedRoute>
            <PageWrapper>
              <ReportsPage />
            </PageWrapper>
          </ProtectedRoute>
        </Route>
        <Route path="/settings">
          <ProtectedRoute>
            <PageWrapper>
              <SettingsPage />
            </PageWrapper>
          </ProtectedRoute>
        </Route>
        <Route>
          <PageWrapper>
            <NotFound />
          </PageWrapper>
        </Route>
      </Switch>
    </AnimatePresence>
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
