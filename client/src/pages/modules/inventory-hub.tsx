import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Package2, BookOpen, ShoppingCart } from "lucide-react";
import { useAuth } from "@/lib/auth";
import InventoryPage from "./inventory";
import SuppliersPage from "./suppliers";
import ProcurementPage from "./procurement";

const MANAGEMENT_ROLES = ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"];

export default function InventoryHub() {
  const { user } = useAuth();
  const canManage = MANAGEMENT_ROLES.includes(user?.role || "");
  const [tab, setTab] = useState("stock");

  return (
    <div className="space-y-6" data-testid="inventory-hub">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="inventory-tabs">
          <TabsTrigger value="stock" data-testid="tab-stock">
            <Package2 className="h-4 w-4 mr-1.5" />Stock & Items
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="suppliers" data-testid="tab-suppliers">
              <BookOpen className="h-4 w-4 mr-1.5" />Suppliers
            </TabsTrigger>
          )}
          {canManage && (
            <TabsTrigger value="procurement" data-testid="tab-procurement">
              <ShoppingCart className="h-4 w-4 mr-1.5" />Procurement
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="stock" className="mt-4">
          <InventoryPage />
        </TabsContent>
        {canManage && (
          <TabsContent value="suppliers" className="mt-4">
            <SuppliersPage />
          </TabsContent>
        )}
        {canManage && (
          <TabsContent value="procurement" className="mt-4">
            <ProcurementPage />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
