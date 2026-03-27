import { useState } from "react";
import { PageTitle } from "@/lib/accessibility";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tag, Zap } from "lucide-react";
import OffersPage from "./offers";
import PromotionsPage from "./promotions";
import { useTranslation } from "react-i18next";

export default function PromotionsHub() {
  const [tab, setTab] = useState("offers");
  const { t } = useTranslation("modules");

  return (
    <div className="space-y-6" data-testid="promotions-hub">
      <PageTitle title={t("promotions")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="promotions-tabs">
          <TabsTrigger value="offers" data-testid="tab-offers">
            <Tag className="h-4 w-4 mr-1.5" />{t("offersAndDeals")}
          </TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-promotion-rules">
            <Zap className="h-4 w-4 mr-1.5" />{t("promotionRules")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="offers" className="mt-4">
          <OffersPage />
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <PromotionsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
