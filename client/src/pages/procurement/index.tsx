import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, FileText, ShoppingCart, RotateCcw, ArrowLeftRight, ClipboardList } from "lucide-react";
import SuppliersTab from "./suppliers";
import QuotationsTab from "./quotations";
import PurchaseOrdersTab from "./purchase-orders";
import ReturnsTab from "./returns";
import StockTransfersTab from "./stock-transfers";
import StockCountTab from "./stock-count";

export default function ProcurementPage() {
  const [tab, setTab] = useState("suppliers");

  return (
    <div className="p-6 space-y-6" data-testid="procurement-page">
      <div className="flex items-center gap-3">
        <Truck className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-procurement-title">Procurement</h1>
          <p className="text-sm text-muted-foreground">Manage suppliers, orders, transfers, and inventory verification</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1" data-testid="procurement-tabs">
          <TabsTrigger value="suppliers" className="flex items-center gap-1.5" data-testid="tab-suppliers">
            <Truck className="h-4 w-4" />Suppliers
          </TabsTrigger>
          <TabsTrigger value="quotations" className="flex items-center gap-1.5" data-testid="tab-quotations">
            <FileText className="h-4 w-4" />Quotations
          </TabsTrigger>
          <TabsTrigger value="purchase-orders" className="flex items-center gap-1.5" data-testid="tab-purchase-orders" data-tab-trigger="purchase-orders">
            <ShoppingCart className="h-4 w-4" />Purchase Orders
          </TabsTrigger>
          <TabsTrigger value="returns" className="flex items-center gap-1.5" data-testid="tab-returns">
            <RotateCcw className="h-4 w-4" />Returns
          </TabsTrigger>
          <TabsTrigger value="stock-transfers" className="flex items-center gap-1.5" data-testid="tab-stock-transfers">
            <ArrowLeftRight className="h-4 w-4" />Stock Transfers
          </TabsTrigger>
          <TabsTrigger value="stock-count" className="flex items-center gap-1.5" data-testid="tab-stock-count">
            <ClipboardList className="h-4 w-4" />Stock Count
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="mt-4">
          <SuppliersTab />
        </TabsContent>
        <TabsContent value="quotations" className="mt-4">
          <QuotationsTab />
        </TabsContent>
        <TabsContent value="purchase-orders" className="mt-4">
          <PurchaseOrdersTab />
        </TabsContent>
        <TabsContent value="returns" className="mt-4">
          <ReturnsTab />
        </TabsContent>
        <TabsContent value="stock-transfers" className="mt-4">
          <StockTransfersTab />
        </TabsContent>
        <TabsContent value="stock-count" className="mt-4">
          <StockCountTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
