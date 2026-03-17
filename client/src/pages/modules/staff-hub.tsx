import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, HardHat, TrendingUp } from "lucide-react";
import StaffPage from "./staff";
import WorkforcePage from "./workforce";
import PerformancePage from "./performance";

export default function StaffHub() {
  const [tab, setTab] = useState("schedule");

  return (
    <div className="space-y-6" data-testid="staff-hub">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="staff-tabs">
          <TabsTrigger value="schedule" data-testid="tab-schedule">
            <Users className="h-4 w-4 mr-1.5" />Schedule & Staff
          </TabsTrigger>
          <TabsTrigger value="workforce" data-testid="tab-workforce">
            <HardHat className="h-4 w-4 mr-1.5" />Workforce
          </TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-performance">
            <TrendingUp className="h-4 w-4 mr-1.5" />Performance
          </TabsTrigger>
        </TabsList>
        <TabsContent value="schedule" className="mt-4">
          <StaffPage />
        </TabsContent>
        <TabsContent value="workforce" className="mt-4">
          <WorkforcePage />
        </TabsContent>
        <TabsContent value="performance" className="mt-4">
          <PerformancePage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
