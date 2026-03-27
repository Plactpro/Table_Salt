import { PageTitle } from "@/lib/accessibility";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plug, CreditCard, Truck, Receipt, BarChart3, ShoppingCart,
  MessageSquare, Mail, Wifi, WifiOff, Settings, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface Integration {
  id: string;
  name: string;
  description: string;
  category: "pos" | "delivery" | "payment" | "accounting" | "communication" | "ordering";
  icon: typeof CreditCard;
  iconColor: string;
  iconBg: string;
  connected: boolean;
  popular?: boolean;
}

const initialIntegrations: Integration[] = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Accept online payments with credit cards, Apple Pay, and Google Pay",
    category: "payment",
    icon: CreditCard,
    iconColor: "text-purple-600",
    iconBg: "bg-purple-100 dark:bg-purple-900",
    connected: true,
    popular: true,
  },
  {
    id: "square",
    name: "Square POS",
    description: "Sync orders and payments with Square point-of-sale terminals",
    category: "pos",
    icon: ShoppingCart,
    iconColor: "text-teal-600",
    iconBg: "bg-teal-100 dark:bg-teal-900",
    connected: false,
  },
  {
    id: "doordash",
    name: "DoorDash",
    description: "Receive and manage DoorDash delivery orders directly",
    category: "delivery",
    icon: Truck,
    iconColor: "text-red-600",
    iconBg: "bg-red-100 dark:bg-red-900",
    connected: false,
    popular: true,
  },
  {
    id: "ubereats",
    name: "Uber Eats",
    description: "Integrate Uber Eats orders into your kitchen workflow",
    category: "delivery",
    icon: Truck,
    iconColor: "text-green-600",
    iconBg: "bg-green-100 dark:bg-green-900",
    connected: true,
  },
  {
    id: "grubhub",
    name: "Grubhub",
    description: "Manage Grubhub orders alongside your in-house orders",
    category: "delivery",
    icon: Truck,
    iconColor: "text-orange-600",
    iconBg: "bg-orange-100 dark:bg-orange-900",
    connected: false,
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    description: "Automatically sync revenue, expenses, and tax data",
    category: "accounting",
    icon: Receipt,
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-100 dark:bg-emerald-900",
    connected: false,
    popular: true,
  },
  {
    id: "xero",
    name: "Xero",
    description: "Cloud accounting integration for financial reporting",
    category: "accounting",
    icon: BarChart3,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-100 dark:bg-blue-900",
    connected: false,
  },
  {
    id: "twilio",
    name: "Twilio SMS",
    description: "Send order confirmations and updates via SMS",
    category: "communication",
    icon: MessageSquare,
    iconColor: "text-pink-600",
    iconBg: "bg-pink-100 dark:bg-pink-900",
    connected: false,
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Email marketing campaigns and customer newsletters",
    category: "communication",
    icon: Mail,
    iconColor: "text-yellow-600",
    iconBg: "bg-yellow-100 dark:bg-yellow-900",
    connected: false,
  },
];

const categories = [
  { id: "all", label: "All" },
  { id: "payment", label: "Payment" },
  { id: "delivery", label: "Delivery" },
  { id: "pos", label: "POS" },
  { id: "accounting", label: "Accounting" },
  { id: "communication", label: "Communication" },
];

export default function IntegrationsPage() {
  const { t } = useTranslation("modules");
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [activeCategory, setActiveCategory] = useState("all");

  function toggleIntegration(id: string) {
    setIntegrations((prev) =>
      prev.map((i) => {
        if (i.id === id) {
          const newConnected = !i.connected;
          toast({
            title: newConnected ? "Connected" : "Disconnected",
            description: `${i.name} has been ${newConnected ? "connected" : "disconnected"}.`,
          });
          return { ...i, connected: newConnected };
        }
        return i;
      })
    );
  }

  const filtered = activeCategory === "all"
    ? integrations
    : integrations.filter((i) => i.category === activeCategory);

  const connectedCount = integrations.filter((i) => i.connected).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
      data-testid="page-integrations"
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <PageTitle title={t("integrations")} />
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Plug className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-integrations-title">Integrations</h1>
            <p className="text-muted-foreground">Connect third-party services to streamline operations</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3 py-1" data-testid="badge-connected-count">
            <Wifi className="h-3.5 w-3.5 mr-1.5 text-green-500" />
            {connectedCount} Connected
          </Badge>
          <Badge variant="outline" className="px-3 py-1" data-testid="badge-available-count">
            {integrations.length} Available
          </Badge>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <Button
            key={cat.id}
            variant={activeCategory === cat.id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveCategory(cat.id)}
            className={activeCategory === cat.id ? "bg-teal-600 hover:bg-teal-700" : ""}
            data-testid={`button-filter-${cat.id}`}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((integration, index) => {
          const IntIcon = integration.icon;
          return (
            <motion.div
              key={integration.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card
                className={`relative hover-lift transition-shadow-smooth ${
                  integration.connected ? "border-teal-200 dark:border-teal-800" : ""
                }`}
                data-testid={`card-integration-${integration.id}`}
              >
                {integration.popular && (
                  <div className="absolute top-3 right-3">
                    <Badge variant="secondary" className="text-xs" data-testid={`badge-popular-${integration.id}`}>
                      Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${integration.iconBg}`}>
                      <IntIcon className={`h-5 w-5 ${integration.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        {integration.name}
                        {integration.connected && (
                          <Wifi className="h-3.5 w-3.5 text-green-500" />
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">{integration.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={integration.connected}
                        onCheckedChange={() => toggleIntegration(integration.id)}
                        data-testid={`switch-integration-${integration.id}`}
                      />
                      <span className={`text-sm ${integration.connected ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                        {integration.connected ? "Connected" : "Disconnected"}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {integration.connected && (
                        <Button variant="ghost" size="sm" data-testid={`button-settings-${integration.id}`}>
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" data-testid={`button-details-${integration.id}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <WifiOff className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground" data-testid="text-no-integrations">No integrations in this category</p>
          </CardContent>
        </Card>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 border-teal-200 dark:border-teal-800">
          <CardContent className="p-6 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-semibold font-heading text-lg" data-testid="text-custom-integration-cta">Need a custom integration?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Our Enterprise plan includes custom API integrations tailored to your needs.
              </p>
            </div>
            <Button variant="outline" className="border-teal-300 dark:border-teal-700" data-testid="button-request-integration">
              Request Integration <ExternalLink className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}