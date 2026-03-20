import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, Activity, ScrollText, ChefHat, Clock } from "lucide-react";
import ReportsPage from "./reports";
import BIDashboard from "./bi-dashboard";
import AuditLogPage from "./audit-log";
import FoodCostReports from "./food-cost-reports";
import ChefReport from "./chef-report";
import ShiftReconciliation from "./shift-reconciliation";

export default function ReportsHub() {
  const [tab, setTab] = useState("reports");

  return (
    <div className="space-y-6" data-testid="reports-hub">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="reports-tabs">
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
          <TabsTrigger value="audit-log" data-testid="tab-audit-log">
            <ScrollText className="h-4 w-4 mr-1.5" />Audit Log
          </TabsTrigger>
        </TabsList>
        <TabsContent value="reports" className="mt-4">
          <ReportsPage />
        </TabsContent>
        <TabsContent value="food-cost" className="mt-4">
          <FoodCostReports />
        </TabsContent>
        <TabsContent value="chef-report" className="mt-4">
          <ChefReport />
        </TabsContent>
        <TabsContent value="bi" className="mt-4">
          <BIDashboard />
        </TabsContent>
        <TabsContent value="shift-report" className="mt-4">
          <ShiftReconciliation />
        </TabsContent>
        <TabsContent value="audit-log" className="mt-4">
          <AuditLogPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
