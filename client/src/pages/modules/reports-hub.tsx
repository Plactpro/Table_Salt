import { useState, Component } from "react";
import { PageTitle } from "@/lib/accessibility";
import type { ErrorInfo, ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, Activity, ScrollText, ChefHat, Clock, AlertCircle, Bell, Tag, UtensilsCrossed, DollarSign } from "lucide-react";
import ReportsPage from "./reports";
import BIDashboard from "./bi-dashboard";
import AuditLogPage from "./audit-log";
import FoodCostReports from "./food-cost-reports";
import ChefReport from "./chef-report";
import ShiftReconciliation from "./shift-reconciliation";
import CustomerRequestsAnalytics from "./customer-requests-analytics";
import PriceAnalysis from "./price-analysis";
import CrockeryBreakageReport from "./crockery-breakage-report";
import CashDrawerLog from "./cash-drawer-log";

class TabErrorBoundary extends Component<{ children: ReactNode; label: string }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; label: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] tab error:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <AlertCircle className="h-10 w-10 text-destructive opacity-60" />
          <p className="text-sm">Something went wrong loading <strong>{this.props.label}</strong>.</p>
          <button className="text-xs underline" onClick={() => this.setState({ hasError: false })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ReportsHub() {
  const [tab, setTab] = useState("reports");

  return (
    <div className="space-y-6" data-testid="reports-hub">
      <PageTitle title="Reports" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="reports-tabs" className="flex-wrap h-auto">
          <TabsTrigger value="reports" data-testid="tab-reports">
            <BarChart3 className="h-4 w-4 mr-1.5" />Sales Reports
          </TabsTrigger>
          <TabsTrigger value="food-cost" data-testid="tab-food-cost">
            <ChefHat className="h-4 w-4 mr-1.5" />Food Cost
          </TabsTrigger>
          <TabsTrigger value="chef-report" data-testid="tab-chef-report">
            <ChefHat className="h-4 w-4 mr-1.5" />Chef Report
          </TabsTrigger>
          <TabsTrigger value="bi" data-testid="tab-bi-forecasting">
            <Activity className="h-4 w-4 mr-1.5" />BI & Forecasting
          </TabsTrigger>
          <TabsTrigger value="shift-report" data-testid="tab-shift-report">
            <Clock className="h-4 w-4 mr-1.5" />Shift Report
          </TabsTrigger>
          <TabsTrigger value="customer-requests" data-testid="tab-customer-requests">
            <Bell className="h-4 w-4 mr-1.5" />Customer Requests
          </TabsTrigger>
          <TabsTrigger value="price-analysis" data-testid="tab-price-analysis">
            <Tag className="h-4 w-4 mr-1.5" />Price Analysis
          </TabsTrigger>
          <TabsTrigger value="crockery-breakage" data-testid="tab-crockery-breakage">
            <UtensilsCrossed className="h-4 w-4 mr-1.5" />Crockery Breakage
          </TabsTrigger>
          <TabsTrigger value="cash-drawer-log" data-testid="tab-cash-drawer-log">
            <DollarSign className="h-4 w-4 mr-1.5" />Cash Drawer Log
          </TabsTrigger>
          <TabsTrigger value="audit-log" data-testid="tab-audit-log">
            <ScrollText className="h-4 w-4 mr-1.5" />Audit Log
          </TabsTrigger>
        </TabsList>
        <TabsContent value="reports" className="mt-4" forceMount>
          <TabErrorBoundary label="Sales Reports">
            <ReportsPage />
          </TabErrorBoundary>
        </TabsContent>
        <TabsContent value="food-cost" className="mt-4" forceMount>
          <TabErrorBoundary label="Food Cost">
            <FoodCostReports />
          </TabErrorBoundary>
        </TabsContent>
        <TabsContent value="chef-report" className="mt-4" forceMount>
          <TabErrorBoundary label="Chef Report">
            <ChefReport />
          </TabErrorBoundary>
        </TabsContent>
        <TabsContent value="bi" className="mt-4" forceMount>
          <TabErrorBoundary label="BI & Forecasting">
            <BIDashboard />
          </TabErrorBoundary>
        </TabsContent>
        <TabsContent value="shift-report" className="mt-4" forceMount>
          <TabErrorBoundary label="Shift Report">
            <ShiftReconciliation />
          </TabErrorBoundary>
        </TabsContent>
        <TabsContent value="customer-requests" className="mt-4">
          <TabErrorBoundary label="Customer Requests">
            <CustomerRequestsAnalytics />
          </TabErrorBoundary>
        </TabsContent>
        <TabsContent value="price-analysis" className="mt-4">
          <TabErrorBoundary label="Price Analysis">
            <PriceAnalysis />
          </TabErrorBoundary>
        </TabsContent>
        <TabsContent value="crockery-breakage" className="mt-4">
          <TabErrorBoundary label="Crockery Breakage">
            <CrockeryBreakageReport />
          </TabErrorBoundary>
        </TabsContent>
        <TabsContent value="cash-drawer-log" className="mt-4">
          <TabErrorBoundary label="Cash Drawer Log">
            <CashDrawerLog />
          </TabErrorBoundary>
        </TabsContent>
        <TabsContent value="audit-log" className="mt-4" forceMount>
          <TabErrorBoundary label="Audit Log">
            <AuditLogPage />
          </TabErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
