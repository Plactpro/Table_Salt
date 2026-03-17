import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Settings, Shield } from "lucide-react";
import SettingsPage from "./settings";
import SecuritySettingsPage from "./security-settings";

export default function SettingsHub() {
  const [tab, setTab] = useState("general");

  return (
    <div className="space-y-6" data-testid="settings-hub">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="settings-tabs">
          <TabsTrigger value="general" data-testid="tab-general-settings">
            <Settings className="h-4 w-4 mr-1.5" />General
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            <Shield className="h-4 w-4 mr-1.5" />Security
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-4">
          <SettingsPage />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SecuritySettingsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
