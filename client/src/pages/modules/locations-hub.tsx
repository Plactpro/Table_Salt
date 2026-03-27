import { PageTitle } from "@/lib/accessibility";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Store, Building2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import OutletsPage from "./outlets";
import HQConsolePage from "./hq-console";
import { useTranslation } from "react-i18next";

export default function LocationsHub() {
  const { user } = useAuth();
  const canAccessHQ = ["owner", "franchise_owner", "hq_admin"].includes(user?.role || "");
  const [tab, setTab] = useState("outlets");
  const { t } = useTranslation("modules");

  return (
    <div className="space-y-6" data-testid="locations-hub">
      <PageTitle title={t("locations")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="locations-tabs">
          <TabsTrigger value="outlets" data-testid="tab-outlets">
            <Store className="h-4 w-4 mr-1.5" />{t("outlets")}
          </TabsTrigger>
          {canAccessHQ && (
            <TabsTrigger value="hq" data-testid="tab-hq-console">
              <Building2 className="h-4 w-4 mr-1.5" />{t("hqConsole")}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="outlets" className="mt-4">
          <OutletsPage />
        </TabsContent>
        {canAccessHQ && (
          <TabsContent value="hq" className="mt-4">
            <HQConsolePage />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
