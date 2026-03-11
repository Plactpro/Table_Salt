import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Save, Building2, Receipt, Settings, CheckCircle2 } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [savedSection, setSavedSection] = useState<string | null>(null);

  const { data: tenant, isLoading } = useQuery<any>({
    queryKey: ["/api/tenant"],
  });

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [timezone, setTimezone] = useState("UTC");
  const [taxRate, setTaxRate] = useState("0");
  const [serviceCharge, setServiceCharge] = useState("0");

  useEffect(() => {
    if (tenant) {
      setName(tenant.name || "");
      setAddress(tenant.address || "");
      setCurrency(tenant.currency || "USD");
      setTimezone(tenant.timezone || "UTC");
      setTaxRate(tenant.taxRate || "0");
      setServiceCharge(tenant.serviceCharge || "0");
    }
  }, [tenant]);

  const showSaveAnimation = (section: string) => {
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2000);
  };

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", "/api/tenant", data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
      toast({ title: "Settings saved successfully" });
      if (variables.name !== undefined) showSaveAnimation("profile");
      else showSaveAnimation("tax");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ name, address, currency, timezone });
  };

  const handleTaxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ taxRate, serviceCharge });
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6 max-w-2xl"
    >
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-heading" data-testid="text-settings-title">Settings</h1>
          <p className="text-muted-foreground">Manage your restaurant configuration</p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="relative overflow-hidden">
          <AnimatePresence>
            {savedSection === "profile" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  className="flex flex-col items-center gap-2"
                >
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <span className="text-sm font-medium text-green-600">Saved!</span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-900">
                <Building2 className="h-5 w-5 text-rose-700 dark:text-rose-300" />
              </div>
              <CardTitle>Restaurant Profile</CardTitle>
            </div>
            <CardDescription>Update your restaurant's basic information</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Restaurant Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  data-testid="input-settings-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  data-testid="input-settings-address"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Input
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    data-testid="input-settings-currency"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    data-testid="input-settings-timezone"
                  />
                </div>
              </div>
              <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-profile" className="transition-all duration-200 hover:scale-[1.02]">
                <Save className="h-4 w-4 mr-2" /> Save Profile
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="relative overflow-hidden">
          <AnimatePresence>
            {savedSection === "tax" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  className="flex flex-col items-center gap-2"
                >
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <span className="text-sm font-medium text-green-600">Saved!</span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-900">
                <Receipt className="h-5 w-5 text-orange-600 dark:text-orange-300" />
              </div>
              <CardTitle>Tax Configuration</CardTitle>
            </div>
            <CardDescription>Set tax rate and service charge percentages</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTaxSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tax Rate (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    data-testid="input-settings-tax-rate"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Service Charge (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={serviceCharge}
                    onChange={(e) => setServiceCharge(e.target.value)}
                    data-testid="input-settings-service-charge"
                  />
                </div>
              </div>
              <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-tax" className="transition-all duration-200 hover:scale-[1.02]">
                <Save className="h-4 w-4 mr-2" /> Save Tax Settings
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
