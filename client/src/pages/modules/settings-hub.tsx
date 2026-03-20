import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Settings, Shield, CreditCard, Clock } from "lucide-react";
import SettingsPage from "./settings";
import SecuritySettingsPage from "./security-settings";
import SubscriptionSettings from "./subscription-settings";
import ShiftsManagement from "./shifts-management";

function getInitialTab(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "subscription" || tab === "security" || tab === "general" || tab === "shifts") return tab;
  } catch {}
  return "general";
}

export default function SettingsHub() {
  const [tab, setTab] = useState(getInitialTab);
  const [, navigate] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get("tab");
    if (urlTab && urlTab !== tab) {
      if (urlTab === "subscription" || urlTab === "security" || urlTab === "general" || urlTab === "shifts") {
        setTab(urlTab);
      }
    }
  }, []);

  const handleTabChange = (value: string) => {
    setTab(value);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", value);
    navigate(`/settings?${params.toString()}`, { replace: true });
  };

  return (
    <div className="space-y-6" data-testid="settings-hub">
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
      </Tabs>
    </div>
  );
}
