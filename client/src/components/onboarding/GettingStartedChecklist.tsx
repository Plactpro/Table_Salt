import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ArrowRight, Rocket, PartyPopper } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface ChecklistItem {
  n: number;
  label: string;
  actionLabel: string;
  actionLink: string;
  completed: boolean;
}

function useChecklistData() {
  const { tenant, user } = useAuth();

  const { data: outlets = [] } = useQuery<any[]>({
    queryKey: ["/api/outlets"],
    enabled: !!user,
  });

  const { data: menuItems } = useQuery<any>({
    queryKey: ["/api/menu-items"],
    queryFn: async () => {
      const res = await fetch("/api/menu-items?page=1&limit=1", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user,
  });

  const { data: usersData } = useQuery<any>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users?limit=2", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user,
  });

  const { data: tables = [] } = useQuery<any[]>({
    queryKey: ["/api/tables"],
    queryFn: async () => {
      const res = await fetch("/api/tables?limit=1", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const profileDone = !!(tenant?.businessType && (tenant.businessType as string) !== "other");
  const outletsDone = outlets.length > 0 && outlets.some((o: any) => o.active !== false);
  const menuDone = (menuItems?.total ?? menuItems?.count ?? (Array.isArray(menuItems) ? menuItems.length : 0)) > 0;
  const staffDone = (usersData?.total ?? usersData?.count ?? (Array.isArray(usersData) ? usersData.length : 0)) > 1;
  const paymentDone = !!(tenant?.razorpayEnabled || tenant?.stripeSubscriptionId);
  const tablesDone = (Array.isArray(tables) ? tables.length : 0) > 0;

  const items: ChecklistItem[] = [
    { n: 1, label: "Restaurant profile set up", actionLabel: "Set up", actionLink: "/onboarding", completed: profileDone },
    { n: 2, label: "First outlet configured", actionLabel: "Configure", actionLink: "/outlets", completed: outletsDone },
    { n: 3, label: "Menu items added", actionLabel: "Add items", actionLink: "/menu", completed: menuDone },
    { n: 4, label: "Staff member added", actionLabel: "Add staff", actionLink: "/staff", completed: staffDone },
    { n: 5, label: "Payment method configured", actionLabel: "Configure", actionLink: "/billing", completed: paymentDone },
    { n: 6, label: "Table or delivery zone set up", actionLabel: "Set up", actionLink: "/tables", completed: tablesDone },
  ];

  const completedCount = items.filter((i) => i.completed).length;
  const allDone = completedCount === items.length;

  return { items, completedCount, allDone };
}

export function GettingStartedChecklist() {
  const { tenant, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const dismissKey = `checklist_dismissed_${user?.tenantId}`;
  const remindKey = `checklist_remind_later_${user?.tenantId}`;

  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(dismissKey) === "true";
    } catch {
      return false;
    }
  });

  const [remindDismissed, setRemindDismissed] = useState(() => {
    try {
      const stored = localStorage.getItem(remindKey);
      if (!stored) return false;
      const expiry = parseInt(stored, 10);
      return Date.now() < expiry;
    } catch {
      return false;
    }
  });

  const [autoCompleting, setAutoCompleting] = useState(false);

  const { items, completedCount, allDone } = useChecklistData();

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/onboarding/complete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "All set!", description: "Your restaurant is ready to go live." });
      try { localStorage.setItem(dismissKey, "true"); } catch {}
      setDismissed(true);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (!user || !tenant) return null;
  if (user.role !== "owner") return null;

  if (dismissed || remindDismissed) return null;

  if (!tenant.onboardingCompleted) return null;

  if (allDone && !autoCompleting) {
    setAutoCompleting(true);
    completeMutation.mutate();
    return null;
  }

  const progress = Math.round((completedCount / items.length) * 100);

  const handleMarkComplete = () => {
    completeMutation.mutate();
  };

  const handleRemindLater = () => {
    try {
      const expiry = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem(remindKey, String(expiry));
    } catch {}
    setRemindDismissed(true);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
      >
        <Card data-testid="card-getting-started" className="border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Rocket className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-heading">Get Your Restaurant Ready</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Complete these steps to go live</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground" data-testid="text-progress">
                  {completedCount} of {items.length} done
                </span>
                <span className="text-xs font-medium text-primary">{progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden" data-testid="progress-bar-onboarding">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {items.map((item) => (
              <div
                key={item.n}
                data-testid={`item-checklist-${item.n}`}
                className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                  item.completed ? "bg-green-50 dark:bg-green-950/20" : "hover:bg-muted/50"
                }`}
              >
                <div data-testid={`icon-check-${item.n}`} className="shrink-0">
                  {item.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <span className={`flex-1 text-sm ${item.completed ? "text-muted-foreground line-through" : ""}`}>
                  {item.label}
                </span>
                {!item.completed && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-primary hover:text-primary gap-1 shrink-0"
                    onClick={() => navigate(item.actionLink)}
                    data-testid={`link-action-${item.n}`}
                  >
                    {item.actionLabel}
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1 gap-2"
                onClick={handleMarkComplete}
                disabled={completeMutation.isPending}
                data-testid="button-mark-complete"
              >
                <PartyPopper className="h-4 w-4" />
                Mark as Complete
              </Button>
              <Button
                variant="outline"
                onClick={handleRemindLater}
                data-testid="button-remind-later"
              >
                Remind me later
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
