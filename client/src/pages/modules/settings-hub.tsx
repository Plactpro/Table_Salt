import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Settings, Shield, CreditCard, Clock, QrCode, FileCheck, Lock, ShieldCheck } from "lucide-react";
import SettingsPage from "./settings";
import SecuritySettingsPage from "./security-settings";
import SubscriptionSettings from "./subscription-settings";
import ShiftsManagement from "./shifts-management";
import QrRequestSettings from "./qr-request-settings";
import AccessLogPage from "./access-log";
import ComplianceReport from "./compliance-report";
import PciCompliancePage from "./pci-compliance";
import GdprRightsPage from "./gdpr-rights";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { PageTitle } from "@/lib/accessibility";

const BASE_TABS = ["general", "shifts", "security", "subscription", "qr-settings"] as const;
type BaseTab = typeof BASE_TABS[number];
type ValidTab = BaseTab | "access-log" | "compliance" | "pci-dss" | "privacy";

function getInitialTab(): ValidTab {
  try {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as ValidTab | null;
    const allValid: string[] = [...BASE_TABS, "access-log", "compliance", "pci-dss", "privacy"];
    if (tab && allValid.includes(tab)) return tab;
  } catch {}
  return "general";
}

export default function SettingsHub() {
  const [tab, setTab] = useState<ValidTab>(getInitialTab);
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data: prefs } = useQuery<{ showAccessLog: boolean }>({
    queryKey: ["/api/tenant/access-preferences"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/tenant/access-preferences");
      return r.json();
    },
    staleTime: 30000,
  });

  const showAccessLog = prefs?.showAccessLog !== false;
  const showCompliance = !!(user && ["owner", "hq_admin", "franchise_owner"].includes(user.role));
  const showPciDss = !!(user && ["owner", "hq_admin"].includes(user.role));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get("tab") as ValidTab | null;
    const allTabs: string[] = [
      ...BASE_TABS,
      ...(showAccessLog ? ["access-log"] : []),
      ...(showCompliance ? ["compliance"] : []),
      ...(showPciDss ? ["pci-dss"] : []),
      "privacy",
    ];
    if (urlTab && allTabs.includes(urlTab) && urlTab !== tab) {
      setTab(urlTab);
    }
  }, [showAccessLog, showCompliance, showPciDss]);

  const handleTabChange = (value: string) => {
    setTab(value as ValidTab);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", value);
    navigate(`/settings?${params.toString()}`, { replace: true });
  };

  return (
    <div className="space-y-6" data-testid="settings-hub">
      <PageTitle title="Settings" />
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList data-testid="settings-tabs">
          <TabsTrigger value="general" data-testid="tab-general-settings">
            <Settings className="h-4 w-4 mr-1.5" />General
          </TabsTrigger>
          <TabsTrigger value="shifts" data-testid="tab-shifts">
            <Clock className="h-4 w-4 mr-1.5" />Shifts
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            <Shield className="h-4 w-4 mr-1.5" />Security
          </TabsTrigger>
          <TabsTrigger value="subscription" data-testid="tab-subscription">
            <CreditCard className="h-4 w-4 mr-1.5" />Subscription
          </TabsTrigger>
          <TabsTrigger value="qr-settings" data-testid="tab-qr-settings">
            <QrCode className="h-4 w-4 mr-1.5" />QR Requests
          </TabsTrigger>
          {showAccessLog && (
            <TabsTrigger value="access-log" data-testid="tab-access-log">
              <Shield className="h-4 w-4 mr-1.5" />Account Access
            </TabsTrigger>
          )}
          {showCompliance && (
            <TabsTrigger value="compliance" data-testid="tab-compliance">
              <FileCheck className="h-4 w-4 mr-1.5" />Compliance
            </TabsTrigger>
          )}
          {showPciDss && (
            <TabsTrigger value="pci-dss" data-testid="tab-pci-dss">
              <Lock className="h-4 w-4 mr-1.5" />PCI DSS
            </TabsTrigger>
          )}
          <TabsTrigger value="privacy" data-testid="tab-privacy">
            <ShieldCheck className="h-4 w-4 mr-1.5" />Privacy & Data
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-4">
          <SettingsPage />
        </TabsContent>
        <TabsContent value="shifts" className="mt-4">
          <ShiftsManagement />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SecuritySettingsPage />
        </TabsContent>
        <TabsContent value="subscription" className="mt-4">
          <SubscriptionSettings />
        </TabsContent>
        <TabsContent value="qr-settings" className="mt-4">
          <QrRequestSettings />
        </TabsContent>
        {showAccessLog && (
          <TabsContent value="access-log" className="mt-4">
            <AccessLogPage />
          </TabsContent>
        )}
        {showCompliance && (
          <TabsContent value="compliance" className="mt-4">
            <ComplianceReport />
          </TabsContent>
        )}
        {showPciDss && (
          <TabsContent value="pci-dss" className="mt-4">
            <PciCompliancePage />
          </TabsContent>
        )}
        <TabsContent value="privacy" className="mt-4">
          <GdprRightsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
