import { PageTitle } from "@/lib/accessibility";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Truck, ShoppingBag } from "lucide-react";
import DeliveryPage from "./delivery";
import OrdersHub from "./orders-hub";
import { useTranslation } from "react-i18next";

export default function DeliveryHub() {
  const [tab, setTab] = useState("delivery");
  const { t } = useTranslation("modules");

  return (
    <div className="space-y-6" data-testid="delivery-hub">
      <PageTitle title={t("deliveries")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="delivery-tabs">
          <TabsTrigger value="delivery" data-testid="tab-delivery">
            <Truck className="h-4 w-4 mr-1.5" />{t("delivery")}
          </TabsTrigger>
          <TabsTrigger value="online-orders" data-testid="tab-online-orders">
            <ShoppingBag className="h-4 w-4 mr-1.5" />{t("onlineOrders")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="delivery" className="mt-4">
          <DeliveryPage />
        </TabsContent>
        <TabsContent value="online-orders" className="mt-4">
          <OrdersHub />
        </TabsContent>
      </Tabs>
    </div>
  );
}
