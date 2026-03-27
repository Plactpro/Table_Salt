import { useState, Component } from "react";
import { PageTitle } from "@/lib/accessibility";
import type { ErrorInfo, ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, HardHat, TrendingUp, AlertCircle } from "lucide-react";
import StaffPage from "./staff";
import WorkforcePage from "./workforce";
import PerformancePage from "./performance";
import { useTranslation } from "react-i18next";

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

export default function StaffHub() {
  const [tab, setTab] = useState("schedule");
  const { t } = useTranslation("modules");

  return (
    <div className="space-y-6" data-testid="staff-hub">
      <PageTitle title={t("staff")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="staff-tabs">
          <TabsTrigger value="schedule" data-testid="tab-schedule">
            <Users className="h-4 w-4 mr-1.5" />{t("scheduleAndStaff")}
          </TabsTrigger>
          <TabsTrigger value="workforce" data-testid="tab-workforce">
            <HardHat className="h-4 w-4 mr-1.5" />{t("workforce")}
          </TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-performance">
            <TrendingUp className="h-4 w-4 mr-1.5" />{t("performance")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="schedule" className="mt-4">
          <TabErrorBoundary label={t("scheduleAndStaff")}>
            <StaffPage />
          </TabErrorBoundary>
        </TabsContent>
        <TabsContent value="workforce" className="mt-4">
          <TabErrorBoundary label={t("workforce")}>
            <WorkforcePage />
          </TabErrorBoundary>
        </TabsContent>
        <TabsContent value="performance" className="mt-4">
          <TabErrorBoundary label={t("performance")}>
            <PerformancePage />
          </TabErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
